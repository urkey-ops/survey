// FILE: config.js
// UPDATED: All priority fixes applied - added missing constants, better presets, validation
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
     * Examples: 'KIOSK-GWINNETT-001', 'KIOSK-ATLANTA-MAIN', 'KIOSK-DEMO'
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
    SYNC_INTERVAL_MS: 86400000, // 24 hours
    
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
     * Recommended: 20-60 seconds
     */
    ADMIN_PANEL_TIMEOUT_MS: 30000,
    
    // PRIORITY FIX #7: UI/UX timing constants (extracted from hardcoded values)
    
    /**
     * Typewriter effect duration - How long text animation takes
     * Default: 2 seconds (2000 ms)
     * Recommended: 1500-3000 ms
     */
    TYPEWRITER_DURATION_MS: 2000,
    
    /**
     * Text rotation interval - How often rotating questions change
     * Default: 4 seconds (4000 ms)
     * Recommended: 3000-5000 ms
     */
    TEXT_ROTATION_INTERVAL_MS: 4000,
    
    /**
     * Auto-advance delay - Delay before auto-advancing to next question
     * Default: 50 ms
     * Recommended: 50-200 ms (subtle delay feels more natural)
     */
    AUTO_ADVANCE_DELAY_MS: 50,
    
    /**
     * Visibility change delay - How long page must be hidden before pausing
     * Default: 5 seconds (5000 ms)
     * Prevents pausing during quick tab switches
     */
    VISIBILITY_CHANGE_DELAY_MS: 5000,
    
    /**
     * Status message auto-clear - How long status messages display
     * Default: 4 seconds (4000 ms)
     */
    STATUS_MESSAGE_AUTO_CLEAR_MS: 4000,
    
    /**
     * Error message auto-clear - How long error messages display
     * Default: 10 seconds (10000 ms)
     */
    ERROR_MESSAGE_AUTO_CLEAR_MS: 10000,
    
    /**
     * Start screen remove delay - Animation time before removing element
     * Default: 400 ms
     */
    START_SCREEN_REMOVE_DELAY_MS: 400,
    
    // ---------------------------------------------------------------------
    // --- NETWORK SETTINGS ---
    // ---------------------------------------------------------------------
    
    /**
     * Maximum retry attempts for failed sync operations
     * Default: 3 attempts
     * Recommended: 2-5 attempts
     */
    MAX_RETRIES: 3,
    
    /**
     * Base delay between retry attempts (exponential backoff applied)
     * Default: 2 seconds (2000 ms)
     * With exponential backoff: 2s, 4s, 8s for 3 retries
     */
    RETRY_DELAY_MS: 2000,
    
    // PRIORITY FIX #3: Queue management limits
    
    /**
     * Maximum submission queue size
     * Default: 100 records
     * Prevents localStorage overflow (typically 5-10MB limit)
     * When limit reached, oldest records are removed
     */
    MAX_QUEUE_SIZE: 100,
    
    /**
     * Maximum analytics events to store
     * Default: 1000 events
     * Analytics are synced daily, so this allows ~1000 interactions/day
     */
    MAX_ANALYTICS_SIZE: 1000,
    
    // ---------------------------------------------------------------------
    // --- STORAGE KEYS ---
    // ---------------------------------------------------------------------
    
    /**
     * localStorage keys for data persistence
     * Only change if you need to reset all kiosk data
     */
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
     * Server should accept POST with JSON body containing submissions array
     */
    SYNC_ENDPOINT: '/api/submit-survey',
    
    /**
     * Analytics data submission endpoint
     * Server should accept POST with JSON body containing analytics summary
     */
    ANALYTICS_ENDPOINT: '/api/sync-analytics',
    
    /**
     * Survey questions endpoint (if using dynamic questions)
     * Not currently used - questions are in data-util.js
     */
    SURVEY_QUESTIONS_URL: '/api/get_questions',
    
    /**
     * Error logging endpoint
     * Client-side errors are sent here for monitoring
     */
    ERROR_LOG_ENDPOINT: '/api/log-error',
    
    // ---------------------------------------------------------------------
    // --- FEATURE FLAGS ---
    // ---------------------------------------------------------------------
    
    /**
     * Enable/disable features for testing or customization
     */
    FEATURES: {
        /**
         * Typewriter animation on question labels
         * Disable for faster question display
         */
        enableTypewriterEffect: true,
        
        /**
         * Analytics tracking (completion rates, drop-off, timing)
         * Disable if you don't need analytics
         */
        enableAnalytics: true,
        
        /**
         * Offline queue for failed syncs
         * Disable only for testing immediate sync failures
         */
        enableOfflineQueue: true,
        
        /**
         * Admin panel access (5 clicks on title)
         * Disable in production for public-facing kiosks
         */
        enableAdminPanel: true,
        
        /**
         * Error logging to server
         * Disable to prevent network calls on errors
         */
        enableErrorLogging: true,
        
        /**
         * Debug commands in browser console
         * SECURITY: Disable in production to prevent data inspection
         */
        enableDebugCommands: true
    }
};

