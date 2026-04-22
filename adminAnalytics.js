// FILE: adminAnalytics.js
// VERSION: 1.0.0
// PURPOSE: Renders a compact always-visible funnel heat map below #adminControls.
//          Visible only when admin mode is active (.admin-active on body).
//          Auto-fetches on load and on network reconnect.
//          Fetches both type1 and type2; toggled via pill tabs.
//
// SETUP: Add <script src="adminAnalytics.js"></script> in index.html
//        just before closing </body>, after all other scripts.

(function () {
  'use strict';

  // ─── Constants ──────────────────────────────────────────────────────────────
  const API_URL       = '/api/analytics-summary';
  const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 min — don't re-fetch if recently loaded

  // Color stops for drop-off heat:  0% drop-off → green, 50%+ → red
  function dropOffColor(pct) {
    if (pct <= 10)  return '#22c55e'; // green
    if (pct <= 25)  return '#84cc16'; // lime
    if (pct <= 40)  return '#eab308'; // yellow
    if (pct <= 55)  return '#f97316'; // orange
    return '#ef4444';                 // red
  }

  // Bar fill color based on reachPct (100% → teal, 0% → muted)
  function barColor(reachPct) {
    if (reachPct >= 80) return '#0d9488'; // teal-600
    if (reachPct >= 60) return '#0891b2'; // cyan-600
    if (reachPct >= 40) return '#7c3aed'; // violet-600
    if (reachPct >= 20) return '#ea580c'; // orange-600
    return '#dc2626';                     // red-600
  }

  // ─── State ──────────────────────────────────────────────────────────────────
  let cache     = null;   // { data, fetchedAt }
  let activeTab = 'type1';
  let panel     = null;

  // ─── Build DOM ──────────────────────────────────────────────────────────────
  function createPanel() {
    const el = document.createElement('div');
    el.id = 'adminAnalyticsPanel';
    el.innerHTML = `
      <div id="aap-header">
        <span id="aap-title">📊 Funnel</span>
        <div id="aap-tabs">
          <button class="aap-tab aap-tab-active" data-type="type1">Type 1</button>
          <button class="aap-tab" data-type="type2">Type 2</button>
        </div>
        <button id="aap-refresh" title="Refresh">↺</button>
      </div>
      <div id="aap-summary"></div>
      <div id="aap-funnel"></div>
      <div id="aap-footer"></div>
    `;

    // Tab switching
    el.querySelectorAll('.aap-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.type;
        el.querySelectorAll('.aap-tab').forEach(b => b.classList.remove('aap-tab-active'));
        btn.classList.add('aap-tab-active');
        if (cache) renderData(cache.data);
      });
    });

    // Manual refresh
    el.querySelector('#aap-refresh').addEventListener('click', () => fetchData(true));

    return el;
  }

  // ─── Styles ─────────────────────────────────────────────────────────────────
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

      .admin-active #adminAnalyticsPanel {
        display: block;
      }

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

      #aap-tabs {
        display: flex;
        gap: 4px;
        flex: 1;
        justify-content: center;
      }

      .aap-tab {
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

      @keyframes aap-spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }

      #aap-summary {
        display: flex;
        gap: 6px;
        margin-bottom: 10px;
      }

      .aap-stat {
        flex: 1;
        background: rgba(255,255,255,0.06);
        border-radius: 6px;
        padding: 5px 6px;
        text-align: center;
      }

      .aap-stat-val {
        font-size: 15px;
        font-weight: 700;
        color: #f1f5f9;
        line-height: 1.1;
        display: block;
      }

      .aap-stat-lbl {
        font-size: 9px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        display: block;
        margin-top: 1px;
      }

      #aap-funnel {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .aap-row {
        display: grid;
        grid-template-columns: 90px 1fr 32px;
        align-items: center;
        gap: 6px;
      }

      .aap-label {
        font-size: 10px;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: right;
      }

      .aap-label.optional {
        color: #64748b;
        font-style: italic;
      }

      .aap-bar-track {
        height: 16px;
        background: rgba(255,255,255,0.06);
        border-radius: 4px;
        overflow: hidden;
        position: relative;
      }

      .aap-bar-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        min-width: 2px;
      }

      .aap-bar-pct {
        font-size: 9px;
        font-weight: 700;
        color: rgba(255,255,255,0.9);
        padding-right: 4px;
        white-space: nowrap;
      }

      .aap-bar-pct-outside {
        font-size: 9px;
        font-weight: 600;
        color: #475569;
        padding-left: 3px;
        white-space: nowrap;
        position: absolute;
        left: 100%;
      }

      .aap-drop {
        font-size: 9px;
        font-weight: 700;
        text-align: center;
        white-space: nowrap;
      }

      #aap-footer {
        margin-top: 8px;
        font-size: 9px;
        color: #334155;
        text-align: right;
      }

      .aap-empty {
        text-align: center;
        color: #475569;
        font-size: 10px;
        padding: 12px 0;
      }

      .aap-error {
        text-align: center;
        color: #ef4444;
        font-size: 10px;
        padding: 8px 0;
      }

      .aap-loading {
        text-align: center;
        color: #475569;
        font-size: 10px;
        padding: 12px 0;
        letter-spacing: 0.05em;
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  function renderLoading() {
    panel.querySelector('#aap-summary').innerHTML = '';
    panel.querySelector('#aap-funnel').innerHTML  =
      '<div class="aap-loading">Loading…</div>';
    panel.querySelector('#aap-footer').textContent = '';
  }

  function renderError(msg) {
    panel.querySelector('#aap-summary').innerHTML = '';
    panel.querySelector('#aap-funnel').innerHTML  =
      `<div class="aap-error">⚠ ${msg}</div>`;
    panel.querySelector('#aap-footer').textContent = '';
  }

  function renderData(data) {
    const d = data[activeTab];
    if (!d) { renderError('No data for ' + activeTab); return; }

    // ── Summary bar ──────────────────────────────────────────────────────────
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

    // ── Funnel rows ──────────────────────────────────────────────────────────
    if (!d.questions || d.questions.length === 0) {
      panel.querySelector('#aap-funnel').innerHTML =
        '<div class="aap-empty">No question data yet.</div>';
      return;
    }

    const rows = d.questions.map(q => {
      const reachPct   = q.reachPct   ?? 0;
      const dropPct    = q.dropOffPct ?? 0;
      const fill       = barColor(reachPct);
      const dropColor  = dropOffColor(dropPct);
      const timeLabel  = q.avgTimeSeconds != null ? `${q.avgTimeSeconds}s` : '—';
      const labelClass = q.optional ? 'aap-label optional' : 'aap-label';

      // Show pct inside bar if bar is wide enough, otherwise outside
      const pctInside = reachPct >= 25;
      const barPct = pctInside
        ? `<span class="aap-bar-pct">${reachPct}%</span>`
        : '';
      const barPctOutside = !pctInside
        ? `<span class="aap-bar-pct-outside">${reachPct}%</span>`
        : '';

      return `
        <div class="aap-row" title="Avg time: ${timeLabel} | Drop-off: ${dropPct}%">
          <span class="${labelClass}">${q.label}${q.optional ? ' ✦' : ''}</span>
          <div class="aap-bar-track">
            <div class="aap-bar-fill"
                 style="width:${reachPct}%; background:${fill};">
              ${barPct}
            </div>
            ${barPctOutside}
          </div>
          <span class="aap-drop" style="color:${dropColor}">
            ${dropPct > 0 ? '-' + dropPct + '%' : '✓'}
          </span>
        </div>
      `;
    }).join('');

    panel.querySelector('#aap-funnel').innerHTML = rows;

    // ── Footer ───────────────────────────────────────────────────────────────
    const fetchedAt = cache?.fetchedAt
      ? new Date(cache.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '—';
    panel.querySelector('#aap-footer').textContent =
      `✦ optional  |  drop col = abandon %  |  updated ${fetchedAt}`;
  }

  // ─── Fetch ───────────────────────────────────────────────────────────────────
  async function fetchData(force = false) {
    if (!force && cache && (Date.now() - cache.fetchedAt < CACHE_TTL_MS)) {
      renderData(cache.data);
      return;
    }

    const refreshBtn = panel.querySelector('#aap-refresh');
    refreshBtn.classList.add('spinning');
    renderLoading();

    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cache = { data, fetchedAt: Date.now() };
      renderData(data);
    } catch (err) {
      console.error('[adminAnalytics] Fetch error:', err);
      renderError('Could not load data');
    } finally {
      refreshBtn.classList.remove('spinning');
    }
  }

  // ─── Mount ───────────────────────────────────────────────────────────────────
  function mount() {
    injectStyles();
    panel = createPanel();

    // Insert right after #adminControls inside header
    const adminControls = document.getElementById('adminControls');
    if (adminControls) {
      adminControls.parentNode.insertBefore(panel, adminControls.nextSibling);
    } else {
      // Fallback: append to header
      const header = document.querySelector('header');
      if (header) header.appendChild(panel);
      else document.body.appendChild(panel);
    }

    // Fetch when admin mode becomes active using MutationObserver
    // (watches for .admin-active being added to body)
    let hasFetchedThisSession = false;
    const observer = new MutationObserver(() => {
      const isAdmin = document.body.classList.contains('admin-active');
      if (isAdmin && !hasFetchedThisSession) {
        hasFetchedThisSession = true;
        fetchData();
      }
      if (!isAdmin) {
        hasFetchedThisSession = false; // reset so it re-fetches next open
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Auto-refresh on network reconnect
    window.addEventListener('online', () => {
      if (document.body.classList.contains('admin-active')) {
        fetchData(true);
      }
    });
  }

  // ─── Boot ────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})();
