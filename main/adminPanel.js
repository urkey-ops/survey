// FILE: main/adminPanel.js
// PURPOSE: Admin panel shell — show/hide, unlock gesture, auto-hide, online indicator, orchestration
// VERSION: 9.0.0
// CHANGES FROM 8.3.0:
//   - ADD: wireSyncAllButton() — wires #syncAllButton (new HTML element) to call
//     window.dataHandlers.syncData() + window.dataHandlers.syncAnalytics() in sequence.
//     Reuses adminState.syncInProgress + adminState.analyticsInProgress flags so
//     existing updateSyncButtonState / updateAnalyticsButtonState logic stays correct.
//   - ADD: wireSettingsButton() — wires #adminSettingsButton to toggle class
//     .admin-maintenance-open on #adminControls, which CSS uses to reveal/hide
//     #admin-maintenance-drawer via max-height transition. Also toggles aria-expanded.
//   - ADD: _relocateDeviceResetButton() — after _buildDeviceResetButton() appends
//     #adminDeviceResetBtn to #adminControls, this helper moves it into
//     #admin-maintenance-drawer so it lives with the other maintenance controls.
//   - ADD: cleanup for syncAllButton and settingsButton event listeners in cleanupAdminPanel().
//   - UNCHANGED: All existing imports, constants, state, countdown/auto-hide,
//     show/hide, button state updaters, 5-tap unlock, hide button, kiosk selector
//     wiring, setupAdminPanel structure, cleanupAdminPanel. Zero changes to any
//     logic that was working in v8.3.0.
// DEPENDENCIES: adminState.js, adminUtils.js, adminSurveyControls.js, adminMaintenance.js

import { adminState, resetAdminState } from './adminState.js';
import { trackAdminEvent, vibrateSuccess, vibrateTap } from './adminUtils.js';

import {
  buildSurveyTypeSwitcher,
  updateSurveyTypeSwitcher,
  updateSyncButtonState,
  updateAnalyticsButtonState,
  setupSurveyControls,
  cleanupSurveyControls,
} from './adminSurveyControls.js';

import {
  restoreLockoutState,
  updateClearButtonState,
  updateCheckUpdateButtonState,
  updateFixVideoButtonState,
  setupMaintenanceHandlers,
  cleanupMaintenanceHandlers,
  setupKioskSelector,
  getCurrentKioskMode,
  loadKioskQueues,
  setupKioskSyncButton,
} from './adminMaintenance.js';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const VERSION              = 'v9.0.0';
const AUTO_HIDE_DELAY      = 20000;
const COUNTDOWN_UPDATE_INTERVAL = 1000;
const STUCK_FLAG_TIMEOUT_MS     = 60000;

// ─────────────────────────────────────────────────────────────
// LOCAL STATE
// ─────────────────────────────────────────────────────────────

let autoHideTimer          = null;
let countdownInterval      = null;
let handleTitlePointerUp   = null;
let unlockTapCount         = 0;
let unlockTapTimeout       = null;
let unlockLastTapTime      = 0;
let onlineHandler          = null;
let offlineHandler         = null;
let hideAdminButtonHandler = null;
let boundHideAdminButton   = null;

// ── NEW in v9.0.0 ─────────────────────────────────────────────
let syncAllButtonHandler   = null;
let boundSyncAllButton     = null;
let settingsButtonHandler  = null;
let boundSettingsButton    = null;

// ─────────────────────────────────────────────────────────────
// STUCK FLAG RESET (unchanged)
// ─────────────────────────────────────────────────────────────

