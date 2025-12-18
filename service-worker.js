// SERVICE WORKER - OFFLINE FIRST STRATEGY
const CACHE_NAME = 'kiosk-survey-v1';
const RUNTIME_CACHE = 'kiosk-runtime-v1';

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
  
  // Sync modules (critical for offline-first)
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
  
  // Assets
  '/asset/video/1.mp4',
  
  // Icons (essential for PWA)
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

// Install event - Aggressive caching for offline-first
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching critical resources');
        return cache.addAll(CRITICAL_CACHE);
      })
      .then(() => {
        console.log('[SW] All critical resources cached');
        return self.skipWaiting(); // Activate immediately
      })
      .catch(error => {
        console.error('[SW] Cache installation failed:', error);
      })
  );
});

// Activate event - Clean old caches and take control
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all pages immediately
      self.clients.claim()
    ]).then(() => {
      console.log('[SW] Service worker activated and ready');
    })
  );
});

// Fetch event - OFFLINE FIRST strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Handle API calls specially (Background Sync pattern)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(event.request));
    return;
  }
  
  // For all other requests: Cache First, Network Fallback
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Found in cache - return immediately
          console.log('[SW] Serving from cache:', url.pathname);
          
          // Update cache in background (stale-while-revalidate)
          fetchAndUpdateCache(event.request);
          
          return cachedResponse;
        }
        
        // Not in cache - fetch from network and cache it
        return fetchAndCache(event.request);
      })
      .catch(error => {
        console.error('[SW] Fetch failed for:', url.pathname, error);
        return new Response('Offline - Resource not available', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

/**
 * Handle API requests - Always try network, queue if offline
 */
async function handleAPIRequest(request) {
  try {
    // Try network first for API calls
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      return networkResponse;
    }
    
    // Server error - return error response
    return new Response(
      JSON.stringify({ 
        error: 'Server error', 
        status: networkResponse.status,
        offline: false
      }), 
      { 
        status: networkResponse.status,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    // Network failed - return offline indicator
    console.log('[SW] API call failed - Device offline');
    return new Response(
      JSON.stringify({ 
        error: 'Offline - request will be queued',
        offline: true
      }), 
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Fetch from network and add to cache
 */
async function fetchAndCache(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Only cache successful GET requests
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('[SW] Network fetch failed:', error);
    throw error;
  }
}

/**
 * Update cache in background (don't wait for response)
 */
function fetchAndUpdateCache(request) {
  if (request.method !== 'GET') return;
  
  fetch(request)
    .then(response => {
      if (response.ok) {
        caches.open(RUNTIME_CACHE)
          .then(cache => cache.put(request, response));
      }
    })
    .catch(() => {
      // Silently fail - we already served from cache
    });
}

// Listen for messages from the app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }).then(() => {
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'CACHE_CLEARED' });
          });
        });
      })
    );
  }
});

// Background Sync (when browser supports it)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-surveys') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'BACKGROUND_SYNC' });
        });
      })
    );
  }
});
