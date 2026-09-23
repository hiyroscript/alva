// Character database.
//
// Adding a fighter (e.g. #0002) should only require:
//   1. dropping frames into ./assets/characters/<id>/
//   2. adding a definition to CHARACTERS below
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
    },

    // States without dedicated art yet, plus a still idle frame for the
    // airborne, landing and hurt states if their frames fail to load. `frame`
    // holds a single frame instead of looping, so the fighter never stretches or
    // rotates to fake a pose. Attacks never fall back: an attack whose frames
    // are missing is refused (see Fighter.tryAction).
    animationFallbacks: {
      jump: { animation: 'idle', frame: 0 },
      fall: { animation: 'idle', frame: 0 },
      land: { animation: 'idle', frame: 0 },
      crouch: { animation: 'idle' },
      block: { animation: 'idle' },
      hurt: { animation: 'idle', frame: 0 },
      midairHurt: { animation: 'idle', frame: 0 },
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

    // Controller actions -> attack ids. A string is one attack; { ground, air }
    // picks by whether the fighter is grounded when the button is pressed.
    // Null means the input is wired but reserved: no artwork, no attack.
    actions: {
      primary: null,
      special: null,
      action1: { ground: 'ba1', air: 'midairBa1' }, // Basic Attack 1 (BA1)
      action2: null,
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
    },
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
