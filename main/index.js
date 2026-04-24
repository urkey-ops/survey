// FILE: main/index.js
// PURPOSE: Main application entry point — orchestrates initialization
// VERSION: 5.1.0
// FIXES:
//   - prevents duplicate initialize() runs
//   - stores heartbeat / quota monitor / emergency online listener references
//   - avoids duplicate periodic timers on re-init
//   - uses readyState-safe boot in addition to DOMContentLoaded
//   - keeps storage quota polling and periodic sync behavior

import { initializeElements, validateElements, showCriticalError } from './uiElements.js';
import { setupNavigation, setupActivityTracking, initializeSurveyState } from './navigationSetup.js';
import { setupAdminPanel } from './adminPanel.js';
import { setupNetworkMonitoring } from './networkStatus.js';
import { setupVisibilityHandler } from './visibilityHandler.js';
import { setupInactivityVisibilityHandler, startPeriodicSync } from '../timers/inactivityHandler.js';
import { setupTypewriterVisibilityHandler } from '../ui/typewriterEffect.js';

// ── Init guards / timer refs ──────────────────────────────────────────────────
let initializationStarted = false;
let initializationCompleted = false;
let heartbeatIntervalId = null;
let storageMonitorIntervalId = null;
let emergencyOnlineHandler = null;
let pendingDataHandlersPoll = null;

//----Start App One Time Config ------

function startApp() {
  // all your existing init code here
}

if (window.DEVICECONFIG) {
  // Config already existed in localStorage — start immediately
  startApp();
} else {
  // Waiting for user to pick on first launch
  window.addEventListener('deviceConfigReady', startApp, { once: true });
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────

function startHeartbeat() {
  const CONSTANTS = window.CONSTANTS;
  const appState = window.appState;
  const dataHandlers = window.dataHandlers;

  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }

  heartbeatIntervalId = setInterval(() => {
    if (document.hidden) return;
    if (!window.dataHandlers || !window.appState) return;

    const type1Key =
      window.CONSTANTS?.SURVEY_TYPES?.type1?.storageKey ||
      window.CONSTANTS?.STORAGE_KEY_QUEUE ||
      'submissionQueue';

    const type2Key =
      window.CONSTANTS?.SURVEY_TYPES?.type2?.storageKey ||
      window.CONSTANTS?.STORAGE_KEY_QUEUE_V2 ||
      'submissionQueueV2';

    const queue1 = dataHandlers.getSubmissionQueue ? dataHandlers.getSubmissionQueue(type1Key) : [];
    const queue2 = dataHandlers.getSubmissionQueue ? dataHandlers.getSubmissionQueue(type2Key) : [];
    const analytics = dataHandlers.safeGetLocalStorage
      ? (dataHandlers.safeGetLocalStorage(CONSTANTS.STORAGE_KEY_ANALYTICS) || [])
      : [];

    console.log(
      `[HEARTBEAT] ❤️ Kiosk alive | Queue T1: ${queue1.length} | Queue T2: ${queue2.length} | ` +
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
  if (!window.dataHandlers || !window.dataHandlers.checkStorageQuota) return;

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
        if (window.dataHandlers?.syncData) {
          window.dataHandlers.syncData(true);
        }
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
    if (!window.dataHandlers || !window.dataHandlers.checkStorageQuota) return;

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
    window.globals.syncStatusMessage.textContent = message;
    window.globals.syncStatusMessage.style.color = '#dc2626';
    window.globals.syncStatusMessage.style.fontWeight = 'bold';
  }

  const adminControls = window.globals?.adminControls;
  if (adminControls && adminControls.classList.contains('hidden')) {
    console.log('[INIT] Auto-showing admin panel due to storage crisis');
    adminControls.classList.remove('hidden');
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
    console.log('[INIT] DOM Content Loaded — Initializing kiosk...');

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
    console.log('[INIT] ✅ All essential elements found');

    // Step 4: Setup navigation
    setupNavigation();

    // Step 5: Setup activity tracking
    setupActivityTracking();

    // Step 6: Setup admin panel
    setupAdminPanel();

    // Step 7: Initialize survey state (resume or start fresh)
    initializeSurveyState();

    // Step 8: Setup network monitoring
    setupNetworkMonitoring();

    // Step 9: Setup visibility change handler
    setupVisibilityHandler();

    // Step 10: Setup inactivity visibility handler
    setupInactivityVisibilityHandler();
    console.log('[INIT] ✅ Inactivity visibility handler active');

    // Step 11: Setup typewriter visibility handler
    setupTypewriterVisibilityHandler();
    console.log('[INIT] ✅ Typewriter visibility handler active');

       // Step 12: Start periodic sync
    startPeriodicSync();
    console.log('[INIT] ✅ Periodic sync started (stable interval)');

    // Step 13: Start heartbeat
    startHeartbeat();
    console.log('[INIT] ✅ Heartbeat started (15 min, hidden-aware)');

    initializationCompleted = true;
    initializationStarted = false;

    console.log('[INIT] ✅ Initialization complete');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error) {
    initializationStarted = false;
    console.error('[INIT] ❌ Initialization failed:', error);
    showCriticalError([error.message || 'Unknown initialization error']);
  }
}

// ── Ready-state-safe boot ─────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}

// Optional cleanup hook for hot reload / re-init scenarios
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

  initializationStarted = false;
  initializationCompleted = false;

  console.log('[INIT] Cleanup complete');
}

export { initialize };
export default { initialize, cleanupMainInitialization };
