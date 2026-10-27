// #0006's definition: everything that makes #0006 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0006.md for what each move does in play.
//
// Three small flying sisters with super strength and super speed, cut from
// one supplied sprite sheet (see assets/characters/0006/), who are ONE
// fighter: one body, one hurtbox, one Launch Point, one Energy bar, one
// Shield and one controller, drawn as three members (its `ensemble`,
// js/data/ensemble.js). Each member has her own art, her own place in the
// group and her own powers: pink, the leader, hovering in the middle a
// little above her sisters, with her heat vision and her icy breath; green,
// the toughest, behind her, with her fists and her tornado spin; blue, the
// sweetest, in front, with her flying kicks and her sonic scream.
// Everything that happens to #0006 happens to all three on the same step,
// each in her own art: they idle (floating, each on her own beat), fly
// along the ground (the run), rise and drop (jump, fall), land, Dash and air
// dash, raise a force-field bubble each (the Shield), get hit and are flung
// spinning, together. Movement is the universal one.
//
// Each move names the sister(s) performing it (`members`): she steps to
// the front while the other two drop back behind her. Five numbered
// attacks, each a button of its own, plus its extra_attack:
//
//   attack1  the Power Punch, pink's one-two; in the air the Flying Kick,
//            blue kicking out feet first
//   attack2  the Tornado Spin, green spun into a green tornado that travels
//            on, drawing in whoever is near and sweeping them up (`pull`,
//            `carry`, a roll); in the air the Flying Punch, green
//            throwing her fist forward, heavy, its finisher
//   attack3  Heat Vision, a technique: pink's eyes burn and loose a red beam,
//            the fastest shot in the roster
//   attack4  Ice Breath, a technique: pink breathes a freezing gale that
//            leaves whoever it reaches frozen solid (`paralyze`)
//   attack5  the Sonic Scream, a technique: blue screams a wave of sound
//            that blows whoever it meets away with it (`carry`), turns
//            projectiles back (`repel`) and shoves a raised Shield
//            (`blockPush`)
//   extra_attack  the Triple Strike, all three at once: the sisters lock on
//            and streak at their opponent together, each in a burst of her
//            own colour, striking as one (`homing`); one strike, one move
//
// Its Mash Combo (js/data/mash-combo.js) alternates pink's Power Punch with
// green's Knockout Punch (`mash_attack`), green's fist thrown straight
// ahead on the ground: the Tornado Spin travels and pulls, and every button
// is taken, so this close-range strike has no button of its own and is
// performed only as the series' partner turn (triggered from the Power
// Punch's button). The two sisters take turns at the front, one fighter
// throughout.
//
// Its Shield is three force-field bubbles, one each, on the ground. In the
// air the Shield button is its Deflect, green alone whirling to bat
// projectiles back. Its cooldowns are the shared policy's
// (js/data/cooldowns.js), derived from what each move does, never authored
// here: Ice Breath waits 3 s (a freeze) from its release; every other
// move none at all (Heat Vision and the Sonic Scream, ordinary projectile
// casts, cost 15 Energy each instead), and the Deflect none.
//
// Every power is the sisters' own in their canon: flight, super strength
// and speed, heat vision, an icy breath, a sonic scream, spinning into a
// tornado, force fields, and flying at their foe together. The sheet's
// fireballs, its being caught and shocked, its knockout and its icons are
// no move.

import { memberFramePath, frames, pad, flick } from './helpers.js';

// Height in art pixels of each member's idle (her reference clip). The art
// is 1x (one file pixel per art pixel, cut from one sprite sheet with its
// flat background made transparent), so no pixel grid is ever looked for
// in it (`visual.pixelSize: 1`): each clip's heightRatio, its tallest frame
// over its member's idle, is what sizes it, at exactly one art pixel per
// file pixel.
const IDLE_0006 = Object.freeze({ pink: 43, blue: 30, green: 30 });

// Height in art pixels of the whole group at home (its reference): pink's
// idle, lifted by her home's 14 over her sisters' heads.
const GROUP_0006 = IDLE_0006.pink + 14;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0006 = 88 / 52;

// Playback rates of #0006's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: each member's clip is shown
// once across it.)
const FPS_0006 = Object.freeze({
  idle: 6,
  run: 12,
  jump: 10,
  fall: 10,
  land: 15,
  hurt: 12,
  midair_hurt: 12,
  shield: 15,
  mouvment: 12,
  deflect: 15,
  attack1: 15,
  midair_attack1: 15,
  attack2: 15,
  midair_attack2: 15,
  attack3_cast: 10,
  attack3_release: 5,
  attack3_object: 20,
  attack4_cast: 12,
  attack4_release: 15,
  attack5_cast: 12,
  attack5_release: 10,
  attack5_object: 12,
  extra_attack: 12,
  mash_attack: 15,
});

