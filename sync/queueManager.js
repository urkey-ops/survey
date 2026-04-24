// FILE: sync/queueManager.js
// PURPOSE: Queue access and maintenance for multi-survey offline storage
// VERSION: 3.2.0
// CHANGES FROM 3.1.0:
//   - FIX: getSurveyTypeConfigs() reads ALL keys from CONSTANTS.SURVEY_TYPES
//     dynamically — no longer hardcodes type1 + type2 only.
//     type3 (shayonaQueue) now included in all counts, clears, and validation.
//   - FIX: updateAdminCount() tooltip built dynamically from all type configs
//     instead of hardcoded type1/type2 lookups.
//   - Future-proof: adding type4+ to config.js requires zero changes here.
// DEPENDENCIES: storageUtils.js

import { safeGetLocalStorage, safeSetLocalStorage } from './storageUtils.js';

/**
 * Build the list of all known survey type configs from CONSTANTS.SURVEY_TYPES.
 * Reads keys dynamically — never hardcodes type names.
 * Mirrors the same pattern used in dataSync.js v3.5.0.
 */
function getSurveyTypeConfigs() {
  const surveyTypes = window.CONSTANTS?.SURVEY_TYPES || {};
  const typeKeys    = Object.keys(surveyTypes);

  // If CONSTANTS hasn't loaded yet, return a minimal type1 entry
  if (typeKeys.length === 0) {
    return [{
      surveyType: 'type1',
      queueKey:   window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue'
    }];
  }

  return typeKeys.map(typeKey => {
    const cfg        = surveyTypes[typeKey] || {};
    const fallbackKey = typeKey === 'type1'
      ? (window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue')
      : `${typeKey}Queue`;

    return {
      surveyType: typeKey,
      queueKey:   cfg.storageKey || fallbackKey
    };
  });
}

function resolveActiveSurveyType() {
  return window.KIOSK_CONFIG?.getActiveSurveyType?.() ||
         window.CONSTANTS?.DEFAULT_SURVEY_TYPE ||
         'type1';
}

function getQueueKey(overrideKey) {
  if (overrideKey) return overrideKey;

  if (typeof window.KIOSK_CONFIG?.getQueueKeyForSurveyType === 'function') {
    return window.KIOSK_CONFIG.getQueueKeyForSurveyType(resolveActiveSurveyType());
  }

  const surveyType   = resolveActiveSurveyType();
  const surveyConfig = window.CONSTANTS?.SURVEY_TYPES?.[surveyType];

  return surveyConfig?.storageKey ||
         window.CONSTANTS?.STORAGE_KEY_QUEUE ||
         'submissionQueue';
}

function safeRemoveLocalStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.warn(`[QUEUE] Failed removing localStorage key "${key}":`, e.message);
    return false;
  }
}

function checkQueueHealth(queueSize) {
  const MAX     = window.CONSTANTS?.MAX_QUEUE_SIZE           || 250;
  const WARNING = window.CONSTANTS?.QUEUE_WARNING_THRESHOLD  || 200;

  if (queueSize >= WARNING) {
    console.warn(`⚠️ [QUEUE WARNING] Queue at ${queueSize}/${MAX} records`);
  }
  if (queueSize >= MAX - 50) {
    console.error(`🚨 [QUEUE CRITICAL] Queue nearly full: ${queueSize}/${MAX}`);
  }
}

function normalizeQueue(rawQueue, key) {
  if (!Array.isArray(rawQueue)) return [];

  const seenIds    = new Set();
  const normalized = [];

  rawQueue.forEach((item) => {
    if (!item || typeof item !== 'object') return;

    const id = item.id;
    if (id && seenIds.has(id)) {
      console.warn(`[QUEUE] Duplicate ID filtered from "${key}": ${id}`);
      return;
    }

    if (id) seenIds.add(id);
    normalized.push(item);
  });

  return normalized;
}

/**
 * Returns count + key for every configured survey type.
 * Used by countUnsyncedRecords() and updateAdminCount().
 */
function getCountsByQueue() {
  return getSurveyTypeConfigs().map(({ surveyType, queueKey }) => {
    const queue      = safeGetLocalStorage(queueKey);
    const normalized = normalizeQueue(queue, queueKey);

    // Write back deduplicated version if it changed
    if (Array.isArray(queue) && normalized.length !== queue.length) {
      safeSetLocalStorage(queueKey, normalized);
    }

    return { surveyType, queueKey, count: normalized.length };
  });
}

function hasValidSubmissionIdentity(submission) {
  return !!submission?.id;
}

