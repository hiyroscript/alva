// CITY — dense rooftop district at night. Vertical routes over platforms,
// dark structures with orange accent lighting.

import { StageTheme, ParticleField } from './stage-theme.js';
import { mulberry32, range } from '../core/utils.js';

const C = {
  sky: ['#040406', '#09090d', '#141016', '#2a1912'],
  star: '#e9e6df',
  moon: '#d9d5cc',
  far: '#111116',
  farWin: 'rgba(255, 170, 90, 0.28)',
  mid: '#17171c',
  midEdge: '#202027',
  warm: 'rgba(255, 158, 64, 0.75)',
  cool: 'rgba(220, 226, 240, 0.32)',
  near: '#1d1d22',
  nearEdge: '#2b2b32',
  nearWarm: 'rgba(255, 172, 92, 0.85)',
  orange: '#ff7a00',
  orangeHi: '#ff9a2e',
  roofTop: '#5a5a62',
  roof: '#2e2e34',
  facade: '#19191d',
  metalTop: '#6a6a74',
  metal: '#3c3c44',
  metalDark: '#26262c',
  rail: '#4c4c55',
  wood: '#5b5048',
  concrete: '#2f2f35',
};

export class CityTheme extends StageTheme {
  constructor(map, opts) {
    super(map, opts);
    this.shadow = { alpha: 0.38, skew: 0, stretch: 1 };
    this.build();
  }

