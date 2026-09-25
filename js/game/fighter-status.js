// World-space status drawn on the Arena canvas with each fighter in play,
// following its interpolated position (renderX / renderY), never a HUD card:
//
//   [ ][ ][ ]           Energy: only while below full; purple, gray while exhausted
//   [ P1 / CPU tag ]    (Arena.drawMarkers)
//   [ fighter      ]
//   [ CAB1   CAB2  ]    only the charged actions cooling down, under the feet
//
// Both are temporary: full Energy and a ready charged action draw nothing,
// so a fighter with full Energy and nothing cooling down carries only its
// tag. The state helpers (energyBarState, energySegments, cabIndicators)
// and the layout helper (energySegmentRects) are pure, so what is drawn can
// be checked without a canvas; the draw functions only paint it. Nothing
// here is character-specific: the rings come from the character's own
// `chargedActions`, the bar from its Energy.

// Energy bar: three small adjacent segments, each a thin purple fill on a
// dark track with a black outline; the fills turn gray once the fighter is
// exhausted and stay gray until it is full again, when the bar goes.
export const ENERGY_STYLE = Object.freeze({
  fill: '#a855f7',
  exhausted: '#8c8c8c',
  track: 'rgba(0, 0, 0, 0.7)',
  outline: '#000000',
});

// The Energy bar's segments, front to back (left to right on screen), as
// shares of the one Energy value: 34 + 33 + 33 = 100, the whole of it. One
// scalar, three views of it, never three pools.
export const ENERGY_SEGMENTS = Object.freeze([34, 33, 33]);

// CAB rings: white ring, number and label, each with a black outline so
// they read on any stage (Desert's sand, City's night, Practice's pale
// grid) and against the black Void.
export const CAB_STYLE = Object.freeze({
  fill: '#ffffff',
  track: 'rgba(255, 255, 255, 0.3)',
  outline: '#000000',
});

// Player-facing names of charged actions, by the button they are charged
// from: Charged BA1 is CAB1, Charged BA2 is CAB2.
export const CHARGED_LABELS = Object.freeze({ action1: 'CAB1', action2: 'CAB2' });

// Seconds left on a cooldown as shown in its ring, one decimal, rounded up
// so it never reads 0.0 while still cooling ("4.3", "0.1").
export function formatCooldown(seconds) {
  return (Math.ceil(seconds * 10 - 1e-6) / 10).toFixed(1);
}

// How `energy` (of `max`) fills the three segments, front to back: one
// { capacity, amount, ratio } each (ratio = amount / capacity, 0 to 1).
// Energy stacks from the back: the back segment holds the first share, the
// middle the next, the front the last. So spending empties the front first,
// then the middle, then the back, and refilling rebuilds the back first,
// then the middle, then the front: whichever segment is behind the emptied
// ones fills before them, never all three at once. A pure function of the
// one value, so the segments can never disagree with it: their amounts
// always add up to exactly `energy`.
export function energySegments(energy, max = 100, shares = ENERGY_SEGMENTS) {
  const total = shares.reduce((a, b) => a + b, 0);
  let left = Math.min(max, Math.max(0, energy));
  const out = new Array(shares.length);
  for (let i = shares.length - 1; i >= 0; i--) {
    const capacity = (shares[i] / total) * max;
    const amount = Math.min(capacity, left);
    left -= amount;
    out[i] = { capacity, amount, ratio: capacity > 0 ? amount / capacity : 0 };
  }
  return out;
}

// What the Energy bar shows for `fighter`: whether it shows at all (only
// while Energy is below full: CombatState.setEnergy snaps a refill that
// reaches the maximum to exactly it), the value, the overall ratio (energy
// / maxEnergy, 0 to 1), the three segments (see energySegments), their
// colour and whether the fighter is exhausted. Exhaustion only ever clears
// at full, so the bar is gray from 0 until the step it goes.
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
    segments: energySegments(c.energy, c.maxEnergy),
  };
}

// The segments' tracks inside the bar's `rect` (device pixels), front to
// back: { x, y, w, h } each, as wide as its share of the bar, with a small
// clear gap between neighbours (their outlines, `dpr` CSS pixels each, and
// a sliver of the stage between). Whole pixels; together they span `rect`
// exactly, so the meter keeps the bar's compact footprint.
export function energySegmentRects(rect, dpr = 1, shares = ENERGY_SEGMENTS) {
  const o = Math.max(1, Math.round(dpr));
  const gap = o * 2 + Math.max(1, Math.round(dpr));
  const total = shares.reduce((a, b) => a + b, 0);
  const inner = rect.w - gap * (shares.length - 1);
  const out = [];
  let sum = 0;
  let from = 0;
  shares.forEach((share, i) => {
    sum += share;
    const to = Math.round((inner * sum) / total);
    out.push({ x: rect.x + from + gap * i, y: rect.y, w: to - from, h: rect.h });
    from = to;
  });
  return out;
}

