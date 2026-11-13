// The small-screen block: Alva refuses to run on a screen too small to play
// it well (a phone's browser tab above all), and says why over everything
// else, until the screen is big enough again.
//
// "Too small" is decided from the usable viewport, the CSS-pixel size of
// the visible area (visualViewport where the browser has one, its zoom
// undone; else the window's inner size), never from the user agent, against
// CONFIG.screen (js/config.js): one minimum for a browser tab and a lower
// one while Alva runs as an installed app (runningInstalled in
// js/core/web-app-install.js), whose whole screen is the game's. It is
// checked at start and on every resize and orientation change. While a
// text field has focus the check waits (an on-screen keyboard shrinks the
// visible area for as long as it is up) and runs again once it loses it.
//
// The block is a full-screen, solid black overlay above every screen,
// dialog and the splash, with its own title, explanation, a line asking to
// turn a phone held upright when turned it would fit, and a Download Alva
// button using the existing installation (WebAppInstall): the browser's own
// prompt where it offered one, else the same how-to the install dialog
// shows for this platform, and a word when Alva is already installed or
// this browser cannot install it. It is built here, appended to the page by
// itself and needs nothing else of the game: no screen, battle or menu has
// to exist (main.js starts it before the App). Its button is focused while
// it shows, keeps focus inside it, and answers Enter / Space and a
// controller's Cross / A (polled here, so it works even with no App).
// Inside a native app (js/core/native-shell.js) Alva is installed already:
// the block has no Download Alva, and its panel holds the focus instead.
//
// Listeners (onChange) hear each change of `blocked`: the App pauses an
// offline match and stops all game input while blocked (an online match
// runs on with no input, as it does for a hidden page, so the two browsers
// never desync).

import { CONFIG } from '../config.js';
import { el } from './utils.js';
import { tx, setText, onLanguageChange, localizeTree } from '../localization/i18n.js';
import { INSTALL_INSTRUCTIONS, runningInstalled } from './web-app-install.js';
import { isNativeApp } from './native-shell.js';

// The visible area in CSS pixels, { width, height }.
export function viewportSize(win = globalThis.window) {
  const vv = win?.visualViewport;
  if (vv && vv.width > 0 && vv.height > 0) {
    const scale = vv.scale > 0 ? vv.scale : 1;
    return { width: Math.round(vv.width * scale), height: Math.round(vv.height * scale) };
  }
  return { width: Math.round(win?.innerWidth ?? 0), height: Math.round(win?.innerHeight ?? 0) };
}

// The minimum for a browser tab, or for an installed app.
export function screenLimits(installed, limits = CONFIG.screen) {
  return installed ? limits.installed : limits.browser;
}

const fits = ({ width, height }, min) => width >= min.minWidth && height >= min.minHeight;

// Whether `size` ({ width, height }) is big enough to play on: { fits,
// portrait, rotate }, `rotate` when it is too small only because it is held
// upright (turned, it would fit). `installed` picks the minimum.
export function screenVerdict(size, { installed = false, limits = CONFIG.screen } = {}) {
  const min = screenLimits(installed, limits);
  const ok = fits(size, min);
  const portrait = size.height > size.width;
  const rotate = !ok && portrait && fits({ width: size.height, height: size.width }, min);
  return { fits: ok, portrait, rotate };
}

const isTextEntry = (node) => !!node && (
  node.isContentEditable || (node.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(node.type)) || node.tagName === 'TEXTAREA'
);

// Cross / A in the standard gamepad mapping.
const PAD_CONFIRM = 0;

export class ScreenGuard {
  // `win` and `doc` are the browser's (stand-ins in tests); `install` the
  // game's WebAppInstall, if any; `limits` CONFIG.screen.
  constructor({ win = globalThis.window, doc = globalThis.document, install = null, limits = CONFIG.screen } = {}) {
    this.win = win;
    this.doc = doc;
    this.install = install;
    this.limits = limits;
    this.blocked = false;
    this.verdict = { fits: true, portrait: false, rotate: false };
    this.listeners = new Set();
    this.returnFocus = null;
    this.padHeld = false;
    this.padFrame = null;
    this.started = false;
    this.build();
  }

  build() {
    this.title = el('h1', { class: 'screen-block-title', id: 'screen-block-title', ...tx('screenBlock.title') });
    this.body = el('p', { class: 'screen-block-body', id: 'screen-block-body', ...tx('screenBlock.body') });
    this.rotate = el('p', { class: 'screen-block-rotate', hidden: true, ...tx('screenBlock.rotate') });
    this.native = isNativeApp(this.win);
    this.download = el('button', {
      class: 'btn btn--primary screen-block-download', type: 'button', hidden: this.native, ...tx('screenBlock.download'),
    });
    this.status = el('p', { class: 'screen-block-status', role: 'status', 'aria-live': 'polite', hidden: true });
    this.stepsHeading = el('h2', { class: 'screen-block-steps-title' });
    this.stepsBody = el('div', { class: 'screen-block-steps-body' });
    this.steps = el('section', { class: 'screen-block-steps', hidden: true }, [this.stepsHeading, this.stepsBody]);
    this.panel = el('div', { class: 'screen-block-panel', tabindex: this.native ? '-1' : null }, [
      this.title, this.body, this.rotate, this.download, this.status, this.steps,
    ]);
    this.root = el('div', {
      class: 'screen-block', id: 'screen-block', role: 'alertdialog', 'aria-modal': 'true',
      'aria-labelledby': 'screen-block-title', 'aria-describedby': 'screen-block-body', hidden: true,
    }, [this.panel]);
    this.download.addEventListener('click', () => this.requestDownload());
  }

