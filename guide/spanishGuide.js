// FILE: guide/spanishGuide.js
// PURPOSE: Standalone Spanish visitor guide for TEMPLE kiosks only.
//   - Injects an "Explorar en español" entry block into #kioskStartScreen
//   - Opens a separate full-screen overlay (#spanishGuideRoot)
//   - ALL guide state is module-local: never touches appState, formData,
//     survey storage, queues, or survey language.
// IDLE: while open, window.__spanishGuideOpen = true. timers/inactivityHandler.js
//   then skips arming the 60 s survey timer; the guide runs its own two-stage
//   timer (idle -> soft prompt -> close).
// OFFLINE: makes no network calls of its own. When online it only checks that its
//   own files/photos are cached and fetches any that are missing (self-heal).
// USAGE COUNTERS: anonymous per-day counters in localStorage key 'guideStats'.
//   Sent only when online, one 'guide_usage_summary' event per day, via the
//   existing analytics pipeline (no server change). No personal data.
// FAILURE ISOLATION: separate module graph; errors here cannot affect the survey.

import { pauseInactivityTimer, resetInactivityTimer } from '../timers/inactivityHandler.js';

const GUIDE_ENABLED = true;        // kill switch (requires deploy)
const IDLE_MENU_MS = 40000;        // no touch on the topic menu
const IDLE_PAGE_MS = 75000;        // no touch while reading a page
const PROMPT_MS = 15000;           // soft prompt before closing
const LOAD_TIMEOUT_MS = 8000;      // give up opening if content cannot load
const HEAL_DELAY_MS = 8000;        // wait after load before cache self-check
const FLUSH_DELAY_MS = 20000;      // wait after load/online before sending counters
const STATS_KEY = 'guideStats';
const IMG_BASE = '/guide/img/';
const LOG = '[GUIDE]';

let content = null;
let rootEl = null;
let barEl = null;
let scrollEl = null;
let promptEl = null;
let isOpen = false;
let currentId = null;
let openedAt = 0;
let idleTimer = null;
let promptTimer = null;
let visibilityBound = false;
let onlineBound = false;
let healed = false;

// ── helpers ────────────────────────────────────────────────────────────────

function isTempleKiosk() {
  return window.DEVICECONFIG?.kioskMode === 'temple';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

async function loadContent() {
  if (!content) content = await import('./guideContent.es.js');
  return content;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('load timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── usage counters (anonymous, never throws) ────────────────────────────────

function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && parsed.days && typeof parsed.days === 'object'
      ? parsed
      : { days: {} };
  } catch (e) {
    return { days: {} };
  }
}

function writeStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) { /* storage full or blocked: counters are best-effort */ }
}

const RECENT_KEY = 'guideStatsRecent';
const RECENT_DAYS = 14;

