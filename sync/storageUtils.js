// FILE: storageUtils.js
// PURPOSE: Local storage utilities with error handling
// DEPENDENCIES: window.CONSTANTS

/**
 * Generates a unique UUID for each survey submission
 * @returns {string} UUID v4 format string
 */
export function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Display error message to user (non-intrusive)
 * @param {string} message - Error message to display
 */
export function showUserError(message) {
    const syncStatusMessage = window.globals?.syncStatusMessage;
    if (syncStatusMessage) {
        syncStatusMessage.textContent = `⚠️ ${message}`;
        syncStatusMessage.style.color = '#dc2626'; // red-600
        
        // Auto-clear after 10 seconds
        setTimeout(() => {
            if (syncStatusMessage.textContent.includes(message)) {
                syncStatusMessage.textContent = '';
            }
        }, 10000);
    }
}

/**
 * Safely write to localStorage with error handling
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON stringified)
 * @returns {boolean} Success status
 */
export function safeSetLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error(`[STORAGE] Failed to write key '${key}':`, e.message);
        
        if (e.name === 'QuotaExceededError') {
            showUserError('Storage limit reached. Please sync data or contact support.');
        }
        return false;
    }
}

/**
 * Safely read from localStorage with error handling
 * @param {string} key - Storage key
 * @returns {*|null} Parsed value or null if not found/error
 */
export function safeGetLocalStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error(`[STORAGE] Failed to read key '${key}':`, e.message);
        return null;
    }
}

/**
 * Update sync status message in admin panel
 * @param {string} message - Status message to display
 */
export function updateSyncStatus(message) {
    const syncStatusMessage = window.globals?.syncStatusMessage;
    if (syncStatusMessage) {
        syncStatusMessage.textContent = message;
        syncStatusMessage.style.color = ''; // Reset to default
    }
}

export default {
    generateUUID,
    safeSetLocalStorage,
    safeGetLocalStorage,
    showUserError,
    updateSyncStatus
};
