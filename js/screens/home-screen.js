// HOME: editorial wordmark and navigation beside a glass strip carrying a
// looping credits roll.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { logoSVG } from '../ui/logo.js';
import { ICONS } from '../ui/icons.js';
import { CREDITS } from '../ui/help-content.js';

const CREDITS_RESUME_DELAY = 2000;
const ROLL_SPEED = 22; // credits roll, CSS px per second

// One pass of the credits. The roll shows it twice; the copy is hidden from
// assistive technology so the credits are announced once.
function creditsSequence({ copy = false } = {}) {
  return el('div', { class: 'home-credits-seq', 'aria-hidden': copy ? 'true' : null }, CREDITS.map((group) =>
    el('section', { class: 'home-credit' }, [
      el('h2', { class: 'home-credit-title', text: group.title }),
      group.lead ? el('p', { class: 'home-credit-lead', text: group.lead }) : null,
      ...(group.lines || []).map((line) => el('p', { class: 'home-credit-line', text: line })),
    ]),
  ));
}

export class HomeScreen extends Screen {
  constructor(app) {
    super(app, 'home');

    const play = el('button', {
      class: 'home-action home-action--primary', type: 'button', 'data-nav': true, 'data-nav-default': true,
      html: `<span>Play</span>${ICONS.arrow}`,
    });
    // Help & Credits is disabled for now. Disabled buttons ignore clicks and
    // the menu navigator skips them; drop `disabled` to bring the entry back.
    const help = el('button', {
      class: 'home-action', type: 'button', 'data-nav': true, disabled: true,
      html: `<span>Help &amp; Credits</span>${ICONS.right}`,
    });
    play.addEventListener('click', () => app.screens.go('mode'));
    help.addEventListener('click', () => app.screens.go('help'));

    this.rollTrack = el('div', { class: 'home-credits-track' }, [creditsSequence(), creditsSequence({ copy: true })]);
    this.rollOffset = 0;
    this.lastInteraction = -Infinity;
    this.activePointer = null;
    this.portraitQuery = window.matchMedia('(max-aspect-ratio: 1/1)');
    this.creditsViewport = el('div', {
      class: 'home-credits-col', tabindex: 0, role: 'region',
      'aria-label': 'Credits. Scroll or use arrow and Page keys to read.',
    }, [this.rollTrack]);
    // Registered once: Home visits reuse this screen and the app frame loop.
    this.creditsViewport.addEventListener('wheel', (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.creditsViewport.clientHeight : 1;
      this.scrollCredits(event.deltaY * unit);
    }, { passive: false });
    this.creditsViewport.addEventListener('pointerdown', (event) => {
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
        el('aside', { class: 'home-credits', 'aria-label': 'Credits' }, [
          this.creditsViewport,
        ]),
      ]),
      el('div', { class: 'home-main' }, [
        el('div', { class: 'home-intro' }, [
          el('h1', { class: 'home-title', id: 'home-title', html: logoSVG({ className: 'logo logo--display' }) }),
          el('p', { class: 'home-lede', text: 'Fan project. Big heart.' }),
          el('nav', { class: 'home-actions', 'aria-label': 'Main menu' }, [play, help]),
        ]),
      ]),
      el('footer', { class: 'home-footer' }, [
        el('span', { text: `by ${CONFIG.developer}` }),
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
  }

  update(dt) {
    const portrait = this.portraitQuery.matches;
    this.creditsViewport.tabIndex = portrait ? -1 : 0;
    if (portrait && document.activeElement === this.creditsViewport) this.focusDefault();
    if (this.activePointer !== null && (!document.hasFocus() || portrait)) this.endDrag();
    if (!this.app.device.reducedMotion && this.activePointer === null &&
        performance.now() - this.lastInteraction >= CREDITS_RESUME_DELAY) {
      this.rollOffset += ROLL_SPEED * dt;
    }
    this.renderCredits();
  }
}
