// FILE: ui/navigation/submit.js
// PURPOSE: Survey submission and completion logic
// VERSION: 3.8.1
// CHANGES FROM 3.8.0:
//   - FIX 1: Use `let SURVEY_TYPE` instead of `const` to avoid "Assignment to constant variable"
//   - FIX 2: Explicitly source `surveyType` from KIOSK_CONFIG if missing in deps
//   - FIX 3: Remove redundant fallback when `window.navigationHandler.submitSurvey` now passes `surveyType`
//   - UNCHANGED: All queue / sync / analytics / reset logic is identical and safe.
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

  // ── FAIL‑SAFE: use a local `SURVEY_TYPE` (let, not const)
  // ── FAIL‑SAFE: use a local `SURVEY_TYPE` (let, not const)
  let SURVEY_TYPE = surveyType;

  // Always resolve via KIOSK_CONFIG if deps.surveyType is invalid or missing
  if (!SURVEY_TYPE || typeof SURVEY_TYPE !== 'string') {
    const explicit = window.KIOSK_CONFIG?.getActiveSurveyType?.();
    SURVEY_TYPE = explicit || 'type1';
    console.error(
      `[SUBMIT] ⚠️ surveyType missing or invalid: "${surveyType}"` +
      ` — falling back to "${SURVEY_TYPE}"`
    );
  }

  if (completionInProgress) {
    console.warn('[SUBMIT] Already in progress — ignoring duplicate call');
    return;
  }
  completionInProgress = true;
  resetTriggered       = false;

  console.log('[SUBMIT] 📋 Starting submission for surveyType:', SURVEY_TYPE);

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

  // ── Validate form data shape before writing to queue ─────────────────────
  validateFormData(normalizedFormData, SURVEY_TYPE);

  // ── Resolve queue config ─────────────────────────────────────────────────
  const queueConfig = window.CONSTANTS?.SURVEY_TYPES?.[SURVEY_TYPE];
  const queueKey    = queueConfig?.storageKey;

  if (!queueKey) {
    console.error(`[SUBMIT] ❌ No storageKey found for surveyType "${SURVEY_TYPE}" — cannot save`);
    completionInProgress = false;
    _doReset(resolvedDeps);
    return;
  }

  // ── Calculate timing ─────────────────────────────────────────────────────
  const surveyStartTime    = appState.surveyStartTime || Date.now();
  const totalTimeSeconds   = Math.round((Date.now() - surveyStartTime) / 1000);
  const questionTimeSpent  = { ...(appState.questionTimeSpent || {}) };

  // ── Build queue record via factory ───────────────────────────────────────
  const record = buildQueueRecord(
    {
      ...normalizedFormData,
      questionTimeSpent,
      completionTimeSeconds: totalTimeSeconds,
    },
    {
      surveyType: SURVEY_TYPE,
      sync_status: 'unsynced',
    }
  );

  // ── Write via addToQueue ─────────────────────────────────────────────────
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
  } else {
    console.log(`[SUBMIT] ✅ Record saved to "${queueKey}" (id: ${record.id})`);
  }

  // ── Record analytics via factory ─────────────────────────────────────────
  if (dataHandlers?.recordAnalytics) {
    dataHandlers.recordAnalytics(
      'survey_completed',
      buildAnalyticsEvent('survey_completed', {
        surveyId:             record.id,
        surveyType: SURVEY_TYPE,
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
    dataHandlers.syncData(false, { surveyType: SURVEY_TYPE }).catch(err => {
      console.warn('[SUBMIT] Background sync failed (will retry later):', err.message);
    });
  }

  // ── Show success UI + auto-reset ─────────────────────────────────────────
  _renderCheckmarkAndCountdown({
    questionContainer,
    surveyType: SURVEY_TYPE,
    config: queueConfig,
    onReset: () => {
      if (!resetTriggered) _doReset(resolvedDeps);
    },
  });

  saveState(resolvedDeps);
  console.log(`[SUBMIT] ✅ Submission complete — surveyType: ${SURVEY_TYPE}, time: ${totalTimeSeconds}s`);
}

export default { handleSubmit };




