// #0011's definition: everything that makes #0011 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0011.md for what each move does in play.
//
// The young spider in the black and red suit, cut from one supplied sprite
// sheet (see assets/characters/0011/). Bitten by a spider of its own, it
// has a spider's strength and agility, web-shooters at its wrists, and two
// gifts no other spider-hero has: a bioelectric venom it gathers in its
// fists (a sting that stuns stiff whoever it touches, a jolt that throws it
// up into the air) and a camouflage that turns it all but invisible. Every
// move is one it uses in its canon; it heals nobody, summons nobody, throws
// nothing but its own webbing and never homes in on anyone. Five numbered
// attacks, each a button of its own, plus its extra_attack:
//
//   attack1  Punches, a straight and a jab; in the air the Air Kick
//   attack2  the Spin Kick, a roundhouse swept round in a blur; in the air
//            the Somersault Kick, a flip whose kick sweeps a crescent over
//            it, launching up
//   attack3  the Web Shot, a ball of webbing shot from its wrist that sticks
//            whoever it strikes where they stand (`paralyze`); in the air
//            Web Lines, both wrists shot down ahead of it, reeling whoever
//            they catch in (`pull`)
//   attack4  Camouflage, a technique: it fades out of sight (`cloak`), a
//            shimmer on screen and nothing at all to a CPU, until it shows
//            itself by striking or is struck
//   attack5  the Venom Punch, a technique: its fist glowing with
//            bioelectricity, then driven in with a crack of lightning that
//            stuns whoever it reaches (`paralyze`)
//   extra_attack  the Venom Jump, an uppercut crackling with venom that
//            carries it up off the ground (motion `rise`), dragging its
//            target with it (`carry`) before throwing it high; on the
//            ground and, once per airtime, in the air
//
// Its Mash Combo (js/data/mash-combo.js) alternates Punches and the Spin
// Kick, its two close-range strikes.
//
// Its Shield is its forearm brought up before its face, on the ground. In
// the air the Shield button is its Deflect, a flip whose legs sweep a great
// arc that bats projectiles back. Its Dash is a low, spider-like lunge, one
// hand up; its air dash a web line shot ahead that zips it along. Its
// cooldowns are the shared policy's (js/data/cooldowns.js), derived from
// what each move does, never authored here: the Web Shot, Camouflage and the
// Venom Punch wait 3 s each (a hold, a cloak, a hold), from their release;
// every other move none at all, and the Deflect none. No move of it costs
// Energy but the Deflect (the Web Shot, its one projectile, has its 3 s, and
// its Specials have theirs). These timers never alter their animation
// phases. The sheet's crouch and its spider stance, its taunts, intros, wins
// and losses (the hoodie, the mask off, the leap of faith, the comic-book
// panel, the portrait and the heads), its other punches and kicks (the
// backhand, the low swipe, the flips, the low sweep, the rising and the
// upward punches, the flying, diving and drop kicks), its web swinging, the
// web then venom combination and its glowing version, the venom uppercut's
// separate arcs and sparks, its falls and getting up and the rest are no
// move.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0011's idle, its standing pose (its reference
// clip: the tallest of its three frames). Its art is 1x (the sheet is an
// exact 2x enlargement, cut at one file pixel per art pixel with its flat
// background made transparent), so no pixel grid is ever looked for in it
// (`visual.pixelSize: 1`): each clip's heightRatio, its tallest frame over
// this, is what sizes it, at exactly one art pixel per file pixel.
const ART_0011 = 49;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0011 = 88 / 52;

// Playback rates of #0011's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their clips are shown once
// across it.)
const FPS_0011 = Object.freeze({
  idle: 6,
  run: 12,
  mouvment: 12,
  midair_mouvment: 12,
  jump: 12,
  fall: 10,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 20,
  attack1: 20,
  midair_attack1: 15,
  attack2: 15,
  midair_attack2: 15,
  attack3: 12,
  attack3_object: 20,
  midair_attack3: 15,
  attack4_cast: 10,
  attack4_release: 10,
  attack5_cast: 12,
  attack5_release: 12,
  attack5_object: 20,
  extra_attack: 15,
});

