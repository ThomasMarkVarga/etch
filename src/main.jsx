import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker caches the app shell so a print shop with bad Wi-Fi can
// still use this. Registered after load so it never competes with first paint.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unregistered service worker costs offline support and nothing else.
      // There is no telemetry here to report it to, so it stays silent.
    });
  });
}
