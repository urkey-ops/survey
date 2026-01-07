// FILE: ui/navigation/core.js
// PURPOSE: Core navigation functions (goNext, goPrev, showQuestion)
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
  const { globals, dataUtils, appState } = getDependencies();
  const progressBar = globals?.progressBar;

  if (!progressBar) return;

  const totalQuestions = dataUtils.surveyQuestions.length;
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
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
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
  const { globals, dataUtils, appState, typewriterManager } = getDependencies();
  const questionContainer = globals?.questionContainer;
  const nextBtn = globals?.nextBtn;
  const prevBtn = globals?.prevBtn;

  try {
    // Clear any validation errors
    if (window.clearErrors) {
      window.clearErrors();
    }

    const question = dataUtils.surveyQuestions[index];

    if (!question) {
      throw new Error(`Question at index ${index} is undefined`);
    }

    const renderer = dataUtils.questionRenderers[question.type];

    if (!renderer) {
      throw new Error(`No renderer found for question type: ${question.type}`);
    }

    // Start tracking time for this question
    startQuestionTimer(question.id);

    // Render the question
    questionContainer.innerHTML = renderer.render(question, appState.formData);

    // Add typewriter effect after rendering
    if (typewriterManager) {
      typewriterManager.addEffect(questionContainer);
    } else if (window.addTypewriterEffect) {
      window.addTypewriterEffect(questionContainer);
    }

    // Setup event handlers for the question
    if (renderer.setupEvents) {
      renderer.setupEvents(question, {
        handleNextQuestion: goNext,
        updateData: updateData
      });
    }

    // Handle rotating text if present
    if (question.rotatingText) {
      if (typewriterManager) {
        const interval = typewriterManager.rotateText(question, appState.rotationInterval);
        appState.rotationInterval = interval;
      } else if (window.rotateQuestionText) {
        window.rotateQuestionText(question);
      }
    }

    // Update navigation buttons
    prevBtn.disabled = index === 0;
    nextBtn.textContent = (index === dataUtils.surveyQuestions.length - 1)
      ? 'Submit Survey'
      : 'Next';
    nextBtn.disabled = false;

    // Update progress bar
    updateProgressBar();

    // Setup input focus scrolling
    setupInputFocusScroll();

  } catch (error) {
    console.error("[ERROR] Fatal error during showQuestion render:", error);
    
    // Log error for later review
    try {
        const errorLog = JSON.parse(localStorage.getItem('errorLog') || '[]');
        errorLog.push({
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            questionIndex: index,
            questionId: dataUtils.surveyQuestions[index]?.id
        });
        localStorage.setItem('errorLog', JSON.stringify(errorLog.slice(-20)));
    } catch (e) {
        console.error('Could not log error:', e);
    }
    
    // Disable navigation
    if (nextBtn) nextBtn.disabled = true;
    if (prevBtn) prevBtn.disabled = true;
    
    // Cleanup
    cleanupIntervals();
    
    // Show recovery UI
    questionContainer.innerHTML = `
        <div class="text-center p-8">
            <h2 class="text-xl font-bold text-red-600 mb-4">
                ⚠️ Technical Issue
            </h2>
            <p class="text-gray-600 mb-6">
                We're having trouble loading this question.
            </p>
            <div class="space-y-4">
                <button id="errorRestart" class="w-full px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-lg font-semibold">
                    Restart Survey
                </button>
                <p class="text-sm text-gray-500">
                    Your previous answers have been saved if you were on Question 2 or later.
                </p>
            </div>
        </div>
    `;
    
    // Add restart handler
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
  const { appState, dataUtils } = getDependencies();
  const currentQuestion = dataUtils.surveyQuestions[appState.currentQuestionIndex];

  // Validate current question
  const isValid = window.validateQuestion
    ? window.validateQuestion(currentQuestion, appState.formData)
    : true;

  if (!isValid) {
    return;
  }

  // Stop timer for current question
  stopQuestionTimer(currentQuestion.id);

  // Cleanup animations and timers
  cleanupIntervals();

  if (window.clearErrors) {
    window.clearErrors();
  }

  // Move to next question or submit
  if (appState.currentQuestionIndex < dataUtils.surveyQuestions.length - 1) {
    appState.currentQuestionIndex++;
    saveState();
    showQuestion(appState.currentQuestionIndex);
  } else {
    // Import submitSurvey dynamically to avoid circular dependency
    if (window.navigationHandler && window.navigationHandler.submitSurvey) {
      window.navigationHandler.submitSurvey();
    }
  }
}

/**
 * Navigate to the previous question
 */
export function goPrev() {
  const { appState, dataUtils } = getDependencies();

  if (appState.currentQuestionIndex > 0) {
    // Stop timer for current question (going back)
    const currentQuestion = dataUtils.surveyQuestions[appState.currentQuestionIndex];
    stopQuestionTimer(currentQuestion.id);

    // Cleanup animations
    cleanupIntervals();

    // Go back
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
  const { appState, dataUtils } = getDependencies();
  return dataUtils.surveyQuestions[appState.currentQuestionIndex] || null;
}

/**
 * Get total number of questions
 * @returns {number} Total questions in survey
 */
export function getTotalQuestions() {
  const { dataUtils } = getDependencies();
  return dataUtils.surveyQuestions.length;
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

  // Stop timer for current question
  if (currentQuestion) {
    stopQuestionTimer(currentQuestion.id);
  }

  // Update index and show question
  appState.currentQuestionIndex = index;
  saveState();
  showQuestion(index);

  return true;
}