// Rolling copy of daily counters for the admin panel (never sent, never cleared by flush)
function updateRecent(mutator) {
  try {
    let recent = {};
    try { recent = JSON.parse(localStorage.getItem(RECENT_KEY)) || {}; } catch (e) { recent = {}; }
    if (!recent.days || typeof recent.days !== 'object') recent = { days: {} };
    const key = todayKey();
    const day = recent.days[key] || (recent.days[key] = {
      opens: 0, views: {}, thanks: 0, shares: 0, closes: {}, seconds: 0,
    });
    mutator(day);
    updateRecent(mutator);
    Object.keys(recent.days).sort().slice(0, -RECENT_DAYS).forEach((k) => delete recent.days[k]);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch (e) { /* best-effort only */ }
}

function bumpStats(mutator) {
  try {
    const stats = readStats();
    const key = todayKey();
    const day = stats.days[key] || (stats.days[key] = {
      opens: 0, views: {}, thanks: 0, shares: 0, closes: {}, seconds: 0,
    });
    mutator(day);
    writeStats(stats);
  } catch (e) {
    console.warn(LOG, 'counter update skipped:', e);
  }
}

function statOpen() {
  bumpStats((d) => { d.opens += 1; });
}

function statView(pageId) {
  bumpStats((d) => {
    d.views[pageId] = (d.views[pageId] || 0) + 1;
    if (pageId === 'thanks') d.thanks += 1;
  });
}

function statClose(reason, seconds) {
  bumpStats((d) => {
    d.closes[reason] = (d.closes[reason] || 0) + 1;
    d.seconds += seconds;
    if (reason === 'share') d.shares += 1;
  });
}

// Sends one summary event per stored day through the existing analytics queue.
// Only when online, so events are recorded right before the periodic analytics
// sync and are not exposed to the offline queue-size trimming.
function flushStats() {
  if (!navigator.onLine) return;
  if (typeof window.dataHandlers?.recordAnalytics !== 'function') return;
  try {
    const stats = readStats();
    const days = Object.keys(stats.days);
    if (!days.length) return;
    days.forEach((day) => {
      const d = stats.days[day];
      window.dataHandlers.recordAnalytics('guide_usage_summary', {
        surveyId: null,
        surveyType: null,
        questionId: day,                          // column: day (YYYY-MM-DD)
        questionIndex: d.opens,                   // column: guide sessions that day
        totalTimeSeconds: Math.round(d.seconds),  // column: total seconds in guide
        reason: 'daily',
        questionTimeSpent: {                      // JSON column: details
          views: d.views,
          closes: d.closes,
          thanks: d.thanks,
          shares: d.shares,
        },
      });
      delete stats.days[day];
    });
    writeStats(stats);
    console.log(LOG, 'usage summary recorded for', days.length, 'day(s)');
  } catch (err) {
    console.warn(LOG, 'usage summary skipped:', err);
  }
}

function scheduleFlush() {
  if (!navigator.onLine) return;
  setTimeout(flushStats, FLUSH_DELAY_MS);
}

// ── idle handling (guide-owned) ─────────────────────────────────────────────

function currentIdleMs() {
  return currentId === null || currentId === content?.GUIDE_HOME ? IDLE_MENU_MS : IDLE_PAGE_MS;
}

function clearIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  if (promptTimer) clearTimeout(promptTimer);
  idleTimer = null;
  promptTimer = null;
  if (promptEl) promptEl.hidden = true;
}

function armIdle() {
  clearIdle();
  idleTimer = setTimeout(showPrompt, currentIdleMs());
}

function showPrompt() {
  idleTimer = null;
  if (!isOpen) return;
  if (promptEl) promptEl.hidden = false;
  promptTimer = setTimeout(() => closeGuide('idle'), PROMPT_MS);
}

function bumpIdle() {
  if (isOpen) armIdle();
}

// ── home-screen entry block ─────────────────────────────────────────────────

function ensureEntry() {
  const screen = document.getElementById('kioskStartScreen');
  if (!screen) return false;

  if (!document.getElementById('guideEntryBlock')) {
    const block = el('div', 'guide-entry');
    block.id = 'guideEntryBlock';
    block.lang = 'es';
    block.appendChild(el('p', 'guide-entry-title', '¿Qué es este lugar?'));
    block.appendChild(el('p', 'guide-entry-sub', 'Conozca el Mandir y sus tradiciones.'));
    const btn = button('Explorar en español', 'guide-entry-btn', openGuide);
    btn.id = 'guideEntryBtn';
    block.appendChild(btn);
    const note = el('p', 'guide-entry-note', 'Mandir guide in Spanish');
    note.lang = 'en';
    block.appendChild(note);
    screen.appendChild(block);
  }
  screen.classList.add('guide-enabled');
  return true;
}

// ── overlay ─────────────────────────────────────────────────────────────────

function ensureRoot() {
  if (rootEl) return;
  rootEl = el('div', 'guide-root');
  rootEl.id = 'spanishGuideRoot';
  rootEl.lang = 'es';
  rootEl.hidden = true;
  rootEl.setAttribute('role', 'dialog');
  rootEl.setAttribute('aria-label', 'Guía del Mandir');

  barEl = el('div', 'guide-bar');
  scrollEl = el('div', 'guide-scroll');

  promptEl = el('div', 'guide-prompt');
  promptEl.hidden = true;
  promptEl.setAttribute('role', 'status');
  promptEl.appendChild(el('p', 'guide-prompt-es', '¿Sigue ahí? Toque para continuar.'));
  const en = el('p', 'guide-prompt-en', 'Still there? Tap to continue.');
  en.lang = 'en';
  promptEl.appendChild(en);

  rootEl.appendChild(barEl);
  rootEl.appendChild(scrollEl);
  rootEl.appendChild(promptEl);
  document.body.appendChild(rootEl);

  ['touchstart', 'pointerdown', 'click'].forEach((type) =>
    rootEl.addEventListener(type, bumpIdle, { passive: true })
  );
  rootEl.addEventListener('scroll', bumpIdle, { capture: true, passive: true });
}

