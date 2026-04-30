// FILE: main/adminSurveyControls.js
// PURPOSE: Survey type switcher + sync + analytics sync button handlers
// VERSION: 1.3.1
// CHANGES FROM 1.3.0:
//   - FIX BUG-19: showSyncBeforeSwitchModal() always resolved true — both
//     the confirm/OK path and the SWITCH ANYWAY path called resolve(true),
//     making the `if (!proceed) return;` guard at the call site permanently
//     dead code. The modal's UX intent is a WARNING before switching, not a
//     hard block — the user can always proceed. Renamed to
//     showSyncWarningModal() to match actual intent, removed the dead
//     `if (!proceed)` guard at the call site, and updated the internal
//     comment to explain why the function always resolves (it's intentional:
//     warn + optionally sync, then always allow the switch).
// DEPENDENCIES: adminState.js, adminUtils.js, globals.js, contracts.js,
//               window.globals, window.CONSTANTS, window.KIOSK_CONFIG, window.DEVICECONFIG

import { adminState } from './adminState.js';
import { trackAdminEvent } from './adminUtils.js';
import { safeSetActiveSurveyType } from './globals.js';
import { buildQueueRecord } from './contracts.js';

let syncButtonHandler = null;
let syncAnalyticsButtonHandler = null;
let boundSyncButton = null;
let boundSyncAnalyticsButton = null;

// ─────────────────────────────────────────────────────────────
// BUTTON STATE UPDATERS — called from adminPanel.js
// ─────────────────────────────────────────────────────────────

