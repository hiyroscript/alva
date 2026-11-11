// #0015's definition: everything that makes #0015 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0015.md for what each move does in play.
//
// The small pink hedgehog girl in a red dress, red boots and gold
// bracelets, cut from one supplied sprite sheet (see assets/characters/0015/).
// It fights with a huge hammer it pulls out of nowhere, and with boxing
// gloves up close: a jab, a straight and an uppercut, the hammer swung up
// from the ground, round in a full turn, brought down from overhead and
// dived with into the floor, whirled round until the whirl tears loose as a
// pink tornado, and a present, left with a blown kiss, that goes off in the
// face of the first opponent to touch it. Every move is one it uses in its
// canon: it heals nobody (the sheet's healing pose is the source game's,
// every fighter's there, not its own fighting), summons nobody, makes no
// clone and never homes in. Four numbered attacks, each a button of its own,
// plus its extra_attack:
//
//   attack1  the Girl Combo, a jab and a straight in its boxing gloves, then
//            an uppercut launching up; in the air the Air Girl Crush, its
//            hammer brought down from overhead
//   attack2  the Girl Crush, its hammer swung round in a full turn, then
//            smashed forward, its heavy blow; in the air the Girl Dunk, its
//            hammer raised and dived with into the floor (motion `slam`),
//            whose landing sends a shockwave along the ground (`impact`, a
//            `quake`)
//   attack3  the Gift, a kiss blown and a present left on the floor before
//            it, which stays there until the first opponent to touch it
//            sets it off; in the air the Air Gift, a present left hanging in
//            the air. One present at a time, wherever it was left
//            (`maxInPlay`: a new one takes the old one's place)
//   attack4  the Pink Typhoon, its hammer whirled round twice, catching
//            anyone close, until the whirl tears loose as a pink tornado
//            that draws opponents in (`pull`), carries them along with it
//            (`pierce`, `carry`) and throws them up (`finisher`); in the
//            air the Air Pink Typhoon, a flatter tornado that throws them
//            away
//   extra_attack  the Girl Swing, its hammer swung up from the ground in a
//            full circle over its head, launching up; on the ground only:
//            the sheet draws it standing
//
// Its Mash Combo (js/data/mash-combo.js) alternates the Girl Combo and the
// Girl Swing, its two close-range strikes.
//
// Its Shield is its guard, on the ground. In the air the Shield button is
// its Deflect: a flying knee that bats projectiles back. Its Dash is its own
// sprint, its air dash a lunge, arms flung back. Its cooldowns are the
// shared policy's (js/data/cooldowns.js), derived from what each move does,
// never authored here: no move of it deals 10, heals or holds, so none
// waits at all, and the Deflect none. The Gift, the Air Gift and both
// tornadoes cost 15 Energy each (each an ordinary construct), the Deflect
// its 15, nothing else anything.
//
// What of the sheet is no move: its turns, its stop and its turn while
// running, its double jump (the jump is universal), its healing, its dash
// attack's crouch (two of its frames are its Deflect), the run-up to the
// source game's aim attack, its hits against a wall and the ground, its
// getting up, its blocked attack, its wall cling, its map walk and its
// portraits; the first frame of its run (a start the run never needs), the
// jab's and the straight's stances between blows, the hammer swings'
// drawings repeated in a row (each played again, one file), and the hearts
// of its blown kiss (drawn apart from it, beside the body).

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0015's idle, its stance (its reference clip:
// the tallest of its stance frames). Its art is 1x (one file pixel per art
// pixel, cut with the sheet's flat teal made transparent), so no pixel grid
// is ever looked for in it (`visual.pixelSize: 1`): each clip's
// heightRatio, its tallest frame over this, sizes it at exactly one art
// pixel per file pixel.
const ART_0015 = 34;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0015 = 88 / 52;

// Playback rates of #0015's clips. Each attack's phases below are whole
// frames of its clip at its rate, so tuning a rate keeps the timing on the
// art; every attack's rate is a whole number of 60 Hz steps per frame, so
// each frame lasts exactly as long as its gameplay does. (The Dash and the
// air dash last the universal Dash's length, whatever these say: their
// clips are shown once across it.)
const FPS_0015 = Object.freeze({
  idle: 8,
  run: 15,
  mouvment: 12,
  midair_mouvment: 12,
  jump: 12,
  fall: 10,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 15,
  attack1: 20,
  midair_attack1: 20,
  attack2: 20,
  midair_attack2: 20,
  attack3: 15,
  midair_attack3: 15,
  attack3_object: 15,
  attack4: 30,
  midair_attack4: 30,
  attack4_object: 15,
  midair_attack4_object: 15,
  extra_attack: 20,
});

