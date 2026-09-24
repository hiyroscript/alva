// Character database.
//
// Adding a fighter (e.g. #0002) should only require:
//   1. dropping frames into ./assets/characters/<id>/
//   2. adding a definition to CHARACTERS below, including its Power tiers
//      (`powers`, see js/data/powers.js)
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
// Playback rate of both Dodge clips. The Dodge phases below are whole frames
// at this rate, so the invulnerable window stays on the evasive art.
const DODGE_FPS = 12;
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

    // The source art faces right. A clip drawn the other way overrides this
    // with its own `sourceFacing` (see midairDodge); it only decides whether
    // the sprite is mirrored, never the fighter's facing or its boxes.
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
      ba1: {
        frames: frames(BASE_0001, '1ba', 4),
        fps: BA1_FPS,
        loop: false,
        heightRatio: 1.04,
      },
      midairBa1: {
        frames: frames(BASE_0001, 'midair1ba', 5),
        fps: BA1_FPS,
        loop: false,
        heightRatio: 1.08,
      },
      // Basic Attack 2 (BA2), ground and mid-air. Played once, like BA1.
      ba2: {
        frames: frames(BASE_0001, '2ba', 7),
        fps: BA2_FPS,
        loop: false,
        heightRatio: 1.02,
      },
      midairBa2: {
        frames: frames(BASE_0001, 'midair2ba', 3),
        fps: BA2_FPS,
        loop: false,
        heightRatio: 1.29,
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
      // Dodge, #0001's Defense: `dodge` on the ground, `midairDodge` in the
      // air. Each plays once per Defense press; the `defense` entry below
      // times the invulnerable frames to this art. dodge3 happens to be the
      // same image as charge1; it is still the Dodge's own recovery frame.
      dodge: {
        frames: frames(BASE_0001, 'dodge', 3),
        fps: DODGE_FPS,
        loop: false,
        heightRatio: 1,
      },
      // The mid-air Dodge art is drawn facing left, unlike the rest of #0001.
      midairDodge: {
        frames: frames(BASE_0001, 'midairdodge', 3),
        fps: DODGE_FPS,
        loop: false,
        heightRatio: 0.96,
        sourceFacing: -1,
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
      // split into three clips, each played once by its own technique phase
      // (see chargedTechniques.rasenRush). rasenForm: the rear palm opens
      // for the sphere to form in. rasenDash: the rush, sphere carried
      // behind, swung forward on rasen6. rasenConfirm: the palm driven into
      // the opponent, then the recovery; only a hit ever shows it. Faces
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
        frames: [7, 8, 9, 10, 11, 12].map((n) => `${BASE_0001}rasen${n}.png`),
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
      // The Sphere Rush's blue sphere (prasen1-11), split into three one-shot
      // clips: rasenSphereBuild forms it in the hand (prasen1-6),
      // rasenSphereImpact intensifies it on the opponent after a hit
      // (prasen7-9, then held on prasen9) and rasenSphereExplosion is the
      // delayed blast (prasen10-11). A round effect: never mirrored.
      rasenSphereBuild: {
        frames: frames(BASE_0001, 'prasen', 6),
        fps: PRASEN_FPS,
        loop: false,
        sourceFacing: 0,
      },
      rasenSphereImpact: {
        frames: [7, 8, 9].map((n) => `${BASE_0001}prasen${n}.png`),
        fps: PRASEN_FPS,
        loop: false,
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
        damage: 4,
        knockback: { x: 140, y: 0 },
        hitstun: 0.16,
        blockstun: 0.1,
        hitstop: 0.04,
      },
    },

    // A still idle frame for the airborne, landing, hurt and charge clips if
    // their frames fail to load. `frame` holds a single frame instead of
    // looping, so the fighter never stretches or rotates to fake a pose.
    // Attacks and Dodges never fall back: one whose frames are missing is
    // refused (see Fighter.tryAction and Fighter.tryDefense).
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

    // Gameplay Powers, each owned at one tier. The tier tables in
    // js/data/powers.js turn these into gameplay values: Jump Power 2 is the
    // normal jump, and the only source of this fighter's jump strength.
    powers: {
      jump: 2,
    },

    movement: {
      maxSpeed: 330,
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
    },

    // Collision is independent from sprite/PNG dimensions.
    collider: { width: 34, height: 80 },
    pushbox: { width: 36 },
    hurtboxes: [
      { x: -15, y: -80, w: 30, h: 34 }, // upper body
      { x: -17, y: -46, w: 34, h: 46 }, // lower body
    ],

    stats: {
      health: 100,
      // Energy capacity. Fighters start full. #0001's Charged BA1 Clone
      // Attack costs 25 (summons.ba1Clone); no Energy regeneration or gain
      // exists yet.
      energy: 100,
    },

    // What the shared Defense input (L, RB / RT, touch D) does for this
    // fighter. #0001 dodges: each new press plays one Dodge, `ground` or `air`
    // by whether it is grounded at the press. Phases are whole frames of the
    // clip (see createDefenseDefinition in js/game/combat.js); attacks pass
    // through only during `invulnerable`. On the ground that is dodge2, the
    // side-on lean away (dodge1 braces, dodge3 settles back). In the air it is
    // midairdodge1-2, the frames drawn breaking up into afterimages
    // (midairdodge3 is solid again). A future blocking fighter would use
    // { type: 'block' } instead, with stats.blockDamageScale for chip damage.
    defense: {
      type: 'dodge',
      ground: {
        animation: 'dodge',
        startup: 1 / DODGE_FPS,
        invulnerable: 1 / DODGE_FPS,
        recovery: 1 / DODGE_FPS,
      },
      air: {
        animation: 'midairDodge',
        startup: 0,
        invulnerable: 2 / DODGE_FPS,
        recovery: 1 / DODGE_FPS,
      },
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

    // Charged actions: what a combat button does when pressed while the
    // fighter is already Charging (since an earlier step) and still holding
    // Charge, instead of its normal attack. Each is typed: a `summon` (see
    // `summons`) sends out a detached entity while the fighter keeps
    // charging; a `technique` (see `chargedTechniques`) is performed by the
    // fighter itself. If it cannot happen (too little Energy, missing art),
    // the press falls through to the button's normal attack.
    chargedActions: {
      action1: { type: 'summon', id: 'ba1Clone' }, // Charged BA1: Clone Attack
      action2: { type: 'technique', id: 'rasenRush' }, // Charged BA2: Sphere Rush
    },

    // Summons, keyed by id. See js/game/clone.js for the schema
    // (createSummonDefinition). A clone is a temporary attack entity, not a
    // fighter: it appears behind the opponent through the `cloud` effect,
    // performs the owner's `attack` once with that attack's own art and
    // combat data, then vanishes through the same cloud played in reverse.
    summons: {
      ba1Clone: {
        attack: 'ba1',
        cloud: 'cloneCloud',
        // Spent once, when the summon is accepted.
        energyCost: 25,
        // World units behind the opponent (on its back side) at the summon;
        // BA1's punch reaches forward from there into the opponent.
        behindDistance: 48,
        // Cloud centre from the clone's origin (bottom-centre), facing right:
        // half the fighter's visual height, so the smoke wraps the body.
        effectOffset: { x: 0, y: -44 },
        // Keeps the clone this far inside the stage's horizontal bounds.
        stageMargin: 17,
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
      // rush: a miss ends the technique. A hit (4) binds the opponent, the
      // sphere moves onto it and rasenConfirm plays; 2 s after the hit it
      // explodes for the big second hit (16, 20 in all), releasing and
      // launching the opponent. The whole technique needs ground under #0001.
      rasenRush: {
        formAnimation: 'rasenForm',
        dashAnimation: 'rasenDash',
        confirmAnimation: 'rasenConfirm',
        sphereBuild: 'rasenSphereBuild',
        sphereImpact: 'rasenSphereImpact',
        sphereExplosion: 'rasenSphereExplosion',
        // No Energy cost for now; the field is here so one can be set.
        energyCost: 0,
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
        // Hit 1, the sphere's contact: the setup, no launch. The bind that
        // follows (not this hitstun) is what holds the opponent.
        firstHit: {
          damage: 4,
          knockback: { x: 0, y: 0 },
          hitstun: 0.2,
          blockstun: 0.15,
          hitstop: 0.06,
        },
        // Hit 2, the explosion: the big one.
        explosionHit: {
          damage: 16,
          knockback: { x: 420, y: 220 },
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
    attacks: {
      // Frame 1 wind-up, frame 2 punch, frames 3-4 recovery.
      ba1: {
        animation: 'ba1',
        startup: 1 / BA1_FPS,
        active: 1 / BA1_FPS,
        recovery: 2 / BA1_FPS,
        damage: 6,
        hitbox: { x: 12, y: -64, w: 28, h: 16 },
        knockback: { x: 180, y: 0 },
        hitstun: 0.22,
        blockstun: 0.14,
        hitstop: 0.06,
        cooldown: 0.1,
        groundOnly: true,
      },
      // Frames 1-2 wind-up, frame 3 kick (the forward-low arc), frames 4-5
      // recovery. Chosen only by action1's `air` branch.
      midairBa1: {
        animation: 'midairBa1',
        startup: 2 / BA1_FPS,
        active: 1 / BA1_FPS,
        recovery: 2 / BA1_FPS,
        damage: 6,
        hitbox: { x: 8, y: -44, w: 40, h: 40 },
        knockback: { x: 180, y: 0 },
        hitstun: 0.22,
        blockstun: 0.14,
        hitstop: 0.06,
        cooldown: 0.1,
      },
      // Frames 1-3 wind-up (step in, lead jab, spin), frames 4-5 the kick
      // (low sweep rising into a high kick, both drawn with motion trails),
      // frames 6-7 recovery (kick apex, settle). One hit per attack, so the
      // lead jab is part of the wind-up. The hitbox spans the kick's arc in
      // front of the fighter, knee height to overhead. Slower and heavier than
      // BA1.
      ba2: {
        animation: 'ba2',
        startup: 3 / BA2_FPS,
        active: 2 / BA2_FPS,
        recovery: 2 / BA2_FPS,
        damage: 8,
        hitbox: { x: 10, y: -88, w: 24, h: 78 },
        knockback: { x: 220, y: 0 },
        hitstun: 0.24,
        blockstun: 0.15,
        hitstop: 0.07,
        cooldown: 0.15,
        groundOnly: true,
      },
      // Frames 1-2 wind-up (kunai drawn back, then overhead), frame 3 the
      // downward kunai slash. The clip has no recovery frame, so the attack
      // ends with it; the longer cooldown stops it being repeated faster than
      // ground BA2. The hitbox covers the slash arc in front of the fighter.
      // Chosen only by action2's `air` branch.
      midairBa2: {
        animation: 'midairBa2',
        startup: 2 / BA2_FPS,
        active: 1 / BA2_FPS,
        recovery: 0,
        damage: 8,
        hitbox: { x: 14, y: -100, w: 22, h: 80 },
        knockback: { x: 220, y: 0 },
        hitstun: 0.24,
        blockstun: 0.15,
        hitstop: 0.07,
        cooldown: 0.18,
      },
      // Frame 1 wind-up, frame 2 release, frame 3 follow-through. No melee
      // hitbox: the damage is the shuriken's, released once, as the attack
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
// and effects.
export function characterFramePaths(def) {
  const out = [];
  for (const anim of Object.values(def.animations)) out.push(...anim.frames);
  for (const anim of Object.values(def.projectileAnimations || {})) out.push(...anim.frames);
  for (const anim of Object.values(def.effectAnimations || {})) out.push(...anim.frames);
  return out;
}
