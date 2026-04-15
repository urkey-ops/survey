// FILE: sync/dataSync.js
// PURPOSE: Core data synchronization - offline-first, queue-based, retry-safe
// UPDATED: VERSION 3.0.0 - Passes surveyType in sync payload + uses correct queue per type
// DEPENDENCIES: storageUtils.js, queueManager.js, analyticsManager.js, networkHandler.js

import {
  generateUUID,
  safeSetLocalStorage,
  safeGetLocalStorage,
  showUserError,
  checkStorageQuota
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

import { sendRequest, isOnline } from './networkHandler.js';

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let syncInProgress = false;
let syncQueue = Promise.resolve();
let periodicSyncTimer = null;
let periodicAnalyticsTimer = null;

// ═══════════════════════════════════════════════════════════
// SURVEY DATA SYNC
// ═══════════════════════════════════════════════════════════

/**
 * Public entry point for syncing survey data.
 * Queues sync operations so they never run concurrently.
 * @param {boolean} isManual - true = triggered from admin panel
 */
export function syncData(isManual = false) {
  if (syncInProgress) {
    console.log('[DATA SYNC] Skipped - sync already in progress');
    return Promise.resolve(false);
  }

  syncQueue = syncQueue
    .then(() => doSyncData(isManual))
    .catch(err => {
      console.error('[SYNC QUEUE] Unhandled error in sync queue:', err);
      syncInProgress = false;
    });

  return syncQueue;
}

/**
 * Internal sync implementation.
 * Reads the active survey type from KIOSK_CONFIG and syncs
 * only that type's queue to the correct sheet.
 * @param {boolean} isManual
 */
async function doSyncData(isManual = false) {
  if (!isOnline()) {
    console.warn('[DATA SYNC] Offline. Skipping sync.');
    if (isManual) {
      updatSyncStatus('Offline. Sync skipped.');
      showUserError('No internet connection. Data saved locally.');
    }
    updateAdminCount();
    syncInProgress = false;
    return false;
  }

  const SYNC_ENDPOINT = window.CONSTANTS?.SYNC_ENDPOINT || '/api/submit-survey';
  const STORAGE_KEY_LAST_SYNC = window.CONSTANTS?.STORAGE_KEY_LAST_SYNC || 'lastSync';

  // ── Determine active survey type and its dedicated queue key ──
  const surveyType = window.KIOSK_CONFIG?.getActiveSurveyType?.() ||
                     window.CONSTANTS?.ACTIVE_SURVEY_TYPE ||
                     'type1';
  const surveyConfig = window.CONSTANTS?.SURVEY_TYPES?.[surveyType];
  const queueKey = surveyConfig?.storageKey ||
                   window.CONSTANTS?.STORAGE_KEY_QUEUE ||
                   'submissionQueue';

  console.log(`[DATA SYNC] Type: ${surveyType} | Queue: "${queueKey}"`);

  syncInProgress = true;

  const submissionQueue = getSubmissionQueue(queueKey);

  if (submissionQueue.length === 0) {
    console.log('[DATA SYNC] Queue empty - nothing to sync.');
    if (isManual) {
      updatSyncStatus('No records to sync ✅');
      setTimeout(() => updatSyncStatus(''), 3000);
    }
    updateAdminCount();
    syncInProgress = false;
    return true;
  }

  try {
    const syncButton = window.globals?.syncButton;
    if (isManual && syncButton) {
      syncButton.disabled = true;
      syncButton.textContent = 'Syncing...';
    }

    console.log(`[DATA SYNC] Syncing ${submissionQueue.length} records (${surveyType})...`);

    // Validate queue before sending
    const { valid: validSubmissions, invalid: invalidSubmissions } = validateQueue(queueKey);

    if (validSubmissions.length === 0) {
      console.error('[DATA SYNC] No valid submissions found (all missing ID/timestamp)');
      if (isManual) {
        updatSyncStatus('⚠️ All records invalid - missing IDs');
        showUserError('Data validation failed. Please clear queue and restart kiosk.');
      }
      syncInProgress = false;
      return false;
    }

    if (invalidSubmissions.length > 0) {
      console.warn(`[DATA SYNC] ${invalidSubmissions.length} invalid record(s) filtered out`);
    }

    if (isManual) {
      updatSyncStatus(`Syncing ${validSubmissions.length} record(s)... ⏳`);
    }

    // ── Build payload — includes surveyType so API routes to correct sheet ──
    const payload = {
      submissions: validSubmissions,
      surveyType,
      kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
      timestamp: new Date().toISOString()
    };

    const syncResult = await sendRequest(SYNC_ENDPOINT, payload);
    console.log('[DATA SYNC] Server response:', syncResult);

    const successfulIds = syncResult.successfulIds || [];

    if (successfulIds.length === 0) {
      console.warn('[DATA SYNC] Server returned 0 successful IDs. Retaining data.');
      if (isManual) {
        updatSyncStatus('⚠️ Sync uncertain - records kept. Check server logs.');
        showUserError('Sync returned no confirmations - data kept locally for safety.');
      }
      syncInProgress = false;
      return false;
    }

    // ── Remove synced records from the queue ──
    removeFromQueue(successfulIds, queueKey);
    safeSetLocalStorage(STORAGE_KEY_LAST_SYNC, Date.now());
    updateAdminCount();

    const remainingCount = countUnsyncedRecords(queueKey);

    if (isManual) {
      const sheetLabel = surveyConfig?.sheetName || 'Sheet';
      const statusText = remainingCount === 0
        ? `✅ Sync Complete! ${validSubmissions.length} record(s) saved to "${sheetLabel}".`
        : `⚠️ Partial: ${successfulIds.length} synced, ${remainingCount} remain.`;
      updatSyncStatus(statusText);
      setTimeout(() => updatSyncStatus(''), 4000);
    }

    console.log(`[DATA SYNC] ✅ Done. Synced: ${successfulIds.length} | Remaining: ${remainingCount}`);

    // Record analytics for this sync event
    try {
      recordAnalytics('sync_completed', {
        surveyType,
        synced: successfulIds.length,
        remaining: remainingCount,
        manual: isManual
      });
    } catch (e) {
      console.warn('[DATA SYNC] Analytics record failed (safe to ignore):', e.message);
    }

    syncInProgress = false;
    return true;

  } catch (error) {
    console.error(`[DATA SYNC] ❌ FAILED: ${error.message}`);

    try {
      recordAnalytics('sync_failed', {
        surveyType,
        error: error.message,
        manual: isManual
      });
    } catch (e) { /* analytics failure is not critical */ }

    if (isManual) {
      updatSyncStatus('❌ Sync Failed - data saved locally');
      showUserError(`Sync failed: ${error.message}. Data saved locally.`);
    }

    syncInProgress = false;
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

// ═══════════════════════════════════════════════════════════
// AUTO SYNC (called by periodic timer)
// ═══════════════════════════════════════════════════════════

/**
 * Runs on a timer - syncs survey data AND analytics silently.
 */
export function autoSync() {
  console.log('[AUTO SYNC] Periodic sync triggered');
  syncData(false);
  checkAndSyncAnalytics();
}

// ═══════════════════════════════════════════════════════════
// PERIODIC SYNC SCHEDULER
// ═══════════════════════════════════════════════════════════

/**
 * Start the periodic background sync timers.
 * Call once from main/index.js after app init.
 */
export function startPeriodicSync() {
  const SYNC_INTERVAL = window.CONSTANTS?.SYNC_INTERVAL_MS || 300000;                // 5 min
  const ANALYTICS_INTERVAL = window.CONSTANTS?.ANALYTICS_SYNC_INTERVAL_MS || 600000; // 10 min

  if (periodicSyncTimer) {
    clearInterval(periodicSyncTimer);
    periodicSyncTimer = null;
  }
  if (periodicAnalyticsTimer) {
    clearInterval(periodicAnalyticsTimer);
    periodicAnalyticsTimer = null;
  }

  periodicSyncTimer = setInterval(() => {
    if (isOnline()) {
      console.log('[PERIODIC SYNC] Interval fired — syncing...');
      syncData(false);
    } else {
      console.log('[PERIODIC SYNC] Interval fired — offline, skipping.');
    }
  }, SYNC_INTERVAL);

  periodicAnalyticsTimer = setInterval(() => {
    if (isOnline()) {
      console.log('[PERIODIC ANALYTICS] Interval fired — syncing analytics...');
      checkAndSyncAnalytics();
    }
  }, ANALYTICS_INTERVAL);

  // Attempt sync shortly after app starts (if online)
  if (isOnline()) {
    console.log('[PERIODIC SYNC] App start — scheduling initial sync in 3s...');
    setTimeout(() => syncData(false), 3000);
  }

  console.log(`[PERIODIC SYNC] ✅ Timers started — survey every ${SYNC_INTERVAL / 60000}min, analytics every ${ANALYTICS_INTERVAL / 60000}min`);
}

/**
 * Stop the periodic sync timers (call on cleanup/unmount).
 */
export function stopPeriodicSync() {
  if (periodicSyncTimer) {
    clearInterval(periodicSyncTimer);
    periodicSyncTimer = null;
    console.log('[PERIODIC SYNC] Survey sync timer stopped.');
  }
  if (periodicAnalyticsTimer) {
    clearInterval(periodicAnalyticsTimer);
    periodicAnalyticsTimer = null;
    console.log('[PERIODIC SYNC] Analytics sync timer stopped.');
  }
}

// ═══════════════════════════════════════════════════════════
// STORAGE QUOTA CHECK
// ═══════════════════════════════════════════════════════════

/**
 * Check available storage and warn if low.
 * Called periodically and before each queue add.
 */
export async function checkAndWarnStorageQuota() {
  try {
    const stats = await checkStorageQuota();
    if (stats && stats.percentUsed > 80) {
      console.warn(`[STORAGE] ⚠️ ${stats.percentUsed.toFixed(1)}% used (${stats.usedMB}MB / ${stats.quotaMB}MB)`);
      if (stats.percentUsed > 90) {
        showUserError('Storage nearly full. Please sync data soon.');
      }
    }
  } catch (e) {
    console.warn('[STORAGE] Quota check failed (non-critical):', e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// ONLINE / OFFLINE EVENT HANDLERS
// ═══════════════════════════════════════════════════════════

/**
 * Set up window online/offline listeners.
 * When connection is restored, attempt sync automatically.
 */
export function setupNetworkListeners() {
  window.addEventListener('online', () => {
    console.log('[NETWORK] 🌐 Connection restored — attempting sync...');
    try {
      recordAnalytics('network_restored', { queueSize: countUnsyncedRecords() });
    } catch (e) { /* safe to ignore */ }
    setTimeout(() => syncData(false), 1000);
  });

  window.addEventListener('offline', () => {
    console.log('[NETWORK] 📡 Connection lost — switching to offline mode.');
    try {
      recordAnalytics('network_lost', {});
    } catch (e) { /* safe to ignore */ }
    updateAdminCount();
  });

  console.log('[NETWORK] ✅ Online/offline listeners registered');
}

// ═══════════════════════════════════════════════════════════
// GLOBAL EXPOSURE (window.dataHandlers)
// ═══════════════════════════════════════════════════════════

window.dataHandlers = {
  // Storage utils
  generateUUID,
  safeSetLocalStorage,
  safeGetLocalStorage,
  checkStorageQuota,

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

  // Sync
  syncData,
  autoSync,
  startPeriodicSync,
  stopPeriodicSync,
  checkAndWarnStorageQuota,
  setupNetworkListeners
};

// ═══════════════════════════════════════════════════════════
// NAMED EXPORTS
// ═══════════════════════════════════════════════════════════

export {
  generateUUID,
  safeSetLocalStorage,
  safeGetLocalStorage,
  checkStorageQuota,
  getSubmissionQueue,
  countUnsyncedRecords,
  updateAdminCount,
  recordAnalytics,
  syncAnalytics
};

// ═══════════════════════════════════════════════════════════
// BOOT LOG
// ═══════════════════════════════════════════════════════════

console.log('═══════════════════════════════════════════════════════');
console.log('🔄 DATA SYNC MODULE LOADED (v3.0.0)');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Active Survey : ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);
console.log(`  Network       : ${navigator.onLine ? '🌐 Online' : '📡 Offline'}`);
console.log(`  Sync Endpoint : ${window.CONSTANTS?.SYNC_ENDPOINT || '/api/submit-survey'}`);
console.log('═══════════════════════════════════════════════════════');
