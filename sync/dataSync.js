// FILE: dataSync.js
// PURPOSE: Main entry point for offline-first data sync
// DEPENDENCIES: All sync sub-modules

import {
    generateUUID,
    safeSetLocalStorage,
    safeGetLocalStorage,
    showUserError,
    updateSyncStatus
} from './storageUtils.js';

import {
    getSubmissionQueue,
    countUnsyncedRecords,
    updateAdminCount,
    addToQueue,
    removeFromQueue,
    clearQueue,
    validateQueue,
    getQueueStats,
    getOldestRecords
} from './queueManager.js';

import {
    recordAnalytics,
    shouldSyncAnalytics,
    checkAndSyncAnalytics,
    syncAnalytics
} from './analyticsManager.js';

import {
    sendRequest,
    isOnline,
    waitForOnline
} from './networkHandler.js';

// ---------------------------------------------------------------------
// --- OFFLINE-FIRST SURVEY DATA SYNC ---
// ---------------------------------------------------------------------

let syncQueue = Promise.resolve();
let isSyncing = false;
let lastSyncAttempt = 0;
const MIN_SYNC_INTERVAL = 5000; // Minimum 5 seconds between sync attempts

/**
 * Sync survey data to server with offline-first queue management
 * @param {boolean} isManual - Whether this is a manual sync
 * @returns {Promise<boolean>} Success status
 */
export function syncData(isManual = false) {
    // Prevent rapid-fire sync attempts
    const now = Date.now();
    if (!isManual && (now - lastSyncAttempt) < MIN_SYNC_INTERVAL) {
        console.log('[SYNC] Throttling - too soon since last attempt');
        return Promise.resolve(false);
    }
    lastSyncAttempt = now;
    
    // Queue the sync operation to avoid concurrent syncs
    syncQueue = syncQueue.then(() => doSyncData(isManual)).catch(err => {
        console.error('[SYNC QUEUE] Unhandled error:', err);
        isSyncing = false;
    });
    return syncQueue;
}

/**
 * Internal sync function with offline-first logic
 * @param {boolean} isManual - Whether this is a manual sync
 * @returns {Promise<boolean>} Success status
 */
async function doSyncData(isManual = false) {
    const SYNC_ENDPOINT = window.CONSTANTS?.SYNC_ENDPOINT || '/api/submit-survey';
    const STORAGE_KEY_LAST_SYNC = window.CONSTANTS?.STORAGE_KEY_LAST_SYNC || 'lastSync';
    
    // Check if already syncing
    if (isSyncing) {
        console.log('[DATA SYNC] Sync already in progress, skipping...');
        return false;
    }
    
    // OFFLINE-FIRST: Check queue first, network status second
    const submissionQueue = getSubmissionQueue();
    
    if (submissionQueue.length === 0) {
        console.log('[DATA SYNC] Queue empty - nothing to sync');
        if (isManual) {
            updateSyncStatus('✅ No pending records');
            setTimeout(() => updateSyncStatus(''), 2000);
        }
        updateAdminCount();
        return true;
    }
    
    // Log queue stats for monitoring
    const stats = getQueueStats();
    console.log('[DATA SYNC] Queue stats:', {
        total: stats.total,
        offline: stats.offlineSubmissions,
        online: stats.onlineSubmissions,
        oldestAge: stats.averageAgeMinutes + ' minutes'
    });
    
    // Check online status
    if (!isOnline()) {
        console.warn('[DATA SYNC] Offline - keeping data in queue');
        if (isManual) {
            updateSyncStatus('📱 Offline - Data safe in queue');
            showUserError(`${submissionQueue.length} records queued. Will sync when online.`);
        }
        updateAdminCount();
        return false;
    }

    // Start syncing
    isSyncing = true;
    
    try {
        const syncButton = window.globals?.syncButton;
        if (isManual && syncButton) {
            syncButton.disabled = true;
            syncButton.textContent = 'Syncing...';
        }

        console.log(`[DATA SYNC] Syncing ${submissionQueue.length} records to ${SYNC_ENDPOINT}...`);
        
        // Validate queue before syncing
        const { valid: validSubmissions, invalid: invalidSubmissions } = validateQueue();

        if (validSubmissions.length === 0) {
            console.error('[DATA SYNC] No valid submissions (all invalid)');
            if (isManual) {
                updateSyncStatus('⚠️ All records invalid');
                showUserError('Queue contains invalid data. Clear queue and restart.');
            }
            return false;
        }

        if (invalidSubmissions.length > 0) {
            console.warn(`[DATA SYNC] Filtered out ${invalidSubmissions.length} invalid records`);
            // Remove invalid records from queue
            const validIds = validSubmissions.map(s => s.id);
            const allIds = submissionQueue.map(s => s.id).filter(id => id);
            const invalidIds = allIds.filter(id => !validIds.includes(id));
            if (invalidIds.length > 0) {
                removeFromQueue(invalidIds);
            }
        }
        
        console.log('[DATA SYNC] Valid submission IDs:', validSubmissions.map(s => s.id));
        
        if (isManual) {
            updateSyncStatus(`Syncing ${validSubmissions.length} records... ⏳`);
        }

        // Prepare payload with kiosk metadata
        const payload = {
            submissions: validSubmissions,
            kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
            timestamp: new Date().toISOString(),
            offlineCount: stats.offlineSubmissions,
            onlineCount: stats.onlineSubmissions
        };

        // Send to server with retry logic (handled by networkHandler)
        const syncResult = await sendRequest(SYNC_ENDPOINT, payload);
        
        console.log('[DATA SYNC] Server response:', syncResult);
        
        // Extract successful IDs
        const successfulIds = syncResult.successfulIds || [];
        
        if (successfulIds.length === 0) {
            console.warn('[DATA SYNC] Server returned 0 successful IDs - retaining all data');
            if (isManual) {
                updateSyncStatus('⚠️ Server accepted 0 records - data kept in queue');
                showUserError('Sync unclear - keeping data safe in queue.');
            }
            return false;
        }
        
        console.log(`[DATA SYNC] Server confirmed ${successfulIds.length}/${validSubmissions.length} records`);
        
        // Remove successfully synced records
        removeFromQueue(successfulIds);
        
        // Update last sync timestamp
        safeSetLocalStorage(STORAGE_KEY_LAST_SYNC, Date.now());
        updateAdminCount();

        const remainingCount = countUnsyncedRecords();
        
        // User feedback
        if (isManual) {
            if (remainingCount === 0) {
                updateSyncStatus(`✅ Synced all ${successfulIds.length} records!`);
            } else {
                updateSyncStatus(`⚠️ Synced ${successfulIds.length}, ${remainingCount} remaining`);
            }
            setTimeout(() => updateSyncStatus(''), 4000);
        }
        
        // Log success
        console.log(`[DATA SYNC] ✅ Success: ${successfulIds.length} synced, ${remainingCount} remaining`);
        
        // Register background sync for remaining records
        if (remainingCount > 0) {
            registerBackgroundSync();
        }
        
        return true;

    } catch (error) {
        console.error(`[DATA SYNC] ❌ Failed: ${error.message}`);
        
        // OFFLINE-FIRST: Keep data safe in queue on failure
        if (isManual) {
            updateSyncStatus('❌ Sync failed - data safe in queue');
            showUserError(`Sync failed: ${error.message}. Data preserved locally.`);
        }
        
        // Check if we lost connection during sync
        if (!isOnline()) {
            console.log('[DATA SYNC] Connection lost during sync - will retry when online');
            registerBackgroundSync();
        }
        
        return false;
        
    } finally {
        isSyncing = false;
        
        // Reset UI
        const syncButton = window.globals?.syncButton;
        if (isManual && syncButton) {
            syncButton.disabled = false;
            syncButton.textContent = 'Sync Data';
        }
        
        updateAdminCount();
    }
}

