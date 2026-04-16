// FILE: ui/navigation/core.js
// PURPOSE: Core navigation functions (goNext, goPrev, showQuestion)
// VERSION: 5.3.0
// CHANGES FROM 5.2.0:
//   - showQuestion: tracks a pending render timeout ID (_pendingRenderTimer)
//     so any in-flight fade-out delay can be cancelled before a new render
//     begins — prevents "ghost question" repaints after fast nav or reset
//   - _renderQuestion: guards against stale renders by checking a
//     _renderGeneration counter; if the generation has advanced since the
//     render was scheduled, the render is silently dropped
//   - saveState: reads storage key from CONSTANTS first, then falls back
//     to appState.storageKey, then to the legacy literal — no more
//     hard-coded fallback string scattered across files
//   - All other behaviour (fade timings, event wiring, error screen,
//     goNext / goPrev / jump) is unchanged
// DEPENDENCIES: window.dataUtils, window.appState

// ─── Module-level render-cancellation state ───────────────────────────────────
// _pendingRenderTimer  – the setTimeout id for a fade-out delay that has not
//                        fired yet.  Cancelled before every new showQuestion call.
// _renderGeneration    – incremented on every showQuestion call.  _renderQuestion
//                        captures the value at scheduling time and bails out if
//                        the counter has moved on by the time it executes.
let _pendingRenderTimer = null;
let _renderGeneration   = 0;

/**
 * Get dependencies from global scope
 */
export function getDependencies() {
  return {
    appState:          window.appState,
    dataUtils:         window.dataUtils,
    dataHandlers:      window.dataHandlers,
    globals:           window.globals,
    typewriterManager: window.typewriterManager,
    timerManager:      window.timerManager,
    validateQuestion:  window.validateQuestion,
    clearErrors:       window.clearErrors,
  };
}

/**
 * Central helper — always returns the active survey's question array.
 * Reads active type on every call so type switches take effect immediately.
 */
function getQuestions() {
  const { dataUtils } = getDependencies();
  return dataUtils.getSurveyQuestions
    ? dataUtils.getSurveyQuestions()
    : dataUtils.surveyQuestions;
}

/**
 * Resolve the canonical localStorage key for persisted kiosk state.
 * Priority: CONSTANTS → appState.storageKey → legacy fallback string.
 * Having one resolver here means no other file needs to know the key name.
 */
function _getStorageKey() {
  return (
    window.CONSTANTS?.STORAGE_KEY_STATE ||
    window.appState?.storageKey         ||
    'kioskAppState'
  );
}

/**
 * Save current application state to localStorage
 */
export function saveState() {
  const { appState, dataHandlers } = getDependencies();

  dataHandlers.safeSetLocalStorage(_getStorageKey(), {
    currentQuestionIndex: appState.currentQuestionIndex,
    formData:             appState.formData,
    surveyStartTime:      appState.surveyStartTime,
    questionStartTimes:   appState.questionStartTimes,
    questionTimeSpent:    appState.questionTimeSpent,
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
 * Setup input focus scroll behaviour
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

// ─────────────────────────────────────────────────────────────────────────────
// SHOW QUESTION — fade-out → swap → fade-in
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancel any in-flight render that has not yet executed.
 *
 * Called at the top of showQuestion so that rapid navigation (e.g. two quick
 * "Next" taps, or a reset firing while a fade-out is pending) never lets a
 * stale delayed render overwrite the DOM after the correct one has already
 * painted.
 */
function _cancelPendingRender() {
  if (_pendingRenderTimer !== null) {
    clearTimeout(_pendingRenderTimer);
    _pendingRenderTimer = null;
  }
  // Advancing the generation counter invalidates any _renderQuestion closure
  // that was already scheduled via rAF or a timeout that we cannot cancel
  // (e.g. a render that already started but whose rAF callbacks are queued).
  _renderGeneration++;
}

export function showQuestion(index) {
  const { globals } = getDependencies();
  const questionContainer = globals?.questionContainer;

  // Always cancel whatever was previously pending before scheduling new work.
  _cancelPendingRender();

  // Capture the generation for this particular call.
  const generation = _renderGeneration;

  if (questionContainer && questionContainer.innerHTML.trim() !== '') {
    questionContainer.classList.add('question-fade-out');

    _pendingRenderTimer = setTimeout(() => {
      _pendingRenderTimer = null;

      // If another showQuestion call fired while we were waiting, bail out.
      if (generation !== _renderGeneration) return;

      _renderQuestion(index, generation);
    }, 120);
  } else {
    _renderQuestion(index, generation);
  }
}

// ─── Private render ───────────────────────────────────────────────────────────

function _renderQuestion(index, generation) {
  const { globals, appState, typewriterManager, dataUtils } = getDependencies();
  const questionContainer = globals?.questionContainer;
  const nextBtn           = globals?.nextBtn;
  const prevBtn           = globals?.prevBtn;

  // Stale-render guard: if showQuestion was called again after this render was
  // scheduled the generation counter will have advanced — drop this render
  // entirely so we never paint old content over a newer question.
  if (generation !== _renderGeneration) return;

  // Kill any pending auto-advance from the previous question.
  if (dataUtils?.clearAutoAdvance) dataUtils.clearAutoAdvance();

  try {
    if (window.clearErrors) window.clearErrors();

    const questions = getQuestions();
    const question  = questions[index];

    if (!question) throw new Error(`Question at index ${index} is undefined`);

    const renderer = dataUtils.questionRenderers[question.type];
    if (!renderer) throw new Error(`No renderer found for question type: ${question.type}`);

    startQuestionTimer(question.id);

    // Swap content
    questionContainer.classList.remove('question-fade-out');
    questionContainer.innerHTML = renderer.render(question, appState.formData);

    // Trigger fade-in on next two frames so CSS transition fires cleanly.
    // Capture generation again so the rAF callbacks can also self-abort if
    // yet another navigation fires before the frames execute.
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

    // Only log/show the error UI if this render is still current.
    // If it has been superseded, swallowing it silently is correct behaviour.
    if (generation !== _renderGeneration) return;

    try {
      const questions = getQuestions();
      const errorLog  = JSON.parse(localStorage.getItem('errorLog') || '[]');
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

    // Always clean up fade classes — container must never be stuck invisible.
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
      if (window.uiHandlers?.performKioskReset) {
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
 * Navigate to the next question or submit survey
 */
export function goNext() {
  const { appState } = getDependencies();

  const questions       = getQuestions();
  const currentQuestion = questions[appState.currentQuestionIndex];

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

  const { appState }    = getDependencies();
  const currentQuestion = getCurrentQuestion();

  if (currentQuestion) stopQuestionTimer(currentQuestion.id);

  appState.currentQuestionIndex = index;
  saveState();
  showQuestion(index);

  return true;
}
