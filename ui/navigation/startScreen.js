// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen logic with iOS-safe video playback
// DEPENDENCIES: core.js
// BATTERY OPTIMIZATION: Intermittent video playback (plays 5s every 20s)
// FIX: Robust video event handling for iPad PWA offline mode

import { getDependencies, saveState, showQuestion, cleanupInputFocusScroll } from './core.js';

// BATTERY CONFIG: Adjust PLAY_INTERVAL to control how often video plays
const VIDEO_CONFIG = {
  PLAY_INTERVAL: 20000,  // Play video every 20 seconds
  VIDEO_DURATION: 5000,  // Your video is 5 seconds long
  MAX_PLAY_ATTEMPTS: 3,  // Retry failed plays up to 3 times
  PLAY_RETRY_DELAY: 1000 // Wait 1s between retries
};

// Store video interval timer and state
let videoPlaybackInterval = null;
let videoState = {
  isPlaying: false,
  playAttempts: 0,
  lastPlayTime: 0,
  hasLoaded: false
};

/**
 * iOS-SAFE: Check if video is ready to play
 */
function isVideoReady(video) {
  if (!video) return false;
  
  // Check readyState: 4 = HAVE_ENOUGH_DATA
  const hasData = video.readyState >= 3;
  
  // Check if video has duration (confirms it loaded)
  const hasDuration = video.duration > 0 && !isNaN(video.duration);
  
  // Check if video source exists
  const hasSource = video.src || (video.currentSrc && video.currentSrc !== '');
  
  return hasData && hasDuration && hasSource;
}

/**
 * iOS-SAFE: Force reload video source
 * This fixes iOS PWA offline cache corruption
 */
function reloadVideoSource(video) {
  if (!video) return;
  
  console.log('[VIDEO] 🔄 Reloading video source...');
  
  const currentSrc = video.src || video.querySelector('source')?.src;
  
  if (currentSrc) {
    // Force reload by setting src to empty then back
    video.src = '';
    video.load();
    
    setTimeout(() => {
      video.src = currentSrc;
      video.load();
      videoState.hasLoaded = false; // Reset load state
      console.log('[VIDEO] Source reloaded');
    }, 100);
  } else {
    // CRITICAL: If no source found, video is completely corrupted
    console.error('[VIDEO] 💥 Video source lost - attempting nuclear reload');
    nuclearVideoReload(video);
  }
}

/**
 * NUCLEAR OPTION: Completely reconstruct video element
 * Used when iPad battery died and video element is corrupted beyond repair
 */
function nuclearVideoReload(video) {
  if (!video) return;
  
  console.log('[VIDEO] ☢️ Nuclear reload - reconstructing video element');
  
  const parent = video.parentElement;
  const videoId = video.id;
  const videoClasses = video.className;
  
  // Store original video source from HTML
  const videoSrc = 'asset/video/1.mp4';
  
  // Remove corrupted video
  video.remove();
  
  // Create fresh video element
  const newVideo = document.createElement('video');
  newVideo.id = videoId;
  newVideo.className = videoClasses;
  newVideo.setAttribute('autoplay', '');
  newVideo.setAttribute('muted', '');
  newVideo.setAttribute('playsinline', '');
  newVideo.setAttribute('webkit-playsinline', '');
  newVideo.setAttribute('preload', 'auto');
  newVideo.setAttribute('disableRemotePlayback', '');
  newVideo.setAttribute('x-webkit-airplay', 'deny');
  newVideo.muted = true;
  newVideo.loop = false;
  
  // Create source element
  const source = document.createElement('source');
  source.src = videoSrc;
  source.type = 'video/mp4';
  newVideo.appendChild(source);
  
  // Insert back into DOM
  parent.insertBefore(newVideo, parent.children[1]); // After title, before tap prompt
  
  // Update global reference
  if (window.globals) {
    window.globals.kioskVideo = newVideo;
  }
  
  // Force load
  newVideo.load();
  
  console.log('[VIDEO] ✅ Video element reconstructed');
  
  // Setup event listeners on new element
  setTimeout(() => {
    setupVideoEventListeners(newVideo);
    
    // Try to play after a delay
    setTimeout(() => {
      playVideoOnce(newVideo);
    }, 500);
  }, 200);
}

/**
 * iOS-SAFE: Setup comprehensive video event listeners
 */
