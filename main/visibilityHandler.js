// FILE: main/visibilityHandler.js
// PURPOSE: Handle visibility change events (tab switching, minimizing)
// DEPENDENCIES: window.CONSTANTS, window.appState, window.uiHandlers

let visibilityTimeout = null;

/**
 * Handle visibility change events
 */
function handleVisibilityChange() {
    const CONSTANTS = window.CONSTANTS;
    const appState = window.appState;
    const uiHandlers = window.uiHandlers;
    
    if (document.hidden) {
        console.log('[VISIBILITY] Document hidden - starting pause timer');
        visibilityTimeout = setTimeout(() => {
            console.log('[VISIBILITY] Kiosk hidden for 5s+ - pausing timers');
            window.isKioskVisible = false;
            uiHandlers.clearAllTimers();
        }, CONSTANTS.VISIBILITY_CHANGE_DELAY_MS);
    } else {
        clearTimeout(visibilityTimeout);
        
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
 * Setup visibility change handler
 */
export function setupVisibilityHandler() {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    console.log('[VISIBILITY] ✅ Visibility change handler active');
}

/**
 * Clean up visibility handler
 */
export function cleanupVisibilityHandler() {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
        visibilityTimeout = null;
    }
}

export default {
    setupVisibilityHandler,
    cleanupVisibilityHandler
};
