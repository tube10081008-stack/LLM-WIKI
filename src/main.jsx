import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// 기존에 등록된 서비스 워커가 있으면 해제 후 재등록.
// 이전 버전의 SW가 fetch를 가로채서 흰 화면을 유발했으므로,
// 반드시 기존 워커를 먼저 정리합니다.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
      // 깨끗한 상태에서 새 SW 등록
      await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.warn('ServiceWorker setup:', error);
    }
  });
}
