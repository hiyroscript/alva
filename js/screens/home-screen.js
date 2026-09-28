// HOME: editorial wordmark and navigation beside a glass strip carrying a
// looping credits roll, with a compact Settings (gear) button in the top
// right corner that opens the Settings dialog over Home.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { tx, tattr, iconLabel } from '../core/i18n.js';
import { logoSVG } from '../ui/logo.js';
import { ICONS } from '../ui/icons.js';
import { CREDITS, creditLabel, creditLink } from '../ui/credits.js';

const CREDITS_RESUME_DELAY = 2000;
const ROLL_SPEED = 22; // credits roll, CSS px per second

// One credit line: its text, or a link to its source (opened in a new tab,
// so the game stays where it is). The copy's links are never focusable: it
// is hidden from assistive technology, and one Tab stop is enough.
function creditLine(line, copy) {
  const href = creditLink(line);
  if (!href) return el('p', { class: 'home-credit-line', ...tx(...creditLabel(line)) });
  return el('p', { class: 'home-credit-line' }, [
    el('a', {
      class: 'home-credit-link', href, target: '_blank', rel: 'noopener noreferrer',
      tabindex: copy ? '-1' : null, ...tx(...creditLabel(line)),
    }),
  ]);
}

// One pass of the credits. The roll shows it twice; the copy is hidden from
// assistive technology so the credits are announced once.
function creditsSequence({ copy = false } = {}) {
  return el('div', { class: 'home-credits-seq', 'aria-hidden': copy ? 'true' : null }, CREDITS.map((group) =>
    el('section', { class: 'home-credit' }, [
      el('h2', { class: 'home-credit-title', ...tx(...creditLabel(group.title)) }),
      group.lead ? el('p', { class: 'home-credit-lead', ...tx(...creditLabel(group.lead)) }) : null,
      ...(group.lines || []).map((line) => creditLine(line, copy)),
    ]),
  ));
}

