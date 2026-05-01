// FILE: timers/inactivityHandler.js
// PURPOSE: Handle user inactivity detection and auto-reset
// DEPENDENCIES: window.CONSTANTS, window.appState, window.dataHandlers, timerManager.js
// VERSION: 3.4.4
// CHANGES FROM 3.4.3:
//   - ADDED: Debounce logic to resetInactivityTimer to prevent excessive 
//     DOM/Timer operations during rapid user input bursts.

import { buildQueueRecord } from '../main/contracts.js';
import { showStartScreen } from '../ui/navigation/startScreen.js';  // ← ADD THIS

let boundResetInactivityTimer = null;
let throttleTimeout = null;
const THROTTLE_DELAY = 2000;

// ADDED: Debounce configuration
const DEBOUNCE_DELAY = 2000;
let lastResetTime = 0;
let debounceTimer = null;

let visibilityHandlerBound = false;
let focusHandlerBound = false;

// ── Dependency accessor ───────────────────────────────────────────────────────

function getDependencies() {
  return {
    INACTIVITY_TIMEOUT_MS: window.CONSTANTS?.INACTIVITY_TIMEOUT_MS ?? 60000,
    SYNC_INTERVAL_MS:      window.CONSTANTS?.SYNC_INTERVAL_MS      ?? 300000,
    MAX_QUEUE_SIZE:        window.CONSTANTS?.MAX_QUEUE_SIZE         ?? 250,
    appState:     window.appState,
    dataHandlers: window.dataHandlers,
    dataUtils:    window.dataUtils,
    timerManager: window.timerManager,
  };
}

// ── Storage key helper ────────────────────────────────────────────────────────

function _getStorageKey() {
  return (
    window.CONSTANTS?.STORAGE_KEY_STATE ||
    window.appState?.storageKey ||
    'kioskState'
  );
}

function _safeRemoveStorageKey() {
  try {
    localStorage.removeItem(_getStorageKey());
  } catch (e) {
    console.warn('[INACTIVITY] Failed to remove state key:', e.message);
  }
}

// ── Active survey question helper ─────────────────────────────────────────────

function _isShayona() {
  return window.DEVICECONFIG?.kioskMode === 'shayona';
}

function _getUtils() {
  return _isShayona() && window.shayonaDataUtils
    ? window.shayonaDataUtils
    : window.dataUtils;
}

function getQuestions() {
  const utils = _getUtils();

  if (typeof utils?.getSurveyQuestions === 'function') {
    return utils.getSurveyQuestions();
  }

  if (Array.isArray(utils?.surveyQuestions)) {
    return utils.surveyQuestions;
  }

  return [];
}

// ── Internal Reset Logic ──────────────────────────────────────────────────────

function _doResetInactivityTimer() {
  const { INACTIVITY_TIMEOUT_MS, appState, dataUtils, timerManager } = getDependencies();

  if (timerManager) {
    timerManager.clearInactivity();
  } else {
    if (appState.inactivityTimer) {
      clearTimeout(appState.inactivityTimer);
      appState.inactivityTimer = null;
    }
  }

  if (document.hidden) {
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

// ── Throttled/Debounced interaction handler ───────────────────────────────────

function throttledResetInactivityTimer() {
  if (throttleTimeout) return;
  throttleTimeout = setTimeout(() => {
    throttleTimeout = null;
    resetInactivityTimer();
  }, THROTTLE_DELAY);
}

// ── Periodic sync ─────────────────────────────────────────────────────────────

export function startPeriodicSync() {
  const { SYNC_INTERVAL_MS, dataHandlers, timerManager, appState } = getDependencies();

  if (!dataHandlers?.autoSync) {
    console.warn('[INACTIVITY] autoSync not available — skipping periodic sync setup');
    return;
  }

  if (timerManager) {
    timerManager.setSync(dataHandlers.autoSync, SYNC_INTERVAL_MS);
  } else {
    if (appState.syncTimer) {
      clearInterval(appState.syncTimer);
    }
    appState.syncTimer = setInterval(dataHandlers.autoSync, SYNC_INTERVAL_MS);
  }

  console.log(`[INACTIVITY] Periodic sync started (every ${SYNC_INTERVAL_MS / 1000}s)`);
}

export function stopPeriodicSync() {
  const { appState, timerManager } = getDependencies();

  if (timerManager) {
    timerManager.clearSync?.();
  } else if (appState?.syncTimer) {
    clearInterval(appState.syncTimer);
    appState.syncTimer = null;
  }

  console.log('[INACTIVITY] Periodic sync stopped');
}

// ── Inactivity timer ──────────────────────────────────────────────────────────

export function resetInactivityTimer() {
  const now = Date.now();
  if (now - lastResetTime < DEBOUNCE_DELAY) {
    console.log('[INACTIVITY] Debounced reset (within 2s)');
    return;
  }
  
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    _doResetInactivityTimer();
    lastResetTime = Date.now();
    console.log('[INACTIVITY] Timer restarted (debounced)');
  }, 50);
}

