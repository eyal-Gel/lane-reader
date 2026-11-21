// עבודה בלי אינטרנט באולם: קודם רשת (כדי לקבל עדכונים), ואם אין, מהמטמון
// בכל עדכון: להעלות את המספר כאן ואת APP_VERSION ב-js/views.js
const CACHE = 'lane-reader-v8';
const FILES = ['./', 'index.html', 'styles.css', 'manifest.json', 'icon.svg',
  'js/app.js', 'js/store.js', 'js/lane.js', 'js/analysis.js', 'js/views.js', 'js/learn.js', 'js/geometry.js', 'js/onboard.js'];

self.addEventListener('install', e => {
  // cache: 'reload' עוקף את המטמון של הדפדפן, כדי שהגרסה החדשה תישמר במלואה
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    // no-cache: תמיד בודקים מול השרת אם יש קובץ חדש (במקום להחזיק עותק ישן עד 10 דקות)
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
