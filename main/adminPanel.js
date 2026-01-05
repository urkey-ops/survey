// FILE: main/adminPanel.js
// PURPOSE: Admin panel optimized for offline-first iPad kiosk PWA
// VERSION: 5.0.0 - Offline-ready with proper button states
// DEPENDENCIES: window.globals, window.dataHandlers

// ===== CONFIGURATION =====
const CLEAR_PASSWORD = '8765';
const MAX_ATTEMPTS = 2;
const LOCKOUT_DURATION = 3600000; // 1 hour
const AUTO_HIDE_DELAY = 20000; // 20 seconds
const PASSWORD_SESSION_TIMEOUT = 300000; // 5 minutes
const COUNTDOWN_UPDATE_INTERVAL = 1000; // 1 second

// ===== STATE =====
let failedAttempts = 0;
let lockoutUntil = null;
let autoHideTimer = null;
let autoHideStartTime = null; // ✅ FIXED: Separate variable for start time
let countdownInterval = null;
let adminPanelVisible = false;
let lastPasswordSuccess = null;
let syncInProgress = false;
let analyticsInProgress = false;
let onlineHandler = null;
let offlineHandler = null;

// ===== SECURITY FUNCTIONS =====

function isClearLocalLocked() {
    if (!lockoutUntil) return false;
    
    if (Date.now() < lockoutUntil) {
        return true;
    }
    
    // Lockout expired
    lockoutUntil = null;
    failedAttempts = 0;
    localStorage.removeItem('clearLocalLockout');
    return false;
}

function getRemainingLockoutTime() {
    if (!lockoutUntil) return 0;
    return Math.ceil((lockoutUntil - Date.now()) / 60000);
}

function lockClearLocal() {
    lockoutUntil = Date.now() + LOCKOUT_DURATION;
    localStorage.setItem('clearLocalLockout', lockoutUntil.toString());
    console.warn('[ADMIN] 🔒 Clear Local locked for 1 hour');
    
    // Track admin event (safe offline)
    trackAdminEvent('clear_local_locked', { attempts: failedAttempts });
}

function restoreLockoutState() {
    const stored = localStorage.getItem('clearLocalLockout');
    if (stored) {
        const storedTime = parseInt(stored);
        if (Date.now() < storedTime) {
            lockoutUntil = storedTime;
            console.warn('[ADMIN] 🔒 Clear Local locked (restored)');
        } else {
            localStorage.removeItem('clearLocalLockout');
        }
    }
}

function isPasswordSessionExpired() {
    if (!lastPasswordSuccess) return true;
    return (Date.now() - lastPasswordSuccess) > PASSWORD_SESSION_TIMEOUT;
}

function verifyClearPassword() {
    // Check if locked
    if (isClearLocalLocked()) {
        const remaining = getRemainingLockoutTime();
        alert(`🔒 Clear Local is locked.\n\nToo many failed attempts.\nPlease try again in ${remaining} minutes.`);
        trackAdminEvent('clear_local_blocked', { reason: 'locked' });
        return false;
    }
    
    // Check if recent password success (within 5 minutes)
    if (lastPasswordSuccess && !isPasswordSessionExpired()) {
        console.log('[ADMIN] ✅ Using cached password session');
        return true;
    }
    
    // Prompt for password
    const input = prompt('🔒 Enter password to Clear Local Storage:\n\n(This will delete all queued surveys)');
    
    if (input === null) {
        console.log('[ADMIN] Clear Local cancelled');
        trackAdminEvent('clear_local_cancelled');
        return false;
    }
    
    // Check password
    if (input === CLEAR_PASSWORD) {
        console.log('[ADMIN] ✅ Password correct');
        failedAttempts = 0;
        lastPasswordSuccess = Date.now();
        vibrateSuccess();
        trackAdminEvent('clear_local_password_success');
        return true;
    }
    
    // Wrong password
    failedAttempts++;
    vibrateError();
    trackAdminEvent('clear_local_password_failed', { attempt: failedAttempts });
    console.warn(`[ADMIN] ❌ Wrong password (${failedAttempts}/${MAX_ATTEMPTS})`);
    
    if (failedAttempts >= MAX_ATTEMPTS) {
        lockClearLocal();
        alert(`❌ Incorrect password.\n\nToo many failed attempts.\n\n🔒 Clear Local is now LOCKED for 1 hour.`);
    } else {
        const remaining = MAX_ATTEMPTS - failedAttempts;
        alert(`❌ Incorrect password.\n\nYou have ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`);
    }
    
    return false;
}

