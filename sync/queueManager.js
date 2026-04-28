// FILE: sync/queueManager.js
// PURPOSE: Queue access and maintenance for multi-survey offline storage
// VERSION: 3.4.0
// CHANGES FROM 3.3.0:
//   - FIX 1: Deleted KIOSK_QUEUE_CONFIGS hardcoded map. getSurveyTypeConfigs(mode)
//     now derives queue keys directly from CONSTANTS.SURVEY_TYPES and
//     DEVICECONFIG.allowedSurveyTypes. No localStorage key strings changed.
//   - getQueueKeysForMode(mode) added as the canonical internal helper.
//   - countUnsyncedRecords(overrideKey, mode) — mode arg now correctly
//     passed through to getCountsByQueue for FIX 5 compatibility.
// DEPENDENCIES: storageUtils.js

import { safeGetLocalStorage, safeSetLocalStorage } from './storageUtils.js';

// ─── FIX 1: Derive queue keys from CONSTANTS — no hardcoding ─────────────────
// Authority: CONSTANTS.SURVEY_TYPES[x].storageKey (set in config.js)
// Authority: DEVICECONFIG.CONFIGS[mode].allowedSurveyTypes (set in device-config.js)

function getQueueKeysForMode(mode) {
  const allowed = window.DEVICECONFIG?.CONFIGS?.[mode]?.allowedSurveyTypes || [];
  return allowed
    .map(type => window.CONSTANTS?.SURVEY_TYPES?.[type]?.storageKey)
    .filter(Boolean);
}

function getSurveyTypeConfigs(mode = 'all') {
  const surveyTypes = window.CONSTANTS?.SURVEY_TYPES || {};
  const typeKeys    = Object.keys(surveyTypes);

  if (typeKeys.length === 0) {
    return [{
      surveyType: 'type1',
      queueKey:   window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue',
    }];
  }

  if (mode === 'all') {
    return typeKeys.map(typeKey => {
      const cfg         = surveyTypes[typeKey] || {};
      const fallbackKey = typeKey === 'type1'
        ? (window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue')
        : `${typeKey}Queue`;
      return { surveyType: typeKey, queueKey: cfg.storageKey || fallbackKey };
    });
  }

  // Mode-specific: use DEVICECONFIG.allowedSurveyTypes as the authority
  const allowedKeys = getQueueKeysForMode(mode);

  if (allowedKeys.length === 0) {
    console.warn(`[QUEUE] No allowedSurveyTypes found for mode "${mode}" in DEVICECONFIG — returning empty`);
    return [];
  }

  // Build configs only for allowed types in the correct order
  const allowed = window.DEVICECONFIG?.CONFIGS?.[mode]?.allowedSurveyTypes || [];
  return allowed
    .map(type => {
      const cfg         = surveyTypes[type] || {};
      const fallbackKey = type === 'type1'
        ? (window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue')
        : `${type}Queue`;
      return { surveyType: type, queueKey: cfg.storageKey || fallbackKey };
    })
    .filter(c => c.queueKey);
}

function resolveActiveSurveyType() {
  return window.KIOSK_CONFIG?.getActiveSurveyType?.() ||
         window.DEVICECONFIG?.defaultSurveyType ||
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  if (queueSize >= WARNING) console.warn(`⚠️ [QUEUE WARNING] Queue at ${queueSize}/${MAX} records`);
  if (queueSize >= MAX - 50) console.error(`🚨 [QUEUE CRITICAL] Queue nearly full: ${queueSize}/${MAX}`);
}

function normalizeQueue(rawQueue, key) {
  if (!Array.isArray(rawQueue)) return [];
  const seenIds    = new Set();
  const normalized = [];
  rawQueue.forEach(item => {
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

function hasValidSubmissionIdentity(submission)  { return !!submission?.id; }
function hasValidSubmissionTimestamp(submission) {
  return !!(submission?.timestamp || submission?.completedAt || submission?.createdAt || submission?.submittedAt);
}

// ─── Mode-aware counts ────────────────────────────────────────────────────────

function getCountsByQueue(mode = 'all') {
  return getSurveyTypeConfigs(mode).map(({ surveyType, queueKey }) => {
    const queue      = safeGetLocalStorage(queueKey);
    const normalized = normalizeQueue(queue, queueKey);
    if (Array.isArray(queue) && normalized.length !== queue.length) {
      safeSetLocalStorage(queueKey, normalized);
    }
    return { surveyType, queueKey, count: normalized.length };
  });
}

function getKioskQueues(mode = window.DEVICECONFIG?.kioskMode) {
  if (!mode) {
    console.warn('[QUEUE] getKioskQueues() no mode — using all');
    return getSurveyTypeConfigs('all').map(c => c.queueKey);
  }
  return getSurveyTypeConfigs(mode).map(c => c.queueKey);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export function getSubmissionQueue(overrideKey) {
  const key        = getQueueKey(overrideKey);
  const queue      = safeGetLocalStorage(key);
  const normalized = normalizeQueue(queue, key);
  if (Array.isArray(queue) && normalized.length !== queue.length) {
    safeSetLocalStorage(key, normalized);
  }
  return normalized;
}

export function countUnsyncedRecords(overrideKey, mode) {
  if (overrideKey) {
    return getSubmissionQueue(overrideKey).length;
  }
  // FIX 5: mode arg flows through to getCountsByQueue so temple kiosk
  // with records only in type2 queue correctly returns non-zero total.
  return getCountsByQueue(mode).reduce((sum, item) => sum + item.count, 0);
}

export function updateAdminCount(mode = window.DEVICECONFIG?.kioskMode) {
  const counts = getCountsByQueue(mode);
  const total  = counts.reduce((sum, item) => sum + item.count, 0);

  const display = window.globals?.unsyncedCountDisplay || document.getElementById('unsyncedCountDisplay');
  if (display) {
    display.textContent = String(total);
    const nonZero = counts.filter(c => c.count > 0);
    display.title = nonZero.length > 0
      ? `${mode || 'All'}: ${nonZero.map(c => `${c.surveyType}: ${c.count}`).join(' | ')}`
      : `No unsynced records (${mode || 'all'})`;
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
    const dropCount = submissionQueue.length - (MAX_QUEUE_SIZE - 1);
    console.error(`🚨 [QUEUE] Full at ${submissionQueue.length}/${MAX_QUEUE_SIZE} — dropping ${dropCount} oldest`);
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
  const removed   = safeRemoveLocalStorage(key);
  if (removed) console.log(`[QUEUE] Cleared ${queueSize} records from "${key}"`);
  updateAdminCount();
  return removed;
}

export function validateQueue(overrideKey) {
  const key   = getQueueKey(overrideKey);
  const queue = getSubmissionQueue(key);
  const valid   = [];
  const invalid = [];

  queue.forEach(submission => {
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

export function getAllQueueConfigsWithData(mode = 'all') {
  return getCountsByQueue(mode);
}

export default {
  getSubmissionQueue,
  countUnsyncedRecords,
  updateAdminCount,
  addToQueue,
  removeFromQueue,
  clearQueue,
  validateQueue,
  getKioskQueues,
  getAllQueueConfigsWithData,
};
