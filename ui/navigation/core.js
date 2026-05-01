// FILE: ui/navigation/core.js
// PURPOSE: Core navigation functions (goNext, goPrev, showQuestion)
// VERSION: 6.0.1
// CHANGES FROM 6.0.0:
//   - FIX L2: Changed _getStorageKey() fallback from 'kioskAppState' to
//     'kioskState' so saveState() and appState.js read from the same key when
//     CONSTANTS.STORAGE_KEY_STATE and appState.storageKey are both absent.
//     Previously saveState() wrote to 'kioskAppState' while appState.js read from
//     'kioskState', so reopened surveys always started at question 0 and lost
//     resumed form data.
//   - no other logic changes

// ─── Module-level render-cancellation state ───────────────────────────────────
let _pendingRenderTimer = null;
let _renderGeneration = 0;

// ─── Module-level input focus handler ────────────────────────────────────────
let _boundInputFocusHandler = null;

// ─── Kiosk mode resolver ─────────────────────────────────────────────────────
// Called on every use so live config changes (e.g. admin switcher) take effect.
function _isShayona() {
  return window.DEVICECONFIG?.kioskMode === 'shayona';
}

function _getUtils() {
  return _isShayona() && window.shayonaDataUtils
    ? window.shayonaDataUtils
    : window.dataUtils;
}

/**
 * Get dependencies from global scope
 */
export function getDependencies() {
  return {
    appState: window.appState,
    dataUtils: _getUtils(),           // always resolves to correct utils
    dataHandlers: window.dataHandlers,
    globals: window.globals,
    typewriterManager: window.typewriterManager,
    timerManager: window.timerManager,
    validateQuestion: window.validateQuestion,
    clearErrors: window.clearErrors,
    questionContainer: window.globals?.questionContainer ?? null,
    questions: _getUtils()?.getSurveyQuestions?.() ?? [],
    surveyType: window.KIOSK_CONFIG?.getActiveSurveyType?.() ?? null,
  };
}

/**
 * Central helper — always returns the active survey's question array.
 * Reads active type on every call so type switches take effect immediately.
 */
export function getQuestions() {
  const utils = _getUtils();

  if (typeof utils?.getSurveyQuestions === 'function') {
    return utils.getSurveyQuestions();
  }

  if (Array.isArray(utils?.surveyQuestions)) {
    return utils.surveyQuestions;
  }

  console.warn('[NAV] No questions array found in utils');
  return [];
}

/**
 * Resolve the merged renderer map.
 * Base = window.dataUtils.questionRenderers (temple types)
 * Overlay = window.shayonaDataUtils.questionRenderers (section-header, dual-star-rating)
 * On café iPads both layers are merged so all types resolve correctly.
 */
function _getRenderers() {
  const base = window.dataUtils?.questionRenderers ?? {};
  if (!_isShayona()) return base;
  const extra = window.shayonaDataUtils?.questionRenderers ?? {};
  return { ...base, ...extra };   // extra wins on key collision
}

/**
 * Resolve the canonical localStorage key for persisted kiosk state.
 * Priority: CONSTANTS → appState.storageKey → legacy fallback string.
 */
function _getStorageKey() {
  return (
    window.CONSTANTS?.STORAGE_KEY_STATE ||
    window.appState?.storageKey ||
    'kioskState'
  );
}

/**
 * Save current application state to localStorage
 */
export function saveState() {
  const { appState, dataHandlers } = getDependencies();

  if (!dataHandlers?.safeSetLocalStorage) {
    console.warn('[STATE] safeSetLocalStorage not available — skipping save');
    return;
  }

  dataHandlers.safeSetLocalStorage(_getStorageKey(), {
    currentQuestionIndex: appState.currentQuestionIndex,
    formData: { ...appState.formData },
    surveyStartTime: appState.surveyStartTime,
    questionStartTimes: { ...appState.questionStartTimes },
    questionTimeSpent: { ...appState.questionTimeSpent },
  });
}

