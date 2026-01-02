// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen orchestration (refactored into modules)
// DEPENDENCIES: core.js, videoLoopManager.js
// VERSION: 3.0.0 - Battery optimized (visibility-aware animations)

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

// BATTERY OPTIMIZATION: Cache video scheduler module
let videoSchedulerModule = null;
async function getVideoSchedulerModule() {
  if (!videoSchedulerModule) {
    videoSchedulerModule = await import('./videoScheduler.js');
  }
  return videoSchedulerModule;
}

// BATTERY OPTIMIZATION: Track attract mode state
let attractModeActive = false;
let attractTargets = [];

/**
 * Start attract mode animation
 * BATTERY OPTIMIZED: Checks sleep mode and visibility before starting
 */
async function startAttractMode() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  if (!kioskStartScreen) return;

  // BATTERY OPTIMIZATION: Don't start if page is hidden
  if (document.hidden) {
    console.log('[ATTRACT] 🔋 Page hidden, deferring animation start');
    return;
  }

  // Import sleep mode check (cached)
  const { isInSleepMode } = await getVideoSchedulerModule();
  
  if (isInSleepMode()) {
    console.log('[ATTRACT] Skipping animation - sleep mode');
    return; // Don't start pulse animation
  }

  attractTargets = [
    kioskStartScreen.querySelector('.content'),
    kioskStartScreen.querySelector('.title'),
    kioskStartScreen.querySelector('.btn-start')
  ].filter(Boolean);

  console.log('[ATTRACT] Enabling subtle pulse effect...');
  attractTargets.forEach(target => {
    target.classList.add('animate-pulse');
  });
  
  attractModeActive = true;
}

/**
 * Stop attract mode animation
 * BATTERY OPTIMIZATION: Explicitly stop animations
 */
function stopAttractMode() {
  if (!attractModeActive) return;
  
  console.log('[ATTRACT] 🔋 Stopping pulse animation');
  
  attractTargets.forEach(target => {
    if (target) {
      target.classList.remove('animate-pulse');
    }
  });
  
  attractTargets = [];
  attractModeActive = false;
}

/**
 * Pause attract mode (when page hidden)
 * BATTERY OPTIMIZATION: Pause CSS animations
 */
function pauseAttractMode() {
  if (!attractModeActive) return;
  
  console.log('[ATTRACT] 🔋 Pausing animations (page hidden)');
  
  attractTargets.forEach(target => {
    if (target) {
      // Pause CSS animation by setting animation-play-state
      target.style.animationPlayState = 'paused';
    }
  });
}

/**
 * Resume attract mode (when page visible)
 * BATTERY OPTIMIZATION: Resume CSS animations
 */
function resumeAttractMode() {
  if (!attractModeActive) return;
  
  console.log('[ATTRACT] Resuming animations');
  
  attractTargets.forEach(target => {
    if (target) {
      // Resume CSS animation
      target.style.animationPlayState = 'running';
    }
  });
}

/**
 * Handle visibility changes for attract mode
 * BATTERY OPTIMIZATION: Pause/resume animations
 */
function handleAttractVisibility() {
  if (document.hidden) {
    pauseAttractMode();
  } else {
    resumeAttractMode();
  }
}

/**
 * Setup attract mode visibility handler
 * BATTERY OPTIMIZATION: Auto-pause animations when hidden
 */
function setupAttractVisibilityHandler() {
  document.addEventListener('visibilitychange', handleAttractVisibility);
}

/**
 * Cleanup attract mode visibility handler
 */
function cleanupAttractVisibilityHandler() {
  document.removeEventListener('visibilitychange', handleAttractVisibility);
}

/**
 * Trigger touch feedback on element
 */
function triggerTouchFeedback(element) {
  if (element) {
    element.classList.remove('animate-pulse');
    element.classList.add('active-press');
  }
}

/**
 * Clean up start screen event listeners
 * BATTERY OPTIMIZATION: Stop all animations
 */
