// Alva entry point.
import { App } from './core/app.js';

function boot() {
  try {
    const app = new App();
    app.start();
    // Handy for debugging from the console.
    window.alva = app;
  } catch (err) {
    console.error('[Alva] Failed to start', err);
    const fallback = document.getElementById('boot-error');
    if (fallback) fallback.hidden = false;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
