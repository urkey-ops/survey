// FILE: timers/inactivityHandler.js
// EXTRACTED FROM: kioskUI.js (Lines 415-580)
// PURPOSE: Handle user inactivity detection and auto-reset functionality
// DEPENDENCIES: window.CONSTANTS, window.appState, window.dataHandlers, timerManager.js

/**
 * Inactivity Handler
 * Manages user activity detection and automatic kiosk reset
 * Handles partial survey saving on timeout
 */

// Store bound event handlers for proper cleanup
let boundResetInactivityTimer = null;

/**
 * Get dependencies from global scope
 */
function getDependencies() {
    return {
        INACTIVITY_TIMEOUT_MS: window.CONSTANTS?.INACTIVITY_TIMEOUT_MS || 30000,
        SYNC_INTERVAL_MS: window.CONSTANTS?.SYNC_INTERVAL_MS || 900000,
        STORAGE_KEY_QUEUE: window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue',
        MAX_QUEUE_SIZE: window.CONSTANTS?.MAX_QUEUE_SIZE || 100,
        appState: window.appState,
        dataHandlers: window.dataHandlers,
        dataUtils: window.dataUtils,
        timerManager: window.timerManager || window.timerManager
    };
}

/**
 * Start periodic data synchronization
 * Runs in background to sync data to server
 */
export function startPeriodicSync() {
    const { SYNC_INTERVAL_MS, dataHandlers, timerManager } = getDependencies();
    
    if (timerManager && timerManager.setSync) {
        timerManager.setSync(dataHandlers.autoSync, SYNC_INTERVAL_MS);
    } else {
        window.appState.syncTimer = setInterval(dataHandlers.autoSync, SYNC_INTERVAL_MS);
    }
}

/**
 * Reset the inactivity timer
 * Called on any user interaction (mouse, keyboard, touch)
 */
export function resetInactivityTimer() {
    const {
        INACTIVITY_TIMEOUT_MS,
        STORAGE_KEY_QUEUE,
        MAX_QUEUE_SIZE,
        appState,
        dataHandlers,
        dataUtils,
        timerManager
    } = getDependencies();

    // Clear existing timers
    if (timerManager) {
        timerManager.clearInactivity();
        timerManager.clearSync();
    } else {
        if (appState.inactivityTimer) {
            clearTimeout(appState.inactivityTimer);
        }
        if (appState.syncTimer) {
            clearInterval(appState.syncTimer);
        }
    }

    // Stop auto-reset if kiosk is hidden
    if (!window.isKioskVisible) {
        console.log('[VISIBILITY] Kiosk hidden - timers not started');
        return;
    }

    // Start auto-sync
    startPeriodicSync();

    // Main inactivity timer
    const timeoutCallback = () => {
        const idx = appState.currentQuestionIndex;
        const currentQuestion = dataUtils.surveyQuestions[idx];
        
        console.log(`[INACTIVITY] Detected at question ${idx + 1} (${currentQuestion.id})`);

        // Q1 inactivity → Just reset (no data to save)
        if (idx === 0) {
            console.log('[INACTIVITY] Q1 abandonment - recording analytics before reset');
            
            // Record that user engaged with first question
            dataHandlers.recordAnalytics('survey_abandoned', {
                questionId: currentQuestion.id,
                questionIndex: idx,
                totalTimeSeconds: getTotalSurveyTime(),
                reason: 'inactivity_q1',
                partialData: {
                    satisfaction: appState.formData.satisfaction || null
                }
            });
            
            performKioskReset();
            return;
        }

        // Q2–end inactivity → SAVE + RESET
        console.log('[INACTIVITY] Mid-survey abandonment - saving partial data');

        stopQuestionTimer(currentQuestion.id);
        const totalTimeSeconds = getTotalSurveyTime();

        // Prepare partial submission
        const timestamp = new Date().toISOString();
        appState.formData.completionTimeSeconds = totalTimeSeconds;
        appState.formData.questionTimeSpent = appState.questionTimeSpent;
        appState.formData.abandonedAt = timestamp;
        appState.formData.abandonedAtQuestion = currentQuestion.id;
        appState.formData.abandonedAtQuestionIndex = idx;
        appState.formData.timestamp = timestamp;
        appState.formData.sync_status = 'unsynced (inactivity)';

        // Check queue size before adding
        const submissionQueue = dataHandlers.getSubmissionQueue();
        if (submissionQueue.length >= MAX_QUEUE_SIZE) {
            console.warn(`[QUEUE] Queue full (${MAX_QUEUE_SIZE} records) - removing oldest entry`);
            submissionQueue.shift();
        }

        submissionQueue.push(appState.formData);
        dataHandlers.safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);

        dataHandlers.recordAnalytics('survey_abandoned', {
            questionId: currentQuestion.id,
            questionIndex: idx,
            totalTimeSeconds,
            reason: 'inactivity'
        });

        performKioskReset();
    };

    // Set the inactivity timer
    if (timerManager && timerManager.setInactivity) {
        timerManager.setInactivity(timeoutCallback, INACTIVITY_TIMEOUT_MS);
    } else {
        appState.inactivityTimer = setTimeout(timeoutCallback, INACTIVITY_TIMEOUT_MS);
    }
}

/**
 * Add event listeners for user activity
 * Listens for mouse, keyboard, and touch events
 */
