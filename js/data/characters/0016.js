// #0016's definition: everything that makes #0016 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0016.md for what each move does in play.
//
// The adventurer in a teal tank top, combat trousers and boots, her hair in
// a long braid, cut from one supplied sprite sheet (see
// assets/characters/0016/). She fights the way she does in her canon: her
// feet and her acrobatics up close, a pistol in each hand, a hunting bow,
// a grappling line fired from a gun and a medipack. Every move is one she
// uses there: she summons nobody, makes no clone, never homes in and
// conjures nothing; her one heal is the medipack she carries. Five numbered
// attacks, each a button of its own, plus her extra_attack:
//
//   attack1  the Kick Combo, a high kick, then a spin into a kick driven out
//            behind her off her hands; in the air the Air Kick, a high kick
//            from mid-air
//   attack2  the Twin Pistols, both pistols fired in turn, four shots one
//            after another (a `volley`); in the air the Air Twin Pistols,
//            three shots
//   attack3  the Silent Arrow, a technique: her bow drawn, then an arrow
//            loosed far across the stage, which lands far harder in the
//            back of an opponent turned away from it (`backstab`): the
//            hunter's shot
//   attack4  the Flip Kick, a backflip whose kick sweeps up through the
//            air before her, launching up; in the air the Grapple, her
//            grapple gun fired straight up and her line hauling her after
//            it (motion `rise`), drawing in anyone near the hook (`pull`)
//            and striking them up, once per airtime: her way back to the
//            stage
//   attack5  the Medipack, a technique: knelt to patch herself up, then
//            back on her feet healed (`heal`)
//   extra_attack  the Leg Sweep, dropped low, her leg swept out along the
//            floor, tripping up; on the ground only
//
// Her Mash Combo (js/data/mash-combo.js) alternates the Kick Combo and the
// Leg Sweep, her two close-range strikes.
//
// Her Shield is her pistols crossed before her face, on the ground. In the
// air the Shield button is her Deflect: a somersault whose kick bats
// projectiles back. Her Dash is a sprint, flung low; her air dash a
// somersault. Her cooldowns are the shared policy's (js/data/cooldowns.js),
// derived from what each move does, never authored here: the Medipack waits
// 3 s (its heal), from its release; no other move deals 10, heals or holds,
// so none waits at all, and the Deflect none. The Twin Pistols, the Air Twin
// Pistols and the Silent Arrow cost 15 Energy each (each an ordinary
// construct: shots), the Deflect its 15, nothing else anything.
//
// What of the sheet is no move: her crouch, her side and upward pistol
// shots, the second string of the jab row that ends on a shot, both pistols
// fired out to either side, her flips firing down, her aerial shots angled
// down and her other aerial shots, her second flip kick, the bear trap and
// the crouch that sets it, the rope arrow shot straight up and the rope she
// climbs, the medikit, bow and ammunition pictures, the flying grapple hooks
// (drawn apart from her), her falls and getting up, her roll's coming up on
// the ground, her standing poses without her pistols, her intro on a rope,
// taunts, wins and losses, the motorcycle and the recoloured palettes.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0016's idle, her stance (her reference clip: the
// tallest of its frames). Her art is 1x (one file pixel per art pixel, cut
// with the sheet's flat green made transparent), so no pixel grid is ever
// looked for in it (`visual.pixelSize: 1`): each clip's heightRatio, its
// tallest frame over this, sizes it at exactly one art pixel per file pixel.
const ART_0016 = 55;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0016 = 88 / 52;

// Playback rates of #0016's clips. Each attack's phases below are whole
// frames of its clip at its rate, so tuning a rate keeps the timing on the
// art; every attack's rate is a whole number of 60 Hz steps per frame, so
// each frame lasts exactly as long as its gameplay does. (The Dash and the
// air dash last the universal Dash's length, whatever these say: their
// clips are shown once across it.)
const FPS_0016 = Object.freeze({
  idle: 8,
  run: 15,
  mouvment: 12,
  midair_mouvment: 12,
  jump: 12,
  fall: 10,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 20,
  attack1: 20,
  midair_attack1: 20,
  attack2: 20,
  midair_attack2: 20,
  attack2_object: 15,
  attack3_cast: 15,
  attack3_release: 15,
  attack4: 20,
  midair_attack4: 15,
  attack5_cast: 10,
  attack5_release: 10,
  extra_attack: 20,
});