export function cleanupStartScreenListeners() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  
  if (window.boundStartSurvey && kioskStartScreen) {
    kioskStartScreen.removeEventListener('click', window.boundStartSurvey);
    kioskStartScreen.removeEventListener('touchstart', window.boundStartSurvey);
    window.boundStartSurvey = null;
  }
  
  // BATTERY OPTIMIZATION: Stop attract mode animations
  stopAttractMode();
  cleanupAttractVisibilityHandler();
  
  // Video cleanup is handled by videoLoopManager
  pauseVideo();
  
  console.log('[START SCREEN] Cleanup complete (animations stopped)');
}

/**
 * Start the survey
 */
function startSurvey(e) {
  const { globals, appState, dataHandlers } = getDependencies();
  const kioskStartScreen = globals?.kioskStartScreen;
  
  if (!kioskStartScreen || kioskStartScreen.classList.contains('hidden')) {
    return;
  }
  
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    const targetElement = e.target.closest('.content') || kioskStartScreen.querySelector('.content');
    triggerTouchFeedback(targetElement);
  }
  
  console.log('[START] User interaction detected...');

  setTimeout(() => {
    console.log('[START] Transitioning to survey...');
    cleanupStartScreenListeners();
    kioskStartScreen.classList.add('hidden');
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
    
    if (window.uiHandlers && window.uiHandlers.resetInactivityTimer) {
      window.uiHandlers.resetInactivityTimer();
    }

    setTimeout(() => {
      if (kioskStartScreen && document.body.contains(kioskStartScreen)) {
        kioskStartScreen.remove();
      }
    }, 400);
  }, 200);
}

/**
 * Show the start screen
 * BATTERY OPTIMIZED: Starts animations with visibility awareness
 */
export function showStartScreen() {
  const { globals } = getDependencies();
  const kioskStartScreen = globals?.kioskStartScreen;
  const kioskVideo = globals?.kioskVideo;
  const questionContainer = globals?.questionContainer;
  const nextBtn = globals?.nextBtn;
  const prevBtn = globals?.prevBtn;
  const progressBar = globals?.progressBar;
  
  if (window.uiHandlers && window.uiHandlers.clearAllTimers) {
    window.uiHandlers.clearAllTimers();
  }
  
  cleanupStartScreenListeners();
  cleanupInputFocusScroll();

  if (questionContainer) questionContainer.innerHTML = '';
  if (nextBtn) nextBtn.disabled = true;
  if (prevBtn) prevBtn.disabled = true;
  
  console.log('[START SCREEN] Showing with iOS-safe video...');
  
  if (kioskStartScreen) {
    if (!document.body.contains(kioskStartScreen)) {
      document.body.appendChild(kioskStartScreen);
    }
    kioskStartScreen.classList.remove('hidden');

    if (kioskVideo) {
      // BATTERY OPTIMIZATION: Cache video player module
      const touchFallback = async () => {
        if (kioskVideo.paused) {
          console.log('[VIDEO] Touch fallback triggered');
          const { playVideoOnce, videoState } = await import('./videoPlayer.js');
          if (!videoState.isPlaying) {
            playVideoOnce(kioskVideo);
          }
        }
      };
      
      // Note: 'once: true' ensures automatic cleanup
      kioskStartScreen.addEventListener('touchstart', touchFallback, { once: true, passive: true });
      
      setupVideoLoop(kioskVideo);
    }

    // BATTERY OPTIMIZATION: Start attract mode with visibility handling
    startAttractMode();
    setupAttractVisibilityHandler();

    window.boundStartSurvey = (e) => {
      startSurvey(e);
    };
    
    kioskStartScreen.addEventListener('click', window.boundStartSurvey, { once: true });
    kioskStartScreen.addEventListener('touchstart', window.boundStartSurvey, { once: true, passive: false });
    
    console.log('[START SCREEN] Listeners attached (battery optimized)');
  }

  if (progressBar) {
    progressBar.style.width = '0%';
  }
}

// Export attract mode controls for external use
export {
  startAttractMode,
  stopAttractMode,
  pauseAttractMode,
  resumeAttractMode
};
