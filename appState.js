// FILE: appState.js
// VERSION: 3.4.0
// FIXES:
//   - keeps window.CONSTANTS ownership in config.js only
//   - uses one canonical state key with safe fallback read + migration
//   - aligns visibility source-of-truth with document.hidden
//   - exposes appState helpers for safe visibility updates
//   - preserves queue count logging for both survey types
//   - avoids split persisted state across old/new keys

(function () {
  // ─── Import configuration (set by config.js before this script runs) ────────
  const CONFIG = window.KIOSK_CONFIG || {};
  const CONSTANTS = window.CONSTANTS || {};

  // ─── Timing ─────────────────────────────────────────────────────────────────
  const INACTIVITY_TIMEOUT_MS        = CONSTANTS.INACTIVITY_TIMEOUT_MS        || CONFIG.INACTIVITY_TIMEOUT_MS        || 30000;
  const SYNC_INTERVAL_MS             = CONSTANTS.SYNC_INTERVAL_MS             || CONFIG.SYNC_INTERVAL_MS             || 900000;
  const ADMIN_PANEL_TIMEOUT_MS       = CONSTANTS.ADMIN_PANEL_TIMEOUT_MS       || CONFIG.ADMIN_PANEL_TIMEOUT_MS       || 30000;
  const RESET_DELAY_MS               = CONSTANTS.RESET_DELAY_MS               || CONFIG.RESET_DELAY_MS               || 5000;
  const ANALYTICS_SYNC_INTERVAL_MS   = CONSTANTS.ANALYTICS_SYNC_INTERVAL_MS   || CONFIG.ANALYTICS_SYNC_INTERVAL_MS   || 86400000;
  const TYPEWRITER_DURATION_MS       = CONSTANTS.TYPEWRITER_DURATION_MS       || CONFIG.TYPEWRITER_DURATION_MS       || 2000;
  const TEXT_ROTATION_INTERVAL_MS    = CONSTANTS.TEXT_ROTATION_INTERVAL_MS    || CONFIG.TEXT_ROTATION_INTERVAL_MS    || 4000;
  const AUTO_ADVANCE_DELAY_MS        = CONSTANTS.AUTO_ADVANCE_DELAY_MS        || CONFIG.AUTO_ADVANCE_DELAY_MS        || 50;
  const VISIBILITY_CHANGE_DELAY_MS   = CONSTANTS.VISIBILITY_CHANGE_DELAY_MS   || CONFIG.VISIBILITY_CHANGE_DELAY_MS   || 5000;
  const STATUS_MESSAGE_AUTO_CLEAR_MS = CONSTANTS.STATUS_MESSAGE_AUTO_CLEAR_MS || CONFIG.STATUS_MESSAGE_AUTO_CLEAR_MS || 4000;
  const ERROR_MESSAGE_AUTO_CLEAR_MS  = CONSTANTS.ERROR_MESSAGE_AUTO_CLEAR_MS  || CONFIG.ERROR_MESSAGE_AUTO_CLEAR_MS  || 10000;
  const START_SCREEN_REMOVE_DELAY_MS = CONSTANTS.START_SCREEN_REMOVE_DELAY_MS || CONFIG.START_SCREEN_REMOVE_DELAY_MS || 400;

  // ─── Network & Retry ────────────────────────────────────────────────────────
  const MAX_RETRIES    = CONSTANTS.MAX_RETRIES   || CONFIG.MAX_RETRIES   || 3;
  const RETRY_DELAY_MS = CONSTANTS.RETRY_DELAY_MS || CONFIG.RETRY_DELAY_MS || 2000;

  // ─── Queue limits ───────────────────────────────────────────────────────────
  const MAX_QUEUE_SIZE     = CONSTANTS.MAX_QUEUE_SIZE     || CONFIG.MAX_QUEUE_SIZE     || 250;
  const MAX_ANALYTICS_SIZE = CONSTANTS.MAX_ANALYTICS_SIZE || CONFIG.MAX_ANALYTICS_SIZE || 1000;

  // ─── Storage keys ───────────────────────────────────────────────────────────
  const CANONICAL_STORAGE_KEY_STATE =
    CONSTANTS.STORAGE_KEY_STATE ||
    CONFIG.STORAGE_KEY_STATE ||
    'kioskAppState';

  const LEGACY_STORAGE_KEY_STATE = 'kioskAppState';

  const STORAGE_KEY_QUEUE               = CONSTANTS.STORAGE_KEY_QUEUE               || CONFIG.STORAGE_KEY_QUEUE               || 'submissionQueue';
  const STORAGE_KEY_ANALYTICS           = CONSTANTS.STORAGE_KEY_ANALYTICS           || CONFIG.STORAGE_KEY_ANALYTICS           || 'surveyAnalytics';
  const STORAGE_KEY_LAST_SYNC           = CONSTANTS.STORAGE_KEY_LAST_SYNC           || CONFIG.STORAGE_KEY_LAST_SYNC           || 'lastDataSync';
  const STORAGE_KEY_LAST_ANALYTICS_SYNC = CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC || CONFIG.STORAGE_KEY_LAST_ANALYTICS_SYNC || 'lastAnalyticsSync';

  // ─── API Endpoints ───────────────────────────────────────────────────────────
  const SYNC_ENDPOINT        = CONSTANTS.SYNC_ENDPOINT        || CONFIG.SYNC_ENDPOINT        || '/api/submit-survey';
  const ANALYTICS_ENDPOINT   = CONSTANTS.ANALYTICS_ENDPOINT   || CONFIG.ANALYTICS_ENDPOINT   || '/api/sync-analytics';
  const SURVEY_QUESTIONS_URL = CONSTANTS.SURVEY_QUESTIONS_URL || CONFIG.SURVEY_QUESTIONS_URL || '/api/get_questions';
  const ERROR_LOG_ENDPOINT   = CONSTANTS.ERROR_LOG_ENDPOINT   || CONFIG.ERROR_LOG_ENDPOINT   || '/api/log-error';

  // ─── Feature Flags ──────────────────────────────────────────────────────────
  const FEATURES = CONSTANTS.FEATURES || CONFIG.FEATURES || {
    enableTypewriterEffect: true,
    enableAnalytics: true,
    enableOfflineQueue: true,
    enableAdminPanel: true,
    enableErrorLogging: true,
    enableDebugCommands: false,
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function getDefaultState() {
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
      countdownInterval: null,
    };
  }

  function sanitizeLoadedState(parsed) {
    const defaults = getDefaultState();
    return {
      currentQuestionIndex: Number.isInteger(parsed?.currentQuestionIndex) ? parsed.currentQuestionIndex : defaults.currentQuestionIndex,
      formData: parsed?.formData && typeof parsed.formData === 'object' ? parsed.formData : defaults.formData,
      surveyStartTime: parsed?.surveyStartTime || defaults.surveyStartTime,
      questionStartTimes: parsed?.questionStartTimes && typeof parsed.questionStartTimes === 'object'
        ? parsed.questionStartTimes
        : defaults.questionStartTimes,
      questionTimeSpent: parsed?.questionTimeSpent && typeof parsed.questionTimeSpent === 'object'
        ? parsed.questionTimeSpent
        : defaults.questionTimeSpent,
      adminClickCount: 0,
      inactivityTimer: null,
      syncTimer: null,
      rotationInterval: null,
      countdownInterval: null,
    };
  }

  function readLocalJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn(`[STATE] Failed to read key "${key}":`, e.message);
      return null;
    }
  }

  function safeSetLocalStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`[STATE] Failed to persist key "${key}":`, e.message);
      return false;
    }
  }

  function removeLocalStorageKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[STATE] Failed to remove key "${key}":`, e.message);
    }
  }

  function migrateLegacyStateIfNeeded() {
    if (CANONICAL_STORAGE_KEY_STATE === LEGACY_STORAGE_KEY_STATE) {
      return;
    }

    const canonical = readLocalJson(CANONICAL_STORAGE_KEY_STATE);
    if (canonical) {
      return;
    }

    const legacy = readLocalJson(LEGACY_STORAGE_KEY_STATE);
    if (legacy) {
      console.log(`[STATE] Migrating legacy state from "${LEGACY_STORAGE_KEY_STATE}" to "${CANONICAL_STORAGE_KEY_STATE}"`);
      safeSetLocalStorage(CANONICAL_STORAGE_KEY_STATE, legacy);
    }
  }

  function loadAppState() {
    migrateLegacyStateIfNeeded();

    const savedState =
      readLocalJson(CANONICAL_STORAGE_KEY_STATE) ||
      (CANONICAL_STORAGE_KEY_STATE !== LEGACY_STORAGE_KEY_STATE ? readLocalJson(LEGACY_STORAGE_KEY_STATE) : null);

    if (savedState) {
      const sanitized = sanitizeLoadedState(savedState);

      if (!sanitized.formData.id) {
        console.warn('[STATE] Loaded state missing ID — will be generated on survey start');
      }

      console.log(`[STATE] Loaded persisted state from "${CANONICAL_STORAGE_KEY_STATE}"`);
      return sanitized;
    }

    console.log('[STATE] Initializing default state');
    return getDefaultState();
  }

  function validateConfiguration() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 KIOSK CONFIGURATION LOADED');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Kiosk Identity:');
    console.log(`  ID: ${CONFIG.KIOSK_ID || 'UNKNOWN'}`);
    console.log('\nTiming Settings:');
    console.log(`  Inactivity Timeout : ${INACTIVITY_TIMEOUT_MS / 1000}s`);
    console.log(`  Sync Interval      : ${SYNC_INTERVAL_MS / 60000} min`);
    console.log(`  Analytics Sync     : ${ANALYTICS_SYNC_INTERVAL_MS / 60000).toFixed(0)} min`);
    console.log(`  Reset Delay        : ${RESET_DELAY_MS / 1000}s`);
    console.log('\nQueue Limits:');
    console.log(`  Max Queue Size  : ${MAX_QUEUE_SIZE} records`);
    console.log(`  Max Analytics   : ${MAX_ANALYTICS_SIZE} events`);
    console.log('\nFeature Flags:');
    Object.entries(FEATURES).forEach(([k, v]) => console.log(`  ${k}: ${v ? '✓' : '✗'}`));
    console.log('\nAPI Endpoints:');
    console.log(`  Sync      : ${SYNC_ENDPOINT}`);
    console.log(`  Analytics : ${ANALYTICS_ENDPOINT}`);

    const warnings = [];
    if (SYNC_INTERVAL_MS < 60000) warnings.push('⚠️  SYNC_INTERVAL_MS < 1 min may cause excessive API calls');
    if (INACTIVITY_TIMEOUT_MS < 10000) warnings.push('⚠️  INACTIVITY_TIMEOUT_MS < 10s may frustrate users');
    if (MAX_QUEUE_SIZE > 200) warnings.push('⚠️  MAX_QUEUE_SIZE > 200 may cause localStorage issues');
    if (!CONFIG.KIOSK_ID) warnings.push('⚠️  KIOSK_ID not set — using default');

    if (warnings.length > 0) {
      console.log('\n⚠️  Configuration Warnings:');
      warnings.forEach(w => console.log(`  ${w}`));
    }

    console.log('═══════════════════════════════════════════════════════');
    return { isValid: warnings.length === 0, warnings };
  }

  // ─── App State ──────────────────────────────────────────────────────────────
  let appState = loadAppState();
  let isKioskVisible = !document.hidden;
  let typewriterTimer = null;
  let adminPanelTimer = null;

  // DOM Elements — initialised by main/index.js
  let questionContainer, nextBtn, prevBtn, mainTitle, progressBar,
      kioskStartScreen, kioskVideo, adminControls, syncButton,
      adminClearButton, hideAdminButton, unsyncedCountDisplay,
      syncStatusMessage, syncAnalyticsButton;

  const configValidation = validateConfiguration();

  // ─── Globals ────────────────────────────────────────────────────────────────
  window.appState = appState;
  window.isKioskVisible = isKioskVisible;
  window.typewriterTimer = typewriterTimer;
  window.adminPanelTimer = adminPanelTimer;

  window.setKioskVisibility = function setKioskVisibility(visible) {
    isKioskVisible = !!visible;
    window.isKioskVisible = isKioskVisible;
    return isKioskVisible;
  };

  window.getKioskVisibility = function getKioskVisibility() {
    return !document.hidden;
  };

  window.persistAppState = function persistAppState() {
    return safeSetLocalStorage(CANONICAL_STORAGE_KEY_STATE, appState);
  };

  window.clearPersistedAppState = function clearPersistedAppState() {
    removeLocalStorageKey(CANONICAL_STORAGE_KEY_STATE);
    if (CANONICAL_STORAGE_KEY_STATE !== LEGACY_STORAGE_KEY_STATE) {
      removeLocalStorageKey(LEGACY_STORAGE_KEY_STATE);
    }
  };

  window.globals = {
    get questionContainer()    { return questionContainer;    }, set questionContainer(v)    { questionContainer = v;    },
    get nextBtn()              { return nextBtn;              }, set nextBtn(v)              { nextBtn = v;              },
    get prevBtn()              { return prevBtn;              }, set prevBtn(v)              { prevBtn = v;              },
    get mainTitle()            { return mainTitle;            }, set mainTitle(v)            { mainTitle = v;            },
    get progressBar()          { return progressBar;          }, set progressBar(v)          { progressBar = v;          },
    get kioskStartScreen()     { return kioskStartScreen;     }, set kioskStartScreen(v)     { kioskStartScreen = v;     },
    get kioskVideo()           { return kioskVideo;           }, set kioskVideo(v)           { kioskVideo = v;           },
    get adminControls()        { return adminControls;        }, set adminControls(v)        { adminControls = v;        },
    get syncButton()           { return syncButton;           }, set syncButton(v)           { syncButton = v;           },
    get adminClearButton()     { return adminClearButton;     }, set adminClearButton(v)     { adminClearButton = v;     },
    get hideAdminButton()      { return hideAdminButton;      }, set hideAdminButton(v)      { hideAdminButton = v;      },
    get unsyncedCountDisplay() { return unsyncedCountDisplay; }, set unsyncedCountDisplay(v) { unsyncedCountDisplay = v; },
    get syncStatusMessage()    { return syncStatusMessage;    }, set syncStatusMessage(v)    { syncStatusMessage = v;    },
    get syncAnalyticsButton()  { return syncAnalyticsButton;  }, set syncAnalyticsButton(v)  { syncAnalyticsButton = v;  },
  };

  // ─── window.CONSTANTS remains owned by config.js only ──────────────────────
  window.KIOSK_CONFIG_VALIDATION = configValidation;

  // ─── Boot log ───────────────────────────────────────────────────────────────
  const _q1Count = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUE) || '[]').length; } catch { return 0; }
  })();

  const _q2Key = CONSTANTS.STORAGE_KEY_QUEUE_V2 ||
                 CONSTANTS.SURVEY_TYPES?.type2?.storageKey ||
                 'submissionQueueV2';

  const _q2Count = (() => {
    try { return JSON.parse(localStorage.getItem(_q2Key) || '[]').length; } catch { return 0; }
  })();

  console.log('\n📱 Kiosk Survey Application Initialized');
  console.log('   Version       : 3.4.0');
  console.log(`   State Key     : ${CANONICAL_STORAGE_KEY_STATE}`);
  console.log(`   State         : ${appState.currentQuestionIndex > 0 ? 'RESUMING' : 'FRESH'}`);
  if (appState.currentQuestionIndex > 0) {
    console.log(`   Resume Point  : Question ${appState.currentQuestionIndex + 1}`);
  }
  console.log(`   Visible       : ${!document.hidden ? '✓' : '✗'}`);
  console.log(`   Active Survey : ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);
  console.log(`   Queue Type 1  : ${_q1Count} records`);
  console.log(`   Queue Type 2  : ${_q2Count} records`);
  console.log(`   Online        : ${navigator.onLine ? '✓' : '✗'}`);
  console.log('');
})();
