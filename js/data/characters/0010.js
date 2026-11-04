// #0010's definition: everything that makes #0010 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0010.md for what each move does in play.
//
// The traitor in the red spacesuit, cut from one supplied sprite sheet (see
// assets/characters/0010/). One of a spaceship's crew to look at, a small
// figure in a suit and a visor, and secretly the thing hunting them: it
// kills when nobody is looking (and must wait between kills), slips
// through the ship's vents to come out somewhere else, and calls the crew
// to the emergency button when it suits it. Under the suit is no person:
// its head opens on a mouth and a long tongue, and its body can burst into
// tentacles. Its weapons are a knife and a pistol, nothing else. Every move
// is one it uses in its canon; it heals nobody, summons nobody, throws no
// projectile of its own and never homes in on anyone. Five numbered
// attacks, each a button of its own, plus its extra_attack:
//
//   attack1  Punches, a hook and a straight; in the air the Air Kick
//   attack2  the Pistol Whip, its pistol cracked down on its target, then a
//            shot fired point-blank; in the air the Tentacle Sweep, its
//            body bursting into tentacles that sweep a great arc above it
//   attack3  the Tongue Lash, its head split open and its tongue shot out
//            far ahead, reeling in whoever it strikes (`pull`), on the
//            ground and in the air
//   attack4  the Kill, a technique: its knife, out of nowhere. A stab, and
//            the kill itself on a target whose back is turned
//            (`backstab`); then it waits out its kill cooldown (the
//            policy's 5 s, for its 10)
//   attack5  the Emergency Meeting, a technique: it sets the emergency
//            button down and slams it, and everyone near is called to it
//            (`pull`) and held there for the meeting (`paralyze`)
//   extra_attack  the Vent, into a vent at its feet and out of another
//            further along the floor (motion `tunnel`), bursting out at
//            whoever stands there; while it is inside, all of it there is to
//            hit is the vent's hatch
//
// Its Mash Combo (js/data/mash-combo.js) alternates Punches and the Pistol
// Whip, its two close-range strikes.
//
// Its Shield is its fists brought up, on the ground. In the air the Shield
// button is its Deflect, its body rolled over sideways in a spin that bats
// projectiles back. Its Dash is a headlong lunge, its air dash its body
// flung out flat. Its cooldowns are the shared policy's (js/data/cooldowns.js),
// derived from what each move does, never authored here: the Kill waits 5 s
// (the 10 of its backstab) and the Emergency Meeting 3 s (its hold), each
// from its release; every other move none at all, and the Deflect none. No
// move of it costs Energy but the Deflect (it throws nothing of its own, and
// its Specials have their cooldowns). These timers never alter their
// animation phases. The sheet's walk, crouch and its somersault, its taunts,
// wins and losses, its tilts and smashes (the bone swing, the turn, the
// overhead spark, the little figure it throws up off its head, the ground
// spikes, the low spin, the stomp), its knife's other slash, its blaster,
// its dive, its belly's mouth, its egg of tentacles, its grab and throw, its
// falls and getting up, its revival platform, its target-lock taunt and
// sights, its ejection and the rest of the crew are no move.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0010's idle, its standing pose (its reference
// clip: the tallest of its three frames). Its art is 1x (one file pixel per
// art pixel, cut from one sprite sheet with its flat background made
// transparent), so no pixel grid is ever looked for in it
// (`visual.pixelSize: 1`): each clip's heightRatio, its tallest frame over
// this, is what sizes it, at exactly one art pixel per file pixel.
const ART_0010 = 27;

// World units per art pixel: the roster's common art-pixel size. At its own
// true height #0010 is the roster's smallest fighter by far.
const UNIT_0010 = 88 / 52;

// Playback rates of #0010's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their clips are shown once
// across it.)
const FPS_0010 = Object.freeze({
  idle: 5,
  run: 15,
  mouvment: 12,
  midair_mouvment: 12,
  jump: 15,
  fall: 10,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 20,
  attack1: 20,
  midair_attack1: 15,
  attack2: 15,
  midair_attack2: 20,
  attack3: 15,
  attack4_cast: 15,
  attack4_release: 15,
  attack5_cast: 12,
  attack5_release: 12,
  attack5_object: 8,
  extra_attack: 20,
});

