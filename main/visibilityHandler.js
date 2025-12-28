// FILE: main/visibilityHandler.js
// PURPOSE: Handle visibility change events (tab switching, minimizing, iPad sleep)
// DEPENDENCIES: window.CONSTANTS, window.appState, window.uiHandlers
// FIX: Integrated video state management for iPad PWA

let visibilityTimeout = null;

/**
 * Handle visibility change events
 * NOW INCLUDES: Video state recovery for iPad PWA
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
function handleVideoOnHidden() {
    // Dynamically import to avoid circular dependencies
    import('../ui/navigation/startScreen.js').then(module => {
        if (module.handleVideoVisibilityChange) {
            module.handleVideoVisibilityChange(false);
        }
    }).catch(err => {
        console.warn('[VISIBILITY] Could not handle video on hidden:', err);
    });
}

/**
 * Handle video when app becomes visible
 * Called when iPad wakes, app restored, or tab focused
 * CRITICAL for fixing video loop issues on iPad
 */
function handleVideoOnVisible() {
    // Dynamically import to avoid circular dependencies
    import('../ui/navigation/startScreen.js').then(module => {
        if (module.handleVideoVisibilityChange) {
            module.handleVideoVisibilityChange(true);
        }
    }).catch(err => {
        console.warn('[VISIBILITY] Could not handle video on visible:', err);
    });
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
function checkVideoHealthAfterBatteryDeath() {
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
        import('../ui/navigation/startScreen.js').then(module => {
            if (module.triggerNuclearReload) {
                module.triggerNuclearReload();
            }
        });
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
    
    console.log('[VISIBILITY] ✅ Visibility handlers active (iOS-enhanced)');
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
    
    console.log('[VISIBILITY] Handlers cleaned up');
}

export default {
    setupVisibilityHandler,
    cleanupVisibilityHandler
};
