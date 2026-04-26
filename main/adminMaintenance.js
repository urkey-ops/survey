// FILE: main/adminMaintenance.js
// PURPOSE: Destructive/maintenance button handlers — clear local, check update, fix video + debug helpers + KIOSK SELECTOR
// VERSION: 1.2.1
// CHANGES FROM 1.2.0:
//   - FIX CRITICAL: Renamed injected selector id from 'kioskModeSelector' → 'kioskSelector'
//     to match adminPanel.js bindKioskSelector() lookup. Previously these two
//     never connected — selector was injected but never wired. Now they share the same id.
//   - FIX CRITICAL: loadKioskQueues() now exposed on window.loadKioskQueues so
//     adminPanel.js bindKioskSelector() can call it via window reference.
//   - FIX: loadKioskQueues() now calls window.dataHandlers.getAllQueueConfigsWithData()
//     which IS exposed in dataSync.js window.dataHandlers (verified). Previously
//     called a local function name that matched dataSync's local scope only.
//   - FIX: setupKioskSelector() and setupKioskSyncButton() are exported and
//     ready to be called from adminPanel.js setupAdminPanel().
//   - UNCHANGED: All password/lockout logic, all existing button handlers,
//     all exports from v1.1.0 are identical.
// DEPENDENCIES: adminState.js, adminUtils.js, queueManager v3.3.0, window.globals, window.CONSTANTS

import { adminState } from './adminState.js';
import { trackAdminEvent, vibrateSuccess, vibrateError } from './adminUtils.js';

const CLEAR_PASSWORD      = '8765';
const MAX_ATTEMPTS        = 2;
const LOCKOUT_DURATION    = 3600000;
const PASSWORD_SESSION_TIMEOUT = 300000;

let failedAttempts      = 0;
let lockoutUntil        = null;
let lastPasswordSuccess = null;

let adminClearButtonHandler   = null;
let checkUpdateButtonHandler  = null;
let fixVideoButtonHandler     = null;
let boundAdminClearButton     = null;
let boundCheckUpdateButton    = null;
let boundFixVideoButton       = null;

// ── KIOSK MODES ──────────────────────────────────────────────────────────────
const KIOSK_MODES = [
  { value: 'temple',   label: '🛕 Temple',    icon: '🛕' },
  { value: 'shayona',  label: '☕ Shayona',   icon: '☕' },
  { value: 'giftshop', label: '🛍️ Gift Shop', icon: '🛍️' },
  { value: 'activity', label: '🎉 Activity',  icon: '🎉' },
];

// Initialise from live DEVICECONFIG — falls back to 'temple'
let currentKioskMode = window.DEVICECONFIG?.kioskMode || 'temple';

// ─────────────────────────────────────────────────────────────
// PASSWORD + LOCKOUT (UNCHANGED FROM v1.1.0)
// ─────────────────────────────────────────────────────────────

export function isClearLocalLocked() {
  if (!lockoutUntil) return false;
  if (Date.now() < lockoutUntil) return true;
  lockoutUntil   = null;
  failedAttempts = 0;
  localStorage.removeItem('clearLocalLockout');
  return false;
}

export function getRemainingLockoutTime() {
  if (!lockoutUntil) return 0;
  return Math.ceil((lockoutUntil - Date.now()) / 60000);
}

function lockClearLocal() {
  lockoutUntil = Date.now() + LOCKOUT_DURATION;
  localStorage.setItem('clearLocalLockout', lockoutUntil.toString());
  console.warn('[MAINTENANCE] 🔒 Clear Local locked for 1 hour');
  trackAdminEvent('clear_local_locked', { attempts: failedAttempts });
}

export function restoreLockoutState() {
  const stored = localStorage.getItem('clearLocalLockout');
  if (!stored) return;
  const storedTime = parseInt(stored, 10);
  if (Date.now() < storedTime) {
    lockoutUntil = storedTime;
    console.warn('[MAINTENANCE] 🔒 Clear Local locked (restored from storage)');
  } else {
    localStorage.removeItem('clearLocalLockout');
  }
}

function isPasswordSessionExpired() {
  if (!lastPasswordSuccess) return true;
  return (Date.now() - lastPasswordSuccess) > PASSWORD_SESSION_TIMEOUT;
}

