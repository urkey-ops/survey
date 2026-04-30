// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen orchestration (refactored into modules)
// DEPENDENCIES: core.js, videoLoopManager.js
// VERSION: 4.2.1
// CHANGES FROM 4.2.0:
//   - FIX B6-01: iOS tap cascade — touchstart fires startSurvey(), then
//     click fires 300ms later and calls startSurvey() a second time.
//     startTransitionInProgress guard blocked the double-launch but was
//     fragile. Fix: boundStartSurvey now explicitly removes BOTH listeners
//     on first fire before calling startSurvey(). { once: true } removed
//     from both — manual removal is the correct, iOS-safe pattern.
//     e.preventDefault() in touchstart handler also suppresses ghost click.

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
export const triggerNuclearReload = videoNuclearReload;

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
let attractTargets = [];

// Track screen/setup state
let startTransitionInProgress = false;
let startTransitionTimer = null;
let attractVisibilityBound = false;
let boundTouchFallback = null;
let boundVideoErrorHandler = null;

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

  if (document.getElementById('video-fallback')) return;

  const fallbackMsg = document.createElement('div');
  fallbackMsg.id = 'video-fallback';
  fallbackMsg.className = 'text-center p-8 bg-emerald-50 rounded-lg max-w-xl mx-auto';

  const icon = document.createElement('p');
  icon.className = 'text-4xl mb-4';
  icon.textContent = '📋';

  const title = document.createElement('p');
  title.className = 'text-2xl text-emerald-800 mb-2 font-bold';
  title.textContent = 'Welcome!';

  const subtitle = document.createElement('p');
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
  attractTargets.forEach(t => {
    t.style.animationPlayState = 'running';
    t.classList.add('animate-pulse');
  });

  attractModeActive = true;
}

function stopAttractMode() {
  if (!attractModeActive && attractTargets.length === 0) return;

  console.log('[ATTRACT] Stopping pulse animation');
  attractTargets.forEach(t => {
    if (t) {
      t.classList.remove('animate-pulse');
      t.style.animationPlayState = '';
    }
  });

  attractTargets = [];
  attractModeActive = false;
}

function pauseAttractMode() {
  if (!attractModeActive) return;
  console.log('[ATTRACT] Pausing animations (page hidden)');
  attractTargets.forEach(t => {
    if (t) t.style.animationPlayState = 'paused';
  });
}

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
  if (attractVisibilityBound) return;
  document.addEventListener('visibilitychange', handleAttractVisibility);
  attractVisibilityBound = true;
}

function cleanupAttractVisibilityHandler() {
  if (!attractVisibilityBound) return;
  document.removeEventListener('visibilitychange', handleAttractVisibility);
  attractVisibilityBound = false;
}

// ─── Touch feedback ───────────────────────────────────────────────────────────

function triggerTouchFeedback(element) {
  if (element) {
    element.classList.remove('animate-pulse');
    element.classList.add('active-press');
  }
}

// ─── Listener management ──────────────────────────────────────────────────────

function cleanupVideoStartScreenListeners() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  const kioskVideo = window.globals?.kioskVideo;

  if (kioskStartScreen && boundTouchFallback) {
    kioskStartScreen.removeEventListener('touchstart', boundTouchFallback);
    boundTouchFallback = null;
  }

  if (kioskVideo && boundVideoErrorHandler) {
    kioskVideo.removeEventListener('error', boundVideoErrorHandler);
    boundVideoErrorHandler = null;
  }
}

/**
 * Clean up start screen event listeners and attract mode.
 * Safe to call multiple times.
 */
export function cleanupStartScreenListeners() {
  const kioskStartScreen = window.globals?.kioskStartScreen;

  if (startTransitionTimer) {
    clearTimeout(startTransitionTimer);
    startTransitionTimer = null;
  }

  // FIX B6-01: Remove both listeners explicitly — { once: true } was removed
  // from the registration so manual cleanup is now the only removal path.
  if (window.boundStartSurvey && kioskStartScreen) {
    kioskStartScreen.removeEventListener('click',      window.boundStartSurvey);
    kioskStartScreen.removeEventListener('touchstart', window.boundStartSurvey);
    window.boundStartSurvey = null;
  }

  cleanupVideoStartScreenListeners();
  stopAttractMode();
  cleanupAttractVisibilityHandler();
  pauseVideo();

  startTransitionInProgress = false;

  console.log('[START SCREEN] Cleanup complete (animations stopped)');
}

// ─── Survey start ─────────────────────────────────────────────────────────────

