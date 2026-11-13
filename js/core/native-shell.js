// Where Alva runs: in one of its native apps or in a browser. The native
// apps (docs/development/native-apps.md) wrap the very same release the
// itch.io page plays (dist/itch, built by tools/itch/build.mjs), nothing
// forked: the desktop apps for Windows, macOS and Linux in a Tauri window
// (src-tauri/), the Android app in a Capacitor WebView (android/). This is
// the one place the game asks which, so whatever a native app does
// differently goes through here, and a browser (itch.io's page, a copy
// served from a computer, GitHub Pages) behaves exactly as before:
//
//   - nothing offers to install Alva (Home's Download, the small-screen
//     block's Download Alva): it already is (`isNativeApp`);
//   - it counts as an installed app (runningInstalled in
//     js/core/web-app-install.js): the installed app's screen minimum, and
//     the landscape lock asked for at once, never through fullscreen;
//   - links to elsewhere (the Releases page, the credits) open in the
//     player's own browser (`openExternal`), never inside the app;
//   - on a computer, F11 puts the window in and out of fullscreen
//     (`NativeShell.start`), as a browser's own F11 does;
//   - Online play says how to update when the room server plays a newer
//     version: a button to the Releases page (RELEASES_URL) in the apps,
//     reload the page in a browser (js/screens/online-screens.js).
//
// There is no service worker anywhere (js/core/web-app-install.js), so
// nothing of one is skipped. Everything else is identical: the same game,
// the same saves (kept by each app's own webview between launches, under
// its own address: docs/development/native-apps.md) and the same rules.
//
// How a shell is recognized: what it puts on the page before the game
// runs. Tauri v2 always injects __TAURI_INTERNALS__ (and, with the app's
// withGlobalTauri, the __TAURI__ API this uses); Capacitor's Android bridge
// injects window.Capacitor, whose isNativePlatform() is true inside the
// app. Nothing here imports either: the game stays plain modules with no
// dependencies, and a browser has neither.

// Where every installer of the newest release is (the native apps' update
// button, docs/development/native-apps.md).
export const RELEASES_URL = 'https://github.com/hiyroscript/alva/releases/latest';

// 'tauri' (the desktop apps), 'capacitor' (the Android app) or null (a
// browser). `win` is the page's window (a stand-in in tests).
export function nativeShell(win = globalThis.window) {
  try {
    if (win?.__TAURI_INTERNALS__ || win?.__TAURI__) return 'tauri';
    const capacitor = win?.Capacitor;
    if (typeof capacitor?.isNativePlatform === 'function' && capacitor.isNativePlatform()) return 'capacitor';
  } catch {
    // Anything odd on the window: a browser.
  }
  return null;
}

export const isNativeApp = (win = globalThis.window) => nativeShell(win) !== null;

// Whether a press of `event` (a keydown) is the desktop apps' fullscreen
// key, F11.
const isFullscreenKey = (event) => event?.code === 'F11' || event?.key === 'F11';

// Opens `url` in the player's own browser: in the desktop apps through
// Tauri's opener (its capability allows exactly the game's own links:
// src-tauri/capabilities/default.json), in the Android app through the
// system (an ACTION_VIEW, Capacitor's AppLauncher), in a browser as a new
// tab. Resolves to whether it was handed over; never throws.
export async function openExternal(url, win = globalThis.window) {
  try {
    switch (nativeShell(win)) {
      case 'tauri': {
        const opener = win.__TAURI__?.opener;
        if (typeof opener?.openUrl === 'function') await opener.openUrl(url);
        else await win.__TAURI_INTERNALS__.invoke('plugin:opener|open_url', { url });
        return true;
      }
      case 'capacitor': {
        const launcher = win.Capacitor.Plugins?.AppLauncher;
        if (typeof launcher?.openUrl === 'function') return (await launcher.openUrl({ url }))?.completed !== false;
        // Without the plugin, a navigation away from the app's own address
        // is handed to the system by Capacitor's bridge.
        win.location.assign(url);
        return true;
      }
      default:
        return !!win?.open?.(url, '_blank', 'noopener,noreferrer');
    }
  } catch (err) {
    console.warn(`[Alva] Could not open ${url} in the browser.`, err);
    return false;
  }
}

// What a native app adds to the page itself, once (main.js starts it):
// links to other sites opened in the player's own browser, and F11 for
// fullscreen on a computer. In a browser it does nothing at all.
export class NativeShell {
  constructor(win = globalThis.window, doc = globalThis.document) {
    this.win = win;
    this.doc = doc;
    this.shell = nativeShell(win);
    this.started = false;
  }

  get native() {
    return this.shell !== null;
  }

  start() {
    if (this.started || !this.native) return this;
    this.started = true;
    // A link to another site (such as the credits'): the player's
    // browser, never a window of the app's own.
    this.doc?.addEventListener?.('click', (event) => {
      const link = event.target?.closest?.('a[href]');
      const href = link?.getAttribute?.('href') ?? '';
      if (!/^https?:\/\//i.test(href)) return;
      event.preventDefault?.();
      openExternal(href, this.win);
    }, true);
    if (this.shell === 'tauri') {
      this.win?.addEventListener?.('keydown', (event) => {
        if (!isFullscreenKey(event) || event.repeat) return;
        event.preventDefault?.();
        this.toggleFullscreen();
      }, true);
    }
    return this;
  }

  // The desktop window in or out of fullscreen (its capability allows
  // these two window calls and nothing else of the window). Resolves to
  // whether it is fullscreen now.
  async toggleFullscreen() {
    try {
      const current = this.win?.__TAURI__?.window?.getCurrentWindow?.();
      if (!current) return false;
      const next = !(await current.isFullscreen());
      await current.setFullscreen(next);
      return next;
    } catch (err) {
      console.warn('[Alva] Could not change fullscreen.', err);
      return false;
    }
  }
}
