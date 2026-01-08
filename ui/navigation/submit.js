// FILE: ui/navigation/submit.js
// PURPOSE: Survey submission and completion logic
// DEPENDENCIES: core.js
import { getDependencies, stopQuestionTimer, saveState } from './core.js';

/**
 * Submit the completed survey
 */
export function submitSurvey() {
  const { globals, appState, dataUtils, dataHandlers } = getDependencies();
  const questionContainer = globals?.questionContainer;
  const prevBtn = globals?.prevBtn;
  const nextBtn = globals?.nextBtn;
  const progressBar = globals?.progressBar;

  // Clear all timers
  if (window.uiHandlers && window.uiHandlers.clearAllTimers) {
    window.uiHandlers.clearAllTimers();
  }

  // Stop timer for last question
  const lastQuestion = dataUtils.surveyQuestions[appState.currentQuestionIndex];
  stopQuestionTimer(lastQuestion.id);

  // Get total survey time
  const totalTimeSeconds = window.uiHandlers?.getTotalSurveyTime
    ? window.uiHandlers.getTotalSurveyTime()
    : 0;

  // FIXED: Defensive copy + persistent state
  const submissionData = {
    ...appState.formData,
    id: appState.formData.id || dataHandlers.generateUUID(),
    questionTimeSpent: { ...appState.questionTimeSpent }, // Defensive copy
    completionTimeSeconds: totalTimeSeconds,
    completedAt: new Date().toISOString(),
    sync_status: 'unsynced'
  };

  console.log('[SUBMIT] Submitting survey:', submissionData.id);

  // ATOMIC QUEUE ADD - FIXED race condition
  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
  const queueKey = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
  let submissionQueue = dataHandlers.getSubmissionQueue();

  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[QUEUE] Full (${MAX_QUEUE_SIZE}) - trimming oldest`);
    submissionQueue = submissionQueue.slice(-MAX_QUEUE_SIZE + 1);
  }

  submissionQueue.push(submissionData);
  dataHandlers.safeSetLocalStorage(queueKey, submissionQueue);
  console.log(`[QUEUE] Added survey ${submissionData.id} (${submissionQueue.length}/${MAX_QUEUE_SIZE})`);

  // CRITICAL: Persist app state
  if (typeof saveState === 'function') {
    saveState();
  }

  // Record analytics (defensive - never crash)
  try {
    dataHandlers.recordAnalytics('survey_completed', {
      surveyId: submissionData.id,
      questionIndex: appState.currentQuestionIndex,
      totalTimeSeconds,
      completedAllQuestions: true
    });
  } catch (analyticsErr) {
    console.warn('[ANALYTICS] Failed to record completion:', analyticsErr);
  }

  // Update progress to 100%
  if (progressBar) {
    progressBar.style.width = '100%';
  }

  console.log('[SUBMIT] About to display checkmark...');

  // Show completion screen using global function
  if (typeof window.showCheckmark === 'function') {
    window.showCheckmark();
  } else {
    console.error('[SUBMIT] window.showCheckmark function not found!');
    // Fallback: Safe DOM creation (no innerHTML)
    if (questionContainer) {
      questionContainer.innerHTML = `
        <div class="checkmark-container flex flex-col items-center justify-center min-h-[400px] p-8">
          <div class="checkmark-circle w-32 h-32 bg-emerald-100 border-8 border-emerald-400 rounded-full flex items-center justify-center mb-8 shadow-xl">
            <svg class="checkmark-icon w-20 h-20 text-emerald-600" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 30 L25 40 L45 20" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="text-center">
            <h2 class="text-3xl font-bold text-gray-800 mb-4">Thank you for your feedback!</h2>
            <p id="resetCountdown" class="text-xl text-gray-600 font-semibold bg-white px-6 py-3 rounded-full shadow-lg">Kiosk resetting in 5 seconds...</p>
          </div>
        </div>
      `;
    }
  }

  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;

  // Start countdown to reset
  const RESET_DELAY_MS = window.CONSTANTS?.RESET_DELAY_MS || 5000;
  let timeLeft = RESET_DELAY_MS / 1000;

  appState.countdownInterval = setInterval(() => {
    timeLeft--;
    const countdownEl = document.getElementById('resetCountdown');
    if (countdownEl) {
      countdownEl.textContent = `Kiosk resetting in ${timeLeft} seconds...`;
    }

    if (timeLeft <= 0) {
      clearInterval(appState.countdownInterval);
      appState.countdownInterval = null;

      // Perform reset
      try {
        if (window.uiHandlers && window.uiHandlers.performKioskReset) {
          window.uiHandlers.performKioskReset();
        } else {
          console.warn('[RESET] performKioskReset not available - manual reset fallback');
          // Fallback reset
          if (typeof window.showStartScreen === 'function') {
            window.showStartScreen();
          }
        }
      } catch (resetErr) {
        console.error('[RESET] Reset failed:', resetErr);
      }
    }
  }, 1000);

  console.log('[SUBMIT] ✅ Survey submission complete');
}
