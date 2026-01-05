// FILE: sync/queueManager.js
// PURPOSE: Queue management for survey submissions
// DEPENDENCIES: storageUtils.js
// VERSION: 2.0.0 - Added safety checks

import { safeGetLocalStorage, safeSetLocalStorage } from './storageUtils.js';

/**
 * SAFETY FIX: Check queue health and warn if approaching limit
 */
function checkQueueHealth(queueSize) {
    const MAX = window.CONSTANTS?.MAX_QUEUE_SIZE || 1000;
    const WARNING = window.CONSTANTS?.QUEUE_WARNING_THRESHOLD || 800;
    
    if (queueSize >= WARNING) {
        console.warn(`⚠️ [QUEUE WARNING] Queue at ${queueSize}/${MAX} records (${Math.round(queueSize/MAX*100)}% full)`);
        
        if (queueSize >= MAX - 50) {
            console.error(`🚨 [QUEUE CRITICAL] Queue nearly full: ${queueSize}/${MAX} - Sync immediately!`);
        }
    }
}

/**
 * Get submission queue from localStorage
 * @returns {Array} Array of survey submissions
 */
export function getSubmissionQueue() {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    const queue = safeGetLocalStorage(STORAGE_KEY_QUEUE);
    return Array.isArray(queue) ? queue : [];
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
 * Update admin panel count display
 */
export function updateAdminCount() {
    const count = countUnsyncedRecords();
    const display = document.getElementById('unsyncedCountDisplay');
    
    if (display) {
        display.textContent = count;
    }
}

/**
 * Add submission to queue
 * SAFETY FIX: Added health check and improved logging
 * @param {Object} submission - Survey submission object
 */
export function addToQueue(submission) {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 1000;
    
    const submissionQueue = getSubmissionQueue();
    
    // SAFETY FIX: Check health before adding
    checkQueueHealth(submissionQueue.length);
    
    if (submissionQueue.length >= MAX_QUEUE_SIZE) {
        console.error(`🚨 [QUEUE] Full at ${MAX_QUEUE_SIZE} records - removing oldest submission`);
        submissionQueue.shift();
    }
    
    submissionQueue.push(submission);
    safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);
    
    console.log(`[QUEUE] Added submission. Queue size: ${submissionQueue.length}/${MAX_QUEUE_SIZE}`);
}

/**
 * Remove submissions from queue by IDs
 * @param {Array<string>} ids - Array of submission IDs to remove
 */
export function removeFromQueue(ids) {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    const submissionQueue = getSubmissionQueue();
    
    const idsToRemove = new Set(ids);
    const filteredQueue = submissionQueue.filter(sub => !idsToRemove.has(sub.id));
    
    const removedCount = submissionQueue.length - filteredQueue.length;
    console.log(`[QUEUE] Removed ${removedCount} synced records. Remaining: ${filteredQueue.length}`);
    
    safeSetLocalStorage(STORAGE_KEY_QUEUE, filteredQueue);
    updateAdminCount();
}

/**
 * Clear entire queue
 */
export function clearQueue() {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    const queueSize = getSubmissionQueue().length;
    
    localStorage.removeItem(STORAGE_KEY_QUEUE);
    console.log(`[QUEUE] Cleared ${queueSize} records`);
    
    updateAdminCount();
}

/**
 * Validate queue submissions (check for required fields)
 * @returns {Object} { valid, invalid } arrays
 */
export function validateQueue() {
    const queue = getSubmissionQueue();
    const valid = [];
    const invalid = [];
    
    queue.forEach(submission => {
        if (submission.id && submission.timestamp) {
            valid.push(submission);
        } else {
            console.warn('[QUEUE] Invalid submission found:', submission);
            invalid.push(submission);
        }
    });
    
    if (invalid.length > 0) {
        console.warn(`[QUEUE] Found ${invalid.length} invalid submissions`);
    }
    
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
