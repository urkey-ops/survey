// SERVICE WORKER - OFFLINE FIRST STRATEGY (iOS KIOSK SAFE)
// VERSION: 9.8.0
// CHANGES FROM 9.7.0:
//   - BUMP: CACHE_NAME / RUNTIME_CACHE v29 → v30
//     Invalidates stale cache for files changed in the start-screen tap fix:
//       • main/navigationSetup.js (v3.2.0 — window.__surveyStateInitialized guard)
//       • main/index.js           (v5.7.1 — checks __surveyStateInitialized flag)

// 🔒 Bump versions on every deploy
const CACHE_NAME    = 'kiosk-survey-v33';
const RUNTIME_CACHE = 'kiosk-runtime-v33';
const MEDIA_CACHE   = 'kiosk-media-v1';    // unchanged — video hasn't changed

// Critical files that MUST be cached for offline operation
const CRITICAL_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',

  // Styles
  '/dist/output.css',
  '/custom.css',
  '/input.css',

  // Config + device setup
  '/config/device-config.js',
  '/config.js',
  '/appState.js',
  '/pwa-update-manager.js',
  '/adminAnalytics.js',

  // Survey data utils — both always cached (proxy guard routes at runtime)
  '/surveys/data-util.js',
  '/surveys/shayona-data-util.js',

  // Main modules
  '/main/index.js',
  '/main/adminPanel.js',
  '/main/adminState.js',
  '/main/adminUtils.js',
  '/main/adminSurveyControls.js',
  '/main/adminMaintenance.js',
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

  // UI modules - Navigation
  '/ui/navigation/core.js',
  '/ui/navigation/index.js',
  '/ui/navigation/startScreen.js',
  '/ui/navigation/submit.js',
  '/ui/navigation/videoLoopManager.js',
  '/ui/navigation/videoPlayer.js',
  '/ui/navigation/videoScheduler.js',

  // UI modules - Other
  '/ui/validation.js',
  '/uiHandlers.js',

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

// BATTERY OPTIMIZATION: Throttled background updates
const recentlyUpdated  = new Map();
const THROTTLE_MS      = 300000;    // 5 minutes
const CLEANUP_INTERVAL = 600000;    // 10 minutes
const CLEANUP_AGE      = 3600000;   // 1 hour

let cleanupStarted = false;

// ----------------------------
// INSTALL
// ----------------------------
self.addEventListener('install', event => {
  console.log('[SW] Installing v9.8 with complete module cache...');

  event.waitUntil(
    (async () => {
      const criticalCache = await caches.open(CACHE_NAME);

      const criticalResults = await Promise.allSettled(
        CRITICAL_CACHE.map(async (url) => {
          try {
            await criticalCache.add(new Request(url, { cache: 'reload' }));
            return url;
          } catch (error) {
            throw new Error(`${url} -> ${error.message}`);
          }
        })
      );

      const criticalFailed = criticalResults.filter(r => r.status === 'rejected');
      if (criticalFailed.length > 0) {
        console.warn('[SW] Some critical files failed to cache:', criticalFailed.length);
        criticalResults.forEach((result) => {
          if (result.status === 'rejected') {
            console.error('[SW] Failed to cache:', result.reason?.message || result.reason);
          }
        });
      } else {
        console.log('[SW] ✅ All critical files cached successfully');
      }

      const mediaCache = await caches.open(MEDIA_CACHE);

      const mediaResults = await Promise.allSettled(
        MEDIA_FILES.map(async (url) => {
          try {
            const response = await fetch(url, {
              mode: 'no-cors',
              cache: 'force-cache'
            });

            if (response.ok || response.type === 'opaque') {
              await mediaCache.put(url, response.clone());
              console.log('[SW] ✅ Cached video:', url);
              return url;
            }

            throw new Error(`Failed to fetch ${url}: ${response.status}`);
          } catch (error) {
            console.warn('[SW] ⚠️ Could not cache video:', url, error.message);
            return null;
          }
        })
      );

      const mediaSuccessCount = mediaResults.filter(r => r.status === 'fulfilled' && r.value).length;
      console.log(`[SW] Cached ${mediaSuccessCount}/${MEDIA_FILES.length} media files`);

      await self.skipWaiting();
      console.log('[SW] ✅ Installed v9.8 (complete module cache)');
    })()
  );
});

// ----------------------------
// ACTIVATE
// ----------------------------
self.addEventListener('activate', event => {
  console.log('[SW] Activating v9.8...');

  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME && key !== RUNTIME_CACHE && key !== MEDIA_CACHE) {
            console.log('[SW] 🗑️ Deleting old cache:', key);
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      );

      await self.clients.claim();

      startPeriodicCleanup();

      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => {
        client.postMessage({ type: 'SW_ACTIVATED', version: '9.8' });
      });

      console.log('[SW] ✅ Activated v9.8 (battery optimized, complete cache)');
    })()
  );
});

// ----------------------------
// FETCH
// ----------------------------
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Navigation — offline-safe app shell
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  // Video files — dedicated handler with media cache
  if (url.pathname.startsWith('/asset/video/')) {
    event.respondWith(handleVideoRequest(request));
    return;
  }

  // API requests — network-first, offline-aware JSON fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }

  // Same-origin app assets — cache first + throttled background refresh
  if (url.origin === self.location.origin) {
    event.respondWith(handleStaticRequest(request));
    return;
  }
});

