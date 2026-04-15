// FILE: main/networkStatus.js
// PURPOSE: Monitor network connectivity and manage sync on reconnect
// VERSION: 3.0.0 - BUG #20 FIX: visibilitychange resets stuck syncInProgress >60s

const RECONNECT_SYNC_DELAY_MS   = 2000;
const STUCK_SYNC_TIMEOUT_MS     = 60000; // 60s — BUG #20

let reconnectTimer     = null;
let syncStatusTimeout  = null;
let syncInProgress     = false;
let syncStartedAt      = null; // BUG #20

// ── DOM helper ────────────────────────────────────────────────────────────────

function getSyncStatusMessage() {
  return window.globals?.syncStatusMessage || document.getElementById('syncStatusMessage');
}

function updateStatusMessage(text, color = '#374151', durationMs = 0) {
  const el = getSyncStatusMessage();
  if (!el) return;

  el.textContent        = text;
  el.style.color        = color;
  el.style.fontWeight   = text ? 'bold' : 'normal';

  if (syncStatusTimeout) { clearTimeout(syncStatusTimeout); syncStatusTimeout = null; }

  if (durationMs > 0) {
    syncStatusTimeout = setTimeout(() => {
      el.textContent      = '';
      el.style.color      = '';
      el.style.fontWeight = '';
    }, durationMs);
  }
}

// ── BUG #20 FIX: Stuck syncInProgress reset ───────────────────────────────────

/**
 * On visibility change (visible), check if syncInProgress has been stuck.
 * An iPad sleep during a sync never receives the `finally` block —
 * so syncInProgress stays true forever, permanently disabling the Sync button.
 */
function handleVisibilityChangeForSync() {
  if (document.hidden) return; // Only act on becoming visible

  if (syncInProgress && syncStartedAt && (Date.now() - syncStartedAt) > STUCK_SYNC_TIMEOUT_MS) {
    console.warn('[NETWORK] ⚠️ syncInProgress was stuck >60s (device likely slept mid-sync) — resetting');
    syncInProgress = false;
    syncStartedAt  = null;

    // Re-enable the sync button if it exists
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

// ── Sync trigger ──────────────────────────────────────────────────────────────

async function triggerBackgroundSync() {
  if (syncInProgress) {
    console.log('[NETWORK] Sync already in progress — skipping reconnect sync');
    return;
  }

  if (!window.dataHandlers?.syncData) {
    console.warn('[NETWORK] syncData not available');
    return;
  }

  const queue1 = (() => {
    try {
      const CONSTANTS = window.CONSTANTS;
      if (!CONSTANTS) return [];
      return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_QUEUE) || '[]');
    } catch (_) { return []; }
  })();

  const queue2 = (() => {
    try {
      const CONSTANTS = window.CONSTANTS;
      if (!CONSTANTS) return [];
      return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_QUEUE_V2) || '[]');
    } catch (_) { return []; }
  })();

  if (queue1.length === 0 && queue2.length === 0) {
    console.log('[NETWORK] Queues empty — no sync needed on reconnect');
    return;
  }

  console.log(`[NETWORK] 🔄 Auto-sync on reconnect (Q1: ${queue1.length}, Q2: ${queue2.length})`);
  syncInProgress = true;
  syncStartedAt  = Date.now(); // BUG #20
  updateStatusMessage('🔄 Syncing...', '#0369a1');

  try {
    const success = await window.dataHandlers.syncData(false, { syncBothQueues: true });
    if (success) {
      console.log('[NETWORK] ✅ Auto-sync completed');
      updateStatusMessage('✅ Synced', '#059669', 3000);
    } else {
      console.warn('[NETWORK] ⚠️ Auto-sync returned false');
      updateStatusMessage('⚠️ Sync incomplete', '#d97706', 4000);
    }
  } catch (err) {
    console.error('[NETWORK] ❌ Auto-sync failed:', err.message);
    updateStatusMessage('❌ Sync failed — will retry', '#dc2626', 4000);
  } finally {
    syncInProgress = false;
    syncStartedAt  = null; // BUG #20
  }
}

// ── Online / Offline handlers ─────────────────────────────────────────────────

function handleOnline() {
  console.log('[NETWORK] 🌐 Connection restored');
  updateStatusMessage('🌐 Back online — syncing...', '#059669');

  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectTimer = setTimeout(triggerBackgroundSync, RECONNECT_SYNC_DELAY_MS);
}

function handleOffline() {
  console.log('[NETWORK] 📡 Connection lost — offline mode');
  updateStatusMessage('📡 Offline — data saved locally', '#dc2626');

  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

// ── Setup / Cleanup ───────────────────────────────────────────────────────────

export function setupNetworkMonitoring() {
  window.addEventListener('online',  handleOnline);
  window.addEventListener('offline', handleOffline);

  // BUG #20 FIX: Register visibility listener to reset stuck flags
  document.addEventListener('visibilitychange', handleVisibilityChangeForSync);

  // Set initial status
  if (!navigator.onLine) {
    updateStatusMessage('📡 Offline — data saved locally', '#dc2626');
  }

  console.log('[NETWORK] ✅ Network monitoring active (stuck-sync guard enabled)');
}

export function cleanupNetworkMonitoring() {
  window.removeEventListener('online',  handleOnline);
  window.removeEventListener('offline', handleOffline);
  document.removeEventListener('visibilitychange', handleVisibilityChangeForSync);

  if (reconnectTimer)    { clearTimeout(reconnectTimer);    reconnectTimer    = null; }
  if (syncStatusTimeout) { clearTimeout(syncStatusTimeout); syncStatusTimeout = null; }

  console.log('[NETWORK] Monitoring cleaned up');
}

export default { setupNetworkMonitoring, cleanupNetworkMonitoring };