function hasValidSubmissionTimestamp(submission) {
  return !!(
    submission?.timestamp  ||
    submission?.completedAt ||
    submission?.createdAt   ||
    submission?.submittedAt
  );
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

/**
 * Get submission queue from localStorage.
 * @param {string} [overrideKey] - Optional explicit storage key
 */
export function getSubmissionQueue(overrideKey) {
  const key        = getQueueKey(overrideKey);
  const queue      = safeGetLocalStorage(key);
  const normalized = normalizeQueue(queue, key);

  if (Array.isArray(queue) && normalized.length !== queue.length) {
    safeSetLocalStorage(key, normalized);
  }

  return normalized;
}

/**
 * Count unsynced records.
 * With no key: sums across ALL configured survey types (including type3).
 * With a key:  counts only that specific queue.
 */
export function countUnsyncedRecords(overrideKey) {
  if (overrideKey) {
    return getSubmissionQueue(overrideKey).length;
  }

  return getCountsByQueue().reduce((sum, item) => sum + item.count, 0);
}

/**
 * Update the admin panel unsynced count display.
 * Tooltip lists every type dynamically — no hardcoded type names.
 */
export function updateAdminCount() {
  const counts = getCountsByQueue();
  const total  = counts.reduce((sum, item) => sum + item.count, 0);

  const display =
    window.globals?.unsyncedCountDisplay ||
    document.getElementById('unsyncedCountDisplay');

  if (display) {
    display.textContent = String(total);

    // Build tooltip dynamically from all types
    const nonZero = counts.filter(c => c.count > 0);
    display.title = nonZero.length > 0
      ? nonZero.map(c => `${c.surveyType}: ${c.count}`).join(' | ')
      : 'No unsynced records';
  }

  return total;
}

/**
 * Add submission to queue.
 * @param {Object} submission
 * @param {string} [overrideKey]
 */
export function addToQueue(submission, overrideKey) {
  const key            = getQueueKey(overrideKey);
  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
  let submissionQueue  = getSubmissionQueue(key);

  checkQueueHealth(submissionQueue.length);

  // Deduplicate by id before adding
  if (submission?.id) {
    submissionQueue = submissionQueue.filter(item => item?.id !== submission.id);
  }

  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.error(`🚨 [QUEUE] Full at ${MAX_QUEUE_SIZE} — removing oldest`);
    submissionQueue = submissionQueue.slice(-(MAX_QUEUE_SIZE - 1));
  }

  submissionQueue.push(submission);
  safeSetLocalStorage(key, submissionQueue);

  console.log(`[QUEUE] Added to "${key}". Size: ${submissionQueue.length}/${MAX_QUEUE_SIZE}`);
  updateAdminCount();
}

/**
 * Remove submissions by IDs.
 * @param {string[]} ids
 * @param {string}   [overrideKey]
 */
export function removeFromQueue(ids, overrideKey) {
  const key             = getQueueKey(overrideKey);
  const submissionQueue = getSubmissionQueue(key);

  if (!Array.isArray(ids) || ids.length === 0) {
    console.warn(`[QUEUE] removeFromQueue called with no ids for "${key}"`);
    return 0;
  }

  const idsToRemove  = new Set(ids.filter(Boolean));
  const filteredQueue = submissionQueue.filter(sub => !idsToRemove.has(sub?.id));
  const removedCount  = submissionQueue.length - filteredQueue.length;

  console.log(`[QUEUE] Removed ${removedCount} from "${key}". Remaining: ${filteredQueue.length}`);
  safeSetLocalStorage(key, filteredQueue);
  updateAdminCount();

  return removedCount;
}

/**
 * Clear entire queue.
 * @param {string} [overrideKey]
 */
export function clearQueue(overrideKey) {
  const key       = getQueueKey(overrideKey);
  const queueSize = getSubmissionQueue(key).length;

  const removed = safeRemoveLocalStorage(key);
  if (removed) {
    console.log(`[QUEUE] Cleared ${queueSize} records from "${key}"`);
  }

  updateAdminCount();
  return removed;
}

/**
 * Validate queue submissions — splits into valid / invalid.
 * @param {string} [overrideKey]
 */
export function validateQueue(overrideKey) {
  const key   = getQueueKey(overrideKey);
  const queue = getSubmissionQueue(key);
  const valid   = [];
  const invalid = [];

  queue.forEach((submission) => {
    if (hasValidSubmissionIdentity(submission) && hasValidSubmissionTimestamp(submission)) {
      valid.push(submission);
    } else {
      console.warn('[QUEUE] Invalid submission found:', submission);
      invalid.push(submission);
    }
  });

  if (invalid.length > 0) {
    console.warn(`[QUEUE] Found ${invalid.length} invalid submissions in "${key}"`);
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