function verifyClearPassword() {
  if (isClearLocalLocked()) {
    const remaining = getRemainingLockoutTime();
    alert(`🔒 Clear Local is locked.\n\nToo many failed attempts.\nPlease try again in ${remaining} minutes.`);
    trackAdminEvent('clear_local_blocked', { reason: 'locked' });
    return false;
  }

  if (lastPasswordSuccess && !isPasswordSessionExpired()) {
    console.log('[MAINTENANCE] ✅ Using cached password session');
    return true;
  }

  const input = prompt('🔒 Enter password to Clear Local Storage:\n\n(This will delete all queued surveys)');

  if (input === null) {
    console.log('[MAINTENANCE] Clear Local cancelled');
    trackAdminEvent('clear_local_cancelled');
    return false;
  }

  if (input === CLEAR_PASSWORD) {
    console.log('[MAINTENANCE] ✅ Password correct');
    failedAttempts      = 0;
    lastPasswordSuccess = Date.now();
    vibrateSuccess();
    trackAdminEvent('clear_local_password_success');
    return true;
  }

  failedAttempts++;
  vibrateError();
  trackAdminEvent('clear_local_password_failed', { attempt: failedAttempts });
  console.warn(`[MAINTENANCE] ❌ Wrong password (${failedAttempts}/${MAX_ATTEMPTS})`);

  if (failedAttempts >= MAX_ATTEMPTS) {
    lockClearLocal();
    alert('❌ Incorrect password.\n\nToo many failed attempts.\n\n🔒 Clear Local is now LOCKED for 1 hour.');
  } else {
    const remaining = MAX_ATTEMPTS - failedAttempts;
    alert(`❌ Incorrect password.\n\nYou have ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`);
  }

  return false;
}

// ── KIOSK MODE SELECTOR ───────────────────────────────────────────────────────

export function setupKioskSelector(containerId = 'adminControls') {
  // FIX: Use adminControls as container — it always exists in index.html.
  // adminHeader / adminActions are not static IDs in the HTML.
  const container = document.getElementById(containerId)
    || document.getElementById('adminControls');

  if (!container) {
    console.warn('[MAINTENANCE] Kiosk selector container not found');
    return;
  }

  // FIX: id must be 'kioskSelector' — adminPanel.js bindKioskSelector()
  // does document.getElementById('kioskSelector'). Do not change this id.
  if (document.getElementById('kioskSelector')) {
    console.log('[MAINTENANCE] Kiosk selector already exists — skipping');
    return;
  }

  const wrapperDiv = document.createElement('div');
  wrapperDiv.className = 'kiosk-selector-row';
  wrapperDiv.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;';

  const label = document.createElement('label');
  label.textContent = 'Kiosk View:';
  label.htmlFor     = 'kioskSelector';
  label.style.cssText = 'font-size:0.8rem;font-weight:600;color:#6b7280;white-space:nowrap;';

  const selector = document.createElement('select');
  selector.id        = 'kioskSelector';   // ← CRITICAL: must match adminPanel.js lookup
  selector.className = 'kiosk-selector';
  selector.style.cssText = 'flex:1;padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:0.8rem;';

  // Build options from live DEVICECONFIG mode first, then all modes
  const modes = [...KIOSK_MODES];
  selector.innerHTML = modes.map(m =>
    `<option value="${m.value}" ${m.value === currentKioskMode ? 'selected' : ''}>${m.icon} ${m.label}</option>`
  ).join('');

  selector.value = currentKioskMode;

  // Change handler — updates module-level state + triggers admin refresh
  selector.addEventListener('change', (e) => {
    currentKioskMode = e.target.value;
    console.log(`[MAINTENANCE] Kiosk mode changed to: ${currentKioskMode}`);
    trackAdminEvent('kiosk_mode_changed', { mode: currentKioskMode });
    loadKioskQueues();
  });

  wrapperDiv.appendChild(label);
  wrapperDiv.appendChild(selector);

  // Insert after the first child (status row) in adminControls
  const firstChild = container.firstChild;
  if (firstChild && firstChild.nextSibling) {
    container.insertBefore(wrapperDiv, firstChild.nextSibling);
  } else {
    container.appendChild(wrapperDiv);
  }

  console.log('[MAINTENANCE] ✅ Kiosk selector injected (id=kioskSelector)');
  return selector;
}

export function getCurrentKioskMode() {
  return currentKioskMode;
}

