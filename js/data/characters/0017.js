// #0017's definition: everything that makes #0017 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0017.md for what each move does in play.
//
// The robot girl in blue overalls, a winged pink cap and round glasses, her
// purple hair down her back, cut from one supplied sprite sheet (see
// assets/characters/0017/). A gag character of boundless strength who runs
// on the logic of a cartoon, she fights the way she does in her canon: a
// spinning kick and a stick she pokes things with up close, her headbutts
// (forward, up and straight down into the ground), her arms-out run at the
// speed of sound, the punch that splits the earth, and a touch that takes
// what her opponent fights with. Every move is one she makes there: she
// summons nobody, makes no clone, never homes in, never heals and fires no
// shot of her own; the only projectile she ever throws is one she copied
// off her opponent. Five numbered attacks, each a button of its own, plus
// her extra_attack:
//
//   attack1  the Spin Kick, turned on the spot, a kick, then the same kick
//            swept round in a white arc; in the air the Somersault
//            Headbutt, a forward flip ending head-first in a white arc
//   attack2  Kiiin!, her arms flung out like wings and away along the
//            ground at the speed of sound, sending whoever she meets flying
//            (motion `roll`); in the air the Headbutt Dive, curled over and
//            plunged head-first into the ground (motion `slam`), the ground
//            bursting round where she lands (`impact`, a `quake`)
//   attack3  the Rocket Headbutt, launched up head-first off the ground or
//            in mid-air (motion `rise`), carrying whoever it meets up with
//            her and sending it sky-high, once per airtime in the air: her
//            way back to the stage
//   attack4  the Earth Chop, a technique: both arms raised high, then a
//            punch down into the ground that splits it round her, 10 to
//            whoever stands on it (a `quake`: one in the air is passed by)
//   attack5  Finders Keepers, a touch (`mimic`), on the ground and in the
//            air: her finger poked into her opponent copies the strongest
//            projectile it throws into her hands, which her next Finders
//            Keepers throws back, the projectile alone, without what threw
//            it (a pistol's shot without the pistol, a rocket without the
//            launcher); an opponent who throws nothing gives up all its
//            Energy to her instead
//   extra_attack  the Stick Poke, a stick swung over and poked down into
//            the ground before her; on the ground only
//
// Her Mash Combo (js/data/mash-combo.js) alternates the Spin Kick and the
// Stick Poke, her two close-range strikes.
//
// Her Shield is both fists raised, on the ground. In the air the Shield
// button is her Deflect: a hop and a shout, her mouth wide open, that
// blows projectiles back. Her Dash is a sprint, her arms swinging; her air
// dash a forward roll, tucked into a ball. Her cooldowns are the shared
// policy's (js/data/cooldowns.js), derived from what each move does, never
// authored here: the Earth Chop waits 5 s (its 10), from its release;
// Finders Keepers none for its touch, and for its throw whatever the copy
// it throws earns (none for most, 3 s for one that holds, 5 s for one that
// deals 10, keeping the touch waiting too); nothing else waits at all, and
// the Deflect none. A throw of a copy costs 15 Energy (an ordinary
// construct), none with a 3 s or 5 s copy; the Deflect its 15, nothing else
// anything.
//
// What of the sheet is no move: her standing, talking and greeting poses,
// her ordinary run's stance, her falls, her lying and getting up, the
// electrified and burnt versions of her knocked-back poses, her crouched
// peering, her arms thrown back, her sitting on the floor, the dive onto
// her belly, the costume she changes into, her head popping off and her
// body coming apart, and the small copies of her poses at the bottom of
// the sheet.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0017's idle, her stance (her reference clip: the
// tallest of its frames). Her art is 1x (one file pixel per art pixel, cut
// with the sheet's flat periwinkle made transparent), so no pixel grid is
// ever looked for in it (`visual.pixelSize: 1`): each clip's heightRatio,
// its tallest frame over this, sizes it at exactly one art pixel per file
// pixel.
const ART_0017 = 43;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0017 = 88 / 52;

// Playback rates of #0017's clips. Each attack's phases below are whole
// frames of its clip at its rate, so tuning a rate keeps the timing on the
// art; every attack's rate is a whole number of 60 Hz steps per frame, so
// each frame lasts exactly as long as its gameplay does. (The Dash and the
// air dash last the universal Dash's length, whatever these say: their
// clips are shown once across it.)
const FPS_0017 = Object.freeze({
  idle: 8,
  run: 12,
  mouvment: 12,
  midair_mouvment: 15,
  jump: 12,
  fall: 8,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 15,
  attack1: 20,
  midair_attack1: 20,
  attack2: 15,
  midair_attack2: 15,
  attack3: 15,
  attack4_cast: 10,
  attack4_release: 15,
  attack5: 15,
  extra_attack: 20,
});

