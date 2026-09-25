// Projectiles: independent battle entities thrown by an attack.
//
// An attack with a `projectile` entry (see createAttackDefinition in
// js/game/combat.js) releases one projectile when its time crosses `spawnAt`.
// The Fighter queues the release with its facing at that moment; the Battle
// then turns it into a live Projectile, owns it, moves it every fixed step,
// resolves its hits through CombatSystem and removes it once it is spent.
// Behaviour is data on the character (`projectiles`), and so is the art
// (`projectileAnimations`, normalized separately from fighter poses):
//
//   projectiles: {
//     shuriken: {
//       animation: 'shuriken', speed: 700, lifetime: 1.5,
//       hitbox: { x: -5, y: -5, w: 10, h: 10 },
//       damage: 1, baseKnockback: { x: 0, y: 0 }, hitstun: 0.16, blockstun: 0.1, hitstop: 0.04,
//     },
//   },
//
// `baseKnockback` is the projectile's own default launch (see
// js/data/knockback.js); an optional `accumulatedKnockbackAxis` names the
// axis the target's accumulated Knockback adds launch along (by default its
// dominant one), and an optional `knockbackGrowth` how strongly (by default
// the standard rate). A projectile with no default launch never launches.
//
// A projectile flies straight in the direction it was released, hits at most
// once and then disappears. It also disappears when its lifetime runs out,
// when it flies into the Void (the stage's kill boundary; the open air past
// the ledges does not stop it) or when it meets a solid block, the main
// floor's body included; one-way platforms never stop it. Its hitbox is
// centred on its position and mirrors with its direction.

import { resolveKnockbackGrowth, resolveLaunchAxis } from '../data/knockback.js';

const PROJECTILE_DEFAULTS = {
  animation: null,
  speed: 0,
  lifetime: 1,
  hitbox: { x: -4, y: -4, w: 8, h: 8 },
  damage: 0,
  chipDamage: 0,
  baseKnockback: { x: 0, y: 0 },
  hitstun: 0.2,
  blockstun: 0.12,
  hitstop: 0.06,
};

// Age is a sum of fixed steps; compare against boundaries with a little slack
// (see PHASE_EPSILON in combat.js).
const TIME_EPSILON = 1e-6;

export function createProjectileDefinition(spec) {
  if (!spec?.id) throw new Error('[Alva] Projectile definitions need an id');
  const def = { ...PROJECTILE_DEFAULTS, ...spec };
  def.accumulatedKnockbackAxis = resolveLaunchAxis(def.baseKnockback, spec.accumulatedKnockbackAxis, `Projectile "${spec.id}"`);
  def.knockbackGrowth = resolveKnockbackGrowth(spec.knockbackGrowth, `Projectile "${spec.id}"`);
  return Object.freeze(def);
}

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class Projectile {
  // `anim` is the normalized projectile animation (SpriteSet.projectile()).
  // `direction` is fixed here: the projectile never follows its owner's
  // later facing.
  constructor({ owner, def, anim, x, y, direction }) {
    this.owner = owner;
    this.def = def;
    this.anim = anim;
    this.direction = direction;
    this.speed = def.speed;
    this.vx = def.speed * direction;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.renderX = x;
    this.renderY = y;
    this.age = 0; // seconds alive; also the animation clock
    this.alive = true;
  }

  // Builds the projectile an owner released, or null if it has no such
  // projectile or no art for it (never an invisible hitbox).
  static release(owner, { id, offset, direction }) {
    const def = owner.projectileDefs?.[id];
    const anim = def && owner.sprites.projectile(def.animation);
    if (!anim) {
      console.warn(`[Alva] Projectile "${id}" has no animation frames; not spawned.`);
      return null;
    }
    const b = owner.body;
    return new Projectile({
      owner, def, anim, direction,
      x: b.x + (offset?.x ?? 0) * direction,
      y: b.y + (offset?.y ?? 0),
    });
  }

  update(dt, stage) {
    if (!this.alive) return;
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx * dt;
    this.age += dt;
    if (this.age >= this.def.lifetime - TIME_EPSILON) {
      this.alive = false;
      return;
    }
    // Gone once it has flown clean into the Void or into a solid block.
    const box = this.hitbox(scratch);
    const v = stage.void;
    if (box.x + box.w < v.left || box.x > v.right || box.y + box.h < v.top || box.y > v.bottom) this.alive = false;
    else if (stage.solids.some((s) => overlaps(box, s))) this.alive = false;
  }

  // World-space collision box.
  hitbox(out = {}) {
    const hb = this.def.hitbox;
    out.x = this.direction > 0 ? this.x + hb.x : this.x - hb.x - hb.w;
    out.y = this.y + hb.y;
    out.w = hb.w;
    out.h = hb.h;
    return out;
  }

  // Frame on screen: the clip runs on the projectile's own clock and loops
  // for as long as it flies. Speed never depends on it.
  get frameIndex() {
    const n = this.anim.frames.length;
    const i = Math.floor(this.age * this.anim.fps + TIME_EPSILON);
    return this.anim.loop ? i % n : Math.min(i, n - 1);
  }

  get frame() {
    return this.anim.frames[this.frameIndex];
  }

  // Mirrored when its art travels the other way; direction-neutral art
  // (sourceFacing 0) never is. Rendering only.
  get flip() {
    const source = this.anim.sourceFacing;
    return !!source && this.direction !== source;
  }

  // Interpolated position for rendering between fixed steps.
  interpolate(alpha) {
    this.renderX = this.prevX + (this.x - this.prevX) * alpha;
    this.renderY = this.prevY + (this.y - this.prevY) * alpha;
  }
}

const scratch = {};

// Turns every projectile the fighters released this step into a live
// Projectile in `list`. Each release is consumed exactly once.
export function spawnProjectiles(fighters, list) {
  for (const f of fighters) {
    for (const release of f.releases) {
      const p = Projectile.release(f, release);
      if (p) list.push(p);
    }
    f.releases.length = 0;
  }
}

// Drops spent projectiles from `list`, in place, keeping the order.
export function removeDeadProjectiles(list) {
  let n = 0;
  for (const p of list) if (p.alive) list[n++] = p;
  list.length = n;
}
