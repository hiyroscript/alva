// Fighter entity: physics body + state machine + combat state + animator.
// Behaviour is driven entirely by the character definition and whatever
// controller (player / AI) feeds it input.

import { SpriteAnimator } from './sprite-animator.js';
import { createBody, stepBody, dropThrough } from './physics.js';
import { CombatState, createAttackDefinition, createDefenseDefinition } from './combat.js';
import { createProjectileDefinition } from './projectile.js';
import { createSummonDefinition, summonProblem } from './clone.js';
import { ChargedTechnique, createTechniqueDefinition, techniqueProblem } from './charged-technique.js';
import { getJumpVelocity, getMaxSpeed } from '../data/powers.js';
import { approach, clamp, sign } from '../core/utils.js';

export const COMBAT_ACTIONS = ['primary', 'special', 'action1', 'action2'];

// stateTime is a sum of fixed steps, which drifts just below whole-step
// boundaries (12 steps of 1/60 s sum to 0.19999...), so timed clip phases
// compare with a little slack and last exactly their whole number of steps.
const TIME_EPSILON = 1e-6;

const NEUTRAL_INPUT = Object.freeze({
  left: false, right: false, charge: false, jump: false, defense: false,
  primary: false, special: false, action1: false, action2: false,
  jumpPressed: false, chargePressed: false, defensePressed: false,
  primaryPressed: false, specialPressed: false, action1Pressed: false, action2Pressed: false,
  dropPressed: false,
});

export class Fighter {
  constructor({ def, sprites, spawn, stage, slot, controller, label }) {
    this.def = def;
    this.sprites = sprites;
    this.slot = slot;
    this.label = label;
    this.controller = controller;
    this.animator = new SpriteAnimator(sprites);
    // One pass of the touchdown clip; 0 skips the land state entirely.
    this.landDuration = sprites.duration('land');
    // One pass of the Charge startup clip; the loop clip follows it.
    this.chargeStartDuration = sprites.duration('chargeStart');
    // One Charge frame-time of the release pose; 0 skips it entirely.
    this.chargeReleaseDuration = sprites.duration('chargeRelease');
    this.attacks = Object.fromEntries(
      Object.entries(def.attacks || {}).map(([id, spec]) => [id, createAttackDefinition({ id, ...spec })]),
    );
    this.projectileDefs = Object.fromEntries(
      Object.entries(def.projectiles || {}).map(([id, spec]) => [id, createProjectileDefinition({ id, ...spec })]),
    );
    this.summonDefs = Object.fromEntries(
      Object.entries(def.summons || {}).map(([id, spec]) => [id, createSummonDefinition({ id, ...spec })]),
    );
    this.techniqueDefs = Object.fromEntries(
      Object.entries(def.chargedTechniques || {}).map(([id, spec]) => [id, createTechniqueDefinition({ id, ...spec })]),
    );
    // What the shared Defense input does for this character (null: nothing).
    this.defense = createDefenseDefinition(def.defense);
    // The character's fighter Powers (js/data/powers.js), resolved once.
    // Upward speed of the normal jump, from its Jump Power tier. Nothing else
    // (knockback, Dodges, techniques) uses it.
    this.jumpVelocity = getJumpVelocity(def);
    // Top speed of normal left / right movement, on the ground and in the
    // air, from its Speed Power tier. Nothing else (acceleration, knockback,
    // projectiles, Dodges, techniques) uses it.
    this.maxSpeed = getMaxSpeed(def);
    this.opponent = null;
    this.spawn = spawn;
    this.reset(stage);
  }

