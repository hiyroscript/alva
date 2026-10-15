// Web-app installation: whether Alva can be added to the player's device
// (its home screen, dock or app list) and how, for Home's Download button
// and the install dialog it opens (js/ui/install-dialog.js).
//
// Alva is installable as a Progressive Web App: ./manifest.webmanifest
// (linked from index.html) names it, its icons (assets/icons/, from the
// favicon artwork) and how it opens (standalone, at ./ under ./), every URL
// relative so a GitHub Pages project sub-path works as the domain root
// does. There is no service worker: current Chromium browsers (Chrome,
// Edge, Samsung Internet) offer installation without one, Safari never
// needed one, and none means no offline cache to fill the player's storage
// or to serve a stale version of the game. An installed Alva loads from the
// network like the site does.
//
// Three modes, one at a time (`mode`):
//
//   installed  Alva is running as an installed app (display-mode:
//              standalone, fullscreen, minimal-ui or window-controls-
//              overlay, or iOS's navigator.standalone), or the browser
//              said it was just installed (`appinstalled`): nothing to
//              offer, only a friendly word.
//   prompt     the browser offered its own installation
//              (`beforeinstallprompt`, Chromium): the event is kept, and
//              `install()`, called from a real press, shows the browser's
//              own confirmation. Only the browser installs: nothing here
//              claims success before `appinstalled` says so.
//   manual     no programmable installation here (Safari on iPhone and
//              iPad, Firefox, Safari on a Mac, or a Chromium browser that
//              has not offered it, or whose one offer was spent): the
//              dialog shows how to do it by hand, for the platform and
//              browser it can tell (installPlatform).
//
// `status` follows one installation attempt: 'idle', 'prompting' (the
// browser's prompt is up), 'accepted' (the player accepted; installing),
// 'dismissed' (the player declined: the game goes on, and the dialog says
// how to install later), 'failed' (the browser refused to prompt) or
// 'installed'. Listeners (onChange) hear every change of mode or status.
// Nothing here touches the game or its storage.

// Display modes an installed web app may run in.
const APP_DISPLAY_MODES = Object.freeze(['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']);

// The platform and browser the manual instructions are written for, from
// what the browser says of itself (a hint, never a gate):
//
//   ios               an iPhone, iPad or iPod (iPadOS that calls itself a
//                     Mac included): Safari's Share › Add to Home Screen
//   android           Chrome and most other Android browsers: their menu
//   android-samsung   Samsung Internet: Add page to › Home screen
//   android-firefox   Firefox for Android: its menu
//   desktop-edge      Microsoft Edge: Apps › Install this site as an app
//   desktop-chromium  Chrome and other Chromium browsers: the address bar's
//                     Install icon, or the menu
//   desktop-safari    Safari on a Mac: File › Add to Dock
//   desktop-firefox   Firefox on a computer: no installation to offer
//   other             anything else: a general hint
export const INSTALL_PLATFORMS = Object.freeze([
  'ios', 'android', 'android-samsung', 'android-firefox',
  'desktop-edge', 'desktop-chromium', 'desktop-safari', 'desktop-firefox', 'other',
]);

export function installPlatform({ userAgent = '', maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent);
  const iPadAsMac = /Macintosh/.test(ua) && maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadAsMac) return 'ios';
  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return 'android-samsung';
    if (/Firefox\//.test(ua)) return 'android-firefox';
    return 'android';
  }
  if (/Firefox\//.test(ua)) return 'desktop-firefox';
  if (/Edg\//.test(ua)) return 'desktop-edge';
  if (/Chrome\/|Chromium\//.test(ua)) return 'desktop-chromium';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return 'desktop-safari';
  return 'other';
}

// Whether the page is running as an installed app (see above).
export function runningInstalled(win = globalThis.window) {
  if (win?.navigator?.standalone === true) return true;
  const mq = win?.matchMedia;
  if (typeof mq !== 'function') return false;
  return APP_DISPLAY_MODES.some((mode) => {
    try {
      return !!mq.call(win, `(display-mode: ${mode})`)?.matches;
    } catch {
      return false;
    }
  });
}

export class WebAppInstall {
  // `win` is the browser window (a stand-in in tests): its events, display
  // mode and navigator are all this reads.
  constructor(win = globalThis.window) {
    this.win = win ?? null;
    this.deferred = null; // the kept beforeinstallprompt event
    this.justInstalled = false; // appinstalled heard this session
    this.status = 'idle';
    this.listeners = new Set();
    const nav = this.win?.navigator ?? {};
    this.platform = installPlatform({ userAgent: nav.userAgent, maxTouchPoints: nav.maxTouchPoints });
    const on = (type, fn) => this.win?.addEventListener?.(type, fn);
    on('beforeinstallprompt', (event) => {
      // Keep the browser's offer for a press of our own, instead of its
      // mini-infobar.
      event.preventDefault?.();
      if (this.mode === 'installed') return;
      this.deferred = event;
      this.emit();
    });
    on('appinstalled', () => {
      this.deferred = null;
      this.justInstalled = true;
      this.status = 'installed';
      this.emit();
    });
    // Opened in (or moved out to) the installed app's own window.
    for (const mode of APP_DISPLAY_MODES) {
      try {
        this.win?.matchMedia?.(`(display-mode: ${mode})`)?.addEventListener?.('change', () => this.emit());
      } catch {
        // An old browser without this media feature: nothing to follow.
      }
    }
  }

  // Running as an installed app now.
  get standalone() {
    return runningInstalled(this.win);
  }

  // 'installed', 'prompt' or 'manual' (see above).
  get mode() {
    if (this.standalone || this.justInstalled) return 'installed';
    return this.deferred ? 'prompt' : 'manual';
  }

  // Whether the browser's own installation can be asked for right now.
  get canPrompt() {
    return this.mode === 'prompt';
  }

  // `fn` hears every change of mode or status. Returns the function that
  // stops it.
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of [...this.listeners]) fn(this);
  }

  // Shows the browser's own installation prompt, kept from
  // beforeinstallprompt: call it from a real press (a click or a confirm),
  // never on a timer. It resolves with the player's choice, 'accepted' or
  // 'dismissed', or 'unavailable' when there was nothing to prompt (the
  // dialog then shows how to install by hand) and 'failed' when the browser
  // refused. Each offer is used once: a browser that allows another offers
  // it again with a new event. Accepted is not installed: the status stays
  // 'accepted' until appinstalled says so.
  async install() {
    const offer = this.deferred;
    if (!offer || this.mode === 'installed') return 'unavailable';
    this.deferred = null;
    this.status = 'prompting';
    this.emit();
    let outcome;
    try {
      // prompt() at once, in the same task as the press that asked for it.
      // It settles with the player's choice (or rejects when the browser
      // will not prompt, when userChoice would never settle); an older
      // browser that returns nothing reports it through userChoice.
      const result = await offer.prompt();
      const choice = result?.outcome ? result : await offer.userChoice;
      outcome = choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch (error) {
      console.warn('[Alva] The browser refused to show its installation prompt.', error);
      outcome = 'failed';
    }
    if (this.status === 'prompting') this.status = outcome;
    this.emit();
    return outcome;
  }
}
