// FILE: dataSync.js
// UPDATED: All priority fixes applied - proper error handling, timestamp standardization, queue management, analytics size limit

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
        ANALYTICS_ENDPOINT,
        MAX_QUEUE_SIZE,
        MAX_ANALYTICS_SIZE
    } = window.CONSTANTS;
    const appState = window.appState;

    // ---------------------------------------------------------------------
    // --- UTILITIES ---
    // ---------------------------------------------------------------------

    /**
     * Generates a unique UUID for each survey submission
     * @returns {string} UUID v4 format string
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

    /**
     * Calculate exponential backoff delay
     * @param {number} attempt - Current retry attempt (1-indexed)
     * @returns {number} Delay in milliseconds
     */
    function getExponentialBackoffDelay(attempt) {
        return RETRY_DELAY_MS * Math.pow(2, attempt - 1);
    }

    // ---------------------------------------------------------------------
    // --- STORAGE & HELPERS ---
    // ---------------------------------------------------------------------

    /**
     * Safely write to localStorage with error handling
     * @param {string} key - Storage key
     * @param {*} value - Value to store (will be JSON stringified)
     * @returns {boolean} Success status
     */
    function safeSetLocalStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error(`[STORAGE] Failed to write key '${key}':`, e.message);
            
            // PRIORITY FIX #5: User-facing error for storage failures
            if (e.name === 'QuotaExceededError') {
                showUserError('Storage limit reached. Please sync data or contact support.');
            }
            return false;
        }
    }

    /**
     * Safely read from localStorage with error handling
     * @param {string} key - Storage key
     * @returns {*|null} Parsed value or null if not found/error
     */
    function safeGetLocalStorage(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error(`[STORAGE] Failed to read key '${key}':`, e.message);
            return null;
        }
    }
    
    /**
     * Get current submission queue
     * @returns {Array} Array of submission records
     */
    function getSubmissionQueue() {
        return safeGetLocalStorage(STORAGE_KEY_QUEUE) || [];
    }
    
    /**
     * Count unsynced records in queue
     * @returns {number} Number of unsynced records
     */
    function countUnsyncedRecords() {
        const queue = getSubmissionQueue();
        return queue.length;
    }

    /**
     * Update admin panel with current queue count
     */
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

    // PRIORITY FIX #5: User-facing error messages
    /**
     * Display error message to user (non-intrusive)
     * @param {string} message - Error message to display
     */
    function showUserError(message) {
        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) {
            syncStatusMessage.textContent = `⚠️ ${message}`;
            syncStatusMessage.style.color = '#dc2626'; // red-600
            
            // Auto-clear after 10 seconds
            setTimeout(() => {
                if (syncStatusMessage.textContent.includes(message)) {
                    syncStatusMessage.textContent = '';
                }
            }, 10000);
        }
    }

    // ---------------------------------------------------------------------
    // --- ANALYTICS ---
    // ---------------------------------------------------------------------

    /**
     * TIMESTAMP STRATEGY:
     * - Survey data uses ISO strings (human-readable, sortable): new Date().toISOString()
     * - Sync tracking uses numeric timestamps (faster comparisons): Date.now()
     * This is intentional for optimal performance and data clarity.
     */

    /**
     * Record analytics event
     * @param {string} eventType - Type of event (survey_completed, survey_abandoned)
     * @param {Object} data - Additional event data
     */
    function recordAnalytics(eventType, data = {}) {
        try {
            const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
            
            // PRIORITY FIX #6: Standardize timestamp format
            const timestamp = new Date().toISOString();
            
            analytics.push({
                timestamp: timestamp,
                eventType: eventType,
                surveyId: appState.formData.id,
                kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
                ...data
            });
            
            // PRIORITY FIX #2: Check analytics array size (use configurable constant)
            if (analytics.length >= MAX_ANALYTICS_SIZE) {
                console.warn(`[ANALYTICS] Array at capacity (${MAX_ANALYTICS_SIZE}) - removing oldest entry`);
                analytics.shift();
            }
            
            safeSetLocalStorage(STORAGE_KEY_ANALYTICS, analytics);
        } catch (e) {
            console.warn('[ANALYTICS] Failed to record analytics:', e.message);
        }
    }

    /**
     * Check if analytics should be synced (daily check)
     * @returns {boolean} True if sync is needed
     */
    function shouldSyncAnalytics() {
        const lastSync = safeGetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC);
        const now = Date.now();
        
        return !lastSync || (now - lastSync) >= ANALYTICS_SYNC_INTERVAL_MS;
    }

    /**
     * Check and sync analytics if interval has passed
     */
    function checkAndSyncAnalytics() {
        if (shouldSyncAnalytics()) {
            syncAnalytics(false);
        }
    }

    /**
     * Sync analytics data to server
     * @param {boolean} isManual - Whether this is a manual sync (affects UI feedback)
     * @returns {Promise<boolean>} Success status
     */
    async function syncAnalytics(isManual = false) {
        if (!navigator.onLine) {
            console.warn('[ANALYTICS SYNC] Offline. Skipping sync.');
            if (isManual) {
                updateSyncStatus('Offline. Analytics sync skipped.');
                showUserError('No internet connection. Analytics sync failed.');
            }
            return false;
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
        
        // PRIORITY FIX #6: Standardize timestamp
        const payload = {
            analyticsType: 'summary',
            timestamp: new Date().toISOString(),
            kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
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
                    
                    // PRIORITY FIX #6: Store timestamp as number (Date.now())
                    safeSetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC, Date.now());
                    
                    if (isManual) {
                        updateSyncStatus(`Analytics synced successfully! (${analytics.length} events) ✅`);
                        setTimeout(() => updateSyncStatus(''), 4000);
                    }
                    
                    return true;
                }
                
            } catch (error) {
                if (attempt < MAX_RETRIES) {
                    const delay = getExponentialBackoffDelay(attempt);
                    console.warn(`[ANALYTICS SYNC] Attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }
        
        console.error('[ANALYTICS SYNC] All retry attempts failed.');
        if (isManual) {
            updateSyncStatus('Analytics sync failed after 3 attempts ⚠️');
            showUserError('Analytics sync failed. Will retry automatically.');
            setTimeout(() => updateSyncStatus(''), 4000);
        }
        return false;
    }

    // ---------------------------------------------------------------------
    // --- SURVEY DATA SYNC ---
    // ---------------------------------------------------------------------

    /**
     * Update sync status message in admin panel
     * @param {string} message - Status message to display
     */
    function updateSyncStatus(message) {
        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) {
            syncStatusMessage.textContent = message;
            syncStatusMessage.style.color = ''; // Reset to default
        }
    }

    let syncQueue = Promise.resolve();

    /**
     * Sync survey data to server with queue management
     * @param {boolean} isManual - Whether this is a manual sync
     * @returns {Promise<boolean>} Success status
     */
    function syncData(isManual = false) {
        // PRIORITY FIX #1: Better sync queue management
        syncQueue = syncQueue.then(() => doSyncData(isManual)).catch(err => {
            console.error('[SYNC QUEUE] Unhandled error:', err);
        });
        return syncQueue;
    }

    /**
     * Internal sync function with retry logic
     * @param {boolean} isManual - Whether this is a manual sync
     * @returns {Promise<boolean>} Success status
     */
    async function doSyncData(isManual = false) {
        if (!navigator.onLine) {
            console.warn('[DATA SYNC] Offline. Skipping sync.');
            if (isManual) {
                updateSyncStatus('Offline. Sync skipped.');
                showUserError('No internet connection. Sync failed.');
            }
            updateAdminCount();
            return false;
        }

        const submissionQueue = getSubmissionQueue();
        
        if (submissionQueue.length === 0) {
            console.log('[DATA SYNC] Submission queue is empty.');
            if (isManual) {
                updateSyncStatus('No records to sync ✅');
                setTimeout(() => updateSyncStatus(''), 3000);
            }
            updateAdminCount();
            return true;
        }

        try {
            const syncButton = window.globals?.syncButton;
            if (isManual && syncButton) {
                syncButton.disabled = true;
                syncButton.textContent = 'Syncing...';
            }

            console.log(`[DATA SYNC] Attempting to sync ${submissionQueue.length} submissions...`);
            
            // PRIORITY FIX #1: Validate all submissions have IDs before syncing
            const validSubmissions = submissionQueue.filter(record => {
                if (!record.id) {
                    console.error('[DATA SYNC] Record missing ID - skipping:', record);
                    return false;
                }
                return true;
            });

            if (validSubmissions.length === 0) {
                console.error('[DATA SYNC] No valid submissions found (all missing IDs)');
                if (isManual) {
                    updateSyncStatus('⚠️ All records invalid (missing IDs)');
                    showUserError('Data validation failed. Please clear queue and restart.');
                }
                return false;
            }

            if (validSubmissions.length < submissionQueue.length) {
                console.warn(`[DATA SYNC] ${submissionQueue.length - validSubmissions.length} invalid records filtered out`);
            }
            
            console.log('[DATA SYNC] Submission IDs:', validSubmissions.map(s => s.id));
            
            if (isManual) updateSyncStatus(`Syncing ${validSubmissions.length} records... ⏳`);

            const payload = {
                submissions: validSubmissions,
                kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
                timestamp: new Date().toISOString()
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
                    
                    console.log('[DATA SYNC] Server response:', syncResult);
                    
                    const successfulIds = syncResult.successfulIds || [];
                    
                    console.log('[DATA SYNC] Successfully synced IDs:', successfulIds);
                    
                    if (successfulIds.length === 0) {
                        console.warn('[DATA SYNC] Server returned zero successful IDs. Data retained.');
                        if (isManual) {
                            updateSyncStatus('⚠️ Sync completed but no records confirmed. Check server logs.');
                            showUserError('Sync uncertain - records kept in queue for safety.');
                        }
                        return false;
                    }
                    
                    // PRIORITY FIX #1: Better filtering with validation and logging
                    const newQueue = submissionQueue.filter(record => {
                        // If record has no ID, keep it (shouldn't happen after validation above)
                        if (!record.id) {
                            console.warn('[DATA SYNC] Found record without ID during cleanup, keeping in queue');
                            return true;
                        }
                        
                        // Keep records that are NOT in the successful list
                        const shouldKeep = !successfulIds.includes(record.id);
                        
                        if (!shouldKeep) {
                            console.log(`[DATA SYNC] ✓ Removing successfully synced record: ${record.id}`);
                        } else {
                            console.log(`[DATA SYNC] ↻ Keeping unsynced record: ${record.id}`);
                        }
                        
                        return shouldKeep;
                    });
                    
                    // Update localStorage
                    if (newQueue.length > 0) {
                        console.warn(`[DATA SYNC] ${successfulIds.length} records synced. ${newQueue.length} records remaining.`);
                        safeSetLocalStorage(STORAGE_KEY_QUEUE, newQueue);
                    } else {
                        console.log(`[DATA SYNC] ✅ All ${submissionQueue.length} records successfully synced. Clearing queue.`);
                        localStorage.removeItem(STORAGE_KEY_QUEUE);
                    }
                    
                    // PRIORITY FIX #6: Store last sync as timestamp number
                    safeSetLocalStorage(STORAGE_KEY_LAST_SYNC, Date.now());
                    updateAdminCount();

                    if (isManual) {
                        const statusText = newQueue.length === 0 
                            ? `✅ Sync Complete! ${submissionQueue.length} records cleared.` 
                            : `⚠️ Partial Sync: ${successfulIds.length} cleared, ${newQueue.length} remain.`;

                        updateSyncStatus(statusText);
                        setTimeout(() => updateSyncStatus(''), 4000);
                    }
                    
                    return true;

                } catch (error) {
                    if (attempt < MAX_RETRIES) {
                        const delay = getExponentialBackoffDelay(attempt);
                        console.warn(`[DATA SYNC] Attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${delay}ms...`);
                        if (isManual) updateSyncStatus(`Sync failed. Retry ${attempt}/${MAX_RETRIES}... ⏳`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        throw error;
                    }
                }
            }
        } catch (error) {
            console.error(`[DATA SYNC] PERMANENT FAIL: ${error.message}`);
            if (isManual) {
                updateSyncStatus('❌ Sync Failed - Check Console');
                showUserError(`Sync failed: ${error.message}. Data saved locally.`);
            }
        } finally {
            const syncButton = window.globals?.syncButton;
            if (isManual && syncButton) {
                syncButton.disabled = false;
                syncButton.textContent = 'Sync Data';
            }
            
            updateAdminCount();
        }
        
        return false;
    }

    /**
     * Auto-sync function called periodically
     */
    function autoSync() {
        console.log('[AUTO SYNC] Running periodic sync...');
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
