import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// In packaged Electron builds, let the main process wait for the first mounted
// React paint before showing the main window. This prevents early blank-window
// exposure when ready-to-show fires before the UI skeleton is actually mounted.
if (window.electronAPI?.appRendererReady) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.electronAPI?.appRendererReady?.();
    });
  });
}
