// #0012's definition: everything that makes #0012 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0012.md for what each move does in play.
//
// The cyborg ninja in silver armour with a green-lit visor, cut from one
// supplied sprite sheet (see assets/characters/0012/). Rebuilt with a
// machine body, it fights with a sword whose edge glows green, throws
// shuriken from its wrist, turns shots back with its blade, crosses a
// stage in one dashing cut and, once the dragon spirit of its blade wakes,
// cleaves everything round it. Every move is one it uses in its canon: it
// heals nobody, summons nobody, never homes in and throws nothing but its
// shuriken. Five numbered attacks, each a button of its own, plus its
// extra_attack:
//
//   attack1  Twin Cuts, a chop and a rising cut; in the air the Whirlwind
//            Cut, a curled spin whose blade sweeps all round it
//   attack2  the Cleave, a two-handed cut brought over its head and down;
//            in the air the Rising Arc, a cut swept up from under it,
//            launching up
//   attack3  the Deflect Stance, its blade held out before it, turning back
//            every shot that meets it (`deflectProjectiles`); in the air
//            the Falling Cut, a cut brought down from over its head,
//            spiking down
//   attack4  Swift Strike, a dash that cuts through everyone in its way
//            (motion `roll`, `passThrough`); in the air the Rising Strike,
//            the same dash aimed straight up (motion `rise`), once per
//            airtime
//   attack5  Dragonblade, a technique: its blade drawn, then the dragon
//            spirit coiling round it as it cleaves all round itself (10)
//   extra_attack  Shuriken, three thrown one after another from its wrist
//            (a `volley`), on the ground and in the air
//
// Its Mash Combo (js/data/mash-combo.js) alternates Twin Cuts and the
// Cleave, its two close-range cuts.
//
// Its Shield is its blade held across its body, on the ground. In the air
// the Shield button is its Deflect, its canon's own: the blade spun in a
// whirl of orange cuts that bats projectiles back. Its Dash is a blur of
// speed; its air dash a leap, tucked, a foot thrust ahead. Its cooldowns
// are the shared policy's (js/data/cooldowns.js), derived from what each
// move does, never authored here: Dragonblade waits 5 s (its 10) from its
// release, every other move none at all, and the Deflect none. Shuriken
// costs 15 Energy a throw (its three shots one use), the Deflect its 15,
// nothing else anything. The sheet's crouch, its other cuts (the thrust,
// the upward and low cuts, the ground stab and its burst, the back and
// upward aerials), its leaps and kicks, its smoke bomb (intro and exit),
// its taunts, wins and losses, its falls and getting up and the portrait
// are no move; nor are the drawings the sheet repeats from one row in
// another (the Dragonblade's opening guard and draw, its dash, its last
// guard), each cut once, for the move that has it.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0012's idle, its standing pose (its reference
// clip: the tallest of its ten frames, breathing in). Its art is 1x (one
// file pixel per art pixel, cut with its flat background made
// transparent), so no pixel grid is ever looked for in it
// (`visual.pixelSize: 1`): each clip's heightRatio, its tallest frame over
// this, is what sizes it, at exactly one art pixel per file pixel.
const ART_0012 = 57;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0012 = 88 / 52;

// Playback rates of #0012's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their clips are shown once
// across it.)
const FPS_0012 = Object.freeze({
  idle: 10,
  run: 15,
  mouvment: 20,
  midair_mouvment: 12,
  jump: 12,
  fall: 10,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 20,
  attack1: 20,
  midair_attack1: 30,
  attack2: 20,
  midair_attack2: 20,
  attack3: 12,
  midair_attack3: 20,
  attack4: 20,
  midair_attack4: 20,
  attack5_cast: 10,
  attack5_release: 15,
  attack5_object: 20,
  extra_attack: 15,
  extra_attack_object: 20,
});