// The Girl Dunk's plunge, in seconds: the hang (its first four frames, the
// hammer raised over its head and swung over) and the longest it dives
// before it gives up on the ground.
const DUNK_HANG_0015 = 4 / FPS_0015.midair_attack2;
const DUNK_PLUNGE_0015 = 0.8;

// How long a present waits where it was left for someone to set it off,
// in seconds.
const GIFT_WAIT_0015 = 6;

// Where its body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file: the middle of its
// head, its quills, which every frame of it draws over its body. Its hammer
// and the arcs it sweeps, its gloves, its flung arms and its quills flying
// out as it runs would pull the automatic anchor off its body.
const ANCHORS_0015 = Object.freeze({
  idle: [14.5, 12, 12, 13, 15, 15, 16, 16],
  run: [12, 11, 9.5, 12, 12.5, 10, 8.5, 11.5],
  mouvment: [16, 17.5, 17.5, 17.5, 17.5, 17.5, 17.5],
  midair_mouvment: [10, 15.5, 20.5, 20.5],
  jump: [10.5, 11.5, 16, 17],
  fall: [18.5, 19, 18, 16, 16.5],
  land: [16, 13, 13],
  prepshield: [7.5, 7.5],
  shielding: [8.5],
  deflect: [10.5, 12, 11],
  hurt: [14, 11, 13.5],
  midair_hurt: [20, 20, 19, 19.5],
  attack1: [9, 11, 10.5, 9.5, 10, 9.5, 11.5, 8.5, 9, 9.5, 9.5],
  midair_attack1: [20, 27.5, 9, 13, 14, 14, 17.5],
  attack2: [17, 9, 10.5, 23, 28, 23.5, 11, 12.5, 19.5, 17.5, 16.5, 9],
  midair_attack2: [10.5, 9, 17.5, 17.5, 12, 12.5, 12, 9, 16],
  attack3: [16.5, 16, 9, 8.5, 8.5, 9, 9, 11, 9, 10],
  midair_attack3: [10, 10, 10, 10.5, 15.5, 15.5, 17],
  attack4: [10.5, 13, 21, 27.5, 13, 25.5, 34, 11, 12.5, 19.5, 17.5, 16.5, 8.5, 9],
  midair_attack4: [14.5, 13, 21, 27.5, 13, 25.5, 34],
  extra_attack: [10, 19.5, 23.5, 16.5, 9, 17, 15.5, 9, 9],
});

// The height in art pixels of each file of a codename, file by file (what
// sizes a clip: its tallest frame over ART_0015).
const HEIGHTS_0015 = Object.freeze({
  idle: [33, 33, 34, 33, 33, 33, 34, 33],
  run: [32, 31, 33, 29, 31, 30, 33, 30],
  mouvment: [34, 33, 31, 32, 32, 32, 33],
  midair_mouvment: [35, 33, 31, 30],
  jump: [38, 37, 35, 31],
  fall: [29, 32, 34, 34, 30],
  land: [30, 29, 31],
  prepshield: [32, 31],
  shielding: [32],
  deflect: [27, 27, 27],
  hurt: [31, 30, 32],
  midair_hurt: [28, 28, 28, 29],
  attack1: [33, 34, 33, 33, 33, 33, 31, 38, 37, 35, 33],
  midair_attack1: [38, 40, 45, 43, 41, 36, 30],
  attack2: [33, 32, 32, 32, 33, 34, 32, 33, 33, 34, 34, 32],
  midair_attack2: [33, 35, 31, 40, 43, 41, 34, 33, 31],
  attack3: [35, 34, 33, 33, 33, 32, 31, 30, 31, 32],
  midair_attack3: [30, 29, 30, 29, 29, 29, 30],
  attack4: [32, 33, 32, 31, 31, 31, 31, 32, 33, 33, 34, 34, 32, 32],
  midair_attack4: [30, 31, 32, 31, 31, 31, 31],
  extra_attack: [37, 34, 41, 41, 45, 39, 36, 34, 33],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame against
// the idle, each frame anchored on its body.
const clip = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0015', codename, n)),
  fps,
  loop: false,
  heightRatio: Math.max(...order.map((n) => HEIGHTS_0015[codename][n - 1])) / ART_0015,
  anchorX: order.map((n) => ANCHORS_0015[codename][n - 1]),
  ...extra,
});

// A projectile's clip: its files in order, centred, drawn at the fighter's
// art-pixel size whatever their own.
const object = (codename, count, fps, extra = {}) => ({
  frames: Array.from({ length: count }, (_, i) => framePath('0015', codename, i + 1)),
  fps,
  loop: false,
  ...extra,
});

