// Fighter entity: physics body + state machine + combat state + animator.
// Behaviour is driven entirely by the character definition and whatever
// controller (player / AI) feeds it input.
//
// Purpose: the one runtime fighter every mode uses, for every character.
// It owns the fighter's state (its body, Dash and air dash, jumps, Shield,
// attack in progress (its Deflect included), summon startup, technique,
// launch sequence, facing) and the order in which each fixed step updates
// it (Fighter.update).
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
// js/game/fighters/movement.js, attack / defense / Energy schemas in
// js/game/combat/, Automatic turn-around's targeting in
// js/game/fighters/turn-around.js, and nothing here names a fighter or a
// button's role: a summon or technique is whatever the character's
// `actions` say it is. The cancellation rules are everyone's alike, human
// or CPU (see moveYields and canFollowUp): an attack that can harm plays
// out unless an authored, hit-confirmed window opens; a move that harms
// nobody, and the Deflect, give way to any valid request. Automatic
// turn-around is the human player's only: its controller says so (kind
// 'player', with automaticTurnAround on), never a slot, a label or a
// fighter. The simulation is
// fixed-step and deterministic; rendering reads it (interpolate,
// spriteFlip) and never feeds back.

import { createAnimator } from '../rendering/ensemble.js';
import { createBody, stepBody, dropThrough, separate, carryBody } from '../physics.js';
import { startLaunch, bounceLaunch, resolveLaunchBounce } from '../combat/launch-bounce.js';
import { attackPhase, createAttackDefinition } from '../combat/attacks.js';
import { createDefenseDefinition } from '../combat/defense.js';
import { createDeflectDefinition } from '../combat/deflect.js';
import { CombatState, resolveEnergy } from '../combat/combat-state.js';
import { FLOAT_RISE_SPEED } from '../combat/hit-effects.js';
import { resolveLaunchReaction } from '../combat/combat.js';
import { createProjectileDefinition } from '../combat/projectile.js';
import { createSummonDefinition, summonProblem } from '../combat/summon.js';
import { Technique, createTechniqueDefinition, techniqueProblem } from '../combat/technique.js';
import { BASE_FIGHTER_MOVEMENT } from '../../data/movement.js';
import { specialAction } from '../../data/loadout.js';
import { COMBAT_BUTTONS } from '../../config.js';
import { blankInput } from './fighter-controller.js';
import { closestEnemy, facingToward } from './turn-around.js';
import { approach, clamp } from '../../core/utils.js';
import {
  steer, attackDrift, activationStep, attackStartSpeed, hitstunDrag, fastFallVelocity, airJump, highJumpLift,
} from './movement.js';

// The combat buttons, by control codename (COMBAT_BUTTONS in js/config.js):
// extra_attack and attack1 to attack5. Each maps to a move
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

// Where a snapshot's combat presses were made for: 'ground' or 'air' when
// a game controller resolved them for one place (its ground and air moves
// may share a combat button: see js/core/controller-resolver.js), else
// null (a keyboard, touch or a CPU: the press is the button's, wherever
// the fighter is).
export function pressPlace(input) {
  if (input.pressedOnGround) return 'ground';
  if (input.pressedInAir) return 'air';
  return null;
}

// The fastest the run clip plays (x its own rate) by default, above top
// speed: a burst's run-on looks as fast as it goes (a clip may say
// otherwise with its own maxSpeedScale). Art only.
const RUN_MAX_SPEED_SCALE = 1.6;

// Sideways speed (units/s) above which a fighter on the ground counts as
// running for its facing: a run turns it past this, and Automatic
// turn-around waits until a run or a Dash has slid down to it.
const TURN_SPEED = 20;

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
// A fighter a pull is drawing toward the fighter that owns it, or that is
// still carried toward it, helpless, on that pull's speed (see
// Fighter.drawnBy), never pushes that fighter: it stops against its body,
// its speed toward it gone, and the fighter that drew it in holds its
// ground.
export function separateFighters(a, b, stage) {
  if (a.ricocheting || b.ricocheting || a.passingThrough || b.passingThrough) return;
  const drawn = b.drawnBy === a ? b : a.drawnBy === b ? a : null;
  const aShare = drawn === b ? 0 : drawn === a ? 1 : 0.5;
  if (!separate(a.body, b.body, a.def.pushbox.width / 2, b.def.pushbox.width / 2, stage, aShare) || !drawn) return;
  const puller = drawn === b ? a : b;
  if (drawn.body.vx * Math.sign(puller.body.x - drawn.body.x) > 0) drawn.body.vx = 0;
}

