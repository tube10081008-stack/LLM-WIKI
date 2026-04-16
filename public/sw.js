// Service Worker - LLM Wiki Manager
// PWA 설치 요건 충족용. 로컬 개발 서버에서는 캐싱하지 않음.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// 중요: fetch 이벤트를 가로채지 않음.
// 로컬 dev 서버에서 fetch를 가로채면 Vite HMR, API 호출 등이
// 서비스 워커 컨텍스트에서 실패하여 흰 화면(white screen)이 발생함.
// PWA 설치에는 fetch 핸들러가 필수가 아님.