// The Launch Points the Earth Chop deals: the earth split, an
// ultimate-level blow.
const EARTH_CHOP_0017 = 10;
// The Energy Finders Keepers takes off an opponent who throws nothing to
// copy: all of it (the bar's 100), every bit of it hers.
const SIPHON_0017 = 100;
// Kiiin!'s run along the ground (motion `roll`): its own speed, the share
// of her running speed it keeps, its top speed, how fast it runs down, and
// how hard a Shield that stops it sends her back.
const KIIIN_RUN_0017 = Object.freeze({ type: 'roll', speed: 760, keep: 0.4, maxSpeed: 1000, friction: 800, recoil: 260 });
// The Rocket Headbutt's lift, units/s.
const ROCKET_0017 = 620;

// Where her body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file: the middle of her
// overalls, which every frame draws on her body (the middle of the ball for
// her rolls, of her body for her tumbles). Her kicks and their arc, her
// arms flung out, her stick, her finger and the ground bursting round her
// feet would pull the automatic anchor off her body. The frames of one pose
// (the ground's burst, her finger poked out, her head-first flight and its
// arc) are anchored where their twins' body is, matched on her cap.
const ANCHORS_0017 = Object.freeze({
  idle: [14, 14, 14, 14],
  run: [17, 16, 15.5, 15.5, 15.5, 16.5],
  jump: [16, 16.5],
  fall: [14.5, 14.5],
  land: [16],
  hurt: [17, 11],
  midair_hurt: [20, 21, 17.5, 18],
  prepshield: [14],
  shielding: [13.5],
  releaseshield: [14],
  deflect: [14, 14],
  mouvment: [12.5, 11, 13],
  midair_mouvment: [13, 16, 13, 16],
  attack1: [14.5, 12, 13, 11.5],
  midair_attack1: [15.5, 14.5, 14.5, 16.5, 16.5, 14],
  attack2: [15.5, 14.5, 15.5],
  midair_attack2: [14.5, 13, 19.5, 21.5, 22.5, 21.5],
  attack3: [14, 17, 17, 14],
  midair_attack3: [15.5, 14],
  attack4: [16, 16, 10, 19, 17, 16, 16, 15],
  attack5: [10, 10, 10, 13, 10],
  midair_attack5: [12, 14],
  extra_attack: [13, 13.5, 14.5, 14.5, 14.5, 12],
});

// Where her feet are in each file of a codename (`anchorY`, art pixels down
// from the top of the file's visible art), file by file, for the one clip
// whose art reaches below her: her head-first flight's white arc sweeps
// under her, so its frame stands where its twin without the arc does. Every
// other clip stands on the bottom of its art.
const FEET_0017 = Object.freeze({
  midair_attack1: [33, 34, 32, 31, 40, 28],
});

// The height in art pixels of each file of a codename, file by file (what
// sizes a clip: its tallest frame over ART_0017).
const HEIGHTS_0017 = Object.freeze({
  idle: [41, 42, 43, 42],
  run: [37, 32, 35, 37, 38, 33],
  jump: [37, 36],
  fall: [38, 37],
  land: [31],
  hurt: [40, 34],
  midair_hurt: [40, 23, 37, 29],
  prepshield: [41],
  shielding: [40],
  releaseshield: [41],
  deflect: [33, 32],
  mouvment: [36, 37, 36],
  midair_mouvment: [32, 26, 32, 26],
  attack1: [36, 36, 37, 37],
  midair_attack1: [33, 34, 32, 31, 41, 28],
  attack2: [37, 37, 37],
  midair_attack2: [33, 36, 38, 36, 37, 39],
  attack3: [44, 43, 43, 39],
  midair_attack3: [37, 35],
  attack4: [41, 41, 36, 39, 38, 38, 39, 39],
  attack5: [34, 32, 32, 32, 33],
  midair_attack5: [39, 34],
  extra_attack: [36, 31, 29, 28, 29, 35],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame against
// the idle, each frame anchored on her body (and on her feet where
// FEET_0017 says so).
const clip = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0017', codename, n)),
  fps,
  loop: false,
  heightRatio: Math.max(...order.map((n) => HEIGHTS_0017[codename][n - 1])) / ART_0017,
  anchorX: order.map((n) => ANCHORS_0017[codename][n - 1]),
  ...(FEET_0017[codename] ? { anchorY: order.map((n) => FEET_0017[codename][n - 1]) } : {}),
  ...extra,
});

