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
    // World height (units) of the fighter the ratios below are about:
    // #0001's visual.height. The view is sized for a fighter this tall
    // whoever is picked, so the stage frames the same for every fighter and
    // a taller or shorter one simply stands taller or shorter on it.
    fighterHeight: 88,
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
  // truth for gameplay keys, keyed by control codename. S / ↓ are the plain
  // `down` direction in battle (the fast fall, and steering a launch
  // downward); menus read their own Down (and Left / Right) from
  // menuBindings below.
  // `shield` is the shared Shield button; each character's `defense` entry
  // decides what it does (#0001 holds it to Shield).
  // The numbered attack buttons sit on the right hand: attack1 to attack3
  // along the row above J K L (U I O), attack4 and attack5 on the row below
  // it (M ,). A fighter only acts on the ones it has a button for (see
  // js/data/loadout.js): #0001 uses U, I, O and M (Punch, Kick, Clone Attack
  // and Sphere Rush).
  bindings: {
    runLeft: ['KeyA', 'ArrowLeft'],
    runRight: ['KeyD', 'ArrowRight'],
    down: ['KeyS', 'ArrowDown'],
    jump: ['KeyW', 'Space', 'ArrowUp'],
    extra_attack: ['KeyJ'],
    transform: ['KeyK'],
    shield: ['KeyL'],
    attack1: ['KeyU'],
    attack2: ['KeyI'],
    attack3: ['KeyO'],
    attack4: ['KeyM'],
    attack5: ['Comma'],
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

// The numbered attacks, in order: every character has attack1 and attack2
// and at most these five, each one a button of its own (see
// js/data/loadout.js).
export const NUMBERED_ATTACKS = Object.freeze(['attack1', 'attack2', 'attack3', 'attack4', 'attack5']);

// The combat buttons: one per numbered attack, the optional extra_attack
// and the reserved transform. Each maps to a move through the character's
// `actions`; shield, jump and the directions (down included) are held-state
// controls, read apart.
export const COMBAT_BUTTONS = Object.freeze(['extra_attack', 'transform', ...NUMBERED_ATTACKS]);

// The control codenames: universal, the same for every character.
export const ACTIONS = Object.freeze([
  'runLeft', 'runRight', 'down', 'jump',
  'extra_attack', 'transform', 'shield', ...NUMBERED_ATTACKS,
  'pause',
]);

// Neutral names of the controls, the same for every character. A
// character's own names for its buttons (its `mobileAbilities`, e.g.
// #0001's Shuriken, Punch and Kick) take their place where it has them.
export const ACTION_LABELS = Object.freeze({
  runLeft: 'Move left',
  runRight: 'Move right',
  down: 'Down',
  jump: 'Jump',
  extra_attack: 'Extra Attack',
  transform: 'Transform',
  shield: 'Shield',
  attack1: 'Attack 1',
  attack2: 'Attack 2',
  attack3: 'Attack 3',
  attack4: 'Attack 4',
  attack5: 'Attack 5',
  pause: 'Pause',
});

// The move codenames: universal, the same for every character. A
// character's moves are keyed by these (in its `attacks`, `summons` and
// `techniques`) whatever it calls them in game; its own ability names are
// per character. `number` is a numbered attack's (its `midair_` version
// shares it, `air` marking it), and `label` the neutral name, for a
// character with no name of its own. Nothing here says what a move does
// for a character: whether attack3 is an ordinary attack, a summon or a
// technique is the character's loadout (see js/data/loadout.js).
export const MOVES = Object.freeze({
  attack1: Object.freeze({ number: 1, air: false, label: 'Attack 1' }),
  midair_attack1: Object.freeze({ number: 1, air: true, label: 'Mid-air Attack 1' }),
  attack2: Object.freeze({ number: 2, air: false, label: 'Attack 2' }),
  midair_attack2: Object.freeze({ number: 2, air: true, label: 'Mid-air Attack 2' }),
  attack3: Object.freeze({ number: 3, air: false, label: 'Attack 3' }),
  midair_attack3: Object.freeze({ number: 3, air: true, label: 'Mid-air Attack 3' }),
  attack4: Object.freeze({ number: 4, air: false, label: 'Attack 4' }),
  midair_attack4: Object.freeze({ number: 4, air: true, label: 'Mid-air Attack 4' }),
  attack5: Object.freeze({ number: 5, air: false, label: 'Attack 5' }),
  midair_attack5: Object.freeze({ number: 5, air: true, label: 'Mid-air Attack 5' }),
  extra_attack: Object.freeze({ number: null, air: false, label: 'Extra Attack' }),
  transform: Object.freeze({ number: null, air: false, label: 'Transform' }),
});
