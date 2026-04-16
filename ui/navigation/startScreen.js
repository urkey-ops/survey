// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen orchestration (refactored into modules)
// DEPENDENCIES: core.js, videoLoopManager.js
// VERSION: 4.1.0
// CHANGES FROM 4.0.0:
//   - showStartScreen: stop removing #kioskStartScreen from the DOM.
//     The node is now only hidden/shown (classList hide/show) so that all
//     cached references in globals, inactivityHandler, and videoLoopManager
//     remain valid across kiosk reset cycles.  Re-appending the node is
//     removed entirely.
//   - startSurvey: removed the deferred kioskStartScreen.remove() call that
//     was previously scheduled 650ms after tap.  The node stays in the DOM,
//     invisible, so repeated survey cycles and inactivity resets are
//     idempotent with no risk of stale-element errors.
//   - showStartScreen: reset is now fully idempotent — calling it multiple
//     times in a session (inactivity reset, manual reset, visibility resume)
//     produces identical, safe behaviour each time.
//   - Video and attract-mode setup extracted into _setupVideoAndAttract so
//     that showStartScreen reads as a straight-line reset sequence.
//   - All other behaviour (attract mode, touch fallback, video fallback,
//     fade timing, event wiring) is unchanged.

import { getDependencies, saveState, showQuestion, cleanupInputFocusScroll } from './core.js';
import {
  setupVideoLoop,
  pauseVideo,
  resumeVideo,
  handleVideoVisibilityChange as videoVisibilityHandler,
  triggerNuclearReload as videoNuclearReload
} from './videoLoopManager.js';

// Re-export for external use
export { pauseVideo, resumeVideo };
export const handleVideoVisibilityChange = videoVisibilityHandler;
export const triggerNuclearReload        = videoNuclearReload;

// Cache video scheduler module
let videoSchedulerModule = null;
async function getVideoSchedulerModule() {
  if (!videoSchedulerModule) {
    videoSchedulerModule = await import('./videoScheduler.js');
  }
  return videoSchedulerModule;
}

// Track attract mode state
let attractModeActive = false;
let attractTargets    = [];

// ─── Video fallback ───────────────────────────────────────────────────────────

/**
 * Show text-only mode if video fails completely.
 * Idempotent: the fallback node is only inserted once.
 */
function showVideoFallback() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  if (!kioskStartScreen) return;

  console.log('[VIDEO FALLBACK] Showing text-only mode');

  const video = document.getElementById('kioskVideo');
  if (video) video.style.display = 'none';

  if (document.getElementById('video-fallback')) return; // already inserted

  const fallbackMsg = document.createElement('div');
  fallbackMsg.id        = 'video-fallback';
  fallbackMsg.className = 'text-center p-8 bg-emerald-50 rounded-lg max-w-xl mx-auto';

  const icon     = document.createElement('p');
  icon.className = 'text-4xl mb-4';
  icon.textContent = '📋';

  const title     = document.createElement('p');
  title.className = 'text-2xl text-emerald-800 mb-2 font-bold';
  title.textContent = 'Welcome!';

  const subtitle     = document.createElement('p');
  subtitle.className = 'text-lg text-emerald-700';
  subtitle.textContent = 'Ready to share your experience?';

  fallbackMsg.appendChild(icon);
  fallbackMsg.appendChild(title);
  fallbackMsg.appendChild(subtitle);

  const contentDiv = kioskStartScreen.querySelector('.mb-8.content');
  if (contentDiv && contentDiv.nextSibling) {
    kioskStartScreen.insertBefore(fallbackMsg, contentDiv.nextSibling);
  } else {
    kioskStartScreen.appendChild(fallbackMsg);
  }
}

// ─── Attract mode ─────────────────────────────────────────────────────────────

/**
 * Start attract mode animation.
 */
