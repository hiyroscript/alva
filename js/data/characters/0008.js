// #0008's definition: everything that makes #0008 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0008.md for what each move does in play.
//
// The rubber pirate, cut from one supplied sprite sheet (see
// assets/characters/0008/). A young pirate whose whole body is rubber: it
// fights with its own fists and feet, but stretched far out, coiled,
// blown up like a balloon or flung like a slingshot, each move one it uses
// in its canon. It carries no weapon and throws nothing: every move is its
// body, so its stretched limbs are still its body, and can be hit. Five
// numbered attacks, each a button of its own, plus its extra_attack:
//
//   attack1  Jab and Straight, a quick jab, then a straight that knocks its
//            target back; in the air the Gum-Gum Stamp, both legs stretched
//            straight down far below it, stamping down whatever they meet
//   attack2  the Gum-Gum Gatling, a barrage of stretched fists out ahead of
//            it that holds its target to the last blow; in the air the
//            Gum-Gum Rocket, flung head first at its opponent like a
//            slingshot (motion `homing`)
//   attack3  the Gum-Gum Balloon, its body blown up into a rubber balloon:
//            projectiles that meet it are bounced back at their thrower
//            (`deflectProjectiles`), and whoever touches it is bounced up
//            into the air; in the air the same balloon floats where it is
//            (motion `hover`)
//   attack4  the Feast, a technique: two great joints of meat raised and
//            devoured, which heal it (`heal`)
//   attack5  the Gum-Gum Giant Pistol, a technique: it bites its thumb and
//            blows into its bones until its fist swells to a giant's, swings
//            it far back, then sends it across the stage (a burst far out in
//            front of it, 10, and a raised Shield driven back)
//   extra_attack  the Gum-Gum Pistol, its arm stretched far back, then shot
//            out a long way ahead, the fist striking where it lands
//
// Its Mash Combo (js/data/mash-combo.js) alternates Jab and Straight with
// the Crescent Kick (`mash_attack`), a kick swept up through a crescent
// right in front of it: every other ground move reaches far out (the
// Gatling, the Pistol, the Giant Pistol), surrounds it (the Balloon) or
// strikes nobody (the Feast), so this close-range strike has no button of
// its own and is performed only as the series' partner turn (triggered
// from Jab and Straight's button).
//
// Its body is rubber in what it shares with every fighter too: launched
// into a wall, the floor or a ceiling it rebounds sooner and harder than
// anyone (`launchBounce`). Its Shield is its arms wound round each other
// into a rubber wall before it, on the ground. In the air the Shield
// button is its Deflect, a whirl of arms and legs that bats projectiles
// back. Its Dash is a blurred lunge, its air dash a flat, arms-first
// flight. Its cooldowns are the shared policy's (js/data/cooldowns.js),
// derived from what each move does, never authored here: the Feast waits
// 3 s (a heal) and the Giant Pistol 5 s (its fist deals 10), each from its
// release; every other move none at all, and the Deflect none. None of its
// moves creates a construct, so none costs Energy. These timers never alter
// their animation phases. The sheet's upright stance, its blurred speed
// versions of its moves (the Rifle, the Jet Pistol, the Jet Gatling, the
// Jet Bazooka, the Jet Whip, the Jet Stamp), its Bazooka, its rising Whip,
// its Axe, its twisting rising fist, its giant twin fists, its open-mouthed
// lunge, its long grab, its ledge hang, its wins and losses, and its spare
// poses are no move.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0008's idle, its fighting stance (its reference
// clip). Its art is 1x (one file pixel per art pixel, cut from one sprite
// sheet with its flat background made transparent), so no pixel grid is
// ever looked for in it (`visual.pixelSize: 1`): each clip's heightRatio,
// its tallest frame over this, is what sizes it, at exactly one art pixel
// per file pixel.
const ART_0008 = 47;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0008 = 88 / 52;