// ---------------------------------------------------------------------
// --- PRESET CONFIGURATIONS ---
// ---------------------------------------------------------------------

/**
 * Quick preset configurations for common scenarios
 * Uncomment ONE of these blocks to use a preset
 * Or customize individual values above
 */

// ✅ CURRENT: DEFAULT CONFIGURATION (Balanced for general use)
// - 30s inactivity timeout
// - 15 min sync interval
// - All features enabled
// - Queue limit: 100 records

// 🏢 HIGH TRAFFIC KIOSK (Frequent syncs, short timeouts, larger queue)
/*
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 300000;        // 5 minutes
window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 20000;    // 20 seconds
window.KIOSK_CONFIG.ANALYTICS_SYNC_INTERVAL_MS = 43200000; // 12 hours
window.KIOSK_CONFIG.MAX_QUEUE_SIZE = 200;             // Larger queue for high volume
window.KIOSK_CONFIG.TYPEWRITER_DURATION_MS = 1500;    // Faster animations
*/

// 🏞️ LOW TRAFFIC KIOSK (Less frequent syncs, longer timeouts)
/*
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 1800000;       // 30 minutes
window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 60000;    // 60 seconds
window.KIOSK_CONFIG.ANALYTICS_SYNC_INTERVAL_MS = 86400000; // 24 hours
window.KIOSK_CONFIG.MAX_QUEUE_SIZE = 50;              // Smaller queue
*/

// 🎬 DEMO MODE (Quick resets, frequent syncs, all debug features)
/*
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 60000;         // 1 minute
window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 10000;    // 10 seconds
window.KIOSK_CONFIG.RESET_DELAY_MS = 2000;            // 2 seconds
window.KIOSK_CONFIG.FEATURES.enableDebugCommands = true;
window.KIOSK_CONFIG.FEATURES.enableTypewriterEffect = true;
*/

// 🔧 DEVELOPMENT MODE (Longer timeouts, enhanced logging)
/*
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 600000;        // 10 minutes
window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 120000;   // 2 minutes
window.KIOSK_CONFIG.FEATURES.enableErrorLogging = true;
window.KIOSK_CONFIG.FEATURES.enableDebugCommands = true;
window.KIOSK_CONFIG.ADMIN_PANEL_TIMEOUT_MS = 60000;   // 1 minute
*/

// 🔒 PRODUCTION MODE (Secure, no debug access)
/*
window.KIOSK_CONFIG.FEATURES.enableDebugCommands = false;
window.KIOSK_CONFIG.FEATURES.enableAdminPanel = false;
window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 45000;    // 45 seconds
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 900000;        // 15 minutes
*/

// ⚡ PERFORMANCE MODE (Minimal animations, faster sync)
/*
window.KIOSK_CONFIG.FEATURES.enableTypewriterEffect = false;
window.KIOSK_CONFIG.TYPEWRITER_DURATION_MS = 0;
window.KIOSK_CONFIG.AUTO_ADVANCE_DELAY_MS = 0;
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 300000;        // 5 minutes
*/

// 📴 OFFLINE MODE (Extended queue, less frequent sync attempts)
/*
window.KIOSK_CONFIG.SYNC_INTERVAL_MS = 3600000;       // 1 hour
window.KIOSK_CONFIG.MAX_QUEUE_SIZE = 500;             // Large queue for extended offline
window.KIOSK_CONFIG.MAX_RETRIES = 2;                  // Fewer retries
*/