// Where its body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file: the middle of its suit
// over its top three fifths, where the automatic anchor would put it on the
// suit alone. Its webbing, its venom's lightning and the blur of a kick or
// a flip are drawn beside or round it and would pull the automatic anchor
// off it; on a frame where a blur still does, the middle of its head and
// chest instead.
const ANCHORS_0011 = Object.freeze({
  idle: [16, 15.5, 15.5],
  run: [25, 28.5, 17.5, 26, 29.5, 18.5],
  jump: [13, 13.5, 17.5],
  fall: [19.5, 18.5],
  land: [13, 15],
  hurt: [13, 11],
  midair_hurt: [22.5],
  shielding: [16],
  deflect: [18.5, 14.5, 19, 19, 21],
  mouvment: [31.5, 28],
  midair_mouvment: [9],
  attack1: [21, 18.5, 27.5, 27.5, 21, 10.5, 17.5, 22.5],
  midair_attack1: [16, 22, 12],
  attack2: [23, 26.5, 22, 22.5, 17],
  midair_attack2: [16.5, 18, 13],
  attack3: [27.5, 29],
  midair_attack3: [20, 19.5, 19.5, 20.5],
  attack4: [15.5, 15.5, 16, 18, 16.5, 15.5],
  attack5: [21.5, 19.5, 24, 26.5, 27],
  extra_attack: [20.5, 14, 16.5, 15.5],
});

// The height in art pixels of each file of a codename, file by file (what
// sizes a clip: its tallest frame over ART_0011).
const HEIGHTS_0011 = Object.freeze({
  idle: [49, 49, 49],
  run: [39, 39, 39, 40, 39, 38],
  jump: [42, 60, 51],
  fall: [44, 44],
  land: [43, 41],
  hurt: [43, 39],
  midair_hurt: [28],
  shielding: [42],
  deflect: [29, 44, 60, 43, 41],
  mouvment: [43, 43],
  midair_mouvment: [37],
  attack1: [43, 45, 40, 40, 44, 45, 41, 40],
  midair_attack1: [45, 41, 39],
  attack2: [36, 35, 47, 40, 39],
  midair_attack2: [50, 53, 43],
  attack3: [43, 43],
  midair_attack3: [35, 31, 32, 39],
  attack4: [29, 29, 29, 29, 29, 29],
  attack5: [43, 45, 40, 40, 39],
  extra_attack: [43, 62, 66, 66],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame against
// the idle, each frame anchored on its body.
const clip = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0011', codename, n)),
  fps,
  loop: false,
  heightRatio: Math.max(...order.map((n) => HEIGHTS_0011[codename][n - 1])) / ART_0011,
  anchorX: order.map((n) => ANCHORS_0011[codename][n - 1]),
  ...extra,
});

// A projectile's or an effect's clip: its files in order, centred, drawn at
// the fighter's art-pixel size whatever their own.
const object = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0011', codename, n)),
  fps,
  loop: false,
  ...extra,
});

// Its standing pose: the sheet's three stand frames, breathing (1, 2, 3, 2).
const STAND_0011 = [1, 2, 3, 2];
// Punches' art: guarded (file 1), the fist drawn back, a blur behind it
// (2), the straight thrown out at full stretch (3, 4), drawn back (5),
// the jab cocked (6), thrown, a blur ahead of it (7), held out (8, two
// frames).
const PUNCHES_0011 = [1, 2, 3, 4, 5, 6, 7, 8, 8];
// The Spin Kick's: crouched, turning (1), spun round low, a blur at its
// feet (2), the roundhouse swept round in a great blur (3), its fist up
// as the leg comes down (4), settled (5).
const SPIN_0011 = [1, 2, 3, 4, 5];
// The Air Kick's: arms flung up (1), the kick swept out ahead in a blur
// (2), the leg out at full stretch (3, two frames).
const AIR_KICK_0011 = [1, 2, 3, 3];
// The Somersault Kick's: gathered (1), flipped over, its kick sweeping a
// red crescent over and round it (2, two frames), straightened (3).
const SOMERSAULT_0011 = [1, 2, 2, 3];
// The Web Shot's: arms flung wide (1), the web shot from its right wrist
// in a red flash (2), arms wide again (1, two frames: the sheet draws the
// same pose).
const WEB_SHOT_0011 = [1, 2, 1, 1];
// Web Lines': spread out flat (1), diving, both hands thrown forward (2),
// the shooters fired down ahead (3), both web lines out (4, two frames).
const WEB_LINES_0011 = [1, 2, 3, 4, 4];
// The Venom Jump's: crouched, its fist glowing (1), springing up, the
// uppercut's lightning arc swept over it (2), rising through the sparks
// (3), still rising, the last sparks over it (4).
const VENOM_JUMP_0011 = [1, 2, 3, 4];

