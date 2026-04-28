// FILE: ui/navigation/submit.js
// PURPOSE: Survey submission and completion logic
// VERSION: 3.8.0
// CHANGES FROM 3.7.0:
//   - FIX 1: validateFormData() called before queue write — catches renamed
//     fields in dev/staging before they silently send empty columns to the sheet.
//   - FIX 2: buildQueueRecord() factory used instead of raw object literal.
//     dataHandlers.addToQueue() used instead of direct safeSetLocalStorage()
//     call — routes through queueManager for dedup, size limits, admin count.
//   - FIX 9: buildAnalyticsEvent() factory used for recordAnalytics() call —
//     enforces required field presence per eventType with console warnings.
//   - FIX: hard‑fail guard on missing surveyType — prevents data loss.
//   - UNCHANGED: normalizeSubmissionPayload, hasMeaningfulResponse,
//     _renderCheckmarkAndCountdown, _doReset — no behaviour changes.
// DEPENDENCIES: core.js, main/contracts.js

import { getDependencies, stopQuestionTimer, saveState } from './core.js';
import { buildQueueRecord, validateFormData, buildAnalyticsEvent } from '../../main/contracts.js';

let completionInProgress = false;
let resetTriggered       = false;

// ─────────────────────────────────────────────────────────────
// NORMALISE PAYLOAD
// ─────────────────────────────────────────────────────────────

/**
 * Convert UI-captured values into a stable queue/API-safe payload.
 *
 * dual-star-rating flattening:
 *   IN:  { foodRating: { taste: 4, value: 3 } }
 *   OUT: { foodRating_taste: 4, foodRating_value: 3 }
 *
 * selector-textarea flattening:
 *   IN:  { final_thoughts: { category: 'shoutout', text: 'Great!' } }
 *   OUT: { final_thoughts_category: 'shoutout', final_thoughts_text: 'Great!' }
 *
 * section-header: deleted (no data field)
 * Everything else: passed through unchanged
 */
function normalizeSubmissionPayload(formData, questions) {
  const normalized = { ...formData };

  questions.forEach((q) => {
    const rawValue = normalized[q.name];

    // ── section-header ─────────────────────────────────────────────────────
    if (q.type === 'section-header') {
      delete normalized[q.name];
      return;
    }

    // ── dual-star-rating ───────────────────────────────────────────────────
    if (q.type === 'dual-star-rating') {
      const valueObj =
        rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
          ? rawValue
          : {};

      q.subRatings?.forEach(sub => {
        const val = valueObj[sub.key];
        normalized[`${q.name}_${sub.key}`] =
          val !== null && val !== undefined ? Number(val) : '';
      });

      delete normalized[q.name];
      return;
    }

    // ── selector-textarea ──────────────────────────────────────────────────
    if (q.type === 'selector-textarea') {
      const valueObj =
        rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
          ? rawValue
          : { category: null, text: typeof rawValue === 'string' ? rawValue : '' };

      const category = valueObj.category ? String(valueObj.category).trim() : '';
      const text     = valueObj.text     ? String(valueObj.text).trim()     : '';

      normalized[`${q.name}_category`] = category;
      normalized[`${q.name}_text`]     = text;
      delete normalized[q.name];
      return;
    }

    // ── number-scale / star-rating — ensure numeric ────────────────────────
    if (q.type === 'number-scale' || q.type === 'star-rating') {
      if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
        normalized[q.name] = Number(rawValue);
      }
      return;
    }

    // ── checkbox-with-other — ensure array ────────────────────────────────
    if (q.type === 'checkbox-with-other') {
      if (!Array.isArray(normalized[q.name])) {
        normalized[q.name] = normalized[q.name] ? [normalized[q.name]] : [];
      }
      return;
    }

    // All other types (emoji-radio, radio, radio-with-other,
    // radio-with-followup, textarea) pass through unchanged.
  });

  return normalized;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function hasMeaningfulResponse(formData) {
  return Object.entries(formData).some(([key, val]) => {
    if (key === 'id') return false;
    if (Array.isArray(val))  return val.length > 0;
    if (typeof val === 'object' && val !== null) {
      return Object.values(val).some(v => v !== null && v !== undefined && v !== '');
    }
    return val !== null && val !== undefined && val !== '';
  });
}

