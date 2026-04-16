// FILE: timers/timerManager.js
// EXTRACTED FROM: kioskUI.js (Lines 45-135)
// PURPOSE: Centralized timer management for all application timers
// DEPENDENCIES: window.appState, typewriterEffect.js, startScreen.js
// VERSION: 2.1.0 - safer null guards + consolidated emergency cleanup

/**
 * Timer Manager
 * Central hub for managing all application timers
 * Prevents timer leaks and ensures proper cleanup
 */
export const timerManager = {
  /**
   * Get reference to appState safely
   * @returns {Object} Application state object
   */
  getAppState() {
    if (!window.appState) {
      window.appState = {
        inactivityTimer: null,
        syncTimer: null,
        countdownInterval: null,
        rotationInterval: null,
      };
    }

    return window.appState;
  },

  /**
   * Clear all timers in the application
   * Called during reset, navigation, and cleanup
   */
  clearAll() {
    this.clearInactivity();
    this.clearSync();
    this.clearCountdown();
    this.clearRotation();
    this.clearShake();
    this.clearTypewriter();
  },

  /**
   * Clear inactivity timer
   * Stops the auto-reset timer
   */
  clearInactivity() {
    const appState = this.getAppState();

    if (appState.inactivityTimer != null) {
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

    if (appState.syncTimer != null) {
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

    if (appState.countdownInterval != null) {
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

    if (appState.rotationInterval != null) {
      clearInterval(appState.rotationInterval);
      appState.rotationInterval = null;
    }
  },

  /**
   * Clear INFINITE SHAKE interval
   * Stops the continuous attention-grabbing shake animation
   */
  clearShake() {
    if (window.shakeInterval != null) {
      clearInterval(window.shakeInterval);
      window.shakeInterval = null;
      console.log('[TIMER MANAGER] Infinite shake cleared');
    }

    window.isShaking = false;

    if (typeof window.stopShake === 'function') {
      try {
        window.stopShake();
      } catch (e) {
        console.warn('[TIMER MANAGER] stopShake failed:', e.message);
      }
    }
  },

  /**
   * Clear typewriter timers
   * Delegates to typewriterManager if available
   */
  clearTypewriter() {
    if (window.typewriterManager && typeof window.typewriterManager.clearTimers === 'function') {
      try {
        window.typewriterManager.clearTimers();
      } catch (e) {
        console.warn('[TIMER MANAGER] typewriterManager.clearTimers failed:', e.message);
      }
    } else {
      this.clearRotation();
    }

    if (window.typewriterTimer != null) {
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
    this.clearShake();
    this.clearTypewriter();

    if (window.typewriterManager && typeof window.typewriterManager.clearRotationTimer === 'function') {
      try {
        window.typewriterManager.clearRotationTimer();
      } catch (e) {
        console.warn('[TIMER MANAGER] clearRotationTimer failed:', e.message);
      }
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
    this.clearInactivity();
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
    this.clearSync();
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
    this.clearCountdown();
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
    this.clearRotation();
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
    const typewriterTimers = window.typewriterManager?.timers;

    return {
      inactivity: appState.inactivityTimer != null,
      sync: appState.syncTimer != null,
      countdown: appState.countdownInterval != null,
      rotation: appState.rotationInterval != null,
      shake: window.shakeInterval != null || window.isShaking === true,
      typewriter:
        window.typewriterTimer != null ||
        !!(typewriterTimers && (
          typewriterTimers.initial != null ||
          typewriterTimers.rotation != null
        )),
    };
  },

  /**
   * Check if any timers are active
   * @returns {boolean} True if any timer is running
   */
  hasActiveTimers() {
    const status = this.getStatus();
    return Object.values(status).some(Boolean);
  },

  /**
   * Emergency stop - clear all timers immediately
   * Use this in error handlers or emergency situations
   */
  emergencyStop() {
    console.warn('[TIMER MANAGER] Emergency stop - clearing all timers');

    try {
      this.clearAll();
    } catch (e) {
      console.warn('[TIMER MANAGER] clearAll failed during emergency stop:', e.message);
    }

    const appState = this.getAppState();
    appState.inactivityTimer = null;
    appState.syncTimer = null;
    appState.countdownInterval = null;
    appState.rotationInterval = null;

    window.typewriterTimer = null;
    window.shakeInterval = null;
    window.isShaking = false;

    console.log('[TIMER MANAGER] ✅ Emergency stop complete - all timers cleared');
  }
};

// Export individual functions for convenience
export const clearAllTimers = () => timerManager.clearAll();
export const clearInactivityTimer = () => timerManager.clearInactivity();
export const clearSyncTimer = () => timerManager.clearSync();
export const clearCountdownTimer = () => timerManager.clearCountdown();
export const clearRotationTimer = () => timerManager.clearRotation();
export const clearShakeTimer = () => timerManager.clearShake();
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
