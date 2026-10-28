// Techniques: multi-phase special moves the fighter itself performs.
//
// A numbered button may be a technique (`{ type: 'technique', id }` in the
// character's `actions`; see js/data/loadout.js), as it may be a summon, a
// detached temporary entity (js/game/combat/summon.js). A technique is a
// multi-phase move the real fighter performs, driven by this runtime. The
// Fighter starts one (Fighter.tryTechnique), advances it every fixed step
// and ends it; the Battle spawns what it releases and the CombatSystem
// resolves its hits. Its execution is its own: not an ordinary attack (no
// combat.attack), a projectile or a summon. But what it does makes it an
// attack all the same (its definition's `offense`, see
// js/game/combat/offense.js): a burst that can harm and a projectile it
// releases are attacks, blocked by an active Shield like any other. A cast
// that only heals its own fighter harms nobody, so it is no attack.
// Behaviour is data on the character (`techniques`, keyed by the attack it
// is), and so are its clips, named after it (attack5_...).
//
// The runtime implements one form of technique: the cast. The fighter
// stands still, committed to a casting pose, then lets go of what it casts
// all at once: a projectile, a burst round itself, a heal of its own, or
// any of them together. Nothing in it reads a fighter or a button: any
// fighter may give a cast its own clips, timing, projectile, burst and
// heal. E.g. #0001's Hollow Purple (attack5) and Unlimited Void (attack4),
// and #0003's Mystical Palm Technique (attack4, a heal):
//
//   techniques: {
//     attack5: {
//       castAnimation: 'attack5_cast', releaseAnimation: 'attack5_release',
//       projectile: { id: 'attack5_object', offset: { x: 95, y: -60 } },
//     },
//     attack4: {
//       castAnimation: 'attack4_cast', releaseAnimation: 'attack4_release',
//       burst: { hitbox: { x: -250, y: -210, w: 500, h: 230 }, hit: { damage: 3, paralyze: 1.8 } },
//     },
//     attack4: { castAnimation: 'attack4_cast', releaseAnimation: 'attack4_release', heal: 10 },
//   },
//
// Phases, always explicit:
//
//   cast     castAnimation plays once from the press step. The fighter
//            stands still in the facing snapshotted at the start (the
//            direction held on the press step, if any) and can do nothing
//            else.
//   release  on its first step the technique releases: its `projectile`
//            (an entry of the character's `projectiles`, named
//            <attack>_object, sent the snapshotted way from `offset`, facing
//            right from the fighter's origin and mirrored, exactly as an
//            attack throws one) and its `burst` (`hit` dealt once to every
//            opponent whose hurtboxes its `hitbox` meets, facing right from
//            the fighter's origin and mirrored: a box round the fighter
//            reaches both sides; its optional `effect`, `{ animation,
//            offset }`, is the art the burst plays as it goes out, an
//            `effectAnimations` clip named <attack>_object played once,
//            centred at `offset` from the fighter, art only: see
//            takeEffect) and its `heal` (that many Launch Points
//            taken off its own fighter's, never below 0: see
//            CombatState.heal). releaseAnimation then plays once, the
//            fighter still committed.
//   done     the fighter is free again.
//
// The fighter must stay grounded from the first cast frame until the
// technique is over: losing the ground ends it at once (nothing released
// if it was still casting) and the fighter falls (see Fighter.update). A hit
// on the fighter ends it too (see CombatSystem.applyHit): no armour, no
// invulnerability, so a cast can be broken before it lets go (a heal
// broken so heals nothing). What it has released by then is out of its
// hands: the projectile flies on, the burst has landed, the heal is kept.
//
// Clocks follow the fighter's SpriteAnimator: a phase entered during the
// fighter's own update counts that step (its first frame shows at `time` =
// one step), so the pose on screen and the release always agree.
//
// The burst's hit is resolved by applyHit like an attack's, with its own
// `damage` (one of the tiers 1, 3, 5 or 10, required), `baseLaunch` and
// `directionalLaunch` (see js/data/launch.js) and hit effects
// (js/game/combat/hit-effects.js), validated here exactly like an attack's.
// A target whose Shield is up blocks it: no Launch Point, no paralysis, no
// launch, whatever the burst's size or the side it comes from.
//
// A technique's cooldown is the cooldown policy's (js/data/cooldowns.js),
// derived from what the cast releases: 5 s when its burst or its
// projectile (judged from the fighter's `projectiles`) deals 10 damage,
// else 3 s when it heals, paralyzes, charms, floats or frightens, else none
// at all. An entry may leave it out; one it declares must agree. It starts
// as the technique is released (its cast over: see release and
// takeCooldown), exactly once: a cast broken before that starts none, and
// one released keeps it whatever happens after. It recovers every fixed
// step, including hitstop. Phase timing is separate.
//
// Its Energy (`energyCost`, the Energy policy's, js/data/energy.js) is 15
// for an ordinary technique that releases a projectile or a burst (a
// construct), paid once as it starts; 0 for one with a special cooldown or
// one that only heals.
//
// A technique that is no attack (one that only heals its own fighter) gives
// way to any valid request while it plays (`freeCancel`, see
// yieldsToRequests in js/game/combat/offense.js): another move, a jump or a
// Dash ends it at once, before its release (nothing healed, no cooldown) or
// in its release pose (the heal and the cooldown kept). A technique that
// harms never does: it owns its fighter until it is over.
// A horizontal launch travels along the technique's facing.
//
// A technique may also be one its fighter can only reach in danger:
// `minLaunchPoint` (a whole number of Launch Points; 0, the default, is
// none) is the least Launch Point its own fighter must have for it to
// start. Below that, a press of it does nothing at all (nothing paid,
// nothing kept for later), the CPU never plans it and the ability HUD shows
// it held back ('danger', see moveRestriction in
// js/game/combat/move-status.js); once started, it plays out whatever
// happens to its fighter's Launch Point. Only the start reads it
// (inDanger): never its cooldown, Energy, classification or release. E.g.
// #0009's Air Sphere, its glowing trance, which comes over it only in
// mortal danger:
//
//   attack5: { castAnimation: 'attack5_cast', releaseAnimation: 'attack5_release',
//     minLaunchPoint: 30, burst: { ... } },