// ===== HAPTIC FEEDBACK (iPad Support) =====

function vibrateSuccess() {
    try {
        if (navigator.vibrate) {
            navigator.vibrate([50]);
        }
    } catch (e) {
        // Silently fail if vibration not supported
    }
}

function vibrateError() {
    try {
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
    } catch (e) {
        // Silently fail
    }
}

function vibrateTap() {
    try {
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
    } catch (e) {
        // Silently fail
    }
}

// ===== ANALYTICS TRACKING (Offline-Safe) =====

/**
 * Track admin panel events - queues locally if offline
 */
function trackAdminEvent(eventType, metadata = {}) {
    try {
        if (window.dataHandlers?.trackAnalytics) {
            window.dataHandlers.trackAnalytics(eventType, {
                ...metadata,
                source: 'admin_panel',
                online: navigator.onLine
            });
        }
    } catch (error) {
        // Silently fail - don't break admin panel if analytics fails
        console.warn('[ADMIN] Analytics tracking failed (offline safe):', error.message);
    }
}

// ===== AUTO-HIDE & COUNTDOWN =====

function updateCountdown() {
    const countdownEl = document.getElementById('adminCountdown');
    if (!countdownEl || !adminPanelVisible || !autoHideStartTime) return;
    
    const elapsed = Date.now() - autoHideStartTime; // ✅ FIXED: Use separate variable
    const remaining = Math.max(0, Math.ceil((AUTO_HIDE_DELAY - elapsed) / 1000));
    
    if (remaining > 0) {
        countdownEl.textContent = `Auto-hide in ${remaining}s`;
        countdownEl.style.opacity = remaining <= 5 ? '1' : '0.6';
    } else {
        countdownEl.textContent = '';
    }
}

function startAutoHideTimer() {
    // Clear existing timers
    if (autoHideTimer) {
        clearTimeout(autoHideTimer);
        autoHideTimer = null;
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    // Store start time ✅ FIXED: Separate variable
    autoHideStartTime = Date.now();
    
    // Set new timer
    autoHideTimer = setTimeout(() => {
        console.log('[ADMIN] ⏱️ Auto-hiding panel');
        hideAdminPanel();
        trackAdminEvent('admin_auto_hide');
    }, AUTO_HIDE_DELAY);
    
    // Start countdown display
    countdownInterval = setInterval(updateCountdown, COUNTDOWN_UPDATE_INTERVAL);
    updateCountdown();
}

function resetAutoHideTimer() {
    if (adminPanelVisible) {
        startAutoHideTimer();
    }
}

function hideAdminPanel() {
    const adminControls = window.globals?.adminControls;
    
    if (adminControls) {
        adminControls.classList.add('hidden');
        adminPanelVisible = false;
        
        // Clean up timers ✅ FIXED: Also clear start time
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
        }
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        
        autoHideStartTime = null; // ✅ FIXED: Clear start time
        
        // Clear countdown display
        const countdownEl = document.getElementById('adminCountdown');
        if (countdownEl) {
            countdownEl.textContent = '';
        }
        
        console.log('[ADMIN] 🔋 Panel hidden - battery saving');
    }
}

function showAdminPanel() {
    const adminControls = window.globals?.adminControls;
    
    if (adminControls) {
        adminControls.classList.remove('hidden');
        adminPanelVisible = true;
        
        // Update UI
        if (window.dataHandlers?.updateAdminCount) {
            window.dataHandlers.updateAdminCount();
        }
        
        updateAllButtonStates();
        startAutoHideTimer();
        vibrateSuccess();
        trackAdminEvent('admin_panel_opened');
        
        console.log('[ADMIN] ✅ Panel visible (auto-hide in 20s)');
    }
}

// ===== OFFLINE-FIRST BUTTON STATE MANAGEMENT =====

/**
 * Update online/offline indicator
 */
function updateOnlineIndicator() {
    const onlineIndicator = document.getElementById('adminOnlineStatus');
    if (!onlineIndicator) return;
    
    const isOnline = navigator.onLine;
    
    if (isOnline) {
        onlineIndicator.textContent = '🌐 Online';
        onlineIndicator.style.color = '#059669'; // green
    } else {
        onlineIndicator.textContent = '📡 Offline Mode';
        onlineIndicator.style.color = '#dc2626'; // red
    }
}

