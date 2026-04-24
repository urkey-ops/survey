// FILE: main/adminPanel.js
// PURPOSE: Admin panel shell — show/hide, unlock gesture, auto-hide, online indicator, orchestration
// VERSION: 8.2.0
// CHANGES FROM 8.1.0:
//   - FIX: remove loose resetBtn block that was floating in module scope (bug)
//   - ADD: buildSurveyTypeSwitcher wrapped in allowedSurveyTypes guard
//     (switcher only shown when device is configured for >1 survey type)
//   - ADD: "Reset Device Type" button in admin panel
//     (clears deviceConfig from localStorage → setup screen on next reload)
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
} from './adminMaintenance.js';

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const VERSION = 'v8.2.0';
const AUTO_HIDE_DELAY = 20000;
const COUNTDOWN_UPDATE_INTERVAL = 1000;
const STUCK_FLAG_TIMEOUT_MS = 60000;

// ─────────────────────────────────────────────────────────────
// LOCAL STATE
// ─────────────────────────────────────────────────────────────

let autoHideTimer = null;
let countdownInterval = null;
let handleTitlePointerUp = null;
let unlockTapCount = 0;
let unlockTapTimeout = null;
let unlockLastTapTime = 0;
let onlineHandler = null;
let offlineHandler = null;
let hideAdminButtonHandler = null;
let boundHideAdminButton = null;

// ─────────────────────────────────────────────────────────────
// STUCK FLAG RESET
// ─────────────────────────────────────────────────────────────

function resetStuckFlagsIfNeeded() {
  const now = Date.now();

  if (adminState.syncInProgress && adminState.syncStartedAt && (now - adminState.syncStartedAt) > STUCK_FLAG_TIMEOUT_MS) {
    console.warn('[ADMIN] ⚠️ syncInProgress was stuck >60s — resetting');
    adminState.syncInProgress = false;
    adminState.syncStartedAt = null;
    updateSyncButtonState(navigator.onLine);
  }

  if (adminState.analyticsInProgress && adminState.analyticsStartedAt && (now - adminState.analyticsStartedAt) > STUCK_FLAG_TIMEOUT_MS) {
    console.warn('[ADMIN] ⚠️ analyticsInProgress was stuck >60s — resetting');
    adminState.analyticsInProgress = false;
    adminState.analyticsStartedAt = null;
    updateAnalyticsButtonState(navigator.onLine);
  }
}

// ─────────────────────────────────────────────────────────────
// COUNTDOWN + AUTO-HIDE
// ─────────────────────────────────────────────────────────────

function updateCountdown() {
  const countdownEl = document.getElementById('adminCountdown');
  if (!countdownEl || !adminState.adminPanelVisible || !adminState.autoHideStartTime) return;

  const elapsed   = Date.now() - adminState.autoHideStartTime;
  const remaining = Math.max(0, Math.ceil((AUTO_HIDE_DELAY - elapsed) / 1000));

  if (remaining > 0) {
    countdownEl.textContent    = `Auto-hide in ${remaining}s`;
    countdownEl.style.opacity  = remaining <= 5 ? '1' : '0.6';
  } else {
    countdownEl.textContent = '';
  }
}

function startAutoHideTimer() {
  if (autoHideTimer)     { clearTimeout(autoHideTimer);       autoHideTimer     = null; }
  if (countdownInterval) { clearInterval(countdownInterval);  countdownInterval = null; }

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
  if (autoHideTimer)     { clearTimeout(autoHideTimer);       autoHideTimer     = null; }
  if (countdownInterval) { clearInterval(countdownInterval);  countdownInterval = null; }
  if (unlockTapTimeout)  { clearTimeout(unlockTapTimeout);    unlockTapTimeout  = null; }
}

// ─────────────────────────────────────────────────────────────
// SHOW / HIDE
// ─────────────────────────────────────────────────────────────

function hideAdminPanel() {
  const adminControls = window.globals?.adminControls;
  if (adminControls) {
    adminControls.classList.add('hidden');
    document.body.classList.remove('admin-active');
  }

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
  startAutoHideTimer();
  vibrateSuccess();
  trackAdminEvent('admin_panel_opened');

  console.log('[ADMIN] ✅ Panel visible (auto-hide in 20s)');
}

// ─────────────────────────────────────────────────────────────
// BUTTON STATES
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
  console.log(`[ADMIN] 🔘 All buttons updated (${isOnline ? 'ONLINE' : 'OFFLINE'})`);
}

// ─────────────────────────────────────────────────────────────
// HIDE BUTTON
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
// 5-TAP UNLOCK GESTURE
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
// DEVICE RESET BUTTON
// ─────────────────────────────────────────────────────────────

