// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen logic with subtle pulse and immediate touch feedback
// DEPENDENCIES: core.js

import { getDependencies, saveState, showQuestion, cleanupInputFocusScroll } from './core.js';

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
    target.classList.add('animate-pulse'); // Requires CSS: @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }
  });
}

/**
 * Visual Feedback on Touch
 * Adds a "pressed" state before the logic continues
 */
function triggerTouchFeedback(element) {
  if (element) {
    element.classList.remove('animate-pulse'); // Stop pulsing immediately
    element.classList.add('active-press'); // Requires CSS: .active-press { transform: scale(0.95); opacity: 0.8; transition: all 0.1s; }
  }
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
    
    // VISUAL FEEDBACK: Trigger the "Press" effect on the target or the container
    // If the user clicked a specific button, animate that, otherwise animate the content container
    const targetElement = e.target.closest('.content') || kioskStartScreen.querySelector('.content');
    triggerTouchFeedback(targetElement);
  }
  
  console.log('[START] User interaction detected...');

  // SHORT DELAY: Allow 200ms for the user to see the "press" animation before hiding
  setTimeout(() => {
    console.log('[START] Transitioning to survey...');
    
    cleanupStartScreenListeners();
    
    kioskStartScreen.classList.add('hidden');
    
    if (kioskVideo) {
      kioskVideo.pause();
    }
    
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
 * Show the start screen (welcome screen with INFINITE video + Subtle Pulse)
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

    // VIDEO FIRST (iPad guaranteed loop)
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
