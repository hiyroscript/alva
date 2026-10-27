// #0007's definition: everything that makes #0007 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0007.md for what each move does in play.
//
// The street soldier, cut from one supplied sprite sheet (see
// assets/characters/0007/). A fighter of the streets who fights two ways,
// half and half: with its fists and feet, always up close, and with the
// weapons it carries, every one of them as it uses it in its canon: a
// pistol, a molotov cocktail, a sawn-off in each hand and a rocket
// launcher, each fired standing on the ground (it never fires a weapon in
// mid-air, and a heavy weapon roots it while it aims it). Five numbered
// attacks, each a button of its own, plus its extra_attack:
//
//   attack1  the Street Combo, a jab, a cross and a hook in one string that
//            holds its target to the last (melee); in the air the Flying
//            Kick, a kick thrown out feet first (melee)
//   attack2  the Uppercut, a rising fist that throws its target straight up
//            for a chase into the air (melee); in the air the Hammer Fist,
//            both fists swung down through a wide arc, driving whatever
//            they meet downward (melee)
//   attack3  the Molotov Cocktail, a technique (a weapon): a lit bottle
//            thrown ahead that bursts into flames where it lands, a fire
//            that keeps burning whoever stays in it (a stationary piercing
//            projectile)
//   attack4  the Sawn-Offs, a technique (a weapon): a sawn-off in each
//            hand, fired out to both sides at once, blasting into the air
//            whoever is either side of it (a burst round it)
//   attack5  the Rocket Launcher, a technique (a weapon): heaved onto the
//            shoulder and aimed (a long, punishable commitment), then a
//            rocket that strikes for 10, flings its target far away and
//            drives a raised Shield back
//   extra_attack  the Pistol (a weapon): a quick shot, the bullet crossing
//            most of the stage in a blink
//
// Four melee moves and four weapons: every ordinary attack is a fist or a
// foot (each strikes no further than an arm's or a leg's length), every
// weapon is fired on the ground. Its Shield is a boxer's high guard, fists
// raised before its face, on the ground. In the air the Shield button is
// its Deflect, a two-fisted swat down in front of it that turns
// projectiles back. Its Dash is a combat roll, its air dash a flat dive.
// Its cooldowns are the shared policy's (js/data/cooldowns.js), derived
// from what each move does, never authored here: the Rocket Launcher waits
// 5 s (its rocket deals 10) from its release; every other move none at
// all (the Pistol, the Molotov Cocktail and the Sawn-Offs, ordinary
// constructs, cost 15 Energy each instead), and the Deflect none. These
// timers never alter their animation phases. The sheet's intro, its
// standing stance, its wins and losses, its other guns (the sniper rifle,
// the submachine gun, the assault rifle), its katana and shovel, its
// aerial rocket launcher (in its canon a heavy weapon is never fired off
// the ground), its motorcycle and train, and its spare poses are no move.

import { framePath, pad, flick } from './helpers.js';

// Height in art pixels of #0007's idle, its standing stance (its reference
// clip). Its art is 1x (one file pixel per art pixel, cut from one sprite
// sheet with its flat background made transparent), so no pixel grid is
// ever looked for in it (`visual.pixelSize: 1`): each clip's heightRatio,
// its tallest frame over this, is what sizes it, at exactly one art pixel
// per file pixel.
const ART_0007 = 55;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0007 = 88 / 52;

