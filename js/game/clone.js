// Summoned clones: temporary attack entities, not fighters.
//
// A charged action (see `chargedActions` in js/data/characters.js) makes the
// Fighter pay the summon's Energy and queue one summon request. The Battle
// then turns each request into a live Clone, owns it, updates it every fixed
// step, resolves its hit through CombatSystem and removes it once it is done.
// Behaviour is data on the character (`summons`):
//
//   summons: {
//     ba1Clone: {
//       attack: 'ba1', cloud: 'cloneCloud', energyCost: 25,
//       behindDistance: 48, effectOffset: { x: 0, y: -44 }, stageMargin: 17,
//     },
//   },
//
// A clone lives through exactly three phases:
//
//   appear  the `cloud` effect plays forwards once (frame 1 -> last); the
//           clone's first attack frame shows beneath the last cloud frame
//           as the smoke clears
//   attack  the owner's `attack` plays once with its own art and combat data
//   vanish  the body is gone; the same cloud plays backwards once
//           (last -> frame 1)
//
// and is then removed. It appears on the target's back side, facing the way
// the target faced at the summon, and never moves, turns or retargets after
// that. It has no health, Energy, controller, pushbox, hurtboxes, physics,
// camera or HUD presence: it cannot be hit and nothing collides with it. Its
// hitbox exists only during the attack's active phase and connects at most
// once; the hit credits the owner but freezes only the target and the clone
// itself, never the owner.

import { SpriteAnimator } from './sprite-animator.js';
import { attackPhase } from './combat.js';

const SUMMON_DEFAULTS = {
  attack: null,       // owner attack id the clone performs
  cloud: null,        // owner effect animation it appears / vanishes through
  energyCost: 0,
  behindDistance: 48, // world units behind the target
  effectOffset: { x: 0, y: 0 }, // cloud centre from the clone origin, facing right
  stageMargin: 0,     // kept this far inside the stage's horizontal bounds
};

// Clocks are sums of fixed steps; compare against boundaries with a little
// slack (see PHASE_EPSILON in combat.js).
const TIME_EPSILON = 1e-6;

export function createSummonDefinition(spec) {
  if (!spec?.id) throw new Error('[Alva] Summon definitions need an id');
  return Object.freeze({ ...SUMMON_DEFAULTS, ...spec });
}

// Why `owner` cannot summon `def` right now, or null when it can. Checked
// before any Energy is spent: never pay for an invisible clone or punch.
export function summonProblem(owner, def) {
  const cloud = owner.sprites.effect(def.cloud);
  if (!cloud?.frames.length) return `its cloud effect "${def.cloud}" has no animation frames`;
  const atk = owner.attacks[def.attack];
  if (!atk) return `its attack "${def.attack}" is not defined`;
  if (!atk.hitbox) return `its attack "${def.attack}" has no hitbox`;
  if (!atk.animation || !owner.sprites.has(atk.animation)) return `its attack "${def.attack}" has no animation frames`;
  return null;
}

export class Clone {
  // Everything is fixed here: position, facing and target never change.
  constructor({ owner, target, def, attackDef, cloud, x, y, facing }) {
    this.owner = owner;
    this.target = target;
    this.def = def;
    this.attackDef = attackDef;
    this.cloud = cloud;
    this.x = x;
    this.y = y;
    this.facing = facing;
    // The owner's own sprites: the clone is drawn with #0001's real art. The
    // clip is cued on its first frame now and only advances while attacking.
    this.animator = new SpriteAnimator(owner.sprites);
    this.animator.play(attackDef.animation, { restart: true });
    this.phase = 'appear';
    this.time = 0;          // seconds into the current cloud pass
    this.attackTime = 0;    // seconds into the attack
    this.hasHit = false;
    this.hitstop = 0;       // the clone's own impact freeze
    this.alive = true;
  }

