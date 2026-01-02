// FILE: main/visibilityHandler.js
// PURPOSE: Handle visibility change events (tab switching, minimizing, iPad sleep)
// DEPENDENCIES: window.CONSTANTS, window.appState, window.uiHandlers
// VERSION: 2.0.0 - Battery optimized (cached imports)

let visibilityTimeout = null;
let startScreenModule = null; // Cache the imported module

/**
 * Get startScreen module (cached)
 * BATTERY OPTIMIZATION: Import once, reuse many times
 */
async function getStartScreenModule() {
  if (!startScreenModule) {
    try {
      startScreenModule = await import('../ui/navigation/startScreen.js');
    } catch (err) {
      console.warn('[VISIBILITY] Could not import startScreen module:', err);
      return null;
    }
  }
  return startScreenModule;
}

/**
 * Handle visibility change events
 * NOW INCLUDES: Video state management for iPad PWA
 */
function handleVisibilityChange() {
    const CONSTANTS = window.CONSTANTS;
    const appState = window.appState;
    const uiHandlers = window.uiHandlers;
    
    if (document.hidden) {
        console.log('[VISIBILITY] Document hidden - starting pause timer');
        
        // Pause video immediately when hidden (battery saving)
        handleVideoOnHidden();
        
        visibilityTimeout = setTimeout(() => {
            console.log('[VISIBILITY] Kiosk hidden for 5s+ - pausing timers');
            window.isKioskVisible = false;
            uiHandlers.clearAllTimers();
        }, CONSTANTS.VISIBILITY_CHANGE_DELAY_MS);
    } else {
        console.log('[VISIBILITY] Document visible - resuming');
        clearTimeout(visibilityTimeout);
        
        // Resume video when visible (if on start screen)
        handleVideoOnVisible();
        
        if (!window.isKioskVisible) {
            console.log('[VISIBILITY] Kiosk visible - resuming timers');
            window.isKioskVisible = true;
            
            if (appState.currentQuestionIndex > 0) {
                uiHandlers.resetInactivityTimer();
            } else {
                uiHandlers.startPeriodicSync();
            }
        }
    }
}

/**
 * Handle video when app becomes hidden
 * Called when iPad sleeps, app minimized, or tab switched
 */
async function handleVideoOnHidden() {
    const module = await getStartScreenModule();
    if (module && module.handleVideoVisibilityChange) {
        module.handleVideoVisibilityChange(false);
    }
}

/**
 * Handle video when app becomes visible
 * Called when iPad wakes, app restored, or tab focused
 * CRITICAL for fixing video loop issues on iPad
 */
async function handleVideoOnVisible() {
    const module = await getStartScreenModule();
    if (module && module.handleVideoVisibilityChange) {
        module.handleVideoVisibilityChange(true);
    }
}

/**
 * iOS-specific: Handle page show event
 * This fires when page is restored from back/forward cache (bfcache)
 * Common on iOS when returning to PWA
 */
function handlePageShow(event) {
    if (event.persisted) {
        console.log('[VISIBILITY] Page restored from cache (iOS bfcache)');
        
        // Video likely needs recovery after cache restore
        handleVideoOnVisible();
        
        // Reset visibility state
        if (document.hidden) {
            window.isKioskVisible = false;
        } else {
            window.isKioskVisible = true;
        }
    } else {
        // Page loaded fresh (not from cache)
        // This happens after iPad battery death + restart
        console.log('[VISIBILITY] 🔋 Fresh page load detected (possible battery death recovery)');
        
        // Give iPad time to fully wake up, then check video
        setTimeout(() => {
            checkVideoHealthAfterBatteryDeath();
        }, 2000);
    }
}

/**
 * Check video health after potential battery death
 * iPad battery death causes aggressive cache clearing
 */
async function checkVideoHealthAfterBatteryDeath() {
    const kioskVideo = window.globals?.kioskVideo;
    const kioskStartScreen = window.globals?.kioskStartScreen;
    
    // Only check if on start screen
    if (!kioskStartScreen || kioskStartScreen.classList.contains('hidden')) {
        return;
    }
    
    if (!kioskVideo) {
        console.error('[VISIBILITY] ⚠️ Video element missing after page load');
        return;
    }
    
    // Check if video is in a broken state
    const hasSrc = kioskVideo.src || kioskVideo.currentSrc;
    const hasValidState = kioskVideo.readyState > 0;
    const hasSource = kioskVideo.querySelector('source');
    
    if (!hasSrc && !hasSource) {
        console.error('[VISIBILITY] 💥 Video completely corrupted - triggering nuclear reload');
        
        // Import and trigger nuclear reload
        const module = await getStartScreenModule();
        if (module && module.triggerNuclearReload) {
            module.triggerNuclearReload();
        }
    } else if (!hasValidState) {
        console.warn('[VISIBILITY] ⚠️ Video in invalid state - forcing reload');
        handleVideoOnVisible();
    } else {
        console.log('[VISIBILITY] ✅ Video health check passed');
    }
}

/**
 * iOS-specific: Handle focus event
 * Sometimes visibilitychange doesn't fire on iOS
 */
function handleFocus() {
    if (!document.hidden && !window.isKioskVisible) {
        console.log('[VISIBILITY] Focus gained, forcing visibility check');
        handleVisibilityChange();
    }
}

/**
 * Setup visibility change handler
 * NOW INCLUDES: iOS-specific event handlers
 */
export function setupVisibilityHandler() {
    // Standard visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // iOS-specific handlers
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleFocus);
    
    console.log('[VISIBILITY] ✅ Visibility handlers active (iOS-enhanced, battery optimized)');
}

/**
 * Clean up visibility handler
 */
export function cleanupVisibilityHandler() {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pageshow', handlePageShow);
    window.removeEventListener('focus', handleFocus);
    
    if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
        visibilityTimeout = null;
    }
    
    // Clear cached module
    startScreenModule = null;
    
    console.log('[VISIBILITY] Handlers cleaned up');
}

export default {
    setupVisibilityHandler,
    cleanupVisibilityHandler
};
