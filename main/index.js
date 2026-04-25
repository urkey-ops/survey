// FILE: main/index.js
// PURPOSE: Main application entry point — orchestrates initialization
// VERSION: 5.7.1
// CHANGES FROM 5.6.0:
//   - FIX: Start screen tap freeze on first launch.
//     Root cause: on first launch, device-config.js calls
//     window._initializeSurveyState() → showStartScreen() (tap listener #1).
//     Then index.js Path 2 and/or Path 3 also fire, calling initialize() →
//     initializeSurveyState() → showStartScreen() again (listener #2/#3
//     replacing #1). First tap hits a dead element.
//   - FIX: navigationSetup.js v3.2.0 sets window.__surveyStateInitialized = true
//     on first successful run. index.js now checks this flag before calling
//     initializeSurveyState() in the "device configured" branch.
//   - REVERT: Object.defineProperty setter approach from v5.7.0 removed —
//     navigationSetup.js assigns window._initializeSurveyState as a plain
//     module-bottom assignment, always overwriting the setter silently.
//   - All other logic unchanged from v5.6.0.

import { initializeElements, validateElements, showCriticalError } from './uiElements.js';
import { setupNavigation, setupActivityTracking, initializeSurveyState } from './navigationSetup.js';
import { setupAdminPanel } from './adminPanel.js';
import { setupNetworkMonitoring } from './networkStatus.js';
import { setupVisibilityHandler } from './visibilityHandler.js';
import { setupInactivityVisibilityHandler, startPeriodicSync } from '../timers/inactivityHandler.js';

// ── Init guards / timer refs ──────────────────────────────────────────────────
let initializationStarted    = false;
let initializationCompleted  = false;
let heartbeatIntervalId      = null;
let storageMonitorIntervalId = null;
let emergencyOnlineHandler   = null;
let pendingDataHandlersPoll  = null;

// ── Race-proof boot strategy ──────────────────────────────────────────────────
//
// Three paths with a shared `started` guard:
//   Path 1 — kioskMode already set → start immediately (normal launch)
//   Path 2 — listen for deviceConfigReady (first launch, modules win race)
//   Path 3 — 500ms safety net (first launch, IIFE won race, event was missed)
//
// On first launch all three paths may fire. initialize() is guarded by
// initializationStarted/Completed so only one full init runs.
// The remaining race — initializeSurveyState() being called by both
// device-config.js AND initialize() — is handled by
// window.__surveyStateInitialized in navigationSetup.js v3.2.0.

function startApp() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}

let started = false;

function onConfigReady() {
  if (started) return;
  started = true;
  window.removeEventListener('deviceConfigReady', onConfigReady);
  console.log('[INIT] deviceConfigReady received — starting app');
  startApp();
}

// Path 1: Already configured (every launch after first setup)
if (window.DEVICECONFIG?.kioskMode) {
  started = true;
  startApp();
} else {
  // Path 2: Listen for event (first launch — modules load before user picks)
  window.addEventListener('deviceConfigReady', onConfigReady);

  // Path 3: Safety net — IIFE may have fired deviceConfigReady before this
  // module's listener was registered. Poll once after 500ms.
  setTimeout(() => {
    if (!started && window.DEVICECONFIG?.kioskMode) {
      console.log('[INIT] deviceConfigReady was missed — starting via safety net');
      onConfigReady();
    }
  }, 500);
}

// ── First-launch detection ────────────────────────────────────────────────────

function isDeviceConfigured() {
  const cfg = window.DEVICECONFIG;
  return !!(cfg?.kioskMode && cfg?.allowedSurveyTypes?.length > 0);
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────

function startHeartbeat() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }

  heartbeatIntervalId = setInterval(() => {
    if (document.hidden) return;
    if (!window.dataHandlers || !window.appState) return;

    const CONSTANTS    = window.CONSTANTS;
    const dataHandlers = window.dataHandlers;
    const appState     = window.appState;

    const type1Key = CONSTANTS?.SURVEY_TYPES?.type1?.storageKey
      || CONSTANTS?.STORAGE_KEY_QUEUE
      || 'submissionQueue';

    const type2Key = CONSTANTS?.SURVEY_TYPES?.type2?.storageKey
      || CONSTANTS?.STORAGE_KEY_QUEUE_V2
      || 'submissionQueueV2';

    const type3Key = CONSTANTS?.SURVEY_TYPES?.type3?.storageKey
      || CONSTANTS?.STORAGE_KEY_QUEUE_V3
      || 'shayonaQueue';

    const queue1    = dataHandlers.getSubmissionQueue?.(type1Key) ?? [];
    const queue2    = dataHandlers.getSubmissionQueue?.(type2Key) ?? [];
    const queue3    = dataHandlers.getSubmissionQueue?.(type3Key) ?? [];
    const analytics = dataHandlers.safeGetLocalStorage?.(CONSTANTS?.STORAGE_KEY_ANALYTICS) ?? [];

    console.log(
      `[HEARTBEAT] ❤️ Kiosk alive | ` +
      `Queue T1: ${queue1.length} | Queue T2: ${queue2.length} | Queue T3: ${queue3.length} | ` +
      `Analytics: ${analytics.length} | Question: ${appState.currentQuestionIndex + 1} | ` +
      `Online: ${navigator.onLine ? '✔' : '✗'}`
    );
  }, 15 * 60 * 1000);
}