// Member `member`'s clip of codename `codename`: its files in the order
// `order` plays them (a file shown twice is one file on disk), sized by its
// tallest frame (`height`, art pixels) against her idle.
const clip = (member, codename, order, fps, height, extra = {}) => ({
  frames: order.map((n) => memberFramePath('0006', codename, member, n)),
  fps,
  loop: false,
  heightRatio: height / IDLE_0006[member],
  ...extra,
});

// 1 to n.
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

// The clips every member plays together (js/data/ensemble.js GROUP_CLIPS),
// for member `member`: `order` the files her idle and run play, `h` her
// clips' tallest frames.
const groupClips = (member, order, h) => ({
  // Hovering in place, her hair stirring: a loop.
  idle: clip(member, 'idle', order.idle, FPS_0006.idle, h.idle, { loop: true }),
  // Flying along just over the ground, legs trailing: a loop whose rate
  // follows the speed, down to 0.6 of it.
  run: clip(member, 'run', order.run, FPS_0006.run, h.run, { loop: true, minSpeedScale: 0.6 }),
  // Rising, an arm thrust up; dropping, arms out; touching down, hands
  // together, a knee bent.
  jump: clip(member, 'jump', [1], FPS_0006.jump, h.jump),
  fall: clip(member, 'fall', [1], FPS_0006.fall, h.fall),
  land: clip(member, 'land', [1], FPS_0006.land, h.land),
  // Hit: dazed, eyes squeezed shut; flung: spinning head over heels (a
  // loop, for as long as she is in the air).
  hurt: clip(member, 'hurt', [1], FPS_0006.hurt, h.hurt),
  midair_hurt: clip(member, 'midair_hurt', [1, 2, 3], FPS_0006.midair_hurt, h.midair_hurt, { loop: true }),
  // The Shield: a force-field bubble in her colour forming round her,
  // held, and shrinking away. (The sheet's bubble grows larger still; the
  // held one is its middle size, so the three bubbles cluster rather than
  // bury each other.)
  prepshield: clip(member, 'prepshield', [1], FPS_0006.shield, h.prepshield),
  shielding: clip(member, 'shielding', [1], FPS_0006.shield, h.shielding),
  releaseshield: clip(member, 'releaseshield', [1], FPS_0006.shield, h.releaseshield),
  // The Dash: a lunge into flight, then flat out, fist first; the air
  // dash: flying forward, legs streaming behind.
  mouvment: clip(member, 'mouvment', [1, 2], FPS_0006.mouvment, h.mouvment),
  midair_mouvment: clip(member, 'midair_mouvment', [1], FPS_0006.mouvment, h.midair_mouvment),
});

// Green's Deflect: the arm drawn up (1), the whirl, an arc swept round in
// front of her from her head to her feet (2, held a frame), done (3).
const DEFLECT_0006 = [1, 2, 2, 3];
// The Power Punch's art: guard up (3), the jab (1), the cross (2), guard
// up again (3).
const POWER_PUNCH_0006 = [3, 1, 2, 3];
// The Flying Kick's: drawn up (1), the kick, an afterimage streaming
// behind (2), the foot thrust low (3), drawn up again (1).
const FLYING_KICK_0006 = [1, 2, 3, 1];
// The Tornado Spin's: spinning up, turning round (1-4), the tornado (5-9,
// its sixth turn the fourth's again, 8), slowing to a stop (10).
const TORNADO_0006 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 8, 10];
// The Flying Punch's: drawn back (1, held two frames more), fist first, an
// afterimage behind (2), the punch (3), drawn up (4).
const FLYING_PUNCH_0006 = [1, 1, 1, 2, 3, 4];
// The Knockout Punch's (green's, the Mash Combo partner): drawn back (1),
// fist first with an afterimage behind (2), the punch (3), drawn up (4).
const KNOCKOUT_PUNCH_0006 = [1, 2, 3, 4];
// The Triple Strike's, each sister's own: streaking forward (1, held), wrapped
// in a burst of her colour (2, 3, 2 again), and its ring spreading as she
// strikes (4).
const TRIPLE_STRIKE_0006 = [1, 1, 2, 3, 2, 4];

