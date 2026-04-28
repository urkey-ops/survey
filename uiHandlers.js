// FILE: uiHandlers.js
// PURPOSE: Bridge file to collect all modular exports and assign to window.uiHandlers
// VERSION: 2.1.0
// CHANGES FROM 2.0.0:
//   - REMOVE: import from './ui/typewriterEffect.js' — file removed in Phase 2,
//     404 was aborting the entire ES module and preventing window.uiHandlers
//     from ever being assigned. All downstream handlers (submitSurvey,
//     addInactivityListeners, performKioskReset, goNext, goPrev) were
//     silently undefined as a result.
//   - REMOVE: typewriterManager, addTypewriterEffect, rotateQuestionText,
//     clearTypewriterTimers from window.uiHandlers (no replacement needed —
//     core.js already has a window.addTypewriterEffect fallback guard)
//   - KEEP: clearTimerManagerTypewriterTimers from timerManager (safe, exists)

import {
    resetInactivityTimer,
    addInactivityListeners,
    removeInactivityListeners,
    startPeriodicSync,
    performKioskReset,
    isInactivityTimerActive,
    pauseInactivityTimer,
    resumeInactivityTimer
} from './timers/inactivityHandler.js';

import {
    timerManager,
    clearAllTimers,
    clearInactivityTimer,
    clearSyncTimer,
    clearCountdownTimer,
    clearRotationTimer,
    clearTypewriterTimers as clearTimerManagerTypewriterTimers,
    clearIntervals,
    setInactivityTimer,
    setSyncTimer,
    setCountdownTimer,
    setRotationTimer,
    getTimerStatus,
    hasActiveTimers,
    emergencyStopAllTimers
} from './timers/timerManager.js';

import {
    validateQuestion,
    clearErrors,
    validateEmail,
    validateRequired,
    validateArrayNotEmpty,
    getValidationErrors,
    validateMultipleQuestions,
    validationUtils
} from './ui/validation.js';

import {
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
    cleanupIntervals as cleanupNavigationIntervals
} from './ui/navigation/index.js';

// Assign required globals for module compatibility
window.timerManager      = timerManager;
window.validateQuestion  = validateQuestion;
window.clearErrors       = clearErrors;
// window.typewriterManager intentionally not set — typewriterEffect.js removed in Phase 2

window.uiHandlers = {
    // Inactivity handlers
    resetInactivityTimer,
    addInactivityListeners,
    removeInactivityListeners,
    startPeriodicSync,
    performKioskReset,
    isInactivityTimerActive,
    pauseInactivityTimer,
    resumeInactivityTimer,

    // Timer manager
    timerManager,
    clearAllTimers,
    clearInactivityTimer,
    clearSyncTimer,
    clearCountdownTimer,
    clearRotationTimer,
    clearTypewriterTimers: clearTimerManagerTypewriterTimers,
    clearIntervals,
    setInactivityTimer,
    setSyncTimer,
    setCountdownTimer,
    setRotationTimer,
    getTimerStatus,
    hasActiveTimers,
    emergencyStopAllTimers,

    // Validation
    validateQuestion,
    clearErrors,
    validateEmail,
    validateRequired,
    validateArrayNotEmpty,
    getValidationErrors,
    validateMultipleQuestions,
    validationUtils,

    // Navigation
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
    cleanupIntervals: cleanupNavigationIntervals,

    // Helper for inactivityHandler / legacy consumers
    getTotalSurveyTime: () => {
        const appState = window.appState;
        if (!appState || !appState.surveyStartTime) return 0;
        return Math.round((Date.now() - appState.surveyStartTime) / 1000);
    }
};

console.log('[UI HANDLERS] ✅ All modules loaded and assigned to window.uiHandlers');