import { cooldownClass, resolveCooldown } from '../../data/cooldowns.js';
import { resolveMoveEnergy } from '../../data/energy.js';
import { createHit } from './hit-effects.js';
import { assertNoShieldBypass, resolveOffense, techniqueOffense, yieldsToRequests } from './offense.js';

const TECHNIQUE_DEFAULTS = {
  castAnimation: null,
  releaseAnimation: null,
  // Seconds before the technique can be used again, from its release (see
  // takeCooldown): spent whether it lands or not. The cooldown policy's,
  // never the entry's own (see above).
  cooldown: 0,
  // { id, offset }: the projectile it releases (see above), or null.
  projectile: null,
  // { hitbox, hit }: the burst round the fighter it releases, or null.
  burst: null,
  // Launch Point it takes off its own fighter as it releases (a whole
  // number; 0 is none): see `heal` above.
  heal: 0,
  // The least Launch Point its own fighter must have for it to start (a
  // whole number; 0 is none): see `minLaunchPoint` above.
  minLaunchPoint: 0,
};

// Clocks are sums of fixed steps; compare against boundaries with a little
// slack (see PHASE_EPSILON in attacks.js).
const TIME_EPSILON = 1e-6;

// Frozen technique definition from a character's technique entry (plus its
// `id`). `projectiles` is the fighter's own `projectiles` entry: the one it
// releases counts toward its cooldown class.
export function createTechniqueDefinition(spec, { projectiles = null } = {}) {
  if (!spec?.id) throw new Error('[Alva] Technique definitions need an id');
  const owner = `Technique "${spec.id}"`;
  assertNoShieldBypass(spec, owner);
  assertNoShieldBypass(spec.burst, `${owner}'s burst`);
  const cls = cooldownClass('technique', spec, { projectiles });
  const def = { ...TECHNIQUE_DEFAULTS, ...spec, cooldownClass: cls, cooldown: resolveCooldown(spec.cooldown, owner, { cls }) };
  if (def.projectile) {
    const o = def.projectile.offset ?? {};
    def.projectile = Object.freeze({ id: def.projectile.id, offset: Object.freeze({ x: o.x ?? 0, y: o.y ?? 0 }) });
  }
  if (def.burst) {
    def.burst = Object.freeze({
      hitbox: Object.freeze({ ...def.burst.hitbox }), hit: createHit(`${spec.id}.burst`, def.burst.hit),
      effect: resolveBurstEffect(def.burst.effect, owner),
    });
  }
  if (!(Number.isInteger(def.heal) && def.heal >= 0)) throw new Error(`[Alva] ${owner}'s heal must be a whole number of Launch Points from 0`);
  if (!(Number.isInteger(def.minLaunchPoint) && def.minLaunchPoint >= 0)) {
    throw new Error(`[Alva] ${owner}'s minLaunchPoint must be a whole number of Launch Points from 0`);
  }
  def.energyCost = resolveMoveEnergy(spec.energyCost, owner, 'technique', def, cls);
  def.offense = resolveOffense(spec, techniqueOffense(def), owner);
  def.freeCancel = yieldsToRequests(def.offense);
  return Object.freeze(def);
}

