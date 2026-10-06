// Fighter entity: physics body + state machine + combat state + animator.
// Behaviour is driven entirely by the character definition and whatever
// controller (player / AI) feeds it input.
//
// Purpose: the one runtime fighter every mode uses, for every character.
// It owns the fighter's state (its body, Dash and air dash, jumps, Shield,
// attack in progress (its Deflect included), Combat Assist's approach,
// summon startup, technique, launch sequence) and the order in which each
// fixed step updates it (Fighter.update).
// Inputs: a character definition (js/data/characters/<id>.js), its loaded
// SpriteSet (clip lengths time the land pose, pending attacks and summon
// startups; the Dash and the air dash need their art), the universal
// movement values (BASE_FIGHTER_MOVEMENT, js/data/movement.js), a spawn,
// the stage, and a controller (js/game/fighters/fighter-controller.js or
// js/game/ai/combat-ai.js).
// Outputs: Fighter, separateFighters and COMBAT_ACTIONS.
// Important constraints: the rules are shared; movement's numbers are
// universal (no fighter has its own run, jump or Dash) and every other
// number is the character's. Movement math lives in
// js/game/fighters/movement.js, attack
// / defense / Energy schemas and Combat Assist's measurements in
// js/game/combat/, and nothing here names a fighter or a button's role: a
// summon or technique is whatever the character's `actions` say it is, and
// an attack is melee or ranged by its own data (isMeleeAttack). Combat
// Assist is the human player's only: its controller says so (kind 'player'
// with combatAssist on), never a slot, a label or a fighter. The
// simulation is fixed-step and deterministic; rendering reads it
// (interpolate, spriteFlip) and never feeds back.

import { SpriteAnimator } from '../rendering/sprite-animator.js';
import { createBody, stepBody, dropThrough, separate } from '../physics.js';
import { startLaunch, bounceLaunch, resolveLaunchBounce } from '../combat/launch-bounce.js';
import { attackPhase, createAttackDefinition, isMeleeAttack } from '../combat/attacks.js';
import { createDefenseDefinition } from '../combat/defense.js';
import { createDeflectDefinition } from '../combat/deflect.js';
import { CombatState, resolveEnergy } from '../combat/combat-state.js';
import { resolveLaunchReaction } from '../combat/combat.js';
import { createProjectileDefinition } from '../combat/projectile.js';
import { createSummonDefinition, summonProblem } from '../combat/summon.js';
import { Technique, createTechniqueDefinition, techniqueProblem } from '../combat/technique.js';
import { assistRange, approachDistance, approachClear } from '../combat/combat-assist.js';
import { BASE_FIGHTER_MOVEMENT } from '../../data/movement.js';
import { specialAction } from '../../data/loadout.js';
import { COMBAT_BUTTONS } from '../../config.js';
import { blankInput } from './fighter-controller.js';
import { approach, clamp } from '../../core/utils.js';
import {
  steer, steerAttack, attackStartSpeed, hitstunDrag, fastFallVelocity, airJump, highJumpLift, readDashTap,
} from './movement.js';

// The combat buttons, by control codename (COMBAT_BUTTONS in js/config.js):
// extra_attack, transform and attack1 to attack5. Each maps to a move
// through the character's `actions` (an attack, or for attack3 to attack5
// also a summon or a technique; see js/data/loadout.js); a fighter acts
// only on the ones it has there. shield, jump and the directions (down
// included) are held-state controls, read separately.
export const COMBAT_ACTIONS = COMBAT_BUTTONS;

// stateTime is a sum of fixed steps, which drifts just below whole-step
// boundaries (12 steps of 1/60 s sum to 0.19999...), so timed clip phases
// compare with a little slack and last exactly their whole number of steps.
const TIME_EPSILON = 1e-6;

const NEUTRAL_INPUT = Object.freeze(blankInput());

// The fastest the run clip plays (x its own rate) by default, above top
// speed: a burst's run-on looks as fast as it goes (a clip may say
// otherwise with its own maxSpeedScale). Art only.
const RUN_MAX_SPEED_SCALE = 1.6;

// World units behind the fighter's middle an opponent may be and still be
// locked on to by a homing dash (see Fighter.lockOn): one straight above
// or below counts as ahead, one behind it does not.
const HOMING_BEHIND = 8;

// Keeps two fighters' pushboxes apart (see separate in js/game/physics.js),
// as every fixed step does after the fighters move. A fighter flying off a
// rebound (see Fighter.ricocheting) passes the other instead: a ricochet is
// never pinned against a body in its way, so it cannot be held in front of
// an attacker at a wall. So does one in an attack that passes through (see
// Fighter.passingThrough: #0002's Spin Attack rolls on through its target).
export function separateFighters(a, b, stage) {
  if (a.ricocheting || b.ricocheting || a.passingThrough || b.passingThrough) return;
  separate(a.body, b.body, a.def.pushbox.width / 2, b.def.pushbox.width / 2, stage);
}

export class Fighter {
  constructor({ def, sprites, spawn, stage, slot, controller, label }) {
    this.def = def;
    this.sprites = sprites;
    this.slot = slot;
    this.label = label;
    this.controller = controller;
    this.animator = new SpriteAnimator(sprites);
    // The universal movement values (js/data/movement.js): the same object
    // for every fighter, whatever its definition says. Nothing about how a
    // fighter runs, jumps or Dashes is its own.
    this.movement = BASE_FIGHTER_MOVEMENT;
    // One pass of the touchdown clip; 0 skips the land pose entirely. A
    // pose only: it never holds the fighter (see updateState).
    this.landDuration = sprites.duration('land');
    // How long a Dash and an air dash last: the universal durations, with
    // their clip played once across each (see updateState); 0 without the
    // art, and then none starts (see tryDash and tryAirDash).
    this.dashDuration = sprites.duration('mouvment') > 0 ? this.movement.dashDuration : 0;
    this.airDashDuration = sprites.duration('midair_mouvment') > 0 ? this.movement.airDashDuration : 0;
    // A pending attack (art only, see js/game/combat/attacks.js) lasts one pass of
    // its own clip.
    this.attacks = Object.fromEntries(
      Object.entries(def.attacks || {}).map(([id, spec]) => [
        id, createAttackDefinition({ id, ...spec }, { clipDuration: sprites.duration(spec.animation) }),
      ]),
    );
    this.projectileDefs = Object.fromEntries(
      Object.entries(def.projectiles || {}).map(([id, spec]) => [id, createProjectileDefinition({ id, ...spec })]),
    );
    this.summonDefs = Object.fromEntries(
      Object.entries(def.summons || {}).map(([id, spec]) => [id, createSummonDefinition({ id, ...spec })]),
    );
    this.techniqueDefs = Object.fromEntries(
      Object.entries(def.techniques || {}).map(([id, spec]) => [id, createTechniqueDefinition({ id, ...spec })]),
    );
    // What the shared `shield` input does for this character: on the ground
    // its `defense` entry (null: nothing), in the air its Deflect (its
    // `deflect` entry, an attack: see tryDeflect; null: nothing).
    this.defense = createDefenseDefinition(def.defense);
    this.deflect = createDeflectDefinition(def.deflect);
    // Whether a Deflect without its art has been reported, so it warns once.
    this.missingDeflectArt = false;
    // One pass of the grounded Shield's raise and lower poses; 0 skips them.
    this.shieldStartDuration = sprites.duration(this.defense?.groundStartAnimation);
    this.shieldReleaseDuration = sprites.duration(this.defense?.groundReleaseAnimation);
    // Shield clips already reported missing, so a held Shield warns once.
    this.missingShieldArt = new Set();
    // Energy settings (js/game/combat/combat-state.js resolveEnergy): the maximum, the
    // refill rate, what a Dash costs and what each blocked hit costs.
    this.energyDef = resolveEnergy(def.energy);
    // How it responds to being launched (resolveLaunchReaction in
    // js/game/combat/combat.js): longer stun for
    // a harder launch, tumbling past a speed, and how far it may steer one.
    this.launchReaction = resolveLaunchReaction(def.launchReaction);
    // How a launch that drives it into a wall, floor or ceiling rebounds
    // (js/game/combat/launch-bounce.js: LAUNCH_BOUNCE, under the character's own
    // `launchBounce`).
    this.launchBounce = resolveLaunchBounce(def.launchBounce, `Character "${def.id}"`);
    this.opponent = null;
    this.spawn = spawn;
    this.reset(stage);
  }

