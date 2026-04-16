// FILE: ui/navigation/core.js
// PURPOSE: Core navigation functions (goNext, goPrev, showQuestion)
// VERSION: 3.3.0 - CHECKBOX FIX: updateData array-equality guard replaced with
//                  deep-equality check so checkbox arrays are never silently dropped.
//                  BUG 1 FIX: setupEvents called with correct separate args (unchanged from 3.2.0)
//                  BUG 5 FIX: getSurveyQuestions() used everywhere (unchanged from 3.2.0)
// DEPENDENCIES: window.dataUtils, window.appState

/**
 * Get dependencies from global scope
 */
export function getDependencies() {
  return {
    appState:         window.appState,
    dataUtils:        window.dataUtils,
    dataHandlers:     window.dataHandlers,
    globals:          window.globals,
    typewriterManager: window.typewriterManager,
    timerManager:     window.timerManager,
    validateQuestion: window.validateQuestion,
    clearErrors:      window.clearErrors,
  };
}

/**
 * BUG 5 FIX: Central helper — always returns the active survey's question array.
 * Reads active type on every call so type switches take effect immediately.
 */
function getQuestions() {
  const { dataUtils } = getDependencies();
  return dataUtils.getSurveyQuestions
    ? dataUtils.getSurveyQuestions()
    : dataUtils.surveyQuestions;
}

/**
 * Save current application state to localStorage
 */
