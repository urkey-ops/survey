// FILE: main/networkStatus.js
// PURPOSE: Network status monitoring with offline-first approach
// DEPENDENCIES: window.CONSTANTS, window.dataHandlers, window.globals
// VERSION: 3.0.0 - BUG #20 FIX: visibilitychange resets stuck syncInProgress >60s
//                  All original logic preserved: retry/backoff, safeSync, periodicCheck,
//                  serviceWorker message handler, forceSyncAttempt, getNetworkStatus

let isCurrentlyOnline       = navigator.onLine;
let syncInProgress          = false;
let networkCheckIntervalId  = null;
let retryAttempts           = {}; // Per-sync-type retry tracking
let syncStartedAt           = null; // BUG #20 — track when sync began

// ── Retry backoff configuration ───────────────────────────────────────────────

const RETRY_CONFIG = {
  maxAttempts: 5,
  baseDelayMs: 2000,
  maxDelayMs:  60000, // 1 minute
};

const STUCK_SYNC_TIMEOUT_MS = 60000; // BUG #20 — 60s stuck threshold

// ── Retry helpers ─────────────────────────────────────────────────────────────

/**
 * Get retry delay with exponential backoff + jitter.
 */
function getRetryDelay(type, attempt) {
  const delay = Math.min(
    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
    RETRY_CONFIG.maxDelayMs
  );
  return delay + Math.random() * 1000;
}

function resetRetryCount(type) {
  retryAttempts[type] = 0;
}

function shouldRetry(type) {
  const attempts = retryAttempts[type] || 0;
  return attempts < RETRY_CONFIG.maxAttempts;
}

function recordRetry(type) {
  retryAttempts[type] = (retryAttempts[type] || 0) + 1;
}

// ── BUG #20 FIX: Stuck-flag reset on visibility ───────────────────────────────

/**
 * When the iPad wakes from sleep it fires visibilitychange → visible.
 * If syncInProgress was set before sleep, the finally block never ran.
 * After 60s we assume it's stuck and reset, re-enabling the Sync button.
 */
function resetStuckSyncIfNeeded() {
  if (syncInProgress && syncStartedAt && (Date.now() - syncStartedAt) > STUCK_SYNC_TIMEOUT_MS) {
    console.warn('[NETWORK] ⚠️ syncInProgress stuck >60s (device likely slept mid-sync) — resetting');
    syncInProgress = false;
    syncStartedAt  = null;
    retryAttempts  = {}; // also clear retry counters — fresh start

    // Re-enable the admin panel sync button if visible
    const syncButton = window.globals?.syncButton;
    if (syncButton) {
      syncButton.disabled        = !navigator.onLine;
      syncButton.textContent     = 'Sync Data';
      syncButton.style.opacity   = navigator.onLine ? '1' : '0.5';
      syncButton.style.cursor    = navigator.onLine ? 'pointer' : 'not-allowed';
      syncButton.setAttribute('aria-busy',     'false');
      syncButton.setAttribute('aria-disabled', !navigator.onLine ? 'true' : 'false');
    }
  }
}

// ── Online handler ────────────────────────────────────────────────────────────

/**
 * Handle online event — connection restored.
 * Triggers data sync then analytics sync sequentially.
 */
function handleOnline() {
  const CONSTANTS          = window.CONSTANTS;
  const dataHandlers       = window.dataHandlers;
  const syncStatusMessage  = window.globals?.syncStatusMessage;

  isCurrentlyOnline = true;
  console.log('[NETWORK] ✅ Connection restored');

  if (syncStatusMessage) {
    syncStatusMessage.textContent = '✅ Back online. Syncing queued data...';
    syncStatusMessage.style.color = '#16a34a';
  }

  if (!syncInProgress) {
    syncInProgress = true;
    syncStartedAt  = Date.now(); // BUG #20
    setTimeout(async () => {
      try {
        // 1) Data sync first
        if (dataHandlers?.syncData) {
          await dataHandlers.syncData(false);
          resetRetryCount('data');
        }

        // 2) Then analytics sync
        if (dataHandlers?.syncAnalytics) {
          await dataHandlers.syncAnalytics(false);
          resetRetryCount('analytics');
        }

        if (syncStatusMessage) {
          syncStatusMessage.textContent = '✅ All data & analytics synced';
          setTimeout(() => {
            syncStatusMessage.textContent = '';
          }, CONSTANTS?.STATUS_MESSAGE_AUTO_CLEAR_MS || 3000);
        }

      } catch (error) {
        console.error('[NETWORK] Sync failed:', error);
        if (syncStatusMessage) {
          syncStatusMessage.textContent = '⚠️ Sync incomplete - will retry';
        }
      } finally {
        syncInProgress = false;
        syncStartedAt  = null; // BUG #20
      }
    }, 1000);
  }
}