function resetStuckFlagsIfNeeded() {
  const now = Date.now();

  if (adminState.syncInProgress && adminState.syncStartedAt &&
      (now - adminState.syncStartedAt) > STUCK_FLAG_TIMEOUT_MS) {
    console.warn('[ADMIN] ⚠️ syncInProgress was stuck >60s — resetting');
    adminState.syncInProgress = false;
    adminState.syncStartedAt  = null;
    updateSyncButtonState(navigator.onLine);
  }

  if (adminState.analyticsInProgress && adminState.analyticsStartedAt &&
      (now - adminState.analyticsStartedAt) > STUCK_FLAG_TIMEOUT_MS) {
    console.warn('[ADMIN] ⚠️ analyticsInProgress was stuck >60s — resetting');
    adminState.analyticsInProgress = false;
    adminState.analyticsStartedAt  = null;
    updateAnalyticsButtonState(navigator.onLine);
  }
}

// ─────────────────────────────────────────────────────────────
// COUNTDOWN + AUTO-HIDE (unchanged)
// ─────────────────────────────────────────────────────────────

function updateCountdown() {
  const countdownEl = document.getElementById('adminCountdown');
  if (!countdownEl || !adminState.adminPanelVisible || !adminState.autoHideStartTime) return;

  const elapsed   = Date.now() - adminState.autoHideStartTime;
  const remaining = Math.max(0, Math.ceil((AUTO_HIDE_DELAY - elapsed) / 1000));

  if (remaining > 0) {
    countdownEl.textContent   = `Auto-hide in ${remaining}s`;
    countdownEl.style.opacity = remaining <= 5 ? '1' : '0.6';
  } else {
    countdownEl.textContent = '';
  }
}

function startAutoHideTimer() {
  if (autoHideTimer)     { clearTimeout(autoHideTimer);      autoHideTimer     = null; }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }

  adminState.autoHideStartTime = Date.now();

  autoHideTimer = setTimeout(() => {
    console.log('[ADMIN] ⏱️ Auto-hiding panel');
    hideAdminPanel();
    trackAdminEvent('admin_auto_hide');
  }, AUTO_HIDE_DELAY);

  countdownInterval = setInterval(updateCountdown, COUNTDOWN_UPDATE_INTERVAL);
  updateCountdown();
}

function resetAutoHideTimer() {
  if (adminState.adminPanelVisible) startAutoHideTimer();
}

function clearManagedTimers() {
  if (autoHideTimer)    { clearTimeout(autoHideTimer);      autoHideTimer     = null; }
  if (countdownInterval){ clearInterval(countdownInterval); countdownInterval = null; }
  if (unlockTapTimeout) { clearTimeout(unlockTapTimeout);   unlockTapTimeout  = null; }
}

// ─────────────────────────────────────────────────────────────
// SHOW / HIDE (unchanged)
// ─────────────────────────────────────────────────────────────

function hideAdminPanel() {
  const adminControls = window.globals?.adminControls;
  if (adminControls) {
    adminControls.classList.add('hidden');
    // Also close the maintenance drawer when panel hides
    adminControls.classList.remove('admin-maintenance-open');
    document.body.classList.remove('admin-active');
  }

  const settingsBtn = document.getElementById('adminSettingsButton');
  if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');

  const drawer = document.getElementById('admin-maintenance-drawer');
  if (drawer) drawer.setAttribute('aria-hidden', 'true');

  adminState.adminPanelVisible = false;
  adminState.autoHideStartTime = null;
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
  adminState.adminPanelVisible = true;

  if (window.dataHandlers?.updateAdminCount) {
    window.dataHandlers.updateAdminCount();
  }

  updateAllButtonStates();
  updateSurveyTypeSwitcher();

  // Refresh kiosk queue count whenever panel opens
  loadKioskQueues();

  // Refresh syncAllButton state on open
  _updateSyncAllButtonState(navigator.onLine);

  startAutoHideTimer();
  vibrateSuccess();
  trackAdminEvent('admin_panel_opened');

  console.log('[ADMIN] ✅ Panel visible (auto-hide in 20s)');
}

// ─────────────────────────────────────────────────────────────
// BUTTON STATES (unchanged)
// ─────────────────────────────────────────────────────────────

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
  _updateSyncAllButtonState(isOnline);
  console.log(`[ADMIN] 🔘 All buttons updated (${isOnline ? 'ONLINE' : 'OFFLINE'})`);
}