/**
 * Update ALL button states based on online/offline
 * CRITICAL: All online-dependent buttons disabled when offline
 */
function updateAllButtonStates() {
    const isOnline = navigator.onLine;
    
    updateOnlineIndicator();
    updateSyncButtonState(isOnline);
    updateAnalyticsButtonState(isOnline);
    updateCheckUpdateButtonState(isOnline);
    updateFixVideoButtonState(isOnline);
    updateClearButtonState(); // Clear Local works offline
    
    console.log(`[ADMIN] 🔘 All buttons updated (${isOnline ? 'ONLINE' : 'OFFLINE'})`);
}

/**
 * Update Sync Data button
 */
function updateSyncButtonState(isOnline) {
    const syncButton = window.globals?.syncButton;
    if (!syncButton) return;
    
    const shouldDisable = !isOnline || syncInProgress;
    
    syncButton.disabled = shouldDisable;
    syncButton.setAttribute('aria-busy', syncInProgress ? 'true' : 'false');
    syncButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    
    if (syncInProgress) {
        syncButton.textContent = 'Syncing...';
        syncButton.style.opacity = '0.7';
        syncButton.style.cursor = 'wait';
    } else if (!isOnline) {
        syncButton.textContent = 'Sync Data (Offline)';
        syncButton.style.opacity = '0.5';
        syncButton.style.cursor = 'not-allowed';
    } else {
        syncButton.textContent = 'Sync Data';
        syncButton.style.opacity = '1';
        syncButton.style.cursor = 'pointer';
    }
    
    syncButton.title = syncInProgress 
        ? 'Sync in progress...'
        : !isOnline 
            ? 'Sync disabled - device is offline'
            : 'Sync queued data to server';
}

/**
 * Update Sync Analytics button
 */
function updateAnalyticsButtonState(isOnline) {
    const syncAnalyticsButton = window.globals?.syncAnalyticsButton;
    if (!syncAnalyticsButton) return;
    
    const shouldDisable = !isOnline || analyticsInProgress;
    
    syncAnalyticsButton.disabled = shouldDisable;
    syncAnalyticsButton.setAttribute('aria-busy', analyticsInProgress ? 'true' : 'false');
    syncAnalyticsButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    
    if (analyticsInProgress) {
        syncAnalyticsButton.textContent = 'Syncing...';
        syncAnalyticsButton.style.opacity = '0.7';
        syncAnalyticsButton.style.cursor = 'wait';
    } else if (!isOnline) {
        syncAnalyticsButton.textContent = 'Sync Analytics (Offline)';
        syncAnalyticsButton.style.opacity = '0.5';
        syncAnalyticsButton.style.cursor = 'not-allowed';
    } else {
        syncAnalyticsButton.textContent = 'Sync Analytics';
        syncAnalyticsButton.style.opacity = '1';
        syncAnalyticsButton.style.cursor = 'pointer';
    }
    
    syncAnalyticsButton.title = analyticsInProgress
        ? 'Sync in progress...'
        : !isOnline
            ? 'Sync disabled - device is offline'
            : 'Sync analytics to server';
}

/**
 * Update Check Update button
 */
function updateCheckUpdateButtonState(isOnline) {
    const checkUpdateButton = window.globals?.checkUpdateButton;
    if (!checkUpdateButton) return;
    
    checkUpdateButton.disabled = !isOnline;
    checkUpdateButton.setAttribute('aria-disabled', !isOnline ? 'true' : 'false');
    
    if (!isOnline) {
        checkUpdateButton.textContent = 'Check Update (Offline)';
        checkUpdateButton.style.opacity = '0.5';
        checkUpdateButton.style.cursor = 'not-allowed';
    } else {
        checkUpdateButton.textContent = 'Check Update';
        checkUpdateButton.style.opacity = '1';
        checkUpdateButton.style.cursor = 'pointer';
    }
    
    checkUpdateButton.title = !isOnline
        ? 'Update check disabled - device is offline'
        : 'Check for PWA updates';
}

/**
 * Update Fix Video button
 */
function updateFixVideoButtonState(isOnline) {
    const fixVideoButton = window.globals?.fixVideoButton;
    if (!fixVideoButton) return;
    
    // Fix Video works offline (local asset)
    fixVideoButton.disabled = false;
    fixVideoButton.style.opacity = '1';
    fixVideoButton.style.cursor = 'pointer';
    fixVideoButton.title = 'Reload kiosk video';
}

