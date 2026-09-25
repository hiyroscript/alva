// Charged techniques: moves the fighter itself performs from Charge.
//
// A charged action (see `chargedActions` in js/data/characters.js) is either
// a summon, a detached temporary entity (js/game/clone.js), or a technique:
// a multi-phase move the real fighter performs, driven by this runtime. The
// Fighter starts one (Fighter.tryTechnique), advances it every fixed step,
// moves its body and ends it; the CombatSystem resolves its hits. It is
// not an attack (no combat.attack), a projectile or a summon. Behaviour is
// data on the character (`chargedTechniques`), e.g. #0001's Sphere Rush:
//
//   chargedTechniques: {
//     rasenRush: {
//       formAnimation: 'rasenForm', dashAnimation: 'rasenDash', confirmAnimation: 'rasenConfirm',
//       explosionAnimation: 'rasenExplosion', releaseAnimation: 'rasenRelease',
//       whiffReleaseAnimation: 'rasenWhiffRelease',
//       sphereBuild: 'rasenSphereBuild', sphereImpact: 'rasenSphereImpact',
//       sphereExplosion: 'rasenSphereExplosion',
//       cooldown: 5, dashSpeed: 1050,
//       handOffsets: { rasenForm: [{ x, y }, ...], rasenDash: [...] },
//       sphereHitbox: { x: -24, y: -24, w: 48, h: 48 }, targetOffset: { x: 0, y: -48 },
//       explosionDelay: 2.0, sphereGrowth: { startScale: 1, endScale: 1.4 },
//       firstHit: { damage: 0, ... }, tickInterval: 0.5, tickHit: { damage: 1, ... },
//       explosionHit: { damage: 15, ... },
//     },
//   },
//
// The fighter clips are fighter animations; the sphere clips are effect
// animations (centre-anchored, never mirrored). Phases, always explicit:
//
//   form     the fighter stands still: formAnimation plays once (its last
//            frame held) while sphereBuild plays once in its hand. Lasts the
//            longer of the two, so the rush never starts on a half-formed
//            sphere.
//   dash          one pass of dashAnimation at a fixed dashSpeed in the
//                 facing snapshotted at the start, the sphere complete
//                 (sphereBuild's last frame) in hand. Its hitbox, centred on
//                 the sphere, is the only contact search. No contact by the
//                 end of the pass, or a wall first: a whiff (below).
//   whiffRelease  a whiff only: the fighter stops dead, the sphere is let go
//                 (no hit, bind, impact or explosion) and
//                 whiffReleaseAnimation shows for one pass, the fighter still
//                 locked. Then the technique ends ('miss', or 'wall').
//   confirm       contact: firstHit, then the target is bound (see
//                 CombatState.bind), shown in its hurt pose on the hit step,
//                 and the sphere moves onto it, spinning there (sphereImpact,
//                 a looping clip, from the hit until the explosion);
//                 confirmAnimation plays once.
//   wait          confirmAnimation's last frame is held while the sphere
//                 keeps spinning and grows (sphereGrowth: startScale to
//                 endScale, reached as it explodes), until explosionDelay has
//                 passed since the hit.
//                 Through confirm and wait, every whole tickInterval since
//                 the hit (while the target is still bound) is one tickHit
//                 on it: Knockback only, no launch. A tick that would fall on
//                 the explosion's step is not dealt: the explosion is the
//                 last hit, never a tick as well.
//   explode       the fighter shows explosionAnimation while sphereExplosion
//                 plays once at the grown size. On its first frame the target
//                 is released, then takes explosionHit. Lasts the longer of
//                 the two clips, so the blast is always over first.
//   release       after the blast: the sphere is gone and releaseAnimation
//                 plays once, the fighter still locked; no hit, bind or
//                 search.
//   done          the fighter is free again.
//
// A blocked contact deals the block and ends the technique (no bind, ticks
// or explosion). The fighter must stay grounded from the first form frame
// until the technique is over: losing the ground ends it at once, releasing
// the target, and the fighter falls (see Fighter.update). A hit on the
// fighter ends it too (see CombatSystem.applyHit): no armour, no
// invulnerability.
//
// Clocks follow the fighter's SpriteAnimator: a phase entered during the
// fighter's own update counts that step (its first frame shows at `time` =
// one step), and a phase entered by a hit starts at 0 on the hit step. So the
// sphere frames, the hand the sphere sits in and the fighter frame on screen
// always agree.
//
// Each hit (firstHit, tickHit, explosionHit) is resolved by applyHit like an
// attack's, with its own numeric default launch, `baseKnockback: { x, y }`,
// and optionally the `accumulatedKnockbackAxis` the target's accumulated
// Knockback adds launch along and the `knockbackGrowth` it adds it at (see
// js/data/knockback.js). A hit with no default launch (a contact that only
// binds, a tick) never launches.