// The Launch Points her medipack heals.
const MEDIPACK_HEAL_0016 = 10;

// Where her body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file: the middle of her tank
// top, which every frame draws on her body. Her pistols held out, her bow,
// her braid flung out, her kicking legs and her grappling line would pull
// the automatic anchor off her body. The frames lit by a pistol's flash,
// where the light hides her top, are anchored where their unlit twin's
// body is.
const ANCHORS_0016 = Object.freeze({
  idle: [20, 20, 20, 20, 20],
  run: [22, 27, 25, 20, 19, 25, 24, 17.5],
  mouvment: [26.5],
  midair_mouvment: [9.5, 26.5, 21.5, 15.5],
  jump: [20, 20.5, 20.5, 17.5],
  fall: [16, 14, 30, 30, 30],
  land: [14.5],
  hurt: [15.5, 14.5, 16.5],
  midair_hurt: [19.5, 19, 20.5, 22, 13.5, 24.5],
  prepshield: [14.5],
  shielding: [10.5],
  deflect: [26.5, 25.5, 19, 24.5, 23, 24],
  attack1: [12.5, 14.5, 17.5, 15.5, 13.5, 24.5, 13.5, 22, 22, 22, 21.5],
  midair_attack1: [12, 14.5, 17.5, 15.5, 13.5, 12],
  extra_attack: [15, 18, 18, 18, 18, 18],
  attack2: [19.5, 22.5, 14, 21, 20, 21, 16, 13, 13.5],
  midair_attack2: [26.5, 23.5, 22.5, 24],
  attack3: [19, 14.5, 14, 13.5, 13.5, 13, 20, 19],
  attack4: [14.5, 20, 25.5, 19, 24.5, 23, 24, 17.5],
  midair_attack4: [16, 20, 23, 20],
  attack5: [14, 14.5, 14, 15, 15],
});

// Where her feet are in each file of a codename (`anchorY`, art pixels
// down from the top of the file's visible art), file by file, for the clips
// whose frames leave the ground or reach below her feet: the sheet's own
// ground line under each. Her backflip rises off the floor and its kick's
// arc sweeps under her, her kick off her hands keeps her hands on the floor,
// her aerials keep the heights the sheet draws them at, and her somersault
// keeps its middle at one height as it turns. Every other clip stands on the
// bottom of its art.
const FEET_0016 = Object.freeze({
  midair_mouvment: [42, 36.5, 42, 36.5],
  deflect: [43, 45, 43, 54, 43, 52],
  attack1: [54, 54, 57, 57, 57, 51, 49, 47, 44, 40, 42],
  midair_attack1: [43, 43, 46, 46, 46, 43],
  attack4: [49, 52, 53, 51, 62, 51, 60, 51],
  midair_attack2: [45, 48, 48, 51],
});

// The height in art pixels of each file of a codename, file by file (what
// sizes a clip: its tallest frame over ART_0016).
const HEIGHTS_0016 = Object.freeze({
  idle: [55, 54, 54, 53, 52],
  run: [45, 42, 45, 47, 44, 41, 44, 48],
  mouvment: [43],
  midair_mouvment: [42, 31, 42, 31],
  jump: [52, 52, 53, 55],
  fall: [54, 56, 40, 36, 37],
  land: [48],
  hurt: [54, 54, 54],
  midair_hurt: [50, 40, 50, 32, 50, 40],
  prepshield: [52],
  shielding: [46],
  deflect: [43, 55, 39, 57, 43, 58],
  attack1: [54, 54, 57, 57, 57, 50, 47, 48, 45, 41, 42],
  midair_attack1: [43, 43, 44, 44, 44, 48],
  extra_attack: [39, 38, 38, 38, 38, 38],
  attack2: [50, 41, 40, 40, 40, 40, 40, 40, 49],
  midair_attack2: [43, 48, 48, 53],
  attack3: [54, 50, 46, 45, 45, 45, 45, 54],
  attack4: [48, 52, 55, 39, 57, 43, 58, 50],
  midair_attack4: [51, 66, 65, 96],
  attack5: [48, 48, 36, 36, 35],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame against
// the idle, each frame anchored on her body (and on the sheet's ground line
// where FEET_0016 says so).
const clip = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0016', codename, n)),
  fps,
  loop: false,
  heightRatio: Math.max(...order.map((n) => HEIGHTS_0016[codename][n - 1])) / ART_0016,
  anchorX: order.map((n) => ANCHORS_0016[codename][n - 1]),
  ...(FEET_0016[codename] ? { anchorY: order.map((n) => FEET_0016[codename][n - 1]) } : {}),
  ...extra,
});