  build() {
    const m = this.map;
    const rng = mulberry32(0xc17e);
    const G = m.groundLevel;
    const bottom = m.worldHeight + 800;

    // Stars (screen-space fractions)
    this.stars = Array.from({ length: 70 }, () => ({
      x: rng(), y: rng() * 0.5, s: rng() < 0.15 ? 2 : 1, a: range(rng, 0.25, 0.8), tw: rng() < 0.2 ? range(rng, 1, 3) : 0, p: rng() * 6,
    }));

    // Layer 1: far skyline (0.1)
    this.far = new Path2D();
    this.farWin = new Path2D();
    this.beacons = [];
    let x = -200;
    const farEnd = m.worldWidth * 0.1 + 1800;
    while (x < farEnd) {
      const w = range(rng, 40, 110);
      const h = range(rng, 70, 260);
      const base = G - 170;
      this.far.rect(x, base - h, w, bottom - base + h);
      if (rng() < 0.35) {
        const ax = x + w * range(rng, 0.2, 0.8);
        const ah = range(rng, 20, 60);
        this.far.rect(ax, base - h - ah, 2, ah);
        if (rng() < 0.6) this.beacons.push({ x: ax + 1, y: base - h - ah, p: rng() * 3 });
      } else if (rng() < 0.4) {
        this.far.rect(x + w * 0.2, base - h - 14, w * 0.6, 14);
      }
      for (let wy = base - h + 8; wy < base; wy += 11) {
        for (let wx = x + 5; wx < x + w - 5; wx += 9) {
          if (rng() < 0.09) this.farWin.rect(wx, wy, 3, 4);
        }
      }
      x += w + range(rng, -10, 16);
    }

    // Layer 2: mid skyline (0.28) + elevated rail line
    this.mid = new Path2D();
    this.midEdge = new Path2D();
    this.midWarm = new Path2D();
    this.midCool = new Path2D();
    this.flicker = [];
    x = -200;
    const midEnd = m.worldWidth * 0.28 + 1800;
    while (x < midEnd) {
      const w = range(rng, 70, 160);
      const h = range(rng, 170, 430);
      const base = G - 90;
      const top = base - h;
      this.mid.rect(x, top, w, bottom - top);
      this.midEdge.rect(x + w - 3, top, 3, h);
      this.midEdge.rect(x, top, w, 3);
      if (rng() < 0.4) this.mid.rect(x + w * 0.3, top - 24, w * 0.4, 24);
      const cols = Math.floor((w - 12) / 12);
      for (let wy = top + 14; wy < base - 10; wy += 16) {
        for (let c = 0; c < cols; c++) {
          const wx = x + 8 + c * 12;
          const r = rng();
          if (r < 0.16) this.midWarm.rect(wx, wy, 5, 8);
          else if (r < 0.22) this.midCool.rect(wx, wy, 5, 8);
          else if (r < 0.225 && this.flicker.length < 18) this.flicker.push({ x: wx, y: wy, p: rng() * 10, rate: range(rng, 0.2, 0.6) });
        }
      }
      x += w + range(rng, 4, 40);
    }
    this.railY = G - 214;
    this.rail = new Path2D();
    this.rail.rect(-200, this.railY, midEnd + 400, 7);
    for (let px = -160; px < midEnd; px += 180) this.rail.rect(px, this.railY + 7, 8, 200);
    this.trainLen = 260;
    this.railSpan = midEnd + 600;

    this.searchlights = [
      { x: 520, phase: 0, speed: 0.23, spread: 0.07 },
      { x: 1480, phase: 2.2, speed: 0.17, spread: 0.06 },
    ];

    // Layer 3: near buildings (0.55): water towers, billboards, crane
    this.near = new Path2D();
    this.nearEdge = new Path2D();
    this.nearWarm = new Path2D();
    this.neon = [];
    x = -150;
    const nearEnd = m.worldWidth * 0.55 + 1800;
    let n = 0;
    while (x < nearEnd) {
      const w = range(rng, 150, 280);
      const h = range(rng, 160, 360);
      const base = G - 40;
      const top = base - h;
      this.near.rect(x, top, w, bottom - top);
      this.nearEdge.rect(x, top, w, 4);
      this.nearEdge.rect(x + w - 5, top, 5, h);
      for (let wy = top + 22; wy < base - 20; wy += 26) {
        for (let wx = x + 14; wx < x + w - 18; wx += 22) {
          if (rng() < 0.13) this.nearWarm.rect(wx, wy, 8, 12);
        }
      }
      const extra = n % 3;
      if (extra === 0) this.addWaterTower(x + w * range(rng, 0.2, 0.6), top);
      else if (extra === 1) this.addBillboard(rng, x + w * 0.12, top, w * 0.7);
      else if (rng() < 0.6) this.addCrane(x + w * 0.5, top);
      x += w + range(rng, 30, 120);
      n++;
    }

    // Layer 4: roof, bounds buildings, platform structures
    this.buildRoof(rng);
    this.buildBounds(rng);
    this.buildPlatforms(rng);

    // Layer 5: atmosphere
    const prng = mulberry32(0xa11e);
    this.motes = new ParticleField(prng, this.reducedMotion ? 12 : 36, { speed: [-10, 14], size: [0.6, 1.4], drift: [-6, 2], depth: [0.9, 1.3], alpha: [0.12, 0.4], band: [0, 1] });
    this.embers = new ParticleField(prng, this.reducedMotion ? 4 : 12, { speed: [6, 22], size: [0.8, 1.6], drift: [-14, -4], depth: [1, 1.2], alpha: [0.3, 0.7], band: [0.2, 1] });
  }

  addWaterTower(x, roofY) {
    const p = this.near;
    const legH = 46;
    const tankH = 60;
    const tankW = 54;
    p.rect(x + 6, roofY - legH, 4, legH);
    p.rect(x + tankW - 10, roofY - legH, 4, legH);
    p.rect(x + tankW / 2 - 2, roofY - legH, 4, legH);
    p.rect(x, roofY - legH - tankH, tankW, tankH);
    p.moveTo(x - 4, roofY - legH - tankH);
    p.lineTo(x + tankW / 2, roofY - legH - tankH - 24);
    p.lineTo(x + tankW + 4, roofY - legH - tankH);
    p.closePath();
    this.nearEdge.rect(x, roofY - legH - tankH + 18, tankW, 2);
    this.nearEdge.rect(x, roofY - legH - tankH + 40, tankW, 2);
  }

