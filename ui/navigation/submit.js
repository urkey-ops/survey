// FILE: ui/navigation/submit.js
// PURPOSE: Survey submission and completion logic
// VERSION: 3.7.0
// CHANGES FROM 3.6.0:
//   - ADD: normalizeSubmissionPayload handles dual-star-rating { taste, value }
//     Flattens to individual flat fields for sheet compatibility:
//       e.g. foodRating_taste: 4, foodRating_value: 3
//     Original nested key removed after flattening.
//   - ADD: hasMeaningfulResponse handles dual-star-rating shape
// DEPENDENCIES: core.js

import { getDependencies, stopQuestionTimer, saveState } from './core.js';

let completionInProgress = false;
let resetTriggered = false;

/**
 * Convert UI-captured values into a stable queue/API-safe payload.
 *
 * dual-star-rating flattening:
 *   IN:  { foodRating: { taste: 4, value: 3 } }
 *   OUT: { foodRating_taste: 4, foodRating_value: 3 }
 *        (original foodRating key removed)
 *
 * selector-textarea flattening (unchanged from 3.6.0):
 *   IN:  { finalThoughts: { category: 'shoutout', text: 'Great!' } }
 *   OUT: { finalThoughts_category: 'shoutout', finalThoughts_text: 'Great!' }
 */
function normalizeSubmissionPayload(formData, questions) {
  const normalized = { ...formData };

  questions.forEach((q) => {
    const rawValue = normalized[q.name];

    // ── section-header ─────────────────────────────────────────────────────
    // No data to normalize — skip silently.
    if (q.type === 'section-header') {
      delete normalized[q.name]; // remove any accidental key (name === id for headers)
      return;
    }

    // ── dual-star-rating ───────────────────────────────────────────────────
    // Flatten { key1: number, key2: number } → individual flat fields.
    // Each subRating key becomes: q.name_subKey
    if (q.type === 'dual-star-rating') {
      const valueObj = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue
        : {};

      q.subRatings?.forEach(sub => {
        const val = valueObj[sub.key];
        normalized[`${q.name}_${sub.key}`] = (val !== null && val !== undefined)
          ? Number(val)
          : '';
      });

      // Remove the nested object — sheet should never receive it as JSON
      delete normalized[q.name];
      return;
    }

    // ── selector-textarea ──────────────────────────────────────────────────
    if (q.type === 'selector-textarea') {
      const valueObj = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue
        : { category: null, text: typeof rawValue === 'string' ? rawValue : '' };

      const category = valueObj.category ? String(valueObj.category).trim() : '';
      const text     = typeof valueObj.text === 'string' ? valueObj.text.trim() : '';

      normalized[`${q.name}_category`] = category;
      normalized[`${q.name}_text`]     = text;
      delete normalized[q.name];
      return;
    }

    // ── number-scale ───────────────────────────────────────────────────────
    if (q.type === 'number-scale') {
      if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
        const parsed = Number(rawValue);
        normalized[q.name] = Number.isNaN(parsed) ? rawValue : parsed;
      }
      return;
    }

    // ── radio-with-other ───────────────────────────────────────────────────
    if (q.type === 'radio-with-other') {
      const valueObj = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue
        : { main: rawValue || '', other: normalized[`other_${q.name}`] || '' };

      const main  = valueObj.main || '';
      const other = main === 'Other' ? (valueObj.other || '') : '';

      normalized[q.name]            = { main, other };
      normalized[`other_${q.name}`] = other;
      normalized['other' + q.id]    = other;
      return;
    }

    // ── radio-with-followup ────────────────────────────────────────────────
    if (q.type === 'radio-with-followup') {
      const valueObj = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue
        : { main: rawValue || '', followup: [] };

      normalized[q.name] = {
        main:     valueObj.main || '',
        followup: Array.isArray(valueObj.followup) ? [...valueObj.followup] : []
      };
      return;
    }

    // ── checkbox-with-other ────────────────────────────────────────────────
    if (q.type === 'checkbox-with-other') {
      const selected   = Array.isArray(rawValue) ? [...rawValue] : [];
      const otherValue = normalized[`other_${q.name}`] || normalized['other' + q.id] || '';

      normalized[q.name]            = selected;
      normalized[`other_${q.name}`] = selected.includes('Other') ? otherValue : '';
      normalized['other' + q.id]    = normalized[`other_${q.name}`];
      return;
    }

    // ── checkbox ───────────────────────────────────────────────────────────
    if (q.type === 'checkbox') {
      normalized[q.name] = Array.isArray(rawValue) ? [...rawValue] : [];
      return;
    }

    // ── textarea ───────────────────────────────────────────────────────────
    if (q.type === 'textarea') {
      normalized[q.name] = typeof rawValue === 'string' ? rawValue.trim() : (rawValue || '');
      return;
    }

    // ── radio / emoji-radio / star-rating ──────────────────────────────────
    if (q.type === 'radio' || q.type === 'emoji-radio' || q.type === 'star-rating') {
      normalized[q.name] = rawValue ?? '';
    }
  });

  return normalized;
}