function homeButton() {
  const b = button('', 'guide-btn guide-btn--home', () => closeGuide('home'));
  b.setAttribute('aria-label', 'Volver al inicio. Back to home.');
  b.appendChild(el('span', 'guide-home-icon', '⌂'));
  b.appendChild(el('span', 'guide-home-text', 'Inicio · Home'));
  return b;
}

function renderBar(id, page) {
  const { GUIDE_HOME } = content;
  barEl.textContent = '';
  if (id !== GUIDE_HOME) {
    if (page.parent && page.parent !== GUIDE_HOME) {
      barEl.appendChild(button('Atrás', 'guide-btn', () => renderPage(page.parent)));
    }
    barEl.appendChild(button('Ver otros temas', 'guide-btn', () => renderPage(GUIDE_HOME)));
  }
  barEl.appendChild(el('div', 'guide-bar-spacer'));
  barEl.appendChild(homeButton());
}

function appendBlocks(container, blocks) {
  (blocks || []).forEach((b) => {
    if (b.t === 'p') container.appendChild(el('p', 'guide-p', b.x));
    else if (b.t === 'h') container.appendChild(el('h3', 'guide-h', b.x));
    else if (b.t === 'quote') container.appendChild(el('blockquote', 'guide-quote', b.x));
    else if (b.t === 'list') {
      const ul = el('ul', 'guide-list');
      b.items.forEach((item) => ul.appendChild(el('li', '', item)));
      container.appendChild(ul);
    } else if (b.t === 'note') {
      const note = el('div', 'guide-note');
      note.appendChild(el('p', 'guide-note-title', b.title));
      note.appendChild(el('p', 'guide-p', b.x));
      container.appendChild(note);
    }
  });
}

function appendLinks(container, links) {
  if (!links || !links.length) return;
  const wrap = el('div', 'guide-links');
  links.forEach((l) => wrap.appendChild(button(l.label, 'guide-topic', () => renderPage(l.id))));
  container.appendChild(wrap);
}

function buildPhotos(article, images) {
  if (!images || !images.length) return;
  const aside = el('aside', 'guide-photos' + (images.length > 1 ? ' guide-photos--multi' : ''));
  aside.hidden = true;
  images.forEach((img) => {
    const fig = el('figure', `guide-photo guide-photo--${img.shape === 'portrait' ? 'portrait' : 'landscape'}`);
    fig.hidden = true;
    const im = document.createElement('img');
    im.alt = img.alt || '';
    im.decoding = 'async';
    im.draggable = false;
    im.addEventListener('load', () => {
      fig.hidden = false;
      aside.hidden = false;
      article.classList.add('guide-page--photo');
    });
    im.addEventListener('error', () => fig.remove());
    im.src = IMG_BASE + img.file;
    fig.appendChild(im);
    aside.appendChild(fig);
  });
  article.appendChild(aside);
}

function buildMenu(page) {
  const article = el('article', 'guide-page guide-menu');

  const intro = el('div', 'guide-text');
  intro.appendChild(el('p', 'guide-eyebrow', page.eyebrow));
  intro.appendChild(el('h2', 'guide-title', page.title));
  appendBlocks(intro, page.blocks);
  article.appendChild(intro);

  const topics = el('div', 'guide-text');
  topics.appendChild(el('p', 'guide-topics-label', page.topicsLabel));
  const list = el('div', 'guide-topics');
  page.topics.forEach((t) => list.appendChild(button(t.label, 'guide-topic', () => renderPage(t.id))));
  topics.appendChild(list);
  article.appendChild(topics);
  return article;
}

function buildPage(page) {
  const { GUIDE_PAGES } = content;
  const article = el('article', 'guide-page');
  const text = el('div', 'guide-text');
  text.appendChild(el('h2', 'guide-title', page.title));
  if (page.subtitle) text.appendChild(el('p', 'guide-subtitle', page.subtitle));
  appendBlocks(text, page.blocks);
  appendLinks(text, page.links);
  appendBlocks(text, page.after);

  const foot = el('div', 'guide-next');
  if (page.action === 'survey') {
    foot.appendChild(button(page.actionLabel, 'guide-btn guide-btn--primary', shareExperience));
  } else if (page.next) {
    const target = GUIDE_PAGES[page.next];
    const label = page.nextText || `Siguiente: ${target?.label || ''}`;
    foot.appendChild(button(label, 'guide-btn guide-btn--primary', () => renderPage(page.next)));
  }
  if (foot.childNodes.length) text.appendChild(foot);

  article.appendChild(text);
  buildPhotos(article, page.images);
  return article;
}

