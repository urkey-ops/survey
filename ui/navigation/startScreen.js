// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen logic and video handling
// DEPENDENCIES: core.js

import { getDependencies, saveState, showQuestion, cleanupInputFocusScroll } from './core.js';

let shakeInterval = null; // Global for infinite loop control
let isShaking = false;

/**
 * INFINITE scale + shake until user touches (iPad kiosk optimized)
 */
function startShake() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  if (!kioskStartScreen || isShaking) {
    console.warn('[SHAKE] Already shaking or no kioskStartScreen');
    return;
  }

  console.log('[SHAKE] Starting INFINITE scale+shake loop...');
  isShaking = true;
  
  // Target your exact elements
  const targets = [
    kioskStartScreen,
    window.globals?.kioskVideo,
    kioskStartScreen.querySelector('.content'),
    kioskStartScreen.querySelector('h1, h2, .title')
  ].filter(Boolean);
  
  // INFINITE LOOP - every 2 seconds
  shakeInterval = setInterval(() => {
    console.log('[SHAKE] Infinite loop shake...');
    
    // Apply scale+shake class
    targets.forEach(target => {
      if (target) {
        target.classList.remove('shake-scale', 'shake');
        target.classList.add('shake-scale');
        console.log(`[SHAKE] Infinite shake applied to:`, target.id || target.tagName);
      }
    });
    
    // Remove after animation (0.7s)
    setTimeout(() => {
      targets.forEach(target => {
        target?.classList.remove('shake-scale', 'shake');
      });
    }, 700);
    
  }, 2000); // Every 2 seconds forever
  
  console.log('[SHAKE] Infinite loop started (stops on touch)');
}

/**
 * STOP infinite shake (called on user interaction)
 */
function stopShake() {
  if (shakeInterval) {
    clearInterval(shakeInterval);
    shakeInterval = null;
    isShaking = false;
    console.log('[SHAKE] Infinite loop STOPPED by user touch');
  }
  
  // Clean up all classes
  const kioskStartScreen = window.globals?.kioskStartScreen;
  const targets = [
    kioskStartScreen,
    window.globals?.kioskVideo
  ].filter(Boolean);
  
  targets.forEach(target => {
    target?.classList.remove('shake-scale', 'shake');
  });
}

/**
 * iPad-optimized video loop setup
 */
function setupVideoLoop(kioskVideo) {
  if (!kioskVideo) return;
  
  console.log('[VIDEO] iPad-optimized infinite loop setup...');
  
  kioskVideo.currentTime = 0;
  kioskVideo.setAttribute('playsinline', '');
  kioskVideo.setAttribute('webkit-playsinline', '');
  kioskVideo.setAttribute('muted', 'muted');
  kioskVideo.loop = true;
  kioskVideo.preload = 'auto';
  
  const playVideo = () => {
    const playPromise = kioskVideo.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => console.log("[VIDEO] iPad infinite loop SUCCESS"))
        .catch(error => {
          console.warn("[VIDEO] iPad autoplay blocked:", error.message);
          // iPad touch fallback
          document.addEventListener('touchstart', () => {
            kioskVideo.play().catch(err => console.warn("[VIDEO] Touch play failed:", err));
          }, { once: true });
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
  
  stopShake(); // Always stop shake on cleanup
}

/**
 * Start the survey (called when start screen is clicked/touched)
 */
function startSurvey(e) {
  const { globals, appState, dataHandlers } = getDependencies();
  const kioskStartScreen = globals?.kioskStartScreen;
  const kioskVideo = globals?.kioskVideo;
  
  if (!kioskStartScreen || kioskStartScreen.classList.contains('hidden')) {
    return;
  }
  
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  console.log('[START] Starting survey...');
  
  // STOP SHAKE IMMEDIATELY on user touch
  stopShake();
  
  cleanupStartScreenListeners();
  
  kioskStartScreen.classList.add('hidden');
  
  if (kioskVideo) {
    kioskVideo.pause();
  }
  
  if (!appState.formData.id) {
    appState.formData.id = dataHandlers.generateUUID();
    console.log('[START] Generated new survey ID:', appState.formData.id);
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
}

/**
 * Show the start screen (welcome screen with INFINITE video + shake)
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
  
  console.log('[START SCREEN] Showing with INFINITE scale+shake...');
  
  if (kioskStartScreen) {
    if (!document.body.contains(kioskStartScreen)) {
      document.body.appendChild(kioskStartScreen);
    }
    kioskStartScreen.classList.remove('hidden');

    // VIDEO FIRST (iPad guaranteed loop)
    if (kioskVideo) {
      setupVideoLoop(kioskVideo);
    }

    // INFINITE SHAKE LOOP
    startShake();

    // Create bound function with shake stop
    window.boundStartSurvey = (e) => {
      stopShake();
      startSurvey(e);
    };
    
    // Event listeners (stops shake + starts survey)
    kioskStartScreen.addEventListener('click', window.boundStartSurvey, { once: true });
    kioskStartScreen.addEventListener('touchstart', window.boundStartSurvey, { once: true, passive: false });
    
    console.log('[START SCREEN] Infinite shake + listeners attached');
  }

  if (progressBar) {
    progressBar.style.width = '0%';
  }
}
