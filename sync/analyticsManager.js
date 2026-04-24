// FILE: analyticsManager.js
// PURPOSE: Analytics recording and syncing
// VERSION: 2.0.0
// CHANGES FROM 1.x:
//   - ADD: recordAnalytics() resolves analyticsKey dynamically from active
//     survey type via CONSTANTS.SURVEY_TYPES[activeType].analyticsKey
//     Temple (type1/type2) → 'surveyAnalytics' (unchanged behaviour)
//     Café   (type3)       → 'shayonaAnalytics' (isolated storage)
//   - no other logic changes
// DEPENDENCIES: storageUtils.js, networkHandler.js, window.CONSTANTS

import { safeGetLocalStorage, safeSetLocalStorage, updateSyncStatus, showUserError } from './storageUtils.js';
import { sendRequest } from './networkHandler.js';

/**
 * TIMESTAMP STRATEGY:
 * - Survey data uses ISO strings (human-readable, sortable): new Date().toISOString()
 * - Sync tracking uses numeric timestamps (faster comparisons): Date.now()
 * This is intentional for optimal performance and data clarity.
 */

/**
 * Resolve the correct analytics storage key for the currently active survey type.
 * Priority:
 *   1. CONSTANTS.SURVEY_TYPES[activeType].analyticsKey  — type-specific key
 *   2. CONSTANTS.STORAGE_KEY_ANALYTICS                  — global override
 *   3. 'surveyAnalytics'                                — hardcoded fallback
 *
 * This ensures café (type3) events are written to 'shayonaAnalytics' and
 * never mixed into the temple 'surveyAnalytics' store.
 */
function _resolveAnalyticsKey() {
  const activeType = window.KIOSK_CONFIG?.getActiveSurveyType?.() ?? 'type1';
  const typeKey    = window.CONSTANTS?.SURVEY_TYPES?.[activeType]?.analyticsKey;

  return typeKey
    || window.CONSTANTS?.STORAGE_KEY_ANALYTICS
    || 'surveyAnalytics';
}

/**
 * Record analytics event
 * @param {string} eventType - Type of event (survey_completed, survey_abandoned)
 * @param {Object} data - Additional event data
 */
export function recordAnalytics(eventType, data = {}) {
  try {
    const STORAGE_KEY_ANALYTICS = _resolveAnalyticsKey();   // ← dynamic per type
    const MAX_ANALYTICS_SIZE    = window.CONSTANTS?.MAX_ANALYTICS_SIZE || 1000;

    const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
    const timestamp = new Date().toISOString();
    const appState  = window.appState;

    analytics.push({
      timestamp,
      eventType,
      surveyId: appState?.formData?.id,
      kioskId:  window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
      ...data
    });

    // Trim from oldest if over capacity
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

/**
 * Check if analytics should be synced (daily check)
 * @returns {boolean} True if sync is needed
 */
export function shouldSyncAnalytics() {
  const STORAGE_KEY_LAST_ANALYTICS_SYNC = window.CONSTANTS?.STORAGE_KEY_LAST_ANALYTICS_SYNC || 'lastAnalyticsSync';
  const ANALYTICS_SYNC_INTERVAL_MS      = window.CONSTANTS?.ANALYTICS_SYNC_INTERVAL_MS      || 86400000; // 24 hours

  const lastSync = safeGetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC);
  const now      = Date.now();

  return !lastSync || (now - lastSync) >= ANALYTICS_SYNC_INTERVAL_MS;
}

/**
 * Check and sync analytics if interval has passed
 */
export function checkAndSyncAnalytics() {
  if (shouldSyncAnalytics()) {
    syncAnalytics(false);
  }
}

/**
 * Sync analytics data to server.
 * Reads from the active type's analytics key so café and temple
 * analytics are synced independently.
 * @param {boolean} isManual - Whether this is a manual sync (affects UI feedback)
 * @returns {Promise<boolean>} Success status
 */
export async function syncAnalytics(isManual = false) {
  const STORAGE_KEY_ANALYTICS           = _resolveAnalyticsKey();   // ← dynamic per type
  const STORAGE_KEY_LAST_ANALYTICS_SYNC = window.CONSTANTS?.STORAGE_KEY_LAST_ANALYTICS_SYNC || 'lastAnalyticsSync';
  const ANALYTICS_ENDPOINT             = window.CONSTANTS?.ANALYTICS_ENDPOINT              || '/api/sync-analytics';

  if (!navigator.onLine) {
    console.warn('[ANALYTICS SYNC] Offline. Skipping sync.');
    if (isManual) {
      updateSyncStatus('Offline. Analytics sync skipped.');
      showUserError('No internet connection. Analytics sync failed.');
    }
    return false;
  }

  const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS);
  if (!analytics || analytics.length === 0) {
    console.log(`[ANALYTICS SYNC] No data in "${STORAGE_KEY_ANALYTICS}" to sync.`);
    if (isManual) updateSyncStatus('No analytics data to sync.');
    return true;
  }

  console.log(`[ANALYTICS SYNC] Syncing ${analytics.length} records from "${STORAGE_KEY_ANALYTICS}"...`);
  if (isManual) updateSyncStatus(`Syncing ${analytics.length} analytics events... ⏳`);

  // Prepare analytics summary data
  const completions  = analytics.filter(a => a.eventType === 'survey_completed');
  const abandonments = analytics.filter(a => a.eventType === 'survey_abandoned');

  // Calculate drop-off by question
  const dropoffByQuestion = {};
  abandonments.forEach(a => {
    const idx = a.questionIndex !== undefined ? a.questionIndex : '?';
    const qId = a.questionId || 'unknown';
    const key = `q${idx}:${qId}`;
    dropoffByQuestion[key] = (dropoffByQuestion[key] || 0) + 1;
  });

  // Calculate average completion time
  const completionTimes   = completions.map(c => c.totalTimeSeconds).filter(t => t > 0);
  const avgCompletionTime = completionTimes.length > 0
    ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
    : 0;

  const payload = {
    analyticsType:            'summary',
    timestamp:                new Date().toISOString(),
    kioskId:                  window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
    surveyType:               window.KIOSK_CONFIG?.getActiveSurveyType?.() ?? 'type1',  // added for server-side routing
    analyticsKey:             STORAGE_KEY_ANALYTICS,                                    // added for traceability
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
      console.log(`[ANALYTICS SYNC] Success — cleared "${STORAGE_KEY_ANALYTICS}" (${analytics.length} events).`);
      localStorage.removeItem(STORAGE_KEY_ANALYTICS);

      safeSetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC, Date.now());

      if (isManual) {
        updateSyncStatus(`Analytics synced successfully! (${analytics.length} events) ✅`);
        setTimeout(() => updateSyncStatus(''), 4000);
      }

      return true;
    }

    throw new Error('Analytics sync failed — server returned unsuccessful response');

  } catch (error) {
    console.error('[ANALYTICS SYNC] Failed:', error.message);
    if (isManual) {
      updateSyncStatus('Analytics sync failed ⚠️');
      showUserError('Analytics sync failed. Will retry automatically.');
      setTimeout(() => updateSyncStatus(''), 4000);
    }
    return false;
  }
}

export default {
  recordAnalytics,
  shouldSyncAnalytics,
  checkAndSyncAnalytics,
  syncAnalytics,
};
