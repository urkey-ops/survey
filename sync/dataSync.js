// FILE: sync/dataSync.js
// PURPOSE: Core data synchronization - offline-first, queue-based, retry-safe
// VERSION: 3.2.0
// FIXES:
//   - syncs both survey queues when needed, not just active type
//   - serializes sync operations safely via promise queue
//   - prevents duplicate online/offline listeners and startup timers
//   - handles partial success by removing only confirmed IDs
//   - keeps manual/admin status messaging safe and non-fatal
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
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════

function updateSyncStatus(msg) {
  try {
    if (window.globals?.syncStatusMessage) {
      window.globals.syncStatusMessage.textContent = msg || '';
    }
    if (window.uiHandlers?.updateSyncStatus) {
      window.uiHandlers.updateSyncStatus(msg || '');
    }
  } catch (e) {
    // non-critical
  }
}

function clearSyncStatusLater(delayMs = 3000) {
  window.clearTimeout(statusClearTimer);
  statusClearTimer = window.setTimeout(() => updateSyncStatus(''), delayMs);
}

function getSurveyTypeConfigs() {
  const surveyTypes = window.CONSTANTS?.SURVEY_TYPES || {};

  const type1Key =
    surveyTypes?.type1?.storageKey ||
    window.CONSTANTS?.STORAGE_KEY_QUEUE ||
    'submissionQueue';

  const type2Key =
    surveyTypes?.type2?.storageKey ||
    window.CONSTANTS?.STORAGE_KEY_QUEUE_V2 ||
    'submissionQueueV2';

  return [
    {
      surveyType: 'type1',
      queueKey: type1Key,
      sheetName: surveyTypes?.type1?.sheetName || 'Sheet1',
      label: surveyTypes?.type1?.label || 'Type 1'
    },
    {
      surveyType: 'type2',
      queueKey: type2Key,
      sheetName: surveyTypes?.type2?.sheetName || 'Sheet2',
      label: surveyTypes?.type2?.label || 'Type 2'
    }
  ];
}

function getActiveSurveyType() {
  return window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
}

function getQueueConfigByType(surveyType) {
  return getSurveyTypeConfigs().find(cfg => cfg.surveyType === surveyType) || getSurveyTypeConfigs()[0];
}

function getAllQueueConfigsWithData() {
  return getSurveyTypeConfigs().filter(cfg => {
    const queue = getSubmissionQueue(cfg.queueKey);
    return Array.isArray(queue) && queue.length > 0;
  });
}

function normalizeSyncTargets(syncBothQueues = true) {
  if (syncBothQueues) {
    const configsWithData = getAllQueueConfigsWithData();
    if (configsWithData.length > 0) return configsWithData;
  }

  return [getQueueConfigByType(getActiveSurveyType())];
}

function getLastSyncStorageKey() {
  return window.CONSTANTS?.STORAGE_KEY_LAST_SYNC || 'lastDataSync';
}

function getSyncEndpoint() {
  return window.CONSTANTS?.SYNC_ENDPOINT || '/api/submit-survey';
}

function setManualSyncButtonState(isBusy) {
  const syncButton = window.globals?.syncButton;
  if (!syncButton) return;

  syncButton.disabled = !!isBusy;
  syncButton.textContent = isBusy ? 'Syncing...' : 'Sync Data';
  syncButton.setAttribute('aria-busy', isBusy ? 'true' : 'false');
}

function getTotalUnsyncedAcrossQueues() {
  return getSurveyTypeConfigs().reduce((sum, cfg) => {
    try {
      return sum + countUnsyncedRecords(cfg.queueKey);
    } catch {
      return sum;
    }
  }, 0);
}

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let syncInProgress = false;
let syncQueue = Promise.resolve();
let periodicSyncTimer = null;
let periodicAnalyticsTimer = null;
let initialSyncTimer = null;
let statusClearTimer = null;
let networkListenersBound = false;
let onlineHandlerRef = null;
let offlineHandlerRef = null;

// ═══════════════════════════════════════════════════════════
// SURVEY DATA SYNC
// ═══════════════════════════════════════════════════════════

