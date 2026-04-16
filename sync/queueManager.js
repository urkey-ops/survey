// FILE: sync/queueManager.js
// UPDATED: VERSION 3.0.0 - All functions accept optional queueKey parameter
// for Survey Type 2 support (separate localStorage queue per survey type)
// DEPENDENCIES: storageUtils.js

import { safeGetLocalStorage, safeSetLocalStorage } from './storageUtils.js';

function getQueueKey(overrideKey) {
  // If a key is passed explicitly, use it.
  // Otherwise resolve from active survey type config.
  if (overrideKey) return overrideKey;
  const surveyType = window.KIOSK_CONFIG?.getActiveSurveyType?.() ||
                     window.CONSTANTS?.ACTIVE_SURVEY_TYPE || 'type1';
  const surveyConfig = window.CONSTANTS?.SURVEY_TYPES?.[surveyType];
  return surveyConfig?.storageKey || window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
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

/**
 * Get submission queue from localStorage
 * @param {string} [overrideKey] - Optional explicit storage key
 */
export function getSubmissionQueue(overrideKey) {
  const key = getQueueKey(overrideKey);
  const queue = safeGetLocalStorage(key);
  return Array.isArray(queue) ? queue : [];
}

export function countUnsyncedRecords(overrideKey) {
  return getSubmissionQueue(overrideKey).length;
}

export function updateAdminCount() {
  // Show combined count across both queues in admin
  const type1Key = window.CONSTANTS?.SURVEY_TYPES?.type1?.storageKey || 'submissionQueue';
  const type2Key = window.CONSTANTS?.SURVEY_TYPES?.type2?.storageKey || 'submissionQueueV2';
  const count1 = (safeGetLocalStorage(type1Key) || []).length;
  const count2 = (safeGetLocalStorage(type2Key) || []).length;
  const total = count1 + count2;

  const display = document.getElementById('unsyncedCountDisplay');
  if (display) {
    display.textContent = total;
    // Show breakdown if both have data
    if (count1 > 0 && count2 > 0) {
      display.title = `Type 1: ${count1} | Type 2: ${count2}`;
    }
  }
}

/**
 * Add submission to queue (uses active survey type's queue key)
 * @param {Object} submission
 * @param {string} [overrideKey]
 */
export function addToQueue(submission, overrideKey) {
  const key = getQueueKey(overrideKey);
  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
  let submissionQueue = getSubmissionQueue(key);

  checkQueueHealth(submissionQueue.length);

  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.error(`🚨 [QUEUE] Full at ${MAX_QUEUE_SIZE} - removing oldest`);
    submissionQueue.shift();
  }

  submissionQueue.push(submission);
  safeSetLocalStorage(key, submissionQueue);
  console.log(`[QUEUE] Added to "${key}". Size: ${submissionQueue.length}/${MAX_QUEUE_SIZE}`);
}

/**
 * Remove submissions by IDs
 * @param {Array} ids
 * @param {string} [overrideKey]
 */
export function removeFromQueue(ids, overrideKey) {
  const key = getQueueKey(overrideKey);
  const submissionQueue = getSubmissionQueue(key);
  const idsToRemove = new Set(ids);
  const filteredQueue = submissionQueue.filter(sub => !idsToRemove.has(sub.id));
  const removedCount = submissionQueue.length - filteredQueue.length;
  console.log(`[QUEUE] Removed ${removedCount} from "${key}". Remaining: ${filteredQueue.length}`);
  safeSetLocalStorage(key, filteredQueue);
  updateAdminCount();
}

/**
 * Clear entire queue
 * @param {string} [overrideKey]
 */
export function clearQueue(overrideKey) {
  const key = getQueueKey(overrideKey);
  const queueSize = getSubmissionQueue(key).length;
  localStorage.removeItem(key);
  console.log(`[QUEUE] Cleared ${queueSize} records from "${key}"`);
  updateAdminCount();
}

/**
 * Validate queue submissions
 * @param {string} [overrideKey]
 */
export function validateQueue(overrideKey) {
  const queue = getSubmissionQueue(overrideKey);
  const valid = [];
  const invalid = [];
  queue.forEach(submission => {
    if (submission.id && submission.timestamp) {
      valid.push(submission);
    } else {
      console.warn('[QUEUE] Invalid submission found:', submission);
      invalid.push(submission);
    }
  });
  if (invalid.length > 0) console.warn(`[QUEUE] Found ${invalid.length} invalid submissions`);
  return { valid, invalid };
}

export default {
  getSubmissionQueue, countUnsyncedRecords, updateAdminCount,
  addToQueue, removeFromQueue, clearQueue, validateQueue
};