// ── Storage quota check ───────────────────────────────────────────────────────

function waitForDataHandlersThen(callback, retries = 10, delayMs = 200) {
  if (window.dataHandlers) {
    callback();
    return;
  }

  if (retries <= 0) {
    console.warn('[INIT] dataHandlers not available after polling — skipping storage check');
    return;
  }

  pendingDataHandlersPoll = setTimeout(() => {
    pendingDataHandlersPoll = null;
    waitForDataHandlersThen(callback, retries - 1, delayMs);
  }, delayMs);
}

function clearPendingDataHandlersPoll() {
  if (pendingDataHandlersPoll) {
    clearTimeout(pendingDataHandlersPoll);
    pendingDataHandlersPoll = null;
  }
}

function runStorageQuotaCheck() {
  if (!window.dataHandlers?.checkStorageQuota) return;

  const quotaStatus = window.dataHandlers.checkStorageQuota();
  if (!quotaStatus) return;

  if (quotaStatus.status === 'critical') {
    console.error(`[INIT] 🚨 Storage critical (${quotaStatus.percentUsed}%) — triggering emergency sync`);

    if (navigator.onLine && window.dataHandlers.syncData) {
      console.log('[INIT] 🔄 Auto-syncing to free storage...');

      window.dataHandlers.syncData(true)
        .then(success => {
          if (success) {
            console.log('[INIT] ✅ Emergency sync freed storage');
            setTimeout(() => {
              const newStatus = window.dataHandlers.checkStorageQuota?.();
              if (!newStatus) return;
              console.log(`[INIT] Storage after sync: ${newStatus.status} (${newStatus.percentUsed}%)`);
              if (newStatus.status === 'critical') {
                console.error('[INIT] ⚠️ Storage still critical — manual intervention may be needed');
              }
            }, 2000);
          } else {
            console.error('[INIT] ❌ Emergency sync failed');
            _showStorageAlert('⚠️ Storage full — please sync manually');
          }
        })
        .catch(err => console.error('[INIT] Emergency sync error:', err));

    } else if (!navigator.onLine) {
      console.error('[INIT] 🚨 Storage critical but OFFLINE — data loss risk!');
      _showStorageAlert('🚨 Storage full & offline — connect to internet');

      if (emergencyOnlineHandler) {
        window.removeEventListener('online', emergencyOnlineHandler);
      }

      emergencyOnlineHandler = () => {
        console.log('[INIT] Device online — attempting emergency sync');
        window.dataHandlers?.syncData?.(true);
        window.removeEventListener('online', emergencyOnlineHandler);
        emergencyOnlineHandler = null;
      };

      window.addEventListener('online', emergencyOnlineHandler);

    } else {
      console.error('[INIT] 🚨 Storage critical but syncData not available!');
    }

  } else if (quotaStatus.status === 'warning') {
    console.warn(`[INIT] ⚠️ Storage at ${quotaStatus.percentUsed}% — monitoring`);
  } else {
    console.log(`[INIT] ✅ Storage healthy: ${quotaStatus.percentUsed}% used`);
  }
}

function startStorageMonitoring() {
  if (storageMonitorIntervalId) {
    clearInterval(storageMonitorIntervalId);
    storageMonitorIntervalId = null;
  }

  storageMonitorIntervalId = setInterval(() => {
    if (!window.dataHandlers?.checkStorageQuota) return;

    const quotaStatus = window.dataHandlers.checkStorageQuota();
    if (!quotaStatus) return;

    if (quotaStatus.status === 'critical') {
      console.error(`[STORAGE CHECK] 🚨 CRITICAL: ${quotaStatus.percentUsed}% — triggering emergency sync`);
      if (navigator.onLine && window.dataHandlers.syncData) {
        window.dataHandlers.syncData(true);
      }
    } else if (quotaStatus.status === 'warning') {
      console.warn(`[STORAGE CHECK] ⚠️ WARNING: ${quotaStatus.percentUsed}% used`);
    }
  }, 30 * 60 * 1000);
}

function _showStorageAlert(message) {
  if (window.globals?.syncStatusMessage) {
    window.globals.syncStatusMessage.textContent      = message;
    window.globals.syncStatusMessage.style.color      = '#dc2626';
    window.globals.syncStatusMessage.style.fontWeight = 'bold';
  }

  const adminControls = window.globals?.adminControls;
  if (adminControls?.classList.contains('hidden')) {
    console.log('[INIT] Auto-showing admin panel due to storage crisis');
    adminControls.classList.remove('hidden');
  }
}

