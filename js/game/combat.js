// Combat architecture.
//
// Attacks are pure data on the character definition; Fighter turns each entry
// into a frozen definition with createAttackDefinition(). #0001's Basic
// Attack 1 (ground `ba1`, mid-air `midairBa1`, both on action1), Basic
// Attack 2 (`ba2` / `midairBa2` on action2) and Throw (`throw` on primary)
// are the real attacks so far; see js/data/characters.js. The general shape:
//
//   attacks: {
//     jab: {
//       animation: 'jab', startup: 0.07, active: 0.05, recovery: 0.16,
//       damage: 6, hitbox: { x: 18, y: -62, w: 34, h: 18 },
//       knockback: { x: 180, y: 0 }, hitstun: 0.22, blockstun: 0.14, cooldown: 0.1,
//     },
//     airJab: { animation: 'airJab', ... },
//   },
//   // One attack per action, or { ground, air } chosen by grounded state.
//   actions: { primary: 'jab', action1: { ground: 'jab', air: 'airJab' }, ... }
//
// An attack needs real frames for its `animation`; without them it is refused
// rather than faked. Its hitbox only exists during the active phase.
// Hitboxes are defined facing right relative to the fighter's origin
// (bottom-centre) and mirrored automatically.
//
// A projectile attack has `hitbox: null` (no melee strike) and a `projectile`
// event instead: once its time crosses `spawnAt` it releases that projectile,
// exactly once, from `offset` (facing right from the origin, mirrored).
// See js/game/projectile.js.
//
//   throw: {
//     animation: 'throw', startup: 1 / 12, active: 1 / 12, recovery: 1 / 12,
//     hitbox: null, projectile: { id: 'shuriken', spawnAt: 1 / 12, offset: { x: 16, y: -38 } },
//     cooldown: 0.25, groundOnly: true,
//   },
//
// Defense is the shared player input; each character's `defense` entry says
// how it defends (see createDefenseDefinition):
//
//   // Dodge: one press, one clip; attacks pass through while invulnerable.
//   defense: {
//     type: 'dodge',
//     ground: { animation: 'dodge', startup: 1 / 12, invulnerable: 1 / 12, recovery: 1 / 12 },
//     air: { animation: 'midairDodge', ... },
//   }
//   // Block: a held guard that takes chip damage (stats.blockDamageScale)
//   // and each attack's blockstun instead of a full hit.
//   defense: { type: 'block' }
//
// A Dodge is not an attack: no hitbox, damage, cooldown or combat event.
//
// A summon (see js/game/clone.js) is a detached attacker: a temporary clone
// that performs one of its owner's attacks from its own position and facing.
// Its hits resolve through the same applyHit and credit the owner, but, like
// a projectile's, they never freeze the owner.

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
  projectile: null, // { id, spawnAt, offset } for a projectile attack
};

// Attack time is a sum of fixed steps, so compare phase boundaries with a
// little slack: a phase that is a whole number of steps long (e.g. 1 / 12 s at
// 60 Hz) then lasts exactly that many steps instead of drifting by one.
const PHASE_EPSILON = 1e-6;

// 'startup' | 'active' | 'recovery' for an attack `time` seconds in. Shared
// by fighters (CombatState.phase) and clones.
export function attackPhase(def, time) {
  if (time < def.startup - PHASE_EPSILON) return 'startup';
  if (time < def.startup + def.active - PHASE_EPSILON) return 'active';
  return 'recovery';
}

export function createAttackDefinition(spec) {
  if (!spec?.id) throw new Error('[Alva] Attack definitions need an id');
  const def = { ...ATTACK_DEFAULTS, ...spec };
  def.total = def.startup + def.active + def.recovery;
  return Object.freeze(def);
}

const DODGE_DEFAULTS = { animation: null, startup: 0, invulnerable: 0, recovery: 0 };

function createDodgeMove(spec) {
  if (!spec) return null;
  const move = { ...DODGE_DEFAULTS, ...spec };
  move.total = move.startup + move.invulnerable + move.recovery;
  return Object.freeze(move);
}

