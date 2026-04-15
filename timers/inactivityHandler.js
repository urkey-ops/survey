// FILE: timers/inactivityHandler.js
// PURPOSE: Handle user inactivity detection and auto-reset
// DEPENDENCIES: window.CONSTANTS, window.appState, window.dataHandlers, timerManager.js
// VERSION: 3.0.0 - BUG FIXES: queue key uses active type; startPeriodicSync removed from resetInactivityTimer

let boundResetInactivityTimer = null;
let throttleTimeout = null;
const THROTTLE_DELAY = 2000;

// ── Dependency accessor ───────────────────────────────────────────────────────

function getDependencies() {
  return {
    INACTIVITY_TIMEOUT_MS: window.CONSTANTS?.INACTIVITY_TIMEOUT_MS ?? 30000,
    SYNC_INTERVAL_MS:      window.CONSTANTS?.SYNC_INTERVAL_MS ?? 900000,
    STORAGE_KEY_QUEUE:     window.CONSTANTS?.STORAGE_KEY_QUEUE ?? 'submissionQueue',
    MAX_QUEUE_SIZE:        window.CONSTANTS?.MAX_QUEUE_SIZE ?? 250,
    appState:              window.appState,
    dataHandlers:          window.dataHandlers,
    dataUtils:             window.dataUtils,
    timerManager:          window.timerManager,
  };
}

// ── Throttled interaction handler ─────────────────────────────────────────────

function throttledResetInactivityTimer() {
  if (throttleTimeout) return; // Already scheduled — skip
  throttleTimeout = setTimeout(() => {
    resetInactivityTimer();
    throttleTimeout = null;
  }, THROTTLE_DELAY);
}

// ── Periodic sync ─────────────────────────────────────────────────────────────

/**
 * Start periodic background data sync.
 *
 * BUG #16 FIX: This function MUST be called ONCE from index.js after
 * initialization, NOT from inside resetInactivityTimer().
 * Calling it on every user interaction was restarting the sync interval
 * countdown each time, potentially deferring sync indefinitely on active kiosks.
 *
 * @export — called from index.js Step 12
 */
export function startPeriodicSync() {
  const { SYNC_INTERVAL_MS, dataHandlers, timerManager } = getDependencies();
  if (timerManager) {
    timerManager.setSync(dataHandlers.autoSync, SYNC_INTERVAL_MS);
  } else {
    window.appState.syncTimer = setInterval(dataHandlers.autoSync, SYNC_INTERVAL_MS);
  }
  console.log(`[INACTIVITY] Periodic sync started (every ${SYNC_INTERVAL_MS / 1000}s)`);
}

// ── Inactivity timer ──────────────────────────────────────────────────────────

/**
 * Reset the inactivity timer.
 *
 * BUG #16 FIX: startPeriodicSync() call REMOVED from here.
 * This function ONLY manages the inactivity timeout.
 */
export function resetInactivityTimer() {
  const { INACTIVITY_TIMEOUT_MS, appState, dataUtils, timerManager } = getDependencies();

  // Clear existing inactivity timer
  if (timerManager) {
    timerManager.clearInactivity();
  } else {
    if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
  }

  // Do not restart if page is hidden
  if (!window.isKioskVisible) {
    console.log('[INACTIVITY] Page hidden — timer not started');
    return;
  }

  // Set new inactivity timeout
  const timeoutCallback = () => handleInactivityTimeout(dataUtils, appState);
  if (timerManager) {
    timerManager.setInactivity(timeoutCallback, INACTIVITY_TIMEOUT_MS);
  } else {
    appState.inactivityTimer = setTimeout(timeoutCallback, INACTIVITY_TIMEOUT_MS);
  }
}

// ── Inactivity timeout handler ────────────────────────────────────────────────

