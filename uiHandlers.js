// FILE: uiHandlers.js
// PURPOSE: Bridge file to collect all modular exports and assign to window.uiHandlers
// This maintains backward compatibility with main.js

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
    clearTypewriterTimers,
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
    clearTypewriterTimers as clearTypewriterTimersExport,
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

// Assign typewriterManager to window for timerManager compatibility
window.typewriterManager = typewriterManager;

// Assign timerManager to window for inactivityHandler compatibility
window.timerManager = timerManager;

// Assign validation functions to window for navigation.js compatibility
window.validateQuestion = validateQuestion;
window.clearErrors = clearErrors;

// Now load navigation.js which will add its functions to window.uiHandlers
// We'll import it to ensure it runs after these assignments
import './ui/navigation.js';

// After navigation.js loads, combine everything into window.uiHandlers
// Navigation.js already adds its functions, so we just add the rest
window.uiHandlers = {
    // Existing functions from navigation.js (already added by that file)
    ...window.uiHandlers,
    
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
    clearTypewriterTimers,
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
    validationUtils
};

console.log('[UI HANDLERS] ✅ All modules loaded and assigned to window.uiHandlers');
