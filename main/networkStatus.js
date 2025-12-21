// FILE: main/networkStatus.js
// PURPOSE: Network status monitoring with offline-first approach
// DEPENDENCIES: window.CONSTANTS, window.dataHandlers, window.globals

let isCurrentlyOnline = navigator.onLine;
let syncInProgress = false;

/**
 * Handle online event - connection restored
 */
function handleOnline() {
    const CONSTANTS = window.CONSTANTS;
    const dataHandlers = window.dataHandlers;
    const syncStatusMessage = window.globals?.syncStatusMessage;
    
    isCurrentlyOnline = true;
    console.log('[NETWORK] ✅ Connection restored');
    
    // User-facing feedback
    if (syncStatusMessage) {
        syncStatusMessage.textContent = '✅ Back online. Syncing queued data...';
        syncStatusMessage.style.color = '#16a34a'; // green-600
    }
    
    // Trigger sync after short delay (avoid immediate rush)
    if (!syncInProgress) {
        syncInProgress = true;
        setTimeout(async () => {
            try {
                await dataHandlers.syncData(false);
                
                if (syncStatusMessage) {
                    syncStatusMessage.textContent = '✅ All data synced';
                    setTimeout(() => {
                        syncStatusMessage.textContent = '';
                    }, CONSTANTS.STATUS_MESSAGE_AUTO_CLEAR_MS || 3000);
                }
            } catch (error) {
                console.error('[NETWORK] Sync failed:', error);
                if (syncStatusMessage) {
                    syncStatusMessage.textContent = '⚠️ Sync incomplete - will retry';
                }
            } finally {
                syncInProgress = false;
            }
        }, 1000);
    }
}

/**
 * Handle offline event - connection lost
 */
function handleOffline() {
    const syncStatusMessage = window.globals?.syncStatusMessage;
    
    isCurrentlyOnline = false;
    console.log('[NETWORK] ❌ Connection lost - Operating in OFFLINE mode');
    
    // User-facing feedback
    if (syncStatusMessage) {
        syncStatusMessage.textContent = '📱 Offline mode - All data saved locally';
        syncStatusMessage.style.color = '#ea580c'; // orange-600
    }
    
    // DISABLED: Visual offline indicator removed
    // showOfflineIndicator();
}

/**
 * Show persistent offline indicator - DISABLED
 */
function showOfflineIndicator() {
    // DISABLED: No visual indicator will be shown
    console.log('[NETWORK] Offline indicator disabled - running silently');
    return;
    
    /* ORIGINAL CODE KEPT FOR REFERENCE - COMMENTED OUT
    // Check if indicator already exists
    let indicator = document.getElementById('offline-indicator');
    
    if (!indicator && !isCurrentlyOnline) {
        indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #ea580c;
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 9999;
            animation: fadeIn 0.3s ease-in;
        `;
        indicator.textContent = '📱 Offline Mode';
        document.body.appendChild(indicator);
    }
    */
}

/**
 * Hide offline indicator
 */
function hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => indicator.remove(), 300);
    }
}

/**
 * Check initial network status and update UI
 */
function checkInitialStatus() {
    const syncStatusMessage = window.globals?.syncStatusMessage;
    
    if (!navigator.onLine) {
        isCurrentlyOnline = false;
        if (syncStatusMessage) {
            syncStatusMessage.textContent = '📱 Starting in offline mode';
            syncStatusMessage.style.color = '#ea580c';
        }
        // DISABLED: No visual indicator
        // showOfflineIndicator();
        console.log('[NETWORK] ⚠️ Starting in OFFLINE mode');
    } else {
        isCurrentlyOnline = true;
        console.log('[NETWORK] ✅ Starting in ONLINE mode');
        
        // Check if there's queued data to sync
        setTimeout(() => {
            const queueLength = window.localStorage.getItem('surveyQueue');
            if (queueLength) {
                try {
                    const queue = JSON.parse(queueLength);
                    if (queue.length > 0) {
                        console.log(`[NETWORK] Found ${queue.length} queued surveys - will sync`);
                        if (window.dataHandlers?.syncData) {
                            window.dataHandlers.syncData(false);
                        }
                    }
                } catch (e) {
                    console.error('[NETWORK] Error checking queue:', e);
                }
            }
        }, 2000);
    }
}

/**
 * Setup network status monitoring with offline-first approach
 */
export function setupNetworkMonitoring() {
    console.log('[NETWORK] 🚀 Initializing OFFLINE-FIRST monitoring');
    
    // Check initial status
    checkInitialStatus();
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
        handleOnline();
        hideOfflineIndicator();
    });
    
    window.addEventListener('offline', handleOffline);
    
    // Monitor visibility changes (app coming to foreground)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('[NETWORK] App visible - checking connection');
            
            // Recheck online status
            const wasOnline = isCurrentlyOnline;
            isCurrentlyOnline = navigator.onLine;
            
            if (isCurrentlyOnline && !wasOnline) {
                handleOnline();
                hideOfflineIndicator();
            } else if (!isCurrentlyOnline && wasOnline) {
                handleOffline();
            }
            
            // Auto-sync if online and not already syncing
            if (isCurrentlyOnline && !syncInProgress && window.dataHandlers?.syncData) {
                setTimeout(() => {
                    window.dataHandlers.syncData(false);
                }, 500);
            }
        }
    });
    
    // Periodic connection check (every 30 seconds when online)
    setInterval(() => {
        if (navigator.onLine && !isCurrentlyOnline) {
            console.log('[NETWORK] Connection restored (periodic check)');
            handleOnline();
            hideOfflineIndicator();
        } else if (!navigator.onLine && isCurrentlyOnline) {
            console.log('[NETWORK] Connection lost (periodic check)');
            handleOffline();
        }
    }, 30000);
    
    // Listen for service worker messages
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.type === 'BACKGROUND_SYNC') {
                console.log('[NETWORK] Background sync triggered by SW');
                if (window.dataHandlers?.syncData) {
                    window.dataHandlers.syncData(false);
                }
            }
        });
    }
    
    console.log('[NETWORK] ✅ OFFLINE-FIRST monitoring active');
}

/**
 * Get current network status
 * @returns {boolean} True if online
 */
export function isOnline() {
    return isCurrentlyOnline;
}

/**
 * Force sync attempt (called by user action)
 */
export async function forceSyncAttempt() {
    if (!isCurrentlyOnline) {
        console.log('[NETWORK] Cannot sync - offline');
        return false;
    }
    
    if (syncInProgress) {
        console.log('[NETWORK] Sync already in progress');
        return false;
    }
    
    try {
        syncInProgress = true;
        await window.dataHandlers.syncData(false);
        return true;
    } catch (error) {
        console.error('[NETWORK] Force sync failed:', error);
        return false;
    } finally {
        syncInProgress = false;
    }
}

/**
 * Get network status with details
 */
export function getNetworkStatus() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    return {
        online: isCurrentlyOnline,
        effectiveType: connection?.effectiveType || 'unknown',
        downlink: connection?.downlink || null,
        rtt: connection?.rtt || null,
        saveData: connection?.saveData || false
    };
}

export default {
    setupNetworkMonitoring,
    handleOnline,
    handleOffline,
    checkInitialStatus,
    isOnline,
    forceSyncAttempt,
    getNetworkStatus
};
