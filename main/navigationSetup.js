// FILE: main/navigationSetup.js
// PURPOSE: Setup navigation buttons and activity tracking
// DEPENDENCIES: ui/navigation/core.js, ui/navigation/startScreen.js,
//               window.uiHandlers (inactivity only), window.globals
// VERSION: 3.2.0
// CHANGES FROM 3.1.0:
//   - FIX: Start screen tap freeze on first launch.
//     Root cause: initializeSurveyState() was called multiple times —
//     once by device-config.js confirm handler (correct), then again by
//     index.js Path 2 and Path 3 boot paths (duplicate). Each call re-ran
//     showStartScreen(), replacing the tap listener with a new one attached
//     to a freshly re-rendered DOM element. The previous listener was lost.
//   - FIX: Added window.__surveyStateInitialized idempotency flag.
//     Set to true on the FIRST successful call to initializeSurveyState().
//     All subsequent calls return early. Flag persists on window so
//     index.js and device-config.js can both read it without imports.
//   - All other logic, BUG #21 fix, overlay guard, and module structure
//     preserved exactly.

import { goNext, goPrev, showQuestion } from '../ui/navigation/core.js';
import { showStartScreen }              from '../ui/navigation/startScreen.js';

let navigationBound    = false;
let boundNextHandler   = null;
let boundPrevHandler   = null;

// ── Setup overlay guard ───────────────────────────────────────────────────────

function isSetupOverlayActive() {
  const overlay = document.getElementById('device-setup-overlay');
  if (!overlay) return false;

  const style = window.getComputedStyle(overlay);
  return style.display      !== 'none'
    && style.visibility     !== 'hidden'
    && !overlay.classList.contains('hidden');
}

// ── Navigation listeners ──────────────────────────────────────────────────────

function cleanupNavigationListeners() {
  const nextBtn = window.globals?.nextBtn;
  const prevBtn = window.globals?.prevBtn;

  if (nextBtn && boundNextHandler) {
    nextBtn.removeEventListener('click', boundNextHandler);
  }

  if (prevBtn && boundPrevHandler) {
    prevBtn.removeEventListener('click', boundPrevHandler);
  }

  boundNextHandler = null;
  boundPrevHandler = null;
  navigationBound  = false;
}

export function setupNavigation() {
  const nextBtn = window.globals?.nextBtn;
  const prevBtn = window.globals?.prevBtn;

  if (!nextBtn || !prevBtn) {
    console.error('[NAVIGATION] Navigation buttons not found');
    return false;
  }

  cleanupNavigationListeners();

  boundNextHandler = (event) => goNext(event);
  boundPrevHandler = (event) => goPrev(event);

  nextBtn.addEventListener('click', boundNextHandler);
  prevBtn.addEventListener('click', boundPrevHandler);

  navigationBound = true;

  console.log('[NAVIGATION] ✅ Navigation buttons configured');
  return true;
}

export function setupActivityTracking() {
  const { addInactivityListeners } = window.uiHandlers || {};

  if (typeof addInactivityListeners !== 'function') {
    console.error('[NAVIGATION] Inactivity listeners not available');
    return false;
  }

  addInactivityListeners();
  console.log('[NAVIGATION] ✅ Inactivity listeners attached');
  return true;
}

/**
 * Initialize survey state — resume in-progress or start fresh.
 *
 * IDEMPOTENCY GUARD (v3.2.0):
 * window.__surveyStateInitialized is set to true on the first successful run.
 * Any subsequent call (from index.js Path 2/3 race, admin reset re-init, etc.)
 * returns early immediately. This is the single source of truth — it lives on
 * window so device-config.js, index.js, and any other non-module caller can
 * all read it without imports.
 *
 * To intentionally re-run (e.g. after a kiosk reset), call:
 *   window.__surveyStateInitialized = false;
 *   window._initializeSurveyState();
 *
 * BUG #21 FIX preserved:
 * Resume path explicitly calls addInactivityListeners() after
 * resetInactivityTimer() so listeners are never lost on resume.
 *
 * FIRST-LAUNCH OVERLAY GUARD (v3.1.0) preserved:
 * If #device-setup-overlay is still visible, return early.
 */
export function initializeSurveyState() {
  // ── Idempotency guard (v3.2.0) ────────────────────────────────────────────
  if (window.__surveyStateInitialized) {
    console.log('[NAVIGATION] ⏭ Survey state already initialized — skipping duplicate call');
    return false;
  }

  // ── First-launch overlay guard (v3.1.0) ───────────────────────────────────
  if (isSetupOverlayActive()) {
    console.log('[NAVIGATION] ⏸ Device setup overlay active — deferring survey state init');
    return false;
  }

  // Mark initialized BEFORE running — prevents re-entrant calls during
  // showStartScreen() or any async continuation from also passing the guard.
  window.__surveyStateInitialized = true;

  const appState         = window.appState;
  const kioskStartScreen = window.globals?.kioskStartScreen;
  const kioskVideo       = window.globals?.kioskVideo;

  const { resetInactivityTimer, addInactivityListeners } = window.uiHandlers || {};

  if (!appState) {
    console.error('[NAVIGATION] appState not available');
    window.__surveyStateInitialized = false; // allow retry if appState arrives later
    return false;
  }

  if (appState.currentQuestionIndex > 0) {
    console.log(`[NAVIGATION] 🔄 Resuming survey at question ${appState.currentQuestionIndex + 1}`);

    if (kioskStartScreen) {
      kioskStartScreen.classList.add('hidden');
    }

    if (kioskVideo && !kioskVideo.paused) {
      kioskVideo.pause();
    }

    

// Resume path — after showQuestion():
showQuestion(appState.currentQuestionIndex);

const stepCounter = document.getElementById('stepCounter');
if (stepCounter) {
  const total = window.uiHandlers?.getTotalQuestions?.() 
    ?? getQuestions().length;  // ← correct source
  const index = appState.currentQuestionIndex;
  const phases = { 0: 'Quick start!', 2: 'Nice progress!', 4: 'Halfway!', 6: 'Almost done!' };
  const phase = phases[Math.floor(index / 2)] || 'Great job!';
  stepCounter.textContent = `${phase} (${index + 1}/${total})`;
}

if (typeof resetInactivityTimer === 'function') {
  resetInactivityTimer();
}



    

    if (typeof addInactivityListeners === 'function') {
      addInactivityListeners();
      console.log('[NAVIGATION] ✅ Inactivity listeners armed on resume');
    }

    return true;
  }

  console.log('[NAVIGATION] 🆕 Starting fresh survey');


// Fresh start path — after showStartScreen():
showStartScreen();

const stepCounter = document.getElementById('stepCounter');
if (stepCounter) {
  const total = window.uiHandlers?.getTotalQuestions?.() 
    ?? getQuestions().length;
  stepCounter.textContent = `Quick start! (1/${total})`;
}

  return true;
}

export function cleanupNavigationSetup() {
  cleanupNavigationListeners();
  console.log('[NAVIGATION] Navigation listener cleanup complete');
}

// ── Global bridge for non-module callers ──────────────────────────────────────
//
// device-config.js is a plain IIFE and cannot ES-import initializeSurveyState.
// Exposing on window lets the overlay confirm handler call it directly.
// Underscore prefix signals internal use.

window._initializeSurveyState = initializeSurveyState;

export default {
  setupNavigation,
  setupActivityTracking,
  initializeSurveyState,
  cleanupNavigationSetup,
};