// ---------------------------------------------------------------------
// --- MULTI-KIOSK CONFIGURATIONS ---
// ---------------------------------------------------------------------

/**
 * Example: Different settings per kiosk location
 * Detect kiosk by hostname, URL parameter, or manual configuration
 */
/*
const hostname = window.location.hostname;

if (hostname.includes('location-a')) {
    window.KIOSK_CONFIG.KIOSK_ID = 'KIOSK-LOCATION-A-001';
    window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 30000;
} else if (hostname.includes('location-b')) {
    window.KIOSK_CONFIG.KIOSK_ID = 'KIOSK-LOCATION-B-001';
    window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 45000;
} else if (hostname.includes('demo')) {
    window.KIOSK_CONFIG.KIOSK_ID = 'KIOSK-DEMO';
    window.KIOSK_CONFIG.INACTIVITY_TIMEOUT_MS = 10000;
    window.KIOSK_CONFIG.FEATURES.enableDebugCommands = true;
}
*/

// ---------------------------------------------------------------------
// --- VALIDATION & HELPERS ---
// ---------------------------------------------------------------------

/**
 * Validate configuration on load
 * Warns about potentially problematic settings
 */
(function validateConfig() {
    const config = window.KIOSK_CONFIG;
    const warnings = [];
    const errors = [];
    
    // Critical validations
    if (!config.KIOSK_ID) {
        errors.push('❌ KIOSK_ID is required');
    }
    
    if (config.SYNC_INTERVAL_MS < 60000) {
        warnings.push('⚠️  SYNC_INTERVAL_MS < 1 minute may cause excessive API calls');
    }
    
    if (config.INACTIVITY_TIMEOUT_MS < 10000) {
        warnings.push('⚠️  INACTIVITY_TIMEOUT_MS < 10 seconds may frustrate users');
    }
    
    if (config.MAX_QUEUE_SIZE > 500) {
        warnings.push('⚠️  MAX_QUEUE_SIZE > 500 may cause localStorage quota issues');
    }
    
    if (config.MAX_QUEUE_SIZE < 10) {
        warnings.push('⚠️  MAX_QUEUE_SIZE < 10 may lose data during network outages');
    }
    
    if (config.RESET_DELAY_MS < 2000) {
        warnings.push('⚠️  RESET_DELAY_MS < 2 seconds may be too fast for users to read');
    }
    
    if (config.ADMIN_PANEL_TIMEOUT_MS > 300000) {
        warnings.push('⚠️  ADMIN_PANEL_TIMEOUT_MS > 5 minutes - panel may stay open too long');
    }
    
    // PRIORITY FIX #3: Validate queue sizes
    if (config.MAX_QUEUE_SIZE >= 1000) {
        errors.push('❌ MAX_QUEUE_SIZE >= 1000 will likely exceed localStorage limits');
    }
    
    if (config.MAX_ANALYTICS_SIZE >= 10000) {
        errors.push('❌ MAX_ANALYTICS_SIZE >= 10000 will likely exceed localStorage limits');
    }
    
    // Security validations for production
    if (window.location.hostname !== 'localhost' && 
        window.location.hostname !== '127.0.0.1' &&
        !window.location.hostname.includes('dev') &&
        !window.location.hostname.includes('test')) {
        
        if (config.FEATURES.enableDebugCommands) {
            warnings.push('⚠️  enableDebugCommands is ON in production environment');
        }
        
        if (config.FEATURES.enableAdminPanel) {
            warnings.push('⚠️  enableAdminPanel is ON in production environment');
        }
    }
    
    // Timing validations
    if (config.TYPEWRITER_DURATION_MS > 5000) {
        warnings.push('⚠️  TYPEWRITER_DURATION_MS > 5s may feel too slow');
    }
    
    if (config.TEXT_ROTATION_INTERVAL_MS < 2000) {
        warnings.push('⚠️  TEXT_ROTATION_INTERVAL_MS < 2s may be too fast to read');
    }
    
    // Log results
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚙️  CONFIGURATION VALIDATION');
    console.log('═══════════════════════════════════════════════════════');
    
    if (errors.length > 0) {
        console.error('❌ CRITICAL ERRORS:');
        errors.forEach(err => console.error(`   ${err}`));
    }
    
    if (warnings.length > 0) {
        console.warn('⚠️  WARNINGS:');
        warnings.forEach(warning => console.warn(`   ${warning}`));
    }
    
    if (errors.length === 0 && warnings.length === 0) {
        console.log('✅ Configuration is valid');
    }
    
    // Log active configuration summary
    console.log('\n📋 Active Configuration:');
    console.log(`   Kiosk ID: ${config.KIOSK_ID}`);
    console.log(`   Inactivity: ${config.INACTIVITY_TIMEOUT_MS / 1000}s`);
    console.log(`   Sync Interval: ${config.SYNC_INTERVAL_MS / 60000} min`);
    console.log(`   Queue Limit: ${config.MAX_QUEUE_SIZE} records`);
    console.log(`   Debug Mode: ${config.FEATURES.enableDebugCommands ? 'ON' : 'OFF'}`);
    
    console.log('═══════════════════════════════════════════════════════');
    
    // Stop execution if critical errors
    if (errors.length > 0) {
        throw new Error('Configuration validation failed - see console for details');
    }
})();