export const CHARACTER_0006 = {
  id: '0006',
  displayName: '#0006',
  available: true,
  rosterSlot: 5,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // No clips of its own: an ensemble's art is its members' (below).
  animations: {},

  // Its three members, back to front (drawn in this order). Home places
  // are in art pixels from the fighter's origin, facing right: pink in the
  // middle, hovering 14 above the ground; green 19 behind, blue 19 in
  // front, both on it. When a move names some of them, a single performer
  // steps to the origin, the others line up behind it, 18 back and 18
  // apart, idling; and all glide back home after, at 260 art pixels a
  // second. Idle, each floats up to 3 art pixels and down again every 1.4
  // s, a third of a beat apart.
  //
  // Anchors: a burst, an icy gale, a streak or an afterimage reaches far
  // from the body, and the automatic torso anchor would follow it off her,
  // so those clips author their own (`anchorX`, art pixels from the left of
  // each frame's visible art): the middle of her face; and where it reaches
  // below her feet, `anchorY` (art pixels down from the top) says where her
  // feet are.
  ensemble: {
    referenceMember: 'pink',
    retreat: 18,
    spacing: 18,
    glide: 260,
    asideAnimation: 'idle',
    float: { height: 3, period: 1.4 },
    members: [
      {
        id: 'pink',
        home: { x: 0, y: -14 },
        animations: {
          // Her idle shows its first frame again as its sixth (one file).
          ...groupClips('pink',
            { idle: [1, 2, 3, 4, 5, 1, 6], run: range(7) },
            {
              idle: 43, run: 35, jump: 42, fall: 43, land: 42, hurt: 37, midair_hurt: 37,
              prepshield: 42, shielding: 45, releaseshield: 42, mouvment: 31, midair_mouvment: 40,
            }),
          // attack1, the Power Punch (see POWER_PUNCH_0006).
          attack1: clip('pink', 'attack1', POWER_PUNCH_0006, FPS_0006.attack1, 43, { anchorX: [11.5, 15.5, 16.5, 11.5] }),
          // attack3, Heat Vision (a technique): the cast is her eyes shut
          // tight as they heat up (1, 2) and flaring open (3); the release
          // her glare (4) as the beam leaves them.
          attack3_cast: clip('pink', 'attack3', [1, 2, 3], FPS_0006.attack3_cast, 41),
          attack3_release: clip('pink', 'attack3', [4], FPS_0006.attack3_release, 40),
          // attack4, Ice Breath (a technique): the cast is a deep breath in
          // (1), leaning back (2) and the gale starting from her lips (3,
          // 4); the release the freezing gale at full length, an icy cloud
          // where it ends (5-10), then her breath spent (2 again).
          attack4_cast: clip('pink', 'attack4', [1, 2, 3, 4], FPS_0006.attack4_cast, 41, {
            anchorX: [11.5, 17.5, 17.5, 17.5], anchorY: [41, 35, 35, 35],
          }),
          attack4_release: clip('pink', 'attack4', [5, 6, 7, 8, 9, 10, 2], FPS_0006.attack4_release, 38, {
            anchorX: [17.5, 17.5, 17.5, 17.5, 17.5, 17.5, 17.5], anchorY: [35, 35, 35, 35, 35, 35, 35],
          }),
          // extra_attack, her part of the Triple Strike (see
          // TRIPLE_STRIKE_0006): a pink streak, a pink burst.
          extra_attack: clip('pink', 'extra_attack', TRIPLE_STRIKE_0006, FPS_0006.extra_attack, 45, {
            anchorX: [20.5, 20.5, 16.5, 16.5, 16.5, 11.5], anchorY: [43, 43, 41, 41, 41, 42],
          }),
        },
      },
      {
        id: 'green',
        home: { x: -19, y: 0 },
        animations: {
          ...groupClips('green',
            { idle: range(3), run: range(5) },
            {
              idle: 30, run: 29, jump: 36, fall: 30, land: 30, hurt: 29, midair_hurt: 29,
              prepshield: 33, shielding: 42, releaseshield: 29, mouvment: 25, midair_mouvment: 28,
            }),
          // deflect, her Deflect (see DEFLECT_0006).
          deflect: clip('green', 'deflect', DEFLECT_0006, FPS_0006.deflect, 33),
          // attack2, the Tornado Spin (see TORNADO_0006).
          attack2: clip('green', 'attack2', TORNADO_0006, FPS_0006.attack2, 30),
          // mash_attack, the Knockout Punch (see KNOCKOUT_PUNCH_0006): her
          // Flying Punch's fist, thrown on the ground (its files are those
          // frames under this move's own codename).
          mash_attack: clip('green', 'mash_attack', KNOCKOUT_PUNCH_0006, FPS_0006.mash_attack, 30, {
            anchorX: [15.5, 24.5, 17.5, 14.5],
          }),
          // midair_attack2, the Flying Punch (see FLYING_PUNCH_0006).
          midair_attack2: clip('green', 'midair_attack2', FLYING_PUNCH_0006, FPS_0006.midair_attack2, 30, {
            anchorX: [15.5, 15.5, 15.5, 24.5, 17.5, 14.5],
          }),
          // extra_attack, her part of the Triple Strike: a fiery streak, a
          // fiery burst.
          extra_attack: clip('green', 'extra_attack', TRIPLE_STRIKE_0006, FPS_0006.extra_attack, 38, {
            anchorX: [24.5, 24.5, 16.5, 16.5, 16.5, 15.5], anchorY: [28, 28, 31, 31, 31, 38],
          }),
        },
      },
      {
        id: 'blue',
        home: { x: 19, y: 0 },
        animations: {
          ...groupClips('blue',
            { idle: range(3), run: range(6) },
            {
              idle: 30, run: 29, jump: 36, fall: 30, land: 30, hurt: 32, midair_hurt: 32,
              prepshield: 30, shielding: 43, releaseshield: 29, mouvment: 25, midair_mouvment: 28,
            }),
          // midair_attack1, the Flying Kick (see FLYING_KICK_0006).
          midair_attack1: clip('blue', 'midair_attack1', FLYING_KICK_0006, FPS_0006.midair_attack1, 29, {
            anchorX: [17.5, 19.5, 15.5, 17.5],
          }),
          // attack5, the Sonic Scream (a technique): the cast is her eyes
          // squeezed shut (1), opening wide (2), her mouth opening (3) and
          // the first of the yell (4); the release her scream bursting out
          // (5), its first wave leaving her (6), and the scream held (7, 8).
          attack5_cast: clip('blue', 'attack5', [1, 2, 3, 4], FPS_0006.attack5_cast, 29),
          attack5_release: clip('blue', 'attack5', [5, 6, 7, 8], FPS_0006.attack5_release, 43, {
            anchorX: [16.5, 16.5, 16.5, 16.5], anchorY: [36, 36, 30, 30],
          }),
          // extra_attack, her part of the Triple Strike: a blue streak, a
          // blue burst.
          extra_attack: clip('blue', 'extra_attack', TRIPLE_STRIKE_0006, FPS_0006.extra_attack, 38, {
            anchorX: [26.5, 26.5, 19, 19, 19, 18], anchorY: [28, 28, 31, 31, 31, 38],
          }),
        },
      },
    ],
  },

  // Projectile art, normalized at its own size: Heat Vision's beam (the
  // flash at her eyes, the beam's head, the beam), and the Sonic Scream's
  // wave of sound (three arcs, shimmering). Both travel the way they are
  // drawn, right.
  projectileAnimations: {
    attack3_object: { frames: frames('0006', 'attack3_object', 3), fps: FPS_0006.attack3_object, loop: false, sourceFacing: 1 },
    attack5_object: { frames: frames('0006', 'attack5_object', 2), fps: FPS_0006.attack5_object, loop: true, sourceFacing: 1 },
  },

  // A still idle frame (each member's own) for the airborne, landing and
  // hurt clips if their frames fail to load. Attacks, the Shield, the
  // Deflect, the Dash and the air dash never fall back.
  animationFallbacks: {
    jump: { animation: 'idle', frame: 0 },
    fall: { animation: 'idle', frame: 0 },
    land: { animation: 'idle', frame: 0 },
    hurt: { animation: 'idle', frame: 0 },
    midair_hurt: { animation: 'idle', frame: 0 },
  },

  visual: {
    // The group at home, pink hovering over her sisters, 57 art pixels at
    // the roster's common art-pixel size, 88/52 world units per art pixel
    // (every member is drawn at that size, so their pixels match every
    // fighter's): about 96 units. Each of them is small: blue and green
    // about 51 units, pink 73 with her bow.
    height: GROUP_0006 * UNIT_0006,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    // The group's portrait: all three idling at home, cropped round their
    // heads.
    portrait: { animation: 'idle', frame: 0, centerY: 0.4, size: 0.8 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: pink's red bow,
    // blue's golden hair and her blue, green's green, and their skin.
    eliminationPalette: ['#f83737', '#38b0e0', '#2ec22e', '#f8f058', '#f8d8b8'],
  },

  // One body for the three, as big as one fighter's: from the floor to
  // pink's bow, over the middle of the group, where pink hovers between
  // her sisters (green's back and blue's front reach past it, as limbs
  // do). Collision is independent of the art: one collider, one pushbox,
  // one hurtbox. Hit anywhere on it, #0006 takes the one hit, once.
  collider: { width: 32, height: 84 },
  pushbox: { width: 36 },
  hurtboxes: [
    { x: -18, y: -88, w: 36, h: 88 },
  ],

  // How #0006 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): 0.15 s more stun per 1000 units/s, 0.55 s
  // more at most, tumbling from 1100 units/s, and a held direction bends a
  // launch by up to 20 degrees (they fly: a launch is easier to fight).
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.55,
    tumbleSpeed: 1100,
    steerAngle: 20,
  },

  // Energy (see resolveEnergy in js/game/combat/combat-state.js and
  // js/data/energy.js): the same bar and the same price, 15, as every
  // fighter's. Its own is only how fast it refills: 14 a second.
  energy: {
    regen: 14,
  },

  // Its guard, what the `shield` input does for #0006 on the ground: all
  // three raise a force-field bubble at once, one Shield (one protection,
  // one Energy bar, one block for each hit). Its perfect Shield opens for
  // 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    groundReleaseAnimation: 'releaseshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0006 in the air (schema:
  // js/game/combat/deflect.js), performed by green alone (`members`): she
  // steps to the front while pink and blue drop back. Frame 1 her arm
  // drawn up, then the whirl (frame 2, two frames, live: the arc in front
  // of her from over her head to her feet, out to 32 units), then done a
  // frame more. Every Deflect's 3, Base Launch 2, here sideways, the way
  // the arc sweeps; while it is live it turns the other fighter's
  // projectiles back at their thrower, now #0006's. A little over a
  // quarter of a second in all, keeping the whole of its drift, under the
  // universal air control, never stepping in (a defense:
  // js/data/attack-movement.js);
  // no cooldown of its own.
  deflect: {
    animation: 'deflect',
    members: ['green'],
    startup: 1 / FPS_0006.deflect,
    active: 2 / FPS_0006.deflect,
    recovery: 1 / FPS_0006.deflect,
    hitbox: { x: -4, y: -60, w: 36, h: 62 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 and attack2 ordinary attacks with their
  // mid-air versions, attack3 to attack5 techniques (ground only).
  actions: {
    extra_attack: 'extra_attack', // the Triple Strike
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Power Punch / the Flying Kick
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Tornado Spin / the Flying Punch
    attack3: { type: 'technique', id: 'attack3' }, // Heat Vision
    attack4: { type: 'technique', id: 'attack4' }, // Ice Breath
    attack5: { type: 'technique', id: 'attack5' }, // the Sonic Scream
  },

  // Its Mash Combo pair (js/data/mash-combo.js): pink's Power Punch and
  // green's Knockout Punch, fists at arm's length. Mashing the Power
  // Punch's button sets off twelve turns, pink first, green's punch the
  // finisher.
  mashCombo: { attacks: ['attack1', 'mash_attack'] },

  // Its Special ability (js/data/special-abilities.js): Ice Breath, whose
  // gale freezes whoever it reaches solid. Heat Vision, the Sonic Scream
  // and the Triple Strike are ordinary to the player.
  specialAbilities: ['attack4'],

  // UI only: a frame of each move's own art (zero-based frames): the three
  // in their bursts, the jab, the kick, the tornado, the punch, the beam,
  // the gale at full length, the scream bursting out.
  mobileAbilities: {
    extra_attack: { label: 'Triple Strike', preview: { animation: 'extra_attack', frame: 2 } },
    attack1: { label: 'Power Punch', preview: { animation: 'attack1', frame: 1 }, previews: { air: { animation: 'midair_attack1', frame: 1 } } },
    attack2: { label: 'Tornado Spin', preview: { animation: 'attack2', frame: 6 }, previews: { air: { animation: 'midair_attack2', frame: 4 } } },
    attack3: { label: 'Heat Vision', preview: { animation: 'attack3_object', frame: 1, collection: 'projectileAnimations' } },
    attack4: { label: 'Ice Breath', preview: { animation: 'attack4_release', frame: 1 } },
    attack5: { label: 'Sonic Scream', preview: { animation: 'attack5_release', frame: 0 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Triple Strike',
    attack1: 'Power Punch',
    midair_attack1: 'Flying Kick',
    attack2: 'Tornado Spin',
    midair_attack2: 'Flying Punch',
    attack3: 'Heat Vision',
    attack4: 'Ice Breath',
    attack5: 'Sonic Scream',
    mash_attack: 'Knockout Punch',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0006.<move>.description).
  abilityDescriptions: {
    extra_attack: 'All three sisters lock on and streak at the opponent together, striking as one and knocking them away.',
    attack1: 'Pink throws a quick one-two: a jab, then a cross that knocks the opponent back.',
    midair_attack1: 'Blue kicks out feet first: a quick flying kick.',
    attack2: 'Green spins into a tornado that travels on, drawing in whoever is near and sweeping them up into the air.',
    midair_attack2: 'Green throws her fist forward: a heavy punch that sends the opponent flying. Once per airtime.',
    attack3: 'Pink\'s eyes heat up and loose a red beam: the fastest shot of all, reaching far across the stage.',
    attack4: 'Pink breathes a freezing gale: everyone it reaches in front of her is frozen solid for 1.4 s.',
    attack5: 'Blue screams a wave of sound that blows whoever it meets away, turns projectiles back and pushes a Shield back.',
    mash_attack: 'Only in its Mash Combo: green throws her fist straight ahead, a heavy punch that knocks the opponent away.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     its quick strike: the Power Punch, and in the air the
  //                  Flying Kick
  //   Triangle / Y   green's: the Tornado Spin, and in the air the Flying
  //                  Punch
  //   Circle / B     the Triple Strike, on the ground and in the air: all
  //                  three at once, an everyday button a thumb's roll away
  //   R2 / RT        Heat Vision, its ranged move: pull the trigger and the
  //                  beam goes
  //   L2 / LT        Ice Breath, its Special: a trigger never squeezed by
  //                  accident
  //   right stick    the Sonic Scream: a wave of sound sent out the way they
  //   forward        face, the stick pushed the way it goes
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:extra_attack': pad('east'),
      'ground:attack3': pad('r2'),
      'ground:attack4': pad('l2'),
      'ground:attack5': flick('forward'),
      'air:attack1': pad('west'),
      'air:attack2': pad('north'),
      'air:extra_attack': pad('east'),
    },
  },

  // Projectiles, named after the attack that releases them (schema:
  // js/game/combat/projectile.js).
  projectiles: {
    // Heat Vision's beam: from pink's eyes at 1500 units/s for 0.4 s (600
    // units: the fastest shot in the roster, and one of the longest),
    // a thin line at eye height. 3, Base Launch 1 sideways: light, a poke
    // from afar rather than a finisher.
    attack3_object: {
      animation: 'attack3_object',
      speed: 1500,
      lifetime: 0.4,
      hitbox: { x: -30, y: -5, w: 60, h: 10 },
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitstun: 0.28,
      blockstun: 0.12,
      hitstop: 0.04,
    },
    // The Sonic Scream's wave: three arcs of sound as tall as a fighter,
    // rolling out at 650 units/s for 0.65 s (about 420 units), from just
    // over the floor (a shot that meets the floor is gone). It strikes
    // three times, 0.12 s apart, carrying whoever it meets along with it
    // (1 each, `carry`: blown away by the sound), the last flinging them on
    // (3, Base Launch 2 sideways). Another fighter's projectile it meets is
    // turned back (`repel`); a Shield that blocks it is shoved back along
    // the wave (`blockPush`), and the wave stops there.
    attack5_object: {
      animation: 'attack5_object',
      speed: 650,
      lifetime: 0.65,
      hitbox: { x: -26, y: -50, w: 52, h: 100 },
      damage: 1,
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 0.03,
      carry: { lift: 0 },
      pierce: { hits: 3, interval: 0.12 },
      finisher: { damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal', hitstun: 0.36 },
      blockPush: 640,
      repel: true,
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: the sister performing it stands
  // committed to it at the front, then lets go all at once. A hit on #0006
  // before it lets go breaks it (nothing released), and it needs the ground
  // throughout. Its cooldown, if it has one, begins as it releases (a cast
  // broken before then starts none).
  techniques: {
    // Heat Vision: 0.3 s with pink's eyes heating up, then her glare as the
    // beam leaves them (from her eyes, 24 in front of her, 46 up), 0.2 s
    // more. No cooldown: an ordinary projectile, 15 Energy.
    attack3: {
      members: ['pink'],
      castAnimation: 'attack3_cast',
      releaseAnimation: 'attack3_release',
      projectile: { id: 'attack3_object', offset: { x: 24, y: -46 } },
    },
    // Ice Breath: a third of a second drawing breath and leaning back, the
    // gale starting from her lips; then the freezing gale at full length
    // for 0.47 s. Everyone in front of pink, from the ground to over her
    // head, out to 108 units where the icy cloud forms, takes 3 and is
    // frozen solid for 1.4 s (`paralyze`): held in place, helpless, until
    // the ice gives or a hit launches it. A raised Shield blocks it, the
    // gale pressing on it for 0.3 s. The policy's 3 s, for the freeze.
    attack4: {
      members: ['pink'],
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      burst: {
        hitbox: { x: 12, y: -56, w: 96, h: 58 },
        hit: { damage: 3, paralyze: 1.4, hitstun: 0.3, blockstun: 0.3, hitstop: 0.06 },
      },
    },
    // The Sonic Scream: a third of a second as blue screws up her face and
    // opens her mouth, then her scream bursts out and its wave leaves her
    // (from her mouth, 44 in front of her; its middle 56 up, so the wave
    // clears the floor), 0.4 s more. No cooldown: an ordinary projectile,
    // 15 Energy.
    attack5: {
      members: ['blue'],
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      projectile: { id: 'attack5_object', offset: { x: 44, y: -56 } },
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js), each naming the sister(s) performing it.
  // Phases are whole frames of each clip, and every hitbox is measured from
  // her art at the front of the group, where she stands for it (the
  // fighter's origin; facing right, mirrored with facing). None has a
  // cooldown (the cooldown policy's: none deals 10, paralyzes, floats or
  // frightens). Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, its aerials
  // under the universal air control; the Power Punch steps in
  // by the shared Step-in, the tornado rolls and the strike dashes by
  // themselves (no Step-in added), and the aerials never step in.
  attacks: {
    // The Power Punch, pink alone: guard up (frame 1), the jab (frame 2,
    // live: 1, no launch, a stun that holds its target for the next), the
    // cross (frame 3, live: 3, Base Launch 1 sideways), guard up again:
    // 0.27 s in all, at chest height out to 40 units. It keeps the speed it
    // is thrown at and steps in once for the pair; a hit opens a follow-up
    // from the cross on.
    attack1: {
      animation: 'attack1',
      members: ['pink'],
      recovery: 1 / FPS_0006.attack1,
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      hits: [
        { at: 1 / FPS_0006.attack1, active: 1 / FPS_0006.attack1, hitbox: { x: 8, y: -48, w: 32, h: 30 }, damage: 1 },
        {
          at: 2 / FPS_0006.attack1, active: 1 / FPS_0006.attack1, hitbox: { x: 8, y: -46, w: 28, h: 30 },
          damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal',
        },
      ],
      groundOnly: true,
      hitCancel: 3 / FPS_0006.attack1,
    },
    // The Flying Kick, blue alone: drawn up (frame 1), then the kick, feet
    // first with an afterimage streaming behind, and the foot thrust low
    // (frames 2-3, live: from her head to her feet, out to 38 units), drawn
    // up again: 0.27 s, carried on by her drift. 3, Base Launch 1 sideways.
    // Under the universal air control; a hit opens a follow-up.
    midair_attack1: {
      animation: 'midair_attack1',
      members: ['blue'],
      startup: 1 / FPS_0006.midair_attack1,
      active: 2 / FPS_0006.midair_attack1,
      recovery: 1 / FPS_0006.midair_attack1,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: { x: 6, y: -44, w: 32, h: 44 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      hitCancel: 3 / FPS_0006.midair_attack1,
    },
    // The Tornado Spin, green alone: spinning up and turning round (frames
    // 1-4, a good quarter of a second to see it coming), then the tornado
    // (frames 5-10) rolls on the way she faces at 240 units/s plus half the
    // running speed she had (up to 700), slowing by 280 a second. While it
    // spins it draws in every opponent within 120 units of it (`pull`),
    // and its first four strikes (1 each, frames 5-8) carry whoever it
    // catches along inside it (`carry`); the fifth (frame 10) sweeps them
    // up into the air (3, Base Launch 2 upward). Then she slows to a stop
    // (frame 11): 0.73 s in all. A Shield stops it dead, bouncing her back.
    // Never steered, but it rolls on by itself (its own motion: no Step-in).
    attack2: {
      animation: 'attack2',
      members: ['green'],
      recovery: 1 / FPS_0006.attack2,
      hitbox: { x: -28, y: -54, w: 56, h: 56 },
      hitstun: 0.26,
      blockstun: 0.1,
      hitstop: 0.02,
      carry: { lift: 0 },
      hits: [
        { at: 4 / FPS_0006.attack2, active: 1 / FPS_0006.attack2, damage: 1 },
        { at: 5 / FPS_0006.attack2, active: 1 / FPS_0006.attack2, damage: 1 },
        { at: 6 / FPS_0006.attack2, active: 1 / FPS_0006.attack2, damage: 1 },
        { at: 7 / FPS_0006.attack2, active: 1 / FPS_0006.attack2, damage: 1 },
        {
          at: 9 / FPS_0006.attack2, active: 1 / FPS_0006.attack2, carry: null,
          damage: 3, baseLaunch: 2, directionalLaunch: 'vertical', hitstun: 0.4, hitstop: 0.07,
        },
      ],
      pull: { radius: 120, speed: 600, offset: { x: 10, y: -30 } },
      motion: { type: 'roll', speed: 240, keep: 0.5, maxSpeed: 700, friction: 280, recoil: 220 },
      groundOnly: true,
      passThrough: true,
    },
    // The Knockout Punch (mash_attack, the Mash Combo partner: no button
    // performs it, see `mashCombo`), green alone: drawn back (frame 1), then
    // fist first and the punch (frames 2-3, live: at chest height out to 36
    // units), drawn up (frame 4): 0.27 s. 3, Base Launch 2 sideways: the
    // finisher of a Mash Combo set off from the Power Punch. Her fist is her
    // body: she leans in by the shared Step-in.
    mash_attack: {
      animation: 'mash_attack',
      members: ['green'],
      startup: 1 / FPS_0006.mash_attack,
      active: 2 / FPS_0006.mash_attack,
      recovery: 1 / FPS_0006.mash_attack,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 6, y: -48, w: 30, h: 34 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      groundOnly: true,
    },
    // The Flying Punch, green alone: drawn back (frames 1-3, 0.2 s: time to
    // see it coming), then fist first, an afterimage behind her, the punch
    // (frames 4-5, live: at chest height out to 34 units), drawn up (frame
    // 6): 0.4 s. 5, Base Launch 3 sideways: the
    // big blow of the toughest sister, sending its target flying, the
    // fighter's finisher. Once per airtime. It keeps its drift, under the
    // universal air control.
    midair_attack2: {
      animation: 'midair_attack2',
      members: ['green'],
      startup: 3 / FPS_0006.midair_attack2,
      active: 2 / FPS_0006.midair_attack2,
      recovery: 1 / FPS_0006.midair_attack2,
      damage: 5,
      baseLaunch: 3,
      directionalLaunch: 'horizontal',
      hitbox: { x: 6, y: -46, w: 30, h: 32 },
      hitstun: 0.4,
      blockstun: 0.16,
      hitstop: 0.07,
      airUses: 1,
    },
    // The Triple Strike (extra_attack), all three together, each in her own
    // art: streaking forward (frames 1-2, the lock-on: a sixth of a second
    // hanging still), then each wrapped in a burst of her own colour they
    // dash at the opponent at 1000 units/s (frames 3-5, 0.25 s), if it is
    // within 220 units and not behind them, else straight ahead; the ring
    // of each burst spreading as they strike (frame 6): half a second in
    // all. One strike, the group's front from the ground to over blue's and
    // green's heads, out to 50 units: 5, Base Launch 2 sideways, whoever it
    // meets knocked away, and the sisters spring back off it. One move: one hit, however
    // many sisters it is drawn with. On the ground and once per airtime.
    // Its dash is its own (no Step-in added); in the air its hang and its
    // recovery are under the universal air control.
    extra_attack: {
      animation: 'extra_attack',
      members: ['pink', 'green', 'blue'],
      startup: 2 / FPS_0006.extra_attack,
      active: 3 / FPS_0006.extra_attack,
      recovery: 1 / FPS_0006.extra_attack,
      damage: 5,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 0, y: -64, w: 50, h: 64 },
      hitstun: 0.38,
      blockstun: 0.15,
      hitstop: 0.07,
      airUses: 1,
      motion: { type: 'homing', range: 220, speed: 1000, rebound: 380, recoil: 160, exit: 0.3 },
      airMomentum: 0.6,
    },
  },
};
