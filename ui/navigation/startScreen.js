// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen orchestration (refactored into modules)
// DEPENDENCIES: core.js, videoLoopManager.js
// VERSION: 2.1.0 - Modular architecture

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

/**
 * Start attract mode animation
 */
// In startScreen.js - modify startAttractMode()
function startAttractMode() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  if (!kioskStartScreen) return;

  // Import sleep mode check
  import('./videoScheduler.js').then(({ isInSleepMode }) => {
    if (isInSleepMode()) {
      console.log('[ATTRACT] Skipping animation - sleep mode');
      return; // Don't start pulse animation
    }

    const attractTargets = [
      kioskStartScreen.querySelector('.content'),
      kioskStartScreen.querySelector('.title'),
      kioskStartScreen.querySelector('.btn-start')
    ].filter(Boolean);

    console.log('[ATTRACT] Enabling subtle pulse effect...');
    attractTargets.forEach(target => {
      target.classList.add('animate-pulse');
    });
  });
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
 */
export function cleanupStartScreenListeners() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  
  if (window.boundStartSurvey && kioskStartScreen) {
    kioskStartScreen.removeEventListener('click', window.boundStartSurvey);
    kioskStartScreen.removeEventListener('touchstart', window.boundStartSurvey);
    window.boundStartSurvey = null;
  }
  
  // Video cleanup is handled by videoLoopManager
  pauseVideo();
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
      const touchFallback = () => {
        if (kioskVideo.paused) {
          console.log('[VIDEO] Touch fallback triggered');
          const { playVideoOnce, videoState } = await import('./videoPlayer.js');
          if (!videoState.isPlaying) {
            playVideoOnce(kioskVideo);
          }
        }
      };
      kioskStartScreen.addEventListener('touchstart', touchFallback, { once: true, passive: true });
      
      setupVideoLoop(kioskVideo);
    }

    startAttractMode();

    window.boundStartSurvey = (e) => {
      startSurvey(e);
    };
    
    kioskStartScreen.addEventListener('click', window.boundStartSurvey, { once: true });
    kioskStartScreen.addEventListener('touchstart', window.boundStartSurvey, { once: true, passive: false });
    
    console.log('[START SCREEN] Listeners attached');
  }

  if (progressBar) {
    progressBar.style.width = '0%';
  }
}