export const CHARACTER_0011 = {
  id: '0011',
  displayName: '#0011',
  available: true,
  rosterSlot: 10,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0011.
  animations: {
    // Its standing pose (see STAND_0011), at ease.
    idle: { ...clip('idle', STAND_0011, FPS_0011.idle), loop: true },
    // The run: the sheet's six frames. Its rate follows the speed, down to
    // 0.6 of it (and up past it on a Dash's run-on).
    run: { ...clip('run', [1, 2, 3, 4, 5, 6], FPS_0011.run), loop: true, minSpeedScale: 0.6 },
    // Takeoff crouched, then springing up stretched, then its arms flung up
    // at the top; falling, arms and legs spread; touching down bent, then
    // straightening.
    jump: clip('jump', [1, 2, 3], FPS_0011.jump),
    fall: clip('fall', [1, 2], FPS_0011.fall),
    land: clip('land', [1, 2], FPS_0011.land),
    // mouvment, the Dash: a low, spider-like lunge, one hand up, its back
    // leg stretched out behind, played once across the whole Dash.
    mouvment: clip('mouvment', [1, 2], FPS_0011.mouvment),
    // midair_mouvment, the air dash: a web line shot out ahead, zipping it
    // along behind it, played once across the whole air dash.
    midair_mouvment: clip('midair_mouvment', [1], FPS_0011.midair_mouvment),
    // Hitstun: `hurt` struck, then doubled over; `midair_hurt` thrown over
    // backward.
    hurt: clip('hurt', [1, 2], FPS_0011.hurt),
    midair_hurt: clip('midair_hurt', [1], FPS_0011.hurt),
    // Its guard, on the ground: its forearm brought up before its face, the
    // one guard pose the sheet draws (no raise or lower poses of their own:
    // the Shield goes up and down at once).
    shielding: clip('shielding', [1], FPS_0011.shield),
    // deflect, its Deflect: in the air, tucked, flipped over, its legs
    // sweeping a great arc round it, the sweep's tail at its feet, and
    // straightened: one flip.
    deflect: clip('deflect', [1, 2, 3, 4, 5], FPS_0011.deflect),
    // attack1, Punches (see PUNCHES_0011).
    attack1: clip('attack1', PUNCHES_0011, FPS_0011.attack1),
    // midair_attack1, the Air Kick (see AIR_KICK_0011).
    midair_attack1: clip('midair_attack1', AIR_KICK_0011, FPS_0011.midair_attack1),
    // attack2, the Spin Kick (see SPIN_0011).
    attack2: clip('attack2', SPIN_0011, FPS_0011.attack2),
    // midair_attack2, the Somersault Kick (see SOMERSAULT_0011).
    midair_attack2: clip('midair_attack2', SOMERSAULT_0011, FPS_0011.midair_attack2),
    // attack3, the Web Shot (see WEB_SHOT_0011).
    attack3: clip('attack3', WEB_SHOT_0011, FPS_0011.attack3),
    // midair_attack3, Web Lines (see WEB_LINES_0011).
    midair_attack3: clip('midair_attack3', WEB_LINES_0011, FPS_0011.midair_attack3),
    // attack4, Camouflage (a technique, see `techniques`): the cast is it
    // crouched (1), its legs fading to an outline (2), then its body up to
    // its shoulders (3); the release is only its head left (4), the outline
    // and a last trace of its head (5), the outline alone (6).
    attack4_cast: clip('attack4', [1, 2, 3], FPS_0011.attack4_cast),
    attack4_release: clip('attack4', [4, 5, 6], FPS_0011.attack4_release),
    // attack5, the Venom Punch (a technique, see `techniques`): the cast is
    // it crouched, its fist glowing with venom (1, two frames), then the
    // fist drawn back, trailing it (2, two frames); the release is the fist
    // driven in with a crack of lightning (3), held out through the sparks
    // (4), drawn back still crackling (5, two frames).
    attack5_cast: clip('attack5', [1, 1, 2, 2], FPS_0011.attack5_cast),
    attack5_release: clip('attack5', [3, 4, 5, 5], FPS_0011.attack5_release),
    // extra_attack, the Venom Jump (see VENOM_JUMP_0011).
    extra_attack: clip('extra_attack', VENOM_JUMP_0011, FPS_0011.extra_attack),
  },

  // Its projectile's art, centred where it is: the Web Shot's ball of
  // webbing, the flash at its wrist (1), the web bursting out (2), balling
  // up (3) and flying, its strand trailing behind it (4, held).
  projectileAnimations: {
    attack3_object: object('attack3_object', [1, 2, 3, 4], FPS_0011.attack3_object),
  },

  // The Venom Punch's lightning as it lets go, centred on its fist: a
  // crackle (1), a thick ring of lightning (2), spreading wide (3),
  // breaking up (4) and gone in sparks (5). It faces no way.
  effectAnimations: {
    attack5_object: object('attack5_object', [1, 2, 3, 4, 5], FPS_0011.attack5_object),
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
    // Its 49-pixel standing pose at the roster's common art-pixel size,
    // 88/52 world units per art pixel (so every fighter's pixels are the
    // same size on screen): about 83 units, a lean teenager in a suit.
    height: ART_0011 * UNIT_0011,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.2, size: 0.55 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its black suit,
    // the suit's deep red and bright red, its venom's yellow and the white
    // of its mask's eyes.
    eliminationPalette: ['#1e1e1e', '#ad111c', '#ec1100', '#ffe600', '#ebebeb'],
  },

  // Its body, measured from its standing pose: the head and the shoulders,
  // then the legs. Collision is independent of the art.
  collider: { width: 26, height: 80 },
  pushbox: { width: 30 },
  hurtboxes: [
    { x: -15, y: -83, w: 30, h: 43 }, // head and torso
    { x: -17, y: -40, w: 34, h: 40 }, // legs
  ],

  // How #0011 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): its spider-sense and a spider's agility get
  // it back into the fight sooner than most, 0.12 s more stun per 1000
  // units/s and 0.4 s more at most, tumbling from 1150 units/s, and a held
  // direction bends a launch by up to 25 degrees.
  launchReaction: {
    stunPerThousand: 0.12,
    maxStun: 0.4,
    tumbleSpeed: 1150,
    steerAngle: 25,
  },

  // Its guard, what the `shield` input does for #0011 on the ground: its
  // forearm brought up before its face (see the clips), with no raise or
  // lower pose. Its perfect Shield opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0011 in the air (schema:
  // js/game/combat/deflect.js): tucked (the startup), then the flip and its
  // legs' great sweep for three frames (live: all round it, 32 units behind
  // it to 52 in front, from its feet to well over its head, the arc the
  // sweep draws), and straightened (its recovery). Every Deflect's 3, Base
  // Launch 2, here sideways, the way the sweep bats; while it is live it
  // turns the other fighter's projectiles back at their thrower, now
  // #0011's. A quarter of a second in all, keeping the whole of its drift,
  // under the universal air control, never stepping in (a defense:
  // js/data/attack-movement.js); no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0011.deflect,
    active: 3 / FPS_0011.deflect,
    recovery: 1 / FPS_0011.deflect,
    hitbox: { x: -32, y: -96, w: 84, h: 98 },
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
    extra_attack: 'extra_attack', // the Venom Jump
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // Punches / the Air Kick
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Spin Kick / the Somersault Kick
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Web Shot / Web Lines
    attack4: { type: 'technique', id: 'attack4' }, // Camouflage
    attack5: { type: 'technique', id: 'attack5' }, // the Venom Punch
  },

  // Its Mash Combo pair (js/data/mash-combo.js): Punches and the Spin
  // Kick, its two close-range strikes. Mashing either button sets off
  // twelve turns.
  mashCombo: { attacks: ['attack1', 'attack2'] },

  // Its Special abilities (js/data/special-abilities.js): Camouflage, out
  // of sight until it strikes; and the Venom Punch, its bioelectric sting
  // that holds whoever it reaches. Its Web Shot holds too, briefly, but is
  // its everyday shot: ordinary to the player.
  specialAbilities: ['attack4', 'attack5'],

  // UI only: a frame of each move's own art (zero-based frames): the Venom
  // Jump's lightning arc, the straight at full stretch, the kick's blur, the
  // roundhouse, the crescent, the web shot from its wrist, the web lines
  // out, its body fading out of sight, the punch's crack of lightning.
  mobileAbilities: {
    extra_attack: { label: 'Venom Jump', preview: { animation: 'extra_attack', frame: 1 } },
    attack1: { label: 'Punches', preview: { animation: 'attack1', frame: 2 }, previews: { air: { animation: 'midair_attack1', frame: 1 } } },
    attack2: { label: 'Spin Kick', preview: { animation: 'attack2', frame: 2 }, previews: { air: { animation: 'midair_attack2', frame: 1 } } },
    attack3: { label: 'Web Shot', preview: { animation: 'attack3', frame: 1 }, previews: { air: { animation: 'midair_attack3', frame: 3 } } },
    attack4: { label: 'Camouflage', preview: { animation: 'attack4_cast', frame: 2 } },
    attack5: { label: 'Venom Punch', preview: { animation: 'attack5_release', frame: 0 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Venom Jump',
    attack1: 'Punches',
    midair_attack1: 'Air Kick',
    attack2: 'Spin Kick',
    midair_attack2: 'Somersault Kick',
    attack3: 'Web Shot',
    midair_attack3: 'Web Lines',
    attack4: 'Camouflage',
    attack5: 'Venom Punch',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0011.<move>.description).
  abilityDescriptions: {
    extra_attack: 'An uppercut crackling with venom that carries it up off the ground, dragging the opponent along, then throws them high. Once per jump in the air.',
    attack1: 'A straight that holds the opponent, then a jab that knocks them back.',
    midair_attack1: 'A kick swept out ahead of it, knocking the opponent away.',
    attack2: 'A spinning roundhouse kick that knocks the opponent away.',
    midair_attack2: 'A flip whose kick sweeps a crescent over and around it, launching the opponent upward.',
    attack3: 'Shoots a ball of webbing that sticks whoever it strikes where they stand for a moment.',
    midair_attack3: 'Shoots both web lines down ahead of it, reeling in whoever they catch.',
    attack4: 'Fades out of sight: barely a shimmer, and the CPU loses track of it, until it strikes or is struck.',
    attack5: 'Gathers venom in its fist and drives it in with a crack of lightning that stuns whoever it reaches.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     its quick strikes: Punches, and in the air the Air
  //                  Kick, its basic aerial
  //   Triangle / Y   the Spin Kick, its other everyday strike, a thumb's
  //                  roll from Square for its Mash Combo; in the air the
  //                  Somersault Kick (it rises nowhere: never the stick)
  //   R2 / RT        its webs, its reach from afar: the Web Shot on the
  //                  ground, Web Lines in the air (related moves share an
  //                  input)
  //   L2 / LT        Camouflage, its first Special: a deliberate trigger,
  //                  never squeezed by accident
  //   Circle / B     the Venom Punch, its other Special: a punch thrown
  //                  where it stands, a move with no direction of its own
  //   right stick    the Venom Jump, rising off the ground, on the ground
  //   up             and in the air
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:attack3': pad('r2'),
      'ground:attack4': pad('l2'),
      'ground:attack5': pad('east'),
      'ground:extra_attack': flick('up'),
      'air:attack1': pad('west'),
      'air:attack2': pad('north'),
      'air:attack3': pad('r2'),
      'air:extra_attack': flick('up'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0011 stands committed to it,
  // then lets go all at once. A hit on #0011 before it lets go breaks it
  // (nothing released), and it needs the ground throughout. Its cooldown
  // begins as it releases (a cast broken before then starts none).
  techniques: {
    // Camouflage: three tenths of a second crouched as its body fades from
    // the feet up (nothing protects it), then it is gone: cloaked for 2.5
    // s (`cloak`, see CombatState.cloakFor). Meanwhile it is drawn as a
    // faint shimmer and a CPU cannot see it at all (it sees it where it
    // vanished, doing nothing), but it can be hit, pushed and pulled
    // exactly as ever. Its first move (an attack, the Deflect, a technique)
    // or any hit that reaches it shows it again at once. Three tenths of a
    // second more as the outline fades, which any move cuts short (it
    // harms nobody, so it gives way). The policy's 3 s, for its cloak, from
    // the release; no Energy.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      cloak: 2.5,
    },
    // The Venom Punch: a third of a second gathering venom in its fist (nothing
    // protects it), then the punch and its lightning: whoever is in front
    // of it, from its body out to 84 units and from the floor to over its
    // head (the ring of lightning round its fist, its art centred there),
    // takes 3 and is stunned stiff for 1.2 s (a paralysis: no launch,
    // helpless). A third of a second more as the fist is drawn back. The
    // policy's 3 s, for its hold, from the release; no Energy.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      burst: {
        hitbox: { x: 4, y: -80, w: 80, h: 80 },
        hit: { damage: 3, paralyze: 1.2, hitstun: 0.3, blockstun: 0.16, hitstop: 0.1 },
        effect: { animation: 'attack5_object', offset: { x: 42, y: -42 } },
      },
    },
  },

  // Its projectile (schema: js/game/combat/projectile.js), named after the
  // attack that throws it.
  projectiles: {
    // The Web Shot's ball of webbing: 760 units/s for 0.55 s (about 420
    // units). Whoever it strikes takes 1 and is stuck where they stand for
    // 0.35 s (a paralysis: no launch, helpless), long enough to close in.
    // The policy's 3 s, for its hold, from the shot.
    attack3_object: {
      animation: 'attack3_object',
      speed: 760,
      lifetime: 0.55,
      hitbox: { x: -12, y: -9, w: 24, h: 18 },
      damage: 1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.05,
      paralyze: 0.35,
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). Only the Web Shot has a cooldown (the cooldown
  // policy's 3 s, for its hold): none of the others deals 10, heals or
  // paralyzes. Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; Punches and the Spin Kick step in by
  // the shared Step-in.
  attacks: {
    // Punches: the fist drawn back (frames 1-2), the straight thrown out
    // (frames 3-4, live from 0.1 s: in front of it at its chest, out to 40
    // units), 1, no launch, a stun that holds the target for the next; the
    // fist drawn back and the jab cocked (frames 5-6), the jab (frames 7-8,
    // live, out to 36 units), 3, Base Launch 1 sideways; held out (the last
    // frame): 0.45 s in all. Once the jab has hit, it opens a follow-up. It
    // keeps all the speed it is thrown at and steps in by the shared
    // Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 1 / FPS_0011.attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0011.attack1, active: 2 / FPS_0011.attack1, damage: 1, hitbox: { x: 8, y: -54, w: 32, h: 18 } },
        {
          at: 6 / FPS_0011.attack1, active: 2 / FPS_0011.attack1, damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal',
          hitbox: { x: 8, y: -58, w: 28, h: 22 }, hitstun: 0.32,
        },
      ],
      groundOnly: true,
      hitCancel: 8 / FPS_0011.attack1,
    },
    // The Air Kick: arms flung up (frame 1), the kick swept out ahead
    // (frames 2-3, live: in front of it from its chest to its feet, out to
    // 54 units), the leg held out (frame 4): a quarter of a second and a
    // little more. 3, Base Launch 2 sideways. Its drift under the universal
    // air control.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 1 / FPS_0011.midair_attack1,
      active: 2 / FPS_0011.midair_attack1,
      recovery: 1 / FPS_0011.midair_attack1,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 6, y: -58, w: 48, h: 50 },
      hitstun: 0.34,
      blockstun: 0.14,
      hitstop: 0.05,
    },
    // The Spin Kick: crouched and spun round low (frames 1-2, two
    // fifteenths of a second), then the roundhouse swept round (frame 3,
    // live: in front of it from its knees to over its head, out to 56
    // units), its fist up and settled (frames 4-5): a third of a second.
    // 3, Base Launch 2 sideways. It steps in by the shared Step-in.
    attack2: {
      animation: 'attack2',
      startup: 2 / FPS_0011.attack2,
      active: 1 / FPS_0011.attack2,
      recovery: 2 / FPS_0011.attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 4, y: -78, w: 52, h: 66 },
      hitstun: 0.34,
      blockstun: 0.14,
      hitstop: 0.05,
      groundOnly: true,
    },
    // The Somersault Kick: gathered (frame 1), then flipped over, its kick
    // sweeping a crescent over and round it (frames 2-3, live: 28 units
    // behind it to 56 in front, from its feet to well over its head),
    // straightened (frame 4): a quarter of a second and a little more. 3,
    // Base Launch 2 straight up. Its drift under the universal air control.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 1 / FPS_0011.midair_attack2,
      active: 2 / FPS_0011.midair_attack2,
      recovery: 1 / FPS_0011.midair_attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: -28, y: -88, w: 84, h: 88 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
    },
    // The Web Shot: arms flung wide (frame 1), then the web shot from its
    // wrist (frame 2): the ball of webbing (its projectile, above) leaves
    // it 46 units in front of it at its chest as it does; arms wide again
    // (frame 3, two frames): a third of a second in all, on the ground. Its
    // hold earns it the policy's 3 s from the shot, and so no Energy. A shot
    // never steps in.
    attack3: {
      animation: 'attack3',
      startup: 1 / FPS_0011.attack3,
      active: 1 / FPS_0011.attack3,
      recovery: 2 / FPS_0011.attack3,
      hitbox: null,
      projectile: { id: 'attack3_object', spawnAt: 1 / FPS_0011.attack3, offset: { x: 46, y: -42 } },
      groundOnly: true,
    },
    // Web Lines: spread out flat and diving, both hands thrown forward
    // (frames 1-2, two fifteenths of a second), then the shooters fired
    // down ahead (frames 3-4, live for a fifth of a second: the lines, from
    // its hands 18 units in front of it down to 66 units out and past its
    // feet), 3, no launch, a stun that holds the target; meanwhile it reels
    // in whoever is within 100 units of its hands, in front of it (`pull`,
    // 700 units/s, never past them); both lines out (frame 5): two fifths
    // of a second in all. It is the webbing that strikes, never the body;
    // its drift under the universal air control.
    midair_attack3: {
      animation: 'midair_attack3',
      startup: 2 / FPS_0011.midair_attack3,
      active: 3 / FPS_0011.midair_attack3,
      recovery: 1 / FPS_0011.midair_attack3,
      damage: 3,
      hitbox: { x: 18, y: -40, w: 48, h: 48 },
      hitstun: 0.45,
      blockstun: 0.12,
      hitstop: 0.05,
      pull: { radius: 100, speed: 700, offset: { x: 24, y: -30 }, front: true },
    },
    // The Venom Jump (extra_attack): crouched, its fist glowing (frame 1, a
    // fifteenth of a second, the hang), then it springs up at 520 units/s
    // (frames 2-3, about 70 units, and on up under gravity) as the
    // uppercut's lightning sweeps over it. Two strikes. The uppercut (frame
    // 2, live: from its feet to well over its head, 10 units behind it to
    // 36 in front): 1, no launch, whoever it catches carried up with it
    // (`carry`, at its own speed). The jolt at the top (frame 3, a little
    // higher): 3, Base Launch 2 straight up, thrown high. Still rising
    // through the last sparks (frame 4): a quarter of a second and a little
    // more, then it falls. On the ground, and once per airtime in the air
    // (landing or being hit gives it back): its way back to the stage. The
    // lift is its own motion (no Step-in).
    extra_attack: {
      animation: 'extra_attack',
      recovery: 1 / FPS_0011.extra_attack,
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      carry: { lift: 0 },
      hits: [
        { at: 1 / FPS_0011.extra_attack, active: 1 / FPS_0011.extra_attack, hitbox: { x: -10, y: -100, w: 46, h: 98 }, damage: 1 },
        {
          at: 2 / FPS_0011.extra_attack, active: 1 / FPS_0011.extra_attack, hitbox: { x: -14, y: -112, w: 50, h: 92 }, carry: null,
          damage: 3, baseLaunch: 2, directionalLaunch: 'vertical', hitstun: 0.4, hitstop: 0.06,
        },
      ],
      motion: { type: 'rise', speed: 520 },
      airUses: 1,
      airMomentum: 0.6,
    },
  },
};
