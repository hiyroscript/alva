// Fighter entity: physics body + state machine + combat state + animator.
// Behaviour is driven entirely by the character definition and whatever
// controller (player / AI) feeds it input.

import { SpriteAnimator } from './sprite-animator.js';
import { createBody, stepBody, dropThrough } from './physics.js';
import { CombatState, createAttackDefinition } from './combat.js';
import { approach, clamp, sign } from '../core/utils.js';

export const COMBAT_ACTIONS = ['primary', 'special', 'action1', 'action2'];

// stateTime is a sum of fixed steps, which drifts just below whole-step
// boundaries (12 steps of 1/60 s sum to 0.19999...), so timed clip phases
// compare with a little slack and last exactly their whole number of steps.
const TIME_EPSILON = 1e-6;

const NEUTRAL_INPUT = Object.freeze({
  left: false, right: false, charge: false, jump: false, block: false,
  primary: false, special: false, action1: false, action2: false,
  jumpPressed: false, chargePressed: false, blockPressed: false,
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
    this.attacks = Object.fromEntries(
      Object.entries(def.attacks || {}).map(([id, spec]) => [id, createAttackDefinition({ id, ...spec })]),
    );
    this.opponent = null;
    this.spawn = spawn;
    this.reset(stage);
  }

  reset(stage) {
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
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.lastGroundY = this.body.y;
    this.inputLocked = false;
    this.combat = new CombatState(def.stats);
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

    combat.update(dt);
    if (combat.hitstop > 0) {
      // Impact freeze: nothing moves or advances, but a fresh hit still
      // switches to the hurt pose so the freeze holds the reaction.
      this.updateState(0);
      return;
    }

    // ---- Combat intents --------------------------------------------------
    // Actions mapped to null are wired but reserved (see tryAction).
    for (const action of COMBAT_ACTIONS) {
      if (input[`${action}Pressed`]) this.tryAction(action);
    }
    // After the intents, so an attack started this step also rules out a
    // jump, block, charge or platform drop on the same step.
    const canAct = combat.canAct();
    combat.blocking = canAct && body.grounded && input.block;

    // ---- Charge: grounded, and only while held ---------------------------
    // The held value alone decides it: no toggle, latch or buffer, so the
    // step that sees Charge released ends it. Block wins if both are held.
    this.charging = canAct && body.grounded && !!input.charge && !combat.blocking;

    // ---- Platform drop (training CPU only) -------------------------------
    // No player key, button or touch control produces `dropPressed`; the
    // training CPU uses it to follow the player down through one-way platforms.
    if (input.dropPressed && canAct && body.grounded && !combat.blocking) {
      dropThrough(body, mv.dropThroughTime);
    }

    // ---- Horizontal movement ---------------------------------------------
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const locked =
      combat.blocking || this.charging || combat.stun > 0 ||
      (combat.attack && combat.attack.def.lockMovement);
    if (locked) dir = 0;
    this.moveDir = dir;

    const accel = body.grounded ? mv.acceleration : mv.airAcceleration;
    const decel = body.grounded ? mv.deceleration : mv.airDeceleration;
    if (combat.stun > 0) {
      body.vx = approach(body.vx, 0, decel * 0.5 * dt);
    } else if (dir !== 0) {
      const turning = body.vx !== 0 && sign(body.vx) !== dir;
      body.vx = approach(body.vx, dir * mv.maxSpeed, accel * (turning ? mv.turnBoost : 1) * dt);
    } else {
      body.vx = approach(body.vx, 0, decel * dt);
    }

    // ---- Jump (buffered + coyote time) -----------------------------------
    if (input.jumpPressed) this.jumpBuffer = mv.jumpBuffer;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (body.grounded) this.coyote = mv.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && this.coyote > 0 && canAct) {
      body.vy = -mv.jumpVelocity;
      body.grounded = false;
      body.ground = null;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.charging = false;
      combat.blocking = false;
    }

    // ---- Integrate -------------------------------------------------------
    stepBody(body, dt, ctx.stage, ctx.gravity);
    if (body.grounded) this.lastGroundY = body.y;

    this.updateFacing(dir);
    this.updateState(dt);
  }

  tryAction(action) {
    const combat = this.combat;
    combat.lastIntent = action;
    const attackId = this.attackFor(action);
    if (!attackId) return false; // reserved: wired, but no attack mapped
    const atk = this.attacks[attackId];
    if (!atk || !combat.canAct() || combat.cooldowns.has(attackId)) return false;
    if (atk.groundOnly && !this.body.grounded) return false;
    // Never fake an attack pose: require real frames for the attack.
    if (!atk.animation || !this.sprites.has(atk.animation)) {
      console.warn(`[Alva] Attack "${attackId}" has no animation frames; ignoring.`);
      return false;
    }
    combat.attack = { def: atk, time: 0, hasHit: false };
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
    const { body } = this;
    if (this.combat.attack || this.combat.stun > 0) return;
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
    else if (combat.attack) next = 'attack';
    else if (!body.grounded) next = body.vy < 0 ? 'jump' : 'fall';
    else if (this.isLanding(dt)) next = 'land';
    else if (combat.blocking) next = 'block';
    else if (this.charging) next = 'charge';
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
      const anim = this.animator.anim;
      const ratio = Math.abs(body.vx) / this.def.movement.maxSpeed;
      this.animator.setSpeed(clamp(ratio, anim?.minSpeedScale ?? 1, 1));
    } else {
      this.animator.setSpeed(1);
    }
    this.animator.update(dt);
  }

  // Animation key for a visual state. An attack plays its own clip for its
  // whole length, even if the fighter lands or leaves the ground meanwhile.
  // Hitstun shows `hurt` on the ground and `midairHurt` in the air.
  // Charge plays `chargeStart` once, then `chargeLoop` for the rest of the
  // hold; a new Charge resets stateTime, so it starts from the first frame.
  animationFor(state) {
    if (state === 'attack') return this.combat.attack.def.animation;
    if (state === 'hitstun') return this.body.grounded ? 'hurt' : 'midairHurt';
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

  // Interpolated position for rendering between fixed steps.
  interpolate(alpha) {
    const b = this.body;
    this.renderX = b.prevX + (b.x - b.prevX) * alpha;
    this.renderY = b.prevY + (b.y - b.prevY) * alpha;
  }
}
