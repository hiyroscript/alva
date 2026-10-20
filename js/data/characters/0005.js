// #0005's definition: everything that makes #0005 the fighter it is, and
// nothing any other fighter shares. Registered in js/data/characters.js;
// see docs/characters/0005.md for what each move does in play.
//
// The dancing clown, cut from one supplied sprite sheet (see
// assets/characters/0005/). An ancient shapeshifter in a clown's shape that
// hunts by fear: its claws and its teeth are a predator's, its head
// stretches out on a long neck to bite, its maw opens onto lights that
// leave whoever looks into them floating helpless, and it is never only
// where it stands: a bunch of red balloons is all the warning before it
// bites from behind. Fear is what it feeds on. Five numbered attacks, each
// a button of its own, plus its extra_attack:
//
//   attack1  the Claw Swipe, a quick swipe of its claws; in the air the
//            Claw Rake, its claws raked down through a wide arc, driving
//            whatever they meet downward
//   attack2  the Long Bite, its head stretched out on a long neck across
//            the stage to bite and chew (the longest reach in the roster,
//            and long to pull back); in the air Snapping Jaws, a shorter
//            bite that chews too
//   attack3  Phantom Hands, a barrage of ghostly gloved hands bursting out
//            in front of it; in the air Floating Hands, the same barrage
//            as it floats in place (motion `hover`)
//   attack4  the Deadlights, a technique: its maw opens onto the lights
//            within, and everyone in front of it who sees them (a burst
//            that must be seen: `gaze`) floats up helpless (`float`)
//   attack5  the Red Balloon, a summon: a bunch of red balloons rises
//            behind the opponent and a phantom of it steps out of them to
//            bite (its clone), terrifying its prey (`fear`): while the fear
//            lasts, every hit #0005 lands on it feeds #0005
//   extra_attack  Dark Tendrils, black tendrils lashing out of its maw that
//            seize what they meet in front of it and reel it in (`pull`,
//            in front only)
//
// Its Shield is a thicket of the same black tendrils, held before its
// face, on the ground. In the air the Shield button is its Deflect, a
// claw swept round in a wide arc that turns projectiles back. Its Dash is
// a head-first lunge, speed lines streaming off it; its air dash its
// sprint's long, flat leap. Its cooldowns are the shared policy's
// (js/data/cooldowns.js), derived from what each move does, never authored
// here: the Deadlights wait 3 s (a float), the Red Balloon 3 s (its bite's
// fear), every other move only the universal 0.5 s repeat delay, and the
// Deflect none. These timers never alter their animation phases. The
// sheet's intro, walk, victory dance and defeat, its transformations (the
// spider, the giant face), its detached head and the rising bite are no
// move.

import { framePath, pad } from './helpers.js';

// Height in art pixels of #0005's idle (its reference clip). Its art is 1x
// (one file pixel per art pixel, cut from one sprite sheet with its flat
// background made transparent), so no pixel grid is ever looked for in it
// (`visual.pixelSize: 1`): each clip's heightRatio, its tallest frame over
// this, is what sizes it, at exactly one art pixel per file pixel.
const ART_0005 = 64;

// World units per art pixel: the roster's common art-pixel size.
const UNIT_0005 = 88 / 52;

// Playback rates of #0005's clips. Each attack's phases below are whole
// frames of its clip at its rate and a technique's phases are passes of its
// clips, so tuning a rate keeps the timing on the art; every attack's rate
// is a whole number of 60 Hz steps per frame, so each frame lasts exactly
// as long as its gameplay does. (The Dash and the air dash last the
// universal Dash's length, whatever these say: their two-frame clips are
// shown once across it, which 12 fps matches.)
const FPS_0005 = Object.freeze({
  idle: 4,
  run: 12,
  mouvment: 12,
  midair_mouvment: 12,
  jump: 10,
  fall: 10,
  land: 15,
  hurt: 12,
  shield: 15,
  deflect: 15,
  attack1: 12,
  midair_attack1: 15,
  attack2: 15,
  midair_attack2: 20,
  attack3: 12,
  midair_attack3: 12,
  attack4_cast: 5,
  attack4_release: 3,
  attack5_summon: 12,
  attack5: 12,
  attack5_object: 6,
  extra_attack: 15,
});

