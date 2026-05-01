// FILE: sync/queueManager.js
// PURPOSE: Queue access and maintenance for multi-survey offline storage
// VERSION: 3.4.2
// CHANGES FROM 3.4.1:
//   - FIX T2: Removed all inline window.CONSTANTS?.MAX_QUEUE_SIZE || 250 reads.
//     Replaced with a single module-level IIFE that resolves MAX_QUEUE_SIZE once
//     at load time and emits console.warn if the CONSTANTS fallback is used.
//     Previously the fallback was silent — if CONSTANTS was not loaded (load order
//     issue, script error), the queue operated at 250 with no indication the
//     authoritative value was missed. checkQueueHealth also had two inline reads
//     that are now replaced with the module-level constant.
//   - FIX L5: In addToQueue(), after the queue-full slice, added a call to
//     window.flagStorageAlert() so staff receive a persistent admin panel banner
//     when records are dropped. Previously only console.error was logged — in a
//     Guided Access kiosk environment staff cannot see the console, so data loss
//     was invisible until a sync discrepancy was noticed manually.
// DEPENDENCIES: storageUtils.js

import { safeGetLocalStorage, safeSetLocalStorage } from './storageUtils.js';

// ─── FIX T2: Centralised MAX_QUEUE_SIZE resolution ───────────────────────────
// Resolved once at module load. Emits a warning if CONSTANTS is not available
// so the fallback is never silent. All addToQueue / checkQueueHealth calls below
// reference this constant — no inline || 250 fallbacks remain in the file.
const MAX_QUEUE_SIZE = (() => {
  const val = window.CONSTANTS?.MAX_QUEUE_SIZE;
  if (val == null) {
    console.warn('[QUEUE] CONSTANTS.MAX_QUEUE_SIZE not found — using fallback 250. ' +
      'Ensure constants.js loads before queueManager.js.');
    return 250;
  }
  return val;
})();

// ─── FIX 1: Support flat DEVICECONFIG and CONFIGS shapes ────────────────────

/**
 * Smoke check for DEVICECONFIG shape — logs early if config is invalid.
 * Called once at startup to surface mismatches between config and queueManager.
 */
function smokeCheckDeviceConfigShape() {
  if (!window.DEVICECONFIG) {
    console.error('[QUEUE] ⚠️ DEVICECONFIG is not defined — queue configs may be broken');
    return;
  }
  if (!window.DEVICECONFIG.kioskMode) {
    console.error('[QUEUE] ⚠️ DEVICECONFIG.kioskMode missing — may cause queue lookup issues');
  }
  if (!window.DEVICECONFIG.allowedSurveyTypes && !window.DEVICECONFIG.CONFIGS) {
    console.error(
      '[QUEUE] ⚠️ DEVICECONFIG has no allowedSurveyTypes or CONFIGS — ' +
      'queues for this mode may be empty'
    );
  }
}

/**
 * Get queue keys for a given mode, using flat DEVICECONFIG or CONFIGS shapes.
 * Authority: CONSTANTS.SURVEY_TYPES[type].storageKey (from config.js)
 * Authority: DEVICECONFIG.allowedSurveyTypes or DEVICECONFIG.CONFIGS[mode].allowedSurveyTypes
 */
function getQueueKeysForMode(mode) {
  if (!window.DEVICECONFIG) {
    console.error(`[QUEUE] ⚠️ DEVICECONFIG not initialized for mode "${mode}"`);
    return [];
  }

  // If DEVICECONFIG has a CONFIGS.[mode] node, prefer that; otherwise use flat properties.
  const base =
    window.DEVICECONFIG?.CONFIGS?.[mode] ||
    window.DEVICECONFIG;

  const allowed = base?.allowedSurveyTypes || [];

  if (!allowed.length) {
    console.warn(`[QUEUE] No allowedSurveyTypes found for mode "${mode}" — returning empty`);
    return [];
  }

  return allowed
    .map(type => window.CONSTANTS?.SURVEY_TYPES?.[type]?.storageKey)
    .filter(Boolean);
}

/**
 * Resolve survey‑type configs for a given mode or "all".
 * Mode‑specific configs use DEVICECONFIG.allowedSurveyTypes or DEVICECONFIG.CONFIGS[mode].allowedSurveyTypes.
 */
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

  // Mode‑specific: use allowedSurveyTypes from DEVICECONFIG (flat) or CONFIGS[mode].
  const allowedKeys = getQueueKeysForMode(mode);

  if (allowedKeys.length === 0) {
    console.warn(`[QUEUE] No allowedSurveyTypes found for mode "${mode}" in DEVICECONFIG — returning empty`);
    return [];
  }

  const base =
    window.DEVICECONFIG?.CONFIGS?.[mode] ||
    window.DEVICECONFIG;

  const allowed = base?.allowedSurveyTypes || [];

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

/**
 * Resolve the currently active survey type.
 * Use KIOSK_CONFIG.getActiveSurveyType first, then DEVICECONFIG default, then fallback.
 */
function resolveActiveSurveyType() {
  return window.KIOSK_CONFIG?.getActiveSurveyType?.() ||
         window.DEVICECONFIG?.defaultSurveyType ||
         window.CONSTANTS?.DEFAULT_SURVEY_TYPE ||
         'type1';
}

