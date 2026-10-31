// FILE: guide/spanishGuide.js
// PURPOSE: Standalone Spanish visitor guide for TEMPLE kiosks only.
//   - Injects a "Explorar en español" entry block into #kioskStartScreen
//   - Opens a separate full-screen overlay (#spanishGuideRoot) with the guide
//   - Keeps ALL guide state module-local: never touches appState, formData,
//     storage, queues, analytics, or survey language.
// IDLE: while open, window.__spanishGuideOpen = true. timers/inactivityHandler.js
//   skips arming the 60 s survey timer; the guide runs its own timer instead.
// FAILURE ISOLATION: separate module graph; any error here cannot affect the survey.

import { pauseInactivityTimer, resetInactivityTimer } from '../timers/inactivityHandler.js';

const GUIDE_ENABLED = true;          // kill switch (requires deploy)
const GUIDE_IDLE_MS = 120000;        // 120 s without touch -> back to home
const IMG_BASE = '/guide/img/';
const LOG = '[GUIDE]';

let content = null;
let rootEl = null;
let barEl = null;
let scrollEl = null;
let isOpen = false;
let idleTimer = null;
let visibilityBound = false;

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
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

async function loadContent() {
  if (!content) content = await import('./guideContent.es.js');
  return content;
}

// ── idle handling (guide-owned) ─────────────────────────────────────────────

function armIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => closeGuide('idle'), GUIDE_IDLE_MS);
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
  rootEl.appendChild(barEl);
  rootEl.appendChild(scrollEl);
  document.body.appendChild(rootEl);

  ['touchstart', 'pointerdown', 'click'].forEach((type) =>
    rootEl.addEventListener(type, bumpIdle, { passive: true })
  );
  rootEl.addEventListener('scroll', bumpIdle, { capture: true, passive: true });
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
  barEl.appendChild(button('Volver al inicio', 'guide-btn guide-btn--primary', () => closeGuide('home')));
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

  const invite = el('div', 'guide-invite');
  const txt = el('div');
  txt.appendChild(el('p', 'guide-invite-title', page.invite.title));
  txt.appendChild(el('p', 'guide-invite-sub', page.invite.text));
  invite.appendChild(txt);
  invite.appendChild(button(page.invite.button, 'guide-btn guide-btn--primary', shareExperience));
  article.appendChild(invite);
  return article;
}

function buildPage(page) {
  const article = el('article', 'guide-page');
  const text = el('div', 'guide-text');
  text.appendChild(el('h2', 'guide-title', page.title));
  if (page.subtitle) text.appendChild(el('p', 'guide-subtitle', page.subtitle));
  appendBlocks(text, page.blocks);
  appendLinks(text, page.links);
  appendBlocks(text, page.after);
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
  renderBar(pageId, page);
  scrollEl.textContent = '';
  scrollEl.appendChild(pageId === GUIDE_HOME ? buildMenu(page) : buildPage(page));
  scrollEl.scrollTop = 0;
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
    await loadContent();
    if (!isOpen) return;              // closed while content was loading
    renderPage(content.GUIDE_HOME);
    rootEl.hidden = false;
  } catch (err) {
    console.error(LOG, 'open failed (survey unaffected):', err);
    closeGuide('error');
  }
}

function closeGuide(reason) {
  if (!isOpen && window.__spanishGuideOpen !== true) return;
  isOpen = false;
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (rootEl) {
    rootEl.hidden = true;
    scrollEl.textContent = '';
    barEl.textContent = '';
  }
  window.__spanishGuideOpen = false;  // clear BEFORE re-arming the survey timer
  try { resetInactivityTimer(); } catch (e) { console.warn(LOG, 'timer re-arm failed', e); }
  console.log(LOG, 'closed:', reason);
}

function shareExperience() {
  closeGuide('share');
  const btn = document.getElementById('langBtnEs'); // existing Spanish survey entry
  if (btn) btn.click();
}

function bindVisibility() {
  if (visibilityBound) return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isOpen) closeGuide('hidden');
  });
}

// ── init ────────────────────────────────────────────────────────────────────

function setup() {
  if (!GUIDE_ENABLED || !isTempleKiosk()) return;
  if (!ensureEntry()) return;
  bindVisibility();
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
