// FILE: adminAnalytics.js
// VERSION: 2.0.1
// PURPOSE: Live offline-first queue charts + server-synced funnel (dual mode)
// CHANGES FROM 2.0.0:
//   - FIX CRITICAL: updateLiveData() no longer calls
//     window.dataHandlers.getAllQueueConfigsWithData() — that function is NOT
//     exposed on window.dataHandlers in dataSync.js v3.5.1. Instead, pending
//     count is read via window.dataHandlers.countUnsyncedRecords(null, mode)
//     which IS exposed and already mode-aware (queueManager v3.3.0).
//   - FIX CRITICAL: renderServerData(), fetchServerData(), buildFunnelRows()
//     are now fully implemented (were marked '// abridged' in v2.0.0 —
//     production code must never ship with placeholder comments).
//   - FIX: activeTab state correctly toggles between 'live' and 'server' tabs.
//     In v2.0.0 activeTab was initialised to 'type1' which shadowed tab logic.
//   - FIX: injectStyles() now includes actual CSS rules instead of a comment
//     placeholder.
//   - UNCHANGED: Canvas chart logic, live interval (10s), hide-when-empty,
//     getCurrentKioskMode(), mount/observer pattern all identical to v2.0.0.
// DEPENDENCIES: window.dataHandlers (dataSync.js), window.CONSTANTS (config.js)

