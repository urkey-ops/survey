// FILE: ui/navigation/index.js
// PURPOSE: Main entry point that combines all navigation modules
// DEPENDENCIES: All navigation sub-modules

import {
  showQuestion,
  goNext,
  goPrev,
  updateProgressBar,
  getCurrentQuestion,
  getTotalQuestions,
  isFirstQuestion,
  isLastQuestion,
  jumpToQuestion,
  cleanupIntervals,
  cleanupInputFocusScroll,
  saveState,
  updateData,
  startQuestionTimer,
  stopQuestionTimer,
  setupInputFocusScroll
} from './core.js';

import { handleSubmit } from './submit.js';  // async function handleSubmit(...)

import {
  showStartScreen,
  cleanupStartScreenListeners
} from './startScreen.js';

// Build complete navigation module
const navigationModule = {
  // Core navigation
  showQuestion,
  goNext,
  goPrev,
  updateProgressBar,
  getCurrentQuestion,
  getTotalQuestions,
  isFirstQuestion,
  isLastQuestion,
  jumpToQuestion,

  // Start screen
  showStartScreen,
  cleanupStartScreenListeners,

  // Cleanup functions
  cleanupInputFocusScroll,
  cleanupIntervals,

  // Internal helpers
  _internal: {
    saveState,
    updateData,
    startQuestionTimer,
    stopQuestionTimer,
    setupInputFocusScroll,
    cleanupIntervals,
    cleanupInputFocusScroll
  }
};

// Expose to window for backward compatibility
window.navigationHandler = navigationModule;

//
// ─── ALWAYS PASS SURVEYTYPE FROM KIOSK_CONFIG --
// ────────────────────────────────────────────────────────────────────────
// This is the ONLY place that calls `handleSubmit` with explicit `surveyType`.
window.navigationHandler.submitSurvey = function () {
  const deps = window.getDependencies ? window.getDependencies() : {};

  const surveyType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';

  handleSubmit({ ...deps, surveyType });
};

// ✅ Only ONE export of `submitSurvey`:
export const submitSurvey = handleSubmit;

// Export all other functions
export {
  showQuestion,
  goNext,
  goPrev,
  showStartScreen,
  updateProgressBar,
  getCurrentQuestion,
  getTotalQuestions,
  isFirstQuestion,
  isLastQuestion,
  jumpToQuestion,
  cleanupStartScreenListeners,
  cleanupInputFocusScroll,
  cleanupIntervals
};

export default navigationModule;
