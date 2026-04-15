// FILE: main/navigationSetup.js
// PURPOSE: Setup navigation buttons and activity tracking
// DEPENDENCIES: window.uiHandlers, window.globals
// VERSION: 2.0.0 - BUG #21 FIX: Resume path now arms inactivity listeners

/**
 * Setup navigation button event listeners.
 */
export function setupNavigation() {
  const nextBtn = window.globals?.nextBtn;
  const prevBtn = window.globals?.prevBtn;
  const { goNext, goPrev } = window.uiHandlers;

  if (!nextBtn || !prevBtn) {
    console.error('[NAVIGATION] Navigation buttons not found');
    return false;
  }

  nextBtn.addEventListener('click', goNext);
  prevBtn.addEventListener('click', goPrev);

  console.log('[NAVIGATION] ✅ Navigation buttons configured');
  return true;
}

/**
 * Setup inactivity tracking listeners.
 * Called for fresh survey starts.
 */
export function setupActivityTracking() {
  const { addInactivityListeners } = window.uiHandlers;

  if (!addInactivityListeners) {
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
 * BUG #21 FIX: Resume path now explicitly calls addInactivityListeners()
 * after resetInactivityTimer(). Without this, a crash-recovered session
 * has the inactivity timer set but NO event listeners firing it — so the
 * kiosk would never auto-reset on user inactivity.
 *
 * addInactivityListeners() is idempotent (calls removeInactivityListeners
 * first), so calling it here is always safe.
 */
export function initializeSurveyState() {
  const appState        = window.appState;
  const kioskStartScreen = window.globals?.kioskStartScreen;
  const kioskVideo      = window.globals?.kioskVideo;
  const { showQuestion, showStartScreen, resetInactivityTimer, addInactivityListeners } = window.uiHandlers;

  if (appState.currentQuestionIndex > 0) {
    console.log(`[NAVIGATION] 🔄 Resuming survey at question ${appState.currentQuestionIndex + 1}`);

    if (kioskStartScreen) kioskStartScreen.classList.add('hidden');
    if (kioskVideo) kioskVideo.pause();

    showQuestion(appState.currentQuestionIndex);
    resetInactivityTimer();

    // BUG #21 FIX: Arm event listeners on resume path
    if (addInactivityListeners) {
      addInactivityListeners();
      console.log('[NAVIGATION] ✅ Inactivity listeners armed on resume');
    }
  } else {
    console.log('[NAVIGATION] 🆕 Starting fresh survey');
    showStartScreen();
  }
}

export default {
  setupNavigation,
  setupActivityTracking,
  initializeSurveyState,
};
