// #0014's definition: everything that makes #0014 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0014.md for what each move does in play.
//
// The long-haired martial artist in a white top, a black skirt and red
// gloves, cut from one supplied sprite sheet (see assets/characters/0014/).
// It fights bare-handed in its master's style, fists and feet: rushes of
// blows, throws that seize their target and drive it into the floor, a leap
// that carries its target up only to hurl it down, a kick that sends a wave
// of water along the ground. And it has a Limit: every real hit it takes
// fills its Limit gauge (CombatState.limitGauge, never recovering as the
// Launch Point does), and only once the gauge is full can it unleash its
// final Limit Break, the Sunburst Fist (a technique's `limit`), which
// spends the gauge whole. The more it is beaten, the sooner it can strike
// back. Every move is one it uses in its canon: it heals nobody, summons nobody, makes
// no clone and never homes in. Five numbered attacks, each a button of its
// own, plus its extra_attack:
//
//   attack1  Beat Rush, a jab and a blurred fist, then a heavy straight
//            from the shoulder; in the air the Air Combo, two punches
//   attack2  Meteodrive, a grab (`grab`): it seizes its target and
//            suplexes it into the floor (a spike that rebounds off the
//            ground once it is hurt enough), or lets go at once if it
//            seized nobody; in the air the Divekick, a dive heel-first
//            (motion `slam`)
//   attack3  Meteor Strike, a grab: it seizes its target and leaps up
//            carrying it (motion `rise` and `carry`), then hurls it down
//            into the floor; a grab that seizes nobody never leaves the
//            ground; in the air the Somersault, a flipping kick that rises
//            (its recovery), launching up
//   attack4  Waterkick, a technique: a kick that sends a wave of water
//            skimming along the ground (a projectile that is a `quake`:
//            it reaches only a fighter standing on the ground, so a jump
//            clears it)
//   attack5  the Sunburst Fist, a technique, its Limit Break: its power
//            gathered into its fist, then one punch that explodes (10),
//            open only once its Limit gauge is full (`limit`), which it
//            spends
//   extra_attack  the Whirling Uppercut, a whirl down low into an
//            uppercut launching up, on the ground only: the sheet draws it
//            standing
//
// Its Mash Combo (js/data/mash-combo.js) alternates Beat Rush and the
// Whirling Uppercut, its two close-range strikes.
//
// Its Shield is its guard, fists raised, on the ground. In the air the
// Shield button is its Deflect: a high kick swept up through a red arc that
// bats projectiles back. Its Dash and its air dash are a low lunge, its
// hair streaming. Its cooldowns are the shared policy's (js/data/
// cooldowns.js), derived from what each move does, never authored here:
// the Sunburst Fist waits 5 s (its 10) from its release, every other move none
// at all, and the Deflect none. Waterkick costs 15 Energy (its wave, an
// ordinary construct), the Deflect its 15, nothing else anything.
//
// What of the sheet is no move: its walk, crouch, taunt, intro, wins and
// losses, its portrait, its fall to the floor and getting up, its crouching
// attacks, its four-hit combo's jabs, straights and kicks (its jabs and
// straights drawn again as Beat Rush's: only the combo's whirl and
// uppercut are cut, the Whirling Uppercut), its row of extra kicks and blue-blazing punches, its spells
// (fire and ice, magic its equipment lends it, not its own fighting), the
// Limit Break row (a pose, an aura and a gauge drawn on their own), the
// hop after its Dash, the stance each move row opens with where a move
// starts from its stance anyway, and the kick the air combo lands from;
// the one row its owner left out is not cut at all. The explosion the
// sheet draws at the end of its Meteor Strike row is the Sunburst Fist's: where
// a hurled target lands no art can be let go, and the Sunburst Fist's own row
// draws no blast, though its punch explodes in its canon.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0014's idle, its stance (its reference clip:
// the tallest of its stance frames). Its art is 1x (one file pixel per art
// pixel, cut with the sheet's flat green made transparent), so no pixel
// grid is ever looked for in it (`visual.pixelSize: 1`): each clip's
// heightRatio, its tallest frame over this, sizes it at exactly one art
// pixel per file pixel.
const ART_0014 = 50;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0014 = 88 / 52;

// Playback rates of #0014's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their clips are shown once
// across it.)
const FPS_0014 = Object.freeze({
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
  attack2: 15,
  midair_attack2: 15,
  attack3: 15,
  midair_attack3: 15,
  extra_attack: 20,
  attack4_cast: 10,
  attack4_release: 10,
  attack4_object: 12,
  attack5_cast: 20,
  attack5_release: 15,
  attack5_object: 12,
});

