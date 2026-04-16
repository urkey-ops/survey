// FILE: main/adminPanel.js
// PURPOSE: Admin panel optimized for offline-first iPad kiosk PWA
// VERSION: 7.6.0 - pointer-only delegated unlock + safe listener teardown
// DEPENDENCIES: window.globals, window.dataHandlers, window.CONSTANTS, window.KIOSK_CONFIG

const CLEAR_PASSWORD = '8765';
const MAX_ATTEMPTS = 2;
const LOCKOUT_DURATION = 3600000;
const AUTO_HIDE_DELAY = 20000;
const PASSWORD_SESSION_TIMEOUT = 300000;
const COUNTDOWN_UPDATE_INTERVAL = 1000;
const STUCK_FLAG_TIMEOUT_MS = 60000;

let failedAttempts = 0;
let lockoutUntil = null;
let autoHideTimer = null;
let autoHideStartTime = null;
let countdownInterval = null;
let adminPanelVisible = false;
let lastPasswordSuccess = null;
let syncInProgress = false;
let analyticsInProgress = false;
let syncStartedAt = null;
let analyticsStartedAt = null;
let onlineHandler = null;
let offlineHandler = null;
let handleTitlePointerUp = null;
let unlockTapCount = 0;
let unlockTapTimeout = null;
let unlockLastTapTime = 0;

let hideAdminButtonHandler = null;
let adminClearButtonHandler = null;
let syncButtonHandler = null;
let syncAnalyticsButtonHandler = null;
let checkUpdateButtonHandler = null;
let fixVideoButtonHandler = null;

let boundElements = {
  hideAdminButton: null,
  adminClearButton: null,
  syncButton: null,
  syncAnalyticsButton: null,
  checkUpdateButton: null,
  fixVideoButton: null,
};

function clearManagedTimers() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  if (unlockTapTimeout) {
    clearTimeout(unlockTapTimeout);
    unlockTapTimeout = null;
  }
}

function isClearLocalLocked() {
  if (!lockoutUntil) return false;
  if (Date.now() < lockoutUntil) return true;

  lockoutUntil = null;
  failedAttempts = 0;
  localStorage.removeItem('clearLocalLockout');
  return false;
}

function getRemainingLockoutTime() {
  if (!lockoutUntil) return 0;
  return Math.ceil((lockoutUntil - Date.now()) / 60000);
}

function lockClearLocal() {
  lockoutUntil = Date.now() + LOCKOUT_DURATION;
  localStorage.setItem('clearLocalLockout', lockoutUntil.toString());
  console.warn('[ADMIN] 🔒 Clear Local locked for 1 hour');
  trackAdminEvent('clear_local_locked', { attempts: failedAttempts });
}

function restoreLockoutState() {
  const stored = localStorage.getItem('clearLocalLockout');
  if (!stored) return;

  const storedTime = parseInt(stored, 10);
  if (Date.now() < storedTime) {
    lockoutUntil = storedTime;
    console.warn('[ADMIN] 🔒 Clear Local locked (restored from storage)');
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
    console.log('[ADMIN] ✅ Using cached password session');
    return true;
  }

  const input = prompt('🔒 Enter password to Clear Local Storage:\n\n(This will delete all queued surveys)');

  if (input === null) {
    console.log('[ADMIN] Clear Local cancelled');
    trackAdminEvent('clear_local_cancelled');
    return false;
  }

  if (input === CLEAR_PASSWORD) {
    console.log('[ADMIN] ✅ Password correct');
    failedAttempts = 0;
    lastPasswordSuccess = Date.now();
    vibrateSuccess();
    trackAdminEvent('clear_local_password_success');
    return true;
  }

  failedAttempts++;
  vibrateError();
  trackAdminEvent('clear_local_password_failed', { attempt: failedAttempts });
  console.warn(`[ADMIN] ❌ Wrong password (${failedAttempts}/${MAX_ATTEMPTS})`);

  if (failedAttempts >= MAX_ATTEMPTS) {
    lockClearLocal();
    alert('❌ Incorrect password.\n\nToo many failed attempts.\n\n🔒 Clear Local is now LOCKED for 1 hour.');
  } else {
    const remaining = MAX_ATTEMPTS - failedAttempts;
    alert(`❌ Incorrect password.\n\nYou have ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`);
  }

  return false;
}

function vibrateSuccess() {
  try {
    if (navigator.vibrate) navigator.vibrate([50]);
  } catch (_) {}
}

function vibrateError() {
  try {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  } catch (_) {}
}

function vibrateTap() {
  try {
    if (navigator.vibrate) navigator.vibrate(10);
  } catch (_) {}
}

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
    console.warn('[ADMIN] Analytics tracking failed (offline safe):', error.message);
  }
}

