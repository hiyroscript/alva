// #0009's definition: everything that makes #0009 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0009.md for what each move does in play.
//
// The young monk of the four elements, cut from one supplied sprite sheet
// (see assets/characters/0009/). A boy monk raised among air nomads, the
// one person alive who can bend all four elements: air first and best, then
// water, earth and fire, each learned from a master; and, in mortal danger,
// a glowing trance that gives him the power of every life before his. He
// fights the way his people taught him: he would rather move an opponent
// than hurt one, so most of his moves push, lift, hold or wall off, and his
// wooden staff is his weapon. Every move is one he uses in his canon; he
// heals nobody, summons nothing and conjures nothing his bending cannot
// move. Five numbered attacks, each a button of its own, plus its
// extra_attack:
//
//   attack1  Swift Strikes, a quick jab, then a straight that knocks its
//            target back; in the air the Staff Swing, its staff brought
//            over its head and down through a great arc in front of it
//   attack2  the Fire Kick, fire swept round its feet, then a kick trailing
//            flame; in the air the Rising Air Kick, a leap it rides up on the
//            air (motion `rise`)
//   attack3  the Air Blast, a cone of wind that blows its target away with
//            it before flinging it (`pierce` with `carry`) and blows
//            projectiles back (`repel`); in the air the Air Gust, a quicker
//            puff that pushes and turns shots back, floating as it blows
//            (motion `hover`)
//   attack4  the Freezing Splash, a technique: water drawn up out of the
//            ground, rolled into a ball and thrown, bursting into an icy
//            splash that freezes whoever it soaks (`paralyze`)
//   attack5  the Air Sphere, a technique: the glowing trance, open only in
//            danger (`minLaunchPoint`): it sits in meditation inside a sphere
//            of air that bursts out round it (a burst all round it, 10)
//   extra_attack  the Earth Pillar, a column of rock driven up out of the
//            ground ahead of it: it throws up whoever stands there (`quake`)
//            and, while it stands, stops every shot that meets it (`erase`)
//
// Its Mash Combo (js/data/mash-combo.js) alternates Swift Strikes and the
// Fire Kick, its two close-range strikes.
//
// It is light on the wind in what it shares with every fighter too: a held
// direction bends a launch further than anyone's (`launchReaction`). Its
// Shield is its arms brought up across its body, on the ground. In the air
// the Shield button is its Deflect, its staff twirled over its head into a
// whirl that bats projectiles back. Its Dash is a low lunge, its air dash a
// flat leap, arms first. Its cooldowns are the shared policy's
// (js/data/cooldowns.js), derived from what each move does, never authored
// here: the Freezing Splash waits 3 s (a freeze) and the Air Sphere 5 s (its
// 10), each from its release; every other move none at all, and the Deflect
// none. The Air Blast, the Air Gust and the Earth Pillar each create a
// construct, so each costs the shared 15 Energy. These timers never alter
// their animation phases. The sheet's staff on its own, its vaulting staff
// kick, its jumping uppercut, its low staff sweep and its air blades, the
// air blades of its aerial swing, its tornado, its water spout and its wave,
// its kicked boulder, its stream and pillar of fire, its burning, falls and
// getting up, and its wins and losses are no move.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0009's idle, its fighting stance (its reference
// clip). Its art is 1x (one file pixel per art pixel, cut from one sprite
// sheet with its flat background made transparent), so no pixel grid is
// ever looked for in it (`visual.pixelSize: 1`): each clip's heightRatio,
// its tallest frame over this, is what sizes it, at exactly one art pixel
// per file pixel.
const ART_0009 = 49;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0009 = 88 / 52;

// Playback rates of #0009's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their clips are shown once
// across it.)
const FPS_0009 = Object.freeze({
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
  midair_attack1: 15,
  attack2: 15,
  midair_attack2: 15,
  attack3: 15,
  attack3_object: 20,
  midair_attack3_object: 20,
  attack4_cast: 15,
  attack4_release: 12,
  attack5_cast: 12,
  attack5_release: 12,
  attack5_object: 12,
  extra_attack: 15,
});