// A projectile's clip: its files in order, centred, drawn at the fighter's
// art-pixel size whatever their own.
const object = (codename, count, fps, extra = {}) => ({
  frames: Array.from({ length: count }, (_, i) => framePath('0016', codename, i + 1)),
  fps,
  loop: false,
  ...extra,
});

// The Kick Combo's art: her pistols up (1), her knee drawn up (2), the high
// kick, her boot up by her head (3, 4, 5), down again (1), a lunge, a
// pistol thrown out behind her (6), turned, her back to us (7), down on her
// hands, kicking out behind her (8, 9, 10), and up again (11).
const KICK_COMBO_0016 = [1, 2, 3, 4, 5, 1, 6, 7, 8, 9, 10, 11];
// The Air Kick's: her pistols up (1), her knee drawn up (2), the high kick
// (3, 4, 5) and her legs down (6).
const AIR_KICK_0016 = [1, 2, 3, 4, 5, 6];
// The Flip Kick's: crouched (1), springing up (2), thrown back as her kick
// sweeps up through an arc before her (3), over on her back (4), upside
// down, her legs over her (5), coming round (6, 7), and landed (8).
const FLIP_KICK_0016 = [1, 2, 3, 4, 5, 6, 7, 8];
// The Leg Sweep's: dropped low, a pistol raised (1), her leg swept out
// along the floor, raising dust (2, 3), held out (4, 5, 6) and drawn back
// (1).
const LEG_SWEEP_0016 = [1, 2, 3, 4, 5, 6, 1];
// The Twin Pistols': her stance (1), both pistols drawn (2) and aimed (3),
// then four shots, each pistol in turn, lit by its flash (4, then 5, 6,
// then 7, twice), lowered (8) and back to her stance (9).
const TWIN_PISTOLS_0016 = [1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7, 8, 9];
// The Air Twin Pistols': leaping, her pistols back (1), aimed before her
// (2), then three shots, lit by their flash (3, 2, 3, 2, 3), her legs
// swinging down (4).
const AIR_TWIN_PISTOLS_0016 = [1, 2, 3, 2, 3, 2, 3, 4];
// The Silent Arrow's cast: her stance (1), her bow brought round (2), down
// on one knee, an arrow nocked (3), the string drawn back to her cheek (4,
// 5, 6). Its release: the arrow loosed, her drawing hand flung back (7),
// the bow still raised (3), lowered (2) and her stance (8).
const SILENT_ARROW_CAST_0016 = [1, 2, 3, 4, 5, 6];
const SILENT_ARROW_RELEASE_0016 = [7, 3, 2, 8];
// The Grapple's: her grapple gun at her shoulder (1), aimed straight up
// (2), fired, lit by its flash (3), still aimed (2), then her line taut
// from the hook over her, hauling her up (4, held).
const GRAPPLE_0016 = [1, 2, 3, 2, 4, 4, 4];
// The Medipack's cast: standing (1), reaching to her belt (2), knelt over
// the medipack, patching herself up (3, 4, 5, then 4, 5 again, twice, and
// 4). Its release: back on her feet (2, 1).
const MEDIPACK_CAST_0016 = [1, 2, 3, 4, 5, 4, 5, 4, 5, 4];
const MEDIPACK_RELEASE_0016 = [2, 1];
// Her Deflect's: flung forward (1), thrown back as her kick sweeps up
// through an arc before her (2), over on her back (3), upside down (4) and
// coming round (5, 6).
const DEFLECT_0016 = [1, 2, 3, 4, 5, 6];

