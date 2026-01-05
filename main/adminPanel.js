// FILE: main/adminPanel.js
// PURPOSE: Admin panel functionality with security
// DEPENDENCIES: window.globals, window.dataHandlers
// VERSION: 2.0.0 - Added password protection for Clear Local

// SECURITY: Password protection for Clear Local button
const CLEAR_PASSWORD = '8765'; // Hardcoded password
const MAX_ATTEMPTS = 2; // Two attempts allowed
const LOCKOUT_DURATION = 3600000; // 1 hour in milliseconds

let failedAttempts = 0;
let lockoutUntil = null;

/**
 * Check if Clear Local is currently locked
 * @returns {boolean} True if locked
 */
function isClearLocalLocked() {
    if (!lockoutUntil) return false;
    
    const now = Date.now();
    if (now < lockoutUntil) {
        return true;
    }
    
    // Lockout expired, reset
    lockoutUntil = null;
    failedAttempts = 0;
    localStorage.removeItem('clearLocalLockout');
    return false;
}

/**
 * Get remaining lockout time in minutes
 * @returns {number} Minutes remaining
 */
function getRemainingLockoutTime() {
    if (!lockoutUntil) return 0;
    const remaining = lockoutUntil - Date.now();
    return Math.ceil(remaining / 60000); // Convert to minutes
}

/**
 * Lock Clear Local button for 1 hour
 */
function lockClearLocal() {
    lockoutUntil = Date.now() + LOCKOUT_DURATION;
    localStorage.setItem('clearLocalLockout', lockoutUntil.toString());
    console.warn('[ADMIN] 🔒 Clear Local locked for 1 hour due to failed password attempts');
}

/**
 * Restore lockout state from localStorage (if page refreshed during lockout)
 */
function restoreLockoutState() {
    const stored = localStorage.getItem('clearLocalLockout');
    if (stored) {
        const storedTime = parseInt(stored);
        if (Date.now() < storedTime) {
            lockoutUntil = storedTime;
            console.warn('[ADMIN] 🔒 Clear Local is locked (restored from storage)');
        } else {
            localStorage.removeItem('clearLocalLockout');
        }
    }
}

/**
 * Verify password for Clear Local button
 * @returns {boolean} True if password correct
 */
function verifyClearPassword() {
    // Check if locked
    if (isClearLocalLocked()) {
        const remaining = getRemainingLockoutTime();
        alert(`🔒 Clear Local is locked.\n\nToo many failed attempts.\nPlease try again in ${remaining} minutes.`);
        return false;
    }
    
    // Prompt for password
    const input = prompt('🔒 Enter password to Clear Local Storage:\n\n(This will delete all queued surveys)');
    
    // User cancelled
    if (input === null) {
        console.log('[ADMIN] Clear Local cancelled by user');
        return false;
    }
    
    // Check password
    if (input === CLEAR_PASSWORD) {
        console.log('[ADMIN] ✅ Password correct - clearing local storage');
        failedAttempts = 0;
        return true;
    }
    
    // Wrong password
    failedAttempts++;
    console.warn(`[ADMIN] ❌ Wrong password (Attempt ${failedAttempts}/${MAX_ATTEMPTS})`);
    
    if (failedAttempts >= MAX_ATTEMPTS) {
        lockClearLocal();
        alert(`❌ Incorrect password.\n\nToo many failed attempts (${MAX_ATTEMPTS}).\n\n🔒 Clear Local is now LOCKED for 1 hour.`);
    } else {
        const remaining = MAX_ATTEMPTS - failedAttempts;
        alert(`❌ Incorrect password.\n\nYou have ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.\n\nAfter ${MAX_ATTEMPTS} failed attempts, this feature will be locked for 1 hour.`);
    }
    
    return false;
}

/**
 * Setup 5-tap gesture to show admin panel
 */