function resetStuckFlagsIfNeeded() {
  const now = Date.now();

  if (syncInProgress && syncStartedAt && (now - syncStartedAt) > STUCK_FLAG_TIMEOUT_MS) {
    console.warn('[ADMIN] ⚠️ syncInProgress was stuck >60s — resetting');
    syncInProgress = false;
    syncStartedAt = null;
    updateSyncButtonState(navigator.onLine);
  }

  if (analyticsInProgress && analyticsStartedAt && (now - analyticsStartedAt) > STUCK_FLAG_TIMEOUT_MS) {
    console.warn('[ADMIN] ⚠️ analyticsInProgress was stuck >60s — resetting');
    analyticsInProgress = false;
    analyticsStartedAt = null;
    updateAnalyticsButtonState(navigator.onLine);
  }
}

function updateCountdown() {
  const countdownEl = document.getElementById('adminCountdown');
  if (!countdownEl || !adminPanelVisible || !autoHideStartTime) return;

  const elapsed = Date.now() - autoHideStartTime;
  const remaining = Math.max(0, Math.ceil((AUTO_HIDE_DELAY - elapsed) / 1000));

  if (remaining > 0) {
    countdownEl.textContent = `Auto-hide in ${remaining}s`;
    countdownEl.style.opacity = remaining <= 5 ? '1' : '0.6';
  } else {
    countdownEl.textContent = '';
  }
}

function startAutoHideTimer() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  autoHideStartTime = Date.now();

  autoHideTimer = setTimeout(() => {
    console.log('[ADMIN] ⏱️ Auto-hiding panel');
    hideAdminPanel();
    trackAdminEvent('admin_auto_hide');
  }, AUTO_HIDE_DELAY);

  countdownInterval = setInterval(updateCountdown, COUNTDOWN_UPDATE_INTERVAL);
  updateCountdown();
}

function resetAutoHideTimer() {
  if (adminPanelVisible) startAutoHideTimer();
}

function hideAdminPanel() {
  const adminControls = window.globals?.adminControls;

  if (adminControls) {
    adminControls.classList.add('hidden');
    document.body.classList.remove('admin-active');
  }

  adminPanelVisible = false;
  autoHideStartTime = null;
  clearManagedTimers();

  const countdownEl = document.getElementById('adminCountdown');
  if (countdownEl) countdownEl.textContent = '';

  console.log('[ADMIN] 🔋 Panel hidden — battery saving');
}

function showAdminPanel() {
  const adminControls = window.globals?.adminControls;
  if (!adminControls) return;

  resetStuckFlagsIfNeeded();

  adminControls.classList.remove('hidden');
  document.body.classList.add('admin-active');
  adminPanelVisible = true;

  if (window.dataHandlers?.updateAdminCount) {
    window.dataHandlers.updateAdminCount();
  }

  updateAllButtonStates();
  updateSurveyTypeSwitcher();
  startAutoHideTimer();
  vibrateSuccess();
  trackAdminEvent('admin_panel_opened');

  console.log('[ADMIN] ✅ Panel visible (auto-hide in 20s)');
}

function updateOnlineIndicator() {
  const onlineIndicator = document.getElementById('adminOnlineStatus');
  if (!onlineIndicator) return;

  const isOnline = navigator.onLine;
  onlineIndicator.textContent = isOnline ? '🌐 Online' : '📡 Offline Mode';
  onlineIndicator.style.color = isOnline ? '#059669' : '#dc2626';
}

function updateAllButtonStates() {
  const isOnline = navigator.onLine;
  updateOnlineIndicator();
  updateSyncButtonState(isOnline);
  updateAnalyticsButtonState(isOnline);
  updateCheckUpdateButtonState(isOnline);
  updateFixVideoButtonState();
  updateClearButtonState();
  console.log(`[ADMIN] 🔘 All buttons updated (${isOnline ? 'ONLINE' : 'OFFLINE'})`);
}

function updateSyncButtonState(isOnline) {
  const syncButton = window.globals?.syncButton;
  if (!syncButton) return;

  const shouldDisable = !isOnline || syncInProgress;
  syncButton.disabled = shouldDisable;
  syncButton.setAttribute('aria-busy', syncInProgress ? 'true' : 'false');
  syncButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');

  if (syncInProgress) {
    syncButton.textContent = 'Syncing...';
    syncButton.style.opacity = '0.7';
    syncButton.style.cursor = 'wait';
  } else if (!isOnline) {
    syncButton.textContent = 'Sync Data (Offline)';
    syncButton.style.opacity = '0.5';
    syncButton.style.cursor = 'not-allowed';
  } else {
    syncButton.textContent = 'Sync Data';
    syncButton.style.opacity = '1';
    syncButton.style.cursor = 'pointer';
  }

  syncButton.title = syncInProgress
    ? 'Sync in progress...'
    : !isOnline
      ? 'Sync disabled — device is offline'
      : 'Sync queued data to server';
}