  reset(stage) {
    // A charged technique in progress ends first, releasing any opponent it
    // holds: nothing of it survives a rematch.
    if (this.technique) this.endTechnique('reset');
    const { def, spawn } = this;
    const half = def.collider.width / 2;
    const ground = stage.surfaceBelow(spawn.x - half, spawn.x + half, spawn.y ?? stage.groundY);
    this.body = createBody({
      x: spawn.x,
      y: ground.y,
      width: def.collider.width,
      height: def.collider.height,
      gravityScale: def.movement.gravityScale,
      maxFall: def.movement.maxFallSpeed,
    });
    this.body.ground = ground.ref;
    this.facing = spawn.facing || 1;
    this.state = 'idle';
    this.stateTime = 0;
    this.moveDir = 0;
    this.charging = false;
    this.chargeReleased = false;
    // Whether Charge was held on the latest step, and whether it was held as
    // a charged technique ended: such a Charge does not charge again until
    // it is let go (see update).
    this.chargeHeld = false;
    this.chargeHeldOver = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.lastGroundY = this.body.y;
    this.inputLocked = false;
    this.combat = new CombatState(def.stats);
    // Projectiles released this step, waiting for the battle to spawn them
    // (see spawnProjectiles in js/game/projectile.js).
    this.releases = [];
    // Summons paid for this step, waiting for the battle to spawn them (see
    // spawnClones in js/game/clone.js): { id, target }.
    this.summons = [];
    // The charged technique this fighter is performing (see
    // js/game/charged-technique.js), or null.
    this.technique = null;
    this.renderX = this.body.x;
    this.renderY = this.body.y;
    this.animator.play('idle', { restart: true });
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get grounded() { return this.body.grounded; }

  update(dt, ctx) {
    const { body, combat } = this;
    const mv = this.def.movement;

    const raw = this.controller ? this.controller.getInput(this, dt, ctx) : NEUTRAL_INPUT;
    const input = this.inputLocked ? NEUTRAL_INPUT : raw;
    const wasCharging = this.charging;
    this.chargeReleased = false;
    this.chargeHeld = !!input.charge;
    if (!this.chargeHeld) this.chargeHeldOver = false;

    combat.update(dt);
    // Hitstun always wins over a charged technique (CombatSystem.applyHit
    // normally ends it on the hit itself).
    if (this.technique && combat.stun > 0) this.endTechnique('hit');
    // ---- Projectile release ----------------------------------------------
    // The attack crossed its release point this step: queue one projectile,
    // aimed where the fighter faces now. Its direction never changes after.
    if (combat.release) {
      this.releases.push({ id: combat.release.id, offset: combat.release.offset, direction: this.facing });
      combat.release = null;
    }
    if (combat.hitstop > 0) {
      // Impact freeze: nothing moves or advances, but a fresh hit still
      // switches to the hurt pose so the freeze holds the reaction.
      this.updateState(0);
      return;
    }

    // ---- Combat intents --------------------------------------------------
    // Actions mapped to null are wired but reserved (see tryAction). A press
    // while already Charging (since an earlier step) with Charge still held
    // is a charged action first (see tryChargedAction): one that starts
    // consumes the press, otherwise the normal attack gets it. Letting go of
    // Charge on the press step, or pressing it with a fresh Charge, is a
    // normal attack.
    const charged = wasCharging && !!input.charge;
    for (const action of COMBAT_ACTIONS) {
      if (!input[`${action}Pressed`]) continue;
      if (charged && this.tryChargedAction(action)) continue;
      this.tryAction(action);
    }
    // ---- Defense ---------------------------------------------------------
    // A Dodge starts only on a new press, after the attacks so an attack
    // started this step keeps it (and a Dodge keeps a jump) from starting too.
    if (input.defensePressed) this.tryDefense();

    // ---- Charged technique -------------------------------------------------
    // While one runs it owns the fighter: its phases advance on their own
    // clock (a clean miss or a finished explosion ends it here), whether or
    // not Charge is still held.
    if (this.technique) {
      const ended = this.technique.update(dt);
      if (ended) this.endTechnique(ended);
    }

    // After the intents, so an attack, Dodge or charged technique started
    // this step also rules out a jump, Block guard, charge or platform drop
    // on the same step.
    const canAct = this.canAct();
    // Block-type Defense is a held guard; a Dodge fighter never blocks.
    combat.blocking = this.defense?.type === 'block' && canAct && body.grounded && !!input.defense;

    // ---- Charge: grounded, and only while held ---------------------------
    // The held value alone decides it: no toggle or buffer, so the step that
    // sees Charge released ends it. Defense interrupts it: a Dodge through
    // canAct, a held Block guard here. After a charged technique, a Charge
    // held since before it must be let go and held again.
    this.charging = canAct && body.grounded && !!input.charge && !combat.blocking && !this.chargeHeldOver;

    // ---- Platform drop (training CPU only) -------------------------------
    // No player key, button or touch control produces `dropPressed`; the
    // training CPU uses it to follow the player down through one-way platforms.
    if (input.dropPressed && canAct && body.grounded && !combat.blocking) {
      dropThrough(body, mv.dropThroughTime);
    }

    // ---- Horizontal movement ---------------------------------------------
    // A Dodge locks it too: no new acceleration, and the current velocity
    // slows under the normal deceleration (in the air, the gentle air drag),
    // so the art never moves the body (no dash, lift or teleport). A charged
    // technique sets the speed itself (still, or its fixed rush), and a bound
    // fighter is held in place; gravity still applies to both.
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const locked =
      combat.blocking || this.charging || combat.stun > 0 || combat.defenseAction ||
      (combat.attack && combat.attack.def.lockMovement) || combat.immobilized || !!this.technique;
    if (locked) dir = 0;
    this.moveDir = dir;

    const accel = body.grounded ? mv.acceleration : mv.airAcceleration;
    const decel = body.grounded ? mv.deceleration : mv.airDeceleration;
    if (this.technique) {
      body.vx = this.technique.velocityX;
    } else if (combat.immobilized) {
      body.vx = 0;
    } else if (combat.stun > 0) {
      body.vx = approach(body.vx, 0, decel * 0.5 * dt);
    } else if (dir !== 0) {
      const turning = body.vx !== 0 && sign(body.vx) !== dir;
      body.vx = approach(body.vx, dir * this.maxSpeed, accel * (turning ? mv.turnBoost : 1) * dt);
    } else {
      body.vx = approach(body.vx, 0, decel * dt);
    }

    // ---- Jump (buffered + coyote time) -----------------------------------
    if (input.jumpPressed) this.jumpBuffer = mv.jumpBuffer;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (body.grounded) this.coyote = mv.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && this.coyote > 0 && canAct) {
      body.vy = -this.jumpVelocity;
      body.grounded = false;
      body.ground = null;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.charging = false;
      combat.blocking = false;
    }

    // ---- Voluntary Charge release ----------------------------------------
    // Charging last step, Charge let go this step, and nothing else took over
    // (a hit, attack, Dodge, guard or jump all rule it out through canAct,
    // blocking or grounded). Only then does the brief release pose play.
    this.chargeReleased =
      wasCharging && !input.charge && canAct && body.grounded && !combat.blocking;

    // ---- Integrate -------------------------------------------------------
    stepBody(body, dt, ctx.stage, ctx.gravity);
    if (body.grounded) this.lastGroundY = body.y;

    // ---- Charged technique: ground and walls ------------------------------
    // It needs real ground under the fighter from its first frame to its
    // last: ground lost (a ledge, a vanished platform) ends it at once and
    // the fighter falls from where it is. A wall ends the rush as a miss.
    const technique = this.technique;
    if (technique) {
      if (!body.grounded) this.endTechnique('ground');
      else if (technique.phase === 'dash' && body.wall === technique.facing) this.endTechnique('wall');
    }

    this.updateFacing(dir);
    this.updateState(dt);
  }

