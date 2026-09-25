// CITY — one rooftop block in a dense district at night. Vertical routes
// over platforms, dark structures with warm neon accent lighting. These are
// scene colours of the stage artwork, not part of the monochrome Alva
// interface palette.
//
// The skyline is flat parallax (stars, moon, searchlights, far and mid
// skylines with the elevated train, near towers), darkening into the street
// canyon below the roof. The rooftop block, its platforms and the stair
// bulkhead are drawn in the shared one-point perspective
// (js/stages/perspective.js), like Practice Ground: a roof that recedes in
// depth with its props standing on it, a lit facade in front and the
// building's side past whichever ledge the view looks beyond; every
// platform is a slab with depth, with its legs, rails and structures on
// planes at its back and front. Their edges are exactly the collision's
// (map.mainStage, map.platforms, map.solids).

import { StageTheme, ParticleField } from './stage-theme.js';
import { fillQuad, quadGradient, clipAboveRim } from './perspective.js';
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
  canyon: [[0, 'rgba(4, 4, 6, 0)'], [0.3, 'rgba(4, 4, 6, 0.62)'], [1, 'rgba(4, 4, 6, 0.9)']],
  orange: '#ff7a00',
  orangeHi: '#ff9a2e',
  // The rooftop block.
  roofTop: [[0, '#26262c'], [1, '#3a3a42']],
  roofSeam: 'rgba(12, 12, 14, 0.45)',
  coping: '#6a6a74',
  corner: [[0, 'rgba(150, 150, 164, 0.75)'], [1, 'rgba(150, 150, 164, 0)']],
  copingShadow: 'rgba(0, 0, 0, 0.45)',
  facade: [[0, '#222228'], [0.3, '#19191d'], [1, '#111114']],
  facadeSide: [[0, '#141417'], [1, '#0b0b0d']],
  facadeLit: [[0, '#2a2a31'], [1, '#17171b']],
  facadeWin: 'rgba(255, 170, 90, 0.42)',
  facadeBand: 'rgba(0, 0, 0, 0.35)',
  canyonFace: [[0, 'rgba(6, 6, 8, 0)'], [1, 'rgba(6, 6, 8, 0.92)']],
  prop: '#26262c',
  // Platforms and the bulkhead.
  metalTop: '#6a6a74',
  metal: '#3c3c44',
  metalSide: '#2c2c33',
  metalDark: '#26262c',
  rail: '#4c4c55',
  railBack: '#34343b',
  wood: '#5b5048',
  woodTop: '#766960',
  woodSide: '#3f3731',
  concrete: '#2f2f35',
  concreteTop: '#44444c',
  concreteSide: '#232328',
  panel: '#131316',
  tank: '#2c2a29',
  tankRoof: '#232122',
  tankBand: '#3d3a38',
};

// Depth of the roof (back edge to front edge), of every platform slab and
// of the billboards and tanks standing behind or on them. The fighters stand
// at 1.
const ROOF = { back: 0.66, front: 1.06 };
const PLAT = { back: 0.93, front: 1.05 };
const SIGN_DEPTH = 0.9;
const TANK_DEPTH = 0.97;
const BULK = { back: 0.9, front: 1.05 };
// Roof props stand on the roof at these depths.
const PROP_DEPTHS = [0.74, 0.84];
// Camera height over the roof at the reference view (world units).
const RISE = 240;
// Where the facade fades into the dark street canyon below (world units
// under the roof).
const CANYON_FROM = 160;
const CANYON_TO = 760;

export class CityTheme extends StageTheme {
  constructor(map, opts) {
    super(map, opts);
    this.shadow = { alpha: 0.38, skew: 0, stretch: 1 };
    this.persp = this.perspective(RISE);
    this.faces = {};
    this.build();
  }

