// FILE: config.js
// ===== KIOSK CONFIGURATION - EASY ADJUSTMENTS =====
// This file contains all configurable settings for the kiosk survey application.
// Modify these values to customize behavior without touching other code files.

window.KIOSK_CONFIG = {
    
    // ---------------------------------------------------------------------
    // --- KIOSK IDENTIFICATION ---
    // ---------------------------------------------------------------------
    
    /**
     * Unique identifier for this kiosk location
     * Change this for each physical kiosk deployment
     */
    KIOSK_ID: 'KIOSK-GWINNETT-001',
    
    // ---------------------------------------------------------------------
    // --- TIMING SETTINGS (in milliseconds) ---
    // ---------------------------------------------------------------------
    
    /**
     * Inactivity timeout - How long to wait before resetting kiosk
     * Default: 30 seconds (30000 ms)
     * Recommended: 30-60 seconds for public kiosks
     */
    INACTIVITY_TIMEOUT_MS: 30000,
    
    /**
     * Sync interval - How often to attempt background data sync
     * Default: 15 minutes (900000 ms)
     * Options:
     *   - 5 minutes:  300000
     *   - 10 minutes: 600000
     *   - 15 minutes: 900000
     *   - 30 minutes: 1800000
     *   - 1 hour:     3600000
     */
    SYNC_INTERVAL_MS: 900000, // 15 minutes
    
    /**
     * Analytics sync interval - How often to sync analytics data
     * Default: 24 hours (86400000 ms)
     * Options:
     *   - 12 hours: 43200000
     *   - 24 hours: 86400000
     *   - 48 hours: 172800000
     */
    ANALYTICS_SYNC_INTERVAL_MS: 86400000, // 24 hours
    
    /**
     * Reset delay - Countdown time after survey completion
     * Default: 5 seconds (5000 ms)
     * Recommended: 3-10 seconds
     */
    RESET_DELAY_MS: 5000,
    
    /**
     * Admin panel auto-hide timeout
     * Default: 30 seconds (30000 ms)
     */
    ADMIN_PANEL_TIMEOUT_MS: 30000,
    
    // ---------------------------------------------------------------------
    // --- NETWORK SETTINGS ---
    // ---------------------------------------------------------------------
    
    /**
     * Maximum retry attempts for failed sync operations
     * Default: 3 attempts
     */
    MAX_RETRIES: 3,
    
    /**
     * Delay between retry attempts
     * Default: 2 seconds (2000 ms)
     */
    RETRY_DELAY_MS: 2000,
    
    // ---------------------------------------------------------------------
    // --- STORAGE KEYS ---
    // ---------------------------------------------------------------------
    
    STORAGE_KEY_STATE: 'kioskAppState',
    STORAGE_KEY_QUEUE: 'submissionQueue',
    STORAGE_KEY_ANALYTICS: 'surveyAnalytics',
    STORAGE_KEY_LAST_SYNC: 'lastDataSync',
    STORAGE_KEY_LAST_ANALYTICS_SYNC: 'lastAnalyticsSync',
    
    // ---------------------------------------------------------------------
    // --- API ENDPOINTS ---
    // ---------------------------------------------------------------------
    
    /**
     * Survey data submission endpoint
     */
    SYNC_ENDPOINT: '/api/submit-survey',
    
    /**
     * Analytics data submission endpoint
     */
    ANALYTICS_ENDPOINT: '/api/sync-analytics',
    
    /**
     * Survey questions endpoint (if using dynamic questions)
     */
    SURVEY_QUESTIONS_URL: '/api/get_questions',
    
    // ---------------------------------------------------------------------
    // --- FEATURE FLAGS ---
    // ---------------------------------------------------------------------
    
    /**
     * Enable/disable features
     */
    FEATURES: {
        enableTypewriterEffect: true,
        enableAnalytics: true,
        enableOfflineQueue: true,
        enableAdminPanel: true,
        enableErrorLogging: true
    }
};

// ---------------------------------------------------------------------
// --- PRESET CONFIGURATIONS ---
// ---------------------------------------------------------------------

/**
 * Quick preset configurations for common scenarios
 * Uncomment one of these to use a preset, or customize values above
 */

// HIGH TRAFFIC KIOSK (Frequent syncs, short timeouts)
/*
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 300000;        // 5 minutes
window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 20000;    // 20 seconds
window.KIOSK_CONFIG.ANALYTICS_SYNC_INTERVAL_MS = 43200000; // 12 hours
*/

// LOW TRAFFIC KIOSK (Less frequent syncs, longer timeouts)
/*
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 1800000;       // 30 minutes
window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 60000;    // 60 seconds
window.KIOSK_CONFIG.ANALYTICS_SYNC_INTERVAL_MS = 86400000; // 24 hours
*/

// DEMO MODE (Quick resets, frequent syncs)
/*
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 60000;         // 1 minute
window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 10000;    // 10 seconds
window.KIOSK_CONFIG.RESET_DELAY_MS = 2000;            // 2 seconds
*/

// DEVELOPMENT MODE (Longer timeouts, less aggressive)
/*
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 600000;        // 10 minutes
window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 120000;   // 2 minutes
window.KIOSK_CONFIG.FEATURES.enableErrorLogging = true;
*/

// ---------------------------------------------------------------------
// --- VALIDATION & HELPERS ---
// ---------------------------------------------------------------------

// Validate configuration on load
(function validateConfig() {
    const config = window.KIOSK_CONFIG;
    
    // Warn if sync interval is too aggressive
    if (config.SYNC_INTERVAL_MS < 60000) {
        console.warn('⚠️ SYNC_INTERVAL_MS is set to less than 1 minute. This may cause excessive API calls.');
    }
    
    // Warn if inactivity timeout is too short
    if (config.INACTIVITY_TIMEOUT_MS < 10000) {
        console.warn('⚠️ INACTIVITY_TIMEOUT_MS is set to less than 10 seconds. Users may not have enough time.');
    }
    
    // Log active configuration
    console.log('📋 Kiosk Configuration Loaded:');
    console.log(`   Kiosk ID: ${config.KIOSK_ID}`);
    console.log(`   Inactivity Timeout: ${config.INACTIVITY_TIMEOUT_MS / 1000}s`);
    console.log(`   Sync Interval: ${config.SYNC_INTERVAL_MS / 60000} minutes`);
    console.log(`   Analytics Sync: ${config.ANALYTICS_SYNC_INTERVAL_MS / 3600000} hours`);
})();