function renderPage(id) {
  const { GUIDE_PAGES, GUIDE_HOME } = content;
  let pageId = id;
  let page = GUIDE_PAGES[pageId];
  if (!page) {
    pageId = GUIDE_HOME;
    page = GUIDE_PAGES[pageId];
  }
  currentId = pageId;
  renderBar(pageId, page);
  scrollEl.textContent = '';
  scrollEl.appendChild(pageId === GUIDE_HOME ? buildMenu(page) : buildPage(page));
  scrollEl.scrollTop = 0;
  statView(pageId);
  armIdle();
}

// ── open / close ────────────────────────────────────────────────────────────

async function openGuide() {
  if (isOpen) return;
  const screen = document.getElementById('kioskStartScreen');
  if (!screen || screen.classList.contains('hidden') || screen.classList.contains('start-screen-fade-out')) {
    return; // survey is starting or already running: never open over it
  }

  isOpen = true;
  window.__spanishGuideOpen = true;   // set BEFORE pausing so no re-arm can slip in
  try { pauseInactivityTimer(); } catch (e) { console.warn(LOG, 'pause failed', e); }

  try {
    ensureRoot();
    armIdle();                        // guarantees a close even if loading hangs
    await withTimeout(loadContent(), LOAD_TIMEOUT_MS);
    if (!isOpen) return;              // closed while content was loading
    renderPage(content.GUIDE_HOME);
    rootEl.hidden = false;
    openedAt = Date.now();
    statOpen();
  } catch (err) {
    console.error(LOG, 'open failed (survey unaffected):', err);
    closeGuide('error');
  }
}

function closeGuide(reason) {
  if (!isOpen && window.__spanishGuideOpen !== true) return;
  isOpen = false;
  clearIdle();
  const seconds = openedAt ? Math.min(Math.round((Date.now() - openedAt) / 1000), 3600) : 0;
  openedAt = 0;
  statClose(reason, seconds);
  if (rootEl) {
    rootEl.hidden = true;
    scrollEl.textContent = '';
    barEl.textContent = '';
  }
  currentId = null;
  window.__spanishGuideOpen = false;  // clear BEFORE re-arming the survey timer
  try { resetInactivityTimer(); } catch (e) { console.warn(LOG, 'timer re-arm failed', e); }
  console.log(LOG, 'closed:', reason);
}

function shareExperience() {
  closeGuide('share');
  const btn = document.getElementById('langBtnEs'); // existing Spanish survey entry
  if (btn) btn.click();
}

// ── offline self-heal (only when online; never required) ────────────────────

async function healCache() {
  if (healed || !navigator.onLine || !('caches' in window)) return;
  healed = true;
  try {
    await loadContent();
    const urls = ['/guide/spanishGuide.js', '/guide/guideContent.es.js'];
    Object.values(content.GUIDE_PAGES).forEach((p) =>
      (p.images || []).forEach((i) => urls.push(IMG_BASE + i.file))
    );
    for (const url of urls) {
      if (!navigator.onLine) break;
      if (await caches.match(url, { ignoreSearch: true })) continue;
      try { await fetch(url); } catch (e) { /* offline or missing: ignore */ }
    }
  } catch (err) {
    console.warn(LOG, 'cache self-check skipped:', err);
  }
}

function scheduleHeal() {
  if (!navigator.onLine) return;
  setTimeout(healCache, HEAL_DELAY_MS);
}

// ── wiring ──────────────────────────────────────────────────────────────────

function bindVisibility() {
  if (visibilityBound) return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isOpen) closeGuide('hidden');
  });
}

function bindOnline() {
  if (onlineBound) return;
  onlineBound = true;
  window.addEventListener('online', () => {
    healed = false;
    scheduleHeal();
    scheduleFlush();
  });
}

function setup() {
  if (!GUIDE_ENABLED || !isTempleKiosk()) return;
  if (!ensureEntry()) return;
  bindVisibility();
  bindOnline();
  scheduleHeal();
  scheduleFlush();
}

function init() {
  try {
    setup();
    // First launch: kiosk mode is chosen after load (device-config.js dispatches this)
    window.addEventListener('deviceConfigReady', () => {
      try { setup(); } catch (e) { console.error(LOG, 'setup failed:', e); }
    });
  } catch (err) {
    console.error(LOG, 'init failed (survey unaffected):', err);
  }
}

init();
