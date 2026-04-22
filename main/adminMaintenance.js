// FILE: main/adminMaintenance.js
// PURPOSE: Destructive/maintenance button handlers — clear local, check update, fix video
// VERSION: 1.0.0
// DEPENDENCIES: adminState.js, window.globals, window.CONSTANTS, window.KIOSK_CONFIG

import { adminState } from './adminState.js';

const CLEAR_PASSWORD = '8765';
const MAX_ATTEMPTS = 2;
const LOCKOUT_DURATION = 3600000;
const PASSWORD_SESSION_TIMEOUT = 300000;

let failedAttempts = 0;
let lockoutUntil = null;
let lastPasswordSuccess = null;

let adminClearButtonHandler = null;
let checkUpdateButtonHandler = null;
let fixVideoButtonHandler = null;
let boundAdminClearButton = null;
let boundCheckUpdateButton = null;
let boundFixVideoButton = null;

function trackAdminEvent(eventType, metadata = {}) {
  try {
    if (window.dataHandlers?.trackAnalytics) {
      window.dataHandlers.trackAnalytics(eventType, {
        ...metadata,
        source: 'admin_panel',
        online: navigator.onLine,
      });
    }
  } catch (error) {
    console.warn('[MAINTENANCE] Analytics tracking failed (offline safe):', error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// PASSWORD + LOCKOUT
// ─────────────────────────────────────────────────────────────

export function isClearLocalLocked() {
  if (!lockoutUntil) return false;
  if (Date.now() < lockoutUntil) return true;

  lockoutUntil = null;
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

function vibrateSuccess() {
  try { if (navigator.vibrate) navigator.vibrate([50]); } catch (_) {}
}

function vibrateError() {
  try { if (navigator.vibrate) navigator.vibrate([100, 50, 100]); } catch (_) {}
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
    failedAttempts = 0;
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
// BUTTON STATE UPDATER — called from adminPanel.js
// ─────────────────────────────────────────────────────────────

export function updateClearButtonState() {
  const adminClearButton = window.globals?.adminClearButton;
  if (!adminClearButton) return;

  const isLocked = isClearLocalLocked();
  adminClearButton.disabled = isLocked;
  adminClearButton.setAttribute('aria-disabled', isLocked ? 'true' : 'false');

  if (isLocked) {
    const remaining = getRemainingLockoutTime();
    adminClearButton.textContent = `Clear Local (Locked ${remaining}m)`;
    adminClearButton.style.opacity = '0.5';
    adminClearButton.style.cursor = 'not-allowed';
    adminClearButton.title = `Locked due to failed attempts. Try again in ${remaining} minutes.`;
  } else {
    adminClearButton.textContent = 'Clear Local';
    adminClearButton.style.opacity = '1';
    adminClearButton.style.cursor = 'pointer';
    adminClearButton.title = 'Clear local storage (password protected)';
  }
}

export function updateCheckUpdateButtonState(isOnline) {
  const checkUpdateButton = window.globals?.checkUpdateButton;
  if (!checkUpdateButton) return;

  checkUpdateButton.disabled = !isOnline;
  checkUpdateButton.setAttribute('aria-disabled', !isOnline ? 'true' : 'false');

  if (!isOnline) {
    checkUpdateButton.textContent = 'Check Update (Offline)';
    checkUpdateButton.style.opacity = '0.5';
    checkUpdateButton.style.cursor = 'not-allowed';
  } else {
    checkUpdateButton.textContent = 'Check Update';
    checkUpdateButton.style.opacity = '1';
    checkUpdateButton.style.cursor = 'pointer';
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
    fixVideoButton.style.cursor = 'pointer';
  }

  fixVideoButton.title = 'Reload kiosk video';
}

// ─────────────────────────────────────────────────────────────
// BUTTON HANDLERS
// ─────────────────────────────────────────────────────────────

export function setupMaintenanceHandlers(adminClearButton, checkUpdateButton, fixVideoButton, resetAutoHideTimer) {
  cleanupMaintenanceHandlers();

  if (adminClearButton) {
    adminClearButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[MAINTENANCE] 🔘 Clear Local button clicked');
      resetAutoHideTimer();

      if (!verifyClearPassword()) {
        console.log('[MAINTENANCE] Password verification failed');
        updateClearButtonState();
        return;
      }

      if (adminState.syncInProgress || adminState.analyticsInProgress) {
        console.warn('[MAINTENANCE] Clear blocked — sync in progress');
        alert('⚠️ Cannot clear while sync is in progress.\n\nPlease wait for sync to complete.');
        return;
      }

      const queueSize = window.dataHandlers?.countUnsyncedRecords?.() || 0;
      const confirmMsg = queueSize > 0
        ? `⚠️ WARNING: Delete ${queueSize} unsynced survey${queueSize > 1 ? 's' : ''}?\n\nThis CANNOT be undone!`
        : 'Clear all local data?';

      if (!confirm(confirmMsg)) {
        console.log('[MAINTENANCE] User cancelled clear operation');
        return;
      }

      console.log('[MAINTENANCE] ✅ User confirmed clear — proceeding...');
      try {
        const CONSTANTS = window.CONSTANTS;
        if (!CONSTANTS) {
          console.error('[MAINTENANCE] ❌ window.CONSTANTS not available — aborting clear');
          alert('❌ Configuration not loaded yet.\n\nPlease wait a moment and try again.');
          return;
        }

        // Plug-and-play: clear all survey type queue keys dynamically
        const surveyQueueKeys = Object.values(CONSTANTS.SURVEY_TYPES || {})
          .map(cfg => cfg.storageKey)
          .filter(Boolean);

        const keysToClear = [
          ...surveyQueueKeys,
          CONSTANTS.STORAGE_KEY_ANALYTICS,
          CONSTANTS.STORAGE_KEY_STATE,
          CONSTANTS.STORAGE_KEY_LAST_SYNC,
          CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC,
        ].filter(Boolean);

        keysToClear.forEach((key) => localStorage.removeItem(key));

        trackAdminEvent('local_storage_cleared', { queueSize });
        console.log('[MAINTENANCE] ✅ Storage cleared successfully (all queues)');

        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) syncStatusMessage.textContent = '✅ Storage cleared';

        setTimeout(() => {
          console.log('[MAINTENANCE] Reloading page...');
          location.reload();
        }, 1500);
      } catch (error) {
        console.error('[MAINTENANCE] ❌ Error clearing storage:', error);
        alert('❌ Error clearing storage. Check console for details.');
      }
    };

    adminClearButton.addEventListener('click', adminClearButtonHandler);
    boundAdminClearButton = adminClearButton;
    console.log('[MAINTENANCE] ✅ Clear Local button handler attached');
  } else {
    console.warn('[MAINTENANCE] ⚠️ Clear Local button not found');
  }

  if (checkUpdateButton) {
    checkUpdateButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[MAINTENANCE] 🔘 Check Update button clicked');
      resetAutoHideTimer();

      if (!navigator.onLine) {
        console.warn('[MAINTENANCE] Update check blocked — offline');
        alert('📡 Cannot check for updates — device is offline.\n\nPlease connect to WiFi to check for updates.');
        trackAdminEvent('update_check_blocked_offline');
        return;
      }

      const syncStatusMessage = window.globals?.syncStatusMessage;

      if (!window.pwaUpdateManager) {
        console.error('[MAINTENANCE] ❌ PWA Update Manager not found');
        if (syncStatusMessage) {
          syncStatusMessage.textContent = '❌ Update manager not available';
          setTimeout(() => { syncStatusMessage.textContent = ''; }, 4000);
        }
        alert('❌ PWA Update Manager not loaded.\n\nThe update system may not be initialized yet.\n\nTry refreshing the page.');
        return;
      }

      console.log('[MAINTENANCE] ✅ Starting update check...');
      trackAdminEvent('update_check_triggered');
      if (syncStatusMessage) syncStatusMessage.textContent = '🔍 Checking for updates...';

      try {
        await window.pwaUpdateManager.forceUpdate();
        console.log('[MAINTENANCE] ✅ Update check completed');
        if (syncStatusMessage) syncStatusMessage.textContent = '✅ Update check complete';
      } catch (error) {
        console.error('[MAINTENANCE] ❌ Update check failed:', error);
        if (syncStatusMessage) {
          syncStatusMessage.textContent = `❌ Update check failed: ${error.message}`;
        }
        alert(`❌ Update check failed:\n\n${error.message}`);
      }

      setTimeout(() => {
        if (syncStatusMessage) syncStatusMessage.textContent = '';
      }, 4000);
    };

    checkUpdateButton.addEventListener('click', checkUpdateButtonHandler);
    boundCheckUpdateButton = checkUpdateButton;
    console.log('[MAINTENANCE] ✅ Check Update button handler attached');
  } else {
    console.warn('[MAINTENANCE] ⚠️ Check Update button not found');
  }

  if (fixVideoButton) {
    fixVideoButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[MAINTENANCE] 🔘 Fix Video button clicked');
      resetAutoHideTimer();
      trackAdminEvent('video_fix_triggered');

      let kioskVideo = window.globals?.kioskVideo;
      if (!kioskVideo) kioskVideo = document.getElementById('kioskVideo');
      if (!kioskVideo) kioskVideo = document.querySelector('video');

      if (!kioskVideo) {
        console.error('[MAINTENANCE] ❌ Video element not found anywhere in DOM');
        alert('❌ Video element not found.\n\nThe video may not be loaded yet, or the element ID has changed.');
        return;
      }

      fixVideoButton.disabled = true;
      fixVideoButton.style.opacity = '0.7';
      fixVideoButton.style.cursor = 'wait';
      const originalText = fixVideoButton.textContent;
      fixVideoButton.textContent = 'Fixing...';

      try {
        if (kioskVideo._fallbackHandler) {
          kioskVideo.removeEventListener('error', kioskVideo._fallbackHandler);
          kioskVideo._fallbackHandler = null;
        }

        const videoPlayerModule = await import('../ui/navigation/videoPlayer.js');
        const { nuclearVideoReload, setupVideoEventListeners } = videoPlayerModule;

        nuclearVideoReload(kioskVideo);

        const repairedVideo = window.globals?.kioskVideo || document.getElementById('kioskVideo');
        if (!repairedVideo) {
          alert('❌ Video reload failed.\n\nThe kiosk may need a full restart.');
          return;
        }

        setupVideoEventListeners(repairedVideo);

        const waitForReady = () => new Promise((resolve, reject) => {
          if (repairedVideo.readyState >= 3) { resolve(true); return; }

          let timeoutId;
          const onReady = () => {
            clearTimeout(timeoutId);
            repairedVideo.removeEventListener('canplaythrough', onReady);
            repairedVideo.removeEventListener('loadeddata', onReady);
            resolve(true);
          };

          timeoutId = setTimeout(() => {
            repairedVideo.removeEventListener('canplaythrough', onReady);
            repairedVideo.removeEventListener('loadeddata', onReady);
            reject(new Error('Ready timeout'));
          }, 5000);

          repairedVideo.addEventListener('canplaythrough', onReady, { once: true });

          repairedVideo.addEventListener('loadeddata', onReady, { once: true });
        });

        try {
          await waitForReady();
        } catch (err) {
          console.warn('[MAINTENANCE] Video not ready in time:', err.message);
        }

        try {
          const playPromise = repairedVideo.play();
          if (playPromise && typeof playPromise.then === 'function') {
            await playPromise;
          }
        } catch (playErr) {
          console.warn('[MAINTENANCE] Repaired video could not auto-play:', playErr.message);
        }

        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) {
          syncStatusMessage.textContent = '✅ Video reset attempted';
          setTimeout(() => { syncStatusMessage.textContent = ''; }, 3000);
        }

        alert('✅ Video reset has been attempted.\n\nIf you now see video playing on the home screen, the fix worked.\nIf not, the kiosk may need a full restart.');
      } catch (error) {
        console.error('[MAINTENANCE] ❌ Video nuclear reload failed:', error);
        alert(`❌ Video reload failed:\n\n${error.message}`);
      } finally {
        setTimeout(() => {
          fixVideoButton.disabled = false;
          fixVideoButton.style.opacity = '1';
          fixVideoButton.style.cursor = 'pointer';
          fixVideoButton.textContent = originalText;
        }, 2000);
      }
    };

    fixVideoButton.addEventListener('click', fixVideoButtonHandler);
    boundFixVideoButton = fixVideoButton;
    console.log('[MAINTENANCE] ✅ Fix Video button handler attached (nuclear-ready)');
  } else {
    console.warn('[MAINTENANCE] ⚠️ Fix Video button not found');
  }
}

