// FILE: config/device-config.js
// PURPOSE: First script in index.html — sets window.DEVICECONFIG before app loads
// VERSION: 1.1.7
// CHANGES FROM 1.1.6:
//   - FIX BUG-2: Removed 150ms setTimeout before _initializeSurveyState().
//     The defer was a timing hack that created a race condition on slow devices.
//     index.js now guarantees DOM wiring completes before the deviceConfigReady
//     event resolves (Path 2 / Path 3 guards handle sequencing). Calling
//     _initializeSurveyState() synchronously after dispatchEvent() is safe because
//     dispatchEvent() is synchronous — all deviceConfigReady listeners run to
//     completion before the next line executes. No polling or timers needed.
//   - FIX BUG-3: Added window.KIOSK_CONFIG.setActiveSurveyType(config.defaultSurveyType)
//     call in the setup button click handler immediately after DEVICECONFIG is set.
//     Previously the activeSurveyType key was written via localStorage.setItem() directly,
//     bypassing KIOSK_CONFIG entirely. Any module that called getActiveSurveyType() before
//     the next reload would read a stale or missing value. Now the canonical setter is used
//     so KIOSK_CONFIG's in-memory state and localStorage stay in sync from the first click.

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
          window.DEVICECONFIG = config;

          // FIX BUG-3: Use KIOSK_CONFIG.setActiveSurveyType() as the canonical
          // setter so in-memory state and localStorage stay in sync immediately.
          // Fall back to direct localStorage write if KIOSK_CONFIG is not yet
          // available (e.g. config.js loaded after this IIFE on slow devices).
          if (typeof window.KIOSK_CONFIG?.setActiveSurveyType === 'function') {
            const typeSet = window.KIOSK_CONFIG.setActiveSurveyType(config.defaultSurveyType);
            if (!typeSet) {
              console.warn(
                `[DEVICE CONFIG] KIOSK_CONFIG.setActiveSurveyType("${config.defaultSurveyType}") ` +
                `returned false — falling back to direct localStorage write`
              );
              localStorage.setItem('activeSurveyType', config.defaultSurveyType);
            }
          } else {
            // KIOSK_CONFIG not loaded yet — write directly; config.js will read on boot
            localStorage.setItem('activeSurveyType', config.defaultSurveyType);
            console.warn(
              '[DEVICE CONFIG] KIOSK_CONFIG not available yet — ' +
              'activeSurveyType written directly to localStorage'
            );
          }

          // Hide overlay
          overlay.style.display = 'none';

          // Restore visibility — app can now render
          document.documentElement.style.visibility = '';

          console.log(
            `[DEVICE CONFIG] ✅ Mode "${config.kioskMode}" (from kioskId: ${config.kioskId}) saved — triggering index.js boot`
          );

          // Trigger index.js Path 2 boot → initializeElements()
          // dispatchEvent() is synchronous — all listeners run before the next line.
          window.dispatchEvent(new CustomEvent('deviceConfigReady'));

          // FIX BUG-2: Removed 150ms setTimeout — it was a timing hack that
          // created a race on slow devices. dispatchEvent() above is synchronous;
          // index.js's onConfigReady → startApp → initialize() completes before
          // we reach this line. _initializeSurveyState() is safe to call now.
          console.log('[DEVICE CONFIG] 🔄 DOM wired — initializing survey state');
          if (typeof window._initializeSurveyState === 'function') {
            window._initializeSurveyState();
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