  addBillboard(rng, x, roofY, w) {
    const h = Math.min(90, w * 0.45);
    const y = roofY - h - 34;
    this.near.rect(x + w * 0.2, roofY - 34, 5, 34);
    this.near.rect(x + w * 0.75, roofY - 34, 5, 34);
    this.near.rect(x, y, w, h);
    this.nearEdge.rect(x, y, w, 3);
    this.nearEdge.rect(x, y + h - 3, w, 3);
    // Abstract neon mark: bars + slash (original, no text)
    const bars = [];
    const bx = x + w * 0.12;
    const bw = w * 0.76;
    const rows = 3;
    for (let i = 0; i < rows; i++) {
      const len = bw * range(rng, 0.35, 1);
      bars.push([bx, y + h * (0.28 + i * 0.2), len, 4]);
    }
    this.neon.push({ bars, phase: rng() * 10 });
  }

  addCrane(x, roofY) {
    const p = this.near;
    const mastH = 230;
    p.rect(x - 5, roofY - mastH, 10, mastH);
    p.rect(x - 150, roofY - mastH, 260, 7);
    p.rect(x + 80, roofY - mastH + 7, 22, 16);
    p.rect(x - 110, roofY - mastH + 7, 2, 70);
    p.rect(x - 116, roofY - mastH + 77, 14, 10);
    p.moveTo(x - 5, roofY - mastH);
    p.lineTo(x, roofY - mastH - 30);
    p.lineTo(x + 5, roofY - mastH);
    p.closePath();
    this.beaconsNear = this.beaconsNear || [];
    this.beaconsNear.push({ x, y: roofY - mastH - 30, p: x % 3 });
  }

  buildRoof(rng) {
    const m = this.map;
    const G = m.groundLevel;
    this.roofDetail = new Path2D();
    this.roofLights = new Path2D();
    this.facadeWin = new Path2D();
    // Facade windows below the roof line
    for (let wy = G + 40; wy < m.worldHeight + 60; wy += 34) {
      for (let wx = m.bounds.left + 20; wx < m.bounds.right - 20; wx += 30) {
        if (rng() < 0.18) this.facadeWin.rect(wx, wy, 12, 16);
      }
    }
    // Background roof props (behind fighters)
    for (let px = m.bounds.left + 90; px < m.bounds.right - 60; px += range(rng, 180, 360)) {
      const kind = rng();
      if (kind < 0.35) {
        // antenna mast
        this.roofDetail.rect(px, G - 120, 3, 120);
        this.roofDetail.rect(px - 14, G - 100, 31, 2);
        this.roofDetail.rect(px - 10, G - 80, 23, 2);
        this.roofLights.rect(px - 1, G - 124, 5, 5);
      } else if (kind < 0.6) {
        // low AC box
        const w = range(rng, 40, 70);
        this.roofDetail.rect(px, G - 30, w, 30);
      } else if (kind < 0.8) {
        // pipe run
        this.roofDetail.rect(px, G - 12, range(rng, 90, 180), 6);
        this.roofDetail.rect(px, G - 18, 6, 18);
      } else {
        // satellite dish
        this.roofDetail.moveTo(px, G - 44);
        this.roofDetail.quadraticCurveTo(px + 16, G - 20, px + 34, G - 50);
        this.roofDetail.lineTo(px, G - 44);
        this.roofDetail.rect(px + 14, G - 30, 4, 30);
      }
    }
  }

  buildBounds(rng) {
    const m = this.map;
    const G = m.groundLevel;
    const top = -300;
    this.bounds = new Path2D();
    this.boundsEdge = new Path2D();
    this.boundsWin = new Path2D();
    const wall = (x0, x1, faceX) => {
      this.bounds.rect(x0, top, x1 - x0, m.worldHeight - top + 400);
      this.boundsEdge.rect(faceX - 3, top, 6, G - top);
      for (let wy = top + 30; wy < G - 30; wy += 30) {
        for (let wx = x0 + 18; wx < x1 - 14; wx += 26) {
          if (rng() < 0.2) this.boundsWin.rect(wx, wy, 10, 14);
        }
      }
    };
    wall(-400, m.bounds.left, m.bounds.left);
    wall(m.bounds.right, m.worldWidth + 400, m.bounds.right);
  }

