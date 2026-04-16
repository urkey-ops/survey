// FILE: timers/inactivityHandler.js
// PURPOSE: Handle user inactivity detection and auto-reset
// DEPENDENCIES: window.CONSTANTS, window.appState, window.dataHandlers, timerManager.js
// VERSION: 3.1.0 - FIX: rebind admin panel after inactivity reset; fixed KIOSK_CONFIG typo

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
  if (throttleTimeout) return;
  throttleTimeout = setTimeout(() => {
    resetInactivityTimer();
    throttleTimeout = null;
  }, THROTTLE_DELAY);
}

// ── Periodic sync ─────────────────────────────────────────────────────────────

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

export function resetInactivityTimer() {
  const { INACTIVITY_TIMEOUT_MS, appState, dataUtils, timerManager } = getDependencies();

  if (timerManager) {
    timerManager.clearInactivity();
  } else {
    if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
  }

  if (!window.isKioskVisible) {
    console.log('[INACTIVITY] Page hidden — timer not started');
    return;
  }

  const timeoutCallback = () => handleInactivityTimeout(dataUtils, appState);
  if (timerManager) {
    timerManager.setInactivity(timeoutCallback, INACTIVITY_TIMEOUT_MS);
  } else {
    appState.inactivityTimer = setTimeout(timeoutCallback, INACTIVITY_TIMEOUT_MS);
  }
}

// ── Inactivity timeout handler ────────────────────────────────────────────────

function handleInactivityTimeout(dataUtils, appState) {
  const idx = appState.currentQuestionIndex;
  const currentQuestion = dataUtils.surveyQuestions[idx];

  console.log(`[INACTIVITY] Detected at question ${idx + 1} (${currentQuestion?.id})`);

  if (idx === 0) {
    console.log('[INACTIVITY] Q1 abandonment — recording analytics');
    try {
      getDependencies().dataHandlers.recordAnalytics('survey_abandoned', {
        questionId: currentQuestion?.id,
        questionIndex: idx,
        totalTimeSeconds: getTotalSurveyTime(),
        reason: 'inactivity_q1',
        partialData: { satisfaction: appState.formData.satisfaction ?? null },
      });
    } catch (analyticsErr) {
      console.warn('[INACTIVITY] Q1 abandonment analytics failed:', analyticsErr);
    }

    if (typeof window.cleanupAdminPanel === 'function') {
      window.cleanupAdminPanel();
    }

    performKioskReset();
    return;
  }

  console.log('[INACTIVITY] Mid-survey abandonment — saving partial data');
  stopQuestionTimer(currentQuestion?.id);

  const totalTimeSeconds = getTotalSurveyTime();

  const surveyType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
  const queueKey =
    window.CONSTANTS?.SURVEY_TYPES?.[surveyType]?.storageKey ||
    window.CONSTANTS?.STORAGE_KEY_QUEUE ||
    'submissionQueue';

  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE ?? 250;

  let submissionQueue = getDependencies().dataHandlers.getSubmissionQueue(queueKey);
  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[INACTIVITY] Queue full (${MAX_QUEUE_SIZE}) — trimming oldest`);
    submissionQueue = submissionQueue.slice(-(MAX_QUEUE_SIZE - 1));
  }

  const timestamp = new Date().toISOString();
  const partialData = {
    ...appState.formData,
    surveyType,
    completionTimeSeconds: totalTimeSeconds,
    questionTimeSpent: { ...appState.questionTimeSpent },
    abandonedAt: timestamp,
    abandonedAtQuestion: currentQuestion?.id,
    abandonedAtQuestionIndex: idx,
    sync_status: 'unsynced_inactivity',
  };

  submissionQueue.push(partialData);
  getDependencies().dataHandlers.safeSetLocalStorage(queueKey, submissionQueue);
  console.log(`[INACTIVITY] Partial abandonment saved (queue ${surveyType}: ${submissionQueue.length}/${MAX_QUEUE_SIZE})`);

  try {
    getDependencies().dataHandlers.recordAnalytics('survey_abandoned', {
      questionId: currentQuestion?.id,
      questionIndex: idx,
      totalTimeSeconds,
      reason: 'inactivity',
    });
  } catch (analyticsErr) {
    console.warn('[INACTIVITY] Abandonment analytics failed:', analyticsErr);
  }

  if (typeof window.cleanupAdminPanel === 'function') {
    window.cleanupAdminPanel();
  }

  performKioskReset();
}

// ── Event listeners ───────────────────────────────────────────────────────────

export function addInactivityListeners() {
  removeInactivityListeners();

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

  if (window.uiHandlers?.cleanupStartScreenListeners) window.uiHandlers.cleanupStartScreenListeners();
  if (window.uiHandlers?.cleanupInputFocusScroll)      window.uiHandlers.cleanupInputFocusScroll();
  if (window.uiHandlers?.cleanupIntervals)             window.uiHandlers.cleanupIntervals();

  localStorage.removeItem(STORAGE_KEY_STATE);

  appState.formData = {
    id: dataHandlers.generateUUID(),
    timestamp: new Date().toISOString(),
  };
  appState.currentQuestionIndex = 0;
  appState.surveyStartTime = null;
  appState.questionStartTimes = {};
  appState.questionTimeSpent = {};

  console.log('[INACTIVITY] New session ID:', appState.formData.id);

  if (window.uiHandlers?.showStartScreen) {
    window.uiHandlers.showStartScreen();
  }

  const nextBtn = window.globals?.nextBtn;
  const prevBtn = window.globals?.prevBtn;
  if (nextBtn) nextBtn.disabled = true;
  if (prevBtn) prevBtn.disabled = true;

  setTimeout(() => {
    try {
      if (typeof window.setupAdminPanel === 'function') {
        window.setupAdminPanel();
        console.log('[INACTIVITY] ✅ Admin panel re-initialized after reset');
      }
    } catch (err) {
      console.warn('[INACTIVITY] Admin panel re-init failed:', err);
    }
  }, 150);
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
        formData: appState.formData,
        surveyStartTime: appState.surveyStartTime,
        questionStartTimes: appState.questionStartTimes,
        questionTimeSpent: appState.questionTimeSpent,
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
