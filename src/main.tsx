import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { ensureMetadata } from './db/database';
import { requestPersistentStorage } from './lib/persistentStorage.ts';
import './styles/global.css';
import { AppUiProvider } from './ui/AppUi';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

void ensureMetadata().catch(() => {
  /* IndexedDB errors are shown when the UI queries storage. */
});

void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppUiProvider>
        <App />
      </AppUiProvider>
    </BrowserRouter>
  </StrictMode>,
);
