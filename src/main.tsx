import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress Vite HMR websocket connection errors in the console and overlay
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason &&
    (
      (typeof event.reason.message === 'string' && event.reason.message.includes('WebSocket closed')) ||
      (typeof event.reason === 'string' && event.reason.includes('WebSocket closed'))
    )
  ) {
    event.preventDefault();
  }
});

const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('[vite] failed to connect to websocket')) {
    return;
  }
  originalError(...args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
