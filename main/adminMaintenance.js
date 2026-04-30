// FILE: main/adminMaintenance.js
// PURPOSE: Destructive/maintenance button handlers — clear local, check update, fix video + kiosk identity badge
// VERSION: 2.0.1
// CHANGES FROM 2.0.0:
//   - FIX 9: iconMap inside buildKioskIdentityBadge now sourced from
//            window.CONSTANTS.KIOSK_MODE_ICONS so new modes added to device-config.js
//            and config.js automatically get the correct badge icon without touching
//            this file. Hardcoded map retained as inline fallback.
// DEPENDENCIES: adminState.js, adminUtils.js, window.globals, window.CONSTANTS, window.DEVICECONFIG

import { adminState } from './adminState.js';
import { trackAdminEvent, vibrateSuccess, vibrateError } from './adminUtils.js';

const CLEAR_PASSWORD           = '8765';
const MAX_ATTEMPTS             = 2;
const LOCKOUT_DURATION         = 3600000;
const PASSWORD_SESSION_TIMEOUT = 300000;

let failedAttempts      = 0;
let lockoutUntil        = null;
let lastPasswordSuccess = null;

let adminClearButtonHandler  = null;
let checkUpdateButtonHandler = null;
let fixVideoButtonHandler    = null;
let boundAdminClearButton    = null;
let boundCheckUpdateButton   = null;
let boundFixVideoButton      = null;

// ─────────────────────────────────────────────────────────────
// PASSWORD + LOCKOUT (unchanged)
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

// ─────────────────────────────────────────────────────────────
// KIOSK IDENTITY BADGE  (replaces the old dropdown selector)
// ─────────────────────────────────────────────────────────────

/**
 * Injects a single static read-only row into adminControls showing
 * which kiosk this device is configured as.
 *
 * Reads window.DEVICECONFIG — set once at first-launch by device-config.js
 * and never changed at runtime. No events, no interaction, no dropdown.
 *
 * Visual output example:
 *   🛕 Temple  ·  KIOSK-TEMPLE-001
 *
 * Called from adminPanel.js setupAdminPanel() in place of the old
 * setupKioskSelector() + setupKioskSyncButton() pair.
 */
export function buildKioskIdentityBadge(containerId = 'adminControls') {
  const container = document.getElementById(containerId)
    || document.getElementById('adminControls');

  if (!container) {
    console.warn('[MAINTENANCE] buildKioskIdentityBadge: container not found');
    return;
  }

  // Idempotent — only inject once
  if (document.getElementById('kioskIdentityBadge')) {
    console.log('[MAINTENANCE] Kiosk identity badge already exists — skipping');
    return;
  }

  const cfg     = window.DEVICECONFIG || {};
  const mode    = cfg.kioskMode || 'unknown';
  const kioskId = cfg.kioskId   || '—';

  // FIX 9: iconMap sourced from CONSTANTS so new modes added to device-config.js
  // and config.js automatically get the correct badge icon.
  const iconMap = window.CONSTANTS?.KIOSK_MODE_ICONS || { temple: '🛕', shayona: '☕', giftshop: '🛍️', activity: '🎉' };
  const icon    = iconMap[mode] || '📍';

  const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);

  const badge = document.createElement('div');
  badge.id        = 'kioskIdentityBadge';
  badge.className = 'kiosk-identity-badge';
  badge.setAttribute('aria-label', `This device is configured as ${modeLabel} kiosk`);
  badge.innerHTML = `
    <span class="kiosk-identity-icon">${icon}</span>
    <span class="kiosk-identity-text">
      <span class="kiosk-identity-mode">${modeLabel}</span>
      <span class="kiosk-identity-id">${kioskId}</span>
    </span>
  `;

  // Insert after the first child (status row) so it sits just below
  // the unsynced-count pill — above the primary action buttons.
  const firstChild = container.firstChild;
  if (firstChild && firstChild.nextSibling) {
    container.insertBefore(badge, firstChild.nextSibling);
  } else {
    container.appendChild(badge);
  }

  console.log(`[MAINTENANCE] ✅ Kiosk identity badge: ${icon} ${modeLabel} · ${kioskId}`);
}

// ─────────────────────────────────────────────────────────────
// BUTTON STATE UPDATERS (unchanged)
// ─────────────────────────────────────────────────────────────

export function updateClearButtonState() {
  const adminClearButton = window.globals?.adminClearButton;
  if (!adminClearButton) return;

  const isLocked = isClearLocalLocked();
  adminClearButton.disabled = isLocked;
  adminClearButton.setAttribute('aria-disabled', isLocked ? 'true' : 'false');

  if (isLocked) {
    const remaining = getRemainingLockoutTime();
    adminClearButton.textContent   = `Clear Local (Locked ${remaining}m)`;
    adminClearButton.style.opacity = '0.5';
    adminClearButton.style.cursor  = 'not-allowed';
    adminClearButton.title         = `Locked due to failed attempts. Try again in ${remaining} minutes.`;
  } else {
    adminClearButton.textContent   = 'Clear Local';
    adminClearButton.style.opacity = '1';
    adminClearButton.style.cursor  = 'pointer';
    adminClearButton.title         = 'Clear local storage (password protected)';
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
// MAIN HANDLER SETUP (unchanged)
// ─────────────────────────────────────────────────────────────

export function setupMaintenanceHandlers(adminClearButton, checkUpdateButton, fixVideoButton, resetAutoHideTimer) {
  cleanupMaintenanceHandlers();

  // ── Clear Local ─────────────────────────────────────────────────────────────
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

// ── CLEANUP (unchanged) ───────────────────────────────────────────────────────

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
  buildKioskIdentityBadge,
  setupMaintenanceHandlers,
  cleanupMaintenanceHandlers,
  updateClearButtonState,
  updateCheckUpdateButtonState,
  updateFixVideoButtonState,
  isClearLocalLocked,
  getRemainingLockoutTime,
  restoreLockoutState,
};
