// FILE: config/device-config.js
// PURPOSE: First script in index.html — sets window.DEVICECONFIG before app loads
// VERSION: 1.1.6
// CHANGES FROM 1.1.5:
//   - FIX Phase 1: kioskMode now parsed dynamically from kioskId via
//     kioskId.split('-')[1].toLowerCase() — no longer hardcoded in CONFIGS.
//     KIOSK-TEMPLE-001 → 'temple', KIOSK-SHAYONA-001 → 'shayona'.
//     New kiosk types (giftShop, activity) work automatically by adding
//     a CONFIGS entry with the correct kioskId — zero extra code.
//   - FIX: kioskId in CONFIGS updated to match new naming convention
//     (KIOSK-TEMPLE-001, KIOSK-SHAYONA-001) so parseModeFromKioskId()
//     returns the correct segment on first launch.
//   - UNCHANGED: All boot/overlay/dispatch/timing logic identical to v1.1.5.
//     No timing hacks. No polls. Uses existing deviceConfigReady architecture.

(function () {
  const STORAGE_KEY = 'deviceConfig';
  const stored      = localStorage.getItem(STORAGE_KEY);

  // ── KIOSK DEFINITIONS ────────────────────────────────────────────────────────
  // kioskMode is NOT set here — it is derived dynamically from kioskId
  // via parseModeFromKioskId(). Add new kiosk types by adding an entry here
  // with the correct kioskId format: KIOSK-<MODE>-<NUMBER>
  const CONFIGS = {
    temple: {
      kioskId:            'KIOSK-TEMPLE-001',
      defaultSurveyType:  'type1',
      allowedSurveyTypes: ['type1', 'type2'],
    },
    shayona: {
      kioskId:            'KIOSK-SHAYONA-001',
      defaultSurveyType:  'type3',
      allowedSurveyTypes: ['type3'],
    },
    // FUTURE: giftShop: { kioskId: 'KIOSK-GIFTSHOP-001', defaultSurveyType: 'type4', allowedSurveyTypes: ['type4'] },
    // FUTURE: activity:  { kioskId: 'KIOSK-ACTIVITY-001', defaultSurveyType: 'type5', allowedSurveyTypes: ['type5'] },
  };

  /**
   * Parse kioskMode dynamically from kioskId.
   * KIOSK-TEMPLE-001   → 'temple'
   * KIOSK-SHAYONA-001  → 'shayona'
   * KIOSK-GIFTSHOP-001 → 'giftshop'
   * Returns null if kioskId is malformed.
   */
  function parseModeFromKioskId(kioskId) {
    if (!kioskId || typeof kioskId !== 'string') return null;
    const parts = kioskId.split('-');
    if (parts.length < 2) return null;
    return parts[1].toLowerCase();
  }

  /**
   * Build the full config object from a CONFIGS entry.
   * kioskMode is always derived from kioskId — never taken from CONFIGS directly.
   */
  function buildConfig(baseConfig) {
    const kioskId   = baseConfig.kioskId;
    const kioskMode = parseModeFromKioskId(kioskId);

    if (!kioskMode) {
      console.error(`[DEVICE CONFIG] Could not parse kioskMode from kioskId: "${kioskId}"`);
    }

    return {
      kioskMode,
      kioskId,
      defaultSurveyType:  baseConfig.defaultSurveyType,
      allowedSurveyTypes: baseConfig.allowedSurveyTypes,
    };
  }

  function showSetupOverlay() {
    function attachHandlers(overlay) {
      overlay.querySelectorAll('.setup-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          const mode       = this.dataset.mode;
          const baseConfig = CONFIGS[mode];

          if (!baseConfig) {
            console.error(`[DEVICE CONFIG] Unknown mode: "${mode}"`);
            return;
          }

          // Build config with dynamic kioskMode derived from kioskId
          const config = buildConfig(baseConfig);

          // Persist and activate
          localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
          localStorage.setItem('activeSurveyType', config.defaultSurveyType);
          window.DEVICECONFIG = config;

          // Hide overlay
          overlay.style.display = 'none';

          // Restore visibility — app can now render
          document.documentElement.style.visibility = '';

          console.log(
            `[DEVICE CONFIG] ✅ Mode "${config.kioskMode}" (from kioskId: ${config.kioskId}) saved — triggering index.js boot`
          );

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

  // ── Already configured — fast path ───────────────────────────────────────────
  if (stored) {
    try {
      const parsed = JSON.parse(stored);

      // Re-derive kioskMode from kioskId on every load — ensures stored
      // configs from v1.1.5 (which had hardcoded kioskMode) stay correct.
      if (parsed.kioskId) {
        const derivedMode = parseModeFromKioskId(parsed.kioskId);
        if (derivedMode && derivedMode !== parsed.kioskMode) {
          console.log(
            `[DEVICE CONFIG] Correcting stored kioskMode: "${parsed.kioskMode}" → "${derivedMode}"`
          );
          parsed.kioskMode = derivedMode;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      }

      window.DEVICECONFIG = parsed;
    } catch (e) {
      console.warn('[DEVICE CONFIG] Corrupt stored config — clearing');
      localStorage.removeItem(STORAGE_KEY);
      window.DEVICECONFIG = null;
      document.documentElement.style.visibility = 'hidden';
      showSetupOverlay();
    }
    return;
  }

  // ── First launch — block app start immediately ────────────────────────────────
  window.DEVICECONFIG = null;
  document.documentElement.style.visibility = 'hidden';
  showSetupOverlay();

})();
