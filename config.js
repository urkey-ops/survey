// FILE: config.js
// PURPOSE: Central configuration for offline-first iPad kiosk PWA
// VERSION: 3.3.0
// CHANGES FROM 3.2.1:
//   - FIX: Active survey type now falls back to window.DEVICECONFIG.defaultSurveyType
//     before hardcoded type1, so first-launch Shayona devices correctly boot into type3.
//   - FIX: getDefaultSurveyType() now resolves dynamically from DEVICECONFIG when available.
//   - FIX: getSurveyConfig() and related helpers stay aligned with device mode defaults.
//   - KEEP: One-time Temple/Shayona device setup behavior unchanged.

(function () {
  function deepFreeze(obj) {
    if (!obj || typeof obj !== 'object' || Object.isFrozen(obj)) {
      return obj;
    }
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      const value = obj[prop];
      if (value && (typeof value === 'object' || typeof value === 'function')) {
        deepFreeze(value);
      }
    });
    return Object.freeze(obj);
  }

  function isStorageAvailable() {
    try {
      const testKey = '__kiosk_storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`[CONFIG] Could not read localStorage key "${key}":`, e.message);
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn(`[CONFIG] Could not persist localStorage key "${key}":`, e.message);
      return false;
    }
  }

  const storageAvailable = isStorageAvailable();

  const STORAGE_KEY_QUEUE                = 'submissionQueue';
  const STORAGE_KEY_QUEUE_V2             = 'submissionQueueV2';
  const STORAGE_KEY_QUEUE_V3             = 'shayonaQueue';
  const STORAGE_KEY_ANALYTICS            = 'surveyAnalytics';
  const STORAGE_KEY_ANALYTICS_V3         = 'shayonaAnalytics';
  const STORAGE_KEY_STATE                = 'kioskState';
  const STORAGE_KEY_LAST_SYNC            = 'lastDataSync';
  const STORAGE_KEY_LAST_ANALYTICS_SYNC  = 'lastAnalyticsSync';
  const STORAGE_KEY_ACTIVE_SURVEY        = 'activeSurveyType';

  const SURVEY_TYPES = {
    type1: {
      label:        'Original Survey (V1)',
      sheetName:    'Sheet1',
      storageKey:   STORAGE_KEY_QUEUE,
      analyticsKey: STORAGE_KEY_ANALYTICS,
    },
    type2: {
      label:        'Visitor Feedback V2',
      sheetName:    'VisitorFeedbackV2',
      storageKey:   STORAGE_KEY_QUEUE_V2,
      analyticsKey: STORAGE_KEY_ANALYTICS,
    },
    type3: {
      label:        'Shayona Café',
      sheetName:    'ShayonaCafe',
      storageKey:   STORAGE_KEY_QUEUE_V3,
      analyticsKey: STORAGE_KEY_ANALYTICS_V3,
    },
  };

  const FALLBACK_SURVEY_TYPE = 'type1';

  const MAX_QUEUE_SIZE               = 250;
  const QUEUE_WARNING_THRESHOLD      = 200;
  const MAX_ANALYTICS_SIZE           = 500;
  const AUTO_ADVANCE_DELAY_MS        = 50;
  const INACTIVITY_TIMEOUT_MS        = 60000;
  const SYNC_INTERVAL_MS             = 300000;
  const ANALYTICS_SYNC_INTERVAL_MS   = 600000;
  const ADMIN_PANEL_TIMEOUT_MS       = 30000;
  const RESET_DELAY_MS               = 5000;
  const TYPEWRITER_DURATION_MS       = 2000;
  const TEXT_ROTATION_INTERVAL_MS    = 4000;
  const VISIBILITY_CHANGE_DELAY_MS   = 5000;
  const STATUS_MESSAGE_AUTO_CLEAR_MS = 4000;
  const ERROR_MESSAGE_AUTO_CLEAR_MS  = 10000;
  const START_SCREEN_REMOVE_DELAY_MS = 400;
  const MAX_RETRIES                  = 3;
  const RETRY_DELAY_MS               = 2000;

  const SYNC_ENDPOINT         = '/api/submit-survey';
  const ANALYTICS_ENDPOINT    = '/api/sync-analytics';
  const SURVEY_QUESTIONS_URL  = '/api/get_questions';
  const ERROR_LOG_ENDPOINT    = '/api/log-error';

  const FEATURES = {
    enableTypewriterEffect: true,
    enableAnalytics:        true,
    enableOfflineQueue:     true,
    enableAdminPanel:       true,
    enableErrorLogging:     true,
    enableDebugCommands:    false,
  };

  function isValidSurveyType(type) {
    return !!(type && SURVEY_TYPES[type]);
  }

  function getDeviceDefaultSurveyType() {
    const deviceDefault = window.DEVICECONFIG?.defaultSurveyType;
    return isValidSurveyType(deviceDefault) ? deviceDefault : FALLBACK_SURVEY_TYPE;
  }

  function getDefaultSurveyType() {
    return getDeviceDefaultSurveyType();
  }

  function getActiveSurveyType() {
    if (storageAvailable) {
      const stored = safeStorageGet(STORAGE_KEY_ACTIVE_SURVEY);
      if (stored && isValidSurveyType(stored)) return stored;
    }
    return getDeviceDefaultSurveyType();
  }

  function setActiveSurveyType(type) {
    if (!isValidSurveyType(type)) {
      console.error(
        `[CONFIG] Unknown survey type: "${type}". Valid: ${Object.keys(SURVEY_TYPES).join(', ')}`
      );
      return false;
    }
    if (!storageAvailable) {
      console.warn('[CONFIG] localStorage unavailable — active survey type cannot persist');
      return false;
    }
    const saved = safeStorageSet(STORAGE_KEY_ACTIVE_SURVEY, type);
    if (saved) {
      console.log(`[CONFIG] ✅ Active survey type set to: "${type}" (${SURVEY_TYPES[type].label})`);
    }
    return saved;
  }

  function getSurveyConfig(type = getActiveSurveyType()) {
    return SURVEY_TYPES[type] || SURVEY_TYPES[getDeviceDefaultSurveyType()] || SURVEY_TYPES[FALLBACK_SURVEY_TYPE];
  }

  function getQueueKeyForSurveyType(type = getActiveSurveyType()) {
    return getSurveyConfig(type)?.storageKey || STORAGE_KEY_QUEUE;
  }

  function getSheetNameForSurveyType(type = getActiveSurveyType()) {
    return getSurveyConfig(type)?.sheetName || SURVEY_TYPES[getDeviceDefaultSurveyType()]?.sheetName || SURVEY_TYPES[FALLBACK_SURVEY_TYPE].sheetName;
  }

  function getAllSurveyTypes() {
    return Object.keys(SURVEY_TYPES);
  }

  const CONSTANTS = deepFreeze({
    STORAGE_KEY_QUEUE,
    STORAGE_KEY_QUEUE_V2,
    STORAGE_KEY_QUEUE_V3,
    STORAGE_KEY_ANALYTICS,
    STORAGE_KEY_ANALYTICS_V3,
    STORAGE_KEY_STATE,
    STORAGE_KEY_LAST_SYNC,
    STORAGE_KEY_LAST_ANALYTICS_SYNC,
    STORAGE_KEY_ACTIVE_SURVEY,

    SURVEY_TYPES,
    DEFAULT_SURVEY_TYPE: FALLBACK_SURVEY_TYPE,

    MAX_QUEUE_SIZE,
    QUEUE_WARNING_THRESHOLD,
    MAX_ANALYTICS_SIZE,
    AUTO_ADVANCE_DELAY_MS,
    INACTIVITY_TIMEOUT_MS,
    SYNC_INTERVAL_MS,
    ANALYTICS_SYNC_INTERVAL_MS,
    ADMIN_PANEL_TIMEOUT_MS,
    RESET_DELAY_MS,
    TYPEWRITER_DURATION_MS,
    TEXT_ROTATION_INTERVAL_MS,
    VISIBILITY_CHANGE_DELAY_MS,
    STATUS_MESSAGE_AUTO_CLEAR_MS,
    ERROR_MESSAGE_AUTO_CLEAR_MS,
    START_SCREEN_REMOVE_DELAY_MS,
    MAX_RETRIES,
    RETRY_DELAY_MS,

    SYNC_ENDPOINT,
    ANALYTICS_ENDPOINT,
    SURVEY_QUESTIONS_URL,
    ERROR_LOG_ENDPOINT,

    FEATURES,
  });

  const KIOSK_CONFIG = {
    get KIOSK_ID() {
      return window.DEVICECONFIG?.kioskId || 'KIOSK-GWINNETT-001';
    },

    storageAvailable,

    getDefaultSurveyType,
    getActiveSurveyType,
    setActiveSurveyType,
    getSurveyConfig,
    getQueueKeyForSurveyType,
    getSheetNameForSurveyType,
    getAllSurveyTypes,
    isValidSurveyType,
  };

  window.CONSTANTS    = CONSTANTS;
  window.KIOSK_CONFIG = KIOSK_CONFIG;

  const activeType   = getActiveSurveyType();
  const activeConfig = getSurveyConfig(activeType);

  console.log('═══════════════════════════════════════════════════════');
  console.log('⚙️  CONFIG LOADED (v3.3.0)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Kiosk ID      : ${KIOSK_CONFIG.KIOSK_ID}`);
  console.log(`  Device Mode   : ${window.DEVICECONFIG?.kioskMode || 'unknown'}`);
  console.log(`  Device Default: ${getDeviceDefaultSurveyType()}`);
  console.log(`  Storage       : ${storageAvailable ? 'Available' : 'Unavailable'}`);
  console.log(`  Active Survey : ${activeType} (${activeConfig?.label})`);
  console.log(`  Queue (T1)    : ${STORAGE_KEY_QUEUE}`);
  console.log(`  Queue (T2)    : ${STORAGE_KEY_QUEUE_V2}`);
  console.log(`  Queue (T3)    : ${STORAGE_KEY_QUEUE_V3}`);
  console.log(`  Sync Endpoint : ${SYNC_ENDPOINT}`);
  console.log('═══════════════════════════════════════════════════════');
})();
