const CACHE = 'tlc-v13';
const STATIC = ['./index.html', './styles.css', './app.js', './mascot.jpg', './icon-192.png', './icon-512.png', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Firestore / Auth API: network-first (datos en tiempo real, nunca cachear)
  if (url.includes('firestore.googleapis.com') ||
      url.includes('securetoken.googleapis.com') ||
      url.includes('identitytoolkit.googleapis.com') ||
      url.includes('firebaseio.com')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Firebase Storage (imágenes): stale-while-revalidate
  // Sirve desde caché al instante, actualiza en segundo plano
  if (url.includes('firebasestorage.googleapis.com')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const netFetch = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached);
          return cached || netFetch;
        })
      )
    );
    return;
  }

  // Firebase SDK JS + Google Fonts archivos: cache-first (archivos versionados/inmutables)
  if (url.includes('gstatic.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // Google Fonts CSS: cache-first con actualización en fondo
  if (url.includes('fonts.googleapis.com')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const netFetch = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          });
          return cached || netFetch;
        })
      )
    );
    return;
  }

  // Todo lo demás (index.html, app.js, styles.css, icons): stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const netFetch = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || netFetch;
      })
    )
  );
});
