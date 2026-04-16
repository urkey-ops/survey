// FILE: sync/queueManager.js
// PURPOSE: Queue access and maintenance for dual-survey offline storage
// VERSION: 3.1.0
// FIXES:
//   - centralizes queue key resolution through config helpers
//   - safely handles localStorage remove failures
//   - validates both legacy and current timestamp fields
//   - keeps admin counts accurate across both queues
//   - deduplicates queue records by id when reading malformed storage
// DEPENDENCIES: storageUtils.js

import { safeGetLocalStorage, safeSetLocalStorage } from './storageUtils.js';

function getSurveyTypeConfigs() {
  const surveyTypes = window.CONSTANTS?.SURVEY_TYPES || {};

  return [
    {
      surveyType: 'type1',
      queueKey:
        surveyTypes?.type1?.storageKey ||
        window.CONSTANTS?.STORAGE_KEY_QUEUE ||
        'submissionQueue'
    },
    {
      surveyType: 'type2',
      queueKey:
        surveyTypes?.type2?.storageKey ||
        window.CONSTANTS?.STORAGE_KEY_QUEUE_V2 ||
        'submissionQueueV2'
    }
  ];
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

  const surveyType = resolveActiveSurveyType();
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
  const MAX = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
  const WARNING = window.CONSTANTS?.QUEUE_WARNING_THRESHOLD || 200;

  if (queueSize >= WARNING) {
    console.warn(`⚠️ [QUEUE WARNING] Queue at ${queueSize}/${MAX} records`);
  }

  if (queueSize >= MAX - 50) {
    console.error(`🚨 [QUEUE CRITICAL] Queue nearly full: ${queueSize}/${MAX}`);
  }
}

function normalizeQueue(rawQueue, key) {
  if (!Array.isArray(rawQueue)) {
    return [];
  }

  const seenIds = new Set();
  const normalized = [];

  rawQueue.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const id = item.id;
    if (id && seenIds.has(id)) {
      console.warn(`[QUEUE] Duplicate ID filtered from "${key}": ${id}`);
      return;
    }

    if (id) {
      seenIds.add(id);
    }

    normalized.push(item);
  });

  return normalized;
}

function getCountsByQueue() {
  return getSurveyTypeConfigs().map(({ surveyType, queueKey }) => {
    const queue = safeGetLocalStorage(queueKey);
    const normalized = normalizeQueue(queue, queueKey);

    if (Array.isArray(queue) && normalized.length !== queue.length) {
      safeSetLocalStorage(queueKey, normalized);
    }

    return {
      surveyType,
      queueKey,
      count: normalized.length
    };
  });
}

function hasValidSubmissionIdentity(submission) {
  return !!submission?.id;
}

function hasValidSubmissionTimestamp(submission) {
  return !!(
    submission?.timestamp ||
    submission?.completedAt ||
    submission?.createdAt ||
    submission?.submittedAt
  );
}

/**
 * Get submission queue from localStorage
 * @param {string} [overrideKey] - Optional explicit storage key
 */
export function getSubmissionQueue(overrideKey) {
  const key = getQueueKey(overrideKey);
  const queue = safeGetLocalStorage(key);
  const normalized = normalizeQueue(queue, key);

  if (Array.isArray(queue) && normalized.length !== queue.length) {
    safeSetLocalStorage(key, normalized);
  }

  return normalized;
}

export function countUnsyncedRecords(overrideKey) {
  if (overrideKey) {
    return getSubmissionQueue(overrideKey).length;
  }

  return getCountsByQueue().reduce((sum, item) => sum + item.count, 0);
}

export function updateAdminCount() {
  const counts = getCountsByQueue();
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  const display =
    window.globals?.unsyncedCountDisplay ||
    document.getElementById('unsyncedCountDisplay');

  if (display) {
    display.textContent = String(total);

    const type1 = counts.find(c => c.surveyType === 'type1')?.count || 0;
    const type2 = counts.find(c => c.surveyType === 'type2')?.count || 0;

    display.title =
      type1 > 0 || type2 > 0
        ? `Type 1: ${type1} | Type 2: ${type2}`
        : 'No unsynced records';
  }

  return total;
}

/**
 * Add submission to queue
 * @param {Object} submission
 * @param {string} [overrideKey]
 */
export function addToQueue(submission, overrideKey) {
  const key = getQueueKey(overrideKey);
  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
  let submissionQueue = getSubmissionQueue(key);

  checkQueueHealth(submissionQueue.length);

  if (submission?.id) {
    submissionQueue = submissionQueue.filter(item => item?.id !== submission.id);
  }

  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.error(`🚨 [QUEUE] Full at ${MAX_QUEUE_SIZE} - removing oldest`);
    submissionQueue = submissionQueue.slice(-(MAX_QUEUE_SIZE - 1));
  }

  submissionQueue.push(submission);
  safeSetLocalStorage(key, submissionQueue);

  console.log(`[QUEUE] Added to "${key}". Size: ${submissionQueue.length}/${MAX_QUEUE_SIZE}`);
  updateAdminCount();
}

/**
 * Remove submissions by IDs
 * @param {Array} ids
 * @param {string} [overrideKey]
 */
export function removeFromQueue(ids, overrideKey) {
  const key = getQueueKey(overrideKey);
  const submissionQueue = getSubmissionQueue(key);

  if (!Array.isArray(ids) || ids.length === 0) {
    console.warn(`[QUEUE] removeFromQueue called with no ids for "${key}"`);
    return 0;
  }

  const idsToRemove = new Set(ids.filter(Boolean));
  const filteredQueue = submissionQueue.filter(sub => !idsToRemove.has(sub?.id));
  const removedCount = submissionQueue.length - filteredQueue.length;

  console.log(`[QUEUE] Removed ${removedCount} from "${key}". Remaining: ${filteredQueue.length}`);
  safeSetLocalStorage(key, filteredQueue);
  updateAdminCount();

  return removedCount;
}

/**
 * Clear entire queue
 * @param {string} [overrideKey]
 */
export function clearQueue(overrideKey) {
  const key = getQueueKey(overrideKey);
  const queueSize = getSubmissionQueue(key).length;

  const removed = safeRemoveLocalStorage(key);
  if (removed) {
    console.log(`[QUEUE] Cleared ${queueSize} records from "${key}"`);
  }

  updateAdminCount();
  return removed;
}

/**
 * Validate queue submissions
 * @param {string} [overrideKey]
 */
export function validateQueue(overrideKey) {
  const key = getQueueKey(overrideKey);
  const queue = getSubmissionQueue(key);
  const valid = [];
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
