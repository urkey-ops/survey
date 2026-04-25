// FILE: config/device-config.js
// PURPOSE: First script in index.html — sets window.DEVICECONFIG before app loads
// VERSION: 1.1.4
// CHANGES FROM 1.1.3:
//   - FIX B1-07b: Complete frozen start screen fix. Waits for index.js 
//     initializeElements() to wire window.globals.kioskStartScreen before
//     calling _initializeSurveyState(). Console trace proves: showStartScreen()
//     was called before DOM elements existed → {once:true} listeners attached
//     to null. Now polls explicitly for kioskStartScreen + __surveyStateInitialized.
//     Single 20ms poll loop (subframe-safe). No module changes required.

(function () {
  const STORAGE_KEY = 'deviceConfig';
  const stored      = localStorage.getItem(STORAGE_KEY);

  // ── Setup overlay logic ───────────────────────────────────────────────────
  // IMPORTANT: showSetupOverlay() is defined FIRST so all call sites below
  // (both first-launch and corrupt-recovery paths) are always safe to call.

  function showSetupOverlay() {
    const CONFIGS = {
      temple: {
        kioskMode:          'temple',
        kioskId:            'KIOSK-GWINNETT-001',
        defaultSurveyType:  'type1',
        allowedSurveyTypes: ['type1', 'type2'],
      },
      shayona: {
        kioskMode:          'shayona',
        kioskId:            'KIOSK-CAFE-001',
        defaultSurveyType:  'type3',
        allowedSurveyTypes: ['type3'],
      },
    };

    function attachHandlers(overlay) {
      overlay.querySelectorAll('.setup-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          const mode   = this.dataset.mode;
          const config = CONFIGS[mode];

          if (!config) {
            console.error(`[DEVICE CONFIG] Unknown mode: "${mode}"`);
            return;
          }

          // Persist and activate
          localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
          localStorage.setItem('activeSurveyType', config.defaultSurveyType);
          window.DEVICECONFIG = config;

          // Hide overlay
          overlay.style.display = 'none';

          // Restore visibility — app can now render
          document.documentElement.style.visibility = '';

          console.log(`[DEVICE CONFIG] ✅ Mode set: "${mode}" — waiting for DOM wiring`);

          // FIX B1-07b: Wait for index.js Step 1 (initializeElements()) to wire globals
          const initSurveyStateSafe = () => {
            // Explicit DOM readiness check — index.js must complete Step 1 first
            if (window.globals?.kioskStartScreen && window.__surveyStateInitialized !== true) {
              console.log('[DEVICE CONFIG] ✅ Globals wired + survey not initialized — calling _initializeSurveyState()');
              if (typeof window._initializeSurveyState === 'function') {
                window._initializeSurveyState();
              }
              return;
            }

            // Still waiting for index.js to finish initializeElements()
            console.log('[DEVICE CONFIG] ⏳ Waiting for index.js DOM wiring...');
            setTimeout(initSurveyStateSafe, 20);  // Subframe-safe poll
          };

          // Initial defer — let service worker settle + modules start loading
          setTimeout(initSurveyStateSafe, 50);
        });
      });
    }

    // Preferred path: static #device-setup-overlay already in index.html
    const existing = document.getElementById('device-setup-overlay');
    if (existing) {
      existing.style.display = 'flex';
      document.documentElement.style.visibility = '';
      attachHandlers(existing);
      return;
    }

    // Fallback: inject dynamically on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', function () {
      const overlay = document.createElement('div');
      overlay.id    = 'device-setup-overlay';
      overlay.innerHTML = `
        <div class="setup-card">
          <div class="setup-logo">
            <h1>Shayona</h1>
            <p>Select what this iPad is used for</p>
          </div>
          <div class="setup-options">
            <button class="setup-btn" data-mode="temple">
              <span class="setup-icon">🛕</span>
              <span class="setup-label">Temple</span>
              <span class="setup-desc">Visitor survey kiosk</span>
            </button>
            <button class="setup-btn" data-mode="shayona">
              <span class="setup-icon">☕</span>
              <span class="setup-label">Shayona Café</span>
              <span class="setup-desc">Café feedback kiosk</span>
            </button>
          </div>
        </div>
      `;

      document.body.insertBefore(overlay, document.body.firstChild);
      attachHandlers(overlay);

      // Now safe to show — overlay is in the DOM
      document.documentElement.style.visibility = '';
    }, { once: true });
  }

  // ── Already configured — fast path ───────────────────────────────────────
  // showSetupOverlay() is now defined above — safe to call from any branch.
  if (stored) {
    try {
      window.DEVICECONFIG = JSON.parse(stored);
    } catch (e) {
      console.warn('[DEVICE CONFIG] Corrupt stored config — clearing');
      localStorage.removeItem(STORAGE_KEY);
      window.DEVICECONFIG = null;

      // Hide document immediately before showing overlay (matches first-launch behavior).
      // FIX B1-06: This call is now safe — showSetupOverlay() is defined above.
      document.documentElement.style.visibility = 'hidden';
      showSetupOverlay();
    }
    return;
  }

  // ── First launch — block app start immediately ────────────────────────────
  window.DEVICECONFIG = null;

  // Hide <body> immediately so nothing flashes while DOM loads.
  document.documentElement.style.visibility = 'hidden';

  showSetupOverlay();

})();