  // Puts the overlay on the page and starts watching the screen.
  start() {
    if (this.started) return this;
    this.started = true;
    this.doc?.body?.append(this.root);
    const check = () => this.check();
    for (const type of ['resize', 'orientationchange']) this.win?.addEventListener?.(type, check);
    this.win?.visualViewport?.addEventListener?.('resize', check);
    this.win?.screen?.orientation?.addEventListener?.('change', check);
    // A text field let go: the keyboard is gone, measure again.
    this.doc?.addEventListener?.('focusout', () => setTimeout(check, 0));
    // While blocked, focus never leaves the block.
    this.doc?.addEventListener?.('focusin', (e) => {
      if (this.blocked && !this.root.contains(e.target)) this.focusButton();
    });
    this.install?.onChange?.(() => {
      if (this.blocked) this.check();
    });
    onLanguageChange(() => localizeTree(this.root));
    this.check();
    return this;
  }

  // `fn(blocked)` hears every change. Returns the function that stops it.
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get installed() {
    return runningInstalled(this.win);
  }

  // Measures the screen and shows or removes the block.
  check() {
    if (!this.blocked && isTextEntry(this.doc?.activeElement)) return this.blocked;
    this.verdict = screenVerdict(viewportSize(this.win), { installed: this.installed, limits: this.limits });
    this.rotate.hidden = !this.verdict.rotate;
    this.setBlocked(!this.verdict.fits);
    return this.blocked;
  }

  setBlocked(blocked) {
    if (blocked === this.blocked) return;
    this.blocked = blocked;
    this.root.hidden = !blocked;
    this.doc?.documentElement?.classList?.toggle('is-screen-blocked', blocked);
    if (blocked) {
      const active = this.doc?.activeElement;
      this.returnFocus = active && active !== this.doc.body && !this.root.contains(active) ? active : null;
      this.resetDownload();
      this.focusButton();
      this.watchPad();
    } else {
      this.stopPad();
      const back = this.returnFocus;
      this.returnFocus = null;
      if (back?.isConnected) back.focus?.({ preventScroll: true });
    }
    for (const fn of [...this.listeners]) fn(blocked);
  }

  focusButton() {
    (this.native ? this.panel : this.download).focus?.({ preventScroll: true });
  }

  // ---- Download Alva ---------------------------------------------------------------

  resetDownload() {
    this.status.hidden = true;
    this.status.replaceChildren();
    this.steps.hidden = true;
  }

  say(key) {
    this.status.hidden = false;
    setText(this.status, key);
  }

  // How to install by hand on this platform (the install dialog's own).
  showSteps() {
    const how = INSTALL_INSTRUCTIONS[this.install?.platform] ?? INSTALL_INSTRUCTIONS.other;
    setText(this.stepsHeading, how.heading);
    this.stepsBody.replaceChildren(how.steps
      ? el('ol', { class: 'screen-block-step-list' }, how.steps.map((key) => el('li', tx(key))))
      : el('p', tx(how.text)));
    this.steps.hidden = false;
  }

  // From a real press: the browser's own prompt where it offered one, the
  // how-to where it did not, a word where Alva is already installed or
  // nothing here can install it. Resolves with what it did.
  async requestDownload() {
    const install = this.install;
    this.resetDownload();
    if (!install) {
      this.say('install.unavailable');
      return 'unavailable';
    }
    if (install.mode === 'installed') {
      this.say('screenBlock.installed');
      return 'installed';
    }
    if (!install.canPrompt) {
      this.showSteps();
      return 'manual';
    }
    this.say('install.status.prompting');
    const outcome = await install.install();
    if (outcome === 'accepted') this.say('screenBlock.accepted');
    else if (outcome === 'dismissed') this.say('install.status.dismissed');
    else {
      this.say('install.status.failed');
      this.showSteps();
    }
    return outcome;
  }

  // ---- Controller -------------------------------------------------------------------

  // Cross / A on any controller presses the button while the block shows
  // (in a native app there is none to press).
  watchPad() {
    if (this.native || this.padFrame !== null || typeof this.win?.requestAnimationFrame !== 'function') return;
    this.padHeld = true; // a press already down when it appeared is not one
    const tick = () => {
      this.padFrame = null;
      if (!this.blocked) return;
      this.pollPad();
      this.padFrame = this.win.requestAnimationFrame(tick);
    };
    this.padFrame = this.win.requestAnimationFrame(tick);
  }

  stopPad() {
    if (this.padFrame !== null) this.win?.cancelAnimationFrame?.(this.padFrame);
    this.padFrame = null;
  }

  // One look at the controllers: a fresh Cross / A press activates the
  // focused control of the block (its button).
  pollPad() {
    let pads = [];
    try {
      pads = [...(this.win?.navigator?.getGamepads?.() ?? [])];
    } catch {
      pads = [];
    }
    const down = pads.some((pad) => pad?.connected !== false && pad?.buttons?.[PAD_CONFIRM]?.pressed);
    if (down && !this.padHeld) {
      const active = this.doc?.activeElement;
      (this.root.contains(active) && active?.click ? active : this.download).click();
    }
    this.padHeld = down;
  }
}

