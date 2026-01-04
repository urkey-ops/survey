// SERVICE WORKER - OFFLINE FIRST STRATEGY (iOS 26 KIOSK SAFE)
// UPDATED: Battery optimized with throttled background updates
// VERSION: 9.0.0

// 🔒 Bump versions on every deploy
const CACHE_NAME = 'kiosk-survey-v12'; // BUMPED from v3 to v4
const RUNTIME_CACHE = 'kiosk-runtime-v12'; // BUMPED from v3 to v4
const MEDIA_CACHE = 'kiosk-media-v1'; // NEW: Separate cache for video

// Critical files that MUST be cached for offline operation
const CRITICAL_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',

  // Styles
  '/dist/output.css',
  '/custom.css',
  '/input.css',

  // Core JavaScript
  '/config.js',
  '/appState.js',
  '/data-util.js',
  '/uiHandlers.js',

  // Main modules
  '/main/index.js',
  '/main/adminPanel.js',
  '/main/navigationSetup.js',
  '/main/networkStatus.js',
  '/main/uiElements.js',
  '/main/visibilityHandler.js',

  // Sync modules
  '/sync/dataSync.js',
  '/sync/analyticsManager.js',
  '/sync/networkHandler.js',
  '/sync/queueManager.js',
  '/sync/storageUtils.js',

  // Timer modules
  '/timers/inactivityHandler.js',
  '/timers/timerManager.js',

  // UI modules
  '/ui/navigation/core.js',
  '/ui/navigation/index.js',
  '/ui/navigation/startScreen.js',
  '/ui/navigation/submit.js',
  '/ui/typewriterEffect.js',
  '/ui/validation.js',

  // Icons
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon-180x180.png',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png'
];

// Media files cached separately to prevent install failures
const MEDIA_FILES = [
  '/asset/video/1.mp4'
];

// BATTERY OPTIMIZATION: Track recently updated resources
// Map<url, timestamp> to prevent excessive background fetches
const recentlyUpdated = new Map();
const THROTTLE_MS = 300000; // 5 minutes
const CLEANUP_INTERVAL = 600000; // 10 minutes
const CLEANUP_AGE = 3600000; // 1 hour

// ----------------------------
// INSTALL
// ----------------------------
self.addEventListener('install', event => {
  console.log('[SW] Installing v9 with video caching...');

  event.waitUntil(
    (async () => {
      // Step 1: Cache critical files first (must succeed)
      const criticalCache = await caches.open(CACHE_NAME);
      
      // Use allSettled so ONE bad file does not kill install (iOS safe)
      const criticalResults = await Promise.allSettled(
        CRITICAL_CACHE.map(url => criticalCache.add(url))
      );
      
      const criticalFailed = criticalResults.filter(r => r.status === 'rejected');
      if (criticalFailed.length > 0) {
        console.warn('[SW] Some critical files failed to cache:', criticalFailed.length);
      }
      
      // Step 2: Cache media files separately (can fail without breaking install)
      const mediaCache = await caches.open(MEDIA_CACHE);
      
      const mediaResults = await Promise.allSettled(
        MEDIA_FILES.map(async (url) => {
          try {
            // Use fetch with no-cors mode for better compatibility
            const response = await fetch(url, { 
              mode: 'no-cors',
              cache: 'force-cache' 
            });
            
            if (response.ok || response.type === 'opaque') {
              await mediaCache.put(url, response);
              console.log('[SW] ✅ Cached video:', url);
              return url;
            } else {
              throw new Error(`Failed to fetch ${url}: ${response.status}`);
            }
          } catch (error) {
            console.warn('[SW] ⚠️ Could not cache video:', url, error.message);
            // Don't throw - allow install to succeed even if video caching fails
            return null;
          }
        })
      );
      
      const mediaSuccessCount = mediaResults.filter(r => r.status === 'fulfilled' && r.value).length;
      console.log(`[SW] Cached ${mediaSuccessCount}/${MEDIA_FILES.length} media files`);

      await self.skipWaiting();
      console.log('[SW] ✅ Installed v9');
    })()
  );
});

// ----------------------------
// ACTIVATE
// ----------------------------
self.addEventListener('activate', event => {
  console.log('[SW] Activating v9...');

  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      // Clean up old caches but keep current ones
      await Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME && key !== RUNTIME_CACHE && key !== MEDIA_CACHE) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );

      await self.clients.claim();
      
      // Start periodic cleanup of recentlyUpdated Map
      startPeriodicCleanup();
      
      console.log('[SW] ✅ Activated v9 (battery optimized)');
    })()
  );
});

// ----------------------------
// FETCH
// ----------------------------
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // ✅ Offline-safe navigation fallback (critical for kiosks)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(res => res || fetch(request))
    );
    return;
  }

  // Special handling for video files
  if (url.pathname.startsWith('/asset/video/')) {
    event.respondWith(handleVideoRequest(request));
    return;
  }

  // API requests (network-first, offline-aware)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }

  // Cache-first for all other GET requests
  if (request.method === 'GET') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) {
          // BATTERY OPTIMIZED: Throttled background update
          fetchAndUpdateCache(request);
          return cached;
        }
        return fetchAndCache(request);
      }).catch(() => {
        return new Response('Offline', { status: 503 });
      })
    );
  }
});

