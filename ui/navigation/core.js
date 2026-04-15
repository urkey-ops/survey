// FILE: ui/navigation/core.js
// PURPOSE: Core navigation functions (goNext, goPrev, showQuestion)
// VERSION: 3.2.0 - BUG 1 FIX: setupEvents called with correct separate args
//                  BUG 5 FIX: getSurveyQuestions() used everywhere instead of
//                             surveyQuestions static array
// DEPENDENCIES: window.dataUtils, window.appState

/**
 * Get dependencies from global scope
 */
export function getDependencies() {
  return {
    appState: window.appState,
    dataUtils: window.dataUtils,
    dataHandlers: window.dataHandlers,
    globals: window.globals,
    typewriterManager: window.typewriterManager,
    timerManager: window.timerManager,
    validateQuestion: window.validateQuestion,
    clearErrors: window.clearErrors
  };
}

/**
 * BUG 5 FIX: Central helper — always returns the active survey's question array.
 * Replaces all direct references to dataUtils.surveyQuestions throughout this file.
 * Reads active type on every call so type switches take effect after page reload.
 */
function getQuestions() {
  const { dataUtils } = getDependencies();
  // getSurveyQuestions() reads getActiveSurveyType() and returns the correct array
  return dataUtils.getSurveyQuestions
    ? dataUtils.getSurveyQuestions()
    : dataUtils.surveyQuestions; // fallback for safety
}

/**
 * Save current application state to localStorage
 */
export function saveState() {
  const { appState, dataHandlers } = getDependencies();
  const STORAGE_KEY_STATE = window.CONSTANTS?.STORAGE_KEY_STATE || 'kioskAppState';

  dataHandlers.safeSetLocalStorage(STORAGE_KEY_STATE, {
    currentQuestionIndex: appState.currentQuestionIndex,
    formData: appState.formData,
    surveyStartTime: appState.surveyStartTime,
    questionStartTimes: appState.questionStartTimes,
    questionTimeSpent: appState.questionTimeSpent
  });
}

/**
 * Update form data for a specific field
 * @param {string} key - Field name
 * @param {*} value - Field value
 */
export function updateData(key, value) {
  const { appState } = getDependencies();

  if (appState.formData[key] !== value) {
    appState.formData[key] = value;
    saveState();
  }
}

/**
 * Start tracking time for a question
 * @param {string} questionId - Question ID
 */
export function startQuestionTimer(questionId) {
  const { appState } = getDependencies();
  appState.questionStartTimes[questionId] = Date.now();
  saveState();
}

/**
 * Stop tracking time for a question
 * @param {string} questionId - Question ID
 */
export function stopQuestionTimer(questionId) {
  const { appState } = getDependencies();

  if (appState.questionStartTimes[questionId]) {
    const timeSpent = Date.now() - appState.questionStartTimes[questionId];
    appState.questionTimeSpent[questionId] = timeSpent;
    delete appState.questionStartTimes[questionId];
    saveState();
  }
}

/**
 * Update the progress bar based on current question
 */
export function updateProgressBar() {
  const { globals, appState } = getDependencies();
  const progressBar = globals?.progressBar;

  if (!progressBar) return;

  // BUG 5 FIX: was dataUtils.surveyQuestions.length
  const questions = getQuestions();
  const totalQuestions = questions.length;
  if (totalQuestions === 0) return;

  const progressPercentage = Math.min(
    ((appState.currentQuestionIndex + 1) / totalQuestions) * 100,
    100
  );

  progressBar.style.width = `${progressPercentage}%`;
}

/**
 * Cleanup intervals and timers
 */
export function cleanupIntervals() {
  const { timerManager, appState } = getDependencies();

  if (timerManager && timerManager.clearIntervals) {
    timerManager.clearIntervals();
  } else {
    if (appState.rotationInterval) {
      clearInterval(appState.rotationInterval);
      appState.rotationInterval = null;
    }
  }
}

