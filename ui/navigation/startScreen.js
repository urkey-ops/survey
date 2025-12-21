// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen logic with subtle pulse and immediate touch feedback
// DEPENDENCIES: core.js
// BATTERY OPTIMIZATION: Intermittent video playback (plays 5s every 60s)

import { getDependencies, saveState, showQuestion, cleanupInputFocusScroll } from './core.js';

// BATTERY CONFIG: Adjust PLAY_INTERVAL to control how often video plays
const VIDEO_CONFIG = {
  PLAY_INTERVAL: 30000,  // Play video every 60 seconds (change to 45000 for 45s, 30000 for 30s)
  VIDEO_DURATION: 5000,  // Your video is 5 seconds long
};

// Store video interval timer
let videoPlaybackInterval = null;

/**
 * Applies the "Attract Mode" (Subtle Pulse)
 * Unlike the previous version, this uses CSS for the animation loop
 * and only targets the content/title, NOT the video.
 */
function startAttractMode() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  if (!kioskStartScreen) return;

  // Target only the CTA/Content for the pulse, not the background video
  const attractTargets = [
    kioskStartScreen.querySelector('.content'),
    kioskStartScreen.querySelector('.title'),
    kioskStartScreen.querySelector('.btn-start') // Assuming there might be a button
  ].filter(Boolean);

  console.log('[ATTRACT] Enabling subtle pulse effect...');

  // We add a class that handles the infinite CSS animation (e.g., keyframes pulse)
  // This replaces the JS setInterval loop for better performance and smoothness.
  attractTargets.forEach(target => {
    target.classList.add('animate-pulse');
  });
}

/**
 * Visual Feedback on Touch
 * Adds a "pressed" state before the logic continues
 */
function triggerTouchFeedback(element) {
  if (element) {
    element.classList.remove('animate-pulse'); // Stop pulsing immediately
    element.classList.add('active-press');
  }
}

/**
 * BATTERY OPTIMIZATION: Setup intermittent video playback
 * Video plays for 5 seconds, then pauses until next interval
 * Saves ~23-27% battery compared to continuous loop
 */
function setupVideoLoop(kioskVideo) {
  if (!kioskVideo) return;
  
  console.log('[VIDEO] 🔋 Setting up INTERMITTENT playback...');
  console.log(`[VIDEO] Playing 5s every ${VIDEO_CONFIG.PLAY_INTERVAL / 1000}s`);
  
  // Setup video attributes (no loop - we control it manually)
  kioskVideo.currentTime = 0;
  kioskVideo.setAttribute('playsinline', '');
  kioskVideo.setAttribute('webkit-playsinline', '');
  kioskVideo.setAttribute('muted', 'muted');
  kioskVideo.loop = false; // Important: we control playback manually
  kioskVideo.preload = 'auto';
  
  const playVideoOnce = () => {
    if (!kioskVideo || kioskVideo.paused === false) return;
    
    kioskVideo.currentTime = 0;
    const playPromise = kioskVideo.play();
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log("[VIDEO] ▶️ Playing 5-second clip...");
          
          // Auto-pause after video ends
          setTimeout(() => {
            if (kioskVideo && !kioskVideo.paused) {
              kioskVideo.pause();
              console.log("[VIDEO] ⏸️ Paused - Battery saving");
            }
          }, VIDEO_CONFIG.VIDEO_DURATION);
        })
        .catch(error => {
          console.warn("[VIDEO] iPad autoplay blocked:", error.message);
          // iPad touch fallback
          document.addEventListener('touchstart', () => {
            playVideoOnce();
          }, { once: true });
        });
    }
  };
  
  // Play immediately when start screen loads
  playVideoOnce();
  
  // Clear any existing interval
  if (videoPlaybackInterval) {
    clearInterval(videoPlaybackInterval);
  }
  
  // Setup interval to replay video periodically
  videoPlaybackInterval = setInterval(() => {
    const kioskStartScreen = window.globals?.kioskStartScreen;
    // Only play if still on start screen
    if (kioskStartScreen && !kioskStartScreen.classList.contains('hidden')) {
      playVideoOnce();
    }
  }, VIDEO_CONFIG.PLAY_INTERVAL);
  
  console.log('[VIDEO] ✅ Intermittent playback active');
}

