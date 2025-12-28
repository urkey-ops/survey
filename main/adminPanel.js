// FILE: main/adminPanel.js
// PURPOSE: Admin panel functionality and debug commands
// DEPENDENCIES: window.CONSTANTS, window.appState, window.dataHandlers, window.globals
// UPDATED: Added PWA update check button handler

/**
 * Get dependencies
 */
function getDeps() {
    return {
        CONSTANTS: window.CONSTANTS,
        appState: window.appState,
        dataHandlers: window.dataHandlers,
        globals: window.globals,
        uiHandlers: window.uiHandlers
    };
}

let adminPanelTimer = null;

/**
 * Reset admin panel auto-hide timer
 */
function resetAdminPanelTimer() {
    const { CONSTANTS } = getDeps();
    
    if (adminPanelTimer) {
        clearTimeout(adminPanelTimer);
    }
    
    adminPanelTimer = setTimeout(() => {
        toggleAdminPanel(false);
    }, CONSTANTS.ADMIN_PANEL_TIMEOUT_MS);
    
    window.adminPanelTimer = adminPanelTimer;
}

/**
 * Toggle admin panel visibility
 * @param {boolean} show - Whether to show or hide the panel
 */
function toggleAdminPanel(show) {
    const { globals, appState, dataHandlers } = getDeps();
    const adminControls = globals.adminControls;
    const syncStatusMessage = globals.syncStatusMessage;
    
    if (!adminControls) return;
    
    if (show) {
        console.log('[ADMIN] Opening admin panel');
        adminControls.classList.remove('hidden');
        dataHandlers.updateAdminCount();
        if (syncStatusMessage) syncStatusMessage.textContent = '';
        resetAdminPanelTimer();
    } else {
        console.log('[ADMIN] Closing admin panel');
        adminControls.classList.add('hidden');
        appState.adminClickCount = 0;
        if (adminPanelTimer) {
            clearTimeout(adminPanelTimer);
            window.adminPanelTimer = adminPanelTimer = null;
        }
    }
}

/**
 * View analytics in console (admin function)
 * @returns {Array} Analytics data
 */
function viewAnalytics() {
    const { CONSTANTS, dataHandlers } = getDeps();
    const analytics = dataHandlers.safeGetLocalStorage(CONSTANTS.STORAGE_KEY_ANALYTICS) || [];
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 SURVEY ANALYTICS REPORT');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Events: ${analytics.length}`);
    
    const abandonments = analytics.filter(a => a.eventType === 'survey_abandoned');
    const completions = analytics.filter(a => a.eventType === 'survey_completed');
    
    console.log(`\n✅ Completions: ${completions.length}`);
    console.log(`❌ Abandonments: ${abandonments.length}`);
    
    if (completions.length + abandonments.length > 0) {
        const completionRate = ((completions.length / (completions.length + abandonments.length)) * 100).toFixed(1);
        console.log(`📈 Completion Rate: ${completionRate}%`);
    }
    
    if (abandonments.length > 0) {
        console.log('\n--- Drop-off by Question ---');
        const dropoffByQuestion = {};
        abandonments.forEach(a => {
            const qId = a.questionId || 'unknown';
            dropoffByQuestion[qId] = (dropoffByQuestion[qId] || 0) + 1;
        });
        
        const sortedDropoff = Object.entries(dropoffByQuestion)
            .sort(([,a], [,b]) => b - a)
            .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {});
        
        console.table(sortedDropoff);
    }
    
    if (completions.length > 0) {
        const times = completions.map(c => c.totalTimeSeconds).filter(t => t > 0);
        if (times.length > 0) {
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);
            
            console.log('\n--- Completion Times (seconds) ---');
            console.log(`Average: ${avgTime.toFixed(1)}s`);
            console.log(`Minimum: ${minTime}s`);
            console.log(`Maximum: ${maxTime}s`);
        }
    }
    
    const lastSync = dataHandlers.safeGetLocalStorage(CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC);
    if (lastSync) {
        const hoursSinceSync = ((Date.now() - lastSync) / (1000 * 60 * 60)).toFixed(1);
        console.log(`\n🔄 Last synced: ${hoursSinceSync} hours ago`);
    } else {
        console.log('\n🔄 Never synced to server');
    }
    
    console.log('\n💾 Full data available in return value');
    console.log('═══════════════════════════════════════════════════════');
    
    return analytics;
}

/**
 * Setup debug commands (if enabled)
 */
