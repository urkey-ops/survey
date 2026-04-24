// config/device-config.js — MUST be the first script in index.html

(function () {
  const STORAGE_KEY = 'deviceConfig';
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    // Already configured — set and continue
    window.DEVICECONFIG = JSON.parse(stored);
    return;
  }

  // No config found — show setup screen before app loads
  window.DEVICECONFIG = null;

  document.addEventListener('DOMContentLoaded', function () {
    const overlay = document.createElement('div');
    overlay.id = 'device-setup-overlay';
    overlay.innerHTML = `
      <div class="setup-card">
        <div class="setup-logo">
          <!-- Your org logo/name here -->
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
    document.body.appendChild(overlay);

    const CONFIGS = {
      temple: {
        kioskMode: 'temple',
        kioskId: 'KIOSK-GWINNETT-001',
        defaultSurveyType: 'type1',
        allowedSurveyTypes: ['type1', 'type2'],
      },
      shayona: {
        kioskMode: 'shayona',
        kioskId: 'KIOSK-CAFE-001',
        defaultSurveyType: 'type3',
        allowedSurveyTypes: ['type3'],
      },
    };

    overlay.querySelectorAll('.setup-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const mode = this.dataset.mode;
        const config = CONFIGS[mode];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        window.DEVICECONFIG = config;
        overlay.remove();

        // Re-initialize the app now that config is set
        window.dispatchEvent(new CustomEvent('deviceConfigReady'));
      });
    });
  });
})();