// ── Inactivity timeout handler ────────────────────────────────────────────────

function handleInactivityTimeout(dataUtils, appState) {
  const idx             = appState.currentQuestionIndex;
  const questions       = getQuestions();
  const currentQuestion = questions[idx];

  console.log(`[INACTIVITY] Detected at question ${idx + 1} (${currentQuestion?.id})`);

  if (idx === 0) {
    console.log('[INACTIVITY] Q1 abandonment — recording analytics');
    try {
      getDependencies().dataHandlers.recordAnalytics('survey_abandoned', {
        questionId:       currentQuestion?.id,
        questionIndex:    idx,
        totalTimeSeconds: getTotalSurveyTime(),
        reason:           'inactivity_q1',
        surveyType:       window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1',
        partialData:      { satisfaction: appState.formData?.satisfaction ?? null },
      });
    } catch (analyticsErr) {
      console.warn('[INACTIVITY] Q1 abandonment analytics failed:', analyticsErr);
    }

    if (typeof window.cleanupAdminPanel === 'function') window.cleanupAdminPanel();
    performKioskReset();
    return;
  }

  console.log('[INACTIVITY] Mid-survey abandonment — saving partial data');
  stopQuestionTimer(currentQuestion?.id);

  const totalTimeSeconds = getTotalSurveyTime();
  const surveyType       = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';

  const queueKey =
    window.CONSTANTS?.SURVEY_TYPES?.[surveyType]?.storageKey ||
    window.CONSTANTS?.STORAGE_KEY_QUEUE ||
    'submissionQueue';

  const { dataHandlers } = getDependencies();
  const timestamp   = new Date().toISOString();

  const partialFormData = {
    ...appState.formData,
    id:                       appState.formData?.id || dataHandlers.generateUUID(),
    completionTimeSeconds:    totalTimeSeconds,
    questionTimeSpent:        { ...appState.questionTimeSpent },
    abandonedAtQuestion:      currentQuestion?.id,
    abandonedAtQuestionIndex: idx,
  };

  const record = buildQueueRecord(partialFormData, {
    surveyType,
    sync_status:     'unsynced_partial',
    abandonedAt:     timestamp,
    abandonedReason: 'inactivity',
  });

  dataHandlers.addToQueue(record, queueKey);
  console.log(`[INACTIVITY] Partial abandonment saved to queue "${queueKey}" (${surveyType})`);

  try {
    dataHandlers.recordAnalytics('survey_abandoned', {
      questionId:        currentQuestion?.id,
      questionIndex:     idx,
      totalTimeSeconds,
      reason:            'inactivity',
      surveyType,
      questionTimeSpent: { ...appState.questionTimeSpent },
    });
  } catch (analyticsErr) {
    console.warn('[INACTIVITY] Abandonment analytics failed:', analyticsErr);
  }

  if (typeof window.cleanupAdminPanel === 'function') window.cleanupAdminPanel();
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
  document.addEventListener('click',      boundResetInactivityTimer, { passive: true });

  console.log('[INACTIVITY] Listeners active (throttled, passive)');
}