function updateAnalyticsButtonState(isOnline) {
  const syncAnalyticsButton = window.globals?.syncAnalyticsButton;
  if (!syncAnalyticsButton) return;

  const shouldDisable = !isOnline || analyticsInProgress;
  syncAnalyticsButton.disabled = shouldDisable;
  syncAnalyticsButton.setAttribute('aria-busy', analyticsInProgress ? 'true' : 'false');
  syncAnalyticsButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');

  if (analyticsInProgress) {
    syncAnalyticsButton.textContent = 'Syncing...';
    syncAnalyticsButton.style.opacity = '0.7';
    syncAnalyticsButton.style.cursor = 'wait';
  } else if (!isOnline) {
    syncAnalyticsButton.textContent = 'Sync Analytics (Offline)';
    syncAnalyticsButton.style.opacity = '0.5';
    syncAnalyticsButton.style.cursor = 'not-allowed';
  } else {
    syncAnalyticsButton.textContent = 'Sync Analytics';
    syncAnalyticsButton.style.opacity = '1';
    syncAnalyticsButton.style.cursor = 'pointer';
  }

  syncAnalyticsButton.title = analyticsInProgress
    ? 'Sync in progress...'
    : !isOnline
      ? 'Sync disabled — device is offline'
      : 'Sync analytics to server';
}

function updateCheckUpdateButtonState(isOnline) {
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

function updateFixVideoButtonState() {
  const fixVideoButton = window.globals?.fixVideoButton;
  if (!fixVideoButton) return;

  if (!fixVideoButton.disabled) {
    fixVideoButton.style.opacity = '1';
    fixVideoButton.style.cursor = 'pointer';
  }

  fixVideoButton.title = 'Reload kiosk video';
}

function updateClearButtonState() {
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

function updateSurveyTypeSwitcher() {
  const currentType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
  const btnGroup = document.getElementById('surveyTypeBtnGroup');
  const currentLabel = document.getElementById('surveyTypeCurrentLabel');

  if (!btnGroup) return;

  btnGroup.querySelectorAll('button').forEach((btn) => {
    const active = btn.dataset.surveyType === currentType;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  if (currentLabel) {
    const cfg = window.CONSTANTS?.SURVEY_TYPES?.[currentType];
    currentLabel.textContent = `Current: ${cfg?.label || currentType} · Sheet: ${cfg?.sheetName || ''}`;
  }
}

function buildSurveyTypeSwitcher(adminControls, resetTimer) {
  if (document.getElementById('surveyTypeSwitcher')) return;

  const currentType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';

  const switcherRow = document.createElement('div');
  switcherRow.id = 'surveyTypeSwitcher';
  switcherRow.className = 'survey-type-switcher';

  const label = document.createElement('p');
  label.className = 'survey-type-label';
  label.textContent = 'Active Survey';

  const currentLabel = document.createElement('p');
  currentLabel.id = 'surveyTypeCurrentLabel';
  currentLabel.className = 'survey-type-current';

  const surveyTypes = window.CONSTANTS?.SURVEY_TYPES || {};
  currentLabel.textContent = `Current: ${surveyTypes[currentType]?.label || currentType} · Sheet: ${surveyTypes[currentType]?.sheetName || ''}`;

  const btnGroup = document.createElement('div');
  btnGroup.id = 'surveyTypeBtnGroup';
  btnGroup.className = 'survey-type-pills';

  const makeBtn = (type, btnLabel) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = btnLabel;
    btn.dataset.surveyType = type;
    btn.setAttribute('aria-pressed', currentType === type ? 'true' : 'false');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetTimer();

      const alreadyActive = window.KIOSK_CONFIG?.getActiveSurveyType?.() === type;
      if (alreadyActive) {
        console.log('[ADMIN] Survey type already active:', type);
        return;
      }

      try {
        const currentSurveyType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
        const partialData = window.appState?.formData;
        const hasPartialData = partialData && Object.keys(partialData).length > 1;

        if (hasPartialData) {
          const queueKey =
            window.CONSTANTS?.SURVEY_TYPES?.[currentSurveyType]?.storageKey ||
            window.CONSTANTS?.STORAGE_KEY_QUEUE ||
            'submissionQueue';

          const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE ?? 250;
          let existingQueue = [];

          try {
            existingQueue = JSON.parse(localStorage.getItem(queueKey) || '[]');
          } catch (_) {
            existingQueue = [];
          }

          if (existingQueue.length < MAX_QUEUE_SIZE) {
            existingQueue.push({
              ...partialData,
              surveyType: currentSurveyType,
              abandonedAt: new Date().toISOString(),
              abandonedReason: 'survey_type_switch',
              sync_status: 'unsynced_partial',
            });

            localStorage.setItem(queueKey, JSON.stringify(existingQueue));
            console.log(`[ADMIN] ✅ Partial data saved before type switch (queue: ${queueKey})`);
          } else {
            console.warn('[ADMIN] Queue full — partial data not saved before type switch');
          }
        }
      } catch (saveErr) {
        console.warn('[ADMIN] Could not save partial data before type switch:', saveErr);
      }

      if (window.KIOSK_CONFIG?.setActiveSurveyType) {
        window.KIOSK_CONFIG.setActiveSurveyType(type);
      }

      if (window.appState) {
        window.appState.currentQuestionIndex = 0;
        window.appState.formData = {};
        window.appState.questionTimeSpent = {};
        console.log('[ADMIN] ✅ Survey state reset to Q1');
      }

      btnGroup.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.surveyType === type ? 'true' : 'false');
      });

      const lbl = document.getElementById('surveyTypeCurrentLabel');
      const config = window.CONSTANTS?.SURVEY_TYPES?.[type];

      if (lbl) {
        lbl.textContent = `Current: ${config?.label || type} · Sheet: ${config?.sheetName || ''}`;
      }

      const syncStatusMessage = window.globals?.syncStatusMessage;
      if (syncStatusMessage) {
        syncStatusMessage.textContent = `✅ Switched to ${config?.label || type}. Reloading...`;
        syncStatusMessage.style.color = '#059669';
        syncStatusMessage.style.fontWeight = 'bold';
      }

      trackAdminEvent('survey_type_switched', { surveyType: type });
      console.log(`[ADMIN] ✅ Survey type switched to: ${type} → sheet: ${config?.sheetName}`);

      setTimeout(() => {
        if (syncStatusMessage) syncStatusMessage.textContent = '';
        location.reload();
      }, 1500);
    });

    return btn;
  };

  btnGroup.appendChild(makeBtn('type1', 'Type 1'));
  btnGroup.appendChild(makeBtn('type2', 'Type 2'));

  switcherRow.appendChild(label);
  switcherRow.appendChild(currentLabel);
  switcherRow.appendChild(btnGroup);

  const firstChild = adminControls.firstChild;
  if (firstChild && firstChild.nextSibling) {
    adminControls.insertBefore(switcherRow, firstChild.nextSibling);
  } else {
    adminControls.appendChild(switcherRow);
  }

  console.log('[ADMIN] ✅ Survey type switcher built');
}