// The Spin Kick's art: turned on the spot, her back to us (1), her leg
// kicked out (2, held), swept round in a white arc (3, held), and her
// stance again (4, held).
const SPIN_KICK_0017 = [1, 2, 2, 3, 3, 4, 4];
// The Somersault Headbutt's: tucked (1), flipping forward (2, 3), out
// head-first (4), the white arc of the flip swept round before her (5,
// held), and tucked again (6).
const SOMERSAULT_0017 = [1, 2, 3, 4, 5, 5, 6];
// Kiiin!'s: her arms flung out, her mouth open (1), then away, her arms out
// like wings, stride after stride (2, 3, four times), and her arms
// lowered (1).
const KIIIN_0017 = [1, 2, 3, 2, 3, 2, 3, 2, 3, 1];
// The Headbutt Dive's: curled over (1, held), then head-first, straight
// down (2, held as she plunges). Landed (its impact clip): the ground
// bursting round her, earth flying (3, 4, 5, 6).
const HEADBUTT_DIVE_0017 = [1, 1, 2];
const HEADBUTT_DIVE_IMPACT_0017 = [3, 4, 5, 6];
// The Rocket Headbutt's on the ground: set, looking up (1), head-first up
// and away (2, 3, each held), coming round (4). In the air: away head-first
// in a streak (1, held), and tucked (2).
const ROCKET_HEADBUTT_0017 = [1, 2, 2, 3, 3, 4];
const AIR_ROCKET_HEADBUTT_0017 = [1, 1, 1, 1, 2];
// The Earth Chop's cast: both arms raised high (1, 2, held), then down on
// her punch (3). Its release: the ground bursting round her, earth flying
// (4, 5, 6, 7), and back up (8).
const EARTH_CHOP_CAST_0017 = [1, 2, 2, 3];
const EARTH_CHOP_RELEASE_0017 = [4, 5, 6, 7, 8];
// Finders Keepers': bent forward, peering (1), her finger out (3) and
// poked into her opponent (4, held), drawn back (3), crouched (2), and
// straightening, pleased (5).
const FINDERS_KEEPERS_0017 = [1, 3, 4, 4, 3, 2, 5];
// The Air Finders Keepers': her hand drawn back (1), then reached out
// before her (2, held), and drawn back (1).
const AIR_FINDERS_KEEPERS_0017 = [1, 2, 2, 2, 1];
// The Stick Poke's: her stick raised over her shoulder (1), crouched,
// swinging it up (2), brought down over her in a white streak (3), poked
// into the ground before her (4, 5), and her stance (6).
const STICK_POKE_0017 = [1, 2, 3, 4, 5, 6];
// Her Deflect's: a hop, her mouth wide open (1), the shout, flashing white
// (2, held), and her mouth still open (1).
const DEFLECT_0017 = [1, 2, 2, 1];