// A burst's frozen `effect` (see the top: the art it plays as it lets go),
// or null: its effect clip's key and its centre from the fighter's origin
// (facing right, mirrored with the technique's facing).
function resolveBurstEffect(spec, owner) {
  if (!spec) return null;
  if (typeof spec.animation !== 'string' || !spec.animation) throw new Error(`[Alva] ${owner}'s burst effect needs an animation`);
  const o = spec.offset ?? {};
  return Object.freeze({ animation: spec.animation, offset: Object.freeze({ x: o.x ?? 0, y: o.y ?? 0 }) });
}

// Whether `owner` is in the danger technique `def` needs to start (see
// `minLaunchPoint` above): always, for a technique that needs none. Read by
// every start (Fighter.tryTechnique), the CPU (moveReady in
// js/game/ai/cpu-intelligence/capabilities.js) and the ability HUD
// (moveRestriction), so the three never disagree.
export function inDanger(owner, def) {
  return !(def?.minLaunchPoint > 0) || (owner?.combat?.launchPoint ?? 0) >= def.minLaunchPoint;
}

// The fields naming a technique's fighter clips (fighter animations).
export const TECHNIQUE_CLIPS = Object.freeze(['castAnimation', 'releaseAnimation']);

// Why `owner` cannot start `def` right now, or null when it can. Checked
// before anything happens: never a cast around the wrong pose, nor an
// invisible projectile or burst.
export function techniqueProblem(owner, def) {
  for (const key of TECHNIQUE_CLIPS.map((field) => def[field])) {
    if (!key || !owner.sprites.has(key)) return `its fighter clip "${key}" has no animation frames`;
  }
  if (!def.projectile && !def.burst && !(def.heal > 0)) return 'it releases nothing (no projectile, no burst and no heal)';
  if (def.projectile) {
    const proj = owner.projectileDefs?.[def.projectile.id];
    if (!proj) return `its projectile "${def.projectile.id}" is not defined`;
    if (!proj.animation || !owner.sprites.projectile(proj.animation)) return `its projectile "${def.projectile.id}" has no animation frames`;
  }
  if (def.burst) {
    const box = def.burst.hitbox;
    if (!(box?.w > 0 && box?.h > 0)) return 'its burst has no hitbox';
    if (!def.burst.hit) return 'its burst has no hit';
    const art = def.burst.effect?.animation;
    if (art && !owner.sprites.effect(art)?.frames.length) return `its burst effect "${art}" has no animation frames`;
  }
  return null;
}

export class Technique {
  // `owner` is the Fighter performing it. Facing is snapshotted here, once:
  // the technique never turns, and it releases this way.
  constructor({ owner, def, action = null }) {
    this.owner = owner;
    this.def = def;
    this.action = action; // the button that started it (debug label)
    this.facing = owner.facing;
    this.phase = 'cast';
    this.time = 0; // seconds into the current phase (see update)
    this.released = false;
    this.burstDue = false; // the burst, waiting for the CombatSystem
    this.effectDue = false; // the burst's art, waiting for its fighter (see takeEffect)
    this.healDue = 0; // the heal, waiting for its fighter (see takeHeal)
    this.cooldownDue = false; // its cooldown, waiting for its fighter (see takeCooldown)
    this.endReason = null;
    this.castDuration = owner.sprites.duration(def.castAnimation);
    this.releaseDuration = owner.sprites.duration(def.releaseAnimation);
  }

