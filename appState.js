// FILE: appState.js

(function() {
    // ---------------------------------------------------------------------
    // --- IMPORT CONFIGURATION ---
    // ---------------------------------------------------------------------
    
    const CONFIG = window.KIOSK_CONFIG || {};
    
    // Fallback to defaults if config.js is not loaded
    const INACTIVITY_TIMEOUT_MS = CONFIG.INACTIVITY_TIMEOUT_MS || 30000;
    const SYNC_INTERVAL_MS = CONFIG.SYNC_INTERVAL_MS || 900000;
    const ADMIN_PANEL_TIMEOUT_MS = CONFIG.ADMIN_PANEL_TIMEOUT_MS || 30000;
    const RESET_DELAY_MS = CONFIG.RESET_DELAY_MS || 5000;
    const ANALYTICS_SYNC_INTERVAL_MS = CONFIG.ANALYTICS_SYNC_INTERVAL_MS || 86400000;
    const MAX_RETRIES = CONFIG.MAX_RETRIES || 3;
    const RETRY_DELAY_MS = CONFIG.RETRY_DELAY_MS || 2000;

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

    // Helper to initialize state from localStorage
    function loadAppState() {
        try {
            const savedState = localStorage.getItem(STORAGE_KEY_STATE);
            if (savedState) {
                const parsed = JSON.parse(savedState);
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
            console.warn('Failed to load saved state:', e);
        }
        
        // Default state
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

    // Expose globals
    window.appState = appState;
    window.isKioskVisible = isKioskVisible;
    window.typewriterTimer = typewriterTimer;
    window.adminPanelTimer = adminPanelTimer;

    // Expose DOM element variables
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
        INACTIVITY_TIMEOUT_MS,
        SYNC_INTERVAL_MS,
        ADMIN_PANEL_TIMEOUT_MS,
        RESET_DELAY_MS,
        ANALYTICS_SYNC_INTERVAL_MS,
        MAX_RETRIES,
        RETRY_DELAY_MS,
        STORAGE_KEY_STATE,
        STORAGE_KEY_QUEUE,
        STORAGE_KEY_ANALYTICS,
        STORAGE_KEY_LAST_SYNC,
        STORAGE_KEY_LAST_ANALYTICS_SYNC,
        SYNC_ENDPOINT,
        ANALYTICS_ENDPOINT,
        SURVEY_QUESTIONS_URL
    };
})();
