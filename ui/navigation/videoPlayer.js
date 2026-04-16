// FILE: ui/navigation/videoPlayer.js
// PURPOSE: iOS-safe video playback with retry logic
// DEPENDENCIES: None
// VERSION: 3.2.0 - Battery optimized, bounded retry logic, safer listener cleanup

const VIDEO_CONFIG = {
  VIDEO_DURATION: 5000,
  MAX_PLAY_ATTEMPTS: 3,
  PLAY_RETRY_DELAY: 1000,
  READY_TIMEOUT: 5000,
  RELOAD_DELAY: 1000,
  REBUILD_PLAY_DELAY: 500,
  REBUILD_LISTENER_DELAY: 200,
  SRC_RESET_DELAY: 100,
  STALL_RECOVERY_DELAY: 500
};

const ERROR_RETRY_CONFIG = {
  MAX_ERROR_RETRIES: 3,
  ERROR_RETRY_WINDOW: 30000
};

export const videoState = {
  isPlaying: false,
  playAttempts: 0,
  lastPlayTime: 0,
  hasLoaded: false,
  currentSchedule: null,
  errorCount: 0,
  lastErrorTime: 0
};

/**
 * Internal timer handles for cleanup.
 */
const videoTimers = {
  reloadTimer: null,
  stallRecoveryTimer: null,
  rebuildListenerTimer: null,
  rebuildPlayTimer: null,
  safetyPauseTimer: null
};

function clearVideoTimer(key) {
  if (videoTimers[key]) {
    clearTimeout(videoTimers[key]);
    videoTimers[key] = null;
  }
}

function clearAllVideoTimers() {
  Object.keys(videoTimers).forEach(clearVideoTimer);
}

/**
 * Remove all managed event listeners from a video element.
 */
function cleanupVideoEventListeners(video) {
  if (!video) return;

  const eventTypes = [
    'ended',
    'error',
    'canplaythrough',
    'loadedmetadata',
    'stalled',
    'suspend'
  ];

  eventTypes.forEach((type) => {
    const handler = video[`_${type}Handler`];
    if (handler) {
      video.removeEventListener(type, handler);
      delete video[`_${type}Handler`];
    }
  });
}

/**
 * Reset transient playback state.
 */
function resetPlaybackFlags() {
  videoState.isPlaying = false;
  videoState.hasLoaded = false;
}

/**
 * Check if video is ready to play.
 * readyState >= 3 corresponds to HAVE_FUTURE_DATA, which indicates data
 * is available for the current position and a little into the future.[web:273]
 */
export function isVideoReady(video) {
  if (!video) return false;

  const hasData = video.readyState >= 3;
  const hasDuration = Number.isFinite(video.duration) && video.duration > 0;
  const hasSource = !!(video.currentSrc || video.src || video.querySelector('source')?.src);

  return hasData && hasDuration && hasSource;
}

/**
 * Wait for video readiness using media events instead of polling.
 * canplaythrough is intended to signal that the browser estimates playback
 * can continue to the end without buffering.[web:269]
 */
function waitForVideoReady(video, timeout = VIDEO_CONFIG.READY_TIMEOUT) {
  return new Promise((resolve, reject) => {
    if (!video) {
      reject(new Error('Video element missing'));
      return;
    }

    if (isVideoReady(video)) {
      resolve(true);
      return;
    }

    let timeoutId = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      video.removeEventListener('canplaythrough', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
    };

    const onReady = () => {
      if (!video?.isConnected) {
        cleanup();
        reject(new Error('Video element disconnected during readiness wait'));
        return;
      }

      if (isVideoReady(video)) {
        cleanup();
        videoState.errorCount = 0;
        videoState.lastErrorTime = 0;
        resolve(true);
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error('Video errored while waiting for readiness'));
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Video ready timeout'));
    }, timeout);

    video.addEventListener('canplaythrough', onReady, { once: true });
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });

    console.log('[VIDEO] Waiting for ready events...');
  });
}

/**
 * Force reload video source.
 */