async function startAttractMode() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  if (!kioskStartScreen) return;

  if (document.hidden) {
    console.log('[ATTRACT] Page hidden, deferring animation start');
    return;
  }

  const { isInSleepMode } = await getVideoSchedulerModule();

  if (isInSleepMode()) {
    console.log('[ATTRACT] Skipping animation - sleep mode');
    return;
  }

  attractTargets = [
    kioskStartScreen.querySelector('.content'),
    kioskStartScreen.querySelector('.title'),
    kioskStartScreen.querySelector('.btn-start'),
  ].filter(Boolean);

  console.log('[ATTRACT] Enabling subtle pulse effect...');
  attractTargets.forEach(t => t.classList.add('animate-pulse'));

  attractModeActive = true;
}

/**
 * Stop attract mode animation.
 */
function stopAttractMode() {
  if (!attractModeActive) return;

  console.log('[ATTRACT] Stopping pulse animation');
  attractTargets.forEach(t => {
    if (t) t.classList.remove('animate-pulse');
  });

  attractTargets    = [];
  attractModeActive = false;
}

/**
 * Pause attract mode (when page hidden).
 */
function pauseAttractMode() {
  if (!attractModeActive) return;
  console.log('[ATTRACT] Pausing animations (page hidden)');
  attractTargets.forEach(t => {
    if (t) t.style.animationPlayState = 'paused';
  });
}

/**
 * Resume attract mode (when page visible).
 */
function resumeAttractMode() {
  if (!attractModeActive) return;
  console.log('[ATTRACT] Resuming animations');
  attractTargets.forEach(t => {
    if (t) t.style.animationPlayState = 'running';
  });
}

function handleAttractVisibility() {
  if (document.hidden) {
    pauseAttractMode();
  } else {
    resumeAttractMode();
  }
}

function setupAttractVisibilityHandler() {
  document.addEventListener('visibilitychange', handleAttractVisibility);
}

function cleanupAttractVisibilityHandler() {
  document.removeEventListener('visibilitychange', handleAttractVisibility);
}

// ─── Touch feedback ───────────────────────────────────────────────────────────

function triggerTouchFeedback(element) {
  if (element) {
    element.classList.remove('animate-pulse');
    element.classList.add('active-press');
  }
}

// ─── Listener management ──────────────────────────────────────────────────────

/**
 * Clean up start screen event listeners and attract mode.
 * Safe to call multiple times (all guards are idempotent).
 */
export function cleanupStartScreenListeners() {
  const kioskStartScreen = window.globals?.kioskStartScreen;

  if (window.boundStartSurvey && kioskStartScreen) {
    kioskStartScreen.removeEventListener('click',      window.boundStartSurvey);
    kioskStartScreen.removeEventListener('touchstart', window.boundStartSurvey);
    window.boundStartSurvey = null;
  }

  stopAttractMode();
  cleanupAttractVisibilityHandler();
  pauseVideo();

  console.log('[START SCREEN] Cleanup complete (animations stopped)');
}

// ─── Survey start ─────────────────────────────────────────────────────────────

/**
 * Handle a tap/click on the start screen.
 *
 * DOM change from v4.0.0:
 *   The deferred kioskStartScreen.remove() that was previously scheduled
 *   ~650 ms after tap has been removed.  The node is only hidden via the
 *   'hidden' class so that:
 *     • all cached globals references remain valid,
 *     • showStartScreen() is fully idempotent on reset,
 *     • inactivityHandler and videoLoopManager never hold a detached node.
 */