import { resolveKnockbackGrowth, resolveLaunchAxis } from '../data/knockback.js';

const HIT_DEFAULTS = {
  damage: 0,
  chipDamage: 0,
  baseKnockback: { x: 0, y: 0 },
  hitstun: 0.2,
  blockstun: 0.12,
  hitstop: 0.06,
};

const TECHNIQUE_DEFAULTS = {
  formAnimation: null,
  dashAnimation: null,
  confirmAnimation: null,
  explosionAnimation: null,
  releaseAnimation: null,
  whiffReleaseAnimation: null,
  sphereBuild: null,
  sphereImpact: null,
  sphereExplosion: null,
  // Seconds before the technique can be used again, from its start (see
  // Fighter.tryTechnique): spent whether it hits or not.
  cooldown: 0,
  dashSpeed: 0,
  // Sphere centre from the fighter's origin (bottom-centre), facing right,
  // one entry per frame of each fighter clip the sphere is held through;
  // x mirrors with the technique's facing.
  handOffsets: {},
  sphereHitbox: { x: -18, y: -18, w: 36, h: 36 }, // around the sphere centre
  targetOffset: { x: 0, y: 0 }, // sphere centre from the target's origin after contact
  explosionDelay: 2,
  // Size of the sphere on the target, as a multiple of its art's own size:
  // startScale from the hit, growing steadily over the wait to endScale as
  // it explodes; the blast keeps endScale. Visual only.
  sphereGrowth: { startScale: 1, endScale: 1 },
  firstHit: null,
  // Optional: one tickHit every tickInterval seconds while the target is
  // held, before the explosion.
  tickInterval: 0.5,
  tickHit: null,
  explosionHit: null,
};

// Clocks are sums of fixed steps; compare against boundaries with a little
// slack (see PHASE_EPSILON in combat.js).
const TIME_EPSILON = 1e-6;

const ORIGIN = Object.freeze({ x: 0, y: 0 });

function createHit(id, spec) {
  if (!spec) return null;
  const hit = { ...HIT_DEFAULTS, ...spec, id };
  hit.accumulatedKnockbackAxis = resolveLaunchAxis(hit.baseKnockback, spec.accumulatedKnockbackAxis, `Hit "${id}"`);
  hit.knockbackGrowth = resolveKnockbackGrowth(spec.knockbackGrowth, `Hit "${id}"`);
  return Object.freeze(hit);
}

export function createTechniqueDefinition(spec) {
  if (!spec?.id) throw new Error('[Alva] Charged technique definitions need an id');
  const def = { ...TECHNIQUE_DEFAULTS, ...spec };
  def.sphereGrowth = Object.freeze({ ...TECHNIQUE_DEFAULTS.sphereGrowth, ...spec.sphereGrowth });
  def.firstHit = createHit(`${spec.id}.firstHit`, spec.firstHit);
  def.tickHit = createHit(`${spec.id}.tickHit`, spec.tickHit);
  def.explosionHit = createHit(`${spec.id}.explosionHit`, spec.explosionHit);
  return Object.freeze(def);
}

// Why `owner` cannot start `def` right now, or null when it can. Checked
// before anything happens: never a blue sphere around the wrong pose, nor
// an invisible sphere, bind or delayed hit.
export function techniqueProblem(owner, def) {
  const clips = [
    def.formAnimation, def.dashAnimation, def.confirmAnimation,
    def.explosionAnimation, def.releaseAnimation, def.whiffReleaseAnimation,
  ];
  for (const key of clips) {
    if (!key || !owner.sprites.has(key)) return `its fighter clip "${key}" has no animation frames`;
  }
  for (const key of [def.sphereBuild, def.sphereImpact, def.sphereExplosion]) {
    if (!owner.sprites.effect(key)?.frames.length) return `its sphere effect "${key}" has no animation frames`;
  }
  if (!(def.dashSpeed > 0)) return 'its dashSpeed is not a positive speed';
  if (!def.firstHit || !def.explosionHit) return 'it needs both a firstHit and an explosionHit';
  if (!(def.explosionDelay >= 0)) return 'its explosionDelay is not a delay';
  if (def.tickHit && !(def.tickInterval > 0)) return 'its tickInterval is not a positive interval';
  const { startScale, endScale } = def.sphereGrowth;
  if (!(startScale > 0 && endScale >= startScale)) return 'its sphereGrowth shrinks or does not start above 0';
  return null;
}