export class Fighter {
  constructor({ def, sprites, spawn, stage, slot, controller, label }) {
    this.def = def;
    this.sprites = sprites;
    this.slot = slot;
    this.label = label;
    this.controller = controller;
    // Its clips' player: one animator, or for a fighter drawn as several
    // members (an `ensemble`, js/data/ensemble.js) every member's at once,
    // still one fighter (see js/game/rendering/ensemble.js).
    this.animator = createAnimator(sprites);
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
    // its own clip. Every move's cooldown is the cooldown policy's
    // (js/data/cooldowns.js), judged with the fighter's own projectiles and
    // attacks (what a throw, a cast or a clone really deals).
    const context = { projectiles: def.projectiles ?? null, attacks: def.attacks ?? null };
    this.attacks = Object.fromEntries(
      Object.entries(def.attacks || {}).map(([id, spec]) => [
        id, createAttackDefinition({ id, ...spec }, { clipDuration: sprites.duration(spec.animation), projectiles: context.projectiles }),
      ]),
    );
    this.projectileDefs = Object.fromEntries(
      Object.entries(def.projectiles || {}).map(([id, spec]) => [id, createProjectileDefinition({ id, ...spec })]),
    );
    this.summonDefs = Object.fromEntries(
      Object.entries(def.summons || {}).map(([id, spec]) => [id, createSummonDefinition({ id, ...spec }, context)]),
    );
    this.techniqueDefs = Object.fromEntries(
      Object.entries(def.techniques || {}).map(([id, spec]) => [id, createTechniqueDefinition({ id, ...spec }, context)]),
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
    // Energy settings (js/game/combat/combat-state.js resolveEnergy): the
    // universal maximum and costs (a Dash, a Deflect, each blocked hit) and
    // the fighter's own refill rate.
    this.energyDef = resolveEnergy(def.energy, `Character "${def.id}"`);
    // How it responds to being launched (resolveLaunchReaction in
    // js/game/combat/combat.js): longer stun for
    // a harder launch, tumbling past a speed, and how far it may steer one.
    this.launchReaction = resolveLaunchReaction(def.launchReaction);
    // How a launch that drives it into a wall, floor or ceiling rebounds
    // (js/game/combat/launch-bounce.js: LAUNCH_BOUNCE, under the character's own
    // `launchBounce`).
    this.launchBounce = resolveLaunchBounce(def.launchBounce, `Character "${def.id}"`);
    this.opponent = null;
    // The list `enemies` hands out, refilled on every read (no allocation
    // in the fixed step).
    this.enemyList = [];
    this.spawn = spawn;
    this.reset(stage);
  }

  reset(stage) {
    // A technique in progress ends first: nothing of it survives a rematch.
    if (this.technique) this.endTechnique('reset');
    const { def, spawn } = this;
    // The stage it stands on (it was reset or respawned on).
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
    // The fighter whose pull is drawing this one in, or drew it and still
    // carries it, helpless, toward it (see applyPulls in
    // js/game/combat/pull.js): it stops against that fighter rather than
    // pushing it (see separateFighters). Null when none.
    this.drawnBy = null;
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
    // presses in the order they were made (the jump's press step, and each
    // buffered attack's and Dash's) and to tell a request made after the
    // move in progress began from one made before or with it (see
    // moveYields): every move records the step it started on
    // (moveStartedAt).
    this.steps = 0;
    this.jumpPressedAt = -1;
    this.moveStartedAt = -1;
    // The latest combat button press (extra_attack, attack1 to attack5) the
    // fighter could not act on yet ({ action, age, at, place }), tried again
    // every step for movement.attackBuffer seconds (see bufferAttack), or
    // null.
    this.bufferedAttack = null;
    // Likewise the latest Dash (or air dash) asked for that could not start
    // yet ({ direction, age, at }), tried again every step for the same
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
    // air, animation }; see tryDash and tryAirDash), or null.
    this.dash = null;
    // The last step this fighter paid Energy on (a Dash, an air dash, a
    // Deflect or a construct move, see payEnergy): no refill on that step.
    this.energyPaidAt = -1;
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
    // Heals a technique of its own gave it this step ({ amount, ability }:
    // the Launch Points taken off and the technique), for whoever shows
    // them; cleared as each step starts.
    this.heals = [];
    // The art a technique of its own let go of this step (its burst's
    // effect: { animation, x, y, facing }, see Technique.takeEffect), for
    // whoever shows it; cleared as each step starts.
    this.effects = [];
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
    // An ensemble's members start in formation, the way it faces.
    this.animator.snap?.(this.facing);
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
    this.heals.length = 0;
    this.effects.length = 0;
    this.steerHeld.x = (input.runRight ? 1 : 0) - (input.runLeft ? 1 : 0);
    this.steerHeld.y = (input.down ? 1 : 0) - (input.jump ? 1 : 0);
    this.updateAttackFacing();

    // Whether the sideways speed the body has now is the fighter's own (its
    // run, a Dash's burst, an attack's slide: what a Shield raised this step
    // stops, see below): it was free on its last step, nothing has hit it
    // since, and no pull has drawn it since (drawnBy, see
    // js/game/combat/pull.js). A launch's or a stun's slide and a pull's
    // drag are an outside force's.
    const ownSpeed = combat.stun <= 0 && !combat.immobilized && !this.drawnBy;

    // Every cooldown recovers by this step first (the summon's and the
    // technique's too, in real time), so one started below ends the step at
    // its full length.
    combat.update(dt);
    // Hitstun always wins over a technique and a summon's startup
    // (CombatSystem.applyHit normally ends them on the hit itself), and over
    // a Dash or an air dash, as does a paralysis.
    if (this.technique && combat.stun > 0) this.endTechnique('hit');
    if (this.pendingSummon && (combat.stun > 0 || combat.immobilized)) this.cancelSummon();
    if (this.dash && (combat.stun > 0 || combat.immobilized)) this.endDash();
    // A hit (or a paralysis) takes the fighter out of its own attack: nothing of
    // it is left to strike, release a projectile or recover from. Checked
    // here, on the fighter's next step, so two attacks that connect on the
    // same step still trade.
    if (combat.attack && (combat.stun > 0 || combat.immobilized)) combat.interruptAttack();
    // ---- Projectile release ----------------------------------------------
    // The attack crossed its release point this step: queue one projectile,
    // aimed where the fighter faces now. Its direction never changes after.
    if (combat.release) {
      this.releases.push({ id: combat.release.id, offset: combat.release.offset, direction: this.facing, ability: combat.release.ability });
      combat.release = null;
    }
    // Jump presses count from the step they are made, the freeze included,
    // and so do Shield presses on the ground.
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
      // steps (a rebound freezes it at the surface it struck). A frozen
      // fighter standing on a moving platform still rides it (carryBody),
      // drawn moving with it.
      carryBody(body);
      body.prevX = body.x - body.carryX;
      body.prevY = body.y - body.carryY;
      for (const pressed of COMBAT_ACTIONS) {
        const action = input[`${pressed}Pressed`] ? this.pressRequest(pressed) : null;
        if (action) this.bufferAttack(action, pressPlace(input));
      }
      const frozenDash = this.dashAsked(input);
      if (frozenDash) this.bufferDash(frozenDash);
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
    // The Dash this step asks for (see dashAsked). It starts, or waits, in
    // the Dash section below.
    const dashDirection = this.dashAsked(input);

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
    // Every fighter's presses, a human player's or a CPU's, are resolved
    // into requests the same way (see "Requests and cancellation", after
    // bufferAttack): each button asks for its own move, unless it is only
    // the press for the move already playing (repeatsMove: no request, the
    // move plays on); the move starts if its own checks pass and the move
    // in progress allows a follow-up (canFollowUp: free, an authored
    // hit-confirmed window, a Dash past its cancel time, or a move that
    // yields to any request, moveYields); otherwise the buffer keeps it.
    // An attack that can harm is never cut short just because something
    // else was asked for. Run is never a request.
    const canJump = this.coyote > 0 || (!body.grounded && this.airJumps > 0 && !this.freeFall);
    const jumpFirst = (at) =>
      this.jumpBuffer > 0 && canJump && this.jumpPressedAt < at && this.canFollowUp(this.jumpPressedAt) && !shieldHeld;
    // Where this step's presses were made for, if a game controller said
    // (see pressPlace): a press for the ground is never the air's move, nor
    // one for the air the ground's, now or from the buffer.
    const place = pressPlace(input);
    const here = body.grounded ? 'ground' : 'air';
    let started = !body.grounded && !!input.shieldPressed && this.tryDeflect(held);
    if (started) this.bufferedAttack = null;
    for (const pressed of COMBAT_ACTIONS) {
      if (!input[`${pressed}Pressed`] || (place && place !== here)) continue;
      const action = this.pressRequest(pressed);
      if (!action) continue;
      if (shieldHeld || jumpFirst(this.steps)) {
        this.bufferAttack(action, place);
        continue;
      }
      if (this.tryAction(action, held)) {
        this.bufferedAttack = null;
        started = true;
      } else if (!started) {
        // Not a press that lost to another made on this same step.
        this.bufferAttack(action, place);
      }
    }
    const waiting = this.bufferedAttack;
    if ((waiting?.place && waiting.place !== here) || (waiting && this.repeatsMove(waiting.action))) {
      this.bufferedAttack = null;
    } else if (!started && waiting && waiting.at < this.steps && !shieldHeld && !jumpFirst(waiting.at)) {
      const { action } = waiting;
      if (this.tryAction(action, held, { at: waiting.at })) this.bufferedAttack = null;
      else if (!this.attackMayStart(action, waiting.place)) this.bufferedAttack = null;
    }

    // ---- Dash: an explicit mouvement request --------------------------
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
    // any other reason (no Energy, the Shield held, no art, cooldown) is used up:
    // nothing is kept. Energy paid this step (for a Dash, an air dash or a
    // Deflect: see payEnergy) means no refill this step (see the end of
    // update).
    //
    // Every device and the CPU use these one-step requests. Run presses
    // never request movement. Opposing requests on the same step cancel.
    // A Dash cuts short only what canFollowUp allows (an attack that hit,
    // past its hitCancel, or a move that yields: a Deflect, a heal), for
    // the Dash cancel's cost.
    if (dashDirection) this.bufferDash(dashDirection);
    const wantedDash = this.bufferedDash;
    if (wantedDash) {
      // Busy (or dashing still): wait for the first step it can start. In
      // the air one no air dash answers waits too: on touchdown it is the
      // Dash.
      const busy = !this.canFollowUp() || !!this.dash || (!body.grounded && this.dashDuration > 0);
      if (this.tryMouvment(wantedDash.direction, input, wantedDash.at)) {
        this.bufferedDash = null;
      } else if (!busy || !this.movementReady()) {
        this.bufferedDash = null;
      }
    }

    // ---- Technique ---------------------------------------------------------
    // While one runs it owns the fighter: its phases advance on their own
    // clock (it releases as its cast ends, and is over after its release
    // pose), whatever is held.
    if (this.technique) {
      const ended = this.technique.update(dt);
      // A heal it lets go of is this fighter's own Launch Point back, at
      // once (see CombatState.heal), recorded for whoever shows it.
      const heal = this.technique?.takeHeal();
      if (heal > 0) {
        const amount = combat.heal(heal);
        this.heals.push({ amount, ability: this.technique.def.id });
      }
      // Released this step: its cooldown starts now, once (a cast broken
      // before this never starts one).
      if (this.technique?.takeCooldown()) combat.abilityCooldowns.start(this.technique.def.id, this.technique.def.cooldown);
      const effect = this.technique?.takeEffect();
      if (effect) this.effects.push(effect);
      if (ended) this.endTechnique(ended);
    }

    // A fresh Shield press (on the ground, where it may go up) during a move
    // that yields to any request (moveYields: a heal of its own, a pending
    // attack) takes over from it: the move ends and the Shield goes up
    // below, on this same step. An attack that can harm never gives way to
    // the Shield: the press waits for it to end, as a held Shield does.
    if (shieldHeld && input.shieldPressed && this.moveYields()) this.cutAttack();

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
      // A raised Shield plants the fighter: the sideways speed of its own
      // it raised it with (ownSpeed: a run, a Dash's burst, an attack's
      // slide) stops on this very step, never sliding on behind it. Speed
      // an outside force gave it (a pull's drag, a stun's slide) is not its
      // own to stop: it runs down behind the Shield as a block's push does
      // (see the Shield's movement below). A moving platform's carry is no
      // velocity at all (see carryBody).
      if (ownSpeed) body.vx = 0;
    } else if (combat.shielding) {
      this.shieldUpTime += dt;
    }
    if (combat.shielding) this.shieldDownTime = 0;
    else this.shieldDownTime += dt;

    // ---- Platform drop --------------------------------------------------
    // A fresh Down press (S / ↓, the left stick down, the touch Down button)
    // while standing on a one-way platform that lets fighters drop
    // (`dropThrough`, see dropThrough in js/game/physics.js), free to act and
    // with no Shield up, drops the fighter through it: never the main floor
    // or a solid, never a platform that forbids it, never out of an attack,
    // a stun, a paralysis, a technique or a Dash, and never a Down held since
    // before (a fast fall carried into a landing stands on the platform). A
    // jump pressed on the same step still jumps from where it stood. The
    // training CPU asks for the same drop with `dropPressed`.
    if ((input.downPressed || input.dropPressed) && canAct && body.grounded && !combat.shielding) {
      dropThrough(body, mv.dropThroughTime);
    }

    // ---- Horizontal movement ---------------------------------------------
    // See moveHorizontal, and moveAttack while an attack plays (moveMotion
    // while an attack's own motion owns the body, and then the share of
    // gravity it falls under this step). Nothing held steers an attack on
    // the ground, in any phase; in the air every move keeps the universal
    // air control (see attackDrift). A summon's startup holds the fighter still where it stands, as a
    // technique does. An air dash owns the body too: straight across at its
    // speed, no fall.
    const atk = combat.attack;
    let gravityShare = 1;
    let dir = held;
    if (combat.shielding || combat.stun > 0 || combat.immobilized || this.technique || this.dash || this.pendingSummon) dir = 0;
    // Normal locomotion only (the running pose): an attack runs nowhere.
    this.moveDir = atk ? 0 : dir;

    if (this.technique || this.pendingSummon) {
      body.vx = 0;
    } else if (combat.immobilized) {
      body.vx = 0;
      // Floating (a hit's `float`, see CombatState.float): lifted off the
      // ground and rising slowly, with no gravity, for as long as the float
      // lasts; once it ends the paralysis' last moments, if any, fall.
      if (combat.afloat) {
        body.vy = -FLOAT_RISE_SPEED;
        body.grounded = false;
        body.ground = null;
        gravityShare = 0;
      }
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
    } else if (combat.shielding) {
      // A raised Shield holds the fighter where it stands: no walking or
      // running, whatever is held (it still turns: see updateFacing). Speed
      // it is given behind it (a block's push: see CombatSystem.applyHit)
      // runs down under the normal deceleration.
      this.moveHorizontal(0, dt);
    } else if (atk?.motion && !atk.motion.done) {
      gravityShare = this.moveMotion(atk, dir, dt);
    } else if (atk) {
      this.moveAttack(atk, dir, dt);
    } else {
      this.moveHorizontal(dir, dt);
    }

    // ---- Jump (buffered + coyote time) -----------------------------------
    // The press itself was taken in above (the freeze included); it counts
    // down on every step after it.
    if (!input.jumpPressed) this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (body.grounded) this.coyote = mv.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);

