// #0001's definition: everything that makes #0001 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0001.md for what each move does in play.
//
// The limitless sorcerer, cut from one supplied sprite sheet (see
// assets/characters/0001/). A fighter of space: it pulls, pushes, erases
// and cannot be touched. Five numbered attacks, each a button of its own,
// plus its extra_attack:
//
//   attack1  the Jab, and in the air a Floating Straight: it stands on the
//            air while it strikes (motion `hover`)
//   attack2  Red, a repelling orb that pushes its target away, shoves a
//            Shield back and turns the other fighter's projectiles around
//            (`repel`, `blockPush`); in the air the Red Kick, a lock-on
//            flying kick that springs off what it meets
//   attack3  Maximum Blue, an attracting orb that drags its target into
//            itself and grinds it (`pull`, `pierce`); in the air Blue, a
//            palm that yanks the opponent in to it (an attack `pull`)
//   attack4  Unlimited Void, a technique: a sure hit round itself that no
//            Shield stops and that paralyzes (`unblockable`, `paralyze`)
//   attack5  Hollow Purple, a technique: a chanted cast that sends a vast
//            sphere through everything (`unblockable`, `erase`)
//   extra_attack  the High Kick, its launcher, floating in the air too
//
// Its Shield is Infinity, on the ground: a hit it blocks stalls in it
// (`stall`). In the air the Shield button is its Deflect, a sweep of the
// arm that turns projectiles back at their thrower; and it has an air dash
// of its own (its midair_mouvment), apart from its Dash. Its orbs spin as
// they fly. Ordinary moves repeat after 0.5 s; Unlimited Void after 3 s,
// Hollow Purple after 5 s. These timers never alter their animation phases.
// Deflect remains at 0; jumps, running and Shield are exempt.

import { frames } from './helpers.js';

// Height in art pixels of #0001's idle (its reference clip). Its art is 1x
// (one file pixel per art pixel, cut from one sprite sheet with its flat
// background made transparent), so no pixel grid is ever looked for in it
// (`visual.pixelSize: 1`): each clip's heightRatio, its tallest frame over
// this, is what sizes it, at exactly one art pixel per file pixel.
const ART_0001 = 63;

// Playback rates of #0001's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their one-frame clips are
// shown once across it, which 6 fps matches.)
const FPS_0001 = Object.freeze({
  idle: 8,
  run: 16,
  mouvment: 6,
  midair_mouvment: 6,
  jump: 15,
  fall: 12,
  land: 20,
  hurt: 12,
  shield: 12,
  deflect: 15,
  attack1: 20,
  midair_attack1: 20,
  attack2: 20,
  midair_attack2: 30,
  attack3: 15,
  midair_attack3: 15,
  attack4_cast: 12,
  attack4_release: 3,
  attack5_cast: 6,
  attack5_release: 3,
  extra_attack: 12,
});

// How fast #0001's orbs spin as they fly, in degrees per second: six whole
// turns a second, a blur of a spin (art only; see rotationSpeed in
// js/game/combat/projectile.js).
const ORB_SPIN_0001 = 2160;

// A clip of `count` frames of codename `codename` (from frame `start`),
// sized by its tallest frame (`height`, art pixels) against the idle.
const clip = (codename, count, fps, height, extra = {}, start = 1) => ({
  frames: frames('0001', codename, count, start),
  fps,
  loop: false,
  heightRatio: height / ART_0001,
  ...extra,
});

