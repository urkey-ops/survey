// FILE: appState.js
// VERSION: 3.3.0 - FINDING FIX: removed redundant window.CONSTANTS assignment.
//                  config.js already sets window.CONSTANTS correctly via Object.freeze().
//                  appState.js overwrote it with an unfrozen copy — silently losing
//                  SURVEY_TYPES, STORAGE_KEY_QUEUE_V2, and all config.js-only keys.
//                  Now: appState.js only reads from window.KIOSK_CONFIG (set by config.js)
//                  and does NOT re-assign window.CONSTANTS.
//                  Also added STORAGE_KEY_QUEUE_V2 to boot log queue count.

(function () {
  // ─── Import configuration (set by config.js before this script runs) ────────
  const CONFIG = window.KIOSK_CONFIG || {};

  // ─── Timing ─────────────────────────────────────────────────────────────────
  const INACTIVITY_TIMEOUT_MS         = CONFIG.INACTIVITY_TIMEOUT_MS         || 30000;
  const SYNC_INTERVAL_MS              = CONFIG.SYNC_INTERVAL_MS              || 900000;
  const ADMIN_PANEL_TIMEOUT_MS        = CONFIG.ADMIN_PANEL_TIMEOUT_MS        || 30000;
  const RESET_DELAY_MS                = CONFIG.RESET_DELAY_MS                || 5000;
  const ANALYTICS_SYNC_INTERVAL_MS    = CONFIG.ANALYTICS_SYNC_INTERVAL_MS    || 86400000;
  const TYPEWRITER_DURATION_MS        = CONFIG.TYPEWRITER_DURATION_MS        || 2000;
  const TEXT_ROTATION_INTERVAL_MS     = CONFIG.TEXT_ROTATION_INTERVAL_MS     || 4000;
  const AUTO_ADVANCE_DELAY_MS         = CONFIG.AUTO_ADVANCE_DELAY_MS         || 50;
  const VISIBILITY_CHANGE_DELAY_MS    = CONFIG.VISIBILITY_CHANGE_DELAY_MS    || 5000;
  const STATUS_MESSAGE_AUTO_CLEAR_MS  = CONFIG.STATUS_MESSAGE_AUTO_CLEAR_MS  || 4000;
  const ERROR_MESSAGE_AUTO_CLEAR_MS   = CONFIG.ERROR_MESSAGE_AUTO_CLEAR_MS   || 10000;
  const START_SCREEN_REMOVE_DELAY_MS  = CONFIG.START_SCREEN_REMOVE_DELAY_MS  || 400;

  // ─── Network & Retry ────────────────────────────────────────────────────────
  const MAX_RETRIES     = CONFIG.MAX_RETRIES     || 3;
  const RETRY_DELAY_MS  = CONFIG.RETRY_DELAY_MS  || 2000;

  // ─── Queue limits ───────────────────────────────────────────────────────────
  // Read from window.CONSTANTS first (already set by config.js) then fall back
  const MAX_QUEUE_SIZE    = window.CONSTANTS?.MAX_QUEUE_SIZE    || CONFIG.MAX_QUEUE_SIZE    || 250;
  const MAX_ANALYTICS_SIZE = CONFIG.MAX_ANALYTICS_SIZE || 1000;

  // ─── Storage keys ───────────────────────────────────────────────────────────
  const STORAGE_KEY_STATE                = CONFIG.STORAGE_KEY_STATE                || 'kioskAppState';
  const STORAGE_KEY_QUEUE                = CONFIG.STORAGE_KEY_QUEUE                || 'submissionQueue';
  const STORAGE_KEY_ANALYTICS            = CONFIG.STORAGE_KEY_ANALYTICS            || 'surveyAnalytics';
  const STORAGE_KEY_LAST_SYNC            = CONFIG.STORAGE_KEY_LAST_SYNC            || 'lastDataSync';
  const STORAGE_KEY_LAST_ANALYTICS_SYNC  = CONFIG.STORAGE_KEY_LAST_ANALYTICS_SYNC  || 'lastAnalyticsSync';

  // ─── API Endpoints ───────────────────────────────────────────────────────────
  const SYNC_ENDPOINT          = CONFIG.SYNC_ENDPOINT          || '/api/submit-survey';
  const ANALYTICS_ENDPOINT     = CONFIG.ANALYTICS_ENDPOINT     || '/api/sync-analytics';
  const SURVEY_QUESTIONS_URL   = CONFIG.SURVEY_QUESTIONS_URL   || '/api/get_questions';
  const ERROR_LOG_ENDPOINT     = CONFIG.ERROR_LOG_ENDPOINT     || '/api/log-error';

  // ─── Feature Flags ──────────────────────────────────────────────────────────
  const FEATURES = CONFIG.FEATURES || {
    enableTypewriterEffect: true,
    enableAnalytics:        true,
    enableOfflineQueue:     true,
    enableAdminPanel:       true,
    enableErrorLogging:     true,
    enableDebugCommands:    false,
  };

  // ─── App State ───────────────────────────────────────────────────────────────

  let appState         = loadAppState();
  let isKioskVisible   = true;
  let typewriterTimer  = null;
  let adminPanelTimer  = null;

  // DOM Elements — initialised by main/index.js
  let questionContainer, nextBtn, prevBtn, mainTitle, progressBar,
      kioskStartScreen, kioskVideo, adminControls, syncButton,
      adminClearButton, hideAdminButton, unsyncedCountDisplay,
      syncStatusMessage, syncAnalyticsButton;

  function loadAppState() {
    try {
      const savedState = localStorage.getItem(CONFIG.STORAGE_KEY_STATE || 'kioskAppState');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (!parsed.formData) parsed.formData = {};
        if (!parsed.formData.id) {
          console.warn('[STATE] Loaded state missing ID — will be generated on survey start');
        }
        return {
          currentQuestionIndex: parsed.currentQuestionIndex || 0,
          formData:             parsed.formData || {},
          surveyStartTime:      parsed.surveyStartTime || null,
          questionStartTimes:   parsed.questionStartTimes || {},
          questionTimeSpent:    parsed.questionTimeSpent || {},
          adminClickCount:      0,
          inactivityTimer:      null,
          syncTimer:            null,
          rotationInterval:     null,
          countdownInterval:    null,
        };
      }
    } catch (e) {
      console.warn('[STATE] Failed to load saved state:', e.message);
    }
    console.log('[STATE] Initializing default state');
    return {
      currentQuestionIndex: 0,
      formData:             {},
      surveyStartTime:      null,
      questionStartTimes:   {},
      questionTimeSpent:    {},
      adminClickCount:      0,
      inactivityTimer:      null,
      syncTimer:            null,
      rotationInterval:     null,
      countdownInterval:    null,
    };
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
    console.log(`  Analytics Sync     : ${ANALYTICS_SYNC_INTERVAL_MS / 3600000} hrs`);
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
    if (SYNC_INTERVAL_MS < 60000)      warnings.push('⚠️  SYNC_INTERVAL_MS < 1 min may cause excessive API calls');
    if (INACTIVITY_TIMEOUT_MS < 10000) warnings.push('⚠️  INACTIVITY_TIMEOUT_MS < 10s may frustrate users');
    if (MAX_QUEUE_SIZE > 200)          warnings.push('⚠️  MAX_QUEUE_SIZE > 200 may cause localStorage issues');
    if (!CONFIG.KIOSK_ID)              warnings.push('⚠️  KIOSK_ID not set — using default');
    if (warnings.length > 0) {
      console.log('\n⚠️  Configuration Warnings:');
      warnings.forEach(w => console.log(`  ${w}`));
    }
    console.log('═══════════════════════════════════════════════════════');
    return { isValid: warnings.length === 0, warnings };
  }

  const configValidation = validateConfiguration();

  // ─── Globals ─────────────────────────────────────────────────────────────────
  window.appState         = appState;
  window.isKioskVisible   = isKioskVisible;
  window.typewriterTimer  = typewriterTimer;
  window.adminPanelTimer  = adminPanelTimer;

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

  // ─── FINDING FIX — do NOT re-assign window.CONSTANTS ─────────────────────────
  //
  // BEFORE (broken):
  //   window.CONSTANTS = { INACTIVITY_TIMEOUT_MS, SYNC_INTERVAL_MS, ... }
  //   → ran AFTER config.js, silently overwrote window.CONSTANTS
  //   → lost Object.freeze() protection from config.js
  //   → lost all config.js-only keys: SURVEY_TYPES, STORAGE_KEY_QUEUE_V2,
  //     getActiveSurveyType, setActiveSurveyType and any other keys appState
  //     didn't redeclare
  //   → every file reading window.CONSTANTS?.SURVEY_TYPES got undefined
  //   → dataSync.js queue key resolution silently fell through to hardcoded fallback
  //
  // AFTER (fixed):
  //   window.CONSTANTS is owned entirely by config.js — do not touch it here.
  //   All timing/storage constants appState needs are already in window.CONSTANTS
  //   (config.js sets them from the same CONFIG source). Any file that needs them
  //   should read window.CONSTANTS directly, not a copy set here.
  //
  // ─────────────────────────────────────────────────────────────────────────────

  window.KIOSK_CONFIG_VALIDATION = configValidation;

  // ─── Boot log ────────────────────────────────────────────────────────────────
  // Shows queue counts for BOTH survey types so admin can see what's pending
  const _q1Count = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUE) || '[]').length; } catch { return 0; }
  })();
  const _q2Key   = window.CONSTANTS?.STORAGE_KEY_QUEUE_V2 ||
                   window.CONSTANTS?.SURVEY_TYPES?.type2?.storageKey ||
                   'submissionQueueV2';
  const _q2Count = (() => {
    try { return JSON.parse(localStorage.getItem(_q2Key) || '[]').length; } catch { return 0; }
  })();

  console.log('\n📱 Kiosk Survey Application Initialized');
  console.log(`   Version       : 3.3.0`);
  console.log(`   State         : ${appState.currentQuestionIndex > 0 ? 'RESUMING' : 'FRESH'}`);
  if (appState.currentQuestionIndex > 0) {
    console.log(`   Resume Point  : Question ${appState.currentQuestionIndex + 1}`);
  }
  console.log(`   Active Survey : ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);
  console.log(`   Queue Type 1  : ${_q1Count} records`);
  console.log(`   Queue Type 2  : ${_q2Count} records`);
  console.log(`   Online        : ${navigator.onLine ? '✓' : '✗'}`);
  console.log('');
})();
