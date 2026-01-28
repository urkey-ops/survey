// FILE: api/deduplication-check.js
// PURPOSE: Server-side deduplication to prevent duplicate submissions
// VERSION: 1.0.0 - Priority Fix #1

/**
 * In-memory cache of recently processed submission IDs
 * Map<submissionId, timestamp>
 * 
 * IMPORTANT: This is in-memory only. For production at scale,
 * consider using Redis or similar persistent cache.
 */
const processedIds = new Map();

// Configuration
const DEDUP_WINDOW_MS = 300000; // 5 minutes (300,000 ms)
const CLEANUP_INTERVAL_MS = 60000; // Clean up every 1 minute
const MAX_CACHE_SIZE = 10000; // Prevent unbounded memory growth

/**
 * Start periodic cleanup of old entries
 * Call this once when server starts
 */
let cleanupInterval = null;

function startPeriodicCleanup() {
    if (cleanupInterval) return; // Already running
    
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
            console.log(`[DEDUP] Cleaned ${cleaned} old entries. Cache size: ${processedIds.size}`);
        }
        
        // Safety: If cache grows too large, clear oldest 20%
        if (processedIds.size > MAX_CACHE_SIZE) {
            console.warn(`[DEDUP] Cache exceeded ${MAX_CACHE_SIZE} - aggressive cleanup`);
            const entries = Array.from(processedIds.entries());
            entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp
            const toRemove = Math.floor(entries.length * 0.2);
            
            for (let i = 0; i < toRemove; i++) {
                processedIds.delete(entries[i][0]);
            }
            
            console.log(`[DEDUP] Removed ${toRemove} oldest entries. New size: ${processedIds.size}`);
        }
    }, CLEANUP_INTERVAL_MS);
    
    console.log('[DEDUP] Periodic cleanup started');
}

/**
 * Check if a submission ID has been processed recently
 * @param {string} submissionId - The unique submission ID
 * @returns {boolean} True if this is a duplicate
 */
export function isDuplicate(submissionId) {
    if (!submissionId) {
        console.warn('[DEDUP] No submission ID provided');
        return false; // Allow submission without ID (will be caught by validation)
    }
    
    const now = Date.now();
    
    // Check if we've seen this ID recently
    const lastProcessed = processedIds.get(submissionId);
    
    if (lastProcessed) {
        const timeSinceProcessed = now - lastProcessed;
        
        if (timeSinceProcessed < DEDUP_WINDOW_MS) {
            console.warn(`[DEDUP] 🚫 Duplicate detected: ${submissionId} (${Math.round(timeSinceProcessed / 1000)}s ago)`);
            return true;
        } else {
            // Outside window, allow reprocessing
            console.log(`[DEDUP] ID seen before but outside window: ${submissionId}`);
            processedIds.set(submissionId, now);
            return false;
        }
    }
    
    // First time seeing this ID - mark as processed
    processedIds.set(submissionId, now);
    return false;
}

/**
 * Manually mark a submission as processed
 * Use this after successful database write
 * @param {string} submissionId - The submission ID
 */
export function markAsProcessed(submissionId) {
    if (!submissionId) return;
    
    processedIds.set(submissionId, Date.now());
    console.log(`[DEDUP] Marked as processed: ${submissionId}`);
}

/**
 * Check if an ID is in the cache (without marking as duplicate)
 * @param {string} submissionId - The submission ID
 * @returns {boolean} True if ID is in cache
 */
export function isInCache(submissionId) {
    return processedIds.has(submissionId);
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export function getCacheStats() {
    const now = Date.now();
    const entries = Array.from(processedIds.values());
    
    const ages = entries.map(timestamp => now - timestamp);
    const avgAge = ages.length > 0 
        ? ages.reduce((a, b) => a + b, 0) / ages.length 
        : 0;
    
    return {
        size: processedIds.size,
        maxSize: MAX_CACHE_SIZE,
        windowMs: DEDUP_WINDOW_MS,
        avgAgeSeconds: Math.round(avgAge / 1000),
        oldestEntrySeconds: ages.length > 0 ? Math.round(Math.max(...ages) / 1000) : 0
    };
}

/**
 * Clear the entire cache (for testing or emergency)
 */
export function clearCache() {
    const size = processedIds.size;
    processedIds.clear();
    console.log(`[DEDUP] Cache cleared. Removed ${size} entries.`);
}

/**
 * Stop periodic cleanup (for testing)
 */
export function stopPeriodicCleanup() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        console.log('[DEDUP] Periodic cleanup stopped');
    }
}

// Start cleanup on module load
startPeriodicCleanup();

// Graceful shutdown
if (typeof process !== 'undefined') {
    process.on('SIGTERM', () => {
        console.log('[DEDUP] Shutting down...');
        stopPeriodicCleanup();
    });
}

// Default export
export default {
    isDuplicate,
    markAsProcessed,
    isInCache,
    getCacheStats,
    clearCache,
    stopPeriodicCleanup
};
