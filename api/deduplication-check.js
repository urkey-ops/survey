// FILE: api/deduplication-check.js
// PURPOSE: Server-side deduplication to prevent duplicate submissions
// VERSION: 2.0.0 - isDuplicate() is READ-ONLY; serverless-safe cleanup guard

/**
 * In-memory cache of recently processed submission IDs.
 * Map<submissionId: string, timestamp: number>
 *
 * NOTE: Resets on every serverless cold start.
 * For production-scale dedup across cold starts, add a Google Sheets ID-lookup
 * step in submit-survey.js or use Vercel KV / Redis.
 */
const processedIds = new Map();

// ── Configuration ─────────────────────────────────────────────────────────────
const DEDUP_WINDOW_MS       = 300000; // 5 minutes
const CLEANUP_INTERVAL_MS   = 60000;  // 1 minute
const MAX_CACHE_SIZE        = 10000;

let cleanupInterval = null;

// ── Cleanup ───────────────────────────────────────────────────────────────────

/**
 * Start periodic cleanup of expired entries.
 * SKIPPED on Vercel serverless (process dies after each request — interval is wasteful).
 */
function startPeriodicCleanup() {
  // BUG #3 FIX: Do not run setInterval on serverless — it never fires and
  // the SIGTERM handler fires unnecessarily on every cold start.
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    console.log('[DEDUP] Serverless environment detected — skipping periodic cleanup (inline guard active)');
    return;
  }

  if (cleanupInterval) return; // Already running (long-lived server)

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, timestamp] of processedIds.entries()) {
      if (now - timestamp > DEDUP_WINDOW_MS) {
        processedIds.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[DEDUP] Cleaned ${cleaned} expired entries. Cache size: ${processedIds.size}`);
    }

    // Safety: If cache grows too large, evict oldest 20%
    if (processedIds.size > MAX_CACHE_SIZE) {
      console.warn(`[DEDUP] Cache exceeded ${MAX_CACHE_SIZE} — aggressive cleanup`);
      const entries = Array.from(processedIds.entries());
      entries.sort((a, b) => a[1] - b[1]); // oldest first
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        processedIds.delete(entries[i][0]);
      }
      console.log(`[DEDUP] Evicted ${toRemove} oldest entries. New size: ${processedIds.size}`);
    }
  }, CLEANUP_INTERVAL_MS);

  console.log('[DEDUP] Periodic cleanup started (long-lived server mode)');
}

// ── Inline size guard (runs on every check — works on serverless too) ─────────

function inlineSizeGuard() {
  if (processedIds.size > MAX_CACHE_SIZE) {
    const entries = Array.from(processedIds.entries());
    entries.sort((a, b) => a[1] - b[1]);
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      processedIds.delete(entries[i][0]);
    }
    console.warn(`[DEDUP] Inline size guard: evicted ${toRemove} entries. Size: ${processedIds.size}`);
  }
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Check if a submission ID has been processed recently.
 *
 * BUG #1 FIX: This function is now STRICTLY READ-ONLY.
 * It NEVER writes to processedIds.
 * Call markAsProcessed() ONLY after a confirmed successful sheet append.
 *
 * @param {string} submissionId
 * @returns {boolean} true if duplicate (within DEDUP_WINDOW_MS)
 */
export function isDuplicate(submissionId) {
  if (!submissionId) {
    console.warn('[DEDUP] isDuplicate() called with no ID — allowing through');
    return false;
  }

  const now = Date.now();
  const lastProcessed = processedIds.get(submissionId);

  if (lastProcessed) {
    const age = now - lastProcessed;
    if (age < DEDUP_WINDOW_MS) {
      console.warn(`[DEDUP] 🚫 Duplicate detected: ${submissionId} (${Math.round(age / 1000)}s ago)`);
      return true;
    }
    // Outside window — allow reprocessing, but do NOT write here.
    // The caller (submit-survey.js) will call markAsProcessed() on success.
    console.log(`[DEDUP] ID outside window — allowing reprocess: ${submissionId}`);
    return false;
  }

  // First time seeing this ID — allow through. Caller marks it after success.
  return false;
}

/**
 * Mark a submission as successfully processed.
 * MUST be called by submit-survey.js AFTER a confirmed sheet append — never before.
 *
 * @param {string} submissionId
 */
export function markAsProcessed(submissionId) {
  if (!submissionId) return;
  processedIds.set(submissionId, Date.now());
  inlineSizeGuard(); // Keep cache bounded on serverless too
  console.log(`[DEDUP] ✅ Marked as processed: ${submissionId}`);
}

/**
 * Check if an ID is cached (read-only, no side effects).
 * @param {string} submissionId
 * @returns {boolean}
 */
export function isInCache(submissionId) {
  return processedIds.has(submissionId);
}

/**
 * Cache statistics for debugging.
 * @returns {Object}
 */
export function getCacheStats() {
  const now = Date.now();
  const ages = Array.from(processedIds.values()).map(ts => now - ts);
  const avgAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

  return {
    size: processedIds.size,
    maxSize: MAX_CACHE_SIZE,
    windowMs: DEDUP_WINDOW_MS,
    avgAgeSeconds: Math.round(avgAge / 1000),
    oldestEntrySeconds: ages.length > 0 ? Math.round(Math.max(...ages) / 1000) : 0,
    serverless: !!(process.env.VERCEL || process.env.VERCEL_ENV),
  };
}

/**
 * Clear the entire cache (emergency / testing).
 */
export function clearCache() {
  const size = processedIds.size;
  processedIds.clear();
  console.log(`[DEDUP] Cache cleared — removed ${size} entries`);
}

/**
 * Stop periodic cleanup (testing / graceful shutdown).
 */
export function stopPeriodicCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[DEDUP] Periodic cleanup stopped');
  }
}

// ── Module initialisation ─────────────────────────────────────────────────────

startPeriodicCleanup();

if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    console.log('[DEDUP] SIGTERM — shutting down');
    stopPeriodicCleanup();
  });
}

// ── Default export ────────────────────────────────────────────────────────────

export default {
  isDuplicate,
  markAsProcessed,
  isInCache,
  getCacheStats,
  clearCache,
  stopPeriodicCleanup,
};
