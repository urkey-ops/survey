// FILE: timers/timerManager.js
// EXTRACTED FROM: kioskUI.js (Lines 45-135)
// PURPOSE: Centralized timer management for all application timers
// DEPENDENCIES: window.appState, typewriterEffect.js, startScreen.js

/**
 * Timer Manager
 * Central hub for managing all application timers
 * Prevents timer leaks and ensures proper cleanup
 */
export const timerManager = {
    
    /**
     * Get reference to appState
     * @returns {Object} Application state object
     */
    getAppState() {
        return window.appState;
    },

    /**
     * Clear all timers in the application
     * Called during reset, navigation, and cleanup
     */
    clearAll() {
        const appState = this.getAppState();

        // Clear inactivity timer
        this.clearInactivity();

        // Clear sync timer
        this.clearSync();

        // Clear countdown interval
        this.clearCountdown();

        // Clear rotation interval (for rotating questions)
        this.clearRotation();

        // Clear INFINITE SHAKE interval (NEW)
        this.clearShake();

        // Clear typewriter timers (if module is loaded)
        this.clearTypewriter();
    },

    /**
     * Clear inactivity timer
     * Stops the auto-reset timer
     */
    clearInactivity() {
        const appState = this.getAppState();
        
        if (appState.inactivityTimer) {
            clearTimeout(appState.inactivityTimer);
            appState.inactivityTimer = null;
        }
    },

    /**
     * Clear sync timer
     * Stops periodic data synchronization
     */
    clearSync() {
        const appState = this.getAppState();
        
        if (appState.syncTimer) {
            clearInterval(appState.syncTimer);
            appState.syncTimer = null;
        }
    },

    /**
     * Clear countdown interval
     * Stops the completion screen countdown
     */
    clearCountdown() {
        const appState = this.getAppState();
        
        if (appState.countdownInterval) {
            clearInterval(appState.countdownInterval);
            appState.countdownInterval = null;
        }
    },

    /**
     * Clear rotation interval
     * Stops rotating question text animation
     */
    clearRotation() {
        const appState = this.getAppState();
        
        if (appState.rotationInterval) {
            clearInterval(appState.rotationInterval);
            appState.rotationInterval = null;
        }
    },

    /**
     * Clear INFINITE SHAKE interval (NEW - startScreen.js)
     * Stops the continuous attention-grabbing shake animation
     */
    clearShake() {
        if (window.shakeInterval) {
            clearInterval(window.shakeInterval);
            window.shakeInterval = null;
            window.isShaking = false;
            console.log('[TIMER MANAGER] Infinite shake cleared');
        }
        
        // Also stop shake via startScreen module if available
        if (window.stopShake) {
            window.stopShake();
        }
    },

    /**
     * Clear typewriter timers
     * Delegates to typewriterManager if available
     */
    clearTypewriter() {
        // Check if typewriter module is loaded
        if (window.typewriterManager) {
            window.typewriterManager.clearTimers();
        } 
        // Fallback to clearing typewriter rotation timer
        else if (this.getAppState().rotationInterval) {
            this.clearRotation();
        }
        
        // Backward compatibility: clear old global timer
        if (window.typewriterTimer) {
            clearTimeout(window.typewriterTimer);
            window.typewriterTimer = null;
        }
    },

    /**
     * Clear intervals (rotation + typewriter rotation + SHAKE)
     * Used when navigating between questions
     */
    clearIntervals() {
        this.clearRotation();
        this.clearShake(); // NEW
        
        // Clear typewriter rotation timer specifically
        if (window.typewriterManager) {
            window.typewriterManager.clearRotationTimer();
        }
    },

    /**
     * Set inactivity timer
     * @param {Function} callback - Function to call on timeout
     * @param {number} delay - Delay in milliseconds
     * @returns {number} Timer ID
     */
    setInactivity(callback, delay) {
        const appState = this.getAppState();
        
        // Clear existing timer first
        this.clearInactivity();
        
        // Set new timer
        appState.inactivityTimer = setTimeout(callback, delay);
        return appState.inactivityTimer;
    },

    /**
     * Set sync timer
     * @param {Function} callback - Function to call on interval
     * @param {number} interval - Interval in milliseconds
     * @returns {number} Timer ID
     */
    setSync(callback, interval) {
        const appState = this.getAppState();
        
        // Clear existing timer first
        this.clearSync();
        
        // Set new timer
        appState.syncTimer = setInterval(callback, interval);
        return appState.syncTimer;
    },

    /**
     * Set countdown interval
     * @param {Function} callback - Function to call on interval
     * @param {number} interval - Interval in milliseconds (default 1000ms)
     * @returns {number} Timer ID
     */
    setCountdown(callback, interval = 1000) {
        const appState = this.getAppState();
        
        // Clear existing timer first
        this.clearCountdown();
        
        // Set new timer
        appState.countdownInterval = setInterval(callback, interval);
        return appState.countdownInterval;
    },

    /**
     * Set rotation interval
     * @param {Function} callback - Function to call on interval
     * @param {number} interval - Interval in milliseconds
     * @returns {number} Timer ID
     */
    setRotation(callback, interval) {
        const appState = this.getAppState();
        
        // Clear existing timer first
        this.clearRotation();
        
        // Set new timer
        appState.rotationInterval = setInterval(callback, interval);
        return appState.rotationInterval;
    },

    /**
     * Get status of all timers
     * Useful for debugging
     * @returns {Object} Status of all timers
     */
    getStatus() {
        const appState = this.getAppState();
        
        return {
            inactivity: appState.inactivityTimer !== null,
            sync: appState.syncTimer !== null,
            countdown: appState.countdownInterval !== null,
            rotation: appState.rotationInterval !== null,
            shake: window.shakeInterval !== null || window.isShaking === true, // NEW
            typewriter: window.typewriterTimer !== null || 
                       (window.typewriterManager && 
                        (window.typewriterManager.timers.initial !== null ||
                         window.typewriterManager.timers.rotation !== null))
        };
    },

    /**
     * Check if any timers are active
     * @returns {boolean} True if any timer is running
     */
    hasActiveTimers() {
        const status = this.getStatus();
        return Object.values(status).some(active => active);
    },

    /**
     * Emergency stop - clear all timers immediately
     * Use this in error handlers or emergency situations
     */
    emergencyStop() {
        console.warn('[TIMER MANAGER] Emergency stop - clearing all timers');
        
        const appState = this.getAppState();
        
        // Clear all known timers aggressively
        if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
        if (appState.syncTimer) clearInterval(appState.syncTimer);
        if (appState.countdownInterval) clearInterval(appState.countdownInterval);
        if (appState.rotationInterval) clearInterval(appState.rotationInterval);
        if (window.typewriterTimer) clearTimeout(window.typewriterTimer);
        if (window.shakeInterval) clearInterval(window.shakeInterval); // NEW
        
        // Clear typewriter manager timers
        if (window.typewriterManager) {
            window.typewriterManager.clearTimers();
        }
        
        // Reset all references
        appState.inactivityTimer = null;
        appState.syncTimer = null;
        appState.countdownInterval = null;
        appState.rotationInterval = null;
        window.typewriterTimer = null;
        window.shakeInterval = null;
        window.isShaking = false;
        
        console.log('[TIMER MANAGER] Emergency stop complete');
    }
};

// Export individual functions for convenience
export const clearAllTimers = () => timerManager.clearAll();
export const clearInactivityTimer = () => timerManager.clearInactivity();
export const clearSyncTimer = () => timerManager.clearSync();
export const clearCountdownTimer = () => timerManager.clearCountdown();
export const clearRotationTimer = () => timerManager.clearRotation();
export const clearShakeTimer = () => timerManager.clearShake(); // NEW
export const clearTypewriterTimers = () => timerManager.clearTypewriter();
export const clearIntervals = () => timerManager.clearIntervals();

export const setInactivityTimer = (callback, delay) => timerManager.setInactivity(callback, delay);
export const setSyncTimer = (callback, interval) => timerManager.setSync(callback, interval);
export const setCountdownTimer = (callback, interval) => timerManager.setCountdown(callback, interval);
export const setRotationTimer = (callback, interval) => timerManager.setRotation(callback, interval);

export const getTimerStatus = () => timerManager.getStatus();
export const hasActiveTimers = () => timerManager.hasActiveTimers();
export const emergencyStopAllTimers = () => timerManager.emergencyStop();

// Default export
export default timerManager;
