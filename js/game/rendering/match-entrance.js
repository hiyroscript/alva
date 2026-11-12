// The match entrance's versus screen and its transition (Parts A and B of
// js/game/entrance.js), drawn on a canvas of its own over the battle
// canvas: Canvas 2D only, no image file. Its time is the Battle's entrance
// time (Battle.entranceTime, on the simulation clock), so pausing holds it
// and an online match draws the same moment on both browsers.
//
//   Part A  A green bolt strikes down the middle of the screen (its shape
//           drawn from the match's seed: a jagged, slightly leaning line
//           with two to four short forks), separating Team I's half (left,
//           p1) from Team II's (right, p2): drawn top to bottom, a green-
//           white flash and a small shake at contact, then a living
//           flicker. Behind it, the frame the player had (this canvas is
//           clear there) until the black fades in under it. Team I's
//           fighter slides down from above into the middle of its half,
//           facing the bolt, then Team II's up from below into its own,
//           each on its idle clip, drawn large (about half the screen's
//           height, every fighter alike: normalized by its idle art's
//           height) with a short trail, its side and name under it. They
//           hold.
//   Part B  The bolt strikes again: a flash, a shake, and its glow blooms
//           out from the centre line, a hard green-white core inside it,
//           until green covers the whole screen. Under the cover the
//           versus screen is gone and the stage is there (the battle
//           canvas draws from then on); the cover then clears from the
//           centre outward.
//
// With reduced motion: no shake, no overshoot and no re-roll of the bolt
// (only a gentle glow); the fighters fade in where they stand; the cover is
// a plain fade in and out. The same steps, the same times.
//
// Nothing here reads a fighter's id: each side is its fighter's sprites
// (its idle clip, its art's size, its members for an ensemble, as
// idlePose lays them out) and the text the screen gives for it.

import { CONFIG } from '../../config.js';
import { mulberry32, deriveSeed, clamp, lerp } from '../../core/utils.js';
import { drawFrame } from './sprite-normalizer.js';
import { idlePose, poseBounds } from './ensemble.js';
import { easeInOut } from '../entrance.js';

// How the entrance looks (its timing is CONFIG.battle.entrance's). Sizes
// are fractions of the canvas's height (h) or width (w), so it lays out the
// same at any size.
export const ENTRANCE_LOOK = Object.freeze({
  // Alva's own green: the bolt's glow, a bright mid stroke and its near-
  // white core.
  glow: '#2bff6a',
  mid: '#6dff8e',
  core: '#eaffdc',
  // The full-screen flash at contact and at the re-strike (green-white).
  flash: '214, 255, 222',
  flashAlpha: 0.32,
  restrikeAlpha: 0.55,
  // The bolt: how many segments, how far it leans across the screen from
  // top to bottom (w), how far each joint strays sideways (h), its forks
  // (count, segments each, each segment's length, h).
  segments: 16,
  lean: 0.045,
  jag: 0.024,
  forks: [2, 4],
  forkSegments: 3,
  forkStep: [0.035, 0.06],
  // Its strokes' widths (h) and the glow's blur (h).
  glowWidth: 0.034,
  midWidth: 0.011,
  coreWidth: 0.0042,
  glowBlur: 0.05,
  // The living flicker: its jitter re-rolled this many times a second, by
  // this much (h); the glow pulsing by this share, this fast (Hz). With
  // reduced motion: no re-roll, a gentler pulse.
  flickerRate: 7,
  flickerJag: 0.007,
  pulse: 0.16,
  reducedPulse: 0.06,
  pulseRate: 2.4,
  // The shake at contact and at the re-strike (h), dying away over
  // `shakeTime` seconds.
  shake: 0.012,
  coverShake: 0.018,
  shakeTime: 0.28,
  // The cover: the glow grows to this many screen widths (its core and mid
  // stroke a share of it), so the green covers everything; its blur at most
  // this (h).
  coverWidth: 2.6,
  coverMid: 0.55,
  coverCore: 0.28,
  coverBlur: 0.16,
  // The fighters: their idle art's height on screen (h), never wider than
  // this share of their half; the slide's overshoot; the trail's
  // afterimages (seconds behind, and how strong).
  fighterHeight: 0.5,
  fighterWidth: 0.84,
  overshoot: 1.70158,
  trail: [[0.035, 0.28], [0.07, 0.12]],
  // Each side's text under its fighter: the HUD's font, its sizes (h, and
  // CSS pixels at least), fading in as the fighter lands.
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  nameSize: 0.04,
  sideSize: 0.026,
  minName: 13,
  minSide: 10,
  textFade: 0.25,
});

