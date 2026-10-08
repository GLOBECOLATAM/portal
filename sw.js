/* GLOBECO SMART · Portal — guarda la app para abrir sin internet */
const CACHE = 'gs-portal-v10';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './mark-white.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('gs-portal') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* intenta la red, pero si tarda más de 3 s (señal débil) usa la copia guardada */
function netFirst(req, key) {
  return new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(key || req).then(r => { if (!done && r) { done = true; resolve(r); } });
    const timer = setTimeout(fallback, 3000);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(key || req, cp)); }
      if (!done) { done = true; resolve(res); }
    }).catch(() => {
      clearTimeout(timer);
      caches.match(key || req).then(r => { if (!done) { done = true; resolve(r || new Response('Sin conexión', { status: 503 })); } });
    });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Sheets / Apps Script: siempre directo a la red (la app maneja la cola)
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // Páginas: red primero con respaldo local
  if (req.mode === 'navigate') { e.respondWith(netFirst(req, './index.html')); return; }

  // Archivos de la app y tipografías: copia local primero
  if (url.origin === location.origin || url.hostname.startsWith('fonts.g')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
        return res;
      }).catch(() => hit))
    );
  }
});
