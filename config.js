// FILE: config.js
// PURPOSE: Centralized configuration for kiosk survey application
// DEPENDENCIES: None (loaded first)

/**
 * Main Configuration Object
 * All timing values in milliseconds unless otherwise specified
 */
const CONFIG = {
    // ═══════════════════════════════════════════════════════════
    // KIOSK IDENTITY
    // ═══════════════════════════════════════════════════════════
    KIOSK_ID: 'KIOSK-GWINNETT-001',
    
    // ═══════════════════════════════════════════════════════════
    // TIMING SETTINGS
    // ═══════════════════════════════════════════════════════════
    INACTIVITY_TIMEOUT_MS: 30000,        // 30 seconds
    SYNC_INTERVAL_MS: 86400000,          // 24 hours (1440 minutes)
    ANALYTICS_SYNC_INTERVAL_MS: 86400000, // 24 hours
    VISIBILITY_CHANGE_DELAY_MS: 5000,    // 5 seconds
    STATUS_MESSAGE_AUTO_CLEAR_MS: 3000,  // 3 seconds
    
    // Network retry settings
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 2000,
    
    // Typewriter effect timing
    TYPEWRITER_DURATION_MS: 2000,        // 2 seconds
    TEXT_ROTATION_INTERVAL_MS: 4000,     // 4 seconds
    
    // ═══════════════════════════════════════════════════════════
    // QUEUE AND STORAGE LIMITS
    // ═══════════════════════════════════════════════════════════
    MAX_QUEUE_SIZE: 1000,                // UPDATED: Increased from 100 to 1000
    QUEUE_WARNING_THRESHOLD: 800,        // ADDED: Warn at 80% capacity
    MAX_ANALYTICS_SIZE: 1000,
    
    // ═══════════════════════════════════════════════════════════
    // LOCALSTORAGE KEYS
    // ═══════════════════════════════════════════════════════════
    STORAGE_KEY_QUEUE: 'submissionQueue',
    STORAGE_KEY_ANALYTICS: 'surveyAnalytics',
    STORAGE_KEY_STATE: 'kioskAppState',
    STORAGE_KEY_LAST_SYNC: 'lastSync',
    STORAGE_KEY_LAST_ANALYTICS_SYNC: 'lastAnalyticsSync',
    
    // ═══════════════════════════════════════════════════════════
    // API ENDPOINTS
    // ═══════════════════════════════════════════════════════════
    SYNC_ENDPOINT: '/api/submit-survey',
    ANALYTICS_ENDPOINT: '/api/sync-analytics',
    
    // ═══════════════════════════════════════════════════════════
    // FEATURE FLAGS
    // ═══════════════════════════════════════════════════════════
    enableTypewriterEffect: true,
    enableAnalytics: true,
    enableOfflineQueue: true,
    enableAdminPanel: true,
    enableErrorLogging: true,
    enableDebugCommands: true,
    
    // ═══════════════════════════════════════════════════════════
    // DEBUG MODE
    // ═══════════════════════════════════════════════════════════
    DEBUG_MODE: true
};

/**
 * Validate configuration
 * Checks for common misconfigurations
 */
function validateConfig() {
    const errors = [];
    const warnings = [];

    // Validate required fields
    if (!CONFIG.KIOSK_ID) {
        errors.push('❌ KIOSK_ID is required');
    }

    // Validate numeric values
    if (CONFIG.INACTIVITY_TIMEOUT_MS < 10000) {
        warnings.push('⚠️  INACTIVITY_TIMEOUT_MS should be at least 10 seconds');
    }

    // UPDATED: Accept 1000 queue size, only warn above 1500
    if (CONFIG.MAX_QUEUE_SIZE > 1500) {
        warnings.push('⚠️  MAX_QUEUE_SIZE > 1500 may cause localStorage quota issues on some devices');
    }

    // Validate sync interval
    if (CONFIG.SYNC_INTERVAL_MS < 60000) {
        warnings.push('⚠️  SYNC_INTERVAL_MS < 1 minute may cause excessive network usage');
    }

    // Display results
    if (errors.length > 0 || warnings.length > 0) {
        console.log('═══════════════════════════════════════════════════════');
        console.log('⚙️  CONFIGURATION VALIDATION');
        console.log('═══════════════════════════════════════════════════════');
    }

    if (errors.length > 0) {
        console.error('❌ CRITICAL ERRORS:');
        errors.forEach(err => console.error(`   ${err}`));
    }

    if (warnings.length > 0) {
        console.warn('⚠️  WARNINGS:');
        warnings.forEach(warn => console.warn(`   ${warn}`));
    }

    // UPDATED: Only throw error for critical errors, not warnings
    if (errors.length > 0) {
        throw new Error('Configuration validation failed - see console for details');
    }

    if (errors.length === 0 && warnings.length === 0) {
        console.log('✅ Configuration is valid');
    }

    // Display active configuration
    console.log('\n📋 Active Configuration:');
    console.log(`   Kiosk ID: ${CONFIG.KIOSK_ID}`);
    console.log(`   Inactivity: ${CONFIG.INACTIVITY_TIMEOUT_MS / 1000}s`);
    console.log(`   Sync Interval: ${CONFIG.SYNC_INTERVAL_MS / 60000} min`);
    console.log(`   Queue Limit: ${CONFIG.MAX_QUEUE_SIZE} records`);
    console.log(`   Debug Mode: ${CONFIG.DEBUG_MODE ? 'ON' : 'OFF'}`);
    console.log('═══════════════════════════════════════════════════════');
}

