// HOME: MAXY wordmark, PLAY (primary) and HELP AND CREDITS.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { logoSVG } from '../ui/logo.js';
import { ICONS } from '../ui/icons.js';
import { hintBar } from '../ui/components.js';
import { tintFrame } from '../ui/sprite-art.js';

export class HomeScreen extends Screen {
  constructor(app) {
    super(app, 'home');

    const play = el('button', {
      class: 'menu-btn menu-btn--primary', type: 'button', 'data-nav': true, 'data-nav-default': true,
      html: `<span class="menu-index">01</span><span class="menu-label">PLAY</span><span class="menu-arrow">${ICONS.right}</span>`,
    });
    const help = el('button', {
      class: 'menu-btn', type: 'button', 'data-nav': true,
      html: `<span class="menu-index">02</span><span class="menu-label">HELP AND CREDITS</span><span class="menu-arrow">${ICONS.right}</span>`,
    });
    play.addEventListener('click', () => app.screens.go('mode'));
    help.addEventListener('click', () => app.screens.go('help'));

    this.canvas = el('canvas', { class: 'home-fighter-canvas', 'aria-hidden': 'true' });

    this.el.replaceChildren(
      el('div', { class: 'home-bg', 'aria-hidden': 'true' }, [
        el('div', { class: 'home-grid' }),
        el('div', { class: 'home-slash' }),
        el('div', { class: 'home-streaks' }, Array.from({ length: 6 }, (_, i) => el('span', { class: `streak s${i + 1}` }))),
      ]),
      el('div', { class: 'home-fighter', 'aria-hidden': 'true' }, [this.canvas]),
      el('div', { class: 'home-main' }, [
        el('p', { class: 'home-kicker', text: '2D SPRITE FIGHTING GAME' }),
        el('h1', { class: 'home-title', id: 'home-title', html: logoSVG({ className: 'logo logo--home' }) }),
        el('nav', { class: 'home-menu', 'aria-label': 'Main menu' }, [play, help]),
      ]),
      el('div', { class: 'home-footer' }, [
        el('span', { class: 'home-credit', text: `by ${CONFIG.developer}` }),
        el('span', { class: 'home-version', text: `BUILD ${CONFIG.version}` }),
      ]),
      hintBar([[['↑', '↓'], 'Navigate'], [['Enter'], 'Select']]),
    );
    this.el.setAttribute('aria-labelledby', 'home-title');

    this.frames = null;
    this.frameIndex = 0;
    this.frameTime = 0;
    this.lastSize = '';
  }

  enter() {
    this.app.loadCharacter(this.app.selection.characterId).then((set) => {
      if (!set?.usable) return;
      const idle = set.animations.idle;
      this.fps = idle.fps;
      // Pre-render silhouette variants once (dark body + orange rim).
      this.frames = idle.frames.map((f) => ({
        f,
        dark: tintFrame(f, '#121212', 1),
        rim: tintFrame(f, '#ff7a00', 1),
      }));
      this.lastSize = '';
      this.draw();
    });
  }

  update(dt) {
    if (!this.frames) return;
    this.frameTime += dt;
    const step = 1 / (this.fps * 0.8);
    if (this.frameTime >= step) {
      this.frameTime %= step;
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.draw();
    } else if (this.sizeChanged()) {
      this.draw();
    }
  }

  sizeChanged() {
    const r = this.canvas.getBoundingClientRect();
    const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
    if (key === this.lastSize) return false;
    this.lastSize = key;
    return true;
  }

  draw() {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !this.frames) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    this.lastSize = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    const { f, dark, rim } = this.frames[this.frameIndex];
    const maxH = Math.max(...this.frames.map((fr) => fr.f.artH));
    const n = Math.max(1, Math.floor((h * 0.92) / maxH));
    const baseX = Math.round(w * 0.5);
    const baseY = Math.round(h * 0.97);
    const dw = f.artW * n;
    const dh = f.artH * n;
    // Mirrored so the fighter faces left toward the menu; keep the anchor fixed.
    const x = baseX - dw + Math.round(f.anchorArtX * n);
    const y = baseY - dh;
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    const fx = w - x - dw;
    ctx.drawImage(rim, fx - Math.max(2, Math.round(n * 0.6)), y, dw, dh);
    ctx.drawImage(dark, fx, y, dw, dh);
    ctx.globalAlpha = 0.12;
    ctx.drawImage(f.canvas, fx, y, dw, dh);
    ctx.globalAlpha = 1;
  }
}