export function reloadVideoSource(video) {
  if (!video) return;

  clearVideoTimer('reloadTimer');
  clearVideoTimer('stallRecoveryTimer');
  clearVideoTimer('safetyPauseTimer');

  console.log('[VIDEO] 🔄 Reloading video source...');

  const sourceEl = video.querySelector('source');
  const currentSrc = video.currentSrc || video.src || sourceEl?.src;

  resetPlaybackFlags();

  if (currentSrc) {
    video.pause();

    if (sourceEl?.src) {
      sourceEl.src = '';
    }
    video.src = '';
    video.load();

    videoTimers.reloadTimer = setTimeout(() => {
      if (!video.isConnected) return;

      if (sourceEl) {
        sourceEl.src = currentSrc;
      } else {
        video.src = currentSrc;
      }

      video.load();
      console.log('[VIDEO] Source reloaded');
      videoTimers.reloadTimer = null;
    }, VIDEO_CONFIG.SRC_RESET_DELAY);
  } else {
    console.error('[VIDEO] 💥 Video source lost - attempting nuclear reload');
    nuclearVideoReload(video);
  }
}

/**
 * Completely reconstruct video element.
 */
export function nuclearVideoReload(video) {
  if (!video) return;

  console.log('[VIDEO] ☢️ Nuclear reload - reconstructing video element');

  const parent = video.parentElement;
  if (!parent) {
    console.error('[VIDEO] Cannot nuclear reload - parent element missing');
    return;
  }

  clearAllVideoTimers();
  cleanupVideoEventListeners(video);
  resetPlaybackFlags();

  const videoId = video.id;
  const videoClasses = video.className;
  const existingSource = video.querySelector('source')?.src;
  const existingSrc = video.currentSrc || video.src || existingSource || 'asset/video/1.mp4';

  video.pause();
  video.remove();

  const newVideo = document.createElement('video');
  newVideo.id = videoId;
  newVideo.className = videoClasses;
  newVideo.setAttribute('autoplay', '');
  newVideo.setAttribute('muted', 'muted');
  newVideo.setAttribute('playsinline', '');
  newVideo.setAttribute('webkit-playsinline', '');
  newVideo.setAttribute('preload', 'auto');
  newVideo.setAttribute('disableRemotePlayback', '');
  newVideo.setAttribute('x-webkit-airplay', 'deny');
  newVideo.muted = true;
  newVideo.loop = false;

  const source = document.createElement('source');
  source.src = existingSrc;
  source.type = 'video/mp4';
  newVideo.appendChild(source);

  if (parent.children.length > 1) {
    parent.insertBefore(newVideo, parent.children[1]);
  } else {
    parent.appendChild(newVideo);
  }

  if (window.globals) {
    window.globals.kioskVideo = newVideo;
  }

  newVideo.load();
  console.log('[VIDEO] ✅ Video element reconstructed');

  videoTimers.rebuildListenerTimer = setTimeout(() => {
    if (!newVideo.isConnected) return;

    setupVideoEventListeners(newVideo);
    videoTimers.rebuildListenerTimer = null;

    videoTimers.rebuildPlayTimer = setTimeout(() => {
      if (!newVideo.isConnected) return;
      playVideoOnce(newVideo);
      videoTimers.rebuildPlayTimer = null;
    }, VIDEO_CONFIG.REBUILD_PLAY_DELAY);
  }, VIDEO_CONFIG.REBUILD_LISTENER_DELAY);
}

/**
 * Optional external cleanup if another module wants hard reset behavior.
 */
export function cleanupVideoPlayer(video) {
  clearAllVideoTimers();
  cleanupVideoEventListeners(video);
  resetPlaybackFlags();
}

/**
 * Setup comprehensive video event listeners.
 */
