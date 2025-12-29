// File: service-worker.js
// STRATEGI BARU: NETWORK-FIRST (ANTI-CACHE "BANDEL")

// Versi cache baru, pastikan namanya BEDA dari yang lama
const CACHE_NAME = 'nabati-cuan-v3.2-final';

// Daftar file inti yang HARUS di-cache agar aplikasi bisa jalan offline
// (Ini hanya untuk install pertama kali)
const URLS_TO_CACHE = [
  '/',
  'index.html',
  'style.css',
  'app.js',
  'js/helpers.js',
  'js/calculator.js',
  'js/store.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js',
  'manifest.json'
  // 'images/icon-192.png', (jika Anda sudah punya)
  // 'images/icon-512.png' (jika Anda sudah punya)
];

// 1. Event 'install' - Menyimpan aset ke cache
self.addEventListener('install', event => {
  console.log('[ServiceWorker V3] Menginstal...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker V3] Cache dibuka, menyimpan file inti...');
        // addAll akan gagal jika salah satu file 404
        return cache.addAll(URLS_TO_CACHE.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => self.skipWaiting()) // Aktifkan service worker baru segera
  );
});

// 2. Event 'activate' - Membersihkan cache LAMA
self.addEventListener('activate', event => {
  console.log('[ServiceWorker V3] Mengaktifkan...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker V3] Membersihkan cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Ambil alih kontrol halaman
  );
});

// 3. Event 'fetch' - (STRATEGI BARU: NETWORK-FIRST)
self.addEventListener('fetch', event => {
  // Hanya proses request GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Strategi Network-First (Online-First)
  // Selalu coba ambil dari jaringan dulu.
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      // 1. Coba ambil dari Jaringan (Network)
      return fetch(event.request).then(networkResponse => {
        // 2. Berhasil! Simpan ke cache dan kirim ke aplikasi
        cache.put(event.request, networkResponse.clone());
        return networkResponse;
      }).catch(() => {
        // 3. Jaringan Gagal! (Offline)
        // Coba ambil salinan terakhir dari Cache
        console.warn(`[ServiceWorker V3] Jaringan gagal. Mengambil dari Cache: ${event.request.url}`);
        return cache.match(event.request);
      });
    })
  );
});