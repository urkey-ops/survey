// FILE: sync/queueManager.js
// PURPOSE: Queue access and maintenance for multi-survey offline storage
// VERSION: 3.2.1
// CHANGES FROM 3.2.0:
//   - FIX B2-07: Queue overflow now logs the actual number of records dropped,
//     not just 'removing oldest' (which implied only one was removed).
//     slice(-(MAX_QUEUE_SIZE-1)) can drop many records silently if queue
//     grew beyond MAX_QUEUE_SIZE through a race or config change.
// DEPENDENCIES: storageUtils.js

import { safeGetLocalStorage, safeSetLocalStorage } from './storageUtils.js';

function getSurveyTypeConfigs() {
  const surveyTypes = window.CONSTANTS?.SURVEY_TYPES || {};
  const typeKeys    = Object.keys(surveyTypes);

  if (typeKeys.length === 0) {
    return [{
      surveyType: 'type1',
      queueKey:   window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue'
    }];
  }

  return typeKeys.map(typeKey => {
    const cfg         = surveyTypes[typeKey] || {};
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
  const MAX     = window.CONSTANTS?.MAX_QUEUE_SIZE          || 250;
  const WARNING = window.CONSTANTS?.QUEUE_WARNING_THRESHOLD || 200;

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

function getCountsByQueue() {
  return getSurveyTypeConfigs().map(({ surveyType, queueKey }) => {
    const queue      = safeGetLocalStorage(queueKey);
    const normalized = normalizeQueue(queue, queueKey);

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
    submission?.timestamp   ||
    submission?.completedAt ||
    submission?.createdAt   ||
    submission?.submittedAt
  );
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

export function getSubmissionQueue(overrideKey) {
  const key        = getQueueKey(overrideKey);
  const queue      = safeGetLocalStorage(key);
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
  const total  = counts.reduce((sum, item) => sum + item.count, 0);

  const display =
    window.globals?.unsyncedCountDisplay ||
    document.getElementById('unsyncedCountDisplay');

  if (display) {
    display.textContent = String(total);

    const nonZero = counts.filter(c => c.count > 0);
    display.title = nonZero.length > 0
      ? nonZero.map(c => `${c.surveyType}: ${c.count}`).join(' | ')
      : 'No unsynced records';
  }

  return total;
}

export function addToQueue(submission, overrideKey) {
  const key            = getQueueKey(overrideKey);
  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
  let submissionQueue  = getSubmissionQueue(key);

  checkQueueHealth(submissionQueue.length);

  if (submission?.id) {
    submissionQueue = submissionQueue.filter(item => item?.id !== submission.id);
  }

  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    // FIX B2-07: Log actual drop count — slice(-(MAX_QUEUE_SIZE-1)) can drop
    // many records if queue somehow grew beyond MAX_QUEUE_SIZE.
    const dropCount = submissionQueue.length - (MAX_QUEUE_SIZE - 1);
    console.error(`🚨 [QUEUE] Full at ${submissionQueue.length}/${MAX_QUEUE_SIZE} — removing ${dropCount} oldest record(s)`);
    submissionQueue = submissionQueue.slice(-(MAX_QUEUE_SIZE - 1));
  }

  submissionQueue.push(submission);
  safeSetLocalStorage(key, submissionQueue);

  console.log(`[QUEUE] Added to "${key}". Size: ${submissionQueue.length}/${MAX_QUEUE_SIZE}`);
  updateAdminCount();
}

export function removeFromQueue(ids, overrideKey) {
  const key             = getQueueKey(overrideKey);
  const submissionQueue = getSubmissionQueue(key);

  if (!Array.isArray(ids) || ids.length === 0) {
    console.warn(`[QUEUE] removeFromQueue called with no ids for "${key}"`);
    return 0;
  }

  const idsToRemove   = new Set(ids.filter(Boolean));
  const filteredQueue = submissionQueue.filter(sub => !idsToRemove.has(sub?.id));
  const removedCount  = submissionQueue.length - filteredQueue.length;

  console.log(`[QUEUE] Removed ${removedCount} from "${key}". Remaining: ${filteredQueue.length}`);
  safeSetLocalStorage(key, filteredQueue);
  updateAdminCount();

  return removedCount;
}

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