  // Advances one fixed step of the fighter's update. Returns 'done' on the
  // step it is over, or null while it goes on. Ground is checked after the
  // fighter moves (see Fighter.update).
  update(dt) {
    // A pass completed on an earlier step ends its phase first...
    if (this.phase === 'cast' && this.time >= this.castDuration - TIME_EPSILON) {
      this.phase = 'release';
      this.time = 0;
      this.release();
    } else if (this.phase === 'release' && this.time >= this.releaseDuration - TIME_EPSILON) {
      return 'done';
    }
    // ...then this step counts.
    this.time += dt;
    return null;
  }

  // Lets go of what the technique casts, exactly once: its projectile joins
  // the fighter's releases (the Battle spawns it this step, like a thrown
  // one), its burst is due for the CombatSystem this step, and its
  // cooldown is due to start (the release is its one commitment).
  release() {
    if (this.released) return;
    this.released = true;
    const shot = this.def.projectile;
    if (shot) this.owner.releases.push({ id: shot.id, offset: shot.offset, direction: this.facing, ability: this.def.id });
    if (this.def.burst) this.burstDue = true;
    if (this.def.burst?.effect) this.effectDue = true;
    if (this.def.heal > 0) this.healDue = this.def.heal;
    this.cooldownDue = true;
  }

  // Whether its cooldown is due this step, taken (its fighter starts it,
  // see Fighter.update): true exactly once, on the step it releases.
  takeCooldown() {
    const due = this.cooldownDue;
    this.cooldownDue = false;
    return due;
  }

  // The art its burst plays as it lets go, taken on the step it does (its
  // fighter hands it to whoever shows it, see Fighter.effects): { animation,
  // x, y, facing }, the clip's centre in world space (the burst effect's
  // offset from the fighter, mirrored with the technique's facing), or null.
  // Art only: nothing in the simulation reads it.
  takeEffect() {
    if (!this.effectDue) return null;
    this.effectDue = false;
    const f = this.owner;
    const effect = this.def.burst.effect;
    return { animation: effect.animation, x: f.body.x + effect.offset.x * this.facing, y: f.body.y + effect.offset.y, facing: this.facing };
  }

  // The heal due this step, taken (its fighter applies it, see
  // Fighter.update): Launch Points, or 0 when none is due.
  takeHeal() {
    const heal = this.healDue;
    this.healDue = 0;
    return heal;
  }

  // The burst due this step, taken: its world-space box (`out`), centred on
  // the fighter's origin as authored and mirrored with the technique's
  // facing, or null when none is due.
  takeBurst(out = {}) {
    if (!this.burstDue) return null;
    this.burstDue = false;
    return this.burstBox(out);
  }

  // The burst's world-space box (see takeBurst); `render` uses the
  // interpolated position the fighter is drawn at.
  burstBox(out = {}, render = false) {
    const box = this.def.burst?.hitbox;
    const f = this.owner;
    if (!box || !f) return null;
    const x = render ? f.renderX : f.body.x;
    const y = render ? f.renderY : f.body.y;
    out.x = this.facing > 0 ? x + box.x : x - box.x - box.w;
    out.y = y + box.y;
    out.w = box.w;
    out.h = box.h;
    return out;
  }

  // Seconds until it releases (0 once it has), and until it is over: what
  // a reader such as the combat AI goes by.
  get releaseIn() {
    return this.phase === 'cast' ? Math.max(0, this.castDuration - this.time) : 0;
  }

  get endIn() {
    if (this.phase === 'cast') return this.releaseIn + this.releaseDuration;
    if (this.phase === 'release') return Math.max(0, this.releaseDuration - this.time);
    return 0;
  }

  // Fighter clip for the current phase (see Fighter.animationFor). Both are
  // one-shot, so each holds its last frame for whatever remains of it.
  get animation() {
    return this.phase === 'cast' ? this.def.castAnimation : this.def.releaseAnimation;
  }

  // Ends the technique for good (see Fighter.endTechnique): nothing more is
  // released, and every reference goes.
  end(reason) {
    this.phase = 'done';
    this.endReason = reason;
    this.burstDue = false;
    this.effectDue = false;
    this.healDue = 0;
    this.cooldownDue = false;
    this.owner = null;
  }
}
