// #0013's definition: everything that makes #0013 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0013.md for what each move does in play.
//
// The pale-eyed palm fighter in a lavender jacket, cut from one supplied
// sprite sheet (see assets/characters/0013/). Its eyes see all round it and
// into the flow of chakra inside its opponents, and its palms strike that
// flow rather than the body: every palm it lands cuts some of its target's
// power off (a hit's `drain`: Energy taken from the target, so a Shield, a
// Dash or a recovery it was counting on may not be there). Every move is
// one it uses in its canon: it heals nobody, summons nobody, makes no clone,
// throws nothing and never homes in. Five numbered attacks, each a button
// of its own, and no extra_attack:
//
//   attack1  the Gentle Fist, three chakra palms, the last a heavy blow,
//            each cutting off a little of its target's power; in the air
//            the Air Palm, two palms
//   attack2  the Sweep Kick, a low sweep, then a high kick launching up;
//            in the air the Falling Palm, a dive palm-first (motion
//            `slam`) whose chakra bursts where it meets the ground
//   attack3  the Protective Palms, a dome of chakra spun round it that
//            strikes everyone inside and turns back every shot that meets
//            it (`deflectProjectiles`); in the air the Rising Palm, a palm
//            thrust up, launching up
//   attack4  the Twin Lion Fists, a technique: chakra gathered into a lion
//            on each hand, which surge out ahead of it (a projectile) and
//            bite, draining 50 Energy
//   attack5  the Sixty-Four Palms, a technique: its eyes woken and its field
//            of divination spread round it, then a flurry of palms that
//            seals its target's chakra (10, and its whole bar drained)
//
// Its Mash Combo (js/data/mash-combo.js) alternates the Gentle Fist and the
// Sweep Kick, its two close-range strikes.
//
// Its Shield is a guard of crossed arms, on the ground. In the air the
// Shield button is its Deflect: a palm swept up through an arc of chakra
// that bats projectiles back. Its Dash is a blur of speed; its air dash a
// lunge, its palm out ahead. Its cooldowns are the shared policy's
// (js/data/cooldowns.js), derived from what each move does, never authored
// here: the Sixty-Four Palms waits 5 s (its 10) from its release, every
// other move none at all, and the Deflect none. The Twin Lion Fists costs
// 15 Energy (its burst, an ordinary construct), the Deflect its 15, nothing
// else anything. The sheet's getting up, its intro, support, wins and
// losses, its edit notes, its portrait and story panels, the dome drawn on
// its own and its lion flames drawn on their own (for laying over frames:
// nothing is laid over anything here) and the second, near-identical copy
// of its dome are no move; a drawing the sheet repeats (its stance, its
// guard, its spin's turned back) is cut once and played again.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0013's idle, its standing pose (its reference
// clip: the tallest of its stance frames). Its art is 1x (one file pixel
// per art pixel, cut with the sheet's flat teal made transparent), so no
// pixel grid is ever looked for in it (`visual.pixelSize: 1`): each clip's
// heightRatio, its tallest frame over this, sizes it at exactly one art
// pixel per file pixel.
const ART_0013 = 50;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0013 = 88 / 52;

// Playback rates of #0013's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their clips are shown once
// across it.)
const FPS_0013 = Object.freeze({
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
  midair_attack1: 15,
  attack2: 15,
  midair_attack2: 15,
  attack3: 20,
  midair_attack3: 15,
  attack4_cast: 10,
  attack4_release: 10,
  attack4_object: 15,
  attack5_cast: 12,
  attack5_release: 15,
});

// The Falling Palm's plunge, in seconds: the hang (its first two frames)
// and the longest it dives before it gives up on the ground.
const DIVE_HANG_0013 = 2 / FPS_0013.midair_attack2;
const DIVE_PLUNGE_0013 = 0.8;

