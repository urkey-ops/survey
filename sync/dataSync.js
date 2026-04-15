// FILE: sync/dataSync.js
// UPDATED: VERSION 3.0.0 - Passes surveyType in sync payload + uses correct queue per type
// DEPENDENCIES: All sync sub-modules

import {
  generateUUID, safeSetLocalStorage, safeGetLocalStorage,
  showUserError, updatSyncStatus, checkStorageQuota
} from './storageUtils.js';

import {
  getSubmissionQueue, countUnsyncedRecords, updateAdminCount,
  addToQueue, removeFromQueue, clearQueue, validateQueue
} from './queueManager.js';

import {
  recordAnalytics, shouldSyncAnalytics, checkAndSyncAnalytics, syncAnalytics
} from './analyticsManager.js';

import { sendRequest, isOnline } from './networkHandler.js';

// ── Shared state ──
let syncInProgress = false;
let syncQueue = Promise.resolve();

// ─────────────────────────────────────────────────────────────
// SURVEY DATA SYNC
// ─────────────────────────────────────────────────────────────

export function syncData(isManual = false) {
  if (syncInProgress) {
    console.log('[DATA SYNC] Skipped - already in progress');
    return Promise.resolve(false);
  }
  syncQueue = syncQueue.then(() => doSyncData(isManual)).catch(err => {
    console.error('[SYNC QUEUE] Unhandled error:', err);
    syncInProgress = false;
  });
  return syncQueue;
}

async function doSyncData(isManual = false) {
  if (!isOnline()) {
    console.warn('[DATA SYNC] Offline. Skipping sync.');
    if (isManual) {
      updatSyncStatus('Offline. Sync skipped.');
      showUserError('No internet connection. Sync failed.');
    }
    updateAdminCount();
    syncInProgress = false;
    return false;
  }

  const SYNC_ENDPOINT = window.CONSTANTS?.SYNC_ENDPOINT || '/api/submit-survey';
  const STORAGE_KEY_LAST_SYNC = window.CONSTANTS?.STORAGE_KEY_LAST_SYNC || 'lastSync';

  // ── Determine active survey type and its storage key ──
  const surveyType = window.KIOSK_CONFIG?.getActiveSurveyType?.() ||
                     window.CONSTANTS?.ACTIVE_SURVEY_TYPE || 'type1';
  const surveyConfig = window.CONSTANTS?.SURVEY_TYPES?.[surveyType];
  const queueKey = surveyConfig?.storageKey || window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';

  console.log(`[DATA SYNC] Survey type: ${surveyType} | Queue key: ${queueKey}`);

  syncInProgress = true;

  const submissionQueue = getSubmissionQueue(queueKey);

  if (submissionQueue.length === 0) {
    console.log('[DATA SYNC] Submission queue is empty.');
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

    console.log(`[DATA SYNC] Syncing ${submissionQueue.length} submissions (${surveyType})...`);

    const { valid: validSubmissions, invalid: invalidSubmissions } = validateQueue(queueKey);

    if (validSubmissions.length === 0) {
      console.error('[DATA SYNC] No valid submissions found');
      if (isManual) {
        updatSyncStatus('⚠️ All records invalid (missing IDs)');
        showUserError('Data validation failed. Please clear queue and restart.');
      }
      syncInProgress = false;
      return false;
    }

    if (invalidSubmissions.length > 0) {
      console.warn(`[DATA SYNC] ${invalidSubmissions.length} invalid records filtered out`);
    }

    if (isManual) updatSyncStatus(`Syncing ${validSubmissions.length} records... ⏳`);

    // ── Include surveyType in payload so API routes to correct sheet ──
    const payload = {
      submissions: validSubmissions,
      surveyType,                                          // ← KEY ADDITION
      kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
      timestamp: new Date().toISOString()
    };

    const syncResult = await sendRequest(SYNC_ENDPOINT, payload);
    console.log('[DATA SYNC] Server response:', syncResult);

    const successfulIds = syncResult.successfulIds || [];

    if (successfulIds.length === 0) {
      console.warn('[DATA SYNC] Server returned zero successful IDs. Data retained.');
      if (isManual) {
        updatSyncStatus('⚠️ Sync completed but no records confirmed. Check server logs.');
        showUserError('Sync uncertain - records kept in queue for safety.');
      }
      syncInProgress = false;
      return false;
    }

    removeFromQueue(successfulIds, queueKey);
    safeSetLocalStorage(STORAGE_KEY_LAST_SYNC, Date.now());
    updateAdminCount();

    const remainingCount = countUnsyncedRecords(queueKey);

    if (isManual) {
      const statusText = remainingCount === 0
        ? `✅ Sync Complete! ${submissionQueue.length} records cleared to ${surveyConfig?.sheetName || 'Sheet'}.`
        : `⚠️ Partial Sync: ${successfulIds.length} cleared, ${remainingCount} remain.`;
      updatSyncStatus(statusText);
      setTimeout(() => updatSyncStatus(''), 4000);
    }

    syncInProgress = false;
    return true;

  } catch (error) {
    console.error(`[DATA SYNC] PERMANENT FAIL: ${error.message}`);
    if (isManual) {
      updatSyncStatus('❌ Sync Failed - Check Console');
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

export function autoSync() {
  console.log('[AUTO SYNC] Running periodic sync...');
  syncData(false);
  checkAndSyncAnalytics();
}

// ── Expose globally ──
window.dataHandlers = {
  generateUUID, safeSetLocalStorage, safeGetLocalStorage, checkStorageQuota,
  getSubmissionQueue, countUnsyncedRecords, updateAdminCount,
  addToQueue, removeFromQueue, clearQueue,
  recordAnalytics, syncAnalytics, checkAndSyncAnalytics,
  syncData, autoSync
};

export {
  generateUUID, safeSetLocalStorage, safeGetLocalStorage, checkStorageQuota,
  getSubmissionQueue, countUnsyncedRecords, updateAdminCount,
  recordAnalytics, syncAnalytics
};