/**
 * Helper function to convert time strings to milliseconds
 * Examples: "30s" -> 30000, "5m" -> 300000, "1h" -> 3600000
 */
function timeToMs(timeString) {
    const units = {
        's': 1000,
        'm': 60000,
        'h': 3600000,
        'd': 86400000
    };
    
    const match = timeString.match(/^(\d+)([smhd])$/);
    if (!match) {
        throw new Error(`Invalid time format: ${timeString}. Use format like "30s", "5m", "1h", "1d"`);
    }
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    return value * units[unit];
}

/**
 * Get storage information
 * Useful for debugging storage issues
 */
function getStorageInfo() {
    const info = {};
    
    try {
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                const value = localStorage.getItem(key);
                const size = new Blob([value]).size;
                info[key] = {
                    size: size,
                    sizeKB: (size / 1024).toFixed(2),
                    sizeMB: (size / 1024 / 1024).toFixed(4)
                };
            }
        }
        
        // Calculate totals
        const totalBytes = Object.values(info).reduce((sum, item) => sum + item.size, 0);
        info._TOTAL = {
            size: totalBytes,
            sizeKB: (totalBytes / 1024).toFixed(2),
            sizeMB: (totalBytes / 1024 / 1024).toFixed(4)
        };
        
    } catch (e) {
        console.error('Error getting storage info:', e);
    }
    
    return info;
}

/**
 * Suggest optimal settings based on current usage
 */
function suggestOptimalSettings() {
    const queue = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY_QUEUE) || '[]');
    const analytics = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY_ANALYTICS) || '[]');
    
    const suggestions = [];
    
    // Check queue size
    if (queue.length > CONFIG.MAX_QUEUE_SIZE * 0.8) {
        suggestions.push('⚠️  Queue at 80%+ capacity - consider increasing sync frequency');
    }
    
    // Check analytics size
    if (analytics.length > CONFIG.MAX_ANALYTICS_SIZE * 0.8) {
        suggestions.push('⚠️  Analytics at 80%+ capacity - sync analytics soon');
    }
    
    // Check sync interval
    const lastSync = localStorage.getItem(CONFIG.STORAGE_KEY_LAST_SYNC);
    if (lastSync) {
        const hoursSinceSync = (Date.now() - parseInt(lastSync)) / 3600000;
        if (hoursSinceSync > 24) {
            suggestions.push(`⚠️  Last sync was ${hoursSinceSync.toFixed(1)} hours ago`);
        }
    }
    
    if (suggestions.length === 0) {
        console.log('✅ All systems optimal');
    } else {
        console.log('💡 Optimization Suggestions:');
        suggestions.forEach(s => console.log(`   ${s}`));
    }
    
    return suggestions;
}

// Run validation on load
try {
    validateConfig();
} catch (error) {
    console.error('Configuration validation failed:', error.message);
    // Don't throw - let app continue with warnings
}

// Expose configuration globally
window.CONSTANTS = CONFIG;

// ✅ Initialize globals object early
window.globals = window.globals || {};

// Expose helper functions
window.KIOSK_CONFIG = {
    ...CONFIG,
    timeToMs,
    getStorageInfo,
    suggestOptimalSettings
};

// Log helper availability
console.log('💡 Configuration helpers available:');
console.log('   - window.KIOSK_CONFIG.timeToMs("30s")');
console.log('   - window.KIOSK_CONFIG.getStorageInfo()');
console.log('   - window.KIOSK_CONFIG.suggestOptimalSettings()');
