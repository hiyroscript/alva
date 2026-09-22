// SPLASH: black screen, "a game by hiyroscript" fades in near the bottom,
// holds, fades out, then Home. Any key / tap skips.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';

export class SplashScreen extends Screen {
  constructor(app) {
    super(app, 'splash');
    this.navigable = false;
    this.text = el('p', { class: 'splash-credit', text: 'a game by hiyroscript' });
    this.el.replaceChildren(this.text);
    this.timers = [];
    this.done = false;
    this.skip = this.skip.bind(this);
  }

  enter() {
    this.done = false;
    const cfg = CONFIG.splash;
    const reduced = this.app.device.reducedMotion;
    this.text.classList.remove('is-in', 'is-out');
    this.text.style.setProperty('--fade-in', `${reduced ? 0 : cfg.fadeIn}ms`);
    this.text.style.setProperty('--fade-out', `${reduced ? 0 : cfg.fadeOut}ms`);

    const at = (ms, fn) => this.timers.push(setTimeout(fn, ms));
    if (reduced) {
      this.text.classList.add('is-in');
      at(cfg.reducedMotionHold, () => this.finish());
    } else {
      at(250, () => this.text.classList.add('is-in'));
      at(250 + cfg.fadeIn + cfg.hold, () => this.text.classList.add('is-out'));
      at(250 + cfg.fadeIn + cfg.hold + cfg.fadeOut + 150, () => this.finish());
    }
    // Let players skip after a beat (avoid skipping on the launching tap).
    at(400, () => {
      window.addEventListener('keydown', this.skip);
      window.addEventListener('pointerdown', this.skip);
    });
  }

  skip() {
    if (this.done) return;
    this.text.classList.add('is-out');
    this.clear();
    this.timers.push(setTimeout(() => this.finish(), this.app.device.reducedMotion ? 0 : 260));
  }

  clear() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    window.removeEventListener('keydown', this.skip);
    window.removeEventListener('pointerdown', this.skip);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.clear();
    this.app.screens.go('home', {}, { reset: true });
  }

  exit() {
    this.clear();
  }
}