export const CHARACTER_0016 = {
  id: '0016',
  displayName: '#0016',
  available: true,
  rosterSlot: 15,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0016 and FEET_0016.
  animations: {
    // Her stance, a pistol raised by her shoulder and one low, breathing:
    // five poses, there and back.
    idle: { ...clip('idle', [1, 2, 3, 4, 5, 4, 3, 2], FPS_0016.idle), loop: true },
    // The run: the sheet's eight running frames, a pistol in each hand, her
    // braid streaming. Its rate follows the speed, down to 0.6 of it (and up
    // past it on a Dash's run-on).
    run: { ...clip('run', [1, 2, 3, 4, 5, 6, 7, 8], FPS_0016.run), loop: true, minSpeedScale: 0.6 },
    // Springing up, her legs tucked (the takeoff), then rising, her pistols
    // swung up; falling, her pistols raised, then flung wide in a swan dive;
    // touching down crouched, a pistol out.
    jump: clip('jump', [1, 2, 3, 4], FPS_0016.jump),
    fall: clip('fall', [1, 2, 3, 4, 5], FPS_0016.fall),
    land: clip('land', [1], FPS_0016.land),
    // mouvment, the Dash: her sprint, flung low, a pistol thrown back,
    // shown across the whole Dash.
    mouvment: clip('mouvment', [1], FPS_0016.mouvment),
    // midair_mouvment, the air dash: a somersault, tucked (1), over (2),
    // upside down (3) and coming out of it (4), played once across the
    // whole air dash.
    midair_mouvment: clip('midair_mouvment', [1, 2, 3, 4], FPS_0016.midair_mouvment),
    // Hitstun: `hurt` wincing, her pistols lowered; `midair_hurt` knocked
    // back, then tumbling over and over.
    hurt: clip('hurt', [1, 2, 3], FPS_0016.hurt),
    midair_hurt: clip('midair_hurt', [1, 2, 3, 4, 5, 6], FPS_0016.hurt),
    // Her guard, on the ground: a pistol lowered (prepshield), then both
    // crossed before her face (shielding). The sheet draws no lowering: the
    // Shield goes down at once.
    prepshield: clip('prepshield', [1], FPS_0016.shield),
    shielding: clip('shielding', [1], FPS_0016.shield),
    // deflect, her Deflect (see DEFLECT_0016).
    deflect: clip('deflect', DEFLECT_0016, FPS_0016.deflect),
    // attack1, the Kick Combo (see KICK_COMBO_0016).
    attack1: clip('attack1', KICK_COMBO_0016, FPS_0016.attack1),
    // midair_attack1, the Air Kick (see AIR_KICK_0016).
    midair_attack1: clip('midair_attack1', AIR_KICK_0016, FPS_0016.midair_attack1),
    // attack2, the Twin Pistols (see TWIN_PISTOLS_0016).
    attack2: clip('attack2', TWIN_PISTOLS_0016, FPS_0016.attack2),
    // midair_attack2, the Air Twin Pistols (see AIR_TWIN_PISTOLS_0016).
    midair_attack2: clip('midair_attack2', AIR_TWIN_PISTOLS_0016, FPS_0016.midair_attack2),
    // attack3, the Silent Arrow, a technique: its cast and its release (see
    // SILENT_ARROW_CAST_0016), from the attack3 files.
    attack3_cast: clip('attack3', SILENT_ARROW_CAST_0016, FPS_0016.attack3_cast),
    attack3_release: clip('attack3', SILENT_ARROW_RELEASE_0016, FPS_0016.attack3_release),
    // attack4, the Flip Kick (see FLIP_KICK_0016).
    attack4: clip('attack4', FLIP_KICK_0016, FPS_0016.attack4),
    // midair_attack4, the Grapple (see GRAPPLE_0016).
    midair_attack4: clip('midair_attack4', GRAPPLE_0016, FPS_0016.midair_attack4),
    // attack5, the Medipack, a technique: its cast and its release (see
    // MEDIPACK_CAST_0016), from the attack5 files.
    attack5_cast: clip('attack5', MEDIPACK_CAST_0016, FPS_0016.attack5_cast),
    attack5_release: clip('attack5', MEDIPACK_RELEASE_0016, FPS_0016.attack5_release),
    // extra_attack, the Leg Sweep (see LEG_SWEEP_0016).
    extra_attack: clip('extra_attack', LEG_SWEEP_0016, FPS_0016.extra_attack),
  },

  // Her projectiles' art, normalized at their own size.
  projectileAnimations: {
    // A pistol shot: a white streak that thins out as it flies (1-5), once
    // across its short run. The same either way: never mirrored.
    attack2_object: object('attack2_object', 5, FPS_0016.attack2_object, { sourceFacing: 0 }),
    // Her arrow, drawn flying right: mirrored when it flies left.
    attack3_object: object('attack3_object', 1, 1, { sourceFacing: 1 }),
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
    // Her 55-pixel stance at the roster's common art-pixel size, 88/52
    // world units per art pixel (so every fighter's pixels are the same
    // size on screen): about 93 units.
    height: ART_0016 * UNIT_0016,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.22, size: 0.52 },
    // The colours she bursts in when the Void takes her (see
    // js/game/rendering/hit-fx.js), picked from her art: her auburn braid,
    // her teal tank top, her skin, her dark trousers and her pistols' steel.
    eliminationPalette: ['#844040', '#6f8a95', '#eda288', '#38332c', '#90979a'],
  },

  // Her body, measured from her stance: her head and shoulders, then her
  // hips and legs. Collision is independent of the art.
  collider: { width: 28, height: 88 },
  pushbox: { width: 32 },
  hurtboxes: [
    { x: -16, y: -93, w: 32, h: 47 }, // head and torso
    { x: -18, y: -46, w: 36, h: 46 }, // hips and legs
  ],

  // How #0016 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): an acrobat, she is flung a little less long
  // than most, 0.14 s more stun per 1000 units/s and 0.45 s more at most,
  // tumbling only from 1150 units/s, and a held direction bends a launch by
  // up to 25 degrees: she twists out of a throw better than most.
  launchReaction: {
    stunPerThousand: 0.14,
    maxStun: 0.45,
    tumbleSpeed: 1150,
    steerAngle: 25,
  },

  // Her guard, what the `shield` input does for #0016 on the ground: a
  // pistol lowered, then both crossed before her face (see the clips). Her
  // perfect Shield opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Her Deflect, what the `shield` input does for #0016 in the air (schema:
  // js/game/combat/deflect.js): flung forward (the startup), then the
  // somersault, her kick sweeping up through an arc before her (live for
  // three frames: 16 units behind her to 46 in front, from below her feet
  // to over her head), coming round (its recovery). Every Deflect's 3, Base
  // Launch 2, here sideways, kicked away before her; while it is live it
  // turns the other fighter's projectiles back at their thrower, now
  // #0016's. Three tenths of a second in all, keeping the whole of her
  // drift, under the universal air control, never stepping in (a defense:
  // js/data/attack-movement.js); no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0016.deflect,
    active: 3 / FPS_0016.deflect,
    recovery: 2 / FPS_0016.deflect,
    hitbox: { x: -16, y: -88, w: 62, h: 96 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1, attack2 and attack4 ordinary attacks with
  // their mid-air versions, attack3 and attack5 techniques (on the ground);
  // and her extra_attack, on the ground only (its attack is `groundOnly`).
  actions: {
    extra_attack: 'extra_attack', // the Leg Sweep
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Kick Combo / the Air Kick
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Twin Pistols / the Air Twin Pistols
    attack3: { type: 'technique', id: 'attack3' }, // the Silent Arrow
    attack4: { ground: 'attack4', air: 'midair_attack4' }, // the Flip Kick / the Grapple
    attack5: { type: 'technique', id: 'attack5' }, // the Medipack
  },

  // Her Mash Combo pair (js/data/mash-combo.js): the Kick Combo and the
  // Leg Sweep, her two close-range strikes. Mashing either button sets off
  // twelve turns.
  mashCombo: { attacks: ['attack1', 'extra_attack'] },

  // Her Special ability (js/data/special-abilities.js): the Medipack, the
  // one move that heals her, a long kneel any blow breaks: a fight with her
  // is a fight to keep her from finding the room for it. Her kicks, her
  // pistols, her bow and her grapple are her everyday tools: ordinary to
  // the player.
  specialAbilities: ['attack5'],

  // UI only: a frame of each move's own art (zero-based frames): her leg
  // swept out raising dust, her kick off her hands, the high kick in the
  // air, a pistol's flash on the ground and in the air, the bow drawn, the
  // arc of the backflip, her line hauling her up, and knelt over the
  // medipack.
  mobileAbilities: {
    extra_attack: { label: 'Leg Sweep', preview: { animation: 'extra_attack', frame: 2 } },
    attack1: { label: 'Kick Combo', preview: { animation: 'attack1', frame: 9 }, previews: { air: { animation: 'midair_attack1', frame: 3 } } },
    attack2: { label: 'Twin Pistols', preview: { animation: 'attack2', frame: 3 }, previews: { air: { animation: 'midair_attack2', frame: 2 } } },
    attack3: { label: 'Silent Arrow', preview: { animation: 'attack3_cast', frame: 5 } },
    attack4: { label: 'Flip Kick', preview: { animation: 'attack4', frame: 2 }, previews: { air: { animation: 'midair_attack4', frame: 4 } } },
    attack5: { label: 'Medipack', preview: { animation: 'attack5_cast', frame: 3 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Leg Sweep',
    attack1: 'Kick Combo',
    midair_attack1: 'Air Kick',
    attack2: 'Twin Pistols',
    midair_attack2: 'Air Twin Pistols',
    attack3: 'Silent Arrow',
    attack4: 'Flip Kick',
    midair_attack4: 'Grapple',
    attack5: 'Medipack',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0016.<move>.description).
  abilityDescriptions: {
    extra_attack: 'Drops low and sweeps her leg out along the floor, tripping the opponent up.',
    attack1: 'A high kick that holds the opponent, then a spin into a kick driven out off her hands, knocking them away.',
    midair_attack1: 'A high kick in the air, knocking the opponent away.',
    attack2: 'Fires both pistols in turn, four quick shots; a Shield that blocks one stops the rest.',
    midair_attack2: 'Fires both pistols in turn in the air, three quick shots; a Shield that blocks one stops the rest.',
    attack3: 'Draws her bow and looses an arrow far across the stage; in the back of an opponent turned away, it lands far harder.',
    attack4: 'A backflip whose kick sweeps up through the air before her, launching the opponent upward.',
    midair_attack4: 'Fires her grapple straight up and is hauled after it, drawing in anyone near the hook and striking them upward. Once per jump.',
    attack5: 'Kneels to patch herself up with a medipack, taking Launch Point off herself. Any hit breaks it.',
  },

  // Her recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     her quick blows: the Kick Combo, and in the air the
  //                  Air Kick, her basic aerial
  //   Triangle / Y   the Leg Sweep, her other everyday strike, a thumb's
  //                  roll from Square for her Mash Combo
  //   R2 / RT        the Twin Pistols, her ranged move, on the ground and
  //                  in the air: the shots go out ahead
  //   right stick    the Silent Arrow: an arrow sent out the way she faces
  //   forward
  //   right stick    the Flip Kick, a backflip that sends its target up;
  //   up             in the air the Grapple, fired straight up, and she
  //                  rises after it: both go up
  //   L2 / LT        the Medipack, her Special: a deliberate trigger, never
  //                  squeezed by accident
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:extra_attack': pad('north'),
      'ground:attack2': pad('r2'),
      'ground:attack3': flick('forward'),
      'ground:attack4': flick('up'),
      'ground:attack5': pad('l2'),
      'air:attack1': pad('west'),
      'air:attack2': pad('r2'),
      'air:attack4': flick('up'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0016 stands committed to it,
  // then lets go all at once. A hit on #0016 before it lets go breaks it
  // (nothing released), and it needs the ground throughout.
  techniques: {
    // The Silent Arrow: her bow brought round, down on one knee, an arrow
    // nocked and drawn back to her cheek (two fifths of a second, nothing
    // protects it), then loosed (her arrow, below, from her bow 40 units
    // before her at her chest); the bow lowered and her stance (four
    // fifteenths of a second more). An ordinary construct: 15 Energy, no
    // cooldown.
    attack3: {
      castAnimation: 'attack3_cast',
      releaseAnimation: 'attack3_release',
      projectile: { id: 'attack3_object', offset: { x: 40, y: -46 } },
    },
    // The Medipack: a full second, her hand to her belt and knelt over the
    // medipack (her longest commitment, and nothing protects it);
    // as she gets back up she has healed herself of MEDIPACK_HEAL_0016
    // Launch Points (never below 0). A hit before then breaks it and heals
    // nothing. A heal harms nobody: any move, a jump or a Dash cuts it
    // short (before the heal, nothing healed and no cooldown). Once every
    // 3 seconds (the policy's, for a heal), from the heal.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      heal: MEDIPACK_HEAL_0016,
    },
  },

  // Her projectiles (schema: js/game/combat/projectile.js), named after the
  // attack that lets each go.
  projectiles: {
    // A pistol shot: 760 units/s for 0.4 s (about 300 units). Whoever it
    // strikes takes 1, a stun just long enough for the next to land: a
    // volley's four add up to 4. No launch.
    attack2_object: {
      animation: 'attack2_object',
      speed: 760,
      lifetime: 0.4,
      hitbox: { x: -14, y: -7, w: 28, h: 14 },
      damage: 1,
      hitstun: 0.2,
      blockstun: 0.08,
      hitstop: 1 / 30,
    },
    // A shot fired in the air: the same shot, the same in every way.
    midair_attack2_object: {
      animation: 'attack2_object',
      speed: 760,
      lifetime: 0.4,
      hitbox: { x: -14, y: -7, w: 28, h: 14 },
      damage: 1,
      hitstun: 0.2,
      blockstun: 0.08,
      hitstop: 1 / 30,
    },
    // Her arrow: 780 units/s for 0.6 s (about 470 units, a third of the main
    // stage),
    // its box the length of the arrow. It strikes 3 at Base Launch 1,
    // sideways, the way it flies: a solid hit more than a throw; in the
    // back of an opponent turned away from it (see backTurned in
    // js/game/combat/hit-effects.js) it lands as the hunter's shot
    // (`backstab`): 5 at Base Launch 3, held longer. A Shield that blocks
    // it stops it, either way round.
    attack3_object: {
      animation: 'attack3_object',
      speed: 780,
      lifetime: 0.6,
      hitbox: { x: -22, y: -7, w: 44, h: 14 },
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitstun: 0.4,
      blockstun: 0.14,
      hitstop: 0.06,
      backstab: { damage: 5, baseLaunch: 3, directionalLaunch: 'horizontal', hitstun: 0.5, hitstop: 0.1 },
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown: none deals 10, heals or
  // holds. Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; the Kick Combo, the Flip Kick and the
  // Leg Sweep step in by the shared Step-in.
  attacks: {
    // The Kick Combo: her knee drawn up (frames 1-2, a tenth of a second),
    // the high kick, her boot up by her head (frames 3-5, live: from 8 units
    // before her out to 48, from her waist to over her head), 1, no launch,
    // a stun that holds the target for the next; down, a lunge and turned,
    // her back to us (frames 6-8), then down on her hands, her heel driven
    // out (frames 9-11, live: from 14 units before her out to 62, from her
    // hips to her shoulders), 3, Base Launch 2 sideways. Up again (frame
    // 12): three fifths of a second in all. Once the kick has hit, it opens
    // a follow-up. It steps in by the shared Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 1 / FPS_0016.attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0016.attack1, active: 3 / FPS_0016.attack1, damage: 1, hitbox: { x: 8, y: -88, w: 40, h: 44 }, hitstun: 0.42 },
        {
          at: 8 / FPS_0016.attack1, active: 3 / FPS_0016.attack1, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal',
          hitbox: { x: 14, y: -78, w: 48, h: 38 }, hitstun: 0.38, hitstop: 0.05,
        },
      ],
      groundOnly: true,
      hitCancel: 10 / FPS_0016.attack1,
    },
    // The Air Kick: her knee drawn up (frames 1-2, a tenth of a second),
    // then the high kick (frames 3-5, live: from 6 units before her out to
    // 48, from her hips to over her head), 3, Base Launch 1 sideways. Her
    // legs down (frame 6): three tenths of a second. Her drift under the
    // universal air control.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 2 / FPS_0016.midair_attack1,
      active: 3 / FPS_0016.midair_attack1,
      recovery: 1 / FPS_0016.midair_attack1,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: { x: 6, y: -76, w: 42, h: 42 },
      hitstun: 0.32,
      blockstun: 0.12,
      hitstop: 0.05,
    },
    // The Twin Pistols: both pistols drawn and aimed (frames 1-3, three
    // twentieths of a second), then four shots, each pistol in turn, a
    // tenth of a second apart (a `volley` of her shot, above, from her
    // muzzles 50 units before her at her chest), and back to her stance:
    // thirteen twentieths of a second in all. One press, one Energy cost
    // (15), however many shots; a Shield that blocks one stops the rest. On
    // the ground only (its air move is the Air Twin Pistols); a shot never
    // steps in.
    attack2: {
      animation: 'attack2',
      startup: 3 / FPS_0016.attack2,
      active: 7 / FPS_0016.attack2,
      recovery: 3 / FPS_0016.attack2,
      hitbox: null,
      projectile: {
        id: 'attack2_object', spawnAt: 3 / FPS_0016.attack2, offset: { x: 50, y: -48 },
        volley: { count: 4, interval: 2 / FPS_0016.attack2 },
      },
      groundOnly: true,
    },
    // The Air Twin Pistols: aimed (frames 1-2, a tenth of a second), then
    // three shots a tenth of a second apart (a `volley`, from her muzzles 44
    // units before her at her chest), her legs swinging down: two fifths of
    // a second in all. 15 Energy. Her drift under the universal air control.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 2 / FPS_0016.midair_attack2,
      active: 5 / FPS_0016.midair_attack2,
      recovery: 1 / FPS_0016.midair_attack2,
      hitbox: null,
      projectile: {
        id: 'midair_attack2_object', spawnAt: 2 / FPS_0016.midair_attack2, offset: { x: 44, y: -56 },
        volley: { count: 3, interval: 2 / FPS_0016.midair_attack2 },
      },
    },
    // The Flip Kick: crouched and springing up (frames 1-2, a tenth of a
    // second), then thrown back as her kick sweeps up through its arc
    // before her and over her (frames 3-5, live: from 8 units behind her
    // out to 46, from the floor to well over her head), 3, Base Launch 2
    // straight up. Coming round and landed (frames 6-8): two fifths of a
    // second in all. Once the kick has hit, it opens a follow-up. It steps
    // in by the shared Step-in. On the ground only (its air move is the
    // Grapple): the sheet draws it off the floor and back onto it.
    attack4: {
      animation: 'attack4',
      startup: 2 / FPS_0016.attack4,
      active: 3 / FPS_0016.attack4,
      recovery: 3 / FPS_0016.attack4,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: -8, y: -100, w: 54, h: 100 },
      hitstun: 0.36,
      blockstun: 0.12,
      hitstop: 1 / 30,
      groundOnly: true,
      hitCancel: 5 / FPS_0016.attack4,
    },
    // The Grapple: her grapple gun at her shoulder and aimed straight up
    // (frames 1-2, two fifteenths of a second, the hang), then fired: she
    // is hauled up after it at 520 units/s (frames 3-6, about 140 units,
    // and on up under gravity). While she rises her line draws in anyone
    // within 110 units of the hook over her head (`pull`, at up to 520
    // units/s) and her line and its hook strike them (live: from 16 units
    // behind her to 32 in front, from her chest to 170 up), 3, Base Launch
    // 2 straight up. Still hanging from it (frame 7): seven fifteenths of a
    // second, then she falls. Once per airtime (landing or being hit gives
    // it back): her way back to the stage. The lift is its own motion; half
    // her drift kept.
    midair_attack4: {
      animation: 'midair_attack4',
      startup: 2 / FPS_0016.midair_attack4,
      active: 4 / FPS_0016.midair_attack4,
      recovery: 1 / FPS_0016.midair_attack4,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: -16, y: -170, w: 48, h: 120 },
      hitstun: 0.36,
      blockstun: 0.12,
      hitstop: 0.05,
      pull: { radius: 110, speed: 520, offset: { x: 4, y: -124 } },
      motion: { type: 'rise', speed: 520 },
      airUses: 1,
      airMomentum: 0.5,
    },
    // The Leg Sweep: dropped low (frame 1, a twentieth of a second), then
    // her leg swept out along the floor, raising dust (frames 2-3, live:
    // from 4 units before her out to 48, from the floor to her knee), 3,
    // Base Launch 1 straight up: tripped, popped off its feet. Held out and
    // drawn back (frames 4-7): seven twentieths of a second in all, her
    // quickest blow. Once it has hit, it opens a follow-up. It steps in by
    // the shared Step-in. On the ground only: the sheet draws it low on the
    // floor.
    extra_attack: {
      animation: 'extra_attack',
      startup: 1 / FPS_0016.extra_attack,
      active: 2 / FPS_0016.extra_attack,
      recovery: 4 / FPS_0016.extra_attack,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'vertical',
      hitbox: { x: 4, y: -30, w: 44, h: 30 },
      hitstun: 0.34,
      blockstun: 0.12,
      hitstop: 1 / 30,
      groundOnly: true,
      hitCancel: 3 / FPS_0016.extra_attack,
    },
  },
};