// ─────────────────────────────────────────────────────────────
// SYNC ALL BUTTON — NEW in v9.0.0
// ─────────────────────────────────────────────────────────────

/**
 * Update visual state of #syncAllButton based on online/in-progress flags.
 * Called from updateAllButtonStates() and after sync operations complete.
 */
function _updateSyncAllButtonState(isOnline) {
  const btn = document.getElementById('syncAllButton');
  if (!btn) return;

  const isBusy = adminState.syncInProgress || adminState.analyticsInProgress;
  const shouldDisable = !isOnline || isBusy;

  btn.disabled = shouldDisable;
  btn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  btn.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');

  if (isBusy) {
    btn.textContent = 'Syncing…';
    btn.style.opacity = '0.7';
    btn.style.cursor  = 'wait';
  } else if (!isOnline) {
    btn.textContent = 'Sync (Offline)';
    btn.style.opacity = '0.5';
    btn.style.cursor  = 'not-allowed';
  } else {
    btn.textContent = 'Sync';
    btn.style.opacity = '1';
    btn.style.cursor  = 'pointer';
  }

  btn.title = isBusy
    ? 'Sync in progress…'
    : !isOnline
      ? 'Cannot sync — device is offline'
      : 'Sync all data and analytics to server';
}

/**
 * Wire #syncAllButton click handler.
 * Calls syncData() (all queues) then syncAnalytics() sequentially.
 * Uses existing adminState flags to prevent double-fire.
 * Does NOT touch window.globals.syncButton or window.globals.syncAnalyticsButton
 * — those elements still exist in the drawer with their own handlers intact.
 */
function wireSyncAllButton() {
  // Clean up previous binding if re-wired
  if (boundSyncAllButton && syncAllButtonHandler) {
    boundSyncAllButton.removeEventListener('click', syncAllButtonHandler);
    syncAllButtonHandler = null;
    boundSyncAllButton   = null;
  }

  const btn = document.getElementById('syncAllButton');
  if (!btn) {
    console.warn('[ADMIN] ⚠️ #syncAllButton not found in DOM');
    return;
  }

  syncAllButtonHandler = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetAutoHideTimer();

    if (!navigator.onLine) {
      alert('📡 Cannot sync — device is offline.\n\nData will sync automatically when connection is restored.');
      trackAdminEvent('sync_all_blocked_offline');
      return;
    }

    if (adminState.syncInProgress || adminState.analyticsInProgress) {
      console.warn('[ADMIN] Sync All blocked — already in progress');
      return;
    }

    console.log('[ADMIN] 🔄 Sync All triggered (data + analytics)');
    trackAdminEvent('sync_all_triggered');

    // ── Phase 1: Sync data ───────────────────────────────────────────────────
    adminState.syncInProgress = true;
    adminState.syncStartedAt  = Date.now();
    _updateSyncAllButtonState(true);
    updateSyncButtonState(true); // keep drawer button in sync too

    try {
      if (window.dataHandlers?.syncData) {
        await window.dataHandlers.syncData(true, { syncBothQueues: true });
        console.log('[ADMIN] ✅ Sync All — data phase complete');
      } else {
        console.error('[ADMIN] ❌ syncData not available');
        alert('❌ Sync function not available.');
        return;
      }
    } catch (err) {
      console.error('[ADMIN] ❌ Sync All — data phase failed:', err);
      alert(`❌ Data sync failed: ${err.message}`);
    } finally {
      adminState.syncInProgress = false;
      adminState.syncStartedAt  = null;
      updateSyncButtonState(navigator.onLine);
    }

    // ── Phase 2: Sync analytics ──────────────────────────────────────────────
    adminState.analyticsInProgress = true;
    adminState.analyticsStartedAt  = Date.now();
    _updateSyncAllButtonState(true);
    updateAnalyticsButtonState(true); // keep drawer button in sync too

    try {
      if (window.dataHandlers?.syncAnalytics) {
        await window.dataHandlers.syncAnalytics(true);
        console.log('[ADMIN] ✅ Sync All — analytics phase complete');
      } else {
        console.error('[ADMIN] ❌ syncAnalytics not available');
        // Non-fatal — data already synced
      }
    } catch (err) {
      console.error('[ADMIN] ❌ Sync All — analytics phase failed:', err);
      // Non-fatal — data sync succeeded
    } finally {
      adminState.analyticsInProgress = false;
      adminState.analyticsStartedAt  = null;
      updateAnalyticsButtonState(navigator.onLine);
      _updateSyncAllButtonState(navigator.onLine);
    }

    console.log('[ADMIN] ✅ Sync All complete');
    trackAdminEvent('sync_all_complete');
  };

  btn.addEventListener('click', syncAllButtonHandler);
  boundSyncAllButton = btn;
  console.log('[ADMIN] ✅ Sync All button wired');
}