// ─── Deep equality helper ─────────────────────────────────────────────────────
function _isEqual(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

/**
 * Update form data for a specific field
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
 */
export function startQuestionTimer(questionId) {
  const { appState } = getDependencies();
  appState.questionStartTimes[questionId] = Date.now();
  saveState();
}

/**
 * Stop tracking time for a question
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

  const questions = getQuestions();
  const totalQuestions = questions.length;

  if (totalQuestions === 0) {
    progressBar.style.width = '0%';
    return;
  }

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

  if (typeof timerManager?.clearIntervals === 'function') {
    timerManager.clearIntervals();
  } else {
    if (appState?.rotationInterval) {
      clearInterval(appState.rotationInterval);
      appState.rotationInterval = null;
    }
  }
}

/**
 * Setup input focus scroll behaviour
 */
export function setupInputFocusScroll() {
  const { globals } = getDependencies();
  const questionContainer = globals?.questionContainer;

  if (!questionContainer) return;

  cleanupInputFocusScroll();

  _boundInputFocusHandler = (event) => {
    const target = event.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  };

  questionContainer.addEventListener('focusin', _boundInputFocusHandler);
}

/**
 * Cleanup input focus scroll listeners
 */
export function cleanupInputFocusScroll() {
  const { globals } = getDependencies();
  const questionContainer = globals?.questionContainer;

  if (questionContainer && _boundInputFocusHandler) {
    questionContainer.removeEventListener('focusin', _boundInputFocusHandler);
    _boundInputFocusHandler = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOW QUESTION — fade-out → swap → fade-in
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancel any in-flight render that has not yet executed.
 */
function _cancelPendingRender() {
  if (_pendingRenderTimer !== null) {
    clearTimeout(_pendingRenderTimer);
    _pendingRenderTimer = null;
  }

  _renderGeneration++;
}

export function showQuestion(index) {
  const { globals, appState } = getDependencies();
  const questionContainer = globals?.questionContainer;

  // ── Clamp resume index to valid bounds ───────────────────────────────────
  const questions = getQuestions();
  if (questions.length > 0 && index >= questions.length) {
    console.warn(
      `[NAV] Resume index ${index} out of bounds ` +
      `(survey has ${questions.length} questions) — clamping to 0`
    );
    index = 0;
    appState.currentQuestionIndex = 0;
    saveState();
  }

  _cancelPendingRender();

  const generation = _renderGeneration;

  if (questionContainer && questionContainer.innerHTML.trim() !== '') {
    questionContainer.classList.add('question-fade-out');

    _pendingRenderTimer = setTimeout(() => {
      _pendingRenderTimer = null;
      if (generation !== _renderGeneration) return;
      _renderQuestion(index, generation);
    }, 120);
  } else {
    _renderQuestion(index, generation);
  }
}

function _renderQuestion(index, generation) {
  const { globals, appState, typewriterManager, dataHandlers } = getDependencies();
  const questionContainer = globals?.questionContainer;
  const nextBtn = globals?.nextBtn;
  const prevBtn = globals?.prevBtn;

  if (generation !== _renderGeneration) return;

  // clearAutoAdvance from whichever utils is active
  _getUtils()?.clearAutoAdvance?.();

  try {
    if (window.clearErrors) {
      window.clearErrors();
    }

    const questions = getQuestions();
    const question = questions[index];

    if (!question) {
      throw new Error(`Question at index ${index} is undefined`);
    }

    // ── Merged renderer lookup (temple base + shayona overlay) ─────────────
    const renderers = _getRenderers();
    const renderer = renderers[question.type];
    if (!renderer) {
      throw new Error(`No renderer found for question type: ${question.type}`);
    }

    startQuestionTimer(question.id);

    questionContainer.classList.remove('question-fade-out');
    questionContainer.innerHTML = renderer.render(question, appState.formData);

    const fadeGeneration = _renderGeneration;
    requestAnimationFrame(() => {
      if (fadeGeneration !== _renderGeneration) return;
      requestAnimationFrame(() => {
        if (fadeGeneration !== _renderGeneration) return;
        questionContainer.classList.add('question-fade-in');
        setTimeout(() => questionContainer.classList.remove('question-fade-in'), 150);
      });
    });

    if (typewriterManager) {
      typewriterManager.addEffect(questionContainer);
    } else if (typeof window.addTypewriterEffect === 'function') {
      window.addTypewriterEffect(questionContainer);
    }

    if (renderer.setupEvents) {
      renderer.setupEvents(question, goNext, updateData);
    }

    if (question.rotatingText) {
      if (typewriterManager) {
        const interval = typewriterManager.rotateText(question, appState.rotationInterval);
        appState.rotationInterval = interval;
      } else if (typeof window.rotateQuestionText === 'function') {
        window.rotateQuestionText(question);
      }
    }

    prevBtn.disabled = (index === 0);
    nextBtn.textContent = (index === questions.length - 1) ? 'Submit Survey' : 'Next';
    nextBtn.disabled = false;

    updateProgressBar();
    setupInputFocusScroll();

  } catch (error) {
    console.error('[ERROR] Fatal error during showQuestion render:', error);

    if (generation !== _renderGeneration) return;

    try {
      const { dataHandlers } = getDependencies();
      const questions = getQuestions();

      if (dataHandlers?.safeGetLocalStorage && dataHandlers?.safeSetLocalStorage) {
        const raw = dataHandlers.safeGetLocalStorage('errorLog');
        const errorLog = Array.isArray(raw) ? raw : [];
        errorLog.push({
          timestamp: new Date().toISOString(),
          error: error.message,
          stack: error.stack,
          questionIndex: index,
          questionId: questions[index]?.id,
        });
        dataHandlers.safeSetLocalStorage('errorLog', errorLog.slice(-20));
      }
    } catch (e) {
      console.error('Could not log error:', e);
    }

    if (nextBtn) nextBtn.disabled = true;
    if (prevBtn) prevBtn.disabled = true;
    cleanupIntervals();

    if (questionContainer) {
      questionContainer.classList.remove('question-fade-out', 'question-fade-in');
    }

    questionContainer.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <h2 style="font-size:1.2rem; font-weight:700; color:#DC2626; margin-bottom:1rem;">
          Technical Issue
        </h2>
        <p style="color:#6B7280; margin-bottom:1.5rem;">
          We are having trouble loading this question.
        </p>
        <button id="errorRestart"
          style="width:100%; padding:1rem 2rem; background:#10b981; color:#fff;
                 border:none; border-radius:8px; font-size:1rem; font-weight:600; cursor:pointer;">
          Restart Survey
        </button>
        <p style="font-size:0.85rem; color:#9CA3AF; margin-top:1rem;">
          Your previous answers have been saved if you were on Question 2 or later.
        </p>
      </div>`;

    document.getElementById('errorRestart')?.addEventListener('click', () => {
      if (typeof window.uiHandlers?.performKioskReset === 'function') {
        window.uiHandlers.performKioskReset();
      } else {
        location.reload();
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Navigate to the next question or submit survey.
 * On café iPad: routes through shayonaDataUtils.getNextQuestionIndex()
 * which handles branch skipping based on visitPurpose.
 * On temple iPad: falls back to currentIndex + 1 (unchanged behaviour).
 */
export function goNext() {
  const { appState } = getDependencies();

  const questions = getQuestions();
  const currentQuestion = questions[appState.currentQuestionIndex];

  const isValid = typeof window.validateQuestion === 'function'
    ? window.validateQuestion(currentQuestion, appState.formData)
    : true;

  if (!isValid) return;

  stopQuestionTimer(currentQuestion.id);
  cleanupIntervals();

  if (typeof window.clearErrors === 'function') {
    window.clearErrors();
  }

  if (appState.currentQuestionIndex < questions.length - 1) {
    // ── Branch-aware next index ─────────────────────────────────────────────
    const utils = _getUtils();
    const nextIndex = typeof utils?.getNextQuestionIndex === 'function'
      ? utils.getNextQuestionIndex(appState.currentQuestionIndex, appState.formData, questions)
      : appState.currentQuestionIndex + 1;

    appState.currentQuestionIndex = nextIndex < questions.length
      ? nextIndex
      : questions.length - 1;

    saveState();
    showQuestion(appState.currentQuestionIndex);
  } else {
    if (typeof window.navigationHandler?.submitSurvey === 'function') {
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
    const questions = getQuestions();
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
 */
export function getCurrentQuestion() {
  const { appState } = getDependencies();
  return getQuestions()[appState.currentQuestionIndex] || null;
}

/**
 * Get total number of questions
 */
export function getTotalQuestions() {
  return getQuestions().length;
}

/**
 * Check if on first question
 */
export function isFirstQuestion() {
  const { appState } = getDependencies();
  return appState.currentQuestionIndex === 0;
}

/**
 * Check if on last question
 */
export function isLastQuestion() {
  const { appState } = getDependencies();
  return appState.currentQuestionIndex === getTotalQuestions() - 1;
}

/**
 * Jump to a specific question by index
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

// ─── Module cleanup ───────────────────────────────────────────────────────────
export function cleanupCoreNavigation() {
  _cancelPendingRender();
  cleanupInputFocusScroll();
  cleanupIntervals();
}
