// SERVICE WORKER - OFFLINE FIRST STRATEGY (iOS 26 KIOSK SAFE)

// 🔒 Bump versions on every deploy
const CACHE_NAME = 'kiosk-survey-v2';
const RUNTIME_CACHE = 'kiosk-runtime-v2';

// Critical files that MUST be cached for offline operation
// ❗ Do NOT include large media (video) here – iOS install can fail
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

// ----------------------------
// INSTALL
// ----------------------------
self.addEventListener('install', event => {
  console.log('[SW] Installing…');

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Use allSettled so ONE bad file does not kill install (iOS safe)
      await Promise.allSettled(
        CRITICAL_CACHE.map(url => cache.add(url))
      );

      await self.skipWaiting();
      console.log('[SW] Installed');
    })()
  );
});

// ----------------------------
// ACTIVATE
// ----------------------------
self.addEventListener('activate', event => {
  console.log('[SW] Activating…');

  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME && key !== RUNTIME_CACHE) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );

      await self.clients.claim();
      console.log('[SW] Activated');
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
          // Update cache in background
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
// STALE-WHILE-REVALIDATE
// ----------------------------
function fetchAndUpdateCache(request) {
  fetch(request)
    .then(response => {
      if (response.ok) {
        caches.open(RUNTIME_CACHE).then(cache => {
          cache.put(request, response.clone());
        });
      }
    })
    .catch(() => {
      // Silent fail – kiosk already served cached version
    });
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

        const clients = await self.clients.matchAll();
        clients.forEach(client =>
          client.postMessage({ type: 'CACHE_CLEARED' })
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