  reset(stage) {
    // A technique in progress ends first: nothing of it survives a rematch.
    if (this.technique) this.endTechnique('reset');
    const { def, spawn } = this;
    // The stage it stands on: what a Combat Assist press checks its path
    // against (see tryCombatAssist).
    this.stage = stage;
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
      gravityScale: this.movement.gravityScale,
      maxFall: this.movement.maxFallSpeed,
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
    this.attackVisualFacing = null;
    this.state = 'idle';
    this.stateTime = 0;
    this.moveDir = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    // Jumps left in the air before landing again (movement.airJumps: two,
    // the triple jump), refreshed on the ground and by a hit (see takeHit);
    // and air dashes likewise (see airDashUses).
    this.airJumps = this.movement.airJumps;
    this.airDashes = this.airDashUses;
    // Carrying a burst of its own: the speed above top speed came from its
    // Dash or air dash, so in the air it bleeds off at
    // movement.airOverspeedDeceleration (see steer in
    // js/game/fighters/movement.js). Set as either starts; over once the
    // speed is back to top speed or less, or a hit lands. A launch's speed is
    // never a burst: it flies on under the air drag.
    this.burst = false;
    // Jumped in the air this step (the jump clip starts over).
    this.airJumped = false;
    // The direction held this step ({ x, y }, y -1 up with Jump, 1 down with
    // Down), read by a hit landing on it to steer its launch.
    this.steerHeld = { x: 0, y: 0 };
    // Launched hard (launchReaction.tumbleSpeed or faster): it tumbles in its
    // mid-air hurt pose, stunned or not, until it acts or lands.
    this.tumbling = false;
    // The launch sequence it is flying in (see js/game/combat/launch-bounce.js),
    // from the launching hit until it is back in ordinary play; null
    // otherwise. And this step's rebound off stage geometry, if any.
    this.launch = null;
    this.bounce = null;
    // A ground jump that may still become the higher jump, or already is
    // one ({ time, fromY, lift }): Jump still held movement.highJumpWindow
    // after takeoff makes it rise on to highJumpHeight x the normal jump's
    // height, under `lift` x gravity until its apex (see highJumpLift).
    // `lift` is null while undecided. Null for a normal jump (Jump let go
    // in time) and once the higher one's rise is over.
    this.highJump = null;
    // Steps this fighter has lived (frozen ones included), to keep buffered
    // presses in the order they were made: the jump's press step, and each
    // buffered attack's.
    this.steps = 0;
    this.jumpPressedAt = -1;
    // The latest combat button press (extra_attack, attack1 to attack5) the
    // fighter could not act on yet ({ action, age, at }), tried again every
    // step for movement.attackBuffer seconds (see bufferAttack), or null.
    this.bufferedAttack = null;
    // Likewise the latest Dash (or air dash) asked for that could not start
    // yet ({ direction, age }), tried again every step for the same
    // movement.attackBuffer (see the Dash in update), or null.
    this.bufferedDash = null;
    // How many times each attack with `airUses` has started since the
    // fighter was last on the ground or hit: attack id -> count.
    this.airAttacks = new Map();
    // In free fall (see `freeFall` in js/game/combat/attacks.js): an attack that
    // spends the airtime was started in the air, and until the fighter lands
    // or is hit it has no attack or air jump left.
    this.freeFall = false;
    // Fast-falling this step: Down held in the air while descending.
    this.fastFalling = false;
    this.lastGroundY = this.body.y;
    this.inputLocked = false;
    // The Dash or air dash in progress ({ direction, time, duration, speed,
    // air, animation }; see tryDash and tryAirDash), or null; and the last
    // horizontal press still waiting for its double tap (see
    // trackDashTaps): { direction, age }, or null.
    this.dash = null;
    this.dashTap = null;
    // Combat Assist's approach in progress (see tryCombatAssist), or null:
    // { action, attack, target, direction, need, travelled, time }, the
    // melee press it serves (the newest), its attack, the opponent it
    // closes on, the way it goes, how far it still has to go, how far it
    // has gone and for how long. Its Energy is paid once, as it starts;
    // `assistPaidAt` is that step (no refill on it).
    this.combatAssist = null;
    this.assistPaidAt = -1;
    // Seconds the Shield has been up (from the step it went up) and down;
    // and whether this raise may block perfectly (see perfectShield).
    this.shieldUpTime = 0;
    this.shieldDownTime = Infinity;
    this.shieldPerfectReady = false;
    // A fresh combat state: 0 Launch Point, full Energy, Shield down and
    // every cooldown ready.
    this.combat = new CombatState(this.energyDef);
    // Projectiles released this step, waiting for the battle to spawn them
    // (see spawnProjectiles in js/game/combat/projectile.js).
    this.releases = [];
    // Summons paid for this step, waiting for the battle to spawn them (see
    // spawnClones in js/game/combat/summon.js): { id, target }.
    this.summons = [];
    // A summon accepted but not yet sent out: its owner is performing its
    // startup ({ id, target, animation, duration, time }; see trySummon), or
    // null.
    this.pendingSummon = null;
    // The technique this fighter is performing (see js/game/combat/technique.js),
    // or null.
    this.technique = null;
    this.renderX = this.body.x;
    this.renderY = this.body.y;
    this.animator.play('idle', { restart: true });
  }

  // Back at its own spawn after the Void's wait (see Arena.updateRespawns):
  // a clean, neutral state, exactly a reset. Launch Point is back to 0,
  // Energy full and not exhausted, and every cooldown (the summon's and the
  // technique's included) ready; everything transient goes with the old
  // body: velocity, attack, Shield, Dash, stun, freeze, paralysis, its
  // technique, a summon's startup and any queued projectile or summon. It
  // is in play again at once.
  respawn(stage) {
    this.reset(stage);
  }