  // Builds the clone an owner summoned, or null if it no longer can (never
  // an invisible one). Position and facing are snapshotted here, once.
  static summon(owner, { id, target }, stage) {
    const def = owner.summonDefs?.[id];
    const problem = !def ? `"${id}" is not defined` : !target ? 'there is no target' : summonProblem(owner, def);
    if (problem) {
      console.warn(`[Alva] Summon "${id}" not spawned: ${problem}.`);
      return null;
    }
    // Behind the target: on its back side, facing the way it faces.
    const facing = target.facing;
    const x = target.body.x - facing * def.behindDistance;
    return new Clone({
      owner, target, def,
      attackDef: owner.attacks[def.attack],
      cloud: owner.sprites.effect(def.cloud),
      x: stage ? Math.min(Math.max(x, stage.left + def.stageMargin), stage.right - def.stageMargin) : x,
      y: target.body.y,
      facing,
    });
  }

  // One pass of the cloud: how long appearing and vanishing each take.
  get cloudDuration() {
    return this.cloud.frames.length / this.cloud.fps;
  }

  update(dt) {
    if (!this.alive) return;
    if (this.phase === 'attack') {
      // Impact freeze: the attack clock and its art hold still.
      if (this.hitstop > 0) {
        this.hitstop = Math.max(0, this.hitstop - dt);
        return;
      }
      this.attackTime += dt;
      this.animator.update(dt);
      if (this.attackTime >= this.attackDef.total - TIME_EPSILON) {
        this.phase = 'vanish';
        this.time = 0;
      }
      return;
    }
    this.time += dt;
    if (this.time < this.cloudDuration - TIME_EPSILON) return;
    if (this.phase === 'appear') {
      // The cloud has played out: the clone starts its attack from frame 1.
      this.phase = 'attack';
      this.time = 0;
    } else {
      this.alive = false;
    }
  }

  // 'startup' | 'active' | 'recovery' during the attack, else null.
  get attackPhase() {
    return this.phase === 'attack' ? attackPhase(this.attackDef, this.attackTime) : null;
  }

  // World-space attack box during the attack's active phase, else null
  // (the debug overlay draws it). Built from the clone's own position and
  // facing, mirrored like a fighter's.
  activeBox(out = {}) {
    if (!this.alive || this.attackPhase !== 'active') return null;
    const box = this.attackDef.hitbox;
    out.x = this.facing > 0 ? this.x + box.x : this.x - box.x - box.w;
    out.y = this.y + box.y;
    out.w = box.w;
    out.h = box.h;
    return out;
  }

  // The box while it can still connect: active, and not yet used by a hit.
  hitbox(out = {}) {
    return this.hasHit ? null : this.activeBox(out);
  }

  // The clone's body frame while it attacks, and its first attack frame
  // beneath the last appearing cloud frame; none while vanishing.
  get frame() {
    if (this.phase === 'attack') return this.animator.frame;
    if (this.phase === 'appear' && this.cloudIndex === this.cloud.frames.length - 1) return this.animator.frame;
    return null;
  }

  // The cloud frame: forwards while appearing, backwards while vanishing,
  // on the clone's own clock; none during the attack.
  get cloudFrame() {
    const i = this.cloudIndex;
    return i === null ? null : this.cloud.frames[i];
  }

  get cloudIndex() {
    if (!this.alive || this.phase === 'attack') return null;
    const n = this.cloud.frames.length;
    const i = Math.min(Math.floor(this.time * this.cloud.fps + TIME_EPSILON), n - 1);
    return this.phase === 'appear' ? i : n - 1 - i;
  }

  // Mirrored exactly like the owner's own frames (per-clip sourceFacing).
  get spriteFlip() {
    const sourceFacing = this.animator.anim?.sourceFacing ?? this.owner.def.sourceFacing ?? 1;
    return this.facing !== sourceFacing;
  }

  // Cloud centre in world space (the offset mirrors with facing).
  cloudCenter() {
    const o = this.def.effectOffset;
    return [this.x + o.x * this.facing, this.y + o.y];
  }
}

// Turns every summon the fighters requested this step into a live Clone in
// `list`. Each request is consumed exactly once.
export function spawnClones(fighters, list, stage) {
  for (const f of fighters) {
    for (const request of f.summons) {
      const c = Clone.summon(f, request, stage);
      if (c) list.push(c);
    }
    f.summons.length = 0;
  }
}

// Updates every live clone one fixed step.
export function updateClones(list, dt) {
  for (const c of list) c.update(dt);
}

// Drops finished clones from `list`, in place, keeping the order.
export function removeDeadClones(list) {
  let n = 0;
  for (const c of list) if (c.alive) list[n++] = c;
  list.length = n;
}