/**
 * Returns true only if payload contains at least one real survey answer.
 */
function hasMeaningfulResponse(formData = {}) {
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
    return false;
  }

  const technicalKeys = new Set([
    'id', 'submissionId', 'sessionId', 'timestamp', 'completedAt',
    'submittedAt', 'abandonedAt', 'abandonedReason', 'surveyStartTime',
    'surveyType', 'kioskId', 'sync_status', 'syncStatus',
    'questionTimeSpent', 'questionStartTimes', 'completionTimeSeconds',
    'currentQuestionIndex',
  ]);

  return Object.entries(formData).some(([key, value]) => {
    if (technicalKeys.has(key)) return false;
    if (value == null)           return false;

    if (typeof value === 'string')  return value.trim() !== '';
    if (typeof value === 'number')  return true; // 0 is a valid rating

    if (Array.isArray(value)) return value.length > 0;

    if (typeof value === 'object') {
      // dual-star-rating raw shape (pre-normalization defensive guard)
      // { taste: 4, value: 3 } — any non-null sub-key is meaningful
      if (Object.values(value).some(v => typeof v === 'number')) {
        return true;
      }

      // selector-textarea raw shape
      if ('category' in value || 'text' in value) {
        const hasCategory = value.category != null && String(value.category).trim() !== '';
        const hasText     = typeof value.text === 'string' && value.text.trim() !== '';
        return hasCategory || hasText;
      }

      // radio-with-other / radio-with-followup
      if ('main' in value || 'other' in value || 'followup' in value) {
        const main     = typeof value.main    === 'string' ? value.main.trim()    : value.main;
        const other    = typeof value.other   === 'string' ? value.other.trim()   : value.other;
        const followup = Array.isArray(value.followup)     ? value.followup       : [];
        return Boolean(main) || Boolean(other) || followup.length > 0;
      }

      return Object.keys(value).length > 0;
    }

    return true;
  });
}

/**
 * Submit the completed survey.
 */