// One pass of a normalized animation, in seconds.
const passOf = (anim) => anim.frames.length / anim.fps;

// Frame `time` seconds into a clip: a looping clip wraps back to its first
// frame, a one-shot clip holds its last.
function frameAt(anim, time) {
  const index = Math.floor(time * anim.fps + TIME_EPSILON);
  return anim.loop ? index % anim.frames.length : Math.min(index, anim.frames.length - 1);
}

export class ChargedTechnique {
  // `owner` is the Fighter performing it. Facing is snapshotted here, once:
  // the technique never turns, and the rush travels this way.
  constructor({ owner, def, action = null }) {
    this.owner = owner;
    this.def = def;
    this.action = action; // the button it was charged from (debug label)
    this.facing = owner.facing;
    this.target = null;
    this.phase = 'form';
    this.time = 0;        // seconds into the current phase (see update)
    this.sinceHit = 0;    // seconds since the contact's step
    this.hitConfirmed = false;
    this.firstHitDone = false;
    this.ticks = 0;     // ticks reached so far while holding the target
    this.ticksDue = 0;  // of those, the ones waiting for the CombatSystem
    this.explosionDue = false; // the explosion hit, waiting for the CombatSystem
    this.explosionDone = false;
    this.whiffReason = null; // why a rush that caught nobody ends ('miss' | 'wall')
    this.endReason = null;
    // Art, resolved once; techniqueProblem() has checked all of it.
    const sprites = owner.sprites;
    this.build = sprites.effect(def.sphereBuild);
    this.impact = sprites.effect(def.sphereImpact);
    this.explosion = sprites.effect(def.sphereExplosion);
    this.formAnim = sprites.animations[def.formAnimation];
    this.dashAnim = sprites.animations[def.dashAnimation];
    this.formDuration = Math.max(passOf(this.formAnim), passOf(this.build));
    this.dashDuration = passOf(this.dashAnim);
    this.confirmDuration = sprites.duration(def.confirmAnimation);
    this.explodeDuration = Math.max(passOf(this.explosion), sprites.duration(def.explosionAnimation));
    this.releaseDuration = sprites.duration(def.releaseAnimation);
    this.whiffDuration = sprites.duration(def.whiffReleaseAnimation);
    // The sphere grows from the hold's start (confirmAnimation over, its last
    // frame held) to the explosion.
    this.growFrom = Math.min(this.confirmDuration, def.explosionDelay);
  }

  // Advances one fixed step of the fighter's update. Returns why the
  // technique ended this step ('miss' | 'wall' | 'done' | 'released'), or
  // null while it goes on. Ground and walls are checked after the fighter
  // moves (see Fighter.update).
  update(dt) {
    // A pass completed on an earlier step ends its phase first...
    if (this.phase === 'form' && this.time >= this.formDuration - TIME_EPSILON) {
      this.phase = 'dash';
      this.time = 0;
    } else if (this.phase === 'dash' && this.time >= this.dashDuration - TIME_EPSILON) {
      this.whiff('miss');
    } else if (this.phase === 'whiffRelease' && this.time >= this.whiffDuration - TIME_EPSILON) {
      return this.whiffReason;
    } else if (this.phase === 'explode' && this.time >= this.explodeDuration - TIME_EPSILON) {
      // The blast is over: the sphere is gone and the fighter recovers.
      this.phase = 'release';
      this.time = 0;
    } else if (this.phase === 'release' && this.time >= this.releaseDuration - TIME_EPSILON) {
      return 'done';
    }
    // ...then this step counts.
    this.time += dt;
    if (!this.hitConfirmed) return null;
    this.sinceHit += dt;
    if (this.phase === 'confirm' || this.phase === 'wait') {
      // The bind holds only while the target does: its bind lost (a reset),
      // there is nothing left to tick or explode.
      if (!this.target.combat.isBoundBy(this)) return 'released';
      if (this.sinceHit >= this.def.explosionDelay - TIME_EPSILON) {
        // Exactly explosionDelay after the hit step: the blast's first frame
        // shows now, and the CombatSystem applies its hit this same step.
        // No tick is due on this step: the explosion is the only hit.
        this.phase = 'explode';
        this.time = 0;
        this.explosionDue = true;
      } else {
        this.queueTicks();
        if (this.phase === 'confirm' && this.sinceHit >= this.confirmDuration - TIME_EPSILON) this.phase = 'wait';
      }
    }
    return null;
  }