// Where its body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file: the middle of its
// trousers, the one colour none of its staff, its fire, its water, its
// wind or the speed lines of its blows shares. Its staff reaches far behind
// it and in front, its fire and its water far ahead and its whirl over its
// head, and the automatic torso anchor would follow them off its body.
const ANCHORS_0009 = Object.freeze({
  idle: [14.5, 15.5, 15.5, 16.5, 17],
  run: [13.5, 19, 19, 12.5, 14, 19.5, 19, 12.5],
  jump: [11.5, 17.5, 17.5],
  fall: [19.5, 19],
  land: [11.5, 16.5, 11.5],
  mouvment: [21, 24],
  midair_mouvment: [34],
  hurt: [19, 16.5, 18.5],
  midair_hurt: [26.5],
  prepshield: [14],
  shielding: [15],
  releaseshield: [14.5],
  deflect: [26.5, 26.5, 13.5, 22.5],
  attack1: [13, 17, 19, 13.5, 18, 21.5],
  midair_attack1: [41, 44.5, 14, 9],
  attack2: [27, 26.5, 23.5, 18.5],
  midair_attack2: [15.5, 15.5, 17.5, 18, 19],
  attack3: [18, 16.5, 16.5, 19, 19.5],
  attack4: [37.5, 37.5, 36.5, 13, 16, 19, 19.5, 19, 19, 18, 19, 19.5, 19.5],
  attack5: [11.5, 13.5, 18.5, 14, 14],
  extra_attack: [14.5, 14.5, 12.5, 15, 18, 21.5, 17.5],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame
// (`height`, art pixels) against the idle, each frame anchored on its body.
const clip = (codename, order, fps, height, extra = {}) => ({
  frames: order.map((n) => framePath('0009', codename, n)),
  fps,
  loop: false,
  heightRatio: height / ART_0009,
  anchorX: order.map((n) => ANCHORS_0009[codename][n - 1]),
  ...extra,
});

// A projectile's or an effect's clip: its files in order, centred, drawn at
// the fighter's art-pixel size whatever their own.
const object = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0009', codename, n)),
  fps,
  loop: false,
  ...extra,
});

// Its fighting stance: side on, fists loose, breathing.
const STANCE_0009 = [1, 2, 3, 4, 5];
// Swift Strikes' art: the guard (file 1, two frames), the jab thrown, speed
// lines streaming off it (2), the jab out (3), the fist drawn back (4), the
// straight thrown in a blur (5), the straight out at full stretch (6, two
// frames), the guard again (1).
const SWIFT_STRIKES_0009 = [1, 1, 2, 3, 4, 5, 6, 6, 1];
// The Fire Kick's: crouched, fire swept round its feet (1, three frames),
// the kick thrown, flame trailing off the foot (2), the leg high, the flame
// curling off it (3, two frames), the stance (4).
const FIRE_KICK_0009 = [1, 1, 1, 2, 3, 3, 4];
// The Staff Swing's: the staff raised behind its head (1, 2), brought over
// and down through a great arc in front of it (3, two frames), the staff
// out ahead (4).
const STAFF_SWING_0009 = [1, 2, 3, 3, 4];
// The Rising Air Kick's: gathered, a fist raised (1), springing up on the
// air (2), the kick swept up through an arc (3), turning over (4), arms
// flung out to come down (5).
const RISING_KICK_0009 = [1, 2, 3, 4, 5];
// The Air Blast's (the Air Gust's too): crouched (1), drawn up (2), arms
// gathered across its chest (3, two frames), both palms pushed out (4), the
// push held (5, two frames).
const AIR_BLAST_0009 = [1, 2, 3, 3, 4, 5, 5];
// The Earth Pillar's: side on (1), turning into it (2), a fist drawn in (3),
// the arm cocked back (4), the palm driven forward in a blur (5), the arm out
// (6), the stance (7).
const EARTH_PILLAR_0009 = [1, 2, 3, 4, 5, 6, 7];

