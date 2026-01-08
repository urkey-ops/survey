// FILE: main/networkStatus.js
// PURPOSE: Network status monitoring with offline-first approach
// DEPENDENCIES: window.CONSTANTS, window.dataHandlers, window.globals
// VERSION: 2.2.0 - Battery optimized + analytics sync + retry/backoff + race condition fix

let isCurrentlyOnline = navigator.onLine;
let syncInProgress = false;
let networkCheckIntervalId = null;
let retryAttempts = {}; // NEW: Per-sync-type retry tracking

// NEW: Retry backoff configuration
const RETRY_CONFIG = {
    maxAttempts: 5,
    baseDelayMs: 2000,
    maxDelayMs: 60000 // 1 minute
};

/**
 * Get retry delay with exponential backoff
 */
function getRetryDelay(type, attempt) {
    const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
        RETRY_CONFIG.maxDelayMs
    );
    return delay + Math.random() * 1000; // jitter
}

/**
 * Reset retry count for a sync type
 */
function resetRetryCount(type) {
    retryAttempts[type] = 0;
}

/**
 * Should retry this sync type?
 */
function shouldRetry(type) {
    const attempts = retryAttempts[type] || 0;
    return attempts < RETRY_CONFIG.maxAttempts;
}

/**
 * Record retry attempt
 */
function recordRetry(type) {
    retryAttempts[type] = (retryAttempts[type] || 0) + 1;
}

/**
 * Handle online event - connection restored
 */