export function setupVideoEventListeners(video) {
  if (!video) return;

  cleanupVideoEventListeners(video);

  const endedHandler = () => {
    console.log('[VIDEO] 📺 Video ended naturally');
    clearVideoTimer('safetyPauseTimer');
    videoState.isPlaying = false;
    video.pause();
    video.currentTime = 0;
  };
  video.addEventListener('ended', endedHandler);
  video._endedHandler = endedHandler;

  const errorHandler = (e) => {
    console.error('[VIDEO] ❌ Error:', e);
    resetPlaybackFlags();

    const now = Date.now();
    const { MAX_ERROR_RETRIES, ERROR_RETRY_WINDOW } = ERROR_RETRY_CONFIG;

    if (now - videoState.lastErrorTime > ERROR_RETRY_WINDOW) {
      videoState.errorCount = 0;
    }

    videoState.lastErrorTime = now;
    videoState.errorCount += 1;

    if (video.error) {
      console.log('[VIDEO] Error code:', video.error.code);
    }

    if (videoState.errorCount > MAX_ERROR_RETRIES) {
      console.warn('[VIDEO] 🚫 Max error retries reached, stopping auto reload');
      return;
    }

    clearVideoTimer('reloadTimer');
    videoTimers.reloadTimer = setTimeout(() => {
      if (!video.isConnected) return;
      reloadVideoSource(video);
      videoTimers.reloadTimer = null;
    }, VIDEO_CONFIG.RELOAD_DELAY);
  };
  video.addEventListener('error', errorHandler);
  video._errorHandler = errorHandler;

  const canPlayHandler = () => {
    console.log('[VIDEO] ✅ Can play through');
    videoState.hasLoaded = true;
    videoState.errorCount = 0;
    videoState.lastErrorTime = 0;
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

    if (!videoState.isPlaying) return;

    clearVideoTimer('stallRecoveryTimer');
    videoTimers.stallRecoveryTimer = setTimeout(() => {
      if (!video.isConnected) return;

      if (video.paused && videoState.isPlaying) {
        console.log('[VIDEO] Attempting recovery from stall...');
        playVideoOnce(video, true);
      }
      videoTimers.stallRecoveryTimer = null;
    }, VIDEO_CONFIG.STALL_RECOVERY_DELAY);
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
 * Play video with retry logic.
 * HTMLMediaElement.play() returns a Promise, which resolves on successful
 * playback start and rejects on failure.[web:272]
 */
export async function playVideoOnce(video, isRetry = false) {
  if (!video || !video.isConnected) return false;

  if (videoState.isPlaying) {
    console.log('[VIDEO] Already playing, skipping...');
    return false;
  }

  if (!isVideoReady(video)) {
    console.warn('[VIDEO] Video not ready, waiting for events...');

    try {
      await waitForVideoReady(video);
      console.log('[VIDEO] Video ready, playing...');
    } catch (error) {
      console.error('[VIDEO] Failed waiting for ready:', error.message);
      reloadVideoSource(video);
      return false;
    }
  }

  if (!video.isConnected) return false;

  video.currentTime = 0;
  videoState.isPlaying = true;
  videoState.lastPlayTime = Date.now();

  try {
    const playPromise = video.play();

    if (playPromise !== undefined) {
      await playPromise;
    }

    console.log('[VIDEO] ▶️ Playing 5-second clip...');
    videoState.playAttempts = 0;

    clearVideoTimer('safetyPauseTimer');
    videoTimers.safetyPauseTimer = setTimeout(() => {
      if (video.isConnected && !video.paused && videoState.isPlaying) {
        console.log('[VIDEO] ⏸️ Safety pause triggered');
        video.pause();
        videoState.isPlaying = false;
      }
      videoTimers.safetyPauseTimer = null;
    }, VIDEO_CONFIG.VIDEO_DURATION + 500);

    return true;
  } catch (error) {
    console.error('[VIDEO] Play failed:', error.message);
    videoState.isPlaying = false;
    videoState.playAttempts += 1;

    if (videoState.playAttempts < VIDEO_CONFIG.MAX_PLAY_ATTEMPTS) {
      console.log(
        `[VIDEO] Retrying... (${videoState.playAttempts}/${VIDEO_CONFIG.MAX_PLAY_ATTEMPTS})`
      );

      await new Promise((resolve) => setTimeout(resolve, VIDEO_CONFIG.PLAY_RETRY_DELAY));

      if (!video.isConnected) return false;
      return playVideoOnce(video, true);
    }

    console.error('[VIDEO] Max retry attempts reached, reloading source...');
    reloadVideoSource(video);
    videoState.playAttempts = 0;
    return false;
  }
}