// Where its body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file: the middle of its
// armour over its head and torso, where the automatic anchor would put it
// on the art as a whole. Its blade, the green sweeps of its cuts, the
// orange whirl of its Deflect and the trail of its Swift Strike are drawn
// beside or round it and would pull the automatic anchor off it. Its
// standing pose is anchored between its planted feet (its breathing sways
// its shoulders, never its feet), its run on its head, which every run
// frame draws in the same place; Swift Strike's trail frames on its body,
// a blur at the trail's head.
const ANCHORS_0012 = Object.freeze({
  idle: [26.5, 25.5, 28.5, 26.5, 25.5, 23.5, 23.5, 29.5, 26.5, 28.5],
  run: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  jump: [29.5, 21.5, 15.5],
  fall: [10.5, 17.5],
  land: [22.5],
  hurt: [28.5, 27.5],
  midair_hurt: [25.5, 30.5],
  shielding: [13.5],
  deflect: [30.5, 21.5, 22.5, 21.5, 36.5, 31.5],
  mouvment: [16.5, 17.5, 15.5, 17.5, 20.5, 19.5, 22.5],
  midair_mouvment: [50.5, 32.5],
  attack1: [38.5, 43.5, 30.5, 29.5, 26.5, 26.5, 30.5, 30.5, 29.5, 49],
  midair_attack1: [10.5, 12.5, 15.5, 17.5, 35.5, 53.5, 55.5, 58.5, 56.5, 46.5, 20.5, 10.5, 24.5],
  attack2: [45.5, 50.5, 37.5, 42.5, 27.5, 24.5, 27.5, 27.5, 26.5],
  midair_attack2: [49.5, 47, 16.5, 16.5, 22.5, 49.5, 63.5],
  attack3: [13.5, 17.5, 18.5, 19.5],
  midair_attack3: [51.5, 23.5, 26.5, 27.5, 22.5, 16.5, 16.5, 46.5],
  attack4: [26.5, 34.5, 51.5, 117, 43, 44, 48, 198, 159, 30.5, 26.5],
  midair_attack4: [21.5, 13.5, 13.5, 10.5, 10.5, 23.5, 25.5],
  attack5: [31.5, 21.5, 13.5, 17.5, 19.5, 30.5, 21.5, 22.5, 21.5, 36.5, 31.5, 28.5, 20.5],
  extra_attack: [35.5, 35.5, 35.5, 34.5, 29.5, 34.5, 35.5, 24.5],
});

// Where its feet are in each file of a codename that draws something below
// them (`anchorY`, art pixels down from the top of the file's visible art),
// file by file: a cut swept under it, the blade's point dipped past its
// heel or the Deflect's whirl at its feet would otherwise lift its whole
// body off the ground by that much. A codename left out stands on the
// bottom of its art.
const FEET_0012 = Object.freeze({
  hurt: [54, 43],
  midair_hurt: [56, 28],
  deflect: [48, 56, 62, 55, 46, 40],
  mouvment: [51, 58, 59, 53, 41, 36, 44],
  midair_mouvment: [44, 41],
  attack1: [44, 87, 91, 82, 49, 49, 43, 55, 82, 81],
  midair_attack1: [61, 57, 35, 29, 30, 36, 38, 55, 67, 67, 68, 69, 69],
  attack2: [47, 49, 51, 62, 63, 62, 49, 49, 41],
  midair_attack2: [50, 39, 44, 56, 83, 82, 41],
  attack3: [50, 43, 43, 45],
  midair_attack3: [68, 99, 101, 82, 58, 52, 52, 44],
  attack5: [53, 45, 47, 45, 47, 48, 56, 62, 55, 46, 40, 65, 45],
});

// The height in art pixels of each file of a codename, file by file (what
// sizes a clip: its tallest frame over ART_0012).
const HEIGHTS_0012 = Object.freeze({
  idle: [57, 56, 55, 53, 52, 51, 52, 53, 55, 56],
  run: [50, 48, 49, 48, 47, 50, 48, 49, 46, 47],
  jump: [42, 48, 56],
  fall: [45, 53],
  land: [32],
  hurt: [59, 45],
  midair_hurt: [64, 28],
  shielding: [48],
  deflect: [53, 56, 68, 55, 46, 42],
  mouvment: [51, 60, 59, 53, 41, 36, 46],
  midair_mouvment: [55, 52],
  attack1: [44, 87, 91, 82, 51, 51, 76, 69, 82, 81],
  midair_attack1: [61, 59, 67, 67, 68, 69, 61, 59, 67, 67, 68, 69, 69],
  attack2: [47, 49, 51, 62, 63, 62, 49, 49, 43],
  midair_attack2: [50, 76, 76, 69, 83, 82, 41],
  attack3: [52, 43, 43, 45],
  midair_attack3: [68, 99, 101, 82, 79, 90, 90, 44],
  attack4: [66, 57, 41, 58, 58, 55, 51, 52, 51, 52, 41],
  midair_attack4: [64, 72, 82, 91, 91, 87, 102],
  attack5: [58, 45, 47, 45, 47, 53, 56, 68, 55, 46, 42, 68, 45],
  extra_attack: [46, 48, 47, 44, 44, 46, 48, 47],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame against
// the idle, each frame anchored on its body (and on its feet where the art
// reaches below them).
const clip = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0012', codename, n)),
  fps,
  loop: false,
  heightRatio: Math.max(...order.map((n) => HEIGHTS_0012[codename][n - 1])) / ART_0012,
  anchorX: order.map((n) => ANCHORS_0012[codename][n - 1]),
  ...(FEET_0012[codename] ? { anchorY: order.map((n) => FEET_0012[codename][n - 1]) } : {}),
  ...extra,
});