    // A jump out of a raised Shield drops it and jumps (the Shield guards
    // nothing in the air) from where the Shield planted it, unless a block
    // holds it up (blockstun): then the press waits in the jump buffer for
    // the stun to end. A jump may also cut short an attack that hit (see
    // CombatState.cancellable), a move that yields to any request when Jump
    // was pressed after it began (see moveYields: a Deflect, a heal), and a
    // Dash or an air dash past its cancel time (see dashCancellable); it
    // only cuts once it really jumps. It only sets the upward speed: whatever horizontal
    // speed the fighter has (a Dash's whole burst included) carries
    // straight into the air, under full gravity from this step. A tap is
    // the normal jump; Jump held a little longer makes it the higher jump
    // (see below).
    const free = (canAct || combat.cancellable || this.dashCancellable || this.moveYields(this.jumpPressedAt)) &&
      !(combat.shielding && combat.shieldStun > 0);
    let jumped = false;
    if (this.jumpBuffer > 0 && this.coyote > 0 && free) {
      this.cutAttack();
      if (this.dash) this.endDash();
      combat.shielding = false;
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
    // Standing on a moving platform (a stage hazard), the fighter is first
    // carried by its movement this step (carryBody: nothing on static
    // ground, nothing in the air, so a jump leaves it behind), then takes
    // its own step from there. It is drawn moving from where it was before
    // the carry, as its platform is.
    carryBody(body);
    stepBody(body, dt, ctx.stage, ctx.gravity * (this.highJump?.lift ?? 1) * gravityShare, body.maxFall);
    body.prevX -= body.carryX;
    body.prevY -= body.carryY;
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
      // Touching the floor in the hang of an attack started in the air (its
      // motion still holding the body: a plunge pressed on the very step
      // the fighter sprang off the floor) is no landing: nothing spent this
      // airtime comes back until it really lands, so a bounce can never
      // loop off the floor.
      if (!(combat.attack?.airborne && this.inMotion)) {
        this.airJumps = mv.airJumps;
        this.airDashes = this.airDashUses;
        this.airAttacks.clear();
        this.freeFall = false;
      }
      this.highJump = null;
      this.tumbling = false;
      // Landing cancel: an attack started in the air whose recovery runs
      // on the ground is over (released already, its cooldown, if any,
      // running), so the fighter acts on touchdown. Its startup and strike
      // play on as ever; its sideways speed carries on as the ground allows.
      // A slam's landing is its recovery: never cancelled so.
      const a = combat.attack;
      if (a?.airborne && combat.phase === 'recovery' && !this.inMotion && !a.motion?.landed) combat.endAttack();
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

    // ---- Energy refill -----------------------------------------------------
    // Every step no Energy was paid on (see payEnergy), a held Shield, a
    // block or a Deflect's strike included, at the one passive rate:
    // nothing held or done ever makes it faster, and no defense, however
    // well timed, gives any back.
    if (this.energyPaidAt !== this.steps) combat.updateEnergy(dt);

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

  // One step of ordinary horizontal locomotion toward `dir`: the shared
  // rule (steer in js/game/fighters/movement.js) with the universal
  // movement values and this fighter's burst.
  moveHorizontal(dir, dt) {
    steer(this.body, this.movement, dir, dt, this.burst);
  }

  // One step of an attack's own horizontal movement: its Step-in, then on
  // the ground its speed running down whatever is held, in the air the
  // universal air control toward `dir` (attackDrift in
  // js/game/fighters/movement.js).
  moveAttack(atk, dir, dt) {
    attackDrift(this.body, this.movement, this.facing, atk, dir, dt, this.burst);
  }

  // The horizontal speed an attack starting now keeps of `vx` (see
  // attackStartSpeed in js/game/fighters/movement.js).
  attackStartSpeed(atk, vx, grounded) {
    return attackStartSpeed(atk, vx, grounded);
  }

  // Remembers `action`'s press for the combat input buffer: the latest
  // press that may start at all (see attackMayStart) wins, starting its own
  // movement.attackBuffer seconds. Any other press leaves the buffer as it
  // is. `place` ('ground' / 'air'), from a game controller, keeps the press
  // for that place only: it never comes out as the other place's move (see
  // pressPlace).
  bufferAttack(action, place = null) {
    if (!(this.movement.attackBuffer > 0) || !this.attackMayStart(action, place)) return;
    this.bufferedAttack = { action, age: 0, at: this.steps, place };
  }

  // ---- Requests and cancellation ------------------------------------------
  //
  // Three parts, kept apart, cooperate on one press (see the combat intents
  // in update), the same for every fighter, a human player's or a CPU's:
  //   The request    each combat button asks for its own move, never
  //                  another's (pressRequest), unless it is only the
  //                  press for the move already playing (repeatsMove).
  //   Cancellation   whether that move, once it may start, may end the
  //                  move in progress (canFollowUp): an authored,
  //                  hit-confirmed window (CombatState.cancellable), a Dash
  //                  past its cancel time (dashCancellable), or a move
  //                  that yields to any request (moveYields). An attack
  //                  that can harm is never cut short otherwise.
  //   The buffer     keeps a request that may not start yet (bufferAttack,
  //                  bufferDash, the jump buffer), until the move in
  //                  progress ends or a window opens.
  // Requests are discrete presses only: a jump, a Dash or air dash
  // (mouvement requests, never Run), a Shield press on the ground, a
  // Deflect, a combat button. Run and every other held direction are
  // locomotion: they never cut, cancel or start anything.

  // Whether this fighter is the human player's (its controller is of kind
  // 'player'): its requests made before a hit are dropped by it (see
  // takeHit), and it may have Automatic turn-around. Never a rule of
  // cancellation, cooldown or Energy: those are everyone's alike.
  get playerControlled() {
    return this.controller?.kind === 'player';
  }

  // A fresh press of `pressed` as the request it makes: its own action, or
  // null when it is the press for the move already playing (repeatsMove),
  // which is no request at all.
  pressRequest(pressed) {
    return this.repeatsMove(pressed) ? null : pressed;
  }

  // Whether a press of combat button `action` is the press for the very
  // attack the fighter is performing: `action`'s attack (where it is now:
  // its ground or mid-air move) is that attack, or `action` is the button
  // that asked for it (Attack 1 pressed again in the air during the ground
  // Attack 1 it carried off a ledge). Such a press never cuts, restarts or
  // buffers that attack: it plays on, whatever its phase, and the press is
  // gone. Once it has finished, the move may be used again. Anyone's.
  repeatsMove(action) {
    const a = this.combat.attack;
    if (!a) return false;
    return this.attackFor(action) === a.def.id || (a.button != null && a.button === action);
  }

  // Whether the move in progress gives way to any valid request made on
  // step `at` (its definition's `freeCancel`, see yieldsToRequests in
  // js/game/combat/offense.js): a move that harms nobody (a technique that
  // only heals, a pending attack) or the Deflect, by explicit rule. Only a
  // request made after that move began (one made with it, on its own step,
  // lost to it), never while a forced state holds the fighter (an impact
  // freeze, hitstun, blockstun, a paralysis), and never a Dash (it keeps
  // its own cancel time, dashCancellable). A damaging attack, a technique
  // or summon that harms never yields: only CombatState.cancellable cuts an
  // attack short. The new move's own checks come first: a request that
  // cannot start never ends anything (see cutAttack). The same for every
  // fighter, human or CPU.
  moveYields(at = this.steps) {
    const { combat } = this;
    if (at <= this.moveStartedAt || this.dash) return false;
    if (combat.hitstop > 0 || combat.stun > 0 || combat.shieldStun > 0 || combat.immobilized) return false;
    if (this.technique) return !!this.technique.def.freeCancel;
    if (this.pendingSummon) return !!this.summonDefs[this.pendingSummon.id]?.freeCancel;
    return !!combat.attack?.def.freeCancel;
  }

  // A hit (never a block) just landed on this fighter (see
  // CombatSystem.applyHit): it gets both its air jumps back, so a launch
  // never strands it without them, and its air dashes and once-per-airtime
  // attacks (`airUses`) too; a higher
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
    // The human player's requests made before the hit are stale: none of
    // them comes out after the stun (presses made from now on are kept as
    // ever).
    if (this.playerControlled) {
      this.bufferedAttack = null;
      this.bufferedDash = null;
      this.jumpBuffer = 0;
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

  // Cuts the move in progress short for a replacement starting now (another
  // attack, a jump, a Dash, the Shield, a summon or a technique), its caller
  // having checked the replacement starts and the move may be cut: an
  // attack that hit and reached its hitCancel (CombatState.cancellable), or
  // a move that yields (moveYields: a Deflect, a heal, a pending attack).
  // Only such a move is ever ended here: anything else is left as it is.
  // Nothing it has not struck or released yet ever is, and no cooldown
  // starts for it (one its release started runs on); its Energy is never
  // given back.
  cutAttack() {
    const { combat } = this;
    if (this.technique) {
      if (this.technique.def.freeCancel) this.endTechnique('cancel');
    } else if (this.pendingSummon) {
      if (this.summonDefs[this.pendingSummon.id]?.freeCancel) this.cancelSummon();
    } else if (combat.attack && (combat.cancellable || combat.attack.def.freeCancel)) {
      combat.endAttack();
    }
  }

  // Free to start an attack (a Deflect included), a jump, a Dash or an air
  // dash for a request made on step `at`: free to act, in an attack that
  // hit and may now be cut short (see CombatState.cancellable), in a Dash
  // or air dash past its cancel time (see dashCancellable; a new Dash still
  // waits for it to end), or in a move that yields to that request (see
  // moveYields). Shared by every fighter's input and the CPU's planning.
  canFollowUp(at = this.steps) {
    return this.canAct() || (this.combat.cancellable && !this.technique && !this.dash) || this.dashCancellable ||
      this.moveYields(at);
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
  // stun, blockstun or paralysis), no technique or summon's startup owns the
  // fighter and it is not dashing (on the ground or in the air). Its Launch
  // Point, however high, and the Energy it has left never matter.
  canAct() {
    return this.combat.canAct() && !this.technique && !this.dash && !this.pendingSummon;
  }

  // A hit landing now would meet a perfect Shield: one raised no more than
  // defense.perfectWindow seconds ago, after being down for at least
  // perfectRearm. It blocks with no blockstun, for the same Energy as any
  // block (see CombatSystem.applyHit).
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

  // Explicit requests only. Run press edges have no role in Mouvement.
  dashAsked(input) {
    return (input.mouvementRightPressed ? 1 : 0) - (input.mouvementLeftPressed ? 1 : 0);
  }

  // The same request selects the ground Dash or air dash, with all their
  // existing costs, restrictions, buffering and cancellation rules. `at` is
  // the step it was asked for (see moveYields).
  tryMouvment(direction, input = NEUTRAL_INPUT, at = this.steps) {
    if (!direction) return false;
    return this.body.grounded ? this.tryDash(direction, input, at) : this.tryAirDash(direction, at);
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

  // Per-action reuse readiness, shared by input and CPU planning: a Dash
  // (or an air dash) may start again movement.dashRepeat after the last one
  // started.
  movementReady(air = !this.body.grounded) {
    return !this.combat.movementCooldowns.active(air ? 'midair_mouvment' : 'mouvment');
  }

  // Cooldown refusals are never buffered, even through impact freeze.
  bufferDash(direction) {
    this.bufferedDash = this.movementReady() ? { direction, age: 0, at: this.steps } : null;
  }

  // Starts one Dash toward `direction` (1 right, -1 left): a short grounded
  // burst at movement.dashSpeed (or faster: see dashSpeedToward) for
  // movement.dashDuration, its mouvment clip played once across it.
  // Movement only: no hitbox, damage, launch or invulnerability. Only while
  // free to act (no attack, stun, paralysis, technique or Dash already
  // running), in an attack that hit and may be cut short (see
  // CombatState.cancellable: a Dash chases what it sent flying) or in a
  // move that yields, asked for on step `at` after it began (moveYields),
  // grounded, not shielding or holding `shield` for a Shield it may raise, and not
  // exhausted, paying DASH_ENERGY_COST (energy.dashCost; dashCancelCost, the
  // same 15, for one that cuts a move short), or all that is left, emptying
  // the bar, when that is less (see payEnergy). Down held
  // never matters. The fighter faces the Dash at once, and carries a burst
  // (see `burst`) from it. False, with nothing spent and the attack left as
  // it is, if it cannot start (a missing dash clip is logged). `input` is
  // this step's (Shield held rules it out); any caller (a future AI too)
  // may use it.
  tryDash(direction, input = NEUTRAL_INPUT, at = this.steps) {
    const speed = this.movement.dashSpeed;
    if (!speed || !direction || this.dash || !this.movementReady(false)) return false;
    if (!this.canFollowUp(at) || !this.body.grounded) return false;
    if (this.combat.shielding || (input.shield && this.shieldAllowed())) return false;
    // Never a fast run passed off as a Dash: require real mouvment frames.
    if (!this.dashDuration || !this.sprites.has('mouvment')) {
      console.warn('[Alva] Dash has no mouvment animation frames; ignoring.');
      return false;
    }
    const cutting = !!this.combat.attack;
    if (!this.payEnergy(cutting ? this.energyDef.dashCancelCost : this.energyDef.dashCost)) return false;
    this.cutAttack();
    const burst = this.dashSpeedToward(direction, speed);
    this.dash = { direction, time: 0, duration: this.dashDuration, speed: burst, air: false, animation: 'mouvment' };
    this.facing = direction;
    this.burst = true;
    this.body.vx = direction * burst;
    // Every Dash plays its clip from the first frame, even straight after
    // another one.
    this.animator.play('mouvment', { restart: true });
    this.combat.movementCooldowns.start('mouvment', this.movement.dashRepeat);
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
  // otherwise: free to act, in an attack that may be cut short or in a
  // move that yields (a Deflect: see moveYields, asked for on step `at`),
  // not exhausted, paying
  // DASH_ENERGY_COST (a cut included), never while
  // stunned, paralyzed or already dashing; and, as an attack's own motion,
  // never while still flying from a launch (see Fighter.launch: it would
  // wipe the launch out) or in free fall. False, with nothing spent, if it
  // cannot start (missing midair_mouvment art is logged, never faked with
  // another clip).
  tryAirDash(direction, at = this.steps) {
    const speed = this.movement.airDashSpeed;
    if (!(speed > 0) || !direction || this.body.grounded || this.dash || !this.movementReady(true)) return false;
    if (!this.canFollowUp(at) || this.airDashes <= 0 || this.freeFall || this.launch) return false;
    if (!this.airDashDuration || !this.sprites.has('midair_mouvment')) {
      console.warn('[Alva] Air dash has no midair_mouvment animation frames; ignoring.');
      return false;
    }
    const cutting = !!this.combat.attack;
    if (!this.payEnergy(cutting ? this.energyDef.dashCancelCost : this.energyDef.dashCost)) return false;
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
    this.combat.movementCooldowns.start('midair_mouvment', this.movement.dashRepeat);
    return true;
  }

  // Pays `cost` Energy for something the fighter starts now (a Dash, an air
  // dash, a Deflect, a construct move: its `energyCost`), if it is not
  // exhausted (CombatState.spendEnergy: all that is left when that is
  // less). A cost of 0 is free: always true, nothing touched. True when
  // paid; the step it was paid on gets no refill (see the end of update).
  // Nothing else the fighter does pays Energy, and one activation pays
  // once.
  payEnergy(cost) {
    if (!(cost > 0)) return true;
    if (!this.combat.spendEnergy(cost)) return false;
    this.energyPaidAt = this.steps;
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

  // Starts the fighter's Deflect (its `deflect` entry, see
  // js/game/combat/deflect.js), turned to `dir` if one is held: the shared
  // `shield` input's move in the air, an attack in every way (its phases,
  // its strike; see startAttack), never a Shield. Only in the air, only
  // while free to act, in an attack that may be cut short or in a move that
  // yields (see canFollowUp: never a Dash, a stun, a paralysis or a
  // technique, never cutting short a damaging attack outside its authored,
  // hit-confirmed window), never into itself (a press for the Deflect
  // already playing restarts nothing), never while its cooldown runs or the airtime rules
  // out an attack (free fall,
  // its `airUses`), and only with its art (missing art is reported once and
  // refused). It pays DEFLECT_ENERGY_COST (energy.deflectCost) as it starts,
  // whatever it then meets (see payEnergy): never while the fighter is
  // exhausted, and nothing it strikes or turns back gives any back. True
  // when it started; false with nothing paid. Once it plays, it yields to
  // any valid request (moveYields): cancelling out of a Deflect is always
  // allowed, cancelling into one only as above.
  tryDeflect(dir = 0, at = this.steps) {
    const atk = this.deflect;
    const combat = this.combat;
    if (!atk || this.body.grounded || combat.attack?.def === atk) return false;
    if (!this.canFollowUp(at)) return false;
    if (combat.cooldowns.has(atk.id) || this.airStartBlocked(atk)) return false;
    if (!this.sprites.has(atk.animation)) {
      if (!this.missingDeflectArt) console.warn(`[Alva] Deflect "${atk.animation}" has no animation frames; ignoring.`);
      this.missingDeflectArt = true;
      return false;
    }
    if (!this.payEnergy(this.energyDef.deflectCost)) return false;
    combat.lastIntent = 'shield';
    this.startAttack(atk, dir);
    return true;
  }

  // Starts `action`'s summon or technique (`special`, its { type, id } in
  // `actions`; see js/data/loadout.js): a summon (see trySummon), or a
  // technique such as #0001's Unlimited Void or Hollow Purple (see
  // tryTechnique).
  // Only on the ground, only while free to act or in a move that yields to
  // a request made on step `at` (moveYields: never cutting a damaging attack
  // short, not even one that hit; the move ended only once this one is
  // accepted), never into itself (its press during its own startup or cast
  // restarts nothing) and never while its own cooldown runs: a press then
  // does nothing at all, no other attack instead and nothing kept for
  // later. `dir` is the direction held on this step: a technique faces it
  // as it starts, as an attack does. True when it started.
  trySpecial(action, special, dir = 0, at = this.steps) {
    if (!this.body.grounded || !(this.canAct() || this.moveYields(at))) return false;
    if (this.technique?.def.id === special.id || this.pendingSummon?.id === special.id) return false;
    if (this.combat.abilityCooldowns.active(special.id)) return false;
    if (special.type === 'summon') return this.trySummon(special.id);
    if (special.type === 'technique') return this.tryTechnique(action, special.id, dir);
    console.warn(`[Alva] ${action} has an unknown action type "${special.type}"; ignoring.`);
    return false;
  }

  // Summon `id` at the opponent: pays its Energy (its `energyCost`: 15 for
  // an ordinary summon, its clone a construct; none for one with a special
  // cooldown), then either queues the summon for the battle to spawn at
  // once (no startupAnimation: the fighter performs nothing and is free at
  // once) or starts its startup (see pendingSummon): from this very step the
  // fighter plays startupAnimation once, standing still in the facing it
  // has now, free to do nothing else, and the summon is queued as it ends
  // (finishSummon). Its cooldown starts only as its clone appears
  // (spawnClones). False, with nothing paid and nothing played, if there is
  // no such summon, there is no opponent in play (none at all, or one lost
  // to the Void and waiting to respawn), any of its art is missing (logged)
  // or it costs Energy the exhausted fighter cannot pay.
  trySummon(id) {
    const summon = this.summonDefs[id];
    if (!summon || !this.opponent || this.opponent.lostToVoid) return false;
    const problem = summonProblem(this, summon);
    if (problem) {
      console.warn(`[Alva] Summon "${id}" is unavailable: ${problem}; ignoring.`);
      return false;
    }
    // Accepted: its Energy is paid now, once, whether or not the startup
    // completes. A move it cuts short (one that yields, see trySpecial) ends
    // now.
    if (!this.payEnergy(summon.energyCost)) return false;
    this.cutAttack();
    this.moveStartedAt = this.steps;
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
  // place and never another target, and so no cooldown.
  finishSummon() {
    const { id, target } = this.pendingSummon;
    this.pendingSummon = null;
    if (target === this.opponent && !target.lostToVoid) this.summons.push({ id, target });
  }

  // Cuts a summon's startup short, if one is under way: a hit, ground lost,
  // its target gone, the Void, a reset, the arena going, or a request it
  // yields to (see cutAttack). No clone comes of it, so no cooldown starts;
  // its Energy is not given back. The fighter's state follows at once (its
  // hurt pose on the hit's own step).
  cancelSummon() {
    if (!this.pendingSummon) return;
    this.pendingSummon = null;
    this.updateState(0);
  }

  // Start technique `id` from `action`, facing `dir` if one is held: the
  // technique owns the fighter from this step (see js/game/combat/technique.js),
  // paying its Energy now (its `energyCost`: 15 for an ordinary technique
  // that releases a projectile or a burst). Its cooldown starts only as it
  // releases (see update). False, with nothing paid, if there is no such
  // technique, its art or data is missing (logged) or it costs Energy the
  // exhausted fighter cannot pay.
  tryTechnique(action, id, dir = 0) {
    const def = this.techniqueDefs[id];
    if (!def) return false;
    const problem = techniqueProblem(this, def);
    if (problem) {
      console.warn(`[Alva] Technique "${id}" is unavailable: ${problem}; ignoring.`);
      return false;
    }
    // Started: its Energy is paid now, once. A move it cuts short (one that
    // yields, see trySpecial) ends now.
    if (!this.payEnergy(def.energyCost)) return false;
    this.cutAttack();
    this.moveStartedAt = this.steps;
    this.faceAttackTarget(dir);
    this.body.vx = 0;
    this.technique = new Technique({ owner: this, def, action });
    return true;
  }

  // Ends the technique in progress, if any, for `reason`: 'done' (once its
  // release pose has shown), 'ground', 'hit', 'void', 'reset', 'destroy' or
  // 'cancel' (a request it yields to, see cutAttack).
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
  // facing; a fighter whose attacks are aimed for it (a CPU's target, the
  // human player's Automatic turn-around: see faceAttackTarget) faces that
  // way instead. Starting it cuts short only a move that may be cut: an
  // attack that hit and reached its hitCancel (CombatState.cancellable) or
  // a move that yields to this request, made on step `at` (moveYields: a
  // Deflect, a heal, a pending attack), and only once every check below has
  // passed: a request that cannot start never cuts anything. A damaging
  // attack in progress is never replaced otherwise: the request waits in
  // the buffer. Never into itself, for anyone: the press for the attack
  // already playing is none (see repeatsMove), and the attack may start
  // again once it has finished. An attack that throws a construct with no
  // special cooldown pays its Energy (`energyCost`, 15) as it starts. The
  // attack starts where the fighter is, exactly as authored: one pressed
  // out of reach whiffs, nothing ever moves the fighter toward its target
  // first.
  tryAction(action, dir = 0, { at = this.steps } = {}) {
    const combat = this.combat;
    combat.lastIntent = action;
    const special = specialAction(this.def, action);
    if (special) return this.trySpecial(action, special, dir, at);
    const attackId = this.attackFor(action);
    if (!attackId) return false; // reserved: wired, but no attack mapped
    const atk = this.attacks[attackId];
    if (!atk || !this.canFollowUp(at) || combat.cooldowns.has(attackId)) return false;
    if (combat.attack?.def.id === attackId) return false;
    if (!this.attackStartable(atk, this.body.grounded, { warn: true })) return false;
    if (!this.payEnergy(atk.energyCost)) return false;
    this.startAttack(atk, dir, { button: action });
    return true;
  }

  // Whether attack `atk` could start on the ground (`grounded`) or in the
  // air now, the fighter's being busy aside: its repeat cooldown over, never
  // a ground-only one in the air, a start left for this airtime (no free
  // fall, its `airUses`, no motion while flying from a launch: see
  // airStartBlocked), and its art there: real frames for the attack (never
  // a faked pose) and, for a throw, for its projectile (never an invisible
  // one). `warn` reports missing art. Read by tryAction.
  attackStartable(atk, grounded = this.body.grounded, { warn = false } = {}) {
    if (!atk || this.combat.cooldowns.has(atk.id)) return false;
    if (!grounded && (atk.groundOnly || this.airStartBlocked(atk))) return false;
    if (!atk.animation || !this.sprites.has(atk.animation)) {
      if (warn) console.warn(`[Alva] Attack "${atk.id}" has no animation frames; ignoring.`);
      return false;
    }
    if (atk.projectile) {
      const proj = this.projectileDefs[atk.projectile.id];
      if (!proj?.animation || !this.sprites.projectile(proj.animation)) {
        if (warn) console.warn(`[Alva] Attack "${atk.id}" throws "${atk.projectile.id}", which has no animation frames; ignoring.`);
        return false;
      }
    }
    return true;
  }

  // Starts attack `atk` now (it may: see tryAction and tryDeflect), turned
  // to `dir` if one is held: it cuts short an attack that may be (or a Dash
  // past its cancel time), keeps its share of the speed the fighter had
  // (see attackStartSpeed: all of it unless the attack says otherwise, a
  // Dash's burst included), counts against its starts for this airtime, may
  // spend the airtime, and sets its motion going. `airborne` remembers
  // where it started, for the landing cancel (see update) and its Step-in
  // (`step`: its definition's on the ground, none in the air, see
  // activationStep in js/game/fighters/movement.js), and `button` the
  // combat button pressed for it, if any (see repeatsMove); the fighter's
  // moveStartedAt records the step (see moveYields). A fighter whose
  // attacks are aimed for it faces that way instead of `dir` (see
  // faceAttackTarget).
  startAttack(atk, dir = 0, { button = null } = {}) {
    const combat = this.combat;
    this.cutAttack();
    if (this.dash) this.endDash();
    this.faceAttackTarget(dir);
    const runningSpeed = this.body.vx;
    this.body.vx = this.attackStartSpeed(atk, this.body.vx, this.body.grounded);
    combat.attack = {
      def: atk, time: 0, hasHit: false, confirmed: false, projectileSpawned: false, released: false,
      step: activationStep(atk, this.body.grounded), stepped: false,
      struck: null, blocked: false, motion: null, airborne: !this.body.grounded, button,
    };
    this.moveStartedAt = this.steps;
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
  // otherwise. What it does not set itself moves as any attack's speed does
  // (moveAttack): never steered on the ground, the universal air control
  // toward `dir`, the direction held, in the air.
  moveMotion(atk, dir, dt) {
    const { body } = this;
    const spec = atk.def.motion;
    const m = atk.motion;
    const phase = attackPhase(atk.def, atk.time);
    if (spec.type === 'roll') {
      // The curl (the startup) slides on like any attack; the roll itself
      // starts as the strike goes live.
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
      // Standing on the air for the whole attack: no fall, the drift (its
      // air momentum's share) under the universal air control.
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
      this.moveAttack(atk, dir, dt);
      return 1;
    }
    if (spec.type === 'homing') {
      if (phase === 'startup') {
        // Hanging (the lock-on): the drift braking on the ground, the
        // universal air control in the air.
        this.moveHorizontal(body.grounded ? 0 : dir, dt);
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
    else body.vy = spec.type === 'rise' ? -spec.speed : spec.fallSpeed;
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
  // over, so it can bounce again; a slam lands there (see landSlam).
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
    } else if (spec.type === 'slam' && attackPhase(atk.def, atk.time) === 'active') {
      this.landSlam(atk);
    }
  }

  // A slam meeting the ground (see `slam` in js/game/combat/attacks.js): it
  // stands where it landed, its impact is due for the CombatSystem this
  // step (CombatSystem.impact), which is its release (its cooldown, if
  // any, starts now: see CombatState.releaseAttack), and the attack goes
  // straight to its recovery, the landing, played on the ground.
  landSlam(atk) {
    const m = atk.motion;
    m.done = true;
    m.landed = true;
    this.body.vy = 0;
    atk.time = atk.def.startup + atk.def.active;
    if (atk.def.motion.impact) {
      atk.impactDue = true;
      if (this.combat.attack === atk) this.combat.releaseAttack();
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
  // pressed just before landing). Never a reserved button (mapped to null),
  // a button the character does not have, an attack without frames or one
  // used up until the fighter lands.
  // A press made for one place only (`place`, from a game controller)
  // may start only there.
  attackMayStart(action, place = null) {
    if (place) return (place === 'ground') === this.body.grounded && this.attackStartsWhere(action, place === 'ground');
    if (this.attackStartsWhere(action, this.body.grounded)) return true;
    return !this.body.grounded && this.attackStartsWhere(action, true);
  }

  // Whether `action`'s attack for the ground (`grounded`) or the air could
  // start there at all (see attackMayStart).
  attackStartsWhere(action, grounded) {
    const attackId = this.attackFor(action, grounded);
    const atk = attackId ? this.attacks[attackId] : null;
    if (!atk || (atk.groundOnly && !grounded)) return false;
    // Energy refusals are never kept: exhaustion lasts until a full refill.
    if (atk.energyCost > 0 && !this.combat.canUseEnergy()) return false;
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

  // ---- Facing ----------------------------------------------------------------

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
  // opponent crossing behind it stays behind it.
  //
  // Automatic turn-around (the human player's, with the setting on: see
  // turnAroundFacing) replaces those rules only while the fighter is not
  // moving left or right: no direction held, and on the ground not still
  // sliding from a run or a Dash (movingSideways). Then it faces its
  // enemy: standing, in the air, Shield up and in an ordinary attack
  // (through updateAttackFacing, the way a CPU's attack is aimed). Moving,
  // the manual rules apply, so it faces the way it goes and never walks
  // backwards; with no enemy in play they apply as ever.
  //
  // Either way it is locked while anything facingLocked names plays: none
  // of those is the fighter's to turn, and each keeps the way it committed
  // to; the facing is free again the step it ends. Combat AI opts into
  // attack targeting first; updateAttackFacing separates visual turns from
  // locked motion.
  updateFacing(dir, held) {
    const { body, combat } = this;
    if (this.updateAttackFacing() || this.facingLocked) return;
    const auto = this.movingSideways ? null : this.turnAroundFacing();
    if (auto != null) {
      this.facing = auto;
      return;
    }
    if (combat.attack || combat.shielding) {
      if (held) this.facing = held;
      return;
    }
    if (dir !== 0 && (Math.abs(body.vx) > TURN_SPEED || !body.grounded)) this.facing = dir;
  }

  // Whether the fighter is moving left or right, for Automatic turn-around:
  // a direction held this step (`steerHeld`), or on the ground a run or a
  // Dash still sliding faster than TURN_SPEED. Drifting in the air with
  // nothing held is not.
  get movingSideways() {
    const { body } = this;
    return this.steerHeld.x !== 0 || (body.grounded && Math.abs(body.vx) > TURN_SPEED);
  }

  // Whether the fighter's facing is held where it is, whatever is held or
  // wherever its enemy goes: a stun, a paralysis, a technique, a summon's
  // startup, a Dash or an air dash (each faces the way it went), or an
  // attack with a motion of its own (a roll, a homing dash, a plunge, a
  // lift: a homing dash faces the way it flies, see moveMotion), whose
  // course a turn would rewrite.
  get facingLocked() {
    const { combat } = this;
    return combat.stun > 0 || !!combat.immobilized || !!this.technique || !!this.pendingSummon || !!this.dash ||
      !!combat.attack?.def.motion;
  }

  // The fighters this one fights, for Automatic turn-around to pick the
  // closest of (closestEnemy, js/game/fighters/turn-around.js): its
  // opponent, the only one any mode has today. Read it at once: the same
  // list is refilled on the next read.
  get enemies() {
    const list = this.enemyList;
    list.length = 0;
    if (this.opponent) list.push(this.opponent);
    return list;
  }

  // Whether this fighter has Automatic turn-around: the human player's
  // controller (kind 'player') with the player's setting on (see
  // PlayerController). A CPU's controller, the practice dummy's lack of
  // one and any other kind never have it, whatever the fighter, slot or
  // label.
  get automaticTurnAround() {
    return this.playerControlled && this.controller.automaticTurnAround === true;
  }

  // The way Automatic turn-around faces this fighter now (1 right, -1
  // left): toward the closest enemy in play (closestEnemy), or the way it
  // faces already while that enemy stands at its very x. Null when it does
  // not turn it: the setting off (or not the player's), input locked, a
  // direction held (the player is moving it: an attack started or turned
  // with one faces that way, as by hand), or no enemy in play (none, or
  // one lost to the Void and waiting to respawn), and the facing is then
  // manual. A direction only: it never moves, steers, attacks or spends
  // anything.
  turnAroundFacing() {
    if (!this.automaticTurnAround || this.inputLocked || this.lostToVoid || this.steerHeld.x !== 0) return null;
    const enemy = closestEnemy(this, this.enemies);
    if (!enemy) return null;
    return facingToward(this, enemy) ?? this.attackVisualFacing ?? this.facing;
  }

  // The way this fighter's attacks, techniques and summon startups are aimed
  // now: by its combat controller (a CPU's live target, attackFacing in
  // js/game/ai/cpu-intelligence/brain.js) or by Automatic turn-around
  // (turnAroundFacing). Null when nothing aims them and they turn by hand.
  attackTargetFacing() {
    return this.controller?.attackFacing?.(this) ?? this.turnAroundFacing();
  }

  // A move starting now faces the way it is aimed (attackTargetFacing),
  // else the direction held (`dir`), else the way the fighter faces.
  faceAttackTarget(dir = 0) {
    const target = this.attackTargetFacing();
    if (target != null) this.attackVisualFacing = target;
    if (target || dir) this.facing = target || dir;
  }

  // Ordinary attacks turn their hitboxes and unreleased projectiles with
  // the sprite. Motion attacks and techniques keep their physical facing;
  // only their artwork turns, leaving their committed motion/hits intact.
  // A projectile already released keeps the direction it was given.
  updateAttackFacing() {
    const { combat } = this;
    if ((!combat.attack && !this.technique && !this.pendingSummon) || combat.stun > 0 || combat.immobilized) {
      this.attackVisualFacing = null;
      return false;
    }
    const target = this.attackTargetFacing();
    if (target == null) return false;
    this.attackVisualFacing = target;
    if (!combat.attack?.def.motion && !this.technique) this.facing = target;
    return true;
  }

  // The facing as the step ends, once every fighter has moved (see
  // Arena.update), before any hit is resolved: an aimed attack
  // (updateAttackFacing) and Automatic turn-around, where nothing locks the
  // facing, follow a side switch made by a fighter updated after this one,
  // so the hitbox, the sprite and the next step's controls never lag a step
  // behind. Manual facing never changes here.
  settleFacing() {
    if (this.updateAttackFacing() || this.facingLocked || this.movingSideways) return;
    const auto = this.turnAroundFacing();
    if (auto != null) this.facing = auto;
  }

  // Visual state only: nothing here feeds back into movement or collision.
  // The land and Shield-release poses never hold anyone: running (a
  // direction held, or sliding fast) goes straight past them, and anything
  // of higher priority (a jump, an attack, a Dash, the Shield) ends them.
  // A raised Shield holds its fighter still (see the Shield in update), in
  // its held Shield pose, whatever direction is held.
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

    const move = this.performedMove(next);
    this.animator.play(this.animationFor(next), { restart, performers: move?.members ?? null, formation: move?.formation ?? null });
    if (next === 'run') {
      // The clip's own rate at top speed, following the speed: down to its
      // minSpeedScale, and faster still above top speed (a Dash's burst run
      // on), up to its maxSpeedScale, so the stride keeps up with the body.
      const anim = this.animator.anim;
      const ratio = Math.abs(body.vx) / this.maxSpeed;
      this.animator.setSpeed(clamp(ratio, anim?.minSpeedScale ?? 1, anim?.maxSpeedScale ?? RUN_MAX_SPEED_SCALE));
    } else if (next === 'dash') {
      // One pass of the Dash's (or air dash's) clip across the whole Dash,
      // whatever its frame count and rate.
      const pass = this.sprites.duration(this.dash.animation);
      const duration = this.dash.duration;
      this.animator.setSpeed(pass > 0 && duration > 0 ? pass / duration : 1);
    } else {
      this.animator.setSpeed(1);
    }
    this.animator.update(dt, this.visualFacing);
  }

  // The move `state` shows, when it is one some of an ensemble's members
  // perform and not the whole group (js/data/ensemble.js): its attack (its
  // Deflect included) or its technique, whose `members` and `formation` say
  // who performs it and where everyone stands. Null for every other state:
  // the whole group plays it. An ordinary fighter's moves name no members.
  performedMove(state) {
    if (state === 'attack') return this.combat.attack.def;
    if (state === 'technique') return this.technique.def;
    return null;
  }

  // Animation key for a visual state. An attack plays its own clip for its
  // whole length, even if the fighter lands or leaves the ground meanwhile
  // (but a slam's landing, which plays its impact's clip).
  // Hitstun, and being held by a paralysis (the `bound` state), show `hurt` on the ground and
  // `midair_hurt` in the air. A technique plays the clip of its current
  // phase, a summon's startup its summon's own startupAnimation, a Dash
  // plays `mouvment` and an air dash `midair_mouvment`. A Deflect is an
  // attack: its own clip. The Shield (on the ground only) shows its held
  // pose, opening with `groundStartAnimation` for one frame as it goes up;
  // the shieldRelease state is `groundReleaseAnimation`.
  animationFor(state) {
    if (state === 'attack') {
      // A slam that has landed plays its impact's own clip, if it has one.
      const a = this.combat.attack;
      const landing = a.motion?.landed ? a.def.motion.impact?.animation : null;
      return landing && this.sprites.has(landing) ? landing : a.def.animation;
    }
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
    return this.visualFacing !== sourceFacing;
  }

  // The way its art faces: its facing, or while it attacks, casts or
  // summons the way it is aimed (see updateAttackFacing). Rendering only,
  // as spriteFlip.
  get visualFacing() {
    const attacking = this.combat.attack || this.technique || this.pendingSummon;
    return attacking ? this.attackVisualFacing ?? this.facing : this.facing;
  }

  // Interpolated position for rendering between fixed steps (an ensemble's
  // members' places too).
  interpolate(alpha) {
    const b = this.body;
    this.renderX = b.prevX + (b.x - b.prevX) * alpha;
    this.renderY = b.prevY + (b.y - b.prevY) * alpha;
    this.animator.interpolate?.(alpha);
  }
}