function isAdminTitleTapTarget(target) {
  if (!target || !(target instanceof Element)) return false;

  const configuredTitle = window.globals?.mainTitle;
  if (configuredTitle && (target === configuredTitle || configuredTitle.contains(target))) {
    return true;
  }

  if (target.closest('#mainTitle')) return true;
  if (target.closest('[data-admin-unlock], [data-main-title], .main-title, .app-title, header h1')) return true;

  return false;
}

function bindAdminUnlock() {
  if (handleTitlePointerUp) {
    document.removeEventListener('pointerup', handleTitlePointerUp, true);
  }

  unlockTapCount = 0;
  unlockLastTapTime = 0;
  if (unlockTapTimeout) clearTimeout(unlockTapTimeout);
  unlockTapTimeout = null;

  handleTitlePointerUp = (e) => {
    const target = e.target;
    if (!isAdminTitleTapTarget(target)) return;

    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const now = Date.now();
    if (now - unlockLastTapTime < 250) return;
    unlockLastTapTime = now;

    unlockTapCount++;
    vibrateTap();
    console.log(`[ADMIN] Tap ${unlockTapCount}/5`);

    if (unlockTapTimeout) clearTimeout(unlockTapTimeout);
    unlockTapTimeout = setTimeout(() => {
      unlockTapCount = 0;
      unlockTapTimeout = null;
    }, 2000);

    if (unlockTapCount >= 5) {
      console.log('[ADMIN] ✅ Unlocked');
      showAdminPanel();
      unlockTapCount = 0;
      if (unlockTapTimeout) clearTimeout(unlockTapTimeout);
      unlockTapTimeout = null;
    }
  };

  document.addEventListener('pointerup', handleTitlePointerUp, true);
  console.log('[ADMIN] ✅ Delegated unlock listener attached (pointerup only)');
}

function unbindAdminUnlock() {
  if (handleTitlePointerUp) {
    document.removeEventListener('pointerup', handleTitlePointerUp, true);
    handleTitlePointerUp = null;
  }

  unlockTapCount = 0;
  unlockLastTapTime = 0;

  if (unlockTapTimeout) {
    clearTimeout(unlockTapTimeout);
    unlockTapTimeout = null;
  }
}