export function addInactivityListeners() {
    // Remove existing listeners first
    removeInactivityListeners();
    
    boundResetInactivityTimer = resetInactivityTimer.bind(null);
    
    document.addEventListener('mousemove', boundResetInactivityTimer);
    document.addEventListener('keydown', boundResetInactivityTimer);
    document.addEventListener('touchstart', boundResetInactivityTimer);
}

/**
 * Remove inactivity event listeners
 * Called during cleanup or reset
 */
export function removeInactivityListeners() {
    if (boundResetInactivityTimer) {
        document.removeEventListener('mousemove', boundResetInactivityTimer);
        document.removeEventListener('keydown', boundResetInactivityTimer);
        document.removeEventListener('touchstart', boundResetInactivityTimer);
        boundResetInactivityTimer = null;
    }
}

/**
 * Perform kiosk reset
 * Clears all data and returns to start screen
 */
function performKioskReset() {
    console.log('[RESET] Performing kiosk reset...');
    
    const { appState, dataHandlers } = getDependencies();
    const STORAGE_KEY_STATE = window.CONSTANTS?.STORAGE_KEY_STATE || 'kioskAppState';
    
    // Clean up all listeners and timers
    if (window.uiHandlers) {
        if (window.uiHandlers.cleanupStartScreenListeners) {
            window.uiHandlers.cleanupStartScreenListeners();
        }
        if (window.uiHandlers.cleanupInputFocusScroll) {
            window.uiHandlers.cleanupInputFocusScroll();
        }
        if (window.uiHandlers.cleanupIntervals) {
            window.uiHandlers.cleanupIntervals();
        }
    }
    
    // Remove state from localStorage
    localStorage.removeItem(STORAGE_KEY_STATE);

    // Reset form data with new ID
    appState.formData = { 
        id: dataHandlers.generateUUID(), 
        timestamp: new Date().toISOString()
    };
    appState.currentQuestionIndex = 0;
    
    console.log('[RESET] New session ID:', appState.formData.id);
    
    // Reset analytics tracking
    appState.surveyStartTime = null;
    appState.questionStartTimes = {};
    appState.questionTimeSpent = {};

    // Show start screen
    if (window.uiHandlers && window.uiHandlers.showStartScreen) {
        window.uiHandlers.showStartScreen();
    }
    
    // Disable navigation buttons
    const nextBtn = window.globals?.nextBtn;
    const prevBtn = window.globals?.prevBtn;
    
    if (nextBtn) nextBtn.disabled = true;
    if (prevBtn) prevBtn.disabled = true;
}

/**
 * Get total survey completion time
 * @returns {number} Time in seconds
 */
function getTotalSurveyTime() {
    const { appState } = getDependencies();
    if (!appState.surveyStartTime) return 0;
    return Math.round((Date.now() - appState.surveyStartTime) / 1000);
}

/**
 * Stop timer for a specific question
 * @param {string} questionId - ID of the question
 */
function stopQuestionTimer(questionId) {
    const { appState, dataHandlers } = getDependencies();
    
    if (appState.questionStartTimes[questionId]) {
        const timeSpent = Date.now() - appState.questionStartTimes[questionId];
        appState.questionTimeSpent[questionId] = timeSpent;
        delete appState.questionStartTimes[questionId];
        
        // Save state
        if (dataHandlers && dataHandlers.safeSetLocalStorage) {
            const STORAGE_KEY_STATE = window.CONSTANTS?.STORAGE_KEY_STATE || 'kioskAppState';
            dataHandlers.safeSetLocalStorage(STORAGE_KEY_STATE, {
                currentQuestionIndex: appState.currentQuestionIndex,
                formData: appState.formData,
                surveyStartTime: appState.surveyStartTime,
                questionStartTimes: appState.questionStartTimes,
                questionTimeSpent: appState.questionTimeSpent
            });
        }
    }
}

/**
 * Check if inactivity timer is active
 * @returns {boolean} True if timer is running
 */
export function isInactivityTimerActive() {
    const { appState } = getDependencies();
    return appState.inactivityTimer !== null;
}

/**
 * Get remaining time on inactivity timer
 * Note: This is approximate since setTimeout doesn't expose remaining time
 * @returns {number|null} Approximate remaining time in ms, or null if no timer
 */
export function getInactivityTimeRemaining() {
    // JavaScript doesn't provide direct access to setTimeout remaining time
    // This would require tracking start time separately
    console.warn('[INACTIVITY] Cannot get precise remaining time from setTimeout');
    return null;
}

/**
 * Pause inactivity timer (for special situations)
 * Use carefully - timer should normally always be active
 */
export function pauseInactivityTimer() {
    const { timerManager } = getDependencies();
    
    if (timerManager) {
        timerManager.clearInactivity();
    } else {
        const { appState } = getDependencies();
        if (appState.inactivityTimer) {
            clearTimeout(appState.inactivityTimer);
            appState.inactivityTimer = null;
        }
    }
    
    console.log('[INACTIVITY] Timer paused');
}

/**
 * Resume inactivity timer
 * Restarts the timer after pause
 */
export function resumeInactivityTimer() {
    console.log('[INACTIVITY] Timer resumed');
    resetInactivityTimer();
}

// Export the reset function for other modules
export { performKioskReset };

// Default export
export default {
    resetInactivityTimer,
    addInactivityListeners,
    removeInactivityListeners,
    startPeriodicSync,
    performKioskReset,
    isInactivityTimerActive,
    pauseInactivityTimer,
    resumeInactivityTimer
};