// A projectile's or an effect's clip: its files in order, centred, drawn at
// the fighter's art-pixel size whatever their own.
const object = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0012', codename, n)),
  fps,
  loop: false,
  ...extra,
});

// Its standing pose: the sheet's ten stand frames, one breath, in and out.
const STAND_0012 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// Twin Cuts' art: ready, its blade low (file 1), raised behind it in a
// sweep (2), over its head (3), the chop brought down ahead of it (4) and
// on to its feet (5), the blade low (6), swept up from under (7), out
// ahead (8) and on over its head (9), its follow-through behind it (10).
const TWIN_CUTS_0012 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// The Whirlwind Cut's: curled into a ball, its blade sweeping a ring round
// it, ahead (1-4), under and behind (5-8), over (9-11) and ahead again
// (12), the blade drawn in (13).
const WHIRLWIND_0012 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
// The Cleave's: crouched, its blade trailing behind (1, 2), raised over its
// shoulder (3), brought over its head (4), down ahead of it (5, 6) and on
// low (7), drawn back (8, 9).
const CLEAVE_0012 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// The Rising Arc's: its blade trailing behind (1), swept under it (2),
// ahead and low (3), out ahead (4), up over its head (5) and behind it (6),
// drawn in (7).
const RISING_ARC_0012 = [1, 2, 3, 4, 5, 6, 7];
// The Deflect Stance's: its blade drawn (1), held out across its body,
// flicking from one guard to the next (2, 3, 4, 3, 2, 3, 4), lowered as it
// was drawn (1).
const STANCE_0012 = [1, 2, 3, 4, 3, 2, 3, 4, 1];
// The Falling Cut's: its blade trailing behind (1), raised behind its head
// (2), swept up over it (3), brought down ahead (4), on under it (5) and
// below its feet (6), its point hanging (7), drawn back (8).
const FALLING_CUT_0012 = [1, 2, 3, 4, 5, 6, 7, 8];
// Swift Strike's: its blade raised (1), drawn back (2), crouched to spring
// (3), gone in a dash, its green trail stretching behind it (4, 5),
// thinning (6, 7) to a grey blur (8, 9), arrived, its blade out behind it
// (10), drawn in (11).
const SWIFT_STRIKE_0012 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// The Rising Strike's: its blade straight up (1), springing up through a
// sweep of cuts over it (2, 3, 4), still rising, its blade up (5, 6, 7).
const RISING_STRIKE_0012 = [1, 2, 3, 4, 5, 6, 7];
// Shuriken's: its throwing hand drawn back, the shuriken glinting in it (1,
// 2), whipped across its body (3, 4), the throw followed through (5-8).
const SHURIKEN_0012 = [1, 2, 3, 4, 5, 6, 7, 8];

