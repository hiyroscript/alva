// Fighter entity: physics body + state machine + combat state + animator.
// Behaviour is driven entirely by the character definition and whatever
// controller (player / AI) feeds it input.
//
// Purpose: the one runtime fighter every mode uses, for every character.
// It owns the fighter's state (its body, Dash and air dash, jumps, Shield,
// attack in progress (its Deflect included), summon startup, technique,
// launch sequence) and the order in which each fixed step updates it
// (Fighter.update).
// Inputs: a character definition (js/data/characters/<id>.js), its loaded
// SpriteSet (clip lengths time the Dash and the air dash, the land pose,
// pending attacks and summon startups), a spawn, the stage, and a controller
// (js/game/fighters/fighter-controller.js or js/game/ai/combat-ai.js).
// Outputs: Fighter, separateFighters and COMBAT_ACTIONS.
// Important constraints: the rules are shared and the numbers are the
// character's. Movement math lives in js/game/fighters/movement.js, attack
// / defense / Energy schemas in js/game/combat/, and nothing here names a
// fighter or a button's role: a summon or technique is whatever the
// character's `actions` say it is. The simulation is fixed-step and
// deterministic; rendering reads it (interpolate, spriteFlip) and never
// feeds back.

import { SpriteAnimator } from '../rendering/sprite-animator.js';
import { createBody, stepBody, dropThrough, separate } from '../physics.js';
import { startLaunch, bounceLaunch, resolveLaunchBounce } from '../combat/launch-bounce.js';
import { attackPhase, createAttackDefinition } from '../combat/attacks.js';
import { createDefenseDefinition } from '../combat/defense.js';
import { createDeflectDefinition } from '../combat/deflect.js';
import { CombatState, resolveEnergy } from '../combat/combat-state.js';
import { resolveLaunchReaction } from '../combat/combat.js';
import { createProjectileDefinition } from '../combat/projectile.js';
import { createSummonDefinition, summonProblem } from '../combat/summon.js';
import { Technique, createTechniqueDefinition, techniqueProblem } from '../combat/technique.js';
import { getJumpVelocity, getMaxSpeed } from '../../data/powers.js';
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
    // One pass of the touchdown clip; 0 skips the land state entirely.
    this.landDuration = sprites.duration('land');
    // One pass of the mouvment clip: how long a Dash lasts (0 without its
    // art, and then no Dash starts; see tryDash). Likewise one pass of the
    // midair_mouvment clip is how long an air dash lasts (see tryAirDash).
    this.dashDuration = sprites.duration('mouvment');
    this.airDashDuration = sprites.duration('midair_mouvment');
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
    // The character's Powers (js/data/powers.js), resolved once.
    // Upward speed of the normal jump, from its Jump Power tier. Nothing else
    // (launches, techniques) uses it.
    this.jumpVelocity = getJumpVelocity(def);
    // Top speed of normal left / right movement, on the ground and in the
    // air, from its Speed Power tier. Nothing else (acceleration, launches,
    // projectiles, techniques) uses it.
    this.maxSpeed = getMaxSpeed(def);
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
    this.attackVisualFacing = null;
    this.state = 'idle';
    this.stateTime = 0;
    this.moveDir = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    // Jumps left in the air before landing again (movement.airJumps),
    // refreshed on the ground and by a hit (see takeHit); and air dashes
    // likewise (see airDashUses).
    this.airJumps = def.movement.airJumps ?? 0;
    this.airDashes = this.airDashUses;
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
    // A Dash asked for during an impact freeze (1 right, -1 left, 0 none),
    // tried on the step the freeze ends (see dashAsked).
    this.frozenDash = 0;
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

  update(dt, ctx) {
    const { body, combat } = this;
    const mv = this.def.movement;

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
      // blocked one keeps the Shield up). Energy keeps refilling. Presses
      // made during it are kept, not lost, and do not age: the attack
      // pressed through the impact comes out as soon as it can, and so
      // does a Dash asked for (a Dash cancel out of the hit). A Shield press
      // is not: a Deflect starts on its own press or not at all. The body is
      // drawn where it stopped, not between its last two steps (a rebound
      // freezes it at the surface it struck).
      body.prevX = body.x;
      body.prevY = body.y;
      for (const action of COMBAT_ACTIONS) if (input[`${action}Pressed`]) this.bufferAttack(action);
      this.frozenDash = this.dashAsked(input, 0) || this.frozenDash;
      combat.updateEnergy(dt);
      this.updateState(0);
      return;
    }

    // ---- Dash -------------------------------------------------------------
    // A Dash or an air dash ends by itself after one pass of its clip: the
    // fighter is free again from the step it ends.
    if (this.dash) {
      this.dash.time += dt;
      if (this.dash.time >= this.dash.duration - TIME_EPSILON) this.endDash(true);
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

    // ---- Combat intents --------------------------------------------------
    // Each press is its button's own move (see tryAction): an attack, or a
    // summon or technique (e.g. #0001's Attack 4 and Attack 5). Actions mapped to
    // null are wired but reserved, and a button the character has no action
    // for does nothing.
    //
    // A press the fighter cannot act on yet (an attack or its recovery, a
    // stun, a Dash, a summon's startup, a cooldown, the Shield button held)
    // is buffered
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
    const canJump = this.coyote > 0 || (!body.grounded && this.airJumps > 0 && !this.freeFall);
    const jumpFirst = (at) =>
      this.jumpBuffer > 0 && canJump && this.jumpPressedAt < at && this.canFollowUp() && !shieldHeld;
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

    // ---- Dash: a double tap of runLeft or runRight, or a mouvement ------
    // The Dash on the ground, the air dash in the air (see tryMouvment).
    // After the attacks (a Deflect included), so one started this step wins
    // over a Dash on the same step (canFollowUp). A Dash may cut short an
    // attack that hit, as a jump may. A double tap that cannot Dash right
    // now is used up all the same: nothing is queued for later. Energy
    // spent this step means no refill this step (see the end of update).
    //
    // mouvementLeftPressed / mouvementRightPressed ask for one Dash outright
    // (the Joystick touch layout's single-tap mouvement buttons, see
    // InputManager.queueTouchMouvement). The request goes through the very same
    // tryMouvment, so every rule and cost of a double-tap Dash applies, and it
    // is used up the same way. It is not a tap: it forgets any first tap
    // waiting, so it never pairs with one, and this step's own direction
    // press (if any) is not counted as one either. Both at once ask for
    // nothing. A Dash asked for during an impact freeze is tried here, on
    // the step it ends, unless this step asks for one itself.
    let spent = false;
    const dashDirection = this.dashAsked(input, dt) || this.frozenDash;
    this.frozenDash = 0;
    if (dashDirection && this.tryMouvment(dashDirection, input)) spent = true;

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
    // the body too: straight across at its speed, no fall.
    const atk = combat.attack;
    let gravityShare = 1;
    let dir = held;
    if (combat.shielding || combat.stun > 0 || combat.immobilized || this.technique || this.dash || this.pendingSummon) dir = 0;
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
      body.vx = this.dash.direction * this.dash.speed;
      if (this.dash.air) {
        body.vy = 0;
        gravityShare = 0;
      }
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
    // also cut short an attack that hit (see CombatState.cancellable). It
    // only sets the upward speed: whatever horizontal speed the fighter has
    // carries straight into the air. A tap is the normal jump; Jump held a
    // little longer makes it the higher jump (see below).
    const free = (canAct || combat.cancellable) && !combat.shielding;
    let jumped = false;
    if (this.jumpBuffer > 0 && this.coyote > 0 && free) {
      this.cutAttack();
      this.highJump = { time: 0, fromY: body.y, lift: null };
      body.vy = -this.jumpVelocity;
      body.grounded = false;
      body.ground = null;
      this.coyote = 0;
      this.jumpBuffer = 0;
      jumped = true;
    } else if (this.jumpBuffer > 0 && !body.grounded && this.coyote <= 0 && this.airJumps > 0 && free && !this.technique && !this.freeFall) {
      // ---- Air jump -------------------------------------------------------
      // Jump pressed in the air (past coyote time), with one left: a fresh
      // jump from wherever the fighter is, at airJumpRatio x the normal
      // jump's speed, the jump clip from its first frame. A held direction
      // sets off that way at least at top speed, so it can change course;
      // with none held the drift carries on. Always the same height, held
      // or tapped: never a higher jump.
      this.cutAttack();
      airJump(body, mv, this.jumpVelocity, this.maxSpeed, held);
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
      this.airJumps = mv.airJumps ?? 0;
      this.airDashes = this.airDashUses;
      this.airAttacks.clear();
      this.freeFall = false;
      this.highJump = null;
      this.tumbling = false;
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
    // Every step no Dash was paid for, a held Shield included, at the one
    // passive rate: nothing held ever makes it faster.
    if (!spent) combat.updateEnergy(dt);

    // A buffered press ages only on steps the fighter lives through (never
    // in a freeze) and is gone once it is older than the buffer.
    if (this.bufferedAttack) {
      this.bufferedAttack.age += dt;
      if (this.bufferedAttack.age > (mv.attackBuffer ?? 0) + TIME_EPSILON) this.bufferedAttack = null;
    }

    this.updateFacing(dir, held);
    this.updateState(dt);
  }

  // One step of horizontal steering, with `control` (0-1) of the fighter's
  // normal steering and `friction` x its ground deceleration while it is
  // not steering: the shared rule (steer in js/game/fighters/movement.js)
  // with this fighter's movement profile and top speed.
  moveHorizontal(dir, control, friction, dt) {
    steer(this.body, this.def.movement, this.maxSpeed, dir, control, friction, dt);
  }

  // One step of an attack's own movement: its step-in, then steering with
  // the attack's share of control (steerAttack in
  // js/game/fighters/movement.js).
  moveAttack(atk, dir, dt) {
    steerAttack(this.body, this.def.movement, this.maxSpeed, this.facing, atk, dir, dt);
  }

  // The horizontal speed an attack starting now keeps of `vx` (see
  // attackStartSpeed in js/game/fighters/movement.js), against this
  // fighter's own top speed.
  attackStartSpeed(atk, vx, grounded) {
    return attackStartSpeed(atk, vx, grounded, this.maxSpeed);
  }

  // Remembers `action`'s press for the combat input buffer: the latest
  // press that may start at all (see attackMayStart) wins, starting its own
  // movement.attackBuffer seconds. Any other press leaves the buffer as it
  // is.
  bufferAttack(action) {
    if (!(this.def.movement.attackBuffer > 0) || !this.attackMayStart(action)) return;
    this.bufferedAttack = { action, age: 0, at: this.steps };
  }

  // A hit (never a block) just landed on this fighter (see
  // CombatSystem.applyHit): it gets its air jump back, so a launch never
  // strands it without one, and its air dashes and once-per-airtime attacks
  // (`airUses`) too, and a higher jump (deciding or rising) is over.
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
    this.airJumps = this.def.movement.airJumps ?? 0;
    this.airDashes = this.airDashUses;
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
    return highJumpLift(this.body, this.def.movement, this.jumpVelocity, this.highJump.fromY, gravity);
  }

  // Cuts the attack in progress short, if it may be (see
  // CombatState.cancellable): another attack, a jump or a Dash is starting.
  cutAttack() {
    if (this.combat.cancellable) this.combat.endAttack();
  }

  // Free to start an attack (a Deflect included), a jump, a Dash or an air
  // dash: free to act, or in an attack that hit and may now be cut short
  // (see CombatState.cancellable).
  canFollowUp() {
    return this.canAct() || (this.combat.cancellable && !this.technique && !this.dash);
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
    const { direction, tap } = readDashTap(this.dashTap, input, this.def.movement, dt);
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

  // Air dashes the fighter may make per airtime (movement.airDashUses, 1
  // when left out), given back on landing and by a hit as its air jumps
  // are; none at all without a positive movement.airDashSpeed.
  get airDashUses() {
    const mv = this.def.movement;
    return mv.airDashSpeed > 0 ? mv.airDashUses ?? 1 : 0;
  }

  // Starts one Dash toward `direction` (1 right, -1 left): a short grounded
  // burst at movement.dashSpeed for one pass of the dash clip. Movement
  // only: no hitbox, damage, launch or invulnerability. Only while free
  // to act (no attack, stun, paralysis, technique or Dash already running) or
  // in an attack that hit and may be cut short (see
  // CombatState.cancellable: a Dash chases what it sent flying), grounded,
  // not shielding or holding `shield` for a Shield it may raise, and not
  // exhausted, paying dashCost, or dashCancelCost for one that cuts an
  // attack short (all that is left, emptying the bar, when that is less):
  // the extra is what keeps a hit-Dash-hit chase from looping. Down held
  // never matters. The fighter faces the Dash at once. False, with nothing
  // spent and the attack left as it is, if it cannot start (a missing dash
  // clip is logged). `input` is this step's (Shield held rules it out);
  // any caller (a future AI too) may use it.
  tryDash(direction, input = NEUTRAL_INPUT) {
    const speed = this.def.movement.dashSpeed;
    if (!speed || !direction) return false;
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
    this.dash = { direction, time: 0, duration: this.dashDuration, speed, air: false, animation: 'mouvment' };
    this.facing = direction;
    this.body.vx = direction * speed;
    // Every Dash plays its clip from the first frame, even straight after
    // another one.
    this.animator.play('mouvment', { restart: true });
    return true;
  }

  // Starts one air dash toward `direction` (1 right, -1 left): the
  // fighter's own mid-air mouvment, apart from its Dash. Straight across at
  // movement.airDashSpeed, no fall (its vertical speed zeroed as it starts,
  // gravity held off throughout), for one pass of its midair_mouvment clip,
  // facing that way at once. Movement only: no hitbox, damage, launch,
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
    const speed = this.def.movement.airDashSpeed;
    if (!(speed > 0) || !direction || this.body.grounded) return false;
    if (!this.canFollowUp() || this.airDashes <= 0 || this.freeFall || this.launch) return false;
    if (!this.airDashDuration || !this.sprites.has('midair_mouvment')) {
      console.warn('[Alva] Air dash has no midair_mouvment animation frames; ignoring.');
      return false;
    }
    const cutting = !!this.combat.attack;
    if (!this.combat.spendEnergy(cutting ? this.energyDef.dashCancelCost : this.energyDef.dashCost)) return false;
    this.cutAttack();
    this.airDashes--;
    this.dash = { direction, time: 0, duration: this.airDashDuration, speed, air: true, animation: 'midair_mouvment' };
    this.facing = direction;
    this.highJump = null;
    this.body.vx = direction * speed;
    this.body.vy = 0;
    this.animator.play('midair_mouvment', { restart: true });
    return true;
  }

  // Ends the Dash or air dash in progress, if any. The fighter keeps
  // whatever speed it has, and the normal movement slows it from there;
  // except that an air dash run to its end (`finished`) comes out of it at
  // no more than the fighter's top speed, so the air drag never has a
  // whole dash's speed to carry it on with. Cut short (a hit, a wall, the
  // ground) it leaves the speed as it is.
  endDash(finished = false) {
    const d = this.dash;
    this.dash = null;
    if (finished && d?.air) this.body.vx = d.direction * Math.min(Math.abs(this.body.vx), this.maxSpeed);
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
  // never into itself while its own cooldown would still run.
  tryAction(action, dir = 0) {
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
    this.startAttack(atk, dir);
    return true;
  }

  // Starts attack `atk` now (it may: see tryAction and tryDeflect), turned
  // to `dir` if one is held: it cuts short an attack that may be, keeps its
  // share of the speed the fighter had (see attackStartSpeed), counts
  // against its starts for this airtime, may spend the airtime, and sets its
  // motion going.
  startAttack(atk, dir = 0) {
    const combat = this.combat;
    this.cutAttack();
    this.faceAttackTarget(dir);
    const runningSpeed = this.body.vx;
    this.body.vx = this.attackStartSpeed(atk, this.body.vx, this.body.grounded);
    combat.attack = {
      def: atk, time: 0, hasHit: false, confirmed: false, projectileSpawned: false, stepped: false,
      struck: null, blocked: false, motion: null,
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
  // `recoil` back, its air jump given back by a real hit; a plunge bounces
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
      if (event.type === 'hit') this.airJumps = this.def.movement.airJumps ?? 0;
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
  // start left for this airtime if it has `airUses`). Never a reserved
  // button (transform), a button the character does not have, an air
  // extra_attack that is ground-only, an attack without frames or one used
  // up until the fighter lands.
  attackMayStart(action) {
    const attackId = this.attackFor(action);
    const atk = attackId ? this.attacks[attackId] : null;
    if (!atk || (atk.groundOnly && !this.body.grounded) || this.airStartBlocked(atk)) return false;
    return !!atk.animation && this.sprites.has(atk.animation);
  }

  // Attack id for a controller action. The character's `actions` entry is a
  // string (one attack), { ground, air } (chosen by whether the fighter is
  // grounded as the button is pressed: attackN / midair_attackN), null
  // (reserved) or missing (no such button).
  attackFor(action) {
    const mapping = this.def.actions?.[action];
    if (!mapping || typeof mapping === 'string') return mapping || null;
    return (this.body.grounded ? mapping.ground : mapping.air) || null;
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
  // technique, summon's startup or Dash plays: none of those is the
  // fighter's to steer; nor is an attack with a motion of its own (a roll, a
  // homing dash, a plunge, a lift). Combat AI opts into attack targeting
  // first; updateAttackFacing separates visual turns from locked motion.
  updateFacing(dir, held) {
    const { body, combat } = this;
    if (this.updateAttackFacing()) return;
    if (combat.stun > 0 || combat.immobilized || this.technique || this.pendingSummon || this.dash) return;
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
  updateState(dt) {
    const { body, combat } = this;
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
    else if (this.isLanding(dt)) next = 'land';
    else if (this.isReleasingShield(dt)) next = 'shieldRelease';
    else if ((this.moveDir !== 0 && Math.abs(body.vx) > 20) || Math.abs(body.vx) > 140) next = 'run';
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
  // Hitstun, and being held by a paralysis (the `bound` state), show `hurt` on the ground and
  // `midair_hurt` in the air. A technique plays the clip of its current
  // phase, a summon's startup its summon's own startupAnimation, a Dash
  // plays `mouvment` and an air dash `midair_mouvment`. A Deflect is an
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
    return state;
  }

  // Touchdown starts the land state; it then lasts one pass of the land clip
  // while grounded. Anything with higher priority (a new jump included) ends it.
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
