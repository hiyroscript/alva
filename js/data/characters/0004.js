// #0004's definition: everything that makes #0004 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0004.md for what each move does in play.
//
// The virtual singer, cut from one supplied sprite sheet (see
// assets/characters/0004/). A singer whose voice is its power: its song
// charms whoever hears it, it sings notes across the stage, its signature
// leek is its weapon, and its little leek-waving double dances at its side.
// Its strikes are dance steps. Five numbered attacks, each a button of its
// own, plus its extra_attack:
//
//   attack1  the Dance Combo, a backhand swipe that holds its target, then
//            a punch (two strikes); in the air the Air Dance, a low sweeping
//            kick, then a rising crescent kick
//   attack2  the Leek Swing, the leek brought down from overhead to the
//            ground in front, its longest reach; in the air the Leekspin,
//            the leek twirled as it rises (motion `rise`), carrying its
//            target up with it (`carry`) before flinging it away: its way
//            back to the stage
//   attack3  the Crescent Kick, a spinning high kick that launches straight
//            up; in the air the Stage Dive, a feet-first plunge (motion
//            `slam`) that drives down whatever it meets and lands in a
//            crouch, popping up whoever stands beside the landing
//   attack4  Ievan Polkka, a technique: it calls up its little double, who
//            stands where it appears waving its leek (a projectile that does
//            not move, `pierce`): six quick hits on whoever stays by it,
//            then a launch
//   attack5  World is Mine, a technique: it sings into its microphone and a
//            ring of sound goes out round it (a burst, its art the ring:
//            `effect`) that charms everyone it reaches (`charm`): for 2.5 s
//            every hit they would land on #0004 heals it instead
//   extra_attack  the Melody, a sung note that flies across the stage and
//            turns back any projectile it meets (`repel`)
//
// Its Shield is a raised hand, on the ground. In the air the Shield button
// is its Deflect, a rising uppercut whose arc turns projectiles back. Its
// Dash is a rush forward, the hair streaming behind; its air dash a leap
// through the air. Its cooldowns are the shared policy's
// (js/data/cooldowns.js), derived from what each move does, never authored
// here: Ievan Polkka waits 5 s (its double's strikes add up to 10), World
// is Mine 3 s (a charm), each from its release; every other move none at
// all (the Melody, a sung note it sends flying, costs 15 Energy instead),
// and the Deflect none. These timers never alter their animation phases. The sheet's intro, victory and defeat poses and its full-screen
// cut-in pictures are no move.

import { frames, pad, flick, legacyPad } from './helpers.js';

// Height in art pixels of #0004's idle (its reference clip). Its art is 1x
// (one file pixel per art pixel, cut from one sprite sheet with its flat
// background made transparent), so no pixel grid is ever looked for in it
// (`visual.pixelSize: 1`): each clip's heightRatio, its tallest frame over
// this, is what sizes it, at exactly one art pixel per file pixel.
const ART_0004 = 49;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0004 = 88 / 52;

// Playback rates of #0004's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their two-frame clips are
// shown once across it, which 12 fps matches.)
const FPS_0004 = Object.freeze({
  idle: 8,
  run: 16,
  mouvment: 12,
  midair_mouvment: 12,
  jump: 10,
  fall: 10,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 20,
  attack1: 20,
  midair_attack1: 20,
  attack2: 10,
  midair_attack2: 15,
  attack3: 20,
  midair_attack3: 15,
  attack4_cast: 10,
  attack4_release: 4,
  attack4_object: 12,
  attack5_cast: 2,
  attack5_release: 3,
  attack5_object: 30,
  extra_attack: 15,
  extra_attack_object: 4,
});

// The Stage Dive's plunge, in seconds: the tuck before it (its first frame)
// and the longest it plunges before it gives up on the ground.
const DIVE_HANG_0004 = 1 / FPS_0004.midair_attack3;
const DIVE_PLUNGE_0004 = 0.8;

// A clip of `count` frames of codename `codename` (from frame `start`),
// sized by its tallest frame (`height`, art pixels) against the idle.
const clip = (codename, count, fps, height, extra = {}, start = 1) => ({
  frames: frames('0004', codename, count, start),
  fps,
  loop: false,
  heightRatio: height / ART_0004,
  ...extra,
});

