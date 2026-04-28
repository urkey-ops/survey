// FILE: main/globals.js
// PURPOSE: Admin element validation, safe survey type switching, persistent storage alert
// AUTHORITY: Does NOT reassemble window.globals (that is uiElements.js + appState.js).
//            Only validates, extends safety, and adds persistent alert infrastructure.
// LOAD ORDER: After uiElements.js initializeElements() has run — i.e. called from
//             main/index.js after initializeElements() in the boot sequence.
// VERSION: 1.0.0

// ─── ADMIN ELEMENT VALIDATION ────────────────────────────────────────────────
// validateElements() in uiElements.js checks only survey-critical elements.
// These admin-panel elements are also populated in initializeElements() but
// never validated. A renamed ID in index.html silently nulls them — every
// admin button stops working with no console error.

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
  const missing = REQUIRED_ADMIN_GLOBALS.filter(key => !window.globals?.[key]);

  if (missing.length) {
    missing.forEach(key =>
      console.error(`[GLOBALS] ❌ window.globals.${key} is null — check ID in index.html`)
    );
  } else {
    console.log('[GLOBALS] ✅ All admin globals validated');
  }

  return missing.length === 0;
}

// ─── SAFE SURVEY TYPE SWITCH ──────────────────────────────────────────────────
// adminSurveyControls.js calls window.KIOSK_CONFIG.setActiveSurveyType(type)
// directly and never checks the return value. config.js returns false on failure
// (storage unavailable or invalid type) but adminSurveyControls.js ignores it —
// the UI updates and a reload fires, but the type was never actually saved.
// All subsequent submissions go to the wrong queue with no error.

export function safeSetActiveSurveyType(type) {
  if (!window.KIOSK_CONFIG?.setActiveSurveyType) {
    console.error('[GLOBALS] ❌ KIOSK_CONFIG.setActiveSurveyType not available');
    return false;
  }

  const success = window.KIOSK_CONFIG.setActiveSurveyType(type);

  if (!success) {
    console.error(
      `[GLOBALS] ❌ setActiveSurveyType("${type}") returned false — ` +
      `write did not persist (storage unavailable or invalid type). ` +
      `Survey type switch aborted.`
    );
    return false;
  }

  // Read-back verify — confirms the value actually round-trips through localStorage
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
// storageUtils.js catches QuotaExceededError and calls showUserError() —
// a 10-second toast that disappears before staff see it in Guided Access mode.
// This adds a persistent flag in a tiny separate key that the admin panel
// reads on every open and shows as a permanent banner until staff clears it.

export function flagStorageAlert(context = '') {
  try {
    localStorage.setItem('kioskStorageAlert', JSON.stringify({
      flaggedAt: new Date().toISOString(),
      context,
    }));
    console.error(`[GLOBALS] 🚨 Storage quota alert flagged — context: "${context}"`);
  } catch (_) {
    // If even this write fails, storage is critically full — nothing more we can do
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
  localStorage.removeItem('kioskStorageAlert');
  console.log('[GLOBALS] ✅ Storage alert cleared');
}