export function cleanupMaintenanceHandlers() {
  if (boundAdminClearButton && adminClearButtonHandler) {
    boundAdminClearButton.removeEventListener('click', adminClearButtonHandler);
  }
  if (boundCheckUpdateButton && checkUpdateButtonHandler) {
    boundCheckUpdateButton.removeEventListener('click', checkUpdateButtonHandler);
  }
  if (boundFixVideoButton && fixVideoButtonHandler) {
    boundFixVideoButton.removeEventListener('click', fixVideoButtonHandler);
  }

  adminClearButtonHandler = null;
  checkUpdateButtonHandler = null;
  fixVideoButtonHandler = null;
  boundAdminClearButton = null;
  boundCheckUpdateButton = null;
  boundFixVideoButton = null;
}

// ─────────────────────────────────────────────────────────────
// DEBUG HELPERS
// ─────────────────────────────────────────────────────────────

window.inspectQueue = function () {
  const CONSTANTS = window.CONSTANTS;
  if (!CONSTANTS) {
    console.error('[MAINTENANCE] window.CONSTANTS not available');
    return;
  }

  const surveyTypes = CONSTANTS.SURVEY_TYPES || {};
  const results = {};

  Object.entries(surveyTypes).forEach(([type, cfg]) => {
    const queue = JSON.parse(localStorage.getItem(cfg.storageKey) || '[]');
    results[type] = queue;
  });

  console.log('');
  console.log('══════════ QUEUE INSPECTION ══════════');
  console.log('');

  Object.entries(results).forEach(([type, queue]) => {
    console.log(`--- ${type} (${queue.length} records) ---`);
    queue.forEach((sub, idx) => {
      console.log(`  ${idx + 1}. ID: ${sub.id}`);
      console.log(`     Time: ${new Date(sub.timestamp).toLocaleString()}`);
      console.log(`     Status: ${sub.sync_status || 'unsynced'}`);
    });
  });

  console.log(`Active Survey Type: ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);
  console.log(`Network: ${navigator.onLine ? 'Online' : 'Offline'}`);
  console.log('');

  return results;
};

window.systemStatus = function () {
  const CONSTANTS = window.CONSTANTS;
  if (!CONSTANTS) {
    console.error('[MAINTENANCE] window.CONSTANTS not available');
    return;
  }

  const surveyTypes = CONSTANTS.SURVEY_TYPES || {};
  const analytics = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_ANALYTICS) || '[]');
  const lastSync = localStorage.getItem(CONSTANTS.STORAGE_KEY_LAST_SYNC);
  const lastAnalytics = localStorage.getItem(CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC);

  console.log('');
  console.log('══════════ SYSTEM STATUS — OFFLINE-FIRST KIOSK ══════════');
  console.log('');
  console.log(`Network: ${navigator.onLine ? '🌐 Online' : '📡 Offline Mode'}`);
  console.log(`Active Survey: ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);

  Object.entries(surveyTypes).forEach(([type, cfg]) => {
    const queue = JSON.parse(localStorage.getItem(cfg.storageKey) || '[]');
    console.log(`Queue ${type}: ${queue.length}/${CONSTANTS.MAX_QUEUE_SIZE || 250} surveys`);
  });

  console.log(`Analytics: ${analytics.length}/${CONSTANTS.MAX_ANALYTICS_SIZE || 500} events`);
  console.log(`Sync Status: ${adminState.syncInProgress ? 'In Progress' : 'Idle'}`);
  console.log(`Analytics Sync: ${adminState.analyticsInProgress ? 'In Progress' : 'Idle'}`);
  console.log(`Last Sync: ${lastSync ? new Date(parseInt(lastSync, 10)).toLocaleString() : 'Never'}`);
  console.log(`Last Analytics: ${lastAnalytics ? new Date(parseInt(lastAnalytics, 10)).toLocaleString() : 'Never'}`);

  if (isClearLocalLocked()) {
    console.log(`🔒 Clear Local LOCKED — ${getRemainingLockoutTime()} min remaining`);
  }

  console.log('');
  console.log('DEBUG COMMANDS:');
  console.log('  window.inspectQueue()        — View all queues');
  console.log('  window.systemStatus()        — View system status');
  console.log('  window.inspectAdminHitTarget() — Inspect top hit target');
  console.log('');
};

window.inspectAdminHitTarget = function () {
  const x = Math.round(window.innerWidth / 2);
  const y = 24;
  const el = document.elementFromPoint(x, y);
  const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
  console.log('[ADMIN DEBUG] elementFromPoint:', el);
  console.log('[ADMIN DEBUG] elementsFromPoint:', stack);
  return { el, stack };
};

                                               
