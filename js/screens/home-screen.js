// HOME: application-style start screen. Header with the wordmark and build,
// an intro column with Play (primary) and Help & Credits (secondary), and a
// contained, monochrome idle preview of the current fighter.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { logoSVG } from '../ui/logo.js';
import { ICONS } from '../ui/icons.js';
import { hintBar } from '../ui/components.js';
import { getCharacter } from '../data/characters.js';
import { tintFrame, fitCanvas, drawFrameAt } from '../ui/sprite-art.js';

const SILHOUETTE = '#1b1b1b';

export class HomeScreen extends Screen {
  constructor(app) {
    super(app, 'home');

    const play = el('button', {
      class: 'home-action home-action--primary', type: 'button', 'data-nav': true, 'data-nav-default': true,
      html: `<span>Play</span>${ICONS.arrow}`,
    });
    const help = el('button', {
      class: 'home-action', type: 'button', 'data-nav': true,
      html: `<span>Help &amp; Credits</span>${ICONS.right}`,
    });
    play.addEventListener('click', () => app.screens.go('mode'));
    help.addEventListener('click', () => app.screens.go('help'));

    this.canvas = el('canvas', { class: 'home-preview-canvas' });
    this.previewName = el('span', { class: 'home-preview-name' });

    this.el.replaceChildren(
      el('header', { class: 'home-header' }, [
        el('span', { html: logoSVG({ className: 'logo logo--mark', decorative: true }) }),
        el('span', { class: 'home-build', text: `Build ${CONFIG.version}` }),
      ]),
      el('div', { class: 'home-main' }, [
        el('div', { class: 'home-intro' }, [
          el('p', { class: 'home-eyebrow', text: '2D sprite fighting game' }),
          el('h1', { class: 'home-title', id: 'home-title', html: logoSVG({ className: 'logo logo--display' }) }),
          el('p', { class: 'home-lede', text: 'Fast, responsive fighting in your browser.' }),
          el('nav', { class: 'home-actions', 'aria-label': 'Main menu' }, [play, help]),
        ]),
        this.preview = el('figure', { class: 'home-preview', 'aria-hidden': 'true' }, [
          this.canvas,
          el('figcaption', { class: 'home-preview-caption' }, [this.previewName, el('span', { text: 'Idle' })]),
        ]),
      ]),
      el('div', { class: 'home-footer' }, [
        el('span', { text: `by ${CONFIG.developer}` }),
        hintBar([[['↑', '↓'], 'Navigate'], [['Enter'], 'Select']]),
      ]),
    );
    this.el.setAttribute('aria-labelledby', 'home-title');

    this.set = null;
    this.frames = null;
    this.frameIndex = 0;
    this.frameTime = 0;
  }

  enter() {
    const id = this.app.selection.characterId;
    this.previewName.textContent = getCharacter(id)?.displayName ?? '';
    this.app.loadCharacter(id).then((set) => {
      if (!set?.usable || this.set === set) return;
      this.set = set;
      // Tint once; the preview only ever shows the charcoal silhouette.
      this.frames = set.animations.idle.frames.map((f) => ({ ...f, canvas: tintFrame(f, SILHOUETTE) }));
      this.fps = set.animations.idle.fps * 0.8;
      this.frameIndex = 0;
      this.preview.classList.add('is-ready');
      this.draw();
    });
  }

  update(dt) {
    if (!this.frames) return;
    let advanced = false;
    if (!this.app.device.reducedMotion) {
      this.frameTime += dt;
      const step = 1 / this.fps;
      if (this.frameTime >= step) {
        this.frameTime %= step;
        this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        advanced = true;
      }
    }
    if (fitCanvas(this.canvas).changed || advanced) this.draw();
  }

  draw() {
    const { w, h, cssW } = fitCanvas(this.canvas);
    if (!cssW || !this.frames) return; // hidden on compact layouts
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    // Whole art pixels per device pixel, sized from the reference height so
    // the fighter doesn't pulse between idle frames.
    const n = Math.max(1, Math.floor((h * 0.52) / this.set.refArtHeight));
    const x = w / 2;
    const y = Math.round(h * 0.8);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.beginPath();
    ctx.ellipse(x, y, this.set.refArtHeight * n * 0.34, Math.max(2, n * 2.2), 0, 0, Math.PI * 2);
    ctx.fill();
    // Mirrored so the fighter faces the menu column.
    drawFrameAt(ctx, this.frames[this.frameIndex], x, y, n, true);
  }
}
