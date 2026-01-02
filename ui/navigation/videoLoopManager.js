// FILE: ui/navigation/videoLoopManager.js
// PURPOSE: Manages video playback loop with time-based scheduling
// DEPENDENCIES: videoScheduler.js, videoPlayer.js
// VERSION: 3.0.0 - Battery optimized (visibility-aware)

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
 * BATTERY OPTIMIZED: Checks visibility before playing
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
    
    if (videoPlaybackInterval) {
      clearInterval(videoPlaybackInterval);
      videoPlaybackInterval = null;
    }
    
    // Calculate time until 9am instead of checking every 5 min
    const now = new Date();
    const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const currentMinutes = estTime.getHours() * 60 + estTime.getMinutes();
    const morningStart = 9 * 60;
    
    // Calculate minutes until 9am
    let minutesUntil9am;
    if (currentMinutes < morningStart) {
      minutesUntil9am = morningStart - currentMinutes;
    } else {
      minutesUntil9am = (24 * 60) - currentMinutes + morningStart;
    }
    
    const msUntil9am = minutesUntil9am * 60 * 1000;
    console.log(`[VIDEO] 🔋 Next check in ${Math.round(minutesUntil9am / 60)} hours`);
    
    // Only check once when we hit 9am
    setTimeout(() => {
      const kioskStartScreen = window.globals?.kioskStartScreen;
      if (kioskStartScreen && !kioskStartScreen.classList.contains('hidden')) {
        setupVideoLoop(kioskVideo);
      }
    }, msUntil9am + 60000); // Add 1 min buffer
    
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
  
  // Play immediately (only if visible)
  setTimeout(() => {
    if (!document.hidden) {
      playVideoOnce(kioskVideo);
    } else {
      console.log('[VIDEO] Page hidden, skipping initial playback');
    }
  }, 300);
  
  // Setup interval for periodic playback
  videoPlaybackInterval = setInterval(() => {
    // BATTERY OPTIMIZATION: Skip if page is hidden
    if (document.hidden) {
      console.log('[VIDEO] 🔋 Page hidden, skipping playback (battery saving)');
      return;
    }
    
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
  
  console.log('[VIDEO] ✅ Smart time-based playback active (visibility-aware)');
}

/**
 * Pause video and clear interval
 * BATTERY OPTIMIZATION: Called when page hidden
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
 * BATTERY OPTIMIZATION: Pause when hidden, resume when visible
 */
export function handleVideoVisibilityChange(isVisible) {
