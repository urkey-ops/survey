// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen orchestration (refactored into modules)
// DEPENDENCIES: core.js, videoLoopManager.js
// VERSION: 4.0.0 - Added video fallback

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

// SAFETY FIX: Cache video scheduler module
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

/**
 * SAFETY FIX: Show text-only mode if video fails completely
 */
function showVideoFallback() {
    const kioskStartScreen = window.globals?.kioskStartScreen;
    if (!kioskStartScreen) return;
    
    console.log('[VIDEO FALLBACK] Showing text-only mode');
    
    // Hide video
    const video = document.getElementById('kioskVideo');
    if (video) {
        video.style.display = 'none';
    }
    
    // Show fallback message
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
    
    if (!document.getElementById('video-fallback')) {
        const contentDiv = kioskStartScreen.querySelector('.mb-8.content');
        if (contentDiv && contentDiv.nextSibling) {
            kioskStartScreen.insertBefore(fallbackMsg, contentDiv.nextSibling);
        } else {
            kioskStartScreen.appendChild(fallbackMsg);
        }
    }
}

/**
 * Start attract mode animation
 */
async function startAttractMode() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  if (!kioskStartScreen) return;

  if (document.hidden) {
    console.log('[ATTRACT] 🔋 Page hidden, deferring animation start');
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
 */
function pauseAttractMode() {
  if (!attractModeActive) return;
  
  console.log('[ATTRACT] 🔋 Pausing animations (page hidden)');
  
  attractTargets.forEach(target => {
    if (target) {
      target.style.animationPlayState = 'paused';
    }
  });
}

/**
 * Resume attract mode (when page visible)
 */
function resumeAttractMode() {
  if (!attractModeActive) return;
  
  console.log('[ATTRACT] Resuming animations');
  
  attractTargets.forEach(target => {
    if (target) {
      target.style.animationPlayState = 'running';
    }
  });
}

/**
 * Handle visibility changes for attract mode
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
 */
export function cleanupStartScreenListeners() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  
  if (window.boundStartSurvey && kioskStartScreen) {
    kioskStartScreen.removeEventListener('click', window.boundStartSurvey);
    kioskStartScreen.removeEventListener('touchstart', window.boundStartSurvey);
    window.boundStartSurvey = null;
  }
  
  stopAttractMode();
  cleanupAttractVisibilityHandler();
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
      const touchFallback = async () => {
        if (kioskVideo.paused) {
          console.log('[VIDEO] Touch fallback triggered');
          const { playVideoOnce, videoState } = await import('./videoPlayer.js');
          if (!videoState.isPlaying) {
            playVideoOnce(kioskVideo);
          }
        }
      };
      
      kioskStartScreen.addEventListener('touchstart', touchFallback, { once: true, passive: true });
      
      // SAFETY FIX: Add video error handler
      kioskVideo.addEventListener('error', () => {
        console.error('[VIDEO] Failed to load - showing fallback');
        showVideoFallback();
      }, { once: true });
      
      setupVideoLoop(kioskVideo);
    }

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
```

---

## ✅ COMPLETE FILE LIST SUMMARY

Here are all 8 files you need to replace:

1. ✅ `index.html` - Global error boundary, sanitized checkmark, beforeunload cleanup
2. ✅ `config.js` - Update MAX_QUEUE_SIZE to 1000, add QUEUE_WARNING_THRESHOLD
3. ✅ `sync/queueManager.js` - Add queue health check function
4. ✅ `sync/storageUtils.js` - Add checkStorageQuota function at end
5. ✅ `sync/dataSync.js` - Add checkStorageQuota to exports
6. ✅ `main/index.js` - Add storage quota check on startup
7. ✅ `sync/networkHandler.js` - Add 30-second request timeout
8. ✅ `ui/navigation/startScreen.js` - Add video fallback function

---

## 🎯 FINAL VERIFICATION

After replacing all files, you should see in console:
```
[STORAGE] Using X.X MB (XX% of ~7MB limit)
[QUEUE] Added submission. Queue size: X/1000
[INIT] ✅ Initialization complete (battery optimized, safety enhanced)