  // Flying off a rebound: its launch has ricocheted off the stage at least
  // once and is not over yet (see js/game/combat/launch-bounce.js). Such a fighter
  // passes other fighters' pushboxes (see separateFighters).
  get ricocheting() {
    return !!this.launch && this.launch.bounces > 0;
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get grounded() { return this.body.grounded; }

  // Top speed of normal left / right movement (on the ground and in the
  // air) and the normal jump's upward speed: the universal values, the same
  // for every fighter.
  get maxSpeed() { return this.movement.maxSpeed; }
  get jumpVelocity() { return this.movement.jumpVelocity; }

  update(dt, ctx) {
    const { body, combat } = this;
    const mv = this.movement;

    const raw = this.controller ? this.controller.getInput(this, dt, ctx) : NEUTRAL_INPUT;
    const input = this.inputLocked ? NEUTRAL_INPUT : raw;
    this.steps++;
    this.fastFalling = false;
    this.airJumped = false;
    this.bounce = null;
    this.steerHeld.x = (input.runRight ? 1 : 0) - (input.runLeft ? 1 : 0);
    this.steerHeld.y = (input.down ? 1 : 0) - (input.jump ? 1 : 0);
    this.updateAttackFacing();

    // Every cooldown recovers by this step first (the summon's and the
    // technique's too, in real time), so one started below ends the step at
    // its full length.
    combat.update(dt);
    // Hitstun always wins over a technique and a summon's startup
    // (CombatSystem.applyHit normally ends them on the hit itself), and over
    // a Dash, an air dash or Combat Assist's approach (takeHit ends that on
    // the hit itself), as does a paralysis.
    if (this.technique && combat.stun > 0) this.endTechnique('hit');
    if (this.pendingSummon && (combat.stun > 0 || combat.immobilized)) this.cancelSummon();
    if (this.dash && (combat.stun > 0 || combat.immobilized)) this.endDash();
    if (this.combatAssist && (combat.stun > 0 || combat.immobilized)) this.cancelCombatAssist();
    // A hit (or a paralysis) takes the fighter out of its own attack: nothing of
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
      // blocked one keeps the Shield up). The velocity is frozen, never
      // lost: the body picks up exactly where it stopped. Energy keeps
      // refilling. Presses made during it are kept, not lost, and do not
      // age: the attack pressed through the impact comes out as soon as it
      // can, and so does a Dash asked for (a Dash cancel out of the hit). A
      // Shield press is not: a Deflect starts on its own press or not at
      // all. The body is drawn where it stopped, not between its last two
      // steps (a rebound freezes it at the surface it struck).
      body.prevX = body.x;
      body.prevY = body.y;
      for (const action of COMBAT_ACTIONS) if (input[`${action}Pressed`]) this.bufferAttack(action);
      const frozenDash = this.dashAsked(input, 0);
      if (frozenDash) this.bufferedDash = { direction: frozenDash, age: 0 };
      combat.updateEnergy(dt);
      this.updateState(0);
      return;
    }

    // ---- Dash -------------------------------------------------------------
    // A Dash or an air dash ends by itself after its duration (its clip
    // played once across it): the fighter is free again from the step it
    // ends, carrying on at the speed it had.
    if (this.dash) {
      this.dash.time += dt;
      if (this.dash.time >= this.dash.duration - TIME_EPSILON) this.endDash();
    }

    // ---- Summon startup ----------------------------------------------------
    // Likewise a summon's startup ends after one pass of its clip, counted
    // from the press step: the clone is queued (see finishSummon) and the
    // fighter is free again from the step it ends.
    if (this.pendingSummon) {
      this.pendingSummon.time += dt;
      if (this.pendingSummon.time >= this.pendingSummon.duration - TIME_EPSILON) this.finishSummon();
    }

    // ---- Shield: held shield ---------------------------------------------
    // Decided first: `shield` held with a Shield the fighter may raise (its
    // `defense` is a Shield, it is on the ground, not exhausted, with the
    // held art) takes the step, so no attack, Throw, summon, technique or
    // Dash starts while it is held. Let go of the Shield button to do any of
    // them. In the air there is no Shield to hold (see the Deflect below).
    const shieldHeld = !!input.shield && this.shieldAllowed();

    // The held direction: what steering, a turning attack and a cut-short
    // attack all read.
    const held = (input.runRight ? 1 : 0) - (input.runLeft ? 1 : 0);
    // The Dash this step asks for (see dashAsked), read before the intents:
    // asking for one also cancels Combat Assist's approach (see
    // assistIntents). It starts, or waits, in the Dash section below.
    const dashDirection = this.dashAsked(input, dt);

    // ---- Combat intents --------------------------------------------------
    // Each press is its button's own move (see tryAction): an attack, or a
    // summon or technique (e.g. #0001's Attack 4 and Attack 5). Actions mapped to
    // null are wired but reserved, and a button the character has no action
    // for does nothing.
    //
    // A press the fighter cannot act on yet (an attack or its recovery, a
    // stun, a Dash before its cancel time, a summon's startup, a cooldown,
    // the Shield button held) is buffered
    // (see bufferAttack) and tried again every later step until it starts
    // or expires, so an attack pressed slightly early comes out on the
    // first step it can. A newer press replaces it. Only ever an ordinary
    // attack: a summon or a technique happens on its own press or not at
    // all, so one pressed while it cools down never comes out later.
    //
    // Buffered presses keep their order: a jump pressed before the attack
    // (both waiting on the same recovery) goes first, and the attack comes
    // out on a later step, in the air. Pressed on the same step, the attack
    // goes first, on the ground.
    //
    // In the air a fresh `shield` press is the fighter's Deflect (see
    // tryDeflect), tried first: an attack button pressed on the same step
    // loses to it, as to any other attack pressed with it. It starts on the
    // press itself or not at all: never from the button held, never kept
    // for later.
    //
    // A melee press may start Combat Assist's approach instead of its
    // attack (see tryCombatAssist). While that runs, this step's presses
    // are its own (see assistIntents): a jump, a Dash, the Shield or a
    // Deflect cancels it and takes over, a melee press replaces the attack
    // it will end in, and any other move cancels it and starts as ever.
    const canJump = this.coyote > 0 || (!body.grounded && this.airJumps > 0 && !this.freeFall);
    const jumpFirst = (at) =>
      this.jumpBuffer > 0 && canJump && this.jumpPressedAt < at && this.canFollowUp() && !shieldHeld;
    if (this.combatAssist) {
      this.assistIntents(input, held, shieldHeld, dashDirection);
    } else {
      let started = !body.grounded && !!input.shieldPressed && this.tryDeflect(held);
      if (started) this.bufferedAttack = null;
      for (const action of COMBAT_ACTIONS) {
        if (!input[`${action}Pressed`]) continue;
        if (shieldHeld || jumpFirst(this.steps)) {
          this.bufferAttack(action);
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
    }

    // ---- Dash: a double tap of runLeft or runRight, or a mouvement ------
    // The Dash on the ground, the air dash in the air (see tryMouvment).
    // After the attacks (a Deflect included), so one started this step wins
    // over a Dash on the same step (canFollowUp). A Dash may cut short an
    // attack that hit, as a jump may. Asked for while the fighter is busy
    // (an attack or its recovery, a stun, another Dash, an impact freeze),
    // the request is buffered like an attack press: tried again every step
    // until it starts, for movement.attackBuffer seconds (a newer request
    // replaces it), so a Dash pressed slightly early comes out on the first
    // step it can; so is one in the air that no air dash answers, which is
    // the Dash if the fighter lands in time. One refused on the ground for
    // any other reason (no Energy, the Shield held, no art) is used up:
    // nothing is kept. Energy spent this step (on a Dash, or on Combat
    // Assist's approach) means no refill this step (see the end of update).
    //
    // mouvementLeftPressed / mouvementRightPressed ask for one Dash outright
    // (the Joystick touch layout's single-tap mouvement buttons, see
    // InputManager.queueTouchMouvement). The request goes through the very same
    // tryMouvment, so every rule and cost of a double-tap Dash applies, and it
    // is buffered or used up the same way. It is not a tap: it forgets any
    // first tap waiting, so it never pairs with one, and this step's own
    // direction press (if any) is not counted as one either. Both at once
    // ask for nothing.
    let spent = false;
    if (dashDirection) this.bufferedDash = { direction: dashDirection, age: 0 };
    const wantedDash = this.bufferedDash;
    if (wantedDash) {
      // Busy (or dashing still): wait for the first step it can start. In
      // the air one no air dash answers waits too: on touchdown it is the
      // Dash.
      const busy = !this.canFollowUp() || !!this.dash || (!body.grounded && this.dashDuration > 0);
      if (this.tryMouvment(wantedDash.direction, input)) {
        spent = true;
        this.bufferedDash = null;
      } else if (!busy) {
        this.bufferedDash = null;
      }
    }

    // ---- Technique ---------------------------------------------------------
    // While one runs it owns the fighter: its phases advance on their own
    // clock (it releases as its cast ends, and is over after its release
    // pose), whatever is held.
    if (this.technique) {
      const ended = this.technique.update(dt);
      if (ended) this.endTechnique(ended);
    }

    // After the intents, so an attack, technique or summon's startup started
    // this step also rules out a Shield, jump or platform drop on the same
    // step.
    const canAct = this.canAct();
    // The Shield is up while `shield` is held, the fighter is on the ground
    // and free to act (it never cuts an attack, Dash, technique, summon's
    // startup, stun or paralysis short).
    // A blocked hit's blockstun holds it up until the stun is over, held or
    // not. Either way only while shieldAllowed: the block that empties the
    // bar, or leaving the ground (a block's push off a ledge), drops it.
    // Holding it costs nothing: only the hits it blocks cost Energy (see
    // CombatSystem.applyHit).
    const wasShielding = combat.shielding;
    combat.shielding =
      (shieldHeld && canAct) || (combat.shielding && combat.shieldStun > 0 && this.shieldAllowed());
    if (!combat.shielding) combat.shieldStun = 0;
    // The perfect Shield's clock: a raise after the Shield has been down
    // for perfectRearm opens a perfectWindow from this very step.
    if (combat.shielding && !wasShielding) {
      this.shieldPerfectReady = this.shieldDownTime >= (this.defense?.perfectRearm ?? 0) - TIME_EPSILON;
      this.shieldUpTime = 0;
    } else if (combat.shielding) {
      this.shieldUpTime += dt;
    }
    if (combat.shielding) this.shieldDownTime = 0;
    else this.shieldDownTime += dt;

    // ---- Platform drop (training CPU only) -------------------------------
    // No player key, button or touch control produces `dropPressed`; the
    // training CPU uses it to follow the player down through one-way platforms.
    if (input.dropPressed && canAct && body.grounded && !combat.shielding) {
      dropThrough(body, mv.dropThroughTime);
    }

    // ---- Horizontal movement ---------------------------------------------
    // See moveHorizontal, and moveAttack while an attack plays (moveMotion
    // while an attack's own motion owns the body, and then the share of
    // gravity it falls under this step). A summon's startup holds the
    // fighter still where it stands, as a technique does. An air dash owns
    // the body too: straight across at its speed, no fall. So does Combat
    // Assist's approach, on the ground.
    const atk = combat.attack;
    const assist = this.combatAssist;
    let gravityShare = 1;
    let dir = held;
    if (combat.shielding || combat.stun > 0 || combat.immobilized || this.technique || this.dash || this.pendingSummon || assist) dir = 0;
    // Normal locomotion only: an attack steers with its own share of it.
    this.moveDir = atk?.def.lockMovement ? 0 : dir;

    if (this.technique || this.pendingSummon) {
      body.vx = 0;
    } else if (combat.immobilized) {
      body.vx = 0;
    } else if (combat.stun > 0) {
      // Launched or pushed: the speed runs down at the fighter's own hitstun
      // rates, whatever is held.
      body.vx = approach(body.vx, 0, hitstunDrag(mv, body.grounded) * dt);
    } else if (this.dash) {
      // A burst at its own speed (never slower than the fighter came in
      // at, see dashSpeedToward): the Dash's way, an air dash flat across.
      body.vx = this.dash.direction * this.dash.speed;
      if (this.dash.air) {
        body.vy = 0;
        gravityShare = 0;
      }
    } else if (assist) {
      // Straight at its target at the Dash's speed, never past the point its
      // attack reaches from (see assistIntents): the last step covers only
      // what is left. Physics and pushboxes stop it like any body.
      body.vx = assist.direction * Math.min(mv.dashSpeed, assist.need / dt);
    } else if (combat.shielding) {
      // A Shield locks it: no walking or running, the current speed running
      // down under the normal deceleration.
      this.moveHorizontal(0, 0, 1, dt);
    } else if (atk?.motion && !atk.motion.done) {
      gravityShare = this.moveMotion(atk, dir, dt);
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

    // A held Shield outranks a jump: let go of the Shield to jump. A jump may
    // also cut short an attack that hit (see CombatState.cancellable) and a
    // Dash or an air dash past its cancel time (see dashCancellable). It
    // only sets the upward speed: whatever horizontal speed the fighter has
    // (a Dash's whole burst included) carries straight into the air, under
    // full gravity from this step. A tap is the normal jump; Jump held a
    // little longer makes it the higher jump (see below).
    const free = (canAct || combat.cancellable || this.dashCancellable) && !combat.shielding;
    let jumped = false;
    if (this.jumpBuffer > 0 && this.coyote > 0 && free) {
      this.cutAttack();
      if (this.dash) this.endDash();
      gravityShare = 1;
      this.highJump = { time: 0, fromY: body.y, lift: null };
      body.vy = -this.jumpVelocity;
      body.grounded = false;
      body.ground = null;
      this.coyote = 0;
      this.jumpBuffer = 0;
      jumped = true;
    } else if (this.jumpBuffer > 0 && !body.grounded && this.coyote <= 0 && this.airJumps > 0 && free && !this.technique && !this.freeFall) {
      // ---- Air jump -------------------------------------------------------
      // Jump pressed in the air (past coyote time), with one left (two per
      // airtime: the triple jump): a fresh jump from wherever the fighter
      // is, at airJumpRatio x the normal jump's speed, the jump clip from its
      // first frame. Vertical only: the sideways speed carries straight
      // through it, and steering the other way bends it round as the air
      // allows. Always the same height, held or tapped: never a higher jump.
      this.cutAttack();
      if (this.dash) this.endDash();
      gravityShare = 1;
      airJump(body, mv);
      this.airJumps--;
      this.jumpBuffer = 0;
      this.highJump = null;
      this.airJumped = true;
      jumped = true;
    }

    // ---- Higher jump -------------------------------------------------------
    // A ground jump whose Jump is still held highJumpWindow after takeoff (a
    // press a little longer than a tap, held from the takeoff step on) is
    // the higher jump: from then until its apex it rises under lighter
    // gravity, just enough to top out at highJumpHeight x the normal jump's
    // height (see highJumpLift), so its arc stretches rather than kicking.
    // Let go sooner, it is the normal jump, exactly as ever. Decided once,
    // and kept whether Jump stays held or not; the apex, a stun, the air
    // jump or the ground ends it.
    const rise = this.highJump;
    if (rise) {
      if (!jumped) rise.time += dt;
      if (body.vy >= 0 || combat.stun > 0) this.highJump = null;
      else if (!rise.lift) {
        if (!input.jump) this.highJump = null;
        else if (rise.time >= (mv.highJumpWindow ?? Infinity) - TIME_EPSILON) rise.lift = this.highJumpLift(ctx.gravity);
      }
    }

    // ---- Fast fall ---------------------------------------------------------
    // Down held in the air while already descending speeds the fall up
    // toward movement.fastFallSpeed at
    // fastFallAcceleration: never while rising, never a jump in speed, and
    // never slower than the fall already is. Aerial attacks (a Deflect
    // included) may fast-fall; a stun, a paralysis or an air dash may not.
    if (
      !body.grounded && input.down && body.vy > 0 && mv.fastFallSpeed > 0 &&
      combat.stun <= 0 && !combat.immobilized && !this.technique && !this.inMotion && !this.dash
    ) {
      this.fastFalling = true;
      body.vy = fastFallVelocity(body.vy, mv, dt);
    }

    // ---- Integrate -------------------------------------------------------
    // A higher jump's rise falls under its lighter share of gravity, and an
    // attack's motion under its own (none while it holds the fighter up, nor
    // through an air dash).
    stepBody(body, dt, ctx.stage, ctx.gravity * (this.highJump?.lift ?? 1) * gravityShare, body.maxFall);
    // What meeting the ground or a wall does to an attack's motion.
    if (atk && atk === combat.attack) this.motionContact(atk);

    // ---- Launch bounce -----------------------------------------------------
    // Physics stopped the body at whatever it met. If a launch drove it
    // into that wall, floor or ceiling hard enough, it rebounds instead (see
    // js/game/combat/launch-bounce.js): a floor it rebounds from is no landing. A
    // rebound never hands control back mid-flight (at least
    // launchBounce.stun of hitstun), and a hard one freezes the fighter at
    // the surface for a moment first.
    const bounce = this.launch ? bounceLaunch(body, this.launch, this.launchBounce) : null;
    if (bounce) {
      const spec = this.launchBounce;
      combat.stun = Math.max(combat.stun, spec.stun);
      if (bounce.speed >= spec.hitstopSpeed) combat.hitstop = Math.max(combat.hitstop, spec.hitstop);
      this.bounce = bounce;
    }

    if (body.grounded) {
      this.lastGroundY = body.y;
      this.airJumps = mv.airJumps;
      this.airDashes = this.airDashUses;
      this.airAttacks.clear();
      this.freeFall = false;
      this.highJump = null;
      this.tumbling = false;
      // Landing cancel: an attack started in the air whose recovery runs
      // on the ground is over (its cooldown starting as if it had
      // finished), so the fighter acts on touchdown. Its startup and strike
      // play on as ever; its sideways speed carries on as the ground allows.
      const a = combat.attack;
      if (a?.airborne && combat.phase === 'recovery' && !this.inMotion) combat.endAttack();
    }
    // A tumble lasts past the stun until the fighter does something: an
    // attack, a jump, the Shield or a fast fall. Steering alone does not end
    // it.
    const acted = combat.attack || combat.shielding || jumped || this.fastFalling || this.technique;
    if (this.tumbling && combat.stun <= 0 && (acted || combat.immobilized)) {
      this.tumbling = false;
    }
    // A launch sequence ends once the fighter is back in ordinary play: on
    // the ground with its stun over, acting again once free (as a tumble
    // ends) or held by a paralysis. Until then a stunned fighter sliding on from
    // a landing may still rebound off a wall, and a hit that launches it
    // again carries the sequence's rebounds on (see startLaunch): past
    // maxBounces it stops at surfaces like anyone until it has recovered.
    if (this.launch && ((body.grounded && combat.stun <= 0) || (combat.stun <= 0 && acted) || combat.immobilized)) {
      this.launch = null;
    }

    // ---- Technique: ground ---------------------------------------------------
    // It needs real ground under the fighter from its first frame to its
    // last: ground lost (a ledge, the main floor's edge, a vanished
    // platform, a pull lifting it) ends it at once and the fighter falls
    // from where it is.
    if (this.technique && !body.grounded) this.endTechnique('ground');

    // ---- Summon startup: ground --------------------------------------------
    // A summon is ground-only to its very cue: ground lost during its
    // startup cancels it (no clone) and the fighter falls from where it is.
    if (this.pendingSummon && !body.grounded) this.cancelSummon();

    // ---- Dash: ground and walls ----------------------------------------------
    // A Dash is grounded only: leaving the ground (a ledge, the main floor's
    // edge) ends it and the fighter falls from where it is, keeping its
    // speed. An air dash is the air's: meeting the ground ends it. Neither
    // passes through a solid: one in the way stops the body and ends it
    // there.
    if (this.dash && (this.dash.air === body.grounded || body.wall === this.dash.direction)) this.endDash();

    // ---- Combat Assist: ground and walls -------------------------------------
    // Its approach counts the time and ground it has covered (see
    // assistIntents). It is grounded only, and never through a solid:
    // leaving the ground or meeting a wall ends it, and its attack never
    // comes.
    const closing = this.combatAssist;
    if (closing) {
      closing.time += dt;
      closing.travelled += Math.abs(body.x - body.prevX);
      if (!body.grounded || body.wall === closing.direction) this.cancelCombatAssist();
    }

    // ---- Energy refill -----------------------------------------------------
    // Every step no Dash or Combat Assist was paid for, a held Shield
    // included, at the one passive rate: nothing held ever makes it faster.
    if (!spent && this.assistPaidAt !== this.steps) combat.updateEnergy(dt);

    // A burst is over once the speed is back to top speed or less.
    if (this.burst && !this.dash && Math.abs(body.vx) <= mv.maxSpeed + TIME_EPSILON) this.burst = false;

    // A buffered press ages only on steps the fighter lives through (never
    // in a freeze) and is gone once it is older than the buffer.
    if (this.bufferedAttack) {
      this.bufferedAttack.age += dt;
      if (this.bufferedAttack.age > mv.attackBuffer + TIME_EPSILON) this.bufferedAttack = null;
    }
    if (this.bufferedDash) {
      this.bufferedDash.age += dt;
      if (this.bufferedDash.age > mv.attackBuffer + TIME_EPSILON) this.bufferedDash = null;
    }

    this.updateFacing(dir, held);
    this.updateState(dt);
  }

  // One step of horizontal steering, with `control` (0-1) of the normal
  // steering and `friction` x the ground deceleration while it is not
  // steering: the shared rule (steer in js/game/fighters/movement.js) with
  // the universal movement values and this fighter's burst.
  moveHorizontal(dir, control, friction, dt) {
    steer(this.body, this.movement, dir, control, friction, dt, this.burst);
  }

  // One step of an attack's own movement: its step-in, then steering with
  // the attack's share of control (steerAttack in
  // js/game/fighters/movement.js).
  moveAttack(atk, dir, dt) {
    steerAttack(this.body, this.movement, this.facing, atk, dir, dt, this.burst);
  }

  // The horizontal speed an attack starting now keeps of `vx` (see
  // attackStartSpeed in js/game/fighters/movement.js).
  attackStartSpeed(atk, vx, grounded) {
    return attackStartSpeed(atk, vx, grounded);
  }

  // Remembers `action`'s press for the combat input buffer: the latest
  // press that may start at all (see attackMayStart) wins, starting its own
  // movement.attackBuffer seconds. Any other press leaves the buffer as it
  // is.
  bufferAttack(action) {
    if (!(this.movement.attackBuffer > 0) || !this.attackMayStart(action)) return;
    this.bufferedAttack = { action, age: 0, at: this.steps };
  }

  // A hit (never a block) just landed on this fighter (see
  // CombatSystem.applyHit): Combat Assist's approach is cancelled; it gets
  // both its air jumps back, so a launch never strands it without them, and
  // its air dashes and once-per-airtime attacks (`airUses`) too; a higher
  // jump (deciding or rising) is over, and so is any burst of its own
  // (whatever speed it has now is the hit's).
  //
  // A launch at launchReaction.tumbleSpeed or faster sets it tumbling; a
  // slower one ends a tumble, and a hit that launches nothing leaves it.
  //
  // A launch also starts a new launch sequence (see js/game/combat/launch-bounce.js):
  // the new launch replaced its velocity, so the sequence takes its heading.
  // Rebounds already made count on until the fighter recovers (startLaunch),
  // so a wall can never keep a combo going. A hit that launches nothing
  // leaves the sequence it is flying in as it is.
  takeHit(event) {
    // Combat Assist's approach is over on the hit itself, its attack never
    // coming, and the hurt pose shows on this very step.
    if (this.combatAssist) {
      this.cancelCombatAssist();
      this.updateState(0);
    }
    this.airJumps = this.movement.airJumps;
    this.airDashes = this.airDashUses;
    this.burst = false;
    this.airAttacks.clear();
    this.freeFall = false;
    this.highJump = null;
    if (event.launchSpeed > 0) {
      this.tumbling = event.launchSpeed >= this.launchReaction.tumbleSpeed;
      this.launch = startLaunch(event.finalLaunch, this.launch);
    }
  }

  // The share of gravity (0-1) under which the higher jump rises from here
  // to top out at movement.highJumpHeight x the normal jump's height above
  // its takeoff (see highJumpLift in js/game/fighters/movement.js).
  highJumpLift(gravity) {
    return highJumpLift(this.body, this.movement, this.highJump.fromY, gravity);
  }

  // Cuts the attack in progress short, if it may be (see
  // CombatState.cancellable): another attack, a jump or a Dash is starting.
  cutAttack() {
    if (this.combat.cancellable) this.combat.endAttack();
  }

  // Free to start an attack (a Deflect included), a jump, a Dash or an air
  // dash: free to act, in an attack that hit and may now be cut short (see
  // CombatState.cancellable), or in a Dash or air dash past its cancel time
  // (see dashCancellable; a new Dash still waits for it to end).
  canFollowUp() {
    return this.canAct() || (this.combat.cancellable && !this.technique && !this.dash) || this.dashCancellable;
  }

  // A Dash or an air dash may be cut short: movement.dashCancelTime into
  // it, by an attack, a Deflect or a jump (an air jump in the air), which
  // carries on from the Dash's speed. Never before: a Dash commits to a
  // moment of itself first.
  get dashCancellable() {
    const d = this.dash;
    return !!d && d.time >= this.movement.dashCancelTime - TIME_EPSILON && this.combat.canAct() &&
      !this.technique && !this.pendingSummon;
  }

  // Free to start something new: the combat state allows it (no attack,
  // stun, blockstun or paralysis), no technique, summon's startup or Combat
  // Assist's approach owns the fighter and it is not dashing (on the ground
  // or in the air). Its Launch Point, however high, and the Energy it has
  // left never matter.
  canAct() {
    return this.combat.canAct() && !this.technique && !this.dash && !this.pendingSummon && !this.combatAssist;
  }

  // A hit landing now would meet a perfect Shield: one raised no more than
  // defense.perfectWindow seconds ago, after being down for at least
  // perfectRearm. It blocks for free, with no blockstun (see
  // CombatSystem.applyHit).
  get perfectShield() {
    const spec = this.defense;
    return !!spec && this.combat.shielding && this.shieldPerfectReady && spec.perfectWindow > 0 &&
      this.shieldUpTime <= spec.perfectWindow + TIME_EPSILON;
  }

  // Whether this fighter may have its Shield up right now: its `defense` is a
  // Shield, it is on the ground (no fighter Shields in the air: the button
  // is its Deflect there, see tryDeflect), it is not exhausted
  // (CombatState.canShield: any Energy left is enough, a block costing more
  // simply empties it) and it has the held art (groundAnimation). Missing
  // art is refused, never faked, and reported once.
  shieldAllowed() {
    const spec = this.defense;
    if (spec?.type !== 'shield' || !this.body.grounded || !this.combat.canShield()) return false;
    const key = spec.groundAnimation;
    // None authored: no Shield, and nothing missing to report.
    if (!key) return false;
    if (this.sprites.has(key)) return true;
    if (!this.missingShieldArt.has(key)) {
      this.missingShieldArt.add(key);
      console.warn(`[Alva] Shield "${key}" has no animation frames; ignoring.`);
    }
    return false;
  }

  // The Dash this step's input asks for (1 right, -1 left, 0 none): a
  // one-step mouvement request (mouvementLeftPressed /
  // mouvementRightPressed; both at once is none), which forgets any first
  // tap waiting, or else a double tap (see trackDashTaps) whose waiting tap
  // ages by `dt`.
  dashAsked(input, dt) {
    if (input.mouvementLeftPressed || input.mouvementRightPressed) {
      this.dashTap = null;
      return (input.mouvementRightPressed ? 1 : 0) - (input.mouvementLeftPressed ? 1 : 0);
    }
    return this.trackDashTaps(input, dt);
  }

  // Double-tap detection on the run press edges (see readDashTap in
  // js/game/fighters/movement.js): a press of the same direction as the one
  // waiting, within movement.dashTapWindow seconds of it, returns its
  // direction (1 right, -1 left); 0 otherwise. The press still waiting is
  // the fighter's own (`dashTap`).
  trackDashTaps(input, dt) {
    const { direction, tap } = readDashTap(this.dashTap, input, this.movement, dt);
    this.dashTap = tap;
    return direction;
  }

  // Starts the mouvment `direction` (1 right, -1 left) asks for, by a double
  // tap or a mouvement button: on the ground the Dash (tryDash), in the air
  // the air dash (tryAirDash). True when one started.
  tryMouvment(direction, input = NEUTRAL_INPUT) {
    if (!direction) return false;
    return this.body.grounded ? this.tryDash(direction, input) : this.tryAirDash(direction);
  }

  // Air dashes the fighter may make per airtime (movement.airDashUses),
  // given back on landing and by a hit as its air jumps are.
  get airDashUses() {
    return this.movement.airDashUses;
  }

  // The speed a Dash or air dash toward `direction` goes at: `speed`, or
  // the fighter's own speed that way if it is already faster. A Dash never
  // slows anyone down.
  dashSpeedToward(direction, speed) {
    return Math.max(speed, this.body.vx * direction);
  }

  // Starts one Dash toward `direction` (1 right, -1 left): a short grounded
  // burst at movement.dashSpeed (or faster: see dashSpeedToward) for
  // movement.dashDuration, its mouvment clip played once across it.
  // Movement only: no hitbox, damage, launch or invulnerability. Only while
  // free to act (no attack, stun, paralysis, technique or Dash already
  // running) or in an attack that hit and may be cut short (see
  // CombatState.cancellable: a Dash chases what it sent flying), grounded,
  // not shielding or holding `shield` for a Shield it may raise, and not
  // exhausted, paying dashCost, or dashCancelCost for one that cuts an
  // attack short (all that is left, emptying the bar, when that is less):
  // the extra is what keeps a hit-Dash-hit chase from looping. Down held
  // never matters. The fighter faces the Dash at once, and carries a burst
  // (see `burst`) from it. False, with nothing spent and the attack left as
  // it is, if it cannot start (a missing dash clip is logged). `input` is
  // this step's (Shield held rules it out); any caller (a future AI too)
  // may use it.
  tryDash(direction, input = NEUTRAL_INPUT) {
    const speed = this.movement.dashSpeed;
    if (!speed || !direction || this.dash) return false;
    if (!this.canFollowUp() || !this.body.grounded) return false;
    if (this.combat.shielding || (input.shield && this.shieldAllowed())) return false;
    // Never a fast run passed off as a Dash: require real mouvment frames.
    if (!this.dashDuration || !this.sprites.has('mouvment')) {
      console.warn('[Alva] Dash has no mouvment animation frames; ignoring.');
      return false;
    }
    const cutting = !!this.combat.attack;
    if (!this.combat.spendEnergy(cutting ? this.energyDef.dashCancelCost : this.energyDef.dashCost)) return false;
    this.cutAttack();
    const burst = this.dashSpeedToward(direction, speed);
    this.dash = { direction, time: 0, duration: this.dashDuration, speed: burst, air: false, animation: 'mouvment' };
    this.facing = direction;
    this.burst = true;
    this.body.vx = direction * burst;
    // Every Dash plays its clip from the first frame, even straight after
    // another one.
    this.animator.play('mouvment', { restart: true });
    return true;
  }

  // Starts one air dash toward `direction` (1 right, -1 left): the
  // fighter's mid-air mouvment, apart from its Dash. Straight across at
  // movement.airDashSpeed (or faster: see dashSpeedToward), no fall (its
  // vertical speed zeroed as it starts, gravity held off throughout), for
  // movement.airDashDuration, its midair_mouvment clip played once across
  // it, facing that way at once. Movement only: no hitbox, damage, launch,
  // invulnerability, Shield or Deflect. airDashUses per airtime (see
  // airDashUses), never chained further. The same rules as a Dash
  // otherwise: free to act or in an attack that may be cut short, not
  // exhausted, paying dashCost (dashCancelCost for a cut), never while
  // stunned, paralyzed or already dashing; and, as an attack's own motion,
  // never while still flying from a launch (see Fighter.launch: it would
  // wipe the launch out) or in free fall. False, with nothing spent, if it
  // cannot start (missing midair_mouvment art is logged, never faked with
  // another clip).
  tryAirDash(direction) {
    const speed = this.movement.airDashSpeed;
    if (!(speed > 0) || !direction || this.body.grounded || this.dash) return false;
    if (!this.canFollowUp() || this.airDashes <= 0 || this.freeFall || this.launch) return false;
    if (!this.airDashDuration || !this.sprites.has('midair_mouvment')) {
      console.warn('[Alva] Air dash has no midair_mouvment animation frames; ignoring.');
      return false;
    }
    const cutting = !!this.combat.attack;
    if (!this.combat.spendEnergy(cutting ? this.energyDef.dashCancelCost : this.energyDef.dashCost)) return false;
    this.cutAttack();
    this.airDashes--;
    const burst = this.dashSpeedToward(direction, speed);
    this.dash = { direction, time: 0, duration: this.airDashDuration, speed: burst, air: true, animation: 'midair_mouvment' };
    this.facing = direction;
    this.highJump = null;
    this.burst = true;
    this.body.vx = direction * burst;
    this.body.vy = 0;
    this.animator.play('midair_mouvment', { restart: true });
    return true;
  }

  // Ends the Dash or air dash in progress, if any: run to its end, cut short
  // by an attack, a Deflect or a jump, or stopped by a hit, a wall or the
  // ground (lost, for a Dash). The fighter keeps whatever speed it has:
  // the normal movement takes over from there, the burst bleeding off as
  // overspeed does (see steer in js/game/fighters/movement.js).
  endDash() {
    this.dash = null;
  }

  // ---- Combat Assist (measurements: js/game/combat/combat-assist.js) --------

  // Whether this fighter has Combat Assist: only a human player's, by its
  // controller (kind 'player', with the player's setting on: see
  // PlayerController). A CPU's controller, the training dummy's lack of one
  // and any other kind never have it, whatever the fighter, slot or label.
  get combatAssistOn() {
    const c = this.controller;
    return c?.kind === 'player' && c.combatAssist === true;
  }

  // Starts Combat Assist's approach for `action`'s attack `atk` instead of
  // the attack itself, if it should (tryAction has checked the attack may
  // start now): the fighter has it (combatAssistOn), `atk` is melee
  // (isMeleeAttack: never a projectile attack, a pending one, a summon, a
  // technique or the Deflect, which is never a combat button's), the
  // fighter is on the ground and free to act (never cutting an attack or a
  // Dash short), its opponent is in play, and the attack's box is out of
  // reach of it but within one Dash's travel (approachDistance: on its
  // level, ahead of it, never through it), with the ground carrying it
  // there (approachClear). Then it pays dashCost (as a Dash does: never
  // while exhausted), faces the opponent, carries a burst (see `burst`) and
  // plays its mouvment clip from the first frame. Anything else (in reach
  // already, too far, no mouvment art, no Energy) is false with nothing
  // spent, and the attack starts where the fighter stands, as ever.
  tryCombatAssist(action, atk) {
    if (!this.combatAssistOn || !isMeleeAttack(atk) || !this.canAct() || !this.body.grounded || this.combat.shielding) return false;
    const foe = this.opponent;
    if (!foe || foe.lostToVoid) return false;
    const range = assistRange(this);
    if (!range || !this.sprites.has('mouvment')) return false;
    const direction = Math.sign(foe.body.x - this.body.x) || this.facing;
    const need = approachDistance(this, atk, foe, direction, range);
    if (!(need > 0 && need < Infinity) || !approachClear(this, this.stage, direction, need)) return false;
    if (!this.combat.spendEnergy(this.energyDef.dashCost)) return false;
    this.combatAssist = { action, attack: atk, target: foe, direction, need, travelled: 0, time: 0 };
    this.assistPaidAt = this.steps;
    this.facing = direction;
    this.burst = true;
    this.animator.play('mouvment', { restart: true });
    return true;
  }

  // This step's presses while the approach runs, before anything else reads
  // them, then the approach's own step (stepCombatAssist). The first that
  // applies takes the step:
  //   - a jump, a Dash (a double tap or a mouvement button) or the Shield
  //     (pressed, or held where it may go up) cancels it, and goes through
  //     its own rules on this same step; a combat button pressed with it is
  //     dropped. In the air (only if something lifted the fighter since its
  //     last step) the `shield` press is its Deflect, as ever.
  //   - else the first combat button pressed: a melee attack for the ground
  //     replaces the attack the approach ends in (no new cost), unless it
  //     cannot start (its cooldown, no art), which cancels the approach
  //     with nothing in its place, never the older attack; any other move
  //     (a projectile attack, a pending one, a summon, a technique) cancels
  //     it and is tried at once as a press of its own; a reserved button
  //     does nothing, as ever.
  // The attack the approach serves is never put in the combat buffer, so a
  // replaced or cancelled one never comes out later.
  assistIntents(input, held, shieldHeld, dashDirection) {
    if (input.jumpPressed || dashDirection || input.shieldPressed || shieldHeld) {
      this.cancelCombatAssist();
      if (!this.body.grounded && input.shieldPressed && this.tryDeflect(held)) this.bufferedAttack = null;
      return;
    }
    for (const action of COMBAT_ACTIONS) {
      if (!input[`${action}Pressed`]) continue;
      const special = specialAction(this.def, action);
      const id = special ? null : this.attackFor(action, true);
      const atk = id ? this.attacks[id] : null;
      if (!special && !atk) continue;
      if (isMeleeAttack(atk)) {
        if (this.combat.cooldowns.has(id) || !atk.animation || !this.sprites.has(atk.animation)) {
          this.cancelCombatAssist();
          return;
        }
        this.combatAssist.action = action;
        this.combatAssist.attack = atk;
        break;
      }
      this.cancelCombatAssist();
      if (this.tryAction(action, held)) this.bufferedAttack = null;
      else this.bufferAttack(action);
      return;
    }
    this.stepCombatAssist(held);
  }

  // One step of the approach, once this step's presses have had their say.
  // It ends with nothing more if anything has made it impossible (the
  // fighter hit, held, off the ground or busy, its input locked, its target
  // gone, lost to the Void or replaced). Its attack starts (see
  // finishCombatAssist) once the attack's box reaches the target, or where
  // the fighter stands once the approach can get no closer (a Dash's travel
  // or time spent, the target off its level or behind it: it may whiff, as
  // a press out of reach does). Otherwise it plans this step's move, the
  // distance still to go, which the ground must carry: a wall or a ledge in
  // the way stops the fighter there and ends it.
  stepCombatAssist(held) {
    const a = this.combatAssist;
    const foe = this.opponent;
    const busy = !this.combat.canAct() || this.combat.shielding || this.technique || this.pendingSummon || this.dash;
    if (!foe || foe !== a.target || foe.lostToVoid || this.inputLocked || !this.body.grounded || busy) {
      this.cancelCombatAssist();
      return;
    }
    const left = assistRange(this) - a.travelled;
    const need = a.time < this.dashDuration - TIME_EPSILON ? approachDistance(this, a.attack, foe, a.direction, left) : Infinity;
    if (!(need > 0 && need < Infinity)) {
      this.finishCombatAssist(held);
      return;
    }
    if (!approachClear(this, this.stage, a.direction, need)) {
      this.cancelCombatAssist();
      this.body.vx = 0;
      return;
    }
    a.need = need;
  }

  // The approach is over, its target reached or as close as it gets: it
  // stops where it is and the attack it served starts there by the ordinary
  // rules (tryAction, never another approach): its own timing, hitbox and
  // motion, held direction and all. One that cannot start now is not
  // started, nor kept for later.
  finishCombatAssist(held) {
    const { action } = this.combatAssist;
    this.combatAssist = null;
    this.body.vx = 0;
    if (this.tryAction(action, held, false)) this.bufferedAttack = null;
  }

  // Ends the approach in progress, if any, and its attack with it: never
  // started, never kept in the combat buffer. A jump, a Dash, the Shield,
  // a Deflect or another move; a hit or a paralysis; the ground lost or a
  // wall; its target gone; a reset, a respawn or the arena going. The
  // Energy it paid is not given back, and the fighter keeps whatever speed
  // it has, as after a Dash.
  cancelCombatAssist() {
    if (!this.combatAssist) return;
    this.combatAssist = null;
    this.bufferedAttack = null;
  }

  // Starts the fighter's Deflect (its `deflect` entry, see
  // js/game/combat/deflect.js), turned to `dir` if one is held: the shared
  // `shield` input's move in the air, an attack in every way (its phases,
  // its strike, its cooldown; see startAttack), never a Shield. Only in the
  // air, only while free to act or in an attack that may be cut short (see
  // canFollowUp: never a Dash, a stun, a paralysis or a technique, never
  // cutting short another attack that may not be), never into itself, never
  // while its cooldown runs or the airtime rules out an attack (free fall,
  // its `airUses`), and only with its art (missing art is reported once and
  // refused). True when it started.
  tryDeflect(dir = 0) {
    const atk = this.deflect;
    const combat = this.combat;
    if (!atk || this.body.grounded || combat.attack?.def === atk) return false;
    if (!this.canFollowUp() || combat.cooldowns.has(atk.id) || this.airStartBlocked(atk)) return false;
    if (!this.sprites.has(atk.animation)) {
      if (!this.missingDeflectArt) console.warn(`[Alva] Deflect "${atk.animation}" has no animation frames; ignoring.`);
      this.missingDeflectArt = true;
      return false;
    }
    combat.lastIntent = 'shield';
    this.startAttack(atk, dir);
    return true;
  }

  // Starts `action`'s summon or technique (`special`, its { type, id } in
  // `actions`; see js/data/loadout.js): a summon (see trySummon), or a
  // technique such as #0001's Unlimited Void or Hollow Purple (see
  // tryTechnique).
  // Only on the ground, only while free to act (never cutting an attack
  // short) and never while its own cooldown runs: a press then does nothing
  // at all, no other attack instead and nothing kept for later. `dir` is
  // the direction held on this step: a technique faces it as it starts, as
  // an attack does. True when it started.
  trySpecial(action, special, dir = 0) {
    if (!this.body.grounded || !this.canAct() || this.combat.abilityCooldowns.active(special.id)) return false;
    if (special.type === 'summon') return this.trySummon(special.id);
    if (special.type === 'technique') return this.tryTechnique(action, special.id, dir);
    console.warn(`[Alva] ${action} has an unknown action type "${special.type}"; ignoring.`);
    return false;
  }

  // Summon `id` at the opponent: starts its cooldown, then either queues the
  // summon for the battle to spawn at once (no startupAnimation: the
  // fighter performs nothing and is free at once) or starts its startup
  // (see pendingSummon): from this very step the fighter plays
  // startupAnimation once, standing still in the facing it has now, free to
  // do nothing else, and the summon is queued as it ends (finishSummon).
  // False, with no cooldown started and nothing played, if there is no such
  // summon, there is no opponent in play (none at all, or one lost to the
  // Void and waiting to respawn) or any of its art is missing (logged).
  trySummon(id) {
    const summon = this.summonDefs[id];
    if (!summon || !this.opponent || this.opponent.lostToVoid) return false;
    const problem = summonProblem(this, summon);
    if (problem) {
      console.warn(`[Alva] Summon "${id}" is unavailable: ${problem}; ignoring.`);
      return false;
    }
    // Accepted: its cooldown runs from now, whether or not the startup
    // completes and whether or not the clone hits.
    this.combat.abilityCooldowns.start(id, summon.cooldown);
    const target = this.opponent;
    this.faceAttackTarget();
    if (!summon.startupAnimation) {
      this.summons.push({ id, target });
      return true;
    }
    this.body.vx = 0;
    this.pendingSummon = {
      id, target, animation: summon.startupAnimation, duration: this.sprites.duration(summon.startupAnimation), time: 0,
    };
    return true;
  }

  // The summon's startup is over: its summon is queued for the battle to
  // spawn, at the target it was accepted at, and the fighter is free. If
  // that target is no longer its opponent in play (lost to the Void, taken
  // out of Practice Ground), nothing is: no clone, no other attack in its
  // place and never another target. The cooldown runs on either way.
  finishSummon() {
    const { id, target } = this.pendingSummon;
    this.pendingSummon = null;
    if (target === this.opponent && !target.lostToVoid) this.summons.push({ id, target });
  }

  // Cuts a summon's startup short, if one is under way: a hit, ground lost,
  // its target gone, the Void, a reset or the arena going. No clone comes
  // of it, and its cooldown, started on acceptance, runs on. The fighter's
  // state follows at once (its hurt pose on the hit's own step).
  cancelSummon() {
    if (!this.pendingSummon) return;
    this.pendingSummon = null;
    this.updateState(0);
  }

  // Start technique `id` from `action`, facing `dir` if one is held: the
  // technique owns the fighter from this step (see js/game/combat/technique.js).
  // False, with no cooldown started, if there is no such technique or its
  // art or data is missing (logged).
  tryTechnique(action, id, dir = 0) {
    const def = this.techniqueDefs[id];
    if (!def) return false;
    const problem = techniqueProblem(this, def);
    if (problem) {
      console.warn(`[Alva] Technique "${id}" is unavailable: ${problem}; ignoring.`);
      return false;
    }
    // Started: its cooldown runs from now, whether it lands, misses or is
    // interrupted.
    this.combat.abilityCooldowns.start(id, def.cooldown);
    this.faceAttackTarget(dir);
    this.body.vx = 0;
    this.technique = new Technique({ owner: this, def, action });
    return true;
  }

  // Ends the technique in progress, if any, for `reason`: 'done' (once its
  // release pose has shown), 'ground', 'hit', 'void', 'reset' or 'destroy'.
  // Whatever it has not released yet never is; what it has (a projectile
  // in flight, a burst that landed) stays.
  endTechnique(reason) {
    const t = this.technique;
    if (!t) return;
    t.end(reason);
    this.technique = null;
    this.body.vx = 0;
    this.updateState(0);
  }

  // Starts the move mapped to `action`, if it can start now: its summon or
  // technique (see trySpecial), or else its attack. `dir` is the direction
  // held on this step: an attack faces it as it starts (so a turn made on
  // the press step is never stale), and otherwise keeps the fighter's
  // facing. Combat AI uses the current target instead (faceAttackTarget).
  // Starting it cuts short an attack
  // that may be (its hit confirmed; see CombatState.cancellable), though
  // never into itself while its own cooldown would still run. A melee
  // attack just out of reach may start Combat Assist's approach first (see
  // tryCombatAssist; `assist` false never does): true either way.
  tryAction(action, dir = 0, assist = true) {
    const combat = this.combat;
    combat.lastIntent = action;
    const special = specialAction(this.def, action);
    if (special) return this.trySpecial(action, special, dir);
    const attackId = this.attackFor(action);
    if (!attackId) return false; // reserved: wired, but no attack mapped
    const atk = this.attacks[attackId];
    if (!atk || !this.canFollowUp() || combat.cooldowns.has(attackId)) return false;
    // Into itself only once its own cooldown would be over, counted from
    // when it became cancellable.
    if (combat.attack?.def.id === attackId && combat.cancellableFor < atk.cooldown - TIME_EPSILON) return false;
    if (atk.groundOnly && !this.body.grounded) return false;
    if (this.airStartBlocked(atk)) return false;
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
    if (assist && this.tryCombatAssist(action, atk)) return true;
    this.startAttack(atk, dir);
    return true;
  }

  // Starts attack `atk` now (it may: see tryAction and tryDeflect), turned
  // to `dir` if one is held: it cuts short an attack that may be (or a Dash
  // past its cancel time), keeps its share of the speed the fighter had
  // (see attackStartSpeed: all of it unless the attack says otherwise, a
  // Dash's burst included), counts against its starts for this airtime, may
  // spend the airtime, and sets its motion going. `airborne` remembers
  // where it started, for the landing cancel (see update).
  startAttack(atk, dir = 0) {
    const combat = this.combat;
    this.cutAttack();
    if (this.dash) this.endDash();
    this.faceAttackTarget(dir);
    const runningSpeed = this.body.vx;
    this.body.vx = this.attackStartSpeed(atk, this.body.vx, this.body.grounded);
    combat.attack = {
      def: atk, time: 0, hasHit: false, confirmed: false, projectileSpawned: false, stepped: false,
      struck: null, blocked: false, motion: null, airborne: !this.body.grounded,
    };
    if (atk.airUses > 0 && !this.body.grounded) this.airAttacks.set(atk.id, (this.airAttacks.get(atk.id) ?? 0) + 1);
    if (atk.freeFall && !this.body.grounded) this.freeFall = true;
    if (atk.motion) this.startMotion(combat.attack, runningSpeed);
  }

  // Whether `atk` may not start in the air right now: the fighter is in free
  // fall (see `freeFall`), `atk` has used up its starts for this airtime
  // (`airUses`: it may start again once the fighter is back on the ground,
  // or has been hit), or it has a motion of its own and the fighter is still
  // flying from a launch (a motion would cancel the launch: see `motion` in
  // js/game/combat/attacks.js).
  airStartBlocked(atk) {
    if (this.body.grounded) return false;
    if (this.freeFall) return true;
    if (atk.motion && this.launch) return true;
    return atk.airUses > 0 && (this.airAttacks.get(atk.id) ?? 0) >= atk.airUses;
  }

  // ---- Attack motion (see `motion` in js/game/combat/attacks.js) ----------

  // Sets attack `record`'s motion going as it starts: a roll decides its
  // speed now (its own, plus its `keep` share of `runningSpeed`, the speed
  // the fighter had the way it now faces, up to its `maxSpeed`) and takes it
  // as its strike goes live; anything else hangs in the air from this very
  // step.
  startMotion(record, runningSpeed) {
    const spec = record.def.motion;
    const m = {
      done: false, aimed: false, target: null, dirX: this.facing, dirY: 0, dir: this.facing, speed: 0, rolling: false,
    };
    record.motion = m;
    if (spec.type === 'roll') m.speed = Math.min(spec.maxSpeed, spec.speed + spec.keep * Math.max(0, runningSpeed * this.facing));
    else this.body.vy = 0;
  }

  // Whether an attack's motion owns the fighter's body right now.
  get inMotion() {
    const m = this.combat.attack?.motion;
    return !!m && !m.done;
  }

  // One step of attack `atk`'s motion: the velocity it owns, set here. Returns
  // the share of gravity the body falls under this step: none while the
  // motion holds it (a hang, a dash, a plunge, a lift or a hover), all of it
  // otherwise. `dir` is the direction held, for the air steering a plunge
  // or a lift allows (its attack's airControl).
  moveMotion(atk, dir, dt) {
    const { body } = this;
    const spec = atk.def.motion;
    const m = atk.motion;
    const phase = attackPhase(atk.def, atk.time);
    if (spec.type === 'roll') {
      // The curl (the startup) slides on like any planted attack; the roll
      // itself starts as the strike goes live.
      if (phase === 'startup' && !m.rolling) {
        this.moveAttack(atk, dir, dt);
        return 1;
      }
      if (body.wall === m.dir) m.speed = 0;
      if (m.rolling && body.grounded) m.speed = Math.max(0, m.speed - spec.friction * dt);
      m.rolling = true;
      body.vx = m.dir * m.speed;
      return 1;
    }
    if (spec.type === 'hover') {
      // Standing on the air for the whole attack: no fall, the drift
      // steered as the attack allows (its air momentum and control).
      this.moveAttack(atk, dir, dt);
      body.vy = 0;
      return 0;
    }
    if (phase === 'recovery') {
      // Over without contact: a dash keeps `exit` of its velocity, anything
      // else just carries on under gravity.
      m.done = true;
      if (spec.type === 'homing') {
        body.vx *= spec.exit;
        body.vy *= spec.exit;
      }
      if (atk.def.lockMovement) this.moveAttack(atk, dir, dt);
      return 1;
    }
    if (spec.type === 'homing') {
      if (phase === 'startup') {
        // Hanging, the drift braking: the lock-on.
        this.moveHorizontal(0, 0, 1, dt);
        body.vy = 0;
        return 0;
      }
      if (!m.aimed) this.lockOn(m, spec);
      this.aimAt(m);
      body.vx = m.dirX * spec.speed;
      body.vy = m.dirY * spec.speed;
      if (Math.abs(m.dirX) > 1e-6) this.facing = Math.sign(m.dirX);
      return 0;
    }
    this.moveAttack(atk, dir, dt);
    if (phase === 'startup') body.vy = 0;
    else body.vy = spec.type === 'bounce' ? spec.fallSpeed : -spec.speed;
    return 0;
  }

  // A homing dash locking on as it starts: its opponent, if in play, within
  // `range` of the fighter's middle and not behind it, is its target, and
  // the dash heads for it; with none it heads straight ahead. Decided once.
  lockOn(m, spec) {
    m.aimed = true;
    m.target = null;
    m.dirX = this.facing;
    m.dirY = 0;
    const foe = this.opponent;
    if (!foe || foe.lostToVoid) return;
    const [dx, dy] = this.toMiddleOf(foe);
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist <= spec.range && dx * this.facing >= -HOMING_BEHIND) m.target = foe;
  }

  // Re-aims a homing dash at its target's middle, while the target is still
  // in play and not already reached; otherwise it keeps its heading.
  aimAt(m) {
    const foe = m.target;
    if (!foe || foe.lostToVoid) return;
    const [dx, dy] = this.toMiddleOf(foe);
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    m.dirX = dx / dist;
    m.dirY = dy / dist;
  }

  // From this fighter's middle to `other`'s ([dx, dy], world units).
  toMiddleOf(other) {
    const a = this.body;
    const b = other.body;
    return [b.x - a.x, (b.y - b.height / 2) - (a.y - a.height / 2)];
  }

  // After the body moved: a homing dash that reached the ground stops there;
  // a plunge that reached it bounces back up (no landing) and its attack is
  // over, so it can bounce again.
  motionContact(atk) {
    const m = atk.motion;
    if (!m || m.done || !this.body.grounded) return;
    const spec = atk.def.motion;
    if (spec.type === 'homing' && attackPhase(atk.def, atk.time) === 'active') {
      m.done = true;
    } else if (spec.type === 'bounce' && attackPhase(atk.def, atk.time) === 'active') {
      m.done = true;
      this.springUp(spec.rebound);
      this.combat.endAttack();
    }
  }

  // Attack `atk` met an opponent (see CombatSystem.update): `event` is the
  // hit or the block. A homing dash springs off it, `rebound` up and
  // `recoil` back, its air jumps given back by a real hit; a plunge bounces
  // off it and its attack is over; a roll a Shield blocks stops dead and
  // rolls back at `recoil` (one that hits rolls on through).
  attackContact(atk, event) {
    const m = atk.motion;
    if (!m || m.done) return;
    const spec = atk.def.motion;
    if (spec.type === 'homing') {
      m.done = true;
      this.body.vx = -this.facing * spec.recoil;
      this.springUp(spec.rebound);
      if (event.type === 'hit') this.airJumps = this.movement.airJumps;
    } else if (spec.type === 'bounce') {
      m.done = true;
      this.springUp(spec.rebound);
      if (this.combat.attack === atk) this.combat.endAttack();
    } else if (spec.type === 'roll' && event.type === 'block') {
      m.done = true;
      this.body.vx = -m.dir * spec.recoil;
    }
  }

  // Sent upward at `speed`, off whatever it stood on.
  springUp(speed) {
    this.body.vy = -speed;
    this.body.grounded = false;
    this.body.ground = null;
  }

  // The hurtboxes that count right now: its attack's own while one says so
  // (a roll's ball), else its own.
  get hurtboxes() {
    return this.combat.attack?.def.hurtboxes ?? this.def.hurtboxes;
  }

  // Passing through other fighters: in an attack that does (see
  // separateFighters).
  get passingThrough() {
    return !!this.combat.attack?.def.passThrough;
  }

  // Whether a press of `action` that could not start now may still start
  // once the fighter is free (the combat input buffer keeps only those): it
  // maps to an attack for where the fighter is, and that attack could start
  // here at all (on the ground if ground-only, with its art, and with a
  // start left for this airtime if it has `airUses`). In the air, a press
  // whose ground attack could start once it lands is kept too, so it comes
  // out on touchdown if that is soon enough (a ground-only extra_attack
  // pressed just before landing). Never a reserved button (transform), a
  // button the character does not have, an attack without frames or one
  // used up until the fighter lands.
  attackMayStart(action) {
    if (this.attackStartsWhere(action, this.body.grounded)) return true;
    return !this.body.grounded && this.attackStartsWhere(action, true);
  }

  // Whether `action`'s attack for the ground (`grounded`) or the air could
  // start there at all (see attackMayStart).
  attackStartsWhere(action, grounded) {
    const attackId = this.attackFor(action, grounded);
    const atk = attackId ? this.attacks[attackId] : null;
    if (!atk || (atk.groundOnly && !grounded)) return false;
    if (!grounded && this.airStartBlocked(atk)) return false;
    return !!atk.animation && this.sprites.has(atk.animation);
  }

  // Attack id for a controller action. The character's `actions` entry is a
  // string (one attack), { ground, air } (chosen by whether the fighter is
  // grounded as the button is pressed: attackN / midair_attackN), null
  // (reserved) or missing (no such button).
  attackFor(action, grounded = this.body.grounded) {
    const mapping = this.def.actions?.[action];
    if (!mapping || typeof mapping === 'string') return mapping || null;
    return (grounded ? mapping.ground : mapping.air) || null;
  }

  // Manual facing follows the fighter's own input: the way it is running
  // (once past a small speed on the ground, so a turn does not flicker) or
  // steering in the air (`dir`). In an action of its own (an attack or the
  // Shield) the direction held (`held`) turns it at once, left to right or
  // right to left, as often as it likes: whatever the action does from then
  // goes the new way (the hitbox, the attack's step-in, a projectile not yet
  // thrown). A Dash sets it as it starts (tryDash), and so does an attack or
  // a technique started with a direction held (tryAction); a spawn or
  // respawn takes the spawn's. Otherwise it keeps its last facing: it never
  // turns toward its opponent by itself, standing still included, so an
  // opponent crossing behind it stays behind it. Locked while a stun, paralysis,
  // technique, summon's startup, Dash or Combat Assist's approach (facing
  // its target from its first step) plays: none of those is the fighter's
  // to steer; nor is an attack with a motion of its own (a roll, a homing
  // dash, a plunge, a lift). Combat AI opts into attack targeting first;
  // updateAttackFacing separates visual turns from locked motion.
  updateFacing(dir, held) {
    const { body, combat } = this;
    if (this.updateAttackFacing()) return;
    if (combat.stun > 0 || combat.immobilized || this.technique || this.pendingSummon || this.dash || this.combatAssist) return;
    // An attack with a motion of its own never turns (a homing dash faces
    // the way it flies: see moveMotion).
    if (combat.attack?.def.motion) return;
    if (combat.attack || combat.shielding) {
      if (held) this.facing = held;
      return;
    }
    if (dir !== 0 && (Math.abs(body.vx) > 20 || !body.grounded)) this.facing = dir;
  }

  // Only the attacking combat controller supplies this orientation. Human
  // and training controllers retain their manual facing rules.
  faceAttackTarget(dir = 0) {
    const target = this.controller?.attackFacing?.(this);
    if (target != null) this.attackVisualFacing = target;
    if (target || dir) this.facing = target || dir;
  }

  // Ordinary attacks turn their hitboxes and unreleased projectiles with
  // the sprite. Motion attacks and techniques keep their physical facing;
  // only their artwork turns, leaving their committed motion/hits intact.
  updateAttackFacing() {
    const { combat } = this;
    if ((!combat.attack && !this.technique && !this.pendingSummon) || combat.stun > 0 || combat.immobilized) {
      this.attackVisualFacing = null;
      return false;
    }
    const target = this.controller?.attackFacing?.(this);
    if (target == null) return false;
    this.attackVisualFacing = target;
    if (!combat.attack?.def.motion && !this.technique) this.facing = target;
    return true;
  }

  // Visual state only: nothing here feeds back into movement or collision.
  // The land and Shield-release poses never hold anyone: running (a
  // direction held, or sliding fast) goes straight past them, and anything
  // of higher priority (a jump, an attack, a Dash, the Shield) ends them.
  updateState(dt) {
    const { body, combat } = this;
    const running = (this.moveDir !== 0 && Math.abs(body.vx) > 20) || Math.abs(body.vx) > 140;
    let next;
    if (combat.stun > 0) next = 'hitstun';
    else if (this.technique) next = 'technique';
    else if (combat.immobilized) next = 'bound';
    else if (this.pendingSummon) next = 'summon';
    else if (combat.attack) next = 'attack';
    else if (this.dash) next = 'dash';
    else if (this.combatAssist) next = 'assist';
    else if (combat.shielding) next = 'shield';
    else if (this.tumbling && !body.grounded) next = 'tumble';
    else if (!body.grounded) next = body.vy < 0 ? 'jump' : 'fall';
    else if (running) next = 'run';
    else if (this.isLanding(dt)) next = 'land';
    else if (this.isReleasingShield(dt)) next = 'shieldRelease';
    else next = 'idle';

    // An air jump starts the jump clip over, even straight out of another
    // rise.
    const restart = next === 'jump' && this.airJumped;
    if (next !== this.state || restart) {
      this.state = next;
      this.stateTime = 0;
    } else {
      this.stateTime += dt;
    }

    this.animator.play(this.animationFor(next), { restart });
    if (next === 'run') {
      // The clip's own rate at top speed, following the speed: down to its
      // minSpeedScale, and faster still above top speed (a Dash's burst run
      // on), up to its maxSpeedScale, so the stride keeps up with the body.
      const anim = this.animator.anim;
      const ratio = Math.abs(body.vx) / this.maxSpeed;
      this.animator.setSpeed(clamp(ratio, anim?.minSpeedScale ?? 1, anim?.maxSpeedScale ?? RUN_MAX_SPEED_SCALE));
    } else if (next === 'dash' || next === 'assist') {
      // One pass of the Dash's (or air dash's) clip across the whole Dash,
      // whatever its frame count and rate; Combat Assist's approach plays
      // the Dash's clip at the Dash's rate, for as long as it lasts.
      const clip = next === 'dash' ? this.dash.animation : 'mouvment';
      const duration = next === 'dash' ? this.dash.duration : this.dashDuration;
      const pass = this.sprites.duration(clip);
      this.animator.setSpeed(pass > 0 && duration > 0 ? pass / duration : 1);
    } else {
      this.animator.setSpeed(1);
    }
    this.animator.update(dt);
  }

  // Animation key for a visual state. An attack plays its own clip for its
  // whole length, even if the fighter lands or leaves the ground meanwhile.
  // Hitstun, and being held by a paralysis (the `bound` state), show `hurt` on the ground and
  // `midair_hurt` in the air. A technique plays the clip of its current
  // phase, a summon's startup its summon's own startupAnimation, a Dash
  // and Combat Assist's approach play `mouvment` and an air dash
  // `midair_mouvment`. A Deflect is an
  // attack: its own clip. The Shield (on the ground only) shows its held
  // pose, opening with `groundStartAnimation` for one frame as it goes up;
  // the shieldRelease state is `groundReleaseAnimation`.
  animationFor(state) {
    if (state === 'attack') return this.combat.attack.def.animation;
    if (state === 'shield') {
      const spec = this.defense;
      const raising = this.stateTime < this.shieldStartDuration - TIME_EPSILON;
      return raising ? spec.groundStartAnimation : spec.groundAnimation;
    }
    if (state === 'shieldRelease') return this.defense.groundReleaseAnimation;
    if (state === 'technique') return this.technique.animation;
    if (state === 'summon') return this.pendingSummon.animation;
    if (state === 'hitstun' || state === 'bound') return this.body.grounded ? 'hurt' : 'midair_hurt';
    if (state === 'tumble') return 'midair_hurt';
    if (state === 'dash') return this.dash.animation;
    if (state === 'assist') return 'mouvment';
    return state;
  }

  // Touchdown starts the land state (a pose only); it then lasts one pass of
  // the land clip while grounded and still. Anything with higher priority (a
  // run, a new jump included) ends it.
  isLanding(dt) {
    if (!this.landDuration) return false;
    if (this.body.landed) return true;
    return this.state === 'land' && this.stateTime + dt < this.landDuration;
  }

  // A Shield lowered on the ground (`shield` let go, or its Energy gone)
  // starts the shieldRelease state; it then lasts one pass of the lower
  // pose while nothing of higher priority takes over. Dropped by leaving
  // the ground it has no pose: the fighter goes straight to jump or fall.
  isReleasingShield(dt) {
    if (!this.shieldReleaseDuration) return false;
    if (this.state === 'shield') return this.body.grounded;
    return this.state === 'shieldRelease' && this.stateTime + dt < this.shieldReleaseDuration - TIME_EPSILON;
  }

  // Whether the current frame is drawn mirrored. Each clip knows which way its
  // own artwork faces (`sourceFacing`, per animation, else the character's),
  // so a clip drawn facing left is mirrored when the fighter faces right.
  // Rendering only: `facing`, movement and every hurtbox / hitbox are
  // unaffected.
  get spriteFlip() {
    const sourceFacing = this.animator.anim?.sourceFacing ?? this.def.sourceFacing ?? 1;
    const attacking = this.combat.attack || this.technique || this.pendingSummon;
    return (attacking ? this.attackVisualFacing ?? this.facing : this.facing) !== sourceFacing;
  }

  // Interpolated position for rendering between fixed steps.
  interpolate(alpha) {
    const b = this.body;
    this.renderX = b.prevX + (b.x - b.prevX) * alpha;
    this.renderY = b.prevY + (b.y - b.prevY) * alpha;
  }
}