// The Divekick's plunge, in seconds: the hang (its first three frames, the
// flip over) and the longest it dives before it gives up on the ground.
const DIVE_HANG_0014 = 3 / FPS_0014.midair_attack2;
const DIVE_PLUNGE_0014 = 0.8;

// How fast Meteor Strike and the Somersault lift it (motion `rise`, world
// units per second).
const LEAP_0014 = 500;
const FLIP_0014 = 560;

// How full its Limit gauge must be for the Sunburst Fist: the damage of the
// real hits it has taken since this life began or it last broke its Limit.
const LIMIT_0014 = 40;

// Where its body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file. Standing with both feet
// planted (its stance, its guard, its landing, its strikes on the ground,
// its gathering for the Sunburst Fist, its hurt), between its feet;
// anywhere else (running, in the air, its legs off the ground), the middle
// of its white top: its long hair, its kicks' arcs and its punches would
// pull the automatic anchor off its body.
const ANCHORS_0014 = Object.freeze({
  idle: [19.5, 21.5, 18, 24],
  run: [34.5, 34.5, 35.5, 36, 38, 36, 36, 36],
  mouvment: [38.5],
  midair_mouvment: [39.5],
  jump: [22, 20, 17],
  fall: [16, 15],
  land: [22],
  hurt: [25.5, 30],
  midair_hurt: [19, 18],
  prepshield: [17.5],
  shielding: [17.5],
  deflect: [37.5, 38.5, 38.5],
  attack1: [16.5, 16.5, 21, 21, 20, 20, 16.5, 33, 18.5],
  midair_attack1: [20.5, 35.5, 39, 26, 34.5, 34],
  attack2: [18.5, 16.5, 18, 22, 29, 17, 15.5, 22],
  midair_attack2: [35.5, 22.5, 37, 32, 32],
  attack3: [18.5, 16.5, 21, 22.5, 24, 25.5],
  midair_attack3: [37, 21.5, 23, 26.5, 24, 24.5],
  extra_attack: [15, 15, 18, 18, 15],
  attack4: [20, 31, 14.5, 15.5],
  attack5: [11.5, 19.5, 19.5, 14, 17, 17, 17, 18, 20, 23, 21, 21, 20, 30, 30, 16],
});

// The height in art pixels of each file of a codename, file by file (what
// sizes a clip: its tallest frame over ART_0014).
const HEIGHTS_0014 = Object.freeze({
  idle: [49, 50, 49, 48],
  run: [46, 47, 47, 46, 46, 47, 47, 46],
  mouvment: [47],
  midair_mouvment: [47],
  jump: [47, 56, 56],
  fall: [76, 76],
  land: [47],
  hurt: [45, 47],
  midair_hurt: [49, 35],
  prepshield: [49],
  shielding: [49],
  deflect: [54, 57, 57],
  attack1: [49, 49, 49, 49, 44, 44, 48, 48, 49],
  midair_attack1: [56, 49, 49, 53, 47, 47],
  attack2: [49, 49, 56, 49, 26, 37, 41, 47],
  midair_attack2: [48, 50, 42, 52, 51],
  attack3: [49, 49, 58, 58, 52, 55],
  midair_attack3: [43, 51, 48, 51, 49, 50],
  extra_attack: [42, 49, 52, 52, 49],
  attack4: [38, 39, 41, 40],
  attack5: [54, 54, 54, 53, 53, 53, 54, 55, 57, 60, 60, 49, 47, 47, 47, 45],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame against
// the idle, each frame anchored on its body.
const clip = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0014', codename, n)),
  fps,
  loop: false,
  heightRatio: Math.max(...order.map((n) => HEIGHTS_0014[codename][n - 1])) / ART_0014,
  anchorX: order.map((n) => ANCHORS_0014[codename][n - 1]),
  ...extra,
});

// A projectile's or an effect's clip: its files in order, centred, drawn at
// the fighter's art-pixel size whatever their own.
const object = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0014', codename, n)),
  fps,
  loop: false,
  ...extra,
});

