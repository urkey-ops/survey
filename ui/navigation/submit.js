// FILE: ui/navigation/submit.js
// PURPOSE: Survey submission and completion logic
// DEPENDENCIES: core.js
import { getDependencies, stopQuestionTimer } from './core.js';

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

  // Ensure ID exists before submission
  if (!appState.formData.id) {
    appState.formData.id = dataHandlers.generateUUID();
    console.warn('[SUBMIT] Missing ID - generated new one:', appState.formData.id);
  }

  // Get total survey time
  const totalTimeSeconds = window.uiHandlers?.getTotalSurveyTime
    ? window.uiHandlers.getTotalSurveyTime()
    : 0;

  // Prepare submission data
  const timestamp = new Date().toISOString();
  appState.formData.completionTimeSeconds = totalTimeSeconds;
  appState.formData.questionTimeSpent = appState.questionTimeSpent;
  appState.formData.completedAt = timestamp;
  appState.formData.timestamp = timestamp;
  appState.formData.sync_status = 'unsynced';

  console.log('[SUBMIT] Submitting survey with ID:', appState.formData.id);

  // Add to queue
  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 100;
  const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
  const submissionQueue = dataHandlers.getSubmissionQueue();

  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[QUEUE] Queue full (${MAX_QUEUE_SIZE} records) - removing oldest entry`);
    submissionQueue.shift();
  }

  submissionQueue.push(appState.formData);
  dataHandlers.safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);

  // Record completion analytics
  dataHandlers.recordAnalytics('survey_completed', {
    questionIndex: appState.currentQuestionIndex,
    totalTimeSeconds: totalTimeSeconds,
    completedAllQuestions: true
  });

  // Update progress to 100%
  if (progressBar) {
    progressBar.style.width = '100%';
  }

  console.log('[SUBMIT] About to show checkmark - questionContainer:', questionContainer);

  // Show completion screen - using DOM creation instead of innerHTML
  questionContainer.innerHTML = ''; // Clear first
  
  const container = document.createElement('div');
  container.className = 'checkmark-container';
  
  const circle = document.createElement('div');
  circle.className = 'checkmark-circle';
  
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'checkmark-icon');
  svg.setAttribute('viewBox', '0 0 60 60');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M15 30 L25 40 L45 20');
  path.setAttribute('fill', 'none');
  
  svg.appendChild(path);
  circle.appendChild(svg);
  
  const textCenter = document.createElement('div');
  textCenter.className = 'text-center';
  
  const heading = document.createElement('h2');
  heading.className = 'text-2xl font-bold text-gray-800 mb-2';
  heading.textContent = 'Thank you for your feedback!';
  
  const countdown = document.createElement('p');
  countdown.id = 'resetCountdown';
  countdown.className = 'text-gray-500 text-lg font-medium';
  countdown.textContent = 'Kiosk resetting in 5 seconds...';
  
  textCenter.appendChild(heading);
  textCenter.appendChild(countdown);
  
  container.appendChild(circle);
  container.appendChild(textCenter);
  
  questionContainer.appendChild(container);
  
  console.log('[SUBMIT] Checkmark added to DOM');

  prevBtn.disabled = true;
  nextBtn.disabled = true;

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
      if (window.uiHandlers && window.uiHandlers.performKioskReset) {
        window.uiHandlers.performKioskReset();
      }
    }
  }, 1000);
}
