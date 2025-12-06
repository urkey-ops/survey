// Service Worker for Kiosk Survey PWA
// Version 2.0.0 - Minimal icon set (9 icons only)

const CACHE_NAME = 'kiosk-survey-v2.0.0';
const OFFLINE_URL = '/offline.html';

// Files to cache immediately on install
// Updated to only include icons you actually have
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  
  // CSS - Your actual Tailwind output
  '/dist/output.css',
  
  // JavaScript - Your actual JS files (in order)
  '/config.js',
  '/appState.js',
  '/dataSync.js',
  '/data-util.js',
  '/kioskUI.js',
  '/main.js',
  
  // PWA Manifest
  '/manifest.json',
  
  // Video (optional - comment out if too large)
  '/asset/video/1.mp4',
  
  // Icons - ONLY the ones you have
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  
  // iOS Icon
  '/icons/apple-touch-icon-180x180.png',
  
  // Favicons
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png'
];

// Install event - cache files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v2.0.0...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        
        // Cache files one by one to handle failures gracefully
        return Promise.allSettled(
          PRECACHE_URLS.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache ${url}:`, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Service worker installed successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v2.0.0...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip chrome-extension and other non-http requests
  if (!request.url.startsWith('http')) {
    return;
  }

  // API REQUESTS - Network first, cache fallback
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch((error) => {
          console.log('[SW] API request failed, trying cache:', request.url);
          // Fallback to cache if network fails
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                console.log('[SW] Serving API from cache:', request.url);
                return cachedResponse;
              }
              // If no cache, return error response
              return new Response(
                JSON.stringify({ 
                  error: 'Offline', 
                  message: 'No network connection and no cached data available' 
                }),
                { 
                  status: 503,
                  statusText: 'Service Unavailable',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
        })
    );
    return;
  }

  // STATIC ASSETS - Cache first, network fallback
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version immediately
          console.log('[SW] Serving from cache:', request.url);
          
          // Update cache in background (stale-while-revalidate strategy)
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
          }).catch(() => {
            // Network fetch failed, but we already have cached version
          });
          
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Don't cache non-200 responses or non-basic responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone and cache the response
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });

            return response;
          })
          .catch((error) => {
            console.error('[SW] Fetch failed for:', request.url, error);
            
            // Show offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match(OFFLINE_URL)
                .then((offlineResponse) => {
                  if (offlineResponse) {
                    return offlineResponse;
                  }
                  // Fallback if offline page not cached
                  return new Response(
                    '<h1>Offline</h1><p>No internet connection and offline page not available.</p>',
                    { 
                      status: 503,
                      statusText: 'Service Unavailable',
                      headers: { 'Content-Type': 'text/html' }
                    }
                  );
                });
            }
            
            // For other resource types, return error
            return new Response('Network error', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// BACKGROUND SYNC - Sync data when connection restored
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-survey-data') {
    event.waitUntil(
      // Notify all clients to trigger sync
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'BACKGROUND_SYNC',
            action: 'sync-data'
          });
        });
        console.log('[SW] Sync message sent to', clients.length, 'client(s)');
      })
    );
  }
  
  if (event.tag === 'sync-analytics-data') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'BACKGROUND_SYNC',
            action: 'sync-analytics'
          });
        });
      })
    );
  }
});

// PUSH NOTIFICATIONS (Optional - for admin alerts)
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let options = {
    body: 'Survey data synced successfully',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    tag: 'kiosk-survey-notification',
    requireInteraction: false
  };
  
  // Parse push data if available
  if (event.data) {
    try {
      const data = event.data.json();
      options.body = data.message || options.body;
      options.data = data;
    } catch (e) {
      options.body = event.data.text();
    }
  }
  
  event.waitUntil(
    self.registration.showNotification('Kiosk Survey', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();
  
  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if available
        for (let client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if no existing window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// MESSAGE HANDLING - Communication with main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  // Handle skip waiting command
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Handle cache clear command
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        console.log('[SW] All caches cleared');
        // Notify client
        event.ports[0].postMessage({ success: true });
      })
    );
  }
  
  // Handle manual sync trigger
  if (event.data && event.data.type === 'TRIGGER_SYNC') {
    if ('sync' in self.registration) {
      event.waitUntil(
        self.registration.sync.register('sync-survey-data')
          .then(() => {
            console.log('[SW] Manual sync registered');
            event.ports[0].postMessage({ success: true });
          })
          .catch((error) => {
            console.error('[SW] Manual sync failed:', error);
            event.ports[0].postMessage({ success: false, error: error.message });
          })
      );
    }
  }
});

// ERROR HANDLING
self.addEventListener('error', (event) => {
  console.error('[SW] Service worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});

// Log service worker startup
console.log('[SW] Service worker script loaded - Version 2.0.0 (Minimal icons)');
console.log('[SW] Cache name:', CACHE_NAME);
console.log('[SW] Files to cache:', PRECACHE_URLS.length);