// Frozen form of a character's `defense` entry, or null for a fighter that has
// no Defense (the input then does nothing).
export function createDefenseDefinition(spec) {
  if (!spec) return null;
  if (spec.type === 'dodge') {
    return Object.freeze({ type: 'dodge', ground: createDodgeMove(spec.ground), air: createDodgeMove(spec.air) });
  }
  if (spec.type === 'block') return Object.freeze({ ...spec });
  throw new Error(`[Alva] Unknown defense type "${spec.type}"`);
}

// Per-fighter combat state.
export class CombatState {
  constructor(stats) {
    this.maxHealth = stats.health;
    this.health = stats.health;
    // Energy resource shown under the health bar. Starts full, and a reset
    // (new CombatState) refills it. Only spendEnergy() lowers it: #0001's
    // Charged BA1 Clone Attack costs 25. No Energy regeneration or gain
    // exists yet.
    this.maxEnergy = stats.energy ?? 100;
    this.energy = this.maxEnergy;
    // Block-type Defense only: the held guard and its chip-damage scale.
    this.blockDamageScale = stats.blockDamageScale ?? 0.2;
    this.blocking = false;
    this.stun = 0;          // hitstun / blockstun remaining
    this.hitstop = 0;       // freeze frames on impact
    this.attack = null;     // { def, time, hasHit, projectileSpawned }
    this.release = null;    // the attack's projectile, released this step (see Fighter.update)
    this.defenseAction = null; // { type: 'dodge', def, time } while a Dodge plays
    this.cooldowns = new Map();
    this.lastIntent = null; // last combat button pressed (for future buffering/UI)
  }

  get attacking() {
    return !!this.attack;
  }

  get phase() {
    const a = this.attack;
    return a ? attackPhase(a.def, a.time) : null;
  }

  // 'startup' | 'invulnerable' | 'recovery' while a Dodge plays, else null.
  get defensePhase() {
    const d = this.defenseAction;
    if (!d) return null;
    if (d.time < d.def.startup - PHASE_EPSILON) return 'startup';
    if (d.time < d.def.startup + d.def.invulnerable - PHASE_EPSILON) return 'invulnerable';
    return 'recovery';
  }

  // Attacks pass through an invulnerable fighter (see CombatSystem.update).
  get invulnerable() {
    return this.defensePhase === 'invulnerable';
  }

  canAct() {
    return !this.attack && !this.defenseAction && this.stun <= 0 && this.health > 0;
  }

  // Whether `amount` Energy is available to spend.
  canSpendEnergy(amount) {
    return amount >= 0 && this.energy >= amount;
  }