export const CHARACTER_0001 = {
  id: '0001',
  displayName: '#0001',
  available: true,
  rosterSlot: 0,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: the idle, run, jump, fall, land, Shield, Dash, air dash and
  // Red Kick poses use the automatic torso anchor. Where an arm thrust
  // forward, a glow in the hand, a sweep's trail or a deep lunge would drag
  // it off the body, a clip authors its own (`anchorX`, art pixels from the
  // left of each frame's visible art): on the black shirt, which stays over
  // the hips whatever the arms do; the High Kick on its planted foot.
  animations: {
    // Standing easy, four frames.
    idle: { ...clip('idle', 4, FPS_0001.idle, 63), loop: true },
    // The walk: an eight-frame stride at full speed. Its rate follows the
    // speed, down to 0.6 of it (and up past it on a Dash's run-on).
    run: { ...clip('run', 8, FPS_0001.run, 61), loop: true, minSpeedScale: 0.6 },
    // Takeoff (a knee up), then tucked on the rise; spread at the top, then
    // straight down, hands on the head. Each holds its last frame.
    jump: clip('jump', 2, FPS_0001.jump, 66),
    fall: clip('fall', 2, FPS_0001.fall, 70),
    // Touchdown: a crouch, then straightening up.
    land: clip('land', 2, FPS_0001.land, 59),
    // mouvment, the Dash: one long, low leap, shown for the whole Dash.
    mouvment: clip('mouvment', 1, FPS_0001.mouvment, 40),
    // midair_mouvment, the air dash: the sheet's one flying leap, laid out
    // flat across the air (the Dash's own drawing, its own file), shown for
    // the whole air dash.
    midair_mouvment: clip('midair_mouvment', 1, FPS_0001.midair_mouvment, 40),
    // Hitstun: `hurt` flinches, then doubles over (held); `midair_hurt` is
    // knocked back with the knees up.
    hurt: clip('hurt', 2, FPS_0001.hurt, 60, { anchorX: [16.5, 16.5] }),
    midair_hurt: clip('midair_hurt', 1, FPS_0001.hurt, 51),
    // Infinity, its Shield: the arms crossed, on the ground.
    shielding: clip('shielding', 1, FPS_0001.shield, 55),
    // deflect, its Deflect: 1 the arm drawn across the body, 2 the palm
    // thrust out, 3 the arm swept up over the head with its trail, 4 the
    // arm raised. The body holds still on the shirt; only the arm moves.
    deflect: clip('deflect', 4, FPS_0001.deflect, 69, { anchorX: [11, 11, 11, 11] }),
    // attack1, the Jab: 1 the stance, 2 the fist drawn back, 3 the punch
    // with its trail, 4-5 the arm out, 6 back.
    attack1: clip('attack1', 6, FPS_0001.attack1, 61, { anchorX: [14.5, 17.5, 16.5, 18, 17, 16.5] }),
    // midair_attack1, the Floating Straight: 1 the stance, 2 drawn back,
    // 3 the lunge with its trail, 4-5 the fist out.
    midair_attack1: clip('midair_attack1', 5, FPS_0001.midair_attack1, 60, { anchorX: [12.5, 17.5, 24.5, 26, 26] }),
    // attack2, Red: 1 the stance, 2-3 the hand raised to the face and the
    // finger up, 4 both palms thrust out (the release), 5 the lunge after it.
    attack2: clip('attack2', 5, FPS_0001.attack2, 61, { anchorX: [14, 12, 13.5, 16, 19.5] }),
    // midair_attack2, the Red Kick: 1 tucked, 2 rolling, 3 laid out, 4 the
    // flying kick (held while it flies).
    midair_attack2: clip('midair_attack2', 4, FPS_0001.midair_attack2, 47),
    // attack3, Maximum Blue: 1 the stance, 2 the hand raised, 3 Blue
    // sparking in it, 4 stepping in, pointing, 5 the palm out as the orb
    // leaves it.
    attack3: clip('attack3', 5, FPS_0001.attack3, 62, { anchorX: [12, 12, 11.5, 18, 18] }),
    // midair_attack3, Blue: 1 the stance, 2 the palm thrust with its trail,
    // 3 pointing, 4 the open palm.
    midair_attack3: clip('midair_attack3', 4, FPS_0001.midair_attack3, 62, { anchorX: [12, 12.5, 12.5, 12] }),
    // attack4, Unlimited Void (a technique, see `techniques`): the cast is
    // gathering itself (1-3, the fists, the arms crossed) and the hand
    // sign rising (4-6); the release is one step forward, the sign held,
    // as the domain closes round its target.
    attack4_cast: clip('attack4', 6, FPS_0001.attack4_cast, 62, { anchorX: [12.5, 17.5, 12.5, 12, 12, 12] }),
    attack4_release: clip('attack4', 1, FPS_0001.attack4_release, 55, { anchorX: [16.5] }, 7),
    // attack5, Hollow Purple (a technique): the cast is the chant, five
    // poses in a deep stance (the hands low, then sweeping up through the
    // swirl, then raised); the release is both hands thrust forward as the
    // sphere leaves them.
    attack5_cast: clip('attack5', 5, FPS_0001.attack5_cast, 54, { anchorX: [21, 23, 19.5, 19.5, 19.5] }),
    attack5_release: clip('attack5', 1, FPS_0001.attack5_release, 54, { anchorX: [19.5] }, 6),
    // extra_attack, the High Kick: 1 the stance, 2 the leap in, 3 the leg
    // rising, 4 the kick, 5 the knee drawn back.
    extra_attack: clip('extra_attack', 5, FPS_0001.extra_attack, 58, { anchorX: [23.5, 28, 17.5, 17.5, 21.5] }),
  },

  // The orbs: one frame each, glowing. Round, so never mirrored (each
  // spins as it flies instead: its projectile's rotationSpeed).
  projectileAnimations: {
    // attack2_object, Red: the red orb.
    attack2_object: { frames: frames('0001', 'attack2_object', 1), fps: 1, loop: true, sourceFacing: 0 },
    // attack3_object, Maximum Blue: the blue orb.
    attack3_object: { frames: frames('0001', 'attack3_object', 1), fps: 1, loop: true, sourceFacing: 0 },
    // attack5_object, Hollow Purple: the purple sphere.
    attack5_object: { frames: frames('0001', 'attack5_object', 1), fps: 1, loop: true, sourceFacing: 0 },
  },

  // Every orb spins six whole turns a second as it flies (rotationSpeed:
  // 2160 degrees per second), art only: its box, path and hits never turn.
  projectiles: {
    // Red: quick and short (600 units/s, about 300 units in its 0.5 s). It
    // repels: a hit pushes its target away (3, Base Launch 1 sideways), a
    // Shield that blocks it is shoved back (520 units/s), and the other
    // fighter's projectiles it meets are turned around, now #0001's.
    attack2_object: {
      animation: 'attack2_object',
      speed: 600,
      lifetime: 0.5,
      hitbox: { x: -16, y: -16, w: 32, h: 32 },
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitstun: 0.36,
      blockstun: 0.16,
      hitstop: 0.08,
      blockPush: 520,
      repel: true,
      rotationSpeed: ORB_SPIN_0001,
    },
    // Maximum Blue: slow (about 240 units in its 1.5 s). It attracts: an
    // opponent within 140 units of it is dragged in at up to 360 units/s
    // and held there, grinding: three strikes 0.25 s apart, 1 Launch Point
    // each with no launch, the third the collapse, 3 and a Base Launch 1
    // pop upward. 5 in all. A Shield is not pulled, and blocking a strike
    // ends it.
    attack3_object: {
      animation: 'attack3_object',
      speed: 160,
      lifetime: 1.5,
      hitbox: { x: -32, y: -32, w: 64, h: 64 },
      damage: 1,
      baseLaunch: 0,
      directionalLaunch: null,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.02,
      pull: { radius: 140, speed: 360 },
      pierce: { hits: 3, interval: 0.25 },
      finisher: { damage: 3, baseLaunch: 1, directionalLaunch: 'vertical', hitstun: 0.4, hitstop: 0.06 },
      rotationSpeed: ORB_SPIN_0001,
    },
    // Hollow Purple: a vast sphere (116 units across where it strikes)
    // crossing the stage at 640 units/s for 1.8 s. It erases: no Shield
    // stops it, it erases the projectiles it meets and it flies on through
    // whatever it strikes. Its one hit is the heaviest #0001 has: 10, the
    // top damage tier, Base Launch 3 sideways.
    attack5_object: {
      animation: 'attack5_object',
      speed: 640,
      lifetime: 1.8,
      hitbox: { x: -58, y: -58, w: 116, h: 116 },
      damage: 10,
      baseLaunch: 3,
      directionalLaunch: 'horizontal',
      hitstun: 0.55,
      blockstun: 0.3,
      hitstop: 0.12,
      unblockable: true,
      erase: true,
      rotationSpeed: ORB_SPIN_0001,
    },
  },

  // A still idle frame for the airborne, landing and hurt clips if their
  // frames fail to load. Attacks, the Shield, the Deflect, the Dash and the
  // air dash never fall back: one whose frames are missing is refused.
  animationFallbacks: {
    jump: { animation: 'idle', frame: 0 },
    fall: { animation: 'idle', frame: 0 },
    land: { animation: 'idle', frame: 0 },
    hurt: { animation: 'idle', frame: 0 },
    midair_hurt: { animation: 'idle', frame: 0 },
  },

  visual: {
    // Its 63-pixel idle at the roster's common art-pixel size, 88/52 world
    // units per art pixel (so every fighter's pixels are the same size on
    // screen): about 107 units, a tall fighter.
    height: ART_0001 * (88 / 52),
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.2, size: 0.42 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its white hair,
    // the silver of its trousers, its bright cyan eyes (Maximum Blue's
    // glow) and its black shirt.
    eliminationPalette: ['#f4f4f6', '#a8a8b2', '#58f0f0', '#1c1c22'],
  },

  // Its body, measured from its idle: the head and shirt, then the legs.
  // Collision is independent of the art.
  collider: { width: 32, height: 100 },
  pushbox: { width: 36 },
  hurtboxes: [
    { x: -17, y: -104, w: 34, h: 52 }, // head and torso
    { x: -19, y: -52, w: 38, h: 52 }, // legs
  ],

  // How #0001 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): 0.2 s more stun per 1000 units/s, 0.7 s more
  // at most, tumbling from 1100 units/s, and a held direction bends a
  // launch by up to 18 degrees: it reads a launch a little better than
  // most.
  launchReaction: {
    stunPerThousand: 0.2,
    maxStun: 0.7,
    tumbleSpeed: 1100,
    steerAngle: 18,
  },

  // Energy (see resolveEnergy in js/game/combat/combat-state.js): the same
  // bar and the same costs as every fighter's (100; a Dash, an air dash or a
  // Dash cancel 25, a Deflect 15, each blocked hit 15). Its own is only how
  // fast it refills: 14 a second.
  energy: {
    regen: 14,
  },

  // Infinity, what the `shield` input does for #0001 on the ground: a
  // Shield all round it, arms crossed. A melee blow it blocks stalls in it:
  // the attacker freezes 0.25 s (its own hitstop if longer), time to
  // punish. Its perfect Shield opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
    stall: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0001 in the air (schema:
  // js/game/combat/deflect.js): frame 1 the arm drawn across, then the palm
  // thrust out and swept up over the head (frames 2-3, live: the whole
  // front the arm sweeps, from the waist to well over the head, out to 50
  // units, past the palm), frame 4 the arm raised, held a frame longer.
  // Every Deflect's 3, Base Launch 2, here upward, the way the arm sweeps;
  // while the sweep is live it turns the other fighter's projectiles back
  // at their thrower, now #0001's. A third of a second in all, falling as
  // it sweeps and carrying the whole of its drift; no cooldown (the sweep
  // itself, and its Energy, are its only limits).
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0001.deflect,
    active: 2 / FPS_0001.deflect,
    recovery: 2 / FPS_0001.deflect,
    hitbox: { x: 6, y: -118, w: 44, h: 98 },
    directionalLaunch: 'vertical',
    hitstun: 0.32,
    blockstun: 0.14,
    hitstop: 0.05,
    cooldown: 0,
    airMomentum: 1,
    airControl: 0.4,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 to attack3 ordinary attacks with their
  // mid-air versions, attack4 and attack5 techniques (ground only, with no
  // cooldown). Transform is reserved.
  actions: {
    extra_attack: 'extra_attack', // the High Kick
    transform: null, // reserved
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Jab / the Floating Straight
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // Red / the Red Kick
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // Maximum Blue / Blue
    attack4: { type: 'technique', id: 'attack4' }, // Unlimited Void
    attack5: { type: 'technique', id: 'attack5' }, // Hollow Purple
  },

  // UI only: a frame of each move's own art, the orb itself for Red, Blue
  // and Hollow Purple (zero-based frames).
  mobileAbilities: {
    extra_attack: { label: 'High Kick', preview: { animation: 'extra_attack', frame: 3 } },
    attack1: { label: 'Jab', preview: { animation: 'attack1', frame: 3 }, previews: { air: { animation: 'midair_attack1', frame: 3 } } },
    attack2: {
      label: 'Red',
      preview: { collection: 'projectileAnimations', animation: 'attack2_object', frame: 0 },
      previews: { air: { animation: 'midair_attack2', frame: 3 } },
    },
    attack3: {
      label: 'Maximum Blue',
      preview: { collection: 'projectileAnimations', animation: 'attack3_object', frame: 0 },
      previews: { air: { animation: 'midair_attack3', frame: 1 } },
    },
    attack4: { label: 'Unlimited Void', preview: { animation: 'attack4_cast', frame: 5 } },
    attack5: { label: 'Hollow Purple', preview: { collection: 'projectileAnimations', animation: 'attack5_object', frame: 0 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'High Kick',
    attack1: 'Jab',
    midair_attack1: 'Floating Straight',
    attack2: 'Red',
    midair_attack2: 'Red Kick',
    attack3: 'Maximum Blue',
    midair_attack3: 'Blue',
    attack4: 'Unlimited Void',
    attack5: 'Hollow Purple',
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). Each is a cast: #0001 stands committed to
  // it, then lets go all at once. A hit on #0001 before it lets go breaks
  // it (nothing released), and it needs the ground throughout. Cooldowns
  // begin on acceptance and run on even if interrupted: 3 s and 5 s.
  techniques: {
    // Unlimited Void: half a second to cast, then the domain closes round
    // #0001 as it steps forward: every opponent within 250 units either
    // side, from well over its head to its feet, takes a sure hit no Shield
    // stops (3) and is paralyzed for 1.7 s, unable to act, until then or
    // until a hit launches it. #0001 is free again a third of a second
    // later: about 1.4 s of an opponent that cannot move.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      cooldown: 3,
      burst: {
        hitbox: { x: -250, y: -210, w: 500, h: 230 },
        hit: { damage: 3, unblockable: true, paralyze: 1.7, hitstun: 0.25, blockstun: 0, hitstop: 0.12 },
      },
    },
    // Hollow Purple: the chant, five-sixths of a second (still its longest
    // telegraph); then the sphere leaves both hands (see
    // projectiles.attack5_object) and #0001 holds the pose for 1/3 s.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      cooldown: 5,
      projectile: { id: 'attack5_object', offset: { x: 95, y: -60 } },
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). Every strike keeps the speed #0001 brings into
  // it unless its entry says otherwise: only its casts (Red, Maximum Blue)
  // are planted. Each ordinary move has a 0.5-second repeat delay,
  // independent of its phases and of other moves' cooldowns.
  attacks: {
    // The Jab: frames 1-2 the wind-up, 3-4 the punch (its box out to 40
    // units, at the shoulders, just short of the fist's tip), 5-6 back,
    // 0.3 s in all. Light and quick (3), with a crisp two-step freeze, it
    // pushes (Base Launch 1 sideways) and opens a follow-up once it has
    // hit; its repeat timer prevents immediate same-move strings. It keeps all
    // the speed it is thrown at (a Dash's included), sliding on under 0.6
    // of the ground deceleration, never steered.
    attack1: {
      animation: 'attack1',
      startup: 2 / FPS_0001.attack1,
      active: 2 / FPS_0001.attack1,
      recovery: 2 / FPS_0001.attack1,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: { x: 12, y: -82, w: 28, h: 26 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      cooldown: 0.5,
      groundOnly: true,
      momentum: 1,
      friction: 0.6,
      hitCancel: 2 / FPS_0001.attack1,
    },
    // The Floating Straight: frames 1-2 the wind-up, 3-4 the lunging
    // punch (3, Base Launch 1 sideways), 5 recovering, standing on the air
    // throughout (no fall: motion `hover`), drifting on most of its speed
    // (an air dash's burst carries it into a flying punch) with a little
    // steering. Twice per airtime.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 2 / FPS_0001.midair_attack1,
      active: 2 / FPS_0001.midair_attack1,
      recovery: 1 / FPS_0001.midair_attack1,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: { x: 12, y: -78, w: 34, h: 28 },
      hitstun: 0.34,
      blockstun: 0.14,
      hitstop: 1 / 30,
      cooldown: 0.5,
      airUses: 2,
      motion: { type: 'hover' },
      airMomentum: 0.8,
      airControl: 0.5,
      hitCancel: 2 / FPS_0001.midair_attack1,
    },
    // Red: frames 1-3 the hand sign, 4 the palms thrust out (the orb leaves
    // them, see projectiles.attack2_object), 5 the lunge after, held a
    // frame longer. No melee hitbox: Red is the attack. A cast, planted on
    // purpose: it keeps half a run and stops quickly.
    attack2: {
      animation: 'attack2',
      startup: 3 / FPS_0001.attack2,
      active: 1 / FPS_0001.attack2,
      recovery: 2 / FPS_0001.attack2,
      hitbox: null,
      projectile: { id: 'attack2_object', spawnAt: 3 / FPS_0001.attack2, offset: { x: 44, y: -70 } },
      cooldown: 0.5,
      groundOnly: true,
      momentum: 0.5,
      friction: 0.8,
    },
    // The Red Kick: tucked, rolling and laid out (frames 1-3, the lock-on:
    // it hangs a tenth of a second), then the flying kick: a dash at 1050
    // units/s for up to 0.22 s at its opponent, if within 230 units and not
    // behind it, re-aimed every step. The hit blasts the target away (3,
    // Base Launch 2 sideways), a Shield is shoved back, and #0001 springs
    // off what it met (620 up, 240 back). Once per airtime.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 3 / FPS_0001.midair_attack2,
      active: 0.22,
      recovery: 0.1,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 6, y: -46, w: 44, h: 44 },
      hitstun: 0.38,
      blockstun: 0.15,
      hitstop: 0.07,
      blockPush: 400,
      cooldown: 0.5,
      airUses: 1,
      motion: { type: 'homing', range: 230, speed: 1050, rebound: 620, recoil: 240, exit: 0.3 },
      airMomentum: 0.6,
      hitCancel: 3 / FPS_0001.midair_attack2,
    },
    // Maximum Blue: frames 1-4 Blue gathering in the raised hand, 5 the
    // palm out as the orb leaves it (see projectiles.attack3_object), held
    // two frames more. A trap to set; a cast, planted on purpose, and the
    // whole cast is all that holds back the next one.
    attack3: {
      animation: 'attack3',
      startup: 4 / FPS_0001.attack3,
      active: 1 / FPS_0001.attack3,
      recovery: 2 / FPS_0001.attack3,
      hitbox: null,
      projectile: { id: 'attack3_object', spawnAt: 4 / FPS_0001.attack3, offset: { x: 78, y: -69 } },
      cooldown: 0.5,
      groundOnly: true,
      momentum: 0.4,
      friction: 0.8,
    },
    // Blue: frame 1, then the palm thrust and the point (2-3): while they
    // last, an opponent within 190 units of the palm is yanked in to it at
    // up to 1300 units/s, and the palm strikes whoever it brought (3, Base
    // Launch 1 upward). Standing on the air throughout. Once per airtime.
    midair_attack3: {
      animation: 'midair_attack3',
      startup: 1 / FPS_0001.midair_attack3,
      active: 2 / FPS_0001.midair_attack3,
      recovery: 2 / FPS_0001.midair_attack3,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'vertical',
      hitbox: { x: 16, y: -96, w: 44, h: 50 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
      cooldown: 0.5,
      airUses: 1,
      pull: { radius: 190, speed: 1300, offset: { x: 50, y: -72 } },
      motion: { type: 'hover' },
      airMomentum: 0.6,
      airControl: 0.3,
      hitCancel: 1 / FPS_0001.midair_attack3,
    },
    // The High Kick: frame 1, the leap in on frame 2 (forward speed raised
    // to at least 300 on the ground), 3 the leg rising, 4 the kick (out to
    // about 58 units, chest to head height), 5 the knee drawn back, held a
    // frame more. #0001's launcher, and so still telegraphed (a quarter of a
    // second before it lands, its old rate: any quicker and the Jab strings
    // into it far longer) and punishable: 5, the heavy tier, Base Launch 2
    // upward. It keeps the speed it is thrown at. In the air it stands on
    // the air while it kicks, once per airtime.
    extra_attack: {
      animation: 'extra_attack',
      startup: 3 / FPS_0001.extra_attack,
      active: 1 / FPS_0001.extra_attack,
      recovery: 2 / FPS_0001.extra_attack,
      damage: 5,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: 12, y: -72, w: 46, h: 34 },
      hitstun: 0.3,
      blockstun: 0.15,
      hitstop: 0.08,
      cooldown: 0.5,
      momentum: 1,
      friction: 0.6,
      step: { at: 1 / FPS_0001.extra_attack, speed: 300 },
      airUses: 1,
      motion: { type: 'hover' },
      airMomentum: 0.8,
      airControl: 0.4,
      hitCancel: 3 / FPS_0001.extra_attack,
    },
  },
};
