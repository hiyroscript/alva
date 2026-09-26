// Character database.
//
// Adding a fighter (e.g. #0002) should only require:
//   1. dropping frames into ./assets/characters/<id>/
//   2. adding a definition to CHARACTERS below, including its Power tiers
//      (`powers`, see js/data/powers.js) and each hit's `damage`, Base
//      Launch (`baseLaunch`: 0, 1, 2 or 3) and Directional Launch
//      (`directionalLaunch`: null, 'horizontal', 'vertical' or
//      'reverseVertical'), e.g. `damage: 10, baseLaunch: 2,
//      directionalLaunch: 'vertical'` (see js/data/launch.js)
//   3. giving it a rosterSlot
//
// Every field the engine reads lives here; nothing about #0001 is hard-coded
// in the game systems.

// `${base}${name}1.png` ... `${base}${name}<count>.png`. The trailing number
// is always the frame number (e.g. 0001_1ba3.png is Basic Attack 1, frame 3).
const frames = (base, name, count) =>
  Array.from({ length: count }, (_, i) => `${base}${name}${i + 1}.png`);

const BASE_0001 = './assets/characters/0001/0001_';

// Playback rate of #0001's Basic Attack 1 clips. The BA1 attack phases below
// are whole frames at this rate, so tuning it keeps combat in sync with the art.
const BA1_FPS = 12;
// Same for Basic Attack 2: its phases are whole frames at this rate.
const BA2_FPS = 12;
// Playback rate of the Charge clips (startup, sustained loop and release).
const CHARGE_FPS = 10;
// Playback rate of the Shield clips: the raise and lower poses around the
// grounded hold each show for one frame at this rate.
const SHIELD_FPS = 12;
// Playback rate of the Dash clip. A Dash lasts exactly one pass of it
// (2 frames = 0.2 s at 10 fps), so tuning it keeps the burst on the art.
const DASH_FPS = 10;
// Playback rate of the Throw clip. The Throw phases and the shuriken's release
// point below are whole frames at this rate.
const THROW_FPS = 12;
// Playback rate of the shuriken's in-flight spin. Art only: it never changes
// how fast the projectile travels.
const SHURIKEN_FPS = 18;
// Playback rate of the clone-summon cloud. The same rate plays it forwards
// as the clone appears and backwards as it vanishes, so both take one pass
// of the clip (10 frames = 0.5 s at 20 fps).
const CLONE_CLOUD_FPS = 20;
// Playback rate of #0001's Charged BA2 (Sphere Rush) poses. The dash lasts
// exactly one pass of rasenDash at this rate, so tuning it keeps the rush's
// contact window on the dash art.
const RASEN_FPS = 12;
// Playback rate of the Sphere Rush's blue sphere. The rush waits for one full
// pass of rasenSphereBuild (6 frames = 0.5 s) before it dashes.
const PRASEN_FPS = 12;

