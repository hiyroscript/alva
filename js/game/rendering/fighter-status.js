// World-space Energy and long cooldown status. Ready moves and baseline
// repeat delays draw nothing. Each long timer has its shared ability artwork
// in the center, original colors intact, with remaining seconds underneath.
// Presentation reads simulation state; no DOM dependencies or fighter IDs.

import { COMBAT_BUTTONS } from '../../config.js';
import { specialAction } from '../../data/loadout.js';
import { abilityMove, previewFrame } from '../../data/ability-preview.js';
import { REPEAT_COOLDOWN } from '../../data/cooldowns.js';
import { drawCenteredFrame } from './sprite-normalizer.js';

// Energy bar: one thin, bright purple fill on a dark track with a black
// outline; the fill turns gray once the fighter is exhausted and stays gray
// until it is full again, when the bar goes.
export const ENERGY_STYLE = Object.freeze({
  fill: '#b026ff',
  exhausted: '#8c8c8c',
  track: 'rgba(0, 0, 0, 0.7)',
  outline: '#000000',
});

// Cooldown rings: white ring and seconds, each with a black outline
// so they read on any stage (Desert's sand, City's night, Practice's pale
// grid) and against the black Void.
export const COOLDOWN_STYLE = Object.freeze({
  fill: '#ffffff',
  track: 'rgba(255, 255, 255, 0.3)',
  outline: '#000000',
});

// Seconds left on a cooldown as shown in its ring, one decimal, rounded up
// so it never reads 0.0 while still cooling ("4.3", "0.1").
export function formatCooldown(seconds) {
  return (Math.ceil(seconds * 10 - 1e-6) / 10).toFixed(1);
}

// What the Energy bar shows for `fighter`: whether it shows at all (only
// while Energy is below full: CombatState.setEnergy snaps a refill that
// reaches the maximum to exactly it), the value, the fill ratio (energy /
// maxEnergy, 0 to 1), its colour and whether the fighter is exhausted.
// Exhaustion only ever clears at full, so the bar is gray from 0 until the
// step it goes.
export function energyBarState(fighter) {
  const c = fighter.combat;
  const exhausted = c.energyExhausted;
  return {
    visible: c.energy < c.maxEnergy,
    energy: c.energy,
    maxEnergy: c.maxEnergy,
    ratio: c.energyRatio,
    exhausted,
    color: exhausted ? ENERGY_STYLE.exhausted : ENERGY_STYLE.fill,
  };
}

// Long cooldowns in control order, including ordinary attacks. Ground and
// air variants keep their own timers and preview context. No entry at ready.
export function cooldownIndicators(fighter) {
  const list = [];
  for (const action of COMBAT_BUTTONS) {
    const special = specialAction(fighter.def, action);
    const ids = special ? [special.id] : [...new Set([abilityMove(fighter.def, action), abilityMove(fighter.def, action, true)])];
    for (const id of ids) {
      if (!id) continue;
      const timers = fighter.combat.abilityCooldowns;
      const remaining = special ? timers.remaining(id) : fighter.combat.cooldowns.get(id) ?? 0;
      const duration = special ? timers.duration(id) : fighter.attacks[id]?.cooldown;
      if (!(remaining > 0 && duration > REPEAT_COOLDOWN)) continue;
      list.push({ id, preview: previewFrame(fighter.def, action, id !== abilityMove(fighter.def, action)),
        progress: Math.min(1, Math.max(0, 1 - remaining / duration)), text: formatCooldown(remaining) });
    }
  }
  return list;
}

// Whether a fighter whose feet are at device pixel (x, footY) is on screen
// enough to carry its status; off screen it only has its edge pointer.
export function statusOnScreen(x, footY, view) {
  const margin = 10;
  return x > -margin && x < view.pxW + margin && footY > -margin && footY < view.pxH + view.pxH * 0.25;
}

// The bar in `rect` (device pixels): outline, dark track, then the fill
// from the left, as wide as the ratio. `dpr` is device pixels per CSS pixel
// (the outline is one CSS pixel). Nothing at full Energy. True when drawn.
export function drawEnergyBar(ctx, fighter, rect, dpr = 1) {
  const { x, y, w, h } = rect;
  const { visible, ratio, color } = energyBarState(fighter);
  if (!visible) return false;
  const o = Math.max(1, Math.round(dpr));
  ctx.save();
  ctx.fillStyle = ENERGY_STYLE.outline;
  ctx.fillRect(x - o, y - o, w + o * 2, h + o * 2);
  ctx.fillStyle = ENERGY_STYLE.track;
  ctx.fillRect(x, y, w, h);
  const fill = Math.round(w * ratio);
  if (fill > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, fill, h);
  }
  ctx.restore();
  return true;
}

const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

// A centered row under the feet, clockwise recovery from the top. Artwork
// replaces the center timer; outlined seconds replace the old codename below.
// Scale with the world, with a readable CSS-pixel minimum. Missing art is
// left empty rather than fabricated. Ready moves leave no reserved slot.
export function drawCooldownIndicators(ctx, fighter, x, footY, scale, dpr = 1) {
  const list = cooldownIndicators(fighter);
  if (!list.length) return 0;
  const r = Math.round(Math.max(10 * dpr, 9.5 * scale));
  const ring = Math.max(2, Math.round(r * 0.2));
  const o = Math.max(1, Math.round(dpr));
  // Leave enough room between rings for even a long numeric countdown.
  const labelFont = Math.round(Math.max(8 * dpr, 7 * scale));
  const gap = Math.round(4 * dpr);
  const spacing = Math.max(r * 2 + ring + gap, labelFont * Math.max(...list.map((c) => c.text.length)) * 0.7 + gap);
  const cy = Math.round(footY + Math.max(6 * dpr, 7 * scale) + r);
  const labelY = Math.round(cy + r + ring / 2 + o + 2);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  list.forEach((c, i) => {
    const cx = Math.round(x + (i - (list.length - 1) / 2) * spacing);
    // Black under the whole ring, a little wider than it: its outline.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = ring + o * 2;
    ctx.strokeStyle = COOLDOWN_STYLE.outline;
    ctx.stroke();
    ctx.lineWidth = ring;
    ctx.strokeStyle = COOLDOWN_STYLE.track;
    ctx.stroke();
    if (c.progress > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.progress);
      ctx.strokeStyle = COOLDOWN_STYLE.fill;
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(2, o * 2.5);
    ctx.strokeStyle = COOLDOWN_STYLE.outline;
    ctx.fillStyle = COOLDOWN_STYLE.fill;
    const preview = c.preview;
    const clip = preview?.collection === 'projectileAnimations'
      ? fighter.sprites.projectile(preview.animation) : fighter.sprites.animations[preview?.animation];
    const frame = clip?.frames[preview?.frame];
    if (frame?.canvas && frame.artW > 0 && frame.artH > 0) {
      // Fit the entire artwork inside the circle, irrespective of gameplay anchors.
      const fit = 2 * (r - ring - o) / Math.hypot(frame.artW, frame.artH);
      const pixelScale = fit >= 1 ? Math.floor(fit) : fit;
      ctx.imageSmoothingEnabled = false;
      drawCenteredFrame(ctx, { ...frame, anchorArtX: frame.artW / 2, anchorArtY: frame.artH / 2 },
        cx, cy, pixelScale, preview.mirrored);
    }
    ctx.font = `700 ${labelFont}px ${MONO}`;
    ctx.textBaseline = 'top';
    ctx.strokeText(c.text, cx, labelY);
    ctx.fillText(c.text, cx, labelY);
  });
  ctx.restore();
  return list.length;
}
