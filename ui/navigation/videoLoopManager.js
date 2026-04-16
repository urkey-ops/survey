// FILE: ui/navigation/videoLoopManager.js
// PURPOSE: Manages video playback loop with time-based scheduling
// DEPENDENCIES: videoScheduler.js, videoPlayer.js
// VERSION: 3.1.0
// FIXES:
//   - clears both interval and sleep-mode timeout safely
//   - prevents duplicate setup/restart loops
//   - avoids stale schedule closures by recalculating on each cycle
//   - guards visibility/start-screen playback more defensively
//   - keeps muted inline playback settings aligned with autoplay best practice

import { getSmartVideoInterval, getScheduleDescription, getCurrentESTTime } from './videoScheduler.js';
import {
  videoState,
  setupVideoEventListeners,
  playVideoOnce,
  isVideoReady,
  reloadVideoSource
} from './videoPlayer.js';

// Active timers
let videoPlaybackInterval = null;
let sleepWakeTimeout = null;

// Re-entrancy / duplicate-loop guards
let loopGeneration = 0;
let listenersInitialized = false;

/**
 * Clear all managed timers for this module.
 */
function clearManagedTimers() {
  if (videoPlaybackInterval) {
    clearInterval(videoPlaybackInterval);
    videoPlaybackInterval = null;
  }

  if (sleepWakeTimeout) {
    clearTimeout(sleepWakeTimeout);
    sleepWakeTimeout = null;
  }
}

/**
 * Safe check: only play video on visible start screen.
 */
function shouldPlayOnStartScreen() {
  const kioskStartScreen = window.globals?.kioskStartScreen;
  return !!(
    kioskStartScreen &&
    !kioskStartScreen.classList.contains('hidden') &&
    !document.hidden
  );
}

/**
 * Calculate ms until next local EST 9:00 AM.
 */
function getMsUntilNext9amEST() {
  const now = new Date();
  const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  const next = new Date(estNow);
  next.setHours(9, 0, 0, 0);

  if (estNow.getTime() >= next.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - estNow.getTime();
}

/**
 * Setup time-based video playback loop
 * BATTERY OPTIMIZED: Checks visibility before playing
 */
export function setupVideoLoop(kioskVideo) {
  if (!kioskVideo) return;

  loopGeneration += 1;
  const currentGeneration = loopGeneration;

  clearManagedTimers();

  const interval = getSmartVideoInterval();
  const schedule = getScheduleDescription();

  console.log(`[VIDEO] 🕐 Current EST time: ${getCurrentESTTime()}`);
  console.log(`[VIDEO] 📊 Calculated interval: ${interval}ms (${interval ? interval / 1000 + 's' : 'DISABLED'})`);

  // Configure video for reliable muted inline playback
  kioskVideo.setAttribute('playsinline', '');
  kioskVideo.setAttribute('webkit-playsinline', '');
  kioskVideo.setAttribute('muted', 'muted');
  kioskVideo.muted = true;
  kioskVideo.loop = false;
  kioskVideo.preload = 'auto';

  if (!listenersInitialized) {
    setupVideoEventListeners(kioskVideo);
    listenersInitialized = true;
  }

  videoState.playAttempts = 0;
  videoState.isPlaying = false;
  videoState.currentSchedule = schedule;

  // Sleep mode - don't play video at all
  if (interval === null) {
    console.log('[VIDEO] 😴 SLEEP MODE - Video disabled until 9am');

    if (kioskVideo && !kioskVideo.paused) {
      kioskVideo.pause();
    }
    videoState.isPlaying = false;

    const msUntil9am = getMsUntilNext9amEST();
    const hoursUntilWake = Math.round(msUntil9am / 3600000);
    console.log(`[VIDEO] 🔋 Next check in ~${hoursUntilWake} hour(s)`);

    sleepWakeTimeout = setTimeout(() => {
      if (currentGeneration !== loopGeneration) return;

      if (shouldPlayOnStartScreen()) {
        console.log('[VIDEO] 🌅 Reached wake window, re-evaluating schedule');
        setupVideoLoop(kioskVideo);
      } else {
        console.log('[VIDEO] Wake window reached, but start screen is hidden; waiting for resume/visibility event');
      }
    }, msUntil9am + 60000); // 1 min buffer

    return;
  }

  console.log('[VIDEO] 🔋 Setting up SMART playback...');
  console.log(`[VIDEO] Schedule: ${schedule}`);
  console.log(`[VIDEO] Playing 5s every ${interval / 1000}s`);

  // Initial play attempt
  setTimeout(() => {
    if (currentGeneration !== loopGeneration) return;

    if (shouldPlayOnStartScreen()) {
      playVideoOnce(kioskVideo);
    } else {
      console.log('[VIDEO] Start screen hidden or page hidden, skipping initial playback');
    }
  }, 300);

  // Setup interval for periodic playback
  videoPlaybackInterval = setInterval(() => {
    if (currentGeneration !== loopGeneration) {
      clearManagedTimers();
      return;
    }

    if (document.hidden) {
      console.log('[VIDEO] 🔋 Page hidden, skipping playback (battery saving)');
      return;
    }

    const newInterval = getSmartVideoInterval();
    const newSchedule = getScheduleDescription();

    // Enter sleep mode
    if (newInterval === null) {
      console.log(`[VIDEO] 😴 Schedule changed: ${videoState.currentSchedule} → ${newSchedule}`);
      setupVideoLoop(kioskVideo);
      return;
    }

    // Schedule changed, rebuild loop with new cadence
    if (newInterval !== interval || newSchedule !== videoState.currentSchedule) {
      console.log(`[VIDEO] 🕐 Schedule changed: ${videoState.currentSchedule} → ${newSchedule}`);
      setupVideoLoop(kioskVideo);
      return;
    }

    if (shouldPlayOnStartScreen() && !videoState.isPlaying) {
      playVideoOnce(kioskVideo);
    }
  }, interval);

  console.log('[VIDEO] ✅ Smart time-based playback active (visibility-aware)');
}

/**
 * Pause video and clear interval/timeout
 * BATTERY OPTIMIZATION: Called when page hidden
 */
export function pauseVideo() {
  const kioskVideo = window.globals?.kioskVideo;

  clearManagedTimers();

  if (kioskVideo && !kioskVideo.paused) {
    kioskVideo.pause();
  }

  videoState.isPlaying = false;
  console.log('[VIDEO] ⏸️ Paused - Battery saving mode');
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

    clearManagedTimers();
    sleepWakeTimeout = setTimeout(() => {
      sleepWakeTimeout = null;
      setupVideoLoop(kioskVideo);
    }, 1000);

    return;
  }

  setupVideoLoop(kioskVideo);
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
export async function triggerNuclearReload() {
  const kioskVideo = window.globals?.kioskVideo;

  if (kioskVideo) {
    clearManagedTimers();
    const { nuclearVideoReload } = await import('./videoPlayer.js');
    nuclearVideoReload(kioskVideo);
  } else {
    console.error('[VIDEO] Cannot nuclear reload - video element not found');
  }
}

/**
 * Cleanup video loop
 * Call this when navigating away from start screen
 */
export function cleanupVideoLoop() {
  clearManagedTimers();

  const kioskVideo = window.globals?.kioskVideo;
  if (kioskVideo && !kioskVideo.paused) {
    kioskVideo.pause();
  }

  videoState.isPlaying = false;
  console.log('[VIDEO] Loop cleaned up');
}