function handleInactivityTimeout(dataUtils, appState) {
  const idx             = appState.currentQuestionIndex;
  const currentQuestion = dataUtils.surveyQuestions[idx];

  console.log(`[INACTIVITY] Detected at question ${idx + 1} (${currentQuestion?.id})`);

  if (idx === 0) {
    // Q1 abandonment — record analytics and reset (nothing to save)
    console.log('[INACTIVITY] Q1 abandonment — recording analytics');
    try {
      getDependencies().dataHandlers.recordAnalytics('survey_abandoned', {
        questionId:        currentQuestion?.id,
        questionIndex:     idx,
        totalTimeSeconds:  getTotalSurveyTime(),
        reason:            'inactivity_q1',
        partialData:       { satisfaction: appState.formData.satisfaction ?? null },
      });
    } catch (analyticsErr) {
      console.warn('[INACTIVITY] Q1 abandonment analytics failed:', analyticsErr);
    }
    performKioskReset();
    return;
  }

  // Q2+ abandonment — save partial data then reset
  console.log('[INACTIVITY] Mid-survey abandonment — saving partial data');
  stopQuestionTimer(currentQuestion?.id);

  const totalTimeSeconds = getTotalSurveyTime();

  // BUG #15 FIX: Use active survey type's queue key, not the hard-coded Type 1 key.
  const surveyType = window.KIOSKCONFIG?.getActiveSurveyType?.()?.type || 'type1';
  const queueKey   = window.CONSTANTS?.SURVEY_TYPES?.[surveyType]?.storageKey
                    || window.CONSTANTS?.STORAGE_KEY_QUEUE
                    || 'submissionQueue';
  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE ?? 250;

  let submissionQueue = getDependencies().dataHandlers.getSubmissionQueue(queueKey);
  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[INACTIVITY] Queue full (${MAX_QUEUE_SIZE}) — trimming oldest`);
    submissionQueue = submissionQueue.slice(-(MAX_QUEUE_SIZE - 1));
  }

  const timestamp   = new Date().toISOString();
  const partialData = {
    ...appState.formData,
    surveyType,                           // Ensure correct type is tagged on the record
    completionTimeSeconds: totalTimeSeconds,
    questionTimeSpent:     { ...appState.questionTimeSpent },
    abandonedAt:           timestamp,
    abandonedAtQuestion:   currentQuestion?.id,
    abandonedAtQuestionIndex: idx,
    syncstatus:            'unsynced_inactivity',
  };

  submissionQueue.push(partialData);
  getDependencies().dataHandlers.safeSetLocalStorage(queueKey, submissionQueue);
  console.log(`[INACTIVITY] Partial abandonment saved (queue ${surveyType}: ${submissionQueue.length}/${MAX_QUEUE_SIZE})`);

  try {
    getDependencies().dataHandlers.recordAnalytics('survey_abandoned', {
      questionId:       currentQuestion?.id,
      questionIndex:    idx,
      totalTimeSeconds,
      reason:           'inactivity',
    });
  } catch (analyticsErr) {
    console.warn('[INACTIVITY] Abandonment analytics failed:', analyticsErr);
  }

  // Clean up admin panel timers if open
  if (typeof window.cleanupAdminPanel === 'function') {
    window.cleanupAdminPanel();
  }

  performKioskReset();
}

// ── Event listeners ───────────────────────────────────────────────────────────

/**
 * Add mouse/keyboard/touch event listeners.
 * BATTERY: Only active when page is visible; listeners are passive and throttled.
 */
export function addInactivityListeners() {
  removeInactivityListeners(); // Idempotent — safe to call multiple times

  if (document.hidden) {
    console.log('[INACTIVITY] Page hidden — listeners not added');
    return;
  }

  boundResetInactivityTimer = throttledResetInactivityTimer;

  document.addEventListener('mousemove',  boundResetInactivityTimer, { passive: true });
  document.addEventListener('keydown',    boundResetInactivityTimer, { passive: true });
  document.addEventListener('touchstart', boundResetInactivityTimer, { passive: true });

  console.log('[INACTIVITY] Listeners active (throttled, passive)');
}

/**
 * Remove all inactivity event listeners and clear throttle.
 */
export function removeInactivityListeners() {
  if (boundResetInactivityTimer) {
    document.removeEventListener('mousemove',  boundResetInactivityTimer);
    document.removeEventListener('keydown',    boundResetInactivityTimer);
    document.removeEventListener('touchstart', boundResetInactivityTimer);
    boundResetInactivityTimer = null;
  }
  if (throttleTimeout) {
    clearTimeout(throttleTimeout);
    throttleTimeout = null;
  }
}

// ── Pause / Resume ────────────────────────────────────────────────────────────

/**
 * Pause the inactivity timer (preserves remaining session — no reset).
 * Called by visibilityHandler when page becomes hidden.
 */
export function pauseInactivityTimer() {
  const { timerManager, appState } = getDependencies();
  if (timerManager) {
    timerManager.clearInactivity();
  } else {
    if (appState.inactivityTimer) {
      clearTimeout(appState.inactivityTimer);
      appState.inactivityTimer = null;
    }
  }
  console.log('[INACTIVITY] Timer paused');
}

/**
 * Resume the inactivity timer after a pause.
 * Uses a full resetInactivityTimer() — remaining time is not tracked precisely
 * (setTimeout does not expose remaining time). The reset gives the user a
 * fresh full window on wake, which is the safest UX for a public kiosk.
 */
export function resumeInactivityTimer() {
  console.log('[INACTIVITY] Timer resumed — granting fresh inactivity window');
  resetInactivityTimer();
}

// ── Visibility handler ────────────────────────────────────────────────────────

function handleInactivityVisibilityChange() {
  if (document.hidden) {
    console.log('[INACTIVITY] Hidden — removing listeners');
    removeInactivityListeners();
  } else {
    console.log('[INACTIVITY] Visible — adding listeners');
    addInactivityListeners();
  }
}

export function setupInactivityVisibilityHandler() {
  document.addEventListener('visibilitychange', handleInactivityVisibilityChange);
  console.log('[INACTIVITY] Visibility handler active');
}

export function cleanupInactivityVisibilityHandler() {
  document.removeEventListener('visibilitychange', handleInactivityVisibilityChange);
}

// ── Kiosk reset ───────────────────────────────────────────────────────────────

export function performKioskReset() {
  console.log('[INACTIVITY] 🔄 Performing kiosk reset...');

  const { appState, dataHandlers } = getDependencies();
  const STORAGE_KEY_STATE = window.CONSTANTS?.STORAGE_KEY_STATE ?? 'kioskAppState';

  // Clean up listeners and timers
  if (window.uiHandlers?.cleanupStartScreenListeners) window.uiHandlers.cleanupStartScreenListeners();
  if (window.uiHandlers?.cleanupInputFocusScroll)      window.uiHandlers.cleanupInputFocusScroll();
  if (window.uiHandlers?.cleanupIntervals)             window.uiHandlers.cleanupIntervals();

  localStorage.removeItem(STORAGE_KEY_STATE);

  appState.formData = {
    id:        dataHandlers.generateUUID(),
    timestamp: new Date().toISOString(),
  };
  appState.currentQuestionIndex = 0;
  appState.surveyStartTime      = null;
  appState.questionStartTimes   = {};
  appState.questionTimeSpent    = {};

  console.log('[INACTIVITY] New session ID:', appState.formData.id);

  if (window.uiHandlers?.showStartScreen) {
    window.uiHandlers.showStartScreen();
  }

  const nextBtn = window.globals?.nextBtn;
  const prevBtn = window.globals?.prevBtn;
  if (nextBtn) nextBtn.disabled = true;
  if (prevBtn) prevBtn.disabled = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTotalSurveyTime() {
  const { appState } = getDependencies();
  if (!appState.surveyStartTime) return 0;
  return Math.round((Date.now() - appState.surveyStartTime) / 1000);
}

function stopQuestionTimer(questionId) {
  if (!questionId) return;
  const { appState, dataHandlers } = getDependencies();
  if (appState.questionStartTimes[questionId]) {
    const timeSpent = Date.now() - appState.questionStartTimes[questionId];
    appState.questionTimeSpent[questionId] = timeSpent;
    delete appState.questionStartTimes[questionId];

    if (dataHandlers) {
      const STORAGE_KEY_STATE = window.CONSTANTS?.STORAGE_KEY_STATE ?? 'kioskAppState';
      dataHandlers.safeSetLocalStorage(STORAGE_KEY_STATE, {
        currentQuestionIndex: appState.currentQuestionIndex,
        formData:             appState.formData,
        surveyStartTime:      appState.surveyStartTime,
        questionStartTimes:   appState.questionStartTimes,
        questionTimeSpent:    appState.questionTimeSpent,
      });
    }
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────

export function isInactivityTimerActive() {
  const { appState } = getDependencies();
  return appState.inactivityTimer !== null;
}

export function getInactivityTimeRemaining() {
  console.warn('[INACTIVITY] Cannot get precise remaining time from setTimeout');
  return null;
}

// ── Default export ────────────────────────────────────────────────────────────

export default {
  resetInactivityTimer,
  addInactivityListeners,
  removeInactivityListeners,
  setupInactivityVisibilityHandler,
  cleanupInactivityVisibilityHandler,
  startPeriodicSync,
  performKioskReset,
  isInactivityTimerActive,
  pauseInactivityTimer,
  resumeInactivityTimer,
};
