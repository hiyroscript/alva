// Combat architecture.
//
// This build ships with NO attacks because #0001 has no attack/hit/block
// animation frames yet. Everything needed to add them is here so a future
// attack only needs data:
//
//   attacks: {
//     jab: createAttackDefinition({
//       id: 'jab', animation: 'jab', startup: 0.07, active: 0.05, recovery: 0.16,
//       damage: 6, hitbox: { x: 18, y: -62, w: 34, h: 18 },
//       knockback: { x: 180, y: 0 }, hitstun: 0.22, blockstun: 0.14, cooldown: 0.1,
//     }),
//   },
//   actions: { primary: 'jab', ... }
//
// Hitboxes are defined facing right relative to the fighter's origin
// (bottom-centre) and mirrored automatically.

const ATTACK_DEFAULTS = {
  animation: null,
  startup: 0.08,
  active: 0.06,
  recovery: 0.18,
  damage: 0,
  chipDamage: 0,
  hitbox: { x: 0, y: -60, w: 30, h: 20 },
  knockback: { x: 0, y: 0 },
  hitstun: 0.2,
  blockstun: 0.12,
  hitstop: 0.06,
  cooldown: 0,
  groundOnly: false,
  lockMovement: true,
};

export function createAttackDefinition(spec) {
  if (!spec?.id) throw new Error('[Maxy] Attack definitions need an id');
  const def = { ...ATTACK_DEFAULTS, ...spec };
  def.total = def.startup + def.active + def.recovery;
  return Object.freeze(def);
}

// Per-fighter combat state.
export class CombatState {
  constructor(stats) {
    this.maxHealth = stats.health;
    this.health = stats.health;
    this.blockDamageScale = stats.blockDamageScale ?? 0.2;
    this.blocking = false;
    this.stun = 0;          // hitstun / blockstun remaining
    this.hitstop = 0;       // freeze frames on impact
    this.attack = null;     // { def, time, hasHit }
    this.cooldowns = new Map();
    this.lastIntent = null; // last combat button pressed (for future buffering/UI)
  }

  get attacking() {
    return !!this.attack;
  }

  get phase() {
    const a = this.attack;
    if (!a) return null;
    if (a.time < a.def.startup) return 'startup';
    if (a.time < a.def.startup + a.def.active) return 'active';
    return 'recovery';
  }

  canAct() {
    return !this.attack && this.stun <= 0 && this.health > 0;
  }

  update(dt) {
    for (const [id, t] of this.cooldowns) {
      if (t - dt <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, t - dt);
    }
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      return;
    }
    if (this.stun > 0) this.stun = Math.max(0, this.stun - dt);
    if (this.attack) {
      this.attack.time += dt;
      if (this.attack.time >= this.attack.def.total) {
        this.cooldowns.set(this.attack.def.id, this.attack.def.cooldown);
        this.attack = null;
      }
    }
  }
}

// World-space rectangle for a box defined relative to a fighter origin.
export function worldBox(fighter, box, out = {}) {
  const facing = fighter.facing;
  out.x = facing > 0 ? fighter.body.x + box.x : fighter.body.x - box.x - box.w;
  out.y = fighter.body.y + box.y;
  out.w = box.w;
  out.h = box.h;
  return out;
}

const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const scratchHit = {};
const scratchHurt = {};

// Resolves hits between fighters each simulation step.
export class CombatSystem {
  constructor() {
    this.events = []; // { type: 'hit' | 'block', attacker, target, damage }
  }

  update(fighters) {
    this.events.length = 0;
    for (const attacker of fighters) {
      const atk = attacker.combat.attack;
      if (!atk || atk.hasHit || attacker.combat.phase !== 'active') continue;
      const hit = worldBox(attacker, atk.def.hitbox, scratchHit);
      for (const target of fighters) {
        if (target === attacker || target.combat.health <= 0) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        atk.hasHit = true;
        this.applyHit(attacker, target, atk.def);
        break;
      }
    }
    return this.events;
  }

  applyHit(attacker, target, def) {
    const tc = target.combat;
    const blocked = tc.blocking && target.facing === -attacker.facing;
    const damage = blocked ? def.chipDamage || def.damage * tc.blockDamageScale : def.damage;
    tc.health = Math.max(0, tc.health - damage);
    tc.stun = blocked ? def.blockstun : def.hitstun;
    tc.hitstop = def.hitstop;
    attacker.combat.hitstop = def.hitstop;
    const kx = (blocked ? 0.5 : 1) * def.knockback.x * attacker.facing;
    target.body.vx = kx;
    if (!blocked && def.knockback.y) {
      target.body.vy = -def.knockback.y;
      target.body.grounded = false;
    }
    this.events.push({ type: blocked ? 'block' : 'hit', attacker, target, damage });
  }
}