export const CHARACTER_0012 = {
  id: '0012',
  displayName: '#0012',
  available: true,
  rosterSlot: 11,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0012 and FEET_0012.
  animations: {
    // Its standing pose (see STAND_0012), its blade held low.
    idle: { ...clip('idle', STAND_0012, FPS_0012.idle), loop: true },
    // The run: the sheet's ten frames, leaning in, its scarf streaming. Its
    // rate follows the speed, down to 0.6 of it (and up past it on a
    // Dash's run-on).
    run: { ...clip('run', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], FPS_0012.run), loop: true, minSpeedScale: 0.6 },
    // Takeoff crouched, then springing up, then rising, its blade trailing;
    // falling tucked, then its legs let down, its blade held out; touching
    // down in a crouch.
    jump: clip('jump', [1, 2, 3], FPS_0012.jump),
    fall: clip('fall', [1, 2], FPS_0012.fall),
    land: clip('land', [1], FPS_0012.land),
    // mouvment, the Dash: crouched, then a blur of speed, its blade a
    // streak through it, played once across the whole Dash.
    mouvment: clip('mouvment', [1, 2, 3, 4, 5, 6, 7], FPS_0012.mouvment),
    // midair_mouvment, the air dash: a leap, tucked, then a foot thrust
    // ahead, played once across the whole air dash.
    midair_mouvment: clip('midair_mouvment', [1, 2], FPS_0012.midair_mouvment),
    // Hitstun: `hurt` thrown back, then doubled over; `midair_hurt` jolted,
    // then laid out flat.
    hurt: clip('hurt', [1, 2], FPS_0012.hurt),
    midair_hurt: clip('midair_hurt', [1, 2], FPS_0012.hurt),
    // Its guard, on the ground: its blade held across its body, the one
    // guard pose the sheet draws for it (no raise or lower poses of their
    // own: the Shield goes up and down at once).
    shielding: clip('shielding', [1], FPS_0012.shield),
    // deflect, its Deflect: in the air, its blade spun in a whirl of orange
    // cuts round it, low and behind (1), ahead and over (2-4), behind
    // again (5), dying away at its feet (6).
    deflect: clip('deflect', [1, 2, 3, 4, 5, 6], FPS_0012.deflect),
    // attack1, Twin Cuts (see TWIN_CUTS_0012).
    attack1: clip('attack1', TWIN_CUTS_0012, FPS_0012.attack1),
    // midair_attack1, the Whirlwind Cut (see WHIRLWIND_0012).
    midair_attack1: clip('midair_attack1', WHIRLWIND_0012, FPS_0012.midair_attack1),
    // attack2, the Cleave (see CLEAVE_0012).
    attack2: clip('attack2', CLEAVE_0012, FPS_0012.attack2),
    // midair_attack2, the Rising Arc (see RISING_ARC_0012).
    midair_attack2: clip('midair_attack2', RISING_ARC_0012, FPS_0012.midair_attack2),
    // attack3, the Deflect Stance (see STANCE_0012).
    attack3: clip('attack3', STANCE_0012, FPS_0012.attack3),
    // midair_attack3, the Falling Cut (see FALLING_CUT_0012).
    midair_attack3: clip('midair_attack3', FALLING_CUT_0012, FPS_0012.midair_attack3),
    // attack4, Swift Strike (see SWIFT_STRIKE_0012).
    attack4: clip('attack4', SWIFT_STRIKE_0012, FPS_0012.attack4),
    // midair_attack4, the Rising Strike (see RISING_STRIKE_0012).
    midair_attack4: clip('midair_attack4', RISING_STRIKE_0012, FPS_0012.midair_attack4),
    // attack5, Dragonblade (a technique, see `techniques`): the cast is it
    // springing low, its blade pointed down (1), rising (2) into its stance,
    // the blade drawn across before it (3, 4, 5); the release is the blade
    // loosed in a whirl of green cuts all round it (6-12), and its guard
    // again (13).
    attack5_cast: clip('attack5', [1, 2, 3, 4, 5], FPS_0012.attack5_cast),
    attack5_release: clip('attack5', [6, 7, 8, 9, 10, 11, 12, 13], FPS_0012.attack5_release),
    // extra_attack, Shuriken (see SHURIKEN_0012).
    extra_attack: clip('extra_attack', SHURIKEN_0012, FPS_0012.extra_attack),
  },

  // Its projectile's art, centred where it is: a shuriken, its four blades
  // turning (1-4, over and over for as long as it flies). It faces no way.
  projectileAnimations: {
    extra_attack_object: object('extra_attack_object', [1, 2, 3, 4], FPS_0012.extra_attack_object, { loop: true }),
  },

  // Dragonblade's dragon spirit as its blade cleaves, centred over it: a
  // wisp of green flame (1) growing into the dragon (2-6), coiling round
  // (7-10) until it closes into a ring (11). Drawn facing right, so it
  // turns with the cut.
  effectAnimations: {
    attack5_object: object('attack5_object', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], FPS_0012.attack5_object, { sourceFacing: 1 }),
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
    // Its 57-pixel standing pose at the roster's common art-pixel size,
    // 88/52 world units per art pixel (so every fighter's pixels are the
    // same size on screen): about 96 units, a tall, lean figure in armour.
    height: ART_0012 * UNIT_0012,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.2, size: 0.55 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its silver armour
    // and its pale plates, its black underlayer, the bright and the deep
    // green of its lights and its blade.
    eliminationPalette: ['#859291', '#d5d4c5', '#171617', '#97ff00', '#41ac10'],
  },

  // Its body, measured from its standing pose: the helmet and the
  // shoulders, then the legs. Collision is independent of the art.
  collider: { width: 30, height: 92 },
  pushbox: { width: 32 },
  hurtboxes: [
    { x: -17, y: -96, w: 34, h: 50 }, // head and torso
    { x: -20, y: -46, w: 40, h: 46 }, // legs
  ],

  // How #0012 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): its cybernetic agility rights it sooner than
  // most, 0.14 s more stun per 1000 units/s and 0.45 s more at most,
  // tumbling from 1150 units/s, and a held direction bends a launch by up
  // to 25 degrees.
  launchReaction: {
    stunPerThousand: 0.14,
    maxStun: 0.45,
    tumbleSpeed: 1150,
    steerAngle: 25,
  },

  // Its guard, what the `shield` input does for #0012 on the ground: its
  // blade held across its body (see the clips), with no raise or lower
  // pose. Its perfect Shield opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0012 in the air (schema:
  // js/game/combat/deflect.js), its canon's own: its blade spun in a whirl
  // of orange cuts, setting off low behind it (the startup), then ahead,
  // over and behind it for four frames (live: all round it, 55 units behind
  // it to 70 in front, from its feet to well over its head, the whirl the
  // art draws), dying away at its feet (its recovery). Every Deflect's 3, Base Launch 2, here sideways, the way the
  // whirl bats; while it is live it turns the other fighter's projectiles
  // back at their thrower, now #0012's. Three tenths of a second in all,
  // keeping the whole of its drift, under the universal air control, never
  // stepping in (a defense: js/data/attack-movement.js); no cooldown of its
  // own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0012.deflect,
    active: 4 / FPS_0012.deflect,
    recovery: 1 / FPS_0012.deflect,
    hitbox: { x: -55, y: -110, w: 125, h: 112 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 to attack4 ordinary attacks with their
  // mid-air versions, attack5 a technique.
  actions: {
    extra_attack: 'extra_attack', // Shuriken
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // Twin Cuts / the Whirlwind Cut
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Cleave / the Rising Arc
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Deflect Stance / the Falling Cut
    attack4: { ground: 'attack4', air: 'midair_attack4' }, // Swift Strike / the Rising Strike
    attack5: { type: 'technique', id: 'attack5' }, // Dragonblade
  },

  // Its Mash Combo pair (js/data/mash-combo.js): Twin Cuts and the Cleave,
  // its two close-range cuts. Mashing either button sets off twelve turns.
  mashCombo: { attacks: ['attack1', 'attack2'] },

  // Its Special ability (js/data/special-abilities.js): Dragonblade, its
  // dragon's cleave. Shuriken, the Deflect Stance and Swift Strike are its
  // everyday tools: ordinary to the player.
  specialAbilities: ['attack5'],

  // UI only: a frame of each move's own art (zero-based frames): a
  // shuriken, the chop brought down, the spin's sweep, the cleave, the
  // rising arc, the blade held out, the falling cut, the dash's trail, the
  // rising cuts, the dragon's whirl of cuts.
  mobileAbilities: {
    extra_attack: { label: 'Shuriken', preview: { animation: 'extra_attack_object', frame: 0, collection: 'projectileAnimations' } },
    attack1: { label: 'Twin Cuts', preview: { animation: 'attack1', frame: 3 }, previews: { air: { animation: 'midair_attack1', frame: 0 } } },
    attack2: { label: 'Cleave', preview: { animation: 'attack2', frame: 5 }, previews: { air: { animation: 'midair_attack2', frame: 3 } } },
    attack3: { label: 'Deflect Stance', preview: { animation: 'attack3', frame: 2 }, previews: { air: { animation: 'midair_attack3', frame: 4 } } },
    attack4: { label: 'Swift Strike', preview: { animation: 'attack4', frame: 4 }, previews: { air: { animation: 'midair_attack4', frame: 2 } } },
    attack5: { label: 'Dragonblade', preview: { animation: 'attack5_release', frame: 1 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Shuriken',
    attack1: 'Twin Cuts',
    midair_attack1: 'Whirlwind Cut',
    attack2: 'Cleave',
    midair_attack2: 'Rising Arc',
    attack3: 'Deflect Stance',
    midair_attack3: 'Falling Cut',
    attack4: 'Swift Strike',
    midair_attack4: 'Rising Strike',
    attack5: 'Dragonblade',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0012.<move>.description).
  abilityDescriptions: {
    extra_attack: 'Throws three shuriken one after another, on the ground or in the air; a Shield that blocks one stops the rest.',
    attack1: 'A chop that holds the opponent, then a rising cut that knocks them back.',
    midair_attack1: 'Curls into a spin, its blade sweeping all around it, the last sweep knocking the opponent away.',
    attack2: 'A two-handed cut brought over its head and down, knocking the opponent away.',
    midair_attack2: 'A cut swept up from under it and over its head, launching the opponent upward.',
    attack3: 'Holds its blade out before it, turning back every projectile that meets it; any move ends it.',
    midair_attack3: 'A cut brought down from over its head, spiking the opponent downward.',
    attack4: 'Dashes forward in one cut, through anyone in its way.',
    midair_attack4: 'Dashes straight up in one cut, through anyone above it. Once per jump.',
    attack5: 'Draws its blade and wakes the dragon spirit, cleaving everyone around it with a devastating blow.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     its quick cuts: Twin Cuts, and in the air the
  //                  Whirlwind Cut, its basic aerial
  //   Triangle / Y   the Cleave, its other everyday cut, a thumb's roll
  //                  from Square for its Mash Combo; in the air the Rising
  //                  Arc (it rises nowhere itself: never the stick)
  //   Circle / B     the Deflect Stance, held where it stands; in the air
  //                  the Falling Cut, a cut with no plunge of its own
  //                  (never the stick)
  //   R2 / RT        Shuriken, its reach from afar, on the ground and in
  //                  the air
  //   L2 / LT        Dragonblade, its Special: a deliberate trigger, never
  //                  squeezed by accident
  //   right stick    Swift Strike, the dash sent out the way it faces, on
  //   forward        the ground
  //   right stick    the Rising Strike, the dash aimed straight up, in the
  //   up             air
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:attack3': pad('east'),
      'ground:attack4': flick('forward'),
      'ground:attack5': pad('l2'),
      'ground:extra_attack': pad('r2'),
      'air:attack1': pad('west'),
      'air:attack2': pad('north'),
      'air:attack3': pad('east'),
      'air:attack4': flick('up'),
      'air:extra_attack': pad('r2'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0012 stands committed to it,
  // then lets go all at once. A hit on #0012 before it lets go breaks it
  // (nothing released), and it needs the ground throughout. Its cooldown
  // begins as it releases (a cast broken before then starts none).
  techniques: {
    // Dragonblade: half a second springing low and rising into its stance,
    // its blade drawn across before it (nothing protects it), then the
    // cleave and its dragon: everyone round it, from 60 units behind it to
    // 120 in front and from the floor to well over its head (the whirl of
    // cuts the art draws), takes 10 at Base Launch 3, thrown sideways, as
    // the dragon spirit coils round it (its art centred over it). Eight
    // fifteenths of a second more as the whirl dies down. The policy's 5 s,
    // for its 10, from the release; no Energy.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      burst: {
        hitbox: { x: -60, y: -125, w: 180, h: 127 },
        hit: { damage: 10, baseLaunch: 3, directionalLaunch: 'horizontal', hitstun: 0.5, blockstun: 0.2, hitstop: 0.12 },
        effect: { animation: 'attack5_object', offset: { x: 10, y: -100 } },
      },
    },
  },

  // Its projectile (schema: js/game/combat/projectile.js), named after the
  // attack that throws it.
  projectiles: {
    // A shuriken: 1050 units/s for 0.45 s (about 470 units). Whoever it
    // strikes takes 1, a stun just long enough for the next to land: a
    // volley's three add up to 3. No launch.
    extra_attack_object: {
      animation: 'extra_attack_object',
      speed: 1050,
      lifetime: 0.45,
      hitbox: { x: -10, y: -10, w: 20, h: 20 },
      damage: 1,
      hitstun: 0.2,
      blockstun: 0.1,
      hitstop: 1 / 30,
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown: none deals 10, heals or
  // holds. Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; Twin Cuts and the Cleave step in by
  // the shared Step-in.
  attacks: {
    // Twin Cuts: ready, the blade raised behind it (frames 1-2), then the
    // chop over its head and brought down ahead of it to its feet (frames
    // 3-5, live from a tenth of a second: in front of it at its head and
    // chest, out to 52 units, where the blade cuts, never the whole sweep
    // drawn round it), 1, no launch, a stun that holds the target for the
    // next; the blade low (frame 6), swept up from under, out ahead and
    // over its head (frames 7-9, live: at its chest and waist, out to 54
    // units), 3, Base Launch 1 sideways; its follow-through (the last
    // frame): half a second in all. Once the rising cut has hit, it opens a
    // follow-up. It keeps all the speed it is thrown at and steps in by the
    // shared Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 1 / FPS_0012.attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0012.attack1, active: 3 / FPS_0012.attack1, damage: 1, hitbox: { x: 6, y: -92, w: 46, h: 62 } },
        {
          at: 6 / FPS_0012.attack1, active: 3 / FPS_0012.attack1, damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal',
          hitbox: { x: 6, y: -84, w: 48, h: 56 }, hitstun: 0.32,
        },
      ],
      groundOnly: true,
      hitCancel: 9 / FPS_0012.attack1,
    },
    // The Whirlwind Cut: curled into a ball, its blade sweeping a ring round
    // it. Three strikes, each where the sweep is: ahead of it (frames 1-4,
    // from a thirtieth of a second: 10 units behind it to 80 in front, from
    // its feet to over its head), 1; under and behind it (frames 5-8: 86
    // units behind it to its middle, from its head to past its feet), 1;
    // over it (frames 9-12: from 80 behind it to 80 in front, over its
    // head), 3, Base Launch 2 sideways; the blade drawn in (frame 13): not
    // half a second. Its drift under the universal air control.
    midair_attack1: {
      animation: 'midair_attack1',
      recovery: 1 / FPS_0012.midair_attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.05,
      hits: [
        { at: 1 / FPS_0012.midair_attack1, active: 4 / FPS_0012.midair_attack1, damage: 1, hitbox: { x: -10, y: -100, w: 90, h: 100 } },
        { at: 5 / FPS_0012.midair_attack1, active: 4 / FPS_0012.midair_attack1, damage: 1, hitbox: { x: -86, y: -86, w: 90, h: 116 } },
        {
          at: 9 / FPS_0012.midair_attack1, active: 3 / FPS_0012.midair_attack1, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal',
          hitbox: { x: -80, y: -112, w: 160, h: 70 }, hitstun: 0.36,
        },
      ],
    },
    // The Cleave: crouched, its blade trailing, raised over its shoulder
    // and brought over its head (frames 1-4, a fifth of a second), then
    // down ahead of it and on low (frames 5-7, live: in front of it from
    // its knees to its head, out to 56 units, where the blade cuts), drawn
    // back (frames 8-9): not half a second. 3, Base Launch 2
    // sideways. It steps in by the shared Step-in.
    attack2: {
      animation: 'attack2',
      startup: 4 / FPS_0012.attack2,
      active: 3 / FPS_0012.attack2,
      recovery: 2 / FPS_0012.attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 6, y: -90, w: 50, h: 76 },
      hitstun: 0.34,
      blockstun: 0.14,
      hitstop: 0.05,
      groundOnly: true,
    },
    // The Rising Arc: its blade trailing behind, then swept under it
    // (frames 1-2, a tenth of a second), ahead, out and up over its head
    // (frames 3-5, live: in front of it out to 80 units, from just past
    // its feet to over its head, where the blade cuts), on behind it and drawn in (frames 6-7):
    // seven twentieths of a second. 3, Base Launch 2 straight up. Its drift
    // under the universal air control.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 2 / FPS_0012.midair_attack2,
      active: 3 / FPS_0012.midair_attack2,
      recovery: 2 / FPS_0012.midair_attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: 0, y: -115, w: 80, h: 120 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
    },
    // The Deflect Stance: its blade drawn (frame 1, a twelfth of a second),
    // then held out before it, flicking from guard to guard (frames 2-8,
    // live for seven twelfths: in front of it, out to 62 units, from its
    // feet to over its head), lowered (frame 9): three quarters of a
    // second. While it is live it turns back every other fighter's
    // projectile its blade meets, now #0012's, flying back at its thrower
    // (`deflectProjectiles`), and a fighter who walks into it takes a flick
    // of the blade: 1, no launch. It turns shots back, so it is a defense as
    // well as an attack: any valid request ends it (a move, a jump, a Dash,
    // the Shield). On the ground; drawn on the move, it slides on with the
    // speed it had, as any attack does, and never steps in (a defense).
    attack3: {
      animation: 'attack3',
      startup: 1 / FPS_0012.attack3,
      active: 7 / FPS_0012.attack3,
      recovery: 1 / FPS_0012.attack3,
      damage: 1,
      hitbox: { x: 0, y: -100, w: 62, h: 100 },
      hitstun: 0.25,
      blockstun: 0.1,
      hitstop: 1 / 30,
      deflectProjectiles: true,
      groundOnly: true,
    },
    // The Falling Cut: its blade trailing, raised behind its head, swept up
    // over it (frames 1-3, three twentieths of a second), then brought down
    // ahead of it and on under it (frames 4-6, live: 10 units behind it to
    // 105 in front, from over its head to 20 below its feet), its point
    // hanging and drawn back (frames 7-8): two fifths of a second. 3, Base
    // Launch 2 straight down: a spike. It cuts; it never plunges (no motion
    // of its own). Its drift under the universal air control.
    midair_attack3: {
      animation: 'midair_attack3',
      startup: 3 / FPS_0012.midair_attack3,
      active: 3 / FPS_0012.midair_attack3,
      recovery: 2 / FPS_0012.midair_attack3,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'reverseVertical',
      hitbox: { x: -10, y: -110, w: 115, h: 130 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.06,
    },
    // Swift Strike: its blade raised, drawn back and crouched to spring
    // (frames 1-3, three twentieths of a second, sliding on as any attack
    // does), then it dashes the way it faces at 1300 units/s (motion
    // `roll`, its own speed alone: `keep: 0`), losing 4000 units/s every
    // second on the ground, about 210 units in all; the cut is live for the
    // first four frames of it (a fifth of a second: its body and blade,
    // from 30 units behind it to 50 in front and from its feet to over its
    // head, swept along the dash), 3, Base Launch 1 sideways. It passes
    // through fighters (`passThrough`): whoever it cuts is left behind it.
    // A Shield that blocks it stops it dead and throws it back at 320
    // units/s. Arrived (frames 8-11, the trail thinning to a blur, then
    // its blade drawn in): eleven twentieths of a second in all. On the
    // ground; off a ledge the dash flies on. The dash is its own motion
    // (no Step-in).
    attack4: {
      animation: 'attack4',
      startup: 3 / FPS_0012.attack4,
      active: 4 / FPS_0012.attack4,
      recovery: 4 / FPS_0012.attack4,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: { x: -30, y: -95, w: 80, h: 95 },
      hitstun: 0.4,
      blockstun: 0.14,
      hitstop: 0.05,
      motion: { type: 'roll', speed: 1300, keep: 0, maxSpeed: 1300, friction: 4000, recoil: 320 },
      passThrough: true,
      groundOnly: true,
    },
    // The Rising Strike: its blade straight up (frame 1, a twentieth of a
    // second, the hang), then it dashes straight up at 850 units/s (frames
    // 2-5, about 170 units, and on up under gravity) through a sweep of
    // cuts over it (live: 15 units behind it to 80 in front, from its feet
    // to well over its head), 3, Base Launch 2 straight up, passing through
    // whoever it cuts (`passThrough`); still rising, its blade up (frames
    // 6-7): seven twentieths of a second, then it falls. Once per airtime
    // (landing or being hit gives it back): its way back to the stage.
    // Half its drift kept; the lift is its own motion (no Step-in).
    midair_attack4: {
      animation: 'midair_attack4',
      startup: 1 / FPS_0012.midair_attack4,
      active: 4 / FPS_0012.midair_attack4,
      recovery: 2 / FPS_0012.midair_attack4,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: -15, y: -150, w: 95, h: 150 },
      hitstun: 0.4,
      blockstun: 0.14,
      hitstop: 0.05,
      motion: { type: 'rise', speed: 850 },
      passThrough: true,
      airUses: 1,
      airMomentum: 0.5,
    },
    // Shuriken (extra_attack): its throwing hand drawn back (frames 1-2,
    // two fifteenths of a second), then whipped across its body three times
    // over (frames 3-5): a shuriken (its projectile, above) leaves it 34
    // units in front of it at its chest at the start of each, a fifteenth
    // of a second apart (a `volley` of three); the throw followed through
    // (frames 6-8): eight fifteenths of a second in all. The three are one
    // throw: one press, 15 Energy as it starts, no cooldown; a Shield that
    // blocks one stops the volley (the rest gone, none more thrown). On the
    // ground and in the air. A throw never steps in.
    extra_attack: {
      animation: 'extra_attack',
      startup: 2 / FPS_0012.extra_attack,
      active: 3 / FPS_0012.extra_attack,
      recovery: 3 / FPS_0012.extra_attack,
      hitbox: null,
      projectile: {
        id: 'extra_attack_object', spawnAt: 2 / FPS_0012.extra_attack, offset: { x: 34, y: -58 },
        volley: { count: 3, interval: 1 / FPS_0012.extra_attack },
      },
    },
  },
};