function handleOnline() {
    const CONSTANTS = window.CONSTANTS;
    const dataHandlers = window.dataHandlers;
    const syncStatusMessage = window.globals?.syncStatusMessage;
    
    isCurrentlyOnline = true;
    console.log('[NETWORK] ✅ Connection restored');
    
    if (syncStatusMessage) {
        syncStatusMessage.textContent = '✅ Back online. Syncing queued data...';
        syncStatusMessage.style.color = '#16a34a';
    }
    
    if (!syncInProgress) {
        syncInProgress = true;
        setTimeout(async () => {
            try {
                // 1) Data sync first
                if (dataHandlers?.syncData) {
                    await dataHandlers.syncData(false);
                    resetRetryCount('data');
                }

                // 2) Then analytics sync
                if (dataHandlers?.syncAnalytics) {
                    await dataHandlers.syncAnalytics(false);
                    resetRetryCount('analytics');
                }
                
                if (syncStatusMessage) {
                    syncStatusMessage.textContent = '✅ All data & analytics synced';
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
    
    if (syncStatusMessage) {
        syncStatusMessage.textContent = '📱 Offline mode - All data saved locally';
        syncStatusMessage.style.color = '#ea580c';
    }
}

/**
 * Show persistent offline indicator - DISABLED
 */
function showOfflineIndicator() {
    console.log('[NETWORK] Offline indicator disabled - running silently');
    return;
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
 * CRITICAL FIX: Sequential sync with race condition protection
 * @param {boolean} isManual 
 * @param {string} syncType - 'data' or 'analytics'
 */
async function safeSync(syncType, isManual = false) {
    // FIXED: Race condition guard
    if (syncInProgress) {
        console.log(`[NETWORK] ${syncType} sync skipped - already in progress`);
        return false;
    }

    const dataHandlers = window.dataHandlers;
    const hasDataSync = syncType === 'data' && dataHandlers?.syncData;
    const hasAnalyticsSync = syncType === 'analytics' && dataHandlers?.syncAnalytics;
    
    if (!hasDataSync && !hasAnalyticsSync) {
        console.warn(`[NETWORK] No ${syncType} handler available`);
        return false;
    }

    try {
        syncInProgress = true;
        
        if (syncType === 'data' && hasDataSync) {
            const attempts = retryAttempts.data || 0;
            console.log(`[DATA SYNC] Attempt ${attempts + 1}/${RETRY_CONFIG.maxAttempts}`);
            const success = await dataHandlers.syncData(isManual);
            
            if (success) {
                resetRetryCount('data');
            } else if (shouldRetry('data')) {
                recordRetry('data');
                const delay = getRetryDelay('data', retryAttempts.data);
                console.log(`[DATA SYNC] Retrying in ${Math.round(delay/1000)}s...`);
                setTimeout(() => safeSync('data', isManual), delay);
            }
            return success;
        }
        
        if (syncType === 'analytics' && hasAnalyticsSync) {
            const attempts = retryAttempts.analytics || 0;
            console.log(`[ANALYTICS SYNC] Attempt ${attempts + 1}/${RETRY_CONFIG.maxAttempts}`);
            const success = await dataHandlers.syncAnalytics(isManual);
            
            if (success) {
                resetRetryCount('analytics');
            } else if (shouldRetry('analytics')) {
                recordRetry('analytics');
                const delay = getRetryDelay('analytics', retryAttempts.analytics);
                console.log(`[ANALYTICS SYNC] Retrying in ${Math.round(delay/1000)}s...`);
                setTimeout(() => safeSync('analytics', isManual), delay);
            }
            return success;
        }
        
    } catch (error) {
        console.error(`[${syncType.toUpperCase()} SYNC] Error:`, error);
        recordRetry(syncType);
    } finally {
        syncInProgress = false;
    }
    
    return false;
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
        console.log('[NETWORK] ⚠️ Starting in OFFLINE mode');
    } else {
        isCurrentlyOnline = true;
        console.log('[NETWORK] ✅ Starting in ONLINE mode');
        
        setTimeout(async () => {
            // FIXED: Race condition protection
            if (!syncInProgress) {
                await safeSync('data', false);
                await safeSync('analytics', false);
            }
        }, 2000);
    }
}

/**
 * BATTERY OPTIMIZATION: Pause network monitoring
 */
function pauseNetworkMonitoring() {
    if (networkCheckIntervalId) {
        clearInterval(networkCheckIntervalId);
        networkCheckIntervalId = null;
        console.log('[NETWORK] 🔋 Monitoring paused (page hidden)');
    }
}

/**
 * BATTERY OPTIMIZATION: Resume network monitoring
 */
function resumeNetworkMonitoring() {
    if (!networkCheckIntervalId) {
        startPeriodicCheck();
        console.log('[NETWORK] Monitoring resumed');
    }
}

/**
 * BATTERY OPTIMIZATION: Start periodic check (only when visible)
 */
function startPeriodicCheck() {
    if (networkCheckIntervalId) {
        clearInterval(networkCheckIntervalId);
    }
    
    networkCheckIntervalId = setInterval(() => {
        if (document.hidden) {
            return;
        }
        
        if (navigator.onLine && !isCurrentlyOnline) {
            console.log('[NETWORK] Connection restored (periodic check)');
            handleOnline();
            hideOfflineIndicator();
        } else if (!navigator.onLine && isCurrentlyOnline) {
            console.log('[NETWORK] Connection lost (periodic check)');
            handleOffline();
        }
    }, 30000);
}

/**
 * Setup network status monitoring with offline-first approach
 */
export function setupNetworkMonitoring() {
    console.log('[NETWORK] 🚀 Initializing OFFLINE-FIRST monitoring v2.2.0');
    
    checkInitialStatus();
    
    window.addEventListener('online', () => {
        handleOnline();
        hideOfflineIndicator();
    });
    
    window.addEventListener('offline', handleOffline);
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('[NETWORK] App visible - checking connection');
            
            const wasOnline = isCurrentlyOnline;
            isCurrentlyOnline = navigator.onLine;
            
            if (isCurrentlyOnline && !wasOnline) {
                handleOnline();
                hideOfflineIndicator();
            } else if (!isCurrentlyOnline && wasOnline) {
                handleOffline();
            }
            
            // FIXED: Race condition protection + retry awareness
            if (isCurrentlyOnline && !syncInProgress) {
                setTimeout(async () => {
                    await safeSync('data', false);
                    await safeSync('analytics', false);
                }, 500);
            }
            
            resumeNetworkMonitoring();
        } else {
            pauseNetworkMonitoring();
        }
    });
    
    startPeriodicCheck();
    
    // FIXED: Service worker race condition protection
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.type === 'BACKGROUND_SYNC') {
                console.log('[NETWORK] Background sync triggered by SW');
                if (!syncInProgress) {
                    safeSync('data', false).then(() => safeSync('analytics', false));
                }
            }
        });
    }
    
    console.log('[NETWORK] ✅ OFFLINE-FIRST v2.2.0 active (retry + race-proof)');
}

/**
 * Get current network status
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
        const dataSuccess = await safeSync('data', true);
        const analyticsSuccess = await safeSync('analytics', true);
        return dataSuccess && analyticsSuccess;
    } catch (error) {
        console.error('[NETWORK] Force sync failed:', error);
        return false;
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
        saveData: connection?.saveData || false,
        retryStatus: retryAttempts
    };
}

/**
 * Cleanup network monitoring
 */
export function cleanupNetworkMonitoring() {
    if (networkCheckIntervalId) {
        clearInterval(networkCheckIntervalId);
        networkCheckIntervalId = null;
    }
    console.log('[NETWORK] Monitoring cleaned up');
}

export default {
    setupNetworkMonitoring,
    handleOnline,
    handleOffline,
    checkInitialStatus,
    isOnline,
    forceSyncAttempt,
    getNetworkStatus,
    cleanupNetworkMonitoring
};