// ─────────────────────────────────────────────────────────────
// SETTINGS / DRAWER TOGGLE — NEW in v9.0.0
// ─────────────────────────────────────────────────────────────

/**
 * Wire #adminSettingsButton to toggle .admin-maintenance-open on #adminControls.
 * CSS handles the actual show/hide of #admin-maintenance-drawer via max-height.
 * Also updates aria-expanded on the button and aria-hidden on the drawer.
 */
function wireSettingsButton() {
  // Clean up previous binding
  if (boundSettingsButton && settingsButtonHandler) {
    boundSettingsButton.removeEventListener('click', settingsButtonHandler);
    settingsButtonHandler = null;
    boundSettingsButton   = null;
  }

  const btn = document.getElementById('adminSettingsButton');
  if (!btn) {
    console.warn('[ADMIN] ⚠️ #adminSettingsButton not found in DOM');
    return;
  }

  settingsButtonHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetAutoHideTimer();

    const adminControls = window.globals?.adminControls;
    if (!adminControls) return;

    const isOpen = adminControls.classList.toggle('admin-maintenance-open');

    // Sync aria attributes
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    const drawer = document.getElementById('admin-maintenance-drawer');
    if (drawer) drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

    console.log(`[ADMIN] 🔧 Maintenance drawer ${isOpen ? 'opened' : 'closed'}`);
    trackAdminEvent('maintenance_drawer_toggled', { open: isOpen });
  };

  btn.addEventListener('click', settingsButtonHandler);
  boundSettingsButton = btn;
  console.log('[ADMIN] ✅ Settings button wired');
}

// ─────────────────────────────────────────────────────────────
// DEVICE RESET BUTTON RELOCATION — NEW in v9.0.0
// ─────────────────────────────────────────────────────────────

/**
 * _buildDeviceResetButton() in v8.x appended #adminDeviceResetBtn directly
 * to adminControls, making it visible in the main panel. In v9.0.0 we want
 * it inside the maintenance drawer.
 *
 * Strategy: call the original builder (unchanged), then immediately move the
 * injected element into #admin-maintenance-drawer. This avoids modifying
 * _buildDeviceResetButton() itself and keeps its click handler intact.
 */
function _relocateDeviceResetButton() {
  const resetBtn = document.getElementById('adminDeviceResetBtn');
  const drawer   = document.getElementById('admin-maintenance-drawer');

  if (!resetBtn) {
    console.warn('[ADMIN] _relocateDeviceResetButton: #adminDeviceResetBtn not found');
    return;
  }

  if (!drawer) {
    console.warn('[ADMIN] _relocateDeviceResetButton: #admin-maintenance-drawer not found');
    return;
  }

  // Also move the <hr> divider that was injected just before the button
  const prevSibling = resetBtn.previousElementSibling;
  if (prevSibling && prevSibling.tagName === 'HR') {
    drawer.appendChild(prevSibling);
  }

  drawer.appendChild(resetBtn);
  console.log('[ADMIN] ✅ #adminDeviceResetBtn relocated into maintenance drawer');
}

