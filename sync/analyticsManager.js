// FILE: sync/analyticsManager.js
// PURPOSE: Analytics event recording and sync to server
// VERSION: 2.3.0
// CHANGES FROM 2.2.0:
//   - FIX 9: recordAnalytics() now receives pre-built events from
//     buildAnalyticsEvent() in contracts.js. If a raw eventType string
//     is passed without a pre-built object (legacy callers), we build
//     the event here as a safety net. Either way the guaranteed base
//     fields (timestamp, kioskId, surveyId, surveyType) are always present.
//     Previously recordAnalytics() assembled the event object itself with
//     no field validation — dropoffByQuestion and avgCompletionTime could
//     silently compute wrong values if callers passed wrong field names.
//   - UNCHANGED: syncAnalytics, _buildPayload, all aggregation logic,
//     ANALYTICS_STORAGE_KEY handling, retry/queue trimming.
// DEPENDENCIES: networkHandler.js, storageUtils.js, window.CONSTANTS

import { sendRequest }         from './networkHandler.js';
import { safeSetLocalStorage, safeGetLocalStorage } from './storageUtils.js';
import { buildAnalyticsEvent } from '../main/contracts.js';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const MAX_ANALYTICS_QUEUE = 500;

function _getStorageKey() {
  return window.CONSTANTS?.STORAGE_KEY_ANALYTICS_V3
    || window.CONSTANTS?.STORAGE_KEY_ANALYTICS
    || 'kioskAnalytics';
}

// ─────────────────────────────────────────────────────────────
// RECORD ANALYTICS
// ─────────────────────────────────────────────────────────────

/**
 * Record an analytics event.
 *
 * PREFERRED call pattern (FIX 9 — all callers migrated to this):
 *   recordAnalytics('survey_completed', buildAnalyticsEvent('survey_completed', { totalTimeSeconds: 42, ... }))
 *   The second argument is the pre-built event object from contracts.js.
 *   buildAnalyticsEvent() already validated required fields and added base fields.
 *   recordAnalytics() merges and stores.
 *
 * LEGACY call pattern (safety net for unmigrated callers):
 *   recordAnalytics('survey_completed', { totalTimeSeconds: 42 })
 *   eventType string is passed as first arg, raw data as second.
 *   buildAnalyticsEvent() is called here as a fallback — field warnings still fire.
 *
 * @param {string} eventType - Event type string
 * @param {Object} data      - Either a pre-built event from buildAnalyticsEvent()
 *                             or a raw data object (legacy callers)
 */
