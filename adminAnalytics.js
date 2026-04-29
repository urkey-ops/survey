// FILE: adminAnalytics.js
// VERSION: 2.1.0
// PURPOSE: Live offline-first queue chart + server funnel heat map.
//          Inserted directly after #adminControls inside <header> —
//          same position as v1.0.0. Visible only when .admin-active on body.
//
// CHANGES FROM 2.0.1:
//   - FIX CRITICAL: Panel now inserted after #adminControls inside <header>
//     (identical to v1.0.0 mount logic). v2.0.x used document.body.appendChild
//     + position:fixed which made it a separate floating box.
//   - FIX CRITICAL: Tab data keys separated from UI tab names.
//     activeUITab  = 'live' | 'server'  (which panel is showing)
//     activeDataTab = 'type1' | 'type2' | 'type3'  (which API key to render)
//     v2.0.x used activeTab='server' as data key → data['server'] → always undefined.
//   - FIX: Server funnel tab pills now use data-type (type1/type2/type3) matching
//     the API response shape from analytics-summary.js v1.2.0.
//   - FIX: renderServerData() uses activeDataTab not activeUITab.
//   - RESTORED: All v1.0.0 CSS (margin-top, rgba background, border, fits inside
//     header). Position:fixed and dark #0f172a background removed.
//   - RESTORED: v1.0.0 renderData() structure (summary stats + funnel rows with
//     aap-row grid, aap-bar-track, drop-off col) — full fidelity.
//   - KEPT: Live queue canvas chart (Phase 3), 10s interval, hide-when-empty
//     (Phase 5), countUnsyncedRecords() call (fix from v2.0.1).
//   - KEPT: MutationObserver fetch-on-admin-open pattern from v1.0.0.
//   - KEPT: window.updateLiveCharts exposure.
// DEPENDENCIES: window.dataHandlers (dataSync.js), window.CONSTANTS (config.js)

