// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen logic and video handling
// DEPENDENCIES: core.js

import { getDependencies, saveState, showQuestion, cleanupInputFocusScroll } from './core.js';

/**
 * ULTIMATE scale + shake attention grabber with iPad video loop guarantee
 */
function startShake() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  if (!kioskStartScreen) {
    console.warn('[SHAKE] No kioskStartScreen found');
    return;
  }

  console.log('[SHAKE] Starting ULTIMATE scale+shake sequence...');
  
  // Target your exact elements
  const targets = [
    kioskStartScreen,                                    // Main container
    window.globals?.kioskVideo,                          // #kioskVideo
    kioskStartScreen.querySelector('.content'),          // Content area
    kioskStartScreen.querySelector('h1, h2, .title')     // Title elements
  ].filter(Boolean);
  
  const shakeIntervals = [700, 700, 700, 5000]; // Match 0.7s animation
  let index = 0;
  
  function shakeStep() {
    if (index >= shakeIntervals.length) {
      console.log('[SHAKE] Ultimate scale+shake sequence complete');
      // Clean up classes
      targets.forEach(target => {
        target?.classList.remove('shake-scale', 'shake');
      });
      return;
    }
    
    console.log(`[SHAKE] Scale+shake ${index + 1}/${shakeIntervals.length}`);
    
    // Apply scale+shake class to ALL targets
    targets.forEach(target => {
      if (target) {
        target.classList.remove('shake-scale', 'shake');
        target.classList.add('shake-scale');
        console.log(`[SHAKE] Applied scale+shake to:`, target.id || target.className || target.tagName);
      }
    });
    
    // Remove class after animation + interval
    setTimeout(() => {
      targets.forEach(target => {
        target?.classList.remove('shake-scale', 'shake');
      });
      
      index++;
      shakeStep();
    }, shakeIntervals[index]);
  }
  
  shakeStep();
}

/**
 * iPad-optimized video loop setup
 */
function setupVideoLoop(kioskVideo) {
  if (!kioskVideo) return;
  
  console.log('[VIDEO] iPad-optimized loop setup...');
  
  // iPad essential attributes
  kioskVideo.currentTime = 0;
  kioskVideo.setAttribute('playsinline', '');
  kioskVideo.setAttribute('webkit-playsinline', '');
  kioskVideo.setAttribute('muted', 'muted');
  kioskVideo.loop = true;
  kioskVideo.preload = 'auto';
  
  // Force iPad video play with user gesture fallback
  const playVideo = () => {
    const playPromise = kioskVideo.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log("[VIDEO] iPad autoplay SUCCESS - looping");
        })
        .catch(error => {
          console.warn("[VIDEO] iPad autoplay blocked:", error.message);
          // iPad fallback - wait for ANY touch
          const iPadTouchFallback = () => {
            kioskVideo.play().then(() => {
              console.log("[VIDEO] iPad touch play SUCCESS");
            }).catch(err => {
              console.warn("[VIDEO] iPad touch play failed:", err);
            });
            document.removeEventListener('touchstart', iPadTouchFallback, { once: true });
          };
          document.addEventListener('touchstart', iPadTouchFallback, { once: true, passive: false });
        });
    }
  };
  
  playVideo();
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
}

/**
 * Start the survey (called when start screen is clicked)
 */
function startSurvey(e) {
  const { globals, appState, dataHandlers } = getDependencies();
  const kioskStartScreen = globals?.kioskStartScreen;
  const kioskVideo = globals?.kioskVideo;
  
  // Prevent multiple calls
  if (!kioskStartScreen || kioskStartScreen.classList.contains('hidden')) {
    return;
  }
  
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  console.log('[START] Starting survey...');
  
  // Remove event listeners immediately
  cleanupStartScreenListeners();
  
  // Clean up shake classes
  kioskStartScreen.classList.remove('shake-scale', 'shake');
  kioskStartScreen.classList.add('hidden');
  
  if (kioskVideo) {
    kioskVideo.pause();
    kioskVideo.classList.remove('shake-scale', 'shake');
  }
  
  // Generate ID if missing
  if (!appState.formData.id) {
    appState.formData.id = dataHandlers.generateUUID();
    console.log('[START] Generated new survey ID:', appState.formData.id);
  }
  if (!appState.formData.timestamp) {
    appState.formData.timestamp = new Date().toISOString();
  }
  
  // Start survey timer
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
}

/**
 * Show the start screen (welcome screen with video + scale shake)
 */
export function showStartScreen() {
  const { globals } = getDependencies();
  const kioskStartScreen = globals?.kioskStartScreen;
  const kioskVideo = globals?.kioskVideo;
  const questionContainer = globals?.questionContainer;
  const nextBtn = globals?.nextBtn;
  const prevBtn = globals?.prevBtn;
  const progressBar = globals?.progressBar;
  
  // Clear all timers
  if (window.uiHandlers && window.uiHandlers.clearAllTimers) {
    window.uiHandlers.clearAllTimers();
  }
  
  cleanupStartScreenListeners();
  cleanupInputFocusScroll();

  if (questionContainer) questionContainer.innerHTML = '';
  if (nextBtn) nextBtn.disabled = true;
  if (prevBtn) prevBtn.disabled = true;
  
  console.log('[START SCREEN] Showing start screen with scale+shake...');
  
  if (kioskStartScreen) {
    if (!document.body.contains(kioskStartScreen)) {
      document.body.appendChild(kioskStartScreen);
    }
    kioskStartScreen.classList.remove('hidden');

    // iPad VIDEO FIRST (before shake) - ensures smooth loop
    if (kioskVideo) {
      setupVideoLoop(kioskVideo);
    }

    // IMMEDIATE scale+shake (works with video)
    startShake();

    // Create bound function
    window.boundStartSurvey = startSurvey.bind(null);
    
    // Add event listeners with proper cleanup
    kioskStartScreen.addEventListener('click', window.boundStartSurvey, { once: true });
    kioskStartScreen.addEventListener('touchstart', window.boundStartSurvey, { once: true, passive: false });
    
    console.log('[START SCREEN] Event listeners attached');
  }

  if (progressBar) {
    progressBar.style.width = '0%';
  }
}
