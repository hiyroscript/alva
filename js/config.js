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
    // Target on-screen fighter height as a fraction of the viewport height.
    fighterScreenRatio: 0.16,
    fighterScreenRatioMin: 0.13,
    fighterScreenRatioMax: 0.195,
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
    roundSeconds: 99,      // set to 0 to disable the round timer
    introSeconds: 1.7,
    timeUpSeconds: 1.4,
  },

  roster: {
    totalSlots: 48,
  },

  // Player 1 keyboard bindings (KeyboardEvent.code). The Help screen renders
  // these directly, so this table is the single source of truth. S / ↓ are
  // Charge in battle; menus read their own Down from menuBindings below.
  // `defense` is the shared Defense input; each character decides what it
  // does (#0001 dodges).
  bindings: {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    charge: ['KeyS', 'ArrowDown'],
    jump: ['KeyW', 'Space', 'ArrowUp'],
    primary: ['KeyJ'],
    special: ['KeyK'],
    defense: ['KeyL'],
    action1: ['KeyU'],
    action2: ['KeyI'],
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
  'left', 'right', 'charge', 'jump',
  'primary', 'special', 'defense', 'action1', 'action2',
  'pause',
]);

export const ACTION_LABELS = Object.freeze({
  left: 'Move left',
  right: 'Move right',
  charge: 'Charge',
  jump: 'Jump',
  primary: 'Primary',
  special: 'Special',
  defense: 'Defense',
  action1: 'Basic Attack 1',
  action2: 'Basic Attack 2',
  pause: 'Pause',
});

const KEY_NAMES = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'Space', Escape: 'Esc', Enter: 'Enter', Backspace: 'Backspace',
  Backquote: '`',
};

export function keyLabel(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
