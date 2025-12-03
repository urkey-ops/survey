
// FILE: dataSync.js
// DEPENDS ON: appState.js (CONSTANTS, appState)

(function() {
    const { 
        STORAGE_KEY_STATE, 
        STORAGE_KEY_QUEUE, 
        STORAGE_KEY_ANALYTICS, 
        STORAGE_KEY_LAST_SYNC, 
        STORAGE_KEY_LAST_ANALYTICS_SYNC,
        SYNC_ENDPOINT,
        ANALYTICS_ENDPOINT
    } = window.CONSTANTS;
    const appState = window.appState;

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
        // FIXED: Access dynamically instead of at script load time
        const unsyncedCountDisplay = window.globals?.unsyncedCountDisplay;
        if (unsyncedCountDisplay) {
            unsyncedCountDisplay.textContent = count;
        }
    }

    // ---------------------------------------------------------------------
    // --- ANALYTICS ---
    // ---------------------------------------------------------------------

    function recordAnalytics(eventType, data = {}) {
        const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
        const event = {
            timestamp: new Date().toISOString(),
            eventType: eventType,
            kioskId: window.dataUtils.kioskId,
            sessionId: appState.formData.sessionId,
            ...data
        };
        analytics.push(event);
        safeSetLocalStorage(STORAGE_KEY_ANALYTICS, analytics);
        console.log(`[ANALYTICS] Recorded event: ${eventType}`);
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
        if (isManual) updateSyncStatus(`Syncing ${analytics.length} analytics records...`);

        try {
            const response = await fetch(ANALYTICS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: analytics, kioskId: window.dataUtils.kioskId })
            });

            if (response.ok) {
                console.log('[ANALYTICS SYNC] Success. Clearing local analytics.');
                localStorage.removeItem(STORAGE_KEY_ANALYTICS);
                safeSetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC, Date.now());
                if (isManual) updateSyncStatus('Analytics synced successfully.');
                return true;
            } else {
                console.error('[ANALYTICS SYNC] Server failed to process analytics:', response.status);
                if (isManual) updateSyncStatus('Analytics sync failed (Server Error).');
                return false;
            }
        } catch (e) {
            console.error('[ANALYTICS SYNC] Network error during analytics sync:', e);
            if (isManual) updateSyncStatus('Analytics sync failed (Network Error).');
            return false;
        }
    }

    // ---------------------------------------------------------------------
    // --- SURVEY DATA SYNC ---
    // ---------------------------------------------------------------------

    function updateSyncStatus(message) {
        // FIXED: Access dynamically instead of at script load time
        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) {
            syncStatusMessage.textContent = message;
        }
    }

    async function syncData(isManual = false) {
        if (!navigator.onLine) {
            console.warn('[DATA SYNC] Offline. Skipping sync.');
            if (isManual) updateSyncStatus('Offline. Sync failed.');
            updateAdminCount();
            return;
        }

        const queue = getSubmissionQueue();
        if (queue.length === 0) {
            console.log('[DATA SYNC] Submission queue is empty.');
            if (isManual) updateSyncStatus('Queue is empty.');
            updateAdminCount();
            return;
        }

        console.log(`[DATA SYNC] Attempting to sync ${queue.length} submissions...`);
        if (isManual) updateSyncStatus(`Syncing ${queue.length} records...`);

        try {
            const response = await fetch(SYNC_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ submissions: queue, kioskId: window.dataUtils.kioskId })
            });

            if (response.ok) {
                console.log('[DATA SYNC] Success. Clearing submission queue.');
                localStorage.removeItem(STORAGE_KEY_QUEUE);
                safeSetLocalStorage(STORAGE_KEY_LAST_SYNC, Date.now());
                if (isManual) updateSyncStatus('Data synced successfully.');
            } else {
                console.error('[DATA SYNC] Server failed to process data:', response.status);
                if (isManual) updateSyncStatus('Data sync failed (Server Error).');
            }
        } catch (e) {
            console.error('[DATA SYNC] Network error during data sync:', e);
            if (isManual) updateSyncStatus('Data sync failed (Network Error).');
        }

        updateAdminCount();
    }

    function autoSync() {
        syncData(false);
        syncAnalytics(false);
    }

    // Expose functions globally
    window.dataHandlers = {
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
