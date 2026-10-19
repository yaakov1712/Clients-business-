// Service worker: שומר את קבצי האפליקציה כדי שתעבוד בלי אינטרנט.
// בכל שינוי בקבצים – להעלות את מספר הגרסה.
const CACHE = 'handyman-v1';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// קודם מהזיכרון (מהיר ועובד בלי קליטה), ובמקביל מעדכן מהרשת לפעם הבאה
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const key = e.request.mode === 'navigate' ? 'index.html' : e.request;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(e.request).then(r => {
      if (r.ok) cache.put(key, r.clone());
      return r;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