  build() {
    const m = this.map;
    const rng = mulberry32(0xc17e);
    const G = this.groundY;
    const cb = m.cameraBounds;
    // Far enough down and across for every camera position, at any parallax.
    const bottom = cb.bottom + 600;
    const end = (p) => cb.right * p + 2400;

    // Stars (screen-space fractions)
    this.stars = Array.from({ length: 70 }, () => ({
      x: rng(), y: rng() * 0.5, s: rng() < 0.15 ? 2 : 1, a: range(rng, 0.25, 0.8), tw: rng() < 0.2 ? range(rng, 1, 3) : 0, p: rng() * 6,
    }));

    // Layer 1: far skyline (0.1)
    this.far = new Path2D();
    this.farWin = new Path2D();
    this.beacons = [];
    let x = -200;
    const farEnd = end(0.1);
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
    const midEnd = end(0.28);
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
    const nearEnd = end(0.55);
    let n = 0;
    while (x < nearEnd) {
      const w = range(rng, 150, 280);
      const h = range(rng, 160, 360);
      const base = G - 40;
      const top = base - h;
      this.near.rect(x, top, w, bottom - top);
      this.nearEdge.rect(x, top, w, 4);
      this.nearEdge.rect(x + w - 5, top, 5, h);
      // Windows all the way down: past the ledges these towers are the
      // street canyon's walls.
      for (let wy = top + 22; wy < G + 820; wy += 26) {
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

    // Layer 4: the rooftop block, its platforms and the bulkhead
    this.buildRoof(rng);
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

  // The roof's art, authored in world units on flat planes and cached: its
  // facade (windows and floor bands down the front face) and the props
  // standing on it at a couple of depths behind the fighters.
  buildRoof(rng) {
    const { left, right, bottom } = this.map.mainStage;
    const G = this.groundY;
    this.facadeWin = new Path2D();
    this.facadeBands = new Path2D();
    for (let wy = G + 40; wy < bottom - 40; wy += 34) {
      for (let wx = left + 20; wx < right - 20; wx += 30) {
        if (rng() < 0.18) this.facadeWin.rect(wx, wy, 12, 16);
      }
    }
    for (let by = G + 24; by < bottom; by += 102) this.facadeBands.rect(left, by, right - left, 5);
    // Props on the roof, one row per depth.
    this.props = PROP_DEPTHS.map((f) => {
      const detail = new Path2D();
      const lights = new Path2D();
      for (let px = left + range(rng, 60, 180); px < right - 80; px += range(rng, 220, 420)) {
        const kind = rng();
        if (kind < 0.35) {
          // antenna mast
          detail.rect(px, G - 120, 3, 120);
          detail.rect(px - 14, G - 100, 31, 2);
          detail.rect(px - 10, G - 80, 23, 2);
          lights.rect(px - 1, G - 124, 5, 5);
        } else if (kind < 0.6) {
          // low AC box
          const w = range(rng, 40, 70);
          detail.rect(px, G - 30, w, 30);
        } else if (kind < 0.8) {
          // pipe run
          detail.rect(px, G - 12, range(rng, 90, 180), 6);
          detail.rect(px, G - 18, 6, 18);
        } else {
          // satellite dish
          detail.moveTo(px, G - 44);
          detail.quadraticCurveTo(px + 16, G - 20, px + 34, G - 50);
          detail.lineTo(px, G - 44);
          detail.rect(px + 14, G - 30, 4, 30);
        }
      }
      return { f, detail, lights };
    });
  }

  // Each platform as a slab in depth (its box, drawn each frame) with its
  // structures on flat planes, cached: `back` behind the slab (back legs and
  // rail, billboards, ducting), `front` in front of it (front legs, rail,
  // lights, trusses) and `on` for things standing on the deck (a tank).
  buildPlatforms(rng) {
    const m = this.map;
    const G = this.groundY;
    const layer = () => ({
      metal: new Path2D(), dark: new Path2D(), rail: new Path2D(), stroke: new Path2D(),
      concrete: new Path2D(), hazard: new Path2D(), lights: new Path2D(), panel: new Path2D(),
      tank: new Path2D(), tankRoof: new Path2D(), tankBand: new Path2D(),
    });
    this.platformArt = [];
    for (const p of m.platforms) {
      const { x, y, w } = p;
      const h = p.h || 16;
      const back = layer();
      const front = layer();
      const on = layer();
      const signs = [];
      const box = { x0: x, x1: x + w, top: y, bottom: y + h, ...PLAT };
      let paint = 'metal';
      // Legs from the slab's underside to the roof, on both planes.
      const legs = (xs, lw) => {
        for (const lx of xs) {
          back.dark.rect(lx, y + h, lw, G - y - h);
          front.dark.rect(lx, y + h, lw, G - y - h);
        }
      };
      switch (p.kind) {
        case 'rack': {
          legs([x + 8, x + w / 2 - 3, x + w - 14], 6);
          front.stroke.moveTo(x + 11, y + h);
          front.stroke.lineTo(x + w / 2, G - 4);
          front.stroke.moveTo(x + w - 11, y + h);
          front.stroke.lineTo(x + w / 2, G - 4);
          for (let gx = x + 6; gx < x + w - 4; gx += 8) front.dark.rect(gx, y + 5, 3, h - 7);
          // ducting running behind
          back.dark.rect(x - 20, G - 34, w + 40, 18);
          break;
        }
        case 'catwalk': {
          // Billboard structure behind, walkway in front of it
          const bh = 118;
          const by = y - bh - 30;
          const sign = layer();
          sign.dark.rect(x + 18, by, 10, G - by);
          sign.dark.rect(x + w - 28, by, 10, G - by);
          sign.panel.rect(x - 6, by, w + 12, bh);
          sign.metal.rect(x - 6, by, w + 12, 4);
          sign.metal.rect(x - 6, by + bh - 4, w + 12, 4);
          signs.push({ art: sign, x: x + 16, y: by + 20, w: w - 32, h: bh - 40, phase: rng() * 10 });
          legs([x + 10, x + w - 16], 6);
          for (const r of [back, front]) {
            for (let rx = x + 4; rx < x + w; rx += 28) r.rail.rect(rx, y - 26, 3, 26);
            r.rail.rect(x, y - 27, w, 3);
            r.rail.rect(x, y - 14, w, 2);
          }
          front.lights.rect(x + 6, y + h - 4, w - 12, 2);
          break;
        }
        case 'girder': {
          // I-beam + truss + concrete piers
          for (let rx = x + 10; rx < x + w - 6; rx += 20) front.dark.rect(rx, y + h / 2 - 1, 3, 3);
          front.metal.rect(x, y + 4, w, 2);
          front.metal.rect(x, y + h - 6, w, 2);
          const ty = y + h;
          const tb = ty + 36;
          for (const r of [back, front]) {
            r.stroke.moveTo(x + 8, ty);
            for (let tx = x + 8, up = false; tx <= x + w - 8; tx += 32, up = !up) r.stroke.lineTo(tx, up ? ty : tb);
            r.dark.rect(x + 8, tb - 3, w - 16, 4);
            for (const px of [x + 14, x + w - 38]) {
              r.concrete.rect(px, tb, 24, G - tb);
              r.hazard.rect(px, tb + 6, 24, 6);
            }
          }
          break;
        }
        case 'deck': {
          // Water tower standing on the deck; the deck is its walkway
          legs([x + 10, x + w - 18], 8);
          front.stroke.moveTo(x + 14, y + h);
          front.stroke.lineTo(x + w - 14, G - 2);
          front.stroke.moveTo(x + w - 14, y + h);
          front.stroke.lineTo(x + 14, G - 2);
          const tx = x + 28;
          const tw = w - 56;
          const tH = 104;
          on.tank.rect(tx, y - tH, tw, tH);
          on.tankRoof.moveTo(tx - 8, y - tH + 2);
          on.tankRoof.lineTo(tx + tw / 2, y - tH - 34);
          on.tankRoof.lineTo(tx + tw + 8, y - tH + 2);
          on.tankRoof.closePath();
          for (let by = y - tH + 18; by < y - 6; by += 24) on.tankBand.rect(tx - 2, by, tw + 4, 3);
          for (let sx = tx + 12; sx < tx + tw - 4; sx += 14) on.tankBand.rect(sx, y - tH + 4, 1.5, tH - 8);
          on.lights.rect(tx + tw / 2 - 2, y - tH - 40, 4, 4);
          for (const r of [back, front]) {
            for (let rx = x + 4; rx < x + w; rx += 30) r.rail.rect(rx, y - 24, 3, 24);
            r.rail.rect(x, y - 25, w, 3);
          }
          break;
        }
        case 'scaffold': {
          paint = 'wood';
          for (const r of [back, front]) {
            for (let sx = x + 6; sx <= x + w - 6; sx += 48) r.rail.rect(sx, y + h, 4, G - y - h);
            for (let sy = y + h + 40; sy < G - 10; sy += 44) r.rail.rect(x + 6, sy, w - 12, 3);
            for (let sx = x + 6; sx + 48 <= x + w - 6; sx += 96) {
              r.stroke.moveTo(sx + 2, y + h);
              r.stroke.lineTo(sx + 50, G - 4);
            }
          }
          front.hazard.rect(x, y + h - 3, w, 3);
          break;
        }
        default:
          legs([x + 8, x + w - 14], 6);
      }
      this.platformArt.push({ box, paint, back, front, on, signs });
    }

    // The stair bulkhead(s): a concrete box with a door and a lit sign.
    this.bulkheads = m.solids.map((so) => {
      const art = layer();
      const dw = Math.min(30, so.w * 0.4);
      art.dark.rect(so.x + so.w * 0.2, so.y + 22, dw, so.h - 22);
      art.lights.rect(so.x + so.w * 0.2 + dw / 2 - 4, so.y + 12, 8, 4);
      for (let ly = so.y + 26; ly < so.y + so.h - 14; ly += 8) art.dark.rect(so.x + so.w - 30, ly, 20, 3);
      return { box: { x0: so.x, x1: so.x + so.w, top: so.y, bottom: so.y + so.h, ...BULK }, art };
    });
  }

  // Fills a platform art layer (see buildPlatforms), back to front; its
  // railings in `rail` (darker on the back plane).
  paintLayer(ctx, L, rail = C.rail) {
    ctx.fillStyle = C.panel;
    ctx.fill(L.panel);
    ctx.fillStyle = rail;
    ctx.fill(L.rail);
    ctx.fillStyle = C.metalDark;
    ctx.fill(L.dark);
    ctx.strokeStyle = C.metalDark;
    ctx.lineWidth = 3;
    ctx.stroke(L.stroke);
    ctx.fillStyle = C.concrete;
    ctx.fill(L.concrete);
    ctx.fillStyle = C.tank;
    ctx.fill(L.tank);
    ctx.fillStyle = C.tankRoof;
    ctx.fill(L.tankRoof);
    ctx.fillStyle = C.tankBand;
    ctx.fill(L.tankBand);
    ctx.fillStyle = C.metal;
    ctx.fill(L.metal);
    ctx.fillStyle = C.orange;
    ctx.fill(L.hazard);
    ctx.fill(L.lights);
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
    const G = this.groundY;
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

    // The street canyon darkening below the roof's level: past the ledges
    // there is only a long drop between the towers.
    const rim = this.persp.y(view, G, ROOF.back);
    const depth = 520 * s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = quadGradient(ctx, [0, rim, 0, rim, 0, rim + depth, 0, rim + depth], C.canyon);
    ctx.fillRect(0, rim, view.pxW, view.pxH - rim);
  }

  // The rooftop block, then every platform and the bulkhead on it (never
  // below the roof's front edge).
  drawTerrain(ctx, view) {
    this.drawRoof(ctx, view);
    clipAboveRim(ctx, this.persp, view, this.groundY, ROOF.front);
    for (const art of this.platformArt) this.drawPlatform(ctx, view, art);
    for (const b of this.bulkheads) this.drawBulkhead(ctx, view, b);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // The roof in perspective with its props standing on it, the building's
  // side past whichever ledge the view looks beyond, then the facade in
  // front: windows and floor bands, the lit coping at the roof's edge, and
  // the dark of the street canyon swallowing it below.
  drawRoof(ctx, view) {
    const { left, right, bottom } = this.map.mainStage;
    const G = this.groundY;
    const p = this.persp;
    const t = this.time;
    const f = p.box(view, { x0: left, x1: right, top: G, bottom, ...ROOF }, this.faces);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (f.top) {
      fillQuad(ctx, f.top, quadGradient(ctx, f.top, C.roofTop));
      // Tar seams at constant depth.
      ctx.beginPath();
      for (const d of [0.72, 0.8, 0.88, 0.97]) {
        const y = p.y(view, G, d);
        ctx.moveTo(p.x(view, left, d), y);
        ctx.lineTo(p.x(view, right, d), y);
      }
      ctx.strokeStyle = C.roofSeam;
      ctx.lineWidth = Math.max(1, view.scale * 0.8);
      ctx.stroke();
      const lightsOn = this.reducedMotion || Math.sin(t * 2) > -0.3;
      for (const row of this.props) {
        p.plane(ctx, view, row.f);
        ctx.fillStyle = C.prop;
        ctx.fill(row.detail);
        ctx.fillStyle = C.orange;
        if (lightsOn) ctx.fill(row.lights);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    for (const [q, stops] of [[f.left, C.facadeSide], [f.right, C.facadeLit]]) {
      if (!q) continue;
      fillQuad(ctx, q, quadGradient(ctx, q, stops));
      // Floor bands carried back along the side.
      const x = q === f.left ? left : right;
      ctx.beginPath();
      for (let d = 24; d < 900; d += 102) {
        const [bx, by] = p.point(view, x, G + d, ROOF.back);
        const [fx, fy] = p.point(view, x, G + d, ROOF.front);
        if (by > view.pxH && fy > view.pxH) break;
        ctx.moveTo(bx, by);
        ctx.lineTo(fx, fy);
      }
      ctx.strokeStyle = C.facadeBand;
      ctx.lineWidth = Math.max(1, view.scale * 2);
      ctx.stroke();
      const y0 = p.y(view, G + CANYON_FROM, ROOF.front);
      const y1 = p.y(view, G + CANYON_TO, ROOF.front);
      fillQuad(ctx, q, quadGradient(ctx, [0, y0, 0, y0, 0, y1, 0, y1], C.canyonFace));
    }
    // The facade, on its own plane with cached art.
    p.plane(ctx, view, ROOF.front);
    ctx.fillStyle = this.facadeGrad ??= this.worldGradient(ctx, G, G + 700, C.facade);
    ctx.fillRect(left, G, right - left, bottom - G);
    ctx.fillStyle = C.facadeBand;
    ctx.fill(this.facadeBands);
    ctx.fillStyle = C.facadeWin;
    ctx.fill(this.facadeWin);
    // The building's corners catch the light, so its edges read against
    // the dark towers beyond.
    ctx.fillStyle = this.cornerGrad ??= this.worldGradient(ctx, G, G + 520, C.corner);
    ctx.fillRect(left, G, 3, 520);
    ctx.fillRect(right - 3, G, 3, 520);
    ctx.fillStyle = C.coping;
    ctx.fillRect(left, G, right - left, 4);
    ctx.fillStyle = C.copingShadow;
    ctx.fillRect(left, G + 4, right - left, 10);
    ctx.fillStyle = this.canyonGrad ??= this.worldGradient(ctx, G + CANYON_FROM, G + CANYON_TO, C.canyonFace);
    ctx.fillRect(left, G + CANYON_FROM, right - left, bottom - G - CANYON_FROM);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // One platform: its back structures (legs, rail, billboard with its neon
  // sign), the slab itself (top, the side facing the view's centre line,
  // front), what stands on the deck, then its front structures.
  drawPlatform(ctx, view, art) {
    const p = this.persp;
    const t = this.time;
    for (const sign of art.signs) {
      p.plane(ctx, view, SIGN_DEPTH);
      this.paintLayer(ctx, sign.art);
      this.drawSign(ctx, sign, t);
    }
    p.plane(ctx, view, PLAT.back);
    this.paintLayer(ctx, art.back, C.railBack);
    const wood = art.paint === 'wood';
    const f = p.box(view, art.box, this.faces);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fillQuad(ctx, f.top, wood ? C.woodTop : C.metalTop);
    fillQuad(ctx, f.left, wood ? C.woodSide : C.metalSide);
    fillQuad(ctx, f.right, wood ? C.woodSide : C.metalSide);
    fillQuad(ctx, f.front, wood ? C.wood : C.metal);
    p.plane(ctx, view, TANK_DEPTH);
    this.paintLayer(ctx, art.on);
    p.plane(ctx, view, PLAT.front);
    this.paintLayer(ctx, art.front, C.rail);
    // The deck's lit front edge.
    ctx.fillStyle = wood ? C.woodTop : C.metalTop;
    ctx.fillRect(art.box.x0, art.box.top, art.box.x1 - art.box.x0, 2);
  }

  // The stair bulkhead: a concrete box with a door, a vent and a lamp.
  drawBulkhead(ctx, view, b) {
    const p = this.persp;
    const f = p.box(view, b.box, this.faces);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fillQuad(ctx, f.top, C.concreteTop);
    fillQuad(ctx, f.left, C.concreteSide);
    fillQuad(ctx, f.right, C.concreteSide);
    fillQuad(ctx, f.front, C.concrete);
    p.plane(ctx, view, b.box.front);
    this.paintLayer(ctx, b.art);
    ctx.fillStyle = C.metalTop;
    ctx.fillRect(b.box.x0, b.box.top, b.box.x1 - b.box.x0, 3);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // A world-space vertical gradient (for art drawn on a depth plane): its
  // coordinates scale with the plane, so it is built once.
  worldGradient(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
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