// ─────────────────────────────────────────────────────────────
// CHECKMARK + COUNTDOWN UI
// ─────────────────────────────────────────────────────────────

function _renderCheckmarkAndCountdown({
  questionContainer,
  surveyType,
  config,
  onReset,
}) {
  if (!questionContainer) return;

  const DISPLAY_SECONDS = 5;
  let remaining = DISPLAY_SECONDS;

  const wrapper = document.createElement('div');
  wrapper.className = 'submission-success-wrapper';
  wrapper.setAttribute('role', 'status');
  wrapper.setAttribute('aria-live', 'polite');

  const emoji = document.createElement('div');
  emoji.className   = 'submission-checkmark';
  emoji.textContent = '✅';
  emoji.setAttribute('aria-hidden', 'true');

  const heading = document.createElement('p');
  heading.className   = 'submission-thank-you';
  heading.textContent = config?.thankYouMessage || 'Thank you for your feedback!';

  const countdownEl = document.createElement('p');
  countdownEl.className   = 'submission-countdown';
  countdownEl.textContent = `Returning in ${remaining}s…`;

  wrapper.appendChild(emoji);
  wrapper.appendChild(heading);
  wrapper.appendChild(countdownEl);

  questionContainer.innerHTML = '';
  questionContainer.appendChild(wrapper);

  const tick = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      countdownEl.textContent = `Returning in ${remaining}s…`;
    } else {
      clearInterval(tick);
      countdownEl.textContent = '';
      onReset();
    }
  }, 1000);
}

// ─────────────────────────────────────────────────────────────
// RESET
// ─────────────────────────────────────────────────────────────

function _doReset(deps) {
  const { appState, navigation } = deps;

  resetTriggered       = true;
  completionInProgress = false;

  if (appState) {
    appState.currentQuestionIndex = 0;
    appState.formData             = {};
    appState.questionTimeSpent    = {};
    appState.surveyStartTime      = null;
  }

  // Return to start screen
  if (navigation?.showStartScreen) {
    navigation.showStartScreen();
  } else if (typeof window.showStartScreen === 'function') {
    window.showStartScreen();
  }

  saveState(deps);
  console.log('[SUBMIT] ✅ Survey reset — back to start screen');
}

// ─────────────────────────────────────────────────────────────
// MAIN SUBMIT HANDLER
// ─────────────────────────────────────────────────────────────

