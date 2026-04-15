// FILE: ui/navigation/submit.js
// PURPOSE: Survey submission and completion logic
// UPDATED: VERSION 3.1.0 - Fixed queue key resolution (reads storageKey from SURVEY_TYPES)
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

  // ── Resolve active survey type ──
  // IMPORTANT: Only use getActiveSurveyType() — window.CONSTANTS has no ACTIVE_SURVEY_TYPE value
  const surveyType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';

  // ── Resolve queue key directly from SURVEY_TYPES storageKey ──
  const surveyConfig = window.CONSTANTS?.SURVEY_TYPES?.[surveyType];
  const queueKey = surveyConfig?.storageKey ||
                   (surveyType === 'type2'
                     ? window.CONSTANTS?.STORAGE_KEY_QUEUE_V2
                     : window.CONSTANTS?.STORAGE_KEY_QUEUE) ||
                   'submissionQueue';

  console.log(`[SUBMIT] surveyType: ${surveyType} | storageKey: ${surveyConfig?.storageKey} | queueKey: ${queueKey}`);

  // FIXED: Defensive copy + persistent state
  const submissionData = {
    ...appState.formData,
    id: appState.formData.id || dataHandlers.generateUUID(),
    questionTimeSpent: { ...appState.questionTimeSpent },
    completionTimeSeconds: totalTimeSeconds,
    completedAt: new Date().toISOString(),
    sync_status: 'unsynced',
    surveyType,
  };

  console.log(`[SUBMIT] Submitting survey (${surveyType}):`, submissionData.id);
  console.log(`[SUBMIT] Queue key: "${queueKey}"`);

  // ATOMIC QUEUE ADD - uses correct queue for this survey type
  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 250;
  let submissionQueue = dataHandlers.getSubmissionQueue(queueKey);

  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[QUEUE] Full (${MAX_QUEUE_SIZE}) - trimming oldest`);
    submissionQueue = submissionQueue.slice(-MAX_QUEUE_SIZE + 1);
  }

  submissionQueue.push(submissionData);
  dataHandlers.safeSetLocalStorage(queueKey, submissionQueue);
  console.log(`[QUEUE] Added to "${queueKey}" (${submissionQueue.length}/${MAX_QUEUE_SIZE})`);

  // CRITICAL: Persist app state
  if (typeof saveState === 'function') {
    saveState();
  }

  // Record analytics (defensive - never crash)
  try {
    dataHandlers.recordAnalytics('survey_completed', {
      surveyId: submissionData.id,
      surveyType,
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

  // Show completion screen
  if (typeof window.showCheckmark === 'function') {
    window.showCheckmark();
  } else {
    console.error('[SUBMIT] window.showCheckmark function not found!');
    // Fallback
    if (questionContainer) {
      const msg = document.createElement('div');
      msg.className = 'text-center p-8';
      const h2 = document.createElement('h2');
      h2.textContent = '✅ Thank you!';
      const p = document.createElement('p');
      p.textContent = 'Kiosk resetting in 5 seconds...';
      msg.appendChild(h2);
      msg.appendChild(p);
      questionContainer.innerHTML = '';
      questionContainer.appendChild(msg);
    }
  }
}