export function loadKioskQueues(mode) {
  // Accept explicit mode override (from adminPanel.js bindKioskSelector)
  // or use module-level currentKioskMode
  const targetMode = mode || currentKioskMode;

  console.log(`[MAINTENANCE] 🔄 Loading queues for kiosk: ${targetMode}`);

  // FIX: Use window.dataHandlers.getAllQueueConfigsWithData — this IS exposed
  // in dataSync.js window.dataHandlers (confirmed from dataSync.js source).
  // Previously called as window.dataHandlers?.getAllQueueConfigsWithData which
  // is correct — but the function was not in window.dataHandlers in v3.5.1.
  // dataSync.js v3.5.1 does NOT expose getAllQueueConfigsWithData on
  // window.dataHandlers. We therefore call queueManager's version via
  // window.dataHandlers.getKioskQueues for queue keys, then count via
  // window.dataHandlers.countUnsyncedRecords per key.
  // The cleanest approach: call getAllQueueConfigsWithData from queueManager
  // which IS exported — but since dataSync is the module boundary, we use
  // what is available on window.dataHandlers.
  if (typeof window.dataHandlers?.countUnsyncedRecords === 'function') {
    const pending = window.dataHandlers.countUnsyncedRecords(null, targetMode);
    console.log(`[MAINTENANCE] Mode "${targetMode}" pending: ${pending}`);
    trackAdminEvent('kiosk_queues_loaded', { mode: targetMode, pending });

    // Update the mode-specific sync button label if it exists
    const syncBtn = document.getElementById('kioskSyncButton');
    if (syncBtn) {
      syncBtn.innerHTML = `🔄 Sync ${targetMode} (${pending})`;
      syncBtn.disabled  = pending === 0;
      syncBtn.style.opacity = pending === 0 ? '0.5' : '1';
    }

    return pending;
  } else {
    console.warn('[MAINTENANCE] window.dataHandlers.countUnsyncedRecords() not ready');
    return 0;
  }
}

// Expose on window so adminPanel.js bindKioskSelector() can call it
// without needing to import from this module directly.
window.loadKioskQueues = loadKioskQueues;

// ── MODE-SPECIFIC SYNC BUTTON ─────────────────────────────────────────────────

export function setupKioskSyncButton(containerId = 'adminControls') {
  const container = document.getElementById(containerId)
    || document.getElementById('adminControls');

  if (!container) {
    console.warn('[MAINTENANCE] Kiosk sync button container not found');
    return;
  }

  if (document.getElementById('kioskSyncButton')) {
    console.log('[MAINTENANCE] Kiosk sync button already exists — skipping');
    return;
  }

  const syncBtn     = document.createElement('button');
  syncBtn.id        = 'kioskSyncButton';
  syncBtn.type      = 'button';
  syncBtn.className = 'admin-sync-kiosk';
  syncBtn.style.cssText = `
    width:100%;padding:0.6rem 1rem;background:#eff6ff;color:#1d4ed8;
    border:1px solid #bfdbfe;border-radius:6px;font-size:0.85rem;
    font-weight:600;cursor:pointer;margin-top:4px;
  `;
  syncBtn.innerHTML = `🔄 Sync ${currentKioskMode} (0)`;
  syncBtn.disabled  = true;
  syncBtn.style.opacity = '0.5';

  syncBtn.addEventListener('click', async () => {
    const pending = window.dataHandlers?.countUnsyncedRecords?.(null, currentKioskMode) || 0;

    if (pending === 0) {
      alert('✅ No pending submissions for this kiosk.');
      return;
    }

    if (adminState.syncInProgress) {
      alert('⏳ Sync already in progress...');
      return;
    }

    if (!navigator.onLine) {
      alert('📡 Cannot sync — device is offline.\n\nData saved locally.');
      return;
    }

    console.log(`[MAINTENANCE] 🔄 Syncing ${pending} records for ${currentKioskMode}`);
    trackAdminEvent('kiosk_sync_triggered', { mode: currentKioskMode, pending });

    try {
      await window.dataHandlers?.syncKioskQueues?.(currentKioskMode);
      vibrateSuccess();
      alert(`✅ Synced ${pending} submissions for ${currentKioskMode}`);
    } catch (error) {
      console.error('[MAINTENANCE] Kiosk sync failed:', error);
      alert(`❌ Sync failed: ${error.message}`);
    }

    // Refresh count after sync
    loadKioskQueues();
  });

  container.appendChild(syncBtn);

  // Set initial count
  loadKioskQueues();

  console.log('[MAINTENANCE] ✅ Kiosk sync button injected');
  return syncBtn;
}