/**
 * Appends a "Reset Device Type" button to the admin panel.
 * Clears deviceConfig from localStorage so the first-launch setup
 * screen reappears on the next page load/reload.
 * Always added regardless of allowedSurveyTypes count — useful for
 * correcting a wrong device selection on either iPad.
 */
function _buildDeviceResetButton(adminControls) {
  // Avoid duplicates if setupAdminPanel is called more than once
  if (document.getElementById('adminDeviceResetBtn')) return;

  const divider = document.createElement('hr');
  divider.style.cssText = 'border:none;border-top:1px solid #e5e7eb;margin:8px 0';

  const resetBtn = document.createElement('button');
  resetBtn.id          = 'adminDeviceResetBtn';
  resetBtn.textContent = '🔄 Reset Device Type';
  resetBtn.style.cssText = `
    width: 100%;
    padding: 0.6rem 1rem;
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    margin-top: 4px;
  `;

  resetBtn.addEventListener('click', () => {
    resetAutoHideTimer();
    if (confirm('This will reset the kiosk device type.\nThe setup screen will appear on the next reload.\n\nContinue?')) {
      localStorage.removeItem('deviceConfig');
      console.log('[ADMIN] 🔄 deviceConfig cleared — reloading for setup screen');
      trackAdminEvent('device_type_reset');
      location.reload();
    }
  });

  adminControls.appendChild(divider);
  adminControls.appendChild(resetBtn);
  console.log('[ADMIN] ✅ Device reset button added');
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

  if (!document.getElementById('adminCountdown')) {
    const statusRow = document.createElement('div');
    statusRow.className = 'admin-status-row';

    const onlineStatus = document.createElement('p');
    onlineStatus.id        = 'adminOnlineStatus';
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
  adminState.adminPanelVisible = false;
  adminState.autoHideStartTime = null;

  // ── Survey type switcher — only show when device supports >1 type ─────────
  // Temple iPad: allowedSurveyTypes = ['type1', 'type2'] → length 2 → show
  // Café iPad:   allowedSurveyTypes = ['type3']           → length 1 → hide
  const allowedTypes = window.DEVICECONFIG?.allowedSurveyTypes ?? [];
  if (allowedTypes.length > 1) {
    buildSurveyTypeSwitcher(adminControls, resetAutoHideTimer);
    console.log('[ADMIN] ✅ Survey type switcher built');
  } else {
    console.log('[ADMIN] ℹ️ Single survey type — switcher hidden');
  }

  bindAdminUnlock();
  bindHideButton(window.globals?.hideAdminButton);

  setupSurveyControls(
    window.globals?.syncButton,
    window.globals?.syncAnalyticsButton,
    resetAutoHideTimer
  );

  setupMaintenanceHandlers(
    window.globals?.adminClearButton,
    window.globals?.checkUpdateButton,
    window.globals?.fixVideoButton,
    resetAutoHideTimer
  );

  // ── Device reset button — always present on both iPads ───────────────────
  _buildDeviceResetButton(adminControls);

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
  console.log('  Mode:           Offline-First iPad Kiosk PWA');
  console.log(`  Auto-hide:      ${AUTO_HIDE_DELAY / 1000}s`);
  console.log(`  Device mode:    ${window.DEVICECONFIG?.kioskMode ?? 'unknown'}`);
  console.log(`  Survey types:   ${(allowedTypes.length > 0 ? allowedTypes : ['type1']).join(', ')}`);
  console.log(`  Active Survey:  ${window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1'}`);
  console.log(`  Network status: ${navigator.onLine ? '🌐 Online' : '📡 Offline'}`);
  console.log('═══════════════════════════════════════════════════════');
}

export function cleanupAdminPanel() {
  clearManagedTimers();

  if (onlineHandler)  window.removeEventListener('online',  onlineHandler);
  if (offlineHandler) window.removeEventListener('offline', offlineHandler);
  onlineHandler  = null;
  offlineHandler = null;

  unbindAdminUnlock();

  if (boundHideAdminButton && hideAdminButtonHandler) {
    boundHideAdminButton.removeEventListener('click', hideAdminButtonHandler);
    hideAdminButtonHandler = null;
    boundHideAdminButton   = null;
  }

  cleanupSurveyControls();
  cleanupMaintenanceHandlers();

  resetAdminState();

  const adminControls = window.globals?.adminControls;
  if (adminControls) adminControls.classList.add('hidden');
  document.body.classList.remove('admin-active');

  const countdownEl = document.getElementById('adminCountdown');
  if (countdownEl) countdownEl.textContent = '';

  console.log('[ADMIN] 🧹 Cleaned up all resources (flags + listeners reset)');
}

export default { setupAdminPanel, cleanupAdminPanel };
