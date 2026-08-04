const CACHE = 'routine-v7';
const ASSETS = ['./', './index.html', './guide.html', './styles.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];
const NET_TIMEOUT = 2500;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function keep(req, res) {
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

/* 앱 코드(html·js·css)는 네트워크를 먼저 본다 — 새로 배포한 버전이 바로 반영되도록.
   느리거나 끊기면 곧바로 캐시로 넘어가므로 오프라인에서도 그대로 열린다. */
/* 브라우저 HTTP 캐시까지 건너뛰어야 방금 배포한 파일이 잡힌다 */
const fresh = (req) =>
  fetch(new Request(req.url, { cache: 'no-store' })).then((res) => keep(req, res));

async function netFirst(req) {
  try {
    return await Promise.race([
      fresh(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), NET_TIMEOUT)),
    ]);
  } catch (_) {
    const hit = await caches.match(req);
    if (hit) return hit;
    return fresh(req);
  }
}

/* 그 외(아이콘 등)는 캐시를 먼저 쓰고 뒤에서 조용히 갱신한다 */
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) {
    fetch(req).then((res) => keep(req, res)).catch(() => {});
    return hit;
  }
  return fetch(req).then((res) => keep(req, res));
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // 유튜브 등 외부 요청은 그대로 통과시킨다 (범위 요청 · 스트리밍이 깨지지 않도록)
  if (new URL(e.request.url).origin !== self.location.origin) return;
  const path = new URL(e.request.url).pathname;
  const isShell = e.request.mode === 'navigate' || path.endsWith('/') || /\.(?:html|js|css)$/.test(path);
  e.respondWith(isShell ? netFirst(e.request) : cacheFirst(e.request));
});