// ─────────────────────────────────────────────────────────────
// HIDE BUTTON (unchanged)
// ─────────────────────────────────────────────────────────────

function bindHideButton(hideAdminButton) {
  if (boundHideAdminButton && hideAdminButtonHandler) {
    boundHideAdminButton.removeEventListener('click', hideAdminButtonHandler);
  }

  if (hideAdminButton) {
    hideAdminButtonHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[ADMIN] 🔘 Hide button clicked');
      hideAdminPanel();
      trackAdminEvent('admin_manually_hidden');
    };
    hideAdminButton.addEventListener('click', hideAdminButtonHandler);
    boundHideAdminButton = hideAdminButton;
    console.log('[ADMIN] ✅ Hide button handler attached');
  } else {
    console.warn('[ADMIN] ⚠️ Hide button not found');
  }
}

// ─────────────────────────────────────────────────────────────
// 5-TAP UNLOCK GESTURE (unchanged)
// ─────────────────────────────────────────────────────────────

function isAdminTitleTapTarget(target) {
  if (!target || !(target instanceof Element)) return false;

  const configuredTitle = window.globals?.mainTitle;
  if (configuredTitle && (target === configuredTitle || configuredTitle.contains(target))) return true;
  if (target.closest('#mainTitle')) return true;
  if (target.closest('[data-admin-unlock], [data-main-title], .main-title, .app-title, header h1')) return true;

  return false;
}

function bindAdminUnlock() {
  if (handleTitlePointerUp) {
    document.removeEventListener('pointerup', handleTitlePointerUp, true);
  }

  unlockTapCount    = 0;
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
      unlockTapCount   = 0;
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

  unlockTapCount    = 0;
  unlockLastTapTime = 0;
  if (unlockTapTimeout) { clearTimeout(unlockTapTimeout); unlockTapTimeout = null; }
}

// ─────────────────────────────────────────────────────────────
// DEVICE RESET BUTTON BUILDER (unchanged from v8.3.0)
// ─────────────────────────────────────────────────────────────

function _buildDeviceResetButton(adminControls) {
  if (document.getElementById('adminDeviceResetBtn')) return;

  const divider = document.createElement('hr');
  divider.style.cssText = 'border:none;border-top:1px solid #e5e7eb;margin:8px 0';

  const resetBtn = document.createElement('button');
  resetBtn.id          = 'adminDeviceResetBtn';
  resetBtn.type        = 'button';
  resetBtn.textContent = '🔄 Reset Device Type';
  resetBtn.style.cssText = `
    width:100%;padding:0.6rem 1rem;background:#fef3c7;color:#92400e;
    border:1px solid #fcd34d;border-radius:6px;font-size:0.85rem;
    font-weight:600;cursor:pointer;margin-top:4px;
  `;

  resetBtn.addEventListener('click', () => {
    resetAutoHideTimer();
    if (confirm('This will reset the kiosk device type.\nThe setup screen will appear on the next reload.\n\nContinue?')) {
      localStorage.removeItem('deviceConfig');
      localStorage.removeItem('kioskState');
      console.log('[ADMIN] 🔄 deviceConfig + kioskState cleared — reloading for setup screen');
      trackAdminEvent('device_type_reset');
      location.reload();
    }
  });

  // Append to adminControls as before — _relocateDeviceResetButton() will
  // move it into the drawer immediately after this call returns.
  adminControls.appendChild(divider);
  adminControls.appendChild(resetBtn);
  console.log('[ADMIN] ✅ Device reset button added');
}

// ─────────────────────────────────────────────────────────────
// KIOSK MODE SELECTOR WIRING (unchanged from v8.3.0)
// ─────────────────────────────────────────────────────────────