const SIDES = Object.freeze(['p1', 'p2']);
// Each team's half and the way it faces (toward the bolt).
const HALF = Object.freeze({ p1: 0.25, p2: 0.75 });
const FACING = Object.freeze({ p1: 1, p2: -1 });
// Where each slides in from: Team I from above, Team II from below.
const FROM = Object.freeze({ p1: -1, p2: 1 });

// An ease out with a small overshoot that settles back (easeOutBack).
function easeOutBack(k, c1 = ENTRANCE_LOOK.overshoot) {
  const x = clamp(k, 0, 1) - 1;
  return 1 + (c1 + 1) * x * x * x + c1 * x * x;
}

const easeInOutQuad = (k) => {
  const x = clamp(k, 0, 1);
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
};

// The bolt's shape for `seed`: the main line's joints and its forks, in
// sizes relative to the screen (see boltPoints), the same for every
// browser given the same seed.
export function boltShape(seed, look = ENTRANCE_LOOK) {
  const rnd = mulberry32(deriveSeed(seed >>> 0, 0x626f6c74));
  const n = look.segments;
  const lean = look.lean * (rnd() < 0.5 ? -1 : 1) * (0.6 + 0.4 * rnd());
  const joints = [];
  for (let i = 0; i <= n; i++) {
    const end = i === 0 || i === n;
    joints.push({
      y: -0.04 + (1.08 * i) / n,
      lean: lean * (0.5 - i / n),
      jag: end ? 0 : (rnd() * 2 - 1) * look.jag * (i % 2 ? 1 : 0.7),
    });
  }
  const [lo, hi] = look.forks;
  const count = lo + Math.floor(rnd() * (hi - lo + 1));
  const forks = [];
  const used = new Set();
  for (let f = 0; f < count; f++) {
    let root = 2 + Math.floor(rnd() * (n - 4));
    while (used.has(root)) root = 2 + ((root - 1) % (n - 4));
    used.add(root);
    const side = forks.length % 2 === 0 ? (rnd() < 0.5 ? -1 : 1) : -forks[forks.length - 1].side;
    const steps = [];
    for (let s = 0; s < look.forkSegments; s++) {
      const len = lerp(look.forkStep[0], look.forkStep[1], rnd());
      steps.push({ dx: side * len * (0.7 + 0.5 * rnd()), dy: len * (0.6 + 0.6 * rnd()) });
    }
    forks.push({ root, side, steps });
  }
  return { joints, forks };
}

// The bolt laid out on a `w` x `h` screen, its flicker's jitter for tick
// `tick` added (none for tick 0): { main: [x, y, ...], forks: [[x, y, ...]] }
// in device pixels.
export function boltPoints(shape, w, h, tick = 0, seed = 0, look = ENTRANCE_LOOK) {
  const rnd = tick ? mulberry32(deriveSeed(seed >>> 0, 0x666c6b00 + tick)) : null;
  const wobble = () => (rnd ? (rnd() * 2 - 1) * look.flickerJag * h : 0);
  const main = [];
  shape.joints.forEach((j, i) => {
    const end = i === 0 || i === shape.joints.length - 1;
    main.push(w / 2 + j.lean * w + j.jag * h + (end ? 0 : wobble()), j.y * h);
  });
  const forks = shape.forks.map((f) => {
    let x = main[f.root * 2];
    let y = main[f.root * 2 + 1];
    const pts = [x, y];
    for (const s of f.steps) {
      x += s.dx * h + wobble() * 0.6;
      y += s.dy * h;
      pts.push(x, y);
    }
    return pts;
  });
  return { main, forks };
}

// Strokes polyline `pts` ([x, y, ...]) down to height `cut` (device
// pixels; Infinity for all of it), the last segment cut where it crosses.
function tracePolyline(ctx, pts, cut = Infinity) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) {
    const [x0, y0, x1, y1] = [pts[i - 2], pts[i - 1], pts[i], pts[i + 1]];
    if (y1 <= cut) {
      ctx.lineTo(x1, y1);
      continue;
    }
    if (y0 < cut) {
      const k = (cut - y0) / (y1 - y0 || 1);
      ctx.lineTo(x0 + (x1 - x0) * k, cut);
    }
    break;
  }
}

