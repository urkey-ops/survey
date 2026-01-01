// FILE: ui/navigation/startScreen.js
// PURPOSE: Start screen logic with iOS-safe video playback
// DEPENDENCIES: core.js
// BATTERY OPTIMIZATION: Time-of-day video scheduling
// SCHEDULE: 
//   6:30pm-9am: NO VIDEO (massive battery savings)
//   9am-1pm: Every 20 seconds (peak hours)
//   1pm-3pm: Every 60 seconds (afternoon slowdown)
//   3pm-6:30pm: Every 20 seconds (evening rush)
// FIX: Robust video event handling for iPad PWA offline mode

import { getDependencies, saveState, showQuestion, cleanupInputFocusScroll } from './core.js';

/**
 * Get video play interval based on time of day
 * Custom schedule for maximum battery efficiency
 * Monday-Sunday (same schedule every day)
 */
function getSmartVideoInterval() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Convert to minutes since midnight for easier comparison
  const currentMinutes = hour * 60 + minute;
  
  // Define schedule boundaries (in minutes since midnight)
  const morningStart = 9 * 60;           // 9:00am = 540 minutes
  const afternoonStart = 13 * 60;        // 1:00pm = 780 minutes
  const eveningStart = 15 * 60;          // 3:00pm = 900 minutes
  const eveningEnd = 18 * 60 + 30;       // 6:30pm = 1110 minutes
  
  // 6:30pm - 9am next day: NO VIDEO (sleep mode)
  if (currentMinutes >= eveningEnd || currentMinutes < morningStart) {
    console.log('[VIDEO] 😴 Sleep mode (6:30pm-9am) - Video disabled');
    return null; // null = don't play video at all
  }
  
  // 9am - 1pm: Peak hours - play every 20 seconds
  if (currentMinutes >= morningStart && currentMinutes < afternoonStart) {
    return 20000; // 20 seconds
  }
  
  // 1pm - 3pm: Afternoon slowdown - play every 60 seconds
  if (currentMinutes >= afternoonStart && currentMinutes < eveningStart) {
    return 60000; // 60 seconds
  }
  
  // 3pm - 6:30pm: Evening rush - play every 20 seconds
  if (currentMinutes >= eveningStart && currentMinutes < eveningEnd) {
    return 20000; // 20 seconds
  }
  
  // Fallback (should never reach here)
  return 60000;
}

/**
 * Get human-readable schedule description
 */
function getScheduleDescription() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentMinutes = hour * 60 + minute;
  
  const morningStart = 9 * 60;
  const afternoonStart = 13 * 60;
  const eveningStart = 15 * 60;
  const eveningEnd = 18 * 60 + 30;
  
  if (currentMinutes >= eveningEnd || currentMinutes < morningStart) {
    return 'Sleep Mode (6:30pm-9am)';
  } else if (currentMinutes >= morningStart && currentMinutes < afternoonStart) {
    return 'Peak Hours (9am-1pm)';
  } else if (currentMinutes >= afternoonStart && currentMinutes < eveningStart) {
    return 'Afternoon (1pm-3pm)';
  } else if (currentMinutes >= eveningStart && currentMinutes < eveningEnd) {
    return 'Evening Rush (3pm-6:30pm)';
  }
  return 'Unknown';
}

// BATTERY CONFIG with smart scheduling
const VIDEO_CONFIG = {
  get PLAY_INTERVAL() {
    return getSmartVideoInterval();
  },
  VIDEO_DURATION: 5000,
  MAX_PLAY_ATTEMPTS: 3,
  PLAY_RETRY_DELAY: 1000
};

// Store video interval timer and state
let videoPlaybackInterval = null;
let videoState = {
  isPlaying: false,
  playAttempts: 0,
  lastPlayTime: 0,
  hasLoaded: false,
  currentSchedule: null
};

/**
 * iOS-SAFE: Check if video is ready to play
 */
function isVideoReady(video) {
  if (!video) return false;
  
  const hasData = video.readyState >= 3;
  const hasDuration = video.duration > 0 && !isNaN(video.duration);
  const hasSource = video.src || (video.currentSrc && video.currentSrc !== '');
  
  return hasData && hasDuration && hasSource;
}

/**
 * iOS-SAFE: Force reload video source
 */
function reloadVideoSource(video) {
  if (!video) return;
  
  console.log('[VIDEO] 🔄 Reloading video source...');
  
  const currentSrc = video.src || video.querySelector('source')?.src;
  
  if (currentSrc) {
    video.src = '';
    video.load();
    
    setTimeout(() => {
      video.src = currentSrc;
      video.load();
      videoState.hasLoaded = false;
      console.log('[VIDEO] Source reloaded');
    }, 100);
  } else {
    console.error('[VIDEO] 💥 Video source lost - attempting nuclear reload');
    nuclearVideoReload(video);
  }
}