// Playback rates of #0007's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their clips are shown once
// across it.)
const FPS_0007 = Object.freeze({
  idle: 8,
  run: 12,
  mouvment: 12,
  midair_mouvment: 12,
  jump: 10,
  fall: 10,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 15,
  attack1: 20,
  midair_attack1: 15,
  attack2: 15,
  midair_attack2: 15,
  attack3_cast: 12,
  attack3_release: 12,
  attack3_object: 12,
  attack4_cast: 12,
  attack4_release: 20,
  attack5_cast: 4,
  attack5_release: 6,
  extra_attack: 15,
  extra_attack_object: 20,
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame
// (`height`, art pixels) against the idle.
const clip = (codename, order, fps, height, extra = {}) => ({
  frames: order.map((n) => framePath('0007', codename, n)),
  fps,
  loop: false,
  heightRatio: height / ART_0007,
  ...extra,
});

// The Street Combo's art: the guard (file 1, held a frame), the jab, speed
// lines streaming off it (2), the cross at full stretch (3, 4), the fists
// drawn back to the face (5), the hook (6), the guard again (7).
const STREET_COMBO_0007 = [1, 1, 2, 3, 4, 5, 6, 7];
// The Uppercut's: crouched, the fist low (1, held three frames), the fist
// driven up past the face in a rising arc (2), the fist high (3, held).
const UPPERCUT_0007 = [1, 1, 1, 2, 3, 3];
// The Flying Kick's: tucked (1), the leg thrown out (2, held), tucked
// again (1).
const FLYING_KICK_0007 = [1, 2, 2, 1];
// The Hammer Fist's: the arms flung up (1), a knee raised, the fists high
// (2, held), the fists swung down through a wide arc (3), the arc low in
// front (4), tucked (5).
const HAMMER_FIST_0007 = [1, 2, 2, 3, 4, 5];
// The standing stance's: the eyes open (1, held 2.75 s), then one quick
// blink, half shut (2), shut (3), half shut (2). The three drawings differ
// only in the eyes, so played straight through they blink without end.
const STANCE_0007 = [...Array(22).fill(1), 2, 3, 2];
// The Pistol's: aimed (1, held a frame), fired (2), the recoil kicking the
// gun up (3), aimed again (1).
const PISTOL_0007 = [1, 1, 2, 3, 1];

export const CHARACTER_0007 = {
  id: '0007',
  displayName: '#0007',
  available: true,
  rosterSlot: 6,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: its fists, its legs, its swings' arcs and its guns' blasts
  // reach far from its body, and the automatic torso anchor would follow
  // them off it, so every clip authors its own (`anchorX`, art pixels from
  // the left of each frame's visible art): the middle of its white vest,
  // the one colour none of its trails, blasts or weapons shares, over the upper
  // part of the body (the combat roll, a ball, its own middle). Where the
  // Deflect's arc sweeps below its feet, the clip also says where the feet
  // are (`anchorY`, art pixels down from the top).
  animations: {
    // The standing stance: upright, arms loose at its sides, blinking now
    // and then (see STANCE_0007).
    idle: { ...clip('idle', STANCE_0007, FPS_0007.idle, 55, { anchorX: STANCE_0007.map(() => 16.5) }), loop: true },
    // The run: six frames, arms pumping. Its rate follows the speed, down
    // to 0.6 of it (and up past it on a Dash's run-on).
    run: {
      ...clip('run', [1, 2, 3, 4, 5, 6], FPS_0007.run, 49, { anchorX: [20.5, 21, 26, 21, 20, 25.5] }),
      loop: true,
      minSpeedScale: 0.6,
    },
    // Takeoff, a crouch, then rising, a knee up; falling, a leg tucked;
    // touching down, the crouch again.
    jump: clip('jump', [1, 2], FPS_0007.jump, 51, { anchorX: [18.5, 19] }),
    fall: clip('fall', [1], FPS_0007.fall, 51, { anchorX: [14.5] }),
    land: clip('land', [1], FPS_0007.land, 41, { anchorX: [18.5] }),
    // mouvment, the Dash: the combat roll, curled into a ball and rolled
    // over once, played once across the whole Dash.
    mouvment: clip('mouvment', [1, 2, 3, 4], FPS_0007.mouvment, 34, { anchorX: [17, 16.5, 17, 16.5] }),
    // midair_mouvment, the air dash: the dive, launched head first and
    // stretched out flat, played once across the whole air dash.
    midair_mouvment: clip('midair_mouvment', [1, 2], FPS_0007.midair_mouvment, 47, { anchorX: [29, 33.5] }),
    // Hitstun: `hurt` reels back, the head knocked aside; `midair_hurt` is
    // flung off its feet, flat on its back in the air.
    hurt: clip('hurt', [1, 2], FPS_0007.hurt, 48, { anchorX: [15, 15] }),
    midair_hurt: clip('midair_hurt', [1], FPS_0007.hurt, 44, { anchorX: [18.5] }),
    // Its guard, on the ground: the fists raised before its face, held
    // tight, then lowered to a fighting pose.
    prepshield: clip('prepshield', [1], FPS_0007.shield, 42, { anchorX: [24.5] }),
    shielding: clip('shielding', [1], FPS_0007.shield, 43, { anchorX: [17] }),
    releaseshield: clip('releaseshield', [1], FPS_0007.shield, 45, { anchorX: [17.5] }),
    // deflect, its Deflect: 1 airborne, the fists drawn back, 2 both fists
    // swung down in front of it in a wide arc from over its head to under
    // its feet, 3 the arc low, 4 the fists low.
    deflect: clip('deflect', [1, 2, 3, 4], FPS_0007.deflect, 67, {
      anchorX: [14.5, 16.5, 16.5, 16.5], anchorY: [47, 63, 38, 39],
    }),
    // attack1, the Street Combo (see STREET_COMBO_0007).
    attack1: clip('attack1', STREET_COMBO_0007, FPS_0007.attack1, 45, {
      anchorX: [22, 22, 24.5, 31, 32, 21, 25.5, 23.5],
    }),
    // midair_attack1, the Flying Kick (see FLYING_KICK_0007).
    midair_attack1: clip('midair_attack1', FLYING_KICK_0007, FPS_0007.midair_attack1, 49, {
      anchorX: [15.5, 12.5, 12.5, 15.5],
    }),
    // attack2, the Uppercut (see UPPERCUT_0007).
    attack2: clip('attack2', UPPERCUT_0007, FPS_0007.attack2, 61, { anchorX: [17.5, 17.5, 17.5, 20, 19, 19] }),
    // midair_attack2, the Hammer Fist (see HAMMER_FIST_0007).
    midair_attack2: clip('midair_attack2', HAMMER_FIST_0007, FPS_0007.midair_attack2, 55, {
      anchorX: [20.5, 20.5, 20.5, 18, 20.5, 20.5],
    }),
    // attack3, the Molotov Cocktail (a technique, see `techniques`): the
    // cast is the lit bottle raised (1), then swung over in a wide arc and
    // let go (2); the release is the follow-through (3) and the recovery
    // (4).
    attack3_cast: clip('attack3', [1, 2], FPS_0007.attack3_cast, 51, { anchorX: [17.5, 24] }),
    attack3_release: clip('attack3', [3, 4], FPS_0007.attack3_release, 43, { anchorX: [23.5, 22.5] }),
    // attack4, the Sawn-Offs (a technique, see `techniques`): the cast is
    // the stance (1), a sawn-off drawn in each hand (2) and both aimed out
    // low to either side (3); the release is the blasts either side,
    // swelling (4-6), smoking (7), fading to rings (8-10), and the stance
    // again (11).
    attack4_cast: clip('attack4', [1, 2, 3], FPS_0007.attack4_cast, 37, { anchorX: [25.5, 24, 27] }),
    attack4_release: clip('attack4', [4, 5, 6, 7, 8, 9, 10, 11], FPS_0007.attack4_release, 39, {
      anchorX: [29, 34.5, 41.5, 42.5, 43, 43, 42.5, 25.5],
    }),
    // attack5, the Rocket Launcher (a technique, see `techniques`): the cast
    // is the launcher hanging at its side (1), then heaved onto its shoulder
    // and aimed (2, held); the release is the rocket gone, the launcher
    // still on its shoulder (2).
    attack5_cast: clip('attack5', [1, 2, 2], FPS_0007.attack5_cast, 55, { anchorX: [24, 16.5, 16.5] }),
    attack5_release: clip('attack5', [2, 2], FPS_0007.attack5_release, 55, { anchorX: [16.5, 16.5] }),
    // extra_attack, the Pistol (see PISTOL_0007).
    extra_attack: clip('extra_attack', PISTOL_0007, FPS_0007.extra_attack, 60, { anchorX: [15, 15, 17, 17, 15] }),
  },

  // Projectile art, normalized at its own size, never fitted to its height:
  // the Pistol's shot (its muzzle flash, then the bullet streaking on), the
  // Molotov Cocktail's fire (the bottle bursting, the flames swelling into
  // a fireball and rolling up into smoke: direction-neutral, never
  // mirrored) and the Rocket Launcher's rocket (nose first, flame behind).
  projectileAnimations: {
    extra_attack_object: {
      frames: [framePath('0007', 'extra_attack_object', 1), framePath('0007', 'extra_attack_object', 2)],
      fps: FPS_0007.extra_attack_object,
      loop: false,
      sourceFacing: 1,
    },
    attack3_object: {
      frames: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => framePath('0007', 'attack3_object', n)),
      fps: FPS_0007.attack3_object,
      loop: false,
      sourceFacing: 0,
    },
    attack5_object: {
      frames: [framePath('0007', 'attack5_object', 1)],
      fps: 1,
      loop: false,
      sourceFacing: 1,
    },
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
    // Its 55-pixel standing stance at the roster's common art-pixel size,
    // 88/52 world units per art pixel (so every fighter's pixels are the
    // same size on screen): about 93 units, standing upright.
    height: ART_0007 * UNIT_0007,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.2, size: 0.5 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its white vest,
    // the blue of its jeans and their shade, its skin and its hair.
    eliminationPalette: ['#f3f2f4', '#4d81a9', '#31526a', '#9e4b01', '#150b00'],
  },

  // Its body, measured from its standing stance: the head and the
  // shoulders, then the legs. Collision is independent of the art.
  collider: { width: 28, height: 90 },
  pushbox: { width: 32 },
  hurtboxes: [
    { x: -16, y: -94, w: 32, h: 47 }, // head and torso
    { x: -18, y: -47, w: 36, h: 47 }, // legs
  ],

  // How #0007 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): 0.15 s more stun per 1000 units/s, 0.5 s
  // more at most, tumbling from 1150 units/s, and a held direction bends a
  // launch by up to 20 degrees.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.5,
    tumbleSpeed: 1150,
    steerAngle: 20,
  },

  // Energy (see resolveEnergy in js/game/combat/combat-state.js and
  // js/data/energy.js): the same bar and the same price as every
  // fighter's (100; 15 for a Dash, an air dash or a Dash cancel, a Deflect,
  // each blocked hit, and each ordinary move that creates a construct: its
  // Pistol, its Molotov Cocktail, its Sawn-Offs). Its own is only how fast
  // it refills: 14 a second, as most of the roster.
  energy: {
    regen: 14,
  },

  // Its guard, what the `shield` input does for #0007 on the ground: a
  // boxer's high guard, the fists raised before its face (one frame), held
  // tight (one), lowered (one). Its perfect Shield opens for 0.1 s after
  // 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    groundReleaseAnimation: 'releaseshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0007 in the air (schema:
  // js/game/combat/deflect.js): frame 1 the fists drawn back, then the swat
  // (frames 2-3, live: the front of the body from over the head to under
  // the feet, out to 60 units, the arc the fists sweep), then the fists low
  // a frame more. Every Deflect's 3, Base Launch 2, here straight down, the
  // way the fists swat; while the arc is live it turns the other fighter's
  // projectiles back at their thrower, now #0007's. A little over a quarter
  // of a second in all, keeping the whole of its drift, under the universal
  // air control, never stepping in (a defense: js/data/attack-movement.js);
  // no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0007.deflect,
    active: 2 / FPS_0007.deflect,
    recovery: 1 / FPS_0007.deflect,
    hitbox: { x: -4, y: -104, w: 64, h: 108 },
    directionalLaunch: 'reverseVertical',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 and attack2 ordinary attacks with their
  // mid-air versions (its melee), attack3 to attack5 techniques (its
  // weapons: ground only, as all its weapons are).
  actions: {
    extra_attack: 'extra_attack', // the Pistol
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Street Combo / the Flying Kick
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Uppercut / the Hammer Fist
    attack3: { type: 'technique', id: 'attack3' }, // the Molotov Cocktail
    attack4: { type: 'technique', id: 'attack4' }, // the Sawn-Offs
    attack5: { type: 'technique', id: 'attack5' }, // the Rocket Launcher
  },

  // Its Mash Combo pair (js/data/mash-combo.js): the Street Combo and the
  // Uppercut, its fists: never a weapon (the Pistol, the Molotov Cocktail or
  // its other weapon techniques). Mashing either button sets off twelve turns.
  mashCombo: { attacks: ['attack1', 'attack2'] },

  // Its Special abilities (js/data/special-abilities.js): the Rocket
  // Launcher, its heaviest weapon, a 10-damage rocket that can end a stock
  // from across the stage. The Molotov Cocktail's fire and the Sawn-Offs'
  // blasts either side are ordinary to the player.
  specialAbilities: ['attack5'],

  // UI only: a frame of each move's own art (zero-based frames): the bullet
  // leaving the gun, the cross at full stretch, the kick, the fist rising,
  // the fists' arc, the molotov's fireball, the blasts either side, the
  // launcher on its shoulder.
  mobileAbilities: {
    extra_attack: { label: 'Pistol', preview: { animation: 'extra_attack', frame: 2 } },
    attack1: { label: 'Street Combo', preview: { animation: 'attack1', frame: 3 }, previews: { air: { animation: 'midair_attack1', frame: 1 } } },
    attack2: { label: 'Uppercut', preview: { animation: 'attack2', frame: 3 }, previews: { air: { animation: 'midair_attack2', frame: 3 } } },
    attack3: { label: 'Molotov Cocktail', preview: { collection: 'projectileAnimations', animation: 'attack3_object', frame: 4 } },
    attack4: { label: 'Sawn-Offs', preview: { animation: 'attack4_release', frame: 2 } },
    attack5: { label: 'Rocket Launcher', preview: { animation: 'attack5_release', frame: 0 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Pistol',
    attack1: 'Street Combo',
    midair_attack1: 'Flying Kick',
    attack2: 'Uppercut',
    midair_attack2: 'Hammer Fist',
    attack3: 'Molotov Cocktail',
    attack4: 'Sawn-Offs',
    attack5: 'Rocket Launcher',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0007.<move>.description).
  abilityDescriptions: {
    extra_attack: 'A quick pistol shot: the bullet crosses most of the stage in a blink.',
    attack1: 'A jab, a cross and a hook in one string that holds the opponent to the last blow, which knocks them back.',
    midair_attack1: 'A flying kick thrown out feet first that knocks the opponent away.',
    attack2: 'A rising uppercut that throws the opponent straight up, ready to be chased into the air.',
    midair_attack2: 'Both fists swung down through a wide arc, driving the opponent downward.',
    attack3: 'Throws a lit bottle that bursts into flames ahead: the fire keeps burning whoever stays in it, then throws them up.',
    attack4: 'Fires a sawn-off to each side at once, blasting whoever is in front or behind into the air.',
    attack5: 'Heaves a rocket launcher onto the shoulder and fires: a heavy rocket that flings the opponent far away and drives a raised Shield back.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // every move on one input of its own, no combination anywhere, chosen
  // for what each move does rather than its attack number. The universal
  // actions keep everyone's inputs (the left stick, Jump on Cross / A, Dash
  // on R1 / RB, L1 / LB for the Shield and the Deflect, Options / Menu to
  // pause).
  //
  //   Square / X     its quick fists and feet: the Street Combo, and in the
  //                  air the Flying Kick, its basic aerial
  //   Triangle / Y   its heavy blows: the Uppercut, and in the air the
  //                  Hammer Fist. Fists and feet on the same two face
  //                  buttons on the ground and in the air
  //   Circle / B     the Sawn-Offs: blasts to both sides at once, a move with
  //                  no direction of its own, so a face button
  //   R2 / RT        the Pistol: its ranged move, a trigger for a gun
  //   L2 / LT        the Rocket Launcher, its Special: the heaviest weapon,
  //                  on a trigger never squeezed by accident
  //   right stick    the Molotov Cocktail: the bottle thrown out the way it
  //   forward        faces, to burst into flames ahead of it
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:attack3': flick('forward'),
      'ground:attack4': pad('east'),
      'ground:attack5': pad('l2'),
      'ground:extra_attack': pad('r2'),
      'air:attack1': pad('west'),
      'air:attack2': pad('north'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0007 stands committed to it,
  // then lets go all at once. A hit on #0007 before it lets go breaks it
  // (nothing released), and it needs the ground throughout: all its
  // weapons are fired standing. Its cooldown begins as it releases (a cast
  // broken before then starts none).
  techniques: {
    // The Molotov Cocktail: a sixth of a second raising the lit bottle and
    // swinging it over (ordinary-attack pace: it is no Special), then as it
    // follows through it bursts into flames 150 units ahead of it (its
    // fire, below) and it is free a sixth of a second later. It never lands
    // at its feet: whoever is right up against it is not caught. An
    // ordinary cast that releases a projectile: 15 Energy, no cooldown.
    attack3: {
      castAnimation: 'attack3_cast',
      releaseAnimation: 'attack3_release',
      projectile: { id: 'attack3_object', offset: { x: 150, y: -42 } },
    },
    // The Sawn-Offs: a quarter of a second drawing a sawn-off in each hand
    // and aiming both out low, then both fire at once: whoever is either
    // side of it, out to 66 units in front or behind, from the hips down
    // to the feet, takes 5 (the heavy tier) and is blasted straight up
    // (Base Launch 2), the blasts swelling and fading to smoke for 0.4 s as
    // it holds the pose. A raised Shield blocks it like any attack. An
    // ordinary cast that releases a burst: 15 Energy, no cooldown.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      burst: {
        hitbox: { x: -66, y: -56, w: 132, h: 56 },
        hit: { damage: 5, baseLaunch: 2, directionalLaunch: 'vertical', hitstun: 0.42, blockstun: 0.16, hitstop: 0.08 },
      },
    },
    // The Rocket Launcher: three quarters of a second heaving the launcher
    // onto its shoulder and aiming it (its longest commitment, and nothing
    // protects it: a heavy weapon roots it), then the rocket is gone (its
    // flight, below) and it holds the launcher a third of a second more:
    // 1.08 s in all. The policy's 5 s, for its 10.
    attack5: {
      castAnimation: 'attack5_cast',
      releaseAnimation: 'attack5_release',
      projectile: { id: 'attack5_object', offset: { x: 46, y: -74 } },
    },
  },

  // Projectiles (schema: js/game/combat/projectile.js).
  projectiles: {
    // The Pistol's bullet: 1400 units/s for 0.4 s (560 units), its box
    // round the bullet from the shoulders to the chest of a short opponent.
    // 3 at Base Launch 1 sideways. A Shield blocks it (and stops it there).
    extra_attack_object: {
      animation: 'extra_attack_object',
      speed: 1400,
      lifetime: 0.4,
      hitbox: { x: -16, y: -10, w: 32, h: 20 },
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitstun: 0.28,
      blockstun: 0.12,
      hitstop: 0.04,
    },
    // The Molotov Cocktail's fire: it burns where it bursts (no speed) for
    // 0.75 s, the length of its clip. Whoever stays in it is burned four
    // times 0.15 s apart, 1 each with no launch, a stun just longer than
    // the gap so the flames keep their hold, the fourth a finisher of 3
    // that throws them up (Base Launch 2): 6 in all. Leave it, or jump it,
    // and the burning stops. A Shield puts it out at the first strike it
    // blocks; a Deflect turns it against #0007.
    attack3_object: {
      animation: 'attack3_object',
      speed: 0,
      lifetime: 0.75,
      // The flames, about 80 units across, from the floor to over a
      // fighter's chest, clear of the floor where they burst.
      hitbox: { x: -40, y: -38, w: 80, h: 76 },
      damage: 1,
      hitstun: 0.24,
      blockstun: 0.12,
      hitstop: 0.03,
      pierce: { hits: 4, interval: 0.15 },
      finisher: { damage: 3, baseLaunch: 2, directionalLaunch: 'vertical', hitstun: 0.4, hitstop: 0.06 },
    },
    // The Rocket Launcher's rocket: 700 units/s for 1.1 s (770 units), its
    // box round the rocket, low enough to meet the shortest opponent. 10,
    // the exceptional tier, Base Launch 3 sideways: it flings its target
    // far away; a Shield that blocks it is driven back across the ground
    // (640 units/s). A Deflect turns it back like any projectile.
    attack5_object: {
      animation: 'attack5_object',
      speed: 700,
      lifetime: 1.1,
      hitbox: { x: -22, y: -20, w: 44, h: 40 },
      damage: 10,
      baseLaunch: 3,
      directionalLaunch: 'horizontal',
      hitstun: 0.5,
      blockstun: 0.2,
      hitstop: 0.12,
      blockPush: 640,
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). None has a cooldown (the cooldown policy's: none
  // deals 10 or paralyzes). Each moves by the shared attack movement
  // (js/data/attack-movement.js): never steered on the ground, the aerials
  // under the universal air control; the Street Combo and the Uppercut step
  // in by the shared Step-in, the Pistol (a shot) and the aerials never.
  // Every melee box ends within an arm's or a leg's length of its body: 60
  // units at the most.
  attacks: {
    // The Street Combo: the guard (frame 1, two frames), then three
    // strikes in front of it at the shoulders, out to 56 units (the cross
    // at full stretch): the jab (frame 2), 1, no launch, a stun that holds
    // the target for the next; the cross (frames 3-4), 1, holding it; the
    // fists drawn back (frame 5), and the hook (frame 6), 3, Base Launch 1
    // sideways. The guard again (frame 7): 0.4 s in all. Once it has hit,
    // the hook opens a follow-up. It keeps all the speed it is thrown at and
    // steps in by the shared Step-in.
    attack1: {
      animation: 'attack1',
      recovery: 1 / FPS_0007.attack1,
      hitbox: { x: 6, y: -70, w: 50, h: 32 },
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0007.attack1, active: 1 / FPS_0007.attack1, damage: 1 },
        { at: 3 / FPS_0007.attack1, active: 2 / FPS_0007.attack1, damage: 1 },
        { at: 6 / FPS_0007.attack1, active: 1 / FPS_0007.attack1, damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal', hitstun: 0.32 },
      ],
      groundOnly: true,
      hitCancel: 7 / FPS_0007.attack1,
    },
    // The Flying Kick: tucked (frame 1), the leg thrown out (frame 2, two
    // frames, live: in front of it at the hips, out to 72 units, its foot),
    // tucked again (frame 1): a little over a quarter of a second. 3, Base
    // Launch 2 sideways: a full flying kick sends its target far. A hit
    // opens a follow-up. Its drift under the
    // universal air control.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 1 / FPS_0007.midair_attack1,
      active: 2 / FPS_0007.midair_attack1,
      recovery: 1 / FPS_0007.midair_attack1,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 10, y: -52, w: 62, h: 36 },
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hitCancel: 3 / FPS_0007.midair_attack1,
    },
    // The Uppercut: crouched, the fist low (frame 1, a fifth of a second to
    // see it coming), then the fist driven up past its face (frame 2, live:
    // in front of it from the waist to over its head, out to 34 units),
    // the fist high (frame 3, two frames): 0.4 s in all. 5, the heavy tier,
    // Base Launch 2 straight up: its launcher. Once it has hit, a jump (or
    // another move) may cut the fist high short, to chase the target into
    // the air. It steps in by the shared Step-in.
    attack2: {
      animation: 'attack2',
      startup: 3 / FPS_0007.attack2,
      active: 1 / FPS_0007.attack2,
      recovery: 2 / FPS_0007.attack2,
      damage: 5,
      baseLaunch: 2,
      directionalLaunch: 'vertical',
      hitbox: { x: 0, y: -100, w: 34, h: 72 },
      hitstun: 0.42,
      blockstun: 0.14,
      hitstop: 0.06,
      groundOnly: true,
      hitCancel: 4 / FPS_0007.attack2,
    },
    // The Hammer Fist: the arms flung up and a knee raised (frames 1-2, a
    // fifth of a second), then both fists swung down through a wide arc in
    // front of it, from over its head to under its feet (frames 3-4, live,
    // out to 60 units), tucked (frame 5): 0.4 s in all. 3, Base Launch 2
    // downward: it drives its target down (off the stage, a spike). Its
    // drift under the universal air control.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: 3 / FPS_0007.midair_attack2,
      active: 2 / FPS_0007.midair_attack2,
      recovery: 1 / FPS_0007.midair_attack2,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'reverseVertical',
      hitbox: { x: 0, y: -94, w: 60, h: 96 },
      hitstun: 0.4,
      blockstun: 0.14,
      hitstop: 0.06,
    },
    // The Pistol (extra_attack): drawn and aimed (frame 1, two frames),
    // fired as frame 2 begins (its bullet, above, leaves the muzzle 58 units
    // in front at the shoulders), the recoil kicking the gun up (frame 3),
    // aimed again (frame 1): a third of a second in all, on the ground only.
    // An ordinary shot: 15 Energy, no cooldown. A shot never steps in.
    extra_attack: {
      animation: 'extra_attack',
      startup: 2 / FPS_0007.extra_attack,
      active: 1 / FPS_0007.extra_attack,
      recovery: 2 / FPS_0007.extra_attack,
      hitbox: null,
      projectile: { id: 'extra_attack_object', spawnAt: 2 / FPS_0007.extra_attack, offset: { x: 58, y: -66 } },
      groundOnly: true,
    },
  },
};
