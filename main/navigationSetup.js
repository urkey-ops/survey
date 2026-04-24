// FILE: main/navigationSetup.js
// PURPOSE: Setup navigation buttons and activity tracking
// DEPENDENCIES: ui/navigation/core.js, ui/navigation/startScreen.js,
//               window.uiHandlers (inactivity only), window.globals
// VERSION: 3.1.0
// CHANGES FROM 3.0.0:
//   - FIX: First-launch flash — initializeSurveyState() now checks whether
//     #device-setup-overlay is still visible before calling showStartScreen().
//     On first launch the overlay is rendered and visible in the HTML; calling
//     showStartScreen() before the user picks a mode caused a start-screen
//     flash behind the overlay. Guard added as a single early-return at the
//     top of initializeSurveyState().
//   - ADD: isSetupOverlayActive() helper — DOM-only visibility check on
//     #device-setup-overlay, no imports required, safe to call at any point
//     in the init sequence.
//   - ADD: window._initializeSurveyState = initializeSurveyState — exposes
//     initializeSurveyState on window so device-config.js (non-module IIFE,
//     cannot ES-import) can call it directly after the user picks a mode on
//     first launch, without going through window.uiHandlers.
//   - All other logic, BUG #21 fix, and module structure preserved exactly.

import { goNext, goPrev, showQuestion } from '../ui/navigation/core.js';
import { showStartScreen }              from '../ui/navigation/startScreen.js';

let navigationBound    = false;
let boundNextHandler   = null;
let boundPrevHandler   = null;

// ── Setup overlay guard ───────────────────────────────────────────────────────
//
// Returns true if #device-setup-overlay exists in the DOM AND is currently
// visible — i.e. display is not 'none', no .hidden class, visibility not
// hidden. Uses getComputedStyle so it catches both inline and class-based
// hiding. Called at the top of initializeSurveyState() to prevent
// showStartScreen() firing before the user has selected a device mode.

function isSetupOverlayActive() {
  const overlay = document.getElementById('device-setup-overlay');
  if (!overlay) return false;

  const style = window.getComputedStyle(overlay);
  return style.display      !== 'none'
    && style.visibility     !== 'hidden'
    && !overlay.classList.contains('hidden');
}

// ── Navigation listeners ──────────────────────────────────────────────────────

/**
 * Remove existing navigation listeners if present.
 */
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

/**
 * Setup navigation button event listeners.
 */
export function setupNavigation() {
  const nextBtn = window.globals?.nextBtn;
  const prevBtn = window.globals?.prevBtn;

  if (!nextBtn || !prevBtn) {
    console.error('[NAVIGATION] Navigation buttons not found');
    return false;
  }

  // goNext and goPrev are imported directly — always available
  cleanupNavigationListeners();

  boundNextHandler = (event) => goNext(event);
  boundPrevHandler = (event) => goPrev(event);

  nextBtn.addEventListener('click', boundNextHandler);
  prevBtn.addEventListener('click', boundPrevHandler);

  navigationBound = true;

  console.log('[NAVIGATION] ✅ Navigation buttons configured');
  return true;
}

/**
 * Setup inactivity tracking listeners.
 * addInactivityListeners is correctly on window.uiHandlers — keep as-is.
 */
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
 * BUG #21 FIX preserved:
 * Resume path explicitly calls addInactivityListeners() after
 * resetInactivityTimer() so listeners are never lost on resume.
 *
 * FIRST-LAUNCH GUARD (v3.1.0):
 * If #device-setup-overlay is still visible, the user has not yet chosen a
 * device mode. Return early — the overlay confirm handler in device-config.js
 * calls window._initializeSurveyState() after the user selects a mode and
 * the overlay is hidden.
 */
export function initializeSurveyState() {
  // ── First-launch guard ────────────────────────────────────────────────────
  if (isSetupOverlayActive()) {
    console.log('[NAVIGATION] ⏸ Device setup overlay active — deferring survey state init');
    return false;
  }

  const appState         = window.appState;
  const kioskStartScreen = window.globals?.kioskStartScreen;
  const kioskVideo       = window.globals?.kioskVideo;

  // Inactivity helpers still come from window.uiHandlers (correct location)
  const { resetInactivityTimer, addInactivityListeners } = window.uiHandlers || {};

  if (!appState) {
    console.error('[NAVIGATION] appState not available');
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

    // showQuestion imported directly — always available
    showQuestion(appState.currentQuestionIndex);

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

  // showStartScreen imported directly — always available
  showStartScreen();
  return true;
}

/**
 * Cleanup helper for re-init / teardown scenarios.
 */
export function cleanupNavigationSetup() {
  cleanupNavigationListeners();
  console.log('[NAVIGATION] Navigation listener cleanup complete');
}

// ── Global bridge for non-module callers ──────────────────────────────────────
//
// device-config.js is a plain IIFE (not an ES module) and cannot import
// initializeSurveyState directly. Exposing it on window lets the overlay
// confirm handler call window._initializeSurveyState() after the user picks
// a mode on first launch, without routing through window.uiHandlers.
//
// Underscore prefix signals internal use — not part of the public API.

window._initializeSurveyState = initializeSurveyState;

export default {
  setupNavigation,
  setupActivityTracking,
  initializeSurveyState,
  cleanupNavigationSetup,
};
