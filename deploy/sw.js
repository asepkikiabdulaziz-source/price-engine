// Service Worker for Offline Functionality (Network-First Strategy)
const CACHE_NAME = 'price-engine-v6';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/auth.js',
    '/database.js',
    '/calculation.js',
    '/validation.js',
    '/logger.js',
    '/env.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
];

// Helper function to create error response
function createErrorResponse(status = 404, statusText = 'Not Found') {
    return new Response('', {
        status: status,
        statusText: statusText,
        headers: { 'Content-Type': 'text/plain' }
    });
}

// Helper function to safely get cached response or return error
async function getCachedOrError(url) {
    const cached = await caches.match(url);
    return cached || createErrorResponse(404, 'Not Found in Cache');
}

// Install event - cache resources
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching files');
                // Use Promise.allSettled to handle individual failures gracefully
                return Promise.allSettled(
                    urlsToCache.map(url => 
                        cache.add(url).catch(err => {
                            console.warn(`Service Worker: Failed to cache ${url}:`, err);
                            return null; // Continue even if one file fails
                        })
                    )
                );
            })
            .catch((error) => {
                console.error('Service Worker: Cache failed', error);
            })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Claim clients immediately after cleanup to take control of pages
            return self.clients.claim();
        })
    );
});

// Fetch event - Network First strategy (try network, fallback to cache)
self.addEventListener('fetch', (event) => {
    // Skip service worker for non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        (async () => {
            try {
                // Try network first for better freshness
                try {
                    const networkResponse = await fetch(event.request);
                    
                    // Cache successful responses (including JS files for offline support)
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        // Clone response before caching (response can only be consumed once)
                        const responseToCache = networkResponse.clone();
                        
                        // Cache in background (don't wait)
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache).catch(err => {
                                console.warn('Service Worker: Failed to cache response:', err);
                            });
                        });
                    }
                    
                    return networkResponse;
                } catch (fetchError) {
                    // Network fetch failed - try cache as fallback
                    // Only log warnings for non-critical resources
                    const url = new URL(event.request.url);
                    const isCriticalResource = url.pathname.endsWith('.html') || 
                                              url.pathname.endsWith('.js') || 
                                              url.pathname.endsWith('.css');
                    
                    if (isCriticalResource) {
                        console.warn('Service Worker: Fetch failed for', event.request.url, fetchError);
                    }
                    
                    const cachedResponse = await caches.match(event.request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // For document requests, try to return cached index.html
                    if (event.request.destination === 'document' || 
                        event.request.mode === 'navigate') {
                        const indexCached = await caches.match('/index.html');
                        if (indexCached) {
                            return indexCached;
                        }
                    }
                    
                    // For all other requests, return error response
                    return createErrorResponse(404, 'Not Found');
                }
            } catch (error) {
                // Top-level error handler - should never reach here, but just in case
                console.error('Service Worker: Unexpected error in fetch handler:', error);
                
                // Try to return cached index.html for document requests
                if (event.request.destination === 'document' || 
                    event.request.mode === 'navigate') {
                    try {
                        const indexCached = await caches.match('/index.html');
                        if (indexCached) {
                            return indexCached;
                        }
                    } catch (cacheError) {
                        console.error('Service Worker: Failed to get cached index.html:', cacheError);
                    }
                }
                
                // Return error response as last resort
                return createErrorResponse(500, 'Internal Server Error');
            }
        })()
    );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