export function submitSurvey() {
  if (completionInProgress) {
    console.warn('[SUBMIT] Submission already in progress — ignoring duplicate call');
    return;
  }

  completionInProgress = true;
  resetTriggered = false;

  try {
    const { globals, appState, dataUtils, dataHandlers } = getDependencies();

    const questionContainer = globals?.questionContainer;
    const prevBtn           = globals?.prevBtn;
    const nextBtn           = globals?.nextBtn;
    const progressBar       = globals?.progressBar;

    if (window.uiHandlers?.clearAllTimers) {
      window.uiHandlers.clearAllTimers();
    }

    if (typeof dataUtils?.clearAutoAdvance === 'function') {
      dataUtils.clearAutoAdvance();
    }

    const questions    = dataUtils.getSurveyQuestions
      ? dataUtils.getSurveyQuestions()
      : dataUtils.surveyQuestions;

    const lastQuestion = questions[appState.currentQuestionIndex];
    if (lastQuestion) stopQuestionTimer(lastQuestion.id);

    const totalTimeSeconds = window.uiHandlers?.getTotalSurveyTime
      ? window.uiHandlers.getTotalSurveyTime()
      : 0;

    const surveyType   = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
    const surveyConfig = window.CONSTANTS?.SURVEY_TYPES?.[surveyType];
    const queueKey     = surveyConfig?.storageKey ||
      (surveyType === 'type2'
        ? window.CONSTANTS?.STORAGE_KEY_QUEUE_V2
        : window.CONSTANTS?.STORAGE_KEY_QUEUE) ||
      'submissionQueue';

    console.log(`[SUBMIT] Survey type : ${surveyType}`);
    console.log(`[SUBMIT] Queue key   : "${queueKey}"`);
    console.log(`[SUBMIT] Submission  : ${appState.formData.id || '(no id yet)'}`);

    const normalizedFormData = normalizeSubmissionPayload(appState.formData, questions);
    const hasAnswers         = hasMeaningfulResponse(normalizedFormData);

    if (!hasAnswers) {
      console.warn('[SUBMIT] No meaningful responses found — skipping queue write');
      try {
        dataHandlers.recordAnalytics('survey_submit_skipped_blank', {
          surveyType,
          questionIndex:    appState.currentQuestionIndex,
          totalTimeSeconds,
          reason:           'no_meaningful_answers',
        });
      } catch (analyticsErr) {
        console.warn('[ANALYTICS] Failed to record blank-submit skip:', analyticsErr);
      }

      if (progressBar) progressBar.style.width = '100%';
      _renderCheckmarkAndCountdown(questionContainer, prevBtn, nextBtn, appState);
      return;
    }

    const submissionData = {
      ...normalizedFormData,
      id:                    normalizedFormData.id || dataHandlers.generateUUID(),
      surveyType,
      questionTimeSpent:     { ...appState.questionTimeSpent },
      completionTimeSeconds: totalTimeSeconds,
      completedAt:           new Date().toISOString(),
      sync_status:           'unsynced',
    };

    const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
    let submissionQueue  = dataHandlers.getSubmissionQueue(queueKey);

    if (!Array.isArray(submissionQueue)) {
      submissionQueue = [];
    }

    if (submissionQueue.length >= MAX_QUEUE_SIZE) {
      console.warn(`[QUEUE] Full (${MAX_QUEUE_SIZE}) — trimming oldest`);
      submissionQueue = submissionQueue.slice(-MAX_QUEUE_SIZE + 1);
    }

    submissionQueue.push(submissionData);
    dataHandlers.safeSetLocalStorage(queueKey, submissionQueue);
    console.log(`[QUEUE] Added to "${queueKey}" (${submissionQueue.length}/${MAX_QUEUE_SIZE})`);

    // Log flattened dual-star fields if present (type3 café)
    if (submissionData.foodRating_taste !== undefined || submissionData.foodRating_value !== undefined) {
      console.log(`[SUBMIT] foodRating_taste  : ${submissionData.foodRating_taste ?? ''}`);
      console.log(`[SUBMIT] foodRating_value  : ${submissionData.foodRating_value ?? ''}`);
    }

    // Log flattened final_thoughts fields if present (type2 / type3)
    if (submissionData.finalThoughts_category !== undefined || submissionData.finalThoughts_text !== undefined) {
      console.log(`[SUBMIT] finalThoughts_category : "${submissionData.finalThoughts_category || ''}"`);
      console.log(`[SUBMIT] finalThoughts_text     : "${submissionData.finalThoughts_text     || ''}"`);
    }

    appState.formData = { ...submissionData };
    if (typeof saveState === 'function') saveState();

    try {
      dataHandlers.recordAnalytics('survey_completed', {
        surveyId:              submissionData.id,
        surveyType,
        questionIndex:         appState.currentQuestionIndex,
        totalTimeSeconds,
        completedAllQuestions: true,
      });
    } catch (analyticsErr) {
      console.warn('[ANALYTICS] Failed to record completion:', analyticsErr);
    }

    if (progressBar) progressBar.style.width = '100%';

    console.log('[SUBMIT] About to display checkmark...');
    _renderCheckmarkAndCountdown(questionContainer, prevBtn, nextBtn, appState);
    console.log('[SUBMIT] Survey submission complete');

  } catch (error) {
    console.error('[SUBMIT] Submission failed unexpectedly:', error);
    completionInProgress = false;
    resetTriggered = false;
    _doReset();
  }
}

