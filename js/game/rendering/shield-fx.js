// The Shield's look: a wavy black-and-red circle round the fighter while its
// Shield is up (CombatState.shielding), drawn procedurally on the Arena
// canvas, never a PNG. Kin to the Void (js/stages/stage-theme.js): the same
// organic edge (js/core/organic-edge.js) and the same red, but a protective
// ring instead of a solid region, so the fighter stays in plain view:
//
//   a barely-there black interior, behind the fighter's sprite
//   a black wavy rim, in front of it, with a thin red line on its outer side
//
// so from the fighter outward it reads interior, black boundary, red edge.
//
// Art only. The circle is sized from the character's stable visual height
// (never the frame on screen, so it does not pulse between poses) and
// centred on its body, but a blocked hit is still decided by the fighter's
// own hurtboxes (see CombatSystem.applyHit): nothing reads this geometry.
// The geometry helpers are pure, so what is drawn can be checked without a
// canvas.

import { EDGE_RED, waveOffset } from '../../core/organic-edge.js';

export const SHIELD_STYLE = Object.freeze({
  interior: 'rgba(0, 0, 0, 0.16)',
  rim: '#000000',
  accent: EDGE_RED,
  rimWidth: 3.5,    // CSS pixels
  accentWidth: 1.25, // CSS pixels
});

// The circle's shape: `radius` of the character's visual height, its
// perimeter leaning out and in by at most `amp` of the radius, enough to
// read as clearly wavy in play, like the Void's edge. Whole-number wave
// counts round the circle (`k`) so it always closes and its mean radius
// never changes, drifting slowly (`speed`, radians per second): a living
// edge, never a pulse or a spike. Traced at `points` points.
export const SHIELD_SHAPE = Object.freeze({
  radius: 0.62,
  amp: 0.1,
  points: 96,
  waves: [[5, 0.8, 0.6], [8, -0.6, 0.4]], // [k, speed, weight]
});

// How much faster the waves drift while the fighter walks behind its
// Shield (Fighter.shieldWalking): the ring churns as it moves, the only
// sign of walking, since the held Shield pose stays (no clip of its own).
export const SHIELD_WALK_WAVE_RATE = 4;

// The drift time of `fighter`'s ring at the Arena's effects clock `time`
// (art only, kept here, never on the fighter or read by the simulation):
// the Arena's clock itself, plus a lead the ring gains while the fighter
// walks behind its Shield (SHIELD_WALK_WAVE_RATE times the Arena's pace in
// all) and keeps after, so a change of pace never makes the waves jump. A
// fighter that never walks draws exactly at `time`. A clock that goes back
// (a new Arena's) gains nothing until it moves on again.
const waveLeads = new WeakMap();

export function shieldWaveTime(fighter, time) {
  let lead = waveLeads.get(fighter);
  if (!lead) waveLeads.set(fighter, (lead = { at: time, ahead: 0 }));
  if (fighter.shieldWalking) lead.ahead += Math.max(0, time - lead.at) * (SHIELD_WALK_WAVE_RATE - 1);
  lead.at = time;
  return time + lead.ahead;
}

// World-space radius of the Shield round a character.
export function shieldRadius(def) {
  return def.visual.height * SHIELD_SHAPE.radius;
}

// World-space centre of `fighter`'s Shield: its body's middle, half its
// visual height over its feet. `render` follows the interpolated position
// the sprite is drawn at.
export function shieldCenter(fighter, render = true) {
  const x = render ? fighter.renderX : fighter.body.x;
  const y = render ? fighter.renderY : fighter.body.y;
  return [x, y - fighter.def.visual.height / 2];
}

// The wavy perimeter round (x, y): flat [x, y, ...] points, one per
// SHIELD_SHAPE.points, evenly spaced round the circle and closed by the
// caller. `time` drives the drift; with `reducedMotion` it is ignored and
// the shape holds still, wavy all the same.
export function shieldOutline(x, y, radius, time = 0, reducedMotion = false) {
  const { amp, points, waves } = SHIELD_SHAPE;
  const t = reducedMotion ? 0 : time;
  const out = new Array(points * 2);
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r = radius * (1 + amp * waveOffset(waves, a, t));
    out[i * 2] = x + Math.cos(a) * r;
    out[i * 2 + 1] = y + Math.sin(a) * r;
  }
  return out;
}

function trace(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

// One layer of `fighter`'s Shield, only while it is up: 'interior' (drawn
// behind its sprite) or 'rim' (in front). `view` is the Arena's (world ->
// device: x, y, scale; dpr for the CSS-pixel line widths), `time` the
// Arena's effects clock, run through the fighter's own (shieldWaveTime).
// True when drawn.
export function drawShield(ctx, fighter, view, layer, time = 0, reducedMotion = false) {
  if (!fighter.combat.shielding) return false;
  const wave = shieldWaveTime(fighter, time);
  const s = view.scale;
  const px = (view.dpr ?? 1) / s; // world units per CSS pixel
  const [x, y] = shieldCenter(fighter);
  const radius = shieldRadius(fighter.def);
  ctx.save();
  ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);
  trace(ctx, shieldOutline(x, y, radius, wave, reducedMotion));
  if (layer === 'interior') {
    ctx.fillStyle = SHIELD_STYLE.interior;
    ctx.fill();
  } else {
    ctx.lineJoin = 'round';
    ctx.lineWidth = SHIELD_STYLE.rimWidth * px;
    ctx.strokeStyle = SHIELD_STYLE.rim;
    ctx.stroke();
    // The red line on the rim's outer side, on the same waves: pushed out
    // so it covers the outermost accentWidth of the black, flush with its
    // outer edge, never a red ring inside it round the fighter.
    const outset = ((SHIELD_STYLE.rimWidth - SHIELD_STYLE.accentWidth) / 2) * px;
    trace(ctx, shieldOutline(x, y, radius + outset, wave, reducedMotion));
    ctx.lineWidth = SHIELD_STYLE.accentWidth * px;
    ctx.strokeStyle = SHIELD_STYLE.accent;
    ctx.stroke();
  }
  ctx.restore();
  return true;
}