function setupVideoEventListeners(video) {
  if (!video) return;
  
  // Remove existing listeners first
  const eventTypes = ['ended', 'error', 'canplaythrough', 'loadedmetadata', 'stalled', 'suspend'];
  eventTypes.forEach(type => {
    const oldListener = video[`_${type}Handler`];
    if (oldListener) {
      video.removeEventListener(type, oldListener);
    }
  });
  
  // CRITICAL: Handle video end
  const endedHandler = () => {
    console.log('[VIDEO] 📺 Video ended naturally');
    videoState.isPlaying = false;
    video.pause();
    video.currentTime = 0;
  };
  video.addEventListener('ended', endedHandler);
  video._endedHandler = endedHandler;
  
  // CRITICAL: Handle video errors
  const errorHandler = (e) => {
    console.error('[VIDEO] ❌ Error:', e);
    videoState.isPlaying = false;
    videoState.hasLoaded = false;
    
    // Try to reload video source on error
    setTimeout(() => {
      reloadVideoSource(video);
    }, 1000);
  };
  video.addEventListener('error', errorHandler);
  video._errorHandler = errorHandler;
  
  // Track when video is ready
  const canPlayHandler = () => {
    console.log('[VIDEO] ✅ Can play through');
    videoState.hasLoaded = true;
  };
  video.addEventListener('canplaythrough', canPlayHandler);
  video._canplaythroughHandler = canPlayHandler;
  
  // Track metadata load
  const metadataHandler = () => {
    console.log('[VIDEO] 📋 Metadata loaded');
  };
  video.addEventListener('loadedmetadata', metadataHandler);
  video._loadedmetadataHandler = metadataHandler;
  
  // Handle iOS suspension issues
  const stalledHandler = () => {
    console.warn('[VIDEO] ⚠️ Playback stalled');
    if (videoState.isPlaying) {
      setTimeout(() => {
        if (video.paused && videoState.isPlaying) {
          console.log('[VIDEO] Attempting recovery from stall...');
          playVideoOnce(video);
        }
      }, 500);
    }
  };
  video.addEventListener('stalled', stalledHandler);
  video._stalledHandler = stalledHandler;
  
  // Handle iOS network suspension
  const suspendHandler = () => {
    console.warn('[VIDEO] ⏸️ Network suspended');
  };
  video.addEventListener('suspend', suspendHandler);
  video._suspendHandler = suspendHandler;
  
  console.log('[VIDEO] Event listeners attached');
}

/**
 * iOS-SAFE: Play video with retry logic
 */
async function playVideoOnce(video, isRetry = false) {
  if (!video) return false;
  
  // Prevent multiple simultaneous plays
  if (videoState.isPlaying) {
    console.log('[VIDEO] Already playing, skipping...');
    return false;
  }
  
  // Check if video is ready
  if (!isVideoReady(video)) {
    console.warn('[VIDEO] Video not ready, waiting...');
    
    // Wait for video to be ready
    return new Promise((resolve) => {
      const checkReady = setInterval(() => {
        if (isVideoReady(video)) {
          clearInterval(checkReady);
          playVideoOnce(video, true).then(resolve);
        }
      }, 500);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkReady);
        console.error('[VIDEO] Timeout waiting for video ready');
        reloadVideoSource(video);
        resolve(false);
      }, 5000);
    });
  }
  
  // Reset to start
  video.currentTime = 0;
  videoState.isPlaying = true;
  videoState.lastPlayTime = Date.now();
  
  try {
    const playPromise = video.play();
    
    if (playPromise !== undefined) {
      await playPromise;
      console.log('[VIDEO] ▶️ Playing 5-second clip...');
      videoState.playAttempts = 0; // Reset attempts on success
      
      // Auto-pause after duration using ended event as primary
      // But keep setTimeout as fallback for iOS quirks
      const safetyTimeout = setTimeout(() => {
        if (video && !video.paused && videoState.isPlaying) {
          console.log('[VIDEO] ⏸️ Safety pause triggered');
          video.pause();
          videoState.isPlaying = false;
        }
      }, VIDEO_CONFIG.VIDEO_DURATION + 500); // Add 500ms buffer
      
      // Clear timeout if video ends naturally
      const endHandler = () => {
        clearTimeout(safetyTimeout);
        video.removeEventListener('ended', endHandler);
      };
      video.addEventListener('ended', endHandler, { once: true });
      
      return true;
    }
  } catch (error) {
    console.error('[VIDEO] Play failed:', error.message);
    videoState.isPlaying = false;
    videoState.playAttempts++;
    
    // Retry logic
    if (!isRetry && videoState.playAttempts < VIDEO_CONFIG.MAX_PLAY_ATTEMPTS) {
      console.log(`[VIDEO] Retrying... (${videoState.playAttempts}/${VIDEO_CONFIG.MAX_PLAY_ATTEMPTS})`);
      
      await new Promise(resolve => setTimeout(resolve, VIDEO_CONFIG.PLAY_RETRY_DELAY));
      return playVideoOnce(video, true);
    } else if (videoState.playAttempts >= VIDEO_CONFIG.MAX_PLAY_ATTEMPTS) {
      console.error('[VIDEO] Max retry attempts reached, reloading source...');
      reloadVideoSource(video);
      videoState.playAttempts = 0;
    }
    
    return false;
  }
}

/**
 * Applies the "Attract Mode" (Subtle Pulse)
 */
function startAttractMode() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  if (!kioskStartScreen) return;

  const attractTargets = [
    kioskStartScreen.querySelector('.content'),
    kioskStartScreen.querySelector('.title'),
    kioskStartScreen.querySelector('.btn-start')
  ].filter(Boolean);

  console.log('[ATTRACT] Enabling subtle pulse effect...');
  attractTargets.forEach(target => {
    target.classList.add('animate-pulse');
  });
}