// The Girl Combo's art: its gloves up (1), the jab (2) drawn back (3), the
// other glove cocked (4), the straight (5) drawn back (6), crouched low (7),
// the uppercut, its glove high over its head (8, 9), coming down (10) and
// its gloves up again (11).
const GIRL_COMBO_0015 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// The Air Girl Crush's: its hammer swung back (1), raised behind it (2),
// straight up over its head (3), brought down before it through a blazing
// arc (4), at its feet (5), swung on (6) and gone again (7).
const AIR_GIRL_CRUSH_0015 = [1, 2, 3, 4, 5, 6, 7];
// The Girl Crush's: its hammer over its shoulder (1), held out (2), swept
// low before it through a golden arc (3), round its side (4), its back to
// us as it turns (5), coming round (6), swung forward again (7), smashed
// out through a great arc (8), at full stretch along the floor (9, 10, 11),
// and its stance (12).
const GIRL_CRUSH_0015 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// The Girl Dunk's: its hammer held low (1), raised (2), up over its head
// (3), swung over through a golden arc (4) and driven down before it in a
// blaze, diving (5, held as it plunges). Landed (its impact clip): the
// hammer in the floor (6, 7), drawn back (8) and gone (9).
const GIRL_DUNK_0015 = [1, 2, 3, 4, 5];
const GIRL_DUNK_IMPACT_0015 = [6, 7, 8, 9];
// The Gift's: its hands thrown up (1, 2), a kiss blown (3), sent (4),
// following it (5, then 4 again), then its hands to its cheeks, giggling
// (6-9), and its stance (10). The present appears as the kiss is sent.
const GIFT_0015 = [1, 2, 3, 4, 5, 4, 6, 7, 8, 9, 10];
// The Air Gift's: curled up in the air, a present in its hands (1-4), then
// its arms flung out (5, 6), letting it go (7).
const AIR_GIFT_0015 = [1, 2, 3, 4, 5, 6, 7];
// The Pink Typhoon's: its stance (1), turning (2), its back to us, the
// hammer out behind it (3), then the whirl, twice round (4-7, 4-7: swept
// round behind it, before it, out to its side, its back to us again), and
// round once more (4) into the throw: swung forward (8) and out through a
// great arc as the tornado tears loose (9), at full stretch along the floor
// (10, 11, 12), and its stance (13, 14).
const PINK_TYPHOON_0015 = [1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7, 4, 8, 9, 10, 11, 12, 13, 14];
// The Air Pink Typhoon's: turning in the air (1, 2), its back to us, the
// hammer out behind it (3), then the whirl, twice round (4-7, 4-7), the
// tornado tearing loose on the second.
const AIR_PINK_TYPHOON_0015 = [1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7];
// The Girl Swing's: its hammer held up behind it (1), swung back (2) and
// down through the floor before it (3), up through a golden arc (4), over
// its head (5), on behind it (6), held up (7), then gone (8) and its stance
// (9).
const GIRL_SWING_0015 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// Its Deflect's: tucked (1), its knee driven up and out (2), held (3, then
// 3 again).
const DEFLECT_0015 = [1, 2, 3, 3];

