// FILE: main/navigationSetup.js
// PURPOSE: Setup navigation buttons and activity tracking
// DEPENDENCIES: ui/navigation/core.js, ui/navigation/startScreen.js,
//               window.uiHandlers (inactivity only), window.globals
// VERSION: 3.0.0
// CHANGES FROM 2.1.0:
//   - CONVERT to ES module (type="module" already set in index.html)
//   - REPLACE window.uiHandlers lookups for goNext/goPrev/showQuestion/
//     showStartScreen with direct ES module imports from core.js and
//     startScreen.js — these functions were never on window.uiHandlers,
//     causing "handler not available" on every boot
//   - KEEP window.uiHandlers for inactivity-only functions
//     (addInactivityListeners, resetInactivityTimer) which are correctly
//     registered there by uiHandlers.js
//   - All other logic, guards, and BUG #21 fix preserved exactly

import { goNext, goPrev, showQuestion } from '../ui/navigation/core.js';
import { showStartScreen }              from '../ui/navigation/startScreen.js';

let navigationBound    = false;
let boundNextHandler   = null;
let boundPrevHandler   = null;

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

  // goNext and goPrev are now imported directly — always available
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
 */
export function initializeSurveyState() {
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