/**
 * Visual Feedback on Touch
 */
function triggerTouchFeedback(element) {
  if (element) {
    element.classList.remove('animate-pulse');
    element.classList.add('active-press');
  }
}

/**
 * BATTERY OPTIMIZATION: Setup intermittent video playback
 * iOS-SAFE: With proper event handling and error recovery
 */
function setupVideoLoop(kioskVideo) {
  if (!kioskVideo) return;
  
  console.log('[VIDEO] 🔋 Setting up INTERMITTENT playback...');
  console.log(`[VIDEO] Playing 5s every ${VIDEO_CONFIG.PLAY_INTERVAL / 1000}s`);
  
  // Setup video attributes for iOS
  kioskVideo.setAttribute('playsinline', '');
  kioskVideo.setAttribute('webkit-playsinline', '');
  kioskVideo.setAttribute('muted', 'muted');
  kioskVideo.muted = true;
  kioskVideo.loop = false; // We control playback manually
  kioskVideo.preload = 'auto';
  
  // Setup event listeners
  setupVideoEventListeners(kioskVideo);
  
  // Clear any existing interval
  if (videoPlaybackInterval) {
    clearInterval(videoPlaybackInterval);
    videoPlaybackInterval = null;
  }
  
  // Reset state
  videoState.playAttempts = 0;
  videoState.isPlaying = false;
  
  // Play immediately after short delay
  setTimeout(() => {
    playVideoOnce(kioskVideo);
  }, 300);
  
  // Setup interval for periodic playback
  videoPlaybackInterval = setInterval(() => {
    const kioskStartScreen = window.globals?.kioskStartScreen;
    
    // Only play if still on start screen and not currently playing
    if (kioskStartScreen && 
        !kioskStartScreen.classList.contains('hidden') && 
        !videoState.isPlaying) {
      playVideoOnce(kioskVideo);
    }
  }, VIDEO_CONFIG.PLAY_INTERVAL);
  
  console.log('[VIDEO] ✅ Intermittent playback active');
}

/**
 * BATTERY OPTIMIZATION: Pause video when survey is active
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
    videoState.isPlaying = false;
    console.log('[VIDEO] ⏸️ Paused - Battery saving mode');
  }
}

/**
 * BATTERY OPTIMIZATION: Resume video when returning to start screen
 * iOS-SAFE: Checks video state and reloads if necessary
 */
function resumeVideo() {
  const kioskVideo = window.globals?.kioskVideo;
  if (!kioskVideo) return;
  
  console.log('[VIDEO] 🔄 Resuming video...');
  
  // Check if video needs reload (common after iPad sleep)
  if (!isVideoReady(kioskVideo)) {
    console.log('[VIDEO] Video not ready, reloading...');
    reloadVideoSource(kioskVideo);
    
    // Wait for reload before setting up loop
    setTimeout(() => {
      setupVideoLoop(kioskVideo);
    }, 1000);
  } else {
    setupVideoLoop(kioskVideo);
  }
}

/**
 * VISIBILITY CHANGE HANDLER: Export for use in visibilityHandler.js
 * Called when app becomes visible after being hidden
 */
export function handleVideoVisibilityChange(isVisible) {
  const kioskVideo = window.globals?.kioskVideo;
  const kioskStartScreen = window.globals?.kioskStartScreen;
  
  if (!kioskVideo) return;
  
  if (isVisible) {
    // App is now visible
    console.log('[VIDEO] 👁️ App visible');
    
    // Only resume if on start screen
    if (kioskStartScreen && !kioskStartScreen.classList.contains('hidden')) {
      console.log('[VIDEO] On start screen, resuming...');
      resumeVideo();
    }
  } else {
    // App is now hidden
    console.log('[VIDEO] 🙈 App hidden, pausing...');
    pauseVideo();
  }
}

/**
 * NUCLEAR RELOAD TRIGGER: Export for emergency use
 * Can be called from visibilityHandler or manually
 */
export function triggerNuclearReload() {
  const kioskVideo = window.globals?.kioskVideo;
  if (kioskVideo) {
    nuclearVideoReload(kioskVideo);
  } else {
    console.error('[VIDEO] Cannot nuclear reload - video element not found');
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
  
  // Reset state
  videoState.isPlaying = false;
  videoState.playAttempts = 0;
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

    setTimeout(() => {
      if (kioskStartScreen && document.body.contains(kioskStartScreen)) {
        kioskStartScreen.remove();
      }
    }, 400);
  }, 200);
}

/**
 * Show the start screen with iOS-safe video
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

    // Setup video with iOS-safe handling
    if (kioskVideo) {
      // Touch fallback for iOS autoplay restrictions
      const touchFallback = () => {
        if (kioskVideo.paused && !videoState.isPlaying) {
          console.log('[VIDEO] Touch fallback triggered');
          playVideoOnce(kioskVideo);
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

// Export battery optimization functions
export { pauseVideo, resumeVideo };