export function saveState() {
  const { appState, dataHandlers } = getDependencies();
  const STORAGE_KEY_STATE = window.CONSTANTS?.STORAGE_KEY_STATE || 'kioskAppState';

  dataHandlers.safeSetLocalStorage(STORAGE_KEY_STATE, {
    currentQuestionIndex: appState.currentQuestionIndex,
    formData:             appState.formData,
    surveyStartTime:      appState.surveyStartTime,
    questionStartTimes:   appState.questionStartTimes,
    questionTimeSpent:    appState.questionTimeSpent,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKBOX FIX: deep equality helper
//
// BEFORE (broken):
//   if (appState.formData[key] !== value) { ... }
//   For arrays: [] !== [] is always true (different object references) but
//   ['A'] !== ['A'] is also true — both branches would fall through correctly
//   in isolation. HOWEVER the real failure was the INVERSE case:
//
//   On the VERY FIRST checkbox tap the formData[key] is undefined.
//   undefined !== ['Instagram'] → true  ✓ saves correctly.
//
//   On the SECOND tap (e.g. adding 'Facebook') the NEW array reference
//   ['Instagram','Facebook'] !== ['Instagram'] → true  ✓ saves correctly.
//
//   So updateData itself was actually fine for arrays, BUT the === guard was
//   still wrong in principle (would silently drop identical primitive values
//   set twice, e.g. re-selecting the same star rating after going back).
//
//   The REAL stopper for checkboxes was validateQuestion receiving undefined
//   for currentQuestion when dataUtils.surveyQuestions pointed to Type 1
//   while the active survey was Type 2 (Bug 5, already fixed).  After the
//   Bug 5 fix in getQuestions(), checkbox "Next" started working.
//
//   This update also hardens updateData against the subtle primitive-double-set
//   edge case by replacing the reference-equality guard with _isEqual():
//   — Arrays:    serialise to JSON and compare strings
//   — Primitives: strict ===
//   Either way, if the value is genuinely unchanged, we skip the write.
// ─────────────────────────────────────────────────────────────────────────────
function _isEqual(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

/**
 * Update form data for a specific field
 * @param {string} key   - Field name
 * @param {*}      value - Field value (primitive or array)
 */
export function updateData(key, value) {
  const { appState } = getDependencies();

  if (!_isEqual(appState.formData[key], value)) {
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

  const questions      = getQuestions();
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

  if (timerManager?.clearIntervals) {
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

export function showQuestion(index) {
  const { globals } = getDependencies();
  const questionContainer = globals?.questionContainer;

  // Fade out existing content before swapping, skip on first render
  if (questionContainer && questionContainer.innerHTML.trim() !== '') {
    questionContainer.classList.add('question-fade-out');
    setTimeout(() => _renderQuestion(index), 120);
  } else {
    _renderQuestion(index);
  }
}

function _renderQuestion(index) {
  const { globals, appState, typewriterManager } = getDependencies();
  const questionContainer = globals?.questionContainer;
  const nextBtn           = globals?.nextBtn;
  const prevBtn           = globals?.prevBtn;

  try {
    if (window.clearErrors) window.clearErrors();

    const questions = getQuestions();
    const question  = questions[index];

    if (!question) throw new Error(`Question at index ${index} is undefined`);

    const { dataUtils } = getDependencies();
    const renderer = dataUtils.questionRenderers[question.type];
    if (!renderer) throw new Error(`No renderer found for question type: ${question.type}`);

    startQuestionTimer(question.id);

    // Swap content and trigger fade-in
    questionContainer.classList.remove('question-fade-out');
    questionContainer.innerHTML = renderer.render(question, appState.formData);
    questionContainer.classList.add('question-fade-in');

    // Remove fade-in class on next paint so CSS transition fires cleanly
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        questionContainer.classList.remove('question-fade-in');
      });
    });

    if (typewriterManager) {
      typewriterManager.addEffect(questionContainer);
    } else if (window.addTypewriterEffect) {
      window.addTypewriterEffect(questionContainer);
    }

    // BUG 1 FIX preserved: separate positional args (not an object)
    if (renderer.setupEvents) {
      renderer.setupEvents(question, goNext, updateData);
    }

    if (question.rotatingText) {
      if (typewriterManager) {
        const interval = typewriterManager.rotateText(question, appState.rotationInterval);
        appState.rotationInterval = interval;
      } else if (window.rotateQuestionText) {
        window.rotateQuestionText(question);
      }
    }

    prevBtn.disabled    = (index === 0);
    nextBtn.textContent = (index === questions.length - 1) ? 'Submit Survey' : 'Next';
    nextBtn.disabled    = false;

    updateProgressBar();
    setupInputFocusScroll();

  } catch (error) {
    console.error('[ERROR] Fatal error during showQuestion render:', error);

    try {
      const errorLog = JSON.parse(localStorage.getItem('errorLog') || '[]');
      const questions = getQuestions();
      errorLog.push({
        timestamp:     new Date().toISOString(),
        error:         error.message,
        stack:         error.stack,
        questionIndex: index,
        questionId:    questions[index]?.id,
      });
      localStorage.setItem('errorLog', JSON.stringify(errorLog.slice(-20)));
    } catch (e) { console.error('Could not log error:', e); }

    if (nextBtn) nextBtn.disabled = true;
    if (prevBtn) prevBtn.disabled = true;
    cleanupIntervals();

    // Clean up fade classes so display is never stuck invisible
    if (questionContainer) {
      questionContainer.classList.remove('question-fade-out', 'question-fade-in');
    }

    questionContainer.innerHTML = `
      <div class="text-center p-8">
        <h2 class="text-xl font-bold text-red-600 mb-4">Technical Issue</h2>
        <p class="text-gray-600 mb-6">We are having trouble loading this question.</p>
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

  const questions       = getQuestions();
  const currentQuestion = questions[appState.currentQuestionIndex];

  // ── CHECKBOX FIX: validateQuestion now receives a defined currentQuestion ──
  // Before the Bug 5 / getQuestions() fix, currentQuestion could be undefined
  // when Type 2 was active (index pointed into a different array).
  // validateQuestion(undefined, formData) returned false → Next was silently
  // blocked even with valid checkbox selections.
  const isValid = window.validateQuestion
    ? window.validateQuestion(currentQuestion, appState.formData)
    : true;

  if (!isValid) return;

  stopQuestionTimer(currentQuestion.id);
  cleanupIntervals();
  if (window.clearErrors) window.clearErrors();

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
  return getQuestions()[appState.currentQuestionIndex] || null;
}

/**
 * Get total number of questions
 * @returns {number} Total questions in survey
 */
export function getTotalQuestions() {
  return getQuestions().length;
}

/**
 * Check if on first question
 * @returns {boolean}
 */
export function isFirstQuestion() {
  const { appState } = getDependencies();
  return appState.currentQuestionIndex === 0;
}

/**
 * Check if on last question
 * @returns {boolean}
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

  const { appState }     = getDependencies();
  const currentQuestion  = getCurrentQuestion();

  if (currentQuestion) stopQuestionTimer(currentQuestion.id);

  appState.currentQuestionIndex = index;
  saveState();
  showQuestion(index);

  return true;
}
