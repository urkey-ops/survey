// FILE: ui/navigation/videoLoopManager.js
// PURPOSE: Manages video playback loop with time-based scheduling
// DEPENDENCIES: videoScheduler.js, videoPlayer.js
// VERSION: 2.1.0

import { getSmartVideoInterval, getScheduleDescription, getCurrentESTTime } from './videoScheduler.js';
import { 
  videoState, 
  setupVideoEventListeners, 
  playVideoOnce, 
  isVideoReady, 
  reloadVideoSource 
} from './videoPlayer.js';

// Store video interval timer
let videoPlaybackInterval = null;

/**
 * Setup time-based video playback loop
 */
export function setupVideoLoop(kioskVideo) {
  if (!kioskVideo) return;
  
  const interval = getSmartVideoInterval();
  const schedule = getScheduleDescription();
  
  console.log(`[VIDEO] 🕐 Current EST time: ${getCurrentESTTime()}`);
  console.log(`[VIDEO] 📊 Calculated interval: ${interval}ms (${interval ? interval/1000 + 's' : 'DISABLED'})`);
  
  // Sleep mode - don't play video at all
  if (interval === null) {
    console.log('[VIDEO] 😴 SLEEP MODE - Video disabled until 9am');
    console.log('[VIDEO] 🔋 Maximum battery savings active');
    
    if (videoPlaybackInterval) {
      clearInterval(videoPlaybackInterval);
      videoPlaybackInterval = null;
    }
    
    // Check again in 5 minutes
    setTimeout(() => {
      const kioskStartScreen = window.globals?.kioskStartScreen;
      if (kioskStartScreen && !kioskStartScreen.classList.contains('hidden')) {
        setupVideoLoop(kioskVideo);
      }
    }, 300000);
    
    return;
  }
  
  console.log('[VIDEO] 🔋 Setting up SMART playback...');
  console.log(`[VIDEO] Schedule: ${schedule}`);
  console.log(`[VIDEO] Playing 5s every ${interval / 1000}s`);
  
  // Configure video
  kioskVideo.setAttribute('playsinline', '');
  kioskVideo.setAttribute('webkit-playsinline', '');
  kioskVideo.setAttribute('muted', 'muted');
  kioskVideo.muted = true;
  kioskVideo.loop = false;
  kioskVideo.preload = 'auto';
  
  setupVideoEventListeners(kioskVideo);
  
  // Clear existing interval
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
    const newInterval = getSmartVideoInterval();
    const newSchedule = getScheduleDescription();
    
    if (newInterval !== interval || newSchedule !== videoState.currentSchedule) {
      console.log(`[VIDEO] 🕐 Schedule changed: ${videoState.currentSchedule} → ${newSchedule}`);
      clearInterval(videoPlaybackInterval);
      setupVideoLoop(kioskVideo);
      return;
    }
    
    // Only play if on start screen, not playing, and not in sleep mode
    if (kioskStartScreen && 
        !kioskStartScreen.classList.contains('hidden') && 
        !videoState.isPlaying &&
        newInterval !== null) {
      playVideoOnce(kioskVideo);
    }
  }, interval);
  
  console.log('[VIDEO] ✅ Smart time-based playback active');
}

/**
 * Pause video and clear interval
 */
export function pauseVideo() {
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

/**
 * Resume video playback
 */
export function resumeVideo() {
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

/**
 * Handle app visibility changes
 */
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

/**
 * Trigger nuclear reload from external module
 */
export function triggerNuclearReload() {
  const kioskVideo = window.globals?.kioskVideo;
  if (kioskVideo) {
    const { nuclearVideoReload } = await import('./videoPlayer.js');
    nuclearVideoReload(kioskVideo);
  } else {
    console.error('[VIDEO] Cannot nuclear reload - video element not found');
  }
}
