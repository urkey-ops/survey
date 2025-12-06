// FILE: main/networkStatus.js
// PURPOSE: Network status monitoring and sync triggers
// DEPENDENCIES: window.CONSTANTS, window.dataHandlers, window.globals

/**
 * Handle online event - connection restored
 */
function handleOnline() {
    const CONSTANTS = window.CONSTANTS;
    const dataHandlers = window.dataHandlers;
    const syncStatusMessage = window.globals?.syncStatusMessage;
    
    console.log('[NETWORK] ✅ Connection restored');
    
    // User-facing feedback
    if (syncStatusMessage) {
        syncStatusMessage.textContent = '✅ Connection restored. Syncing...';
        syncStatusMessage.style.color = '#16a34a'; // green-600
        setTimeout(() => {
            syncStatusMessage.textContent = '';
        }, CONSTANTS.STATUS_MESSAGE_AUTO_CLEAR_MS);
    }
    
    // Attempt sync after short delay
    setTimeout(() => {
        dataHandlers.syncData(false);
    }, 1000);
}

/**
 * Handle offline event - connection lost
 */
function handleOffline() {
    const syncStatusMessage = window.globals?.syncStatusMessage;
    
    console.log('[NETWORK] ❌ Connection lost - Operating in offline mode');
    
    // User-facing feedback
    if (syncStatusMessage) {
        syncStatusMessage.textContent = '⚠️ Offline mode - Data saved locally';
        syncStatusMessage.style.color = '#ea580c'; // orange-600
    }
}

/**
 * Setup network status monitoring
 */
export function setupNetworkMonitoring() {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    console.log('[NETWORK] ✅ Network monitoring active');
}

export default {
    setupNetworkMonitoring,
    handleOnline,
    handleOffline
};