export const CHARACTER_0017 = {
  id: '0017',
  displayName: '#0017',
  available: true,
  rosterSlot: 16,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0017 and FEET_0017.
  animations: {
    // Her stance, fists at her sides, breathing: four poses, there and back.
    idle: { ...clip('idle', [1, 2, 3, 4, 3, 2], FPS_0017.idle), loop: true },
    // The run: the sheet's six running frames, her hair streaming. Its
    // rate follows the speed, down to 0.6 of it (and up past it on a Dash's
    // run-on).
    run: { ...clip('run', [1, 2, 3, 4, 5, 6], FPS_0017.run), loop: true, minSpeedScale: 0.6 },
    // Springing up, her arms thrown up, then spread; falling, her hair
    // streaming up; touching down crouched, her arms out.
    jump: clip('jump', [1, 2], FPS_0017.jump),
    fall: clip('fall', [1, 2], FPS_0017.fall),
    land: clip('land', [1], FPS_0017.land),
    // mouvment, the Dash: a sprint, her arms swinging, shown across the
    // whole Dash.
    mouvment: clip('mouvment', [1, 2, 3], FPS_0017.mouvment),
    // midair_mouvment, the air dash: a forward roll, tucked into a ball
    // (1), over (2), upside down (3) and round (4), played once across the
    // whole air dash.
    midair_mouvment: clip('midair_mouvment', [1, 2, 3, 4], FPS_0017.midair_mouvment),
    // Hitstun: `hurt` rocked back, then doubled over; `midair_hurt` knocked
    // back, flung flat, then tumbling over.
    hurt: clip('hurt', [1, 2], FPS_0017.hurt),
    midair_hurt: clip('midair_hurt', [1, 2, 3, 4], FPS_0017.hurt),
    // Her guard, on the ground: fists up (prepshield), held up before her
    // (shielding), and lowered (releaseshield).
    prepshield: clip('prepshield', [1], FPS_0017.shield),
    shielding: clip('shielding', [1], FPS_0017.shield),
    releaseshield: clip('releaseshield', [1], FPS_0017.shield),
    // deflect, her Deflect (see DEFLECT_0017).
    deflect: clip('deflect', DEFLECT_0017, FPS_0017.deflect),
    // attack1, the Spin Kick (see SPIN_KICK_0017).
    attack1: clip('attack1', SPIN_KICK_0017, FPS_0017.attack1),
    // midair_attack1, the Somersault Headbutt (see SOMERSAULT_0017).
    midair_attack1: clip('midair_attack1', SOMERSAULT_0017, FPS_0017.midair_attack1),
    // attack2, Kiiin! (see KIIIN_0017).
    attack2: clip('attack2', KIIIN_0017, FPS_0017.attack2),
    // midair_attack2, the Headbutt Dive, and its landing (see
    // HEADBUTT_DIVE_0017), from the midair_attack2 files.
    midair_attack2: clip('midair_attack2', HEADBUTT_DIVE_0017, FPS_0017.midair_attack2),
    midair_attack2_impact: clip('midair_attack2', HEADBUTT_DIVE_IMPACT_0017, FPS_0017.midair_attack2),
    // attack3 and midair_attack3, the Rocket Headbutt and the Air Rocket
    // Headbutt (see ROCKET_HEADBUTT_0017).
    attack3: clip('attack3', ROCKET_HEADBUTT_0017, FPS_0017.attack3),
    midair_attack3: clip('midair_attack3', AIR_ROCKET_HEADBUTT_0017, FPS_0017.attack3),
    // attack4, the Earth Chop, a technique: its cast and its release (see
    // EARTH_CHOP_CAST_0017), from the attack4 files.
    attack4_cast: clip('attack4', EARTH_CHOP_CAST_0017, FPS_0017.attack4_cast),
    attack4_release: clip('attack4', EARTH_CHOP_RELEASE_0017, FPS_0017.attack4_release),
    // attack5 and midair_attack5, Finders Keepers (see
    // FINDERS_KEEPERS_0017). Its throw plays the same clip: the copy leaves
    // her fingertip.
    attack5: clip('attack5', FINDERS_KEEPERS_0017, FPS_0017.attack5),
    midair_attack5: clip('midair_attack5', AIR_FINDERS_KEEPERS_0017, FPS_0017.attack5),
    // extra_attack, the Stick Poke (see STICK_POKE_0017).
    extra_attack: clip('extra_attack', STICK_POKE_0017, FPS_0017.extra_attack),
  },

  // A still stance frame for the airborne, landing and hurt clips if their
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
    // Her 43-pixel stance at the roster's common art-pixel size, 88/52
    // world units per art pixel (so every fighter's pixels are the same
    // size on screen): about 73 units, one of the roster's smallest.
    height: ART_0017 * UNIT_0017,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.3, size: 0.62 },
    // The colours she bursts in when the Void takes her (see
    // js/game/rendering/hit-fx.js), picked from her art: her purple hair,
    // her pink cap, her blue overalls, her skin and her cap's red band.
    eliminationPalette: ['#520084', '#ff7bf7', '#00009c', '#f7ce8c', '#de004a'],
  },

  // Her body, measured from her stance: her head under its big cap, then
  // her overalls and legs. Collision is independent of the art.
  collider: { width: 26, height: 68 },
  pushbox: { width: 28 },
  hurtboxes: [
    { x: -16, y: -73, w: 32, h: 33 }, // cap and head
    { x: -13, y: -41, w: 26, h: 41 }, // overalls and legs
  ],

  // How #0017 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): a robot who shrugs off what would floor
  // anyone else, she is held a little less than most, 0.1 s more stun per
  // 1000 units/s and 0.35 s more at most, tumbling only from 1250 units/s,
  // and a held direction bends a launch by up to 25 degrees.
  launchReaction: {
    stunPerThousand: 0.1,
    maxStun: 0.35,
    tumbleSpeed: 1250,
    steerAngle: 25,
  },

  // Her guard, what the `shield` input does for #0017 on the ground: her
  // fists up, held up before her, and lowered (see the clips). Her perfect
  // Shield opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    groundReleaseAnimation: 'releaseshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Her Deflect, what the `shield` input does for #0017 in the air (schema:
  // js/game/combat/deflect.js): a hop, her mouth wide open (the startup),
  // then the shout, flashing white (live for two frames: 12 units behind her
  // to 46 in front, from below her feet to over her cap), and her mouth
  // still open (its recovery). Every Deflect's 3, Base Launch 2, here
  // sideways, blown away before her; while it is live it turns the other
  // fighter's projectiles back at their thrower, now #0017's. Four
  // fifteenths of a second in all, keeping the whole of her drift, under
  // the universal air control, never stepping in (a defense:
  // js/data/attack-movement.js); no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0017.deflect,
    active: 2 / FPS_0017.deflect,
    recovery: 1 / FPS_0017.deflect,
    hitbox: { x: -12, y: -62, w: 58, h: 66 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1, attack2, attack3 and attack5 ordinary
  // attacks with their mid-air versions, attack4 a technique (on the
  // ground); and her extra_attack, on the ground only (its attack is
  // `groundOnly`).
  actions: {
    extra_attack: 'extra_attack', // the Stick Poke
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Spin Kick / the Somersault Headbutt
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // Kiiin! / the Headbutt Dive
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Rocket Headbutt, on the ground and in the air
    attack4: { type: 'technique', id: 'attack4' }, // the Earth Chop
    attack5: { ground: 'attack5', air: 'midair_attack5' }, // Finders Keepers / the Air Finders Keepers
  },

  // Her Mash Combo pair (js/data/mash-combo.js): the Spin Kick and the
  // Stick Poke, her two close-range strikes. Mashing either button sets off
  // twelve turns.
  mashCombo: { attacks: ['attack1', 'extra_attack'] },

  // Her Special abilities (js/data/special-abilities.js): the Earth Chop,
  // the ground split round her for 10, after a breakable wind-up; and
  // Finders Keepers on the ground and in the air, the touch that takes
  // what her opponent fights with, its strongest projectile to throw back
  // or all its Energy: what she can do depends on whom she touches. Her
  // kicks, her stick, her run and her headbutts are her everyday tools:
  // ordinary to the player.
  specialAbilities: ['attack4', 'attack5', 'midair_attack5'],

  // UI only: a frame of each move's own art (zero-based frames): her stick
  // poked into the ground, the arc of her kick and of her flip, her arms out
  // as she runs and her head-first plunge, her head-first rise, the ground
  // bursting round her, and her finger poked out, on the ground and in the
  // air.
  mobileAbilities: {
    extra_attack: { label: 'Stick Poke', preview: { animation: 'extra_attack', frame: 3 } },
    attack1: { label: 'Spin Kick', preview: { animation: 'attack1', frame: 3 }, previews: { air: { animation: 'midair_attack1', frame: 4 } } },
    attack2: { label: 'Kiiin!', preview: { animation: 'attack2', frame: 1 }, previews: { air: { animation: 'midair_attack2', frame: 2 } } },
    attack3: { label: 'Rocket Headbutt', preview: { animation: 'attack3', frame: 2 }, previews: { air: { animation: 'midair_attack3', frame: 1 } } },
    attack4: { label: 'Earth Chop', preview: { animation: 'attack4_release', frame: 0 } },
    attack5: { label: 'Finders Keepers', preview: { animation: 'attack5', frame: 2 }, previews: { air: { animation: 'midair_attack5', frame: 1 } } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Stick Poke',
    attack1: 'Spin Kick',
    midair_attack1: 'Somersault Headbutt',
    attack2: 'Kiiin!',
    midair_attack2: 'Headbutt Dive',
    attack3: 'Rocket Headbutt',
    midair_attack3: 'Air Rocket Headbutt',
    attack4: 'Earth Chop',
    attack5: 'Finders Keepers',
    midair_attack5: 'Air Finders Keepers',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0017.<move>.description).
  abilityDescriptions: {
    extra_attack: 'Swings her stick over and pokes it down into the ground before her, knocking the opponent away.',
    attack1: 'Turns on the spot and kicks, then sweeps the kick round in an arc, knocking the opponent away.',
    midair_attack1: 'A forward flip ending in a headbutt, knocking the opponent away.',
    attack2: 'Flings her arms out like wings and runs off along the ground at the speed of sound, sending whoever she meets flying.',
    midair_attack2: 'Plunges head-first into the ground, spiking whoever is below; the ground bursts round where she lands.',
    attack3: 'Launches herself up head-first, carrying the opponent up and sending it sky-high.',
    midair_attack3: 'Launches herself up head-first in the air, carrying the opponent up and sending it sky-high. Once per jump.',
    attack4: 'Raises both arms, then punches the ground so hard it splits round her, launching whoever stands on it. Jumping clears it.',
    attack5: 'Pokes the opponent and copies the strongest projectile it throws; the next Finders Keepers throws it. One who throws nothing gives up all its Energy to her.',
    midair_attack5: 'Reaches out in the air: a touch copies the opponent\'s strongest projectile, or takes all its Energy; holding a copy, she throws it instead.',
  },

  // Her recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     her quick blows: the Spin Kick, and in the air the
  //                  Somersault Headbutt, her basic aerial
  //   Triangle / Y   the Stick Poke, her other everyday strike, a thumb's
  //                  roll from Square for her Mash Combo
  //   R2 / RT        Finders Keepers, on the ground and in the air: the
  //                  touch that loads her shot, then the shot itself, her
  //                  only ranged move
  //   right stick    Kiiin!, a run sent out the way she faces
  //   forward
  //   right stick    the Headbutt Dive, in the air: a plunge, straight down
  //   down
  //   right stick    the Rocket Headbutt, on the ground and in the air: she
  //   up             rises with it
  //   L2 / LT        the Earth Chop, her first Special: a deliberate
  //                  trigger, never squeezed by accident
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:extra_attack': pad('north'),
      'ground:attack2': flick('forward'),
      'ground:attack3': flick('up'),
      'ground:attack4': pad('l2'),
      'ground:attack5': pad('r2'),
      'air:attack1': pad('west'),
      'air:attack2': flick('down'),
      'air:attack3': flick('up'),
      'air:attack5': pad('r2'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0017 stands committed to it,
  // then lets go all at once. A hit on #0017 before it lets go breaks it
  // (nothing released), and it needs the ground throughout.
  techniques: {
    // The Earth Chop: both arms raised high, held, then down on her punch
    // (two fifths of a second, nothing protects it), then the ground splits
    // round her: every opponent standing on the ground within 120 units of
    // her, either side (a `quake`: one in the air is passed by), takes
    // EARTH_CHOP_0017 at Base Launch 3, straight up. The ground bursting,
    // and back up (a third of a second more). Once every 5 seconds (the
    // policy's, for 10 damage), from the release; no Energy.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      burst: {
        hitbox: { x: -120, y: -40, w: 240, h: 44 },
        hit: {
          damage: EARTH_CHOP_0017, baseLaunch: 3, directionalLaunch: 'vertical', quake: true,
          hitstun: 0.5, blockstun: 0.2, hitstop: 0.12,
        },
      },
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown of its own: none deals 10,
  // heals or holds (a throw of a copy earns what the copy does). Each moves
  // by the shared attack movement (js/data/attack-movement.js): never
  // steered on the ground, the aerials under the universal air control;
  // the Spin Kick, the Stick Poke and Finders Keepers step in by the shared
  // Step-in.
  attacks: {
    // The Spin Kick: turned on the spot, her back to us (frame 1, a
    // twentieth of a second), her leg kicked out (frames 2-3, live: from 4
    // units before her out to 32, from her knee to her chest), 1, no
    // launch, a stun that holds the target for the next; swept round in a
    // white arc (frames 4-5, live: from 2 units before her out to 40, from
    // her knee to over her head), 3, Base Launch 2 sideways. Her stance
    // (frames 6-7): seven twentieths of a second in all. Once the arc has
    // hit, it opens a follow-up. It steps in by the shared Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 2 / FPS_0017.attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 1 / FPS_0017.attack1, active: 2 / FPS_0017.attack1, damage: 1, hitbox: { x: 4, y: -46, w: 28, h: 34 }, hitstun: 0.38 },
        {
          at: 3 / FPS_0017.attack1, active: 2 / FPS_0017.attack1, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal',
          hitbox: { x: 2, y: -60, w: 38, h: 42 }, hitstun: 0.34, hitstop: 0.05,
        },
      ],
      groundOnly: true,
      hitCancel: 5 / FPS_0017.attack1,
    },
    // The Somersault Headbutt: tucked and flipping forward (frames 1-3,
    // three twentieths of a second), then out head-first, the arc of the
    // flip swept round before her (frames 4-6, live: from 4 units behind
    // her out to 36, from her feet to over her cap), 3, Base Launch 2
    // sideways. Tucked again (frame 7): seven twentieths of a second. Her
    // drift under the universal air control.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 3 / FPS_0017.midair_attack1,
      active: 3 / FPS_0017.midair_attack1,
      recovery: 1 / FPS_0017.midair_attack1,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: -4, y: -58, w: 40, h: 54 },
      hitstun: 0.32,
      blockstun: 0.12,
      hitstop: 0.05,
    },
    // Kiiin!: her arms flung out, her mouth open (frame 1, a fifteenth of
    // a second), then away along the ground the way she faces (motion
    // `roll`, KIIIN_RUN_0017: 760 units/s and 0.4 of her running speed, up to
    // 1000, running down at 800 units/s every second, so she is back to her
    // own run's speed as it ends), her arms out like wings (frames 2-9, live
    // for seven fifteenths: 10 units behind her to 32 in front, from her
    // feet to her cap), 3, Base Launch 3 sideways: whoever she meets at the
    // speed of sound is sent flying. Her arms lowered (frame 10): two thirds
    // of a second in all, about 310 units from a standstill. A Shield that blocks her stops
    // her dead and sends her back; a wall stops her; off a ledge she runs on
    // into the air. On the ground only (its air move is the Headbutt Dive).
    attack2: {
      animation: 'attack2',
      startup: 1 / FPS_0017.attack2,
      active: 7 / FPS_0017.attack2,
      recovery: 2 / FPS_0017.attack2,
      damage: 3,
      baseLaunch: 3,
      directionalLaunch: 'horizontal',
      hitbox: { x: -10, y: -60, w: 42, h: 58 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
      motion: KIIIN_RUN_0017,
      groundOnly: true,
    },
    // The Headbutt Dive: curled over (frames 1-2, two fifteenths of a
    // second, the hang), then she plunges head-first at 1400 units/s
    // (motion `slam`) for up to 0.8 s, her head driven down (live: 16 units
    // either side of her, from her waist to below her cap), 3, Base Launch
    // 2 straight down: a spike. Where it meets the ground her head goes into
    // it and the ground bursts round her (its impact clip, four fifteenths
    // of a second): every opponent standing on the ground within 64 units
    // either side (`impact`, a `quake`: one in the air is passed by) takes
    // 3 at Base Launch 2, thrown up off its feet. Once per airtime; half her
    // drift kept. A dive that runs out in the air lands nothing and falls
    // on.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 2 / FPS_0017.midair_attack2,
      active: 0.8,
      recovery: HEADBUTT_DIVE_IMPACT_0017.length / FPS_0017.midair_attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'reverseVertical',
      hitbox: { x: -16, y: -36, w: 32, h: 44 },
      hitstun: 0.32,
      blockstun: 0.14,
      hitstop: 0.05,
      airUses: 1,
      motion: {
        type: 'slam',
        fallSpeed: 1400,
        impact: {
          hitbox: { x: -64, y: -34, w: 128, h: 38 },
          hit: {
            damage: 3, baseLaunch: 2, directionalLaunch: 'vertical', quake: true,
            hitstun: 0.4, blockstun: 0.16, hitstop: 0.08,
          },
          animation: 'midair_attack2_impact',
        },
      },
      airMomentum: 0.5,
    },
    // The Rocket Headbutt: set, looking up (frame 1, a fifteenth of a
    // second), then she launches herself up at ROCKET_0017 units/s (motion
    // `rise`), head-first up and away (frame 2, live: 4 units behind her
    // out to 36, from her waist to over her cap), 1, carrying her target up
    // with her; still head-first (frames 3-4, live: 4 units behind her out
    // to 40, high over her), 3, Base Launch 3 straight up: sent sky-high.
    // A fifth of a second rising (about 120 units), then coming round (frames 5-6): two
    // fifths of a second in all, then she falls. Once the headbutt has hit,
    // it opens a follow-up. Half the speed she had kept as she launches. On
    // the ground only (its air move is the Air Rocket Headbutt).
    attack3: {
      animation: 'attack3',
      recovery: 2 / FPS_0017.attack3,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      carry: { lift: 0 },
      hits: [
        { at: 1 / FPS_0017.attack3, active: 1 / FPS_0017.attack3, damage: 1, hitbox: { x: -4, y: -72, w: 40, h: 56 } },
        {
          at: 2 / FPS_0017.attack3, active: 2 / FPS_0017.attack3, damage: 3, baseLaunch: 3, directionalLaunch: 'vertical',
          hitbox: { x: -4, y: -88, w: 44, h: 56 }, carry: null, hitstun: 0.36, hitstop: 0.05,
        },
      ],
      motion: { type: 'rise', speed: ROCKET_0017 },
      groundOnly: true,
      momentum: 0.5,
      hitCancel: 4 / FPS_0017.attack3,
    },
    // The Air Rocket Headbutt: the same launch from mid-air, without the
    // set: away head-first in a streak at once (frame 1, a fifteenth of a
    // second, the hang), then up at ROCKET_0017 units/s (frame 2, live), 1,
    // carrying her target; still head-first (frames 3-4, live), 3, Base
    // Launch 3 straight up. Tucked (frame 5): a third of a second in all. Her
    // recovery: once per airtime (landing or being hit gives it back), 0.6
    // of her drift kept.
    midair_attack3: {
      animation: 'midair_attack3',
      recovery: 1 / FPS_0017.attack3,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      carry: { lift: 0 },
      hits: [
        { at: 1 / FPS_0017.attack3, active: 1 / FPS_0017.attack3, damage: 1, hitbox: { x: -4, y: -72, w: 40, h: 56 } },
        {
          at: 2 / FPS_0017.attack3, active: 2 / FPS_0017.attack3, damage: 3, baseLaunch: 3, directionalLaunch: 'vertical',
          hitbox: { x: -4, y: -88, w: 44, h: 56 }, carry: null, hitstun: 0.36, hitstop: 0.05,
        },
      ],
      motion: { type: 'rise', speed: ROCKET_0017 },
      airUses: 1,
      airMomentum: 0.6,
    },
    // Finders Keepers: bent forward, peering, her finger out (frames 1-2,
    // two fifteenths of a second), then poked into her opponent (frames
    // 3-4, live: from 6 units before her out to 36, at her shoulder's
    // height), 1, no launch, a short stun. Drawn back, crouched and
    // straightening (frames 5-7): seven fifteenths of a second in all, a
    // deliberate move. A real hit (never a block) is a touch (`mimic`, see
    // js/game/combat/mimic.js): it copies the strongest projectile its
    // target throws (the most damage one throw of it deals, then its
    // launch; only one that flies) into her hands, and her next Finders
    // Keepers, on the ground or in the air, throws that copy instead of
    // poking: the same clip, the copy leaving her fingertip 32 units
    // before her at her shoulder as her finger goes out (two fifteenths of
    // a second in; a copy too tall for that, a sphere or a whirlwind as
    // tall as a fighter, lifted as far as it takes to clear the floor: see
    // throwOffset in js/game/combat/mimic.js), the projectile alone, in its own art, flying and striking
    // exactly as its thrower's does, now hers. A target that throws nothing
    // gives up all its Energy (SIPHON_0017, to 0: exhausted) and every bit
    // of it comes to her. The touch costs nothing and has no cooldown; the
    // throw costs 15 Energy (an ordinary copy) or waits its copy's 3 s or 5
    // s. It steps in by the shared Step-in. On the ground only (its air
    // move is the Air Finders Keepers).
    attack5: {
      animation: 'attack5',
      startup: 2 / FPS_0017.attack5,
      active: 2 / FPS_0017.attack5,
      recovery: 3 / FPS_0017.attack5,
      damage: 1,
      hitbox: { x: 6, y: -42, w: 30, h: 22 },
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.05,
      groundOnly: true,
      mimic: { spawnAt: 2 / FPS_0017.attack5, offset: { x: 32, y: -30 }, siphon: SIPHON_0017 },
    },
    // The Air Finders Keepers: her hand drawn back (frame 1, a fifteenth of
    // a second), then reached out before her (frames 2-4, live: from 4
    // units before her out to 34, at her chest's height), 1, no launch. The
    // same touch (`mimic`): a copy of her target's strongest projectile, or
    // all its Energy; holding a copy, she throws it instead, from her hand
    // 28 units before her, as she reaches out. Drawn back (frame 5): a third
    // of a second in all. Her drift under the universal air control.
    midair_attack5: {
      animation: 'midair_attack5',
      startup: 1 / FPS_0017.attack5,
      active: 3 / FPS_0017.attack5,
      recovery: 1 / FPS_0017.attack5,
      damage: 1,
      hitbox: { x: 4, y: -46, w: 30, h: 24 },
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.05,
      mimic: { spawnAt: 1 / FPS_0017.attack5, offset: { x: 28, y: -34 }, siphon: SIPHON_0017 },
    },
    // The Stick Poke: her stick raised over her shoulder and swung up
    // (frames 1-2, a tenth of a second), then brought down over her and
    // poked into the ground before her (frames 3-4, live: from her middle
    // out to 34 units, from the floor to over her cap), 3, Base Launch 2
    // sideways: a bonk from a girl who splits the earth. Held there and her stance (frames 5-6): three tenths of a
    // second in all, her quickest blow. Once it has hit, it opens a
    // follow-up. It steps in by the shared Step-in. On the ground only: the
    // sheet draws it standing.
    extra_attack: {
      animation: 'extra_attack',
      startup: 2 / FPS_0017.extra_attack,
      active: 2 / FPS_0017.extra_attack,
      recovery: 2 / FPS_0017.extra_attack,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 0, y: -44, w: 34, h: 44 },
      hitstun: 0.32,
      blockstun: 0.12,
      hitstop: 1 / 30,
      groundOnly: true,
      hitCancel: 4 / FPS_0017.extra_attack,
    },
  },
};