// Where its body is in each file of a codename (`anchorX`, art pixels from
// the left of the file's visible art), file by file: the middle of its
// suit, where the automatic anchor would put it on the suit alone. Its
// fists, its pistol and the pistol's trail, its knife and the knife's
// slash, its tongue, the emergency button and the vent are drawn beside or
// round it, and would pull the automatic anchor off it; a frame of the
// vent alone (it is inside) is anchored on the vent's middle.
const ANCHORS_0010 = Object.freeze({
  idle: [11, 11, 10.5],
  run: [12, 11, 11.5, 11],
  jump: [13.5, 10.5, 10.5, 12],
  fall: [10.5, 10.5],
  land: [10.5, 12],
  hurt: [11.5, 13.5],
  midair_hurt: [10.5],
  prepshield: [11],
  shielding: [13],
  releaseshield: [11],
  deflect: [12.5, 15, 15.5, 16, 12.5],
  mouvment: [12, 12.5],
  midair_mouvment: [15.5],
  attack1: [14, 13, 11, 11],
  midair_attack1: [12, 13.5, 10.5, 11],
  attack2: [10.5, 12.5, 15.5, 15.5, 12.5, 11.5],
  midair_attack2: [17, 13, 12.5, 22.5, 24, 19.5, 17],
  attack3: [11, 13.5, 13.5, 16, 15, 11.5],
  attack4: [11.5, 14.5, 14, 23.5, 12.5, 14.5, 12, 11.5, 13.5],
  attack5: [10.5, 12.5, 14, 14, 12.5],
  extra_attack: [12.5, 14.5, 13.5, 15, 18.5, 20, 20, 13, 13, 15.5, 19, 19.5, 19.5],
});

// The height in art pixels of each file of a codename, file by file (what
// sizes a clip: its tallest frame over ART_0010).
const HEIGHTS_0010 = Object.freeze({
  idle: [26, 24, 27],
  run: [26, 26, 27, 26],
  jump: [21, 26, 27, 26],
  fall: [29, 28],
  land: [25, 18],
  hurt: [26, 24],
  midair_hurt: [24],
  prepshield: [27],
  shielding: [24],
  releaseshield: [24],
  deflect: [24, 16, 18, 20, 24],
  mouvment: [28, 26],
  midair_mouvment: [20],
  attack1: [26, 27, 26, 26],
  midair_attack1: [23, 30, 26, 25],
  attack2: [41, 35, 29, 29, 26, 26],
  midair_attack2: [27, 27, 23, 39, 39, 42, 30],
  attack3: [24, 21, 30, 29, 29, 30],
  attack4: [26, 24, 22, 26, 26, 26, 26, 26, 26],
  attack5: [28, 19, 18, 18, 19],
  extra_attack: [19, 28, 26, 18, 18, 18, 18, 5, 18, 28, 18, 19, 19],
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame against
// the idle, each frame anchored on its body.
const clip = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0010', codename, n)),
  fps,
  loop: false,
  heightRatio: Math.max(...order.map((n) => HEIGHTS_0010[codename][n - 1])) / ART_0010,
  anchorX: order.map((n) => ANCHORS_0010[codename][n - 1]),
  ...extra,
});

// A projectile's clip: its files in order, centred, drawn at the fighter's
// art-pixel size whatever their own.
const object = (codename, order, fps, extra = {}) => ({
  frames: order.map((n) => framePath('0010', codename, n)),
  fps,
  loop: false,
  ...extra,
});

// Its standing pose: still, then squashed, still, then stretched, the
// sheet's three stand frames.
const STAND_0010 = [1, 2, 1, 3];
// Its run: the sheet's eight frames, the long stride (file 1) and the
// gathered one (3) each held three frames: 1, 1, 1, 2, 3, 3, 3, 4.
const RUN_0010 = [1, 1, 1, 2, 3, 3, 3, 4];
// Punches' art: the fist drawn back (file 1), the hook thrown, its arm out
// (2, two frames), drawn back again (1), the straight, the fist flying out
// ahead of it (3), held (4, two frames).
const PUNCHES_0010 = [1, 2, 2, 1, 3, 4, 4];
// The Pistol Whip's: the pistol raised overhead (1), cracked down through a
// trail, sparks at its end (2), levelled (3), fired, sparks spat from it
// (4), levelled (3), lowered (5), put away (6).
const PISTOL_0010 = [1, 2, 3, 4, 3, 5, 6];
// The Tentacle Sweep's: legs bursting out of it (1, 2), drawn in (3), a
// great tentacle swept over and round it in a red arc (4), the claws thrown
// up (5), flung out either side, bits of them flying (6), the suit again, a
// last bit falling away (7).
const TENTACLES_0010 = [1, 2, 3, 4, 5, 6, 7];
// The Tongue Lash's: standing (1), hunched (2), the head split open and the
// tongue shot out (3), at full stretch (4, 5), drawn back in (6), hunched
// again (2).
const TONGUE_0010 = [1, 2, 3, 4, 5, 6, 2];
// The Vent's: crouched over a vent opening at its feet (1), springing up
// (2), diving in head first (3); the vent alone, flickering away behind it
// (4, 5) and gone in pieces (6, 7); then, further along the floor, another
// vent's lid (8) and the vent opening (9), it climbing out head first (3),
// springing out, the vent flickering (10), landing crouched (11) as the
// vent falls to pieces (12, 13).
const VENT_0010 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 3, 10, 11, 12, 13];