function detachButtonHandlers() {
  if (boundElements.hideAdminButton && hideAdminButtonHandler) {
    boundElements.hideAdminButton.removeEventListener('click', hideAdminButtonHandler);
  }
  if (boundElements.adminClearButton && adminClearButtonHandler) {
    boundElements.adminClearButton.removeEventListener('click', adminClearButtonHandler);
  }
  if (boundElements.syncButton && syncButtonHandler) {
    boundElements.syncButton.removeEventListener('click', syncButtonHandler);
  }
  if (boundElements.syncAnalyticsButton && syncAnalyticsButtonHandler) {
    boundElements.syncAnalyticsButton.removeEventListener('click', syncAnalyticsButtonHandler);
  }
  if (boundElements.checkUpdateButton && checkUpdateButtonHandler) {
    boundElements.checkUpdateButton.removeEventListener('click', checkUpdateButtonHandler);
  }
  if (boundElements.fixVideoButton && fixVideoButtonHandler) {
    boundElements.fixVideoButton.removeEventListener('click', fixVideoButtonHandler);
  }

  hideAdminButtonHandler = null;
  adminClearButtonHandler = null;
  syncButtonHandler = null;
  syncAnalyticsButtonHandler = null;
  checkUpdateButtonHandler = null;
  fixVideoButtonHandler = null;

  boundElements = {
    hideAdminButton: null,
    adminClearButton: null,
    syncButton: null,
    syncAnalyticsButton: null,
    checkUpdateButton: null,
    fixVideoButton: null,
  };
}