// Its stance, side on, fists up: one breath of six poses, the sheet's
// first two drawn twice (each one file, played again).
const STANCE_0014 = [1, 2, 3, 2, 1, 4];
// Beat Rush's art: its stance (file 1, held a moment), a jab (2), turned
// into its guard (3), a fist driven through in a red blur (4), a lunging
// straight, a red streak at the fist (5), held (6), a spin, its back to us
// (7), coming round, its hair flung out (8), and the straight from the
// shoulder (9).
const BEAT_RUSH_0014 = [1, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// The Air Combo's: in the air, fists up (1), a lunging punch (2), drawn
// back (3), its guard (4), a fist driven through in a red blur (5), the
// straight (6), held (6 again).
const AIR_COMBO_0014 = [1, 2, 3, 4, 5, 6, 6];
// Meteodrive's: it reaches out (1, held a moment) and seizes (2), heaves
// its fist up over its head (3), bends back over (4) and lands on its back
// in a bridge (5), then kneels up (6), rises (7) and is in its stance (8).
// A grab that seizes nobody lets go after its reach and its clutch.
const METEODRIVE_0014 = [1, 1, 2, 3, 4, 5, 6, 7, 8];
// The Divekick's: tucked (1), flipping over (2), its heel swept round in a
// white crescent (3), then diving heel-first through the crescent's end
// (4), a red streak at its feet (5: the dive, held as it lands).
const DIVEKICK_0014 = [1, 2, 3, 4, 5];
// Meteor Strike's: it reaches out (1, held a moment) and seizes (2), leaps,
// its fist raised (3), higher (4), turns over in a red arc, hurling down
// (5), and hangs, turned (6). A grab that seizes nobody lets go after its
// reach and its clutch, never leaving the ground.
const METEOR_STRIKE_0014 = [1, 1, 2, 3, 4, 5, 6];
// The Somersault's: a lunge (1), a rising kick, its leg thrown up ahead
// (2), turned over, its heels over its head (3, 4), coming round (5) and
// tucked to land (6).
const SOMERSAULT_0014 = [1, 2, 3, 4, 5, 6];
// The Whirling Uppercut's: whirled down low, its back to us (1, held a
// moment), a fist driven up in a red streak (2), the uppercut, a red arc
// over its head (3), its fist high (4), and its stance (5).
const WHIRLING_UPPERCUT_0014 = [1, 1, 2, 3, 4, 5];
// Its Deflect's: its knee drawn up (1), its kick swept up through a red arc
// (2), its leg high (3), held (3 again).
const DEFLECT_0014 = [1, 2, 3, 3];

export const CHARACTER_0014 = {
  id: '0014',
  displayName: '#0014',
  available: true,
  rosterSlot: 13,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0014.
  animations: {
    // Its stance (see STANCE_0014).
    idle: { ...clip('idle', STANCE_0014, FPS_0014.idle), loop: true },
    // The run: the sheet's eight running frames (not its walk), leaning in,
    // its hair streaming. Its rate follows the speed, down to 0.6 of it (and
    // up past it on a Dash's run-on).
    run: { ...clip('run', [1, 2, 3, 4, 5, 6, 7, 8], FPS_0014.run), loop: true, minSpeedScale: 0.6 },
    // Crouched to spring (the takeoff), then rising, its arms up; falling,
    // its hair streaming up over it; touching down crouched.
    jump: clip('jump', [1, 2, 3], FPS_0014.jump),
    fall: clip('fall', [1, 2], FPS_0014.fall),
    land: clip('land', [1], FPS_0014.land),
    // mouvment, the Dash: a low lunge, its fists forward, its hair
    // streaming, played once across the whole Dash.
    mouvment: clip('mouvment', [1], FPS_0014.mouvment),
    // midair_mouvment, the air dash: the same lunge drawn a second time,
    // played once across the whole air dash.
    midair_mouvment: clip('midair_mouvment', [1], FPS_0014.midair_mouvment),
    // Hitstun: `hurt` flinching, then reeling back; `midair_hurt` thrown
    // back, its arms out, then flat out in the air.
    hurt: clip('hurt', [1, 2], FPS_0014.hurt),
    midair_hurt: clip('midair_hurt', [1, 2], FPS_0014.hurt),
    // Its guard, on the ground: its fists raised (prepshield), then its arms
    // crossed before it (shielding). The sheet draws no lowering: the Shield
    // goes down at once.
    prepshield: clip('prepshield', [1], FPS_0014.shield),
    shielding: clip('shielding', [1], FPS_0014.shield),
    // deflect, its Deflect (see DEFLECT_0014).
    deflect: clip('deflect', DEFLECT_0014, FPS_0014.deflect),
    // attack1, Beat Rush (see BEAT_RUSH_0014).
    attack1: clip('attack1', BEAT_RUSH_0014, FPS_0014.attack1),
    // midair_attack1, the Air Combo (see AIR_COMBO_0014).
    midair_attack1: clip('midair_attack1', AIR_COMBO_0014, FPS_0014.midair_attack1),
    // attack2, Meteodrive (see METEODRIVE_0014).
    attack2: clip('attack2', METEODRIVE_0014, FPS_0014.attack2),
    // midair_attack2, the Divekick (see DIVEKICK_0014).
    midair_attack2: clip('midair_attack2', DIVEKICK_0014, FPS_0014.midair_attack2),
    // attack3, Meteor Strike (see METEOR_STRIKE_0014).
    attack3: clip('attack3', METEOR_STRIKE_0014, FPS_0014.attack3),
    // midair_attack3, the Somersault (see SOMERSAULT_0014).
    midair_attack3: clip('midair_attack3', SOMERSAULT_0014, FPS_0014.midair_attack3),
    // extra_attack, the Whirling Uppercut (see WHIRLING_UPPERCUT_0014).
    extra_attack: clip('extra_attack', WHIRLING_UPPERCUT_0014, FPS_0014.extra_attack),
    // attack4, Waterkick (a technique, see `techniques`): the cast is a low
    // lunge (1) into a sweep along the ground (2); the release, the kick
    // sweeping up off the ground in a red arc (3) and its turn after it (4).
    attack4_cast: clip('attack4', [1, 2], FPS_0014.attack4_cast),
    attack4_release: clip('attack4', [3, 4], FPS_0014.attack4_release),
    // attack5, the Sunburst Fist (a technique, see `techniques`): the cast
    // is its hands raised to its face (1), its stance opened (2, 3), its fist
    // raised over its shoulder (4) as its power gathers in it, a spark (5),
    // a glowing orb (6-8) growing (9), crackling with lightning (10, 11),
    // drawn back (12) and driven forward in a red blur (13); the release,
    // the punch, its whole body behind it (14, 15), and its follow-through
    // (16).
    attack5_cast: clip('attack5', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], FPS_0014.attack5_cast),
    attack5_release: clip('attack5', [14, 15, 16], FPS_0014.attack5_release),
  },

  // Waterkick's wave as it skims along the ground, curling (1-3, over and
  // over for as long as it runs). Drawn running right, so it turns with the
  // way it goes.
  projectileAnimations: {
    attack4_object: object('attack4_object', [1, 2, 3], FPS_0014.attack4_object, { loop: true, sourceFacing: 1 }),
  },

  // The Sunburst Fist's explosion where the punch lands: a white-hot blast (1),
  // flaring (2), burning down (3) and scattering in embers (4), once.
  effectAnimations: {
    attack5_object: object('attack5_object', [1, 2, 3, 4], FPS_0014.attack5_object),
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
    // Its 50-pixel stance at the roster's common art-pixel size, 88/52
    // world units per art pixel (so every fighter's pixels are the same
    // size on screen): about 85 units, slight beside most of the roster.
    height: ART_0014 * UNIT_0014,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.2, size: 0.55 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its dark hair, its
    // white top, its skin, its red gloves and its black skirt.
    eliminationPalette: ['#3c1e1e', '#e1e1dc', '#ffd5b5', '#b9001e', '#41374b'],
  },

  // Its body, measured from its stance: the head and the top, then the
  // legs. Collision is independent of the art.
  collider: { width: 28, height: 80 },
  pushbox: { width: 30 },
  hurtboxes: [
    { x: -15, y: -84, w: 30, h: 44 }, // head and torso
    { x: -18, y: -42, w: 36, h: 42 }, // legs
  ],

  // How #0014 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): light, it is flung a little longer, 0.15 s
  // more stun per 1000 units/s and 0.5 s more at most, tumbling from 1100
  // units/s, and a held direction bends a launch by up to 20 degrees.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.5,
    tumbleSpeed: 1100,
    steerAngle: 20,
  },

  // Its guard, what the `shield` input does for #0014 on the ground: its
  // fists raised, then its arms crossed before it (see the clips). Its
  // perfect Shield opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0014 in the air (schema:
  // js/game/combat/deflect.js): its knee drawn up (the startup), then its
  // kick swept up before it through a red arc to its leg held high (live
  // for two frames: 14 units behind it to 42 in front, from its feet to over
  // its head, the arc the art draws), held (its recovery). Every Deflect's
  // 3, Base Launch 2, here sideways, kicked away before it; while it is
  // live it turns the other fighter's projectiles back at their thrower,
  // now #0014's. Four fifteenths of a second in all, keeping the whole of
  // its drift, under the universal air control, never stepping in (a
  // defense: js/data/attack-movement.js); no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0014.deflect,
    active: 2 / FPS_0014.deflect,
    recovery: 1 / FPS_0014.deflect,
    hitbox: { x: -14, y: -98, w: 56, h: 100 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 to attack3 ordinary attacks with their
  // mid-air versions, attack4 and attack5 techniques; and its extra_attack,
  // on the ground only (its attack is `groundOnly`).
  actions: {
    extra_attack: 'extra_attack', // the Whirling Uppercut
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // Beat Rush / the Air Combo
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // Meteodrive / the Divekick
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // Meteor Strike / the Somersault
    attack4: { type: 'technique', id: 'attack4' }, // Waterkick
    attack5: { type: 'technique', id: 'attack5' }, // Sunburst Fist
  },

  // Its Mash Combo pair (js/data/mash-combo.js): Beat Rush and the
  // Whirling Uppercut, its two close-range strikes. Mashing either button
  // sets off twelve turns.
  mashCombo: { attacks: ['attack1', 'extra_attack'] },

  // Its Special ability (js/data/special-abilities.js): the Sunburst Fist, its
  // Limit Break, a 10-damage punch that only a full Limit gauge opens. Its
  // throws, its leap, its wave and its rushes are its everyday tools:
  // ordinary to the player.
  specialAbilities: ['attack5'],

  // UI only: a frame of each move's own art (zero-based frames): the
  // uppercut's arc, the lunging straight, the air combo's blurred fist, the
  // suplex bending back, the dive, the hurl, the somersault turned over,
  // the wave, the fist crackling with its power.
  mobileAbilities: {
    extra_attack: { label: 'Whirling Uppercut', preview: { animation: 'extra_attack', frame: 3 } },
    attack1: { label: 'Beat Rush', preview: { animation: 'attack1', frame: 5 }, previews: { air: { animation: 'midair_attack1', frame: 4 } } },
    attack2: { label: 'Meteodrive', preview: { animation: 'attack2', frame: 4 }, previews: { air: { animation: 'midair_attack2', frame: 3 } } },
    attack3: { label: 'Meteor Strike', preview: { animation: 'attack3', frame: 5 }, previews: { air: { animation: 'midair_attack3', frame: 2 } } },
    attack4: { label: 'Waterkick', preview: { animation: 'attack4_object', frame: 0, collection: 'projectileAnimations' } },
    attack5: { label: 'Sunburst Fist', preview: { animation: 'attack5_cast', frame: 9 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Whirling Uppercut',
    attack1: 'Beat Rush',
    midair_attack1: 'Air Combo',
    attack2: 'Meteodrive',
    midair_attack2: 'Divekick',
    attack3: 'Meteor Strike',
    midair_attack3: 'Somersault',
    attack4: 'Waterkick',
    attack5: 'Sunburst Fist',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0014.<move>.description).
  abilityDescriptions: {
    extra_attack: 'A whirl down low into an uppercut that launches the opponent upward.',
    attack1: 'A rush of jabs and straights, the last knocking the opponent away.',
    midair_attack1: 'Two punches in the air, the second knocking the opponent away.',
    attack2: 'Seizes the opponent and suplexes it into the floor, which bounces it back up once it is hurt enough.',
    midair_attack2: 'Flips over and dives heel-first, spiking anyone in its way. Once per jump.',
    attack3: 'Seizes the opponent and leaps up carrying it, then hurls it down into the floor.',
    midair_attack3: 'A flipping kick that rises, launching the opponent upward. Once per jump.',
    attack4: 'A kick that sends a wave of water along the ground; it only reaches opponents standing on the ground.',
    attack5: 'Its Limit Break: gathers its power into its fist and punches, exploding. Opens only once its Limit gauge, filled by the damage it takes, is full.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     its quick blows: Beat Rush, and in the air the Air
  //                  Combo, its basic aerial
  //   Triangle / Y   the Whirling Uppercut, its other everyday strike, a
  //                  thumb's roll from Square for its Mash Combo
  //   Circle / B     Meteodrive, its throw, seized where it stands (no
  //                  direction of its own: never the stick)
  //   R2 / RT        Waterkick, its ranged move: the wave runs out ahead
  //   L2 / LT        the Sunburst Fist, its Special: a deliberate trigger,
  //                  never squeezed by accident
  //   right stick    Meteor Strike on the ground and the Somersault in the
  //   up             air: both rise (related moves share an input)
  //   right stick    the Divekick, a dive heel-first: a plunge, only ever
  //   down           the stick down, in the air
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:extra_attack': pad('north'),
      'ground:attack2': pad('east'),
      'ground:attack3': flick('up'),
      'ground:attack4': pad('r2'),
      'ground:attack5': pad('l2'),
      'air:attack1': pad('west'),
      'air:attack2': flick('down'),
      'air:attack3': flick('up'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0014 stands committed to it,
  // then lets go all at once. A hit on #0014 before it lets go breaks it
  // (nothing released), and it needs the ground throughout. Its cooldown
  // begins as it releases (a cast broken before then starts none).
  techniques: {
    // Waterkick: a fifth of a second lunging low into its sweep (nothing
    // protects it), then the kick sweeps up off the ground and the wave
    // runs out ahead of it along the floor (its projectile, below), leaving
    // it 44 units in front of it, its box clear of the floor, the way it
    // faces. A fifth of a second more as it turns out of the kick. No
    // cooldown (3 is ordinary); the wave is a construct, 15 Energy.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      projectile: { id: 'attack4_object', offset: { x: 44, y: -20 } },
    },
    // The Sunburst Fist, its Limit Break: open only once its Limit gauge holds
    // 40 (`limit`: the damage of the real hits it has taken since this life
    // began or it last let the Sunburst Fist go). Thirteen twentieths of a
    // second gathering its power into its raised fist (nothing protects it: a hit
    // breaks the cast and spends nothing), then the punch: everyone in the
    // blast before it, from its fist to 130 units out and from the floor to
    // well over its head (the explosion the art draws there), takes 10 at
    // Base Launch 3, thrown the way it punches; the explosion bursts there
    // (its `effect`, centred 70 units out at its chest). Letting it go
    // spends the whole gauge. A fifth of a second more in its
    // follow-through. The policy's 5 s, for its 10, from the release; no
    // Energy.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      limit: LIMIT_0014,
      burst: {
        hitbox: { x: 4, y: -110, w: 126, h: 112 },
        hit: { damage: 10, baseLaunch: 3, directionalLaunch: 'horizontal', hitstun: 0.6, blockstun: 0.2, hitstop: 0.15 },
        effect: { animation: 'attack5_object', offset: { x: 70, y: -48 } },
      },
    },
  },

  // Its projectile (schema: js/game/combat/projectile.js), named after the
  // attack that lets it go.
  projectiles: {
    // Waterkick's wave: 520 units/s along the ground for half a second
    // (about 260 units out). A wave along the floor, it reaches only a
    // fighter standing on the ground (`quake`): one in the air is passed by,
    // so a jump clears it. Whoever it meets takes 3 at Base Launch 1, swept
    // off its feet the way it runs; a Shield that blocks it is shoved back
    // (`blockPush`) and stops it.
    attack4_object: {
      animation: 'attack4_object',
      speed: 520,
      lifetime: 0.5,
      hitbox: { x: -30, y: -16, w: 60, h: 32 },
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      quake: true,
      blockPush: 300,
      hitstun: 0.4,
      blockstun: 0.16,
      hitstop: 0.06,
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown: none deals 10, heals or
  // holds. Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; Beat Rush, Meteodrive and the Whirling
  // Uppercut step in by the shared Step-in.
  attacks: {
    // Beat Rush: three blows. The jab (live from a tenth of a second, as it
    // is thrown: frame 3, out to 46 units), 1; the fist driven through in
    // its red blur and on into the lunging straight (frames 5-7, out to 56
    // units), 1, each no launch, a stun that holds the target for the
    // next; then the spin and the straight from the shoulder (frame 10, out
    // to 62 units), its heavy blow, 5, Base Launch 1 sideways: it hurts
    // more than it throws. Each in front of it at its chest. Half a second
    // in all. Once the straight has hit, it opens a follow-up. It keeps all
    // the speed it is thrown at and steps in by the shared Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 0,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0014.attack1, active: 1 / FPS_0014.attack1, damage: 1, hitbox: { x: 6, y: -70, w: 40, h: 24 } },
        { at: 4 / FPS_0014.attack1, active: 3 / FPS_0014.attack1, damage: 1, hitbox: { x: 4, y: -68, w: 52, h: 26 } },
        {
          at: 9 / FPS_0014.attack1, active: 1 / FPS_0014.attack1, damage: 5, baseLaunch: 1, directionalLaunch: 'horizontal',
          hitbox: { x: 8, y: -72, w: 54, h: 28 }, hitstun: 0.36,
        },
      ],
      groundOnly: true,
      hitCancel: 9 / FPS_0014.attack1,
    },
    // The Air Combo: a lunging punch (live from a twentieth of a second,
    // frame 2: in front of it at its chest, out to 44 units), 1, no launch;
    // the fist driven through in its red blur and the straight (frames 5-6:
    // out to 42 units), 3, Base Launch 2 sideways. Held (frame 7): seven
    // twentieths of a second. Its drift under the universal air control.
    midair_attack1: {
      animation: 'midair_attack1',
      recovery: 1 / FPS_0014.midair_attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 1 / FPS_0014.midair_attack1, active: 1 / FPS_0014.midair_attack1, damage: 1, hitbox: { x: 4, y: -80, w: 40, h: 26 } },
        {
          at: 4 / FPS_0014.midair_attack1, active: 2 / FPS_0014.midair_attack1, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal',
          hitbox: { x: 4, y: -72, w: 38, h: 28 }, hitstun: 0.34,
        },
      ],
    },
    // Meteodrive, a grab (`grab`): it reaches out and seizes (frame 3,
    // live from two fifteenths of a second: in front of it out to 40 units,
    // from its knees to its shoulders), 1, no launch and a long stun that
    // holds the target for the throw, held where it stands (`carry`: the
    // seized target takes #0014's own speed, so it never slides out of the
    // throw); it heaves its fist up and bends back
    // over (frames 5-6, live: 30 units behind it to 46 in front, from the
    // floor to over its head, where it swings its target through), 5, Base
    // Launch 3 straight down: a suplex into the floor, which a target hurt
    // enough rebounds off (the shared launch bounce). It kneels up, rises
    // and is in its stance (frames 7-9): three fifths of a second in all.
    // Only a seizure goes on to the throw: if the seize finds nobody (or a
    // raised Shield), it lets go there, the move over at a fifth of a
    // second. Once the throw has hit, it opens a follow-up. It steps in by
    // the shared Step-in.
    attack2: {
      animation: 'attack2',
      recovery: 3 / FPS_0014.attack2,
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      grab: { recovery: 0 },
      hits: [
        {
          at: 2 / FPS_0014.attack2, active: 1 / FPS_0014.attack2, damage: 1, hitbox: { x: 4, y: -72, w: 36, h: 60 }, hitstun: 0.5,
          carry: { lift: 0 },
        },
        {
          at: 4 / FPS_0014.attack2, active: 2 / FPS_0014.attack2, damage: 5, baseLaunch: 3, directionalLaunch: 'reverseVertical',
          hitbox: { x: -30, y: -96, w: 76, h: 96 }, hitstun: 0.45, hitstop: 0.1,
        },
      ],
      groundOnly: true,
      hitCancel: 7 / FPS_0014.attack2,
    },
    // The Divekick: tucked, flipping over, its heel swept round in a white
    // crescent (frames 1-3, a fifth of a second, the hang), then it dives
    // heel-first at 1300 units/s (motion `slam`) for up to 0.8 s, its heel
    // driven down (live: 10 units behind it to 34 in front, from its waist
    // to below its feet), 3, Base Launch 2 straight down: a spike. Where it
    // meets the ground it lands on its heel, the dive's last frame held, for
    // a fifth of a second; nothing bursts there. Once per airtime; half its
    // drift kept. A dive that runs out in the air falls on.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: DIVE_HANG_0014,
      active: DIVE_PLUNGE_0014,
      recovery: 3 / FPS_0014.midair_attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'reverseVertical',
      hitbox: { x: -10, y: -50, w: 44, h: 56 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 0.05,
      airUses: 1,
      motion: { type: 'slam', fallSpeed: 1300 },
      airMomentum: 0.5,
    },
    // Meteor Strike, a grab (`grab`): it reaches out and seizes (frame 3,
    // live from two fifteenths of a second: in front of it out to 46 units,
    // from its shins to over its shoulders), 1, and throws its target up
    // as it leaps off the ground at 500 units/s (motion `rise`, carrying
    // it: `carry`, the seizure lifting it as fast as #0014 rises); still
    // holding it, its fist raised (frame 5: in front of it and over its
    // head), 1, carried on; then it turns over and hurls its target down
    // (frame 6, a red arc: 20 units behind it to 44 in front, from its feet
    // to over its head), 5, Base Launch 3 straight down: driven into the
    // floor, which a target hurt enough rebounds off. Four fifteenths of a
    // second rising (about 130 units), then it hangs, turned (frame 7), and
    // falls: seven fifteenths of a second in all. Only a seizure leaps: if
    // the seize finds nobody (or a raised Shield), it lets go there, never
    // leaving the ground, the move over at a fifth of a second. On the
    // ground only (its air move is the Somersault); half the speed it had
    // kept as it leaps.
    attack3: {
      animation: 'attack3',
      recovery: 1 / FPS_0014.attack3,
      hitstun: 0.45,
      blockstun: 0.14,
      hitstop: 1 / 30,
      grab: { recovery: 0 },
      carry: { lift: 0 },
      hits: [
        { at: 2 / FPS_0014.attack3, active: 1 / FPS_0014.attack3, damage: 1, hitbox: { x: 2, y: -84, w: 44, h: 76 }, carry: { lift: LEAP_0014 } },
        { at: 4 / FPS_0014.attack3, active: 1 / FPS_0014.attack3, damage: 1, hitbox: { x: -6, y: -116, w: 52, h: 104 } },
        {
          at: 5 / FPS_0014.attack3, active: 1 / FPS_0014.attack3, damage: 5, baseLaunch: 3, directionalLaunch: 'reverseVertical',
          hitbox: { x: -20, y: -112, w: 64, h: 112 }, carry: null, hitstun: 0.45, hitstop: 0.1,
        },
      ],
      motion: { type: 'rise', speed: LEAP_0014 },
      groundOnly: true,
      momentum: 0.5,
    },
    // The Somersault: a lunge (frame 1, a fifteenth of a second, the hang),
    // then it flips up at 560 units/s (motion `rise`): its kick thrown up
    // ahead (frame 2, live: in front of it out to 46 units, from its waist to
    // over its head), 1, carrying its target up with it; then its heels
    // over its head (frames 3-4, live: 30 units behind it to 46 in front,
    // over it), 3, Base Launch 2 straight up. A fifth of a second rising
    // (about 110 units), then coming round and tucked to land (frames 5-6):
    // two fifths of a second in all. Its recovery: once per airtime, 0.6 of
    // its drift kept.
    midair_attack3: {
      animation: 'midair_attack3',
      recovery: 2 / FPS_0014.midair_attack3,
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      carry: { lift: 0 },
      hits: [
        { at: 1 / FPS_0014.midair_attack3, active: 1 / FPS_0014.midair_attack3, damage: 1, hitbox: { x: 0, y: -90, w: 46, h: 82 } },
        {
          at: 2 / FPS_0014.midair_attack3, active: 2 / FPS_0014.midair_attack3, damage: 3, baseLaunch: 2, directionalLaunch: 'vertical',
          hitbox: { x: -30, y: -104, w: 76, h: 100 }, carry: null, hitstun: 0.38, hitstop: 0.05,
        },
      ],
      motion: { type: 'rise', speed: FLIP_0014 },
      airUses: 1,
      airMomentum: 0.6,
    },
    // The Whirling Uppercut: whirled down low, its back to us (frames 1-2,
    // a tenth of a second), a fist driven up in a red streak (frame 3, live
    // from a tenth of a second: low before it, out to 46 units), 1, no
    // launch, a stun that holds the target for the uppercut; the uppercut,
    // a red arc over its head (frame 4: in front of it out to 44 units,
    // from its waist to over its head), 3, Base Launch 2 straight up. Its
    // fist high and its stance (frames 5-6): three tenths of a second in
    // all. Once the uppercut has hit, it opens a follow-up. It steps in by
    // the shared Step-in. On the ground only: the sheet draws it standing.
    extra_attack: {
      animation: 'extra_attack',
      recovery: 2 / FPS_0014.extra_attack,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0014.extra_attack, active: 1 / FPS_0014.extra_attack, damage: 1, hitbox: { x: 4, y: -54, w: 42, h: 32 } },
        {
          at: 3 / FPS_0014.extra_attack, active: 1 / FPS_0014.extra_attack, damage: 3, baseLaunch: 2, directionalLaunch: 'vertical',
          hitbox: { x: 0, y: -94, w: 44, h: 72 }, hitstun: 0.36,
        },
      ],
      groundOnly: true,
      hitCancel: 4 / FPS_0014.extra_attack,
    },
  },
};