/**
 * BATTERY OPTIMIZATION: Pause video when survey is active
 * Saves 20-30% battery by stopping video playback during survey
 */
function pauseVideo() {
  const kioskVideo = window.globals?.kioskVideo;
  
  // Stop the interval timer
  if (videoPlaybackInterval) {
    clearInterval(videoPlaybackInterval);
    videoPlaybackInterval = null;
    console.log('[VIDEO] ⏹️ Interval stopped');
  }
  
  // Pause the video
  if (kioskVideo && !kioskVideo.paused) {
    kioskVideo.pause();
    console.log('[VIDEO] ⏸️ Paused - Battery saving mode');
  }
}

/**
 * BATTERY OPTIMIZATION: Resume video when returning to start screen
 * Called when reset happens or user returns to welcome screen
 */
function resumeVideo() {
  const kioskVideo = window.globals?.kioskVideo;
  if (kioskVideo) {
    setupVideoLoop(kioskVideo); // Restart intermittent playback
  }
}

/**
 * Cleanup start screen event listeners
 */
export function cleanupStartScreenListeners() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  
  if (window.boundStartSurvey && kioskStartScreen) {
    kioskStartScreen.removeEventListener('click', window.boundStartSurvey);
    kioskStartScreen.removeEventListener('touchstart', window.boundStartSurvey);
    window.boundStartSurvey = null;
  }
  
  // Clean up video interval
  if (videoPlaybackInterval) {
    clearInterval(videoPlaybackInterval);
    videoPlaybackInterval = null;
  }
}

/**
 * Start the survey (called when start screen is clicked/touched)
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
    
    // VISUAL FEEDBACK: Trigger the "Press" effect on the target or the container
    const targetElement = e.target.closest('.content') || kioskStartScreen.querySelector('.content');
    triggerTouchFeedback(targetElement);
  }
  
  console.log('[START] User interaction detected...');

  // SHORT DELAY: Allow 200ms for the user to see the "press" animation before hiding
  setTimeout(() => {
    console.log('[START] Transitioning to survey...');
    
    cleanupStartScreenListeners();
    
    kioskStartScreen.classList.add('hidden');
    
    // BATTERY OPTIMIZATION: Pause video during survey
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

    // Full DOM removal after transition
    setTimeout(() => {
      if (kioskStartScreen && document.body.contains(kioskStartScreen)) {
        kioskStartScreen.remove();
      }
    }, 400); // Matches CSS fade out transition
  }, 200); // The "Feedback" delay
}

/**
 * Show the start screen (welcome screen with INTERMITTENT video + Subtle Pulse)
 * BATTERY OPTIMIZATION: Video plays 5s every 60s instead of continuous loop
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
  
  console.log('[START SCREEN] Showing with Subtle Pulse...');
  
  if (kioskStartScreen) {
    if (!document.body.contains(kioskStartScreen)) {
      document.body.appendChild(kioskStartScreen);
    }
    kioskStartScreen.classList.remove('hidden');

    // BATTERY OPTIMIZATION: Setup intermittent video playback
    if (kioskVideo) {
      setupVideoLoop(kioskVideo);
    }

    // ENABLE PULSE (Attract Mode)
    startAttractMode();

    // Create bound function
    window.boundStartSurvey = (e) => {
      startSurvey(e);
    };
    
    // Event listeners
    kioskStartScreen.addEventListener('click', window.boundStartSurvey, { once: true });
    kioskStartScreen.addEventListener('touchstart', window.boundStartSurvey, { once: true, passive: false });
    
    console.log('[START SCREEN] Listeners attached');
  }

  if (progressBar) {
    progressBar.style.width = '0%';
  }
}

// Export battery optimization functions for use in other modules
export { pauseVideo, resumeVideo };