  // One tick for every whole tickInterval since the hit not counted yet,
  // for the CombatSystem to deal this step (see takeTick). Counted from the
  // fixed-step clock, never from animation frames.
  queueTicks() {
    if (!this.def.tickHit) return;
    const reached = Math.floor((this.sinceHit + TIME_EPSILON) / this.def.tickInterval);
    if (reached <= this.ticks) return;
    this.ticksDue += reached - this.ticks;
    this.ticks = reached;
  }

  // Takes one tick due this step: the target, for the CombatSystem to hit
  // with tickHit, or null when none is due. Only while the target is still
  // held by this technique: a released or lost target takes none.
  takeTick() {
    if (this.ticksDue <= 0) return null;
    const target = this.target;
    if (!target || !target.combat.isBoundBy(this)) {
      this.ticksDue = 0;
      return null;
    }
    this.ticksDue--;
    return target;
  }

  // The rush is over and caught nobody: its pass ran out ('miss') or a wall
  // stopped it ('wall'). The fighter stops dead and lets the sphere go: no
  // hit, bind, impact or explosion, and no more contact search. It shows
  // the whiff release pose, still locked, for one pass of
  // whiffReleaseAnimation; then the technique ends for `reason`. `time` is
  // how much of it has already passed: 0 from update, which then counts its
  // own step; one step from a wall found after the fighter moved (see
  // Fighter.update).
  whiff(reason, time = 0) {
    this.phase = 'whiffRelease';
    this.time = time;
    this.whiffReason = reason;
    this.owner.body.vx = 0;
  }

  // Fighter clip for the current phase (see Fighter.animationFor). The
  // confirm clip is one-shot, so wait holds its last frame, and so does the
  // explosion clip for as long as the blast lasts.
  get animation() {
    switch (this.phase) {
      case 'form': return this.def.formAnimation;
      case 'dash': return this.def.dashAnimation;
      case 'whiffRelease': return this.def.whiffReleaseAnimation;
      case 'confirm':
      case 'wait': return this.def.confirmAnimation;
      case 'explode': return this.def.explosionAnimation;
      default: return this.def.releaseAnimation;
    }
  }

  // Horizontal velocity the technique holds the fighter at: the fixed rush
  // speed while dashing, otherwise still.
  get velocityX() {
    return this.phase === 'dash' ? this.def.dashSpeed * this.facing : 0;
  }

  // 'fighter' while the sphere is in the hand, 'target' once it has hit,
  // null once it is gone (let go after a whiff, blown up, or over).
  get sphereOwner() {
    if (this.phase === 'done' || this.phase === 'whiffRelease' || this.phase === 'release') return null;
    return this.hitConfirmed ? 'target' : 'fighter';
  }

  // 'build' | 'impact' | 'explosion', or null once it is gone.
  get spherePhase() {
    if (!this.sphereOwner) return null;
    if (this.phase === 'explode') return 'explosion';
    return this.hitConfirmed ? 'impact' : 'build';
  }

  // The sphere clip and frame index on screen, or null once it is gone. It
  // forms once, stays complete through the rush, spins on the target (the
  // impact clip looped, counted from the hit) until it explodes once.
  get sphere() {
    switch (this.spherePhase) {
      case 'build': {
        const b = this.build;
        return { anim: b, index: this.phase === 'form' ? frameAt(b, this.time) : b.frames.length - 1 };
      }
      case 'impact': return { anim: this.impact, index: frameAt(this.impact, this.sinceHit) };
      case 'explosion': return { anim: this.explosion, index: frameAt(this.explosion, this.time) };
      default: return null;
    }
  }

