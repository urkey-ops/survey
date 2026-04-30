// FILE: main/uiElements.js
// PURPOSE: DOM element initialization and validation
// VERSION: 1.1.0
// CHANGES FROM 1.0.0:
//   - ADD: Admin element validation inside initializeElements()
//     Previously only validateElements() checked 6 survey-critical elements.
//     Admin elements (syncButton, adminClearButton, etc.) were populated but
//     never validated — a renamed ID silently nulled them with no console error.
//   - UNCHANGED: validateElements(), showCriticalError() — no behaviour change.
// DEPENDENCIES: window.globals (declared in appState.js, populated here)

/**
 * Initialize all DOM element references
 */
export function initializeElements() {
  console.log('[UI] Initializing DOM references...');

  // Guard: ensure window.globals exists (declared in appState.js)
  if (!window.globals) {
    window.globals = {};
  }

  // ── Survey-critical elements ──────────────────────────────────────────────
  // These are validated by validateElements() and will halt boot if missing.
  window.globals.questionContainer    = document.getElementById('questionContainer');
  window.globals.nextBtn              = document.getElementById('nextBtn');
  window.globals.prevBtn              = document.getElementById('prevBtn');
  window.globals.mainTitle            = document.getElementById('mainTitle');
  window.globals.progressBar          = document.getElementById('progressBar');
  window.globals.kioskStartScreen     = document.getElementById('kioskStartScreen');
  window.globals.kioskVideo           = document.getElementById('kioskVideo');

  // ── Admin panel elements ──────────────────────────────────────────────────
  // These are NOT in validateElements() (boot must not halt if admin panel
  // has a missing element — the survey must still work).
  // Validated here with console.error so a renamed ID surfaces immediately
  // at boot rather than silently failing when staff tap the admin panel.
  window.globals.adminControls        = document.getElementById('adminControls');
  window.globals.syncButton           = document.getElementById('syncButton');
  window.globals.adminClearButton     = document.getElementById('adminClearButton');
  window.globals.hideAdminButton      = document.getElementById('hideAdminButton');
  window.globals.unsyncedCountDisplay = document.getElementById('unsyncedCountDisplay');
  window.globals.syncStatusMessage    = document.getElementById('syncStatusMessage');
  window.globals.syncAnalyticsButton  = document.getElementById('syncAnalyticsButton');
  window.globals.checkUpdateButton    = document.getElementById('checkUpdateButton');
  window.globals.fixVideoButton       = document.getElementById('fixVideoButton');

  // ── Optional elements — null is acceptable ────────────────────────────────
  // Never include these in requiredElements or admin validation.
  window.globals.kioskSurvey     = document.getElementById('kioskSurvey')    ?? null;
  window.globals.adminQueueCount = document.getElementById('adminQueueCount') ?? null;
  window.globals.progressText    = document.getElementById('progressText')    ?? null;

  // ── Admin element validation ──────────────────────────────────────────────
  // Logs console.error for each missing admin element immediately at boot.
  // Does NOT halt initialization — survey functionality is unaffected.
  // If any of these are null, adminPanel.js will silently skip them, but
  // the error here tells the developer exactly which ID to fix in index.html.
  const REQUIRED_ADMIN_ELEMENTS = [
    'adminControls',
    'syncButton',
    'adminClearButton',
    'hideAdminButton',
    'unsyncedCountDisplay',
    'syncStatusMessage',
    'syncAnalyticsButton',
    'checkUpdateButton',
    'fixVideoButton',
  ];

  const missingAdmin = REQUIRED_ADMIN_ELEMENTS.filter(key => !window.globals[key]);

  if (missingAdmin.length) {
    missingAdmin.forEach(key =>
      console.error(
        `[UI] ❌ window.globals.${key} is null — element ID not found in index.html. ` +
        `Admin panel "${key}" button will not function.`
      )
    );
  } else {
    console.log('[UI] ✅ All admin elements found and assigned');
  }

  console.log('[UI] ✅ DOM elements initialized');
}

/**
 * Validate that all CRITICAL DOM elements exist.
 * IMPORTANT: Only include elements guaranteed to exist in index.html.
 * Never add optional or admin-only element IDs here — a null value here
 * triggers showCriticalError() and halts the entire application.
 * @returns {{ valid: boolean, missingElements: string[] }}
 */
export function validateElements() {
  const missingElements = [];

  const requiredElements = {
    questionContainer: window.globals.questionContainer,
    nextBtn:           window.globals.nextBtn,
    prevBtn:           window.globals.prevBtn,
    mainTitle:         window.globals.mainTitle,
    kioskStartScreen:  window.globals.kioskStartScreen,
    kioskVideo:        window.globals.kioskVideo,
    // ✋ DO NOT ADD admin elements here — they are validated in initializeElements()
    // ✋ DO NOT ADD kioskSurvey, adminQueueCount, progressText — optional elements
  };

  Object.entries(requiredElements).forEach(([name, element]) => {
    if (!element) {
      missingElements.push(name);
    }
  });

  if (missingElements.length > 0) {
    console.error('[UI] ❌ Missing required elements:', missingElements);
  } else {
    console.log('[UI] ✅ All required elements validated');
  }

  return { valid: missingElements.length === 0, missingElements };
}

/**
 * Display critical error screen when required survey elements are missing.
 * @param {string[]} missingElements
 */
export function showCriticalError(missingElements) {
  console.error(`[UI] 💥 Critical init failure — missing: ${missingElements.join(', ')}`);

  document.body.innerHTML = `
    <div style="
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; min-height:100vh; font-family:sans-serif;
      background:#fef2f2; color:#991b1b; padding:2rem; text-align:center;
    ">
      <h1 style="font-size:1.5rem; font-weight:bold; margin-bottom:1rem;">
        ⚠️ Kiosk Initialization Failed
      </h1>
      <p style="margin-bottom:0.5rem;">Could not load survey interface.</p>
      <p style="font-size:0.875rem; color:#b91c1c;">
        Missing elements: <strong>${missingElements.join(', ')}</strong>
      </p>
      <button onclick="location.reload()" style="
        margin-top:1.5rem; padding:0.75rem 1.5rem;
        background:#dc2626; color:white; border:none;
        border-radius:8px; font-size:1rem; cursor:pointer;
      ">Reload</button>
    </div>
  `;
}

export default { initializeElements, validateElements, showCriticalError };