/**
 * Public entry point for syncing survey data.
 * Queues sync operations so they never run concurrently.
 * @param {boolean} isManual - true = triggered from admin panel
 * @param {object} options
 * @param {boolean} options.syncBothQueues - sync all queues with data, default true
 */
export function syncData(isManual = false, options = {}) {
  const { syncBothQueues = true } = options;

  syncQueue = syncQueue
    .then(() => doSyncData(isManual, { syncBothQueues }))
    .catch(err => {
      console.error('[SYNC QUEUE] Unhandled error in sync queue:', err);
      syncInProgress = false;
      return false;
    });

  return syncQueue;
}

/**
 * Internal sync implementation.
 * Can sync one queue or all queues with data.
 */
async function doSyncData(isManual = false, { syncBothQueues = true } = {}) {
  if (syncInProgress) {
    console.log('[DATA SYNC] Skipped - sync already in progress');
    return false;
  }

  if (!isOnline()) {
    console.warn('[DATA SYNC] Offline. Skipping sync.');
    if (isManual) {
      updateSyncStatus('Offline. Sync skipped.');
      showUserError('No internet connection. Data saved locally.');
      clearSyncStatusLater(3000);
    }
    updateAdminCount();
    syncInProgress = false;
    return false;
  }

  syncInProgress = true;

  try {
    if (isManual) {
      setManualSyncButtonState(true);
    }

    const queueTargets = normalizeSyncTargets(syncBothQueues);

    if (!queueTargets.length) {
      console.log('[DATA SYNC] No queue targets found.');
      if (isManual) {
        updateSyncStatus('No records to sync ✅');
        clearSyncStatusLater(3000);
      }
      updateAdminCount();
      return true;
    }

    const totalQueued = queueTargets.reduce((sum, cfg) => {
      const queue = getSubmissionQueue(cfg.queueKey);
      return sum + (Array.isArray(queue) ? queue.length : 0);
    }, 0);

    if (totalQueued === 0) {
      console.log('[DATA SYNC] Queue empty - nothing to sync.');
      if (isManual) {
        updateSyncStatus('No records to sync ✅');
        clearSyncStatusLater(3000);
      }
      updateAdminCount();
      return true;
    }

    if (isManual) {
      updateSyncStatus(`Syncing ${totalQueued} record(s)... ⏳`);
    }

    console.log(`[DATA SYNC] Starting sync across ${queueTargets.length} queue(s), ${totalQueued} record(s) total`);

    let totalSuccessful = 0;
    let totalRemaining = 0;
    const syncSummary = [];

    for (const target of queueTargets) {
      const result = await syncSingleQueue(target, isManual);
      syncSummary.push(result);
      totalSuccessful += result.successfulCount;
      totalRemaining += result.remainingCount;
    }

    safeSetLocalStorage(getLastSyncStorageKey(), Date.now());
    updateAdminCount();

    const hadAnyFailure = syncSummary.some(r => !r.ok);
    const hadAnySuccess = totalSuccessful > 0;

    if (isManual) {
      if (hadAnySuccess && !hadAnyFailure) {
        updateSyncStatus(`✅ Sync Complete! ${totalSuccessful} record(s) synced.`);
      } else if (hadAnySuccess && hadAnyFailure) {
        updateSyncStatus(`⚠️ Partial sync: ${totalSuccessful} synced, ${totalRemaining} remain.`);
      } else {
        updateSyncStatus('❌ Sync failed - data saved locally');
      }
      clearSyncStatusLater(4000);
    }

    console.log(`[DATA SYNC] Done. Success=${totalSuccessful}, Remaining=${totalRemaining}, FailedQueues=${syncSummary.filter(r => !r.ok).length}`);

    try {
      recordAnalytics(hadAnyFailure ? 'sync_partial_or_failed' : 'sync_completed', {
        activeSurveyType: getActiveSurveyType(),
        synced: totalSuccessful,
        remaining: totalRemaining,
        queuesProcessed: syncSummary.length,
        failedQueues: syncSummary.filter(r => !r.ok).length,
        manual: isManual
      });
    } catch (e) {
      console.warn('[DATA SYNC] Analytics record failed (safe to ignore):', e.message);
    }

    return hadAnySuccess || totalRemaining === 0;
  } catch (error) {
    console.error(`[DATA SYNC] ❌ FAILED: ${error.message}`);

    try {
      recordAnalytics('sync_failed', {
        activeSurveyType: getActiveSurveyType(),
        error: error.message,
        manual: isManual
      });
    } catch (e) {
      // non-critical
    }

    if (isManual) {
      updateSyncStatus('❌ Sync Failed - data saved locally');
      showUserError(`Sync failed: ${error.message}. Data saved locally.`);
      clearSyncStatusLater(4000);
    }

    return false;
  } finally {
    syncInProgress = false;
    if (isManual) {
      setManualSyncButtonState(false);
    }
    updateAdminCount();
  }
}

