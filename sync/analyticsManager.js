// FILE: analyticsManager.js
// PURPOSE: Analytics recording and syncing
// DEPENDENCIES: storageUtils.js, networkHandler.js, window.CONSTANTS

import { safeGetLocalStorage, safeSetLocalStorage, updateSyncStatus, showUserError } from './storageUtils.js';
import { sendRequest } from './networkHandler.js';

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
export function recordAnalytics(eventType, data = {}) {
    try {
        const STORAGE_KEY_ANALYTICS = window.CONSTANTS?.STORAGE_KEY_ANALYTICS || 'surveyAnalytics';
        const MAX_ANALYTICS_SIZE = window.CONSTANTS?.MAX_ANALYTICS_SIZE || 1000;
        
        const analytics = safeGetLocalStorage(STORAGE_KEY_ANALYTICS) || [];
        
        const timestamp = new Date().toISOString();
        const appState = window.appState;
        
        analytics.push({
            timestamp: timestamp,
            eventType: eventType,
            surveyId: appState?.formData?.id,
            kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
            ...data
        });
        
        // Check analytics array size
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
export function shouldSyncAnalytics() {
    const STORAGE_KEY_LAST_ANALYTICS_SYNC = window.CONSTANTS?.STORAGE_KEY_LAST_ANALYTICS_SYNC || 'lastAnalyticsSync';
    const ANALYTICS_SYNC_INTERVAL_MS = window.CONSTANTS?.ANALYTICS_SYNC_INTERVAL_MS || 86400000; // 24 hours
    
    const lastSync = safeGetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC);
    const now = Date.now();
    
    return !lastSync || (now - lastSync) >= ANALYTICS_SYNC_INTERVAL_MS;
}

/**
 * Check and sync analytics if interval has passed
 */
export function checkAndSyncAnalytics() {
    if (shouldSyncAnalytics()) {
        syncAnalytics(false);
    }
}

/**
 * Sync analytics data to server
 * @param {boolean} isManual - Whether this is a manual sync (affects UI feedback)
 * @returns {Promise<boolean>} Success status
 */
export async function syncAnalytics(isManual = false) {
    const STORAGE_KEY_ANALYTICS = window.CONSTANTS?.STORAGE_KEY_ANALYTICS || 'surveyAnalytics';
    const STORAGE_KEY_LAST_ANALYTICS_SYNC = window.CONSTANTS?.STORAGE_KEY_LAST_ANALYTICS_SYNC || 'lastAnalyticsSync';
    const ANALYTICS_ENDPOINT = window.CONSTANTS?.ANALYTICS_ENDPOINT || '/api/sync-analytics';
    
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

    try {
        const result = await sendRequest(ANALYTICS_ENDPOINT, payload);
        
        if (result.success) {
            console.log('[ANALYTICS SYNC] Success. Clearing local analytics.');
            localStorage.removeItem(STORAGE_KEY_ANALYTICS);
            
            // Store timestamp as number (Date.now())
            safeSetLocalStorage(STORAGE_KEY_LAST_ANALYTICS_SYNC, Date.now());
            
            if (isManual) {
                updateSyncStatus(`Analytics synced successfully! (${analytics.length} events) ✅`);
                setTimeout(() => updateSyncStatus(''), 4000);
            }
            
            return true;
        }
        
        throw new Error('Analytics sync failed - server returned unsuccessful response');
        
    } catch (error) {
        console.error('[ANALYTICS SYNC] Failed:', error.message);
        if (isManual) {
            updateSyncStatus('Analytics sync failed ⚠️');
            showUserError('Analytics sync failed. Will retry automatically.');
            setTimeout(() => updateSyncStatus(''), 4000);
        }
        return false;
    }
}

export default {
    recordAnalytics,
    shouldSyncAnalytics,
    checkAndSyncAnalytics,
    syncAnalytics
};