// ── Offline handler ───────────────────────────────────────────────────────────

/**
 * Handle offline event — connection lost.
 */
function handleOffline() {
  const syncStatusMessage = window.globals?.syncStatusMessage;

  isCurrentlyOnline = false;
  console.log('[NETWORK] ❌ Connection lost - Operating in OFFLINE mode');

  if (syncStatusMessage) {
    syncStatusMessage.textContent = '📱 Offline mode - All data saved locally';
    syncStatusMessage.style.color = '#ea580c';
  }
}

// ── Offline indicator (disabled — runs silently) ──────────────────────────────

function showOfflineIndicator() {
  console.log('[NETWORK] Offline indicator disabled - running silently');
  return;
}

function hideOfflineIndicator() {
  const indicator = document.getElementById('offline-indicator');
  if (indicator) {
    indicator.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => indicator.remove(), 300);
  }
}

// ── safeSync — race condition protected, per-type retry/backoff ───────────────

/**
 * Sequential sync with race condition protection and exponential backoff retry.
 * @param {string}  syncType  - 'data' or 'analytics'
 * @param {boolean} isManual  - true = manual trigger (admin panel button)
 */
async function safeSync(syncType, isManual = false) {
  if (syncInProgress) {
    console.log(`[NETWORK] ${syncType} sync skipped — already in progress`);
    return false;
  }

  const dataHandlers      = window.dataHandlers;
  const hasDataSync       = syncType === 'data'      && dataHandlers?.syncData;
  const hasAnalyticsSync  = syncType === 'analytics' && dataHandlers?.syncAnalytics;

  if (!hasDataSync && !hasAnalyticsSync) {
    console.warn(`[NETWORK] No ${syncType} handler available`);
    return false;
  }

  try {
    syncInProgress = true;
    syncStartedAt  = Date.now(); // BUG #20

    if (syncType === 'data' && hasDataSync) {
      const attempts = retryAttempts.data || 0;
      console.log(`[DATA SYNC] Attempt ${attempts + 1}/${RETRY_CONFIG.maxAttempts}`);
      const success = await dataHandlers.syncData(isManual);

      if (success) {
        resetRetryCount('data');
      } else if (shouldRetry('data')) {
        recordRetry('data');
        const delay = getRetryDelay('data', retryAttempts.data);
        console.log(`[DATA SYNC] Retrying in ${Math.round(delay / 1000)}s...`);
        setTimeout(() => safeSync('data', isManual), delay);
      }

      return success;
    }

    if (syncType === 'analytics' && hasAnalyticsSync) {
      const attempts = retryAttempts.analytics || 0;
      console.log(`[ANALYTICS SYNC] Attempt ${attempts + 1}/${RETRY_CONFIG.maxAttempts}`);
      const success = await dataHandlers.syncAnalytics(isManual);

      if (success) {
        resetRetryCount('analytics');
      } else if (shouldRetry('analytics')) {
        recordRetry('analytics');
        const delay = getRetryDelay('analytics', retryAttempts.analytics);
        console.log(`[ANALYTICS SYNC] Retrying in ${Math.round(delay / 1000)}s...`);
        setTimeout(() => safeSync('analytics', isManual), delay);
      }

      return success;
    }

  } catch (error) {
    console.error(`[${syncType.toUpperCase()} SYNC] Error:`, error);
    recordRetry(syncType);
  } finally {
    syncInProgress = false;
    syncStartedAt  = null; // BUG #20
  }

  return false;
}

// ── Initial status check ──────────────────────────────────────────────────────

/**
 * Check initial network status and trigger sync if online.
 */
function checkInitialStatus() {
  const syncStatusMessage = window.globals?.syncStatusMessage;

  if (!navigator.onLine) {
    isCurrentlyOnline = false;
    if (syncStatusMessage) {
      syncStatusMessage.textContent = '📱 Starting in offline mode';
      syncStatusMessage.style.color = '#ea580c';
    }
    console.log('[NETWORK] ⚠️ Starting in OFFLINE mode');
  } else {
    isCurrentlyOnline = true;
    console.log('[NETWORK] ✅ Starting in ONLINE mode');

    setTimeout(async () => {
      if (!syncInProgress) {
        await safeSync('data',      false);
        await safeSync('analytics', false);
      }
    }, 2000);
  }
}

// ── Battery optimisation: pause/resume periodic check ────────────────────────

function pauseNetworkMonitoring() {
  if (networkCheckIntervalId) {
    clearInterval(networkCheckIntervalId);
    networkCheckIntervalId = null;
    console.log('[NETWORK] 🔋 Monitoring paused (page hidden)');
  }
}

