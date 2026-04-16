// FILE: main/visibilityHandler.js
// PURPOSE: Handle visibility change events (tab switching, minimizing, iPad sleep)
// DEPENDENCIES: window.CONSTANTS, window.appState, window.uiHandlers
// VERSION: 3.0.0 - BUG #22 FIX: Pause inactivity timer immediately on hide (not clear)

let visibilityTimeout = null;
let startScreenModule = null; // Cached import

// ── Module cache ──────────────────────────────────────────────────────────────

/**
 * Import startScreen module once and cache it.
 * BATTERY: Import once, reuse many times.
 */
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

// ── Video helpers ─────────────────────────────────────────────────────────────

async function handleVideoOnHidden() {
  const module = await getStartScreenModule();
  if (module && module.handleVideoVisibilityChange) {
    module.handleVideoVisibilityChange(false);
  }
}

async function handleVideoOnVisible() {
  const module = await getStartScreenModule();
  if (module && module.handleVideoVisibilityChange) {
    module.handleVideoVisibilityChange(true);
  }
}

// ── Core visibility handler ───────────────────────────────────────────────────

/**
 * Handle document visibility changes.
 *
 * BUG #22 FIX: When the page becomes hidden we now IMMEDIATELY pause the
 * inactivity timer (preserving remaining time) instead of letting it tick
 * during the 5-second grace window. This prevents false kiosk resets when
 * a user was at e.g. 28s and the iPad screen locked for 5s.
 *
 * On visible: resume the paused timer so remaining time is honoured.
 */
function handleVisibilityChange() {
  const CONSTANTS   = window.CONSTANTS;
  const appState    = window.appState;
  const uiHandlers  = window.uiHandlers;

  if (document.hidden) {
    console.log('[VISIBILITY] Document hidden — pausing inactivity timer immediately');

    // Pause video immediately (battery saving)
    handleVideoOnHidden();

    // BUG #22 FIX: Pause inactivity timer NOW, before the grace window.
    // pauseInactivityTimer() sets the timer to null without triggering reset.
    if (uiHandlers.pauseInactivityTimer) {
      uiHandlers.pauseInactivityTimer();
    }

    // After grace period, flag kiosk as hidden and clear ALL remaining timers
    visibilityTimeout = setTimeout(() => {
      console.log('[VISIBILITY] Kiosk hidden for 5s+ — clearing all timers');
      window.isKioskVisible = false;
      uiHandlers.clearAllTimers();
    }, CONSTANTS.VISIBILITY_CHANGE_DELAY_MS);

  } else {
    console.log('[VISIBILITY] Document visible — resuming');
    clearTimeout(visibilityTimeout);
    visibilityTimeout = null;

    // Resume video (if on start screen)
    handleVideoOnVisible();

    if (!window.isKioskVisible) {
      console.log('[VISIBILITY] Kiosk visible — resuming timers');
      window.isKioskVisible = true;

      if (appState.currentQuestionIndex > 0) {
        // BUG #22 FIX: Resume the paused inactivity timer (not a full reset)
        if (uiHandlers.resumeInactivityTimer) {
          uiHandlers.resumeInactivityTimer();
        } else {
          // Fallback for older uiHandlers that lack resumeInactivityTimer
          uiHandlers.resetInactivityTimer();
        }
      } else {
        uiHandlers.startPeriodicSync();
      }
    }
  }
}

// ── iOS-specific handlers ─────────────────────────────────────────────────────

/**
 * Fires when page is restored from bfcache (iOS PWA back-forward navigation).
 */
function handlePageShow(event) {
  if (event.persisted) {
    console.log('[VISIBILITY] Page restored from cache (iOS bfcache)');
    handleVideoOnVisible();
    window.isKioskVisible = !document.hidden;
  } else {
    // Fresh load — possible battery death recovery
    console.log('[VISIBILITY] 🔋 Fresh page load (possible battery death recovery)');
    setTimeout(() => {
      checkVideoHealthAfterBatteryDeath();
    }, 2000);
  }
}

/**
 * Fires when window gains focus.
 * Sometimes visibilitychange does not fire on iOS.
 */
function handleFocus() {
  if (!document.hidden && !window.isKioskVisible) {
    console.log('[VISIBILITY] Focus gained — forcing visibility check');
    handleVisibilityChange();
  }
}

// ── Battery death recovery ────────────────────────────────────────────────────

async function checkVideoHealthAfterBatteryDeath() {
  const kioskVideo       = window.globals?.kioskVideo;
  const kioskStartScreen = window.globals?.kioskStartScreen;

  if (!kioskStartScreen || kioskStartScreen.classList.contains('hidden')) return;
  if (!kioskVideo) {
    console.error('[VISIBILITY] ⚠️ Video element missing after page load');
    return;
  }

  const hasSrc       = kioskVideo.src || kioskVideo.currentSrc;
  const hasValidState = kioskVideo.readyState > 0;
  const hasSource    = kioskVideo.querySelector('source');

  if (!hasSrc && !hasSource) {
    console.error('[VISIBILITY] 💥 Video corrupted — triggering nuclear reload');
    const module = await getStartScreenModule();
    if (module && module.triggerNuclearReload) {
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

/**
 * Setup all visibility handlers (visibilitychange, pageshow, focus).
 */
export function setupVisibilityHandler() {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('focus', handleFocus);
  console.log('[VISIBILITY] ✅ Handlers active (iOS-enhanced, battery optimised, timer-pause fix)');
}

/**
 * Remove all visibility handlers and clear pending timeout.
 */
export function cleanupVisibilityHandler() {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('pageshow', handlePageShow);
  window.removeEventListener('focus', handleFocus);

  if (visibilityTimeout) {
    clearTimeout(visibilityTimeout);
    visibilityTimeout = null;
  }

  startScreenModule = null;
  console.log('[VISIBILITY] Handlers cleaned up');
}

export default {
  setupVisibilityHandler,
  cleanupVisibilityHandler,
};
