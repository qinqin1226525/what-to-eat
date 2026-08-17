// ============ 今天吃什么 - Service Worker ============
// 目的：iPhone PWA / Safari 强缓存导致新版本下不来
// 策略：network-first（永远先拿新版）+ 缓存兜底（离线可用）
// 升级方式：改 VERSION 常量即可，下次打开自动激活新版
const VERSION = 'v14.3.1';  // bump: 修复冰箱 INGREDIENT_SYNONYMS 缺失 bug，让旧 SW 失效
const CACHE_NAME = `what-to-eat-${VERSION}`;

const ASSETS = [
  './',
  './app.html',
  './index.html',
  './dishes.json',
  './test_what_to_eat.py',
  './test.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // 强制立即激活新 SW（不等待旧 SW 的 tab 关闭）
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // 删除所有旧版本缓存
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  // 立即接管所有 open 客户端（不等刷新）
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // network-first：每次都问网络拿最新版；离线时 fallback 到缓存
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // 把新响应存进缓存（仅成功的 GET）
        if (e.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});