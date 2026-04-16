// FILE: config.js
// PURPOSE: Central configuration for offline-first iPad kiosk PWA
// UPDATED: VERSION 3.0.0 - Added Survey Type 2 config, dual-queue support,
//          getActiveSurveyType() / setActiveSurveyType() helpers
// LOADED: First (before all other scripts)

// ═══════════════════════════════════════════════════════════
// STORAGE KEYS
// ═══════════════════════════════════════════════════════════
const STORAGE_KEY_QUEUE            = 'submissionQueue';      // Survey Type 1 queue
const STORAGE_KEY_QUEUE_V2         = 'submissionQueueV2';    // Survey Type 2 queue
const STORAGE_KEY_ANALYTICS        = 'analyticsQueue';
const STORAGE_KEY_STATE            = 'kioskState';
const STORAGE_KEY_LAST_SYNC        = 'lastSync';
const STORAGE_KEY_LAST_ANALYTICS_SYNC = 'lastAnalyticsSync';
const STORAGE_KEY_ACTIVE_SURVEY    = 'activeSurveyType';     // Persists selected survey type

// ═══════════════════════════════════════════════════════════
// SURVEY TYPE DEFINITIONS
// Add new survey types here — each needs:
//   label       - displayed in admin panel
//   sheetName   - Google Sheet tab name (must match Vercel env var)
//   storageKey  - localStorage queue key (must be unique per type)
// ═══════════════════════════════════════════════════════════
const SURVEY_TYPES = {
  type1: {
    label:      'Original Survey (V1)',
    sheetName:  'Sheet1',              // Matches SHEET_NAME env var in Vercel
    storageKey: STORAGE_KEY_QUEUE,
  },
  type2: {
    label:      'Visitor Feedback V2',
    sheetName:  'VisitorFeedbackV2',   // Matches SHEET_NAME_V2 env var in Vercel
    storageKey: STORAGE_KEY_QUEUE_V2,
  },
};

// ═══════════════════════════════════════════════════════════
// QUEUE & SYNC LIMITS
// ═══════════════════════════════════════════════════════════
const MAX_QUEUE_SIZE             = 250;
const QUEUE_WARNING_THRESHOLD    = 200;
const MAX_ANALYTICS_SIZE         = 500;
const AUTO_ADVANCE_DELAY_MS      = 50;
const INACTIVITY_TIMEOUT_MS      = 60000;  // 1 minute
const SYNC_INTERVAL_MS           = 300000; // 5 minutes
const ANALYTICS_SYNC_INTERVAL_MS = 600000; // 10 minutes

// ═══════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════
const SYNC_ENDPOINT      = '/api/submit-survey';
const ANALYTICS_ENDPOINT = '/api/sync-analytics';

// ═══════════════════════════════════════════════════════════
// EXPOSE AS window.CONSTANTS (read-only)
// ═══════════════════════════════════════════════════════════
window.CONSTANTS = Object.freeze({
  // Storage keys
  STORAGE_KEY_QUEUE,
  STORAGE_KEY_QUEUE_V2,
  STORAGE_KEY_ANALYTICS,
  STORAGE_KEY_STATE,
  STORAGE_KEY_LAST_SYNC,
  STORAGE_KEY_LAST_ANALYTICS_SYNC,
  STORAGE_KEY_ACTIVE_SURVEY,

  // Survey type definitions
  SURVEY_TYPES,

  // Limits
  MAX_QUEUE_SIZE,
  QUEUE_WARNING_THRESHOLD,
  MAX_ANALYTICS_SIZE,
  AUTO_ADVANCE_DELAY_MS,
  INACTIVITY_TIMEOUT_MS,
  SYNC_INTERVAL_MS,
  ANALYTICS_SYNC_INTERVAL_MS,

  // Endpoints
  SYNC_ENDPOINT,
  ANALYTICS_ENDPOINT,
});

// ═══════════════════════════════════════════════════════════
// KIOSK CONFIGURATION
// Central place for kiosk identity + survey type switching
// ═══════════════════════════════════════════════════════════
window.KIOSK_CONFIG = {
  KIOSK_ID: 'KIOSK-GWINNETT-001',

  /**
   * Get the currently active survey type.
   * Reads from localStorage so it persists across reloads.
   * Falls back to 'type1' if not set.
   * @returns {'type1'|'type2'|string}
   */
  getActiveSurveyType() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ACTIVE_SURVEY);
      if (stored && SURVEY_TYPES[stored]) return stored;
    } catch (e) {
      console.warn('[CONFIG] Could not read activeSurveyType from localStorage:', e.message);
    }
    return 'type1';
  },

  /**
   * Set the active survey type and persist to localStorage.
   * @param {'type1'|'type2'|string} type
   */
  setActiveSurveyType(type) {
    if (!SURVEY_TYPES[type]) {
      console.error(`[CONFIG] Unknown survey type: "${type}". Valid: ${Object.keys(SURVEY_TYPES).join(', ')}`);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_SURVEY, type);
      console.log(`[CONFIG] ✅ Active survey type set to: "${type}" (${SURVEY_TYPES[type].label})`);
    } catch (e) {
      console.warn('[CONFIG] Could not persist activeSurveyType:', e.message);
    }
  },
};

// ═══════════════════════════════════════════════════════════
// BOOT LOG
// ═══════════════════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════');
console.log('⚙️  CONFIG LOADED (v3.0.0)');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Kiosk ID      : ${window.KIOSK_CONFIG.KIOSK_ID}`);
console.log(`  Active Survey : ${window.KIOSK_CONFIG.getActiveSurveyType()} (${SURVEY_TYPES[window.KIOSK_CONFIG.getActiveSurveyType()]?.label})`);
console.log(`  Queue (T1)    : ${STORAGE_KEY_QUEUE}`);
console.log(`  Queue (T2)    : ${STORAGE_KEY_QUEUE_V2}`);
console.log(`  Sync Endpoint : ${SYNC_ENDPOINT}`);
console.log('═══════════════════════════════════════════════════════');