(function () {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────────────
  const API_URL         = '/api/analytics-summary';
  const CACHE_TTL_MS    = 5 * 60 * 1000;
  const LIVE_REFRESH_MS = 10000;

  // ─── Color helpers (identical to v1.0.0) ─────────────────────────────────────
  function dropOffColor(pct) {
    if (pct <= 10) return '#22c55e';
    if (pct <= 25) return '#84cc16';
    if (pct <= 40) return '#eab308';
    if (pct <= 55) return '#f97316';
    return '#ef4444';
  }

  function barColor(reachPct) {
    if (reachPct >= 80) return '#0d9488';
    if (reachPct >= 60) return '#0891b2';
    if (reachPct >= 40) return '#7c3aed';
    if (reachPct >= 20) return '#ea580c';
    return '#dc2626';
  }

  // ─── State ───────────────────────────────────────────────────────────────────
  let cache         = null;     // { data, fetchedAt }
  let liveData      = null;     // { pending, synced, mode }
  let activeUITab   = 'live';   // 'live' | 'server'
  let activeDataTab = 'type1';  // 'type1' | 'type2' | 'type3' — API response key
  let panel         = null;
  let liveInterval  = null;

  // ─── Mode helpers ─────────────────────────────────────────────────────────────
  function getCurrentKioskMode() {
    return window.getCurrentKioskMode?.() ||
           window.DEVICECONFIG?.kioskMode ||
           'all';
  }

  function defaultDataTab() {
    return getCurrentKioskMode() === 'shayona' ? 'type3' : 'type1';
  }

  // ─── Live queue canvas chart ──────────────────────────────────────────────────
  function createLiveQueueChart(pending, synced, mode) {
    if (!panel) return;
    const canvas = panel.querySelector('#liveQueueCanvas');
    if (!canvas) return;

    // Phase 5: hide when both zero
    if (pending === 0 && synced === 0) {
      canvas.style.display = 'none';
      return;
    }

    canvas.style.display = 'block';
    const ctx    = canvas.getContext('2d');
    const width  = canvas.width  = canvas.offsetWidth || 280;
    const height = canvas.height = 100;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#94a3b8';
    ctx.font      = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${(mode || 'ALL').toUpperCase()} QUEUES`, width / 2, 13);

    const barH   = 36;
    const barTop = 22;
    const half   = (width - 20) / 2;

    // Pending bar (left)
    const pendingRatio = Math.min(pending / Math.max(pending, 50, 1), 1);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(10, barTop, half - 5, barH);
    ctx.fillStyle = pending > 0 ? '#ef4444' : '#334155';
    ctx.fillRect(10, barTop, (half - 5) * pendingRatio, barH);

    // Synced bar (right)
    const syncedRatio = Math.min(synced / Math.max(synced, 100, 1), 1);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(half + 15, barTop, half - 5, barH);
    ctx.fillStyle = synced > 0 ? '#10b981' : '#334155';
    ctx.fillRect(half + 15, barTop, (half - 5) * syncedRatio, barH);

    ctx.fillStyle = '#f1f5f9';
    ctx.font      = 'bold 13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(pending), 10 + (half - 5) / 2,      barTop + barH + 14);
    ctx.fillText(String(synced),  half + 15 + (half - 5) / 2, barTop + barH + 14);

    ctx.fillStyle = '#64748b';
    ctx.font      = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('⏳ PENDING', 10, height - 1);
    ctx.textAlign = 'right';
    ctx.fillText('✅ SYNCED', width - 10, height - 1);
  }

  // ─── Live queue refresh (offline-first) ──────────────────────────────────────
  async function updateLiveData() {
    if (!panel || activeUITab !== 'live') return;
    if (!window.dataHandlers?.countUnsyncedRecords) return;

    const mode = getCurrentKioskMode();

    try {
      const pending = window.dataHandlers.countUnsyncedRecords(null, mode);

      const analyticsKey = mode === 'shayona'
        ? (window.CONSTANTS?.STORAGE_KEY_ANALYTICS_V3 || 'shayonaAnalytics')
        : (window.CONSTANTS?.STORAGE_KEY_ANALYTICS    || 'surveyAnalytics');

      let analytics = [];
      try { analytics = JSON.parse(localStorage.getItem(analyticsKey) || '[]'); }
      catch (_) { analytics = []; }

      const synced = analytics.filter(a => a.event === 'sync_completed').length;

      liveData = { pending, synced, mode, timestamp: Date.now() };
      createLiveQueueChart(pending, synced, mode);

      const summary = panel.querySelector('#aap-live-summary');
      if (summary) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        summary.innerHTML = `
          <div class="aap-stat">
            <span class="aap-stat-val" style="color:${pending > 0 ? '#f87171' : '#4ade80'}">${pending}</span>
            <span class="aap-stat-lbl">Pending</span>
          </div>
          <div class="aap-stat">
            <span class="aap-stat-val" style="color:#4ade80">${synced}</span>
            <span class="aap-stat-lbl">Synced</span>
          </div>
          <div class="aap-stat">
            <span class="aap-stat-val" style="font-size:9px;color:#64748b">${(mode || 'ALL').toUpperCase()}</span>
            <span class="aap-stat-lbl">updated ${time}</span>
          </div>
        `;
      }

      console.log(`[ANALYTICS] Live: ${pending}p / ${synced}s (${mode})`);
    } catch (e) {
      console.warn('[ANALYTICS] Live update failed:', e);
    }
  }

  // ─── Server funnel render (restored from v1.0.0) ─────────────────────────────
  function renderLoading() {
    if (!panel) return;
    panel.querySelector('#aap-summary').innerHTML = '';
    panel.querySelector('#aap-funnel').innerHTML  = '<div class="aap-loading">Loading…</div>';
    panel.querySelector('#aap-footer').textContent = '';
  }

  function renderError(msg) {
    if (!panel) return;
    panel.querySelector('#aap-summary').innerHTML = '';
    panel.querySelector('#aap-funnel').innerHTML  = `<div class="aap-error">⚠ ${msg}</div>`;
    panel.querySelector('#aap-footer').textContent = '';
  }

  function renderServerData(data) {
    if (!data) { renderError('No data available'); return; }

    // FIX: activeDataTab is 'type1'|'type2'|'type3' — matches API response keys
    const d = data[activeDataTab];
    if (!d) { renderError(`No data for ${activeDataTab}`); return; }

    panel.querySelector('#aap-summary').innerHTML = `
      <div class="aap-stat">
        <span class="aap-stat-val">${d.totalStarted}</span>
        <span class="aap-stat-lbl">Started</span>
      </div>
      <div class="aap-stat">
        <span class="aap-stat-val">${d.totalCompleted}</span>
        <span class="aap-stat-lbl">Completed</span>
      </div>
      <div class="aap-stat">
        <span class="aap-stat-val" style="color:${d.completionRate >= 60 ? '#4ade80' : d.completionRate >= 35 ? '#facc15' : '#f87171'}">
          ${d.completionRate}%
        </span>
        <span class="aap-stat-lbl">Rate</span>
      </div>
    `;

    if (!d.questions || d.questions.length === 0) {
      panel.querySelector('#aap-funnel').innerHTML = '<div class="aap-empty">No question data yet.</div>';
      return;
    }

    const rows = d.questions.map(q => {
      const reachPct   = q.reachPct   ?? 0;
      const dropPct    = q.dropOffPct ?? 0;
      const fill       = barColor(reachPct);
      const dropColor  = dropOffColor(dropPct);
      const timeLabel  = q.avgTimeSeconds != null ? `${q.avgTimeSeconds}s` : '—';
      const labelClass = q.optional ? 'aap-label optional' : 'aap-label';
      const pctInside  = reachPct >= 25;

      return `
        <div class="aap-row" title="Avg time: ${timeLabel} | Drop-off: ${dropPct}%">
          <span class="${labelClass}">${q.label}${q.optional ? ' ✦' : ''}</span>
          <div class="aap-bar-track">
            <div class="aap-bar-fill" style="width:${reachPct}%;background:${fill};">
              ${pctInside ? `<span class="aap-bar-pct">${reachPct}%</span>` : ''}
            </div>
            ${!pctInside ? `<span class="aap-bar-pct-outside">${reachPct}%</span>` : ''}
          </div>
          <span class="aap-drop" style="color:${dropColor}">
            ${dropPct > 0 ? '-' + dropPct + '%' : '✓'}
          </span>
        </div>
      `;
    }).join('');

    panel.querySelector('#aap-funnel').innerHTML = rows;

    const fetchedAt = cache?.fetchedAt
      ? new Date(cache.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '—';
    panel.querySelector('#aap-footer').textContent =
      `✦ optional  |  drop col = abandon %  |  updated ${fetchedAt}`;
  }

  // ─── Server fetch ─────────────────────────────────────────────────────────────
  async function fetchServerData(force = false) {
    if (!navigator.onLine) { renderError('Offline — server data unavailable'); return; }

    if (!force && cache && (Date.now() - cache.fetchedAt < CACHE_TTL_MS)) {
      renderServerData(cache.data);
      return;
    }

    const refreshBtn = panel?.querySelector('#aap-refresh');
    if (refreshBtn) refreshBtn.classList.add('spinning');
    renderLoading();

    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cache = { data, fetchedAt: Date.now() };
      renderServerData(data);
    } catch (err) {
      console.error('[adminAnalytics] Fetch error:', err);
      renderError('Could not load data');
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
  }

  // ─── Panel DOM ────────────────────────────────────────────────────────────────
  function createPanel() {
    const el = document.createElement('div');
    el.id = 'adminAnalyticsPanel';

    activeDataTab = defaultDataTab();

    const typeTabs = [
      { key: 'type1', label: 'Type 1'  },
      { key: 'type2', label: 'Type 2'  },
      { key: 'type3', label: 'Shayona' },
    ].map(t =>
      `<button class="aap-tab ${t.key === activeDataTab ? 'aap-tab-active' : ''}" data-type="${t.key}">${t.label}</button>`
    ).join('');

    el.innerHTML = `
      <div id="aap-header">
        <span id="aap-title">📊 Analytics</span>
        <div id="aap-ui-tabs">
          <button class="aap-ui-tab aap-ui-tab-active" data-ui="live">Live</button>
          <button class="aap-ui-tab" data-ui="server">Funnel</button>
        </div>
        <button id="aap-refresh" title="Refresh">↺</button>
      </div>

      <div id="aap-live-panel">
        <div id="aap-live-summary" style="display:flex;gap:6px;margin-bottom:8px;"></div>
        <canvas id="liveQueueCanvas" style="display:none;width:100%;height:100px;border-radius:4px;"></canvas>
      </div>

      <div id="aap-server-panel" style="display:none;">
        <div id="aap-type-tabs" style="display:flex;gap:4px;margin-bottom:8px;">${typeTabs}</div>
        <div id="aap-summary"></div>
        <div id="aap-funnel"></div>
        <div id="aap-footer"></div>
      </div>
    `;

    // UI tab switching (Live ↔ Funnel)
    el.querySelectorAll('.aap-ui-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeUITab = btn.dataset.ui;
        el.querySelectorAll('.aap-ui-tab').forEach(b => b.classList.remove('aap-ui-tab-active'));
        btn.classList.add('aap-ui-tab-active');

        const livePanel   = el.querySelector('#aap-live-panel');
        const serverPanel = el.querySelector('#aap-server-panel');

        if (activeUITab === 'live') {
          livePanel.style.display   = 'block';
          serverPanel.style.display = 'none';
          updateLiveData();
        } else {
          livePanel.style.display   = 'none';
          serverPanel.style.display = 'block';
          if (cache) renderServerData(cache.data);
          else fetchServerData();
        }
      });
    });

    // Data type tab switching (type1/type2/type3)
    el.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeDataTab = btn.dataset.type;
        el.querySelectorAll('[data-type]').forEach(b => b.classList.remove('aap-tab-active'));
        btn.classList.add('aap-tab-active');
        if (cache) renderServerData(cache.data);
        else fetchServerData();
      });
    });

    el.querySelector('#aap-refresh').addEventListener('click', () => {
      if (activeUITab === 'live') updateLiveData();
      else fetchServerData(true);
    });

    return el;
  }

  // ─── Styles (v1.0.0 restored + live tab additions) ───────────────────────────
  function injectStyles() {
    if (document.getElementById('aap-styles')) return;
    const style = document.createElement('style');
    style.id = 'aap-styles';
    style.textContent = `
      #adminAnalyticsPanel {
        display: none;
        margin-top: 12px;
        background: rgba(0,0,0,0.18);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 10px;
        padding: 10px 12px 8px;
        font-family: ui-monospace, 'SF Mono', monospace;
        font-size: 11px;
        color: #e2e8f0;
        width: 100%;
        box-sizing: border-box;
      }
      .admin-active #adminAnalyticsPanel { display: block; }

      #aap-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
        gap: 6px;
      }
      #aap-title {
        font-size: 11px;
        font-weight: 700;
        color: #94a3b8;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        flex-shrink: 0;
      }

      #aap-ui-tabs { display: flex; gap: 4px; flex: 1; justify-content: center; }
      .aap-ui-tab {
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 5px;
        color: #94a3b8;
        font-size: 10px;
        font-family: inherit;
        padding: 2px 8px;
        cursor: pointer;
        transition: all 0.15s ease;
        font-weight: 500;
      }
      .aap-ui-tab-active {
        background: rgba(13,148,136,0.35) !important;
        border-color: #0d9488 !important;
        color: #5eead4 !important;
      }

      .aap-tab {
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 5px;
        color: #94a3b8;
        font-size: 10px;
        font-family: inherit;
        padding: 2px 7px;
        cursor: pointer;
        transition: all 0.15s ease;
        font-weight: 500;
      }
      .aap-tab-active {
        background: rgba(13,148,136,0.35) !important;
        border-color: #0d9488 !important;
        color: #5eead4 !important;
      }

      #aap-refresh {
        background: none;
        border: none;
        color: #64748b;
        font-size: 14px;
        cursor: pointer;
        padding: 0 2px;
        line-height: 1;
        transition: color 0.15s;
        flex-shrink: 0;
      }
      #aap-refresh:hover { color: #94a3b8; }
      #aap-refresh.spinning { animation: aap-spin 0.8s linear infinite; }
      @keyframes aap-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      #aap-summary, #aap-live-summary { display: flex; gap: 6px; margin-bottom: 10px; }
      .aap-stat {
        flex: 1;
        background: rgba(255,255,255,0.06);
        border-radius: 6px;
        padding: 5px 6px;
        text-align: center;
      }
      .aap-stat-val { font-size: 15px; font-weight: 700; color: #f1f5f9; line-height: 1.1; display: block; }
      .aap-stat-lbl { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-top: 1px; }

      #aap-funnel { display: flex; flex-direction: column; gap: 5px; }
      .aap-row { display: grid; grid-template-columns: 90px 1fr 32px; align-items: center; gap: 6px; }
      .aap-label { font-size: 10px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
      .aap-label.optional { color: #64748b; font-style: italic; }

      .aap-bar-track { height: 16px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; position: relative; }
      .aap-bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s cubic-bezier(0.4,0,0.2,1); position: relative; display: flex; align-items: center; justify-content: flex-end; min-width: 2px; }
      .aap-bar-pct { font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.9); padding-right: 4px; white-space: nowrap; }
      .aap-bar-pct-outside { font-size: 9px; font-weight: 600; color: #475569; padding-left: 3px; white-space: nowrap; position: absolute; left: 100%; }
      .aap-drop { font-size: 9px; font-weight: 700; text-align: center; white-space: nowrap; }

      #aap-footer { margin-top: 8px; font-size: 9px; color: #334155; text-align: right; }
      .aap-empty   { text-align: center; color: #475569; font-size: 10px; padding: 12px 0; }
      .aap-error   { text-align: center; color: #ef4444; font-size: 10px; padding: 8px 0; }
      .aap-loading { text-align: center; color: #475569; font-size: 10px; padding: 12px 0; letter-spacing: 0.05em; }
    `;
    document.head.appendChild(style);
  }

  // ─── Mount (position identical to v1.0.0) ────────────────────────────────────
function mount() {
    // ── FIX: prevent double-mount when script is loaded twice ──
    if (document.getElementById('adminAnalyticsPanel')) {
      console.log('[ANALYTICS] Panel already mounted — skipping duplicate');
      return;
    }

    injectStyles();
    panel = createPanel();

    // FIX: Insert right after #adminControls — same as v1.0.0
    const adminControls = document.getElementById('adminControls');
    if (adminControls) {
      adminControls.parentNode.insertBefore(panel, adminControls.nextSibling);
    } else {
      const header = document.querySelector('header');
      if (header) header.appendChild(panel);
      else document.body.appendChild(panel);
    }

    // 10s live refresh — localStorage only, no network
    liveInterval = setInterval(() => {
      if (document.body.classList.contains('admin-active') && activeUITab === 'live') {
        updateLiveData();
      }
    }, LIVE_REFRESH_MS);

    // Fetch/refresh on admin panel open (MutationObserver — identical to v1.0.0)
    let hasFetchedThisSession = false;
    const observer = new MutationObserver(() => {
      const isAdmin = document.body.classList.contains('admin-active');
      if (isAdmin) {
        updateLiveData();
        if (!hasFetchedThisSession) {
          hasFetchedThisSession = true;
          if (activeUITab === 'server') fetchServerData();
        }
      } else {
        hasFetchedThisSession = false;
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Re-fetch server data on reconnect
    window.addEventListener('online', () => {
      if (document.body.classList.contains('admin-active') && activeUITab === 'server') {
        fetchServerData(true);
      }
    });

    console.log('[ANALYTICS] ✅ Admin analytics panel mounted (v2.1.0)');
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.updateLiveCharts = updateLiveData;

})();