export function setupAdminPanel() {
    const mainTitle = window.globals?.mainTitle;
    const adminControls = window.globals?.adminControls;
    const hideAdminButton = window.globals?.hideAdminButton;
    const adminClearButton = window.globals?.adminClearButton;
    const syncButton = window.globals?.syncButton;
    const syncAnalyticsButton = window.globals?.syncAnalyticsButton;
    const checkUpdateButton = window.globals?.checkUpdateButton;
    const fixVideoButton = window.globals?.fixVideoButton;
    
    if (!mainTitle || !adminControls) {
        console.error('[ADMIN] Required elements not found');
        return;
    }
    
    // Restore lockout state on page load
    restoreLockoutState();
    
    // Initially hide admin panel
    adminControls.classList.add('hidden');
    
    // 5-tap counter
    let tapCount = 0;
    let tapTimeout = null;
    
    const handleTitleClick = () => {
        tapCount++;
        console.log(`[ADMIN] Tap ${tapCount}/5`);
        
        if (tapTimeout) {
            clearTimeout(tapTimeout);
        }
        
        // Reset after 2 seconds
        tapTimeout = setTimeout(() => {
            tapCount = 0;
        }, 2000);
        
        // Show admin after 5 taps
        if (tapCount >= 5) {
            console.log('[ADMIN] ✅ Admin panel unlocked');
            adminControls.classList.remove('hidden');
            tapCount = 0;
            
            // Update unsynced count
            if (window.dataHandlers?.updateAdminCount) {
                window.dataHandlers.updateAdminCount();
            }
        }
    };
    
    mainTitle.addEventListener('click', handleTitleClick);
    
    // Hide admin button
    if (hideAdminButton) {
        hideAdminButton.addEventListener('click', () => {
            console.log('[ADMIN] Hiding admin panel');
            adminControls.classList.add('hidden');
        });
    }
    
    // SECURITY: Clear local button with password protection
    if (adminClearButton) {
        adminClearButton.addEventListener('click', () => {
            console.log('[ADMIN] 🔒 Clear Local clicked - requesting password');
            
            // Verify password
            if (!verifyClearPassword()) {
                return; // Password incorrect or locked
            }
            
            // Password correct - proceed with clear
            const queueSize = window.dataHandlers?.countUnsyncedRecords?.() || 0;
            
            const confirmMsg = queueSize > 0 
                ? `⚠️ WARNING: You are about to delete ${queueSize} unsynced survey${queueSize > 1 ? 's' : ''}.\n\nThis action CANNOT be undone!\n\nAre you absolutely sure?`
                : 'Clear all local data?\n\nThis will remove all cached information.';
            
            if (confirm(confirmMsg)) {
                try {
                    const CONSTANTS = window.CONSTANTS;
                    
                    // Clear all localStorage keys
                    localStorage.removeItem(CONSTANTS.STORAGE_KEY_QUEUE);
                    localStorage.removeItem(CONSTANTS.STORAGE_KEY_ANALYTICS);
                    localStorage.removeItem(CONSTANTS.STORAGE_KEY_STATE);
                    localStorage.removeItem(CONSTANTS.STORAGE_KEY_LAST_SYNC);
                    localStorage.removeItem(CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC);
                    
                    console.log('[ADMIN] ✅ Local storage cleared');
                    
                    if (window.dataHandlers?.updateAdminCount) {
                        window.dataHandlers.updateAdminCount();
                    }
                    
                    const syncStatusMessage = window.globals?.syncStatusMessage;
                    if (syncStatusMessage) {
                        syncStatusMessage.textContent = '✅ Local storage cleared';
                        setTimeout(() => {
                            syncStatusMessage.textContent = '';
                        }, 3000);
                    }
                    
                    // Reload page to reset state
                    setTimeout(() => {
                        location.reload();
                    }, 1500);
                    
                } catch (error) {
                    console.error('[ADMIN] Error clearing storage:', error);
                    alert('❌ Error clearing storage. Check console.');
                }
            } else {
                console.log('[ADMIN] Clear cancelled by user');
            }
        });
        
        console.log('[ADMIN] 🔒 Clear Local button configured (password protected)');
    }
    
    // Sync data button
    if (syncButton) {
        syncButton.addEventListener('click', () => {
            console.log('[ADMIN] Manual sync triggered');
            
            if (window.dataHandlers?.syncData) {
                window.dataHandlers.syncData(true);
            } else {
                console.error('[ADMIN] syncData not available');
            }
        });
    }
    
    // Sync analytics button
    if (syncAnalyticsButton) {
        syncAnalyticsButton.addEventListener('click', () => {
            console.log('[ADMIN] Manual analytics sync triggered');
            
            if (window.dataHandlers?.syncAnalytics) {
                window.dataHandlers.syncAnalytics(true);
            } else {
                console.error('[ADMIN] syncAnalytics not available');
            }
        });
    }
    
    // Check update button
    if (checkUpdateButton) {
        checkUpdateButton.addEventListener('click', async () => {
            console.log('[ADMIN] 🔧 Manual update check triggered');
            
            const syncStatusMessage = window.globals?.syncStatusMessage;
            
            if (syncStatusMessage) {
                syncStatusMessage.textContent = '🔍 Checking for updates...';
            }
            
            try {
                if (window.pwaUpdateManager) {
                    await window.pwaUpdateManager.forceUpdate();
                } else {
                    console.error('[ADMIN] PWA Update Manager not available');
                    if (syncStatusMessage) {
                        syncStatusMessage.textContent = '❌ Update manager not available';
                    }
                }
            } catch (error) {
                console.error('[ADMIN] Update check failed:', error);
                if (syncStatusMessage) {
                    syncStatusMessage.textContent = '❌ Update check failed';
                }
            }
            
            setTimeout(() => {
                if (syncStatusMessage) {
                    syncStatusMessage.textContent = '';
                }
            }, 4000);
        });
        
        console.log('[ADMIN] ✅ Check Update button configured');
    }
    
    // Fix video button
    if (fixVideoButton) {
        fixVideoButton.addEventListener('click', () => {
            console.log('[ADMIN] 🔧 Fix Video triggered - reloading video');
            
            const kioskVideo = window.globals?.kioskVideo;
            
            if (kioskVideo) {
                try {
                    // Force video reload
                    const currentSrc = kioskVideo.src || kioskVideo.querySelector('source')?.src;
                    
                    if (currentSrc) {
                        kioskVideo.src = '';
                        kioskVideo.load();
                        
                        setTimeout(() => {
                            kioskVideo.src = currentSrc;
                            kioskVideo.load();
                            console.log('[ADMIN] ✅ Video reloaded');
                            
                            const syncStatusMessage = window.globals?.syncStatusMessage;
                            if (syncStatusMessage) {
                                syncStatusMessage.textContent = '✅ Video reloaded';
                                setTimeout(() => {
                                    syncStatusMessage.textContent = '';
                                }, 3000);
                            }
                        }, 500);
                    } else {
                        console.error('[ADMIN] Video source not found');
                    }
                } catch (error) {
                    console.error('[ADMIN] Error reloading video:', error);
                }
            } else {
                console.error('[ADMIN] Video element not found');
            }
        });
        
        console.log('[ADMIN] ✅ Fix Video button configured');
    }
    
    console.log('[ADMIN] ✅ Admin panel configured (5-tap unlock, password protected clear)');
    
    // Display security status
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔒 ADMIN SECURITY STATUS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Clear Local: Password Protected (${MAX_ATTEMPTS} attempts, 1hr lockout)`);
    if (isClearLocalLocked()) {
        console.warn(`   ⚠️  Currently LOCKED (${getRemainingLockoutTime()} minutes remaining)`);
    } else {
        console.log('   ✅ Unlocked');
    }
    console.log('═══════════════════════════════════════════════════════');
}

/**
 * Debug commands exposed to window
 */
window.inspectQueue = function() {
    const CONSTANTS = window.CONSTANTS;
    const queue = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_QUEUE) || '[]');
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 SUBMISSION QUEUE INSPECTION');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Records: ${queue.length}`);
    console.log('');
    
    if (queue.length === 0) {
        console.log('✅ Queue is empty');
    } else {
        queue.forEach((submission, index) => {
            console.log(`Record ${index + 1}:`);
            console.log(`  ID: ${submission.id}`);
            console.log(`  Timestamp: ${submission.timestamp}`);
            console.log(`  Status: ${submission.sync_status || 'unsynced'}`);
            console.log(`  Completed: ${submission.completionTimeSeconds || 'N/A'}s`);
            console.log('');
        });
    }
    
    console.log('═══════════════════════════════════════════════════════');
    return queue;
};

