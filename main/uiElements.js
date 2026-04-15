// FILE: main/uiElements.js
// PURPOSE: DOM element initialization and validation
// DEPENDENCIES: window.globals

/**
 * Initialize all DOM element references
 */
export function initializeElements() {
  console.log('[UI] Initializing DOM references...');

  // Guard: ensure window.globals exists
  if (!window.globals) {
    window.globals = {};
  }

  window.globals.questionContainer    = document.getElementById('questionContainer');
  window.globals.nextBtn              = document.getElementById('nextBtn');
  window.globals.prevBtn              = document.getElementById('prevBtn');
  window.globals.mainTitle            = document.getElementById('mainTitle');
  window.globals.progressBar          = document.getElementById('progressBar');
  window.globals.kioskStartScreen     = document.getElementById('kioskStartScreen');
  window.globals.kioskVideo           = document.getElementById('kioskVideo');
  window.globals.adminControls        = document.getElementById('adminControls');
  window.globals.syncButton           = document.getElementById('syncButton');
  window.globals.adminClearButton     = document.getElementById('adminClearButton');
  window.globals.hideAdminButton      = document.getElementById('hideAdminButton');
  window.globals.unsyncedCountDisplay = document.getElementById('unsyncedCountDisplay');
  window.globals.syncStatusMessage    = document.getElementById('syncStatusMessage');
  window.globals.syncAnalyticsButton  = document.getElementById('syncAnalyticsButton');
  window.globals.checkUpdateButton    = document.getElementById('checkUpdateButton');
  window.globals.fixVideoButton       = document.getElementById('fixVideoButton');

  // Optional elements — null is acceptable, never include in requiredElements
  window.globals.kioskSurvey          = document.getElementById('kioskSurvey')    ?? null;
  window.globals.adminQueueCount      = document.getElementById('adminQueueCount') ?? null;
  window.globals.progressText         = document.getElementById('progressText')    ?? null;

  console.log('[UI] ✅ DOM elements initialized');
}

/**
 * Validate that all CRITICAL DOM elements exist
 * IMPORTANT: Only include elements that are guaranteed to exist in index.html.
 * Never add optional/deprecated element IDs here — a null value = critical failure.
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
    // ✋ DO NOT ADD kioskSurvey, adminQueueCount, progressText here —
    //    they are optional and do not exist in index.html
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
 * Display critical error screen when elements are missing
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