async function syncSingleQueue(target, isManual = false) {
  const { surveyType, queueKey, sheetName } = target;
  const SYNC_ENDPOINT = getSyncEndpoint();

  console.log(`[DATA SYNC] Type: ${surveyType} | Queue: "${queueKey}"`);

  const submissionQueue = getSubmissionQueue(queueKey);
  if (!Array.isArray(submissionQueue) || submissionQueue.length === 0) {
    return {
      ok: true,
      surveyType,
      queueKey,
      successfulCount: 0,
      remainingCount: 0
    };
  }

  const { valid: validSubmissions, invalid: invalidSubmissions } = validateQueue(queueKey);

  if (!Array.isArray(validSubmissions) || validSubmissions.length === 0) {
    console.error(`[DATA SYNC] No valid submissions found for ${surveyType}`);

    if (invalidSubmissions?.length > 0) {
      console.warn(`[DATA SYNC] ${invalidSubmissions.length} invalid record(s) filtered out for ${surveyType}`);
    }

    if (isManual) {
      showUserError(`All ${surveyType} records are invalid. Queue retained for safety.`);
    }

    return {
      ok: false,
      surveyType,
      queueKey,
      successfulCount: 0,
      remainingCount: submissionQueue.length
    };
  }

  if (invalidSubmissions?.length > 0) {
    console.warn(`[DATA SYNC] ${invalidSubmissions.length} invalid record(s) filtered out for ${surveyType}`);
  }

  const payload = {
    submissions: validSubmissions,
    surveyType,
    kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
    timestamp: new Date().toISOString()
  };

  try {
    const syncResult = await sendRequest(SYNC_ENDPOINT, payload);
    console.log(`[DATA SYNC] Server response for ${surveyType}:`, syncResult);

    const successfulIds = Array.isArray(syncResult?.successfulIds) ? syncResult.successfulIds : [];

    if (successfulIds.length === 0) {
      console.warn(`[DATA SYNC] Server returned 0 successful IDs for ${surveyType}. Retaining data.`);
      return {
        ok: false,
        surveyType,
        queueKey,
        successfulCount: 0,
        remainingCount: countUnsyncedRecords(queueKey)
      };
    }

    removeFromQueue(successfulIds, queueKey);
    const remainingCount = countUnsyncedRecords(queueKey);

    console.log(`[DATA SYNC] ✅ ${surveyType} → ${sheetName}: synced ${successfulIds.length}, remaining ${remainingCount}`);

    return {
      ok: true,
      surveyType,
      queueKey,
      successfulCount: successfulIds.length,
      remainingCount
    };
  } catch (error) {
    console.error(`[DATA SYNC] ❌ Queue sync failed for ${surveyType}: ${error.message}`);

    return {
      ok: false,
      surveyType,
      queueKey,
      successfulCount: 0,
      remainingCount: countUnsyncedRecords(queueKey),
      error: error.message
    };
  }
}

// ═══════════════════════════════════════════════════════════
// AUTO SYNC
// ═══════════════════════════════════════════════════════════

/**
 * Runs on a timer - syncs survey data AND analytics silently.
 */
