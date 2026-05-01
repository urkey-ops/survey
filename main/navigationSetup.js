// FILE: main/navigationSetup.js
// PURPOSE: Setup navigation buttons and activity tracking
// DEPENDENCIES: ui/navigation/core.js, ui/navigation/startScreen.js,
//               timers/inactivityHandler.js (direct import — no window.uiHandlers race)
// VERSION: 3.2.4
// CHANGES FROM 3.2.3:
//   - FIX V1: Added a deviceConfigReady listener at the bottom of the module.
//     device-config.js dispatches deviceConfigReady synchronously during HTML
//     parsing, before this ES module may have executed and assigned
//     window._initializeSurveyState. If initialize() fails to call
//     initializeSurveyState() on first launch, this fallback listener catches the
//     event after the module loads and calls initializeSurveyState() as long as
//     window.__surveyStateInitialized is still false.
//   - FIX L1: cleanupNavigationSetup() now resets window.__surveyStateInitialized
//     to false so partial teardown / hot-reload / test harness flows can
//     re-initialize the survey state cleanly.
//
// CHANGES FROM 3.2.2 (preserved):
//   - FIX (v3.2.2): fresh-start path now calls resetInactivityTimer() +
//     addInactivityListeners() so the timer restarts after every kiosk reset.
//   - FIX B7-01: stepCounter uses getQuestions().length not appState.totalQuestions.

import { goNext, goPrev, showQuestion, getQuestions } from '../ui/navigation/core.js';
import { showStartScreen }                            from '../ui/navigation/startScreen.js';
import {
  resetInactivityTimer,
  addInactivityListeners,
} from '../timers/inactivityHandler.js';

let navigationBound  = false;
let boundNextHandler = null;
let boundPrevHandler = null;

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
  // FIX v3.2.3: Direct import — no window.uiHandlers race.
  // addInactivityListeners is resolved at module parse time from
  // inactivityHandler.js. It is always a function by the time this
  // module executes, regardless of when uiHandlers.js runs.
  addInactivityListeners();
  console.log('[NAVIGATION] ✅ Inactivity listeners attached');
  return true;
}

/**
 * Initialize survey state — resume in-progress or start fresh.
 *
 * IDEMPOTENCY GUARD: window.__surveyStateInitialized blocks re-entry.
 * Reset to false before calling again (performKioskReset and _doReset do this).
 *
 * FIRST-LAUNCH OVERLAY GUARD: returns early if #device-setup-overlay visible.
 *
 * INACTIVITY TIMER: Both paths call resetInactivityTimer() +
 * addInactivityListeners() via direct imports (no window.uiHandlers race).
 * On first boot this is safe — addInactivityListeners() removes any existing
 * listeners before re-adding, resetInactivityTimer() clears before restarting.
 * After any reset it is essential — performKioskReset() clears all timers and
 * listeners, so without these calls the kiosk sits on the start screen with no
 * active timer and can never detect the next abandonment.
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
      const total = getQuestions().length;
      const index = appState.currentQuestionIndex;
      const phases = { 0: 'Quick start!', 2: 'Nice progress!', 4: 'Halfway!', 6: 'Almost done!' };
      const phase = phases[Math.floor(index / 2)] || 'Great job!';
      stepCounter.textContent = `${phase} (${index + 1}/${total})`;
    }

    // FIX v3.2.3: Direct imports — guaranteed available, no window.uiHandlers race
    resetInactivityTimer();
    addInactivityListeners();
    console.log('[NAVIGATION] ✅ Inactivity timer started and listeners armed on resume');

    return true;
  }

  // ── Fresh start path ───────────────────────────────────────────────────────
  console.log('[NAVIGATION] 🆕 Starting fresh survey');
  showStartScreen();

  // FIX B7-01: Use getQuestions().length — appState.totalQuestions does not exist
  const stepCounter = document.getElementById('stepCounter');
  if (stepCounter) {
    const total = getQuestions().length;
    stepCounter.textContent = `Quick start! (1/${total})`;
  }

  // FIX v3.2.2 + v3.2.3: Restart timer on fresh-start using direct imports.
  // On first boot, setupActivityTracking() has already started the timer.
  // After any reset, performKioskReset() cleans everything up — these calls
  // are what restart the timer so the next abandonment can be detected.
  resetInactivityTimer();
  addInactivityListeners();
  console.log('[NAVIGATION] ✅ Inactivity timer started and listeners armed on fresh-start');

  return true;
}

export function cleanupNavigationSetup() {
  cleanupNavigationListeners();
  window.__surveyStateInitialized = false;
  console.log('[NAVIGATION] Navigation listener cleanup complete');
}

// ── Global bridge for non-module callers ──────────────────────────────────────
// device-config.js is a plain IIFE — cannot ES-import. Exposed on window.
window._initializeSurveyState = initializeSurveyState;

// FIX V1: device-config.js dispatches deviceConfigReady synchronously before
// this ES module may have executed. This fallback listener catches the event
// after the module loads and initializes survey state if the flag was never set.
window.addEventListener('deviceConfigReady', () => {
  if (!window.__surveyStateInitialized) {
    console.log('[NAVIGATION] deviceConfigReady fallback — calling initializeSurveyState()');
    initializeSurveyState();
  }
}, { once: true });

export default {
  setupNavigation,
  setupActivityTracking,
  initializeSurveyState,
  cleanupNavigationSetup,
};