/**
 * NUCLEAR OPTION: Completely reconstruct video element
 */
function nuclearVideoReload(video) {
  if (!video) return;
  
  console.log('[VIDEO] ☢️ Nuclear reload - reconstructing video element');
  
  const parent = video.parentElement;
  const videoId = video.id;
  const videoClasses = video.className;
  const videoSrc = 'asset/video/1.mp4';
  
  video.remove();
  
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
  
  const source = document.createElement('source');
  source.src = videoSrc;
  source.type = 'video/mp4';
  newVideo.appendChild(source);
  
  parent.insertBefore(newVideo, parent.children[1]);
  
  if (window.globals) {
    window.globals.kioskVideo = newVideo;
  }
  
  newVideo.load();
  console.log('[VIDEO] ✅ Video element reconstructed');
  
  setTimeout(() => {
    setupVideoEventListeners(newVideo);
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
  
  const eventTypes = ['ended', 'error', 'canplaythrough', 'loadedmetadata', 'stalled', 'suspend'];
  eventTypes.forEach(type => {
    const oldListener = video[`_${type}Handler`];
    if (oldListener) {
      video.removeEventListener(type, oldListener);
    }
  });
  
  const endedHandler = () => {
    console.log('[VIDEO] 📺 Video ended naturally');
    videoState.isPlaying = false;
    video.pause();
    video.currentTime = 0;
  };
  video.addEventListener('ended', endedHandler);
  video._endedHandler = endedHandler;
  
  const errorHandler = (e) => {
    console.error('[VIDEO] ❌ Error:', e);
    videoState.isPlaying = false;
    videoState.hasLoaded = false;
    setTimeout(() => reloadVideoSource(video), 1000);
  };
  video.addEventListener('error', errorHandler);
  video._errorHandler = errorHandler;
  
  const canPlayHandler = () => {
    console.log('[VIDEO] ✅ Can play through');
    videoState.hasLoaded = true;
  };
  video.addEventListener('canplaythrough', canPlayHandler);
  video._canplaythroughHandler = canPlayHandler;
  
  const metadataHandler = () => {
    console.log('[VIDEO] 📋 Metadata loaded');
  };
  video.addEventListener('loadedmetadata', metadataHandler);
  video._loadedmetadataHandler = metadataHandler;
  
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
  
  if (videoState.isPlaying) {
    console.log('[VIDEO] Already playing, skipping...');
    return false;
  }
  
  if (!isVideoReady(video)) {
    console.warn('[VIDEO] Video not ready, waiting...');
    
    return new Promise((resolve) => {
      const checkReady = setInterval(() => {
        if (isVideoReady(video)) {
          clearInterval(checkReady);
          playVideoOnce(video, true).then(resolve);
        }
      }, 500);
      
      setTimeout(() => {
        clearInterval(checkReady);
        console.error('[VIDEO] Timeout waiting for video ready');
        reloadVideoSource(video);
        resolve(false);
      }, 5000);
    });
  }
  
  video.currentTime = 0;
  videoState.isPlaying = true;
  videoState.lastPlayTime = Date.now();
  
  try {
    const playPromise = video.play();
    
    if (playPromise !== undefined) {
      await playPromise;
      console.log('[VIDEO] ▶️ Playing 5-second clip...');
      videoState.playAttempts = 0;
      
      const safetyTimeout = setTimeout(() => {
        if (video && !video.paused && videoState.isPlaying) {
          console.log('[VIDEO] ⏸️ Safety pause triggered');
          video.pause();
          videoState.isPlaying = false;
        }
      }, VIDEO_CONFIG.VIDEO_DURATION + 500);
      
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

function triggerTouchFeedback(element) {
  if (element) {
    element.classList.remove('animate-pulse');
    element.classList.add('active-press');
  }
}

/**
 * BATTERY OPTIMIZATION: Setup time-based video playback
 * Respects your custom schedule
 */
function setupVideoLoop(kioskVideo) {
  if (!kioskVideo) return;
  
  const interval = VIDEO_CONFIG.PLAY_INTERVAL;
  const schedule = getScheduleDescription();
  
  // If interval is null, we're in sleep mode - don't play video at all
  if (interval === null) {
    console.log('[VIDEO] 😴 SLEEP MODE - Video disabled until 9am');
    console.log('[VIDEO] 🔋 Maximum battery savings active');
    
    // Clear any existing interval
    if (videoPlaybackInterval) {
      clearInterval(videoPlaybackInterval);
      videoPlaybackInterval = null;
    }
    
    // Check again in 5 minutes to see if we've entered active hours
    setTimeout(() => {
      const kioskStartScreen = window.globals?.kioskStartScreen;
      if (kioskStartScreen && !kioskStartScreen.classList.contains('hidden')) {
        setupVideoLoop(kioskVideo);
      }
    }, 300000); // Check every 5 minutes
    
    return;
  }
  
  console.log('[VIDEO] 🔋 Setting up SMART playback...');
  console.log(`[VIDEO] Schedule: ${schedule}`);
  console.log(`[VIDEO] Playing 5s every ${interval / 1000}s`);
  
  kioskVideo.setAttribute('playsinline', '');
  kioskVideo.setAttribute('webkit-playsinline', '');
  kioskVideo.setAttribute('muted', 'muted');
  kioskVideo.muted = true;
  kioskVideo.loop = false;
  kioskVideo.preload = 'auto';
  
  setupVideoEventListeners(kioskVideo);
  
  if (videoPlaybackInterval) {
    clearInterval(videoPlaybackInterval);
    videoPlaybackInterval = null;
  }
  
  videoState.playAttempts = 0;
  videoState.isPlaying = false;
  videoState.currentSchedule = schedule;
  
  // Play immediately
  setTimeout(() => {
    playVideoOnce(kioskVideo);
  }, 300);
  
  // Setup interval for periodic playback
  videoPlaybackInterval = setInterval(() => {
    const kioskStartScreen = window.globals?.kioskStartScreen;
    
    // Check if schedule has changed
    const newInterval = VIDEO_CONFIG.PLAY_INTERVAL;
    const newSchedule = getScheduleDescription();
    
    if (newInterval !== interval || newSchedule !== videoState.currentSchedule) {
      console.log(`[VIDEO] 🕐 Schedule changed: ${videoState.currentSchedule} → ${newSchedule}`);
      clearInterval(videoPlaybackInterval);
      setupVideoLoop(kioskVideo);
      return;
    }
    
    // Only play if on start screen and not playing and not in sleep mode
    if (kioskStartScreen && 
        !kioskStartScreen.classList.contains('hidden') && 
        !videoState.isPlaying &&
        newInterval !== null) {
      playVideoOnce(kioskVideo);
    }
  }, interval);
  
  console.log('[VIDEO] ✅ Smart time-based playback active');
}

function pauseVideo() {
  const kioskVideo = window.globals?.kioskVideo;
  
  if (videoPlaybackInterval) {
    clearInterval(videoPlaybackInterval);
    videoPlaybackInterval = null;
    console.log('[VIDEO] ⏹️ Interval stopped');
  }
  
  if (kioskVideo && !kioskVideo.paused) {
    kioskVideo.pause();
    videoState.isPlaying = false;
    console.log('[VIDEO] ⏸️ Paused - Battery saving mode');
  }
}

function resumeVideo() {
  const kioskVideo = window.globals?.kioskVideo;
  if (!kioskVideo) return;
  
  console.log('[VIDEO] 🔄 Resuming video...');
  
  if (!isVideoReady(kioskVideo)) {
    console.log('[VIDEO] Video not ready, reloading...');
    reloadVideoSource(kioskVideo);
    setTimeout(() => {
      setupVideoLoop(kioskVideo);
    }, 1000);
  } else {
    setupVideoLoop(kioskVideo);
  }
}

export function handleVideoVisibilityChange(isVisible) {
  const kioskVideo = window.globals?.kioskVideo;
  const kioskStartScreen = window.globals?.kioskStartScreen;
  
  if (!kioskVideo) return;
  
  if (isVisible) {
    console.log('[VIDEO] 👁️ App visible');
    if (kioskStartScreen && !kioskStartScreen.classList.contains('hidden')) {
      console.log('[VIDEO] On start screen, resuming...');
      resumeVideo();
    }
  } else {
    console.log('[VIDEO] 🙈 App hidden, pausing...');
    pauseVideo();
  }
}

export function triggerNuclearReload() {
  const kioskVideo = window.globals?.kioskVideo;
  if (kioskVideo) {
    nuclearVideoReload(kioskVideo);
  } else {
    console.error('[VIDEO] Cannot nuclear reload - video element not found');
  }
}

export function cleanupStartScreenListeners() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  
  if (window.boundStartSurvey && kioskStartScreen) {
    kioskStartScreen.removeEventListener('click', window.boundStartSurvey);
    kioskStartScreen.removeEventListener('touchstart', window.boundStartSurvey);
    window.boundStartSurvey = null;
  }
  
  if (videoPlaybackInterval) {
    clearInterval(videoPlaybackInterval);
    videoPlaybackInterval = null;
  }
  
  videoState.isPlaying = false;
  videoState.playAttempts = 0;
}

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

export { pauseVideo, resumeVideo };
