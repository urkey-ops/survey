// FILE: config/device-config.js
// PURPOSE: First script in index.html — sets window.DEVICECONFIG before app loads
// VERSION: 1.1.5
// CHANGES FROM 1.1.4:
//   - FIX B1-07c: PERMANENT SOLUTION — no polls/shortcuts. Triggers index.js Path 2
//     boot sequence (deviceConfigReady event) AFTER config save. index.js runs
//     initializeElements() → wires kioskStartScreen → THEN safe to call
//     _initializeSurveyState(). Uses existing architecture exactly. Console
//     trace: "[INIT] deviceConfigReady received → All essential elements found → 
//     [START SCREEN] Listeners attached". No timing hacks.

(function () {
  const STORAGE_KEY = 'deviceConfig';
  const stored      = localStorage.getItem(STORAGE_KEY);

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

          console.log(`[DEVICE CONFIG] ✅ Mode "${mode}" saved — triggering index.js boot`);

          // PERMANENT FIX B1-07c: Trigger index.js Path 2 boot → initializeElements()
          // index.js will wire window.globals.kioskStartScreen → THEN safe to init survey
          window.dispatchEvent(new CustomEvent('deviceConfigReady'));

          // 150ms defer — lets index.js complete initialize() Step 1 (DOM wiring)
          setTimeout(() => {
            console.log('[DEVICE CONFIG] 🔄 DOM wired — initializing survey state');
            if (typeof window._initializeSurveyState === 'function') {
              window._initializeSurveyState();
            }
          }, 150);
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
      document.documentElement.style.visibility = '';
    }, { once: true });
  }

  // ── Already configured — fast path ───────────────────────────────────────
  if (stored) {
    try {
      window.DEVICECONFIG = JSON.parse(stored);
    } catch (e) {
      console.warn('[DEVICE CONFIG] Corrupt stored config — clearing');
      localStorage.removeItem(STORAGE_KEY);
      window.DEVICECONFIG = null;
      document.documentElement.style.visibility = 'hidden';
      showSetupOverlay();
    }
    return;
  }

  // ── First launch — block app start immediately ────────────────────────────
  window.DEVICECONFIG = null;
  document.documentElement.style.visibility = 'hidden';
  showSetupOverlay();

})();