  buildPlatforms(rng) {
    const m = this.map;
    const G = m.groundLevel;
    const P = {
      top: new Path2D(), metal: new Path2D(), dark: new Path2D(), rail: new Path2D(),
      wood: new Path2D(), concrete: new Path2D(), hazard: new Path2D(), lights: new Path2D(),
      panel: new Path2D(), stroke: new Path2D(), tank: new Path2D(), tankRoof: new Path2D(), tankBand: new Path2D(),
    };
    this.plat = P;
    this.signs = [];

    for (const p of m.platforms) {
      const { x, y, w } = p;
      const h = p.h || 16;
      switch (p.kind) {
        case 'rack': {
          P.metal.rect(x, y, w, h);
          P.top.rect(x, y, w, 3);
          for (let gx = x + 6; gx < x + w - 4; gx += 8) P.dark.rect(gx, y + 5, 3, h - 7);
          for (const lx of [x + 8, x + w / 2 - 3, x + w - 14]) P.dark.rect(lx, y + h, 6, G - y - h);
          P.stroke.moveTo(x + 11, y + h);
          P.stroke.lineTo(x + w / 2, G - 4);
          P.stroke.moveTo(x + w - 11, y + h);
          P.stroke.lineTo(x + w / 2, G - 4);
          // ducting running behind
          P.dark.rect(x - 20, G - 34, w + 40, 18);
          break;
        }
        case 'catwalk': {
          // Billboard structure above, walkway below
          const bh = 118;
          const by = y - bh - 30;
          P.dark.rect(x + 18, by, 10, G - by);
          P.dark.rect(x + w - 28, by, 10, G - by);
          P.panel.rect(x - 6, by, w + 12, bh);
          P.metal.rect(x - 6, by, w + 12, 4);
          P.metal.rect(x - 6, by + bh - 4, w + 12, 4);
          this.signs.push({ x: x + 16, y: by + 20, w: w - 32, h: bh - 40, phase: rng() * 10 });
          // railing
          for (let rx = x + 4; rx < x + w; rx += 28) P.rail.rect(rx, y - 26, 3, 26);
          P.rail.rect(x, y - 27, w, 3);
          P.rail.rect(x, y - 14, w, 2);
          P.metal.rect(x, y, w, h);
          P.top.rect(x, y, w, 3);
          P.lights.rect(x + 6, y + h - 4, w - 12, 2);
          break;
        }
        case 'girder': {
          // I-beam + truss + concrete piers
          P.top.rect(x, y, w, 4);
          P.metal.rect(x, y + 4, w, h - 8);
          P.top.rect(x, y + h - 4, w, 4);
          for (let rx = x + 10; rx < x + w - 6; rx += 20) P.dark.rect(rx, y + h / 2 - 1, 3, 3);
          const ty = y + h;
          const tb = ty + 36;
          P.stroke.moveTo(x + 8, ty);
          for (let tx = x + 8, up = false; tx <= x + w - 8; tx += 32, up = !up) P.stroke.lineTo(tx, up ? ty : tb);
          P.dark.rect(x + 8, tb - 3, w - 16, 4);
          for (const px of [x + 14, x + w - 38]) {
            P.concrete.rect(px, tb, 24, G - tb);
            P.hazard.rect(px, tb + 6, 24, 6);
          }
          break;
        }
        case 'deck': {
          // Water tower on legs; the deck is its walkway
          P.metal.rect(x, y, w, h);
          P.top.rect(x, y, w, 3);
          for (const lx of [x + 10, x + w - 18]) P.dark.rect(lx, y + h, 8, G - y - h);
          P.stroke.moveTo(x + 14, y + h);
          P.stroke.lineTo(x + w - 14, G - 2);
          P.stroke.moveTo(x + w - 14, y + h);
          P.stroke.lineTo(x + 14, G - 2);
          const tx = x + 28;
          const tw = w - 56;
          const tH = 104;
          P.tank.rect(tx, y - tH, tw, tH);
          P.tankRoof.moveTo(tx - 8, y - tH + 2);
          P.tankRoof.lineTo(tx + tw / 2, y - tH - 34);
          P.tankRoof.lineTo(tx + tw + 8, y - tH + 2);
          P.tankRoof.closePath();
          for (let by = y - tH + 18; by < y - 6; by += 24) P.tankBand.rect(tx - 2, by, tw + 4, 3);
          for (let sx = tx + 12; sx < tx + tw - 4; sx += 14) P.tankBand.rect(sx, y - tH + 4, 1.5, tH - 8);
          for (let rx = x + 4; rx < x + w; rx += 30) P.rail.rect(rx, y - 24, 3, 24);
          P.rail.rect(x, y - 25, w, 3);
          P.lights.rect(tx + tw / 2 - 2, y - tH - 40, 4, 4);
          break;
        }
        case 'scaffold': {
          P.wood.rect(x, y, w, h);
          P.top.rect(x, y, w, 2);
          for (let sx = x + 6; sx <= x + w - 6; sx += 48) P.rail.rect(sx, y + h, 4, G - y - h);
          for (let sy = y + h + 40; sy < G - 10; sy += 44) P.rail.rect(x + 6, sy, w - 12, 3);
          for (let sx = x + 6; sx + 48 <= x + w - 6; sx += 96) {
            P.stroke.moveTo(sx + 2, y + h);
            P.stroke.lineTo(sx + 50, G - 4);
          }
          P.hazard.rect(x, y + h, w, 3);
          break;
        }
        default: {
          P.metal.rect(x, y, w, h);
          P.top.rect(x, y, w, 3);
        }
      }
    }

    // Solid bulkheads
    for (const s of m.solids) {
      P.concrete.rect(s.x, s.y, s.w, s.h);
      P.top.rect(s.x - 2, s.y, s.w + 4, 4);
      P.dark.rect(s.x + s.w * 0.3, s.y + 22, 36, s.h - 22);
      P.lights.rect(s.x + s.w * 0.3 + 14, s.y + 12, 8, 4);
      for (let ly = s.y + 26; ly < s.y + s.h - 14; ly += 8) P.dark.rect(s.x + s.w - 44, ly, 30, 3);
    }
  }