/**
 * Update Clear Local button
 */
function updateClearButtonState() {
    const adminClearButton = window.globals?.adminClearButton;
    if (!adminClearButton) return;
    
    const isLocked = isClearLocalLocked();
    
    adminClearButton.disabled = isLocked;
    adminClearButton.setAttribute('aria-disabled', isLocked ? 'true' : 'false');
    
    if (isLocked) {
        const remaining = getRemainingLockoutTime();
        adminClearButton.textContent = `Clear Local (Locked ${remaining}m)`;
        adminClearButton.style.opacity = '0.5';
        adminClearButton.style.cursor = 'not-allowed';
        adminClearButton.title = `Locked due to failed password attempts. Try again in ${remaining} minutes.`;
    } else {
        adminClearButton.textContent = 'Clear Local';
        adminClearButton.style.opacity = '1';
        adminClearButton.style.cursor = 'pointer';
        adminClearButton.title = 'Clear local storage (password protected)';
    }
}

// ===== MAIN SETUP =====

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
    
    // Add countdown indicator and online status to admin controls
    if (!document.getElementById('adminCountdown')) {
        const statusRow = document.createElement('div');
        statusRow.style.display = 'flex';
        statusRow.style.justifyContent = 'space-between';
        statusRow.style.alignItems = 'center';
        statusRow.style.marginBottom = '8px';
        
        const onlineStatus = document.createElement('p');
        onlineStatus.id = 'adminOnlineStatus';
        onlineStatus.className = 'text-xs font-bold';
        onlineStatus.style.margin = '0';
        
        const countdown = document.createElement('p');
        countdown.id = 'adminCountdown';
        countdown.className = 'text-xs text-gray-500 font-medium';
        countdown.style.margin = '0';
        countdown.style.minHeight = '20px';
        
        statusRow.appendChild(onlineStatus);
        statusRow.appendChild(countdown);
        adminControls.insertBefore(statusRow, adminControls.firstChild);
    }
    
    // Restore state
    restoreLockoutState();
    adminControls.classList.add('hidden');
    adminPanelVisible = false;
    
    // 5-tap unlock
    let tapCount = 0;
    let tapTimeout = null;
    
    const handleTitleClick = () => {
        tapCount++;
        vibrateTap();
        console.log(`[ADMIN] Tap ${tapCount}/5`);
        
        if (tapTimeout) clearTimeout(tapTimeout);
        
        tapTimeout = setTimeout(() => {
            tapCount = 0;
        }, 2000);
        
        if (tapCount >= 5) {
            console.log('[ADMIN] ✅ Unlocked');
            showAdminPanel();
            tapCount = 0;
        }
    };
    
    mainTitle.addEventListener('click', handleTitleClick);
    
    // Hide button
    if (hideAdminButton) {
        hideAdminButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('[ADMIN] 🔘 Hide button clicked');
            hideAdminPanel();
            trackAdminEvent('admin_manually_hidden');
        });
        
        console.log('[ADMIN] ✅ Hide button handler attached');
    } else {
        console.warn('[ADMIN] ⚠️ Hide button not found');
    }
    
    // Reset timer on interaction
    const resetTimer = () => resetAutoHideTimer();
    
    // Clear Local (password protected, WORKS OFFLINE)
    if (adminClearButton) {
        adminClearButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('[ADMIN] 🔘 Clear Local button clicked');
            resetTimer();
            
            if (!verifyClearPassword()) {
                console.log('[ADMIN] Password verification failed');
                return;
            }
            
            // Check if sync in progress (prevent data corruption)
            if (syncInProgress || analyticsInProgress) {
                console.warn('[ADMIN] Clear blocked - sync in progress');
                alert('⚠️ Cannot clear while sync is in progress.\n\nPlease wait for sync to complete.');
                return;
            }
            
            const queueSize = window.dataHandlers?.countUnsyncedRecords?.() || 0;
            
            const confirmMsg = queueSize > 0 
                ? `⚠️ WARNING: Delete ${queueSize} unsynced survey${queueSize > 1 ? 's' : ''}?\n\nThis CANNOT be undone!`
                : 'Clear all local data?';
            
            if (confirm(confirmMsg)) {
                console.log('[ADMIN] ✅ User confirmed clear - proceeding...');
                try {
                    const CONSTANTS = window.CONSTANTS;
                    
                    localStorage.removeItem(CONSTANTS.STORAGE_KEY_QUEUE);
                    localStorage.removeItem(CONSTANTS.STORAGE_KEY_ANALYTICS);
                    localStorage.removeItem(CONSTANTS.STORAGE_KEY_STATE);
                    localStorage.removeItem(CONSTANTS.STORAGE_KEY_LAST_SYNC);
                    localStorage.removeItem(CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC);
                    
                    trackAdminEvent('local_storage_cleared', { queueSize });
                    console.log('[ADMIN] ✅ Storage cleared successfully');
                    
                    const syncStatusMessage = window.globals?.syncStatusMessage;
                    if (syncStatusMessage) {
                        syncStatusMessage.textContent = '✅ Storage cleared';
                    }
                    
                    setTimeout(() => {
                        console.log('[ADMIN] Reloading page...');
                        location.reload();
                    }, 1500);
                    
                } catch (error) {
                    console.error('[ADMIN] ❌ Error clearing storage:', error);
                    alert('❌ Error clearing storage. Check console for details.');
                }
            } else {
                console.log('[ADMIN] User cancelled clear operation');
            }
        });
        
        console.log('[ADMIN] ✅ Clear Local button handler attached');
    } else {
        console.warn('[ADMIN] ⚠️ Clear Local button not found');
    }
    
    // Sync Data (REQUIRES ONLINE)
    if (syncButton) {
        syncButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('[ADMIN] 🔘 Sync Data button clicked');
            resetTimer();
            
            if (!navigator.onLine) {
                console.warn('[ADMIN] Sync blocked - offline');
                alert('📡 Cannot sync - device is offline.\n\nData will sync automatically when connection is restored.');
                trackAdminEvent('sync_blocked_offline');
                return;
            }
            
            if (syncInProgress) {
                console.warn('[ADMIN] Sync already in progress');
                return;
            }
            
            console.log('[ADMIN] ✅ Starting manual sync...');
            syncInProgress = true;
            updateSyncButtonState(true);
            trackAdminEvent('manual_sync_triggered');
            
            try {
                if (window.dataHandlers?.syncData) {
                    await window.dataHandlers.syncData(true);
                    console.log('[ADMIN] ✅ Sync completed');
                } else {
                    console.error('[ADMIN] ❌ syncData function not found');
                    alert('❌ Sync function not available');
                }
            } catch (error) {
                console.error('[ADMIN] ❌ Sync failed:', error);
                alert('❌ Sync failed. Check console for details.');
            } finally {
                syncInProgress = false;
                updateSyncButtonState(navigator.onLine);
            }
        });
        
        console.log('[ADMIN] ✅ Sync Data button handler attached');
    } else {
        console.warn('[ADMIN] ⚠️ Sync Data button not found');
    }
    
    // Sync Analytics (REQUIRES ONLINE)
    if (syncAnalyticsButton) {
        syncAnalyticsButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('[ADMIN] 🔘 Sync Analytics button clicked');
            resetTimer();
            
            if (!navigator.onLine) {
                console.warn('[ADMIN] Analytics sync blocked - offline');
                alert('📡 Cannot sync analytics - device is offline.\n\nAnalytics will sync automatically when connection is restored.');
                trackAdminEvent('analytics_sync_blocked_offline');
                return;
            }
            
            if (analyticsInProgress) {
                console.warn('[ADMIN] Analytics sync already in progress');
                return;
            }
            
            console.log('[ADMIN] ✅ Starting analytics sync...');
            analyticsInProgress = true;
            updateAnalyticsButtonState(true);
            trackAdminEvent('manual_analytics_sync_triggered');
            
            try {
                if (window.dataHandlers?.syncAnalytics) {
                    await window.dataHandlers.syncAnalytics(true);
                    console.log('[ADMIN] ✅ Analytics sync completed');
                } else {
                    console.error('[ADMIN] ❌ syncAnalytics function not found');
                    alert('❌ Analytics sync function not available');
                }
            } catch (error) {
                console.error('[ADMIN] ❌ Analytics sync failed:', error);
                alert('❌ Analytics sync failed. Check console for details.');
            } finally {
                analyticsInProgress = false;
                updateAnalyticsButtonState(navigator.onLine);
            }
        });
        
        console.log('[ADMIN] ✅ Sync Analytics button handler attached');
    } else {
        console.warn('[ADMIN] ⚠️ Sync Analytics button not found');
    }
    
    // Check Update (REQUIRES ONLINE)
    if (checkUpdateButton) {
        checkUpdateButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('[ADMIN] 🔘 Check Update button clicked');
            resetTimer();
            
            if (!navigator.onLine) {
                console.warn('[ADMIN] Update check blocked - offline');
                alert('📡 Cannot check for updates - device is offline.\n\nPlease connect to WiFi to check for updates.');
                trackAdminEvent('update_check_blocked_offline');
                return;
            }
            
            console.log('[ADMIN] ✅ Starting update check...');
            trackAdminEvent('update_check_triggered');
            
            const syncStatusMessage = window.globals?.syncStatusMessage;
            if (syncStatusMessage) {
                syncStatusMessage.textContent = '🔍 Checking for updates...';
            }
            
            try {
                if (window.pwaUpdateManager) {
                    await window.pwaUpdateManager.forceUpdate();
                    console.log('[ADMIN] ✅ Update check completed');
                    if (syncStatusMessage) {
                        syncStatusMessage.textContent = '✅ Update check complete';
                    }
                } else {
                    console.error('[ADMIN] ❌ PWA Update Manager not found');
                    if (syncStatusMessage) {
                        syncStatusMessage.textContent = '❌ Update manager not available';
                    }
                }
            } catch (error) {
                console.error('[ADMIN] ❌ Update check failed:', error);
                if (syncStatusMessage) {
                    syncStatusMessage.textContent = '❌ Update check failed';
                }
            }
            
            setTimeout(() => {
                if (syncStatusMessage) syncStatusMessage.textContent = '';
            }, 4000);
        });
        
        console.log('[ADMIN] ✅ Check Update button handler attached');
    } else {
        console.warn('[ADMIN] ⚠️ Check Update button not found');
    }
    
    // Fix Video (WORKS OFFLINE - local asset)
    if (fixVideoButton) {
        fixVideoButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('[ADMIN] 🔘 Fix Video button clicked');
            resetTimer();
            trackAdminEvent('video_fix_triggered');
            
            const kioskVideo = window.globals?.kioskVideo;
            if (kioskVideo) {
                console.log('[ADMIN] ✅ Reloading video...');
                const currentSrc = kioskVideo.src || kioskVideo.querySelector('source')?.src;
                if (currentSrc) {
                    kioskVideo.src = '';
                    kioskVideo.load();
                    setTimeout(() => {
                        kioskVideo.src = currentSrc;
                        kioskVideo.load();
                        console.log('[ADMIN] ✅ Video reloaded successfully');
                        
                        const syncStatusMessage = window.globals?.syncStatusMessage;
                        if (syncStatusMessage) {
                            syncStatusMessage.textContent = '✅ Video reloaded';
                            setTimeout(() => {
                                syncStatusMessage.textContent = '';
                            }, 3000);
                        }
                    }, 500);
                } else {
                    console.error('[ADMIN] ❌ Video source not found');
                    alert('❌ Video source not found');
                }
            } else {
                console.error('[ADMIN] ❌ Video element not found');
                alert('❌ Video element not found');
            }
        });
        
        console.log('[ADMIN] ✅ Fix Video button handler attached');
    } else {
        console.warn('[ADMIN] ⚠️ Fix Video button not found');
    }
    
    // Network event listeners (only update if panel visible)
    onlineHandler = () => {
        console.log('[ADMIN] 🌐 Connection restored');
        if (adminPanelVisible) {
            updateAllButtonStates();
        }
        trackAdminEvent('connection_restored');
    };
    
    offlineHandler = () => {
        console.log('[ADMIN] 📡 Connection lost - offline mode');
        if (adminPanelVisible) {
            updateAllButtonStates();
        }
        trackAdminEvent('connection_lost');
    };
    
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎛️  ADMIN PANEL CONFIGURED');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   Mode: Offline-First iPad Kiosk PWA`);
    console.log(`   Auto-hide: ${AUTO_HIDE_DELAY/1000}s`);
    console.log(`   Password timeout: 5 minutes`);
    console.log(`   Haptic feedback: ${navigator.vibrate ? '✅ Enabled' : '❌ Not supported'}`);
    console.log(`   Network status: ${navigator.onLine ? '🌐 Online' : '📡 Offline'}`);
    console.log('');
    console.log('📋 Button States:');
    console.log(`   • Sync Data: ${navigator.onLine ? '✅ Enabled' : '🔒 Disabled (offline)'}`);
    console.log(`   • Sync Analytics: ${navigator.onLine ? '✅ Enabled' : '🔒 Disabled (offline)'}`);
    console.log(`   • Check Update: ${navigator.onLine ? '✅ Enabled' : '🔒 Disabled (offline)'}`);
    console.log(`   • Fix Video: ✅ Always enabled (offline-safe)`);
    console.log(`   • Clear Local: ${isClearLocalLocked() ? '🔒 Locked' : '✅ Enabled (offline-safe)'}`);
    console.log('═══════════════════════════════════════════════════════');
}

