// Alva entry point.
import { App } from './core/app.js';
import { ScreenGuard } from './core/screen-guard.js';
import { WebAppInstall } from './core/web-app-install.js';
import { NativeShell } from './core/native-shell.js';

function boot() {
  // Inside a native app, what the app adds to the page (links opened in the
  // player's browser, F11 for fullscreen); in a browser, nothing.
  try {
    new NativeShell(window, document).start();
  } catch (err) {
    console.error('[Alva] The native app\'s additions failed to start', err);
  }
  // The installation offer and the small-screen block come first, on their
  // own: the block works even if the game itself fails to start.
  let install = null;
  let screenGuard = null;
  try {
    install = new WebAppInstall(window);
    screenGuard = new ScreenGuard({ win: window, doc: document, install }).start();
  } catch (err) {
    console.error('[Alva] The screen-size check failed to start', err);
  }
  try {
    const app = new App({ install, screenGuard });
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
