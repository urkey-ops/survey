// FILE: ui/navigation/videoPlayer.js
// PURPOSE: iOS-safe video playback with retry logic
// DEPENDENCIES: None
// VERSION: 2.1.0

const VIDEO_CONFIG = {
  VIDEO_DURATION: 5000,
  MAX_PLAY_ATTEMPTS: 3,
  PLAY_RETRY_DELAY: 1000
};

// Video state
export const videoState = {
  isPlaying: false,
  playAttempts: 0,
  lastPlayTime: 0,
  hasLoaded: false,
  currentSchedule: null
};

/**
 * Check if video is ready to play
 */
export function isVideoReady(video) {
  if (!video) return false;
  
  const hasData = video.readyState >= 3;
  const hasDuration = video.duration > 0 && !isNaN(video.duration);
  const hasSource = video.src || (video.currentSrc && video.currentSrc !== '');
  
  return hasData && hasDuration && hasSource;
}

/**
 * Force reload video source
 */
export function reloadVideoSource(video) {
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
 * Completely reconstruct video element
 */
export function nuclearVideoReload(video) {
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
 * Setup comprehensive video event listeners
 */
export function setupVideoEventListeners(video) {
  if (!video) return;
  
  // Remove old listeners
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
 * Play video with retry logic
 */
export async function playVideoOnce(video, isRetry = false) {
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
