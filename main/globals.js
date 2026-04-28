// FILE: main/globals.js
// PURPOSE: Admin element validation, safe survey type switching, persistent storage alert
// VERSION: 1.0.0
// AUTHORITY: Does NOT reassemble window.globals (that is uiElements.js + appState.js).
//            Validates admin elements, adds safe type-switch wrapper, persistent quota alert.
// LOAD ORDER: Called from main/index.js after initializeElements() has run.

// ─── ADMIN ELEMENT VALIDATION ────────────────────────────────────────────────
// validateElements() in uiElements.js checks only 6 survey-critical elements.
// These admin elements are populated in initializeElements() but never validated.
// A renamed ID in index.html silently nulls them — every admin button stops
// working with no console error.

const REQUIRED_ADMIN_GLOBALS = [
  'syncButton',
  'syncAnalyticsButton',
  'syncStatusMessage',
  'adminClearButton',
  'checkUpdateButton',
  'fixVideoButton',
  'hideAdminButton',
  'adminControls',
  'unsyncedCountDisplay',
];

export function validateAdminGlobals() {
  if (!window.globals) {
    console.error('[GLOBALS] ❌ window.globals is not defined — uiElements.js may not have run');
    return false;
  }

  const missing = REQUIRED_ADMIN_GLOBALS.filter(key => !window.globals[key]);

  if (missing.length) {
    missing.forEach(key =>
      console.error(`[GLOBALS] ❌ window.globals.${key} is null — check element ID in index.html`)
    );
    console.error(`[GLOBALS] ❌ ${missing.length} admin global(s) missing — admin panel buttons will not work`);
    return false;
  }

  console.log('[GLOBALS] ✅ All admin globals validated');
  return true;
}

// ─── SAFE SURVEY TYPE SWITCH ──────────────────────────────────────────────────
// adminSurveyControls.js calls window.KIOSK_CONFIG.setActiveSurveyType(type)
// directly and never checks the return value. config.js returns false on failure
// (storage unavailable or invalid type) but adminSurveyControls.js ignores it —
// the UI updates and a reload fires but the type was never saved.
// All subsequent submissions go to the wrong queue with no error.
//
// This wrapper:
//   1. Calls setActiveSurveyType and checks the boolean return
//   2. Read-back verifies the value actually persisted in localStorage
//   3. Returns false and logs loudly if either check fails
//   4. Caller must check return value and abort the switch if false

export function safeSetActiveSurveyType(type) {
  if (!window.KIOSK_CONFIG?.setActiveSurveyType) {
    console.error('[GLOBALS] ❌ KIOSK_CONFIG.setActiveSurveyType not available — config.js not loaded');
    return false;
  }

  const success = window.KIOSK_CONFIG.setActiveSurveyType(type);

  if (!success) {
    console.error(
      `[GLOBALS] ❌ setActiveSurveyType("${type}") returned false — ` +
      `write did not persist. Storage may be unavailable or type is invalid. ` +
      `Survey type switch must be aborted.`
    );
    return false;
  }

  // Read-back verify — confirms value round-trips through localStorage
  const actual = window.KIOSK_CONFIG.getActiveSurveyType?.();
  if (actual !== type) {
    console.error(
      `[GLOBALS] ❌ setActiveSurveyType write/read mismatch — ` +
      `wrote "${type}", read back "${actual}". Aborting switch.`
    );
    return false;
  }

  console.log(`[GLOBALS] ✅ Active survey type set and verified: "${type}"`);
  return true;
}

// ─── PERSISTENT STORAGE ALERT ────────────────────────────────────────────────
// storageUtils.js catches QuotaExceededError and calls showUserError() which
// shows a 10-second toast that disappears before staff see it in Guided Access.
// flagStorageAlert() writes a tiny persistent key that adminPanel.js reads on
// every panel open and shows as a permanent banner until staff dismisses it.
//
// Called directly from storageUtils.js safeSetLocalStorage catch block.
// Uses a try/catch itself in case storage is completely full.

export function flagStorageAlert(context = '') {
  try {
    localStorage.setItem('kioskStorageAlert', JSON.stringify({
      flaggedAt: new Date().toISOString(),
      context,
    }));
    console.error(`[GLOBALS] 🚨 Storage quota alert flagged — context: "${context}"`);
  } catch (_) {
    // If even this tiny write fails, storage is critically full
    console.error('[GLOBALS] 🚨 CRITICAL: Cannot write storage alert flag — storage completely full');
  }
}

export function checkStorageAlert() {
  try {
    return JSON.parse(localStorage.getItem('kioskStorageAlert') || 'null');
  } catch (_) {
    return null;
  }
}

export function clearStorageAlert() {
  try {
    localStorage.removeItem('kioskStorageAlert');
    console.log('[GLOBALS] ✅ Storage alert cleared');
  } catch (_) {
    console.warn('[GLOBALS] Could not clear storage alert key');
  }
}

console.log('[GLOBALS] ✅ globals.js loaded (v1.0.0)');