  get sphereFrame() {
    const s = this.sphere;
    return s ? s.anim.frames[s.index] : null;
  }

  // Size of the sphere on screen, as a multiple of its art's own size (see
  // Arena.drawTechnique): 1 in the hand; on the target sphereGrowth's
  // startScale through the contact poses, then growing steadily over the
  // hold, never shrinking, to reach endScale as it explodes; the blast
  // bursts at endScale. A pure function of the fixed-step clocks, and art
  // only: no hitbox, hurtbox or collision ever reads it.
  get sphereScale() {
    const { startScale, endScale } = this.def.sphereGrowth;
    switch (this.spherePhase) {
      case 'impact': {
        const span = this.def.explosionDelay - this.growFrom;
        const p = span > 0 ? Math.min(Math.max((this.sinceHit - this.growFrom) / span, 0), 1) : 1;
        return startScale + (endScale - startScale) * p;
      }
      case 'explosion': return endScale;
      default: return 1;
    }
  }

  // Sphere centre from the fighter's origin while it is in the hand (facing
  // right): the entry for the fighter frame on screen, from handOffsets.
  handOffset() {
    const anim = this.phase === 'form' ? this.formAnim : this.dashAnim;
    const list = this.def.handOffsets[anim.key];
    if (!list?.length) return ORIGIN;
    return list[Math.min(frameAt(anim, this.time), list.length - 1)];
  }

  // Sphere centre in world space: the owner's hand before contact, the
  // target's targetOffset after (x mirrored with the technique's facing),
  // or null once the sphere is gone. `render` uses the interpolated
  // positions the sprites are drawn at.
  sphereCenter(render = false) {
    const onTarget = this.hitConfirmed;
    const f = onTarget ? this.target : this.owner;
    if (!f || !this.sphereOwner) return null;
    const o = onTarget ? this.def.targetOffset : this.handOffset();
    const x = render ? f.renderX : f.body.x;
    const y = render ? f.renderY : f.body.y;
    return [x + o.x * this.facing, y + o.y];
  }

  // World-space box of the rushing sphere while it can connect (dashing, no
  // contact yet), else null. Centred on the sphere, mirrored with facing.
  sphereHitbox(out = {}, render = false) {
    if (this.phase !== 'dash' || this.firstHitDone) return null;
    const [cx, cy] = this.sphereCenter(render);
    const box = this.def.sphereHitbox;
    out.x = this.facing > 0 ? cx + box.x : cx - box.x - box.w;
    out.y = cy + box.y;
    out.w = box.w;
    out.h = box.h;
    return out;
  }

  // The sphere met `target` and firstHit has been applied (see
  // CombatSystem.update). Returns why this contact ends the technique
  // ('blocked'), or null when it confirms: the target is bound and
  // stopped, the sphere moves onto it and the fighter stops its rush. The
  // search is over either way.
  contact(target, blocked) {
    this.firstHitDone = true;
    this.owner.body.vx = 0;
    if (blocked) return 'blocked';
    this.target = target;
    this.hitConfirmed = true;
    this.phase = 'confirm';
    this.time = 0;
    this.sinceHit = 0;
    target.combat.bind(this);
    target.body.vx = 0;
    // Both fighters chose this step's poses before hits resolved, so show
    // the catch now, on the hit step itself: the first confirm frame, the
    // sphere already on the target, and the target already in its hurt pose
    // (`hurt`, or `midairHurt` in the air; see Fighter.animationFor).
    this.owner.updateState(0);
    target.updateState?.(0);
    return null;
  }

  // Takes the explosion due this step: the target is released first (so
  // the blast's knockback is never held back by the bind) and returned for
  // the CombatSystem to hit, or null if it is out already.
  takeExplosion() {
    if (!this.explosionDue) return null;
    this.explosionDue = false;
    this.explosionDone = true;
    const target = this.target;
    this.releaseTarget();
    return target;
  }

  releaseTarget() {
    this.target?.combat.unbind(this);
  }

  // Ends the technique for good: releases the target, removes the sphere and
  // drops every reference (see Fighter.endTechnique).
  end(reason) {
    this.releaseTarget();
    this.phase = 'done';
    this.endReason = reason;
    this.explosionDue = false;
    this.ticksDue = 0;
    this.target = null;
    this.owner = null;
  }
}