export const CHARACTER_0015 = {
  id: '0015',
  displayName: '#0015',
  available: true,
  rosterSlot: 14,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0015.
  animations: {
    // Its stance, one breath of eight poses, its arms swinging out.
    idle: { ...clip('idle', [1, 2, 3, 4, 5, 6, 7, 8], FPS_0015.idle), loop: true },
    // The run: the sheet's eight running frames, its fists pumping, its
    // quills streaming. Its rate follows the speed, down to 0.6 of it (and
    // up past it on a Dash's run-on).
    run: { ...clip('run', [1, 2, 3, 4, 5, 6, 7, 8], FPS_0015.run), loop: true, minSpeedScale: 0.6 },
    // Springing up, its arms coming out (the takeoff), then rising, its
    // arms flung wide; falling, arms out, its dress billowing; touching
    // down crouched, and up again.
    jump: clip('jump', [1, 2, 3, 4], FPS_0015.jump),
    fall: clip('fall', [1, 2, 3, 4, 5], FPS_0015.fall),
    land: clip('land', [1, 2, 3], FPS_0015.land),
    // mouvment, the Dash: its sprint, set off from its stance (1) into long
    // strides, its arms flung back (2-7), played once across the whole Dash.
    mouvment: clip('mouvment', [1, 2, 3, 4, 5, 6, 7], FPS_0015.mouvment),
    // midair_mouvment, the air dash: from upright (1) into a lunge, its
    // arms flung back and its legs trailing (2-4), played once across the
    // whole air dash.
    midair_mouvment: clip('midair_mouvment', [1, 2, 3, 4], FPS_0015.midair_mouvment),
    // Hitstun: `hurt` doubled up, then thrown back; `midair_hurt` knocked
    // up, its arms flung out.
    hurt: clip('hurt', [1, 2, 3], FPS_0015.hurt),
    midair_hurt: clip('midair_hurt', [1, 2, 3, 4], FPS_0015.hurt),
    // Its guard, on the ground: its arm raised to its face (prepshield),
    // then its palm thrust out before it (shielding). The sheet draws no
    // lowering: the Shield goes down at once.
    prepshield: clip('prepshield', [1, 2], FPS_0015.shield),
    shielding: clip('shielding', [1], FPS_0015.shield),
    // deflect, its Deflect (see DEFLECT_0015).
    deflect: clip('deflect', DEFLECT_0015, FPS_0015.deflect),
    // attack1, the Girl Combo (see GIRL_COMBO_0015).
    attack1: clip('attack1', GIRL_COMBO_0015, FPS_0015.attack1),
    // midair_attack1, the Air Girl Crush (see AIR_GIRL_CRUSH_0015).
    midair_attack1: clip('midair_attack1', AIR_GIRL_CRUSH_0015, FPS_0015.midair_attack1),
    // attack2, the Girl Crush (see GIRL_CRUSH_0015).
    attack2: clip('attack2', GIRL_CRUSH_0015, FPS_0015.attack2),
    // midair_attack2, the Girl Dunk (see GIRL_DUNK_0015), and its landing.
    midair_attack2: clip('midair_attack2', GIRL_DUNK_0015, FPS_0015.midair_attack2),
    midair_attack2_impact: clip('midair_attack2', GIRL_DUNK_IMPACT_0015, FPS_0015.midair_attack2),
    // attack3, the Gift (see GIFT_0015).
    attack3: clip('attack3', GIFT_0015, FPS_0015.attack3),
    // midair_attack3, the Air Gift (see AIR_GIFT_0015).
    midair_attack3: clip('midair_attack3', AIR_GIFT_0015, FPS_0015.midair_attack3),
    // attack4, the Pink Typhoon (see PINK_TYPHOON_0015).
    attack4: clip('attack4', PINK_TYPHOON_0015, FPS_0015.attack4),
    // midair_attack4, the Air Pink Typhoon (see AIR_PINK_TYPHOON_0015).
    midair_attack4: clip('midair_attack4', AIR_PINK_TYPHOON_0015, FPS_0015.midair_attack4),
    // extra_attack, the Girl Swing (see GIRL_SWING_0015).
    extra_attack: clip('extra_attack', GIRL_SWING_0015, FPS_0015.extra_attack),
  },

  // Its projectiles' art, normalized at their own size.
  projectileAnimations: {
    // The present: a flash of red (1), swelling (2) and squashing (3) into
    // a present, glowing as it appears (4), springing up (5), squashed (6)
    // and settled (7, held for as long as it waits). The same present
    // whichever way it was left: never mirrored.
    attack3_object: object('attack3_object', 7, FPS_0015.attack3_object, { sourceFacing: 0 }),
    // The pink tornado along the ground: a swirl of pink wind that grows
    // (1-4), spins at its fullest (5-10), unravels (11-13) and is gone
    // (14, 15), once across its whole run (its lifetime). Drawn the same
    // either way: never mirrored.
    attack4_object: object('attack4_object', 15, FPS_0015.attack4_object, { sourceFacing: 0 }),
    // The flatter tornado it lets loose in the air: the same swirl, growing
    // (1-4), at its fullest (5-10), unravelling (11-14), once across its run.
    midair_attack4_object: object('midair_attack4_object', 14, FPS_0015.midair_attack4_object, { sourceFacing: 0 }),
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
    // Its 34-pixel stance at the roster's common art-pixel size, 88/52
    // world units per art pixel (so every fighter's pixels are the same
    // size on screen): about 58 units, among the roster's smallest.
    height: ART_0015 * UNIT_0015,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.28, size: 0.75 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its pink quills,
    // their deep pink shade, its red dress, its gold headband and its
    // white gloves.
    eliminationPalette: ['#f898b8', '#e84098', '#f82020', '#f8d800', '#f8f8f8'],
  },

  // Its body, measured from its stance: its big head and quills, then its
  // dress and legs. Collision is independent of the art.
  collider: { width: 24, height: 54 },
  pushbox: { width: 26 },
  hurtboxes: [
    { x: -14, y: -58, w: 28, h: 28 }, // head and quills
    { x: -12, y: -32, w: 24, h: 32 }, // dress and legs
  ],

  // How #0015 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): small and light, it is flung a little
  // longer, 0.15 s more stun per 1000 units/s and 0.5 s more at most,
  // tumbling from 1100 units/s, and a held direction bends a launch by up
  // to 20 degrees.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.5,
    tumbleSpeed: 1100,
    steerAngle: 20,
  },

  // Its guard, what the `shield` input does for #0015 on the ground: its
  // arm raised to its face, then its palm thrust out (see the clips). Its
  // perfect Shield opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0015 in the air (schema:
  // js/game/combat/deflect.js): tucked (the startup), then its knee driven
  // up and out before it (live for two frames: 14 units behind it to 30 in
  // front, from its feet to its head), held (its recovery). Every
  // Deflect's 3, Base Launch 2, here sideways, kneed away before it; while
  // it is live it turns the other fighter's projectiles back at their
  // thrower, now #0015's. Four fifteenths of a second in all, keeping the
  // whole of its drift, under the universal air control, never stepping in
  // (a defense: js/data/attack-movement.js); no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0015.deflect,
    active: 2 / FPS_0015.deflect,
    recovery: 1 / FPS_0015.deflect,
    hitbox: { x: -14, y: -50, w: 44, h: 52 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    deflectProjectiles: true,
  },

  // Four numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 to attack4 ordinary attacks with their
  // mid-air versions; and its extra_attack, on the ground only (its attack
  // is `groundOnly`).
  actions: {
    extra_attack: 'extra_attack', // the Girl Swing
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Girl Combo / the Air Girl Crush
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Girl Crush / the Girl Dunk
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Gift / the Air Gift
    attack4: { ground: 'attack4', air: 'midair_attack4' }, // the Pink Typhoon / the Air Pink Typhoon
  },

  // Its Mash Combo pair (js/data/mash-combo.js): the Girl Combo and the
  // Girl Swing, its two close-range strikes. Mashing either button sets off
  // twelve turns.
  mashCombo: { attacks: ['attack1', 'extra_attack'] },

  // Its Special abilities (js/data/special-abilities.js): the Gift and the
  // Air Gift, a present left where it waits, seconds on, for the first
  // opponent careless enough to touch it: a fight round it is a fight round
  // a trap. Its hammer's swings, its dive and its tornadoes are its
  // everyday tools: ordinary to the player.
  specialAbilities: ['attack3', 'midair_attack3'],

  // UI only: a frame of each move's own art (zero-based frames): the
  // hammer at the top of its upswing, the uppercut, the hammer coming down
  // in a blaze, the great arc of the smash, the dive, the kiss sent, the
  // present let go, the hammer whirling, and its whirl in the air.
  mobileAbilities: {
    extra_attack: { label: 'Girl Swing', preview: { animation: 'extra_attack', frame: 3 } },
    attack1: { label: 'Girl Combo', preview: { animation: 'attack1', frame: 7 }, previews: { air: { animation: 'midair_attack1', frame: 3 } } },
    attack2: { label: 'Girl Crush', preview: { animation: 'attack2', frame: 7 }, previews: { air: { animation: 'midair_attack2', frame: 4 } } },
    attack3: { label: 'Gift', preview: { animation: 'attack3_object', frame: 6, collection: 'projectileAnimations' }, previews: { air: { animation: 'midair_attack3', frame: 5 } } },
    attack4: { label: 'Pink Typhoon', preview: { animation: 'attack4_object', frame: 6, collection: 'projectileAnimations' }, previews: { air: { animation: 'midair_attack4', frame: 5 } } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Girl Swing',
    attack1: 'Girl Combo',
    midair_attack1: 'Air Girl Crush',
    attack2: 'Girl Crush',
    midair_attack2: 'Girl Dunk',
    attack3: 'Gift',
    midair_attack3: 'Air Gift',
    attack4: 'Pink Typhoon',
    midair_attack4: 'Air Pink Typhoon',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0015.<move>.description).
  abilityDescriptions: {
    extra_attack: 'Swings its hammer up from the floor in a full circle over its head, launching the opponent upward.',
    attack1: 'A jab and a straight in boxing gloves, then an uppercut that launches the opponent upward.',
    midair_attack1: 'Brings its hammer down from overhead in the air, knocking the opponent away.',
    attack2: 'Swings its hammer round in a full turn, then smashes it forward, sending the opponent flying.',
    midair_attack2: 'Dives hammer-first, spiking anyone in its way; landing sends a shockwave along the ground. Once per jump.',
    attack3: 'Blows a kiss and leaves a present on the floor; the first opponent to touch it sets it off and is flung upward. One present at a time.',
    midair_attack3: 'Leaves a present hanging in the air, set off by the first opponent to touch it. One present at a time.',
    attack4: 'Whirls its hammer round, catching anyone close, then lets loose a pink tornado that draws opponents in, carries them along and throws them upward.',
    midair_attack4: 'Whirls its hammer in the air, then lets loose a pink tornado that draws opponents in, carries them along and throws them away.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     its quick blows: the Girl Combo, and in the air the
  //                  Air Girl Crush, its basic aerial
  //   Triangle / Y   the Girl Swing, its other everyday strike, a thumb's
  //                  roll from Square for its Mash Combo
  //   Circle / B     the Girl Crush, its heavy swing, turned in place and
  //                  smashed where it stands (no direction of its own:
  //                  never the stick)
  //   R2 / RT        the Pink Typhoon, its ranged move, on the ground and
  //                  in the air: the tornado runs out ahead
  //   L2 / LT        the Gift, its Special, on the ground and in the air:
  //                  a deliberate trigger, never squeezed by accident
  //   right stick    the Girl Dunk, a dive hammer-first: a plunge, only
  //   down           ever the stick down, in the air
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:extra_attack': pad('north'),
      'ground:attack2': pad('east'),
      'ground:attack3': pad('l2'),
      'ground:attack4': pad('r2'),
      'air:attack1': pad('west'),
      'air:attack2': flick('down'),
      'air:attack3': pad('l2'),
      'air:attack4': pad('r2'),
    },
  },

  // Its projectiles (schema: js/game/combat/projectile.js), named after the
  // attack that lets each go.
  projectiles: {
    // The present on the floor: it never moves (no speed), waiting six
    // seconds where it was left, its box a little wider than the present
    // (the art is about 24 units by 27). The first opponent to touch it sets
    // it off: 5 at Base Launch 2, flung straight up; a Shield that blocks it
    // stops it there, and a Deflect turns it (gone nowhere, it has no
    // speed) into the deflecting fighter's own. One present at a time
    // (`maxInPlay`: a new one, on the floor or in the air, takes the
    // oldest's place, gone without going off).
    attack3_object: {
      animation: 'attack3_object',
      speed: 0,
      lifetime: GIFT_WAIT_0015,
      hitbox: { x: -15, y: -15, w: 30, h: 30 },
      damage: 5,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitstun: 0.45,
      blockstun: 0.16,
      hitstop: 0.1,
      maxInPlay: 1,
    },
    // The present left in the air: the same present, hanging where it was
    // left, the same in every way.
    midair_attack3_object: {
      animation: 'attack3_object',
      speed: 0,
      lifetime: GIFT_WAIT_0015,
      hitbox: { x: -15, y: -15, w: 30, h: 30 },
      damage: 5,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitstun: 0.45,
      blockstun: 0.16,
      hitstop: 0.1,
      maxInPlay: 1,
    },
    // The pink tornado: 260 units/s along the ground for a second (about 260
    // units out), its box as tall as #0015 and more, its base clear of the
    // floor. While it runs it draws in any opponent within
    // 70 units of its middle (`pull`, at up to 260 units/s). It strikes up
    // to four times, an eighth of a second apart (`pierce`): three times 1,
    // each carrying its target along with it, a little up (`carry`), then
    // its finisher, 3 at Base Launch 2, throwing it straight up. A Shield
    // that blocks it stops it there.
    attack4_object: {
      animation: 'attack4_object',
      speed: 260,
      lifetime: 1,
      hitbox: { x: -30, y: -40, w: 60, h: 80 },
      damage: 1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.03,
      carry: { lift: 120 },
      pierce: { hits: 4, interval: 0.125 },
      finisher: { damage: 3, baseLaunch: 2, directionalLaunch: 'vertical', hitstun: 0.4, hitstop: 0.08 },
      pull: { radius: 70, speed: 260 },
    },
    // The tornado let loose in the air: flatter (its box 56 tall), 260
    // units/s for nine tenths of a second (about 235 units out); it draws
    // in any opponent within 60 units, strikes three times (twice 1, each
    // carrying its target along, then 3 at Base Launch 1, thrown away the
    // way it runs: a push out of the air, not a finisher at the edge).
    midair_attack4_object: {
      animation: 'midair_attack4_object',
      speed: 260,
      lifetime: 0.9,
      hitbox: { x: -30, y: -28, w: 60, h: 56 },
      damage: 1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.03,
      carry: { lift: 40 },
      pierce: { hits: 3, interval: 0.125 },
      finisher: { damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal', hitstun: 0.4, hitstop: 0.08 },
      pull: { radius: 60, speed: 240 },
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown: none deals 10, heals or
  // holds. Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; the Girl Combo, the Girl Crush and the
  // Girl Swing step in by the shared Step-in.
  attacks: {
    // The Girl Combo: three blows in its boxing gloves. The jab (live from
    // a twentieth of a second: frames 2-3, out to 34 units at its chest),
    // 1; the straight (frames 5-6, out to 34 units), 1, each no launch, a
    // stun that holds the target for the next; then the uppercut, its glove
    // driven up over its head (frames 8-9), 3, Base Launch 2 straight up.
    // Eleven twentieths of a second in all. Once the uppercut has hit, it
    // opens a follow-up. It keeps all the speed it is thrown at and steps
    // in by the shared Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 2 / FPS_0015.attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 1 / FPS_0015.attack1, active: 2 / FPS_0015.attack1, damage: 1, hitbox: { x: 6, y: -40, w: 30, h: 22 } },
        { at: 4 / FPS_0015.attack1, active: 2 / FPS_0015.attack1, damage: 1, hitbox: { x: 6, y: -40, w: 30, h: 22 } },
        {
          at: 7 / FPS_0015.attack1, active: 2 / FPS_0015.attack1, damage: 3, baseLaunch: 2, directionalLaunch: 'vertical',
          hitbox: { x: 2, y: -64, w: 26, h: 46 }, hitstun: 0.36,
        },
      ],
      groundOnly: true,
      hitCancel: 9 / FPS_0015.attack1,
    },
    // The Air Girl Crush: its hammer swung back and raised over its head
    // (frames 1-3, three twentieths of a second), then brought down before
    // it through a blazing arc (frames 4-5, live: in front of it out to 42
    // units, from over its head to below its feet), 3, Base Launch 1
    // sideways: a quick swing that knocks away more than it throws (at
    // Base Launch 2 it finished more than any other move of its own).
    // Swung on and gone (frames 6-7): seven twentieths of a second. Its
    // drift under the universal air control.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 3 / FPS_0015.midair_attack1,
      active: 2 / FPS_0015.midair_attack1,
      recovery: 2 / FPS_0015.midair_attack1,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: { x: 0, y: -68, w: 42, h: 70 },
      hitstun: 0.32,
      blockstun: 0.12,
      hitstop: 0.05,
    },
    // The Girl Crush: its hammer drawn back, then swept low before it
    // (frames 3-4, live from a tenth of a second: 10 units behind it to 48
    // in front, from the floor to its head), 1, no launch, a long stun that
    // holds the target through the turn; it turns, its back to us (frames
    // 5-6), and smashes it forward through a great arc (frames 7-8, live:
    // in front of it out to 56 units, from the floor to over its head), its
    // heavy blow, 5, Base Launch 3 sideways: a Shield that blocks it is
    // driven back across the floor (`blockPush`, 480 units/s). Its hammer
    // at full stretch along the floor and its stance (frames 9-12): three
    // fifths of a second in all, a heavy swing that leaves it open if it
    // misses. It steps in by the shared Step-in.
    attack2: {
      animation: 'attack2',
      recovery: 4 / FPS_0015.attack2,
      hitstun: 0.4,
      blockstun: 0.14,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0015.attack2, active: 2 / FPS_0015.attack2, damage: 1, hitbox: { x: -10, y: -50, w: 58, h: 50 } },
        {
          at: 6 / FPS_0015.attack2, active: 2 / FPS_0015.attack2, damage: 5, baseLaunch: 3, directionalLaunch: 'horizontal',
          hitbox: { x: 4, y: -56, w: 52, h: 56 }, hitstun: 0.45, hitstop: 0.1, blockPush: 480,
        },
      ],
      groundOnly: true,
    },
    // The Girl Dunk: its hammer raised over its head and swung over (frames
    // 1-4, a fifth of a second, the hang), then it dives hammer-first at
    // 1300 units/s (motion `slam`) for up to 0.8 s, the hammer driven down
    // before it in a blaze (live: 8 units behind it to 42 in front, from its
    // head to below its feet), 3, Base Launch 2 straight down: a spike.
    // Where it meets the ground the hammer goes into the floor (its impact
    // clip, a fifth of a second) and the shock runs out along it: every
    // opponent standing on the floor within 64 units either side (`impact`,
    // a `quake`: one in the air is passed by) takes 3 at Base Launch 2,
    // thrown up off its feet, a Shield that blocks it shoved back. Once per
    // airtime; half its drift kept. A dive that runs out in the air lands
    // nothing and falls on.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: DUNK_HANG_0015,
      active: DUNK_PLUNGE_0015,
      recovery: GIRL_DUNK_IMPACT_0015.length / FPS_0015.midair_attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'reverseVertical',
      hitbox: { x: -8, y: -56, w: 50, h: 62 },
      hitstun: 0.32,
      blockstun: 0.14,
      hitstop: 0.05,
      airUses: 1,
      motion: {
        type: 'slam',
        fallSpeed: 1300,
        impact: {
          hitbox: { x: -64, y: -30, w: 128, h: 34 },
          hit: {
            damage: 3, baseLaunch: 2, directionalLaunch: 'vertical', quake: true,
            hitstun: 0.4, blockstun: 0.16, hitstop: 0.08, blockPush: 300,
          },
          animation: 'midair_attack2_impact',
        },
      },
      airMomentum: 0.5,
    },
    // The Gift: its hands thrown up and a kiss blown (frames 1-3, a fifth
    // of a second), and as the kiss is sent (frame 4) a present appears on
    // the floor 40 units before it (its projectile, above: it waits there
    // for whoever touches it first). It follows the kiss, giggles and is in
    // its stance (frames 5-11): eleven fifteenths of a second in all, a
    // long, deliberate pose. 15 Energy (the present, a construct). On the
    // ground only (its air move is the Air Gift).
    attack3: {
      animation: 'attack3',
      startup: 3 / FPS_0015.attack3,
      active: 1 / FPS_0015.attack3,
      recovery: 7 / FPS_0015.attack3,
      hitbox: null,
      projectile: { id: 'attack3_object', spawnAt: 3 / FPS_0015.attack3, offset: { x: 40, y: -16 } },
      groundOnly: true,
    },
    // The Air Gift: curled up in the air round a present (frames 1-4, four
    // fifteenths of a second), then its arms flung out (frame 5), letting it
    // go: it hangs 30 units before it, at its waist (its projectile, above).
    // Arms out, then let go (frames 6-7): seven fifteenths of a second in
    // all. 15 Energy. Its drift under the universal air control.
    midair_attack3: {
      animation: 'midair_attack3',
      startup: 4 / FPS_0015.midair_attack3,
      active: 1 / FPS_0015.midair_attack3,
      recovery: 2 / FPS_0015.midair_attack3,
      hitbox: null,
      projectile: { id: 'midair_attack3_object', spawnAt: 4 / FPS_0015.midair_attack3, offset: { x: 30, y: -24 } },
    },
    // The Pink Typhoon: turned, its back to us (frames 1-3, a tenth of a
    // second), then the whirl, twice round: each turn (frames 4-7, then
    // again) its hammer sweeps all round it (46 units behind it to 46 in
    // front, from the floor to its head), 1, holding whoever it catches
    // where they stand (`carry`, no lift: they take #0015's own speed, none).
    // Round once more and the throw: as the hammer goes out through its
    // great arc (frame 9) the whirl tears loose as a pink tornado 40 units
    // before it, its middle 48 up (its projectile, above). At full stretch
    // and its stance (frames 10-14): nineteen thirtieths of a second in
    // all. 15 Energy (the tornado, a construct). On the ground only (its air
    // move is the Air Pink Typhoon).
    attack4: {
      animation: 'attack4',
      recovery: 8 / FPS_0015.attack4,
      hitstun: 0.35,
      blockstun: 0.12,
      hitstop: 1 / 30,
      carry: { lift: 0 },
      hits: [
        { at: 3 / FPS_0015.attack4, active: 4 / FPS_0015.attack4, damage: 1, hitbox: { x: -46, y: -50, w: 92, h: 50 } },
        { at: 7 / FPS_0015.attack4, active: 4 / FPS_0015.attack4, damage: 1, hitbox: { x: -46, y: -50, w: 92, h: 50 } },
      ],
      projectile: { id: 'attack4_object', spawnAt: 13 / FPS_0015.attack4, offset: { x: 40, y: -48 } },
      groundOnly: true,
    },
    // The Air Pink Typhoon: turned in the air, its back to us (frames 1-3,
    // a tenth of a second), then the whirl, twice round: on the first turn
    // (frames 4-7) its hammer sweeps all round it (46 units behind it to 46
    // in front), 1, holding whoever it catches with it; on the second, as
    // the hammer comes before it (frame 9), the whirl tears loose as a
    // flatter tornado 40 units before it, at its middle (its projectile,
    // above). Eleven thirtieths of a second in all. 15 Energy. Its drift
    // under the universal air control.
    midair_attack4: {
      animation: 'midair_attack4',
      recovery: 4 / FPS_0015.midair_attack4,
      hitstun: 0.35,
      blockstun: 0.12,
      hitstop: 1 / 30,
      carry: { lift: 0 },
      hits: [
        { at: 3 / FPS_0015.midair_attack4, active: 4 / FPS_0015.midair_attack4, damage: 1, hitbox: { x: -46, y: -50, w: 92, h: 50 } },
      ],
      projectile: { id: 'midair_attack4_object', spawnAt: 8 / FPS_0015.midair_attack4, offset: { x: 40, y: -30 } },
    },
    // The Girl Swing: its hammer held up behind it and swung back (frames
    // 1-2, a tenth of a second), then up from the floor before it through a
    // golden arc and over its head (frames 3-5, live: 4 units behind it to
    // 44 in front, from the floor to well over its head), 3, Base Launch 2
    // straight up. On behind it, held up, gone, and its stance (frames 6-9):
    // nine twentieths of a second in all. Once the swing has hit, it opens a
    // follow-up. It steps in by the shared Step-in. On the ground only: the
    // sheet draws it standing.
    extra_attack: {
      animation: 'extra_attack',
      startup: 2 / FPS_0015.extra_attack,
      active: 3 / FPS_0015.extra_attack,
      recovery: 4 / FPS_0015.extra_attack,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: -4, y: -74, w: 48, h: 74 },
      hitstun: 0.36,
      blockstun: 0.12,
      hitstop: 1 / 30,
      groundOnly: true,
      hitCancel: 5 / FPS_0015.extra_attack,
    },
  },
};
