// FILE: adminSyncStatus.js  (PROPOSED NEW, plain script)
// PURPOSE: Adds to the existing admin analytics panel, without editing adminAnalytics.js:
//   - persistent "Last sync" block (survey records + analytics events), 15-minute
//     "Just synced" badge, red failure line, 7-day guide usage line
//   - friendly survey names on the Funnel tab pills
//   - keeps the last good Funnel data visible when a refresh fails ("as of HH:MM")
//   - refreshes the Funnel tab ~5 s after a successful sync
// Reads only: localStorage 'lastSyncSnapshot' (written by sync modules) and
// 'guideStatsRecent' (written by the guide). Never writes survey data.
(function () {
  'use strict';
  if (window.__aapSyncStatusLoaded) return;
  window.__aapSyncStatusLoaded = true;

  const SNAP_KEY = 'lastSyncSnapshot';
  const GUIDE_KEY = 'guideStatsRecent';
  const JUST_SYNCED_MS = 15 * 60 * 1000;
  const REFRESH_DELAY_MS = 5000;
  const TICK_MS = 5000;

  let lastSeenOkAt = 0;
  let needsRefresh = false;
  let lastGood = null;
  let funnelObserver = null;
  let initTries = 0;

  const byId = (id) => document.getElementById(id);

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; }
  }

  function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fmtStamp(ms) {
    const d = new Date(ms);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? fmtTime(ms)
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + fmtTime(ms);
  }

  function ago(ms) {
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' h ago';
    return Math.floor(h / 24) + ' d ago';
  }

  function injectStyles() {
    if (byId('aap-lastsync-styles')) return;
    const s = document.createElement('style');
    s.id = 'aap-lastsync-styles';
    s.textContent =
      '#aap-lastsync{margin-bottom:8px;padding:6px 8px;background:rgba(255,255,255,0.06);' +
      'border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:10px;line-height:1.5;color:#e2e8f0}' +
      '.aap-ls-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px}' +
      '.aap-ls-title{font-weight:700;color:#94a3b8;letter-spacing:.04em;text-transform:uppercase}' +
      '.aap-ls-badge{padding:0 6px;border-radius:9999px;font-weight:700;background:rgba(16,185,129,.25);color:#4ade80}' +
      '.aap-ls-row{display:flex;gap:8px}' +
      '.aap-ls-label{flex:0 0 54px;color:#64748b}' +
      '.aap-ls-fail{color:#f87171}' +
      '.aap-ls-muted{color:#64748b}' +
      '#aap-type-tabs{flex-wrap:wrap}';
    document.head.appendChild(s);
  }

  function mkRow(label, text, cls) {
    const r = document.createElement('div');
    r.className = 'aap-ls-row' + (cls ? ' ' + cls : '');
    const l = document.createElement('span');
    l.className = 'aap-ls-label';
    l.textContent = label;
    const t = document.createElement('span');
    t.textContent = text;
    r.appendChild(l);
    r.appendChild(t);
    return r;
  }

  function guideTotals() {
    const g = readJson(GUIDE_KEY);
    if (!g || !g.days) return null;
    const keys = Object.keys(g.days).sort().slice(-7);
    let opens = 0; let thanks = 0; let shares = 0;
    keys.forEach((k) => {
      const x = g.days[k] || {};
      opens += x.opens || 0;
      thanks += x.thanks || 0;
      shares += x.shares || 0;
    });
    return opens > 0 ? { opens, thanks, shares } : null;
  }

  function overallOkAt(snap) {
    const d = snap.data && snap.data.lastOk ? snap.data.lastOk.at : 0;
    const a = snap.analytics && snap.analytics.lastOk ? snap.analytics.lastOk.at : 0;
    return Math.max(d || 0, a || 0);
  }

  function render() {
    const live = byId('aap-live-panel');
    if (!live) return;
    let box = byId('aap-lastsync');
    if (!box) {
      box = document.createElement('div');
      box.id = 'aap-lastsync';
      live.insertBefore(box, live.firstChild);
    }
    const snap = readJson(SNAP_KEY) || {};
    const d = snap.data || null;
    const a = snap.analytics || null;
    const okAt = overallOkAt(snap);
    const bad = d && d.ok === false ? d : (a && a.ok === false ? a : null);
    const justSynced = okAt && !bad && (Date.now() - okAt) < JUST_SYNCED_MS;

    box.textContent = '';

    const head = document.createElement('div');
    head.className = 'aap-ls-head';
    const title = document.createElement('span');
    title.className = 'aap-ls-title';
    title.textContent = 'Last sync';
    head.appendChild(title);
    const when = document.createElement('span');
    if (okAt) {
      when.textContent = fmtStamp(okAt) + ' · ' + ago(okAt);
    } else {
      when.className = 'aap-ls-muted';
      when.textContent = 'none recorded yet';
    }
    head.appendChild(when);
    if (justSynced) {
      const badge = document.createElement('span');
      badge.className = 'aap-ls-badge';
      badge.textContent = 'JUST SYNCED';
      head.appendChild(badge);
    }
    box.appendChild(head);

    if (d && d.lastOk) {
      box.appendChild(mkRow('Surveys', d.lastOk.sent + ' sent · ' + (d.lastOk.pending || 0) + ' pending'));
    }
    if (a && a.lastOk) {
      box.appendChild(mkRow('Events', a.lastOk.sent + ' sent'));
    }
    if (bad) {
      const msg = '⚠ FAILED ' + fmtTime(bad.at) + ' · ' + String(bad.error || 'error').slice(0, 70) + ' · will retry';
      box.appendChild(mkRow('', msg, 'aap-ls-fail'));
    }
    const g = guideTotals();
    if (g) {
      box.appendChild(mkRow('Guide', g.opens + ' sessions · ' + g.thanks + ' finished · ' + g.shares + ' to survey (7 days)'));
    }
  }

  function relabelTabs() {
    const types = window.CONSTANTS && window.CONSTANTS.SURVEY_TYPES;
    if (!types) return;
    document.querySelectorAll('#adminAnalyticsPanel .aap-tab[data-type]').forEach((b) => {
      const t = types[b.dataset.type];
      if (t && t.label && b.textContent !== t.label) b.textContent = t.label;
    });
  }

  function activeUi() {
    const b = document.querySelector('#adminAnalyticsPanel .aap-ui-tab-active');
    return b ? b.dataset.ui : null;
  }

  function activeTab() {
    const b = document.querySelector('#adminAnalyticsPanel .aap-tab-active');
    return b ? b.dataset.type : null;
  }

  function onFunnelChange() {
    const funnel = byId('aap-funnel');
    const summary = byId('aap-summary');
    const footer = byId('aap-footer');
    if (!funnel || !summary || !funnelObserver) return;
    if (funnel.querySelector('.aap-loading')) return;

    if (funnel.querySelector('.aap-error')) {
      if (lastGood && lastGood.tab === activeTab()) {
        funnelObserver.disconnect();
        summary.innerHTML = lastGood.summary;
        funnel.innerHTML = lastGood.funnel;
        if (footer) footer.textContent = 'showing data as of ' + fmtTime(lastGood.at) + ' (refresh failed)';
        funnelObserver.observe(funnel, { childList: true });
      }
      return;
    }
    if (funnel.children.length) {
      lastGood = { tab: activeTab(), summary: summary.innerHTML, funnel: funnel.innerHTML, at: Date.now() };
    }
  }

  function attachFunnelObserver() {
    const funnel = byId('aap-funnel');
    if (!funnel || funnelObserver) return;
    funnelObserver = new MutationObserver(onFunnelChange);
    funnelObserver.observe(funnel, { childList: true });
  }

  function checkRefresh() {
    const okAt = overallOkAt(readJson(SNAP_KEY) || {});
    if (okAt && okAt > lastSeenOkAt) {
      const first = lastSeenOkAt === 0;
      lastSeenOkAt = okAt;
      if (!first) needsRefresh = true;
    }
    if (needsRefresh && navigator.onLine && activeUi() === 'server') {
      needsRefresh = false;
      setTimeout(() => {
        const btn = byId('aap-refresh');
        if (btn) btn.click();
      }, REFRESH_DELAY_MS);
    }
  }

  function tick() {
    try {
      if (!document.body.classList.contains('admin-active')) return;
      attachFunnelObserver();
      relabelTabs();
      render();
      checkRefresh();
    } catch (e) {
      console.warn('[aapSyncStatus] tick skipped:', e);
    }
  }

  function init() {
    if (!byId('adminAnalyticsPanel')) {
      if (initTries++ < 60) setTimeout(init, 500);
      return;
    }
    injectStyles();
    attachFunnelObserver();
    relabelTabs();
    render();
    setInterval(tick, TICK_MS);
    new MutationObserver(tick).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    console.log('[aapSyncStatus] admin panel sync status ready');
  }

  init();
})();
