const CACHE_NAME = 'dy-autoparts-v99';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js?v=2.25.14',
  '/dataClient.js',
  '/supabaseClient.js',
  '/src/index.css?v=1.2.101',
  '/assets/images/login-bg-desktop.png?v=20260523-red',
  '/assets/images/login-bg-mobile.png?v=20260523-red',
  '/imagens/icon-512-black.png',
  'https://unpkg.com/html5-qrcode',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@0,100..700;1,100..700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      self.skipWaiting();
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((asset) => cache.add(asset))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const requestUrl = new URL(url);

  if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1') {
    event.respondWith(fetch(event.request));
    return;
  }
  
  if (url.includes('google.com') || url.includes('googleusercontent.com') || url.includes('supabase')) {
    return;
  }

  if (event.request.mode === 'navigate' || requestUrl.pathname === '/') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  
  if (url.includes('/app.js') || url.includes('/dataClient.js') || url.includes('/supabaseClient.js') || url.includes('/index.css') || url.includes('index.html')) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});