  // Free to start something new: the combat state allows it (no attack,
  // Dodge, stun, bind or knockout) and no charged technique owns the fighter.
  canAct() {
    return this.combat.canAct() && !this.technique;
  }

  // Starts one Dodge, if this fighter's Defense is a Dodge and it is free to
  // act. Ground or air is chosen here, once, and kept for the whole clip.
  tryDefense() {
    const spec = this.defense;
    if (spec?.type !== 'dodge' || !this.canAct()) return false;
    const move = this.body.grounded ? spec.ground : spec.air;
    if (!move) return false;
    // Never grant invisible invulnerability: require real Dodge frames.
    if (!move.animation || !this.sprites.has(move.animation)) {
      console.warn(`[Alva] Dodge "${move.animation}" has no animation frames; ignoring.`);
      return false;
    }
    this.combat.defenseAction = { type: 'dodge', def: move, time: 0 };
    return true;
  }

  // The charged action for `action`, dispatched on its type: a `summon`
  // (#0001's Charged BA1 Clone Attack, see trySummon) or a `technique`
  // (#0001's Charged BA2 Sphere Rush, see tryTechnique). True when it
  // happened and consumed the press; false leaves the press to the normal
  // attack.
  tryChargedAction(action) {
    const charged = this.def.chargedActions?.[action];
    if (!charged) return false;
    if (charged.type === 'summon') return this.trySummon(action, charged.id);
    if (charged.type === 'technique') return this.tryTechnique(action, charged.id);
    console.warn(`[Alva] Charged ${action} has an unknown type "${charged.type}"; ignoring.`);
    return false;
  }