// ---------------------------------------------------------------------
// --- CONFIGURATION HELPERS ---
// ---------------------------------------------------------------------

/**
 * Helper function to convert time values
 * Usage: timeToMs('30s'), timeToMs('5m'), timeToMs('1h')
 */
window.KIOSK_CONFIG.timeToMs = function(timeString) {
    const match = timeString.match(/^(\d+)(s|m|h)$/);
    if (!match) {
        console.error(`Invalid time format: ${timeString}`);
        return 0;
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch(unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        default: return 0;
    }
};

/**
 * Helper to calculate estimated localStorage usage
 */
window.KIOSK_CONFIG.getStorageInfo = function() {
    try {
        const total = 5 * 1024 * 1024; // Typical 5MB limit
        const used = new Blob([JSON.stringify(localStorage)]).size;
        const remaining = total - used;
        const percentUsed = ((used / total) * 100).toFixed(1);
        
        return {
            totalMB: (total / 1024 / 1024).toFixed(2),
            usedMB: (used / 1024 / 1024).toFixed(2),
            remainingMB: (remaining / 1024 / 1024).toFixed(2),
            percentUsed: percentUsed,
            isNearLimit: percentUsed > 80
        };
    } catch (e) {
        return null;
    }
};

/**
 * Helper to suggest optimal settings based on usage
 */
window.KIOSK_CONFIG.suggestOptimalSettings = function() {
    const queue = JSON.parse(localStorage.getItem('submissionQueue') || '[]');
    const analytics = JSON.parse(localStorage.getItem('surveyAnalytics') || '[]');
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('💡 CONFIGURATION SUGGESTIONS');
    console.log('═══════════════════════════════════════════════════════');
    
    // Analyze queue
    if (queue.length > 50) {
        console.log('📊 High queue volume detected');
        console.log('   Suggestion: Decrease SYNC_INTERVAL_MS to 5-10 minutes');
        console.log('   Or increase MAX_QUEUE_SIZE if frequently offline');
    }
    
    // Analyze analytics
    if (analytics.length > 500) {
        const avgPerDay = analytics.length; // Rough estimate
        console.log(`📈 High analytics volume: ~${avgPerDay} events/day`);
        console.log('   Suggestion: Decrease ANALYTICS_SYNC_INTERVAL_MS to 12 hours');
    }
    
    // Check storage
    const storage = window.KIOSK_CONFIG.getStorageInfo();
    if (storage && storage.isNearLimit) {
        console.log(`💾 Storage usage high: ${storage.percentUsed}%`);
        console.log('   Suggestion: Decrease MAX_QUEUE_SIZE or sync more frequently');
    }
    
    console.log('═══════════════════════════════════════════════════════');
};

// Log helper availability
console.log('💡 Configuration helpers available:');
console.log('   - window.KIOSK_CONFIG.timeToMs("30s")');
console.log('   - window.KIOSK_CONFIG.getStorageInfo()');
console.log('   - window.KIOSK_CONFIG.suggestOptimalSettings()');