function startSurvey(e) {
  const { globals, appState, dataHandlers } = getDependencies();
  const kioskStartScreen = globals?.kioskStartScreen;

  if (!kioskStartScreen || kioskStartScreen.classList.contains('hidden')) return;
  if (startTransitionInProgress) {
    console.log('[START] Transition already in progress — ignoring duplicate interaction');
    return;
  }

  startTransitionInProgress = true;

  if (e) {
    e.preventDefault();
    e.stopPropagation();
    const targetElement =
      e.target.closest('.content') || kioskStartScreen.querySelector('.content');
    triggerTouchFeedback(targetElement);
  }

  console.log('[START] User interaction detected...');

  kioskStartScreen.classList.add('start-screen-fade-out');

  startTransitionTimer = setTimeout(() => {
    startTransitionTimer = null;

    console.log('[START] Transitioning to survey...');

    cleanupStartScreenListeners();

    kioskStartScreen.classList.add('hidden');
    kioskStartScreen.classList.remove('start-screen-fade-out');

    pauseVideo();

 if (!appState.formData.id) {
  // generateUUID has no dependencies — call directly rather than
  // routing through dataHandlers which may not be assembled yet
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    appState.formData.id = crypto.randomUUID();
  } else {
    appState.formData.id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
}

    if (!appState.formData.timestamp) {
      appState.formData.timestamp = new Date().toISOString();
    }

    if (!appState.surveyStartTime) {
      appState.surveyStartTime = Date.now();
    }

    saveState();
    showQuestion(appState.currentQuestionIndex);

    if (window.uiHandlers?.resetInactivityTimer) {
      window.uiHandlers.resetInactivityTimer();
    }

    startTransitionInProgress = false;
  }, 250);
}

// ─── Video + attract setup ────────────────────────────────────────────────────

function _setupVideoAndAttract() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  const kioskVideo = window.globals?.kioskVideo;

  cleanupVideoStartScreenListeners();

  if (kioskVideo) {
    kioskVideo.style.display = '';

    const existingFallback = document.getElementById('video-fallback');
    if (existingFallback) {
      existingFallback.remove();
    }

    boundTouchFallback = async () => {
      if (kioskVideo.paused) {
        console.log('[VIDEO] Touch fallback triggered');
        const { playVideoOnce, videoState } = await import('./videoPlayer.js');
        if (!videoState.isPlaying) {
          playVideoOnce(kioskVideo);
        }
      }
    };

    boundVideoErrorHandler = () => {
      console.error('[VIDEO] Failed to load - showing fallback');
      showVideoFallback();
    };

    kioskStartScreen.addEventListener('touchstart', boundTouchFallback, {
      once: true,
      passive: true,
    });

    kioskVideo.addEventListener('error', boundVideoErrorHandler, { once: true });

    setupVideoLoop(kioskVideo);
  }

  startAttractMode();
  setupAttractVisibilityHandler();
}

// ─── Show start screen ────────────────────────────────────────────────────────

/**
 * Show the start screen.
 * Idempotent: safe on first boot, inactivity reset, manual reset, visibility resume.
 */
export function showStartScreen() {
  // DOM fallback + loud error/retry (FREEZE FIX)
  const kioskStartScreenEl = document.getElementById('kioskStartScreen');
  const kioskStartScreen = window.globals?.kioskStartScreen || kioskStartScreenEl;
  
  if (!kioskStartScreen) {
    console.error('[START SCREEN FREEZE] ❌ kioskStartScreen missing — retrying');
    console.trace('Stack trace for debug:');
    return setTimeout(showStartScreen, 50);
  }
  
  // Wire globals if missing (race condition fix)
  if (!window.globals.kioskStartScreen) {
    window.globals.kioskStartScreen = kioskStartScreen;
    console.log('[START SCREEN] ✅ Wired missing globals.kioskStartScreen');
  }

  const { globals } = getDependencies();
  const questionContainer = globals?.questionContainer;
  const nextBtn = globals?.nextBtn;
  const prevBtn = globals?.prevBtn;
  const progressBar = globals?.progressBar;

  if (window.uiHandlers?.clearAllTimers) {
    window.uiHandlers.clearAllTimers();
  }

  cleanupStartScreenListeners();
  cleanupInputFocusScroll();

  if (questionContainer) questionContainer.innerHTML = '';
  if (nextBtn) nextBtn.disabled = true;
  if (prevBtn) prevBtn.disabled = true;
  if (progressBar) progressBar.style.width = '0%';

  console.log('[START SCREEN] ✅ Showing with iOS-safe video...');

  kioskStartScreen.classList.remove('hidden', 'start-screen-fade-out');

  _setupVideoAndAttract();

  // FIX B6-01: Remove both listeners immediately on first fire
  window.boundStartSurvey = (e) => {
    kioskStartScreen.removeEventListener('click',      window.boundStartSurvey);
    kioskStartScreen.removeEventListener('touchstart', window.boundStartSurvey);
    startSurvey(e);
  };

  kioskStartScreen.addEventListener('click',      window.boundStartSurvey);
  kioskStartScreen.addEventListener('touchstart', window.boundStartSurvey, { passive: false });

  console.log('[START SCREEN] ✅ Listeners attached (battery optimized)');
}

export {
  startAttractMode,
  stopAttractMode,
  pauseAttractMode,
  resumeAttractMode,
};