/**
 * Setup input focus scroll behavior
 * Scrolls input fields into view when focused (mobile-friendly)
 */
export function setupInputFocusScroll() {
  const { globals } = getDependencies();
  const questionContainer = globals?.questionContainer;

  if (!questionContainer) return;

  // Remove existing listener if present
  if (window.boundInputFocusHandler) {
    questionContainer.removeEventListener('focusin', window.boundInputFocusHandler);
  }

  window.boundInputFocusHandler = (event) => {
    const target = event.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  };

  questionContainer.addEventListener('focusin', window.boundInputFocusHandler);
}

/**
 * Cleanup input focus scroll listeners
 */
export function cleanupInputFocusScroll() {
  const { globals } = getDependencies();
  const questionContainer = globals?.questionContainer;

  if (questionContainer && window.boundInputFocusHandler) {
    questionContainer.removeEventListener('focusin', window.boundInputFocusHandler);
    window.boundInputFocusHandler = null;
  }
}

/**
 * Show a specific question by index
 * @param {number} index - Question index to display
 */
export function showQuestion(index) {
  const { globals, appState, typewriterManager } = getDependencies();
  const questionContainer = globals?.questionContainer;
  const nextBtn = globals?.nextBtn;
  const prevBtn = globals?.prevBtn;

  try {
    if (window.clearErrors) {
      window.clearErrors();
    }

    // BUG 5 FIX: was dataUtils.surveyQuestions[index]
    const questions = getQuestions();
    const question  = questions[index];

    if (!question) {
      throw new Error(`Question at index ${index} is undefined`);
    }

    // BUG 5 FIX: was dataUtils.questionRenderers
    const { dataUtils } = getDependencies();
    const renderer = dataUtils.questionRenderers[question.type];

    if (!renderer) {
      throw new Error(`No renderer found for question type: ${question.type}`);
    }

    startQuestionTimer(question.id);

    questionContainer.innerHTML = renderer.render(question, appState.formData);

    if (typewriterManager) {
      typewriterManager.addEffect(questionContainer);
    } else if (window.addTypewriterEffect) {
      window.addTypewriterEffect(questionContainer);
    }

    // ─── BUG 1 FIX ────────────────────────────────────────────────────────
    // Was: renderer.setupEvents(question, { handleNextQuestion: goNext, updateData })
    //      → every renderer received an object as arg 2 and undefined as arg 3
    //      → updateData(key, val) threw TypeError on every question
    //      → scheduleAutoAdvance received an object instead of a function → silent no-op
    //      → no data was ever recorded; no auto-advance ever fired
    // Now: pass goNext and updateData as separate positional arguments
    if (renderer.setupEvents) {
      renderer.setupEvents(question, goNext, updateData);
    }
    // ──────────────────────────────────────────────────────────────────────

    if (question.rotatingText) {
      if (typewriterManager) {
        const interval = typewriterManager.rotateText(question, appState.rotationInterval);
        appState.rotationInterval = interval;
      } else if (window.rotateQuestionText) {
        window.rotateQuestionText(question);
      }
    }

    // BUG 5 FIX: was dataUtils.surveyQuestions.length - 1
    prevBtn.disabled = index === 0;
    nextBtn.textContent = (index === questions.length - 1) ? 'Submit Survey' : 'Next';
    nextBtn.disabled = false;

    updateProgressBar();
    setupInputFocusScroll();

  } catch (error) {
    console.error('[ERROR] Fatal error during showQuestion render:', error);

    try {
      const errorLog = JSON.parse(localStorage.getItem('errorLog') || '[]');
      const questions = getQuestions();
      errorLog.push({
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack,
        questionIndex: index,
        questionId: questions[index]?.id
      });
      localStorage.setItem('errorLog', JSON.stringify(errorLog.slice(-20)));
    } catch (e) {
      console.error('Could not log error:', e);
    }

    if (nextBtn) nextBtn.disabled = true;
    if (prevBtn) prevBtn.disabled = true;

    cleanupIntervals();

    questionContainer.innerHTML = `
      <div class="text-center p-8">
        <h2 class="text-xl font-bold text-red-600 mb-4">⚠️ Technical Issue</h2>
        <p class="text-gray-600 mb-6">We're having trouble loading this question.</p>
        <div class="space-y-4">
          <button id="errorRestart"
            class="w-full px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-lg font-semibold">
            Restart Survey
          </button>
          <p class="text-sm text-gray-500">
            Your previous answers have been saved if you were on Question 2 or later.
          </p>
        </div>
      </div>`;

    document.getElementById('errorRestart')?.addEventListener('click', () => {
      console.log('[ERROR RECOVERY] User initiated restart');
      if (window.uiHandlers?.performKioskReset) {
        window.uiHandlers.performKioskReset();
      } else {
        location.reload();
      }
    });
  }
}

