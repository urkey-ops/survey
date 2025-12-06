// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen logic and video handling
// DEPENDENCIES: core.js

import { getDependencies, saveState, showQuestion, cleanupInputFocusScroll } from './core.js';

/**
 * Shake animation for start screen attention grabbing - FIXED VERSION
 */
function startShake() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  if (!kioskStartScreen) {
    console.warn('[SHAKE] No kioskStartScreen found');
    return;
  }

  console.log('[SHAKE] Starting shake animation...');
  
  const originalTransform = kioskStartScreen.style.transform || '';
  const shakeIntervals = [150, 150, 150, 5000];
  let index = 0;
  
  function forceRepaint() {
    kioskStartScreen.offsetHeight; // Trigger reflow
  }
  
  function shakeStep() {
    if (index >= shakeIntervals.length) {
      console.log('[SHAKE] Shake sequence complete');
      return;
    }
    
    console.log(`[SHAKE] Shake ${index + 1}/${shakeIntervals.length} (${shakeIntervals[index]}ms)`);
    
    // Apply shake with forced repaint
    kioskStartScreen.style.transform = 
      `translateX(${Math.random() * 20 - 10}px) translateY(${Math.random() * 20 - 10}px) rotate(${Math.random() * 2 - 1}deg)`;
    
    forceRepaint();
    
    setTimeout(() => {
      // Reset with forced repaint
      kioskStartScreen.style.transform = originalTransform;
      forceRepaint();
      
      index++;
      shakeStep();
    }, shakeIntervals[index]);
  }
  
  shakeStep();
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
  
  kioskStartScreen.classList.add('hidden');
  
  if (kioskVideo) {
    kioskVideo.pause();
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
 * Show the start screen (welcome screen with video)
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
  
  console.log('[START SCREEN] Showing start screen...');
  
  if (kioskStartScreen) {
    if (!document.body.contains(kioskStartScreen)) {
      document.body.appendChild(kioskStartScreen);
    }
    kioskStartScreen.classList.remove('hidden');

    if (kioskVideo) {
      // iOS Video Fix
      kioskVideo.currentTime = 0;
      kioskVideo.setAttribute('playsinline', '');
      kioskVideo.setAttribute('webkit-playsinline', '');
      kioskVideo.muted = true;
      kioskVideo.loop = true;
      
      const playPromise = kioskVideo.play();
      
      // Start shaking IMMEDIATELY regardless of autoplay success
      startShake();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log("[VIDEO] Video autoplay started successfully");
        }).catch(error => {
          console.warn("[VIDEO] Autoplay prevented:", error.message);
          
          // iOS fallback: Play on first touch
          const playOnTouch = () => {
            kioskVideo.play().catch(err => {
              console.warn("[VIDEO] Manual play failed:", err);
            });
            document.removeEventListener('touchstart', playOnTouch);
          };
          document.addEventListener('touchstart', playOnTouch, { once: true });
        });
      }
    } else {
      console.log('[VIDEO] No kioskVideo found - starting shake anyway');
      startShake();
    }

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