// Playback rates of #0008's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their clips are shown once
// across it.)
const FPS_0008 = Object.freeze({
  idle: 8,
  run: 12,
  mouvment: 12,
  midair_mouvment: 12,
  jump: 12,
  fall: 10,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 15,
  attack1: 20,
  mash_attack: 15,
  midair_attack1: 15,
  attack2: 20,
  midair_attack2: 15,
  attack3: 12,
  attack4_cast: 6,
  attack4_release: 12,
  attack5_cast: 12,
  attack5_release: 15,
  extra_attack: 15,
});

// Where its body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file: the middle of its blue
// shorts, the one colour none of its stretched limbs, its fists, its
// giant fist or its balloon shares (where a leg kicks high, a body curls up
// or leans, the middle of its hips by eye). Its stretched arms and legs,
// its giant fist and its balloon reach far from its body, and the
// automatic torso anchor would follow them off it.
const ANCHORS_0008 = Object.freeze({
  idle: [12.5, 13, 14, 14, 14, 13],
  run: [19, 22, 21, 12, 20, 24, 19, 15],
  jump: [12.5, 9, 8],
  fall: [8, 8.5, 8],
  land: [12.5, 13, 12.5],
  mouvment: [25, 25],
  midair_mouvment: [26],
  hurt: [16, 12],
  midair_hurt: [23.5],
  prepshield: [16],
  shielding: [14],
  releaseshield: [15],
  deflect: [21.5, 21],
  attack1: [15, 15, 15, 18, 15, 16, 16],
  mash_attack: [16, 12, 12, 11.5],
  midair_attack1: [15, 15, 15, 18],
  attack2: [23, 28, 24, 30, 30, 14, 20],
  midair_attack2: [11.5, 12, 24, 22, 11],
  attack3: [12, 16.5, 21, 29, 27.5, 29, 23, 18, 12.5],
  attack4: [20.5, 16.5, 16, 15.5, 18, 18.5, 17.5, 19.5, 20.5, 20.5],
  attack5: [13, 13, 13, 26, 67, 87.5, 137.5, 138.5, 139.5, 37, 16, 16, 16, 16, 16, 16, 15, 15],
  extra_attack: [17, 54, 86.5, 21, 16, 16],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame
// (`height`, art pixels) against the idle, each frame anchored on its body.
const clip = (codename, order, fps, height, extra = {}) => ({
  frames: order.map((n) => framePath('0008', codename, n)),
  fps,
  loop: false,
  heightRatio: height / ART_0008,
  anchorX: order.map((n) => ANCHORS_0008[codename][n - 1]),
  ...extra,
});

// Its fighting stance: crouched, fists up, breathing in and out.
const STANCE_0008 = [1, 2, 3, 4, 5, 6];
// Jab and Straight's art: the guard (file 1, held a frame), the jab out
// (2, two frames), the guard (3), the fist drawn back (4), the straight
// thrown, speed lines streaming off it (5), the straight at full stretch
// (6), the guard again (7).
const JAB_STRAIGHT_0008 = [1, 1, 2, 2, 3, 4, 5, 6, 7];
// The Crescent Kick's: bent low (1), the leg swept up through a crescent
// in front of it (2), the heel high over its head (3), the stance (4).
const CRESCENT_KICK_0008 = [1, 2, 3, 4];
// The Gum-Gum Gatling's: crouched, the fists drawn back (1, two frames),
// then the barrage, a storm of stretched fists out ahead (2-5, twice over),
// the fists snapped back (6), its arms whipping home with a crack either
// side of it (7).
const GATLING_0008 = [1, 1, 2, 3, 4, 5, 2, 3, 4, 5, 6, 7];
// The Gum-Gum Stamp's: curled up, seen from above (1), both legs stretched
// straight down far below it (2, two frames), drawn halfway back (3), the
// feet snapped home with a crack (4).
const STAMP_0008 = [1, 2, 2, 3, 4];
// The Gum-Gum Rocket's: curled up, drawn back like a slingshot (1, 2), then
// flung head first, streaking (3, 4, twice over), tumbling out of it (5).
const ROCKET_0008 = [1, 2, 3, 4, 3, 4, 5];
// The Gum-Gum Balloon's: crouched (1), a great breath in (2), swelling (3),
// blown up into a balloon, rocking (4-6, then 5 and 4 again), the air let
// out (7), arms flung up (8), crouched again (9).
const BALLOON_0008 = [1, 2, 3, 4, 5, 6, 5, 4, 7, 8, 9];
// The Gum-Gum Pistol's: the arm swung round behind it (1), stretched far
// back (2), further still (3, two frames), shot forward in a blur (4), the
// fist out ahead at full stretch (5, two frames), the arm springing back
// (6).
const PISTOL_0008 = [1, 2, 3, 3, 4, 5, 5, 6];

export const CHARACTER_0008 = {
  id: '0008',
  displayName: '#0008',
  available: true,
  rosterSlot: 7,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0008. Where its legs stretch down below it (the
  // Stamp), the clip also says where its feet would be (`anchorY`, art
  // pixels down from the top), so its body stays where it is and the legs
  // reach below.
  animations: {
    // The fighting stance (see STANCE_0008).
    idle: { ...clip('idle', STANCE_0008, FPS_0008.idle, 47), loop: true },
    // The run: eight frames, arms swinging. Its rate follows the speed, down
    // to 0.6 of it (and up past it on a Dash's run-on).
    run: {
      ...clip('run', [1, 2, 3, 4, 5, 6, 7, 8], FPS_0008.run, 47),
      loop: true,
      minSpeedScale: 0.6,
    },
    // Takeoff, a crouch, then rising, a knee up; at the top tucked, then
    // falling, a leg reaching down; touching down, a crouch.
    jump: clip('jump', [1, 2, 3], FPS_0008.jump, 48),
    fall: clip('fall', [1, 2, 3], FPS_0008.fall, 48),
    land: clip('land', [1, 2, 3], FPS_0008.land, 40),
    // mouvment, the Dash: a blurred lunge, speed lines streaming off it,
    // played once across the whole Dash.
    mouvment: clip('mouvment', [1, 2], FPS_0008.mouvment, 42),
    // midair_mouvment, the air dash: a flat flight, arms first, played once
    // across the whole air dash.
    midair_mouvment: clip('midair_mouvment', [1], FPS_0008.midair_mouvment, 37),
    // Hitstun: `hurt` knocked back, then reeling; `midair_hurt` flung away
    // flat in the air.
    hurt: clip('hurt', [1, 2], FPS_0008.hurt, 44),
    midair_hurt: clip('midair_hurt', [1], FPS_0008.hurt, 30),
    // Its guard, on the ground: an arm brought across (one frame), both
    // arms wound round each other into a rubber wall before it (one), let
    // go, springing loose (one).
    prepshield: clip('prepshield', [1], FPS_0008.shield, 44),
    shielding: clip('shielding', [1], FPS_0008.shield, 35),
    releaseshield: clip('releaseshield', [1], FPS_0008.shield, 44),
    // deflect, its Deflect: a whirl of arms and legs spun round it, two
    // frames, twice.
    deflect: clip('deflect', [1, 2, 1, 2], FPS_0008.deflect, 48),
    // attack1, Jab and Straight (see JAB_STRAIGHT_0008).
    attack1: clip('attack1', JAB_STRAIGHT_0008, FPS_0008.attack1, 46),
    // mash_attack, the Crescent Kick (see CRESCENT_KICK_0008).
    mash_attack: clip('mash_attack', CRESCENT_KICK_0008, FPS_0008.mash_attack, 60),
    // midair_attack1, the Gum-Gum Stamp (see STAMP_0008): its feet stay
    // where they would be, its stretched legs reaching down below them.
    midair_attack1: clip('midair_attack1', STAMP_0008, FPS_0008.midair_attack1, 112, {
      anchorY: STAMP_0008.map((n) => [29, 40, 40, 33][n - 1]),
    }),
    // attack2, the Gum-Gum Gatling (see GATLING_0008).
    attack2: clip('attack2', GATLING_0008, FPS_0008.attack2, 51),
    // midair_attack2, the Gum-Gum Rocket (see ROCKET_0008).
    midair_attack2: clip('midair_attack2', ROCKET_0008, FPS_0008.midair_attack2, 45),
    // attack3, the Gum-Gum Balloon (see BALLOON_0008), on the ground and,
    // floating, in the air (its mid-air version plays the same clip).
    attack3: clip('attack3', BALLOON_0008, FPS_0008.attack3, 63),
    // attack4, the Feast (a technique, see `techniques`): the cast is its
    // arms flung wide (1), a hungry grin (2), a dive for its food (3), two
    // great joints of meat raised high (4) and cheered (5); the release is
    // the meat devoured, a joint in each hand (6-10, its last two bites
    // twice).
    attack4_cast: clip('attack4', [1, 2, 3, 4, 5], FPS_0008.attack4_cast, 61),
    attack4_release: clip('attack4', [6, 7, 8, 9, 10, 9, 10], FPS_0008.attack4_release, 49),
    // attack5, the Gum-Gum Giant Pistol (a technique, see `techniques`):
    // the cast is its thumb bitten and blown into (1, 2), the fist swelling
    // (3), the arm drawn back, steaming (4), then swung far back behind it,
    // the fist swelling to a giant's (5-9); the release is the giant fist
    // swung forward (10), sent out across the stage (11-14), shrinking back
    // to a fist (15, 16) and drawn home (17), the stance again (18).
    attack5_cast: clip('attack5', [1, 2, 3, 4, 5, 6, 7, 8, 9], FPS_0008.attack5_cast, 50),
    attack5_release: clip('attack5', [10, 11, 12, 13, 14, 15, 16, 17, 18], FPS_0008.attack5_release, 48),
    // extra_attack, the Gum-Gum Pistol (see PISTOL_0008).
    extra_attack: clip('extra_attack', PISTOL_0008, FPS_0008.extra_attack, 42),
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
    // Its 47-pixel fighting stance at the roster's common art-pixel size,
    // 88/52 world units per art pixel (so every fighter's pixels are the
    // same size on screen): about 80 units, crouched to fight.
    height: ART_0008 * UNIT_0008,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.22, size: 0.55 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its hat's yellow,
    // its red shirt, its blue shorts, its skin and its black hair.
    eliminationPalette: ['#f5ef38', '#a42505', '#4958eb', '#f6dd9e', '#111111'],
  },

  // Its body, measured from its fighting stance: the head and the
  // shoulders, then the legs. Collision is independent of the art.
  collider: { width: 26, height: 77 },
  pushbox: { width: 30 },
  hurtboxes: [
    { x: -15, y: -80, w: 30, h: 40 }, // head and torso
    { x: -17, y: -40, w: 34, h: 40 }, // legs
  ],

  // How #0008 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): 0.15 s more stun per 1000 units/s, 0.5 s
  // more at most, tumbling from 1150 units/s, and a held direction bends a
  // launch by up to 20 degrees.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.5,
    tumbleSpeed: 1150,
    steerAngle: 20,
  },

  // Its rubber body (see resolveLaunchBounce in
  // js/game/combat/launch-bounce.js): launched into a wall, the floor or a
  // ceiling, it rebounds from a slower impact than anyone (400 units/s,
  // not 500) and sends back more of it (walls 0.9, the floor 0.8, ceilings
  // 0.85, not 0.72, 0.6 and 0.65). Every other bounce setting is the shared
  // one: a rebound still stuns it, and they still stop at five.
  launchBounce: {
    minImpactSpeed: 400,
    wallRestitution: 0.9,
    floorRestitution: 0.8,
    ceilingRestitution: 0.85,
  },

  // Its guard, what the `shield` input does for #0008 on the ground: its
  // arms wound round each other into a rubber wall before it (see the
  // clips). Its perfect Shield opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    groundReleaseAnimation: 'releaseshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0008 in the air (schema:
  // js/game/combat/deflect.js): a whirl of arms and legs spun round it,
  // its first frame the startup, live for the next two (all round its body,
  // out to 36 units either side, the reach of its whirling limbs), the last
  // its recovery. Every Deflect's 3, Base Launch 2, here sideways, the way
  // the limbs bat; while the whirl is live it turns the other fighter's
  // projectiles back at their thrower, now #0008's. A little over a quarter
  // of a second in all, keeping the whole of its drift, under the universal
  // air control, never stepping in (a defense: js/data/attack-movement.js);
  // no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0008.deflect,
    active: 2 / FPS_0008.deflect,
    recovery: 1 / FPS_0008.deflect,
    hitbox: { x: -36, y: -82, w: 72, h: 84 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 to attack3 ordinary attacks with their
  // mid-air versions, attack4 and attack5 techniques.
  actions: {
    extra_attack: 'extra_attack', // the Gum-Gum Pistol
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // Jab and Straight / the Gum-Gum Stamp
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Gum-Gum Gatling / the Gum-Gum Rocket
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Gum-Gum Balloon, on the ground and floating
    attack4: { type: 'technique', id: 'attack4' }, // the Feast
    attack5: { type: 'technique', id: 'attack5' }, // the Gum-Gum Giant Pistol
  },

  // Its Mash Combo pair (js/data/mash-combo.js): Jab and Straight and the
  // Crescent Kick, its one close-range strike with no button (see the
  // header). Mashing Jab and Straight's button sets off twelve turns.
  mashCombo: { attacks: ['attack1', 'mash_attack'] },

  // Its Special abilities (js/data/special-abilities.js): the Feast, the
  // one move that heals it, and the Gum-Gum Giant Pistol, a 10-damage giant
  // fist that can end a stock from across the stage. Its Gatling, its
  // Balloon and its Rocket are ordinary to the player.
  specialAbilities: ['attack4', 'attack5'],

  // UI only: a frame of each move's own art (zero-based frames): the fist
  // out at full stretch, the straight, the stamping legs, the barrage, the
  // slingshot flight, the balloon, the meat, the giant fist.
  mobileAbilities: {
    extra_attack: { label: 'Gum-Gum Pistol', preview: { animation: 'extra_attack', frame: 5 } },
    attack1: { label: 'Jab and Straight', preview: { animation: 'attack1', frame: 7 }, previews: { air: { animation: 'midair_attack1', frame: 1 } } },
    attack2: { label: 'Gum-Gum Gatling', preview: { animation: 'attack2', frame: 4 }, previews: { air: { animation: 'midair_attack2', frame: 2 } } },
    attack3: { label: 'Gum-Gum Balloon', preview: { animation: 'attack3', frame: 3 }, previews: { air: { animation: 'attack3', frame: 3 } } },
    attack4: { label: 'Feast', preview: { animation: 'attack4_release', frame: 0 } },
    attack5: { label: 'Gum-Gum Giant Pistol', preview: { animation: 'attack5_release', frame: 2 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Gum-Gum Pistol',
    attack1: 'Jab and Straight',
    midair_attack1: 'Gum-Gum Stamp',
    attack2: 'Gum-Gum Gatling',
    midair_attack2: 'Gum-Gum Rocket',
    attack3: 'Gum-Gum Balloon',
    midair_attack3: 'Floating Balloon',
    attack4: 'Feast',
    attack5: 'Gum-Gum Giant Pistol',
    mash_attack: 'Crescent Kick',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0008.<move>.description).
  abilityDescriptions: {
    extra_attack: 'Stretches an arm far back, then shoots the fist out a long way ahead. The outstretched arm can be hit.',
    attack1: 'A quick jab that holds the opponent, then a straight that knocks them back.',
    midair_attack1: 'Stretches both legs straight down far below to stamp the opponent downward. The outstretched legs can be hit.',
    attack2: 'A barrage of stretched fists out ahead that holds the opponent, the last blow sending them flying. The outstretched arms can be hit.',
    midair_attack2: 'Flings itself head first at the opponent like a slingshot, springing off on contact. Once per airtime.',
    attack3: 'Blows itself up into a rubber balloon: projectiles bounce back at their thrower, and whoever touches it is bounced into the air.',
    midair_attack3: 'Blows itself up into a rubber balloon that floats in place: projectiles bounce back, and whoever touches it is bounced up. Once per airtime.',
    attack4: 'Devours two great joints of meat to heal, taking Launch Point off itself. Any hit before the first bite breaks it.',
    attack5: 'Blows into its bones until its fist swells to a giant\'s, then sends it across the stage: a crushing blow that drives a raised Shield back.',
    mash_attack: 'Only in its Mash Combo: a kick swept up through a crescent right in front, launching the opponent upward.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     its quick fists: Jab and Straight, and in the air the
  //                  Gum-Gum Stamp, its basic aerial
  //   Triangle / Y   its everyday flurry: the Gum-Gum Gatling, and in the
  //                  air the Gum-Gum Rocket. Each of its ordinary buttons
  //                  keeps its face button on the ground and in the air
  //   Circle / B     the Gum-Gum Balloon, on the ground and floating in the
  //                  air: blown up all round it, a move with no direction of
  //                  its own, so a face button
  //   R2 / RT        the Gum-Gum Pistol: it throws nothing, but this is the
  //                  move it hits from afar with, a trigger for its reach
  //   L2 / LT        the Feast, its first Special: a deliberate trigger,
  //                  never squeezed by accident
  //   right stick    the Gum-Gum Giant Pistol, its other Special: the giant
  //   forward        fist sent out across the stage the way it faces
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:attack3': pad('east'),
      'ground:attack4': pad('l2'),
      'ground:attack5': flick('forward'),
      'ground:extra_attack': pad('r2'),
      'air:attack1': pad('west'),
      'air:attack2': pad('north'),
      'air:attack3': pad('east'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0008 stands committed to it,
  // then lets go all at once. A hit on #0008 before it lets go breaks it
  // (nothing released), and it needs the ground throughout. Its cooldown
  // begins as it releases (a cast broken before then starts none).
  techniques: {
    // The Feast: five sixths of a second reaching for its food and raising
    // it high (nothing protects it), then as it bites in it has healed
    // itself of 10 Launch Points (never below 0), and eats on for 7/12 s,
    // which any request may cut short (it harms nobody). A hit before the
    // first bite breaks it and heals nothing. Once every 3 seconds.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      heal: 10,
    },
    // The Gum-Gum Giant Pistol: three quarters of a second biting its
    // thumb, blowing into its bones and swinging the swelling fist far back
    // behind it (its longest commitment, and nothing protects it), then the
    // giant fist goes out across the stage: whoever is in front of it, from
    // 16 to 224 units out and from the floor to over its head, takes 10
    // (the exceptional tier) and is flung far away (Base Launch 3
    // sideways); a Shield that blocks it is driven back across the ground
    // (720 units/s). The fist shrinks back and is drawn home for 0.6 s:
    // 1.35 s in all. The policy's 5 s, for its 10, from the release.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      burst: {
        hitbox: { x: 16, y: -80, w: 208, h: 80 },
        hit: {
          damage: 10, baseLaunch: 3, directionalLaunch: 'horizontal',
          hitstun: 0.5, blockstun: 0.2, hitstop: 0.12, blockPush: 720,
        },
      },
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown (the cooldown policy's: none
  // deals 10, heals or paralyzes). Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; Jab and Straight, the Crescent Kick
  // and the Gatling step in by the shared Step-in. Where a move stretches
  // a limb out, the limb is still its body: its hurtboxes take in the limb
  // for the whole move (`hurtboxes`), so a blow or a shot that meets the
  // outstretched arm or legs strikes #0008.
  attacks: {
    // Jab and Straight: the guard (frame 1, a frame), the jab (frame 2, two
    // frames, live: in front of it at the shoulders, out to 64 units), 1,
    // no launch, a stun that holds the target for the next; the guard and
    // the fist drawn back (frames 3-4), the straight (frames 5-6, live), 3,
    // Base Launch 1 sideways. The guard again (frame 7): 0.45 s in all.
    // Once the straight has hit, it opens a follow-up. It keeps all the
    // speed it is thrown at and steps in by the shared Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 1 / FPS_0008.attack1,
      hitbox: { x: 6, y: -58, w: 58, h: 30 },
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0008.attack1, active: 2 / FPS_0008.attack1, damage: 1 },
        { at: 6 / FPS_0008.attack1, active: 2 / FPS_0008.attack1, damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal', hitstun: 0.32 },
      ],
      groundOnly: true,
      hitCancel: 8 / FPS_0008.attack1,
    },
    // The Crescent Kick (mash_attack, its Mash Combo partner: no button
    // performs it, see `mashCombo`): bent low (frame 1), the leg swept up
    // through a crescent in front of it to over its head (frames 2-3,
    // live: from its knees to over its head, out to 52 units), the stance
    // (frame 4): a little over a quarter of a second. 3, Base Launch 2
    // straight up: the finisher of a Mash Combo, its twelfth turn. It
    // leans in by the shared Step-in.
    mash_attack: {
      animation: 'mash_attack',
      startup: 1 / FPS_0008.mash_attack,
      active: 2 / FPS_0008.mash_attack,
      recovery: 1 / FPS_0008.mash_attack,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: 2, y: -100, w: 50, h: 96 },
      hitstun: 0.32,
      blockstun: 0.14,
      hitstop: 1 / 30,
      groundOnly: true,
    },
    // The Gum-Gum Stamp: curled up (frame 1), then both legs stretched
    // straight down below it (frames 2-3, three frames, live: from its
    // hips to 122 units under its feet), the feet snapped home (frame 4): a
    // third of a second. 3, Base Launch 2 downward: it stamps its target
    // down (off the stage, a spike). Its legs are its body all the while:
    // its hurtboxes reach down them. Its drift under the universal air
    // control.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 1 / FPS_0008.midair_attack1,
      active: 3 / FPS_0008.midair_attack1,
      recovery: 1 / FPS_0008.midair_attack1,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'reverseVertical',
      hitbox: { x: -8, y: -10, w: 28, h: 132 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
      hurtboxes: [
        { x: -15, y: -80, w: 30, h: 80 }, // its body
        { x: -8, y: 0, w: 28, h: 122 }, // its stretched legs
      ],
    },
    // The Gum-Gum Gatling: crouched, the fists drawn back (frame 1, a
    // tenth of a second), then the barrage (frames 2-5, twice): five fists,
    // one a frame, live out ahead of it from its knees to its head, out to
    // 110 units, 1 each with no launch, each stun holding the target for
    // the next, then a pause and the last blow (two frames), 3, Base Launch
    // 2 sideways, sending it flying. The fists snapped home (frames 6-7):
    // 0.6 s in all, 8 at the most. Its arms are its body all the while:
    // its hurtboxes reach out along them. Once the last blow has hit, it
    // opens a follow-up. It steps in by the shared Step-in.
    attack2: {
      animation: 'attack2',
      recovery: 2 / FPS_0008.attack2,
      hitbox: { x: 14, y: -80, w: 96, h: 62 },
      hitstun: 0.26,
      blockstun: 0.1,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0008.attack2, active: 1 / FPS_0008.attack2, damage: 1 },
        { at: 3 / FPS_0008.attack2, active: 1 / FPS_0008.attack2, damage: 1 },
        { at: 4 / FPS_0008.attack2, active: 1 / FPS_0008.attack2, damage: 1 },
        { at: 5 / FPS_0008.attack2, active: 1 / FPS_0008.attack2, damage: 1 },
        { at: 6 / FPS_0008.attack2, active: 1 / FPS_0008.attack2, damage: 1 },
        {
          at: 8 / FPS_0008.attack2, active: 2 / FPS_0008.attack2, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal',
          hitstun: 0.4, hitstop: 0.06,
        },
      ],
      hurtboxes: [
        { x: -15, y: -80, w: 30, h: 40 }, // head and torso
        { x: -17, y: -40, w: 34, h: 40 }, // legs
        { x: 14, y: -80, w: 96, h: 62 }, // its stretched arms
      ],
      groundOnly: true,
      hitCancel: 10 / FPS_0008.attack2,
    },
    // The Gum-Gum Rocket: drawn back like a slingshot, it hangs for a
    // moment (frames 1-2, the lock-on), then is flung head first at
    // 1000 units/s for up to 4/15 s at its opponent, if within 260 units
    // and not behind it, re-aimed every step; with nobody there it flies
    // straight ahead (keeping a third of its speed as it ends). Its head
    // and shoulders strike (3, Base Launch 2 sideways) and it springs off
    // what it meets (520 up, 220 back). Tumbling out of it (frame 5). Once
    // per airtime (landing or being hit gives it back). The flight is its
    // own motion (no Step-in); its hang and its recovery are under the
    // universal air control.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 2 / FPS_0008.midair_attack2,
      active: 4 / FPS_0008.midair_attack2,
      recovery: 1 / FPS_0008.midair_attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 0, y: -62, w: 50, h: 62 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
      motion: { type: 'homing', range: 260, speed: 1000, rebound: 520, recoil: 220, exit: 0.3 },
      airUses: 1,
    },
    // The Gum-Gum Balloon: a quarter of a second crouching and breathing
    // in (frames 1-3), then blown up into a balloon (frames 4-6, five
    // frames, live: all round it, from the floor to well over its head, 48
    // units either side): every other fighter's projectile that meets it
    // is bounced back at its thrower, now #0008's, and whoever touches it
    // is bounced straight up: 1 (a bounce, not a blow), Base Launch 2; a
    // Shield that blocks it is shoved away (480 units/s). The air let out
    // (frames 7-9): 0.92 s in all. The balloon is its body: its hurtboxes
    // swell with it. It never steps in (`step: false`): it swells, it does
    // not lunge. Turning projectiles back makes it a defense as well as an
    // attack, so, as the Deflect does, it gives way to any valid request
    // once it has begun (yieldsToRequests in js/game/combat/offense.js): the
    // air can be let out early.
    attack3: {
      animation: 'attack3',
      startup: 3 / FPS_0008.attack3,
      active: 5 / FPS_0008.attack3,
      recovery: 3 / FPS_0008.attack3,
      damage: 1,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: -48, y: -106, w: 96, h: 106 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
      blockPush: 480,
      deflectProjectiles: true,
      hurtboxes: [{ x: -46, y: -104, w: 92, h: 104 }],
      step: false,
      groundOnly: true,
    },
    // The Floating Balloon: the Gum-Gum Balloon in the air (the same clip,
    // timing, box and hit), floating where it is for the whole of it, on
    // half of the drift it had (motion `hover`), under the universal air
    // control. Once per airtime.
    midair_attack3: {
      animation: 'attack3',
      startup: 3 / FPS_0008.attack3,
      active: 5 / FPS_0008.attack3,
      recovery: 3 / FPS_0008.attack3,
      damage: 1,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: -48, y: -106, w: 96, h: 106 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
      blockPush: 480,
      deflectProjectiles: true,
      hurtboxes: [{ x: -46, y: -104, w: 92, h: 104 }],
      motion: { type: 'hover' },
      airMomentum: 0.5,
      airUses: 1,
    },
    // The Gum-Gum Pistol (extra_attack): the arm swung round and stretched
    // far back behind it (frames 1-3, four frames: a little over a quarter
    // of a second to see it coming), then shot forward (frames 4-5, three
    // frames, live: the arm and its fist out in front of it at the chest,
    // from 10 to 96 units out), 5, Base Launch 3 sideways: it sends its
    // target flying; the arm springs
    // back (frame 6): 0.53 s in all, on the ground only. Its arm is its body
    // all the while: its hurtboxes reach out along it. It never leans in
    // (`step: false`): its arm is what travels.
    extra_attack: {
      animation: 'extra_attack',
      startup: 4 / FPS_0008.extra_attack,
      active: 3 / FPS_0008.extra_attack,
      recovery: 1 / FPS_0008.extra_attack,
      damage: 5,
      baseLaunch: 3,
      directionalLaunch: 'horizontal',
      hitbox: { x: 10, y: -52, w: 86, h: 28 },
      hitstun: 0.4,
      blockstun: 0.16,
      hitstop: 0.06,
      hurtboxes: [
        { x: -15, y: -80, w: 30, h: 40 }, // head and torso
        { x: -17, y: -40, w: 34, h: 40 }, // legs
        { x: 10, y: -52, w: 86, h: 28 }, // its stretched arm
      ],
      step: false,
      groundOnly: true,
    },
  },
};
