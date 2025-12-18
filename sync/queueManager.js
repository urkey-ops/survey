// FILE: queueManager.js
// PURPOSE: Manage submission queue operations with offline-first approach
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
        unsyncedCountDisplay.textContent = count;

        if (count > 0) {
            unsyncedCountDisplay.classList.remove('text-emerald-600');
            unsyncedCountDisplay.classList.add('text-orange-600');
        } else {
            unsyncedCountDisplay.classList.remove('text-orange-600');
            unsyncedCountDisplay.classList.add('text-emerald-600');
        }
    }
    
    // Update page title with queue count (visible in PWA)
    updatePageTitle(count);
}

/**
 * Update page title with queue count (for PWA visibility)
 * @param {number} count - Number of unsynced records
 */
function updatePageTitle(count) {
    const baseTitle = 'Kiosk Survey';
    if (count > 0) {
        document.title = `(${count}) ${baseTitle}`;
    } else {
        document.title = baseTitle;
    }
}

/**
 * Add submission to queue with offline-first priority
 * @param {Object} submission - Submission data to add
 * @returns {boolean} Success status
 */
export function addToQueue(submission) {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 100;
    
    const queue = getSubmissionQueue();
    
    // Add timestamp if not present
    if (!submission.queuedAt) {
        submission.queuedAt = new Date().toISOString();
    }
    
    // Add offline flag
    submission.submittedOffline = !navigator.onLine;
    
    // Check queue size
    if (queue.length >= MAX_QUEUE_SIZE) {
        console.warn(`[QUEUE] Queue full (${MAX_QUEUE_SIZE} records) - removing oldest entry`);
        const removed = queue.shift();
        console.log(`[QUEUE] Removed oldest: ${removed.id} from ${removed.queuedAt}`);
    }
    
    queue.push(submission);
    const success = safeSetLocalStorage(STORAGE_KEY_QUEUE, queue);
    
    if (success) {
        console.log(`[QUEUE] ✅ Added to queue: ${submission.id} (Queue size: ${queue.length})`);
        updateAdminCount();
        
        // Notify service worker of queue update
        notifyServiceWorker('QUEUE_UPDATED', { queueLength: queue.length });
    } else {
        console.error('[QUEUE] ❌ Failed to add to queue:', submission.id);
    }
    
    return success;
}

/**
 * Remove synced submissions from queue
 * @param {Array<string>} successfulIds - IDs of successfully synced submissions
 * @returns {boolean} Success status
 */
export function removeFromQueue(successfulIds) {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    const queue = getSubmissionQueue();
    const initialCount = queue.length;
    
    const newQueue = queue.filter(record => {
        // If record has no ID, keep it (shouldn't happen)
        if (!record.id) {
            console.warn('[QUEUE] Found record without ID during cleanup, keeping in queue');
            return true;
        }
        
        // Keep records that are NOT in the successful list
        const shouldKeep = !successfulIds.includes(record.id);
        
        if (!shouldKeep) {
            const queueTime = record.queuedAt ? new Date(record.queuedAt).toLocaleString() : 'unknown';
            console.log(`[QUEUE] ✓ Removing synced record: ${record.id} (queued: ${queueTime})`);
        }
        
        return shouldKeep;
    });
    
    const removedCount = initialCount - newQueue.length;
    
    // Update localStorage
    if (newQueue.length > 0) {
        console.warn(`[QUEUE] Synced ${removedCount}/${initialCount} records. ${newQueue.length} remaining.`);
        const success = safeSetLocalStorage(STORAGE_KEY_QUEUE, newQueue);
        updateAdminCount();
        return success;
    } else {
        console.log(`[QUEUE] ✅ All ${initialCount} records successfully synced. Clearing queue.`);
        localStorage.removeItem(STORAGE_KEY_QUEUE);
        updateAdminCount();
        
        // Notify service worker that queue is empty
        notifyServiceWorker('QUEUE_EMPTY');
        return true;
    }
}

/**
 * Clear entire queue (admin action)
 */
export function clearQueue() {
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    const count = countUnsyncedRecords();
    
    if (count > 0) {
        const confirmed = confirm(`Clear ${count} unsynced records? This cannot be undone.`);
        if (!confirmed) {
            console.log('[QUEUE] Clear cancelled by user');
            return false;
        }
    }
    
    localStorage.removeItem(STORAGE_KEY_QUEUE);
    console.log(`[QUEUE] Queue cleared (${count} records removed)`);
    updateAdminCount();
    
    // Notify service worker
    notifyServiceWorker('QUEUE_CLEARED');
    return true;
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
        } else if (!record.responses) {
            console.error('[QUEUE] Record missing responses:', record.id);
            invalid.push(record);
        } else {
            valid.push(record);
        }
    });
    
    if (invalid.length > 0) {
        console.warn(`[QUEUE] Found ${invalid.length} invalid records out of ${queue.length}`);
    }
    
    return { valid, invalid };
}

/**
 * Get queue statistics for monitoring
 * @returns {Object} Queue statistics
 */
export function getQueueStats() {
    const queue = getSubmissionQueue();
    const now = new Date();
    
    const stats = {
        total: queue.length,
        offlineSubmissions: 0,
        onlineSubmissions: 0,
        oldestQueueTime: null,
        newestQueueTime: null,
        averageAge: 0
    };
    
    if (queue.length === 0) return stats;
    
    let totalAge = 0;
    let oldestTime = Infinity;
    let newestTime = 0;
    
    queue.forEach(record => {
        // Count offline vs online
        if (record.submittedOffline) {
            stats.offlineSubmissions++;
        } else {
            stats.onlineSubmissions++;
        }
        
        // Calculate ages
        if (record.queuedAt) {
            const queueTime = new Date(record.queuedAt);
            const age = now - queueTime;
            totalAge += age;
            
            if (queueTime < oldestTime) {
                oldestTime = queueTime;
                stats.oldestQueueTime = record.queuedAt;
            }
            if (queueTime > newestTime) {
                newestTime = queueTime;
                stats.newestQueueTime = record.queuedAt;
            }
        }
    });
    
    stats.averageAge = totalAge / queue.length;
    stats.averageAgeMinutes = Math.round(stats.averageAge / 60000);
    
    return stats;
}

/**
 * Notify service worker of queue changes
 * @param {string} type - Event type
 * @param {Object} data - Additional data
 */
function notifyServiceWorker(type, data = {}) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type,
            ...data,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Get oldest records in queue (for priority syncing)
 * @param {number} limit - Maximum number of records to return
 * @returns {Array} Oldest records
 */
export function getOldestRecords(limit = 10) {
    const queue = getSubmissionQueue();
    
    // Sort by queuedAt timestamp (oldest first)
    const sorted = [...queue].sort((a, b) => {
        const timeA = a.queuedAt ? new Date(a.queuedAt).getTime() : 0;
        const timeB = b.queuedAt ? new Date(b.queuedAt).getTime() : 0;
        return timeA - timeB;
    });
    
    return sorted.slice(0, limit);
}

/**
 * Export queue for backup/debugging
 * @returns {string} JSON string of queue
 */
export function exportQueue() {
    const queue = getSubmissionQueue();
    const stats = getQueueStats();
    
    return JSON.stringify({
        exportedAt: new Date().toISOString(),
        stats,
        queue
    }, null, 2);
}

export default {
    getSubmissionQueue,
    countUnsyncedRecords,
    updateAdminCount,
    addToQueue,
    removeFromQueue,
    clearQueue,
    validateQueue,
    getQueueStats,
    getOldestRecords,
    exportQueue
};
