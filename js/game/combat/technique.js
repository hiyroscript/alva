// Techniques: multi-phase special moves the fighter itself performs.
//
// A numbered button may be a technique (`{ type: 'technique', id }` in the
// character's `actions`; see js/data/loadout.js), as it may be a summon, a
// detached temporary entity (js/game/combat/summon.js). A technique is a
// multi-phase move the real fighter performs, driven by this runtime. The
// Fighter starts one (Fighter.tryTechnique), advances it every fixed step
// and ends it; the Battle spawns what it releases and the CombatSystem
// resolves its hits. It is not an attack (no combat.attack), a projectile
// or a summon. Behaviour is data on the character (`techniques`, keyed by
// the attack it is), and so are its clips, named after it (attack5_...).
//
// The runtime implements one form of technique: the cast. The fighter
// stands still, committed to a casting pose, then lets go of what it casts
// all at once: a projectile, a burst round itself, or both. Nothing in it
// reads a fighter or a button: any fighter may give a cast its own clips,
// timing, projectile and burst. E.g. #0001's Hollow Purple (attack5) and
// Unlimited Void (attack4):
//
//   techniques: {
//     attack5: {
//       castAnimation: 'attack5_cast', releaseAnimation: 'attack5_release', cooldown: 12,
//       projectile: { id: 'attack5_object', offset: { x: 95, y: -60 } },
//     },
//     attack4: {
//       castAnimation: 'attack4_cast', releaseAnimation: 'attack4_release', cooldown: 14,
//       burst: { hitbox: { x: -250, y: -210, w: 500, h: 230 }, hit: { damage: 3, unblockable: true, paralyze: 1.8 } },
//     },
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
//            reaches both sides). releaseAnimation then plays once, the
//            fighter still committed.
//   done     the fighter is free again.
//
// The fighter must stay grounded from the first cast frame until the
// technique is over: losing the ground ends it at once (nothing released
// if it was still casting) and the fighter falls (see Fighter.update). A hit
// on the fighter ends it too (see CombatSystem.applyHit): no armour, no
// invulnerability, so a cast can be broken before it lets go. What it has
// released by then is out of its hands: the projectile flies on, the burst
// has landed.
//
// Clocks follow the fighter's SpriteAnimator: a phase entered during the
// fighter's own update counts that step (its first frame shows at `time` =
// one step), so the pose on screen and the release always agree.
//
// The burst's hit is resolved by applyHit like an attack's, with its own
// `damage`, `baseLaunch` and `directionalLaunch` (see js/data/launch.js) and
// hit effects (js/game/combat/hit-effects.js), validated here exactly like
// an attack's. A horizontal launch travels along the technique's facing.

import { resolveHitLaunch } from '../../data/launch.js';
import { resolveHitEffects } from './hit-effects.js';

const HIT_DEFAULTS = {
  damage: 0,
  baseLaunch: 0,
  directionalLaunch: null,
  hitstun: 0.2,
  blockstun: 0.12,
  hitstop: 0.06,
};

const TECHNIQUE_DEFAULTS = {
  castAnimation: null,
  releaseAnimation: null,
  // Seconds before the technique can be used again, from its start (see
  // Fighter.tryTechnique): spent whether it lands or not.
  cooldown: 0,
  // { id, offset }: the projectile it releases (see above), or null.
  projectile: null,
  // { hitbox, hit }: the burst round the fighter it releases, or null.
  burst: null,
};

// Clocks are sums of fixed steps; compare against boundaries with a little
// slack (see PHASE_EPSILON in attacks.js).
const TIME_EPSILON = 1e-6;

function createHit(id, spec) {
  if (!spec) return null;
  const owner = `Hit "${id}"`;
  return Object.freeze({ ...HIT_DEFAULTS, ...spec, id, ...resolveHitLaunch(spec, owner), ...resolveHitEffects(spec, owner) });
}

export function createTechniqueDefinition(spec) {
  if (!spec?.id) throw new Error('[Alva] Technique definitions need an id');
  const def = { ...TECHNIQUE_DEFAULTS, ...spec };
  if (def.projectile) {
    const o = def.projectile.offset ?? {};
    def.projectile = Object.freeze({ id: def.projectile.id, offset: Object.freeze({ x: o.x ?? 0, y: o.y ?? 0 }) });
  }
  if (def.burst) {
    def.burst = Object.freeze({ hitbox: Object.freeze({ ...def.burst.hitbox }), hit: createHit(`${spec.id}.burst`, def.burst.hit) });
  }
  return Object.freeze(def);
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
  if (!def.projectile && !def.burst) return 'it releases nothing (no projectile and no burst)';
  if (def.projectile) {
    const proj = owner.projectileDefs?.[def.projectile.id];
    if (!proj) return `its projectile "${def.projectile.id}" is not defined`;
    if (!proj.animation || !owner.sprites.projectile(proj.animation)) return `its projectile "${def.projectile.id}" has no animation frames`;
  }
  if (def.burst) {
    const box = def.burst.hitbox;
    if (!(box?.w > 0 && box?.h > 0)) return 'its burst has no hitbox';
    if (!def.burst.hit) return 'its burst has no hit';
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
  // one) and its burst is due for the CombatSystem this step.
  release() {
    if (this.released) return;
    this.released = true;
    const shot = this.def.projectile;
    if (shot) this.owner.releases.push({ id: shot.id, offset: shot.offset, direction: this.facing });
    if (this.def.burst) this.burstDue = true;
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
    this.owner = null;
  }
}
