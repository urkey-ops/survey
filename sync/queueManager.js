// FILE: queueManager.js
// PURPOSE: Manage submission queue operations
// DEPENDENCIES: storageUtils.js, window.CONSTANTS

import { safeGetLocalStorage, safeSetLocalStorage } from './storageUtils.js';

/**
 * Get current submission queue
 * @returns {Array} Array of submission records
 */
export function getSubmissionQueue() {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    return safeGetLocalStorage(STORAGE_KEY_QUEUE) || [];
}

/**
 * Count unsynced records in queue
 * @returns {number} Number of unsynced records
 */
export function countUnsyncedRecords() {
    const queue = getSubmissionQueue();
    return queue.length;
}

/**
 * Update admin panel with current queue count
 */
export function updateAdminCount() {
    const count = countUnsyncedRecords();
    const unsyncedCountDisplay = window.globals?.unsyncedCountDisplay;
    
    if (unsyncedCountDisplay) {
        unsyncedCountDisplay.textContent = `Unsynced Records: ${count}`;

        if (count > 0) {
            unsyncedCountDisplay.classList.remove('text-green-600');
            unsyncedCountDisplay.classList.add('text-red-600');
        } else {
            unsyncedCountDisplay.classList.remove('text-red-600');
            unsyncedCountDisplay.classList.add('text-green-600');
        }
    }
}

/**
 * Add submission to queue
 * @param {Object} submission - Submission data to add
 * @returns {boolean} Success status
 */
export function addToQueue(submission) {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 100;
    
    const queue = getSubmissionQueue();
    
    // Check queue size
    if (queue.length >= MAX_QUEUE_SIZE) {
        console.warn(`[QUEUE] Queue full (${MAX_QUEUE_SIZE} records) - removing oldest entry`);
        queue.shift();
    }
    
    queue.push(submission);
    return safeSetLocalStorage(STORAGE_KEY_QUEUE, queue);
}

/**
 * Remove synced submissions from queue
 * @param {Array<string>} successfulIds - IDs of successfully synced submissions
 * @returns {boolean} Success status
 */
export function removeFromQueue(successfulIds) {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    const queue = getSubmissionQueue();
    
    const newQueue = queue.filter(record => {
        // If record has no ID, keep it (shouldn't happen)
        if (!record.id) {
            console.warn('[QUEUE] Found record without ID during cleanup, keeping in queue');
            return true;
        }
        
        // Keep records that are NOT in the successful list
        const shouldKeep = !successfulIds.includes(record.id);
        
        if (!shouldKeep) {
            console.log(`[QUEUE] ✓ Removing successfully synced record: ${record.id}`);
        } else {
            console.log(`[QUEUE] ↻ Keeping unsynced record: ${record.id}`);
        }
        
        return shouldKeep;
    });
    
    // Update localStorage
    if (newQueue.length > 0) {
        console.warn(`[QUEUE] ${successfulIds.length} records synced. ${newQueue.length} records remaining.`);
        return safeSetLocalStorage(STORAGE_KEY_QUEUE, newQueue);
    } else {
        console.log(`[QUEUE] ✅ All ${queue.length} records successfully synced. Clearing queue.`);
        localStorage.removeItem(STORAGE_KEY_QUEUE);
        return true;
    }
}

/**
 * Clear entire queue
 */
export function clearQueue() {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    localStorage.removeItem(STORAGE_KEY_QUEUE);
    console.log('[QUEUE] Queue cleared');
}

/**
 * Validate all submissions in queue have required fields
 * @returns {Object} { valid: Array, invalid: Array }
 */
export function validateQueue() {
    const queue = getSubmissionQueue();
    const valid = [];
    const invalid = [];
    
    queue.forEach(record => {
        if (!record.id) {
            console.error('[QUEUE] Record missing ID:', record);
            invalid.push(record);
        } else {
            valid.push(record);
        }
    });
    
    return { valid, invalid };
}

export default {
    getSubmissionQueue,
    countUnsyncedRecords,
    updateAdminCount,
    addToQueue,
    removeFromQueue,
    clearQueue,
    validateQueue
};