// ── Survey type reconciliation ────────────────────────────────────────────────

function reconcileSurveyType() {
  const allowed = window.DEVICECONFIG?.allowedSurveyTypes;
  if (!allowed?.length) return;

  const current = window.KIOSK_CONFIG?.getActiveSurveyType?.();
  if (!current) return;

  if (!allowed.includes(current)) {
    const corrected = allowed[0];
    const success   = window.KIOSK_CONFIG.setActiveSurveyType(corrected);
    if (success) {
      console.log(`[INIT] ✅ Survey type corrected: "${current}" → "${corrected}"`);
    } else {
      console.warn(`[INIT] ⚠️ Survey type correction failed — KIOSK_CONFIG.setActiveSurveyType returned false`);
    }
  } else {
    console.log(`[INIT] ✅ Survey type confirmed: "${current}" (allowed by device config)`);
  }
}

// ── Main initialisation ───────────────────────────────────────────────────────

function initialize() {
  if (initializationCompleted) {
    console.log('[INIT] Initialization already completed — skipping duplicate run');
    return;
  }

  if (initializationStarted) {
    console.log('[INIT] Initialization already in progress — skipping duplicate run');
    return;
  }

  initializationStarted = true;

  try {
    console.log('[INIT] DOM ready — Initializing kiosk...');
    console.log(`[INIT] Device mode: ${window.DEVICECONFIG?.kioskMode ?? 'unknown'}`);
    console.log(`[INIT] Allowed survey types: ${(window.DEVICECONFIG?.allowedSurveyTypes ?? []).join(', ') || 'none'}`);

    // Step 1: Initialize DOM element references
    initializeElements();

    // Step 2: Storage quota check
    try {
      clearPendingDataHandlersPoll();
      waitForDataHandlersThen(runStorageQuotaCheck);
      startStorageMonitoring();
    } catch (err) {
      console.error('[INIT] Storage check failed:', err);
    }

    // Step 3: Validate all critical elements exist
    const validation = validateElements();
    if (!validation.valid) {
      showCriticalError(validation.missingElements);
      initializationStarted = false;
      return;
    }
    console.log('[INIT] All essential elements found');

    // Step 4: Reconcile survey type BEFORE any navigation/survey setup
    reconcileSurveyType();

    // Step 5: Setup navigation buttons
    setupNavigation();

    // Step 6: Setup activity tracking
    setupActivityTracking();

    // Step 7: Setup admin panel
    setupAdminPanel();

    // Step 8: Initialize survey state.
    //
    // On first launch: device-config.js confirm handler already called
    // window._initializeSurveyState() after the user picked a mode.
    // navigationSetup.js v3.2.0 sets window.__surveyStateInitialized = true
    // on that first successful call. We check that flag here — if already
    // done, skip entirely to preserve the tap listener on the live start screen.
    //
    // On all subsequent launches (kioskMode pre-configured in localStorage):
    // flag is not yet set, isDeviceConfigured() is true → call normally.

    if (isDeviceConfigured()) {
      if (window.__surveyStateInitialized) {
        console.log('[INIT] ✅ Survey state already initialized by device-config — skipping duplicate');
      } else {
        console.log('[INIT] ✅ Device configured — initializing survey state directly');
        initializeSurveyState();
      }
    } else {
      console.log('[INIT] 🆕 First launch — device-setup-overlay active, deferring survey state init');
    }

    // Step 9: Setup network monitoring
    setupNetworkMonitoring();

    // Step 10: Setup visibility change handler
    setupVisibilityHandler();

    // Step 11: Setup inactivity visibility handler
    setupInactivityVisibilityHandler();
    console.log('[INIT] ✅ Inactivity visibility handler active');

    // Step 13: Start periodic sync
    startPeriodicSync();
    console.log('[INIT] ✅ Periodic sync started (stable interval)');

    // Step 14: Start heartbeat
    startHeartbeat();
    console.log('[INIT] ✅ Heartbeat started (15 min, hidden-aware)');

    initializationCompleted = true;
    initializationStarted   = false;

    console.log('[INIT] ✅ Initialization complete');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error) {
    initializationStarted = false;
    console.error('[INIT] ❌ Initialization failed:', error);
    showCriticalError([error.message || 'Unknown initialization error']);
  }
}

// ── Cleanup hook ──────────────────────────────────────────────────────────────

export function cleanupMainInitialization() {
  clearPendingDataHandlersPoll();

  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }

  if (storageMonitorIntervalId) {
    clearInterval(storageMonitorIntervalId);
    storageMonitorIntervalId = null;
  }

  if (emergencyOnlineHandler) {
    window.removeEventListener('online', emergencyOnlineHandler);
    emergencyOnlineHandler = null;
  }

  initializationStarted   = false;
  initializationCompleted = false;
  started                 = false;

  console.log('[INIT] Cleanup complete');
}

export { initialize };
export default { initialize, cleanupMainInitialization };
