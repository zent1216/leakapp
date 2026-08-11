// 누수설비 업무관리앱 Service Worker
// PWA 설치 상태 유지 + 오프라인 대비 캐싱
const CACHE_NAME = 'leakapp-cache-v1';

// 설치: 즉시 활성화
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

// 활성화: 오래된 캐시 정리 + 즉시 제어권 획득
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// fetch: 네트워크 우선, 실패 시 캐시 (오프라인 대비)
self.addEventListener('fetch', function(event) {
  // GET 요청만 캐싱 (Firebase POST 등은 제외)
  if (event.request.method !== 'GET') return;

  // Firebase/Firestore 요청은 캐싱하지 않음 (항상 최신 데이터)
  var url = event.request.url;
  if (url.indexOf('firestore.googleapis.com') >= 0 ||
      url.indexOf('firebase') >= 0 ||
      url.indexOf('googleapis.com') >= 0 ||
      url.indexOf('gstatic.com') >= 0) {
    return; // 브라우저 기본 처리 (네트워크)
  }

  event.respondWith(
    fetch(event.request).then(function(response) {
      // 성공 응답은 캐시에 저장
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // 네트워크 실패 시 캐시에서 반환 (오프라인)
      return caches.match(event.request);
    })
  );
});