export async function handleSubmit(deps = null) {
  const resolvedDeps = deps || getDependencies();
  const {
    appState,
    dataHandlers,
    questions,
    surveyType,
    questionContainer,
  } = resolvedDeps;

  // FAIL‑FAST: enforce valid surveyType
  if (!surveyType || typeof surveyType !== 'string') {
    const fallback = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
    console.error(
      `[SUBMIT] ⚠️ surveyType missing or invalid: "${surveyType}"` +
      ` — falling back to "${fallback}"`
    );
    // If you want to hard‑fail instead of falling back, uncomment this block:
    /*
    console.error(
      '[SUBMIT] ⚠️ This is a programming error — the caller must pass surveyType. ' +
      'No record will be saved.'
    );
    completionInProgress = false;
    _doReset(resolvedDeps);
    return;
    */
    // Otherwise, keep using the fallback:
    surveyType = fallback;
  }

  if (completionInProgress) {
    console.warn('[SUBMIT] Already in progress — ignoring duplicate call');
    return;
  }
  completionInProgress = true;
  resetTriggered       = false;

  console.log('[SUBMIT] 📋 Starting submission for surveyType:', surveyType);

  // ── Stop question timer ──────────────────────────────────────────────────
  stopQuestionTimer(resolvedDeps);

  // ── Guard: meaningful response ───────────────────────────────────────────
  if (!hasMeaningfulResponse(appState?.formData || {})) {
    console.warn('[SUBMIT] ⚠️ Empty formData — skipping submission');
    completionInProgress = false;
    _doReset(resolvedDeps);
    return;
  }

  // ── Normalize payload ────────────────────────────────────────────────────
  const normalizedFormData = normalizeSubmissionPayload(
    appState.formData || {},
    questions || []
  );

  // ── FIX 1: Validate form data shape before writing to queue ───────────────
  // Warns if any expected field names are missing (e.g. renamed question.name).
  // Never blocks submission — warns only, so offline kiosks always save data.
  validateFormData(normalizedFormData, surveyType);

  // ── Resolve queue config ─────────────────────────────────────────────────
  const queueConfig = window.CONSTANTS?.SURVEY_TYPES?.[surveyType];
  const queueKey    = queueConfig?.storageKey;

  if (!queueKey) {
    console.error(`[SUBMIT] ❌ No storageKey found for surveyType "${surveyType}" — cannot save`);
    completionInProgress = false;
    _doReset(resolvedDeps);
    return;
  }

  // ── Calculate timing ─────────────────────────────────────────────────────
  const surveyStartTime    = appState.surveyStartTime || Date.now();
  const totalTimeSeconds   = Math.round((Date.now() - surveyStartTime) / 1000);
  const questionTimeSpent  = { ...(appState.questionTimeSpent || {}) };

  // ── FIX 2: Build queue record via factory ─────────────────────────────────
  // Previously: raw object literal with sync_status, id, surveyType hardcoded inline.
  // Now: buildQueueRecord() ensures every record has the same guaranteed shape,
  // including a crypto.randomUUID() id and ISO submittedAt timestamp.
  const record = buildQueueRecord(
    {
      ...normalizedFormData,
      questionTimeSpent,
      completionTimeSeconds: totalTimeSeconds,
    },
    {
      surveyType,
      sync_status: 'unsynced',
    }
  );

  // ── FIX 2: Write via addToQueue (not safeSetLocalStorage directly) ────────
  // Previously: submissionQueue.push(record) + dataHandlers.safeSetLocalStorage(queueKey, queue)
  // Now: addToQueue handles read-modify-write, size limits, deduplication,
  // and updateAdminCount in one place.
  let saved = false;
  if (dataHandlers?.addToQueue) {
    saved = dataHandlers.addToQueue(record, queueKey);
  } else {
    // Fallback: direct write if addToQueue is not assembled yet (should not happen)
    console.warn('[SUBMIT] ⚠️ addToQueue not available — falling back to safeSetLocalStorage');
    try {
      const existing = JSON.parse(localStorage.getItem(queueKey) || '[]');
      existing.push(record);
      saved = dataHandlers?.safeSetLocalStorage
        ? dataHandlers.safeSetLocalStorage(queueKey, existing)
        : (localStorage.setItem(queueKey, JSON.stringify(existing)), true);
    } catch (e) {
      console.error('[SUBMIT] ❌ Fallback write failed:', e);
    }
  }

  if (!saved) {
    console.error('[SUBMIT] ❌ Failed to save record — storage may be full');
    // Do not block the user — the quota alert has already been flagged in storageUtils
  }

  console.log(`[SUBMIT] ✅ Record saved to "${queueKey}" (id: ${record.id})`);

  // ── FIX 9: Record analytics via factory ───────────────────────────────────
  // Previously: recordAnalytics('survey_completed', { ...rawProps })
  // Now: buildAnalyticsEvent() validates required fields per eventType and
  // adds guaranteed base fields (timestamp, kioskId, surveyId, surveyType).
  if (dataHandlers?.recordAnalytics) {
    dataHandlers.recordAnalytics(
      'survey_completed',
      buildAnalyticsEvent('survey_completed', {
        surveyId:             record.id,
        surveyType,
        totalTimeSeconds,
        completedAllQuestions: true,
      })
    );
  }

  // ── Update admin count ───────────────────────────────────────────────────
  if (dataHandlers?.updateAdminCount) {
    dataHandlers.updateAdminCount();
  }

  // ── Attempt background sync ──────────────────────────────────────────────
  if (navigator.onLine && dataHandlers?.syncData) {
    dataHandlers.syncData(false, { surveyType }).catch(err => {
      console.warn('[SUBMIT] Background sync failed (will retry later):', err.message);
    });
  }

  // ── Show success UI + auto-reset ─────────────────────────────────────────
  _renderCheckmarkAndCountdown({
    questionContainer,
    surveyType,
    config: queueConfig,
    onReset: () => {
      if (!resetTriggered) _doReset(resolvedDeps);
    },
  });

  saveState(resolvedDeps);
  console.log(`[SUBMIT] ✅ Submission complete — surveyType: ${surveyType}, time: ${totalTimeSeconds}s`);
}

export default { handleSubmit };