/**
 * Auto-sync function called periodically (respects offline-first)
 */
export function autoSync() {
    console.log('[AUTO SYNC] Running periodic sync check...');
    
    // Only auto-sync if online and have data
    const queueLength = countUnsyncedRecords();
    
    if (queueLength === 0) {
        console.log('[AUTO SYNC] Queue empty, skipping');
        return;
    }
    
    if (!isOnline()) {
        console.log('[AUTO SYNC] Offline, skipping (data safe in queue)');
        return;
    }
    
    console.log(`[AUTO SYNC] Syncing ${queueLength} queued records...`);
    syncData(false);
    
    // Check if we should auto-sync analytics
    checkAndSyncAnalytics();
}

/**
 * Register background sync (for PWA)
 */
function registerBackgroundSync() {
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
        navigator.serviceWorker.ready
            .then(registration => {
                return registration.sync.register('sync-surveys');
            })
            .then(() => {
                console.log('[SYNC] Background sync registered');
            })
            .catch(err => {
                console.warn('[SYNC] Background sync not available:', err.message);
            });
    }
}

/**
 * Force sync with connection wait (for user-initiated sync)
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<boolean>} Success status
 */
export async function forceSyncWithWait(timeout = 10000) {
    console.log('[FORCE SYNC] Attempting forced sync...');
    
    updateSyncStatus('Checking connection... ⏳');
    
    // Wait for connection if offline
    if (!isOnline()) {
        console.log('[FORCE SYNC] Offline - waiting for connection...');
        const gotOnline = await waitForOnline(timeout);
        
        if (!gotOnline) {
            updateSyncStatus('⚠️ Still offline - data safe in queue');
            showUserError('Cannot connect. Data saved locally and will sync when online.');
            return false;
        }
    }
    
    // Connection available, attempt sync
    return syncData(true);
}

/**
 * Get sync status for monitoring
 */
export function getSyncStatus() {
    const queueLength = countUnsyncedRecords();
    const stats = getQueueStats();
    const lastSync = safeGetLocalStorage('lastSync');
    
    return {
        queueLength,
        isSyncing,
        isOnline: isOnline(),
        lastSync: lastSync ? new Date(lastSync).toISOString() : null,
        stats
    };
}

// Expose functions globally for backward compatibility
window.dataHandlers = {
    // Storage utilities
    generateUUID,
    safeSetLocalStorage,
    safeGetLocalStorage,
    
    // Queue management
    getSubmissionQueue,
    countUnsyncedRecords,
    updateAdminCount,
    addToQueue,
    removeFromQueue,
    clearQueue,
    getQueueStats,
    getOldestRecords,
    
    // Analytics
    recordAnalytics,
    syncAnalytics,
    checkAndSyncAnalytics,
    
    // Sync operations
    syncData,
    autoSync,
    forceSyncWithWait,
    getSyncStatus
};

// Export for ES6 modules
export {
    // Storage utilities
    generateUUID,
    safeSetLocalStorage,
    safeGetLocalStorage,
    
    // Queue management
    getSubmissionQueue,
    countUnsyncedRecords,
    updateAdminCount,
    
    // Analytics
    recordAnalytics,
    syncAnalytics,
    
    // Enhanced sync
    forceSyncWithWait,
    getSyncStatus
};
