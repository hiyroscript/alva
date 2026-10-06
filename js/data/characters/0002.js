// #0002's definition: everything that makes #0002 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0002.md for what each move does in play.
//
// The speedster, cut from one supplied sprite sheet (see
// assets/characters/0002/). Three numbered attacks, each an ordinary
// attack with a button of its own and a mid-air version, and an
// extra_attack. Its moves are its own mechanics, not just poses
// and damage: a two-punch string, a lock-on Homing Attack that springs off
// what it hits, a kick flurry that holds its target then flings it, a
// Bounce Attack that plunges, spikes and rebounds, a Spin Attack that
// rolls on its running speed straight through its target as a smaller
// ball, a rising Blue Tornado that carries its target up with it, and a
// Whirlwind that sends a travelling tornado to catch, lift and fling. In the
// air the Shield button is its Deflect, a swat of the hand that knocks
// projectiles back, and it has an air dash of its own (its
// midair_mouvment), flat out across the air.

import { frames } from './helpers.js';

// Height in art pixels of #0002's idle (its reference clip). Its art is 1x
// (one file pixel per art pixel, cut from one sprite sheet with its flat
// background made transparent), so no pixel grid is ever looked for in it
// (`visual.pixelSize: 1`): each clip's heightRatio, its tallest frame over
// this, is what sizes it, at exactly one art pixel per file pixel.
const ART_0002 = 39;

// Playback rates of #0002's clips. Each attack's phases and strikes below
// are whole frames of its clip at its rate, so tuning a rate keeps the
// timing on the art; every attack's rate is a whole number of 60 Hz steps
// per frame, so each frame lasts exactly as long as its gameplay does. (The
// Dash and the air dash last the universal Dash's length, whatever these
// say: their clips are shown once across it, which 24 fps for the Dash's
// four frames and 6 for the air dash's one match.)
const FPS_0002 = Object.freeze({
  idle: 10,
  run: 24,
  mouvment: 24,
  midair_mouvment: 6,
  deflect: 20,
  jump: 30,
  ball: 30,
  attack1: 20,
  attack2: 20,
  tornado: 30,
  extra_attack: 20,
  extra_attack_object: 16,
});

// #0002's spinning ball (eight frames): its jump, and the ball it curls
// into for its Homing Attack, Bounce Attack and Spin Attack (each clip its
// own files, named for it). Each frame is anchored on its own middle, so
// the ball spins in place.
const BALL_0002 = Object.freeze([15, 14.5, 15, 15, 15, 14.5, 15, 15]);
const ballClip = (codename, fps) => ({
  frames: frames('0002', codename, 8),
  fps,
  loop: true,
  heightRatio: 30 / ART_0002,
  anchorX: [...BALL_0002],
});

// The ball's box, facing right from #0002's origin: the whole ball (30 art
// pixels, about 51 units, across) and a little round it. The Homing
// Attack's, the Bounce Attack's and the Spin Attack's hitbox.
const BALL_HITBOX_0002 = Object.freeze({ x: -22, y: -50, w: 44, h: 50 });