  resize(view) {
    const ctx = view.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, view.pxH);
    g.addColorStop(0, C.sky[0]);
    g.addColorStop(0.45, C.sky[1]);
    g.addColorStop(0.78, C.sky[2]);
    g.addColorStop(1, C.sky[3]);
    this.skyGrad = g;
    // Edge-only vignette (two narrow bands) keeps full-screen overdraw low.
    this.vignetteW = Math.round(view.pxW * 0.16);
    const l = ctx.createLinearGradient(0, 0, this.vignetteW, 0);
    l.addColorStop(0, 'rgba(0,0,0,0.42)');
    l.addColorStop(1, 'rgba(0,0,0,0)');
    const r = ctx.createLinearGradient(view.pxW - this.vignetteW, 0, view.pxW, 0);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, 'rgba(0,0,0,0.42)');
    this.vignetteL = l;
    this.vignetteR = r;
  }

  update(dt, view) {
    super.update(dt);
    this.motes.update(dt, view);
    this.embers.update(dt, view);
  }

  drawBackground(ctx, view) {
    const m = this.map;
    const G = m.groundLevel;
    const s = view.scale;
    const t = this.time;
    const still = this.reducedMotion;

    // Layer 0 — sky, stars, moon
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, view.pxW, view.pxH);
    ctx.fillStyle = C.star;
    const shift = view.x * s * 0.01;
    for (const st of this.stars) {
      const tw = st.tw && !still ? 0.55 + 0.45 * Math.sin(t * st.tw + st.p) : 1;
      ctx.globalAlpha = st.a * tw;
      const sx = ((st.x * view.pxW - shift) % view.pxW + view.pxW) % view.pxW;
      ctx.fillRect(Math.round(sx), Math.round(st.y * view.pxH), st.s * Math.max(1, s * 0.5), st.s * Math.max(1, s * 0.5));
    }
    ctx.globalAlpha = 1;
    const mx = view.pxW * 0.2 - view.x * s * 0.015;
    const my = view.pxH * 0.2;
    const mr = 26 * s;
    const glow = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 4);
    glow.addColorStop(0, 'rgba(230, 226, 214, 0.18)');
    glow.addColorStop(1, 'rgba(230, 226, 214, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    ctx.fillStyle = C.moon;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Searchlights (behind the far skyline)
    this.layer(ctx, view, 0.1, 0.12);
    for (const sl of this.searchlights) {
      const a = still ? sl.phase * 0.2 : Math.sin(t * sl.speed + sl.phase) * 0.5;
      const bx = sl.x;
      const by = G - 170;
      const len = 900;
      const ex = bx + Math.sin(a) * len;
      const ey = by - Math.cos(a) * len;
      const px = Math.cos(a) * len * sl.spread;
      const py = Math.sin(a) * len * sl.spread;
      const grad = ctx.createLinearGradient(bx, by, ex, ey);
      grad.addColorStop(0, 'rgba(255, 214, 160, 0.14)');
      grad.addColorStop(1, 'rgba(255, 214, 160, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ex - px, ey - py);
      ctx.lineTo(ex + px, ey + py);
      ctx.closePath();
      ctx.fill();
    }

    // Horizon glow (light pollution)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const hy = (G - 260 - (this.refY + (view.y - this.refY) * 0.12)) * s;
    const hg = ctx.createLinearGradient(0, hy, 0, hy + 220 * s);
    hg.addColorStop(0, 'rgba(255, 122, 0, 0)');
    hg.addColorStop(1, 'rgba(255, 122, 0, 0.12)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, hy, view.pxW, 220 * s);

    // Layer 1 — far skyline
    this.layer(ctx, view, 0.1, 0.12);
    ctx.fillStyle = C.far;
    ctx.fill(this.far);
    ctx.fillStyle = C.farWin;
    ctx.fill(this.farWin);
    ctx.fillStyle = C.orange;
    for (const b of this.beacons) {
      const on = still || Math.sin(t * 2.4 + b.p) > 0.2;
      if (on) ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
    }

    // Layer 2 — mid skyline + rail + train
    this.layer(ctx, view, 0.28, 0.3);
    ctx.fillStyle = C.mid;
    ctx.fill(this.mid);
    ctx.fillStyle = C.midEdge;
    ctx.fill(this.midEdge);
    ctx.fillStyle = C.warm;
    ctx.fill(this.midWarm);
    ctx.fillStyle = C.cool;
    ctx.fill(this.midCool);
    for (const f of this.flicker) {
      const on = still ? 1 : Math.sin(t * f.rate + f.p) > 0 ? 1 : 0;
      if (on) {
        ctx.fillStyle = C.warm;
        ctx.fillRect(f.x, f.y, 5, 8);
      }
    }
    ctx.fillStyle = '#1e1e24';
    ctx.fill(this.rail);
    const tx = still ? 400 : ((t * 90) % this.railSpan) - 300;
    ctx.fillStyle = '#26262d';
    ctx.fillRect(tx, this.railY - 16, this.trainLen, 15);
    ctx.fillStyle = 'rgba(255, 200, 140, 0.8)';
    for (let wx = tx + 8; wx < tx + this.trainLen - 8; wx += 14) ctx.fillRect(wx, this.railY - 12, 8, 5);
    ctx.fillStyle = C.orangeHi;
    ctx.fillRect(tx + this.trainLen - 3, this.railY - 10, 3, 3);

    // Layer 3 — near buildings
    this.layer(ctx, view, 0.55, 0.58);
    ctx.fillStyle = C.near;
    ctx.fill(this.near);
    ctx.fillStyle = C.nearEdge;
    ctx.fill(this.nearEdge);
    ctx.fillStyle = C.nearWarm;
    ctx.fill(this.nearWarm);
    for (const sign of this.neon) {
      const flick = still ? 1 : Math.sin(t * 7 + sign.phase) > -0.92 ? 1 : 0.35;
      ctx.globalAlpha = 0.28 * flick;
      ctx.fillStyle = C.orange;
      for (const b of sign.bars) ctx.fillRect(b[0] - 3, b[1] - 3, b[2] + 6, b[3] + 6);
      ctx.globalAlpha = flick;
      ctx.fillStyle = C.orangeHi;
      for (const b of sign.bars) ctx.fillRect(b[0], b[1], b[2], b[3]);
    }
    ctx.globalAlpha = 1;
    if (this.beaconsNear) {
      ctx.fillStyle = C.orange;
      for (const b of this.beaconsNear) {
        if (still || Math.sin(t * 1.8 + b.p) > 0) ctx.fillRect(b.x - 2, b.y - 2, 4, 4);
      }
    }
  }

  drawTerrain(ctx, view) {
    const m = this.map;
    const G = m.groundLevel;
    const t = this.time;
    this.layer(ctx, view, 1, 1);

    // Boundary buildings
    ctx.fillStyle = '#141418';
    ctx.fill(this.bounds);
    ctx.fillStyle = C.nearEdge;
    ctx.fill(this.boundsEdge);
    ctx.fillStyle = 'rgba(255, 170, 90, 0.55)';
    ctx.fill(this.boundsWin);

    // Roof props behind the play area
    ctx.fillStyle = '#26262c';
    ctx.fill(this.roofDetail);
    ctx.fillStyle = C.orange;
    if (this.reducedMotion || Math.sin(t * 2) > -0.3) ctx.fill(this.roofLights);

    // Platform structures
    const P = this.plat;
    ctx.fillStyle = '#131316';
    ctx.fill(P.panel);
    for (const sgn of this.signs) this.drawSign(ctx, sgn, t);
    ctx.fillStyle = C.metalDark;
    ctx.fill(P.dark);
    ctx.strokeStyle = C.metalDark;
    ctx.lineWidth = 3;
    ctx.stroke(P.stroke);
    ctx.fillStyle = C.concrete;
    ctx.fill(P.concrete);
    ctx.fillStyle = C.rail;
    ctx.fill(P.rail);
    ctx.fillStyle = C.wood;
    ctx.fill(P.wood);
    ctx.fillStyle = '#2c2a29';
    ctx.fill(P.tank);
    ctx.fillStyle = '#232122';
    ctx.fill(P.tankRoof);
    ctx.fillStyle = '#3d3a38';
    ctx.fill(P.tankBand);
    ctx.fillStyle = C.metal;
    ctx.fill(P.metal);
    ctx.fillStyle = C.metalTop;
    ctx.fill(P.top);
    ctx.fillStyle = C.orange;
    ctx.fill(P.hazard);
    ctx.fill(P.lights);

    // Main roof
    ctx.fillStyle = C.facade;
    ctx.fillRect(-100, G, m.worldWidth + 200, m.worldHeight - G + 400);
    ctx.fillStyle = C.roof;
    ctx.fillRect(-100, G, m.worldWidth + 200, 16);
    ctx.fillStyle = C.roofTop;
    ctx.fillRect(-100, G, m.worldWidth + 200, 3);
    ctx.fillStyle = 'rgba(255, 170, 90, 0.4)';
    ctx.fill(this.facadeWin);
  }

  drawSign(ctx, s, t) {
    // Original abstract neon billboard: orange frame + chevrons.
    const flick = this.reducedMotion ? 1 : Math.sin(t * 5 + s.phase) > -0.95 ? 1 : 0.4;
    ctx.globalAlpha = 0.9 * flick;
    ctx.strokeStyle = C.orange;
    ctx.lineWidth = 3;
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    ctx.globalAlpha = 0.18 * flick;
    ctx.lineWidth = 9;
    ctx.strokeRect(s.x, s.y, s.w, s.h);
    ctx.globalAlpha = flick;
    ctx.fillStyle = '#f2f2f2';
    const cy = s.y + s.h / 2;
    const size = s.h * 0.28;
    for (let i = 0; i < 3; i++) {
      const cx = s.x + s.w * 0.3 + i * size * 1.3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size * 0.8, cy);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - size * 0.35, cy + size);
      ctx.lineTo(cx + size * 0.45, cy);
      ctx.lineTo(cx - size * 0.35, cy - size);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = C.orangeHi;
    ctx.fillRect(s.x + s.w * 0.3 + size * 4.2, cy - 3, Math.max(0, s.w * 0.62 - size * 4.2), 6);
    ctx.globalAlpha = 1;
  }

  drawForeground(ctx, view) {
    this.motes.draw(ctx, view, '#d8d8e0');
    this.embers.draw(ctx, view, C.orangeHi);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.vignetteL;
    ctx.fillRect(0, 0, this.vignetteW, view.pxH);
    ctx.fillStyle = this.vignetteR;
    ctx.fillRect(view.pxW - this.vignetteW, 0, this.vignetteW, view.pxH);
  }
}