function bindButtonHandlers({ hideAdminButton, adminClearButton, syncButton, syncAnalyticsButton, checkUpdateButton, fixVideoButton }) {
  detachButtonHandlers();

  if (hideAdminButton) {
    hideAdminButtonHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[ADMIN] 🔘 Hide button clicked');
      hideAdminPanel();
      trackAdminEvent('admin_manually_hidden');
    };
    hideAdminButton.addEventListener('click', hideAdminButtonHandler);
    boundElements.hideAdminButton = hideAdminButton;
    console.log('[ADMIN] ✅ Hide button handler attached');
  } else {
    console.warn('[ADMIN] ⚠️ Hide button not found');
  }

  if (adminClearButton) {
    adminClearButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[ADMIN] 🔘 Clear Local button clicked');
      resetAutoHideTimer();

      if (!verifyClearPassword()) {
        console.log('[ADMIN] Password verification failed');
        updateClearButtonState();
        return;
      }

      if (syncInProgress || analyticsInProgress) {
        console.warn('[ADMIN] Clear blocked — sync in progress');
        alert('⚠️ Cannot clear while sync is in progress.\n\nPlease wait for sync to complete.');
        return;
      }

      const queueSize = window.dataHandlers?.countUnsyncedRecords?.() || 0;
      const confirmMsg = queueSize > 0
        ? `⚠️ WARNING: Delete ${queueSize} unsynced survey${queueSize > 1 ? 's' : ''}?\n\nThis CANNOT be undone!`
        : 'Clear all local data?';

      if (!confirm(confirmMsg)) {
        console.log('[ADMIN] User cancelled clear operation');
        return;
      }

      console.log('[ADMIN] ✅ User confirmed clear — proceeding...');
      try {
        const CONSTANTS = window.CONSTANTS;
        if (!CONSTANTS) {
          console.error('[ADMIN] ❌ window.CONSTANTS not available — aborting clear');
          alert('❌ Configuration not loaded yet.\n\nPlease wait a moment and try again.');
          return;
        }

        const keysToClear = [
          CONSTANTS.STORAGE_KEY_QUEUE,
          CONSTANTS.STORAGE_KEY_QUEUE_V2,
          CONSTANTS.STORAGE_KEY_ANALYTICS,
          CONSTANTS.STORAGE_KEY_STATE,
          CONSTANTS.STORAGE_KEY_LAST_SYNC,
          CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC,
        ].filter(Boolean);

        keysToClear.forEach((key) => localStorage.removeItem(key));

        trackAdminEvent('local_storage_cleared', { queueSize });
        console.log('[ADMIN] ✅ Storage cleared successfully (all queues)');

        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) syncStatusMessage.textContent = '✅ Storage cleared';

        setTimeout(() => {
          console.log('[ADMIN] Reloading page...');
          location.reload();
        }, 1500);
      } catch (error) {
        console.error('[ADMIN] ❌ Error clearing storage:', error);
        alert('❌ Error clearing storage. Check console for details.');
      }
    };

    adminClearButton.addEventListener('click', adminClearButtonHandler);
    boundElements.adminClearButton = adminClearButton;
    console.log('[ADMIN] ✅ Clear Local button handler attached');
  } else {
    console.warn('[ADMIN] ⚠️ Clear Local button not found');
  }

  if (syncButton) {
    syncButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[ADMIN] 🔘 Sync Data button clicked');
      resetAutoHideTimer();

      if (!navigator.onLine) {
        console.warn('[ADMIN] Sync blocked — offline');
        alert('📡 Cannot sync — device is offline.\n\nData will sync automatically when connection is restored.');
        trackAdminEvent('sync_blocked_offline');
        return;
      }

      if (syncInProgress) {
        console.warn('[ADMIN] Sync already in progress');
        return;
      }

      console.log('[ADMIN] ✅ Starting manual sync (both queues)...');
      syncInProgress = true;
      syncStartedAt = Date.now();
      updateSyncButtonState(true);
      trackAdminEvent('manual_sync_triggered');

      try {
        if (window.dataHandlers?.syncData) {
          await window.dataHandlers.syncData(true, { syncBothQueues: true });
          console.log('[ADMIN] ✅ Sync completed (both queues)');
        } else {
          console.error('[ADMIN] ❌ syncData function not found');
          alert('❌ Sync function not available');
        }
      } catch (error) {
        console.error('[ADMIN] ❌ Sync failed:', error);
        alert('❌ Sync failed. Check console for details.');
      } finally {
        syncInProgress = false;
        syncStartedAt = null;
        updateSyncButtonState(navigator.onLine);
      }
    };

    syncButton.addEventListener('click', syncButtonHandler);
    boundElements.syncButton = syncButton;
    console.log('[ADMIN] ✅ Sync Data button handler attached');
  } else {
    console.warn('[ADMIN] ⚠️ Sync Data button not found');
  }

  if (syncAnalyticsButton) {
    syncAnalyticsButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[ADMIN] 🔘 Sync Analytics button clicked');
      resetAutoHideTimer();

      if (!navigator.onLine) {
        console.warn('[ADMIN] Analytics sync blocked — offline');
        alert('📡 Cannot sync analytics — device is offline.\n\nAnalytics will sync automatically when connection is restored.');
        trackAdminEvent('analytics_sync_blocked_offline');
        return;
      }

      if (analyticsInProgress) {
        console.warn('[ADMIN] Analytics sync already in progress');
        return;
      }

      console.log('[ADMIN] ✅ Starting analytics sync...');
      analyticsInProgress = true;
      analyticsStartedAt = Date.now();
      updateAnalyticsButtonState(true);
      trackAdminEvent('manual_analytics_sync_triggered');

      try {
        if (window.dataHandlers?.syncAnalytics) {
          await window.dataHandlers.syncAnalytics(true);
          console.log('[ADMIN] ✅ Analytics sync completed');
        } else {
          console.error('[ADMIN] ❌ syncAnalytics function not found');
          alert('❌ Analytics sync function not available');
        }
      } catch (error) {
        console.error('[ADMIN] ❌ Analytics sync failed:', error);
        alert('❌ Analytics sync failed. Check console for details.');
      } finally {
        analyticsInProgress = false;
        analyticsStartedAt = null;
        updateAnalyticsButtonState(navigator.onLine);
      }
    };

    syncAnalyticsButton.addEventListener('click', syncAnalyticsButtonHandler);
    boundElements.syncAnalyticsButton = syncAnalyticsButton;
    console.log('[ADMIN] ✅ Sync Analytics button handler attached');
  } else {
    console.warn('[ADMIN] ⚠️ Sync Analytics button not found');
  }

  if (checkUpdateButton) {
    checkUpdateButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[ADMIN] 🔘 Check Update button clicked');
      resetAutoHideTimer();

      if (!navigator.onLine) {
        console.warn('[ADMIN] Update check blocked — offline');
        alert('📡 Cannot check for updates — device is offline.\n\nPlease connect to WiFi to check for updates.');
        trackAdminEvent('update_check_blocked_offline');
        return;
      }

      const syncStatusMessage = window.globals?.syncStatusMessage;

      if (!window.pwaUpdateManager) {
        console.error('[ADMIN] ❌ PWA Update Manager not found');
        if (syncStatusMessage) {
          syncStatusMessage.textContent = '❌ Update manager not available';
          setTimeout(() => {
            syncStatusMessage.textContent = '';
          }, 4000);
        }
        alert('❌ PWA Update Manager not loaded.\n\nThe update system may not be initialized yet.\n\nTry refreshing the page.');
        return;
      }

      console.log('[ADMIN] ✅ Starting update check...');
      trackAdminEvent('update_check_triggered');
      if (syncStatusMessage) syncStatusMessage.textContent = '🔍 Checking for updates...';

      try {
        await window.pwaUpdateManager.forceUpdate();
        console.log('[ADMIN] ✅ Update check completed');
        if (syncStatusMessage) syncStatusMessage.textContent = '✅ Update check complete';
      } catch (error) {
        console.error('[ADMIN] ❌ Update check failed:', error);
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
    boundElements.checkUpdateButton = checkUpdateButton;
    console.log('[ADMIN] ✅ Check Update button handler attached');
  } else {
    console.warn('[ADMIN] ⚠️ Check Update button not found');
  }

  if (fixVideoButton) {
    fixVideoButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[ADMIN] 🔘 Fix Video button clicked');
      resetAutoHideTimer();
      trackAdminEvent('video_fix_triggered');

      let kioskVideo = window.globals?.kioskVideo;
      if (!kioskVideo) kioskVideo = document.getElementById('kioskVideo');
      if (!kioskVideo) kioskVideo = document.querySelector('video');

      if (!kioskVideo) {
        console.error('[ADMIN] ❌ Video element not found anywhere in DOM');
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
          if (repairedVideo.readyState >= 3) {
            resolve(true);
            return;
          }

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
          console.warn('[ADMIN] Video not ready in time:', err.message);
        }

        try {
          const playPromise = repairedVideo.play();
          if (playPromise && typeof playPromise.then === 'function') {
            await playPromise;
          }
        } catch (playErr) {
          console.warn('[ADMIN] Repaired video could not auto-play:', playErr.message);
        }

        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) {
          syncStatusMessage.textContent = '✅ Video reset attempted';
          setTimeout(() => {
            syncStatusMessage.textContent = '';
          }, 3000);
        }

        alert('✅ Video reset has been attempted.\n\nIf you now see video playing on the home screen, the fix worked.\nIf not, the kiosk may need a full restart.');
      } catch (error) {
        console.error('[ADMIN] ❌ Video nuclear reload failed:', error);
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
    boundElements.fixVideoButton = fixVideoButton;
    console.log('[ADMIN] ✅ Fix Video button handler attached (nuclear-ready)');
  } else {
    console.warn('[ADMIN] ⚠️ Fix Video button not found');
  }
}