  // Summon `id` from `action`: pays its Energy, once, and queues one summon
  // at the opponent for the battle to spawn. The fighter itself performs
  // nothing and keeps charging. False, with nothing spent, if there is no
  // such summon, the fighter cannot act, there is no opponent, the art is
  // missing (logged) or there is too little Energy.
  trySummon(action, id) {
    const summon = this.summonDefs[id];
    if (!summon || !this.opponent || !this.canAct()) return false;
    const problem = summonProblem(this, summon);
    if (problem) {
      console.warn(`[Alva] Summon "${id}" is unavailable: ${problem}; ignoring.`);
      return false;
    }
    if (!this.combat.spendEnergy(summon.energyCost)) return false;
    this.combat.lastIntent = action;
    this.summons.push({ id, target: this.opponent });
    return true;
  }

  // Start technique `id` from `action`: the fighter leaves Charge (no
  // release pose) and the technique owns it from this step (see
  // js/game/charged-technique.js). Grounded only. False, with nothing spent,
  // if there is no such technique, the fighter cannot act or is airborne,
  // its art or data is missing (logged) or there is too little Energy.
  tryTechnique(action, id) {
    const def = this.techniqueDefs[id];
    if (!def || !this.canAct() || !this.body.grounded) return false;
    const problem = techniqueProblem(this, def);
    if (problem) {
      console.warn(`[Alva] Charged technique "${id}" is unavailable: ${problem}; ignoring.`);
      return false;
    }
    if (!this.combat.spendEnergy(def.energyCost)) return false;
    this.combat.lastIntent = action;
    this.charging = false;
    this.body.vx = 0;
    this.technique = new ChargedTechnique({ owner: this, def, action });
    return true;
  }

  // Ends the charged technique in progress, if any, for `reason`: 'miss',
  // 'wall', 'blocked', 'ko', 'done', 'ground', 'hit', 'released', 'reset'
  // or 'destroy'. The sphere is removed and any opponent it holds released;
  // damage already dealt stays. The rush never carries on as a slide, and a
  // Charge still held from before it does not resume by itself.
  endTechnique(reason) {
    const t = this.technique;
    if (!t) return;
    t.end(reason);
    this.technique = null;
    this.chargeHeldOver = this.chargeHeld;
    this.body.vx = 0;
    this.updateState(0);
  }

  tryAction(action) {
    const combat = this.combat;
    combat.lastIntent = action;
    const attackId = this.attackFor(action);
    if (!attackId) return false; // reserved: wired, but no attack mapped
    const atk = this.attacks[attackId];
    if (!atk || !this.canAct() || combat.cooldowns.has(attackId)) return false;
    if (atk.groundOnly && !this.body.grounded) return false;
    // Never fake an attack pose: require real frames for the attack.
    if (!atk.animation || !this.sprites.has(atk.animation)) {
      console.warn(`[Alva] Attack "${attackId}" has no animation frames; ignoring.`);
      return false;
    }
    // Nor an invisible projectile: a throw needs its projectile's art too.
    if (atk.projectile) {
      const proj = this.projectileDefs[atk.projectile.id];
      if (!proj?.animation || !this.sprites.projectile(proj.animation)) {
        console.warn(`[Alva] Attack "${attackId}" throws "${atk.projectile.id}", which has no animation frames; ignoring.`);
        return false;
      }
    }
    combat.attack = { def: atk, time: 0, hasHit: false, projectileSpawned: false };
    return true;
  }

  // Attack id for a controller action. The character's `actions` entry is a
  // string (one attack), { ground, air } (chosen by whether the fighter is
  // grounded as the button is pressed) or null (reserved).
  attackFor(action) {
    const mapping = this.def.actions?.[action];
    if (!mapping || typeof mapping === 'string') return mapping || null;
    return (this.body.grounded ? mapping.ground : mapping.air) || null;
  }