  // Spends `amount` Energy, once, if there is enough: true when paid. With
  // too little it changes nothing and returns false; it never goes below 0.
  spendEnergy(amount) {
    if (!this.canSpendEnergy(amount)) return false;
    this.energy = Math.max(0, this.energy - amount);
    return true;
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
      // One-shot release: the step the attack's time crosses `spawnAt`. A
      // throw interrupted by a hit before that point throws nothing.
      const proj = this.attack.def.projectile;
      if (proj && !this.attack.projectileSpawned && this.attack.time >= proj.spawnAt - PHASE_EPSILON) {
        this.attack.projectileSpawned = true;
        if (this.stun <= 0) this.release = proj;
      }
      if (this.attack.time >= this.attack.def.total - PHASE_EPSILON) {
        this.cooldowns.set(this.attack.def.id, this.attack.def.cooldown);
        this.attack = null;
      }
    }
    // A Dodge ends by itself after one pass of its clip.
    if (this.defenseAction) {
      this.defenseAction.time += dt;
      if (this.defenseAction.time >= this.defenseAction.def.total - PHASE_EPSILON) this.defenseAction = null;
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

// Resolves hits each simulation step: fighters' melee hitboxes, then live
// projectiles (see js/game/projectile.js), then summoned clones (see
// js/game/clone.js).
export class CombatSystem {
  constructor() {
    // { type: 'hit' | 'block', attacker, target, damage, projectile, summon }
    // `attacker` is the owner for a projectile or clone hit; `projectile` and
    // `summon` are null for the fighter's own melee.
    this.events = [];
  }

  update(fighters, projectiles = [], clones = []) {
    this.events.length = 0;
    for (const attacker of fighters) {
      const atk = attacker.combat.attack;
      // A projectile attack has no melee hitbox: its damage is the projectile's.
      if (!atk || !atk.def.hitbox || atk.hasHit || attacker.combat.phase !== 'active') continue;
      const hit = worldBox(attacker, atk.def.hitbox, scratchHit);
      for (const target of fighters) {
        if (target === attacker || target.combat.health <= 0) continue;
        // Dodged: the attack passes through without being used up, so it can
        // still connect if it is active after the invulnerable frames end.
        if (target.combat.invulnerable) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        atk.hasHit = true;
        this.applyHit(attacker, target, atk.def);
        break;
      }
    }
    for (const p of projectiles) {
      if (!p.alive) continue;
      const hit = p.hitbox(scratchHit);
      for (const target of fighters) {
        if (target === p.owner || target.combat.health <= 0) continue;
        // Dodged: the projectile flies on, unspent, and can still connect if
        // it overlaps once the invulnerable frames end.
        if (target.combat.invulnerable) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        // One hit, then it is gone (a blocked projectile included).
        p.alive = false;
        this.applyHit(p.owner, target, p.def, { facing: p.direction, projectile: p });
        break;
      }
    }
    for (const c of clones) {
      // Only during the attack's active phase, and only once per attack.
      const hit = c.hitbox(scratchHit);
      if (!hit) continue;
      for (const target of fighters) {
        if (target === c.owner || target.combat.health <= 0) continue;
        // Dodged: passes through unspent, exactly like the fighter's own.
        if (target.combat.invulnerable) continue;
        const struck = target.def.hurtboxes.some((hb) => intersects(hit, worldBox(target, hb, scratchHurt)));
        if (!struck) continue;
        c.hasHit = true;
        // The clone's own facing, never the owner's: knockback travels from
        // the clone, and a Block guard must face the clone to hold.
        this.applyHit(c.owner, target, c.attackDef, { facing: c.facing, summon: c });
        c.hitstop = c.attackDef.hitstop;
        break;
      }
    }
    return this.events;
  }

  // Shared by melee, projectiles and clones. `facing` is the direction the
  // hit travels: the attacker's facing for melee, the projectile's own
  // direction (fixed when thrown) or the clone's facing (fixed when
  // summoned). `blocked` needs a Block-type guard facing into it; a Dodge
  // never blocks, so a hit outside its invulnerable frames is a full hit.
  // A detached hit (a projectile's or a clone's) freezes only its target:
  // the owner is elsewhere, doing something else.
  applyHit(attacker, target, def, {
    facing = attacker.facing, projectile = null, summon = null, detached = !!(projectile || summon),
  } = {}) {
    const tc = target.combat;
    const blocked = tc.blocking && target.facing === -facing;
    // Hitstun always wins: a hit cancels a Dodge in its startup or recovery.
    tc.defenseAction = null;
    const damage = blocked ? def.chipDamage || def.damage * tc.blockDamageScale : def.damage;
    tc.health = Math.max(0, tc.health - damage);
    tc.stun = blocked ? def.blockstun : def.hitstun;
    tc.hitstop = def.hitstop;
    if (!detached) attacker.combat.hitstop = def.hitstop;
    const kx = (blocked ? 0.5 : 1) * def.knockback.x * facing;
    target.body.vx = kx;
    if (!blocked && def.knockback.y) {
      target.body.vy = -def.knockback.y;
      target.body.grounded = false;
    }
    this.events.push({ type: blocked ? 'block' : 'hit', attacker, target, damage, projectile, summon });
  }
}