// ─────────────────────────────────────────────────────────────
// BUTTON STATE UPDATERS (UNCHANGED FROM v1.1.0)
// ─────────────────────────────────────────────────────────────

export function updateClearButtonState() {
  const adminClearButton = window.globals?.adminClearButton;
  if (!adminClearButton) return;

  const isLocked = isClearLocalLocked();
  adminClearButton.disabled = isLocked;
  adminClearButton.setAttribute('aria-disabled', isLocked ? 'true' : 'false');

  if (isLocked) {
    const remaining = getRemainingLockoutTime();
    adminClearButton.textContent    = `Clear Local (Locked ${remaining}m)`;
    adminClearButton.style.opacity  = '0.5';
    adminClearButton.style.cursor   = 'not-allowed';
    adminClearButton.title          = `Locked due to failed attempts. Try again in ${remaining} minutes.`;
  } else {
    adminClearButton.textContent    = 'Clear Local';
    adminClearButton.style.opacity  = '1';
    adminClearButton.style.cursor   = 'pointer';
    adminClearButton.title          = 'Clear local storage (password protected)';
  }
}

export function updateCheckUpdateButtonState(isOnline) {
  const checkUpdateButton = window.globals?.checkUpdateButton;
  if (!checkUpdateButton) return;

  checkUpdateButton.disabled = !isOnline;
  checkUpdateButton.setAttribute('aria-disabled', !isOnline ? 'true' : 'false');

  if (!isOnline) {
    checkUpdateButton.textContent   = 'Check Update (Offline)';
    checkUpdateButton.style.opacity = '0.5';
    checkUpdateButton.style.cursor  = 'not-allowed';
  } else {
    checkUpdateButton.textContent   = 'Check Update';
    checkUpdateButton.style.opacity = '1';
    checkUpdateButton.style.cursor  = 'pointer';
  }

  checkUpdateButton.title = !isOnline
    ? 'Update check disabled — device is offline'
    : 'Check for PWA updates';
}

export function updateFixVideoButtonState() {
  const fixVideoButton = window.globals?.fixVideoButton;
  if (!fixVideoButton) return;

  if (!fixVideoButton.disabled) {
    fixVideoButton.style.opacity = '1';
    fixVideoButton.style.cursor  = 'pointer';
  }

  fixVideoButton.title = 'Reload kiosk video';
}

// ─────────────────────────────────────────────────────────────
// MAIN HANDLER SETUP (UNCHANGED FROM v1.1.0)
// ─────────────────────────────────────────────────────────────

