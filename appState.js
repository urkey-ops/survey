// FILE: appState.js

(function() {
    // ---------------------------------------------------------------------
    // --- GLOBAL CONSTANTS ---
    // ---------------------------------------------------------------------

    // Configuration
    const INACTIVITY_TIMEOUT_MS = 60000; // 60 seconds of inactivity to reset kiosk
    const SYNC_INTERVAL_MS = 10000;     // 10 seconds periodic data sync
    const ADMIN_PANEL_TIMEOUT_MS = 30000; // 30 seconds to auto-hide admin panel

    // Local Storage Keys
    const STORAGE_KEY_STATE = 'kioskAppState';
    const STORAGE_KEY_QUEUE = 'submissionQueue';
    const STORAGE_KEY_ANALYTICS = 'surveyAnalytics';
    const STORAGE_KEY_LAST_SYNC = 'lastDataSync';
    const STORAGE_KEY_LAST_ANALYTICS_SYNC = 'lastAnalyticsSync';

    // API Endpoints
    const SYNC_ENDPOINT = '/api/submit_data';
    const ANALYTICS_ENDPOINT = '/api/submit_analytics';
    const SURVEY_QUESTIONS_URL = '/api/get_questions';

    // ---------------------------------------------------------------------
    // --- GLOBAL STATE & DOM REFERENCES ---
    // ---------------------------------------------------------------------

    let appState = loadAppState(); // Initial state loaded from local storage
    let isKioskVisible = true;     // Tracks if the browser tab is focused

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
        const savedState = localStorage.getItem(STORAGE_KEY_STATE);
        return savedState ? JSON.parse(savedState) : {
            currentQuestionIndex: 0,
            formData: {},
            questionTimeSpent: {},
            adminClickCount: 0,
            inactivityTimer: null,
            syncTimer: null,
            rotationInterval: null,
            questionTimer: {} // Tracks time spent per question
        };
    }

    // Expose globals
    window.appState = appState;
    window.isKioskVisible = isKioskVisible;
    window.typewriterTimer = typewriterTimer;
    window.adminPanelTimer = adminPanelTimer;

    // Expose DOM element variables
    window.globals = {
        get questionContainer() { return questionContainer; }, set questionContainer(v) { questionContainer = v; },
        get nextBtn() { return nextBtn; }, set nextBtn(v) { nextBtn = v; },
        get prevBtn() { return prevBtn; }, set prevBtn(v) { prevBtn = v; },
        get mainTitle() { return mainTitle; }, set mainTitle(v) { mainTitle = v; },
        get progressBar() { return progressBar; }, set progressBar(v) { progressBar = v; },
        get kioskStartScreen() { return kioskStartScreen; }, set kioskStartScreen(v) { kioskStartScreen = v; },
        get kioskVideo() { return kioskVideo; }, set kioskVideo(v) { kioskVideo = v; },
        get adminControls() { return adminControls; }, set adminControls(v) { adminControls = v; },
        get syncButton() { return syncButton; }, set syncButton(v) { syncButton = v; },
        get adminClearButton() { return adminClearButton; }, set adminClearButton(v) { adminClearButton = v; },
        get hideAdminButton() { return hideAdminButton; }, set hideAdminButton(v) { hideAdminButton = v; },
        get unsyncedCountDisplay() { return unsyncedCountDisplay; }, set unsyncedCountDisplay(v) { unsyncedCountDisplay = v; },
        get syncStatusMessage() { return syncStatusMessage; }, set syncStatusMessage(v) { syncStatusMessage = v; },
        get syncAnalyticsButton() { return syncAnalyticsButton; }, set syncAnalyticsButton(v) { syncAnalyticsButton = v; },
    };

    // Expose Constants
    window.CONSTANTS = {
        INACTIVITY_TIMEOUT_MS,
        SYNC_INTERVAL_MS,
        ADMIN_PANEL_TIMEOUT_MS,
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