// Where its body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file. Standing with both feet
// planted (its stance, its guard, its landing, its Gentle Fist, its lions,
// its Sixty-Four Palms' cast, its hurt), between its feet; anywhere else on
// its jacket, the middle of its body (its palms, its chakra, its dome and
// its kicks are drawn out round it and would pull the automatic anchor off
// it). Its dome's frames on the dome's middle, which the sheet draws round
// it; the wisps the dome leaves on its body.
const ANCHORS_0013 = Object.freeze({
  idle: [12.5, 11.5, 13.5],
  run: [18.5, 24.5, 22, 16, 19, 25, 21, 14.5],
  mouvment: [26],
  midair_mouvment: [25.5],
  jump: [12, 16.5, 16.5],
  fall: [14, 14],
  land: [15],
  hurt: [16, 15.5],
  midair_hurt: [19.5, 19.5],
  prepshield: [12],
  shielding: [12],
  deflect: [15, 15.5, 14.5, 12],
  attack1: [14, 15.5, 15.5, 14, 15.5, 15.5, 15, 16.5, 16.5, 12],
  midair_attack1: [12.5, 15.5, 16, 17, 18],
  attack2: [13, 15.5, 17, 24.5, 18, 18],
  midair_attack2: [17, 21.5, 22.5, 23, 14.5],
  attack3: [12.5, 13, 17, 33, 38, 41, 41, 41, 41, 56, 54, 51.5, 20, 13.5],
  midair_attack3: [20, 22.5, 23, 23, 20.5],
  attack4: [17.5, 17.5, 17.5, 17.5, 21.5, 22.5, 22.5, 23.5],
  attack5: [17.5, 9.5, 9.5, 29.5, 34.5, 38.5, 9.5, 16, 23, 21, 25, 10, 11.5, 12],
});

// Where its feet are in each file of a codename whose art reaches below
// them (`anchorY`, art pixels down from the top of the file's visible art),
// file by file: the dome's wisps swept under it as the dome breaks, which
// would otherwise lift its whole body off the ground. A codename left out
// stands on the bottom of its art.
const FEET_0013 = Object.freeze({
  attack3: [45, 49, 47, 51, 52, 66, 66, 66, 66, 77, 81, 78, 41, 48],
});

// The height in art pixels of each file of a codename, file by file (what
// sizes a clip: its tallest frame over ART_0013).
const HEIGHTS_0013 = Object.freeze({
  idle: [49, 50, 48],
  run: [45, 45, 46, 46, 45, 44, 46, 46],
  mouvment: [44],
  midair_mouvment: [44],
  jump: [44, 53, 53],
  fall: [53, 53],
  land: [44],
  hurt: [45, 45],
  midair_hurt: [44, 26],
  prepshield: [48],
  shielding: [44],
  deflect: [40, 49, 52, 51],
  attack1: [47, 46, 46, 47, 46, 46, 45, 44, 44, 48],
  midair_attack1: [53, 52, 52, 48, 48],
  attack2: [49, 44, 45, 41, 47, 46],
  midair_attack2: [48, 45, 45, 46, 42],
  attack3: [45, 49, 47, 51, 52, 66, 66, 66, 66, 80, 81, 78, 41, 48],
  midair_attack3: [45, 47, 48, 48, 47],
  attack4: [48, 47, 46, 47, 48, 47, 46, 47],
  attack5: [49, 49, 49, 64, 81, 71, 49, 41, 49, 63, 57, 60, 40, 40],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame against
// the idle, each frame anchored on its body (and on its feet where the art
// reaches below them).
const clip = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0013', codename, n)),
  fps,
  loop: false,
  heightRatio: Math.max(...order.map((n) => HEIGHTS_0013[codename][n - 1])) / ART_0013,
  anchorX: order.map((n) => ANCHORS_0013[codename][n - 1]),
  ...(FEET_0013[codename] ? { anchorY: order.map((n) => FEET_0013[codename][n - 1]) } : {}),
  ...extra,
});

// A projectile's clip: its files in order, centred, drawn at the fighter's
// art-pixel size whatever their own.
const object = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0013', codename, n)),
  fps,
  loop: false,
  ...extra,
});

