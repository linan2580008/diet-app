// Diet App Service Worker v3
// 重要：每次发布新版本都要把 CACHE 版本号 +1，否则旧缓存不会清掉
const CACHE = 'diet-app-v3';
const ASSETS = ['./', './index.html', './chart.js', './upgrade.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // 清理旧版本缓存，保证手机端更新后能看到新版
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // 网络优先：有网时永远拿最新文件，并顺手更新缓存；
  // 离线时回退到缓存，保证 App 仍可使用。
  e.respondWith(
    fetch(e.request).then(x => {
      const copy = x.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return x;
    }).catch(() =>
      caches.match(e.request).then(r => r || caches.match('./index.html'))
    )
  );
});
