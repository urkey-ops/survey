// FILE: sync/analyticsManager.js
// PURPOSE: Analytics recording and syncing
// VERSION: 2.1.0
// CHANGES FROM 2.0.1:
//   - FIX 4: Added _resolveAllAnalyticsKeys() — returns all analyticsKey values
//     for the device's allowed survey types. syncAnalytics() now iterates all
//     keys so analytics are not lost when survey type is switched mid-day.
//   - KEEP: _resolveAnalyticsKey() for recordAnalytics() write path — correctly
//     writes to the active type's key at event time.
//   - KEEP: shouldSyncAnalytics() ANALYTICS_SYNC_INTERVAL_MS fallback corrected
//     to match config.js (600000, not 86400000).

import { safeGetLocalStorage, safeSetLocalStorage, updateSyncStatus, showUserError } from './storageUtils.js';
import { sendRequest } from './networkHandler.js';

/**
 * Resolve the analytics storage key for the currently active survey type.
 * Used by recordAnalytics() — writes always go to the active type's key.
 */
function _resolveAnalyticsKey() {
  const activeType = window.KIOSK_CONFIG?.getActiveSurveyType?.() ?? 'type1';
  const typeKey    = window.CONSTANTS?.SURVEY_TYPES?.[activeType]?.analyticsKey;
  return typeKey || window.CONSTANTS?.STORAGE_KEY_ANALYTICS || 'surveyAnalytics';
}

/**
 * FIX 4: Returns all analyticsKey values for the device's allowed survey types.
 * Ensures syncAnalytics() covers all queues even if type was switched mid-day.
 * On a single-type device (shayona), returns one key — identical to previous behaviour.
 */
function _resolveAllAnalyticsKeys() {
  const mode    = window.DEVICECONFIG?.kioskMode;
  const allowed = window.DEVICECONFIG?.CONFIGS?.[mode]?.allowedSurveyTypes
    || [window.KIOSK_CONFIG?.getActiveSurveyType?.() ?? 'type1'];

  return [...new Set(
    allowed
      .map(type => window.CONSTANTS?.SURVEY_TYPES?.[type]?.analyticsKey)
      .filter(Boolean)
  )];
}

export function recordAnalytics(eventType, data = {}) {
  try {
    const STORAGE_KEY_ANALYTICS = _resolveAnalyticsKey();
    const MAX_ANALYTICS_SIZE    = window.CONSTANTS?.MAX_ANALYTICS_SIZE || 500;

    const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
    const timestamp = new Date().toISOString();
    const appState  = window.appState;

   // After:
import { buildAnalyticsEvent } from '../main/contracts.js';
analytics.push(buildAnalyticsEvent(eventType, data));

    if (analytics.length > MAX_ANALYTICS_SIZE) {
      const excess = analytics.length - MAX_ANALYTICS_SIZE;
      analytics.splice(0, excess);
      console.warn(`[ANALYTICS] Trimmed ${excess} oldest event(s) — at capacity (${MAX_ANALYTICS_SIZE})`);
    }

    safeSetLocalStorage(STORAGE_KEY_ANALYTICS, analytics);
    console.log(`[ANALYTICS] Recorded "${eventType}" → key: "${STORAGE_KEY_ANALYTICS}"`);
  } catch (err) {
    console.error('[ANALYTICS] recordAnalytics error:', err);
  }
}

export function shouldSyncAnalytics() {
  const STORAGE_KEY_LAST_ANALYTICS_SYNC = window.CONSTANTS?.STORAGE_KEY_LAST_ANALYTICS_SYNC || 'lastAnalyticsSync';
  const ANALYTICS_SYNC_INTERVAL_MS      = window.CONSTANTS?.ANALYTICS_SYNC_INTERVAL_MS      || 600000;

  const lastSync = safeGetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC);
  const now      = Date.now();
  return !lastSync || (now - lastSync) >= ANALYTICS_SYNC_INTERVAL_MS;
}

export function checkAndSyncAnalytics() {
  if (shouldSyncAnalytics()) {
    syncAnalytics(false);
  }
}

/**
 * FIX 4: Sync analytics for ALL allowed survey types on this device.
 * Each key is synced independently: read → send → clear on success.
 * Replaces the single-key sync from v2.0.1.
 */
