// Character database.
//
// Adding a fighter (e.g. #0002) should only require:
//   1. dropping frames into ./assets/characters/<id>/
//   2. adding a definition to CHARACTERS below
//   3. giving it a rosterSlot
//
// Every field the engine reads lives here; nothing about #0001 is hard-coded
// in the game systems.

const frames = (base, name, count) =>
  Array.from({ length: count }, (_, i) => `${base}${name}${i + 1}.png`);

const BASE_0001 = './assets/characters/0001/0001_';

export const CHARACTERS = [
  {
    id: '0001',
    displayName: '#0001',
    available: true,
    rosterSlot: 0,

    // The source art faces right.
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
    },

    // States without dedicated art yet, plus a still idle frame for the
    // airborne and landing states if their frames fail to load. `frame` holds a
    // single frame instead of looping, so the fighter never stretches or rotates
    // to fake a pose.
    animationFallbacks: {
      jump: { animation: 'idle', frame: 0 },
      fall: { animation: 'idle', frame: 0 },
      land: { animation: 'idle', frame: 0 },
      crouch: { animation: 'idle' },
      block: { animation: 'idle' },
      hitstun: { animation: 'idle', frame: 0 },
      attack: { animation: 'idle' },
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

    movement: {
      maxSpeed: 330,
      acceleration: 2600,
      deceleration: 3200,
      turnBoost: 1.6,
      airAcceleration: 1500,
      airDeceleration: 420,
      jumpVelocity: 920,
      gravityScale: 1,
      maxFallSpeed: 1500,
      coyoteTime: 0.08,
      jumpBuffer: 0.12,
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
      blockDamageScale: 0.15,
    },

    // Controller actions -> attack ids. Null means the input is wired but no
    // attack exists yet (waiting on #0001 attack sprites).
    actions: {
      primary: null,
      special: null,
      action1: null,
      action2: null,
    },

    // Future attack definitions, keyed by id. See js/game/combat.js for the
    // schema (createAttackDefinition).
    attacks: {},
  },
];

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || null;
}

export function characterFramePaths(def) {
  const out = [];
  for (const anim of Object.values(def.animations)) out.push(...anim.frames);
  return out;
}