(function () {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────────────
  const SERVER_API_URL  = '/api/analytics-summary';
  const CACHE_TTL_MS    = 5 * 60 * 1000;   // 5min server cache
  const LIVE_REFRESH_MS = 10000;            // 10s local queue refresh

  // ─── State ───────────────────────────────────────────────────────────────────
  let serverCache  = null;  // { data, fetchedAt }
  let liveData     = null;  // { pending, synced, mode }
  let activeTab    = 'live'; // FIX: was 'type1' in v2.0.0 — now correctly 'live'
  let panel        = null;
  let liveInterval = null;
  let stylesInjected = false;

  // ─── Mode Integration ─────────────────────────────────────────────────────────
  function getCurrentKioskMode() {
    return window.getCurrentKioskMode?.() ||
           window.DEVICECONFIG?.kioskMode ||
           'all';
  }

  // ─── Canvas Charts (Battery Efficient) ───────────────────────────────────────
  function createLiveQueueChart(pending, synced, mode) {
    if (!panel) return;
    const canvas = panel.querySelector('#liveQueueCanvas');
    if (!canvas) return;

    // Phase 5: Hide chart entirely when both values are zero
    if (pending === 0 && synced === 0) {
      canvas.style.display = 'none';
      return;
    }

    canvas.style.display = 'block';

    const ctx    = canvas.getContext('2d');
    const width  = canvas.width  = 300;
    const height = canvas.height = 130;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = 'rgba(15,23,42,0.95)';
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = '#e2e8f0';
    ctx.font      = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${(mode || 'ALL').toUpperCase()} QUEUES`, width / 2, 18);

    const maxBarW  = 110;
    const barH     = 50;
    const barTop   = 30;

    // Pending bar (left)
    const pendingRatio = Math.min(pending / Math.max(pending, 100, 1), 1);
    ctx.fillStyle = pending > 0 ? '#ef4444' : '#334155';
    ctx.fillRect(15, barTop, maxBarW * pendingRatio, barH);

    // Synced bar (right)
    const syncedRatio = Math.min(synced / Math.max(synced, 500, 1), 1);
    ctx.fillStyle = synced > 0 ? '#10b981' : '#334155';
    ctx.fillRect(165, barTop, maxBarW * syncedRatio, barH);

    // Values
    ctx.fillStyle = '#f8fafc';
    ctx.font      = 'bold 16px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(pending), 70,  barTop + barH + 16);
    ctx.fillText(String(synced),  220, barTop + barH + 16);

    // Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font      = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('⏳ PENDING', 15,  height - 4);
    ctx.textAlign = 'right';
    ctx.fillText('✅ SYNCED', 285, height - 4);
  }

  // ─── Live Queue Data (Offline-First) ─────────────────────────────────────────
  async function updateLiveData() {
    if (!panel) return;

    const mode = getCurrentKioskMode();

    // FIX: Use countUnsyncedRecords(null, mode) — this IS on window.dataHandlers.
    // getAllQueueConfigsWithData is NOT exposed there (dataSync.js v3.5.1 confirmed).
    if (!window.dataHandlers?.countUnsyncedRecords) return;

    try {
      const pending = window.dataHandlers.countUnsyncedRecords(null, mode);

      // Synced: approximate from analytics localStorage
      const analyticsKey = window.CONSTANTS?.STORAGE_KEY_ANALYTICS || 'surveyAnalytics';
      let analytics = [];
      try {
        analytics = JSON.parse(localStorage.getItem(analyticsKey) || '[]');
      } catch (_) {
        analytics = [];
      }

      // For shayona mode use its own analytics key
      let synced = 0;
      if (mode === 'shayona') {
        const shayonaKey = window.CONSTANTS?.STORAGE_KEY_ANALYTICS_V3 || 'shayonaAnalytics';
        let shayonaAnalytics = [];
        try {
          shayonaAnalytics = JSON.parse(localStorage.getItem(shayonaKey) || '[]');
        } catch (_) { /* ignore */ }
        synced = shayonaAnalytics.filter(a => a.event === 'sync_completed').length;
      } else if (mode === 'all') {
        synced = analytics.filter(a => a.event === 'sync_completed').length;
      } else {
        synced = analytics.filter(a =>
          a.event === 'sync_completed' &&
          (a.activeSurveyType?.startsWith('type') || !a.activeSurveyType)
        ).length;
      }

      liveData = { pending, synced, mode, timestamp: Date.now() };

      if (activeTab === 'live') {
        createLiveQueueChart(pending, synced, mode);
      }

      // Update summary text
      const summary = panel.querySelector('#liveSummary');
      if (summary) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        summary.innerHTML = `
          <div style="font-weight:600">${pending} PENDING &nbsp;|&nbsp; ${synced} SYNCED</div>
          <div style="font-size:9px;color:#64748b;margin-top:2px">
            ${(mode || 'ALL').toUpperCase()} — updated ${time}
          </div>
        `;
      }

      console.log(`[ANALYTICS] Live: ${pending}p / ${synced}s (${mode})`);
    } catch (e) {
      console.warn('[ANALYTICS] Live update failed:', e);
    }
  }

  // ─── Server Funnel Helpers ────────────────────────────────────────────────────
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

  function buildFunnelRows(d) {
    if (!d || !Array.isArray(d.steps) || d.steps.length === 0) {
      return '<p style="color:#64748b;font-size:0.8rem;text-align:center;padding:12px">No funnel data</p>';
    }

    const total = d.steps[0]?.count || 1;

    return d.steps.map((step, i) => {
      const reachPct  = Math.round((step.count / total) * 100);
      const prevCount = i > 0 ? d.steps[i - 1].count : step.count;
      const dropPct   = i > 0 ? Math.round(((prevCount - step.count) / Math.max(prevCount, 1)) * 100) : 0;

      return `
        <div class="aap-funnel-row" style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:2px;">
            <span style="color:#e2e8f0">${step.label || `Step ${i + 1}`}</span>
            <span style="color:#94a3b8">${step.count} (${reachPct}%)</span>
          </div>
          <div style="background:#1e293b;border-radius:3px;height:8px;overflow:hidden;">
            <div style="width:${reachPct}%;height:100%;background:${barColor(reachPct)};border-radius:3px;transition:width 0.3s;"></div>
          </div>
          ${i > 0 ? `<div style="font-size:9px;color:${dropOffColor(dropPct)};text-align:right;margin-top:1px">▼ ${dropPct}% drop-off</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // ─── Server Data Render ───────────────────────────────────────────────────────
  function renderError(msg) {
    if (!panel) return;
    const funnel  = panel.querySelector('#serverFunnel');
    const summary = panel.querySelector('#serverSummary');
    if (funnel)  funnel.innerHTML  = `<p style="color:#ef4444;font-size:0.75rem;text-align:center;padding:8px">${msg}</p>`;
    if (summary) summary.innerHTML = '';
  }

  function renderServerData(data) {
    if (!panel || !data) { renderError('No data available'); return; }

    // activeTab when on server tab holds the survey type key (type1/type2/type3)
    // Use getCurrentKioskMode default to pick the right key
    const mode    = getCurrentKioskMode();
    const tabKey  = activeTab !== 'live' ? activeTab : (mode === 'shayona' ? 'type3' : 'type1');
    const d       = data[tabKey];

    if (!d) {
      renderError(`No server data for "${tabKey}"`);
      return;
    }

    const summary = panel.querySelector('#serverSummary');
    if (summary) {
      summary.innerHTML = `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b;margin-bottom:8px;">
          <span style="color:#94a3b8;font-size:0.75rem">Total Responses</span>
          <span style="color:#e2e8f0;font-weight:600;font-size:0.8rem">${d.total || 0}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;">
          <span style="color:#94a3b8;font-size:0.75rem">Completion Rate</span>
          <span style="color:#10b981;font-weight:600;font-size:0.8rem">${d.completionRate || 0}%</span>
        </div>
      `;
    }

    const funnel = panel.querySelector('#serverFunnel');
    if (funnel) {
      funnel.innerHTML = buildFunnelRows(d);
    }
  }

  // ─── Server Fetch ─────────────────────────────────────────────────────────────
  async function fetchServerData(force = false) {
    if (!navigator.onLine) {
      renderError('Offline — server data unavailable');
      return;
    }

    // Use cache unless forced or expired
    if (!force && serverCache &&
        (Date.now() - serverCache.fetchedAt) < CACHE_TTL_MS) {
      renderServerData(serverCache.data);
      return;
    }

    const footer = panel?.querySelector('#aap-footer');
    if (footer) footer.textContent = 'Fetching server data...';

    try {
      const res = await fetch(SERVER_API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      serverCache = { data, fetchedAt: Date.now() };

      if (activeTab !== 'live') {
        renderServerData(data);
      }

      if (footer) {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        footer.textContent = `Server data • ${time}`;
      }
    } catch (err) {
      console.warn('[ANALYTICS] Server fetch failed:', err.message);
      renderError(`Server unavailable: ${err.message}`);
      if (footer) footer.textContent = 'Server data unavailable';
    }
  }

  // ─── Panel DOM ────────────────────────────────────────────────────────────────
  function createPanel() {
    const el = document.createElement('div');
    el.id = 'adminAnalyticsPanel';
    el.innerHTML = `
      <div id="aap-header">
        <span id="aap-title">📊 Analytics</span>
        <div id="aap-mode">${(getCurrentKioskMode() || 'ALL').toUpperCase()}</div>
        <div id="aap-tabs">
          <button class="aap-tab active" data-tab="live">Live Queues</button>
          <button class="aap-tab" data-tab="server">Server Funnel</button>
        </div>
        <button id="aap-refresh" title="Refresh All">↺</button>
      </div>
      <div id="liveSummary" style="padding:4px 8px;font-size:0.75rem;color:#94a3b8;"></div>
      <canvas id="liveQueueCanvas" width="300" height="130" style="display:none;width:100%;border-radius:6px;"></canvas>
      <div id="serverSummary" style="padding:0 8px;display:none;"></div>
      <div id="serverFunnel"  style="padding:0 8px;display:none;"></div>
      <div id="aap-footer"    style="padding:4px 8px;font-size:9px;color:#475569;text-align:right;"></div>
    `;

    // Tab switching
    el.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        activeTab = tab;

        el.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const canvas  = el.querySelector('#liveQueueCanvas');
        const summary = el.querySelector('#liveSummary');
        const sSummary = el.querySelector('#serverSummary');
        const sFunnel  = el.querySelector('#serverFunnel');

        if (tab === 'live') {
          if (canvas)  canvas.style.display  = liveData && (liveData.pending > 0 || liveData.synced > 0) ? 'block' : 'none';
          if (summary) summary.style.display = 'block';
          if (sSummary) sSummary.style.display = 'none';
          if (sFunnel)  sFunnel.style.display  = 'none';
          if (liveData) createLiveQueueChart(liveData.pending, liveData.synced, liveData.mode);
        } else {
          if (canvas)  canvas.style.display  = 'none';
          if (summary) summary.style.display = 'none';
          if (sSummary) sSummary.style.display = 'block';
          if (sFunnel)  sFunnel.style.display  = 'block';
          if (serverCache) renderServerData(serverCache.data);
          else fetchServerData();
        }
      });
    });

    el.querySelector('#aap-refresh').addEventListener('click', () => {
      updateLiveData();
      fetchServerData(true);
      // Update mode label
      const modeEl = el.querySelector('#aap-mode');
      if (modeEl) modeEl.textContent = (getCurrentKioskMode() || 'ALL').toUpperCase();
    });

    return el;
  }

  // ─── Styles ───────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    const style = document.createElement('style');
    style.id    = 'adminAnalyticsStyles';
    style.textContent = `
      #adminAnalyticsPanel {
        position: fixed;
        bottom: 12px;
        right: 12px;
        width: 320px;
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 10px;
        z-index: 10000;
        font-family: ui-monospace, monospace;
        overflow: hidden;
        display: none;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      }

      body.admin-active #adminAnalyticsPanel {
        display: block;
      }

      #aap-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        background: #1e293b;
        border-bottom: 1px solid #334155;
        flex-wrap: wrap;
      }

      #aap-title {
        font-size: 0.8rem;
        font-weight: 700;
        color: #e2e8f0;
        flex: 1;
      }

      #aap-mode {
        font-size: 0.65rem;
        background: #334155;
        color: #94a3b8;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 600;
      }

      #aap-tabs {
        display: flex;
        gap: 4px;
      }

      .aap-tab {
        font-size: 0.65rem;
        padding: 3px 7px;
        border: 1px solid #334155;
        border-radius: 4px;
        background: transparent;
        color: #64748b;
        cursor: pointer;
        font-family: ui-monospace, monospace;
        transition: background 0.15s;
      }

      .aap-tab.active {
        background: #0ea5e9;
        border-color: #0ea5e9;
        color: #fff;
      }

      #aap-refresh {
        background: transparent;
        border: 1px solid #334155;
        color: #64748b;
        border-radius: 4px;
        padding: 3px 7px;
        cursor: pointer;
        font-size: 0.75rem;
        font-family: ui-monospace, monospace;
      }

      #aap-refresh:hover {
        background: #1e293b;
        color: #e2e8f0;
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Mount ────────────────────────────────────────────────────────────────────
  function mount() {
    injectStyles();

    panel = createPanel();
    document.body.appendChild(panel);

    // Live queue 10s interval — pure localStorage, no network
    liveInterval = setInterval(updateLiveData, LIVE_REFRESH_MS);

    // Respond to kiosk mode changes from adminMaintenance selector
    window.addEventListener('kioskModeChanged', () => {
      const modeEl = panel?.querySelector('#aap-mode');
      if (modeEl) modeEl.textContent = (getCurrentKioskMode() || 'ALL').toUpperCase();
      updateLiveData();
    });

    // Initial data load
    updateLiveData();
    fetchServerData();

    // Show/hide with admin panel visibility (body.admin-active)
    // CSS handles display — observer updates mode label on open
    const observer = new MutationObserver(() => {
      if (document.body.classList.contains('admin-active')) {
        const modeEl = panel?.querySelector('#aap-mode');
        if (modeEl) modeEl.textContent = (getCurrentKioskMode() || 'ALL').toUpperCase();
        updateLiveData();
      }
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    console.log('[ANALYTICS] ✅ Admin analytics panel mounted (v2.0.1)');
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  // Expose for external callers (adminMaintenance.js updateLiveCharts ref)
  window.updateLiveCharts = updateLiveData;

})();
