// FILE: main/visibilityHandler.js
// PURPOSE: Handle visibility change events (tab switching, minimizing, iPad sleep)
// DEPENDENCIES: window.CONSTANTS, window.appState, window.uiHandlers
// VERSION: 3.1.0
// FIXES:
//   - idempotent setup/cleanup
//   - document.hidden used as primary source of truth
//   - deduped resume flow across visibilitychange + focus
//   - clears/replaces pending hidden timeout safely
//   - preserves iOS pageshow/bfcache handling

let visibilityTimeout = null;
let startScreenModule = null;

let handlersBound = false;
let lastResumeAt = 0;
let batteryCheckTimeout = null;

const RESUME_DEDUPE_MS = 750;

// ── Module cache ──────────────────────────────────────────────────────────────

async function getStartScreenModule() {
  if (!startScreenModule) {
    try {
      startScreenModule = await import('../ui/navigation/startScreen.js');
    } catch (err) {
      console.warn('[VISIBILITY] Could not import startScreen module:', err);
      return null;
    }
  }
  return startScreenModule;
}

// ── Timer helpers ─────────────────────────────────────────────────────────────

function clearVisibilityTimeout() {
  if (visibilityTimeout) {
    clearTimeout(visibilityTimeout);
    visibilityTimeout = null;
  }
}

function clearBatteryCheckTimeout() {
  if (batteryCheckTimeout) {
    clearTimeout(batteryCheckTimeout);
    batteryCheckTimeout = null;
  }
}

function markVisibleCompatibilityFlag() {
  window.isKioskVisible = !document.hidden;
}

function recentlyResumed() {
  return Date.now() - lastResumeAt < RESUME_DEDUPE_MS;
}

// ── Video helpers ─────────────────────────────────────────────────────────────

async function handleVideoOnHidden() {
  const module = await getStartScreenModule();
  if (module?.handleVideoVisibilityChange) {
    module.handleVideoVisibilityChange(false);
  }
}

async function handleVideoOnVisible() {
  const module = await getStartScreenModule();
  if (module?.handleVideoVisibilityChange) {
    module.handleVideoVisibilityChange(true);
  }
}

// ── Core visibility flows ─────────────────────────────────────────────────────

function handleHiddenState() {
  const CONSTANTS = window.CONSTANTS;
  const uiHandlers = window.uiHandlers;

  console.log('[VISIBILITY] Document hidden — pausing inactivity timer immediately');

  clearVisibilityTimeout();
  handleVideoOnHidden();

  if (uiHandlers?.pauseInactivityTimer) {
    uiHandlers.pauseInactivityTimer();
  }

  visibilityTimeout = setTimeout(() => {
    console.log('[VISIBILITY] Kiosk hidden for grace window — clearing all timers');
    window.isKioskVisible = false;
    uiHandlers?.clearAllTimers?.();
    visibilityTimeout = null;
  }, CONSTANTS?.VISIBILITY_CHANGE_DELAY_MS ?? 5000);
}

function handleVisibleState(source = 'visibilitychange') {
  const appState = window.appState;
  const uiHandlers = window.uiHandlers;

  if (document.hidden) return;

  if (recentlyResumed()) {
    console.log(`[VISIBILITY] Resume deduped (${source})`);
    markVisibleCompatibilityFlag();
    return;
  }

  lastResumeAt = Date.now();

  console.log(`[VISIBILITY] Document visible — resuming (${source})`);

  clearVisibilityTimeout();
  markVisibleCompatibilityFlag();
  handleVideoOnVisible();

  if (appState?.currentQuestionIndex > 0) {
    if (uiHandlers?.resumeInactivityTimer) {
      uiHandlers.resumeInactivityTimer();
    } else if (uiHandlers?.resetInactivityTimer) {
      uiHandlers.resetInactivityTimer();
    }
  }
}

// ── Core visibility handler ───────────────────────────────────────────────────

function handleVisibilityChange() {
  if (document.hidden) {
    handleHiddenState();
  } else {
    handleVisibleState('visibilitychange');
  }
}

// ── iOS-specific handlers ─────────────────────────────────────────────────────

function handlePageShow(event) {
  if (event.persisted) {
    console.log('[VISIBILITY] Page restored from cache (iOS bfcache)');
    markVisibleCompatibilityFlag();
    handleVisibleState('pageshow.persisted');
    return;
  }

  console.log('[VISIBILITY] 🔋 Fresh page load (possible battery death recovery)');

  clearBatteryCheckTimeout();
  batteryCheckTimeout = setTimeout(() => {
    checkVideoHealthAfterBatteryDeath();
    batteryCheckTimeout = null;
  }, 2000);
}

function handleFocus() {
  if (!document.hidden) {
    console.log('[VISIBILITY] Focus gained — forcing visibility check');
    handleVisibleState('focus');
  }
}

// ── Battery death recovery ────────────────────────────────────────────────────

async function checkVideoHealthAfterBatteryDeath() {
  const kioskVideo = window.globals?.kioskVideo;
  const kioskStartScreen = window.globals?.kioskStartScreen;

  if (!kioskStartScreen || kioskStartScreen.classList.contains('hidden')) return;

  if (!kioskVideo) {
    console.error('[VISIBILITY] ⚠️ Video element missing after page load');
    return;
  }

  const hasSrc = !!(kioskVideo.src || kioskVideo.currentSrc);
  const hasValidState = kioskVideo.readyState > 0;
  const hasSource = !!kioskVideo.querySelector('source');

  if (!hasSrc && !hasSource) {
    console.error('[VISIBILITY] 💥 Video corrupted — triggering nuclear reload');
    const module = await getStartScreenModule();
    if (module?.triggerNuclearReload) {
      module.triggerNuclearReload();
    }
  } else if (!hasValidState) {
    console.warn('[VISIBILITY] ⚠️ Video in invalid state — forcing reload');
    handleVideoOnVisible();
  } else {
    console.log('[VISIBILITY] ✅ Video health check passed');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function setupVisibilityHandler() {
  if (handlersBound) {
    console.log('[VISIBILITY] Handlers already active — skipping duplicate setup');
    return;
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('focus', handleFocus);

  handlersBound = true;
  markVisibleCompatibilityFlag();

  console.log('[VISIBILITY] ✅ Handlers active (iOS-enhanced, deduped, battery optimised)');
}

export function cleanupVisibilityHandler() {
  if (!handlersBound) {
    clearVisibilityTimeout();
    clearBatteryCheckTimeout();
    startScreenModule = null;
    return;
  }

  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('pageshow', handlePageShow);
  window.removeEventListener('focus', handleFocus);

  handlersBound = false;
  clearVisibilityTimeout();
  clearBatteryCheckTimeout();

  startScreenModule = null;
  lastResumeAt = 0;

  console.log('[VISIBILITY] Handlers cleaned up');
}

export default {
  setupVisibilityHandler,
  cleanupVisibilityHandler,
};
