// Both decoded images are required before this non-skippable intro starts.
import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';

const ARTWORK = [
  { url: './hs.jpg', name: 'hs', alt: 'hiyroscript', credit: true },
  { url: './alvafav.PNG', name: 'alva', alt: 'Alva' },
];

export class SplashScreen extends Screen {
  constructor(app) {
    super(app, 'splash');
    this.navigable = false;
    this.leaveMs = 760; // Keep black underneath Home's existing dissolve.
    this.stage = el('div', { class: 'splash-stage' });
    // Fades in and out with hs.jpg; it stays still while the image zooms.
    this.credit = el('p', { class: 'splash-credit', text: 'a game by hiyroscript' });
    this.el.replaceChildren(this.stage, this.credit);
    this.run = null;
  }

  enter() {
    this.clear();
    const run = { cancelled: false, done: false, animations: [], cancelDelay: null };
    this.run = run;
    this.el.dataset.phase = 'loading';
    void this.play(run);
  }

  active(run) {
    return this.run === run && !run.cancelled && !run.done;
  }

  async play(run) {
    const cfg = CONFIG.splash;
    try {
      const images = await Promise.all(ARTWORK.map(({ url }) => this.app.assets.loadImage(url)));
      if (!this.active(run)) return;
      if (images.some((img) => !img)) throw new Error('One or more splash images failed to load.');
      // AssetLoader tolerates decode failures for game sprites. The intro's
      // stricter gate requires successful decoding before either image mounts.
      await Promise.all(images.map((img) => img.decode ? img.decode() : Promise.resolve()));
      if (!this.active(run)) return;
      const reduced = this.app.device.reducedMotion;
      for (const [index, img] of images.entries()) {
        const art = ARTWORK[index];
        img.className = `splash-image splash-image--${art.name}`;
        img.alt = art.alt;
        img.draggable = false;
        this.stage.replaceChildren(img); // Reuse the loaded element: no src swap/request.
        this.el.dataset.phase = `${art.name}-show`;
        const faded = art.credit ? [img, this.credit] : [img];
        if (reduced) {
          for (const node of faded) node.style.opacity = '1';
          if (!await this.delay(run, cfg.reducedMotionHold)) return;
          for (const node of faded) node.style.opacity = '';
        } else {
          const duration = cfg.fadeIn + cfg.hold + cfg.fadeOut;
          const fade = [
            { opacity: 0, offset: 0, easing: 'ease-in-out' },
            { opacity: 1, offset: cfg.fadeIn / duration },
            { opacity: 1, offset: (cfg.fadeIn + cfg.hold) / duration, easing: 'ease-in-out' },
            { opacity: 0, offset: 1 },
          ];
          img.style.willChange = 'transform, opacity';
          // Separate tracks keep the zoom continuous across all opacity phases.
          run.animations = [
            ...faded.map((node) => node.animate(fade, { duration, fill: 'forwards' })),
            img.animate([
              { transform: `scale(${cfg.zoomFrom})` },
              { transform: `scale(${cfg.zoomTo})` },
            ], { duration, easing: 'linear', fill: 'forwards' }),
          ];
          await Promise.all(run.animations.map((animation) => animation.finished));
          if (!this.active(run)) return;
          for (const animation of run.animations) animation.cancel();
          run.animations = [];
          img.style.willChange = '';
        }
        this.stage.replaceChildren();
        this.el.dataset.phase = index === 0 ? 'gap' : 'finish';
        if (!await this.delay(run, index === 0 ? cfg.betweenImages : cfg.finalBlackHold)) return;
      }
      this.finish(run);
    } catch (error) {
      if (!this.active(run)) return; // Cancellation rejects animation.finished.
      console.error('[Alva] Splash unavailable; skipping the entire intro.', error);
      this.finish(run); // No partial artwork or broken image on failure.
    }
  }

  delay(run, ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        run.cancelDelay = null;
        resolve(this.active(run));
      }, ms);
      run.cancelDelay = () => {
        clearTimeout(timer);
        resolve(false);
      };
    });
  }

  finish(run) {
    if (!this.active(run)) return;
    run.done = true;
    this.clear();
    this.app.screens.go('home', {}, { reset: true });
  }

  clear() {
    const run = this.run;
    if (run) {
      run.cancelled = true;
      run.cancelDelay?.();
      for (const animation of run.animations) animation.cancel();
    }
    for (const img of this.stage.children) {
      img.style.opacity = '';
      img.style.willChange = '';
    }
    this.credit.style.opacity = '';
    this.stage.replaceChildren();
    this.run = null;
  }

  exit() {
    this.clear();
  }
}