// The art-pixel box a fighter's idle covers over its whole clip (every
// member's for an ensemble), facing right: { left, right, top, bottom }.
export function idleBounds(sprites) {
  const sets = sprites?.members ? sprites.members.map((m) => m.set) : [sprites];
  const clip = sets.map((s) => s?.animations?.idle).find(Boolean);
  if (!clip) return null;
  const frames = Math.max(...sets.map((s) => s?.animations?.idle?.frames.length ?? 1));
  let box = null;
  for (let i = 0; i < frames; i++) {
    const parts = idlePose(sprites, (i + 0.5) / clip.fps);
    if (!parts.length) continue;
    const b = poseBounds(parts);
    box = box ? {
      left: Math.min(box.left, b.left), right: Math.max(box.right, b.right),
      top: Math.min(box.top, b.top), bottom: Math.max(box.bottom, b.bottom),
    } : b;
  }
  return box;
}

// Device pixels per art pixel for a fighter whose idle covers `box`, on a
// `w` x `h` screen: its idle about `fighterHeight` of the height, whole
// pixels so the pixel art stays crisp, and never wider than its half.
export function fighterScale(box, w, h, look = ENTRANCE_LOOK) {
  if (!box) return 1;
  const artH = Math.max(1, box.bottom - box.top);
  const artW = Math.max(1, box.right - box.left);
  let n = Math.max(1, Math.round((look.fighterHeight * h) / artH));
  while (n > 1 && (n * artW > look.fighterWidth * (w / 2) || n * artH > (look.fighterHeight + 0.08) * h)) n -= 1;
  return n;
}

export class MatchEntranceArt {
  // `canvas`: its own canvas, laid over the battle canvas by the screen.
  constructor(canvas, { look = ENTRANCE_LOOK } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.look = look;
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.timeline = null;
    this.sides = null;
    this.shape = null;
    this.seed = 0;
    this.reducedMotion = false;
  }

  // A match's entrance: its timeline (Battle.entrance), the seed its bolt
  // is drawn from, and each side's { sprites, side, name } (the side's
  // name and its fighter's, as the screen shows them).
  begin({ timeline, seed = 0, sides, reducedMotion = false }) {
    this.timeline = timeline;
    this.seed = seed >>> 0;
    this.shape = boltShape(this.seed, this.look);
    this.reducedMotion = !!reducedMotion;
    this.sides = Object.fromEntries(SIDES.map((slot) => {
      const s = sides?.[slot] ?? {};
      return [slot, { sprites: s.sprites ?? null, side: s.side ?? '', name: s.name ?? '', box: idleBounds(s.sprites), scale: 1 }];
    }));
    this.layout(true);
  }

  // Fits the backing store to the canvas's box (devicePixelRatio capped as
  // the battle canvas's is) and lays everything out for that size; a
  // resize mid-entrance changes nothing else. Whether it changed.
  layout(force = false) {
    const rect = this.canvas.getBoundingClientRect?.() ?? { width: this.canvas.width, height: this.canvas.height };
    const dpr = Math.min(globalThis.window?.devicePixelRatio || 1, CONFIG.render.dprCap);
    const w = Math.max(1, Math.round((rect.width || 0) * dpr));
    const h = Math.max(1, Math.round((rect.height || 0) * dpr));
    if (!force && w === this.w && h === this.h) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    if (this.sides) for (const slot of SIDES) this.sides[slot].scale = fighterScale(this.sides[slot].box, w, h, this.look);
    return true;
  }

  // Whether the entrance draws anything at time `t` (null: no entrance).
  showing(t) {
    return t !== null && t !== undefined && !!this.timeline && t < this.timeline.revealEnd;
  }