export const CHARACTER_0009 = {
  id: '0009',
  displayName: '#0009',
  available: true,
  rosterSlot: 8,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0009.
  animations: {
    // The fighting stance (see STANCE_0009).
    idle: { ...clip('idle', STANCE_0009, FPS_0009.idle, 49), loop: true },
    // The run: eight frames, leaning into it, arms swinging. Its rate
    // follows the speed, down to 0.6 of it (and up past it on a Dash's
    // run-on).
    run: {
      ...clip('run', [1, 2, 3, 4, 5, 6, 7, 8], FPS_0009.run, 45),
      loop: true,
      minSpeedScale: 0.6,
    },
    // Takeoff, a crouch, then springing up, knees tucked, arms out; at the
    // top turning over, then dropping, a leg reaching down; touching down,
    // a crouch, a deep one, and up again.
    jump: clip('jump', [1, 2, 3], FPS_0009.jump, 48),
    fall: clip('fall', [1, 2], FPS_0009.fall, 46),
    land: clip('land', [1, 2, 3], FPS_0009.land, 41),
    // mouvment, the Dash: a low lunge, then speed lines streaming off it,
    // played once across the whole Dash.
    mouvment: clip('mouvment', [1, 2], FPS_0009.mouvment, 45),
    // midair_mouvment, the air dash: a flat leap forward, arms first, played
    // once across the whole air dash.
    midair_mouvment: clip('midair_mouvment', [1], FPS_0009.midair_mouvment, 44),
    // Hitstun: `hurt` struck, reeling back, a leg thrown up; `midair_hurt`
    // flung away on its back.
    hurt: clip('hurt', [1, 2, 3], FPS_0009.hurt, 47),
    midair_hurt: clip('midair_hurt', [1], FPS_0009.hurt, 34),
    // Its guard, on the ground: squared up (one frame), its arms brought up
    // across its body (one), lowered (one).
    prepshield: clip('prepshield', [1], FPS_0009.shield, 48),
    shielding: clip('shielding', [1], FPS_0009.shield, 43),
    releaseshield: clip('releaseshield', [1], FPS_0009.shield, 46),
    // deflect, its Deflect: in the air, hands raised, its staff twirled over
    // its head into a whirl, four turns of it. (The sheet draws the body and
    // the whirl apart, the whirl to go over the raised hands: each frame is
    // the two laid together, nothing redrawn.)
    deflect: clip('deflect', [1, 2, 3, 4], FPS_0009.deflect, 65),
    // attack1, Swift Strikes (see SWIFT_STRIKES_0009).
    attack1: clip('attack1', SWIFT_STRIKES_0009, FPS_0009.attack1, 48),
    // midair_attack1, the Staff Swing (see STAFF_SWING_0009).
    midair_attack1: clip('midair_attack1', STAFF_SWING_0009, FPS_0009.midair_attack1, 73),
    // attack2, the Fire Kick (see FIRE_KICK_0009).
    attack2: clip('attack2', FIRE_KICK_0009, FPS_0009.attack2, 46),
    // midair_attack2, the Rising Air Kick (see RISING_KICK_0009).
    midair_attack2: clip('midair_attack2', RISING_KICK_0009, FPS_0009.midair_attack2, 55),
    // attack3, the Air Blast (see AIR_BLAST_0009), on the ground and, as the
    // Air Gust, in the air (its mid-air version plays the same clip).
    attack3: clip('attack3', AIR_BLAST_0009, FPS_0009.attack3, 47),
    // attack4, the Freezing Splash (a technique, see `techniques`): the cast
    // is water drawn along the ground and up out of it (1-3), held as a ball
    // before it (4), pushed out (5), the ball thrown (6, 7); the release is
    // the ball bursting into an icy splash in front of it, scattering (8-12),
    // and the stance (13).
    attack4_cast: clip('attack4', [1, 2, 3, 4, 5, 6, 7], FPS_0009.attack4_cast, 49),
    attack4_release: clip('attack4', [8, 9, 10, 11, 12, 13], FPS_0009.attack4_release, 75),
    // attack5, the Air Sphere (a technique, see `techniques`): the cast is
    // the stance (1), a leap (2), landing light (3) and sinking cross-legged
    // into meditation, breathing in and out (4, 5, 4, 5); the release is the
    // meditation held, the sphere of air bursting out round it (4, 5, three
    // times; the sphere is its burst's effect, `effectAnimations`).
    attack5_cast: clip('attack5', [1, 2, 3, 4, 5, 4, 5], FPS_0009.attack5_cast, 48),
    attack5_release: clip('attack5', [4, 5, 4, 5, 4, 5], FPS_0009.attack5_release, 35),
    // extra_attack, the Earth Pillar (see EARTH_PILLAR_0009; the pillar is
    // its projectile).
    extra_attack: clip('extra_attack', EARTH_PILLAR_0009, FPS_0009.extra_attack, 49),
  },

  // Its projectiles' art, each centred where it is: the Air Blast's cone of
  // wind (from a puff to a great cone and back to a puff, the sheet's
  // repeated drawings played again from one file), the Air Gust's streaks
  // of wind scattering into eddies, and the Earth Pillar's column of rock,
  // standing in its rubble. Each faces right and is mirrored with its
  // direction.
  projectileAnimations: {
    attack3_object: object('attack3_object', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 5, 11, 12, 2], FPS_0009.attack3_object, { sourceFacing: 1 }),
    midair_attack3_object: object('midair_attack3_object', [1, 2, 3, 4, 5, 6, 7, 8], FPS_0009.midair_attack3_object, { sourceFacing: 1 }),
    extra_attack_object: object('extra_attack_object', [1], 1, { sourceFacing: 1 }),
  },

  // The Air Sphere's sphere of air, swelling round it (its burst's effect,
  // played once behind the fighters as the burst goes out).
  effectAnimations: {
    attack5_object: object('attack5_object', [1, 2, 3, 4, 5, 6], FPS_0009.attack5_object),
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
    // Its 49-pixel fighting stance at the roster's common art-pixel size,
    // 88/52 world units per art pixel (so every fighter's pixels are the
    // same size on screen): about 83 units, a boy standing side on.
    height: ART_0009 * UNIT_0009,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.2, size: 0.55 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its orange shirt,
    // its yellow trousers, its skin, the blue arrow on its head and the
    // ochre of its trousers' folds.
    eliminationPalette: ['#f87030', '#f0b818', '#efb58c', '#95bfe6', '#a06800'],
  },

  // Its body, measured from its fighting stance: the head and the
  // shoulders, then the legs. Collision is independent of the art.
  collider: { width: 26, height: 80 },
  pushbox: { width: 30 },
  hurtboxes: [
    { x: -15, y: -83, w: 30, h: 43 }, // head and torso
    { x: -17, y: -40, w: 34, h: 40 }, // legs
  ],

  // How #0009 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): 0.15 s more stun per 1000 units/s, 0.5 s
  // more at most, tumbling from 1150 units/s, and, light on the wind as
  // every air nomad is, a held direction bends a launch by up to 30
  // degrees, further than anyone's.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.5,
    tumbleSpeed: 1150,
    steerAngle: 30,
  },

  // Its guard, what the `shield` input does for #0009 on the ground: its
  // arms brought up across its body (see the clips). Its perfect Shield
  // opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    groundReleaseAnimation: 'releaseshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0009 in the air (schema:
  // js/game/combat/deflect.js): its staff twirled over its head, its first
  // frame the startup, live for the next two (all round its body from its
  // feet up into the whirl, 40 units either side, the reach of the spinning
  // staff), the last its recovery. Every Deflect's 3, Base Launch 2, here
  // sideways, the way the staff bats; while the whirl is live it turns the
  // other fighter's projectiles back at their thrower, now #0009's. A little
  // over a quarter of a second in all, keeping the whole of its drift, under
  // the universal air control, never stepping in (a defense:
  // js/data/attack-movement.js); no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0009.deflect,
    active: 2 / FPS_0009.deflect,
    recovery: 1 / FPS_0009.deflect,
    hitbox: { x: -40, y: -112, w: 80, h: 114 },
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
    extra_attack: 'extra_attack', // the Earth Pillar
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // Swift Strikes / the Staff Swing
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Fire Kick / the Rising Air Kick
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Air Blast / the Air Gust
    attack4: { type: 'technique', id: 'attack4' }, // the Freezing Splash
    attack5: { type: 'technique', id: 'attack5' }, // the Air Sphere
  },

  // Its Mash Combo pair (js/data/mash-combo.js): Swift Strikes and the Fire
  // Kick, its two close-range strikes. Mashing either button sets off
  // twelve turns.
  mashCombo: { attacks: ['attack1', 'attack2'] },

  // Its Special abilities (js/data/special-abilities.js): the Freezing
  // Splash, a freeze that holds its target for a follow-up, and the Air
  // Sphere, its glowing trance, a 10-damage burst open only in danger. Its
  // Air Blast and its Earth Pillar are ordinary to the player.
  specialAbilities: ['attack4', 'attack5'],

  // UI only: a frame of each move's own art (zero-based frames): the pillar
  // of rock, the straight, the staff's arc, the flaming kick, the rising
  // kick's arc, the cone of wind, the gust, the icy splash, the meditation.
  mobileAbilities: {
    extra_attack: { label: 'Earth Pillar', preview: { collection: 'projectileAnimations', animation: 'extra_attack_object', frame: 0 } },
    attack1: { label: 'Swift Strikes', preview: { animation: 'attack1', frame: 6 }, previews: { air: { animation: 'midair_attack1', frame: 2 } } },
    attack2: { label: 'Fire Kick', preview: { animation: 'attack2', frame: 3 }, previews: { air: { animation: 'midair_attack2', frame: 2 } } },
    attack3: {
      label: 'Air Blast',
      preview: { collection: 'projectileAnimations', animation: 'attack3_object', frame: 6 },
      previews: { air: { collection: 'projectileAnimations', animation: 'midair_attack3_object', frame: 3 } },
    },
    attack4: { label: 'Freezing Splash', preview: { animation: 'attack4_release', frame: 0 } },
    attack5: { label: 'Air Sphere', preview: { animation: 'attack5_release', frame: 0 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Earth Pillar',
    attack1: 'Swift Strikes',
    midair_attack1: 'Staff Swing',
    attack2: 'Fire Kick',
    midair_attack2: 'Rising Air Kick',
    attack3: 'Air Blast',
    midair_attack3: 'Air Gust',
    attack4: 'Freezing Splash',
    attack5: 'Air Sphere',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0009.<move>.description).
  abilityDescriptions: {
    extra_attack: 'Drives a column of rock up out of the ground ahead: it throws up whoever stands there, and stops every shot that meets it while it stands.',
    attack1: 'A quick jab that holds the opponent, then a straight that knocks them back.',
    midair_attack1: 'Brings its staff over its head and down through a great arc in front of it.',
    attack2: 'Sweeps fire round its feet, then kicks through a trail of flame that sends the opponent flying.',
    midair_attack2: 'Leaps up on the air, kicking through an arc above it that launches the opponent upward. Once per airtime.',
    attack3: 'A cone of wind that blows the opponent away with it before flinging them, and blows projectiles back at their thrower.',
    midair_attack3: 'A quick gust that pushes the opponent away and blows projectiles back, floating in place as it blows. Once per airtime.',
    attack4: 'Draws water up from the ground and throws it: it bursts into an icy splash that freezes whoever it soaks in place.',
    attack5: 'Only in danger, with 30 Launch Point or more: sinks into its glowing trance as a sphere of air bursts out round it, launching everyone near it upward.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     its quick strikes: Swift Strikes, and in the air the
  //                  Staff Swing, its basic aerial
  //   Triangle / Y   the Fire Kick, its other everyday strike, a thumb's roll
  //                  from Square for its Mash Combo
  //   R2 / RT        its wind sent out from afar: the Air Blast, and in the
  //                  air the Air Gust (related moves share an input)
  //   L2 / LT        the Air Sphere, its first Special: a deliberate trigger,
  //                  never squeezed by accident
  //   right stick    the Freezing Splash, its other Special: the water
  //   forward        thrown out the way it faces
  //   right stick    the Earth Pillar, rock rising up out of the ground; in
  //   up             the air the Rising Air Kick, a move that rises
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:attack3': pad('r2'),
      'ground:attack4': flick('forward'),
      'ground:attack5': pad('l2'),
      'ground:extra_attack': flick('up'),
      'air:attack1': pad('west'),
      'air:attack2': flick('up'),
      'air:attack3': pad('r2'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0009 stands committed to it,
  // then lets go all at once. A hit on #0009 before it lets go breaks it
  // (nothing released), and it needs the ground throughout. Its cooldown
  // begins as it releases (a cast broken before then starts none).
  techniques: {
    // The Freezing Splash: seven fifteenths of a second drawing water along
    // the ground and up out of it, rolling it into a ball and throwing it
    // (nothing protects it), then the ball bursts into an icy splash in
    // front of it: whoever it soaks, from 34 to 146 units out and from the
    // floor to well over its head, takes 3 and is frozen where it stands for
    // a second (a paralysis: no launch, held helpless). Half a second more
    // as the splash scatters. The policy's 3 s, for its freeze, from the
    // release.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      burst: {
        hitbox: { x: 34, y: -118, w: 112, h: 118 },
        hit: { damage: 3, paralyze: 1, hitstun: 0.3, blockstun: 0.14, hitstop: 0.08 },
      },
    },
    // The Air Sphere: its glowing trance, which comes over it only in mortal
    // danger: it can start only while #0009's own Launch Point is 30 or more
    // (`minLaunchPoint`; below that a press does nothing). Seven twelfths of
    // a second leaping light and sinking into meditation (nothing protects
    // it), then a sphere of air bursts out round it: whoever is within 64
    // units either side of it, from the floor to well over its head, takes
    // 10 (the exceptional tier) and is thrown straight up (Base Launch 3).
    // Half a second more in meditation as the sphere swells. The policy's
    // 5 s, for its 10, from the release; no Energy.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      minLaunchPoint: 30,
      burst: {
        hitbox: { x: -64, y: -104, w: 128, h: 108 },
        hit: { damage: 10, baseLaunch: 3, directionalLaunch: 'vertical', hitstun: 0.5, blockstun: 0.2, hitstop: 0.12 },
        effect: { animation: 'attack5_object', offset: { x: 0, y: -30 } },
      },
    },
  },

  // Its projectiles (schema: js/game/combat/projectile.js), each named after
  // the attack that releases it.
  projectiles: {
    // The Air Blast's cone of wind: 400 units/s for 0.7 s (280 units), its
    // box round the cone from the knees to the head. It moves whoever it
    // meets more than it hurts them: two gusts 0.14 s apart, 1 each with no
    // launch, each dragging its target along at the wind's own speed
    // (`carry`, a little lift), then a last gust of 3 that flings it (Base
    // Launch 2 sideways): 5 in all. Another fighter's projectile that
    // meets it is blown back at its thrower, now #0009's (`repel`); a
    // Shield that blocks it is shoved back (560 units/s) and stops it there.
    attack3_object: {
      animation: 'attack3_object',
      speed: 400,
      lifetime: 0.7,
      hitbox: { x: -36, y: -28, w: 72, h: 56 },
      damage: 1,
      hitstun: 0.24,
      blockstun: 0.12,
      hitstop: 0.03,
      carry: { lift: 60 },
      pierce: { hits: 3, interval: 0.14 },
      finisher: { damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal', hitstun: 0.4, hitstop: 0.06 },
      repel: true,
      blockPush: 560,
    },
    // The Air Gust's puff of wind: 640 units/s for 0.4 s (256 units), its
    // box round the streaks. 1, no launch: it pushes its target away and a
    // little up at the wind's own speed (`carry`). Another fighter's
    // projectile that meets it is blown back (`repel`); a Shield that blocks
    // it is shoved back (400 units/s).
    midair_attack3_object: {
      animation: 'midair_attack3_object',
      speed: 640,
      lifetime: 0.4,
      hitbox: { x: -30, y: -18, w: 60, h: 36 },
      damage: 1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.03,
      carry: { lift: 220 },
      repel: true,
      blockPush: 400,
    },
    // The Earth Pillar's column of rock: it rises where it is released and
    // stands there (no speed) for 0.75 s, its box the column, 52 units wide
    // and 116 tall, clear of the floor it rises from. Rising out of the
    // ground, it reaches only a fighter standing on it (`quake`): 5, a heavy
    // blow of rock, thrown straight up (Base Launch 2), each fighter once.
    // Rock stops what meets it: another fighter's projectile that meets the
    // column is gone (`erase`). A Shield that blocks it breaks it.
    extra_attack_object: {
      animation: 'extra_attack_object',
      speed: 0,
      lifetime: 0.75,
      hitbox: { x: -26, y: -58, w: 52, h: 116 },
      damage: 5,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitstun: 0.4,
      blockstun: 0.14,
      hitstop: 0.06,
      quake: true,
      erase: true,
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown (the cooldown policy's: none
  // deals 10, heals or paralyzes). Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; Swift Strikes and the Fire Kick step in
  // by the shared Step-in.
  attacks: {
    // Swift Strikes: the guard (frame 1, two frames), the jab (frames 2-3,
    // live from 0.1 s: in front of it at the shoulders, out to 46 units), 1,
    // no launch, a stun that holds the target for the next; the fist drawn
    // back (frame 4), the straight (frames 5-6, live, out to 60 units), 3,
    // Base Launch 1 sideways. The guard again (the last frame): 0.45 s in
    // all. Once the straight has hit, it opens a follow-up. It keeps all the
    // speed it is thrown at and steps in by the shared Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 2 / FPS_0009.attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0009.attack1, active: 2 / FPS_0009.attack1, damage: 1, hitbox: { x: 6, y: -68, w: 40, h: 26 } },
        {
          at: 5 / FPS_0009.attack1, active: 2 / FPS_0009.attack1, damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal',
          hitbox: { x: 8, y: -64, w: 52, h: 26 }, hitstun: 0.32,
        },
      ],
      groundOnly: true,
      hitCancel: 8 / FPS_0009.attack1,
    },
    // The Staff Swing: the staff raised behind its head (frames 1-2, two
    // frames), brought over and down through a great arc in front of it
    // (frame 3, two frames, live: from well over its head down to its
    // waist, out to 96 units), the staff out ahead (frame 4): a third of a
    // second. 3, Base Launch 2 sideways. Its staff is no limb: only its body
    // can be hit. Its drift under the universal air control.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 2 / FPS_0009.midair_attack1,
      active: 2 / FPS_0009.midair_attack1,
      recovery: 1 / FPS_0009.midair_attack1,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 2, y: -122, w: 94, h: 92 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
    },
    // The Fire Kick: crouched, fire swept round its feet (frame 1, three
    // frames, live for the last: low round its feet, 44 units behind it to
    // 26 in front), 1, no launch, a stun that holds the target for the
    // kick; the kick thrown through a trail of flame and the leg high
    // (frames 2-3, three frames, live: in front of it at the waist, out to
    // 62 units), 3, Base Launch 2 sideways. The stance (frame 4): 7/15 s in
    // all. Once the kick has hit, it opens a follow-up. It steps in by the
    // shared Step-in.
    attack2: {
      animation: 'attack2',
      recovery: 1 / FPS_0009.attack2,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0009.attack2, active: 1 / FPS_0009.attack2, damage: 1, hitbox: { x: -44, y: -26, w: 70, h: 26 } },
        {
          at: 3 / FPS_0009.attack2, active: 3 / FPS_0009.attack2, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal',
          hitbox: { x: 6, y: -60, w: 56, h: 34 }, hitstun: 0.38, hitstop: 0.05,
        },
      ],
      groundOnly: true,
      hitCancel: 6 / FPS_0009.attack2,
    },
    // The Rising Air Kick: gathered (frame 1, the hang), then it rides the
    // air up at 460 units/s (frames 2-3, live: all round it from its feet to
    // well over its head, the kick's arc), turning over and coming down
    // (frames 4-5) on gravity: a third of a second. 3, Base Launch 2
    // straight up. Once per airtime (landing or being hit gives it back).
    // The lift is its own motion (no Step-in).
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 1 / FPS_0009.midair_attack2,
      active: 2 / FPS_0009.midair_attack2,
      recovery: 2 / FPS_0009.midair_attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: -12, y: -100, w: 48, h: 96 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
      motion: { type: 'rise', speed: 460 },
      airUses: 1,
    },
    // The Air Blast: crouched, drawn up, arms gathered across its chest
    // (frames 1-3, four fifteenths of a second), then both palms pushed out
    // (frame 4): the cone of wind leaves its palms 46 units in front of it
    // at the chest as it does (its projectile, above); the push held (frame
    // 5, two frames): 0.47 s in all, on the ground. An ordinary shot: 15
    // Energy, no cooldown. A shot never steps in.
    attack3: {
      animation: 'attack3',
      startup: 4 / FPS_0009.attack3,
      active: 1 / FPS_0009.attack3,
      recovery: 2 / FPS_0009.attack3,
      hitbox: null,
      projectile: { id: 'attack3_object', spawnAt: 4 / FPS_0009.attack3, offset: { x: 46, y: -46 } },
      groundOnly: true,
    },
    // The Air Gust: the Air Blast's clip and timing in the air, the puff of
    // wind (its projectile, above) leaving its palms as they push out,
    // floating where it is for the whole of it on half of the drift it had
    // (motion `hover`), under the universal air control. 15 Energy. Once per
    // airtime.
    midair_attack3: {
      animation: 'attack3',
      startup: 4 / FPS_0009.attack3,
      active: 1 / FPS_0009.attack3,
      recovery: 2 / FPS_0009.attack3,
      hitbox: null,
      projectile: { id: 'midair_attack3_object', spawnAt: 4 / FPS_0009.attack3, offset: { x: 40, y: -46 } },
      motion: { type: 'hover' },
      airMomentum: 0.5,
      airUses: 1,
    },
    // The Earth Pillar (extra_attack): turning into it and cocking its arm
    // (frames 1-4, four fifteenths of a second), then the palm driven
    // forward (frame 5): the column of rock rises out of the ground 84 units
    // in front of it as it does (its projectile, above); the arm out and the
    // stance (frames 6-7): 0.47 s in all, on the ground only. An ordinary
    // construct: 15 Energy, no cooldown. It never steps in.
    extra_attack: {
      animation: 'extra_attack',
      startup: 4 / FPS_0009.extra_attack,
      active: 1 / FPS_0009.extra_attack,
      recovery: 2 / FPS_0009.extra_attack,
      hitbox: null,
      projectile: { id: 'extra_attack_object', spawnAt: 4 / FPS_0009.extra_attack, offset: { x: 84, y: -61 } },
      groundOnly: true,
    },
  },
};