function setupDebugCommands() {
    const { CONSTANTS, appState, dataHandlers } = getDeps();
    
    if (!CONSTANTS.FEATURES.enableDebugCommands) {
        return;
    }
    
    /**
     * Debug function to inspect queue
     */
    window.inspectQueue = function() {
        const queue = dataHandlers.getSubmissionQueue();
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔍 SUBMISSION QUEUE INSPECTION');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`Total records: ${queue.length}`);
        
        if (queue.length === 0) {
            console.log('Queue is empty ✓');
        } else {
            queue.forEach((record, index) => {
                console.log(`\n📄 Record ${index + 1}:`);
                console.log(`   ID: ${record.id || '⚠️ MISSING'}`);
                console.log(`   Timestamp: ${record.timestamp}`);
                console.log(`   Status: ${record.sync_status || 'unknown'}`);
                console.log(`   Abandoned: ${record.abandonedAt ? 'Yes' : 'No'}`);
                if (record.abandonedAtQuestion) {
                    console.log(`   Dropped at: ${record.abandonedAtQuestion}`);
                }
            });
            
            console.log('\n💾 Full queue data:');
            console.table(queue.map(r => ({
                ID: r.id?.substring(0, 8) + '...',
                Status: r.sync_status,
                Abandoned: r.abandonedAt ? 'Yes' : 'No',
                Question: r.abandonedAtQuestion || 'Completed'
            })));
        }
        
        console.log('═══════════════════════════════════════════════════════');
        return queue;
    };

    /**
     * Debug function to manually clear queue
     */
    window.clearQueue = function() {
        if (confirm('⚠️ WARNING: This will permanently delete all unsynced data.\n\nAre you sure you want to continue?')) {
            const queueLength = dataHandlers.getSubmissionQueue().length;
            localStorage.removeItem(CONSTANTS.STORAGE_KEY_QUEUE);
            dataHandlers.updateAdminCount();
            console.log(`✅ Queue cleared (${queueLength} records removed)`);
        } else {
            console.log('❌ Clear queue cancelled');
        }
    };

    /**
     * Debug function to view system status
     */
    window.systemStatus = function() {
        const queue = dataHandlers.getSubmissionQueue();
        const analytics = dataHandlers.safeGetLocalStorage(CONSTANTS.STORAGE_KEY_ANALYTICS) || [];
        const lastSync = dataHandlers.safeGetLocalStorage(CONSTANTS.STORAGE_KEY_LAST_SYNC);
        const lastAnalyticsSync = dataHandlers.safeGetLocalStorage(CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC);
        
        console.log('═══════════════════════════════════════════════════════');
        console.log('🖥️  SYSTEM STATUS');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`Kiosk ID: ${window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN'}`);
        console.log(`Current Question: ${appState.currentQuestionIndex + 1}`);
        console.log(`Survey In Progress: ${appState.currentQuestionIndex > 0 ? 'Yes' : 'No'}`);
        console.log(`\nQueue Status:`);
        console.log(`  Unsynced Records: ${queue.length}`);
        console.log(`  Last Sync: ${lastSync ? new Date(lastSync).toLocaleString() : 'Never'}`);
        console.log(`\nAnalytics:`);
        console.log(`  Events Recorded: ${analytics.length}`);
        console.log(`  Last Sync: ${lastAnalyticsSync ? new Date(lastAnalyticsSync).toLocaleString() : 'Never'}`);
        console.log(`\nNetwork:`);
        console.log(`  Status: ${navigator.onLine ? '🟢 Online' : '🔴 Offline'}`);
        console.log(`\nStorage:`);
        try {
            const used = new Blob([JSON.stringify(localStorage)]).size;
            const usedMB = (used / 1024 / 1024).toFixed(2);
            console.log(`  Used: ~${usedMB} MB`);
        } catch (e) {
            console.log(`  Unable to calculate`);
        }
        console.log(`\nFeatures:`);
        Object.entries(CONSTANTS.FEATURES).forEach(([key, value]) => {
            console.log(`  ${key}: ${value ? '✓' : '✗'}`);
        });
        console.log('═══════════════════════════════════════════════════════');
    };

    console.log('═══════════════════════════════════════════════════════');
    console.log('🛠️  DEBUG COMMANDS AVAILABLE');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 window.inspectQueue()        - View all queued submissions');
    console.log('🗑️  window.clearQueue()          - Manually clear the queue');
    console.log('📊 window.viewSurveyAnalytics() - View analytics data');
    console.log('🖥️  window.systemStatus()        - View system status');
    console.log('🔄 window.syncAnalyticsNow()    - Force analytics sync');
    console.log('═══════════════════════════════════════════════════════');
}

/**
 * NEW: Setup Check Update button
 * Allows manual PWA update checking
 */