export const CHARACTERS = [
  {
    id: '0001',
    displayName: '#0001',
    available: true,
    rosterSlot: 0,

    // The source art faces right. A clip drawn the other way would override
    // this with its own `sourceFacing`; it only decides whether the sprite
    // is mirrored, never the fighter's facing or its boxes.
    sourceFacing: 1,

    animations: {
      idle: {
        frames: frames(BASE_0001, 'idle', 4),
        fps: 7,
        loop: true,
        // Only used if the pixel grid of a frame cannot be detected: the
        // animation is then scaled so its tallest frame is this fraction of
        // visual.height.
        heightRatio: 1,
      },
      run: {
        frames: frames(BASE_0001, 'run', 6),
        fps: 11,
        loop: true,
        heightRatio: 0.9,
        // Playback rate follows horizontal speed, clamped to this minimum.
        minSpeedScale: 0.7,
      },
      // Airborne clips play once and hold their last frame for the rest of
      // the ascent / descent.
      jump: {
        frames: frames(BASE_0001, 'jump', 2),
        fps: 10,
        loop: false,
        heightRatio: 0.98,
      },
      fall: {
        frames: frames(BASE_0001, 'fall', 2),
        fps: 10,
        loop: false,
        heightRatio: 1,
      },
      // Dash: dash1 leans into the burst, dash2 is the low, stretched-out
      // sprint. Played once per Dash, which lasts exactly one pass of it.
      // Drawn at 1x (one file pixel per art pixel, unlike the upscaled rest
      // of #0001), so its grid cannot be detected: heightRatio then sizes it
      // by its tallest frame, dash1's 41 px against idle's 52, which puts it
      // at exactly one art pixel per file pixel, the same scale as every
      // other pose.
      dash: {
        frames: frames(BASE_0001, 'dash', 2),
        fps: DASH_FPS,
        loop: false,
        heightRatio: 41 / 52,
      },
      // Plays once on touchdown; the fighter holds the land state for exactly
      // one pass of this clip (frames / fps).
      land: {
        frames: frames(BASE_0001, 'land', 2),
        fps: 12,
        loop: false,
        heightRatio: 0.83,
      },
      // Hitstun poses: `hurt` while grounded, `midairHurt` while airborne.
      // Single frames, held for as long as the stun lasts.
      hurt: {
        frames: [`${BASE_0001}hurt.png`],
        fps: 12,
        loop: false,
        heightRatio: 0.9,
      },
      midairHurt: {
        frames: [`${BASE_0001}midairhurt.png`],
        fps: 12,
        loop: false,
        heightRatio: 0.65,
      },
      // Basic Attack 1 (BA1), ground and mid-air. Each plays once; the attack
      // definitions below time startup / active / recovery to these frames.
      // Mid-air BA1 is the three-frame kunai slash drawn as midair2ba1-3 (the
      // file names predate the move's place on BA1).
      ba1: {
        frames: frames(BASE_0001, '1ba', 4),
        fps: BA1_FPS,
        loop: false,
        heightRatio: 1.04,
      },
      midairBa1: {
        frames: frames(BASE_0001, 'midair2ba', 3),
        fps: BA1_FPS,
        loop: false,
        heightRatio: 1.29,
      },
      // Basic Attack 2 (BA2), ground and mid-air. Played once, like BA1.
      // Mid-air BA2 is the five-frame airborne kick drawn as midair1ba1-5.
      ba2: {
        frames: frames(BASE_0001, '2ba', 7),
        fps: BA2_FPS,
        loop: false,
        heightRatio: 1.02,
      },
      midairBa2: {
        frames: frames(BASE_0001, 'midair1ba', 5),
        fps: BA2_FPS,
        loop: false,
        heightRatio: 1.08,
      },
      // Charge: one logical fighter state drawn as two clips. The startup
      // (charge1, charge2) plays once when Charge begins; the sustained loop
      // (chargea, chargeb) then alternates for as long as Charge is held.
      // The loop frames are lettered, not numbered, so they are listed by hand.
      chargeStart: {
        frames: [`${BASE_0001}charge1.png`, `${BASE_0001}charge2.png`],
        fps: CHARGE_FPS,
        loop: false,
        heightRatio: 1,
      },
      chargeLoop: {
        frames: [`${BASE_0001}chargea.png`, `${BASE_0001}chargeb.png`],
        fps: CHARGE_FPS,
        loop: true,
        heightRatio: 1,
      },
      // Letting go of Charge shows charge1 again for one Charge frame-time
      // before the normal state resumes. Same artwork as the startup's first
      // frame, on purpose.
      chargeRelease: {
        frames: [`${BASE_0001}charge1.png`],
        fps: CHARGE_FPS,
        loop: false,
        heightRatio: 1,
      },
      // Shield, #0001's Defense (see `defense` below): four single frames,
      // each drawn at 1x like the Dash, so heightRatio sizes each by its own
      // height against idle's 52 art pixels (one art pixel per file pixel,
      // the scale of every other pose). On the ground, shieldStart
      // (prepshield) raises the guard for one frame, shield (shielding) is
      // the held guard for as long as Defense is held, and shieldRelease
      // (releaseblock, the file's name from its upload) lowers it for one
      // frame after. In the air there is only the held guard,
      // midairShield (midairshielding): no raise or lower pose. All face
      // right like the rest of #0001.
      shieldStart: {
        frames: [`${BASE_0001}prepshield.png`],
        fps: SHIELD_FPS,
        loop: false,
        heightRatio: 51 / 52,
      },
      shield: {
        frames: [`${BASE_0001}shielding.png`],
        fps: SHIELD_FPS,
        loop: false,
        heightRatio: 47 / 52,
      },
      shieldRelease: {
        frames: [`${BASE_0001}releaseblock.png`],
        fps: SHIELD_FPS,
        loop: false,
        heightRatio: 45 / 52,
      },
      midairShield: {
        frames: [`${BASE_0001}midairshielding.png`],
        fps: SHIELD_FPS,
        loop: false,
        heightRatio: 49 / 52,
      },
      // Throw, on the primary action: throw1 raises the shuriken by the face,
      // throw2 whips the arm across and lets go (the release frame), throw3
      // follows through. Faces right like the rest of #0001. Ground only:
      // there is no mid-air Throw art.
      throw: {
        frames: frames(BASE_0001, 'throw', 3),
        fps: THROW_FPS,
        loop: false,
        heightRatio: 0.9,
      },
      // Charged BA2, the Sphere Rush: one set of twelve poses (rasen1-12)
      // split into logical clips, each played once by its own technique
      // phase (see chargedTechniques.rasenRush). rasenForm (1-3): the rear
      // palm opens for the sphere to form in. rasenDash (4-6): the rush,
      // sphere carried behind, swung forward on rasen6. The rest only a hit
      // shows: rasenConfirm (7-8), the palm driven into the opponent, rasen8
      // held while the sphere on it shrinks; rasenExplosion (9), the pose of
      // the blast itself; rasenRelease (10-12), the recovery once the blast
      // is over. rasenWhiffRelease reuses rasen12 (the same file, never a
      // copy) alone, for one frame after a rush that caught nobody. Faces
      // right like the rest of #0001.
      rasenForm: {
        frames: frames(BASE_0001, 'rasen', 3),
        fps: RASEN_FPS,
        loop: false,
        heightRatio: 0.94,
      },
      rasenDash: {
        frames: [4, 5, 6].map((n) => `${BASE_0001}rasen${n}.png`),
        fps: RASEN_FPS,
        loop: false,
        heightRatio: 0.88,
      },
      rasenConfirm: {
        frames: [7, 8].map((n) => `${BASE_0001}rasen${n}.png`),
        fps: RASEN_FPS,
        loop: false,
        heightRatio: 0.79,
      },
      rasenExplosion: {
        frames: [`${BASE_0001}rasen9.png`],
        fps: RASEN_FPS,
        loop: false,
        heightRatio: 0.77,
      },
      rasenRelease: {
        frames: [10, 11, 12].map((n) => `${BASE_0001}rasen${n}.png`),
        fps: RASEN_FPS,
        loop: false,
        heightRatio: 1,
      },
      rasenWhiffRelease: {
        frames: [`${BASE_0001}rasen12.png`],
        fps: RASEN_FPS,
        loop: false,
        heightRatio: 1,
      },
    },

    // Projectile art, kept apart from the fighter poses above: it is
    // normalized at its own size around a centre anchor, never scaled to the
    // fighter's height (see SpriteSet.build). Frames loop while it flies.
    // `sourceFacing` is the way the art travels; it is mirrored when thrown
    // the other way. Left out, the art is treated as direction-neutral.
    projectileAnimations: {
      // Three rotations of one shuriken, spinning clockwise: rolling
      // forward when thrown right, so it is mirrored when thrown left.
      shuriken: {
        frames: frames(BASE_0001, 'shuriken', 3),
        fps: SHURIKEN_FPS,
        loop: true,
        sourceFacing: 1,
      },
    },

    // Effect art: not a fighter pose and not a projectile. Normalized like
    // projectile art (own size, centre anchor, the fighter's art-pixel
    // scale, never fitted to the fighter's height) and drawn by whatever
    // uses it. `sourceFacing: 0` marks direction-neutral art: never mirrored.
    effectAnimations: {
      // The smoke cloud a summoned clone appears from and vanishes into:
      // played 1 -> 10 once as it appears, then the same frames 10 -> 1 as it
      // vanishes (reversed at runtime, never duplicated on disk).
      cloneCloud: {
        frames: frames(BASE_0001, 'cloneav', 10),
        fps: CLONE_CLOUD_FPS,
        loop: false,
        sourceFacing: 0,
      },
      // The Sphere Rush's blue sphere (prasen1-11), split into three clips:
      // rasenSphereBuild forms it in the hand (prasen1-6, once),
      // rasenSphereImpact is the sphere spinning on the caught opponent
      // (prasen7 -> 8 -> 9, looped until it explodes, drawn ever smaller by
      // the technique's sphereGrowth) and rasenSphereExplosion is the
      // delayed blast (prasen10-11, the lighter, brighter frames, once). A
      // round effect: never mirrored.
      rasenSphereBuild: {
        frames: frames(BASE_0001, 'prasen', 6),
        fps: PRASEN_FPS,
        loop: false,
        sourceFacing: 0,
      },
      rasenSphereImpact: {
        frames: [7, 8, 9].map((n) => `${BASE_0001}prasen${n}.png`),
        fps: PRASEN_FPS,
        loop: true,
        sourceFacing: 0,
      },
      rasenSphereExplosion: {
        frames: [10, 11].map((n) => `${BASE_0001}prasen${n}.png`),
        fps: PRASEN_FPS,
        loop: false,
        sourceFacing: 0,
      },
    },

    // Projectile behaviour, keyed by id. See js/game/projectile.js for the
    // schema (createProjectileDefinition). The hitbox is centred on the
    // projectile and mirrors with its direction; the combat fields resolve
    // exactly like an attack's (CombatSystem.applyHit). One hit at most.
    projectiles: {
      shuriken: {
        animation: 'shuriken',
        speed: 700,
        lifetime: 1.5,
        hitbox: { x: -5, y: -5, w: 10, h: 10 },
        // Adds 1 to the target's Launch Point. Base Launch 0 and no
        // direction: never a launching hit. It adds its damage and stun
        // without pushing or launching the target, at any Launch Point.
        damage: 1,
        baseLaunch: 0,
        directionalLaunch: null,
        hitstun: 0.16,
        blockstun: 0.1,
        hitstop: 0.04,
      },
    },

    // A still idle frame for the airborne, landing, hurt and charge clips if
    // their frames fail to load. `frame` holds a single frame instead of
    // looping, so the fighter never stretches or rotates to fake a pose.
    // Attacks, the Shield and the Dash never fall back: one whose frames are
    // missing is refused (see Fighter.tryAction, shieldAllowed and tryDash).
    animationFallbacks: {
      jump: { animation: 'idle', frame: 0 },
      fall: { animation: 'idle', frame: 0 },
      land: { animation: 'idle', frame: 0 },
      hurt: { animation: 'idle', frame: 0 },
      midairHurt: { animation: 'idle', frame: 0 },
      chargeStart: { animation: 'idle', frame: 0 },
      chargeLoop: { animation: 'idle', frame: 0 },
    },

    visual: {
      // World-unit height of the tallest frame of the reference animation.
      height: 88,
      referenceAnimation: 'idle',
      // Horizontal anchor: 'torso' uses the opaque-pixel centroid of the upper
      // body so the character doesn't slide between frames/animations.
      // 'center' uses the visible bounding box centre.
      anchor: 'torso',
      // 'auto' detects upscaled pixel-art grids. A number forces a size.
      pixelSize: 'auto',
      // Roster portrait crop (fractions of the normalized idle frame).
      portrait: { animation: 'idle', frame: 0, centerY: 0.24, size: 0.5 },
    },

    // Powers, each owned at one tier. The tier tables in js/data/powers.js
    // turn these into gameplay values: Jump Power 2 is the normal jump and
    // Speed Power 2 the normal top speed, the only sources of this fighter's
    // jump strength and movement speed. (Launch is not a Power: Base Launch
    // and Directional Launch belong to each hit below.)
    powers: {
      jump: 2,
      speed: 2,
    },

    // Every other movement stat. The top speed is Speed Power's; a Dash
    // never changes it, it owns the horizontal speed for its own length.
    movement: {
      acceleration: 2600,
      deceleration: 3200,
      turnBoost: 1.6,
      airAcceleration: 1500,
      airDeceleration: 420,
      gravityScale: 1,
      maxFallSpeed: 1500,
      coyoteTime: 0.08,
      jumpBuffer: 0.12,
      // Used only by the training CPU's platform drop; see Fighter.update.
      dropThroughTime: 0.28,
      // Dash: two presses of the same direction (left or right), the second
      // within dashTapWindow seconds of the first, start a grounded burst at
      // dashSpeed (about 2.7x the top speed) for one pass of the dash clip:
      // 0.2 s, about 180 units on open ground.
      dashSpeed: 900,
      dashTapWindow: 0.22,
    },

    // Collision is independent from sprite/PNG dimensions.
    collider: { width: 34, height: 80 },
    pushbox: { width: 36 },
    hurtboxes: [
      { x: -15, y: -80, w: 30, h: 34 }, // upper body
      { x: -17, y: -46, w: 34, h: 46 }, // lower body
    ],

    stats: {
      // Charged actions' cooldowns (summons.ba1Clone, chargedTechniques.
      // rasenRush) recover this many seconds per second while the fighter
      // is actually in Charge; 1 per second otherwise.
      chargedCooldownRate: 2,
    },

    // Energy (see resolveEnergy in js/game/combat.js): 100 at most, shown
    // over the fighter's head as a bright purple bar while below full,
    // spent only by Dash (dashCost, as it starts) and Shield (shieldHitCost,
    // for each hit it blocks; holding it is free). Either still works with
    // less left than it costs, but then takes all of it. It refills by
    // itself at `regen` per second, at `chargeRegen` while in Charge (apart
    // from, and on top of, Charge's faster charged cooldowns). Emptied, it
    // turns gray: no Dash or Shield until it is full again.
    energy: {
      max: 100,
      regen: 12,
      chargeRegen: 30,
      dashCost: 15,
      shieldHitCost: 25,
    },

    // What the shared Defense input (L, RB / RT, the touch Shield button)
    // does for this fighter. #0001 shields: held Defense keeps a Shield up
    // all round him, `groundAnimation` on the ground (raised by
    // `groundStartAnimation`, lowered by `groundReleaseAnimation`) and
    // `airAnimation` in the air, where he keeps falling. Every hit it
    // blocks costs energy.shieldHitCost and deals nothing else: no Launch
    // Point, no launch (see createDefenseDefinition and
    // CombatSystem.applyHit in js/game/combat.js).
    defense: {
      type: 'shield',
      groundAnimation: 'shield',
      groundStartAnimation: 'shieldStart',
      groundReleaseAnimation: 'shieldRelease',
      airAnimation: 'midairShield',
    },

    // Controller actions -> attack ids. A string is one attack; { ground, air }
    // picks by whether the fighter is grounded when the button is pressed.
    // Null means the input is wired but reserved: no artwork, no attack.
    actions: {
      primary: 'throw', // Throw (the player-facing name of primary)
      special: null,
      action1: { ground: 'ba1', air: 'midairBa1' }, // Basic Attack 1 (BA1)
      action2: { ground: 'ba2', air: 'midairBa2' }, // Basic Attack 2 (BA2)
    },

    // How the touch controls present this fighter's own buttons: an icon
    // (a key of ICONS in js/ui/icons.js) and an accessible name for each.
    // UI only (see js/ui/mobile-abilities.js): the buttons still send
    // primary, action1 and action2, and nothing here reaches combat. Each
    // names the button's ability family, not every move it makes: Punch is
    // also the mid-air kunai slash, and with Charge held the Clone Attack.
    // The Shield, Special, Jump and movement buttons are universal.
    mobileAbilities: {
      primary: { label: 'Shuriken', icon: 'shuriken' },
      action1: { label: 'Punch', icon: 'punch' },
      action2: { label: 'Kick', icon: 'kick' },
    },

    // Charged actions: what a combat button does when pressed while the
    // fighter is already Charging (since an earlier step) and still holding
    // Charge, instead of its normal attack. Each is typed: a `summon` (see
    // `summons`) sends out a detached entity while the fighter keeps
    // charging; a `technique` (see `chargedTechniques`) is performed by the
    // fighter itself. Each has its own cooldown (the summon's or technique's
    // `cooldown`), started when it is used, hit or miss; a press while it is
    // still cooling down does nothing at all. If it cannot happen for another
    // reason (no opponent, missing art), the press falls through to the
    // button's normal attack.
    // Their cooldowns show under the fighter as CAB1 and CAB2.
    chargedActions: {
      action1: { type: 'summon', id: 'ba1Clone' }, // Charged BA1 (CAB1): Clone Attack
      action2: { type: 'technique', id: 'rasenRush' }, // Charged BA2 (CAB2): Sphere Rush
    },

    // Summons, keyed by id. See js/game/clone.js for the schema
    // (createSummonDefinition). A clone is a temporary attack entity, not a
    // fighter: it appears through the `cloud` effect, performs one of the
    // owner's attacks once with that attack's own art and combat data, then
    // vanishes through the same cloud played in reverse. Normally it appears
    // behind the opponent and performs `attack`; with nothing to stand on
    // there at the opponent's foot height, the optional `noGround` fallback
    // places it and picks its attack instead.
    summons: {
      ba1Clone: {
        attack: 'ba1',
        cloud: 'cloneCloud',
        // Seconds before Charged BA1 can be used again, from the moment the
        // summon is accepted, whichever way it appears and whether or not it
        // hits. Its hit is the attack's own: 5 as BA1, 10 as mid-air BA2.
        cooldown: 5,
        // World units behind the opponent (on its back side) at the summon;
        // BA1's punch reaches forward from there into the opponent.
        behindDistance: 48,
        // Cloud centre from the clone's origin (bottom-centre), facing right:
        // half the fighter's visual height, so the smoke wraps the body.
        effectOffset: { x: 0, y: -44 },
        // No ground behind the opponent at its foot height (past a platform's
        // edge, or the opponent is airborne): the clone appears over it
        // instead and performs the mid-air BA2 kick, driving it downward.
        // `offset` is the clone's origin from the opponent's (facing right,
        // mirrored): feet at its upper body, where midairBa2's own hitbox
        // lands on its hurtboxes.
        noGround: {
          attack: 'midairBa2',
          offset: { x: 0, y: -36 },
        },
      },
    },

    // Charged techniques, keyed by id. See js/game/charged-technique.js for
    // the schema (createTechniqueDefinition) and the phases. Not an attack, a
    // projectile or a summon: #0001 performs it himself.
    chargedTechniques: {
      // Charged BA2, the Sphere Rush. The sphere forms in #0001's rear palm
      // (rasenForm + rasenSphereBuild, 0.5 s), then he rushes forward for one
      // pass of rasenDash (0.25 s, about 262 world units) carrying it behind
      // him and swinging it forward on rasen6. It must connect during that
      // rush: a miss stops him and he lets the sphere go on the
      // rasenWhiffRelease pose (rasen12, one frame) before he is free. A hit
      // binds the opponent (no damage of its own) and the sphere moves onto
      // it, spinning there (prasen7-9 looped) while rasenConfirm plays
      // rasen7 -> rasen8 and holds rasen8 as the sphere shrinks. While it is
      // held, 1 Launch Point is added at once on the hit's own step and then
      // every 0.5 s, with no launch (0, 0.5, 1 and 1.5 s after the hit). 2 s
      // after the hit it explodes (prasen10-11) while #0001 is on
      // rasenExplosion (rasen9): 15 more Launch Point, then Base Launch 3
      // sideways, which releases the opponent (19 damage in all: 4 ticks and
      // the blast); once the blast is over he recovers through rasenRelease
      // (rasen10-12). The whole technique needs ground under #0001. A
      // Shield blocks the contact: no bind, tick or explosion, and the rush
      // ends there.
      rasenRush: {
        formAnimation: 'rasenForm',
        dashAnimation: 'rasenDash',
        confirmAnimation: 'rasenConfirm',
        explosionAnimation: 'rasenExplosion',
        releaseAnimation: 'rasenRelease',
        whiffReleaseAnimation: 'rasenWhiffRelease',
        sphereBuild: 'rasenSphereBuild',
        sphereImpact: 'rasenSphereImpact',
        sphereExplosion: 'rasenSphereExplosion',
        // Seconds before Charged BA2 can be used again, from the moment the
        // rush starts forming: spent on a hit, a miss, a wall or an
        // interruption alike.
        cooldown: 5,
        // World units per second, in the facing snapshotted at the start.
        dashSpeed: 1050,
        // Sphere centre from #0001's origin (bottom-centre), facing right,
        // one per frame: the rear palm in rasen1-5 (the fist in rasen1, the
        // open palm in rasen2-3, trailing behind in rasen4-5), then the hand
        // at the end of the forward swing in rasen6.
        handOffsets: {
          rasenForm: [{ x: -15, y: -47 }, { x: -25, y: -42 }, { x: -25, y: -42 }],
          rasenDash: [{ x: -32, y: -51 }, { x: -34, y: -51 }, { x: 32, y: -47 }],
        },
        // Around the sphere centre: the visible orb of the complete sphere.
        sphereHitbox: { x: -24, y: -24, w: 48, h: 48 },
        // Sphere centre from the opponent's origin once it hits (x along
        // the rush): over the caught opponent's body.
        targetOffset: { x: 0, y: -48 },
        // Seconds from the hit to the explosion.
        explosionDelay: 2.0,
        // The sphere on the opponent, drawn at three times its own art size
        // from the hit, shrinks steadily through the rasen8 hold back to its
        // own size as it explodes, the growth reversed: it closes in on the
        // opponent, and the blast bursts at that size. Visual only:
        // sphereHitbox, hurtboxes and every hit stay as they are.
        sphereGrowth: { startScale: 3, endScale: 1 },
        // The sphere's contact: the setup, no damage and no launch. The bind
        // that follows (not this hitstun) is what holds the opponent; its
        // first tickHit lands on this same step.
        firstHit: {
          damage: 0,
          baseLaunch: 0,
          directionalLaunch: null,
          hitstun: 0.2,
          blockstun: 0.15,
          hitstop: 0.06,
        },
        // While the opponent is held, before the explosion: one tickHit on
        // the contact's own step, then one every tickInterval seconds since
        // it. Launch Point only: no launch, stun or freeze, so the hold never
        // stutters.
        tickInterval: 0.5,
        tickHit: {
          damage: 1,
          baseLaunch: 0,
          directionalLaunch: null,
          hitstun: 0,
          blockstun: 0,
          hitstop: 0,
        },
        // The explosion: the big one, and the technique's only launching
        // hit. Its 15 damage is added first, then the target's new Launch
        // Point is tripled and sent sideways along the technique's facing.
        explosionHit: {
          damage: 15,
          baseLaunch: 3,
          directionalLaunch: 'horizontal',
          hitstun: 0.55,
          blockstun: 0.3,
          hitstop: 0.12,
        },
      },
    },

    // Attack definitions, keyed by id. See js/game/combat.js for the schema
    // (createAttackDefinition). Phases are whole frames of the attack's clip,
    // so the hitbox is live only while the strike is on screen. Hitboxes face
    // right from the fighter's origin (bottom-centre) and mirror with facing.
    // Each attack's `damage` is added to the target's Launch Point first;
    // its Base Launch then multiplies that new Launch Point and its
    // Directional Launch sends the result: ground BA1 pushes sideways (1,
    // horizontal), ground BA2 and mid-air BA1 launch upward (2, vertical)
    // and mid-air BA2 drives the target downward (2, reverse vertical).
    // Damage and Base Launch are authored separately: neither is derived
    // from the other.
    attacks: {
      // Frame 1 wind-up, frame 2 punch, frames 3-4 recovery.
      ba1: {
        animation: 'ba1',
        startup: 1 / BA1_FPS,
        active: 1 / BA1_FPS,
        recovery: 2 / BA1_FPS,
        damage: 5,
        baseLaunch: 1,
        directionalLaunch: 'horizontal',
        hitbox: { x: 12, y: -64, w: 28, h: 16 },
        hitstun: 0.22,
        blockstun: 0.14,
        hitstop: 0.06,
        cooldown: 0.1,
        groundOnly: true,
      },
      // Frames 1-2 wind-up (kunai drawn back, then overhead), frame 3 the
      // downward kunai slash. The clip has no recovery frame, so the attack
      // ends with it; the longer cooldown makes up for the missing recovery.
      // The hitbox covers the slash arc in front of the fighter, and it
      // launches the target upward. Chosen only by action1's `air` branch.
      midairBa1: {
        animation: 'midairBa1',
        startup: 2 / BA1_FPS,
        active: 1 / BA1_FPS,
        recovery: 0,
        damage: 5,
        baseLaunch: 2,
        directionalLaunch: 'vertical',
        hitbox: { x: 14, y: -100, w: 22, h: 80 },
        hitstun: 0.24,
        blockstun: 0.15,
        hitstop: 0.07,
        cooldown: 0.18,
      },
      // Frames 1-3 wind-up (step in, lead jab, spin), frames 4-5 the kick
      // (low sweep rising into a high kick, both drawn with motion trails),
      // frames 6-7 recovery (kick apex, settle). One hit per attack, so the
      // lead jab is part of the wind-up. The hitbox spans the kick's arc in
      // front of the fighter, knee height to overhead. Slower and heavier than
      // BA1, and it launches the opponent upward instead of pushing it away.
      ba2: {
        animation: 'ba2',
        startup: 3 / BA2_FPS,
        active: 2 / BA2_FPS,
        recovery: 2 / BA2_FPS,
        damage: 10,
        baseLaunch: 2,
        directionalLaunch: 'vertical',
        hitbox: { x: 10, y: -88, w: 24, h: 78 },
        hitstun: 0.24,
        blockstun: 0.15,
        hitstop: 0.07,
        cooldown: 0.15,
        groundOnly: true,
      },
      // Frames 1-2 wind-up, frame 3 kick (the forward-low arc), frames 4-5
      // recovery. Drives the target hard downward. Chosen only by action2's
      // `air` branch.
      midairBa2: {
        animation: 'midairBa2',
        startup: 2 / BA2_FPS,
        active: 1 / BA2_FPS,
        recovery: 2 / BA2_FPS,
        damage: 10,
        baseLaunch: 2,
        directionalLaunch: 'reverseVertical',
        hitbox: { x: 8, y: -44, w: 40, h: 40 },
        hitstun: 0.22,
        blockstun: 0.14,
        hitstop: 0.06,
        cooldown: 0.1,
      },
      // Frame 1 wind-up, frame 2 release, frame 3 follow-through. No melee
      // hitbox: the damage is the shuriken's (1), released once, as the attack
      // reaches frame 2, from the throwing hand (`offset` is from the
      // fighter's origin, facing right, and mirrors with facing).
      throw: {
        animation: 'throw',
        startup: 1 / THROW_FPS,
        active: 1 / THROW_FPS,
        recovery: 1 / THROW_FPS,
        hitbox: null,
        projectile: { id: 'shuriken', spawnAt: 1 / THROW_FPS, offset: { x: 16, y: -38 } },
        cooldown: 0.25,
        groundOnly: true,
      },
    },
  },
];

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || null;
}

// Every frame a character needs before battle: fighter poses, projectiles
// and effects, each file once (two clips may share one, e.g. #0001's
// rasen12 in rasenRelease and rasenWhiffRelease).
export function characterFramePaths(def) {
  const out = [];
  for (const anim of Object.values(def.animations)) out.push(...anim.frames);
  for (const anim of Object.values(def.projectileAnimations || {})) out.push(...anim.frames);
  for (const anim of Object.values(def.effectAnimations || {})) out.push(...anim.frames);
  return [...new Set(out)];
}
