// Fighter entity: physics body + state machine + combat state + animator.
// Behaviour is driven entirely by the character definition and whatever
// controller (player / AI) feeds it input.

import { SpriteAnimator } from './sprite-animator.js';
import { createBody, stepBody, dropThrough } from './physics.js';
import { CombatState, createAttackDefinition, createDefenseDefinition, resolveEnergy } from './combat.js';
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
  leftPressed: false, rightPressed: false, jumpPressed: false, chargePressed: false, defensePressed: false,
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
    // One pass of the dash clip: how long a Dash lasts (0 without its art,
    // and then no Dash starts; see tryDash).
    this.dashDuration = sprites.duration('dash');
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
    // One pass of the grounded Shield's raise and lower poses; 0 skips them.
    this.shieldStartDuration = sprites.duration(this.defense?.groundStartAnimation);
    this.shieldReleaseDuration = sprites.duration(this.defense?.groundReleaseAnimation);
    // Shield clips already reported missing, so a held Defense warns once.
    this.missingShieldArt = new Set();
    // The character's Powers (js/data/powers.js), resolved once.
    // Upward speed of the normal jump, from its Jump Power tier. Nothing else
    // (launches, techniques) uses it.
    this.jumpVelocity = getJumpVelocity(def);
    // Top speed of normal left / right movement, on the ground and in the
    // air, from its Speed Power tier. Nothing else (acceleration, launches,
    // projectiles, techniques) uses it.
    this.maxSpeed = getMaxSpeed(def);
    // Seconds of charged-action cooldown recovered per second while in
    // Charge (see recoverChargedCooldowns); 1 per second otherwise.
    this.chargedCooldownRate = def.stats?.chargedCooldownRate ?? 1;
    // Energy settings (js/game/combat.js resolveEnergy): the maximum, both
    // refill rates, what a Dash costs and what each blocked hit costs.
    this.energyDef = resolveEnergy(def.energy);
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
    const from = spawn.y ?? stage.groundY;
    // On the surface under the spawn; with nothing under it (open air past
    // the main floor's edges), in the air where it is, and falling.
    const ground = stage.surfaceBelow(spawn.x - half, spawn.x + half, from);
    this.body = createBody({
      x: spawn.x,
      y: ground.ref ? ground.y : from,
      width: def.collider.width,
      height: def.collider.height,
      gravityScale: def.movement.gravityScale,
      maxFall: def.movement.maxFallSpeed,
    });
    this.body.grounded = !!ground.ref;
    this.body.ground = ground.ref;
    // Lost to the Void (see Arena.checkVoid): out of play (not updated,
    // drawn, hit, framed or pushed) until the mode respawns it, which resets
    // it. `respawnTimer` counts down the wait (see Arena.updateRespawns);
    // null while there is none (in play, or Quick Battle's final loser).
    this.lostToVoid = false;
    this.respawnTimer = null;
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
    // Steps this fighter has lived (frozen ones included), to keep buffered
    // presses in the order they were made: the jump's press step, and each
    // buffered attack's.
    this.steps = 0;
    this.jumpPressedAt = -1;
    // The latest Throw / BA1 / BA2 press the fighter could not act on yet
    // ({ action, age, at }), tried again every step for
    // movement.attackBuffer seconds (see bufferAttack), or null.
    this.bufferedAttack = null;
    // Down (the Charge input) is held in the air: the fast fall's (see
    // update). Such a hold does not become a Charge on landing; it must be
    // let go and held again.
    this.chargeFromAir = false;
    // Fast-falling this step: Down held in the air while descending.
    this.fastFalling = false;
    this.lastGroundY = this.body.y;
    this.inputLocked = false;
    // The Dash in progress ({ direction, time, duration }), or null; and the
    // last horizontal press still waiting for its double tap (see
    // trackDashTaps): { direction, age }, or null.
    this.dash = null;
    this.dashTap = null;
    // Whether the Shield on screen went up on the ground (so it opens with
    // its raise pose) rather than in the air (see updateState).
    this.shieldRaisedOnGround = false;
    // A fresh combat state: 0 Launch Point, full Energy, Shield down and
    // every cooldown ready.
    this.combat = new CombatState(this.energyDef);
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

  // Back at its own spawn after the Void's wait (see Arena.updateRespawns):
  // a clean, neutral state, exactly a reset. Launch Point is back to 0,
  // Energy full and not exhausted, and every cooldown (charged ones
  // included) ready; everything transient goes with the old body: velocity,
  // attack, Shield, Dash, stun, freeze, binds, its charged technique and any
  // queued projectile or summon. It is in play again at once.
  respawn(stage) {
    this.reset(stage);
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
    this.steps++;
    this.chargeReleased = false;
    this.chargeHeld = !!input.charge;
    if (!this.chargeHeld) this.chargeHeldOver = false;
    // Down held in the air is the fast fall's, never a Charge waiting for
    // the ground: it has to be let go and held again there.
    if (!this.chargeHeld) this.chargeFromAir = false;
    else if (!body.grounded) this.chargeFromAir = true;
    this.fastFalling = false;

    combat.update(dt);
    // Charged cooldowns recover by this step first, so one started below
    // ends the step at its full length. Faster only while a Charge held
    // since an earlier step is still held and nothing has interrupted it.
    this.recoverChargedCooldowns(
      dt, wasCharging && !!input.charge && combat.stun <= 0 && combat.hitstop <= 0 && !combat.immobilized,
    );
    // Hitstun always wins over a charged technique (CombatSystem.applyHit
    // normally ends it on the hit itself), and over a Dash, as does a bind.
    if (this.technique && combat.stun > 0) this.endTechnique('hit');
    if (this.dash && (combat.stun > 0 || combat.immobilized)) this.endDash();
    // A hit (or a bind) takes the fighter out of its own attack: nothing of
    // it is left to strike, release a projectile or recover from. Checked
    // here, on the fighter's next step, so two attacks that connect on the
    // same step still trade.
    if (combat.attack && (combat.stun > 0 || combat.immobilized)) combat.interruptAttack();
    // ---- Projectile release ----------------------------------------------
    // The attack crossed its release point this step: queue one projectile,
    // aimed where the fighter faces now. Its direction never changes after.
    if (combat.release) {
      this.releases.push({ id: combat.release.id, offset: combat.release.offset, direction: this.facing });
      combat.release = null;
    }
    // Jump presses count from the step they are made, the freeze included.
    if (input.jumpPressed) {
      this.jumpBuffer = mv.jumpBuffer;
      this.jumpPressedAt = this.steps;
    }
    if (combat.hitstop > 0) {
      // Impact freeze: nothing moves or advances, but a fresh hit still
      // switches to the hurt pose so the freeze holds the reaction (and a
      // blocked one keeps the Shield up). Energy keeps refilling, at the
      // normal rate (a frozen fighter is not in its Charge stance). Presses
      // made during it are kept, not lost, and do not age: the attack
      // pressed through the impact comes out as soon as it can.
      for (const action of COMBAT_ACTIONS) if (input[`${action}Pressed`]) this.bufferAttack(action);
      combat.updateEnergy(dt, false);
      this.updateState(0);
      return;
    }

    // ---- Dash ------------------------------------------------------------
    // A Dash ends by itself after one pass of its clip: the fighter is free
    // again from the step it ends.
    if (this.dash) {
      this.dash.time += dt;
      if (this.dash.time >= this.dash.duration - TIME_EPSILON) this.endDash();
    }

    // ---- Shield: held Defense --------------------------------------------
    // Decided first: Defense held with a Shield the fighter may raise (its
    // Defense is a Shield, it is not exhausted, the art for where it is)
    // takes the step, so no attack, Throw, charged action or Dash starts
    // while it is held. Let go of Defense to do any of them.
    const shieldHeld = !!input.defense && this.shieldAllowed();

    // The held direction: what steering, a turning attack and a cut-short
    // attack all read.
    const held = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    // ---- Combat intents --------------------------------------------------
    // Actions mapped to null are wired but reserved (see tryAction). A press
    // while already Charging (since an earlier step) with Charge still held
    // is a charged action first (see tryChargedAction): one that starts, or
    // one still cooling down, consumes the press; otherwise the normal
    // attack gets it. Letting go of Charge on the press step, or pressing it
    // with a fresh Charge, is a normal attack.
    //
    // A press the fighter cannot act on yet (an attack or its recovery, a
    // stun, a Dash, a cooldown, Defense held for its Shield) is buffered
    // (see bufferAttack) and tried again every later step until it starts
    // or expires, so an attack pressed slightly early comes out on the
    // first step it can. A newer press replaces it. Only ever an ordinary
    // attack: a charged action needs its own press, while Charging.
    //
    // Buffered presses keep their order: a jump pressed before the attack
    // (both waiting on the same recovery) goes first, and the attack comes
    // out on a later step, in the air. Pressed on the same step, the attack
    // goes first, on the ground.
    const charged = wasCharging && !!input.charge;
    const jumpFirst = (at) =>
      this.jumpBuffer > 0 && this.coyote > 0 && this.jumpPressedAt < at && this.canFollowUp() && !shieldHeld;
    let started = false;
    for (const action of COMBAT_ACTIONS) {
      if (!input[`${action}Pressed`]) continue;
      if (shieldHeld || jumpFirst(this.steps)) {
        this.bufferAttack(action);
        continue;
      }
      if (charged && this.tryChargedAction(action)) {
        this.bufferedAttack = null;
        started = true;
        continue;
      }
      if (this.tryAction(action, held)) {
        this.bufferedAttack = null;
        started = true;
      } else if (!started) {
        // Not a press that lost to another made on this same step.
        this.bufferAttack(action);
      }
    }
    const waiting = this.bufferedAttack;
    if (!started && waiting && waiting.at < this.steps && !shieldHeld && !jumpFirst(waiting.at)) {
      const { action } = waiting;
      if (this.tryAction(action, held)) this.bufferedAttack = null;
      else if (!this.attackMayStart(action)) this.bufferedAttack = null;
    }

    // ---- Dash: a double tap of left or right -----------------------------
    // After the attacks, so one started this step wins over a Dash on the
    // same step (canAct). A double tap that cannot Dash right now is used
    // up all the same: nothing is queued for later. Energy spent this step
    // means no refill this step (see the end of update).
    let spent = false;
    const tapped = this.trackDashTaps(input, dt);
    if (tapped && this.tryDash(tapped, input)) spent = true;

    // ---- Charged technique -------------------------------------------------
    // While one runs it owns the fighter: its phases advance on their own
    // clock (the release after a whiff or a finished explosion ends it here),
    // whether or not Charge is still held.
    if (this.technique) {
      const ended = this.technique.update(dt);
      if (ended) this.endTechnique(ended);
    }

    // After the intents, so an attack or charged technique started this step
    // also rules out a Shield, jump, charge or platform drop on the same
    // step.
    const canAct = this.canAct();
    // The Shield is up while Defense is held and the fighter is free to act
    // (it never cuts an attack, Dash, charged technique, stun or bind short).
    // A blocked hit's blockstun holds it up until the stun is over, held or
    // not. Either way only while shieldAllowed: the block that empties the
    // bar (or having no art for where the fighter is) drops it.
    // Holding it costs nothing: only the hits it blocks cost Energy (see
    // CombatSystem.applyHit).
    combat.shielding =
      (shieldHeld && canAct) || (combat.shielding && combat.shieldStun > 0 && this.shieldAllowed());
    if (!combat.shielding) combat.shieldStun = 0;

    // ---- Charge: grounded, and only while held ---------------------------
    // The held value alone decides it: no toggle or buffer, so the step that
    // sees Charge released ends it. A held Shield outranks it. After a
    // charged technique, a Charge held since before it must be let go and
    // held again, and so must one held down from the air (the fast fall).
    this.charging =
      canAct && body.grounded && !!input.charge && !combat.shielding && !this.chargeHeldOver && !this.chargeFromAir;

    // ---- Platform drop (training CPU only) -------------------------------
    // No player key, button or touch control produces `dropPressed`; the
    // training CPU uses it to follow the player down through one-way platforms.
    if (input.dropPressed && canAct && body.grounded && !combat.shielding) {
      dropThrough(body, mv.dropThroughTime);
    }

    // ---- Horizontal movement ---------------------------------------------
    // See moveHorizontal, and moveAttack while an attack plays.
    const atk = combat.attack;
    let dir = held;
    if (combat.shielding || this.charging || combat.stun > 0 || combat.immobilized || this.technique || this.dash) dir = 0;
    // Normal locomotion only: an attack steers with its own share of it.
    this.moveDir = atk?.def.lockMovement ? 0 : dir;

    if (this.technique) {
      body.vx = this.technique.velocityX;
    } else if (combat.immobilized) {
      body.vx = 0;
    } else if (combat.stun > 0) {
      // Launched or pushed: the speed runs down at the fighter's own hitstun
      // rates, whatever is held.
      const drag = body.grounded ? mv.hitstunFriction ?? mv.deceleration * 0.5 : mv.hitstunAirDrag ?? mv.airDeceleration * 0.5;
      body.vx = approach(body.vx, 0, drag * dt);
    } else if (this.dash) {
      body.vx = this.dash.direction * mv.dashSpeed;
    } else if (combat.shielding || this.charging) {
      // A Shield or Charge locks it: no walking or running on the ground,
      // no steering in the air; the current speed runs down under the normal
      // deceleration (the gentle air drag in the air, so momentum carries on).
      this.moveHorizontal(0, 0, 1, dt);
    } else if (atk?.def.lockMovement) {
      this.moveAttack(atk, dir, dt);
    } else {
      this.moveHorizontal(dir, 1, 1, dt);
    }

    // ---- Jump (buffered + coyote time) -----------------------------------
    // The press itself was taken in above (the freeze included); it counts
    // down on every step after it.
    if (!input.jumpPressed) this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (body.grounded) this.coyote = mv.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);

    // A held Shield outranks a jump: let go of Defense to jump. A jump may
    // also cut short an attack that hit (see CombatState.cancellable). It
    // only sets the upward speed: whatever horizontal speed the fighter has
    // carries straight into the air.
    if (this.jumpBuffer > 0 && this.coyote > 0 && (canAct || combat.cancellable) && !combat.shielding) {
      this.cutAttack();
      body.vy = -this.jumpVelocity;
      body.grounded = false;
      body.ground = null;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.charging = false;
    }

    // ---- Fast fall ---------------------------------------------------------
    // Down (the Charge input) held in the air while already descending
    // speeds the fall up toward movement.fastFallSpeed at
    // fastFallAcceleration: never while rising, never a jump in speed, and
    // never slower than the fall already is. Aerial attacks may fast-fall;
    // a stun, a bind or an air Shield may not.
    if (
      !body.grounded && input.charge && body.vy > 0 && mv.fastFallSpeed > 0 &&
      combat.stun <= 0 && !combat.immobilized && !combat.shielding && !this.technique
    ) {
      this.fastFalling = true;
      if (body.vy < mv.fastFallSpeed) body.vy = Math.min(mv.fastFallSpeed, body.vy + mv.fastFallAcceleration * dt);
    }

    // ---- Voluntary Charge release ----------------------------------------
    // Charging last step, Charge let go this step, and nothing else took over
    // (a hit, attack, Shield or jump all rule it out through canAct,
    // shielding or grounded). Only then does the brief release pose play.
    this.chargeReleased =
      wasCharging && !input.charge && canAct && body.grounded && !combat.shielding;

    // ---- Integrate -------------------------------------------------------
    stepBody(body, dt, ctx.stage, ctx.gravity);
    if (body.grounded) this.lastGroundY = body.y;

    // ---- Charged technique: ground and walls ------------------------------
    // It needs real ground under the fighter from its first frame to its
    // last: ground lost (a ledge, the main floor's edge, a vanished
    // platform) ends it at once and the fighter falls from where it is. A
    // wall (a solid's side; the stage has no side walls) stops the rush as
    // a whiff: the fighter stays against it and releases, this step counting
    // as the release's first (see ChargedTechnique.whiff).
    const technique = this.technique;
    if (technique) {
      if (!body.grounded) this.endTechnique('ground');
      else if (technique.phase === 'dash' && body.wall === technique.facing) technique.whiff('wall', dt);
    }

    // ---- Dash: ground and walls ----------------------------------------------
    // Grounded only: leaving the ground (a ledge, the main floor's edge)
    // ends it and the fighter falls from where it is, keeping its speed. It
    // never passes through a solid: one in the way stops the body and ends
    // the Dash there.
    if (this.dash && (!body.grounded || body.wall === this.dash.direction)) this.endDash();

    // ---- Energy refill -----------------------------------------------------
    // Every step no Dash was paid for, a held Shield included: faster while
    // in the Charge stance (this.charging: never the release pose, a
    // charged technique or a Charge held through one).
    if (!spent) combat.updateEnergy(dt, this.charging);

    // A buffered press ages only on steps the fighter lives through (never
    // in a freeze) and is gone once it is older than the buffer.
    if (this.bufferedAttack) {
      this.bufferedAttack.age += dt;
      if (this.bufferedAttack.age > (mv.attackBuffer ?? 0) + TIME_EPSILON) this.bufferedAttack = null;
    }

    this.updateFacing(dir);
    this.updateState(dt);
  }

  // One step of horizontal steering on whatever the fighter stands on (or
  // in the air), with `control` (0-1) of its normal steering: that share of
  // its acceleration and top speed. `friction` scales the ground
  // deceleration that slows it while it is not steering.
  //
  // Ground: from rest to top speed at `acceleration`; letting go stops it at
  // `deceleration`; pressing against the way it moves brakes at
  // acceleration x `turnBoost` until that way is spent, then accelerates the
  // new way, so a turn is quick but never a jump from one full speed to the
  // other. Faster than top speed (a Dash's burst, run down after it ends)
  // the excess bleeds off at `overspeedDeceleration`, whatever is held.
  // Air: the same shape with `airAcceleration`, `airTurnBoost` and the
  // gentle `airDeceleration` drag, so steering bends the drift instead of
  // replacing it. Holding the way it already moves never slows the fighter
  // beyond the drag, however fast it goes.
  moveHorizontal(dir, control, friction, dt) {
    const { body } = this;
    const mv = this.def.movement;
    const grounded = body.grounded;
    const v = body.vx;
    const top = this.maxSpeed * control;
    const accel = (grounded ? mv.acceleration : mv.airAcceleration) * control;
    const boost = grounded ? mv.turnBoost : mv.airTurnBoost ?? mv.turnBoost;
    let drag = grounded ? mv.deceleration * friction : mv.airDeceleration;
    if (grounded && Math.abs(v) > this.maxSpeed + TIME_EPSILON) drag = Math.max(drag, mv.overspeedDeceleration ?? 0);
    if (!dir || control <= 0) {
      body.vx = approach(v, 0, drag * dt);
    } else if (v !== 0 && sign(v) !== dir) {
      // Reversing: brake hard (never softer than letting go), then whatever
      // is left of this step accelerates the new way.
      const brake = Math.max(accel * boost, drag) * dt;
      body.vx = brake <= Math.abs(v) ? v + dir * brake : dir * Math.min(top, Math.min(brake - Math.abs(v), accel * dt));
    } else if (Math.abs(v) > top) {
      body.vx = approach(v, dir * top, drag * dt);
    } else {
      body.vx = approach(v, dir * top, accel * dt);
    }
  }

  // One step of an attack's own movement (see the attack fields in
  // js/game/combat.js): its step-in once its time reaches it, then steering
  // with the attack's share of control (none by default) over the speed it
  // started with, the rest running down under its friction.
  moveAttack(atk, dir, dt) {
    const { body } = this;
    const def = atk.def;
    const step = def.step;
    if (step && !atk.stepped && atk.time >= step.at - TIME_EPSILON) {
      atk.stepped = true;
      if (body.grounded && body.vx * this.facing < step.speed) body.vx = this.facing * step.speed;
    }
    const grounded = body.grounded;
    this.moveHorizontal(dir, grounded ? def.control : def.airControl, grounded ? def.friction : 1, dt);
  }

  // The horizontal speed an attack starting now keeps of `vx`: its momentum
  // share (airMomentum in the air), and on the ground never more than the
  // fighter's top speed, so a Dash's burst never becomes a lunge.
  attackStartSpeed(atk, vx, grounded) {
    if (!atk.lockMovement) return vx;
    if (!grounded) return vx * atk.airMomentum;
    const kept = vx * atk.momentum;
    return clamp(kept, -this.maxSpeed * atk.momentum, this.maxSpeed * atk.momentum);
  }

  // Remembers `action`'s press for the combat input buffer: the latest
  // press that may start at all (see attackMayStart) wins, starting its own
  // movement.attackBuffer seconds. Any other press leaves the buffer as it
  // is.
  bufferAttack(action) {
    if (!(this.def.movement.attackBuffer > 0) || !this.attackMayStart(action)) return;
    this.bufferedAttack = { action, age: 0, at: this.steps };
  }

  // Cuts the attack in progress short, if it may be (see
  // CombatState.cancellable): another attack or a jump is starting.
  cutAttack() {
    if (this.combat.cancellable) this.combat.endAttack();
  }

  // Free to start an attack or a jump: free to act, or in an attack that
  // hit and may now be cut short (see CombatState.cancellable).
  canFollowUp() {
    return this.canAct() || (this.combat.cancellable && !this.technique && !this.dash);
  }

  // Free to start something new: the combat state allows it (no attack,
  // stun, blockstun or bind), no charged technique owns the fighter and it
  // is not dashing. Its Launch Point, however high, and the Energy it has
  // left never matter.
  canAct() {
    return this.combat.canAct() && !this.technique && !this.dash;
  }

  // One fixed step of recovery for every charged-action cooldown: at
  // chargedCooldownRate while `charging` (the fighter is really in its
  // Charge stance), at 1 otherwise (running, jumping, attacking, stunned,
  // shielding, frozen, bound or performing a charged technique).
  recoverChargedCooldowns(dt, charging) {
    this.combat.chargedCooldowns.update(dt, charging ? this.chargedCooldownRate : 1);
  }

  // Whether this fighter may have its Shield up right now: its Defense is a
  // Shield, it is not exhausted (CombatState.canShield: any Energy left is
  // enough, a block costing more simply empties it) and the held art for
  // where it is (groundAnimation, or airAnimation in the air). Missing art
  // is refused, never faked, and reported once.
  shieldAllowed() {
    const spec = this.defense;
    if (spec?.type !== 'shield' || !this.combat.canShield()) return false;
    const key = this.body.grounded ? spec.groundAnimation : spec.airAnimation;
    if (key && this.sprites.has(key)) return true;
    if (!this.missingShieldArt.has(key)) {
      this.missingShieldArt.add(key);
      console.warn(`[Alva] Shield "${key}" has no animation frames; ignoring.`);
    }
    return false;
  }

  // Double-tap detection on the horizontal press edges (leftPressed /
  // rightPressed, from any device). A press of the same direction as the
  // one waiting, within movement.dashTapWindow seconds of it, is a double
  // tap: returns its direction (1 right, -1 left) and starts over. Any
  // other press (the other direction, or one too late) becomes the new
  // first tap; both directions on one step cancel it. 0 otherwise.
  trackDashTaps(input, dt) {
    const tap = this.dashTap;
    if (tap) tap.age += dt;
    if (!input.leftPressed && !input.rightPressed) return 0;
    if (input.leftPressed && input.rightPressed) {
      this.dashTap = null;
      return 0;
    }
    const direction = input.rightPressed ? 1 : -1;
    const window = this.def.movement.dashTapWindow ?? 0;
    if (tap && tap.direction === direction && tap.age <= window + TIME_EPSILON) {
      this.dashTap = null;
      return direction;
    }
    this.dashTap = { direction, age: 0 };
    return 0;
  }

  // Starts one Dash toward `direction` (1 right, -1 left): a short grounded
  // burst at movement.dashSpeed for one pass of the dash clip. Movement
  // only: no hitbox, damage, launch or invulnerability. Only while free
  // to act (no attack, stun, bind, charged technique or Dash already
  // running), grounded, not in or holding Charge, not shielding or holding
  // Defense for a Shield it may raise, and not exhausted, paying dashCost
  // (all that is left, emptying the bar, when that is less). The fighter
  // faces the Dash at once. False, with nothing
  // spent, if it cannot start (a missing dash clip is logged). `input` is
  // this step's (Charge or Defense held rules it out); any caller (a future
  // AI too) may use it.
  tryDash(direction, input = NEUTRAL_INPUT) {
    const speed = this.def.movement.dashSpeed;
    if (!speed || !direction) return false;
    if (!this.canAct() || !this.body.grounded || this.charging || input.charge) return false;
    if (this.combat.shielding || (input.defense && this.shieldAllowed())) return false;
    // Never a fast run passed off as a Dash: require real dash frames.
    if (!this.dashDuration || !this.sprites.has('dash')) {
      console.warn('[Alva] Dash has no animation frames; ignoring.');
      return false;
    }
    if (!this.combat.spendEnergy(this.energyDef.dashCost)) return false;
    this.dash = { direction, time: 0, duration: this.dashDuration };
    this.facing = direction;
    this.body.vx = direction * speed;
    // Every Dash plays its clip from the first frame, even straight after
    // another one.
    this.animator.play('dash', { restart: true });
    return true;
  }

  // Ends the Dash in progress, if any. The fighter keeps whatever speed it
  // has; the normal movement slows it from there.
  endDash() {
    this.dash = null;
  }

  // The charged action for `action`, dispatched on its type: a `summon`
  // (#0001's Charged BA1 Clone Attack, see trySummon) or a `technique`
  // (#0001's Charged BA2 Sphere Rush, see tryTechnique). True when it
  // consumed the press: it happened, or it is still cooling down (then
  // nothing happens at all: no normal attack instead, and the cooldown is
  // left as it is). False leaves the press to the normal attack.
  tryChargedAction(action) {
    const charged = this.def.chargedActions?.[action];
    if (!charged) return false;
    if (this.combat.chargedCooldowns.active(charged.id)) return true;
    if (charged.type === 'summon') return this.trySummon(action, charged.id);
    if (charged.type === 'technique') return this.tryTechnique(action, charged.id);
    console.warn(`[Alva] Charged ${action} has an unknown type "${charged.type}"; ignoring.`);
    return false;
  }

  // Summon `id` from `action`: starts its cooldown and queues one summon at
  // the opponent for the battle to spawn. The fighter itself performs
  // nothing and keeps charging. False, with no cooldown started, if there is
  // no such summon, the fighter cannot act, there is no opponent in play
  // (none at all, or one lost to the Void and waiting to respawn) or the art
  // is missing (logged).
  trySummon(action, id) {
    const summon = this.summonDefs[id];
    if (!summon || !this.opponent || this.opponent.lostToVoid || !this.canAct()) return false;
    const problem = summonProblem(this, summon);
    if (problem) {
      console.warn(`[Alva] Summon "${id}" is unavailable: ${problem}; ignoring.`);
      return false;
    }
    // Accepted: its cooldown runs from now, whether or not the clone hits.
    this.combat.chargedCooldowns.start(id, summon.cooldown);
    this.combat.lastIntent = action;
    this.summons.push({ id, target: this.opponent });
    return true;
  }

  // Start technique `id` from `action`: the fighter leaves Charge (no
  // release pose) and the technique owns it from this step (see
  // js/game/charged-technique.js). Grounded only. False, with no cooldown
  // started, if there is no such technique, the fighter cannot act or is
  // airborne, or its art or data is missing (logged).
  tryTechnique(action, id) {
    const def = this.techniqueDefs[id];
    if (!def || !this.canAct() || !this.body.grounded) return false;
    const problem = techniqueProblem(this, def);
    if (problem) {
      console.warn(`[Alva] Charged technique "${id}" is unavailable: ${problem}; ignoring.`);
      return false;
    }
    // Started: its cooldown runs from now, whether it hits, misses, meets a
    // wall or is interrupted.
    this.combat.chargedCooldowns.start(id, def.cooldown);
    this.combat.lastIntent = action;
    this.charging = false;
    this.body.vx = 0;
    this.technique = new ChargedTechnique({ owner: this, def, action });
    return true;
  }

  // Ends the charged technique in progress, if any, for `reason`: 'miss' or
  // 'wall' (once its release pose has shown), 'blocked', 'done', 'ground',
  // 'hit', 'released', 'void', 'reset' or 'destroy'. The sphere is removed
  // and any opponent it holds released; Launch Point already added stays, and
  // no further tick or explosion follows. The rush never carries on as a
  // slide, and a Charge still held from before it does not resume by itself.
  endTechnique(reason) {
    const t = this.technique;
    if (!t) return;
    t.end(reason);
    this.technique = null;
    this.chargeHeldOver = this.chargeHeld;
    this.body.vx = 0;
    this.updateState(0);
  }

  // Starts the attack mapped to `action`, if it can start now. `dir` is the
  // direction held on this step: an attack faces it as it starts (so a
  // turn made on the press step is never stale), and otherwise keeps the
  // fighter's facing, fixed from then until it ends. Starting it cuts short
  // an attack that may be (its hit confirmed; see CombatState.cancellable),
  // though never into itself while its own cooldown would still run.
  tryAction(action, dir = 0) {
    const combat = this.combat;
    combat.lastIntent = action;
    const attackId = this.attackFor(action);
    if (!attackId) return false; // reserved: wired, but no attack mapped
    const atk = this.attacks[attackId];
    if (!atk || !this.canFollowUp() || combat.cooldowns.has(attackId)) return false;
    // Into itself only once its own cooldown would be over, counted from
    // when it became cancellable.
    if (combat.attack?.def.id === attackId && combat.cancellableFor < atk.cooldown - TIME_EPSILON) return false;
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
    this.cutAttack();
    if (dir) this.facing = dir;
    this.body.vx = this.attackStartSpeed(atk, this.body.vx, this.body.grounded);
    combat.attack = { def: atk, time: 0, hasHit: false, confirmed: false, projectileSpawned: false, stepped: false };
    return true;
  }

  // Whether a press of `action` that could not start now may still start
  // once the fighter is free (the combat input buffer keeps only those): it
  // maps to an attack for where the fighter is, and that attack could start
  // here at all (on the ground if ground-only, with its art). Never a
  // reserved button, an air Throw or an attack without frames.
  attackMayStart(action) {
    const attackId = this.attackFor(action);
    const atk = attackId ? this.attacks[attackId] : null;
    if (!atk || (atk.groundOnly && !this.body.grounded)) return false;
    return !!atk.animation && this.sprites.has(atk.animation);
  }

  // Attack id for a controller action. The character's `actions` entry is a
  // string (one attack), { ground, air } (chosen by whether the fighter is
  // grounded as the button is pressed) or null (reserved).
  attackFor(action) {
    const mapping = this.def.actions?.[action];
    if (!mapping || typeof mapping === 'string') return mapping || null;
    return (this.body.grounded ? mapping.ground : mapping.air) || null;
  }

  // Facing follows only the fighter's own movement: the way it is running
  // (once past a small speed on the ground, so a turn does not flicker) or
  // steering in the air. A Dash sets it as it starts (tryDash), and so does
  // an attack started with a direction held (tryAction); a spawn or
  // respawn takes the spawn's. Otherwise it keeps its last facing: it never
  // turns toward its opponent by itself, standing still included, so an
  // opponent crossing behind it stays behind it. Locked while an attack,
  // Shield, stun, bind, charged technique or Dash plays.
  updateFacing(dir) {
    const { body, combat } = this;
    if (combat.attack || combat.shielding || combat.stun > 0 || combat.immobilized || this.technique || this.dash) return;
    if (dir !== 0 && (Math.abs(body.vx) > 20 || !body.grounded)) this.facing = dir;
  }

  // Visual state only: nothing here feeds back into movement or collision.
  updateState(dt) {
    const { body, combat } = this;
    let next;
    if (combat.stun > 0) next = 'hitstun';
    else if (this.technique) next = 'technique';
    else if (combat.immobilized) next = 'bound';
    else if (combat.attack) next = 'attack';
    else if (this.dash) next = 'dash';
    else if (combat.shielding) next = 'shield';
    else if (!body.grounded) next = body.vy < 0 ? 'jump' : 'fall';
    else if (this.isLanding(dt)) next = 'land';
    else if (this.charging) next = 'charge';
    else if (this.isReleasingShield(dt)) next = 'shieldRelease';
    else if (this.isReleasingCharge(dt)) next = 'chargeRelease';
    else if ((this.moveDir !== 0 && Math.abs(body.vx) > 20) || Math.abs(body.vx) > 140) next = 'run';
    else next = 'idle';

    if (next !== this.state) {
      if (next === 'shield') this.shieldRaisedOnGround = body.grounded;
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

  // Animation key for a visual state. An attack plays its own clip for its
  // whole length, even if the fighter lands or leaves the ground meanwhile.
  // Hitstun, and being bound by a charged technique, show `hurt` on the
  // ground and `midairHurt` in the air. A charged technique plays the clip
  // of its current phase. Charge plays `chargeStart` once, then `chargeLoop`
  // for the rest of the hold; a new Charge resets stateTime, so it starts
  // from the first frame. The Shield shows its held pose where the fighter
  // is (`airAnimation` in the air), opening with `groundStartAnimation` for
  // one frame when it goes up on the ground; `shieldRelease` is
  // `groundReleaseAnimation`.
  animationFor(state) {
    if (state === 'attack') return this.combat.attack.def.animation;
    if (state === 'shield') {
      const spec = this.defense;
      if (!this.body.grounded) return spec.airAnimation;
      const raising = this.shieldRaisedOnGround && this.stateTime < this.shieldStartDuration - TIME_EPSILON;
      return raising ? spec.groundStartAnimation : spec.groundAnimation;
    }
    if (state === 'shieldRelease') return this.defense.groundReleaseAnimation;
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

  // A Shield lowered on the ground (Defense let go, or its Energy gone)
  // starts the shieldRelease state; it then lasts one pass of the lower
  // pose while nothing of higher priority takes over. Lowered in the air it
  // has no pose: the fighter goes straight back to jump or fall.
  isReleasingShield(dt) {
    if (!this.shieldReleaseDuration) return false;
    if (this.state === 'shield') return this.body.grounded;
    return this.state === 'shieldRelease' && this.stateTime + dt < this.shieldReleaseDuration - TIME_EPSILON;
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
  // so a clip drawn facing left is mirrored when the fighter faces right.
  // Rendering only: `facing`, movement and every hurtbox / hitbox are
  // unaffected.
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
