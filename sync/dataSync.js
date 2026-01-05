// FILE: dataSync.js
// PURPOSE: Main entry point combining all data sync modules
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
    validateQueue
} from './queueManager.js';

import {
    recordAnalytics,
    shouldSyncAnalytics,
    checkAndSyncAnalytics,
    syncAnalytics
} from './analyticsManager.js';

import {
    sendRequest,
    isOnline
} from './networkHandler.js';

// ---------------------------------------------------------------------
// --- SURVEY DATA SYNC ---
// ---------------------------------------------------------------------

let syncQueue = Promise.resolve();

/**
 * Sync survey data to server with queue management
 * @param {boolean} isManual - Whether this is a manual sync
 * @returns {Promise<boolean>} Success status
 */
export function syncData(isManual = false) {
    // Better sync queue management
    syncQueue = syncQueue.then(() => doSyncData(isManual)).catch(err => {
        console.error('[SYNC QUEUE] Unhandled error:', err);
    });
    return syncQueue;
}

/**
 * Internal sync function with retry logic
 * @param {boolean} isManual - Whether this is a manual sync
 * @returns {Promise<boolean>} Success status
 */
async function doSyncData(isManual = false) {
    const SYNC_ENDPOINT = window.CONSTANTS?.SYNC_ENDPOINT || '/api/submit-survey';
    const STORAGE_KEY_LAST_SYNC = window.CONSTANTS?.STORAGE_KEY_LAST_SYNC || 'lastSync';
    
    if (!isOnline()) {
        console.warn('[DATA SYNC] Offline. Skipping sync.');
        if (isManual) {
            updateSyncStatus('Offline. Sync skipped.');
            showUserError('No internet connection. Sync failed.');
        }
        updateAdminCount();
        return false;
    }

    const submissionQueue = getSubmissionQueue();
    
    if (submissionQueue.length === 0) {
        console.log('[DATA SYNC] Submission queue is empty.');
        if (isManual) {
            updateSyncStatus('No records to sync ✅');
            setTimeout(() => updateSyncStatus(''), 3000);
        }
        updateAdminCount();
        return true;
    }

    try {
        const syncButton = window.globals?.syncButton;
        if (isManual && syncButton) {
            syncButton.disabled = true;
            syncButton.textContent = 'Syncing...';
        }

        console.log(`[DATA SYNC] Attempting to sync ${submissionQueue.length} submissions...`);
        
        // Validate all submissions have IDs before syncing
        const { valid: validSubmissions, invalid: invalidSubmissions } = validateQueue();

        if (validSubmissions.length === 0) {
            console.error('[DATA SYNC] No valid submissions found (all missing IDs)');
            if (isManual) {
                updateSyncStatus('⚠️ All records invalid (missing IDs)');
                showUserError('Data validation failed. Please clear queue and restart.');
            }
            return false;
        }

        if (invalidSubmissions.length > 0) {
            console.warn(`[DATA SYNC] ${invalidSubmissions.length} invalid records filtered out`);
        }
        
        console.log('[DATA SYNC] Submission IDs:', validSubmissions.map(s => s.id));
        
        if (isManual) updateSyncStatus(`Syncing ${validSubmissions.length} records... ⏳`);

        const payload = {
            submissions: validSubmissions,
            kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
            timestamp: new Date().toISOString()
        };

        const syncResult = await sendRequest(SYNC_ENDPOINT, payload);
        
        console.log('[DATA SYNC] Server response:', syncResult);
        
        const successfulIds = syncResult.successfulIds || [];
        
        console.log('[DATA SYNC] Successfully synced IDs:', successfulIds);
        
        if (successfulIds.length === 0) {
            console.warn('[DATA SYNC] Server returned zero successful IDs. Data retained.');
            if (isManual) {
                updateSyncStatus('⚠️ Sync completed but no records confirmed. Check server logs.');
                showUserError('Sync uncertain - records kept in queue for safety.');
            }
            return false;
        }
        
        // Remove synced records from queue
        removeFromQueue(successfulIds);
        
        // Store last sync timestamp
        safeSetLocalStorage(STORAGE_KEY_LAST_SYNC, Date.now());
        updateAdminCount();

        const remainingCount = countUnsyncedRecords();
        
        if (isManual) {
            const statusText = remainingCount === 0 
                ? `✅ Sync Complete! ${submissionQueue.length} records cleared.` 
                : `⚠️ Partial Sync: ${successfulIds.length} cleared, ${remainingCount} remain.`;

            updateSyncStatus(statusText);
            setTimeout(() => updateSyncStatus(''), 4000);
        }
        
        return true;

    } catch (error) {
        console.error(`[DATA SYNC] PERMANENT FAIL: ${error.message}`);
        if (isManual) {
            updateSyncStatus('❌ Sync Failed - Check Console');
            showUserError(`Sync failed: ${error.message}. Data saved locally.`);
        }
        return false;
        
    } finally {
        const syncButton = window.globals?.syncButton;
        if (isManual && syncButton) {
            syncButton.disabled = false;
            syncButton.textContent = 'Sync Data';
        }
        
        updateAdminCount();
    }
}

/**
 * Auto-sync function called periodically
 */
export function autoSync() {
    console.log('[AUTO SYNC] Running periodic sync...');
    syncData(false);
    
    // Check if we should auto-sync analytics (once per day)
    checkAndSyncAnalytics();
}

// At the bottom of the file, find the export section and add checkStorageQuota:

// Expose functions globally for backward compatibility
window.dataHandlers = {
    // Storage utilities
    generateUUID,
    safeSetLocalStorage,
    safeGetLocalStorage,
    checkStorageQuota,  // SAFETY: Added storage quota check
    
    // Queue management
    getSubmissionQueue,
    countUnsyncedRecords,
    updateAdminCount,
    addToQueue,
    removeFromQueue,
    clearQueue,
    
    // Analytics
    recordAnalytics,
    syncAnalytics,
    checkAndSyncAnalytics,
    
    // Sync operations
    syncData,
    autoSync
};

// Export for ES6 modules
export {
    // Storage utilities
    generateUUID,
    safeSetLocalStorage,
    safeGetLocalStorage,
    checkStorageQuota,  // SAFETY: Added
    
    // Queue management
    getSubmissionQueue,
    countUnsyncedRecords,
    updateAdminCount,
    
    // Analytics
    recordAnalytics,
    syncAnalytics
};