function bindKioskSelector() {
  const kioskSelector = document.getElementById('kioskSelector');
  if (!kioskSelector) {
    console.warn('[ADMIN] ⚠️ kioskSelector not found — was setupKioskSelector() called first?');
    return;
  }

  if (kioskSelector._kioskChangeListener) {
    kioskSelector.removeEventListener('change', kioskSelector._kioskChangeListener);
    kioskSelector._kioskChangeListener = null;
  }

  const listener = (e) => {
    resetAutoHideTimer();
    const mode = e.target.value;
    console.log(`[ADMIN] 🧩 Kiosk mode changed to: ${mode}`);
    loadKioskQueues(mode);
    trackAdminEvent('kiosk_selector_changed', { mode });
  };

  kioskSelector._kioskChangeListener = listener;
  kioskSelector.addEventListener('change', listener);
  console.log('[ADMIN] ✅ Kiosk mode selector wired');
}

function unbindKioskSelector() {
  const kioskSelector = document.getElementById('kioskSelector');
  if (!kioskSelector) return;

  if (kioskSelector._kioskChangeListener) {
    kioskSelector.removeEventListener('change', kioskSelector._kioskChangeListener);
    kioskSelector._kioskChangeListener = null;
    console.log('[ADMIN] 🧹 Kiosk selector unbound');
  }
}

// ─────────────────────────────────────────────────────────────
// SETUP / CLEANUP
// ─────────────────────────────────────────────────────────────