// ----------------------------
// NAVIGATION HANDLER
// ----------------------------
async function handleNavigationRequest(request) {
  try {
    const cachedIndex = await caches.match('/index.html', { ignoreSearch: true });
    if (cachedIndex) {
      eventSafeBackgroundUpdate(new Request('/index.html'));
      return cachedIndex;
    }

    return await fetch(request);
  } catch (error) {
    console.warn('[SW] Navigation request failed, trying fallback:', error.message);

    const fallback =
      await caches.match('/index.html', { ignoreSearch: true }) ||
      await caches.match('/',           { ignoreSearch: true });

    if (fallback) return fallback;

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ----------------------------
// STATIC ASSET HANDLER
// ----------------------------
async function handleStaticRequest(request) {
  try {
    const cached = await caches.match(request, { ignoreSearch: true });

    if (cached) {
      eventSafeBackgroundUpdate(request);
      return cached;
    }

    return await fetchAndCache(request);
  } catch (error) {
    console.warn('[SW] Static request failed:', request.url, error.message);

    const fallback = await caches.match(request, { ignoreSearch: true });
    if (fallback) return fallback;

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

function eventSafeBackgroundUpdate(request) {
  fetchAndUpdateCache(request).catch(() => {
    // Silent by design
  });
}

// ----------------------------
// VIDEO HANDLER
// ----------------------------
async function handleVideoRequest(request) {
  try {
    const mediaCache = await caches.open(MEDIA_CACHE);
    const cached     = await mediaCache.match(request, { ignoreSearch: true });

    if (cached) {
      console.log('[SW] Serving video from cache');
      return cached;
    }

    console.log('[SW] Video not in cache, fetching...');
    const response = await fetch(request, { cache: 'force-cache' });

    if (response.ok || response.type === 'opaque') {
      mediaCache.put(request, response.clone()).catch(err => {
        console.warn('[SW] Could not cache video:', err);
      });
      return response;
    }

    throw new Error('Video fetch failed');
  } catch (error) {
    console.error('[SW] Video request failed:', error);

    const mediaCache = await caches.open(MEDIA_CACHE);
    const fallback   = await mediaCache.match(request, { ignoreSearch: true });

    if (fallback) {
      console.log('[SW] Serving video from fallback cache');
      return fallback;
    }

    return new Response('Video unavailable offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// ----------------------------
// API HANDLER
// ----------------------------
async function handleAPIRequest(request) {
  try {
    const response = await fetch(request);

    if (response.ok) return response;

    return new Response(
      JSON.stringify({ error: 'Server error', status: response.status, offline: false }),
      {
        status: response.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'Offline - request queued', offline: true }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }
}

// ----------------------------
// FETCH & CACHE (cold miss)
// ----------------------------
async function fetchAndCache(request) {
  const response = await fetch(request);

  if (response && (response.ok || response.type === 'opaque')) {
    const cache = await caches.open(RUNTIME_CACHE);
    try {
      await cache.put(request, response.clone());
    } catch (error) {
      console.warn('[SW] Runtime cache put failed:', request.url, error.message);
    }
  }

  return response;
}

// ----------------------------
// STALE-WHILE-REVALIDATE (BATTERY OPTIMIZED)
// ----------------------------
async function fetchAndUpdateCache(request) {
  const url      = new URL(request.url, self.location.origin);
  const cacheKey = url.origin === self.location.origin ? url.pathname : request.url;
  const lastUpdate = recentlyUpdated.get(cacheKey);
  const now      = Date.now();

  if (lastUpdate && (now - lastUpdate) < THROTTLE_MS) return;

  const response = await fetch(request);

  if (response && (response.ok || response.type === 'opaque')) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
    recentlyUpdated.set(cacheKey, now);
    console.log(`[SW] 🔋 Updated cache for ${url.pathname.substring(url.pathname.lastIndexOf('/'))}`);
  }
}

// ----------------------------
// PERIODIC CLEANUP
// ----------------------------
function startPeriodicCleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;

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
    return;
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
        recentlyUpdated.clear();

        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({ type: 'CACHE_CLEARED' });
        });
      })()
    );
    return;
  }

  if (event.data.type === 'RECACHE_VIDEO') {
    event.waitUntil(
      (async () => {
        console.log('[SW] Re-caching video...');
        const mediaCache = await caches.open(MEDIA_CACHE);

        for (const videoUrl of MEDIA_FILES) {
          try {
            await mediaCache.delete(videoUrl);
            const response = await fetch(videoUrl, { cache: 'reload' });

            if (response.ok || response.type === 'opaque') {
              await mediaCache.put(videoUrl, response.clone());
              console.log('[SW] ✅ Re-cached:', videoUrl);
            }
          } catch (error) {
            console.error('[SW] ❌ Failed to re-cache:', videoUrl, error);
          }
        }

        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach(client => {
          client.postMessage({ type: 'VIDEO_RECACHED' });
        });
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
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'BACKGROUND_SYNC' });
        });
      })
    );
  }
});