  updateFacing(dir) {
    const { body, combat } = this;
    if (combat.attack || combat.defenseAction || combat.stun > 0 || combat.immobilized || this.technique) return;
    if (dir !== 0 && (Math.abs(body.vx) > 20 || !body.grounded)) {
      this.facing = dir;
      return;
    }
    if (body.grounded && this.opponent && dir === 0) {
      const dx = this.opponent.body.x - body.x;
      if (Math.abs(dx) > 14) this.facing = sign(dx);
    }
  }

  // Visual state only: nothing here feeds back into movement or collision.
  updateState(dt) {
    const { body, combat } = this;
    let next;
    if (combat.stun > 0) next = 'hitstun';
    else if (this.technique) next = 'technique';
    else if (combat.immobilized) next = 'bound';
    else if (combat.attack) next = 'attack';
    else if (combat.defenseAction) next = 'defense';
    else if (!body.grounded) next = body.vy < 0 ? 'jump' : 'fall';
    else if (this.isLanding(dt)) next = 'land';
    else if (combat.blocking) next = 'block';
    else if (this.charging) next = 'charge';
    else if (this.isReleasingCharge(dt)) next = 'chargeRelease';
    else if ((this.moveDir !== 0 && Math.abs(body.vx) > 20) || Math.abs(body.vx) > 140) next = 'run';
    else next = 'idle';

    if (next !== this.state) {
      this.state = next;
      this.stateTime = 0;
    } else {
      this.stateTime += dt;
    }

    this.animator.play(this.animationFor(next));
    if (next === 'run') {
      // The clip's own rate at the fighter's own top speed, whatever its tier.
      const anim = this.animator.anim;
      const ratio = Math.abs(body.vx) / this.maxSpeed;
      this.animator.setSpeed(clamp(ratio, anim?.minSpeedScale ?? 1, 1));
    } else {
      this.animator.setSpeed(1);
    }
    this.animator.update(dt);
  }

  // Animation key for a visual state. An attack or Dodge plays its own clip
  // for its whole length, even if the fighter lands or leaves the ground
  // meanwhile. Hitstun, and being bound by a charged technique, show `hurt`
  // on the ground and `midairHurt` in the air. A charged technique plays the
  // clip of its current phase. Charge plays `chargeStart` once, then
  // `chargeLoop` for the rest of the hold; a new Charge resets stateTime, so
  // it starts from the first frame.
  animationFor(state) {
    if (state === 'attack') return this.combat.attack.def.animation;
    if (state === 'defense') return this.combat.defenseAction.def.animation;
    if (state === 'technique') return this.technique.animation;
    if (state === 'hitstun' || state === 'bound') return this.body.grounded ? 'hurt' : 'midairHurt';
    if (state === 'charge') {
      return this.stateTime < this.chargeStartDuration - TIME_EPSILON ? 'chargeStart' : 'chargeLoop';
    }
    return state;
  }

  // Touchdown starts the land state; it then lasts one pass of the land clip
  // while grounded. Anything with higher priority (a new jump included) ends it.
  isLanding(dt) {
    if (!this.landDuration) return false;
    if (this.body.landed) return true;
    return this.state === 'land' && this.stateTime + dt < this.landDuration;
  }

  // A voluntary Charge release starts the chargeRelease state; it then lasts
  // one Charge frame-time while nothing of higher priority takes over. A new
  // Charge outranks it and starts again from charge1.
  isReleasingCharge(dt) {
    if (!this.chargeReleaseDuration) return false;
    if (this.chargeReleased) return true;
    return this.state === 'chargeRelease' && this.stateTime + dt < this.chargeReleaseDuration - TIME_EPSILON;
  }

  // Whether the current frame is drawn mirrored. Each clip knows which way its
  // own artwork faces (`sourceFacing`, per animation, else the character's),
  // so art drawn facing left (e.g. #0001's mid-air Dodge) is mirrored when the
  // fighter faces right. Rendering only: `facing`, movement and every
  // hurtbox / hitbox are unaffected.
  get spriteFlip() {
    const sourceFacing = this.animator.anim?.sourceFacing ?? this.def.sourceFacing ?? 1;
    return this.facing !== sourceFacing;
  }

  // Interpolated position for rendering between fixed steps.
  interpolate(alpha) {
    const b = this.body;
    this.renderX = b.prevX + (b.x - b.prevX) * alpha;
    this.renderY = b.prevY + (b.y - b.prevY) * alpha;
  }
}