// One entry per charged action of `fighter`'s character that is cooling
// down right now (chargedCooldowns.active), in its `chargedActions` order:
// { id, action, label, progress, text }. A ready one has no entry, so
// nothing is drawn for it. progress = 1 - remaining / duration, read
// straight from the fighter's cooldowns, so a Charge that speeds recovery
// speeds the ring too.
export function cabIndicators(fighter) {
  const cooldowns = fighter.combat.chargedCooldowns;
  return Object.entries(fighter.def.chargedActions ?? {})
    .filter(([, charged]) => cooldowns.active(charged.id))
    .map(([action, charged]) => ({
      id: charged.id,
      action,
      label: CHARGED_LABELS[action] ?? action.toUpperCase(),
      progress: cooldowns.progress(charged.id),
      text: formatCooldown(cooldowns.remaining(charged.id)),
    }));
}

// Whether a fighter whose feet are at device pixel (x, footY) is on screen
// enough to carry its status; off screen it only has its edge pointer.
export function statusOnScreen(x, footY, view) {
  const margin = 10;
  return x > -margin && x < view.pxW + margin && footY > -margin && footY < view.pxH + view.pxH * 0.25;
}

// The bar in `rect` (device pixels), as its three segments (see
// energySegmentRects): each an outline, a dark track, then its fill as wide
// as its ratio, held against its back end, so what is left of the Energy
// always sits together toward the back segment. `dpr` is device pixels per
// CSS pixel (the outlines are one CSS pixel). Nothing at full Energy. True
// when drawn.
export function drawEnergyBar(ctx, fighter, rect, dpr = 1) {
  const { visible, segments, color } = energyBarState(fighter);
  if (!visible) return false;
  const o = Math.max(1, Math.round(dpr));
  ctx.save();
  energySegmentRects(rect, dpr).forEach(({ x, y, w, h }, i) => {
    ctx.fillStyle = ENERGY_STYLE.outline;
    ctx.fillRect(x - o, y - o, w + o * 2, h + o * 2);
    ctx.fillStyle = ENERGY_STYLE.track;
    ctx.fillRect(x, y, w, h);
    const fill = Math.round(w * segments[i].ratio);
    if (fill > 0) {
      ctx.fillStyle = color;
      ctx.fillRect(x + w - fill, y, fill, h);
    }
  });
  ctx.restore();
  return true;
}

const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

// One ring per charged action cooling down, in a row centred under the feet
// at (x, footY), device pixels: no slot is kept for a ready one, so a lone
// ring sits straight under the fighter and nothing at all is drawn while
// both are ready. The ring completes clockwise from the top as the ability
// recovers, the seconds left inside it, its CAB name beneath. White,
// outlined in black. Sized with the world (`scale`, device pixels per world
// unit) but never below a readable size in CSS pixels (`dpr`, device pixels
// per CSS pixel), the number always inside its ring. Returns how many rings
// it drew.
export function drawCabIndicators(ctx, fighter, x, footY, scale, dpr = 1) {
  const list = cabIndicators(fighter);
  if (!list.length) return 0;
  const r = Math.round(Math.max(10 * dpr, 9.5 * scale));
  const ring = Math.max(2, Math.round(r * 0.2));
  const o = Math.max(1, Math.round(dpr));
  // "4.3" is three monospace characters (1.8 em): kept inside the ring.
  const valueFont = Math.max(7, Math.floor((2 * (r - ring)) / 1.8));
  const labelFont = Math.round(Math.max(8 * dpr, 7 * scale));
  const gap = Math.round(4 * dpr);
  const spacing = Math.max(r * 2 + ring + gap, labelFont * 2.4 + gap);
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
    ctx.strokeStyle = CAB_STYLE.outline;
    ctx.stroke();
    ctx.lineWidth = ring;
    ctx.strokeStyle = CAB_STYLE.track;
    ctx.stroke();
    if (c.progress > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.progress);
      ctx.strokeStyle = CAB_STYLE.fill;
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(2, o * 2.5);
    ctx.strokeStyle = CAB_STYLE.outline;
    ctx.fillStyle = CAB_STYLE.fill;
    ctx.font = `800 ${valueFont}px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.strokeText(c.text, cx, cy + 1);
    ctx.fillText(c.text, cx, cy + 1);
    ctx.font = `700 ${labelFont}px ${MONO}`;
    ctx.textBaseline = 'top';
    ctx.strokeText(c.label, cx, labelY);
    ctx.fillText(c.label, cx, labelY);
  });
  ctx.restore();
  return list.length;
}