export function updateSyncButtonState(isOnline) {
  const syncButton = window.globals?.syncButton;
  if (!syncButton) return;

  const shouldDisable = !isOnline || adminState.syncInProgress;
  syncButton.disabled = shouldDisable;
  syncButton.setAttribute('aria-busy', adminState.syncInProgress ? 'true' : 'false');
  syncButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');

  if (adminState.syncInProgress) {
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

  syncButton.title = adminState.syncInProgress
    ? 'Sync in progress...'
    : !isOnline
      ? 'Sync disabled — device is offline'
      : 'Sync queued data to server';
}

export function updateAnalyticsButtonState(isOnline) {
  const syncAnalyticsButton = window.globals?.syncAnalyticsButton;
  if (!syncAnalyticsButton) return;

  const shouldDisable = !isOnline || adminState.analyticsInProgress;
  syncAnalyticsButton.disabled = shouldDisable;
  syncAnalyticsButton.setAttribute('aria-busy', adminState.analyticsInProgress ? 'true' : 'false');
  syncAnalyticsButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');

  if (adminState.analyticsInProgress) {
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

  syncAnalyticsButton.title = adminState.analyticsInProgress
    ? 'Sync in progress...'
    : !isOnline
      ? 'Sync disabled — device is offline'
      : 'Sync analytics to server';
}

// ─────────────────────────────────────────────────────────────
// SYNC WARNING MODAL (warning-only, always allows switch)
// ─────────────────────────────────────────────────────────────

/**
 * FIX BUG-19: Renamed from showSyncBeforeSwitchModal to showSyncWarningModal
 * to match its actual UX intent. This is a WARNING dialog, not a hard block.
 * Both branches — "SYNC NOW" and "SWITCH ANYWAY" — resolve to true because
 * the user is always permitted to switch survey types. The modal's purpose is
 * to prompt a sync attempt before the switch, not to prevent the switch.
 * The call site no longer uses `if (!proceed) return;` since that guard was
 * permanently dead code (the promise never resolved false).
 */
async function showSyncWarningModal(unsyncedCount) {
  return new Promise(resolve => {
    const isOffline = !navigator.onLine;
    const isSyncing = adminState.syncInProgress;

    let message = `${unsyncedCount} unsynced record(s) across all queues.\n\n`;
    if (isOffline) message += '❌ Device is OFFLINE.\n';
    if (isSyncing) message += '⏳ Sync already in progress.\n';
    message += 'Sync first to prevent data loss?\n\n';
    message += '[OK] = SYNC NOW (5s timeout)\n[CANCEL] = SWITCH ANYWAY (⚠️ risk data loss)';

    if (confirm(message)) {
      console.log('[SWITCH WARNING] SYNC NOW clicked — starting syncBothQueues...');
      const syncPromise    = window.dataHandlers?.syncData(true, { syncBothQueues: true });
      const timeoutPromise = new Promise(r => setTimeout(() => r(false), 5000));

      Promise.race([syncPromise, timeoutPromise]).then(success => {
        if (success) {
          console.log('[SWITCH WARNING] ✅ Sync completed — proceeding with switch');
        } else {
          console.log('[SWITCH WARNING] ❌ 5s timeout — warning shown, proceeding anyway');
          alert('⚠️ Sync timed out after 5s. Switching anyway (data risk).');
        }
        // Always allow the switch — this modal is warning-only
        resolve(true);
      });
    } else {
      // User chose SWITCH ANYWAY — warn and allow
      console.log('[SWITCH WARNING] SWITCH ANYWAY chosen — warning logged');
      trackAdminEvent('switch_force_without_sync', { unsyncedCount });
      resolve(true);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// SURVEY TYPE SWITCHER
// ─────────────────────────────────────────────────────────────

export function updateSurveyTypeSwitcher() {
  const currentType  = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
  const btnGroup     = document.getElementById('surveyTypeBtnGroup');
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

export function buildSurveyTypeSwitcher(adminControls, resetTimer) {
  if (document.getElementById('surveyTypeSwitcher')) return;

  const surveyTypes = window.CONSTANTS?.SURVEY_TYPES || {};

  if (!Object.keys(surveyTypes).length) {
    console.error('[SURVEY CONTROLS] ❌ SURVEY_TYPES is empty or not loaded — switcher not built');
    return;
  }

  const currentType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';

  const switcherRow = document.createElement('div');
  switcherRow.id        = 'surveyTypeSwitcher';
  switcherRow.className = 'survey-type-switcher';

  const label = document.createElement('p');
  label.className   = 'survey-type-label';
  label.textContent = 'Active Survey';

  const currentLabel = document.createElement('p');
  currentLabel.id        = 'surveyTypeCurrentLabel';
  currentLabel.className = 'survey-type-current';
  currentLabel.textContent = `Current: ${surveyTypes[currentType]?.label || currentType} · Sheet: ${surveyTypes[currentType]?.sheetName || ''}`;

  const btnGroup = document.createElement('div');
  btnGroup.id        = 'surveyTypeBtnGroup';
  btnGroup.className = 'survey-type-pills';

  const makeBtn = (type, btnLabel) => {
    const btn = document.createElement('button');
    btn.type              = 'button';
    btn.textContent       = btnLabel;
    btn.dataset.surveyType = type;
    btn.setAttribute('aria-pressed', currentType === type ? 'true' : 'false');

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetTimer();

      const alreadyActive = window.KIOSK_CONFIG?.getActiveSurveyType?.() === type;
      if (alreadyActive) {
        console.log('[SURVEY CONTROLS] Survey type already active:', type);
        return;
      }

      const kioskMode = window.DEVICECONFIG?.kioskMode;
      const unsynced  = window.dataHandlers?.countUnsyncedRecords?.(null, kioskMode) || 0;
      const isOffline = !navigator.onLine;
      const isSyncing = adminState.syncInProgress;

      // FIX BUG-19: Removed `if (!proceed) return;` — the warning modal always
      // resolves true (it's warning-only). The await is kept so we still give
      // the sync attempt time to complete before proceeding.
      if (unsynced > 0 || isOffline || isSyncing) {
        console.log('[SURVEY CONTROLS] ⚠️ Warning: unsynced=', unsynced, 'offline=', isOffline, 'syncing=', isSyncing);
        await showSyncWarningModal(unsynced);
        // Always continues here — the modal never blocks the switch
      }

      // ── Partial save on type switch ───────────────────────────────────────
      try {
        const currentSurveyType = window.KIOSK_CONFIG?.getActiveSurveyType?.() || 'type1';
        const partialData       = window.appState?.formData;
        const hasPartialData    = partialData && Object.keys(partialData).length > 1;

        if (hasPartialData) {
          const queueKey = window.CONSTANTS?.SURVEY_TYPES?.[currentSurveyType]?.storageKey;

          if (queueKey) {
            const record = buildQueueRecord(partialData, {
              surveyType:      currentSurveyType,
              abandonedAt:     new Date().toISOString(),
              abandonedReason: 'survey_type_switch',
              sync_status:     'unsynced_partial',
            });

            if (window.dataHandlers?.addToQueue) {
              window.dataHandlers.addToQueue(record, queueKey);
              console.log(`[SURVEY CONTROLS] ✅ Partial data saved via addToQueue (queue: ${queueKey})`);
            } else {
              console.warn('[SURVEY CONTROLS] ⚠️ addToQueue not available — partial data not saved');
            }
          }
        }
      } catch (saveErr) {
        console.warn('[SURVEY CONTROLS] Could not save partial data before type switch:', saveErr);
      }

      // ── Safe survey type switch with return-value check ───────────────────
      const switched = safeSetActiveSurveyType(type);
      if (!switched) {
        const syncStatusMessage = window.globals?.syncStatusMessage;
        if (syncStatusMessage) {
          syncStatusMessage.textContent = '❌ Could not switch survey type — storage unavailable';
          syncStatusMessage.style.color = '#dc2626';
          syncStatusMessage.style.fontWeight = 'bold';
          setTimeout(() => {
            syncStatusMessage.textContent = '';
            syncStatusMessage.style.color = '';
            syncStatusMessage.style.fontWeight = '';
          }, 4000);
        }
        console.error('[SURVEY CONTROLS] ❌ Survey type switch aborted — write failed');
        return;
      }

      // Reset app state to Q1 for the new survey type
      if (window.appState) {
        window.appState.currentQuestionIndex = 0;
        window.appState.formData             = {};
        window.appState.questionTimeSpent    = {};
        console.log('[SURVEY CONTROLS] ✅ Survey state reset to Q1');
      }

      // Update pill UI
      btnGroup.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.surveyType === type ? 'true' : 'false');
      });

      const lbl    = document.getElementById('surveyTypeCurrentLabel');
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

      localStorage.removeItem('kioskState');
      console.log('[SURVEY CONTROLS] kioskState cleared before reload — fresh start screen');

      setTimeout(() => {
        if (syncStatusMessage) syncStatusMessage.textContent = '';
        location.reload();
      }, 1500);

    }); // close event listener

    return btn;
  }; // close makeBtn

  const kioskMode = window.DEVICECONFIG?.kioskMode;
  const allowed   = new Set(
    window.DEVICECONFIG?.CONFIGS?.[kioskMode]?.allowedSurveyTypes ||
    window.DEVICECONFIG?.allowedSurveyTypes ||
    Object.keys(surveyTypes)
  );

  Object.entries(surveyTypes)
    .filter(([type]) => allowed.has(type))
    .forEach(([type, cfg]) => {
      btnGroup.appendChild(makeBtn(type, cfg.label || type));
    });

  switcherRow.appendChild(label);
  switcherRow.appendChild(currentLabel);
  switcherRow.appendChild(btnGroup);

  const firstChild = adminControls.firstChild;
  if (firstChild && firstChild.nextSibling) {
    adminControls.insertBefore(switcherRow, firstChild.nextSibling);
  } else {
    adminControls.appendChild(switcherRow);
  }

  console.log('[SURVEY CONTROLS] ✅ Survey type switcher built (sync protected, safe write)');
}

// ─────────────────────────────────────────────────────────────
// BUTTON HANDLERS
// ─────────────────────────────────────────────────────────────

export function setupSurveyControls(syncButton, syncAnalyticsButton, resetAutoHideTimer) {
  cleanupSurveyControls();

  if (syncButton) {
    syncButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[SURVEY CONTROLS] 🔘 Sync Data button clicked');
      resetAutoHideTimer();

      if (!navigator.onLine) {
        console.warn('[SURVEY CONTROLS] Sync blocked — offline');
        alert('📡 Cannot sync — device is offline.\n\nData will sync automatically when connection is restored.');
        trackAdminEvent('sync_blocked_offline');
        return;
      }

      if (adminState.syncInProgress) {
        console.warn('[SURVEY CONTROLS] Sync already in progress');
        return;
      }

      console.log('[SURVEY CONTROLS] ✅ Starting manual sync (all queues)...');
      adminState.syncInProgress = true;
      adminState.syncStartedAt  = Date.now();
      updateSyncButtonState(true);
      trackAdminEvent('manual_sync_triggered');

      try {
        if (window.dataHandlers?.syncData) {
          await window.dataHandlers.syncData(true, { syncBothQueues: true });
          console.log('[SURVEY CONTROLS] ✅ Sync completed (all queues)');
        } else {
          console.error('[SURVEY CONTROLS] ❌ syncData function not found');
          alert('❌ Sync function not available');
        }
      } catch (error) {
        console.error('[SURVEY CONTROLS] ❌ Sync failed:', error);
        alert('❌ Sync failed. Check console for details.');
      } finally {
        adminState.syncInProgress = false;
        adminState.syncStartedAt  = null;
        updateSyncButtonState(navigator.onLine);
      }
    };

    syncButton.addEventListener('click', syncButtonHandler);
    boundSyncButton = syncButton;
    console.log('[SURVEY CONTROLS] ✅ Sync Data button handler attached');
  } else {
    console.warn('[SURVEY CONTROLS] ⚠️ Sync Data button not found');
  }

  if (syncAnalyticsButton) {
    syncAnalyticsButtonHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[SURVEY CONTROLS] 🔘 Sync Analytics button clicked');
      resetAutoHideTimer();

      if (!navigator.onLine) {
        console.warn('[SURVEY CONTROLS] Analytics sync blocked — offline');
        alert('📡 Cannot sync analytics — device is offline.\n\nAnalytics will sync automatically when connection is restored.');
        trackAdminEvent('analytics_sync_blocked_offline');
        return;
      }

      if (adminState.analyticsInProgress) {
        console.warn('[SURVEY CONTROLS] Analytics sync already in progress');
        return;
      }

      console.log('[SURVEY CONTROLS] ✅ Starting analytics sync...');
      adminState.analyticsInProgress = true;
      adminState.analyticsStartedAt  = Date.now();
      updateAnalyticsButtonState(true);
      trackAdminEvent('manual_analytics_sync_triggered');

      try {
        if (window.dataHandlers?.syncAnalytics) {
          await window.dataHandlers.syncAnalytics(true);
          console.log('[SURVEY CONTROLS] ✅ Analytics sync completed');
        } else {
          console.error('[SURVEY CONTROLS] ❌ syncAnalytics function not found');
          alert('❌ Analytics sync function not available');
        }
      } catch (error) {
        console.error('[SURVEY CONTROLS] ❌ Analytics sync failed:', error);
        alert('❌ Analytics sync failed. Check console for details.');
      } finally {
        adminState.analyticsInProgress = false;
        adminState.analyticsStartedAt  = null;
        updateAnalyticsButtonState(navigator.onLine);
      }
    };

    syncAnalyticsButton.addEventListener('click', syncAnalyticsButtonHandler);
    boundSyncAnalyticsButton = syncAnalyticsButton;
    console.log('[SURVEY CONTROLS] ✅ Sync Analytics button handler attached');
  } else {
    console.warn('[SURVEY CONTROLS] ⚠️ Sync Analytics button not found');
  }
}

export function cleanupSurveyControls() {
  if (boundSyncButton && syncButtonHandler) {
    boundSyncButton.removeEventListener('click', syncButtonHandler);
  }
  if (boundSyncAnalyticsButton && syncAnalyticsButtonHandler) {
    boundSyncAnalyticsButton.removeEventListener('click', syncAnalyticsButtonHandler);
  }

  syncButtonHandler          = null;
  syncAnalyticsButtonHandler = null;
  boundSyncButton            = null;
  boundSyncAnalyticsButton   = null;
}
