// Short-lived, presentation-only feedback from resolved combat events.
// Shared with Practice Ground's damage numbers; never reads attack definitions.
import { t } from '../../localization/i18n.js';
import { statusOnScreen } from './fighter-status.js';

export const FEEDBACK = Object.freeze({
  life: 0.8, rise: 26, fade: 0.45,
  damage: Object.freeze({ color: '#ff3434' }),
  blocked: Object.freeze({ color: '#a8ddff', key: 'combatHint.blocked' }),
  deflected: Object.freeze({ color: '#75f5df', key: 'combatHint.deflected' }),
  stunned: Object.freeze({ color: '#ffcf70', key: 'combatHint.stunned' }),
});

// Practice Ground's existing formatting: no floating-point noise.
export function formatDamage(damage) {
  return `+${Number(damage.toFixed(2))}`;
}

export class CombatFeedback {
  constructor() {
    this.entries = [];
  }

  clear() { this.entries.length = 0; }

  removeFighter(fighter) {
    this.retain((entry) => entry.target !== fighter);
  }

  retain(keep) {
    let n = 0;
    for (const entry of this.entries) if (keep(entry)) this.entries[n++] = entry;
    this.entries.length = n;
  }

  add(kind, { target = null, point = null, top = 0, damage = 0 } = {}) {
    // All kinds share rows, so a damaging paralysis never covers its number.
    // Keep a row until its text expires, including when motion is reduced.
    const neighbors = this.entries.filter((entry) => target
      ? entry.target === target
      : entry.point && Math.abs(entry.point.x - point.x) < 100 && Math.abs(entry.point.y - point.y) < 50);
    let stack = 0;
    while (neighbors.some((entry) => entry.stack === stack)) stack++;
    this.entries.push({
      kind, target, state: target?.combat, point: point ? { ...point } : null, top,
      damage, text: kind === 'damage' ? formatDamage(damage) : null, age: 0, stack,
    });
  }

  // Called exactly once per fixed step, after hazards have resolved. Rendering
  // never consumes events or advances lifetimes; paused sessions stay still.
  update(dt, events, deflections, fighters, { damageHints, combatHints, damageTarget } = {}) {
    this.retain((entry) => {
      entry.age += dt;
      return entry.age < FEEDBACK.life && (entry.kind === 'damage' ? damageHints : combatHints) &&
        (!entry.target || (fighters.includes(entry.target) && !entry.target.lostToVoid && entry.state === entry.target.combat));
    });
    for (const event of events) {
      const target = event.target;
      if (!fighters.includes(target) || target.lostToVoid) continue;
      if (damageHints && (damageTarget === undefined || target === damageTarget) && event.type === 'hit' && event.damage > 0) {
        this.add('damage', { target, damage: event.damage });
      }
      if (!combatHints) continue;
      if (event.type === 'block') this.add('blocked', { target });
      if (event.type === 'hit' && event.paralysis > 0 && event.paralysisApplied) this.add('stunned', { target });
    }
    if (combatHints) for (const event of deflections) {
      const p = event.projectile;
      const frame = p.frame;
      const scale = p.sprites?.worldPerArt ?? 1;
      const angle = p.angle ?? 0;
      const halfHeight = frame
        ? (Math.abs(Math.sin(angle)) * (frame.artW ?? 0) + Math.abs(Math.cos(angle)) * (frame.artH ?? 0)) * scale / 2
        : 0;
      this.add('deflected', { point: event.point, top: Math.min(p.def.hitbox.y, -halfHeight) });
    }
  }

  draw(arena) {
    if (!this.entries.length) return;
    const { ctx, view, reducedMotion } = arena;
    const s = view.scale;
    const font = Math.max(15 * view.dpr, Math.round(15 * s));
    const rows = [];
    ctx.save();
    ctx.font = `800 ${font}px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, font * 0.2);
    ctx.strokeStyle = 'rgba(12, 12, 14, 0.85)';
    for (const entry of this.entries) {
      const style = FEEDBACK[entry.kind];
      const text = style.key ? t(style.key) : entry.text;
      let x, y;
      if (entry.target) {
        const [anchorX, , footY] = arena.markerAnchor(entry.target);
        if (!statusOnScreen(anchorX, footY, view)) continue;
        x = anchorX;
        y = arena.statusTop(entry.target);
      } else {
        [x, y] = arena.toScreen(entry.point.x, entry.point.y + entry.top);
      }
      const progress = entry.age / FEEDBACK.life;
      y -= 2 * view.dpr + entry.stack * font * 1.2 + (reducedMotion ? 0 : FEEDBACK.rise * progress * s);
      // Nearby fighters and projectiles can share screen space. Separate their
      // labels too, without moving either simulation anchor.
      const width = ctx.measureText(text).width + font * 0.3;
      while (rows.some((row) => Math.abs(x - row.x) < (width + row.width) / 2 && Math.abs(y - row.y) < font * 1.15)) {
        y -= font * 1.2;
      }
      rows.push({ x, y, width });
      ctx.globalAlpha = progress < FEEDBACK.fade ? 1 : Math.max(0, (1 - progress) / (1 - FEEDBACK.fade));
      ctx.fillStyle = style.color;
      ctx.strokeText(text, Math.round(x), Math.round(y));
      ctx.fillText(text, Math.round(x), Math.round(y));
    }
    ctx.restore();
  }
}
