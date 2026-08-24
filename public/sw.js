const CACHE_NAME = 'dy-autoparts-v269';

// Pre-cache sem query strings; o match usa ignoreSearch para funcionar
// independentemente da versao usada pelo index.html
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/dataClient.js',
  '/purchasePlanning.js',
  '/supabaseClient.js',
  '/timeUtils.js',
  '/src/index.css',
  '/src/purchasePlanning.css',
  '/assets/fontes/FjallaOne-Regular.ttf',
  '/assets/fontes/Oswald-Regular.ttf',
  '/assets/fontes/Oswald-Medium.ttf',
  '/assets/fontes/Oswald-SemiBold.ttf',
  '/assets/fontes/Oswald-Bold.ttf',
  '/assets/fontes/PTSansNarrow-Regular.ttf',
  '/assets/fontes/PTSansNarrow-Bold.ttf',
  '/assets/fontes/Jost-VariableFont_wght.ttf',
  '/assets/fontes/BebasNeue-Regular.ttf',
  '/assets/fontes/RobotoCondensed-VariableFont_wght.ttf',
  '/assets/fontes/RobotoMono-VariableFont_wght.ttf',
  '/assets/images/login-bg-desktop-claro.webp',
  '/assets/images/login-bg-desktop-escuro.webp',
  '/assets/images/login-bg-mobile-claro.webp',
  '/assets/images/login-bg-mobile-escuro.webp',
  '/assets/images/logo/logo_dybranco_app.png',
  '/assets/images/logo/logo_dypreto_app.png',
  '/manifest.json',
  '/version.json',
  '/assets/images/logo/maskable_icon_preto.png',
  '/assets/images/logo/maskable_icon_preto_x192.png',
  '/assets/images/logo/maskable_icon_preto_x384.png',
  '/assets/images/logo/maskable_icon_preto_x512.png',
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
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const forceRefresh = event.request.cache === 'reload' || event.request.cache === 'no-cache';

  // Ctrl+F5/recarregamento forte deve ignorar inclusive o cache do service worker.
  if (forceRefresh && isSameOrigin) {
    event.respondWith(
      fetch(new Request(event.request, { cache: 'no-store' })).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)));
        }
        return response;
      })
    );
    return;
  }

  // Bypass total para desenvolvimento local
  if (requestUrl.hostname === 'localhost' || requestUrl.hostname === '127.0.0.1' || requestUrl.hostname === '::1') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Bypass total para APIs externas (Google Sheets, Supabase)
  if (url.includes('google.com') || url.includes('googleusercontent.com') || url.includes('supabase')) {
    return;
  }

  // Network-first para navegacao (HTML)
  if (event.request.mode === 'navigate' || requestUrl.pathname === '/') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // Network-first para arquivos principais da aplicacao
  if (url.includes('/app.js') || url.includes('/dataClient.js') || url.includes('/purchasePlanning.js') || url.includes('/supabaseClient.js') || url.includes('/timeUtils.js') || url.includes('/index.css') || url.includes('/purchasePlanning.css') || url.includes('/version.json') || url.includes('index.html')) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }
  // Stale-while-revalidate: exibe imagens rapidamente e atualiza o cache ao fundo.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
