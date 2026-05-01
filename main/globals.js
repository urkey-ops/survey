// FILE: main/globals.js
// PURPOSE: Admin element validation, safe survey type switching, persistent storage alert
// VERSION: 1.0.1
// CHANGES FROM 1.0.0:
//   - FIX L4: Added window.safeSetActiveSurveyType = safeSetActiveSurveyType after
//     function definition. The function was exported as an ES named export but never
//     assigned to window. Non-module callers (IIFEs, adminSurveyControls.js if not
//     an ES module) calling window.safeSetActiveSurveyType() got undefined and fell
//     through to calling window.KIOSK_CONFIG.setActiveSurveyType() directly,
//     bypassing the read-back verification and return-value check.
//   - FIX L5: Added window.flagStorageAlert = flagStorageAlert after function
//     definition. queueManager.js calls window.flagStorageAlert() in the queue-full
//     drop branch — without this assignment the call was a no-op and staff received
//     no persistent banner notification of data loss.
//   - FIX T1 (globals side): Replaced local REQUIRED_ADMIN_GLOBALS array with an
//     import of REQUIRED_ADMIN_ELEMENTS from uiElements.js as the single source of
//     truth. Both lists were identical — if a developer added a key to one but not
//     the other, one validation path would silently miss the missing element.
//     Matching export must exist in uiElements.js (see v1.1.1 of that file).
// AUTHORITY: Does NOT reassemble window.globals (that is uiElements.js + appState.js).
//            Validates admin elements, adds safe type-switch wrapper, persistent quota alert.
// LOAD ORDER: Called from main/index.js after initializeElements() has run.

import { REQUIRED_ADMIN_ELEMENTS } from './uiElements.js';

// ─── ADMIN ELEMENT VALIDATION ────────────────────────────────────────────────
// validateElements() in uiElements.js checks only 6 survey-critical elements.
// These admin elements are populated in initializeElements() but never validated.
// A renamed ID in index.html silently nulls them — every admin button stops
// working with no console error.
//
// FIX T1: REQUIRED_ADMIN_GLOBALS is now an alias for REQUIRED_ADMIN_ELEMENTS
// imported from uiElements.js — single source of truth, no drift possible.
const REQUIRED_ADMIN_GLOBALS = REQUIRED_ADMIN_ELEMENTS;

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

// FIX L4: Expose safeSetActiveSurveyType on window for non-module callers
// (IIFEs, adminSurveyControls.js, inline HTML handlers). ES named export above
// remains for module consumers. Mirrors the pattern used in navigationSetup.js
// for window._initializeSurveyState.
window.safeSetActiveSurveyType = safeSetActiveSurveyType;

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

// FIX L5: Expose flagStorageAlert on window so non-module callers can reach it.
// queueManager.js calls window.flagStorageAlert() in the queue-full drop branch
// to trigger the persistent admin panel banner. Without this assignment the
// typeof guard in queueManager.js always saw undefined and staff received no
// notification of dropped records.
window.flagStorageAlert = flagStorageAlert;

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

console.log('[GLOBALS] ✅ globals.js loaded (v1.0.1)');