function resumeNetworkMonitoring() {
  if (!networkCheckIntervalId) {
    startPeriodicCheck();
    console.log('[NETWORK] Monitoring resumed');
  }
}

/**
 * Periodic connection check every 30s — only fires when page is visible.
 */
function startPeriodicCheck() {
  if (networkCheckIntervalId) {
    clearInterval(networkCheckIntervalId);
  }

  networkCheckIntervalId = setInterval(() => {
    if (document.hidden) return; // Battery: skip when invisible

    if (navigator.onLine && !isCurrentlyOnline) {
      console.log('[NETWORK] Connection restored (periodic check)');
      handleOnline();
      hideOfflineIndicator();
    } else if (!navigator.onLine && isCurrentlyOnline) {
      console.log('[NETWORK] Connection lost (periodic check)');
      handleOffline();
    }
  }, 30000);
}

// ── Main setup ────────────────────────────────────────────────────────────────

/**
 * Setup network status monitoring with offline-first approach.
 *
 * BUG #20 FIX: visibilitychange → visible now calls resetStuckSyncIfNeeded()
 * before any sync logic, so a stuck syncInProgress flag from pre-sleep is
 * cleared before the reconnect sync fires.
 */
export function setupNetworkMonitoring() {
  console.log('[NETWORK] 🚀 Initializing OFFLINE-FIRST monitoring v3.0.0');

  checkInitialStatus();

  // Online event
  window.addEventListener('online', () => {
    handleOnline();
    hideOfflineIndicator();
  });

  // Offline event
  window.addEventListener('offline', handleOffline);

  // Visibility change — battery optimisation + BUG #20 fix
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log('[NETWORK] App visible — checking connection');

      // BUG #20 FIX: Reset stuck sync flag before doing anything else
      resetStuckSyncIfNeeded();

      const wasOnline   = isCurrentlyOnline;
      isCurrentlyOnline = navigator.onLine;

      if (isCurrentlyOnline && !wasOnline) {
        handleOnline();
        hideOfflineIndicator();
      } else if (!isCurrentlyOnline && wasOnline) {
        handleOffline();
      }

      // Race condition protection: only sync if not already in progress
      if (isCurrentlyOnline && !syncInProgress) {
        setTimeout(async () => {
          await safeSync('data',      false);
          await safeSync('analytics', false);
        }, 500);
      }

      resumeNetworkMonitoring();

    } else {
      pauseNetworkMonitoring();
    }
  });

  startPeriodicCheck();

  // Service worker background sync message handler
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data.type === 'BACKGROUND_SYNC') {
        console.log('[NETWORK] Background sync triggered by SW');
        if (!syncInProgress) {
          safeSync('data', false).then(() => safeSync('analytics', false));
        }
      }
    });
  }

  console.log('[NETWORK] ✅ OFFLINE-FIRST v3.0.0 active (retry + race-proof + stuck-sync-guard)');
}

// ── Public exports ────────────────────────────────────────────────────────────

/**
 * Get current online state.
 */
export function isOnline() {
  return isCurrentlyOnline;
}

/**
 * Force a manual sync attempt (called by admin panel or user action).
 */
export async function forceSyncAttempt() {
  if (!isCurrentlyOnline) {
    console.log('[NETWORK] Cannot sync — offline');
    return false;
  }

  if (syncInProgress) {
    console.log('[NETWORK] Sync already in progress');
    return false;
  }

  try {
    const dataSuccess      = await safeSync('data',      true);
    const analyticsSuccess = await safeSync('analytics', true);
    return dataSuccess && analyticsSuccess;
  } catch (error) {
    console.error('[NETWORK] Force sync failed:', error);
    return false;
  }
}

/**
 * Get detailed network status (including Network Information API if available).
 */
export function getNetworkStatus() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  return {
    online:        isCurrentlyOnline,
    effectiveType: connection?.effectiveType || 'unknown',
    downlink:      connection?.downlink      || null,
    rtt:           connection?.rtt           || null,
    saveData:      connection?.saveData      || false,
    retryStatus:   retryAttempts,
  };
}

/**
 * Cleanup network monitoring — remove all listeners and clear interval.
 */
export function cleanupNetworkMonitoring() {
  if (networkCheckIntervalId) {
    clearInterval(networkCheckIntervalId);
    networkCheckIntervalId = null;
  }
  console.log('[NETWORK] Monitoring cleaned up');
}

export default {
  setupNetworkMonitoring,
  handleOnline,
  handleOffline,
  checkInitialStatus,
  isOnline,
  forceSyncAttempt,
  getNetworkStatus,
  cleanupNetworkMonitoring,
};