// ─────────────────────────────────────────────────────────────
// PRIVATE: render checkmark screen + countdown + auto-reset
// ─────────────────────────────────────────────────────────────
function _renderCheckmarkAndCountdown(questionContainer, prevBtn, nextBtn, appState) {
  if (!questionContainer) {
    console.error('[SUBMIT] questionContainer not found — cannot show checkmark');
    _doReset();
    return;
  }

  questionContainer.innerHTML = `
    <div class="checkmark-container flex flex-col items-center justify-center min-h-[400px] p-8">
      <div class="checkmark-circle w-32 h-32 bg-emerald-100 border-8 border-emerald-400 rounded-full flex items-center justify-center mb-8 shadow-xl">
        <svg class="checkmark-icon w-20 h-20 text-emerald-600" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 30 L25 40 L45 20" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="text-center">
        <h2 class="text-3xl font-bold text-gray-800 mb-4">Thank you for your feedback!</h2>
        <p id="resetCountdown" class="text-xl text-gray-600 font-semibold bg-white px-6 py-3 rounded-full shadow-lg">
          Kiosk resetting in 5 seconds...
        </p>
      </div>
    </div>`;

  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;

  const RESET_DELAY_MS = window.CONSTANTS?.RESET_DELAY_MS || 5000;
  let timeLeft = Math.max(1, Math.ceil(RESET_DELAY_MS / 1000));

  if (appState.countdownInterval) {
    clearInterval(appState.countdownInterval);
    appState.countdownInterval = null;
  }

  const countdownEl = document.getElementById('resetCountdown');
  if (countdownEl) {
    countdownEl.textContent = `Kiosk resetting in ${timeLeft} second${timeLeft !== 1 ? 's' : ''}...`;
  }

  appState.countdownInterval = setInterval(() => {
    timeLeft--;

    const el = document.getElementById('resetCountdown');
    if (el) {
      el.textContent = timeLeft > 0
        ? `Kiosk resetting in ${timeLeft} second${timeLeft !== 1 ? 's' : ''}...`
        : 'Resetting now...';
    }

    if (timeLeft <= 0) {
      clearInterval(appState.countdownInterval);
      appState.countdownInterval = null;
      _doReset();
    }
  }, 1000);
}

// ─────────────────────────────────────────────────────────────
// PRIVATE: perform reset
// ─────────────────────────────────────────────────────────────
function _doReset() {
  if (resetTriggered) return;

  resetTriggered = true;
  console.log('[RESET] Performing kiosk reset...');

  try {
    if (typeof window.uiHandlers?.performKioskReset === 'function') {
      console.log('[RESET] Using uiHandlers.performKioskReset');
      window.uiHandlers.performKioskReset();
      return;
    }

    if (typeof window.showStartScreen === 'function') {
      console.log('[RESET] Using window.showStartScreen');
      window.showStartScreen();
      return;
    }

    if (typeof window.navigationHandler?.resetSurvey === 'function') {
      console.log('[RESET] Using navigationHandler.resetSurvey');
      window.navigationHandler.resetSurvey();
      return;
    }

    console.warn('[RESET] No reset handler found — falling back to location.reload()');
    location.reload();
  } catch (err) {
    console.error('[RESET] Reset handler threw — forcing reload:', err);
    location.reload();
  } finally {
    completionInProgress = false;
  }
}
