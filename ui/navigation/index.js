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

import { submitSurvey } from './submit.js';

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
  
  // Submission
  submitSurvey,
  
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

// Store submitSurvey for goNext to access
window.navigationHandler.submitSurvey = submitSurvey;

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
  submitSurvey,
  cleanupStartScreenListeners,
  cleanupInputFocusScroll,
  cleanupIntervals
};

export default navigationModule;
