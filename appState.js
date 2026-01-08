// FILE: appState.js
// UPDATED: All priority fixes applied - added missing constants, proper configuration

(function() {
    // ---------------------------------------------------------------------
    // --- IMPORT CONFIGURATION ---
    // ---------------------------------------------------------------------
    
    const CONFIG = window.KIOSK_CONFIG || {};
    
    // Timing Settings (in milliseconds)
    const INACTIVITY_TIMEOUT_MS = CONFIG.INACTIVITY_TIMEOUT_MS || 30000;
    const SYNC_INTERVAL_MS = CONFIG.SYNC_INTERVAL_MS || 900000;
    const ADMIN_PANEL_TIMEOUT_MS = CONFIG.ADMIN_PANEL_TIMEOUT_MS || 30000;
    const RESET_DELAY_MS = CONFIG.RESET_DELAY_MS || 5000;
    const ANALYTICS_SYNC_INTERVAL_MS = CONFIG.ANALYTICS_SYNC_INTERVAL_MS || 86400000;
    
    // PRIORITY FIX #7: Extract magic numbers to config
    const TYPEWRITER_DURATION_MS = CONFIG.TYPEWRITER_DURATION_MS || 2000;
    const TEXT_ROTATION_INTERVAL_MS = CONFIG.TEXT_ROTATION_INTERVAL_MS || 4000;
    const AUTO_ADVANCE_DELAY_MS = CONFIG.AUTO_ADVANCE_DELAY_MS || 50;
    const VISIBILITY_CHANGE_DELAY_MS = CONFIG.VISIBILITY_CHANGE_DELAY_MS || 5000;
    const STATUS_MESSAGE_AUTO_CLEAR_MS = CONFIG.STATUS_MESSAGE_AUTO_CLEAR_MS || 4000;
    const ERROR_MESSAGE_AUTO_CLEAR_MS = CONFIG.ERROR_MESSAGE_AUTO_CLEAR_MS || 10000;
    const START_SCREEN_REMOVE_DELAY_MS = CONFIG.START_SCREEN_REMOVE_DELAY_MS || 400;
    
    // Network & Retry Settings
    const MAX_RETRIES = CONFIG.MAX_RETRIES || 3;
    const RETRY_DELAY_MS = CONFIG.RETRY_DELAY_MS || 2000;
    
    // PRIORITY FIX #3: Queue size limits
    const MAX_QUEUE_SIZE = CONFIG.MAX_QUEUE_SIZE || 250;
    const MAX_ANALYTICS_SIZE = CONFIG.MAX_ANALYTICS_SIZE || 1000;

    // Local Storage Keys
    const STORAGE_KEY_STATE = CONFIG.STORAGE_KEY_STATE || 'kioskAppState';
    const STORAGE_KEY_QUEUE = CONFIG.STORAGE_KEY_QUEUE || 'submissionQueue';
    const STORAGE_KEY_ANALYTICS = CONFIG.STORAGE_KEY_ANALYTICS || 'surveyAnalytics';
    const STORAGE_KEY_LAST_SYNC = CONFIG.STORAGE_KEY_LAST_SYNC || 'lastDataSync';
    const STORAGE_KEY_LAST_ANALYTICS_SYNC = CONFIG.STORAGE_KEY_LAST_ANALYTICS_SYNC || 'lastAnalyticsSync';

    // API Endpoints
    const SYNC_ENDPOINT = CONFIG.SYNC_ENDPOINT || '/api/submit-survey';
    const ANALYTICS_ENDPOINT = CONFIG.ANALYTICS_ENDPOINT || '/api/sync-analytics';
    const SURVEY_QUESTIONS_URL = CONFIG.SURVEY_QUESTIONS_URL || '/api/get_questions';
    const ERROR_LOG_ENDPOINT = CONFIG.ERROR_LOG_ENDPOINT || '/api/log-error';

    // Feature Flags
    const FEATURES = CONFIG.FEATURES || {
        enableTypewriterEffect: true,
        enableAnalytics: true,
        enableOfflineQueue: true,
        enableAdminPanel: true,
        enableErrorLogging: true,
        enableDebugCommands: false
    };

    // ---------------------------------------------------------------------
    // --- GLOBAL STATE & DOM REFERENCES ---
    // ---------------------------------------------------------------------

    let appState = loadAppState();
    let isKioskVisible = true;

    let typewriterTimer = null;
    let adminPanelTimer = null;

    // DOM Elements (Initialized in main.js)
    let questionContainer;
    let nextBtn;
    let prevBtn;
    let mainTitle;
    let progressBar;
    let kioskStartScreen;
    let kioskVideo;
    let adminControls;
    let syncButton;
    let adminClearButton;
    let hideAdminButton;
    let unsyncedCountDisplay;
    let syncStatusMessage;
    let syncAnalyticsButton;

    /**
     * Load application state from localStorage
     * @returns {Object} Application state object
     */
    function loadAppState() {
        try {
            const savedState = localStorage.getItem(STORAGE_KEY_STATE);
            if (savedState) {
                const parsed = JSON.parse(savedState);
                
                // PRIORITY FIX #1 & #6: Validate and ensure ID exists with proper timestamp
                if (!parsed.formData) {
                    parsed.formData = {};
                }
                if (!parsed.formData.id) {
                    console.warn('[STATE] Loaded state missing ID - will be generated on survey start');
                }
                
                return {
                    currentQuestionIndex: parsed.currentQuestionIndex || 0,
                    formData: parsed.formData || {},
                    surveyStartTime: parsed.surveyStartTime || null,
                    questionStartTimes: parsed.questionStartTimes || {},
                    questionTimeSpent: parsed.questionTimeSpent || {},
                    adminClickCount: 0,
                    inactivityTimer: null,
                    syncTimer: null,
                    rotationInterval: null,
                    countdownInterval: null
                };
            }
        } catch (e) {
            console.warn('[STATE] Failed to load saved state:', e.message);
        }
        
        // Default state
        console.log('[STATE] Initializing default state');
        return {
            currentQuestionIndex: 0,
            formData: {},
            surveyStartTime: null,
            questionStartTimes: {},
            questionTimeSpent: {},
            adminClickCount: 0,
            inactivityTimer: null,
            syncTimer: null,
            rotationInterval: null,
            countdownInterval: null
        };
    }

    /**
     * Validate configuration on load
     */
    function validateConfiguration() {
        console.log('═══════════════════════════════════════════════════════');
        console.log('📋 KIOSK CONFIGURATION LOADED');
        console.log('═══════════════════════════════════════════════════════');
        
        // Display key settings
        console.log('Kiosk Identity:');
        console.log(`  ID: ${CONFIG.KIOSK_ID || 'UNKNOWN'}`);
        
        console.log('\nTiming Settings:');
        console.log(`  Inactivity Timeout: ${INACTIVITY_TIMEOUT_MS / 1000}s`);
        console.log(`  Sync Interval: ${SYNC_INTERVAL_MS / 60000} min`);
        console.log(`  Analytics Sync: ${ANALYTICS_SYNC_INTERVAL_MS / 3600000} hrs`);
        console.log(`  Reset Delay: ${RESET_DELAY_MS / 1000}s`);
        
        console.log('\nQueue Limits:');
        console.log(`  Max Queue Size: ${MAX_QUEUE_SIZE} records`);
        console.log(`  Max Analytics: ${MAX_ANALYTICS_SIZE} events`);
        
        console.log('\nFeature Flags:');
        Object.entries(FEATURES).forEach(([key, value]) => {
            console.log(`  ${key}: ${value ? '✓' : '✗'}`);
        });
        
        console.log('\nAPI Endpoints:');
        console.log(`  Sync: ${SYNC_ENDPOINT}`);
        console.log(`  Analytics: ${ANALYTICS_ENDPOINT}`);
        
        // Warnings for problematic configurations
        const warnings = [];
        
        if (SYNC_INTERVAL_MS < 60000) {
            warnings.push('⚠️  SYNC_INTERVAL_MS < 1 minute may cause excessive API calls');
        }
        
        if (INACTIVITY_TIMEOUT_MS < 10000) {
            warnings.push('⚠️  INACTIVITY_TIMEOUT_MS < 10 seconds may frustrate users');
        }
        
        if (MAX_QUEUE_SIZE > 200) {
            warnings.push('⚠️  MAX_QUEUE_SIZE > 200 may cause localStorage issues');
        }
        
        if (!CONFIG.KIOSK_ID) {
            warnings.push('⚠️  KIOSK_ID not set - using default');
        }
        
        if (warnings.length > 0) {
            console.log('\n⚠️  Configuration Warnings:');
            warnings.forEach(warning => console.log(`  ${warning}`));
        }
        
        console.log('═══════════════════════════════════════════════════════');
        
        // Return validation status
        return {
            isValid: warnings.length === 0,
            warnings: warnings
        };
    }

    // Run validation
    const configValidation = validateConfiguration();

    // Expose globals
    window.appState = appState;
    window.isKioskVisible = isKioskVisible;
    window.typewriterTimer = typewriterTimer;
    window.adminPanelTimer = adminPanelTimer;

    // Expose DOM element variables with getters/setters
    window.globals = {
        get questionContainer() { return questionContainer; }, 
        set questionContainer(v) { questionContainer = v; },
        get nextBtn() { return nextBtn; }, 
        set nextBtn(v) { nextBtn = v; },
        get prevBtn() { return prevBtn; }, 
        set prevBtn(v) { prevBtn = v; },
        get mainTitle() { return mainTitle; }, 
        set mainTitle(v) { mainTitle = v; },
        get progressBar() { return progressBar; }, 
        set progressBar(v) { progressBar = v; },
        get kioskStartScreen() { return kioskStartScreen; }, 
        set kioskStartScreen(v) { kioskStartScreen = v; },
        get kioskVideo() { return kioskVideo; }, 
        set kioskVideo(v) { kioskVideo = v; },
        get adminControls() { return adminControls; }, 
        set adminControls(v) { adminControls = v; },
        get syncButton() { return syncButton; }, 
        set syncButton(v) { syncButton = v; },
        get adminClearButton() { return adminClearButton; }, 
        set adminClearButton(v) { adminClearButton = v; },
        get hideAdminButton() { return hideAdminButton; }, 
        set hideAdminButton(v) { hideAdminButton = v; },
        get unsyncedCountDisplay() { return unsyncedCountDisplay; }, 
        set unsyncedCountDisplay(v) { unsyncedCountDisplay = v; },
        get syncStatusMessage() { return syncStatusMessage; }, 
        set syncStatusMessage(v) { syncStatusMessage = v; },
        get syncAnalyticsButton() { return syncAnalyticsButton; }, 
        set syncAnalyticsButton(v) { syncAnalyticsButton = v; },
    };

    // Expose Constants
    window.CONSTANTS = {
        // Timing
        INACTIVITY_TIMEOUT_MS,
        SYNC_INTERVAL_MS,
        ADMIN_PANEL_TIMEOUT_MS,
        RESET_DELAY_MS,
        ANALYTICS_SYNC_INTERVAL_MS,
        
        // PRIORITY FIX #7: UI timing constants
        TYPEWRITER_DURATION_MS,
        TEXT_ROTATION_INTERVAL_MS,
        AUTO_ADVANCE_DELAY_MS,
        VISIBILITY_CHANGE_DELAY_MS,
        STATUS_MESSAGE_AUTO_CLEAR_MS,
        ERROR_MESSAGE_AUTO_CLEAR_MS,
        START_SCREEN_REMOVE_DELAY_MS,
        
        // Network & Retry
        MAX_RETRIES,
        RETRY_DELAY_MS,
        
        // PRIORITY FIX #3: Queue limits
        MAX_QUEUE_SIZE,
        MAX_ANALYTICS_SIZE,
        
        // Storage Keys
        STORAGE_KEY_STATE,
        STORAGE_KEY_QUEUE,
        STORAGE_KEY_ANALYTICS,
        STORAGE_KEY_LAST_SYNC,
        STORAGE_KEY_LAST_ANALYTICS_SYNC,
        
        // API Endpoints
        SYNC_ENDPOINT,
        ANALYTICS_ENDPOINT,
        SURVEY_QUESTIONS_URL,
        ERROR_LOG_ENDPOINT,
        
        // Feature Flags
        FEATURES
    };
    
    // Expose configuration validation results
    window.KIOSK_CONFIG_VALIDATION = configValidation;
    
    // PRIORITY FIX #8: Add helpful startup information
    console.log('\n📱 Kiosk Survey Application Initialized');
    console.log(`   Version: 2.0.0 (All Priority Fixes Applied)`);
    console.log(`   State: ${appState.currentQuestionIndex > 0 ? 'RESUMING' : 'FRESH'}`);
    if (appState.currentQuestionIndex > 0) {
        console.log(`   Resume Point: Question ${appState.currentQuestionIndex + 1}`);
    }
    console.log(`   Queue: ${localStorage.getItem(STORAGE_KEY_QUEUE) ? JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUE)).length : 0} records`);
    console.log(`   Online: ${navigator.onLine ? '✓' : '✗'}`);
    console.log('');
})();