/**
 * Get the primary queue key for the current survey type, optionally overriding with a key.
 * If no override is given, looks up the survey type via resolveActiveSurveyType.
 */
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

/**
 * Safely remove a localStorage key.
 */
function safeRemoveLocalStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.warn(`[QUEUE] Failed removing localStorage key "${key}":`, e.message);
    return false;
  }
}

/**
 * Emit a warning or error if queue size is near capacity.
 * FIX T2: Uses module-level MAX_QUEUE_SIZE constant — no inline fallback reads.
 */
function checkQueueHealth(queueSize) {
  const WARNING = window.CONSTANTS?.QUEUE_WARNING_THRESHOLD || 200;
  if (queueSize >= WARNING)      console.warn(`⚠️ [QUEUE WARNING] Queue at ${queueSize}/${MAX_QUEUE_SIZE} records`);
  if (queueSize >= MAX_QUEUE_SIZE - 50) console.error(`🚨 [QUEUE CRITICAL] Queue nearly full: ${queueSize}/${MAX_QUEUE_SIZE}`);
}

/**
 * Normalize a queue array: remove invalid items, deduplicate by ID.
 */
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

/**
 * Check if a submission has a valid identity (non‑falsy ID).
 */
function hasValidSubmissionIdentity(submission) {
  return !!submission?.id;
}

/**
 * Check if a submission has a valid timestamp (or equivalent field).
 */
function hasValidSubmissionTimestamp(submission) {
  return !!(submission?.timestamp || submission?.completedAt || submission?.createdAt || submission?.submittedAt);
}

// ─── Mode‑aware counts ────────────────────────────────────────────────────────

/**
 * Get counts for each queue keyed by surveyType and queueKey, for a given mode.
 */
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

/**
 * Get all queue keys for the current kiosk mode, or for all modes if mode is unset.
 */
function getKioskQueues(mode = window.DEVICECONFIG?.kioskMode) {
  if (!mode) {
    console.warn('[QUEUE] getKioskQueues() no mode — using all');
    return getSurveyTypeConfigs('all').map(c => c.queueKey);
  }
  return getSurveyTypeConfigs(mode).map(c => c.queueKey);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Get the normalized submission queue for a given queue key or override.
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
 * Count unsynced records, optionally for a specific queue key or mode.
 */
export function countUnsyncedRecords(overrideKey, mode) {
  if (overrideKey) {
    return getSubmissionQueue(overrideKey).length;
  }
  // FIX 5: mode arg flows through to getCountsByQueue so temple kiosk
  // with records only in type2 queue correctly returns non-zero total.
  return getCountsByQueue(mode).reduce((sum, item) => sum + item.count, 0);
}

/**
 * Update the admin UI's unsynced count for the current mode.
 */
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

/**
 * Add a submission to the specified queue (or key).
 */
export function addToQueue(submission, overrideKey) {
  const key           = getQueueKey(overrideKey);
  let submissionQueue = getSubmissionQueue(key);

  checkQueueHealth(submissionQueue.length);

  if (submission?.id) {
    submissionQueue = submissionQueue.filter(item => item?.id !== submission.id);
  }

  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    const dropCount = submissionQueue.length - (MAX_QUEUE_SIZE - 1);
    // FIX L5: Keep console.error for developer visibility, and also call
    // window.flagStorageAlert() to surface a persistent banner in the admin
    // panel — the only staff-visible notification in Guided Access kiosk mode.
    console.error(`🚨 [QUEUE] Full at ${submissionQueue.length}/${MAX_QUEUE_SIZE} — dropping ${dropCount} oldest`);
    submissionQueue = submissionQueue.slice(-(MAX_QUEUE_SIZE - 1));
    if (typeof window.flagStorageAlert === 'function') {
      window.flagStorageAlert(`Queue full — dropped ${dropCount} oldest record(s)`);
    }
  }

  submissionQueue.push(submission);
  const saved = safeSetLocalStorage(key, submissionQueue);
  console.log(`[QUEUE] Added to "${key}". Size: ${submissionQueue.length}/${MAX_QUEUE_SIZE}`);
  updateAdminCount();
  return saved !== false;
}

/**
 * Remove submissions by ID from the specified queue (or key).
 */
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

/**
 * Clear an entire queue for a given key.
 */
export function clearQueue(overrideKey) {
  const key       = getQueueKey(overrideKey);
  const queueSize = getSubmissionQueue(key).length;
  const removed   = safeRemoveLocalStorage(key);
  if (removed) console.log(`[QUEUE] Cleared ${queueSize} records from "${key}"`);
  updateAdminCount();
  return removed;
}

/**
 * Validate all submissions in a queue for minimal required fields.
 */
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

/**
 * Get all queue configs with current record counts for a given mode.
 */
export function getAllQueueConfigsWithData(mode = 'all') {
  return getCountsByQueue(mode);
}

/**
 * Call this once on startup to check that DEVICECONFIG shape is what queueManager expects.
 */
export function initQueueManager() {
  smokeCheckDeviceConfigShape();
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
  initQueueManager,
};
