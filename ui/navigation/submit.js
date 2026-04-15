// FILE: ui/navigation/submit.js
// PURPOSE: Survey submission and completion logic
// UPDATED: VERSION 3.1.0 - Fixed queue key (dual-survey), fixed reset (showStartScreen fallback)
// DEPENDENCIES: core.js

import { getDependencies, stopQuestionTimer, saveState } from './core.js';

/**
 * Submit the completed survey.
 * Called from core.js goNext() via window.navigationHandler.submitSurvey
 */
export function submitSurvey() {
  const { globals, appState, dataUtils, dataHandlers } = getDependencies();
  const questionContainer = globals?.questionContainer;
  const prevBtn           = globals?.prevBtn;
  const nextBtn           = globals?.nextBtn;
  const progressBar       = globals?.progressBar;

  // ── Clear all running timers ──
  if (window.uiHandlers?.clearAllTimers) {
    window.uiHandlers.clearAllTimers();
  }

  // ── Stop timer for last question ──
  const lastQuestion = dataUtils.surveyQuestions[appState.currentQuestionIndex];
  if (lastQuestion) stopQuestionTimer(lastQuestion.id);

  // ── Total survey time ──
  const totalTimeSeconds = window.uiHandlers?.getTotalSurveyTime
    ? window.uiHandlers.getTotalSurveyTime()
    : 0;

  // ── Resolve active survey type ──
  // ONLY use getActiveSurveyType() — window.CONSTANTS has no ACTIVE_SURVEY_TYPE value
  const surveyType   = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
  const surveyConfig = window.CONSTANTS?.SURVEY_TYPES?.[surveyType];

  // 3-layer safe fallback so queue key is NEVER wrong
  const queueKey = surveyConfig?.storageKey
    || (surveyType === 'type2'
        ? window.CONSTANTS?.STORAGE_KEY_QUEUE_V2
        : window.CONSTANTS?.STORAGE_KEY_QUEUE)
    || 'submissionQueue';

  console.log(`[SUBMIT] Submitting survey (${surveyType}): ${appState.formData.id || '(no id yet)'}`);
  console.log(`[SUBMIT] Queue key: "${queueKey}"`);

  // ── Build submission object ──
  const submissionData = {
    ...appState.formData,
    id:                    appState.formData.id || dataHandlers.generateUUID(),
    questionTimeSpent:     { ...appState.questionTimeSpent },
    completionTimeSeconds: totalTimeSeconds,
    completedAt:           new Date().toISOString(),
    sync_status:           'unsynced',
    surveyType,
  };

  // ── Atomic queue add ──
  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
  let submissionQueue  = dataHandlers.getSubmissionQueue(queueKey);

  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[QUEUE] Full (${MAX_QUEUE_SIZE}) - trimming oldest`);
    submissionQueue = submissionQueue.slice(-MAX_QUEUE_SIZE + 1);
  }

  submissionQueue.push(submissionData);
  dataHandlers.safeSetLocalStorage(queueKey, submissionQueue);
  console.log(`[QUEUE] Added to "${queueKey}" (${submissionQueue.length}/${MAX_QUEUE_SIZE})`);

  // ── Persist app state ──
  if (typeof saveState === 'function') saveState();

  // ── Record analytics (never crash survey flow) ──
  try {
    dataHandlers.recordAnalytics('survey_completed', {
      surveyId:             submissionData.id,
      surveyType,
      questionIndex:        appState.currentQuestionIndex,
      totalTimeSeconds,
      completedAllQuestions: true,
    });
  } catch (analyticsErr) {
    console.warn('[ANALYTICS] Failed to record completion:', analyticsErr);
  }

  // ── Progress to 100% ──
  if (progressBar) progressBar.style.width = '100%';

  console.log('[SUBMIT] About to display checkmark...');

  // ── Show completion screen ──
  if (typeof window.showCheckmark === 'function') {
    window.showCheckmark();
  } else {
    // Fallback: render checkmark + countdown inline
    _renderFallbackCheckmark(questionContainer, prevBtn, nextBtn, appState);
  }

  console.log('[SUBMIT] Survey submission complete');
}

// ─────────────────────────────────────────────────────────────
// PRIVATE: fallback checkmark + auto-reset countdown
// Used when window.showCheckmark is not defined
// ─────────────────────────────────────────────────────────────
function _renderFallbackCheckmark(questionContainer, prevBtn, nextBtn, appState) {
  if (!questionContainer) return;

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

  // ── Countdown then reset ──
  const RESET_DELAY_MS = window.CONSTANTS?.RESET_DELAY_MS || 5000;
  let timeLeft = RESET_DELAY_MS / 1000;

  // Clear any previous countdown interval
  if (appState.countdownInterval) {
    clearInterval(appState.countdownInterval);
    appState.countdownInterval = null;
  }

  appState.countdownInterval = setInterval(() => {
    timeLeft--;
    const countdownEl = document.getElementById('resetCountdown');
    if (countdownEl) {
      countdownEl.textContent = `Kiosk resetting in ${timeLeft} second${timeLeft !== 1 ? 's' : ''}...`;
    }

    if (timeLeft <= 0) {
      clearInterval(appState.countdownInterval);
      appState.countdownInterval = null;
      _performReset();
    }
  }, 1000);
}

// ─────────────────────────────────────────────────────────────
// PRIVATE: safe reset — tries every available reset path
// ─────────────────────────────────────────────────────────────
function _performReset() {
  console.log('[RESET] Performing kiosk reset...');
  try {
    // Path 1: uiHandlers.performKioskReset (preferred)
    if (typeof window.uiHandlers?.performKioskReset === 'function') {
      window.uiHandlers.performKioskReset();
      return;
    }
    // Path 2: showStartScreen exported from startScreen.js
    if (typeof window.showStartScreen === 'function') {
      window.showStartScreen();
      return;
    }
    // Path 3: navigationHandler reset
    if (typeof window.navigationHandler?.resetSurvey === 'function') {
      window.navigationHandler.resetSurvey();
      return;
    }
    // Path 4: hard reload (last resort)
    console.warn('[RESET] No reset handler found — reloading page');
    location.reload();
  } catch (resetErr) {
    console.error('[RESET] Reset failed:', resetErr);
    location.reload();
  }
}