export function autoSync() {
  console.log('[AUTO SYNC] Periodic sync triggered');
  syncData(false, { syncBothQueues: true });
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
  const SYNC_INTERVAL = window.CONSTANTS?.SYNC_INTERVAL_MS || 300000;
  const ANALYTICS_INTERVAL = window.CONSTANTS?.ANALYTICS_SYNC_INTERVAL_MS || 600000;

  stopPeriodicSync();

  periodicSyncTimer = window.setInterval(() => {
    if (isOnline()) {
      console.log('[PERIODIC SYNC] Interval fired — syncing...');
      syncData(false, { syncBothQueues: true });
    } else {
      console.log('[PERIODIC SYNC] Interval fired — offline, skipping.');
    }
  }, SYNC_INTERVAL);

  periodicAnalyticsTimer = window.setInterval(() => {
    if (isOnline()) {
      console.log('[PERIODIC ANALYTICS] Interval fired — syncing analytics...');
      checkAndSyncAnalytics();
    }
  }, ANALYTICS_INTERVAL);

  if (isOnline()) {
    console.log('[PERIODIC SYNC] App start — scheduling initial sync in 3s...');
    initialSyncTimer = window.setTimeout(() => {
      initialSyncTimer = null;
      syncData(false, { syncBothQueues: true });
    }, 3000);
  }

  console.log(`[PERIODIC SYNC] ✅ Timers started — survey every ${SYNC_INTERVAL / 60000}min, analytics every ${ANALYTICS_INTERVAL / 60000}min`);
}

/**
 * Stop the periodic sync timers.
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

  if (initialSyncTimer) {
    clearTimeout(initialSyncTimer);
    initialSyncTimer = null;
    console.log('[PERIODIC SYNC] Initial sync timer cleared.');
  }

  if (statusClearTimer) {
    clearTimeout(statusClearTimer);
    statusClearTimer = null;
  }
}

// ═══════════════════════════════════════════════════════════
// STORAGE QUOTA CHECK
// ═══════════════════════════════════════════════════════════

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
 * Set up window online/offline listeners once.
 * When connection is restored, attempt sync automatically.
 */
export function setupNetworkListeners() {
  if (networkListenersBound) {
    console.log('[NETWORK] Listeners already registered - skipping duplicate bind');
    return;
  }

  onlineHandlerRef = () => {
    console.log('[NETWORK] 🌐 Connection restored — attempting sync...');
    try {
      recordAnalytics('network_restored', { queueSize: getTotalUnsyncedAcrossQueues() });
    } catch (e) {
      // safe to ignore
    }

    window.clearTimeout(initialSyncTimer);
    initialSyncTimer = window.setTimeout(() => {
      initialSyncTimer = null;
      syncData(false, { syncBothQueues: true });
    }, 1000);
  };

  offlineHandlerRef = () => {
    console.log('[NETWORK] 📡 Connection lost — switching to offline mode.');
    try {
      recordAnalytics('network_lost', {});
    } catch (e) {
      // safe to ignore
    }
    updateAdminCount();
  };

  window.addEventListener('online', onlineHandlerRef);
  window.addEventListener('offline', offlineHandlerRef);
  networkListenersBound = true;

  console.log('[NETWORK] ✅ Online/offline listeners registered');
}

export function cleanupNetworkListeners() {
  if (onlineHandlerRef) {
    window.removeEventListener('online', onlineHandlerRef);
    onlineHandlerRef = null;
  }

  if (offlineHandlerRef) {
    window.removeEventListener('offline', offlineHandlerRef);
    offlineHandlerRef = null;
  }

  networkListenersBound = false;
  console.log('[NETWORK] Cleanup complete');
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
  shouldSyncAnalytics,

  // Sync
  syncData,
  autoSync,
  startPeriodicSync,
  stopPeriodicSync,
  checkAndWarnStorageQuota,
  setupNetworkListeners,
  cleanupNetworkListeners
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

const _bootSurveyType = getActiveSurveyType();
const _bootSurveyConfig = getQueueConfigByType(_bootSurveyType);

console.log('═══════════════════════════════════════════════════════');
console.log('🔄 DATA SYNC MODULE LOADED (v3.2.0)');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Active Survey : ${_bootSurveyType}`);
console.log(`  Queue Key     : ${_bootSurveyConfig.queueKey}`);
console.log(`  Network       : ${navigator.onLine ? '🌐 Online' : '📡 Offline'}`);
console.log(`  Sync Endpoint : ${getSyncEndpoint()}`);
console.log('═══════════════════════════════════════════════════════');