// Its stance, side on, its leading palm open: three drawings, the first
// played again between the others (the sheet draws it twice), one breath.
const STANCE_0013 = [1, 2, 1, 3];
// The Gentle Fist's art: a palm thrust out, chakra flaring at it (file 1),
// held out (2, 3); the second palm, its chakra flaring (4), held (5, 6);
// the third thrust from the shoulder, its chakra spraying ahead (7), drawn
// back to its guard (8, 9) and its stance (10).
const GENTLE_FIST_0013 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// The Air Palm's: a palm thrust out in the air, chakra flaring at it (1),
// held out (2, 3), the second palm, chakra spraying ahead (4), drawn in
// (5).
const AIR_PALM_0013 = [1, 2, 3, 4, 5];
// The Sweep Kick's: a step in (1), its arm thrown forward (2), turning low
// (3), the sweep along the ground, a white arc at its feet (4), the high
// kick, a white streak up from its foot (5), its leg held high (6), held a
// moment more (6 again).
const SWEEP_KICK_0013 = [1, 2, 3, 4, 5, 6, 6];
// The Falling Palm's: a somersault, its arms over its head (1), turning
// over into the dive, an arc of chakra before it (2), diving palm-first, a
// white streak of chakra driven down from its palm (3, 4); landed, its palm
// low behind it (5: the impact).
const FALLING_PALM_0013 = [1, 2, 3, 4];
const FALLING_PALM_IMPACT_0013 = [5];
// The Protective Palms': it turns (1), turns further (2), its back to us
// (3), chakra swirling up from its feet (4), round it (5), closing into a
// dome round it, its body a shadow spinning inside (6-9), the dome bursting
// outward in rings (10) and rising off it in wisps (11, 12), turning back
// round (3 again, 13) to its stance (14).
const PROTECTIVE_PALMS_0013 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 3, 13, 14];
// The Rising Palm's: its fist drawn back (1), the palm thrust up, chakra at
// it (2), high over its head (3), lowered (4) to its guard (5).
const RISING_PALM_0013 = [1, 2, 3, 4, 5];
// Its Deflect's: crouched (1), its palm swept up through an arc of chakra
// before it (2), over its head (3), its palm raised (4).
const DEFLECT_0013 = [1, 2, 3, 4];