// ===== CLEANUP =====

export function cleanupAdminPanel() {
    if (autoHideTimer) clearTimeout(autoHideTimer);
    if (countdownInterval) clearInterval(countdownInterval);
    if (onlineHandler) window.removeEventListener('online', onlineHandler);
    if (offlineHandler) window.removeEventListener('offline', offlineHandler);
    
    autoHideTimer = null;
    autoHideStartTime = null; // ✅ FIXED: Clear start time
    countdownInterval = null;
    onlineHandler = null;
    offlineHandler = null;
    
    console.log('[ADMIN] 🧹 Cleaned up all resources');
}

// ===== DEBUG COMMANDS =====

window.inspectQueue = function() {
    const CONSTANTS = window.CONSTANTS;
    const queue = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_QUEUE) || '[]');
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 QUEUE INSPECTION');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total: ${queue.length}`);
    console.log(`Status: ${navigator.onLine ? 'Online' : 'Offline'}`);
    console.log('');
    
    if (queue.length === 0) {
        console.log('✅ Queue is empty');
    } else {
        queue.forEach((sub, idx) => {
            console.log(`${idx+1}. ID: ${sub.id}`);
            console.log(`   Time: ${new Date(sub.timestamp).toLocaleString()}`);
            console.log(`   Status: ${sub.sync_status || 'unsynced'}`);
            console.log('');
        });
    }
    
    console.log('═══════════════════════════════════════════════════════');
    return queue;
};

