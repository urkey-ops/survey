// FILE: main/navigationSetup.js
// PURPOSE: Setup navigation buttons and activity tracking
// DEPENDENCIES: window.uiHandlers, window.globals
// VERSION: 2.1.0
// FIXES:
//   - idempotent navigation button setup
//   - safer resume path guards
//   - avoids duplicate listeners on re-init
//   - preserves BUG #21 inactivity listener fix

let navigationBound = false;
let boundNextHandler = null;
let boundPrevHandler = null;

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
  navigationBound = false;
}

/**
 * Setup navigation button event listeners.
 */
export function setupNavigation() {
  const nextBtn = window.globals?.nextBtn;
  const prevBtn = window.globals?.prevBtn;
  const { goNext, goPrev } = window.uiHandlers || {};

  if (!nextBtn || !prevBtn) {
    console.error('[NAVIGATION] Navigation buttons not found');
    return false;
  }

  if (typeof goNext !== 'function' || typeof goPrev !== 'function') {
    console.error('[NAVIGATION] goNext/goPrev handlers not available');
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

/**
 * Setup inactivity tracking listeners.
 * Called for fresh survey starts.
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
 * Resume path explicitly calls addInactivityListeners() after resetInactivityTimer().
 */
export function initializeSurveyState() {
  const appState = window.appState;
  const kioskStartScreen = window.globals?.kioskStartScreen;
  const kioskVideo = window.globals?.kioskVideo;

  const {
    showQuestion,
    showStartScreen,
    resetInactivityTimer,
    addInactivityListeners
  } = window.uiHandlers || {};

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

    if (typeof showQuestion !== 'function') {
      console.error('[NAVIGATION] showQuestion handler not available');
      return false;
    }

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

  if (typeof showStartScreen !== 'function') {
    console.error('[NAVIGATION] showStartScreen handler not available');
    return false;
  }

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
