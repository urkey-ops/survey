// FILE: timers/inactivityHandler.js
// PURPOSE: Handle user inactivity detection and auto-reset
// DEPENDENCIES: window.CONSTANTS, window.appState, window.dataHandlers, timerManager.js
// VERSION: 3.2.0
// CHANGES FROM 3.1.0:
//   - resetInactivityTimer: replaced mixed `window.isKioskVisible` flag with
//     `document.hidden` as the single source of truth for page visibility.
//     `window.isKioskVisible` was set externally and could drift out of sync
//     after iPad PWA backgrounding/resuming; `document.hidden` is always
//     accurate and requires no external setter.
//   - handleInactivityVisibilityChange: on visible, now calls
//     resetInactivityTimer() directly (grants a fresh window) rather than
//     just re-adding listeners without restarting the timer.  Previously the
//     timer was never restarted after a resume, so the kiosk could time out
//     immediately on the first interaction after coming back into view.
//   - addInactivityListeners: mirrors the same `document.hidden` guard that
//     resetInactivityTimer uses — no listeners are added if the page is
//     hidden at call time (was already present, kept unchanged).
//   - performKioskReset: storage key resolution moved to _getStorageKey()
//     helper (same pattern as core.js v5.3.0) so it stays in sync.
//   - stopQuestionTimer (private): same _getStorageKey() helper applied.
//   - All other behaviour (throttle, partial-data save, analytics, admin
//     panel re-init, periodic sync) is unchanged.

let boundResetInactivityTimer = null;
let throttleTimeout            = null;
const THROTTLE_DELAY           = 2000;

// ── Dependency accessor ───────────────────────────────────────────────────────

function getDependencies() {
  return {
    INACTIVITY_TIMEOUT_MS: window.CONSTANTS?.INACTIVITY_TIMEOUT_MS ?? 30000,
    SYNC_INTERVAL_MS:      window.CONSTANTS?.SYNC_INTERVAL_MS      ?? 900000,
    STORAGE_KEY_QUEUE:     window.CONSTANTS?.STORAGE_KEY_QUEUE     ?? 'submissionQueue',
    MAX_QUEUE_SIZE:        window.CONSTANTS?.MAX_QUEUE_SIZE         ?? 250,
    appState:              window.appState,
    dataHandlers:          window.dataHandlers,
    dataUtils:             window.dataUtils,
    timerManager:          window.timerManager,
  };
}

// ── Storage key helper ────────────────────────────────────────────────────────

/**
 * Single resolver for the persisted kiosk-state storage key.
 * Mirrors the same helper in core.js so both files always use the same key.
 * Priority: CONSTANTS → appState.storageKey → legacy fallback string.
 */
function _getStorageKey() {
  return (
    window.CONSTANTS?.STORAGE_KEY_STATE ||
    window.appState?.storageKey         ||
    'kioskAppState'
  );
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

/**
 * (Re)start the inactivity countdown.
 *
 * Visibility source-of-truth change (v3.2.0):
 *   Uses `document.hidden` instead of `window.isKioskVisible`.
 *   `document.hidden` is a browser-native, always-accurate property that
 *   updates immediately when an iPad PWA is backgrounded or the screen
 *   locks.  `window.isKioskVisible` required an external setter to stay
 *   in sync and could silently drift, causing either missed resets (timer
 *   runs while page is hidden) or false resets (timer skipped when visible).
 */
export function resetInactivityTimer() {
  const { INACTIVITY_TIMEOUT_MS, appState, dataUtils, timerManager } = getDependencies();

  // Clear any existing inactivity countdown first.
  if (timerManager) {
    timerManager.clearInactivity();
  } else {
    if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
  }

  // Do not start a new timer while the page is not visible.
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

// ── Inactivity timeout handler ────────────────────────────────────────────────

function handleInactivityTimeout(dataUtils, appState) {
  const idx             = appState.currentQuestionIndex;
  const currentQuestion = dataUtils.surveyQuestions[idx];

  console.log(`[INACTIVITY] Detected at question ${idx + 1} (${currentQuestion?.id})`);

  if (idx === 0) {
    console.log('[INACTIVITY] Q1 abandonment — recording analytics');
    try {
      getDependencies().dataHandlers.recordAnalytics('survey_abandoned', {
        questionId:       currentQuestion?.id,
        questionIndex:    idx,
        totalTimeSeconds: getTotalSurveyTime(),
        reason:           'inactivity_q1',
        partialData:      { satisfaction: appState.formData.satisfaction ?? null },
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
  const surveyType       =
    window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';

  const queueKey =
    window.CONSTANTS?.SURVEY_TYPES?.[surveyType]?.storageKey ||
    window.CONSTANTS?.STORAGE_KEY_QUEUE                      ||
    'submissionQueue';

  const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE ?? 250;

  let submissionQueue = getDependencies().dataHandlers.getSubmissionQueue(queueKey);
  if (submissionQueue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[INACTIVITY] Queue full (${MAX_QUEUE_SIZE}) — trimming oldest`);
    submissionQueue = submissionQueue.slice(-(MAX_QUEUE_SIZE - 1));
  }

  const timestamp   = new Date().toISOString();
  const partialData = {
    ...appState.formData,
    surveyType,
    completionTimeSeconds:    totalTimeSeconds,
    questionTimeSpent:        { ...appState.questionTimeSpent },
    abandonedAt:              timestamp,
    abandonedAtQuestion:      currentQuestion?.id,
    abandonedAtQuestionIndex: idx,
    sync_status:              'unsynced_inactivity',
  };

  submissionQueue.push(partialData);
  getDependencies().dataHandlers.safeSetLocalStorage(queueKey, submissionQueue);
  console.log(
    `[INACTIVITY] Partial abandonment saved ` +
    `(queue ${surveyType}: ${submissionQueue.length}/${MAX_QUEUE_SIZE})`
  );

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

/**
 * Respond to Page Visibility API changes.
 *
 * Behaviour change (v3.2.0):
 *   On becoming visible the handler now calls resetInactivityTimer() rather
 *   than only addInactivityListeners().  In the original code, listeners
 *   were re-attached but no timer was started, so the countdown only began
 *   on the user's *next* interaction — which could be never if the screen
 *   woke to an idle state.  Calling resetInactivityTimer() grants a fresh
 *   full-length window immediately on resume AND re-checks document.hidden
 *   internally, so it is safe to call unconditionally here.
 *
 *   addInactivityListeners() is still called first so user interactions
 *   also reset the countdown as expected.
 */
function handleInactivityVisibilityChange() {
  if (document.hidden) {
    console.log('[INACTIVITY] Hidden — pausing timer and removing listeners');
    pauseInactivityTimer();
    removeInactivityListeners();
  } else {
    console.log('[INACTIVITY] Visible — restoring listeners and restarting timer');
    addInactivityListeners();
    resetInactivityTimer(); // grants a fresh window on every resume
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

  if (window.uiHandlers?.cleanupStartScreenListeners) window.uiHandlers.cleanupStartScreenListeners();
  if (window.uiHandlers?.cleanupInputFocusScroll)      window.uiHandlers.cleanupInputFocusScroll();
  if (window.uiHandlers?.cleanupIntervals)             window.uiHandlers.cleanupIntervals();

  localStorage.removeItem(_getStorageKey());

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
      dataHandlers.safeSetLocalStorage(_getStorageKey(), {
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
