// FILE: config/device-config.js
// PURPOSE: First script in index.html — sets window.DEVICECONFIG before app loads
// VERSION: 1.1.8
// CHANGES FROM 1.1.7:
//   - FIX V1 (partial): Added a 500ms poll after dispatchEvent() as a last-resort
//     fallback in case window._initializeSurveyState is still undefined at call time
//     (ES module not yet executed). Primary fix is the deviceConfigReady listener
//     added at the bottom of navigationSetup.js. This poll is belt-and-suspenders.
//   - FIX S3: In the KIOSK_CONFIG-not-available fallback branch, added a setInterval
//     poll to apply setActiveSurveyType() once KIOSK_CONFIG loads during the current
//     session. Previously the direct localStorage.setItem() persisted the value for
//     the next boot but left in-memory KIOSK_CONFIG state stale for the current session.

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

          // Use KIOSK_CONFIG.setActiveSurveyType() as the canonical setter so
          // in-memory state and localStorage stay in sync immediately.
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
            // FIX S3: KIOSK_CONFIG not loaded yet — write directly so config.js
            // finds the value on next boot, then poll to sync in-memory state
            // for the current session once KIOSK_CONFIG becomes available.
            localStorage.setItem('activeSurveyType', config.defaultSurveyType);
            console.warn(
              '[DEVICE CONFIG] KIOSK_CONFIG not available yet — ' +
              'activeSurveyType written directly to localStorage'
            );

            const _type = config.defaultSurveyType;
            const _poll = setInterval(() => {
              if (typeof window.KIOSK_CONFIG?.setActiveSurveyType === 'function') {
                clearInterval(_poll);
                window.KIOSK_CONFIG.setActiveSurveyType(_type);
                console.log('[DEVICE CONFIG] ✅ In-memory KIOSK_CONFIG synced after late load');
              }
            }, 50);
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

          // dispatchEvent() above is synchronous; index.js's onConfigReady →
          // startApp → initialize() completes before we reach this line.
          // _initializeSurveyState() is safe to call now if the ES module has
          // already executed and assigned it to window.
          console.log('[DEVICE CONFIG] 🔄 DOM wired — initializing survey state');
          if (typeof window._initializeSurveyState === 'function') {
            window._initializeSurveyState();
          } else {
            // FIX V1: navigationSetup.js (ES module) may not have executed yet —
            // its own deviceConfigReady listener is the primary fallback.
            // This poll is a last-resort safety net in case that listener also
            // missed the event (e.g. module execution delayed beyond this tick).
            console.warn(
              '[DEVICE CONFIG] window._initializeSurveyState not yet defined — ' +
              'starting poll (primary fallback: navigationSetup.js listener)'
            );
            const _initPoll = setInterval(() => {
              if (typeof window._initializeSurveyState === 'function') {
                clearInterval(_initPoll);
                if (!window.__surveyStateInitialized) {
                  console.log('[DEVICE CONFIG] ✅ _initializeSurveyState resolved via poll — calling now');
                  window._initializeSurveyState();
                } else {
                  console.log('[DEVICE CONFIG] ✅ _initializeSurveyState resolved via poll — already initialized, skipping');
                }
              }
            }, 50);
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