export const CHARACTER_0010 = {
  id: '0010',
  displayName: '#0010',
  available: true,
  rosterSlot: 9,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: see ANCHORS_0010.
  animations: {
    // Its standing pose (see STAND_0010), breathing slowly.
    idle: { ...clip('idle', STAND_0010, FPS_0010.idle), loop: true },
    // The run (see RUN_0010). Its rate follows the speed, down to 0.6 of it
    // (and up past it on a Dash's run-on).
    run: { ...clip('run', RUN_0010, FPS_0010.run), loop: true, minSpeedScale: 0.6 },
    // Takeoff crouched, then springing up, stretched, legs together, legs
    // flung apart; falling, its legs bent under it; touching down, a
    // crouch, then squatting low, its legs folded under it.
    jump: clip('jump', [1, 2, 3, 4], FPS_0010.jump),
    fall: clip('fall', [1, 2], FPS_0010.fall),
    land: clip('land', [1, 2], FPS_0010.land),
    // mouvment, the Dash: a headlong lunge, then flung forward, played once
    // across the whole Dash.
    mouvment: clip('mouvment', [1, 2], FPS_0010.mouvment),
    // midair_mouvment, the air dash: its body flung out flat, visor first,
    // played once across the whole air dash.
    midair_mouvment: clip('midair_mouvment', [1], FPS_0010.midair_mouvment),
    // Hitstun: `hurt` struck, then doubled over; `midair_hurt` flung over
    // on its back.
    hurt: clip('hurt', [1, 2], FPS_0010.hurt),
    midair_hurt: clip('midair_hurt', [1], FPS_0010.hurt),
    // Its guard, on the ground: braced (one frame), its fists brought up
    // before it (one), settling into a squat as they come down (one).
    prepshield: clip('prepshield', [1], FPS_0010.shield),
    shielding: clip('shielding', [1], FPS_0010.shield),
    releaseshield: clip('releaseshield', [1], FPS_0010.shield),
    // deflect, its Deflect: in the air, curled, then rolled over sideways,
    // back, belly, back, and curled again: one spin of its body.
    deflect: clip('deflect', [1, 2, 3, 4, 5], FPS_0010.deflect),
    // attack1, Punches (see PUNCHES_0010).
    attack1: clip('attack1', PUNCHES_0010, FPS_0010.attack1),
    // midair_attack1, the Air Kick: tucked, both legs kicked out ahead,
    // drawn back, straightened.
    midair_attack1: clip('midair_attack1', [1, 2, 3, 4], FPS_0010.midair_attack1),
    // attack2, the Pistol Whip (see PISTOL_0010).
    attack2: clip('attack2', PISTOL_0010, FPS_0010.attack2),
    // midair_attack2, the Tentacle Sweep (see TENTACLES_0010).
    midair_attack2: clip('midair_attack2', TENTACLES_0010, FPS_0010.midair_attack2),
    // attack3, the Tongue Lash (see TONGUE_0010), on the ground and in the
    // air (its mid-air version plays the same clip).
    attack3: clip('attack3', TONGUE_0010, FPS_0010.attack3),
    // attack4, the Kill (a technique, see `techniques`): the cast is the
    // knife held across it (1), drawn back (2), crouched to spring (3); the
    // release is the spring, the knife's slash swept low round it (4), the
    // thrust, turned away, the knife out at full stretch (5, 6), drawn in
    // (7, 8) and held across it again (9).
    attack4_cast: clip('attack4', [1, 2, 3], FPS_0010.attack4_cast),
    attack4_release: clip('attack4', [4, 5, 6, 7, 8, 9], FPS_0010.attack4_release),
    // attack5, the Emergency Meeting (a technique, see `techniques`): the
    // cast is standing (1), squatting as the emergency button appears
    // before it, small (2), then full size, the squat deeper (3); the
    // release is the button slammed down (4, two frames) and rising again
    // under it (5, two frames).
    attack5_cast: clip('attack5', [1, 2, 3], FPS_0010.attack5_cast),
    attack5_release: clip('attack5', [4, 4, 5, 5], FPS_0010.attack5_release),
    // extra_attack, the Vent (see VENT_0010).
    extra_attack: clip('extra_attack', VENT_0010, FPS_0010.extra_attack),
  },

  // Its projectile's art, centred where it is: the Emergency Meeting's call,
  // the report sign popping up small, then full size, over the button. It
  // faces no way: never mirrored.
  projectileAnimations: {
    attack5_object: object('attack5_object', [1, 2], FPS_0010.attack5_object),
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
    // Its 27-pixel standing pose at the roster's common art-pixel size,
    // 88/52 world units per art pixel (so every fighter's pixels are the
    // same size on screen): about 46 units, a small figure in a suit.
    height: ART_0010 * UNIT_0010,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.4, size: 0.8 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its red suit, the
    // suit's dark shade, its pale blue visor and the visor's deep blue.
    eliminationPalette: ['#c51111', '#8f001d', '#95c9dc', '#4c6fa6'],
  },

  // Its body, measured from its standing pose: the suit and its backpack,
  // from its feet to the top of its head. Collision is independent of the
  // art.
  collider: { width: 28, height: 44 },
  pushbox: { width: 30 },
  hurtboxes: [{ x: -17, y: -45, w: 33, h: 45 }],

  // How #0010 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): 0.15 s more stun per 1000 units/s, 0.5 s
  // more at most, tumbling from 1100 units/s, a held direction bending a
  // launch by up to 15 degrees.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.5,
    tumbleSpeed: 1100,
    steerAngle: 15,
  },

  // Its guard, what the `shield` input does for #0010 on the ground: its
  // fists brought up (see the clips). Its perfect Shield opens for 0.1 s
  // after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    groundReleaseAnimation: 'releaseshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0010 in the air (schema:
  // js/game/combat/deflect.js): its body curled (the startup), then rolled
  // over sideways for three frames (live: all round it, 30 units either
  // side, from its feet to well over its head, the reach of the spin), and
  // curled again (its recovery). Every Deflect's 3, Base Launch 2, here
  // sideways, the way the spin bats; while the spin is live it turns the
  // other fighter's projectiles back at their thrower, now #0010's. A
  // quarter of a second in all, keeping the whole of its drift, under the
  // universal air control, never stepping in (a defense:
  // js/data/attack-movement.js); no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0010.deflect,
    active: 3 / FPS_0010.deflect,
    recovery: 1 / FPS_0010.deflect,
    hitbox: { x: -30, y: -50, w: 60, h: 52 },
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
    extra_attack: 'extra_attack', // the Vent
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // Punches / the Air Kick
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Pistol Whip / the Tentacle Sweep
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // the Tongue Lash, both
    attack4: { type: 'technique', id: 'attack4' }, // the Kill
    attack5: { type: 'technique', id: 'attack5' }, // the Emergency Meeting
  },

  // Its Mash Combo pair (js/data/mash-combo.js): Punches and the Pistol
  // Whip, its two close-range strikes. Mashing either button sets off
  // twelve turns.
  mashCombo: { attacks: ['attack1', 'attack2'] },

  // Its Special abilities (js/data/special-abilities.js): the Kill, worth
  // twice as much on a back turned to it; the Vent, a way under the floor;
  // and the Emergency Meeting, which calls everyone near to it and holds
  // them there. Its Tongue Lash is ordinary to the player.
  specialAbilities: ['attack4', 'extra_attack', 'attack5'],

  // UI only: a frame of each move's own art (zero-based frames): the dive
  // into the vent, the straight's flying fist, the kick, the shot, the
  // tentacles' arc, the tongue at full stretch, the knife's thrust, the
  // meeting's report sign.
  mobileAbilities: {
    extra_attack: { label: 'Vent', preview: { animation: 'extra_attack', frame: 2 } },
    attack1: { label: 'Punches', preview: { animation: 'attack1', frame: 4 }, previews: { air: { animation: 'midair_attack1', frame: 1 } } },
    attack2: { label: 'Pistol Whip', preview: { animation: 'attack2', frame: 3 }, previews: { air: { animation: 'midair_attack2', frame: 3 } } },
    attack3: { label: 'Tongue Lash', preview: { animation: 'attack3', frame: 3 }, previews: { air: { animation: 'attack3', frame: 3 } } },
    attack4: { label: 'Kill', preview: { animation: 'attack4_release', frame: 1 } },
    attack5: { label: 'Emergency Meeting', preview: { collection: 'projectileAnimations', animation: 'attack5_object', frame: 1 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Vent',
    attack1: 'Punches',
    midair_attack1: 'Air Kick',
    attack2: 'Pistol Whip',
    midair_attack2: 'Tentacle Sweep',
    attack3: 'Tongue Lash',
    midair_attack3: 'Tongue Lash',
    attack4: 'Kill',
    attack5: 'Emergency Meeting',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0010.<move>.description).
  abilityDescriptions: {
    extra_attack: 'Dives into a vent at its feet and climbs out of another further along the floor, bursting out at whoever stands there. While it is inside, only the vent can be hit.',
    attack1: 'A hook that holds the opponent, then a straight that knocks them back.',
    midair_attack1: 'Kicks both legs out ahead of it.',
    attack2: 'Cracks its pistol down on the opponent, then fires it point-blank, knocking them away.',
    midair_attack2: 'Its body bursts into tentacles that sweep a great arc over and around it, launching the opponent upward.',
    attack3: 'Its head splits open and its tongue shoots out far ahead, reeling whoever it strikes in to its feet.',
    midair_attack3: 'Its head splits open and its tongue shoots out far ahead, reeling whoever it strikes in.',
    attack4: 'A knife out of nowhere: a stab that knocks the opponent away, and a kill twice as strong on an opponent with its back turned. Then it must wait to kill again.',
    attack5: 'Slams the emergency button down: everyone near is called to it and held there for the meeting.',
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
  //   Triangle / Y   the Pistol Whip, its other everyday strike, a thumb's
  //                  roll from Square for its Mash Combo; in the air the
  //                  Tentacle Sweep (it rises nowhere: never the stick)
  //   R2 / RT        its reach from afar: the Tongue Lash, on the ground and
  //                  in the air (related moves share an input)
  //   L2 / LT        the Kill, its first Special: a deliberate trigger, never
  //                  squeezed by accident
  //   Circle / B     the Emergency Meeting, its other technique: the button
  //                  is set down where it stands, a move with no direction
  //   right stick    the Vent, down into the floor at its feet
  //   down
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:attack3': pad('r2'),
      'ground:attack4': pad('l2'),
      'ground:attack5': pad('east'),
      'ground:extra_attack': flick('down'),
      'air:attack1': pad('west'),
      'air:attack2': pad('north'),
      'air:attack3': pad('r2'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0010 stands committed to it,
  // then lets go all at once. A hit on #0010 before it lets go breaks it
  // (nothing released), and it needs the ground throughout. Its cooldown
  // begins as it releases (a cast broken before then starts none).
  techniques: {
    // The Kill: a fifth of a second with its knife across it, drawing it
    // back and crouching to spring (nothing protects it), then the knife
    // strikes: whoever is in front of it, from its body out to 58 units
    // and from the floor to over its head, takes 5 and is knocked away
    // (Base Launch 2, sideways); one with its back turned to it (see
    // backTurned in js/game/combat/hit-effects.js) takes the kill instead
    // (`backstab`): 10, the exceptional tier, thrown away at Base Launch
    // 3, held longer. Two fifths of a second more as it thrusts and draws
    // the knife back in. The policy's 5 s, for its 10, from the release:
    // its kill cooldown. No Energy.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      burst: {
        hitbox: { x: 4, y: -48, w: 54, h: 48 },
        hit: {
          damage: 5, baseLaunch: 2, directionalLaunch: 'horizontal', hitstun: 0.4, blockstun: 0.16, hitstop: 0.08,
          backstab: { damage: 10, baseLaunch: 3, directionalLaunch: 'horizontal', hitstun: 0.6, hitstop: 0.16 },
        },
      },
    },
    // The Emergency Meeting: a quarter of a second squatting as the
    // emergency button appears before it (nothing protects it), then it
    // slams the button: the call goes up over it (its projectile, below).
    // A third of a second more as the button rises under it. The policy's
    // 3 s, for the meeting's hold, from the release; no Energy.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      projectile: { id: 'attack5_object', offset: { x: 40, y: -42 } },
    },
  },

  // Its projectile (schema: js/game/combat/projectile.js), named after the
  // attack that releases it.
  projectiles: {
    // The Emergency Meeting's call: the report sign over the button, which
    // stays where it went up (no speed) for half a second. Everyone whose
    // middle is within 260 units of it, either side, is called to it
    // (`pull`, 900 units/s, straight there; a raised Shield holds its
    // ground). Whoever reaches it, from the floor to over its head, round the
    // button, takes 1 and is held there for the meeting, 1.2 s (a
    // paralysis: no launch, helpless). It strikes once. A Shield that blocks
    // it ends the meeting there.
    attack5_object: {
      animation: 'attack5_object',
      speed: 0,
      lifetime: 0.5,
      hitbox: { x: -30, y: -28, w: 60, h: 56 },
      damage: 1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 0.05,
      paralyze: 1.2,
      pull: { radius: 260, speed: 900 },
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown (the cooldown policy's: none
  // deals 10, heals or paralyzes). Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; Punches and the Pistol Whip step in by
  // the shared Step-in.
  attacks: {
    // Punches: the fist drawn back (frame 1), the hook (frames 2-3, live
    // from 0.05 s: in front of it at its middle, out to 32 units), 1, no
    // launch, a stun that holds the target for the next; the fist drawn
    // back (frame 4), the straight, the fist flying out ahead of it (frames
    // 5-6, live, out to 38 units), 3, Base Launch 1 sideways; the fist held
    // out (the last frame): 0.35 s in all. Once the straight has hit, it
    // opens a follow-up. It keeps all the speed it is thrown at and steps
    // in by the shared Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 1 / FPS_0010.attack1,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 1 / FPS_0010.attack1, active: 2 / FPS_0010.attack1, damage: 1, hitbox: { x: 6, y: -40, w: 26, h: 22 } },
        {
          at: 4 / FPS_0010.attack1, active: 2 / FPS_0010.attack1, damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal',
          hitbox: { x: 8, y: -40, w: 30, h: 22 }, hitstun: 0.32,
        },
      ],
      groundOnly: true,
      hitCancel: 6 / FPS_0010.attack1,
    },
    // The Air Kick: tucked (frame 1), both legs kicked out ahead (frames
    // 2-3, live: in front of it from its waist down, out to 30 units),
    // straightened (frame 4): a quarter of a second and a little more. 3,
    // Base Launch 2 sideways. Its drift under the universal air control.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 1 / FPS_0010.midair_attack1,
      active: 2 / FPS_0010.midair_attack1,
      recovery: 1 / FPS_0010.midair_attack1,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 2, y: -32, w: 28, h: 32 },
      hitstun: 0.34,
      blockstun: 0.14,
      hitstop: 0.05,
    },
    // The Pistol Whip: the pistol raised overhead (frame 1), cracked down
    // through its trail (frame 2, live: in front of it from over its head
    // to its knees, out to 58 units), 1, no launch, a stun that holds the
    // target for the shot; levelled (frame 3), fired point-blank (frame 4,
    // live: in front of it at its middle, out to 60 units), 3, Base Launch
    // 2 sideways. Levelled, lowered and put away (frames 5-7): 7/15 s in
    // all. Once the shot has hit, it opens a follow-up. It steps in by the
    // shared Step-in. A shot this close is the pistol's own blow: nothing
    // flies out of it.
    attack2: {
      animation: 'attack2',
      recovery: 3 / FPS_0010.attack2,
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 1 / FPS_0010.attack2, active: 1 / FPS_0010.attack2, damage: 1, hitbox: { x: 8, y: -56, w: 50, h: 46 } },
        {
          at: 3 / FPS_0010.attack2, active: 1 / FPS_0010.attack2, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal',
          hitbox: { x: 14, y: -48, w: 46, h: 34 }, hitstun: 0.38, hitstop: 0.05,
        },
      ],
      groundOnly: true,
      hitCancel: 5 / FPS_0010.attack2,
    },
    // The Tentacle Sweep: legs bursting out of it and drawn in (frames 1-3,
    // three twentieths of a second), then a great tentacle swept over and
    // round it, the claws thrown up (frames 4-5, live: all round it, 40
    // units either side, from its feet to well over its head), flung out
    // and gone (frames 6-7): 0.35 s. 3, Base Launch 2 straight up. Its
    // tentacles are no limb it keeps: only its body can be hit. Its drift
    // under the universal air control.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 3 / FPS_0010.midair_attack2,
      active: 2 / FPS_0010.midair_attack2,
      recovery: 2 / FPS_0010.midair_attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: -40, y: -72, w: 82, h: 72 },
      hitstun: 0.36,
      blockstun: 0.14,
      hitstop: 0.05,
    },
    // The Tongue Lash: standing and hunched (frames 1-2, two fifteenths of
    // a second), then the head split open and the tongue shot out (frames
    // 3-5, live for a fifth of a second: in front of it at its middle, out
    // to 70 units), 3, no launch, a stun that holds the target; meanwhile
    // it reels in whoever is within 80 units of its mouth, in front of it
    // (`pull`, 700 units/s, never past it), to its feet; the tongue drawn
    // back in and hunched again (frames 6-7): 7/15 s in all, on the ground.
    // It is the tongue that strikes, never the body: it never lunges.
    attack3: {
      animation: 'attack3',
      startup: 2 / FPS_0010.attack3,
      active: 3 / FPS_0010.attack3,
      recovery: 2 / FPS_0010.attack3,
      damage: 3,
      hitbox: { x: 8, y: -44, w: 62, h: 22 },
      hitstun: 0.45,
      blockstun: 0.12,
      hitstop: 0.05,
      pull: { radius: 80, speed: 700, offset: { x: 16, y: -32 }, front: true },
      step: false,
      groundOnly: true,
    },
    // The Tongue Lash in the air: the same clip, the same tongue and the
    // same reel (an opponent in the air is drawn on both axes), its drift
    // under the universal air control.
    midair_attack3: {
      animation: 'attack3',
      startup: 2 / FPS_0010.attack3,
      active: 3 / FPS_0010.attack3,
      recovery: 2 / FPS_0010.attack3,
      damage: 3,
      hitbox: { x: 8, y: -44, w: 62, h: 22 },
      hitstun: 0.45,
      blockstun: 0.12,
      hitstop: 0.05,
      pull: { radius: 80, speed: 700, offset: { x: 16, y: -32 }, front: true },
    },
    // The Vent (extra_attack): crouched over the vent opening at its feet,
    // springing up and diving in (frames 1-3, three twentieths of a
    // second); from then on it is inside the floor (motion `tunnel`): it
    // passes through fighters, no pull moves it, and the vent's hatch is
    // all of it there is to hit (44 units wide, 30 tall, on the floor). Two
    // tenths of a second later, as the vent behind it falls to pieces, it
    // goes along under the floor, up to 240 units the way it faces (never
    // past where the ground it stands on ends, never into a solid, never
    // into the Void, but under a wall), and another vent opens there
    // (frames 8-9). At 0.45 s it climbs out (frames 10-11, live: all round
    // it, 28 units either side, from the floor to over its head), 3, no
    // launch, a stun that holds whoever it bursts out at; landing crouched
    // as the vent falls to pieces (frames 12-14): 0.7 s in all, on the
    // ground only. It stands where it went in and comes out where it comes
    // out, so it keeps none of the speed it starts with (`momentum: 0`) and
    // never steps in. An ordinary strike: no cooldown, no Energy.
    extra_attack: {
      animation: 'extra_attack',
      startup: 9 / FPS_0010.extra_attack,
      active: 2 / FPS_0010.extra_attack,
      recovery: 3 / FPS_0010.extra_attack,
      damage: 3,
      hitbox: { x: -28, y: -48, w: 56, h: 48 },
      hitstun: 0.35,
      blockstun: 0.12,
      hitstop: 0.05,
      momentum: 0,
      groundOnly: true,
      motion: {
        type: 'tunnel',
        distance: 240,
        hide: 3 / FPS_0010.extra_attack,
        at: 7 / FPS_0010.extra_attack,
        show: 9 / FPS_0010.extra_attack,
        hurtboxes: [{ x: -22, y: -30, w: 44, h: 30 }],
      },
    },
  },
};
