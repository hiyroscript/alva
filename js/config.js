// Global, data-only configuration for Alva.
// Gameplay coordinates are logical world units; nothing here is in device pixels
// except where explicitly noted.

export const CONFIG = Object.freeze({
  title: 'ALVA',     // wordmark / document title
  name: 'Alva',      // product name in running text
  version: '0.1.0',
  developer: 'hiyroscript',

  render: {
    // Backing-buffer devicePixelRatio cap (performance on high-DPI phones).
    dprCap: 2,
    // Target on-screen fighter height as a fraction of the viewport height:
    // a platform-fighter view, far enough out for the whole main stage, the
    // air above it and open space past its ledges.
    fighterScreenRatio: 0.1,
    fighterScreenRatioMin: 0.088,
    fighterScreenRatioMax: 0.115,
    // The view is kept at least as wide as the main stage plus this much open
    // air past each ledge (world units): narrow screens zoom out further for
    // it, but never below fighterScreenRatioMin.
    stageFrameMargin: 100,
    // Snap sprite scale to whole device pixels per art pixel when the snapped
    // size stays inside the min/max ratio above.
    pixelPerfect: true,
  },

  sim: {
    step: 1 / 60,          // fixed simulation step (seconds)
    maxFrameDelta: 0.25,   // clamp for long frames / tab switches
    maxStepsPerFrame: 6,
    gravity: 2500,         // world units / s^2
  },

  splash: {
    fadeIn: 900,
    hold: 1600,
    fadeOut: 800,
    zoomFrom: 0.96,        // gentle forward zoom across the whole image phase
    zoomTo: 1.04,
    betweenImages: 220,
    finalBlackHold: 200,
    reducedMotionHold: 1000,
  },

  battle: {
    roundSeconds: 300,     // 5 minutes; set to 0 to disable the round timer
    introSeconds: 1.7,
    timeUpSeconds: 1.4,
    koSeconds: 1.4,        // the KO beat after the match-winning point, before the result
    // First to this many points wins: a point for each time the opponent
    // falls into the Void. The HUD shows one score dot per point.
    pointsToWin: 3,
    // Seconds a fighter the Void took stays out of play before it is back
    // at its spawn (Quick Battle, unless that fall ended the match, and
    // Practice Ground alike). Counted on the simulation clock.
    respawnSeconds: 2,
  },

  roster: {
    totalSlots: 48,
  },

  // Player 1 keyboard bindings (KeyboardEvent.code), the single source of
  // truth for gameplay keys, keyed by control codename. S / ↓ are Charge in
  // battle; menus read their own Down (and Left / Right) from menuBindings
  // below.
  // `shield` is the shared Shield button; each character's `defense` entry
  // decides what it does (#0001 holds it to Shield).
  bindings: {
    runLeft: ['KeyA', 'ArrowLeft'],
    runRight: ['KeyD', 'ArrowRight'],
    charge: ['KeyS', 'ArrowDown'],
    jump: ['KeyW', 'Space', 'ArrowUp'],
    uniqueba: ['KeyJ'],
    transform: ['KeyK'],
    shield: ['KeyL'],
    ba1: ['KeyU'],
    ba2: ['KeyI'],
    pause: ['Escape', 'KeyP'],
  },

  menuBindings: {
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    confirm: ['Enter', 'Space', 'KeyJ'],
    back: ['Escape', 'Backspace', 'KeyK'],
  },

  debug: {
    // Toggle collider / hurtbox / active-hitbox overlay in battle with this key.
    overlayKey: 'Backquote',
  },
});

export const ACTIONS = Object.freeze([
  'runLeft', 'runRight', 'charge', 'jump',
  'uniqueba', 'transform', 'shield', 'ba1', 'ba2',
  'pause',
]);

export const ACTION_LABELS = Object.freeze({
  runLeft: 'Move left',
  runRight: 'Move right',
  charge: 'Charge',
  jump: 'Jump',
  uniqueba: 'Throw', // #0001's unique basic attack is its shuriken Throw
  transform: 'Transform',
  shield: 'Shield',
  ba1: 'Basic Attack 1',
  ba2: 'Basic Attack 2',
  pause: 'Pause',
});
