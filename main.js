// FILE: main.js
// DEPENDS ON: appState.js (CONSTANTS, appState, globals, adminPanelTimer), dataSync.js (dataHandlers), kioskUI.js (uiHandlers)

(function() {
    const { 
        STORAGE_KEY_ANALYTICS, 
        STORAGE_KEY_QUEUE, 
        STORAGE_KEY_STATE, 
        STORAGE_KEY_LAST_ANALYTICS_SYNC,
        ADMIN_PANEL_TIMEOUT_MS
    } = window.CONSTANTS;
    const appState = window.appState;
    let { 
        questionContainer, nextBtn, prevBtn, mainTitle, progressBar, 
        kioskStartScreen, kioskVideo, adminControls, syncButton, 
        adminClearButton, hideAdminButton, unsyncedCountDisplay, 
        syncStatusMessage, syncAnalyticsButton 
    } = window.globals;
    const { 
        safeGetLocalStorage, updateAdminCount, syncData, syncAnalytics 
    } = window.dataHandlers;
    const { 
        clearAllTimers, resetInactivityTimer, addInactivityListeners, goNext, goPrev, 
        showQuestion, showStartScreen, performKioskReset, getTotalSurveyTime 
    } = window.uiHandlers;
    
    let adminPanelTimer = window.adminPanelTimer;
    let isKioskVisible = window.isKioskVisible;


    // ---------------------------------------------------------------------
    // --- ADMIN ACCESS LOGIC (Moved from Part 3) ---
    // ---------------------------------------------------------------------

    /**
     * Resets admin panel auto-hide timer
     */
    function resetAdminPanelTimer() {
        if (adminPanelTimer) {
            clearTimeout(adminPanelTimer);
        }
        
        adminPanelTimer = setTimeout(() => {
            toggleAdminPanel(false);
        }, ADMIN_PANEL_TIMEOUT_MS);
        window.adminPanelTimer = adminPanelTimer; // Update global reference
    }
    
    /**
     * View analytics data in console
     */
    function viewAnalytics() {
        const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
        
        console.log('=== SURVEY ANALYTICS ===');
        console.log(`Total Events: ${analytics.length}`);
        
        const abandonments = analytics.filter(a => a.eventType === 'survey_abandoned');
        const completions = analytics.filter(a => a.eventType === 'survey_completed');
        
        console.log(`\nCompletions: ${completions.length}`);
        console.log(`Abandonments: ${abandonments.length}`);
        
        if (abandonments.length > 0) {
            console.log('\n--- Drop-off by Question ---');
            const dropoffByQuestion = {};
            abandonments.forEach(a => {
                const qId = a.questionId || 'unknown';
                dropoffByQuestion[qId] = (dropoffByQuestion[qId] || 0) + 1;
            });
            console.table(dropoffByQuestion);
        }
        
        if (completions.length > 0) {
            const times = completions.map(c => c.totalTimeSeconds).filter(t => t > 0);
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);
            
            console.log('\n--- Completion Times (seconds) ---');
            console.log(`Average: ${avgTime.toFixed(1)}s`);
            console.log(`Min: ${minTime}s`);
            console.log(`Max: ${maxTime}s`);
        }
        
        const lastSync = safeGetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC);
        if (lastSync) {
            const hoursSinceSync = ((Date.now() - lastSync) / (1000 * 60 * 60)).toFixed(1);
            console.log(`\nLast synced: ${hoursSinceSync} hours ago`);
        } else {
            console.log('\nNever synced to server');
        }
        
        console.log('\nFull data available in:', analytics);
        return analytics;
    }

    function setupAdminAccess() {
        if (mainTitle) {
            mainTitle.addEventListener('click', () => {
                appState.adminClickCount++;
                if (appState.adminClickCount >= 5) {
                    toggleAdminPanel(true);
                    appState.adminClickCount = 0;
                }
            });
        }

        if (hideAdminButton) {
            hideAdminButton.addEventListener('click', () => {
                toggleAdminPanel(false);
            });
        }

        if (syncButton) {
            syncButton.addEventListener('click', () => {
                syncData(true);
                resetAdminPanelTimer();
            });
        }
        
        // Analytics sync button
        if (syncAnalyticsButton) {
            syncAnalyticsButton.addEventListener('click', () => {
                syncAnalytics(true);
                resetAdminPanelTimer();
            });
        }

        if (adminClearButton) {
            adminClearButton.addEventListener('click', () => {
                if (confirm("WARNING: Are you sure you want to delete ALL local survey data (Queue AND In-Progress)? This is permanent.")) {
                    clearAllTimers();
                    localStorage.removeItem(STORAGE_KEY_STATE); 
                    localStorage.removeItem(STORAGE_KEY_QUEUE);
                    performKioskReset();
                }
                resetAdminPanelTimer();
            });
        }
        
        // Reset timer on any interaction with admin controls
        if (adminControls) {
            adminControls.addEventListener('mouseenter', resetAdminPanelTimer);
            adminControls.addEventListener('click', resetAdminPanelTimer);
            adminControls.addEventListener('touchstart', resetAdminPanelTimer);
        }
        
        // Make analytics viewable in console
        window.viewSurveyAnalytics = viewAnalytics;
        window.syncAnalyticsNow = () => syncAnalytics(true);
    }

    function toggleAdminPanel(show) {
        if (adminControls) {
            if (show) {
                adminControls.classList.remove('hidden');
                updateAdminCount();
                if (syncStatusMessage) syncStatusMessage.textContent = '';
                resetAdminPanelTimer();
            } else {
                adminControls.classList.add('hidden');
                appState.adminClickCount = 0;
                if (adminPanelTimer) {
                    clearTimeout(adminPanelTimer);
                    window.adminPanelTimer = adminPanelTimer = null;
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    // --- INITIALIZATION (Moved from Part 3) ---
    // ---------------------------------------------------------------------

    document.addEventListener('DOMContentLoaded', () => {

        // Assign DOM elements to global variables (via window.globals setters)
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

        // Re-read global DOM references after assignment
        ({ questionContainer, nextBtn, prevBtn, mainTitle, kioskStartScreen, kioskVideo, adminControls } = window.globals);

        if (!questionContainer || !nextBtn || !prevBtn || !mainTitle || !kioskStartScreen || !kioskVideo) {
            console.error("CRITICAL ERROR: Missing essential HTML elements.");
            document.body.innerHTML = '<h1 style="color: red; text-align: center; padding-top: 50px;">Application Error: Could not load survey.</h1>';
            return;
        }

        nextBtn.addEventListener('click', goNext);
        prevBtn.addEventListener('click', goPrev);
        
        addInactivityListeners();

        if (adminControls) {
            adminControls.classList.add('hidden');
            setupAdminAccess();
        }
        
        // Check if we're resuming a survey in progress
        if (appState.currentQuestionIndex > 0) {
            console.log(`[INIT] Resuming survey at question ${appState.currentQuestionIndex + 1}`);
            
            // Hide start screen immediately if resuming
            if (kioskStartScreen) {
                kioskStartScreen.classList.add('hidden');
                if (kioskVideo) {
                    kioskVideo.pause();
                }
            }
            
            // Show the saved question
            showQuestion(appState.currentQuestionIndex);
            resetInactivityTimer();
        } else {
            console.log('[INIT] Starting fresh survey');
            // Fresh start - show the start screen
            showStartScreen();
        }
        
        // Heartbeat logging every 15 minutes
        setInterval(() => {
            console.log(`[HEARTBEAT] Kiosk alive. Queue: ${window.dataHandlers.countUnsyncedRecords()} | Current Q: ${appState.currentQuestionIndex}`);
        }, 15 * 60 * 1000);
        
        // Network status detection
        window.addEventListener('online', () => {
            console.log('[NETWORK] Connection restored. Attempting sync...');
            syncData(false);
        });

        window.addEventListener('offline', () => {
            console.log('[NETWORK] Connection lost. Operating in offline mode.');
        });
        
        // Visibility change handler - pause timers when hidden
        let visibilityTimeout;
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                visibilityTimeout = setTimeout(() => {
                    console.log('[VISIBILITY] Kiosk hidden for 5s+ - pausing timers');
                    isKioskVisible = false;
                    window.isKioskVisible = isKioskVisible; // Update global reference
                    clearAllTimers();
                }, 5000);
            } else {
                clearTimeout(visibilityTimeout);
                
                if (!isKioskVisible) {
                    console.log('[VISIBILITY] Kiosk visible - resuming timers');
                    isKioskVisible = true;
                    window.isKioskVisible = isKioskVisible; // Update global reference
                    if (appState.currentQuestionIndex > 0) {
                        resetInactivityTimer();
                    } else {
                        window.uiHandlers.startPeriodicSync();
                    }
                }
            }
        });
    });
})();