/**
 * Navigate to the next question or submit survey
 */
export function goNext() {
  const { appState } = getDependencies();

  // BUG 5 FIX: was dataUtils.surveyQuestions[...]
  const questions       = getQuestions();
  const currentQuestion = questions[appState.currentQuestionIndex];

  const isValid = window.validateQuestion
    ? window.validateQuestion(currentQuestion, appState.formData)
    : true;

  if (!isValid) return;

  stopQuestionTimer(currentQuestion.id);
  cleanupIntervals();

  if (window.clearErrors) window.clearErrors();

  // BUG 5 FIX: was dataUtils.surveyQuestions.length - 1
  if (appState.currentQuestionIndex < questions.length - 1) {
    appState.currentQuestionIndex++;
    saveState();
    showQuestion(appState.currentQuestionIndex);
  } else {
    if (window.navigationHandler?.submitSurvey) {
      window.navigationHandler.submitSurvey();
    }
  }
}

/**
 * Navigate to the previous question
 */
export function goPrev() {
  const { appState } = getDependencies();

  if (appState.currentQuestionIndex > 0) {
    // BUG 5 FIX: was dataUtils.surveyQuestions[...]
    const questions       = getQuestions();
    const currentQuestion = questions[appState.currentQuestionIndex];
    stopQuestionTimer(currentQuestion.id);
    cleanupIntervals();

    appState.currentQuestionIndex--;
    saveState();
    showQuestion(appState.currentQuestionIndex);
  }
}

/**
 * Get current question object
 * @returns {Object|null} Current question or null
 */
export function getCurrentQuestion() {
  const { appState } = getDependencies();
  // BUG 5 FIX: was dataUtils.surveyQuestions[...]
  return getQuestions()[appState.currentQuestionIndex] || null;
}

/**
 * Get total number of questions
 * @returns {number} Total questions in survey
 */
export function getTotalQuestions() {
  // BUG 5 FIX: was dataUtils.surveyQuestions.length
  return getQuestions().length;
}

/**
 * Check if on first question
 * @returns {boolean} True if on first question
 */
export function isFirstQuestion() {
  const { appState } = getDependencies();
  return appState.currentQuestionIndex === 0;
}

/**
 * Check if on last question
 * @returns {boolean} True if on last question
 */
export function isLastQuestion() {
  const { appState } = getDependencies();
  return appState.currentQuestionIndex === getTotalQuestions() - 1;
}

/**
 * Jump to a specific question by index
 * @param {number} index - Question index
 * @returns {boolean} True if successful
 */
export function jumpToQuestion(index) {
  const totalQuestions = getTotalQuestions();

  if (index < 0 || index >= totalQuestions) {
    console.warn(`[NAVIGATION] Invalid question index: ${index}`);
    return false;
  }

  const { appState } = getDependencies();
  const currentQuestion = getCurrentQuestion();

  if (currentQuestion) {
    stopQuestionTimer(currentQuestion.id);
  }

  appState.currentQuestionIndex = index;
  saveState();
  showQuestion(index);

  return true;
}