function setupCheckUpdateButton() {
    const checkUpdateButton = document.getElementById('checkUpdateButton');
    
    if (!checkUpdateButton) {
        console.warn('[ADMIN] Check Update button not found in HTML');
        return;
    }
    
    checkUpdateButton.addEventListener('click', async () => {
        console.log('[ADMIN] 🔄 Manual update check triggered');
        
        // Disable button during check
        checkUpdateButton.disabled = true;
        const originalText = checkUpdateButton.textContent;
        checkUpdateButton.textContent = 'Checking...';
        
        try {
            if (window.pwaUpdateManager) {
                // Force update check and apply if available
                await window.pwaUpdateManager.forceUpdate();
            } else {
                console.error('[ADMIN] PWA Update Manager not initialized');
                alert('Update manager not available. Please refresh the page.');
            }
        } catch (error) {
            console.error('[ADMIN] Update check failed:', error);
            alert('Update check failed. Check console for details.');
        } finally {
            // Re-enable button after 2 seconds
            setTimeout(() => {
                checkUpdateButton.disabled = false;
                checkUpdateButton.textContent = originalText;
            }, 2000);
        }
        
        // Reset admin panel timer
        resetAdminPanelTimer();
    });
    
    console.log('[ADMIN] ✅ Check Update button configured');
}

/**
 * Setup all admin panel functionality
 */
export function setupAdminPanel() {
    const { CONSTANTS, appState, globals, dataHandlers, uiHandlers } = getDeps();
    const { 
        mainTitle, 
        hideAdminButton, 
        syncButton, 
        syncAnalyticsButton, 
        adminClearButton, 
        adminControls 
    } = globals;
    
    if (!CONSTANTS.FEATURES.enableAdminPanel) {
        if (adminControls) {
            adminControls.remove();
            console.log('[ADMIN] ⚠️  Admin panel disabled by feature flag');
        }
        return;
    }
    
    if (!adminControls) {
        console.warn('[ADMIN] Admin controls element not found');
        return;
    }
    
    // Hide admin panel initially
    adminControls.classList.add('hidden');
    
    // Setup debug commands
    setupDebugCommands();
    
    // Title click to show admin panel
    if (mainTitle) {
        mainTitle.addEventListener('click', () => {
            appState.adminClickCount++;
            if (appState.adminClickCount >= 5) {
                toggleAdminPanel(true);
                appState.adminClickCount = 0;
            }
        });
    }

    // Hide admin panel button
    if (hideAdminButton) {
        hideAdminButton.addEventListener('click', () => {
            toggleAdminPanel(false);
        });
    }

    // Manual sync button
    if (syncButton) {
        syncButton.addEventListener('click', async () => {
            console.log('[ADMIN] Manual sync triggered');
            await dataHandlers.syncData(true);
            resetAdminPanelTimer();
        });
    }
    
    // Manual analytics sync button
    if (syncAnalyticsButton) {
        syncAnalyticsButton.addEventListener('click', async () => {
            console.log('[ADMIN] Manual analytics sync triggered');
            await dataHandlers.syncAnalytics(true);
            resetAdminPanelTimer();
        });
    }

    // Clear all data button
    if (adminClearButton) {
        adminClearButton.addEventListener('click', () => {
            const queue = dataHandlers.getSubmissionQueue();
            const analytics = dataHandlers.safeGetLocalStorage(CONSTANTS.STORAGE_KEY_ANALYTICS) || [];
            
            const confirmMessage = `⚠️ WARNING: Delete ALL local data?\n\n` +
                `• ${queue.length} unsynced survey(s)\n` +
                `• ${analytics.length} analytics event(s)\n` +
                `• Current survey progress\n\n` +
                `This action is PERMANENT and cannot be undone.`;
            
            if (confirm(confirmMessage)) {
                console.log('[ADMIN] Clearing all local data...');
                uiHandlers.clearAllTimers();
                
                localStorage.removeItem(CONSTANTS.STORAGE_KEY_STATE); 
                localStorage.removeItem(CONSTANTS.STORAGE_KEY_QUEUE);
                localStorage.removeItem(CONSTANTS.STORAGE_KEY_ANALYTICS);
                
                console.log('✅ All data cleared');
                uiHandlers.performKioskReset();
            } else {
                console.log('❌ Clear data cancelled');
            }
            resetAdminPanelTimer();
        });
    }
    
    // NEW: Setup Check Update button
    setupCheckUpdateButton();
    
    // Keep admin panel open on interaction
    if (adminControls) {
        adminControls.addEventListener('mouseenter', resetAdminPanelTimer);
        adminControls.addEventListener('click', resetAdminPanelTimer);
        adminControls.addEventListener('touchstart', resetAdminPanelTimer, { passive: true });
    }
    
    // Expose global functions
    window.viewSurveyAnalytics = viewAnalytics;
    window.syncAnalyticsNow = () => dataHandlers.syncAnalytics(true);
    
    console.log('[ADMIN] ✅ Admin panel configured');
}

export default {
    setupAdminPanel
};