export function recordAnalytics(eventType, data = {}) {
  try {
    // If data already has timestamp + kioskId it was pre-built by buildAnalyticsEvent()
    // and field validation has already run. Merge directly.
    // If not, build it now as a safety net for legacy callers.
    const event = (data.timestamp && data.kioskId)
      ? { eventType, ...data }
      : buildAnalyticsEvent(eventType, data);

    const storageKey = _getStorageKey();
    const analytics  = safeGetLocalStorage(storageKey) || [];

    analytics.push(event);

    // Trim if over cap to prevent unbounded growth
    const trimmed = analytics.length > MAX_ANALYTICS_QUEUE
      ? analytics.slice(-MAX_ANALYTICS_QUEUE)
      : analytics;

    if (analytics.length > MAX_ANALYTICS_QUEUE) {
      console.warn(
        `[ANALYTICS] ⚠️ Queue trimmed from ${analytics.length} to ${MAX_ANALYTICS_QUEUE} events`
      );
    }

    safeSetLocalStorage(storageKey, trimmed);
    console.log(`[ANALYTICS] ✅ Event recorded: "${eventType}" (queue: ${trimmed.length})`);
  } catch (e) {
    console.error('[ANALYTICS] ❌ Failed to record event:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// BUILD ANALYTICS PAYLOAD
// ─────────────────────────────────────────────────────────────

/**
 * Aggregate raw event array into the structured payload the server expects.
 * Field names here must match exactly what analyticsManager reads — these are
 * the same fields that buildAnalyticsEvent() guarantees are present.
 *
 * Aggregation fields used:
 *   a.eventType          — 'survey_completed' | 'survey_abandoned'
 *   a.surveyType         — 'type1' | 'type2' | 'type3'
 *   a.totalTimeSeconds   — number (completions only)
 *   a.questionIndex      — number (abandonments only)
 *   a.questionId         — string (abandonments only)
 *   a.timestamp          — ISO string (always present)
 *   a.kioskId            — string (always present)
 */
function _buildPayload(analytics) {
  const completions  = analytics.filter(a => a.eventType === 'survey_completed');
  const abandonments = analytics.filter(a => a.eventType === 'survey_abandoned');

  // ── Completion time ───────────────────────────────────────────────────────
  const completionTimes = completions
    .map(a => a.totalTimeSeconds)
    .filter(t => typeof t === 'number' && !isNaN(t));

  const avgCompletionTime = completionTimes.length
    ? Math.round(completionTimes.reduce((s, t) => s + t, 0) / completionTimes.length)
    : 0;

  // ── Dropoff by question ───────────────────────────────────────────────────
  const dropoffByQuestion = {};
  abandonments.forEach(a => {
    const qIndex = a.questionIndex !== undefined ? a.questionIndex : '?';
    const qId    = a.questionId    || 'unknown';
    const key    = `q${qIndex}:${qId}`;
    dropoffByQuestion[key] = (dropoffByQuestion[key] || 0) + 1;
  });

  // ── Survey type breakdown ─────────────────────────────────────────────────
  const byType = {};
  analytics.forEach(a => {
    if (!a.surveyType) return;
    if (!byType[a.surveyType]) byType[a.surveyType] = { completed: 0, abandoned: 0 };
    if (a.eventType === 'survey_completed') byType[a.surveyType].completed++;
    if (a.eventType === 'survey_abandoned') byType[a.surveyType].abandoned++;
  });

  // ── Time bucketing ────────────────────────────────────────────────────────
  const byHour = {};
  analytics.forEach(a => {
    if (!a.timestamp) return;
    try {
      const hour = new Date(a.timestamp).getHours();
      byHour[hour] = (byHour[hour] || 0) + 1;
    } catch (_) {}
  });

  return {
    kioskId:         window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
    eventCount:      analytics.length,
    completions:     completions.length,
    abandonments:    abandonments.length,
    avgCompletionTime,
    dropoffByQuestion,
    byType,
    byHour,
    events:          analytics,
    syncedAt:        new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// SYNC ANALYTICS
// ─────────────────────────────────────────────────────────────

/**
 * Sync analytics queue to server.
 * @param {boolean} force - Skip online check if true (for manual triggers)
 * @returns {Promise<boolean>} True if sync succeeded or nothing to sync
 */
export async function syncAnalytics(force = false) {
  if (!force && !navigator.onLine) {
    console.log('[ANALYTICS] Offline — skipping sync');
    return false;
  }

  const storageKey = _getStorageKey();
  const analytics  = safeGetLocalStorage(storageKey) || [];

  if (!analytics.length) {
    console.log('[ANALYTICS] Nothing to sync');
    return true;
  }

  const endpoint = window.CONSTANTS?.ANALYTICS_ENDPOINT;
  if (!endpoint) {
    console.error('[ANALYTICS] ❌ ANALYTICS_ENDPOINT not configured in CONSTANTS');
    return false;
  }

  console.log(`[ANALYTICS] 🔄 Syncing ${analytics.length} events to ${endpoint}...`);

  try {
    const payload = _buildPayload(analytics);
    await sendRequest(endpoint, payload);

    // Clear synced events
    safeSetLocalStorage(storageKey, []);

    console.log(`[ANALYTICS] ✅ Synced ${analytics.length} events — queue cleared`);

    // Record the sync itself as an analytics event (does not recurse —
    // 'analytics_synced' is not aggregated back into the payload)
    recordAnalytics('analytics_synced', buildAnalyticsEvent('analytics_synced', {
      eventCount: analytics.length,
    }));

    return true;
  } catch (error) {
    console.error('[ANALYTICS] ❌ Sync failed:', error.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// COUNT + CLEAR
// ─────────────────────────────────────────────────────────────

export function getAnalyticsCount() {
  const storageKey = _getStorageKey();
  const analytics  = safeGetLocalStorage(storageKey) || [];
  return analytics.length;
}

export function clearAnalyticsQueue() {
  safeSetLocalStorage(_getStorageKey(), []);
  console.log('[ANALYTICS] 🗑️ Analytics queue cleared');
}

export default {
  recordAnalytics,
  syncAnalytics,
  getAnalyticsCount,
  clearAnalyticsQueue,
};
