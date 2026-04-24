// FILE: config/device-config.js
// PURPOSE: First script in index.html — sets window.DEVICECONFIG before app loads
// VERSION: 1.1.1
// CHANGES FROM 1.1.0:
//   - FIX: Corrupt stored config recovery now hides document immediately before
//     re-showing setup overlay, preventing a possible app flash behind the overlay.
//   - All first-launch, static overlay, and initializeSurveyState behavior preserved.

(function () {
  const STORAGE_KEY = 'deviceConfig';
  const stored      = localStorage.getItem(STORAGE_KEY);

  // ── Already configured — fast path ───────────────────────────────────────
  if (stored) {
    try {
      window.DEVICECONFIG = JSON.parse(stored);
    } catch (e) {
      console.warn('[DEVICE CONFIG] Corrupt stored config — clearing');
      localStorage.removeItem(STORAGE_KEY);
      window.DEVICECONFIG = null;

      // FIX v1.1.1:
      // Match true first-launch behavior so the app cannot briefly flash
      // behind the setup overlay during corrupt-config recovery.
      document.documentElement.style.visibility = 'hidden';

      showSetupOverlay();
    }
    return;
  }

  // ── First launch — block app start immediately ────────────────────────────
  window.DEVICECONFIG = null;

  // Hide <body> immediately so nothing flashes while DOM loads.
  // Removed after user picks a mode or if overlay not needed.
  document.documentElement.style.visibility = 'hidden';

  showSetupOverlay();

  // ── Setup overlay logic ───────────────────────────────────────────────────

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

          // Trigger survey state init — index.js deferred this on first launch;
          // overlay confirm handler is responsible for calling it.
          if (typeof window._initializeSurveyState === 'function') {
            window._initializeSurveyState();
          } else if (typeof window.uiHandlers?.showStartScreen === 'function') {
            window.uiHandlers.showStartScreen();
          } else {
            // Last resort — dispatch event so index.js can react
            window.dispatchEvent(new CustomEvent('deviceConfigReady'));
          }
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

})();