export const CHARACTER_0004 = {
  id: '0004',
  displayName: '#0004',
  available: true,
  rosterSlot: 3,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: the idle, the Shield and the singing poses use the automatic
  // torso anchor. Its long twin tails stream far behind it whenever it
  // moves, which would drag that anchor off the body, so every clip whose
  // hair (or leek, or a kick's trail) swings wide authors its own
  // (`anchorX`, art pixels from the left of each frame's visible art): on
  // the body, between the shirt and the skirt, which stays over the hips.
  animations: {
    // The stance, weight shifting from foot to foot: four frames.
    idle: { ...clip('idle', 4, FPS_0004.idle, 49), loop: true },
    // The run: an eight-frame stride, the twin tails streaming behind. Its
    // rate follows the speed, down to 0.6 of it (and up past it on a
    // Dash's run-on).
    run: { ...clip('run', 8, FPS_0004.run, 55, { anchorX: [30.5, 36.5, 38, 37, 31.5, 36.5, 37, 37.5] }), loop: true, minSpeedScale: 0.6 },
    // Takeoff, a crouch, then rising, the hair trailing below (held on the
    // rise); then the descent, the hair flung up; touching down, the hair
    // flaring out, then a crouch on it.
    jump: clip('jump', 2, FPS_0004.jump, 54, { anchorX: [13, 27] }),
    fall: clip('fall', 3, FPS_0004.fall, 74, { anchorX: [24.5, 12, 27] }),
    land: clip('land', 2, FPS_0004.land, 47, { anchorX: [44, 27] }),
    // mouvment, the Dash: a rush forward, the hair streaming behind, played
    // once across the whole Dash.
    mouvment: clip('mouvment', 2, FPS_0004.mouvment, 50, { anchorX: [32, 42] }),
    // midair_mouvment, the air dash: a leap through the air, an arm flung
    // ahead, played once across the whole air dash.
    midair_mouvment: clip('midair_mouvment', 2, FPS_0004.midair_mouvment, 52, { anchorX: [31.5, 35] }),
    // Hitstun: `hurt` recoils, then doubles over (held); `midair_hurt` is
    // flung flat on its back.
    hurt: clip('hurt', 2, FPS_0004.hurt, 47, { anchorX: [22.5, 21] }),
    midair_hurt: clip('midair_hurt', 1, FPS_0004.hurt, 28, { anchorX: [22] }),
    // Its guard, on the ground: a hand raised before it, held.
    shielding: clip('shielding', 1, FPS_0004.shield, 46),
    // deflect, its Deflect: 1 the stance, 2 the fist drawn back, 3 the
    // uppercut with its arc, 4 the fist raised.
    deflect: clip('deflect', 4, FPS_0004.deflect, 58, { anchorX: [14, 14, 23, 18] }),
    // attack1, the Dance Combo: 1 a crouch, 2 a spin, the hair flying up,
    // 3-4 the backhand swipe with its trail, 5 the arm drawn back, 6 the
    // punch, 7 back.
    attack1: clip('attack1', 7, FPS_0004.attack1, 67, { anchorX: [25, 25.5, 25, 25.5, 16.5, 15.5, 15] }),
    // midair_attack1, the Air Dance: 1 a knee drawn up, 2 a leg swung back,
    // 3 the low sweep with its trail, 4 the rising crescent with its trail,
    // 5 the high kick, 6-7 back.
    midair_attack1: clip('midair_attack1', 7, FPS_0004.midair_attack1, 67, { anchorX: [26, 30.5, 34.5, 34, 38.5, 36.5, 16.5] }),
    // attack2, the Leek Swing: 1 the leek raised overhead, 2 the swing with
    // its arc, 3 the leek low in front.
    attack2: clip('attack2', 3, FPS_0004.attack2, 56, { anchorX: [19, 20, 18] }),
    // midair_attack2, the Leekspin: 1 the leek gathered up, 2 the upward
    // swing with its arc, 3 upturned under the leek's arc overhead, 4 the
    // swing down, 5 drifting, the leek held out.
    midair_attack2: clip('midair_attack2', 5, FPS_0004.midair_attack2, 80, { anchorX: [18.5, 36, 48, 17.5, 26.5] }),
    // attack3, the Crescent Kick: 1-2 the stance, 3 the knee up, 4-6 the
    // spin and the high kick with its trail, 7 the leg coming down, 8 back.
    attack3: clip('attack3', 8, FPS_0004.attack3, 51, { anchorX: [15.5, 15, 15.5, 20, 20.5, 21, 16, 14] }),
    // midair_attack3, the Stage Dive: 1 tucked, 2 the dive, legs first, the
    // hair streaming up (3, held through the plunge); then, landed, its
    // impact clip (midair_attack3_impact): 4 crouched on landing, 5 lower,
    // the hair settling, 6 rising.
    midair_attack3: clip('midair_attack3', 3, FPS_0004.midair_attack3, 83, { anchorX: [28.5, 26, 18] }),
    midair_attack3_impact: clip('midair_attack3', 3, FPS_0004.midair_attack3, 61, { anchorX: [28.5, 22.5, 16.5] }, 4),
    // attack4, Ievan Polkka (a technique, see `techniques`): the cast is
    // the stance (1), a breath (2), a fist raised (3) and the arm thrown out
    // to call (4); the release holds that call (4) as its double appears.
    attack4_cast: clip('attack4', 4, FPS_0004.attack4_cast, 49),
    attack4_release: clip('attack4', 1, FPS_0004.attack4_release, 49, {}, 4),
    // attack5, World is Mine (a technique): the cast is the microphone held
    // to its mouth, singing (1); the release is the microphone thrust up as
    // the ring of sound goes out (2).
    attack5_cast: clip('attack5', 1, FPS_0004.attack5_cast, 49),
    attack5_release: clip('attack5', 1, FPS_0004.attack5_release, 49, {}, 2),
    // extra_attack, the Melody: 1 the stance, 2 a breath, 3 a fist raised,
    // 4 the arm pointing out as the note goes.
    extra_attack: clip('extra_attack', 4, FPS_0004.extra_attack, 49),
  },

  // Projectile art, normalized at its own size (never fitted to the
  // fighter's height): the Melody's note, shrinking as it flies (four
  // frames over its one second, never mirrored: a note reads the same
  // either way), and Ievan Polkka's little double, waving its leek round
  // and round (drawn facing right, like the fighter).
  projectileAnimations: {
    extra_attack_object: {
      frames: frames('0004', 'extra_attack_object', 4),
      fps: FPS_0004.extra_attack_object,
      loop: false,
      sourceFacing: 0,
    },
    attack4_object: {
      frames: frames('0004', 'attack4_object', 8),
      fps: FPS_0004.attack4_object,
      loop: true,
      sourceFacing: 1,
    },
  },

  // Effect art, normalized at its own size: World is Mine's ring of sound,
  // a stave of notes round it, growing from a spark, turning, and fading
  // (39 frames, about 1.3 s, played once where it goes out).
  effectAnimations: {
    attack5_object: {
      frames: frames('0004', 'attack5_object', 39),
      fps: FPS_0004.attack5_object,
      loop: false,
    },
  },

  projectiles: {
    // The Melody's note: 400 units/s for a second (400 units), 3 at Base
    // Launch 1 sideways. Its voice drowns out what it meets: another
    // fighter's projectile is turned back (`repel`), now #0004's. A Shield
    // blocks it (and stops it there).
    extra_attack_object: {
      animation: 'extra_attack_object',
      speed: 400,
      lifetime: 1,
      hitbox: { x: -14, y: -14, w: 28, h: 28 },
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 0.05,
      repel: true,
    },
    // Ievan Polkka's double: it stands where it appears (no speed) for 2.4
    // s, waving its leek: whoever stays by it is struck six times 0.3 s
    // apart, 1 each with no launch, a stun just longer than the gap so a
    // caught target stays caught, the sixth a finisher of 5 that throws it
    // up (Base Launch 2). 10 in all: the cooldown policy's 5 s. A Shield
    // stops it at the first strike it blocks; a Deflect turns it against
    // #0004.
    attack4_object: {
      animation: 'attack4_object',
      speed: 0,
      lifetime: 2.4,
      // Its body and the leek it waves (its art is about 54 units square),
      // standing on the ground where it was called.
      hitbox: { x: -24, y: -27, w: 48, h: 54 },
      damage: 1,
      hitstun: 0.34,
      blockstun: 0.12,
      hitstop: 0.03,
      pierce: { hits: 6, interval: 0.3 },
      finisher: { damage: 5, baseLaunch: 2, directionalLaunch: 'vertical', hitstun: 0.4, hitstop: 0.08 },
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
    // Its 49-pixel idle at the roster's common art-pixel size, 88/52 world
    // units per art pixel (so every fighter's pixels are the same size on
    // screen): about 83 units, a little taller than #0003.
    height: ART_0004 * UNIT_0004,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.22, size: 0.5 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its teal hair in
    // three shades, its pale grey shirt and the pink of its hair ties.
    eliminationPalette: ['#49b8b2', '#00a0a9', '#00676c', '#dcdcdc', '#f50a86'],
  },

  // Its body, measured from its idle (the twin tails are hair, not body):
  // the head and shirt, then the skirt and legs. Collision is independent of
  // the art.
  collider: { width: 26, height: 76 },
  pushbox: { width: 30 },
  hurtboxes: [
    { x: -15, y: -82, w: 30, h: 42 }, // head and shirt
    { x: -16, y: -40, w: 32, h: 40 }, // skirt and legs
  ],

  // How #0004 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): 0.15 s more stun per 1000 units/s, 0.55 s
  // more at most, tumbling from 1100 units/s, and a held direction bends a
  // launch by up to 18 degrees: a dancer's balance, quick to come round in
  // the air.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.55,
    tumbleSpeed: 1100,
    steerAngle: 18,
  },

  // Energy (see resolveEnergy in js/game/combat/combat-state.js and
  // js/data/energy.js): the same bar and the same price as every
  // fighter's (100; 15 for a Dash, an air dash or a Dash cancel, a Deflect,
  // each blocked hit, and each ordinary move that creates a construct). Its
  // own is only how fast it refills: 14 a second, a performer's breath control.
  energy: {
    regen: 14,
  },

  // Its guard, what the `shield` input does for #0004 on the ground: a hand
  // raised before it, held. Its perfect Shield opens for 0.1 s after
  // 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0004 in the air (schema:
  // js/game/combat/deflect.js): frames 1-2 the fist drawn back, then the
  // uppercut (frames 3-4, live: the front of the body from below the knees
  // to over the head, out to 40 units, the arc the fist sweeps), then the
  // fist raised a frame more. Every Deflect's 3, Base Launch 2, here
  // upward, the way the uppercut goes; while the arc is live it turns the
  // other fighter's projectiles back at their thrower, now #0004's. A
  // quarter of a second in all, keeping the whole of its drift, steered as
  // a medium strike (js/data/attack-mobility.js); no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 2 / FPS_0004.deflect,
    active: 2 / FPS_0004.deflect,
    recovery: 1 / FPS_0004.deflect,
    hitbox: { x: 0, y: -98, w: 40, h: 88 },
    directionalLaunch: 'vertical',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    mobility: 'medium',
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 to attack3 ordinary attacks with their
  // mid-air versions, attack4 and attack5 techniques (ground only).
  actions: {
    extra_attack: 'extra_attack', // the Melody
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Dance Combo / the Air Dance
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Leek Swing / the Leekspin
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Crescent Kick / the Stage Dive
    attack4: { type: 'technique', id: 'attack4' }, // Ievan Polkka
    attack5: { type: 'technique', id: 'attack5' }, // World is Mine
  },

  // Its Special abilities (js/data/special-abilities.js): World is Mine
  // alone, the song that charms, turning its opponents' hits into its own
  // healing. Ievan Polkka is a technique too, but an ordinary ground attack
  // to the player: a dancing obstacle.
  specialAbilities: ['attack5'],

  // UI only: a frame of each move's own art (zero-based frames): the
  // note, the swipe, the crescent, the leek's arcs, the kick, the dive, the
  // little double, the microphone raised.
  mobileAbilities: {
    extra_attack: { label: 'Melody', preview: { collection: 'projectileAnimations', animation: 'extra_attack_object', frame: 0 } },
    attack1: { label: 'Dance Combo', preview: { animation: 'attack1', frame: 2 }, previews: { air: { animation: 'midair_attack1', frame: 3 } } },
    attack2: { label: 'Leek Swing', preview: { animation: 'attack2', frame: 1 }, previews: { air: { animation: 'midair_attack2', frame: 2 } } },
    attack3: { label: 'Crescent Kick', preview: { animation: 'attack3', frame: 4 }, previews: { air: { animation: 'midair_attack3', frame: 1 } } },
    attack4: { label: 'Ievan Polkka', preview: { collection: 'projectileAnimations', animation: 'attack4_object', frame: 0 } },
    attack5: { label: 'World is Mine', preview: { animation: 'attack5_release', frame: 0 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Melody',
    attack1: 'Dance Combo',
    midair_attack1: 'Air Dance',
    attack2: 'Leek Swing',
    midair_attack2: 'Leekspin',
    attack3: 'Crescent Kick',
    midair_attack3: 'Stage Dive',
    attack4: 'Ievan Polkka',
    attack5: 'World is Mine',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0004.<move>.description).
  abilityDescriptions: {
    extra_attack: 'Sings a note that flies across the stage; its voice turns back any projectile it meets.',
    attack1: 'A dance step: a backhand swipe that holds the opponent, then a punch that pushes them away.',
    midair_attack1: 'Dances on the air: a low sweeping kick, then a rising crescent kick that sends the opponent up.',
    attack2: 'Brings the leek down from overhead to the ground in front: long reach, sending the opponent flying sideways.',
    midair_attack2: 'Rises twirling the leek, carrying the opponent up along with it, then flings them away. Once per airtime.',
    attack3: 'A spinning high kick that launches the opponent straight up: an anti-air.',
    midair_attack3: 'Dives feet-first, driving down whatever it meets, and pops up anyone beside the spot where it lands.',
    attack4: 'Calls up a little leek-waving double that dances in place: six quick hits on anyone who stays by it, then a launch.',
    attack5: 'Sings out a ring of sound that charms everyone it reaches: for 2.5 s, their hits on you heal you instead.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     the Dance Combo; in the air the Air Dance, its basic
  //                  aerial, a dance step too
  //   Triangle / Y   the Leek Swing, its longest reach
  //   Circle / B     the Crescent Kick, its launcher: a thumb's roll after
  //                  the Dance Combo, quick enough to string it (the right
  //                  stick would be too slow for it, however upward the
  //                  kick)
  //   R2 / RT        the Melody: pull the trigger to sing the note across
  //                  the stage
  //   L2 / LT        World is Mine, its Special: the ring of sound round
  //                  it, on a trigger never squeezed by accident
  //   right stick    Ievan Polkka: the little double appears in front, the
  //   forward        way #0004 faces; the stick pushed where it will stand
  //   right stick    the Leekspin, twirling upward: the stick pushed the way
  //   up (air)       it rises, its way back to the stage
  //   right stick    the Stage Dive, feet first: the stick pushed the way it
  //   down (air)     dives, never one press of the attack button away off
  //                  the stage, where it dives into the Void
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:attack3': pad('east'),
      'ground:extra_attack': pad('r2'),
      'ground:attack5': pad('l2'),
      'ground:attack4': flick('forward'),
      'air:attack1': pad('west'),
      'air:attack2': flick('up'),
      'air:attack3': flick('down'),
    },
    // The layout it recommended until the right stick and the bumpers were
    // redesigned (settings version 5), only to tell which bindings of a
    // profile saved then were the player's own.
    previous: {
      'ground:attack1': legacyPad('west'),
      'ground:attack2': legacyPad('north'),
      'ground:attack3': legacyPad('west', { direction: 'up' }),
      'ground:attack4': legacyPad('north', { modifier: 'r2' }),
      'ground:attack5': legacyPad('north', { modifier: 'l2' }),
      'ground:extra_attack': legacyPad('r1'),
      'air:attack1': legacyPad('west'),
      'air:attack2': legacyPad('north'),
      'air:attack3': legacyPad('west', { direction: 'down' }),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). Each is a cast: #0004 stands committed to
  // it, then lets go all at once. A hit on #0004 before it lets go breaks
  // it (nothing released), and it needs the ground throughout. Cooldowns
  // begin as each releases (a cast broken before then starts none) and run
  // on whatever follows.
  techniques: {
    // Ievan Polkka: 0.4 s to call (four frames at 10 fps), then the double
    // appears 62 units in front of #0004, standing on the ground (its
    // projectile, above), as #0004 holds the call for a quarter of a second
    // more: 0.65 s in all. The policy's 5 s, its double's strikes adding up
    // to 10.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      projectile: { id: 'attack4_object', offset: { x: 62, y: -27 } },
    },
    // World is Mine: half a second singing into the microphone (its
    // longest commitment, and nothing protects it), then the microphone
    // thrust up for a third of a second as the ring of sound goes out round
    // #0004 (its effect, centred on the waist): 150 units either side, from
    // the feet to a jump's height over the head. Everyone it reaches takes 1, no
    // launch, a short stun, and is charmed for 2.5 s: until it runs out,
    // every hit they would land on #0004 (a strike, a projectile, anything)
    // takes that much Launch Point off #0004 instead, and does nothing else.
    // A raised Shield blocks it (no charm). The policy's 3 s, for the charm.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      burst: {
        hitbox: { x: -150, y: -150, w: 300, h: 160 },
        hit: { damage: 1, hitstun: 0.3, blockstun: 0.12, hitstop: 0.06, charm: 2.5 },
        effect: { animation: 'attack5_object', offset: { x: 0, y: -30 } },
      },
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown (the cooldown policy's: none
  // deals 10, paralyzes or charms); the Melody, an ordinary projectile,
  // costs 15 Energy. Each moves by
  // the mobility tier its role gives it (js/data/attack-mobility.js): its
  // dance strings quick, so they flow with the run and the drift, its swings
  // and the Melody medium, the Stage Dive heavy.
  attacks: {
    // The Dance Combo: the crouch and the spin (frames 1-2), then two
    // strikes. The backhand swipe (frames 3-4): 1 and no launch, a stun
    // long enough to hold the target for the next. The punch (frame 6): 3,
    // Base Launch 1 sideways. Back on frame 7: 0.35 s in all. It opens a
    // follow-up once the punch is thrown. A quick strike: it keeps all the
    // speed it starts with (a Dash's included) and the run on through it.
    attack1: {
      animation: 'attack1',
      recovery: 1 / FPS_0004.attack1,
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0004.attack1, active: 2 / FPS_0004.attack1, hitbox: { x: 4, y: -66, w: 32, h: 34 }, damage: 1 },
        { at: 5 / FPS_0004.attack1, active: 1 / FPS_0004.attack1, hitbox: { x: 8, y: -62, w: 28, h: 18 }, damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal' },
      ],
      groundOnly: true,
      mobility: 'quick',
      hitCancel: 6 / FPS_0004.attack1,
    },
    // The Air Dance: a knee and a leg swung back (frames 1-2), then two
    // strikes. The low sweep (frame 3): its trail under the body, 1, no
    // launch. The rising crescent and the high kick (frames 4-5): 3, Base
    // Launch 2 upward. Back on frames 6-7: 0.35 s in all. A quick strike,
    // steered almost as well as it drifts, and a hit opens a follow-up from
    // frame 6.
    midair_attack1: {
      animation: 'midair_attack1',
      recovery: 2 / FPS_0004.midair_attack1,
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0004.midair_attack1, active: 1 / FPS_0004.midair_attack1, hitbox: { x: -6, y: -34, w: 52, h: 36 }, damage: 1 },
        { at: 3 / FPS_0004.midair_attack1, active: 2 / FPS_0004.midair_attack1, hitbox: { x: 0, y: -84, w: 46, h: 62 }, damage: 3, baseLaunch: 2, directionalLaunch: 'vertical' },
      ],
      mobility: 'quick',
      hitCancel: 5 / FPS_0004.midair_attack1,
    },
    // The Leek Swing: the leek raised overhead (frame 1), then brought down
    // through a wide arc (frame 2, live: from over the head to the ground
    // in front, out to 48 units, its longest reach), and held low (frame 3,
    // two frames). 3, Base Launch 2 sideways; a Shield that blocks it is
    // shoved back (280 units/s). 0.4 s in all, no follow-up. A medium
    // strike.
    attack2: {
      animation: 'attack2',
      startup: 1 / FPS_0004.attack2,
      active: 1 / FPS_0004.attack2,
      recovery: 2 / FPS_0004.attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 6, y: -88, w: 42, h: 84 },
      hitstun: 0.34,
      blockstun: 0.16,
      hitstop: 0.05,
      blockPush: 280,
      groundOnly: true,
      mobility: 'medium',
    },
    // The Leekspin: the leek gathered up (frame 1, a hang), then it rises at
    // 480 units/s as the leek twirls (frames 2-4, about 96 units, and on up
    // under gravity): its way back to the stage. Three strikes. The upward
    // swing (frame 2) and the turn overhead (frame 3): 1 each, no launch,
    // and whoever they catch is carried up with it (`carry`, at its own
    // speed). The swing down (frame 4): 3, Base Launch 2 sideways, flung
    // away from the top of the climb. Drifting on frame 5. Once per
    // airtime; a medium strike, its lift steered a little (0.4 of the
    // steering, toward 0.4 of top speed).
    midair_attack2: {
      animation: 'midair_attack2',
      recovery: 1 / FPS_0004.midair_attack2,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      carry: { lift: 0 },
      hits: [
        { at: 1 / FPS_0004.midair_attack2, active: 1 / FPS_0004.midair_attack2, hitbox: { x: -4, y: -96, w: 48, h: 84 }, damage: 1 },
        { at: 2 / FPS_0004.midair_attack2, active: 1 / FPS_0004.midair_attack2, hitbox: { x: -30, y: -124, w: 66, h: 68 }, damage: 1 },
        { at: 3 / FPS_0004.midair_attack2, active: 1 / FPS_0004.midair_attack2, hitbox: { x: -36, y: -104, w: 76, h: 76 }, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal', hitstun: 0.36 },
      ],
      airUses: 1,
      motion: { type: 'rise', speed: 480 },
      mobility: 'medium',
      airMomentum: 0.6,
      airControl: 0.4,
      airTopSpeed: 0.4,
    },
    // The Crescent Kick: the stance and the knee drawn up (frames 1-3),
    // then the spin and the high kick (frames 4-6, live: the arc the leg
    // sweeps over and before it, from the chest to well over the head, out
    // to 42 units): 3, Base Launch 2 straight up, its anti-air. The leg
    // coming down and back (frames 7-8): 0.4 s in all. A hit opens a
    // follow-up from frame 7 (a jump after it, into the air). A medium
    // strike.
    attack3: {
      animation: 'attack3',
      startup: 3 / FPS_0004.attack3,
      active: 3 / FPS_0004.attack3,
      recovery: 2 / FPS_0004.attack3,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: -2, y: -104, w: 44, h: 80 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
      groundOnly: true,
      mobility: 'medium',
      hitCancel: 6 / FPS_0004.attack3,
    },
    // The Stage Dive: tucked (frame 1, a hang of 1/15 s), then the dive,
    // legs first, at 1300 units/s (steering half as well as it drifts) for
    // up to 0.8 s. Anything the feet meet on the way is driven down (3,
    // Base Launch 2 downward: off the stage, a spike) and the dive goes on
    // through. Where it lands, whoever stands within 56 units of the spot,
    // either side, is popped up (1, Base Launch 1: no quake, so one just
    // off the ground is popped up too). Then a crouch on landing and up
    // again (its impact clip, 3/15 s), a follow-up open from its second
    // frame once anything has been hit. Once per airtime, never while
    // flying from a launch; off the stage it dives into the Void. Heavy, its
    // dive's drift its own (half the steering, toward half of top speed).
    midair_attack3: {
      animation: 'midair_attack3',
      startup: DIVE_HANG_0004,
      active: DIVE_PLUNGE_0004,
      recovery: 3 / FPS_0004.midair_attack3,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'reverseVertical',
      hitbox: { x: -16, y: -44, w: 36, h: 48 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 0.05,
      airUses: 1,
      motion: {
        type: 'slam',
        fallSpeed: 1300,
        impact: {
          hitbox: { x: -56, y: -34, w: 112, h: 38 },
          hit: { damage: 1, baseLaunch: 1, directionalLaunch: 'vertical', hitstun: 0.3, blockstun: 0.1, hitstop: 0.04 },
          animation: 'midair_attack3_impact',
        },
      },
      mobility: 'heavy',
      airMomentum: 0.5,
      airControl: 0.5,
      airTopSpeed: 0.5,
      hitCancel: DIVE_HANG_0004 + DIVE_PLUNGE_0004 + 1 / FPS_0004.midair_attack3,
    },
    // The Melody (extra_attack): a breath and a fist raised (frames 1-3),
    // then the arm thrown out and the note sung (frame 4: its projectile,
    // from the hand), held two frames more: 0.4 s in all. Ground only. A
    // medium cast: singing never roots it, but it slows it a little.
    extra_attack: {
      animation: 'extra_attack',
      startup: 3 / FPS_0004.extra_attack,
      active: 1 / FPS_0004.extra_attack,
      recovery: 2 / FPS_0004.extra_attack,
      hitbox: null,
      projectile: { id: 'extra_attack_object', spawnAt: 3 / FPS_0004.extra_attack, offset: { x: 34, y: -52 } },
      groundOnly: true,
      mobility: 'medium',
    },
  },
};