window.systemStatus = function() {
    const CONSTANTS = window.CONSTANTS;
    const queue = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_QUEUE) || '[]');
    const analytics = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_ANALYTICS) || '[]');
    const lastSync = localStorage.getItem(CONSTANTS.STORAGE_KEY_LAST_SYNC);
    const lastAnalyticsSync = localStorage.getItem(CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC);
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('🖥️  SYSTEM STATUS - OFFLINE-FIRST KIOSK');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Network: ${navigator.onLine ? '🌐 Online' : '📡 Offline Mode'}`);
    console.log(`Queue: ${queue.length}/${CONSTANTS.MAX_QUEUE_SIZE} surveys`);
    console.log(`Analytics: ${analytics.length}/${CONSTANTS.MAX_ANALYTICS_SIZE} events`);
    console.log(`Admin Panel: ${adminPanelVisible ? 'Visible' : 'Hidden'}`);
    console.log(`Sync Status: ${syncInProgress ? '⏳ In Progress' : '✅ Idle'}`);
    console.log(`Password: ${isPasswordSessionExpired() ? 'Expired' : 'Valid'}`);
    console.log(`Last Sync: ${lastSync ? new Date(parseInt(lastSync)).toLocaleString() : 'Never'}`);
    console.log(`Last Analytics: ${lastAnalyticsSync ? new Date(parseInt(lastAnalyticsSync)).toLocaleString() : 'Never'}`);
    
    if (isClearLocalLocked()) {
        console.log(`🔒 Clear Local: LOCKED (${getRemainingLockoutTime()} min remaining)`);
    }
    
    console.log('═══════════════════════════════════════════════════════');
};

console.log('═══════════════════════════════════════════════════════');
console.log('🛠️  DEBUG COMMANDS');
console.log('═══════════════════════════════════════════════════════');
console.log('📋 window.inspectQueue()  - View queued surveys');
console.log('🖥️  window.systemStatus()  - View system status');
console.log('═══════════════════════════════════════════════════════');

export default {
    setupAdminPanel,
    cleanupAdminPanel
};
