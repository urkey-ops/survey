// FILE: dataSync.js
// DEPENDS ON: appState.js (CONSTANTS, appState)

(function() {
    const { 
        STORAGE_KEY_STATE, 
        STORAGE_KEY_QUEUE, 
        STORAGE_KEY_ANALYTICS, 
        STORAGE_KEY_LAST_SYNC, 
        STORAGE_KEY_LAST_ANALYTICS_SYNC,
        ANALYTICS_SYNC_INTERVAL_MS,
        MAX_RETRIES,
        RETRY_DELAY_MS,
        SYNC_ENDPOINT,
        ANALYTICS_ENDPOINT
    } = window.CONSTANTS;
    const appState = window.appState;

    // ---------------------------------------------------------------------
    // --- UTILITIES ---
    // ---------------------------------------------------------------------

    /**
     * Generates a unique UUID for each survey submission
     */
    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for older browsers
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ---------------------------------------------------------------------
    // --- STORAGE & HELPERS ---
    // ---------------------------------------------------------------------

    function safeSetLocalStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error(`Local storage error for key ${key}:`, e);
            return false;
        }
    }

    function safeGetLocalStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error(`Local storage error for key ${key}:`, e);
            return null;
        }
    }
    
    function getSubmissionQueue() {
        return safeGetLocalStorage(STORAGE_KEY_QUEUE) || [];
    }
    
    function countUnsyncedRecords() {
        const queue = getSubmissionQueue();
        return queue.length;
    }

    function updateAdminCount() {
        const count = countUnsyncedRecords();
        const unsyncedCountDisplay = window.globals?.unsyncedCountDisplay;
        
        if (unsyncedCountDisplay) {
            unsyncedCountDisplay.textContent = `Unsynced Records: ${count}`;

            if (count > 0) {
                unsyncedCountDisplay.classList.remove('text-green-600');
                unsyncedCountDisplay.classList.add('text-red-600');
            } else {
                unsyncedCountDisplay.classList.remove('text-red-600');
                unsyncedCountDisplay.classList.add('text-green-600');
            }
        }
    }

    // ---------------------------------------------------------------------
    // --- ANALYTICS ---
    // ---------------------------------------------------------------------

    function recordAnalytics(eventType, data = {}) {
        try {
            const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
            
            analytics.push({
                timestamp: new Date().toISOString(),
                eventType: eventType,
                surveyId: appState.formData.id,
                ...data
            });
            
            // Keep only last 1000 analytics events to prevent storage overflow
            if (analytics.length > 1000) {
                analytics.splice(0, analytics.length - 1000);
            }
            
            safeSetLocalStorage(STORAGE_KEY_ANALYTICS, analytics);
        } catch (e) {
            console.warn('Failed to record analytics:', e);
        }
    }

    /**
     * Check if analytics should be synced (once per day)
     */
    function checkAndSyncAnalytics() {
        const lastSync = safeGetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC);
        const now = Date.now();
        
        // If never synced or more than 24 hours ago, sync analytics
        if (!lastSync || (now - lastSync) >= ANALYTICS_SYNC_INTERVAL_MS) {
            syncAnalytics(false);
        }
    }

    async function syncAnalytics(isManual = false) {
        if (!navigator.onLine) {
            console.warn('[ANALYTICS SYNC] Offline. Skipping sync.');
            if (isManual) updateSyncStatus('Offline. Analytics sync failed.');
            return;
        }

        const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS);
        if (!analytics || analytics.length === 0) {
            console.log('[ANALYTICS SYNC] No analytics data to sync.');
            if (isManual) updateSyncStatus('No analytics data to sync.');
            return true;
        }

        console.log(`[ANALYTICS SYNC] Attempting to sync ${analytics.length} records...`);
        if (isManual) updateSyncStatus(`Syncing ${analytics.length} analytics events... ⏳`);

        // Prepare analytics summary data
        const completions = analytics.filter(a => a.eventType === 'survey_completed');
        const abandonments = analytics.filter(a => a.eventType === 'survey_abandoned');
        
        // Calculate drop-off by question
        const dropoffByQuestion = {};
        abandonments.forEach(a => {
            const qId = a.questionId || 'unknown';
            dropoffByQuestion[qId] = (dropoffByQuestion[qId] || 0) + 1;
        });
        
        // Calculate average completion time
        const completionTimes = completions.map(c => c.totalTimeSeconds).filter(t => t > 0);
        const avgCompletionTime = completionTimes.length > 0 
            ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length 
            : 0;
        
        const payload = {
            analyticsType: 'summary',
            timestamp: new Date().toISOString(),
            totalCompletions: completions.length,
            totalAbandonments: abandonments.length,
            completionRate: completions.length > 0 
                ? ((completions.length / (completions.length + abandonments.length)) * 100).toFixed(1)
                : 0,
            avgCompletionTimeSeconds: avgCompletionTime.toFixed(1),
            dropoffByQuestion: dropoffByQuestion,
            rawEvents: analytics
        };

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(ANALYTICS_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`Server returned status: ${response.status}`);
                }
                
                const result = await response.json();
                
                if (result.success) {
                    console.log('[ANALYTICS SYNC] Success. Clearing local analytics.');
                    localStorage.removeItem(STORAGE_KEY_ANALYTICS);
                    safeSetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC, Date.now());
                    
                    if (isManual) {
                        updateSyncStatus(`Analytics synced successfully! (${analytics.length} events) ✅`);
                        setTimeout(() => updateSyncStatus(''), 4000);
                    }
                    
                    return true;
                }
                
            } catch (error) {
                if (attempt < MAX_RETRIES) {
                    console.warn(`[ANALYTICS SYNC] Attempt ${attempt} failed, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                } else {
                    throw error;
                }
            }
        }
        
        console.error('[ANALYTICS SYNC] All retry attempts failed.');
        if (isManual) {
            updateSyncStatus('Analytics sync failed ⚠️');
            setTimeout(() => updateSyncStatus(''), 4000);
        }
        return false;
    }

    // ---------------------------------------------------------------------
    // --- SURVEY DATA SYNC ---
    // ---------------------------------------------------------------------

    function updateSyncStatus(message) {
        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) {
            syncStatusMessage.textContent = message;
        }
    }

    let isSyncing = false;

    async function syncData(isManual = false) {
        if (isSyncing) {
            console.warn("Sync skipped: A sync operation is already in progress.");
            if (isManual) updateSyncStatus('Sync is already running... ⏳');
            return;
        }

        if (!navigator.onLine) {
            console.warn('[DATA SYNC] Offline. Skipping sync.');
            if (isManual) updateSyncStatus('Offline. Sync failed.');
            updateAdminCount();
            return;
        }

        const submissionQueue = getSubmissionQueue();
        
        if (submissionQueue.length === 0) {
            console.log('[DATA SYNC] Submission queue is empty.');
            if (isManual) {
                updateSyncStatus('No records to sync ✅');
                setTimeout(() => updateSyncStatus(''), 3000);
            }
            updateAdminCount();
            return;
        }

        try {
            isSyncing = true;

            const syncButton = window.globals?.syncButton;
            if (isManual && syncButton) {
                syncButton.disabled = true;
                syncButton.textContent = 'Syncing...';
            }

            console.log(`[DATA SYNC] Attempting to sync ${submissionQueue.length} submissions...`);
            if (isManual) updateSyncStatus(`Syncing ${submissionQueue.length} records... ⏳`);

            const payload = {
                submissions: submissionQueue
            };

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    const response = await fetch(SYNC_ENDPOINT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        throw new Error(`Server returned status: ${response.status}`);
                    }
                    
                    const syncResult = await response.json();
                    const successfulIds = syncResult.successfulIds || [];
                    
                    // Partial sync support - only remove successfully synced records
                    const newQueue = submissionQueue.filter(
                        record => !successfulIds.includes(record.id)
                    );
                    
                    if (newQueue.length > 0) {
                        safeSetLocalStorage(STORAGE_KEY_QUEUE, newQueue);
                        console.warn(`${successfulIds.length} records synced. ${newQueue.length} records remaining in queue.`);
                    } else {
                        localStorage.removeItem(STORAGE_KEY_QUEUE);
                    }
                    
                    safeSetLocalStorage(STORAGE_KEY_LAST_SYNC, Date.now());
                    updateAdminCount();

                    if (isManual) {
                        const statusText = newQueue.length === 0 
                            ? `Sync Successful (${submissionQueue.length} records cleared) ✅` 
                            : `Partial Sync Successful (${successfulIds.length} records cleared). ${newQueue.length} remain.`;

                        updateSyncStatus(statusText);
                        setTimeout(() => updateSyncStatus(''), 4000);
                    }
                    
                    return true;

                } catch (error) {
                    if (attempt < MAX_RETRIES) {
                        console.warn(`[DATA SYNC] Attempt ${attempt} failed, retrying...`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    } else {
                        throw error;
                    }
                }
            }
        } catch (error) {
            console.error(`[DATA SYNC] PERMANENT FAIL: ${error.message}`);
            if (isManual) updateSyncStatus('Manual Sync Failed ⚠️ (Check Console)');
        } finally {
            isSyncing = false;
            
            const syncButton = window.globals?.syncButton;
            if (isManual && syncButton) {
                syncButton.disabled = false;
                syncButton.textContent = 'Sync Data';
            }
            
            updateAdminCount();
        }
        
        return false;
    }

    function autoSync() {
        syncData(false);
        
        // Check if we should auto-sync analytics (once per day)
        checkAndSyncAnalytics();
    }

    // Expose functions globally
    window.dataHandlers = {
        generateUUID,
        safeSetLocalStorage,
        safeGetLocalStorage,
        getSubmissionQueue,
        countUnsyncedRecords,
        updateAdminCount,
        recordAnalytics,
        syncAnalytics,
        syncData,
        autoSync
    };
})();
