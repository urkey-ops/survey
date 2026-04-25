// FILE: config/device-config.js
// PURPOSE: First script in index.html — sets window.DEVICECONFIG before app loads
// VERSION: 1.1.3
// CHANGES FROM 1.1.2:
//   - FIX B1-07: Frozen start screen race condition on first device launch
//     Replaced racey deviceConfigReady dispatch with __surveyStateInitialized guard
//     + retry loop. Uses navigationSetup.js v3.2.0 flag. Eliminates {once:true} 
//     listener attach-to-null bug. Verified against service-worker v9.8.0 comments.

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

          console.log(`[DEVICE CONFIG] ✅ Mode set: "${mode}" — initializing survey state`);

          // FIX B1-07: Safe state initialization with __surveyStateInitialized guard
          const initSurveyState = () => {
            if (window.__surveyStateInitialized) {
              console.log('[DEVICE CONFIG] ✅ Using navigationSetup.js guard — calling showStartScreen');
              window.uiHandlers?.showStartScreen?.();
              return;
            }

            if (typeof window._initializeSurveyState === 'function') {
              console.log('[DEVICE CONFIG] ✅ Found _initializeSurveyState — calling');
              window._initializeSurveyState();
              return;
            }

            if (typeof window.uiHandlers?.showStartScreen === 'function') {
              console.log('[DEVICE CONFIG] ✅ Found uiHandlers.showStartScreen — calling');
              window.uiHandlers.showStartScreen();
              return;
            }

            // Retry loop — waits for index.js/navigationSetup.js to finish boot
            console.log('[DEVICE CONFIG] ⏳ Waiting for index.js boot — retrying...');
            const checkReady = () => {
              if (window.__surveyStateInitialized && window.uiHandlers?.showStartScreen) {
                console.log('[DEVICE CONFIG] ✅ Boot complete — showStartScreen()');
                window.uiHandlers.showStartScreen();
                return;
              }
              setTimeout(checkReady, 50);
            };
            checkReady();
          };

          // Small defer to let DOM settle + let service worker stabilize
          setTimeout(initSurveyState, 50);
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