window.inspectAdminHitTarget = function () {
  const x = Math.round(window.innerWidth / 2);
  const y = 24;
  const el = document.elementFromPoint(x, y);
  const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
  console.log('[ADMIN DEBUG] elementFromPoint:', el);
  console.log('[ADMIN DEBUG] elementsFromPoint:', stack);
  return { el, stack };
};

export function setupAdminPanel() {
  const mainTitle = window.globals?.mainTitle;
  const adminControls = window.globals?.adminControls;
  const hideAdminButton = window.globals?.hideAdminButton;
  const adminClearButton = window.globals?.adminClearButton;
  const syncButton = window.globals?.syncButton;
  const syncAnalyticsButton = window.globals?.syncAnalyticsButton;
  const checkUpdateButton = window.globals?.checkUpdateButton;
  const fixVideoButton = window.globals?.fixVideoButton;

  if (!mainTitle || !adminControls) {
    console.error('[ADMIN] Required elements not found (mainTitle or adminControls)');
    return;
  }

  if (onlineHandler) window.removeEventListener('online', onlineHandler);
  if (offlineHandler) window.removeEventListener('offline', offlineHandler);

  if (!document.getElementById('adminCountdown')) {
    const statusRow = document.createElement('div');
    statusRow.className = 'admin-status-row';

    const onlineStatus = document.createElement('p');
    onlineStatus.id = 'adminOnlineStatus';
    onlineStatus.className = 'admin-online-state';
    onlineStatus.textContent = navigator.onLine ? '🌐 Online' : '📡 Offline Mode';

    const countdown = document.createElement('p');
    countdown.id = 'adminCountdown';

    statusRow.appendChild(onlineStatus);
    statusRow.appendChild(countdown);
    adminControls.insertBefore(statusRow, adminControls.firstChild);
  }

  restoreLockoutState();
  adminControls.classList.add('hidden');
  document.body.classList.remove('admin-active');
  adminPanelVisible = false;
  autoHideStartTime = null;

  buildSurveyTypeSwitcher(adminControls, resetAutoHideTimer);
  bindAdminUnlock();
  bindButtonHandlers({
    hideAdminButton,
    adminClearButton,
    syncButton,
    syncAnalyticsButton,
    checkUpdateButton,
    fixVideoButton,
  });

  onlineHandler = () => {
    console.log('[ADMIN] 🌐 Connection restored');
    if (adminPanelVisible) updateAllButtonStates();
    trackAdminEvent('connection_restored');
  };

  offlineHandler = () => {
    console.log('[ADMIN] 📡 Connection lost — offline mode');
    if (adminPanelVisible) updateAllButtonStates();
    trackAdminEvent('connection_lost');
  };

  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);

  window.setupAdminPanel = setupAdminPanel;
  window.cleanupAdminPanel = cleanupAdminPanel;

  console.log('═══════════════════════════════════════════════════════');
  console.log('🎛️ ADMIN PANEL CONFIGURED (v7.6.0 — pointer-only unlock)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Mode:           Offline-First iPad Kiosk PWA');
  console.log(` Auto-hide:      ${AUTO_HIDE_DELAY / 1000}s`);
  console.log(` Active Survey:  ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);
  console.log(` Network status: ${navigator.onLine ? '🌐 Online' : '📡 Offline'}`);
  console.log('═══════════════════════════════════════════════════════');
}

export function cleanupAdminPanel() {
  clearManagedTimers();

  if (onlineHandler) window.removeEventListener('online', onlineHandler);
  if (offlineHandler) window.removeEventListener('offline', offlineHandler);

  onlineHandler = null;
  offlineHandler = null;

  unbindAdminUnlock();
  detachButtonHandlers();

  autoHideTimer = null;
  autoHideStartTime = null;
  countdownInterval = null;
  adminPanelVisible = false;
  syncInProgress = false;
  analyticsInProgress = false;
  syncStartedAt = null;
  analyticsStartedAt = null;

  const adminControls = window.globals?.adminControls;
  if (adminControls) adminControls.classList.add('hidden');
  document.body.classList.remove('admin-active');

  const countdownEl = document.getElementById('adminCountdown');
  if (countdownEl) countdownEl.textContent = '';

  console.log('[ADMIN] 🧹 Cleaned up all resources (flags + listeners reset)');
}

window.inspectQueue = function () {
  const CONSTANTS = window.CONSTANTS;
  if (!CONSTANTS) {
    console.error('[ADMIN] window.CONSTANTS not available');
    return;
  }

  const queue1 = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_QUEUE) || '[]');
  const queue2 = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_QUEUE_V2) || '[]');

  console.log('═══════════════════════════════════════════════════════');
  console.log('📋 QUEUE INSPECTION');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Type 1 Queue:       ${queue1.length} records`);
  console.log(`Type 2 Queue:       ${queue2.length} records`);
  console.log(`Active Survey Type: ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);
  console.log(`Network:            ${navigator.onLine ? 'Online' : 'Offline'}`);
  console.log('');

  const allQueues = { type1: queue1, type2: queue2 };
  Object.entries(allQueues).forEach(([type, queue]) => {
    if (queue.length > 0) {
      console.log(`--- ${type} ---`);
      queue.forEach((sub, idx) => {
        console.log(`  ${idx + 1}. ID:     ${sub.id}`);
        console.log(`      Time:   ${new Date(sub.timestamp).toLocaleString()}`);
        console.log(`      Status: ${sub.sync_status || 'unsynced'}`);
      });
    }
  });

  console.log('═══════════════════════════════════════════════════════');
  return { type1: queue1, type2: queue2 };
};

window.systemStatus = function () {
  const CONSTANTS = window.CONSTANTS;
  if (!CONSTANTS) {
    console.error('[ADMIN] window.CONSTANTS not available');
    return;
  }

  const queue1 = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_QUEUE) || '[]');
  const queue2 = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_QUEUE_V2) || '[]');
  const analytics = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEY_ANALYTICS) || '[]');
  const lastSync = localStorage.getItem(CONSTANTS.STORAGE_KEY_LAST_SYNC);
  const lastAnalytics = localStorage.getItem(CONSTANTS.STORAGE_KEY_LAST_ANALYTICS_SYNC);

  console.log('═══════════════════════════════════════════════════════');
  console.log('🖥️ SYSTEM STATUS — OFFLINE-FIRST KIOSK');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Network:        ${navigator.onLine ? '🌐 Online' : '📡 Offline Mode'}`);
  console.log(`Active Survey:  ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);
  console.log(`Queue (Type 1): ${queue1.length}/${CONSTANTS.MAX_QUEUE_SIZE} surveys`);
  console.log(`Queue (Type 2): ${queue2.length}/${CONSTANTS.MAX_QUEUE_SIZE} surveys`);
  console.log(`Analytics:      ${analytics.length}/${CONSTANTS.MAX_ANALYTICS_SIZE} events`);
  console.log(`Sync Status:    ${syncInProgress ? '⏳ In Progress' : '✅ Idle'}`);
  console.log(`Analytics Sync: ${analyticsInProgress ? '⏳ In Progress' : '✅ Idle'}`);
  console.log(`Last Sync:      ${lastSync ? new Date(parseInt(lastSync, 10)).toLocaleString() : 'Never'}`);
  console.log(`Last Analytics: ${lastAnalytics ? new Date(parseInt(lastAnalytics, 10)).toLocaleString() : 'Never'}`);
  if (isClearLocalLocked()) {
    console.log(`🔒 Clear Local: LOCKED (${getRemainingLockoutTime()} min remaining)`);
  }
  console.log('═══════════════════════════════════════════════════════');
};

console.log('═══════════════════════════════════════════════════════');
console.log('🛠️ DEBUG COMMANDS');
console.log('═══════════════════════════════════════════════════════');
console.log('📋 window.inspectQueue()  — View both queues');
console.log('🖥️ window.systemStatus() — View system status');
console.log('🎯 window.inspectAdminHitTarget() — Inspect top hit target');
console.log('═══════════════════════════════════════════════════════');

export default { setupAdminPanel, cleanupAdminPanel };
