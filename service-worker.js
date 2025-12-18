const CACHE_NAME = 'kiosk-survey-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/dist/output.css',
  '/custom.css',
  '/input.css',
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
  
  // Assets
  '/asset/video/1.mp4',
  
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

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache).catch(err => {
          console.error('Cache addAll failed:', err);
        });
      })
  );
  self.skipWaiting(); // Forces the waiting service worker to become active
});

// Fetch event - Network first for API calls, Cache first for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Network first strategy for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(
            JSON.stringify({ error: 'Offline - request queued' }), 
            { 
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }
  
  // Cache first strategy for everything else
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        });
      })
      .catch(() => {
        // Return offline page or fallback
        return new Response('Offline', { status: 503 });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // Take control of all pages immediately
    })
  );
});

// Listen for messages from the client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
