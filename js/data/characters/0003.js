// #0003's definition: everything that makes #0003 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0003.md for what each move does in play.
//
// The medic brawler, cut from one supplied sprite sheet (see
// assets/characters/0003/). A fighter of precise chakra control: it holds
// its strength back until the instant of impact, so its big blows split the
// ground, and it can mend its own body. Four numbered attacks, each a
// button of its own, plus its extra_attack:
//
//   attack1  the Chakra Punch, a straight that shoves even a raised Shield
//            back (`blockPush`); in the air the Leaping Kick, a kick off a
//            chakra-driven leap that carries it up (motion `rise`)
//   attack2  the Heel Drop, a hop and an axe kick that drives its target
//            into the ground, then cracks the ground round the heel (a
//            `quake`: it reaches only fighters standing on the ground); in
//            the air the Heavenly Foot of Pain, a plunge heel-first that
//            lands and splits the ground round it (motion `slam`, its
//            `impact` a quake)
//   attack3  Cherry Blossom Impact, a technique: a fist driven into the
//            ground, the ground erupting either side of it (a burst that is
//            a quake): jump, or be thrown into the air
//   attack4  the Mystical Palm Technique, a technique: knelt, palms glowing,
//            it heals its own body (`heal`: Launch Point taken off its own),
//            a long cast any hit breaks
//   extra_attack  the Chakra Haymaker, its finisher: a glove tugged tight,
//            a lunge and an overhand blow that sends its target sideways
//            and drives a Shield across the ground
//
// Its Shield is a guard of crossed arms, on the ground. In the air the
// Shield button is its Deflect, a rising backhand sweep that turns
// projectiles back; its air dash (its midair_mouvment) is a body flicker.
// Its cooldowns are the shared policy's (js/data/cooldowns.js), derived from
// what each move does, never authored here: the Mystical Palm Technique's
// heal waits 3 s; every other move (Cherry Blossom Impact and the Heavenly
// Foot of Pain included: a quake, a slam and a launch earn nothing, and
// neither deals 10) only the universal 0.5 s repeat delay, and the Deflect
// none. These timers never alter their animation phases. The sheet's
// sealed-strength poses are no move.

import { frames, pad } from './helpers.js';

// Height in art pixels of #0003's idle (its reference clip). Its art is 1x
// (one file pixel per art pixel, cut from one sprite sheet with its flat
// background made transparent), so no pixel grid is ever looked for in it
// (`visual.pixelSize: 1`): each clip's heightRatio, its tallest frame over
// this, is what sizes it, at exactly one art pixel per file pixel.
const ART_0003 = 48;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0003 = 88 / 52;

// Playback rates of #0003's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their two-frame clips are
// shown once across it, which 12 fps matches.)
const FPS_0003 = Object.freeze({
  idle: 8,
  run: 16,
  mouvment: 12,
  midair_mouvment: 12,
  jump: 10,
  fall: 10,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 20,
  attack1: 20,
  midair_attack1: 15,
  attack2: 30,
  midair_attack2: 15,
  attack3_cast: 20,
  attack3_release: 20,
  attack4_cast: 6,
  attack4_release: 4,
  extra_attack: 15,
});

// The Heavenly Foot of Pain's plunge, in seconds: the hang (its first two
// frames) and the longest it plunges before it gives up on the ground.
const SLAM_HANG_0003 = 2 / FPS_0003.midair_attack2;
const SLAM_PLUNGE_0003 = 0.9;

// A clip of `count` frames of codename `codename` (from frame `start`),
// sized by its tallest frame (`height`, art pixels) against the idle.
const clip = (codename, count, fps, height, extra = {}, start = 1) => ({
  frames: frames('0003', codename, count, start),
  fps,
  loop: false,
  heightRatio: height / ART_0003,
  ...extra,
});