// A clip of codename `codename`'s files, in the order `order` plays them (a
// file shown twice is one file on disk), sized by its tallest frame
// (`height`, art pixels) against the idle.
const clip = (codename, order, fps, height, extra = {}) => ({
  frames: order.map((n) => framePath('0005', codename, n)),
  fps,
  loop: false,
  heightRatio: height / ART_0005,
  ...extra,
});

// The Long Bite's art: the neck stretching out (files 1-4), the jaws open
// at full stretch (5), chewing (6-8), closed (9), then the neck drawn back
// along the same frames (4-1).
const LONG_BITE_0005 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 4, 3, 2, 1];
// Snapping Jaws': the head out (1-2), the jaws open (3), shut (4), chewing
// (5, 6 held), closed (7), drawn back (2-1).
const SNAPPING_JAWS_0005 = [1, 2, 3, 4, 5, 6, 6, 7, 2, 1];
// Phantom Hands': the hands drawn back (1, held), four bursts (2-5), the
// last hand held out (6).
const PHANTOM_HANDS_0005 = [1, 1, 2, 3, 4, 5, 6];
// Dark Tendrils': the tendrils growing out of the maw (1-4), at full
// length (5, held), then snapped back in (3, 1).
const TENDRILS_0005 = [1, 2, 3, 4, 5, 5, 5, 3, 1];
// The Deflect's: the claw raised (1), the arc swept round (2, held), the
// claw out (3).
const DEFLECT_0005 = [1, 2, 2, 3];

