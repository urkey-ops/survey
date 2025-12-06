// FILE: main.js
// UPDATED: All priority fixes applied - proper error handling, feature flags, cleanup improvements
// DEPENDS ON: appState.js (CONSTANTS, appState, globals, adminPanelTimer), dataSync.js (dataHandlers), kioskUI.js (uiHandlers)

(function() {
    const { 
        STORAGE_KEY_ANALYTICS, 
        STORAGE_KEY_QUEUE, 
        STORAGE_KEY_STATE, 
        STORAGE_KEY_LAST_ANALYTICS_SYNC,
        ADMIN_PANEL_TIMEOUT_MS,
        STATUS_MESSAGE_AUTO_CLEAR_MS,
        VISIBILITY_CHANGE_DELAY_MS,
        FEATURES
    } = window.CONSTANTS;
    const appState = window.appState;
    const { 
        safeGetLocalStorage, updateAdminCount, syncData, syncAnalytics 
    } = window.dataHandlers;
    
    let adminPanelTimer = window.adminPanelTimer;
    let isKioskVisible = window.isKioskVisible;

    // ---------------------------------------------------------------------
    // --- ADMIN ACCESS LOGIC ---
    // ---------------------------------------------------------------------

    /**
     * Reset admin panel auto-hide timer
     */
    function resetAdminPanelTimer() {
        if (adminPanelTimer) {
            clearTimeout(adminPanelTimer);
        }
        
        adminPanelTimer = setTimeout(() => {
            toggleAdminPanel(false);
        }, ADMIN_PANEL_TIMEOUT_MS);
        window.adminPanelTimer = adminPanelTimer;
    }
    
    /**
     * View analytics in console (admin function)
     * @returns {Array} Analytics data
     */
    function viewAnalytics() {
        const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
        
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
            
            // Sort by count descending
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
        
        const lastSync = safeGetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC);
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
     * Setup admin panel and debug commands
     */
    function setupAdminAccess() {
        const mainTitle = window.globals.mainTitle;
        const hideAdminButton = window.globals.hideAdminButton;
        const syncButton = window.globals.syncButton;
        const syncAnalyticsButton = window.globals.syncAnalyticsButton;
        const adminClearButton = window.globals.adminClearButton;
        const adminControls = window.globals.adminControls;

        // PRIORITY FIX #8: Debug commands only when feature flag enabled
        if (FEATURES.enableDebugCommands) {
            /**
             * Debug function to inspect queue
             * @returns {Array} Queue data
             */
            window.inspectQueue = function() {
                const queue = window.dataHandlers.getSubmissionQueue();
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
                    const queueLength = window.dataHandlers.getSubmissionQueue().length;
                    localStorage.removeItem(window.CONSTANTS.STORAGE_KEY_QUEUE);
                    window.dataHandlers.updateAdminCount();
                    console.log(`✅ Queue cleared (${queueLength} records removed)`);
                } else {
                    console.log('❌ Clear queue cancelled');
                }
            };

            /**
             * Debug function to view system status
             */
            window.systemStatus = function() {
                const queue = window.dataHandlers.getSubmissionQueue();
                const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
                const lastSync = safeGetLocalStorage(window.CONSTANTS.STORAGE_KEY_LAST_SYNC);
                const lastAnalyticsSync = safeGetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC);
                
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
                Object.entries(FEATURES).forEach(([key, value]) => {
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
                await syncData(true);
                resetAdminPanelTimer();
            });
        }
        
        // Manual analytics sync button
        if (syncAnalyticsButton) {
            syncAnalyticsButton.addEventListener('click', async () => {
                console.log('[ADMIN] Manual analytics sync triggered');
                await syncAnalytics(true);
                resetAdminPanelTimer();
            });
        }

        // Clear all data button
        if (adminClearButton) {
            adminClearButton.addEventListener('click', () => {
                const queue = window.dataHandlers.getSubmissionQueue();
                const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
                
                const confirmMessage = `⚠️ WARNING: Delete ALL local data?\n\n` +
                    `• ${queue.length} unsynced survey(s)\n` +
                    `• ${analytics.length} analytics event(s)\n` +
                    `• Current survey progress\n\n` +
                    `This action is PERMANENT and cannot be undone.`;
                
                if (confirm(confirmMessage)) {
                    console.log('[ADMIN] Clearing all local data...');
                    window.uiHandlers.clearAllTimers();
                    
                    localStorage.removeItem(STORAGE_KEY_STATE); 
                    localStorage.removeItem(STORAGE_KEY_QUEUE);
                    localStorage.removeItem(STORAGE_KEY_ANALYTICS);
                    
                    console.log('✅ All data cleared');
                    window.uiHandlers.performKioskReset();
                } else {
                    console.log('❌ Clear data cancelled');
                }
                resetAdminPanelTimer();
            });
        }
        
        // Keep admin panel open on interaction
        if (adminControls) {
            adminControls.addEventListener('mouseenter', resetAdminPanelTimer);
            adminControls.addEventListener('click', resetAdminPanelTimer);
            adminControls.addEventListener('touchstart', resetAdminPanelTimer, { passive: true });
        }
        
        // Expose global functions
        window.viewSurveyAnalytics = viewAnalytics;
        window.syncAnalyticsNow = () => syncAnalytics(true);
    }

    /**
     * Toggle admin panel visibility
     * @param {boolean} show - Whether to show or hide the panel
     */
    function toggleAdminPanel(show) {
        const adminControls = window.globals.adminControls;
        const syncStatusMessage = window.globals.syncStatusMessage;
        
        if (!adminControls) return;
        
        if (show) {
            console.log('[ADMIN] Opening admin panel');
            adminControls.classList.remove('hidden');
            updateAdminCount();
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

    // ---------------------------------------------------------------------
    // --- NETWORK STATUS MONITORING ---
    // ---------------------------------------------------------------------

    /**
     * Handle online event
     */
    function handleOnline() {
        console.log('[NETWORK] ✅ Connection restored');
        
        // PRIORITY FIX #5: User-facing feedback
        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) {
            syncStatusMessage.textContent = '✅ Connection restored. Syncing...';
            syncStatusMessage.style.color = '#16a34a'; // green-600
            setTimeout(() => {
                syncStatusMessage.textContent = '';
            }, STATUS_MESSAGE_AUTO_CLEAR_MS);
        }
        
        // Attempt sync after short delay
        setTimeout(() => {
            syncData(false);
        }, 1000);
    }

    /**
     * Handle offline event
     */
    function handleOffline() {
        console.log('[NETWORK] ❌ Connection lost - Operating in offline mode');
        
        // PRIORITY FIX #5: User-facing feedback
        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) {
            syncStatusMessage.textContent = '⚠️ Offline mode - Data saved locally';
            syncStatusMessage.style.color = '#ea580c'; // orange-600
        }
    }

    // ---------------------------------------------------------------------
    // --- VISIBILITY CHANGE HANDLING ---
    // ---------------------------------------------------------------------

    let visibilityTimeout;

    /**
     * Handle visibility change events
     */
    function handleVisibilityChange() {
        if (document.hidden) {
            console.log('[VISIBILITY] Document hidden - starting pause timer');
            visibilityTimeout = setTimeout(() => {
                console.log('[VISIBILITY] Kiosk hidden for 5s+ - pausing timers');
                isKioskVisible = false;
                window.isKioskVisible = isKioskVisible;
                window.uiHandlers.clearAllTimers();
            }, VISIBILITY_CHANGE_DELAY_MS);
        } else {
            clearTimeout(visibilityTimeout);
            
            if (!isKioskVisible) {
                console.log('[VISIBILITY] Kiosk visible - resuming timers');
                isKioskVisible = true;
                window.isKioskVisible = isKioskVisible;
                
                if (appState.currentQuestionIndex > 0) {
                    window.uiHandlers.resetInactivityTimer();
                } else {
                    window.uiHandlers.startPeriodicSync();
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    // --- HEARTBEAT LOGGING ---
    // ---------------------------------------------------------------------

    /**
     * Periodic heartbeat to log system status
     */
    function startHeartbeat() {
        setInterval(() => {
            const queue = window.dataHandlers.getSubmissionQueue();
            const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
            
            console.log(`[HEARTBEAT] ❤️  Kiosk alive | Queue: ${queue.length} | Analytics: ${analytics.length} | Question: ${appState.currentQuestionIndex + 1} | Online: ${navigator.onLine ? '✓' : '✗'}`);
        }, 15 * 60 * 1000); // Every 15 minutes
    }

    // ---------------------------------------------------------------------
    // --- INITIALIZATION ---
    // ---------------------------------------------------------------------

    document.addEventListener('DOMContentLoaded', () => {
        console.log('[INIT] DOM Content Loaded - Initializing kiosk...');
        
        // Assign DOM elements to global variables
        window.globals.questionContainer = document.getElementById('questionContainer');
        window.globals.nextBtn = document.getElementById('nextBtn');
        window.globals.prevBtn = document.getElementById('prevBtn');
        window.globals.mainTitle = document.getElementById('mainTitle');
        window.globals.progressBar = document.getElementById('progressBar');
        window.globals.kioskStartScreen = document.getElementById('kioskStartScreen');
        window.globals.kioskVideo = document.getElementById('kioskVideo');
        window.globals.adminControls = document.getElementById('adminControls');
        window.globals.syncButton = document.getElementById('syncButton');
        window.globals.adminClearButton = document.getElementById('adminClearButton');
        window.globals.hideAdminButton = document.getElementById('hideAdminButton');
        window.globals.unsyncedCountDisplay = document.getElementById('unsyncedCountDisplay');
        window.globals.syncStatusMessage = document.getElementById('syncStatusMessage');
        window.globals.syncAnalyticsButton = document.getElementById('syncAnalyticsButton');

        // Get references to required elements
        const questionContainer = window.globals.questionContainer;
        const nextBtn = window.globals.nextBtn;
        const prevBtn = window.globals.prevBtn;
        const mainTitle = window.globals.mainTitle;
        const kioskStartScreen = window.globals.kioskStartScreen;
        const kioskVideo = window.globals.kioskVideo;
        const adminControls = window.globals.adminControls;

        // Critical element check
        const missingElements = [];
        if (!questionContainer) missingElements.push('questionContainer');
        if (!nextBtn) missingElements.push('nextBtn');
        if (!prevBtn) missingElements.push('prevBtn');
        if (!mainTitle) missingElements.push('mainTitle');
        if (!kioskStartScreen) missingElements.push('kioskStartScreen');
        if (!kioskVideo) missingElements.push('kioskVideo');
        
        if (missingElements.length > 0) {
            console.error(`[INIT] ❌ CRITICAL ERROR: Missing essential HTML elements: ${missingElements.join(', ')}`);
            document.body.innerHTML = `
                <div style="padding: 50px; text-align: center; font-family: system-ui;">
                    <h1 style="color: #dc2626; font-size: 24px; margin-bottom: 20px;">Application Error</h1>
                    <p style="color: #6b7280; font-size: 16px;">Could not load survey interface.</p>
                    <p style="color: #9ca3af; font-size: 14px; margin-top: 10px;">Missing elements: ${missingElements.join(', ')}</p>
                    <button onclick="location.reload()" style="margin-top: 30px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Reload Page</button>
                </div>
            `;
            return;
        }
        
        console.log('[INIT] ✅ All essential elements found');
        
        // Get UI handlers
        const { 
            resetInactivityTimer, 
            addInactivityListeners, 
            goNext, 
            goPrev, 
            showQuestion, 
            showStartScreen
        } = window.uiHandlers;

        // Setup navigation
        nextBtn.addEventListener('click', goNext);
        prevBtn.addEventListener('click', goPrev);
        console.log('[INIT] ✅ Navigation buttons configured');
        
        // Setup activity tracking
        addInactivityListeners();
        console.log('[INIT] ✅ Inactivity listeners attached');

        // Setup admin panel (if feature enabled)
        if (FEATURES.enableAdminPanel && adminControls) {
            adminControls.classList.add('hidden');
            setupAdminAccess();
            console.log('[INIT] ✅ Admin panel configured');
        } else if (!FEATURES.enableAdminPanel && adminControls) {
            adminControls.remove();
            console.log('[INIT] ⚠️  Admin panel disabled by feature flag');
        }
        
        // Initialize survey state
        if (appState.currentQuestionIndex > 0) {
            console.log(`[INIT] 🔄 Resuming survey at question ${appState.currentQuestionIndex + 1}`);
            
            if (kioskStartScreen) {
                kioskStartScreen.classList.add('hidden');
                if (kioskVideo) {
                    kioskVideo.pause();
                }
            }
            
            showQuestion(appState.currentQuestionIndex);
            resetInactivityTimer();
        } else {
            console.log('[INIT] 🆕 Starting fresh survey');
            showStartScreen();
        }
        
        // Setup network monitoring
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        console.log('[INIT] ✅ Network monitoring active');
        
        // Setup visibility change handler
        document.addEventListener('visibilitychange', handleVisibilityChange);
        console.log('[INIT] ✅ Visibility change handler active');
        
        // Start heartbeat logging
        startHeartbeat();
        console.log('[INIT] ✅ Heartbeat started (15 min interval)');
        
        console.log('[INIT] ✅ Initialization complete');
        console.log('═══════════════════════════════════════════════════════');
    });
})();
