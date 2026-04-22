// FILE: main/adminUtils.js
// PURPOSE: Shared utilities for all admin panel modules
// VERSION: 1.0.0

// ─────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────

export function trackAdminEvent(eventType, metadata = {}) {
  try {
    if (window.dataHandlers?.trackAnalytics) {
      window.dataHandlers.trackAnalytics(eventType, {
        ...metadata,
        source: 'admin_panel',
        online: navigator.onLine,
      });
    }
  } catch (error) {
    console.warn('[ADMIN UTILS] Analytics tracking failed (offline safe):', error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// VIBRATION — all 3 helpers in one place
// ─────────────────────────────────────────────────────────────

export function vibrateSuccess() {
  try { if (navigator.vibrate) navigator.vibrate([50]); } catch (_) {}
}

export function vibrateError() {
  try { if (navigator.vibrate) navigator.vibrate([100, 50, 100]); } catch (_) {}
}

export function vibrateTap() {
  try { if (navigator.vibrate) navigator.vibrate(10); } catch (_) {}
}