export class HomeScreen extends Screen {
  constructor(app) {
    super(app, 'home');

    const play = el('button', {
      class: 'home-action home-action--primary', type: 'button', 'data-nav': true, 'data-nav-default': true,
      'data-home-action': 'play', ...iconLabel('home.play', ICONS.arrow),
    });
    // The secondary actions, outlined with a chevron. Watch Mode (CPU vs
    // CPU) opens its own setup, never Select Mode; Practice Ground goes
    // straight into the training room (no mode, fighter or stage select);
    // Discover opens the in-game reference (Power, Launch, Passives).
    const secondary = (id, key) => el('button', {
      class: 'home-action', type: 'button', 'data-nav': true,
      'data-home-action': id, ...iconLabel(key, ICONS.right),
    });
    const watch = secondary('watch', 'home.watch');
    const practice = secondary('practice', 'home.practice');
    const discover = secondary('discover', 'home.discover');
    play.addEventListener('click', () => app.screens.go('mode'));
    watch.addEventListener('click', () => app.screens.go('watch-difficulty'));
    practice.addEventListener('click', () => app.screens.go('practice'));
    discover.addEventListener('click', () => app.screens.go('discover'));
    // By name, in menu order.
    this.actions = { play, watch, practice, discover };

    // Settings: Home chrome, not a menu action. The gear in the top right
    // corner opens the Settings dialog over Home (js/ui/settings-dialog.js)
    // and focus comes back to it when the dialog closes. Keyboard and
    // gamepad reach it like any menu item (→ or ↑ from the menu).
    this.settingsButton = el('button', {
      class: 'home-settings', type: 'button', 'data-nav': true, 'data-home-settings': true,
      'aria-haspopup': 'dialog', ...tattr('aria-label', 'home.settings'), ...tattr('title', 'home.settings'),
      html: ICONS.settings,
    });
    this.settingsButton.addEventListener('click', () => app.settingsDialog.open({ returnFocus: this.settingsButton }));

    this.rollTrack = el('div', { class: 'home-credits-track' }, [creditsSequence(), creditsSequence({ copy: true })]);
    // The source links a keyboard can reach (the first pass's).
    this.creditLinks = [...this.rollTrack.children[0].querySelectorAll('.home-credit-link')];
    this.rollOffset = 0;
    this.lastInteraction = -Infinity;
    this.activePointer = null;
    this.portraitQuery = window.matchMedia('(max-aspect-ratio: 1/1)');
    this.creditsViewport = el('div', {
      class: 'home-credits-col', tabindex: 0, role: 'region', ...tattr('aria-label', 'home.creditsRegion'),
    }, [this.rollTrack]);
    // Registered once: Home visits reuse this screen and the app frame loop.
    this.creditsViewport.addEventListener('wheel', (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.creditsViewport.clientHeight : 1;
      this.scrollCredits(event.deltaY * unit);
    }, { passive: false });
    this.creditsViewport.addEventListener('pointerdown', (event) => {
      // A press on a source link is the link's: it opens it, never drags.
      if (event.target.closest?.('.home-credit-link')) return;
      if (event.button !== 0 || this.activePointer !== null) return;
      event.preventDefault();
      // Scripted focus matches :focus-visible, so mark it to keep the keyboard
      // cue hidden until a key is pressed here or focus leaves.
      this.creditsViewport.classList.add('is-pointer-focus');
      this.creditsViewport.focus({ preventScroll: true });
      this.activePointer = event.pointerId;
      this.pointerY = event.clientY;
      this.lastInteraction = performance.now();
      this.creditsViewport.setPointerCapture(event.pointerId);
    });
    this.creditsViewport.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.activePointer) return;
      this.scrollCredits(this.pointerY - event.clientY);
      this.pointerY = event.clientY;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.creditsViewport.addEventListener(type, (event) => {
        if (event.pointerId === this.activePointer) this.endDrag();
      });
    }
    // Tab onto a source link brings it to the middle of the roll, which
    // holds still while it has focus (see update); the browser's own
    // scroll to reveal it is undone, as the roll moves only by its offset.
    this.creditsViewport.addEventListener('focusin', (event) => {
      const link = event.target.closest?.('.home-credit-link');
      if (link) this.showCredit(link);
    });
    this.creditsViewport.addEventListener('blur', () => {
      // Switching windows blurs without moving focus; keep the mark then.
      if (document.activeElement !== this.creditsViewport) this.creditsViewport.classList.remove('is-pointer-focus');
    });
    this.creditsViewport.addEventListener('keydown', (event) => {
      this.creditsViewport.classList.remove('is-pointer-focus');
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const page = this.creditsViewport.clientHeight * 0.8;
      const delta = { ArrowUp: -40, ArrowDown: 40, PageUp: -page, PageDown: page,
        Space: event.shiftKey ? -page : page }[event.code];
      if (delta === undefined) return;
      event.preventDefault();
      // Handle only intentional credits focus before the window menu listener.
      event.stopPropagation();
      this.scrollCredits(delta);
    });

    this.el.replaceChildren(
      el('div', { class: 'home-scene' }, [
        el('div', { class: 'home-glass', 'aria-hidden': 'true' }),
        el('aside', { class: 'home-credits', ...tattr('aria-label', 'home.credits') }, [
          this.creditsViewport,
        ]),
      ]),
      el('div', { class: 'home-main' }, [
        el('div', { class: 'home-intro' }, [
          el('h1', { class: 'home-title', id: 'home-title', html: logoSVG({ className: 'logo logo--display' }) }),
          el('p', { class: 'home-lede', ...tx('home.lede') }),
          el('nav', { class: 'home-actions', ...tattr('aria-label', 'home.menu') }, Object.values(this.actions)),
        ]),
      ]),
      this.settingsButton,
      el('footer', { class: 'home-footer' }, [
        el('span', tx('home.by', { developer: CONFIG.developer })),
      ]),
    );
    this.el.setAttribute('aria-labelledby', 'home-title');
  }

  endDrag() {
    const pointer = this.activePointer;
    this.activePointer = null;
    if (pointer === null) return;
    this.lastInteraction = performance.now();
    if (this.creditsViewport.hasPointerCapture(pointer)) this.creditsViewport.releasePointerCapture(pointer);
  }

  enter() {
    this.lastInteraction = -Infinity;
  }

  exit() {
    this.endDrag();
  }

  // Rolls the credits so `node` sits in the middle of the view.
  showCredit(node) {
    this.creditsViewport.scrollTop = 0;
    const box = node.getBoundingClientRect();
    const at = box.top - this.rollTrack.getBoundingClientRect().top;
    this.lastInteraction = performance.now();
    this.rollOffset = at - (this.creditsViewport.clientHeight - box.height) / 2;
    this.renderCredits();
  }

  // A source link in the roll has focus.
  get linkFocused() {
    return this.creditLinks.includes(document.activeElement);
  }

  scrollCredits(delta) {
    this.lastInteraction = performance.now();
    this.rollOffset += delta;
    this.renderCredits();
  }

  renderCredits() {
    const period = this.rollTrack.firstChild.getBoundingClientRect().height;
    if (!period) return;
    // A single logical position drives both manual and automatic movement.
    // Reduced motion uses the same inputs, bounded to one readable copy.
    this.rollOffset = this.app.device.reducedMotion
      ? Math.max(0, Math.min(this.rollOffset, Math.max(0, period - this.creditsViewport.clientHeight)))
      : ((this.rollOffset % period) + period) % period;
    this.rollTrack.style.transform = `translate3d(0, ${-this.rollOffset}px, 0)`;
    // Only the offset moves the roll (a focused link's reveal scrolls it).
    if (this.creditsViewport.scrollTop) this.creditsViewport.scrollTop = 0;
  }

  update(dt) {
    const portrait = this.portraitQuery.matches;
    this.creditsViewport.tabIndex = portrait ? -1 : 0;
    for (const link of this.creditLinks) link.tabIndex = portrait ? -1 : 0;
    if (portrait && (document.activeElement === this.creditsViewport || this.linkFocused)) this.focusDefault();
    if (this.activePointer !== null && (!document.hasFocus() || portrait)) this.endDrag();
    if (!this.app.device.reducedMotion && this.activePointer === null && !this.linkFocused &&
        performance.now() - this.lastInteraction >= CREDITS_RESUME_DELAY) {
      this.rollOffset += ROLL_SPEED * dt;
    }
    this.renderCredits();
  }
}
