// FILE: main/uiElements.js
// PURPOSE: Initialize and validate DOM element references into window.globals
// NOTE: No bugs found — no changes from original

export function initializeElements() {
  window.globals = {
    // Core kiosk elements
    kioskStartScreen:    document.getElementById('kioskStartScreen'),
    kioskVideo:          document.getElementById('kioskVideo'),
    mainTitle:           document.getElementById('mainTitle'),
    kioskSurvey:         document.getElementById('kioskSurvey'),
    questionContainer:   document.getElementById('questionContainer'),
    progressBar:         document.getElementById('progressBar'),
    progressText:        document.getElementById('progressText'),

    // Navigation
    nextBtn:             document.getElementById('nextBtn'),
    prevBtn:             document.getElementById('prevBtn'),

    // Admin panel
    adminControls:       document.getElementById('adminControls'),
    hideAdminButton:     document.getElementById('hideAdminButton'),
    adminClearButton:    document.getElementById('adminClearButton'),
    syncButton:          document.getElementById('syncButton'),
    syncAnalyticsButton: document.getElementById('syncAnalyticsButton'),
    checkUpdateButton:   document.getElementById('checkUpdateButton'),
    fixVideoButton:      document.getElementById('fixVideoButton'),
    syncStatusMessage:   document.getElementById('syncStatusMessage'),
    adminQueueCount:     document.getElementById('adminQueueCount'),
  };

  console.log('[UI] ✅ DOM elements initialized');
}

export function validateElements() {
  const REQUIRED = [
    'kioskStartScreen',
    'mainTitle',
    'kioskSurvey',
    'questionContainer',
    'nextBtn',
    'prevBtn',
    'adminControls',
  ];

  const missingElements = REQUIRED.filter(key => !window.globals?.[key]);

  if (missingElements.length > 0) {
    console.error('[UI] ❌ Missing required elements:', missingElements);
    return { valid: false, missingElements };
  }

  return { valid: true, missingElements: [] };
}

export function showCriticalError(missingElements) {
  console.error('[UI] 💥 Critical init failure — missing:', missingElements);
  const body = document.body;
  if (body) {
    body.innerHTML = `
      <div style="
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; height:100vh; background:#fef2f2;
        font-family:sans-serif; padding:2rem; text-align:center;
      ">
        <h1 style="color:#dc2626; font-size:1.5rem; margin-bottom:1rem;">
          ⚠️ Kiosk Initialization Failed
        </h1>
        <p style="color:#374151; margin-bottom:0.5rem;">
          Required elements not found in the DOM:
        </p>
        <code style="background:#fee2e2; color:#991b1b; padding:0.5rem 1rem; border-radius:4px;">
          ${missingElements.join(', ')}
        </code>
        <p style="color:#6b7280; margin-top:1rem; font-size:0.875rem;">
          Please check the HTML template and refresh.
        </p>
      </div>
    `;
  }
}

export default { initializeElements, validateElements, showCriticalError };