export const CHARACTER_0013 = {
  id: '0013',
  displayName: '#0013',
  available: true,
  rosterSlot: 12,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0013 and FEET_0013.
  animations: {
    // Its stance (see STANCE_0013).
    idle: { ...clip('idle', STANCE_0013, FPS_0013.idle), loop: true },
    // The run: the sheet's eight frames, leaning in, its hair streaming. Its
    // rate follows the speed, down to 0.6 of it (and up past it on a Dash's
    // run-on).
    run: { ...clip('run', [1, 2, 3, 4, 5, 6, 7, 8], FPS_0013.run), loop: true, minSpeedScale: 0.6 },
    // Takeoff from its stance, then springing up, arms out; at the top its
    // legs drawn up, then let down; touching down into its stance.
    jump: clip('jump', [1, 2, 3], FPS_0013.jump),
    fall: clip('fall', [1, 2], FPS_0013.fall),
    land: clip('land', [1], FPS_0013.land),
    // mouvment, the Dash: a blur of speed, its hair streaming, played once
    // across the whole Dash.
    mouvment: clip('mouvment', [1], FPS_0013.mouvment),
    // midair_mouvment, the air dash: a lunge, its palm out ahead, played
    // once across the whole air dash.
    midair_mouvment: clip('midair_mouvment', [1], FPS_0013.midair_mouvment),
    // Hitstun: `hurt` flinching, then recoiling; `midair_hurt` thrown back,
    // its arms out, then tumbling over.
    hurt: clip('hurt', [1, 2], FPS_0013.hurt),
    midair_hurt: clip('midair_hurt', [1, 2], FPS_0013.hurt),
    // Its guard, on the ground: its palm raised (prepshield), then its arms
    // crossed before it (shielding). The sheet draws its lowering as its
    // raising again; the Shield goes down at once.
    prepshield: clip('prepshield', [1], FPS_0013.shield),
    shielding: clip('shielding', [1], FPS_0013.shield),
    // deflect, its Deflect (see DEFLECT_0013).
    deflect: clip('deflect', DEFLECT_0013, FPS_0013.deflect),
    // attack1, the Gentle Fist (see GENTLE_FIST_0013).
    attack1: clip('attack1', GENTLE_FIST_0013, FPS_0013.attack1),
    // midair_attack1, the Air Palm (see AIR_PALM_0013).
    midair_attack1: clip('midair_attack1', AIR_PALM_0013, FPS_0013.midair_attack1),
    // attack2, the Sweep Kick (see SWEEP_KICK_0013).
    attack2: clip('attack2', SWEEP_KICK_0013, FPS_0013.attack2),
    // midair_attack2, the Falling Palm (see FALLING_PALM_0013), and its
    // landing (midair_attack2_impact).
    midair_attack2: clip('midair_attack2', FALLING_PALM_0013, FPS_0013.midair_attack2),
    midair_attack2_impact: clip('midair_attack2', FALLING_PALM_IMPACT_0013, FPS_0013.midair_attack2),
    // attack3, the Protective Palms (see PROTECTIVE_PALMS_0013).
    attack3: clip('attack3', PROTECTIVE_PALMS_0013, FPS_0013.attack3),
    // midair_attack3, the Rising Palm (see RISING_PALM_0013).
    midair_attack3: clip('midair_attack3', RISING_PALM_0013, FPS_0013.midair_attack3),
    // attack4, the Twin Lion Fists (a technique, see `techniques`): the cast
    // is its stance, its arms low and open as it gathers its chakra (1-4);
    // the release, a lion of blue chakra blazing on each hand (5-8).
    attack4_cast: clip('attack4', [1, 2, 3, 4], FPS_0013.attack4_cast),
    attack4_release: clip('attack4', [5, 6, 7, 8], FPS_0013.attack4_release),
    // attack5, the Sixty-Four Palms (a technique, see `techniques`): the
    // cast is its arms opened (1), its hands brought together (2), its eyes
    // woken, white (3), its field of divination drawn round it in a ring of
    // chakra lines (4), spreading (5) and fading (6), its hands together
    // (7), dropping into its stance (8); the release is the flurry, its
    // palms whirling chakra in arcs all round it (9-12), and its guard again
    // (13, 14).
    attack5_cast: clip('attack5', [1, 2, 3, 4, 5, 6, 7, 8], FPS_0013.attack5_cast),
    attack5_release: clip('attack5', [9, 10, 11, 12, 13, 14], FPS_0013.attack5_release),
  },

  // The Twin Lion Fists' lions as they surge out ahead of it, a lion's head
  // of blue chakra, jaws open (1-4, over and over for as long as it flies).
  // Drawn facing right, so it turns with the way it flies.
  projectileAnimations: {
    attack4_object: object('attack4_object', [1, 2, 3, 4], FPS_0013.attack4_object, { loop: true, sourceFacing: 1 }),
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
    height: ART_0013 * UNIT_0013,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.2, size: 0.55 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its lavender
    // jacket, its navy hair, its pale skin and the cyan and peach of its
    // chakra.
    eliminationPalette: ['#9988aa', '#272936', '#fcecdc', '#93ecec', '#fbc8ac'],
  },

  // Its body, measured from its stance: the head and the jacket, then the
  // legs. Collision is independent of the art.
  collider: { width: 28, height: 80 },
  pushbox: { width: 30 },
  hurtboxes: [
    { x: -15, y: -84, w: 30, h: 44 }, // head and torso
    { x: -18, y: -42, w: 36, h: 42 }, // legs
  ],

  // How #0013 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): light, it is flung a little longer, 0.15 s
  // more stun per 1000 units/s and 0.5 s more at most, tumbling from 1100
  // units/s, and a held direction bends a launch by up to 20 degrees.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.5,
    tumbleSpeed: 1100,
    steerAngle: 20,
  },

  // Its guard, what the `shield` input does for #0013 on the ground: its
  // palm raised, then its arms crossed before it (see the clips). Its
  // perfect Shield opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0013 in the air (schema:
  // js/game/combat/deflect.js): crouched (the startup), then its palm swept
  // up before it through an arc of chakra and over its head (live for two
  // frames: 20 units behind it to 55 in front, from its feet to over its
  // head, the arc the art draws), its palm raised (its recovery). Every
  // Deflect's 3, Base Launch 2, here sideways, batted away before it;
  // while it is live it turns the other fighter's projectiles back at
  // their thrower, now #0013's. Four fifteenths of a second in all, keeping
  // the whole of its drift, under the universal air control, never
  // stepping in (a defense: js/data/attack-movement.js); no cooldown of its
  // own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0013.deflect,
    active: 2 / FPS_0013.deflect,
    recovery: 1 / FPS_0013.deflect,
    hitbox: { x: -20, y: -95, w: 75, h: 98 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 to attack3 ordinary attacks with their
  // mid-air versions, attack4 and attack5 techniques. No extra_attack.
  actions: {
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Gentle Fist / the Air Palm
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Sweep Kick / the Falling Palm
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Protective Palms / the Rising Palm
    attack4: { type: 'technique', id: 'attack4' }, // the Twin Lion Fists
    attack5: { type: 'technique', id: 'attack5' }, // the Sixty-Four Palms
  },

  // Its Mash Combo pair (js/data/mash-combo.js): the Gentle Fist and the
  // Sweep Kick, its two close-range strikes. Mashing either button sets off
  // twelve turns.
  mashCombo: { attacks: ['attack1', 'attack2'] },

  // Its Special abilities (js/data/special-abilities.js): the Twin Lion
  // Fists, whose lions drain 50 of its target's Energy at a bite, and the
  // Sixty-Four Palms, which seals its target's chakra (its whole bar).
  // The Protective Palms and its plain palms are its everyday tools:
  // ordinary to the player.
  specialAbilities: ['attack4', 'attack5'],

  // UI only: a frame of each move's own art (zero-based frames): the second
  // palm's chakra, the air palm's spray, the high kick, the dive, the dome,
  // the rising palm, the lions on its hands, the flurry of palms.
  mobileAbilities: {
    attack1: { label: 'Gentle Fist', preview: { animation: 'attack1', frame: 3 }, previews: { air: { animation: 'midair_attack1', frame: 3 } } },
    attack2: { label: 'Sweep Kick', preview: { animation: 'attack2', frame: 4 }, previews: { air: { animation: 'midair_attack2', frame: 2 } } },
    attack3: { label: 'Protective Palms', preview: { animation: 'attack3', frame: 6 }, previews: { air: { animation: 'midair_attack3', frame: 1 } } },
    attack4: { label: 'Twin Lion Fists', preview: { animation: 'attack4_release', frame: 0 } },
    attack5: { label: 'Sixty-Four Palms', preview: { animation: 'attack5_release', frame: 2 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    attack1: 'Gentle Fist',
    midair_attack1: 'Air Palm',
    attack2: 'Sweep Kick',
    midair_attack2: 'Falling Palm',
    attack3: 'Protective Palms',
    midair_attack3: 'Rising Palm',
    attack4: 'Twin Lion Fists',
    attack5: 'Sixty-Four Palms',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0013.<move>.description).
  abilityDescriptions: {
    attack1: 'Three chakra palms, the last knocking the opponent back; each cuts off some of its Energy.',
    midair_attack1: 'Two chakra palms in the air, the second knocking the opponent away; each cuts off some of its Energy.',
    attack2: 'A low sweep along the ground, then a high kick that launches the opponent upward.',
    midair_attack2: 'Dives palm-first, spiking anyone in its way; its chakra bursts where it lands, draining Energy. Once per jump.',
    attack3: 'Spins a dome of chakra around itself that strikes everyone inside and turns back every projectile; any move ends it.',
    midair_attack3: 'A palm thrust straight up that launches the opponent upward and cuts off some of its Energy.',
    attack4: 'Gathers chakra into a lion on each hand, which surge out ahead and bite, draining much of the opponent\'s Energy.',
    attack5: 'Wakes its eyes and spreads its field around it, then strikes with a flurry of palms that seals the opponent\'s Energy completely.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     its quick palms: the Gentle Fist, and in the air the
  //                  Air Palm, its basic aerial
  //   Triangle / Y   the Sweep Kick, its other everyday strike, a thumb's
  //                  roll from Square for its Mash Combo
  //   Circle / B     the Protective Palms, spun where it stands; in the air
  //                  the Rising Palm, a palm thrust up (it rises nowhere
  //                  itself: never the stick)
  //   R2 / RT        the Twin Lion Fists, its ranged move: the lions surge
  //                  out ahead of it
  //   L2 / LT        the Sixty-Four Palms, its first Special: a deliberate
  //                  trigger, never squeezed by accident
  //   right stick    the Falling Palm, a dive palm-first: a plunge, only
  //   down           ever the stick down, in the air
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:attack3': pad('east'),
      'ground:attack4': pad('r2'),
      'ground:attack5': pad('l2'),
      'air:attack1': pad('west'),
      'air:attack2': flick('down'),
      'air:attack3': pad('east'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0013 stands committed to it,
  // then lets go all at once. A hit on #0013 before it lets go breaks it
  // (nothing released), and it needs the ground throughout. Its cooldown
  // begins as it releases (a cast broken before then starts none).
  techniques: {
    // The Twin Lion Fists: two fifths of a second in its stance, its arms
    // low and open, gathering its chakra (nothing protects it), then the
    // lions on its hands surge out ahead of it (its projectile, below),
    // leaving it 40 units in front of it at its chest, the way it faces.
    // Two fifths of a second more, the lions blazing on its hands. No
    // cooldown (5 and a drain are ordinary); the lions are a construct, 15
    // Energy.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      projectile: { id: 'attack4_object', offset: { x: 40, y: -50 } },
    },
    // The Sixty-Four Palms: two thirds of a second waking its eyes and
    // spreading its field of divination round it (nothing protects it),
    // then the flurry: everyone in its field, from 40 units behind it to 85
    // in front and from the floor to over its head (the arcs of its palms
    // the art draws), takes 10 at Base Launch 3, thrown sideways by the last
    // palm, and loses all its Energy (`drain` 100): its chakra sealed,
    // exhausted until its bar is full again. Two fifths of a
    // second more as its palms come to rest. The policy's 5 s, for its 10,
    // from the release; no Energy.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      burst: {
        hitbox: { x: -40, y: -100, w: 125, h: 102 },
        hit: { damage: 10, baseLaunch: 3, directionalLaunch: 'horizontal', drain: 100, hitstun: 0.6, blockstun: 0.2, hitstop: 0.12 },
      },
    },
  },

  // Its projectile (schema: js/game/combat/projectile.js), named after the
  // attack that lets it go.
  projectiles: {
    // The Twin Lion Fists' lions: 750 units/s for a quarter of a second
    // (about 190 units past where they leave its hands). Whoever they bite
    // takes 5 at Base Launch 2, thrown the way they fly, and loses 50 Energy
    // to them (`drain`: the lions feed on the chakra they touch).
    attack4_object: {
      animation: 'attack4_object',
      speed: 750,
      lifetime: 0.25,
      hitbox: { x: -22, y: -18, w: 44, h: 36 },
      damage: 5,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      drain: 50,
      hitstun: 0.45,
      blockstun: 0.18,
      hitstop: 0.08,
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown: none deals 10, heals or
  // holds (a drain is ordinary). Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; the Gentle Fist and the Sweep Kick step
  // in by the shared Step-in.
  attacks: {
    // The Gentle Fist: three palms. The first thrust out as its chakra
    // flares and held out (live from a tenth of a second, at full reach:
    // frame 3), the second (frames 4-5), each 1, no launch, a stun that
    // holds the target for the next; the third, its heavy blow, from the
    // shoulder, its chakra spraying ahead (frames 7-8), 5, Base Launch 1
    // sideways: it hurts more than it throws. Each palm, in front of it at
    // its chest out to 56 units, cuts off 5 of its target's Energy
    // (`drain`). Drawn back to its guard and its stance (frames 9-10): half
    // a second in all. Once the third has hit, it opens a follow-up. It
    // keeps all the speed it is thrown at and steps in by the shared
    // Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 2 / FPS_0013.attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      drain: 5,
      hits: [
        { at: 2 / FPS_0013.attack1, active: 1 / FPS_0013.attack1, damage: 1, hitbox: { x: 8, y: -66, w: 48, h: 30 } },
        { at: 3 / FPS_0013.attack1, active: 2 / FPS_0013.attack1, damage: 1, hitbox: { x: 8, y: -66, w: 48, h: 30 } },
        {
          at: 6 / FPS_0013.attack1, active: 2 / FPS_0013.attack1, damage: 5, baseLaunch: 1, directionalLaunch: 'horizontal',
          hitbox: { x: 8, y: -72, w: 48, h: 34 }, hitstun: 0.32,
        },
      ],
      groundOnly: true,
      hitCancel: 8 / FPS_0013.attack1,
    },
    // The Air Palm: a palm thrust out in the air as its chakra flares (live
    // from a fifteenth of a second, while it is held out: frames 2-3), 1,
    // no launch; the second, its chakra spraying ahead (frame 4), 3, Base
    // Launch 2 sideways. Each, in front of it at its chest out to 48 units,
    // cuts off 5 of its target's Energy. Drawn in (frame 5): a third of a
    // second. Its drift under the universal air control.
    midair_attack1: {
      animation: 'midair_attack1',
      recovery: 1 / FPS_0013.midair_attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      drain: 5,
      hits: [
        { at: 1 / FPS_0013.midair_attack1, active: 2 / FPS_0013.midair_attack1, damage: 1, hitbox: { x: 4, y: -80, w: 44, h: 32 } },
        {
          at: 3 / FPS_0013.midair_attack1, active: 1 / FPS_0013.midair_attack1, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal',
          hitbox: { x: 4, y: -80, w: 46, h: 34 }, hitstun: 0.34,
        },
      ],
    },
    // The Sweep Kick: a step in, its arm thrown forward, turning low (frames
    // 1-3, a fifth of a second), then the sweep along the ground at its
    // feet (frame 4, live: 10 units behind it to 48 in front, from the floor
    // to its knees, its foot and the arc it sweeps), 1, no launch, a stun
    // that holds the target for the kick; the high kick (frame 5, live: in
    // front of it out to 48 units, its leg and the streak it draws up,
    // from its waist to over its head), 3, Base Launch 2 straight up; its
    // leg held high (frames 6-7): seven fifteenths of a second. Once the
    // kick has hit, it opens a follow-up. It steps in by the shared Step-in.
    attack2: {
      animation: 'attack2',
      recovery: 2 / FPS_0013.attack2,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 3 / FPS_0013.attack2, active: 1 / FPS_0013.attack2, damage: 1, hitbox: { x: -10, y: -32, w: 58, h: 34 } },
        {
          at: 4 / FPS_0013.attack2, active: 1 / FPS_0013.attack2, damage: 3, baseLaunch: 2, directionalLaunch: 'vertical',
          hitbox: { x: 0, y: -92, w: 48, h: 56 }, hitstun: 0.36, hitstop: 0.05,
        },
      ],
      groundOnly: true,
      hitCancel: 5 / FPS_0013.attack2,
    },
    // The Falling Palm: a somersault, turning over into the dive (frames
    // 1-2, two fifteenths of a second, the hang), then it dives palm-first
    // at 1300 units/s (motion `slam`) for up to 0.8 s, its chakra driven
    // down from its palm (live: 6 units behind it to 32 in front, from its
    // chest to below its palm), 3, Base Launch 2 straight down: a spike.
    // Where it meets the ground its chakra bursts round its palm (the
    // impact: 50 units either side of it, from the floor to its waist), 3,
    // Base Launch 2 straight up, and 15 of everyone's Energy there drained
    // (`drain`); landed, its palm low behind it (the impact clip) for a fifth
    // of a second. Once per airtime; half its drift kept. A dive that runs
    // out in the air lands nothing and falls on.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: DIVE_HANG_0013,
      active: DIVE_PLUNGE_0013,
      recovery: 3 / FPS_0013.midair_attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'reverseVertical',
      hitbox: { x: -6, y: -50, w: 38, h: 54 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 0.05,
      airUses: 1,
      motion: {
        type: 'slam',
        fallSpeed: 1300,
        impact: {
          hitbox: { x: -50, y: -40, w: 100, h: 44 },
          hit: { damage: 3, baseLaunch: 2, directionalLaunch: 'vertical', drain: 15, hitstun: 0.36, blockstun: 0.14, hitstop: 0.08 },
          animation: 'midair_attack2_impact',
        },
      },
      airMomentum: 0.5,
    },
    // The Protective Palms: it turns, its back to us (frames 1-3, three
    // twentieths of a second), chakra swirls up from its feet (frame 4),
    // then round it (frame 5), closing into a dome round it (frames 6-9)
    // that bursts outward (frame 10). Three strikes, each everywhere the
    // dome is, either side of it: the swirl (frames 5-6: 64 units either
    // side, from the floor to over its head), 1; the dome (frames 7-8: 68
    // either side, from the floor to well over its head), 1; the dome
    // bursting (frames 9-10), 3, Base Launch 2 sideways. Each cuts off 5
    // of its target's Energy. While the strikes are live (three tenths of a
    // second) the dome turns back every other fighter's projectile that
    // meets it, now #0013's, flying back at its thrower
    // (`deflectProjectiles`). The wisps rise off it and it turns back round
    // to its stance (frames 11-15): three quarters of a second in all. It
    // turns shots back, so it is a defense as well as an attack: any valid
    // request ends it (a move, a jump, a Dash, the Shield). On the ground;
    // spun on the move, it slides on with the speed it had, as any attack
    // does, and never steps in (a defense).
    attack3: {
      animation: 'attack3',
      recovery: 5 / FPS_0013.attack3,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      drain: 5,
      hits: [
        { at: 4 / FPS_0013.attack3, active: 2 / FPS_0013.attack3, damage: 1, hitbox: { x: -64, y: -92, w: 128, h: 94 } },
        { at: 6 / FPS_0013.attack3, active: 2 / FPS_0013.attack3, damage: 1, hitbox: { x: -68, y: -112, w: 136, h: 114 } },
        {
          at: 8 / FPS_0013.attack3, active: 2 / FPS_0013.attack3, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal',
          hitbox: { x: -68, y: -112, w: 136, h: 114 }, hitstun: 0.36, hitstop: 0.05,
        },
      ],
      deflectProjectiles: true,
      groundOnly: true,
    },
    // The Rising Palm: its fist drawn back (frame 1, a fifteenth of a
    // second), then the palm thrust up, chakra at it, and high over its head
    // (frames 2-3, live: in front of it out to 42 units, from its chest to
    // well over its head), 3, Base Launch 2 straight up, cutting off 5 of
    // its target's Energy; lowered to its guard (frames 4-5): a third of a
    // second. It rises nowhere itself (no motion of its own). Its drift
    // under the universal air control.
    midair_attack3: {
      animation: 'midair_attack3',
      startup: 1 / FPS_0013.midair_attack3,
      active: 2 / FPS_0013.midair_attack3,
      recovery: 2 / FPS_0013.midair_attack3,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      drain: 5,
      hitbox: { x: 0, y: -104, w: 42, h: 62 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
    },
  },
};