window.clearQueue = function() {
    console.warn('[DEBUG] 🔒 Use admin panel "Clear Local" button (password protected)');
};

window.viewSurveyAnalytics = function() {
    const CONSTANTS = window.CONSTANTS;
    const analytics = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_ANALYTICS) || '[]');
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 SURVEY ANALYTICS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Events: ${analytics.length}`);
    console.log('');
    
    const eventTypes = {};
    analytics.forEach(event => {
        eventTypes[event.eventType] = (eventTypes[event.eventType] || 0) + 1;
    });
    
    console.log('Event Breakdown:');
    Object.entries(eventTypes).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
    });
    
    console.log('═══════════════════════════════════════════════════════');
    return analytics;
};

window.systemStatus = function() {
    const CONSTANTS = window.CONSTANTS;
    const queue = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_QUEUE) || '[]');
    const analytics = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_ANALYTICS) || '[]');
    const lastSync = localStorage.getItem(CONSTANTS.STORAGE_KEY_LAST_SYNC);
    const lastAnalyticsSync = localStorage.getItem(CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC);
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('🖥️  SYSTEM STATUS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Queue Size: ${queue.length}/${CONSTANTS.MAX_QUEUE_SIZE}`);
    console.log(`Analytics Events: ${analytics.length}/${CONSTANTS.MAX_ANALYTICS_SIZE}`);
    console.log(`Online: ${navigator.onLine ? '✓' : '✗'}`);
    console.log(`Last Sync: ${lastSync ? new Date(parseInt(lastSync)).toLocaleString() : 'Never'}`);
    console.log(`Last Analytics Sync: ${lastAnalyticsSync ? new Date(parseInt(lastAnalyticsSync)).toLocaleString() : 'Never'}`);
    
    // Security status
    console.log('');
    console.log('🔒 Security Status:');
    if (isClearLocalLocked()) {
        console.log(`   Clear Local: LOCKED (${getRemainingLockoutTime()} min remaining)`);
    } else {
        console.log('   Clear Local: Unlocked');
    }
    
    console.log('═══════════════════════════════════════════════════════');
};

window.syncAnalyticsNow = function() {
    if (window.dataHandlers?.syncAnalytics) {
        window.dataHandlers.syncAnalytics(true);
    } else {
        console.error('Analytics sync not available');
    }
};

console.log('═══════════════════════════════════════════════════════');
console.log('🛠️  DEBUG COMMANDS AVAILABLE');
console.log('═══════════════════════════════════════════════════════');
console.log('📋 window.inspectQueue()        - View all queued submissions');
console.log('🗑️  window.clearQueue()          - Redirects to password-protected button');
console.log('📊 window.viewSurveyAnalytics() - View analytics data');
console.log('🖥️  window.systemStatus()        - View system status');
console.log('🔄 window.syncAnalyticsNow()    - Force analytics sync');
console.log('═══════════════════════════════════════════════════════');

export default {
    setupAdminPanel
};
