// FILE: uiHandlers.js
// PURPOSE: Bridge file to collect all modular exports and assign to window.uiHandlers
// This maintains backward compatibility with older non-module access patterns

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
    typewriterManager,
    addTypewriterEffect,
    clearTypewriterTimers as clearTypewriterEffectTimers,
    rotateQuestionText
} from './ui/typewriterEffect.js';

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
window.typewriterManager = typewriterManager;
window.timerManager = timerManager;
window.validateQuestion = validateQuestion;
window.clearErrors = clearErrors;

// Unified helper so legacy callers can clear both timer-manager and typewriter-owned timers safely
function clearAllTypewriterTimers() {
    try {
        clearTimerManagerTypewriterTimers();
    } catch (error) {
        console.warn('[UI HANDLERS] Timer manager typewriter cleanup failed:', error);
    }

    try {
        clearTypewriterEffectTimers();
    } catch (error) {
        console.warn('[UI HANDLERS] Typewriter effect cleanup failed:', error);
    }
}

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
    clearTypewriterTimers: clearAllTypewriterTimers,
    clearIntervals,
    setInactivityTimer,
    setSyncTimer,
    setCountdownTimer,
    setRotationTimer,
    getTimerStatus,
    hasActiveTimers,
    emergencyStopAllTimers,

    // Typewriter effect
    typewriterManager,
    addTypewriterEffect,
    rotateQuestionText,

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
