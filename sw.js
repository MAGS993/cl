// Silver's Wallet - Service Worker
// Cache version - increment this to force cache refresh
const CACHE_NAME = 'silvers-wallet-v2';

// Files to cache on install
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// =============================================
// INSTALL - Cache core assets
// =============================================
self.addEventListener('install', function(event) {
  console.log('[SW] Installing Silver\'s Wallet Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Caching app shell');
        // Use individual adds so one failure doesn't break everything
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] Failed to cache:', url, err);
            });
          })
        );
      })
      .then(function() {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
  );
});

// =============================================
// ACTIVATE - Clean old caches
// =============================================
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating Silver\'s Wallet Service Worker...');
  event.waitUntil(
    caches.keys()
      .then(function(cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function(name) { return name !== CACHE_NAME; })
            .map(function(name) {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(function() {
        console.log('[SW] Activation complete, claiming clients');
        return self.clients.claim();
      })
  );
});

// =============================================
// FETCH - Cache-first strategy (offline-first)
// =============================================
self.addEventListener('fetch', function(event) {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (e.g. Google Fonts)
  var requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin) {
    // For Google Fonts - try network, don't cache
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response('', { status: 408, statusText: 'Offline' });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(cachedResponse) {
        if (cachedResponse) {
          // Serve from cache; update cache in background
          var fetchPromise = fetch(event.request).then(function(networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              var responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(function(cache) {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          }).catch(function() {
            // Network failed, cached already being served
          });
          return cachedResponse;
        }

        // Not in cache - fetch from network and cache
        return fetch(event.request)
          .then(function(networkResponse) {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            var responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseClone);
            });
            return networkResponse;
          })
          .catch(function() {
            // Completely offline and not cached
            if (event.request.destination === 'document') {
              return caches.match('./index.html');
            }
            return new Response(
              JSON.stringify({ error: 'Offline - no cached response' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
      })
  );
});

// =============================================
// MESSAGE - Allow manual cache clear from app
// =============================================
self.addEventListener('message', function(event) {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data && event.data.action === 'clearCache') {
    caches.delete(CACHE_NAME).then(function() {
      console.log('[SW] Cache cleared by app');
    });
  }
});
