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

import { handleSubmit } from './submit.js';  // <- this is async function handleSubmit(...)

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
// ─── PERMANENT, FACT-BASED FIX: EXPLICIT SURVEYTYPE HANDLING
// ────────────────────────────────────────────────────────────────────────

// Bridge `goNext` → `handleSubmit` with explicit `surveyType`
window.navigationHandler.submitSurvey = function () {
  const deps = window.getDependencies ? window.getDependencies() : {};

  // ALWAYS resolve via KIOSK_CONFIG, not via deps.surveyType
  const surveyType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';

  // ✅ Call `handleSubmit` with explicit `surveyType` field
  // Logs in `submit.js` will no longer see "undefined"
  handleSubmit({ ...deps, surveyType });
};

// Convenience export for modules that import `submitSurvey`
export const submitSurvey = window.navigationHandler.submitSurvey;

// Export all functions
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
  handleSubmit as submitSurvey,
  cleanupStartScreenListeners,
  cleanupInputFocusScroll,
  cleanupIntervals
};

export default navigationModule;
