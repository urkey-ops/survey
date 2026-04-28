// FILE: sync/storageUtils.js
// PURPOSE: Local storage utilities with error handling
// VERSION: 1.0.1
// CHANGES FROM 1.0.0:
//   - FIX B5-01: checkStorageQuota() was declared AFTER export default {}
//     which excluded it from window.dataHandlers (called via default export).
//     Moved above export default and added to default export object.
//     Named import in dataSync.js was unaffected — default consumers were broken.
// DEPENDENCIES: window.CONSTANTS

/**
 * Generates a unique UUID for each survey submission
 * @returns {string} UUID v4 format string
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Display error message to user (non-intrusive)
 * @param {string} message - Error message to display
 */
export function showUserError(message) {
  const syncStatusMessage = window.globals?.syncStatusMessage;
  if (syncStatusMessage) {
    syncStatusMessage.textContent = `⚠️ ${message}`;
    syncStatusMessage.style.color = '#dc2626'; // red-600

    // Auto-clear after 10 seconds
    setTimeout(() => {
      if (syncStatusMessage.textContent.includes(message)) {
        syncStatusMessage.textContent = '';
        syncStatusMessage.style.color = '';
      }
    }, 10000);
  }
}

/**
 * Safely write to localStorage with error handling
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON stringified)
 * @returns {boolean} Success status
 */
export function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`[STORAGE] Failed to write key '${key}':`, e.message);


    // After:
if (e.name === 'QuotaExceededError') {
  showUserError('Storage limit reached. Please sync data or contact support.');
  // Persistent flag — admin panel reads this and shows a permanent banner
  try {
    localStorage.setItem('kioskStorageAlert', JSON.stringify({
      flaggedAt: new Date().toISOString(),
      context: key,
    }));
  } catch (_) {
    console.error('[STORAGE] 🚨 CRITICAL: Cannot write storage alert flag — storage completely full');
  }
}



/**
 * Safely read from localStorage with error handling
 * @param {string} key - Storage key
 * @returns {*|null} Parsed value or null if not found/error
 */
export function safeGetLocalStorage(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error(`[STORAGE] Failed to read key '${key}':`, e.message);
    return null;
  }
}

/**
 * Update sync status message in admin panel
 * @param {string} message - Status message to display
 */
export function updateSyncStatus(message) {
  const syncStatusMessage = window.globals?.syncStatusMessage;
  if (syncStatusMessage) {
    syncStatusMessage.textContent = message;
    syncStatusMessage.style.color = ''; // Reset to default
  }
}

/**
 * Check localStorage quota usage
 * Warns if approaching iOS Safari limit (~5-10 MB)
 * @returns {{ status: string, usedMB: string, percentUsed: string, quotaMB: number }}
 */
export function checkStorageQuota() {
  try {
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length + key.length;
      }
    }

    const usedKB           = (totalSize / 1024).toFixed(2);
    const usedMB           = (totalSize / 1024 / 1024).toFixed(2);
    const estimatedLimitMB = 7; // Conservative iOS Safari limit
    const quotaMB          = estimatedLimitMB;
    const percentUsed      = ((totalSize / (estimatedLimitMB * 1024 * 1024)) * 100).toFixed(1);

    console.log(`[STORAGE] Using ${usedMB} MB (${usedKB} KB) — ${percentUsed}% of ~${estimatedLimitMB}MB limit`);

    if (percentUsed > 80) {
      console.error(`🚨 [STORAGE CRITICAL] ${percentUsed}% used — Clear data or increase sync frequency!`);
      return { status: 'critical', usedMB, quotaMB, percentUsed };
    } else if (percentUsed > 60) {
      console.warn(`⚠️ [STORAGE WARNING] ${percentUsed}% used — Monitor closely`);
      return { status: 'warning', usedMB, quotaMB, percentUsed };
    }

    return { status: 'healthy', usedMB, quotaMB, percentUsed };
  } catch (e) {
    console.error('[STORAGE] Could not check quota:', e);
    return { status: 'unknown', usedMB: '0', quotaMB: 7, percentUsed: '0' };
  }
}

// FIX B5-01: checkStorageQuota must be declared above this line
// so it can be included in the default export object.
export default {
  generateUUID,
  safeSetLocalStorage,
  safeGetLocalStorage,
  showUserError,
  updateSyncStatus,
  checkStorageQuota,  // ← ADDED — was missing, broke window.dataHandlers.checkStorageQuota
};
