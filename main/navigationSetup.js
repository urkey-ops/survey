// FILE: main/navigationSetup.js
// PURPOSE: Setup navigation buttons and activity tracking
// DEPENDENCIES: ui/navigation/core.js, ui/navigation/startScreen.js,
//               window.uiHandlers (inactivity only), window.globals
// VERSION: 3.2.1
// CHANGES FROM 3.2.0:
//   - FIX B7-01: stepCounter used appState.totalQuestions which does not
//     exist on appState. Replaced with getQuestions().length as correct
//     source. Added getQuestions to import list (was missing). Both resume
//     and fresh-start stepCounter blocks corrected.

import { goNext, goPrev, showQuestion, getQuestions } from '../ui/navigation/core.js';
import { showStartScreen }                            from '../ui/navigation/startScreen.js';

let navigationBound    = false;
let boundNextHandler   = null;
let boundPrevHandler   = null;

// ── Setup overlay guard ───────────────────────────────────────────────────────

function isSetupOverlayActive() {
  const overlay = document.getElementById('device-setup-overlay');
  if (!overlay) return false;

  const style = window.getComputedStyle(overlay);
  return style.display  !== 'none'
    && style.visibility !== 'hidden'
    && !overlay.classList.contains('hidden');
}

// ── Navigation listeners ──────────────────────────────────────────────────────

function cleanupNavigationListeners() {
  const nextBtn = window.globals?.nextBtn;
  const prevBtn = window.globals?.prevBtn;

  if (nextBtn && boundNextHandler) nextBtn.removeEventListener('click', boundNextHandler);
  if (prevBtn && boundPrevHandler) prevBtn.removeEventListener('click', boundPrevHandler);

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
 * All subsequent calls return early. Reset to false before calling again
 * to intentionally re-run (e.g. after kiosk reset).
 *
 * BUG #21 FIX preserved:
 * Resume path explicitly calls addInactivityListeners() after
 * resetInactivityTimer() so listeners are never lost on resume.
 *
 * FIRST-LAUNCH OVERLAY GUARD (v3.1.0) preserved:
 * If #device-setup-overlay is still visible, return early.
 */
export function initializeSurveyState() {
  // ── Idempotency guard ─────────────────────────────────────────────────────
  if (window.__surveyStateInitialized) {
    console.log('[NAVIGATION] ⏭ Survey state already initialized — skipping duplicate call');
    return false;
  }

  // ── First-launch overlay guard ────────────────────────────────────────────
  if (isSetupOverlayActive()) {
    console.log('[NAVIGATION] ⏸ Device setup overlay active — deferring survey state init');
    return false;
  }

  // Mark before running — prevents re-entrant calls during showStartScreen()
  window.__surveyStateInitialized = true;

  const appState         = window.appState;
  const kioskStartScreen = window.globals?.kioskStartScreen;
  const kioskVideo       = window.globals?.kioskVideo;
  const { resetInactivityTimer, addInactivityListeners } = window.uiHandlers || {};

  if (!appState) {
    console.error('[NAVIGATION] appState not available');
    window.__surveyStateInitialized = false;
    return false;
  }

  if (appState.currentQuestionIndex > 0) {
    // ── Resume path ──────────────────────────────────────────────────────────
    console.log(`[NAVIGATION] 🔄 Resuming survey at question ${appState.currentQuestionIndex + 1}`);

    if (kioskStartScreen) kioskStartScreen.classList.add('hidden');
    if (kioskVideo && !kioskVideo.paused) kioskVideo.pause();

    showQuestion(appState.currentQuestionIndex);

    // FIX B7-01: Use getQuestions().length — appState.totalQuestions does not exist
    const stepCounter = document.getElementById('stepCounter');
    if (stepCounter) {
      const total = window.uiHandlers?.getTotalQuestions?.() ?? getQuestions().length;
      const index = appState.currentQuestionIndex;
      const phases = { 0: 'Quick start!', 2: 'Nice progress!', 4: 'Halfway!', 6: 'Almost done!' };
      const phase = phases[Math.floor(index / 2)] || 'Great job!';
      stepCounter.textContent = `${phase} (${index + 1}/${total})`;
    }

    if (typeof resetInactivityTimer === 'function') resetInactivityTimer();

    if (typeof addInactivityListeners === 'function') {
      addInactivityListeners();
      console.log('[NAVIGATION] ✅ Inactivity listeners armed on resume');
    }

    return true;
  }

  // ── Fresh start path ───────────────────────────────────────────────────────
  console.log('[NAVIGATION] 🆕 Starting fresh survey');
  showStartScreen();

  // FIX B7-01: Use getQuestions().length — appState.totalQuestions does not exist
  const stepCounter = document.getElementById('stepCounter');
  if (stepCounter) {
    const total = window.uiHandlers?.getTotalQuestions?.() ?? getQuestions().length;
    stepCounter.textContent = `Quick start! (1/${total})`;
  }

  return true;
}

export function cleanupNavigationSetup() {
  cleanupNavigationListeners();
  console.log('[NAVIGATION] Navigation listener cleanup complete');
}

// ── Global bridge for non-module callers ──────────────────────────────────────
// device-config.js is a plain IIFE — cannot ES-import. Exposed on window.
window._initializeSurveyState = initializeSurveyState;

export default {
  setupNavigation,
  setupActivityTracking,
  initializeSurveyState,
  cleanupNavigationSetup,
};