export const CHARACTER_0005 = {
  id: '0005',
  displayName: '#0005',
  available: true,
  rosterSlot: 4,

  // Every clip is drawn facing right.
  sourceFacing: 1,

  // Anchors: its claws, its stretching neck, its tendrils and the ghostly
  // hands reach far from its body, and the automatic torso anchor would
  // follow them off it, so every clip authors its own (`anchorX`, art
  // pixels from the left of each frame's visible art): the middle of its
  // body's own colours (its suit and its hair, which no effect shares) over
  // the upper part of the body, wherever its arms or its head go. Where an
  // arc sweeps below the feet (the Claw Rake, the Deflect), the clip also
  // says where the feet are (`anchorY`, art pixels down from the top).
  animations: {
    // The stance, hunched, arms crossed, swaying: two frames.
    idle: { ...clip('idle', [1, 2], FPS_0005.idle, 64, { anchorX: [13, 12.5] }), loop: true },
    // The run: its lunging sprint, bent double, arms flung forward: four
    // frames. Its rate follows the speed, down to 0.6 of it (and up past it
    // on a Dash's run-on).
    run: { ...clip('run', [1, 2, 3, 4], FPS_0005.run, 47, { anchorX: [34, 33.5, 35, 34] }), loop: true, minSpeedScale: 0.6 },
    // Takeoff, a crouch on all fours, then rising, a claw raised and the
    // legs dangling (held on the rise and through the descent); touching
    // down, the crouch again.
    jump: clip('jump', [1, 2], FPS_0005.jump, 61, { anchorX: [29, 23.5] }),
    fall: clip('fall', [1], FPS_0005.fall, 61, { anchorX: [23.5] }),
    land: clip('land', [1], FPS_0005.land, 42, { anchorX: [29] }),
    // mouvment, the Dash: a crouch, then the head-first lunge, speed lines
    // streaming off it, played once across the whole Dash.
    mouvment: clip('mouvment', [1, 2], FPS_0005.mouvment, 51, { anchorX: [21.5, 23.5] }),
    // midair_mouvment, the air dash: its sprint's long, flat leap, played
    // once across the whole air dash.
    midair_mouvment: clip('midair_mouvment', [1, 2], FPS_0005.midair_mouvment, 47, { anchorX: [34, 33.5] }),
    // Hitstun: `hurt` reels back, the head thrown sideways; `midair_hurt`
    // is flung off its feet, limbs splayed (also its pose while it floats).
    hurt: clip('hurt', [1], FPS_0005.hurt, 53, { anchorX: [21.5] }),
    midair_hurt: clip('midair_hurt', [1], FPS_0005.hurt, 55, { anchorX: [19] }),
    // Its guard, on the ground: black tendrils sprouting from its mouth
    // (two frames), fanned out before its face (held), withdrawn (two).
    prepshield: clip('prepshield', [1, 2], FPS_0005.shield, 56, { anchorX: [18.5, 18] }),
    shielding: clip('shielding', [1], FPS_0005.shield, 59, { anchorX: [18.5] }),
    releaseshield: clip('releaseshield', [1, 2], FPS_0005.shield, 56, { anchorX: [18, 18.5] }),
    // deflect, its Deflect: 1 crouched, a claw raised high behind, 2 the
    // claw swept round in a wide arc from over its back to under it (held a
    // frame), 3 the claw thrust out in front.
    deflect: clip('deflect', DEFLECT_0005, FPS_0005.deflect, 71, {
      anchorX: [30.5, 35, 35, 31], anchorY: [51, 57, 57, 42],
    }),
    // attack1, the Claw Swipe: 1 the claw drawn back, 2 the swipe with its
    // arc, 3 the claw raised.
    attack1: clip('attack1', [1, 2, 3], FPS_0005.attack1, 58, { anchorX: [25.5, 26.5, 26.5] }),
    // midair_attack1, the Claw Rake: 1 drifting, 2 the claws raised, 3 the
    // arc swept from over its back down under it, 4 the arc through the
    // front, low, 5 the claws held out.
    midair_attack1: clip('midair_attack1', [1, 2, 3, 4, 5], FPS_0005.midair_attack1, 71, {
      anchorX: [23.5, 28.5, 34, 33, 27], anchorY: [61, 62, 66, 64, 64],
    }),
    // attack2, the Long Bite (see LONG_BITE_0005): crouched, its head
    // stretched out on a long white neck, the jaws open, chewing, then the
    // neck drawn back.
    attack2: clip('attack2', LONG_BITE_0005, FPS_0005.attack2, 51, {
      anchorX: [29, 28.5, 28.5, 28.5, 28, 28, 28, 28, 28, 28.5, 28.5, 28.5, 29],
    }),
    // midair_attack2, Snapping Jaws (see SNAPPING_JAWS_0005): the same, on
    // a shorter neck.
    midair_attack2: clip('midair_attack2', SNAPPING_JAWS_0005, FPS_0005.midair_attack2, 50, {
      anchorX: [29, 28.5, 28.5, 28.5, 28.5, 28.5, 28.5, 28.5, 28.5, 29],
    }),
    // attack3, Phantom Hands (see PHANTOM_HANDS_0005): the ghostly hands
    // drawn back behind it, four bursts of them in front, one held out.
    attack3: clip('attack3', PHANTOM_HANDS_0005, FPS_0005.attack3, 67, {
      anchorX: [38.5, 38.5, 24.5, 24, 25, 24, 26],
    }),
    // midair_attack3, Floating Hands: 1 drifting, 2 a hand drawn back, 3-6
    // four bursts of hands, 7 one held out.
    midair_attack3: clip('midair_attack3', [1, 2, 3, 4, 5, 6, 7], FPS_0005.midair_attack3, 77, {
      anchorX: [23.5, 42.5, 22.5, 21, 25.5, 24.5, 25.5],
    }),
    // attack4, the Deadlights (a technique, see `techniques`): the cast is
    // the fists raised (1), then its face splitting open onto rows of teeth
    // (2); the release is the lights burning in its maw (3).
    attack4_cast: clip('attack4', [1, 2], FPS_0005.attack4_cast, 56, { anchorX: [20, 19.5] }),
    attack4_release: clip('attack4', [3], FPS_0005.attack4_release, 56, { anchorX: [19.5] }),
    // attack5_summon, the Red Balloon's startup (its own pose, see
    // `summons`): its face swallowed by black, the maw gaping, a dark haze
    // flaring round it, as its phantom rises behind its prey.
    attack5_summon: clip('attack5_summon', [1, 2, 3, 4], FPS_0005.attack5_summon, 64, { anchorX: [26.5, 26.5, 24.5, 25] }),
    // attack5, the phantom's bite (the clone's attack, see `summons`): 1
    // the fists raised, 2 the face splitting open, 3 a ghostly maw gaping
    // out of it, 4 snapping shut, 5 shut, thrust out.
    attack5: clip('attack5', [1, 2, 3, 4, 5], FPS_0005.attack5, 62, { anchorX: [20, 19.5, 17.5, 18.5, 18.5] }),
    // extra_attack, Dark Tendrils (see TENDRILS_0005): black tendrils
    // pouring out of its maw across the stage, held, snapped back in.
    extra_attack: clip('extra_attack', TENDRILS_0005, FPS_0005.extra_attack, 64, {
      anchorX: [18.5, 18.5, 18, 18, 17, 17, 17, 18, 18.5],
    }),
  },

  // Effect art, normalized at its own size: the Red Balloon's cloud, a
  // single red balloon on its string, then a whole bunch of them (played
  // forwards as the phantom appears, backwards as it goes; never mirrored).
  effectAnimations: {
    attack5_object: {
      frames: [framePath('0005', 'attack5_object', 1), framePath('0005', 'attack5_object', 2)],
      fps: FPS_0005.attack5_object,
      loop: false,
      sourceFacing: 0,
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
    // Its 64-pixel idle at the roster's common art-pixel size, 88/52 world
    // units per art pixel (so every fighter's pixels are the same size on
    // screen): about 108 units, the tallest of the roster, hunched as it
    // is.
    height: ART_0005 * UNIT_0005,
    referenceAnimation: 'idle',
    anchor: 'torso',
    pixelSize: 1,
    portrait: { animation: 'idle', frame: 0, centerY: 0.2, size: 0.5 },
    // The colours it bursts in when the Void takes it (see
    // js/game/rendering/hit-fx.js), picked from its art: its orange hair
    // and its shade, its olive suit, its white face and the red of its
    // painted grin.
    eliminationPalette: ['#ff7f27', '#a84300', '#6b6647', '#ffffff', '#ed1c24'],
  },

  // Its body, measured from its idle: the head and the hunched shoulders,
  // then the legs. Collision is independent of the art.
  collider: { width: 30, height: 100 },
  pushbox: { width: 34 },
  hurtboxes: [
    { x: -18, y: -106, w: 36, h: 50 }, // head and shoulders
    { x: -19, y: -56, w: 38, h: 56 }, // legs
  ],

  // How #0005 responds to being launched (see resolveLaunchReaction in
  // js/game/combat/combat.js): 0.15 s more stun per 1000 units/s, 0.55 s
  // more at most, tumbling from 1100 units/s, and a held direction bends a
  // launch by up to 20 degrees.
  launchReaction: {
    stunPerThousand: 0.15,
    maxStun: 0.55,
    tumbleSpeed: 1100,
    steerAngle: 20,
  },

  // Energy (see resolveEnergy in js/game/combat/combat-state.js): the same
  // bar and the same costs as every fighter's (100; a Dash, an air dash or a
  // Dash cancel 25, a Deflect 15, each blocked hit 15). Its own is only how
  // fast it refills: 14 a second.
  energy: {
    regen: 14,
  },

  // Its guard, what the `shield` input does for #0005 on the ground: a
  // thicket of black tendrils fanned out before its face, sprouting and
  // withdrawn on two frames each. Its perfect Shield opens for 0.1 s after
  // 0.25 s down.
  defense: {
    type: 'shield',
    groundAnimation: 'shielding',
    groundStartAnimation: 'prepshield',
    groundReleaseAnimation: 'releaseshield',
    perfectWindow: 0.1,
    perfectRearm: 0.25,
  },

  // Its Deflect, what the `shield` input does for #0005 in the air (schema:
  // js/game/combat/deflect.js): frame 1 the claw raised behind it, then the
  // claw swept round (frame 2, two frames, live: the front of the body from
  // over the head to the feet, out to 52 units, the arc the claw sweeps),
  // then the claw thrust out a frame more. Every Deflect's 3, Base Launch 2,
  // here sideways, the way the claw sweeps; while the arc is live it turns
  // the other fighter's projectiles back at their thrower, now #0005's. A
  // little over a quarter of a second in all, keeping the whole of its
  // drift; no cooldown of its own.
  deflect: {
    animation: 'deflect',
    startup: 1 / FPS_0005.deflect,
    active: 2 / FPS_0005.deflect,
    recovery: 1 / FPS_0005.deflect,
    hitbox: { x: -4, y: -100, w: 56, h: 104 },
    directionalLaunch: 'horizontal',
    hitstun: 0.3,
    blockstun: 0.12,
    hitstop: 0.05,
    airMomentum: 1,
    airControl: 0.4,
    deflectProjectiles: true,
  },

  // Five numbered attacks, each a button of its own (see
  // js/data/loadout.js): attack1 to attack3 ordinary attacks with their
  // mid-air versions, attack4 a technique and attack5 a summon (both
  // ground only).
  actions: {
    extra_attack: 'extra_attack', // Dark Tendrils
    attack1: { ground: 'attack1', air: 'midair_attack1' }, // the Claw Swipe / the Claw Rake
    attack2: { ground: 'attack2', air: 'midair_attack2' }, // the Long Bite / Snapping Jaws
    attack3: { ground: 'attack3', air: 'midair_attack3' }, // Phantom Hands / Floating Hands
    attack4: { type: 'technique', id: 'attack4' }, // the Deadlights
    attack5: { type: 'summon', id: 'attack5' }, // the Red Balloon
  },

  // Its Special abilities (js/data/special-abilities.js): the Deadlights,
  // whose lights leave whoever sees them floating helpless, and the Red
  // Balloon, its phantom that bites from behind and leaves its prey afraid,
  // feeding #0005 on every hit while the fear lasts. Dark Tendrils pull,
  // but are an ordinary attack to the player.
  specialAbilities: ['attack4', 'attack5'],

  // UI only: a frame of each move's own art (zero-based frames): the
  // tendrils at full stretch, the claw's arc, the arc through the front,
  // the jaws open at the end of the neck, the ghostly hands, the lights in
  // its maw, the phantom's maw snapping.
  mobileAbilities: {
    extra_attack: { label: 'Dark Tendrils', preview: { animation: 'extra_attack', frame: 3 } },
    attack1: { label: 'Claw Swipe', preview: { animation: 'attack1', frame: 1 }, previews: { air: { animation: 'midair_attack1', frame: 3 } } },
    attack2: { label: 'Long Bite', preview: { animation: 'attack2', frame: 4 }, previews: { air: { animation: 'midair_attack2', frame: 2 } } },
    attack3: { label: 'Phantom Hands', preview: { animation: 'attack3', frame: 3 }, previews: { air: { animation: 'midair_attack3', frame: 3 } } },
    attack4: { label: 'Deadlights', preview: { animation: 'attack4_release', frame: 0 } },
    attack5: { label: 'Red Balloon', preview: { animation: 'attack5', frame: 3 } },
  },

  // In-game ability names (js/data/abilities.js).
  abilityNames: {
    extra_attack: 'Dark Tendrils',
    attack1: 'Claw Swipe',
    midair_attack1: 'Claw Rake',
    attack2: 'Long Bite',
    midair_attack2: 'Snapping Jaws',
    attack3: 'Phantom Hands',
    midair_attack3: 'Floating Hands',
    attack4: 'Deadlights',
    attack5: 'Red Balloon',
  },

  // What each move does, in a line, for the controller editor (Settings ›
  // Controls › Controller controls). English here; other languages by key
  // (ability.0005.<move>.description).
  abilityDescriptions: {
    extra_attack: 'Black tendrils lash out of its maw across the stage, seize whoever is in front and reel them in for a follow-up.',
    attack1: 'A quick swipe of its claws that knocks the opponent back.',
    midair_attack1: 'Rakes its claws down through a wide arc, driving the opponent downward.',
    attack2: 'Its head stretches out on a long neck to bite and chew, then flings the opponent far away: the longest reach of all, slow to pull back.',
    midair_attack2: 'Snaps its jaws out on a shorter neck: a bite that chews, then flings the opponent away.',
    attack3: 'A barrage of ghostly gloved hands bursts out in front, the last one hurling the opponent into the air.',
    midair_attack3: 'Floats in place while ghostly hands burst out in a barrage. Once per airtime.',
    attack4: 'Opens its maw onto the lights within: everyone in front who is facing it floats up helpless for 1.6 s.',
    attack5: 'A bunch of red balloons rises behind the opponent and a phantom steps out to bite: for 2.5 s they are afraid, and your hits on them heal you.',
  },

  // Its recommended controller layout (js/data/controller-profiles.js):
  // its own moves' buttons, chosen for each move rather than its attack
  // number. The universal actions keep everyone's buttons (the stick, Jump
  // on Cross / A, Dash on L1 / LB, Circle / B for the Shield and the
  // Deflect, Options / Menu to pause). Its claws are on Square / X and its
  // jaws on Triangle / Y, the same on the ground and in the air; the ghostly
  // hands, its barrage, have a shoulder of their own, R1 / RB, the same
  // everywhere. Dark Tendrils come out of its maw, so they sit with the
  // jaws behind the offensive trigger: R2 / RT + Triangle. Its two Specials,
  // rare and never to be pressed by mistake, are behind L2 / LT: the
  // Deadlights with Square, the Red Balloon with Triangle.
  controller: {
    layout: {
      'ground:attack1': pad('west'),
      'ground:attack2': pad('north'),
      'ground:attack3': pad('r1'),
      'ground:attack4': pad('west', { modifier: 'l2' }),
      'ground:attack5': pad('north', { modifier: 'l2' }),
      'ground:extra_attack': pad('north', { modifier: 'r2' }),
      'air:attack1': pad('west'),
      'air:attack2': pad('north'),
      'air:attack3': pad('r1'),
    },
  },

  // Techniques, keyed by the attack they are (schema and phases:
  // js/game/combat/technique.js). A cast: #0005 stands committed to it,
  // then lets go all at once. A hit on #0005 before it lets go breaks it
  // (nothing released), and it needs the ground throughout. Its cooldown
  // begins on acceptance and runs on even if interrupted.
  techniques: {
    // The Deadlights: 0.4 s with the fists raised and the face splitting
    // open (its longest commitment, and nothing protects it; out of Dark
    // Tendrils' seizing, just quick enough to catch its prey still held),
    // then the lights burn in its maw for a third of a second as it lets go
    // of them: everyone in front of it, from the feet to well over the
    // head, out to 190 units, who is facing it (a gaze: whoever has turned
    // its back on #0005 is not met at all) takes 1 and floats for 1.6 s:
    // lifted off the ground and rising slowly, helpless, until the float
    // runs out or a hit launches it. A raised Shield blocks it. The
    // policy's 3 s, for the float.
    attack4: {
      castAnimation: 'attack4_cast',
      releaseAnimation: 'attack4_release',
      burst: {
        hitbox: { x: 0, y: -130, w: 190, h: 140 },
        hit: { damage: 1, float: 1.6, gaze: true, hitstun: 0.3, blockstun: 0.12, hitstop: 0.06 },
      },
    },
  },

  // Summons, keyed by the attack they are (schema and phases:
  // js/game/combat/summon.js).
  summons: {
    // The Red Balloon: a third of a second with its face swallowed by
    // black (its startup, standing still, broken by any hit), then a bunch
    // of red balloons rises 60 units behind the opponent, facing its back,
    // and a phantom of #0005 steps out of them and bites (its attack5,
    // below). Whatever #0005 does meanwhile, the phantom bites on its own,
    // and is gone again into the balloons. If the opponent moves away the
    // bite whiffs; a Shield blocks it from either side. The policy's 3 s,
    // for its bite's fear.
    attack5: {
      attack: 'attack5',
      cloud: 'attack5_object',
      startupAnimation: 'attack5_summon',
      behindDistance: 60,
      effectOffset: { x: 0, y: -65 },
    },
  },

  // Attack definitions (schema: createAttackDefinition in
  // js/game/combat/attacks.js). Phases are whole frames of each clip, and
  // every hitbox is measured from its art (facing right from the origin,
  // mirrored with facing). Each has only the universal 0.5-second repeat
  // delay (the cooldown policy's: none deals 10, paralyzes, floats or
  // frightens) but the phantom's bite, independent of its phases and of
  // other moves' cooldowns.
  attacks: {
    // The Claw Swipe: the claw drawn back (frame 1), the swipe (frame 2,
    // live: its arc in front, from the chest to the hips, out to 60 units),
    // the claw raised (frame 3): a quarter of a second in all. Light and
    // quick (3, Base Launch 1 sideways); it opens a follow-up once it has
    // hit, and keeps all the speed it is thrown at.
    attack1: {
      animation: 'attack1',
      startup: 1 / FPS_0005.attack1,
      active: 1 / FPS_0005.attack1,
      recovery: 1 / FPS_0005.attack1,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      hitbox: { x: 4, y: -84, w: 56, h: 56 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      groundOnly: true,
      momentum: 1,
      friction: 0.6,
      hitCancel: 2 / FPS_0005.attack1,
    },
    // The Claw Rake: drifting and the claws raised (frames 1-2), then two
    // strikes. The arc swept from over its back down under it (frame 3): 1,
    // no launch, a stun that holds its target for the next. The arc through
    // the front, low (frame 4): 3, Base Launch 1 downward, driving the
    // target down (off the stage, a spike). The claws held out (frame 5): a
    // third of a second in all. It steers half as well as it drifts, and a
    // hit opens a follow-up from frame 5.
    midair_attack1: {
      animation: 'midair_attack1',
      recovery: 1 / FPS_0005.midair_attack1,
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0005.midair_attack1, active: 1 / FPS_0005.midair_attack1, hitbox: { x: -56, y: -64, w: 108, h: 72 }, damage: 1 },
        {
          at: 3 / FPS_0005.midair_attack1, active: 1 / FPS_0005.midair_attack1, hitbox: { x: 4, y: -104, w: 56, h: 106 },
          damage: 3, baseLaunch: 1, directionalLaunch: 'reverseVertical',
        },
      ],
      airMomentum: 1,
      airControl: 0.5,
      hitCancel: 4 / FPS_0005.midair_attack1,
    },
    // The Long Bite: crouched, its head shooting out from its face on its
    // neck (frames 1-4, a good quarter of a second to see it coming), then
    // four strikes all along the neck's length, from just in front of its
    // face (16 units) out to the jaws (198), at head height: the jaws close
    // on whatever the head met on its way out, right up close as well as far
    // away. The bite as they open (frame 5) and two chews (frames 6-7), 1
    // each, no launch, a stun that holds its prey in the jaws; the last chew
    // (frame 8): 5, the heavy tier, Base Launch 3 sideways, its prey shaken
    // and flung far away: its finisher. The jaws shut and the neck drawn
    // back (frames 9-13, a third of a second): 0.87 s in all, its longest
    // ordinary commitment. The longest reach in the roster, and its
    // slowest ordinary move.
    attack2: {
      animation: 'attack2',
      recovery: 5 / FPS_0005.attack2,
      hitbox: { x: 16, y: -84, w: 182, h: 64 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      hits: [
        { at: 4 / FPS_0005.attack2, active: 1 / FPS_0005.attack2, damage: 1 },
        { at: 5 / FPS_0005.attack2, active: 1 / FPS_0005.attack2, damage: 1 },
        { at: 6 / FPS_0005.attack2, active: 1 / FPS_0005.attack2, damage: 1 },
        { at: 7 / FPS_0005.attack2, active: 1 / FPS_0005.attack2, damage: 5, baseLaunch: 3, directionalLaunch: 'horizontal', hitstun: 0.42, hitstop: 0.08 },
      ],
      groundOnly: true,
      momentum: 0.4,
      friction: 0.9,
    },
    // Snapping Jaws: the head out (frames 1-2), then three strikes at the
    // jaws, 64 to 118 units out: the bite (frame 3) and a chew (frame 5),
    // 1 each, holding its prey; the last chew (frame 7): 5, the heavy
    // tier, Base Launch 2 sideways. Closed and drawn back (frames 8-10):
    // half a second in all.
    // It steers a little as it drifts.
    midair_attack2: {
      animation: 'midair_attack2',
      recovery: 3 / FPS_0005.midair_attack2,
      hitbox: { x: 64, y: -84, w: 54, h: 66 },
      hitstun: 0.3,
      blockstun: 0.14,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0005.midair_attack2, active: 1 / FPS_0005.midair_attack2, damage: 1 },
        { at: 4 / FPS_0005.midair_attack2, active: 1 / FPS_0005.midair_attack2, damage: 1 },
        { at: 6 / FPS_0005.midair_attack2, active: 1 / FPS_0005.midair_attack2, damage: 5, baseLaunch: 2, directionalLaunch: 'horizontal', hitstun: 0.4 },
      ],
      airMomentum: 0.6,
      airControl: 0.3,
    },
    // Phantom Hands: the hands drawn back behind it (frame 1, held two
    // frames), then four bursts of them in front (frames 2-5, live: from
    // the head to below the hips, 26 to 116 units out, where the hands
    // land): 1 each, holding the target, the last 5 at Base Launch 2
    // straight up, the hands hurling it into the air; a hand held out
    // (frame 6): 0.58 s in all.
    attack3: {
      animation: 'attack3',
      recovery: 1 / FPS_0005.attack3,
      hitbox: { x: 26, y: -106, w: 90, h: 96 },
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0005.attack3, active: 1 / FPS_0005.attack3, damage: 1 },
        { at: 3 / FPS_0005.attack3, active: 1 / FPS_0005.attack3, damage: 1 },
        { at: 4 / FPS_0005.attack3, active: 1 / FPS_0005.attack3, damage: 1 },
        { at: 5 / FPS_0005.attack3, active: 1 / FPS_0005.attack3, damage: 5, baseLaunch: 2, directionalLaunch: 'vertical', hitstun: 0.38 },
      ],
      groundOnly: true,
      momentum: 0.6,
      friction: 0.8,
    },
    // Floating Hands: #0005 floats where it is (motion `hover`) as a hand
    // is drawn back (frames 1-2), then four bursts of hands (frames 3-6,
    // live: 24 to 132 units out, from over the head to below the hips), 1
    // each, the last 3 at Base Launch 2 sideways; a hand held out (frame
    // 7): 0.58 s in all, steering a little. Once per airtime.
    midair_attack3: {
      animation: 'midair_attack3',
      recovery: 1 / FPS_0005.midair_attack3,
      hitbox: { x: 24, y: -126, w: 108, h: 104 },
      hitstun: 0.3,
      blockstun: 0.12,
      hitstop: 1 / 30,
      hits: [
        { at: 2 / FPS_0005.midair_attack3, active: 1 / FPS_0005.midair_attack3, damage: 1 },
        { at: 3 / FPS_0005.midair_attack3, active: 1 / FPS_0005.midair_attack3, damage: 1 },
        { at: 4 / FPS_0005.midair_attack3, active: 1 / FPS_0005.midair_attack3, damage: 1 },
        { at: 5 / FPS_0005.midair_attack3, active: 1 / FPS_0005.midair_attack3, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal', hitstun: 0.38 },
      ],
      airUses: 1,
      motion: { type: 'hover' },
      airMomentum: 0.4,
      airControl: 0.3,
    },
    // The Red Balloon's bite (the phantom's attack, see `summons`; no
    // button of #0005's performs it itself): the fists raised, the face
    // splitting and a ghostly maw gaping out of it (frames 1-3, a quarter of
    // a second), then the maw snapping shut (frame 4, live: 22 to 98 units
    // in front of the phantom, from over the head to the feet), and shut
    // (frame 5). 3, Base Launch 1 along the phantom's facing (toward
    // #0005), and it frightens its prey for 2.5 s (`fear`), less than the
    // summon's own 3 s: until the fear runs out, every hit #0005 lands on
    // it takes that much off #0005's own Launch Point too.
    attack5: {
      animation: 'attack5',
      startup: 3 / FPS_0005.attack5,
      active: 1 / FPS_0005.attack5,
      recovery: 1 / FPS_0005.attack5,
      damage: 3,
      baseLaunch: 1,
      directionalLaunch: 'horizontal',
      fear: 2.5,
      hitbox: { x: 22, y: -100, w: 76, h: 92 },
      hitstun: 0.4,
      blockstun: 0.15,
      hitstop: 0.06,
      groundOnly: true,
    },
    // Dark Tendrils (extra_attack): the tendrils pouring out of the maw
    // (frames 1-4, a good quarter of a second), then at full length (frame
    // 5, three frames, live: 24 to 324 units out, at head and chest
    // height): whoever they meet first is seized (1, no launch, a long
    // stun), and while they are out every opponent in front of #0005
    // within 280 units of its maw is reeled in toward it (`pull`, in front
    // only: one behind it is left where it is; a raised Shield holds its
    // ground and blocks the seizing). Snapped back in (frames 3 and 1):
    // 0.6 s in all. Once it has seized, a follow-up may cut the snapping
    // back short; the seized prey is still held as the Deadlights let go,
    // cast once the tendrils are back, if it faced #0005.
    extra_attack: {
      animation: 'extra_attack',
      recovery: 2 / FPS_0005.extra_attack,
      hits: [
        { at: 4 / FPS_0005.extra_attack, active: 3 / FPS_0005.extra_attack, hitbox: { x: 24, y: -100, w: 300, h: 80 }, damage: 1 },
      ],
      hitstun: 0.75,
      blockstun: 0.14,
      hitstop: 1 / 30,
      pull: { radius: 280, speed: 1100, offset: { x: 40, y: -55 }, front: true },
      groundOnly: true,
      momentum: 0.4,
      friction: 0.9,
      hitCancel: 7 / FPS_0005.extra_attack,
    },
  },
};
