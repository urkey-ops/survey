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
//     flash behind the overlay. Guard added as a single early-return.
//   - ADD: isSetupOverlayActive() helper — checks #device-setup-overlay
//     visibility without importing device-config.js (DOM-only check, safe
//     to call at any point in the init sequence)
//   - All other logic, BUG #21 fix, and module structure preserved exactly

import { goNext, goPrev, showQuestion } from '../ui/navigation/core.js';
import { showStartScreen }              from '../ui/navigation/startScreen.js';

let navigationBound    = false;
let boundNextHandler   = null;
let boundPrevHandler   = null;

// ── Setup overlay guard ───────────────────────────────────────────────────────
//
// Returns true if #device-setup-overlay exists in the DOM AND is currently
// visible (i.e. display is not 'none' and the element has no .hidden class).
// Used to prevent showStartScreen() firing before the user has selected a
// device mode on first launch.

function isSetupOverlayActive() {
  const overlay = document.getElementById('device-setup-overlay');
  if (!overlay) return false;

  const style = window.getComputedStyle(overlay);
  return style.display !== 'none'
    && !overlay.classList.contains('hidden')
    && overlay.style.visibility !== 'hidden';
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
 * device mode. Skip showStartScreen() entirely — the overlay confirm handler
 * is responsible for calling window.uiHandlers.showStartScreen() once the
 * user selects Shayona / Temple and the overlay is hidden.
 */
export function initializeSurveyState() {
  // ── First-launch guard ────────────────────────────────────────────────────
  // Must be checked before appState access — overlay may be visible even
  // before appState is fully hydrated on a fresh install.
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

export default {
  setupNavigation,
  setupActivityTracking,
  initializeSurveyState,
  cleanupNavigationSetup,
};