export const CHARACTER_0002 = {
  id: '0002',
  displayName: '#0002',
  available: true,
  rosterSlot: 1,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: the idle, run, Dash, air dash, fall, hurt and guard poses use
  // the automatic torso anchor. Where the art would drag it (a ball or a
  // tornado spinning, a whirlwind or kick trails beside the body, a hand
  // swatting) a clip authors its own (`anchorX`, art pixels from the left of
  // each frame's visible art): the ball and the tornado on their own
  // middle, the Whirlwind on the body inside it, the One-Two on its planted
  // feet, the Deflect on the face and chest. The
  // Rapid Kicks also say where the feet are (`anchorY`, art pixels down
  // from the top of the art): their trails sweep below the standing foot.
  animations: {
    // The fighting stance, fists up, bobbing: eight frames.
    idle: {
      frames: frames('0002', 'idle', 8),
      fps: FPS_0002.idle,
      loop: true,
      heightRatio: 1,
    },
    // The run: a twelve-frame stride. Its rate follows the speed, down to
    // 0.6 of it (and up past it on a Dash's run-on).
    run: {
      frames: frames('0002', 'run', 12),
      fps: FPS_0002.run,
      loop: true,
      heightRatio: 40 / ART_0002,
      minSpeedScale: 0.6,
    },
    // The spin jump: curled into the ball, spinning for the whole rise
    // (the air jump too).
    jump: {
      frames: frames('0002', 'jump', 8),
      fps: FPS_0002.jump,
      loop: true,
      heightRatio: 30 / ART_0002,
      anchorX: [...BALL_0002],
    },
    // Descending: uncurled, arms spread, held.
    fall: {
      frames: frames('0002', 'fall', 1),
      fps: 10,
      loop: false,
      heightRatio: 48 / ART_0002,
    },
    // mouvment, the Dash: the legs a blur of a figure-eight at full tilt,
    // played once across the whole Dash.
    mouvment: {
      frames: frames('0002', 'mouvment', 4),
      fps: FPS_0002.mouvment,
      loop: false,
      heightRatio: 36 / ART_0002,
    },
    // midair_mouvment, the air dash: stretched out flat, arms swept back,
    // one foot leading, shown for the whole air dash.
    midair_mouvment: {
      frames: frames('0002', 'midair_mouvment', 1),
      fps: FPS_0002.midair_mouvment,
      loop: false,
      heightRatio: 33 / ART_0002,
    },
    // Hitstun poses: `hurt` (recoiling) on the ground, `midair_hurt`
    // (knocked back, legs up) in the air. Held through the stun.
    hurt: {
      frames: frames('0002', 'hurt', 1),
      fps: 12,
      loop: false,
      heightRatio: 42 / ART_0002,
    },
    midair_hurt: {
      frames: frames('0002', 'midair_hurt', 1),
      fps: 12,
      loop: false,
      heightRatio: 32 / ART_0002,
    },
    // The guard, arms crossed: its Shield, on the ground.
    shielding: {
      frames: frames('0002', 'shielding', 1),
      fps: 12,
      loop: false,
      heightRatio: 1,
    },
    // deflect, its Deflect: 1 the arms flung wide, 2 the hand swatting up
    // and out in front, the legs kicking, 3 the hand carried on through.
    deflect: {
      frames: frames('0002', 'deflect', 3),
      fps: FPS_0002.deflect,
      loop: false,
      heightRatio: 48 / ART_0002,
      anchorX: [19, 14, 14.5],
    },
    // attack1, the One-Two: 1 the jab drawn back, 2 the jab, 3 the other
    // fist drawn back, 4 the straight.
    attack1: {
      frames: frames('0002', 'attack1', 4),
      fps: FPS_0002.attack1,
      loop: false,
      heightRatio: 1,
      anchorX: [14, 13, 13, 13],
    },
    // midair_attack1, the Homing Attack: the ball, spinning.
    midair_attack1: ballClip('midair_attack1', FPS_0002.ball),
    // attack2, the Rapid Kicks: leaning back on one foot, a blur of kicks
    // in front (four frames, played twice). The body is the same drawing
    // in all four; only the trails change.
    attack2: {
      frames: [...frames('0002', 'attack2', 4), ...frames('0002', 'attack2', 4)],
      fps: FPS_0002.attack2,
      loop: false,
      heightRatio: 80 / ART_0002,
      anchorX: Array(8).fill(16.5),
      anchorY: [59, 57, 59, 61, 59, 57, 59, 61],
    },
    // midair_attack2, the Bounce Attack: the ball, spinning.
    midair_attack2: ballClip('midair_attack2', FPS_0002.ball),
    // attack3, the Spin Attack: the ball, rolling.
    attack3: ballClip('attack3', FPS_0002.ball),
    // midair_attack3, the Blue Tornado: #0002 spun into a tornado of its
    // own (four frames, looped while it rises).
    midair_attack3: {
      frames: frames('0002', 'midair_attack3', 4),
      fps: FPS_0002.tornado,
      loop: true,
      heightRatio: 46 / ART_0002,
      anchorX: [17.5, 17, 17, 17],
    },
    // extra_attack, the Whirlwind: 1 the turn, 2-9 spinning on the spot
    // in a whirlwind of its own making, which it sends off on frame 6.
    extra_attack: {
      frames: frames('0002', 'extra_attack', 9),
      fps: FPS_0002.extra_attack,
      loop: false,
      heightRatio: 1,
      anchorX: [16, 23.5, 23.5, 25.5, 25.5, 28, 29, 26, 25],
    },
  },

  // extra_attack_object, the tornado the Whirlwind sends off: four frames
  // looped while it travels. A round effect, so never mirrored.
  projectileAnimations: {
    extra_attack_object: {
      frames: frames('0002', 'extra_attack_object', 4),
      fps: FPS_0002.extra_attack_object,
      loop: true,
      sourceFacing: 0,
    },
  },

  projectiles: {
    // The tornado. It travels slowly along the ground (about 416 units in
    // its 1.6 s), and whatever it catches it keeps: five strikes 0.14 s
    // apart, each 1 Launch Point with no launch, lifting the target 300
    // units/s and dragging it along with it (carry); the fifth is the
    // finisher, 2 more and a Base Launch 2 fling upward. 6 in all. A
    // Shield blocks it (and stops it there).
    extra_attack_object: {
      animation: 'extra_attack_object',
      speed: 260,
      lifetime: 1.6,
      // Round its middle (its art is about 60 x 78 units), as tall as the
      // funnel: a target it lifts stays in it.
      hitbox: { x: -24, y: -40, w: 48, h: 78 },
      damage: 1,
      baseLaunch: 0,
      directionalLaunch: null,
      hitstun: 0.24,
      blockstun: 0.12,
      hitstop: 0.03,
      carry: { lift: 300 },
      pierce: { hits: 5, interval: 0.14 },
      finisher: { damage: 2, baseLaunch: 2, directionalLaunch: 'vertical', hitstun: 0.4, hitstop: 0.08 },
    },
  },

  // A still idle frame for the airborne and hurt clips if their frames
  // fail to load (never for an attack, the Shield, the Deflect, the Dash or
  // the air dash: missing, each is refused). It has no land clip at all: it
  // lands straight into its stance.
  animationFallbacks: {
    jump: { animation: 'idle', frame: 0 },
    fall: { animation: 'idle', frame: 0 },
    hurt: { animation: 'idle', frame: 0 },
    midair_hurt: { animation: 'idle', frame: 0 },
  },

  visual: {
    // Its 39-pixel idle at the roster's common art-pixel size, 88/52 world
    // units per art pixel (the scale #0001's art is drawn at, so every
    // fighter's pixels are the same size on screen): 66 units, a head
    // shorter than #0001.
    height: ART_0002 * (88 / 52),
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.3, size: 0.62 },
  },

  // Its body, measured from its idle: the head and torso (the quills'
  // tips left out), then the wide stance. Collision is independent of
  // the art.
  collider: { width: 26, height: 62 },
  pushbox: { width: 30 },
  hurtboxes: [
    { x: -18, y: -64, w: 34, h: 32 }, // head and torso
    { x: -14, y: -32, w: 34, h: 32 }, // legs
  ],

  // How #0002 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): 0.2 s more stun per 1000 units/s, 0.7 s more
  // at most, tumbling from 1100 units/s, and a held direction bends a
  // launch by up to 15 degrees.
  launchReaction: {
    stunPerThousand: 0.2,
    maxStun: 0.7,
    tumbleSpeed: 1100,
    steerAngle: 15,
  },

  // Energy (see resolveEnergy in js/game/combat/combat-state.js), spent by
  // the Dash, the air dash and the Shield (#0001's goes a little further).
  energy: {
    max: 100,
    regen: 12,
    dashCost: 15,
    dashCancelCost: 40,
    shieldHitCost: 25,
  },

  // The guard, what the `shield` input does for #0002 on the ground. Its
  // perfect Shield opens for 0.1 s after 0.25 s down, as #0001's does.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0002 in the air (schema:
  // js/game/combat/deflect.js): quicker than #0001's and shorter in reach.
  // Frame 1 the arms flung wide, then the swat (frames 2-3, live: a box in
  // front from the head to the knees, out to 38 units), frame 3 then held
  // two frames more. Every Deflect's 3, Base Launch 2, here sideways, the way
  // the hand swats; while the swat is live it knocks the other fighter's
  // projectiles back at their thrower, now #0002's. A quarter of a second
  // in all, falling as it swats and carrying the whole of its drift.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0002.deflect,
    active: 2 / FPS_0002.deflect,
    recovery: 2 / FPS_0002.deflect,
    hitbox: { x: 6, y: -64, w: 32, h: 56 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    cooldown: 0.3,
    airMomentum: 1,
    airControl: 0.4,
    deflectProjectiles: true,
  },

  // Three numbered attacks, all ordinary: three buttons, each with its
  // mid-air version (see js/data/loadout.js). The sheet's transformation
  // art has no move yet: Transform is reserved.
  actions: {
    extra_attack: 'extra_attack', // the Whirlwind
    transform: null, // reserved
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the One-Two / the Homing Attack
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Rapid Kicks / the Bounce Attack
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Spin Attack / the Blue Tornado
  },

  // UI only: grounded poses and the matching airborne ball/tornado
  // frames. Whirlwind shows its projectile's full tornado silhouette,
  // with a tornado glyph if that image cannot load.
  mobileAbilities: {
    extra_attack: { label: 'Whirlwind', fallbackIcon: 'tornado', preview: { collection: 'projectileAnimations', animation: 'extra_attack_object', frame: 2 } },
    attack1: { label: 'One-Two', preview: { animation: 'attack1', frame: 3 }, previews: { air: { animation: 'midair_attack1', frame: 0 } } },
    attack2: { label: 'Rapid Kicks', preview: { animation: 'attack2', frame: 1 }, previews: { air: { animation: 'midair_attack2', frame: 4 } } },
    attack3: { label: 'Spin Attack', preview: { animation: 'attack3', frame: 4 }, previews: { air: { animation: 'midair_attack3', frame: 2 } } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Whirlwind',
    attack1: 'One-Two',
    midair_attack1: 'Homing Attack',
    attack2: 'Rapid Kicks',
    midair_attack2: 'Bounce Attack',
    attack3: 'Spin Attack',
    midair_attack3: 'Blue Tornado',
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases and strikes are whole frames of each clip,
  // and every hitbox is measured from its art (facing right from the
  // origin, mirrored with facing). Its speed is in its moves' own motion
  // (the homing dash, the plunge, the roll, the lift), never in how it runs.
  attacks: {
    // The One-Two: two strikes in one press, light and quick (a quarter of
    // a second in all). The jab (frame 2, 1) holds the target for the
    // straight (frame 4, 2), which pushes it away. Frame 4 is held one more
    // frame to recover. A hit opens a follow-up once the straight is out.
    // It keeps all the speed it is thrown at, sliding on under half the
    // ground deceleration.
    attack1: {
      animation: 'attack1',
      recovery: 1 / FPS_0002.attack1,
      hitbox: { x: 8, y: -50, w: 26, h: 18 },
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 1 / FPS_0002.attack1, active: 1 / FPS_0002.attack1, damage: 1 },
        {
          at: 3 / FPS_0002.attack1, active: 1 / FPS_0002.attack1, hitbox: { x: 8, y: -50, w: 28, h: 18 },
          damage: 2, baseLaunch: 1, directionalLaunch: 'horizontal', hitstop: 0.05,
        },
      ],
      cooldown: 0.1,
      groundOnly: true,
      momentum: 1,
      friction: 0.5,
      hitCancel: 4 / FPS_0002.attack1,
    },
    // The Homing Attack. Curled up, it hangs for a moment (the lock-on,
    // 7/60 s), then dashes at 1100 units/s for up to 0.22 s at its
    // opponent, if it is within 240 units and not behind it, re-aimed
    // every step; with nobody there it dashes straight ahead (a short air
    // dash that keeps a quarter of its speed as it ends). The hit pops the
    // target up (2, Base Launch 1 upward) and #0002 springs off it (760
    // up, 140 back) with both its air jumps back: the chain canon is
    // famous for. Once per airtime (landing or being hit gives it back).
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 7 / 60,
      active: 0.22,
      recovery: 0.1,
      damage: 2,
      baseLaunch: 1,
      directionalLaunch: 'vertical',
      hitbox: BALL_HITBOX_0002,
      hitstun: 0.4,
      blockstun: 0.15,
      hitstop: 0.05,
      cooldown: 0.1,
      airUses: 1,
      motion: { type: 'homing', range: 240, speed: 1100, rebound: 760, recoil: 140, exit: 0.25 },
      airMomentum: 0.6,
      hitCancel: 7 / 60,
    },
    // The Rapid Kicks: a committed flurry, its heaviest launcher. After a
    // wind-up of four frames (0.2 s: time to see it coming), three kicks, 1
    // Launch Point each and no launch, hold the target in place (each
    // one's stun outlasts the next), then the fourth flings it away (3,
    // Base Launch 2 sideways, too short a stun to chase with the Spin
    // Attack): 6 in all, and #0002's surest way to send someone off the
    // stage. Once the finisher has landed, a jump or a Dash may chase it.
    // The hitbox is the thick of the flurry just in front, where the feet
    // land, not the trails' tips. A long cooldown: the target is free again
    // well before another flurry could start, so it never loops. A Shield
    // stops the flurry at the kick it blocks. It keeps most of a run.
    attack2: {
      animation: 'attack2',
      recovery: 2 / FPS_0002.attack2,
      hitbox: { x: 12, y: -70, w: 36, h: 62 },
      hitstun: 0.26,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 4 / FPS_0002.attack2, active: 1 / FPS_0002.attack2, damage: 1 },
        { at: 5 / FPS_0002.attack2, active: 1 / FPS_0002.attack2, damage: 1 },
        { at: 6 / FPS_0002.attack2, active: 1 / FPS_0002.attack2, damage: 1 },
        {
          at: 7 / FPS_0002.attack2, active: 1 / FPS_0002.attack2,
          damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal', hitstun: 0.3, hitstop: 0.08,
        },
      ],
      cooldown: 1.2,
      groundOnly: true,
      momentum: 0.8,
      friction: 0.8,
      hitCancel: 8 / FPS_0002.attack2,
    },
    // The Bounce Attack. Curled up, it hangs for a moment (5/60 s), then
    // plunges at 1400 units/s (steering half as well as it drifts) until
    // it meets the ground or an opponent, and bounces back up off either
    // at 900 (about a jump's height): the attack is over, so it can bounce
    // again, twice per airtime. A hit spikes the target (2, Base Launch 2
    // downward).
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 5 / 60,
      active: 0.8,
      recovery: 0.1,
      damage: 2,
      baseLaunch: 2,
      directionalLaunch: 'reverseVertical',
      hitbox: { x: -20, y: -44, w: 40, h: 50 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 0.05,
      cooldown: 0.05,
      airUses: 2,
      motion: { type: 'bounce', fallSpeed: 1400, rebound: 900 },
      airMomentum: 0.8,
      airControl: 0.5,
    },
    // The Spin Attack. It curls into a ball (8/60 s, sliding on: time to
    // see it coming), then rolls the way it faces at 400 units/s plus 0.8
    // of the running speed it had as it curled (up to 1000: a Dash's burst
    // makes it a cannonball), slowing by 420 every second on the ground,
    // for 0.55 s: about 150 units from a standstill, 340 from a full run.
    // As a ball it is a smaller target (its hurtbox is the ball) and it
    // rolls on through the opponent it bowls over (2, Base Launch 1
    // sideways, too short a stun to chase); a Shield stops it dead instead,
    // bouncing it back. Off a ledge it flies on. A long cooldown: an
    // opener, not a string.
    attack3: {
      animation: 'attack3',
      startup: 8 / 60,
      active: 0.4,
      recovery: 0.15,
      damage: 2,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: BALL_HITBOX_0002,
      hitstun: 0.24,
      blockstun: 0.15,
      hitstop: 0.06,
      cooldown: 1.6,
      groundOnly: true,
      motion: { type: 'roll', speed: 400, keep: 0.8, maxSpeed: 1000, friction: 420, recoil: 260 },
      passThrough: true,
      hurtboxes: [{ x: -20, y: -50, w: 40, h: 50 }],
    },
    // The Blue Tornado. Spun into a tornado it rises at 460 units/s
    // (steering half as well as it drifts) for as long as it strikes,
    // then carries on up: about 175 units in all, its way back to the
    // stage. Three strikes of 1 carry its target up with it (carry), the
    // fourth flings it upward (2, Base Launch 2). Once per airtime, and it
    // spends the airtime: after it, no attack or air jump until landing
    // (free fall).
    midair_attack3: {
      animation: 'midair_attack3',
      recovery: 0.15,
      hitbox: { x: -28, y: -80, w: 56, h: 84 },
      hitstun: 0.24,
      blockstun: 0.1,
      hitstop: 0.02,
      carry: { lift: 0 },
      hits: [
        { at: 2 / 60, active: 0.06, damage: 1 },
        { at: 0.1, active: 0.06, damage: 1 },
        { at: 0.18, active: 0.06, damage: 1 },
        {
          at: 0.26, active: 0.06, carry: null,
          damage: 2, baseLaunch: 2, directionalLaunch: 'vertical', hitstun: 0.4, hitstop: 0.07,
        },
      ],
      cooldown: 0.2,
      airUses: 1,
      freeFall: true,
      motion: { type: 'rise', speed: 460 },
      airMomentum: 0.6,
      airControl: 0.5,
    },
    // The Whirlwind (extra_attack). It turns and spins up a whirlwind
    // (frames 1-5), sends it off as a tornado (extra_attack_object) as
    // frame 6 shows, and spins down (7-9). No melee hitbox: the tornado
    // is the attack. A long cooldown: a trap to set, not to spam. A cast,
    // planted on purpose.
    extra_attack: {
      animation: 'extra_attack',
      startup: 5 / FPS_0002.extra_attack,
      active: 1 / FPS_0002.extra_attack,
      recovery: 3 / FPS_0002.extra_attack,
      hitbox: null,
      projectile: { id: 'extra_attack_object', spawnAt: 5 / FPS_0002.extra_attack, offset: { x: 44, y: -39 } },
      cooldown: 1.4,
      groundOnly: true,
      momentum: 0.4,
      friction: 0.8,
    },
  },
};