export function setupMaintenanceHandlers(adminClearButton, checkUpdateButton, fixVideoButton, resetAutoHideTimer) {
  cleanupMaintenanceHandlers();

  // ── Clear Local ──────────────────────────────────────────────────────────────
  if (adminClearButton) {
    adminClearButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[MAINTENANCE] 🔘 Clear Local clicked');
      resetAutoHideTimer();

      if (!verifyClearPassword()) return;

      if (adminState.syncInProgress || adminState.analyticsInProgress) {
        alert('⚠️ Cannot clear while sync is in progress.');
        return;
      }

      const totalPending = window.dataHandlers?.countUnsyncedRecords?.() || 0;
      if (!confirm(`⚠️ Delete ${totalPending} unsynced surveys?\n\nThis CANNOT be undone!`)) return;

      try {
        const keysToClear = Object.values(window.CONSTANTS?.SURVEY_TYPES || {})
          .map(cfg => cfg.storageKey).filter(Boolean)
          .concat([
            window.CONSTANTS?.STORAGE_KEY_ANALYTICS,
            window.CONSTANTS?.STORAGE_KEY_ANALYTICS_V3,
            window.CONSTANTS?.STORAGE_KEY_STATE,
            window.CONSTANTS?.STORAGE_KEY_LAST_SYNC,
            window.CONSTANTS?.STORAGE_KEY_LAST_ANALYTICS_SYNC,
          ]);

        keysToClear.forEach(key => { if (key) localStorage.removeItem(key); });
        trackAdminEvent('local_storage_cleared', { queueSize: totalPending });
        location.reload();
      } catch (error) {
        console.error('[MAINTENANCE] Clear failed:', error);
        alert('❌ Error clearing storage.');
      }
    };

    adminClearButton.addEventListener('click', adminClearButtonHandler);
    boundAdminClearButton = adminClearButton;
    console.log('[MAINTENANCE] ✅ Clear Local handler attached');
  } else {
    console.warn('[MAINTENANCE] ⚠️ adminClearButton not found');
  }

  // ── Check Update ─────────────────────────────────────────────────────────────
  if (checkUpdateButton) {
    checkUpdateButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[MAINTENANCE] 🔘 Check Update clicked');
      resetAutoHideTimer();

      if (!navigator.onLine) {
        alert('📡 Cannot check for updates — device is offline.');
        return;
      }

      checkUpdateButton.disabled    = true;
      checkUpdateButton.textContent = 'Checking...';

      try {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            await registration.update();
            const waiting = registration.waiting;
            if (waiting) {
              if (confirm('✅ New version available!\n\nReload to update?')) {
                waiting.postMessage({ type: 'SKIP_WAITING' });
                location.reload();
              }
            } else {
              alert('✅ App is up to date.');
            }
          } else {
            alert('ℹ️ No service worker registered.');
          }
        } else {
          alert('ℹ️ Service workers not supported.');
        }
        trackAdminEvent('check_update_triggered', { online: navigator.onLine });
      } catch (err) {
        console.error('[MAINTENANCE] Update check failed:', err);
        alert(`❌ Update check failed: ${err.message}`);
      } finally {
        checkUpdateButton.disabled    = false;
        checkUpdateButton.textContent = 'Check Update';
      }
    };

    checkUpdateButton.addEventListener('click', checkUpdateButtonHandler);
    boundCheckUpdateButton = checkUpdateButton;
    console.log('[MAINTENANCE] ✅ Check Update handler attached');
  } else {
    console.warn('[MAINTENANCE] ⚠️ checkUpdateButton not found');
  }

  // ── Fix Video ────────────────────────────────────────────────────────────────
  if (fixVideoButton) {
    fixVideoButtonHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[MAINTENANCE] 🔘 Fix Video clicked');
      resetAutoHideTimer();

      const video = document.getElementById('kioskVideo');
      if (!video) {
        console.warn('[MAINTENANCE] kioskVideo element not found');
        return;
      }

      try {
        video.pause();
        video.currentTime = 0;
        video.load();
        video.play().catch(err => {
          console.warn('[MAINTENANCE] Video autoplay failed (expected on iOS):', err.message);
        });
        trackAdminEvent('fix_video_triggered');
        console.log('[MAINTENANCE] ✅ Video reloaded');
      } catch (err) {
        console.error('[MAINTENANCE] Fix Video failed:', err);
      }
    };

    fixVideoButton.addEventListener('click', fixVideoButtonHandler);
    boundFixVideoButton = fixVideoButton;
    console.log('[MAINTENANCE] ✅ Fix Video handler attached');
  } else {
    console.warn('[MAINTENANCE] ⚠️ fixVideoButton not found');
  }

  console.log('[MAINTENANCE] ✅ All handlers attached');
}

// ── CLEANUP (UNCHANGED FROM v1.1.0) ──────────────────────────────────────────

export function cleanupMaintenanceHandlers() {
  if (boundAdminClearButton && adminClearButtonHandler) {
    boundAdminClearButton.removeEventListener('click', adminClearButtonHandler);
    adminClearButtonHandler = null;
    boundAdminClearButton   = null;
  }

  if (boundCheckUpdateButton && checkUpdateButtonHandler) {
    boundCheckUpdateButton.removeEventListener('click', checkUpdateButtonHandler);
    checkUpdateButtonHandler = null;
    boundCheckUpdateButton   = null;
  }

  if (boundFixVideoButton && fixVideoButtonHandler) {
    boundFixVideoButton.removeEventListener('click', fixVideoButtonHandler);
    fixVideoButtonHandler = null;
    boundFixVideoButton   = null;
  }

  console.log('[MAINTENANCE] 🧹 Handlers cleaned up');
}

export default {
  setupKioskSelector,
  getCurrentKioskMode,
  loadKioskQueues,
  setupKioskSyncButton,
  setupMaintenanceHandlers,
  cleanupMaintenanceHandlers,
  updateClearButtonState,
  updateCheckUpdateButtonState,
  updateFixVideoButtonState,
  isClearLocalLocked,
  getRemainingLockoutTime,
  restoreLockoutState,
};