function startSurvey(e) {
  const { globals, appState, dataHandlers } = getDependencies();
  const kioskStartScreen = globals?.kioskStartScreen;

  if (!kioskStartScreen || kioskStartScreen.classList.contains('hidden')) return;

  if (e) {
    e.preventDefault();
    e.stopPropagation();
    const targetElement =
      e.target.closest('.content') || kioskStartScreen.querySelector('.content');
    triggerTouchFeedback(targetElement);
  }

  console.log('[START] User interaction detected...');

  // Step 1: begin CSS fade-out immediately on tap
  kioskStartScreen.classList.add('start-screen-fade-out');

  // Step 2: after 250 ms fade completes, hide and transition to survey
  setTimeout(() => {
    console.log('[START] Transitioning to survey...');

    cleanupStartScreenListeners();

    // Hide the node — do NOT remove it so the reference stays valid.
    kioskStartScreen.classList.add('hidden');
    kioskStartScreen.classList.remove('start-screen-fade-out');

    pauseVideo();

    if (!appState.formData.id) {
      appState.formData.id = dataHandlers.generateUUID();
    }
    if (!appState.formData.timestamp) {
      appState.formData.timestamp = new Date().toISOString();
    }

    if (!appState.surveyStartTime) {
      appState.surveyStartTime = Date.now();
      saveState();
    }

    showQuestion(appState.currentQuestionIndex);

    if (window.uiHandlers?.resetInactivityTimer) {
      window.uiHandlers.resetInactivityTimer();
    }

    // ── Node is intentionally NOT removed here ──
    // Removing it would invalidate globals.kioskStartScreen and every other
    // module that holds a reference to the same element.  Hiding via CSS is
    // sufficient and makes showStartScreen() safe to call on every reset.

  }, 250);
}

// ─── Video + attract setup (extracted for readability) ───────────────────────

/**
 * Wire up video loop, touch fallback, and attract mode for the start screen.
 * Extracted from showStartScreen so the main reset function reads linearly.
 */
function _setupVideoAndAttract() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  const kioskVideo       = window.globals?.kioskVideo;

  if (kioskVideo) {
    // Touch fallback: if autoplay was blocked, a single tap restarts playback.
    const touchFallback = async () => {
      if (kioskVideo.paused) {
        console.log('[VIDEO] Touch fallback triggered');
        const { playVideoOnce, videoState } = await import('./videoPlayer.js');
        if (!videoState.isPlaying) {
          playVideoOnce(kioskVideo);
        }
      }
    };

    kioskStartScreen.addEventListener('touchstart', touchFallback, {
      once:    true,
      passive: true,
    });

    kioskVideo.addEventListener('error', () => {
      console.error('[VIDEO] Failed to load - showing fallback');
      showVideoFallback();
    }, { once: true });

    setupVideoLoop(kioskVideo);
  }

  startAttractMode();
  setupAttractVisibilityHandler();
}

// ─── Show start screen ────────────────────────────────────────────────────────

/**
 * Show the start screen.
 *
 * Idempotent: safe to call on first boot, inactivity reset, manual reset,
 * and visibility resume.  The kioskStartScreen node is never removed from
 * the DOM; it is only shown/hidden via the 'hidden' class.
 */
export function showStartScreen() {
  const { globals } = getDependencies();
  const kioskStartScreen  = globals?.kioskStartScreen;
  const questionContainer = globals?.questionContainer;
  const nextBtn           = globals?.nextBtn;
  const prevBtn           = globals?.prevBtn;
  const progressBar       = globals?.progressBar;

  // Clear all application timers before resetting the screen.
  if (window.uiHandlers?.clearAllTimers) {
    window.uiHandlers.clearAllTimers();
  }

  cleanupStartScreenListeners();
  cleanupInputFocusScroll();

  if (questionContainer) questionContainer.innerHTML = '';
  if (nextBtn)           nextBtn.disabled  = true;
  if (prevBtn)           prevBtn.disabled  = true;
  if (progressBar)       progressBar.style.width = '0%';

  console.log('[START SCREEN] Showing with iOS-safe video...');

  if (kioskStartScreen) {
    // Show the node — it is already in the DOM and stays there permanently.
    kioskStartScreen.classList.remove('hidden', 'start-screen-fade-out');

    _setupVideoAndAttract();

    // Attach survey-start listeners.
    window.boundStartSurvey = (e) => startSurvey(e);

    kioskStartScreen.addEventListener('click',      window.boundStartSurvey, { once: true });
    kioskStartScreen.addEventListener('touchstart', window.boundStartSurvey, {
      once:    true,
      passive: false,
    });

    console.log('[START SCREEN] Listeners attached (battery optimized)');
  }
}

export {
  startAttractMode,
  stopAttractMode,
  pauseAttractMode,
  resumeAttractMode,
};