export async function syncAnalytics(isManual = false) {
  const STORAGE_KEY_LAST_ANALYTICS_SYNC = window.CONSTANTS?.STORAGE_KEY_LAST_ANALYTICS_SYNC || 'lastAnalyticsSync';
  const ANALYTICS_ENDPOINT             = window.CONSTANTS?.ANALYTICS_ENDPOINT || '/api/sync-analytics';

  if (!navigator.onLine) {
    console.warn('[ANALYTICS SYNC] Offline. Skipping sync.');
    if (isManual) {
      updateSyncStatus('Offline. Analytics sync skipped.');
      showUserError('No internet connection. Analytics sync failed.');
    }
    return false;
  }

  const keys = _resolveAllAnalyticsKeys();
  console.log(`[ANALYTICS SYNC] Syncing ${keys.length} key(s): ${keys.join(', ')}`);

  let anySuccess = false;
  let anyFailure = false;

  for (const STORAGE_KEY_ANALYTICS of keys) {
    const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS);
    if (!analytics || analytics.length === 0) {
      console.log(`[ANALYTICS SYNC] No data in "${STORAGE_KEY_ANALYTICS}" — skipping.`);
      continue;
    }

    console.log(`[ANALYTICS SYNC] Syncing ${analytics.length} records from "${STORAGE_KEY_ANALYTICS}"...`);
    if (isManual) updateSyncStatus(`Syncing ${analytics.length} analytics events from "${STORAGE_KEY_ANALYTICS}"... ⏳`);

    const completions  = analytics.filter(a => a.eventType === 'survey_completed');
    const abandonments = analytics.filter(a => a.eventType === 'survey_abandoned');

    const dropoffByQuestion = {};
    abandonments.forEach(a => {
      const idx = a.questionIndex !== undefined ? a.questionIndex : '?';
      const qId = a.questionId || 'unknown';
      const key = `q${idx}:${qId}`;
      dropoffByQuestion[key] = (dropoffByQuestion[key] || 0) + 1;
    });

    const completionTimes   = completions.map(c => c.totalTimeSeconds).filter(t => t > 0);
    const avgCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;

    const payload = {
      analyticsType:            'summary',
      timestamp:                new Date().toISOString(),
      kioskId:                  window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
      surveyType:               window.KIOSK_CONFIG?.getActiveSurveyType?.() ?? 'type1',
      analyticsKey:             STORAGE_KEY_ANALYTICS,
      totalCompletions:         completions.length,
      totalAbandonments:        abandonments.length,
      completionRate:           completions.length > 0
        ? ((completions.length / (completions.length + abandonments.length)) * 100).toFixed(1)
        : 0,
      avgCompletionTimeSeconds: avgCompletionTime.toFixed(1),
      dropoffByQuestion,
      rawEvents:                analytics,
    };

    try {
      const result = await sendRequest(ANALYTICS_ENDPOINT, payload);

      if (result.success) {
        console.log(`[ANALYTICS SYNC] ✅ Success — cleared "${STORAGE_KEY_ANALYTICS}" (${analytics.length} events).`);
        localStorage.removeItem(STORAGE_KEY_ANALYTICS);
        anySuccess = true;
      } else {
        throw new Error(`Server returned unsuccessful response for key "${STORAGE_KEY_ANALYTICS}"`);
      }
    } catch (error) {
      console.error(`[ANALYTICS SYNC] ❌ Failed for "${STORAGE_KEY_ANALYTICS}":`, error.message);
      anyFailure = true;
    }
  }

  // Update last-sync timestamp only if at least one key succeeded
  if (anySuccess) {
    safeSetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC, Date.now());
  }

  if (isManual) {
    if (anySuccess && !anyFailure) {
      updateSyncStatus('Analytics synced successfully! ✅');
    } else if (anySuccess && anyFailure) {
      updateSyncStatus('Analytics partially synced ⚠️');
      showUserError('Some analytics keys failed to sync. Will retry automatically.');
    } else {
      updateSyncStatus('Analytics sync failed ⚠️');
      showUserError('Analytics sync failed. Will retry automatically.');
    }
    setTimeout(() => updateSyncStatus(''), 4000);
  }

  return anySuccess && !anyFailure;
}

export default {
  recordAnalytics,
  shouldSyncAnalytics,
  checkAndSyncAnalytics,
  syncAnalytics,
};