export const CHARACTER_0003 = {
  id: '0003',
  displayName: '#0003',
  available: true,
  rosterSlot: 2,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: the idle, run, jump, fall, land, hurt, Shield and air dash
  // poses use the automatic torso anchor. Where an arm thrust out, a trail
  // or the hair flung forward by an impact would drag it off the body, a
  // clip authors its own (`anchorX`, art pixels from the left of each
  // frame's visible art): on the red top, which stays over the hips
  // whatever the arms do. The Heavenly Foot of Pain's last plunge frame also
  // says where the feet are (`anchorY`, art pixels down from the top of the
  // art): its heel's arc sweeps below them.
  animations: {
    // The fighting stance, fists loose, bobbing: four frames.
    idle: { ...clip('idle', 4, FPS_0003.idle, 48), loop: true },
    // The run: an eight-frame stride, arms swept back. Its rate follows the
    // speed, down to 0.6 of it (and up past it on a Dash's run-on).
    run: { ...clip('run', 8, FPS_0003.run, 44), loop: true, minSpeedScale: 0.6 },
    // Takeoff, a knee drawn up (held on the rise); then the legs let down
    // for the descent; a crouch on touchdown, straightening up.
    jump: clip('jump', 2, FPS_0003.jump, 48),
    fall: clip('fall', 2, FPS_0003.fall, 47),
    land: clip('land', 2, FPS_0003.land, 43),
    // mouvment, the Dash: a low lunge, speed lines streaming off the legs,
    // played once across the whole Dash.
    mouvment: clip('mouvment', 2, FPS_0003.mouvment, 31, { anchorX: [27, 31] }),
    // midair_mouvment, the air dash: a body flicker, the figure breaking
    // into streaks, played once across the whole air dash.
    midair_mouvment: clip('midair_mouvment', 2, FPS_0003.midair_mouvment, 47),
    // Hitstun: `hurt` flinches, then doubles over (held); `midair_hurt` is
    // flung head over heels.
    hurt: clip('hurt', 2, FPS_0003.hurt, 48),
    midair_hurt: clip('midair_hurt', 1, FPS_0003.hurt, 29),
    // Its guard, on the ground: the arms crossing (one frame), held high
    // before the face, then lowered (one frame).
    prepshield: clip('prepshield', 1, FPS_0003.shield, 45),
    shielding: clip('shielding', 1, FPS_0003.shield, 44),
    releaseshield: clip('releaseshield', 1, FPS_0003.shield, 46),
    // deflect, its Deflect: 1 the hand drawn back low, 2 the backhand swung
    // up with its trail, 3 the sweep over the head, 4 the arm raised.
    deflect: clip('deflect', 4, FPS_0003.deflect, 45, { anchorX: [16, 15, 19.5, 19.5] }),
    // attack1, the Chakra Punch: 1 the stance, 2 the fist drawn back, 3 the
    // straight with its trail, 4 the trail at full stretch, 5 the arm out,
    // 6 back.
    attack1: clip('attack1', 6, FPS_0003.attack1, 46, { anchorX: [12, 13, 17, 19, 19.5, 14.5] }),
    // midair_attack1, the Leaping Kick: 1 tucked, 2 the knee driven up as
    // it leaps, 3 the leg shot out (held).
    midair_attack1: clip('midair_attack1', 3, FPS_0003.midair_attack1, 49),
    // attack2, the Heel Drop: 1 the crouch, 2 the hop, 3-4 the leg raised
    // straight up, 5 flipping over it, 6 the heel brought down with its
    // trail, 7-9 the heel in the ground, the hair flung forward, 10 back.
    attack2: clip('attack2', 10, FPS_0003.attack2, 52, { anchorX: [15, 18, 11, 11, 17.5, 20.5, 19, 19, 18.5, 15] }),
    // midair_attack2, the Heavenly Foot of Pain: 1 the leg raised, 2 the
    // heel coming down, 3 the heel swept under with its arc (held through
    // the plunge); then, landed, its impact clip
    // (midair_attack2_impact): 4-7 the heel in the ground, the hair flung
    // up by the impact.
    midair_attack2: clip('midair_attack2', 3, FPS_0003.midair_attack2, 56, { anchorX: [11.5, 14, 20.5], anchorY: [56, 51, 36] }),
    midair_attack2_impact: clip('midair_attack2', 4, FPS_0003.midair_attack2, 61, { anchorX: [12, 11, 12.5, 12.5] }, 4),
    // attack3, Cherry Blossom Impact (a technique, see `techniques`): the
    // cast is the fist raised and flexed (1-2), glowing with chakra (3),
    // and driven down (4); the release is the fist in the ground (5), the
    // body bent over the impact, the hair flung forward (6-8), and back up
    // (9).
    attack3_cast: clip('attack3', 4, FPS_0003.attack3_cast, 47, { anchorX: [11, 11, 14, 14] }),
    attack3_release: clip('attack3', 5, FPS_0003.attack3_release, 43, { anchorX: [16, 15, 15, 15, 13.5] }, 5),
    // attack4, the Mystical Palm Technique (a technique): the cast is a
    // crouch (1), then knelt, both palms held out (2-6); the release is
    // standing up again (7).
    attack4_cast: clip('attack4', 6, FPS_0003.attack4_cast, 45, { anchorX: [9, 10, 10, 10, 10, 10] }),
    attack4_release: clip('attack4', 1, FPS_0003.attack4_release, 45, { anchorX: [9.5] }, 7),
    // extra_attack, the Chakra Haymaker: 1-2 the glove tugged tight with the
    // teeth, 3 the fist raised, 4 the body turned away into the wind-up, 5
    // the overhand blow with its arc, 6-7 driven through low, 8 back.
    extra_attack: clip('extra_attack', 8, FPS_0003.extra_attack, 48, { anchorX: [10.5, 11, 11, 15.5, 21, 23.5, 24, 13] }),
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
    // Its 48-pixel idle at the roster's common art-pixel size, 88/52 world
    // units per art pixel (so every fighter's pixels are the same size on
    // screen): about 81 units, between #0002 and #0001.
    height: ART_0003 * UNIT_0003,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.22, size: 0.5 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its pink hair and
    // its shade, its red top, its skin and its white shorts.
    eliminationPalette: ['#ffb5e7', '#d64294', '#bd0000', '#f7d68c', '#cecece'],
  },

  // Its body, measured from its idle: the head and top, then the legs.
  // Collision is independent of the art.
  collider: { width: 28, height: 76 },
  pushbox: { width: 32 },
  hurtboxes: [
    { x: -16, y: -80, w: 32, h: 40 }, // head and torso
    { x: -18, y: -40, w: 36, h: 40 }, // legs
  ],

  // How #0003 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): 0.15 s more stun per 1000 units/s, 0.55 s
  // more at most, tumbling from 1100 units/s, and a held direction bends a
  // launch by up to 20 degrees: a medic's body, quick to come round, that
  // reads a launch better than most.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.55,
    tumbleSpeed: 1100,
    steerAngle: 20,
  },

  // Energy (see resolveEnergy in js/game/combat/combat-state.js): the same
  // bar and the same costs as every fighter's (100; a Dash, an air dash or a
  // Dash cancel 25, a Deflect 15, each blocked hit 15). Its own is only how
  // fast it refills: 15 a second, the quickest of the roster (its precise
  // chakra control wastes none).
  energy: {
    regen: 15,
  },

  // Its guard, what the `shield` input does for #0003 on the ground: the
  // arms crossed before the face, raised and lowered on a frame each. Its
  // perfect Shield opens for 0.1 s after 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    groundReleaseAnimation: 'releaseshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0003 in the air (schema:
  // js/game/combat/deflect.js): frame 1 the hand drawn back, then the
  // backhand swung up and over the head (frames 2-3, live: the whole front
  // the sweep covers, from the feet to over the head, out to 46 units, so
  // it catches what flies low as well as high),
  // frame 4 the arm raised, held a frame longer. Every Deflect's 3, Base
  // Launch 2, here upward, the way the hand sweeps; while the sweep is live
  // it turns the other fighter's projectiles back at their thrower, now
  // #0003's. A quarter of a second in all, falling as it sweeps and
  // carrying the whole of its drift; no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0003.deflect,
    active: 2 / FPS_0003.deflect,
    recovery: 2 / FPS_0003.deflect,
    hitbox: { x: 4, y: -84, w: 42, h: 80 },
    directionalLaunch: 'vertical',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    airMomentum: 1,
    airControl: 0.4,
    deflectProjectiles: true,
  },

  // Four numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 and attack2 ordinary attacks with their
  // mid-air versions, attack3 and attack4 techniques (ground only).
  actions: {
    extra_attack: 'extra_attack', // the Chakra Haymaker
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Chakra Punch / the Leaping Kick
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Heel Drop / the Heavenly Foot of Pain
    attack3: { type: 'technique', id: 'attack3' }, // Cherry Blossom Impact
    attack4: { type: 'technique', id: 'attack4' }, // the Mystical Palm Technique
  },

  // Its Special abilities (js/data/special-abilities.js): the Mystical Palm
  // Technique alone, the one move that heals its own Launch Point. Cherry
  // Blossom Impact is a technique too, but an ordinary ground attack to the
  // player: a ground eruption, quick to come out.
  specialAbilities: ['attack4'],

  // UI only: a frame of each move's own art (zero-based frames): the
  // straight's trail, the kick, the heel's trail and arc, the glowing fist,
  // the healing palms, the haymaker's arc.
  mobileAbilities: {
    extra_attack: { label: 'Chakra Haymaker', preview: { animation: 'extra_attack', frame: 4 } },
    attack1: { label: 'Chakra Punch', preview: { animation: 'attack1', frame: 3 }, previews: { air: { animation: 'midair_attack1', frame: 2 } } },
    attack2: { label: 'Heel Drop', preview: { animation: 'attack2', frame: 5 }, previews: { air: { animation: 'midair_attack2', frame: 2 } } },
    attack3: { label: 'Cherry Blossom Impact', preview: { animation: 'attack3_cast', frame: 2 } },
    attack4: { label: 'Mystical Palm Technique', preview: { animation: 'attack4_cast', frame: 3 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Chakra Haymaker',
    attack1: 'Chakra Punch',
    midair_attack1: 'Leaping Kick',
    attack2: 'Heel Drop',
    midair_attack2: 'Heavenly Foot of Pain',
    attack3: 'Cherry Blossom Impact',
    attack4: 'Mystical Palm Technique',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0003.<move>.description).
  abilityDescriptions: {
    extra_attack: 'A lunging overhand blow that sends the opponent flying sideways and drives a Shield back.',
    attack1: 'A quick chakra straight that pushes the opponent away and shoves even a Shield back.',
    midair_attack1: 'Leaps up off the air with a knee and a kick: an anti-air, and a way back to the stage.',
    attack2: 'A hop and an axe kick that drives the opponent into the ground, then cracks the ground around it.',
    midair_attack2: 'Plunges heel-first and splits the ground where it lands, throwing up everyone standing nearby.',
    attack3: 'Drives a fist into the ground: it erupts on both sides, launching everyone standing on it. Jumping clears it.',
    attack4: 'Kneels to heal with glowing palms, taking Launch Point off yourself. Any hit breaks it.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // its own moves' buttons, chosen for each move rather than its attack
  // number. The universal actions keep everyone's buttons (the stick, Jump
  // on Cross / A, Dash on L1 / LB, Circle / B for the Shield and the
  // Deflect, Options / Menu to pause). Its two strikes are single face
  // buttons, the same on the ground and in the air: the Chakra Punch /
  // Leaping Kick on Square / X, the heel drops (the Heel Drop on the ground, the
  // Heavenly Foot of Pain in the air) on Triangle / Y. Its heavy blows sit
  // behind R2 / RT, the offensive modifier: Cherry Blossom Impact with
  // Square, the Chakra Haymaker with Triangle. The Mystical Palm Technique,
  // rare and never to be pressed by mistake, is L2 / LT + Triangle.
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:attack3': pad('west', { modifier: 'r2' }),
      'ground:attack4': pad('north', { modifier: 'l2' }),
      'ground:extra_attack': pad('north', { modifier: 'r2' }),
      'air:attack1': pad('west'),
      'air:attack2': pad('north'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). Each is a cast: #0003 stands committed to
  // it, then lets go all at once. A hit on #0003 before it lets go breaks
  // it (nothing released), and it needs the ground throughout. Cooldowns
  // begin on acceptance and run on even if interrupted; the policy gives
  // Cherry Blossom Impact only the 0.5 s repeat delay and the Mystical Palm
  // Technique 3 s (its heal).
  techniques: {
    // Cherry Blossom Impact: a fifth of a second to raise the fist, gather
    // the chakra in it and bring it down (every frame of it, at ordinary-
    // attack pace: it is no Special); as the fist meets the ground (the
    // release's first frame) the ground erupts for 150 units either side
    // of #0003, at foot height: every opponent
    // standing on the ground there is thrown upward (5, the heavy tier,
    // Base Launch 3: its biggest blow), and one in the air is not touched
    // at all (a quake).
    // A raised Shield blocks it like any attack, and is shoved back. #0003
    // is free again a quarter of a second later, as the release's last
    // frame ends: 0.45 s in all.
    attack3: {
      castAnimation: 'attack3_cast',
      releaseAnimation: 'attack3_release',
      burst: {
        hitbox: { x: -150, y: -46, w: 300, h: 50 },
        hit: {
          damage: 5, baseLaunch: 3, directionalLaunch: 'vertical', quake: true,
          hitstun: 0.45, blockstun: 0.18, hitstop: 0.1, blockPush: 420,
        },
      },
    },
    // The Mystical Palm Technique: a full second knelt, palms out (its
    // longest commitment, and nothing protects it); as it stands up it has
    // healed itself of 10 Launch Points (never below 0). A hit before then
    // breaks it and heals nothing. Once every 3 seconds.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      heal: 10,
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). Each has only the universal 0.5-second repeat
  // delay (the cooldown policy's: none deals 10 or paralyzes), independent
  // of its phases and of other moves' cooldowns.
  attacks: {
    // The Chakra Punch: frames 1-2 the wind-up, 3-4 the straight (its box
    // out to 40 units, at the shoulders), 5-6 back, 0.3 s in all. Light and
    // quick (3, Base Launch 1 sideways), and the chakra in it shoves a
    // Shield that blocks it back (360 units/s). It opens a follow-up once it
    // has hit, and keeps all the speed it is thrown at.
    attack1: {
      animation: 'attack1',
      startup: 2 / FPS_0003.attack1,
      active: 2 / FPS_0003.attack1,
      recovery: 2 / FPS_0003.attack1,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: { x: 12, y: -56, w: 28, h: 16 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      blockPush: 360,
      groundOnly: true,
      momentum: 1,
      friction: 0.6,
      hitCancel: 2 / FPS_0003.attack1,
    },
    // The Leaping Kick: tucked for a frame (a hang), then a chakra-driven
    // leap off nothing: it rises at 420 units/s while the knee is driven up
    // and the leg shot out (frames 2-3, live: from the knee to the foot,
    // out to 40 units), and carries on up from there, about 90 units in
    // all: its anti-air, and its one way back to the stage besides the
    // jumps. 3, Base Launch 2 sideways: a chakra kick that can finish off
    // the stage. Once per airtime; it steers a little, and a hit opens a
    // follow-up at once.
    midair_attack1: {
      animation: 'midair_attack1',
      startup: 1 / FPS_0003.midair_attack1,
      active: 2 / FPS_0003.midair_attack1,
      recovery: 2 / FPS_0003.midair_attack1,
      damage: 3,
      baseLaunch: 2,
      directionalLaunch: 'horizontal',
      hitbox: { x: 0, y: -62, w: 40, h: 46 },
      hitstun: 0.32,
      blockstun: 0.14,
      hitstop: 1 / 30,
      airUses: 1,
      motion: { type: 'rise', speed: 420 },
      airMomentum: 0.8,
      airControl: 0.5,
      hitCancel: 1 / FPS_0003.midair_attack1,
    },
    // The Heel Drop: the crouch and the hop (frames 1-2, stepping in at 220
    // units/s), the leg raised (3-4) and the flip (5): a sixth of a second
    // to see it coming. Then two strikes. The heel (frame 6): 3, Base
    // Launch 1 downward, driving whoever is in front into the ground. The
    // crack (frame 7): the ground round the heel, 50 units behind it to 90
    // in front, at foot height, 1 and a Base Launch 1 pop upward to every
    // opponent still standing on it (a quake), so a target the heel drove
    // down too gently to rebound is popped up for a follow-up. Frames 8-10
    // pull the heel out, the last held two frames more (0.4 s in all); a
    // hit opens a follow-up from frame 8.
    attack2: {
      animation: 'attack2',
      recovery: 5 / FPS_0003.attack2,
      hitbox: { x: 0, y: -80, w: 40, h: 80 },
      hitstun: 0.32,
      blockstun: 0.14,
      hitstop: 0.05,
      hits: [
        { at: 5 / FPS_0003.attack2, active: 1 / FPS_0003.attack2, damage: 3, baseLaunch: 1, directionalLaunch: 'reverseVertical' },
        {
          at: 6 / FPS_0003.attack2, active: 1 / FPS_0003.attack2, hitbox: { x: -50, y: -30, w: 140, h: 34 },
          damage: 1, baseLaunch: 1, directionalLaunch: 'vertical', quake: true, hitstun: 0.36, blockPush: 200,
        },
      ],
      groundOnly: true,
      momentum: 0.6,
      friction: 0.8,
      step: { at: 1 / FPS_0003.attack2, speed: 220 },
      hitCancel: 7 / FPS_0003.attack2,
    },
    // The Heavenly Foot of Pain: the leg raised and the heel brought down
    // (frames 1-2, a hang of 2/15 s), then the plunge heel-first at 1500
    // units/s (steering a little) for up to 0.9 s. Anything the heel meets
    // on the way is driven down (3, Base Launch 1 downward) and the plunge
    // goes on through. Where it lands, the ground splits: every opponent
    // standing on it within 110 units either side is thrown upward (5, Base
    // Launch 3: a quake, so one in the air is untouched), and a Shield is
    // shoved back. Then 4/15 s with the heel in the ground (its impact
    // clip), a follow-up open from the second frame of it once anything
    // has been hit. Once per airtime, never while flying from a launch;
    // off the stage it plunges into the Void.
    midair_attack2: {
      animation: 'midair_attack2',
      startup: SLAM_HANG_0003,
      active: SLAM_PLUNGE_0003,
      recovery: 4 / FPS_0003.midair_attack2,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'reverseVertical',
      hitbox: { x: -10, y: -34, w: 44, h: 44 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 0.05,
      airUses: 1,
      motion: {
        type: 'slam',
        fallSpeed: 1500,
        impact: {
          hitbox: { x: -110, y: -36, w: 220, h: 40 },
          hit: {
            damage: 5, baseLaunch: 3, directionalLaunch: 'vertical', quake: true,
            hitstun: 0.42, blockstun: 0.16, hitstop: 0.1, blockPush: 420,
          },
          animation: 'midair_attack2_impact',
        },
      },
      airMomentum: 0.5,
      airControl: 0.4,
      hitCancel: SLAM_HANG_0003 + SLAM_PLUNGE_0003 + 2 / FPS_0003.midair_attack2,
    },
    // The Chakra Haymaker (extra_attack): the glove tugged tight and the
    // fist raised (frames 1-3), the lunge (frame 4, forward speed raised to
    // at least 360), then the overhand blow (frames 5-6, live: the whole
    // arc it sweeps, from over the head down to the ground in front, out to
    // 46 units). Driven through and back (7-8). Its finisher, the full
    // weight of its strength: 5, the heavy tier, Base Launch 3 sideways,
    // and a Shield that blocks it is driven back across the ground (620
    // units/s). A good quarter of a second to see it coming, and no
    // follow-up: it is the end of a string.
    extra_attack: {
      animation: 'extra_attack',
      startup: 4 / FPS_0003.extra_attack,
      active: 2 / FPS_0003.extra_attack,
      recovery: 2 / FPS_0003.extra_attack,
      damage: 5,
      baseLaunch: 3,
      directionalLaunch: 'horizontal',
      hitbox: { x: 6, y: -104, w: 40, h: 104 },
      hitstun: 0.42,
      blockstun: 0.18,
      hitstop: 0.1,
      blockPush: 620,
      groundOnly: true,
      momentum: 0.6,
      friction: 0.7,
      step: { at: 3 / FPS_0003.extra_attack, speed: 360 },
    },
  },
};