// ----------------------------
// VIDEO HANDLER
// ----------------------------
async function handleVideoRequest(request) {
  try {
    // Try media cache first (fast path for offline)
    const mediaCache = await caches.open(MEDIA_CACHE);
    const cached = await mediaCache.match(request);
    
    if (cached) {
      console.log('[SW] Serving video from cache');
      return cached;
    }
    
    // If not in cache, try to fetch
    console.log('[SW] Video not in cache, fetching...');
    const response = await fetch(request, {
      cache: 'force-cache' // Use browser cache if available
    });
    
    if (response.ok) {
      // Cache the video for next time
      const responseToCache = response.clone();
      mediaCache.put(request, responseToCache).catch(err => {
        console.warn('[SW] Could not cache video:', err);
      });
      
      return response;
    }
    
    throw new Error('Video fetch failed');
    
  } catch (error) {
    console.error('[SW] Video request failed:', error);
    
    // Last resort: try runtime cache or main cache
    const runtimeCache = await caches.open(RUNTIME_CACHE);
    const fallback = await runtimeCache.match(request);
    
    if (fallback) {
      console.log('[SW] Serving video from fallback cache');
      return fallback;
    }
    
    // Return error response
    return new Response('Video unavailable offline', { 
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// ----------------------------
// API HANDLER
// ----------------------------
async function handleAPIRequest(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      return response;
    }

    return new Response(
      JSON.stringify({
        error: 'Server error',
        status: response.status,
        offline: false
      }),
      {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch {
    return new Response(
      JSON.stringify({
        error: 'Offline - request queued',
        offline: true
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// ----------------------------
// FETCH & CACHE
// ----------------------------
async function fetchAndCache(request) {
  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }

  return response;
}

// ----------------------------
// STALE-WHILE-REVALIDATE (BATTERY OPTIMIZED)
// ----------------------------
function fetchAndUpdateCache(request) {
  const url = request.url;
  
  // BATTERY OPTIMIZATION: Only update if online
  if (!self.navigator.onLine) {
    return; // Don't attempt fetch when offline
  }
  
  // BATTERY OPTIMIZATION: Check if we updated this resource recently
  const lastUpdate = recentlyUpdated.get(url);
  const now = Date.now();
  
  if (lastUpdate && (now - lastUpdate) < THROTTLE_MS) {
    // Skip update - too soon since last update
    return;
  }
  
  // Attempt background update
  fetch(request)
    .then(response => {
      if (response.ok) {
        caches.open(RUNTIME_CACHE).then(cache => {
          cache.put(request, response.clone());
          recentlyUpdated.set(url, now);
          console.log(`[SW] 🔋 Updated cache for ${url.substring(url.lastIndexOf('/'))}`);
        });
      }
    })
    .catch(() => {
      // Silent fail – offline or network error
      // This is fine, we already served from cache
    });
}

// ----------------------------
// PERIODIC CLEANUP (BATTERY OPTIMIZATION)
// ----------------------------
function startPeriodicCleanup() {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [url, timestamp] of recentlyUpdated.entries()) {
      if (now - timestamp > CLEANUP_AGE) {
        recentlyUpdated.delete(url);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[SW] 🧹 Cleaned ${cleaned} old entries from throttle map`);
    }
  }, CLEANUP_INTERVAL);
}

// ----------------------------
// MESSAGE HANDLING
// ----------------------------
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
        
        // Clear throttle map
        recentlyUpdated.clear();

        const clients = await self.clients.matchAll();
        clients.forEach(client =>
          client.postMessage({ type: 'CACHE_CLEARED' })
        );
      })()
    );
  }
  
  // Force video re-cache
  if (event.data.type === 'RECACHE_VIDEO') {
    event.waitUntil(
      (async () => {
        console.log('[SW] Re-caching video...');
        const mediaCache = await caches.open(MEDIA_CACHE);
        
        for (const videoUrl of MEDIA_FILES) {
          try {
            await mediaCache.delete(videoUrl);
            const response = await fetch(videoUrl, { cache: 'reload' });
            if (response.ok) {
              await mediaCache.put(videoUrl, response);
              console.log('[SW] ✅ Re-cached:', videoUrl);
            }
          } catch (error) {
            console.error('[SW] ❌ Failed to re-cache:', videoUrl, error);
          }
        }
        
        const clients = await self.clients.matchAll();
        clients.forEach(client =>
          client.postMessage({ type: 'VIDEO_RECACHED' })
        );
      })()
    );
  }
});

// ----------------------------
// BACKGROUND SYNC (NO-OP ON iOS, SAFE)
// ----------------------------
self.addEventListener('sync', event => {
  if (event.tag === 'sync-surveys') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client =>
          client.postMessage({ type: 'BACKGROUND_SYNC' })
        );
      })
    );
  }
});
