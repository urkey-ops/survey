// FILE: ui/navigation/submit.js
// PURPOSE: Survey submission and completion logic
// VERSION: 3.4.0
// FIXES:
//   - reads active survey type and correct queue key
//   - includes surveyType in submissionData for API routing
//   - normalizes payload before queueing so nested answer shapes are sync-safe
//   - prevents duplicate submit/reset countdown chains
//   - clears pending auto-advance timer before completion
//   - never throws during completion UI / reset flow
// DEPENDENCIES: core.js

import { getDependencies, stopQuestionTimer, saveState } from './core.js';

let completionInProgress = false;
let resetTriggered = false;

/**
 * Convert UI-captured values into a stable queue/API-safe payload.
 * Keeps original field names but normalizes nested values consistently.
 */
function normalizeSubmissionPayload(formData, questions) {
  const normalized = { ...formData };

  questions.forEach((q) => {
    const rawValue = normalized[q.name];

    if (q.type === 'number-scale') {
      if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
        const parsed = Number(rawValue);
        normalized[q.name] = Number.isNaN(parsed) ? rawValue : parsed;
      }
      return;
    }

    if (q.type === 'radio-with-other') {
      const valueObj = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue
        : { main: rawValue || '', other: normalized[`other_${q.name}`] || '' };

      const main = valueObj.main || '';
      const other = main === 'Other' ? (valueObj.other || '') : '';

      normalized[q.name] = { main, other };
      normalized[`other_${q.name}`] = other;

      // Backward-compatible legacy mirror for any existing downstream readers
      normalized['other' + q.id] = other;
      return;
    }

    if (q.type === 'radio-with-followup') {
      const valueObj = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue
        : { main: rawValue || '', followup: [] };

      normalized[q.name] = {
        main: valueObj.main || '',
        followup: Array.isArray(valueObj.followup) ? [...valueObj.followup] : []
      };
      return;
    }

    if (q.type === 'checkbox-with-other') {
      const selected = Array.isArray(rawValue) ? [...rawValue] : [];
      const otherValue = normalized[`other_${q.name}`] || normalized['other' + q.id] || '';

      normalized[q.name] = selected;
      normalized[`other_${q.name}`] = selected.includes('Other') ? otherValue : '';

      // Backward-compatible legacy mirror
      normalized['other' + q.id] = normalized[`other_${q.name}`];
      return;
    }

    if (q.type === 'checkbox') {
      normalized[q.name] = Array.isArray(rawValue) ? [...rawValue] : [];
      return;
    }

    if (q.type === 'textarea') {
      normalized[q.name] = typeof rawValue === 'string' ? rawValue.trim() : (rawValue || '');
      return;
    }

    if (q.type === 'radio' || q.type === 'emoji-radio' || q.type === 'star-rating') {
      normalized[q.name] = rawValue ?? '';
    }
  });

  return normalized;
}

/**
 * Submit the completed survey.
 * Called from core.js → goNext() via window.navigationHandler.submitSurvey
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
    const prevBtn = globals?.prevBtn;
    const nextBtn = globals?.nextBtn;
    const progressBar = globals?.progressBar;

    // ── 1. Clear all running timers ────────────────────────────
    if (window.uiHandlers?.clearAllTimers) {
      window.uiHandlers.clearAllTimers();
    }

    if (typeof dataUtils?.clearAutoAdvance === 'function') {
      dataUtils.clearAutoAdvance();
    }

    // ── 2. Stop timer for last question ────────────────────────
    const questions = dataUtils.getSurveyQuestions
      ? dataUtils.getSurveyQuestions()
      : dataUtils.surveyQuestions;

    const lastQuestion = questions[appState.currentQuestionIndex];
    if (lastQuestion) stopQuestionTimer(lastQuestion.id);

    // ── 3. Total survey time ────────────────────────────────────
    const totalTimeSeconds = window.uiHandlers?.getTotalSurveyTime
      ? window.uiHandlers.getTotalSurveyTime()
      : 0;

    // ── 4. Resolve active survey type and correct queue key ────
    const surveyType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
    const surveyConfig = window.CONSTANTS?.SURVEY_TYPES?.[surveyType];
    const queueKey = surveyConfig?.storageKey ||
      (surveyType === 'type2'
        ? window.CONSTANTS?.STORAGE_KEY_QUEUE_V2
        : window.CONSTANTS?.STORAGE_KEY_QUEUE) ||
      'submissionQueue';

    console.log(`[SUBMIT] Survey type : ${surveyType}`);
    console.log(`[SUBMIT] Queue key   : "${queueKey}"`);
    console.log(`[SUBMIT] Submission  : ${appState.formData.id || '(no id yet)'}`);

    // ── 5. Normalize + build submission object ─────────────────
    const normalizedFormData = normalizeSubmissionPayload(appState.formData, questions);

    const submissionData = {
      ...normalizedFormData,
      id: normalizedFormData.id || dataHandlers.generateUUID(),
      surveyType,
      questionTimeSpent: { ...appState.questionTimeSpent },
      completionTimeSeconds: totalTimeSeconds,
      completedAt: new Date().toISOString(),
      sync_status: 'unsynced',
    };

    // ── 6. Atomic queue add ─────────────────────────────────────
    const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
    let submissionQueue = dataHandlers.getSubmissionQueue(queueKey);

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

    // ── 7. Persist normalized app state too ────────────────────
    appState.formData = { ...submissionData };
    if (typeof saveState === 'function') saveState();

    // ── 8. Record analytics — never crash survey flow ──────────
    try {
      dataHandlers.recordAnalytics('survey_completed', {
        surveyId: submissionData.id,
        surveyType,
        questionIndex: appState.currentQuestionIndex,
        totalTimeSeconds,
        completedAllQuestions: true,
      });
    } catch (analyticsErr) {
      console.warn('[ANALYTICS] Failed to record completion:', analyticsErr);
    }

    // ── 9. Progress bar to 100% ─────────────────────────────────
    if (progressBar) progressBar.style.width = '100%';

    console.log('[SUBMIT] About to display checkmark...');

    // ── 10. Show completion screen ──────────────────────────────
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
// PRIVATE: perform reset — tries every available path in order
// Never throws — always resets one way or another
// ─────────────────────────────────────────────────────────────
function _doReset() {
  if (resetTriggered) {
    return;
  }

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
