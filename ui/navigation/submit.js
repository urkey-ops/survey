// FILE: ui/navigation/submit.js
// PURPOSE: Survey submission and completion logic
// VERSION: 3.3.0 - BUG 5 FIX: reads active survey type, uses correct queue key,
//                  includes surveyType in submissionData for API routing
// DEPENDENCIES: core.js

import { getDependencies, stopQuestionTimer, saveState } from './core.js';

/**
 * Submit the completed survey.
 * Called from core.js → goNext() via window.navigationHandler.submitSurvey
 */
export function submitSurvey() {
  const { globals, appState, dataUtils, dataHandlers } = getDependencies();

  const questionContainer = globals?.questionContainer;
  const prevBtn           = globals?.prevBtn;
  const nextBtn           = globals?.nextBtn;
  const progressBar       = globals?.progressBar;

  // ── 1. Clear all running timers ────────────────────────────
  if (window.uiHandlers?.clearAllTimers) {
    window.uiHandlers.clearAllTimers();
  }

  // ── 2. Stop timer for last question ────────────────────────
  // BUG 5 FIX: was dataUtils.surveyQuestions[...] — must use getSurveyQuestions()
  // so the correct active question array is used when Type 2 is active
  const questions    = dataUtils.getSurveyQuestions
    ? dataUtils.getSurveyQuestions()
    : dataUtils.surveyQuestions;
  const lastQuestion = questions[appState.currentQuestionIndex];
  if (lastQuestion) stopQuestionTimer(lastQuestion.id);

  // ── 3. Total survey time ────────────────────────────────────
  const totalTimeSeconds = window.uiHandlers?.getTotalSurveyTime
    ? window.uiHandlers.getTotalSurveyTime()
    : 0;

  // ── 4. BUG 5 FIX: resolve active survey type and correct queue key ──
  //
  // BEFORE (broken):
  //   const queueKey = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
  //   → always wrote to the Type 1 queue regardless of active type
  //   → surveyType was never included in submissionData
  //   → dataSync read the (always-empty) Type 2 queue and synced nothing
  //   → API received no surveyType so always routed to Sheet1
  //
  // AFTER (fixed):
  //   reads getActiveSurveyType() → resolves correct storageKey from SURVEY_TYPES
  //   includes surveyType in submissionData so API routes to correct sheet tab
  //
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

  // ── 5. Build submission object ──────────────────────────────
  // BUG 5 FIX: surveyType added — dataSync and API both read this field
  // to route the payload to the correct Google Sheet tab
  const submissionData = {
    ...appState.formData,
    id:                    appState.formData.id || dataHandlers.generateUUID(),
    surveyType,                                    // ← required by API + dataSync
    questionTimeSpent:     { ...appState.questionTimeSpent },
    completionTimeSeconds: totalTimeSeconds,
    completedAt:           new Date().toISOString(),
    sync_status:           'unsynced',
  };

  // ── 6. Atomic queue add ─────────────────────────────────────
  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
  let submissionQueue  = dataHandlers.getSubmissionQueue(queueKey);

  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[QUEUE] Full (${MAX_QUEUE_SIZE}) — trimming oldest`);
    submissionQueue = submissionQueue.slice(-MAX_QUEUE_SIZE + 1);
  }

  submissionQueue.push(submissionData);
  dataHandlers.safeSetLocalStorage(queueKey, submissionQueue);
  console.log(`[QUEUE] Added to "${queueKey}" (${submissionQueue.length}/${MAX_QUEUE_SIZE})`);

  // ── 7. Persist app state ────────────────────────────────────
  if (typeof saveState === 'function') saveState();

  // ── 8. Record analytics — never crash survey flow ──────────
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

  // ── 9. Progress bar to 100% ─────────────────────────────────
  if (progressBar) progressBar.style.width = '100%';

  console.log('[SUBMIT] About to display checkmark...');

  // ── 10. Show completion screen ──────────────────────────────
  if (typeof window.showCheckmark === 'function') {
    window.showCheckmark();
  } else {
    _renderCheckmarkAndCountdown(questionContainer, prevBtn, nextBtn, appState);
  }

  console.log('[SUBMIT] Survey submission complete');
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
  let timeLeft = RESET_DELAY_MS / 1000;

  if (appState.countdownInterval) {
    clearInterval(appState.countdownInterval);
    appState.countdownInterval = null;
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
  }
}