  clear() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
  }

  // The entrance at time `t`: the versus screen until the cover is full,
  // the cover over it, then the cover clearing.
  draw(t) {
    this.clear();
    if (!this.showing(t)) return false;
    const tl = this.timeline;
    const ctx = this.ctx;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (t < tl.coverFull) this.drawVersus(t);
    if (t >= tl.cover) this.drawCover(t);
    return true;
  }

  // ---- Part A ------------------------------------------------------------------------

  drawVersus(t) {
    const { ctx, w, h, timeline: tl, look } = this;
    // The black, under everything else of the versus screen.
    if (t >= tl.blackStart) {
      ctx.fillStyle = `rgba(0, 0, 0, ${easeInOutQuad((t - tl.blackStart) / (tl.blackEnd - tl.blackStart || 1))})`;
      ctx.fillRect(0, 0, w, h);
    }
    const [sx, sy] = this.shakeAt(t);
    ctx.save();
    ctx.translate(sx, sy);
    for (const slot of SIDES) this.drawSide(slot, t);
    ctx.restore();
    // The flash at contact.
    if (t >= tl.contact && t < tl.flashEnd) {
      const k = (t - tl.contact) / (tl.flashEnd - tl.contact || 1);
      ctx.fillStyle = `rgba(${look.flash}, ${look.flashAlpha * (1 - k) ** 2})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.save();
    ctx.translate(sx, sy);
    const cut = t < tl.contact ? lerp(-0.04 * h, 1.04 * h, clamp(t / (tl.contact || 1), 0, 1)) : Infinity;
    this.drawBolt(t, cut, 0);
    ctx.restore();
  }

  // The screen's shake (device pixels), at contact and at the re-strike;
  // none with reduced motion.
  shakeAt(t) {
    if (this.reducedMotion) return [0, 0];
    const { look, timeline: tl, h } = this;
    let amp = 0;
    for (const [at, size] of [[tl.contact, look.shake], [tl.cover, look.coverShake]]) {
      const k = (t - at) / look.shakeTime;
      if (k >= 0 && k < 1) amp = Math.max(amp, size * h * (1 - k) ** 2);
    }
    if (!amp) return [0, 0];
    return [amp * Math.sin(t * 97 + 1.3) * Math.cos(t * 23), amp * Math.cos(t * 83 + 0.4) * Math.sin(t * 31 + 2)];
  }

  // The bolt down to height `cut`, its strokes `grow` (0 to 1, the cover's
  // bloom) wider.
  drawBolt(t, cut, grow) {
    const { ctx, w, h, look } = this;
    const tick = this.reducedMotion || t < this.timeline.contact ? 0 : 1 + Math.floor(t * look.flickerRate);
    const { main, forks } = boltPoints(this.shape, w, h, tick, this.seed, look);
    const pulse = 1 + (this.reducedMotion ? look.reducedPulse : look.pulse) * Math.sin(t * Math.PI * 2 * look.pulseRate);
    const glowW = lerp(look.glowWidth * h, look.coverWidth * w, grow);
    const strokes = [
      [look.glow, glowW * pulse, 0.6, lerp(look.glowBlur * h, look.coverBlur * h, grow) * pulse],
      [look.mid, Math.max(look.midWidth * h, glowW * look.coverMid * grow), 0.95, 0],
      [look.core, Math.max(look.coreWidth * h, 1.5 * this.dpr, glowW * look.coverCore * grow), 1, 0],
    ];
    for (const [color, width, alpha, blur] of strokes) {
      ctx.save();
      ctx.globalAlpha = grow ? Math.max(alpha, grow) : alpha;
      ctx.strokeStyle = color;
      if (blur > 0) {
        ctx.shadowColor = look.glow;
        ctx.shadowBlur = blur;
      }
      ctx.lineWidth = width;
      tracePolyline(ctx, main, cut);
      ctx.stroke();
      ctx.lineWidth = width * 0.6;
      for (const fork of forks) {
        if (fork[1] > cut) continue;
        tracePolyline(ctx, fork, cut);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Side `slot`'s fighter at time `t`: sliding in (or with reduced motion
  // fading in where it stands), then idling, its side and name under it.
  drawSide(slot, t) {
    const side = this.sides?.[slot];
    const slide = this.timeline.slides[slot];
    if (!side?.sprites || !side.box || t < slide.start) return;
    const { ctx, look } = this;
    const k = (t - slide.start) / (slide.end - slide.start || 1);
    const idleTime = t - slide.start;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (this.reducedMotion) {
      ctx.globalAlpha = easeInOut(k);
      this.drawPose(slot, idleTime, 0);
    } else {
      if (k < 1) {
        for (const [behind, strength] of look.trail) {
          const kb = (t - behind - slide.start) / (slide.end - slide.start || 1);
          if (kb <= 0) continue;
          ctx.globalAlpha = strength * (1 - k);
          this.drawPose(slot, idleTime, this.slideOffset(slot, kb));
        }
      }
      ctx.globalAlpha = 1;
      this.drawPose(slot, idleTime, this.slideOffset(slot, k));
    }
    ctx.restore();
    this.drawNames(slot, t);
  }

  // How far (device pixels, down) side `slot` still is from its place at
  // slide progress `k`: from wholly past its edge, easing out with a small
  // overshoot.
  slideOffset(slot, k) {
    const side = this.sides[slot];
    const travel = this.h / 2 + (side.box.bottom - side.box.top) * side.scale;
    return FROM[slot] * travel * (1 - easeOutBack(k));
  }

  // Where side `slot`'s fighter stands: its origin (feet) so its idle's box
  // is centred in its half, vertically on the screen's middle.
  origin(slot) {
    const { box, scale } = this.sides[slot];
    const facing = FACING[slot];
    const cx = facing === 1 ? (box.left + box.right) / 2 : -(box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    return [this.w * HALF[slot] - cx * scale, this.h / 2 - cy * scale];
  }

  drawPose(slot, time, offsetY) {
    const side = this.sides[slot];
    const facing = FACING[slot];
    const [x0, y0] = this.origin(slot);
    const n = side.scale;
    for (const p of idlePose(side.sprites, time)) {
      drawFrame(this.ctx, p.frame, x0 + facing * p.dx * n, y0 + offsetY + p.dy * n, n, facing !== p.source);
    }
  }

  // Side `slot`'s side and fighter names under its fighter, fading in as
  // it lands.
  drawNames(slot, t) {
    const side = this.sides[slot];
    if (!side.side && !side.name) return;
    const { ctx, look, h, dpr } = this;
    const fade = clamp((t - this.timeline.slides[slot].end + 0.05) / look.textFade, 0, 1);
    if (fade <= 0) return;
    const [, y0] = this.origin(slot);
    const x = this.w * HALF[slot];
    const nameSize = Math.round(Math.max(look.minName * dpr, look.nameSize * h));
    const sideSize = Math.round(Math.max(look.minSide * dpr, look.sideSize * h));
    let y = y0 + side.box.bottom * side.scale + sideSize * 1.1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (side.side) {
      ctx.font = `700 ${sideSize}px ${look.font}`;
      ctx.fillStyle = look.glow;
      ctx.fillText(side.side, x, Math.round(y));
      y += sideSize * 1.35;
    }
    if (side.name) {
      ctx.font = `800 ${nameSize}px ${look.font}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(side.name, x, Math.round(y));
    }
    ctx.restore();
  }

  // ---- Part B ------------------------------------------------------------------------

  // The cover: the bolt's bloom (or with reduced motion a plain green
  // fade) growing over the versus screen until it covers everything, then,
  // the stage under it, clearing from the centre outward.
  drawCover(t) {
    const { ctx, w, h, timeline: tl, look } = this;
    const growing = t < tl.coverFull;
    const p = growing ? clamp((t - tl.cover) / (tl.coverFull - tl.cover || 1), 0, 1) : 1;
    if (this.reducedMotion) {
      const a = growing ? easeInOutQuad(p) : 1 - easeInOutQuad((t - tl.coverFull) / (tl.revealEnd - tl.coverFull || 1));
      ctx.fillStyle = look.glow;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      return;
    }
    // The re-strike's flash, then the bloom.
    if (growing && p < 0.35) {
      ctx.fillStyle = `rgba(${look.flash}, ${look.restrikeAlpha * (1 - p / 0.35) ** 2})`;
      ctx.fillRect(0, 0, w, h);
    }
    const [sx, sy] = growing ? this.shakeAt(t) : [0, 0];
    ctx.save();
    ctx.translate(sx, sy);
    if (!growing) {
      // Fully covered: green everywhere, in case a stroke's edge left a
      // sliver.
      ctx.fillStyle = look.glow;
      ctx.fillRect(-w, -h, 3 * w, 3 * h);
    }
    this.drawBolt(t, Infinity, p * p * (3 - 2 * p));
    ctx.restore();
    if (growing) return;
    // Clearing: the cover rubbed out from the centre outward.
    const q = clamp((t - tl.coverFull) / (tl.revealEnd - tl.coverFull || 1), 0, 1);
    const centre = easeInOutQuad(q * 1.4);
    const edge = easeInOutQuad(q * 1.4 - 0.4);
    const mid = easeInOutQuad(q * 1.4 - 0.2);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, `rgba(0, 0, 0, ${edge})`);
    g.addColorStop(0.25, `rgba(0, 0, 0, ${mid})`);
    g.addColorStop(0.5, `rgba(0, 0, 0, ${centre})`);
    g.addColorStop(0.75, `rgba(0, 0, 0, ${mid})`);
    g.addColorStop(1, `rgba(0, 0, 0, ${edge})`);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