export function setupAdminPanel() {
  const mainTitle     = window.globals?.mainTitle;
  const adminControls = window.globals?.adminControls;

  if (!mainTitle || !adminControls) {
    console.error('[ADMIN] Required elements not found (mainTitle or adminControls)');
    return;
  }

  if (onlineHandler)  window.removeEventListener('online',  onlineHandler);
  if (offlineHandler) window.removeEventListener('offline', offlineHandler);

  // ── Status row (online indicator + countdown) ─────────────────────────────
  if (!document.getElementById('adminCountdown')) {
    const statusRow = document.createElement('div');
    statusRow.className = 'admin-status-row';

    const onlineStatus = document.createElement('p');
    onlineStatus.id          = 'adminOnlineStatus';
    onlineStatus.className   = 'admin-online-state';
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
  adminState.adminPanelVisible = false;
  adminState.autoHideStartTime = null;

  // ── Survey type switcher ──────────────────────────────────────────────────
  const allowedTypes = window.DEVICECONFIG?.allowedSurveyTypes ?? [];
  if (allowedTypes.length > 1) {
    buildSurveyTypeSwitcher(adminControls, resetAutoHideTimer);
    console.log('[ADMIN] ✅ Survey type switcher built');
  } else {
    console.log('[ADMIN] ℹ️ Single survey type — switcher hidden');
  }

  // ── Kiosk selector injection ──────────────────────────────────────────────
  setupKioskSelector('adminControls');

  // ── Unlock + hide button ──────────────────────────────────────────────────
  bindAdminUnlock();
  bindHideButton(window.globals?.hideAdminButton);

  // ── NEW v9.0.0: Wire primary action buttons ───────────────────────────────
  wireSyncAllButton();
  wireSettingsButton();

  // ── Drawer button handlers (syncButton, syncAnalyticsButton) ─────────────
  setupSurveyControls(
    window.globals?.syncButton,
    window.globals?.syncAnalyticsButton,
    resetAutoHideTimer
  );

  // ── Maintenance button handlers ───────────────────────────────────────────
  setupMaintenanceHandlers(
    window.globals?.adminClearButton,
    window.globals?.checkUpdateButton,
    window.globals?.fixVideoButton,
    resetAutoHideTimer
  );

  // ── Device reset button — build then relocate into drawer ────────────────
  // Build into adminControls first (unchanged builder), then immediately
  // move into #admin-maintenance-drawer so it is hidden by default.
  _buildDeviceResetButton(adminControls);
  _relocateDeviceResetButton();

  // ── Kiosk sync button + selector wiring ──────────────────────────────────
  setupKioskSyncButton('adminControls');
  bindKioskSelector();

  // ── Network listeners ─────────────────────────────────────────────────────
  onlineHandler = () => {
    console.log('[ADMIN] 🌐 Connection restored');
    if (adminState.adminPanelVisible) updateAllButtonStates();
    trackAdminEvent('connection_restored');
  };

  offlineHandler = () => {
    console.log('[ADMIN] 📡 Connection lost — offline mode');
    if (adminState.adminPanelVisible) updateAllButtonStates();
    trackAdminEvent('connection_lost');
  };

  window.addEventListener('online',  onlineHandler);
  window.addEventListener('offline', offlineHandler);

  window.setupAdminPanel   = setupAdminPanel;
  window.cleanupAdminPanel = cleanupAdminPanel;

  console.log('═══════════════════════════════════════════════════════');
  console.log(`🎛️ ADMIN PANEL CONFIGURED (${VERSION} — modular split)`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Mode:             Offline-First iPad Kiosk PWA');
  console.log(`  Auto-hide:        ${AUTO_HIDE_DELAY / 1000}s`);
  console.log(`  Device mode:      ${window.DEVICECONFIG?.kioskMode ?? 'unknown'}`);
  console.log(`  Kiosk selector:   ${document.getElementById('kioskSelector') ? '✅' : '❌'}`);
  console.log(`  Sync All button:  ${document.getElementById('syncAllButton') ? '✅' : '❌'}`);
  console.log(`  Settings button:  ${document.getElementById('adminSettingsButton') ? '✅' : '❌'}`);
  console.log(`  Maint. drawer:    ${document.getElementById('admin-maintenance-drawer') ? '✅' : '❌'}`);
  console.log(`  Device reset:     ${document.getElementById('adminDeviceResetBtn') ? '✅ (in drawer)' : '❌'}`);
  console.log(`  Survey types:     ${(allowedTypes.length > 0 ? allowedTypes : ['type1']).join(', ')}`);
  console.log(`  Active Survey:    ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);
  console.log(`  Network status:   ${navigator.onLine ? '🌐 Online' : '📡 Offline'}`);
  console.log('═══════════════════════════════════════════════════════');
}

export function cleanupAdminPanel() {
  clearManagedTimers();

  if (onlineHandler)  window.removeEventListener('online',  onlineHandler);
  if (offlineHandler) window.removeEventListener('offline', offlineHandler);
  onlineHandler  = null;
  offlineHandler = null;

  unbindAdminUnlock();
  unbindKioskSelector();

  if (boundHideAdminButton && hideAdminButtonHandler) {
    boundHideAdminButton.removeEventListener('click', hideAdminButtonHandler);
    hideAdminButtonHandler = null;
    boundHideAdminButton   = null;
  }

  // ── NEW v9.0.0: clean up new button listeners ─────────────────────────────
  if (boundSyncAllButton && syncAllButtonHandler) {
    boundSyncAllButton.removeEventListener('click', syncAllButtonHandler);
    syncAllButtonHandler = null;
    boundSyncAllButton   = null;
  }

  if (boundSettingsButton && settingsButtonHandler) {
    boundSettingsButton.removeEventListener('click', settingsButtonHandler);
    settingsButtonHandler = null;
    boundSettingsButton   = null;
  }

  cleanupSurveyControls();
  cleanupMaintenanceHandlers();

  resetAdminState();

  const adminControls = window.globals?.adminControls;
  if (adminControls) {
    adminControls.classList.add('hidden');
    adminControls.classList.remove('admin-maintenance-open');
  }
  document.body.classList.remove('admin-active');

  const countdownEl = document.getElementById('adminCountdown');
  if (countdownEl) countdownEl.textContent = '';

  console.log('[ADMIN] 🧹 Cleaned up all resources (flags + listeners reset)');
}

export default { setupAdminPanel, cleanupAdminPanel };
