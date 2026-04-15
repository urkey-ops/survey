// FILE: main/index.js
// PURPOSE: Main application entry point — orchestrates initialization
// VERSION: 5.0.0 - BUG FIXES: heartbeat hidden-guard, startPeriodicSync moved here, checkQuota retry-poll

import { initializeElements, validateElements, showCriticalError } from './uiElements.js';
import { setupNavigation, setupActivityTracking, initializeSurveyState } from './navigationSetup.js';
import { setupAdminPanel } from './adminPanel.js';
import { setupNetworkMonitoring } from './networkStatus.js';
import { setupVisibilityHandler } from './visibilityHandler.js';
import { setupInactivityVisibilityHandler, startPeriodicSync } from '../timers/inactivityHandler.js';
import { setupTypewriterVisibilityHandler } from '../ui/typewriterEffect.js';

// ── Heartbeat ─────────────────────────────────────────────────────────────────

/**
 * Periodic system-status log.
 *
 * BUG #23 FIX: Added document.hidden guard so the interval callback is a
 * no-op while the iPad screen is off — avoids waking the JS engine every
 * 15 minutes during kiosk idle/sleep.
 */
function startHeartbeat() {
  const CONSTANTS    = window.CONSTANTS;
  const appState     = window.appState;
  const dataHandlers = window.dataHandlers;

  setInterval(() => {
    // BUG #23 FIX: Skip entirely when page is hidden
    if (document.hidden) return;

    const queue     = dataHandlers.getSubmissionQueue();
    const analytics = dataHandlers.safeGetLocalStorage(CONSTANTS.STORAGE_KEY_ANALYTICS) || [];
    console.log(
      `[HEARTBEAT] ❤️ Kiosk alive | Queue: ${queue.length} | Analytics: ${analytics.length} | ` +
      `Question: ${appState.currentQuestionIndex + 1} | Online: ${navigator.onLine ? '✔' : '✗'}`
    );
  }, 15 * 60 * 1000);
}

// ── Storage quota check ───────────────────────────────────────────────────────

/**
 * BUG #24 FIX: Poll for dataHandlers readiness instead of an arbitrary 1s timeout.
 * Retries up to 10 times at 200ms intervals (~2s total window) before giving up.
 * This handles slow module parse on cold cache without false "not available" warnings.
 */
function waitForDataHandlersThen(callback, retries = 10, delayMs = 200) {
  if (window.dataHandlers) {
    callback();
    return;
  }
  if (retries <= 0) {
    console.warn('[INIT] dataHandlers not available after polling — skipping storage check');
    return;
  }
  setTimeout(() => {
    waitForDataHandlersThen(callback, retries - 1, delayMs);
  }, delayMs);
}

function runStorageQuotaCheck() {
  if (!window.dataHandlers || !window.dataHandlers.checkStorageQuota) return;

  const quotaStatus = window.dataHandlers.checkStorageQuota();

  if (quotaStatus.status === 'critical') {
    console.error(`[INIT] 🚨 Storage critical (${quotaStatus.percentUsed}%) — triggering emergency sync`);

    if (navigator.onLine && window.dataHandlers.syncData) {
      console.log('[INIT] 🔄 Auto-syncing to free storage...');
      window.dataHandlers.syncData(true)
        .then(success => {
          if (success) {
            console.log('[INIT] ✅ Emergency sync freed storage');
            setTimeout(() => {
              const newStatus = window.dataHandlers.checkStorageQuota();
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

      const onlineHandler = () => {
        console.log('[INIT] Device online — attempting emergency sync');
        if (window.dataHandlers.syncData) window.dataHandlers.syncData(true);
        window.removeEventListener('online', onlineHandler);
      };
      window.addEventListener('online', onlineHandler);

    } else {
      console.error('[INIT] 🚨 Storage critical but syncData not available!');
    }

  } else if (quotaStatus.status === 'warning') {
    console.warn(`[INIT] ⚠️ Storage at ${quotaStatus.percentUsed}% — monitoring`);
  } else {
    console.log(`[INIT] ✅ Storage healthy: ${quotaStatus.percentUsed}% used`);
  }
}

function _showStorageAlert(message) {
  if (window.globals?.syncStatusMessage) {
    window.globals.syncStatusMessage.textContent = message;
    window.globals.syncStatusMessage.style.color = '#dc2626';
    window.globals.syncStatusMessage.style.fontWeight = 'bold';
  }
  // Auto-surface admin panel so staff can take action
  const adminControls = window.globals?.adminControls;
  if (adminControls && adminControls.classList.contains('hidden')) {
    console.log('[INIT] Auto-showing admin panel due to storage crisis');
    adminControls.classList.remove('hidden');
  }
}

// ── Main initialisation ───────────────────────────────────────────────────────

function initialize() {
  console.log('[INIT] DOM Content Loaded — Initializing kiosk...');

  // Step 1: Initialize DOM element references
  initializeElements();

  // Step 2: Storage quota check (with retry-poll for dataHandlers readiness)
  try {
    waitForDataHandlersThen(runStorageQuotaCheck);

    // Periodic monitor every 30 minutes (only checks — does NOT auto-sync unless critical)
    setInterval(() => {
      if (!window.dataHandlers || !window.dataHandlers.checkStorageQuota) return;
      const quotaStatus = window.dataHandlers.checkStorageQuota();
      if (quotaStatus.status === 'critical') {
        console.error(`[STORAGE CHECK] 🚨 CRITICAL: ${quotaStatus.percentUsed}% — triggering emergency sync`);
        if (navigator.onLine && window.dataHandlers.syncData) {
          window.dataHandlers.syncData(true);
        }
      } else if (quotaStatus.status === 'warning') {
        console.warn(`[STORAGE CHECK] ⚠️ WARNING: ${quotaStatus.percentUsed}% used`);
      }
    }, 30 * 60 * 1000);

  } catch (err) {
    console.error('[INIT] Storage check failed:', err);
  }

  // Step 3: Validate all critical elements exist
  const validation = validateElements();
  if (!validation.valid) {
    showCriticalError(validation.missingElements);
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

  // Step 10: Setup inactivity visibility handler (battery optimisation)
  setupInactivityVisibilityHandler();
  console.log('[INIT] ✅ Inactivity visibility handler active');

  // Step 11: Setup typewriter visibility handler (battery optimisation)
  setupTypewriterVisibilityHandler();
  console.log('[INIT] ✅ Typewriter visibility handler active');

  // Step 12: Start periodic sync — called HERE (not inside resetInactivityTimer)
  // BUG #16 FIX: startPeriodicSync() was called on every user interaction inside
  // resetInactivityTimer(), resetting the sync countdown each time.
  // Calling it once here ensures the sync interval fires on a stable schedule.
  startPeriodicSync();
  console.log('[INIT] ✅ Periodic sync started (stable interval)');

  // Step 13: Start heartbeat
  startHeartbeat();
  console.log('[INIT] ✅ Heartbeat started (15 min, hidden-aware)');

  console.log('[INIT] ✅ Initialization complete');
  console.log('═══════════════════════════════════════════════════════════');
}

document.addEventListener('DOMContentLoaded', initialize);

export { initialize };
export default { initialize };