export function removeInactivityListeners() {
  if (boundResetInactivityTimer) {
    document.removeEventListener('mousemove',  boundResetInactivityTimer);
    document.removeEventListener('keydown',    boundResetInactivityTimer);
    document.removeEventListener('touchstart', boundResetInactivityTimer);
    document.removeEventListener('click',      boundResetInactivityTimer);
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

// ── Shared visible handler ────────────────────────────────────────────────────

function handleAppVisible() {
  console.log('[INACTIVITY] App visible — restoring listeners and restarting timer');
  addInactivityListeners();
  resetInactivityTimer();
}

// ── Visibility handler ────────────────────────────────────────────────────────

function handleInactivityVisibilityChange() {
  if (document.hidden) {
    console.log('[INACTIVITY] Hidden — pausing timer and removing listeners');
    pauseInactivityTimer();
    removeInactivityListeners();
  } else {
    handleAppVisible();
  }
}

function handleWindowFocus() {
  if (!document.hidden) {
    console.log('[INACTIVITY] window.focus — restoring listeners and restarting timer');
    handleAppVisible();
  }
}

export function setupInactivityVisibilityHandler() {
  if (visibilityHandlerBound) {
    console.log('[INACTIVITY] Visibility handler already registered — skipping');
  } else {
    document.addEventListener('visibilitychange', handleInactivityVisibilityChange);
    visibilityHandlerBound = true;
    console.log('[INACTIVITY] Visibility handler active');
  }

  if (focusHandlerBound) {
    console.log('[INACTIVITY] Focus handler already registered — skipping');
  } else {
    window.addEventListener('focus', handleWindowFocus);
    focusHandlerBound = true;
    console.log('[INACTIVITY] Window focus handler active (iPad PWA resume coverage)');
  }
}

export function cleanupInactivityVisibilityHandler() {
  if (visibilityHandlerBound) {
    document.removeEventListener('visibilitychange', handleInactivityVisibilityChange);
    visibilityHandlerBound = false;
  }

  if (focusHandlerBound) {
    window.removeEventListener('focus', handleWindowFocus);
    focusHandlerBound = false;
  }
}

// ── Kiosk reset ───────────────────────────────────────────────────────────────

export function performKioskReset() {
  console.log('[INACTIVITY] 🔄 Performing kiosk reset...');

  window.__surveyStateInitialized = false;
  console.log('[INACTIVITY] ✅ __surveyStateInitialized reset — initializeSurveyState can re-run');

  const { appState, dataHandlers } = getDependencies();

  if (window.uiHandlers?.cleanupStartScreenListeners) window.uiHandlers.cleanupStartScreenListeners();
  if (window.uiHandlers?.cleanupInputFocusScroll)     window.uiHandlers.cleanupInputFocusScroll();
  if (window.uiHandlers?.cleanupIntervals)            window.uiHandlers.cleanupIntervals();

  try {
    if (typeof window.cleanupVideoLoop === 'function') {
      window.cleanupVideoLoop();
      console.log('[INACTIVITY] ✅ Video loop cleaned up on reset');
    }
  } catch (videoErr) {
    console.warn('[INACTIVITY] Video loop cleanup failed (non-fatal):', videoErr);
  }

  cleanupInactivityVisibilityHandler();
  _safeRemoveStorageKey();

  appState.formData = {
    id:        dataHandlers.generateUUID(),
    timestamp: new Date().toISOString(),
  };
  appState.currentQuestionIndex = 0;
  appState.surveyStartTime      = null;
  appState.questionStartTimes   = {};
  appState.questionTimeSpent    = {};

  if (appState.countdownInterval) {
    clearInterval(appState.countdownInterval);
    appState.countdownInterval = null;
  }

  console.log('[INACTIVITY] New session ID:', appState.formData.id);


if (typeof window.uiHandlers?.showStartScreen === 'function') {
  window.uiHandlers.showStartScreen();
} else {
  showStartScreen();  // ← DIRECT CALL
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

    setupInactivityVisibilityHandler();
    console.log('[INACTIVITY] ✅ Visibility handlers re-bound after reset');

    addInactivityListeners();
    resetInactivityTimer();
    console.log('[INACTIVITY] ✅ Inactivity listeners re-armed and timer restarted after reset');
  }, 150);
}

// ── Full cleanup ──────────────────────────────────────────────────────────────

export function cleanupInactivityHandler() {
  removeInactivityListeners();
  cleanupInactivityVisibilityHandler();
  pauseInactivityTimer();
  stopPeriodicSync();
  console.log('[INACTIVITY] Full cleanup done');
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

  if (!appState.questionStartTimes[questionId]) return;

  const timeSpent = Date.now() - appState.questionStartTimes[questionId];
  appState.questionTimeSpent[questionId] = timeSpent;
  delete appState.questionStartTimes[questionId];

  if (dataHandlers) {
    dataHandlers.safeSetLocalStorage(_getStorageKey(), {
      currentQuestionIndex: appState.currentQuestionIndex,
      formData:             { ...appState.formData },
      surveyStartTime:      appState.surveyStartTime,
      questionStartTimes:   { ...appState.questionStartTimes },
      questionTimeSpent:    { ...appState.questionTimeSpent },
    });
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────

export function isInactivityTimerActive() {
  const { appState, timerManager } = getDependencies();
  return timerManager
    ? timerManager.hasInactivityTimer?.()
    : appState.inactivityTimer !== null;
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
  cleanupInactivityHandler,
  startPeriodicSync,
  stopPeriodicSync,
  performKioskReset,
  isInactivityTimerActive,
  pauseInactivityTimer,
  resumeInactivityTimer,
};
