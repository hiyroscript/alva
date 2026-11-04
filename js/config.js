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
    // Reference fighter height (world units) the ratios below are about: a
    // fixed camera convention, not a requirement on any fighter. The view is
    // sized for a fighter this tall whoever is picked, so the stage frames
    // the same for every fighter and a taller or shorter one simply stands
    // taller or shorter on it. (88 is what 52 art pixels make at the
    // roster's common art-pixel size; no fighter's own height is read here.)
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
    // How much closer the battle camera sits than that whole-stage view:
    // one tuning point for every fighter and every map. It multiplies the
    // target fighter height and its min / max above, and relaxes the stage
    // fit by the same factor, so at a zoom above 1 the view follows the
    // fighters across the stage instead of always showing all of it (the
    // view still never shows past the map's camera bounds).
    cameraZoom: 1.35,
    // Snap sprite scale to whole device pixels per art pixel when the snapped
    // size stays inside the min/max ratio above.
    pixelPerfect: true,
  },

  // The smallest usable viewport Alva runs on (CSS pixels of the visible
  // area, visualViewport where the browser has one; js/core/screen-guard.js).
  // Smaller, a full-screen block says so and offers to install Alva. In a
  // browser tab the minimum is taller: a phone's tab loses its address bar
  // and toolbars, and even the largest phones' landscape tabs (about 330 to
  // 395 px tall) are too cramped for the touch controls, so every phone tab
  // is refused while every tablet (744 px tall and up) and desktop window
  // passes. Running as an installed app (standalone or fullscreen) the
  // whole screen is Alva's, so a phone whose screen is 360 px tall or more
  // in landscape (iPhone SE and up, most Android phones) passes. 640 wide
  // either way: any phone in landscape, never one held upright (that gets
  // a line asking to turn it, when turned it would fit).
  screen: {
    browser: { minWidth: 640, minHeight: 400 },
    installed: { minWidth: 640, minHeight: 360 },
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
    // The normal match clock of every Battle (Quick Battle and Watch Mode
    // alike): 5 minutes; 0 disables it.
    matchSeconds: 300,
    // The normal clock running out with the points level starts this much
    // overtime, the same match played on (scores, Launch Points and
    // everything in play kept) under a closing Void. 0: none, the Launch
    // Point decides at once.
    overtimeSeconds: 60,
    // How the Void closes in through overtime, linearly over its whole
    // length: its left and right edges in to `sideEndGap` world units past
    // each main-stage ledge, its bottom up to `bottomEndGap` below the main
    // stage's top (both measured at a fighter's centre, like
    // StageCollision.inVoid, and never closer than that), its top never.
    // Its drawn waves run up to `maxWaveSpeedMultiplier` times their
    // normal speed, easing in (1 + (max - 1) x progress squared).
    overtimeVoid: {
      sideEndGap: 120,
      bottomEndGap: 140,
      maxWaveSpeedMultiplier: 4,
    },
    introSeconds: 1.7,
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

  // Local Play's two players (js/screens/local-play-screens.js): Player 1
  // red, Player 2 blue, wherever either is identified (the setup steps, the
  // HUD, the markers over the fighters, the move HUDs, the Match Results).
  // The stylesheet's --player-1 / --player-2 (css/base.css) are the same two
  // tones; the canvas reads them here.
  localPlay: {
    colors: { p1: '#ff4d5e', p2: '#3d9bff' },
  },

  // Online Play (js/online/, js/screens/online-screens.js): rooms players
  // create and join through the room server (server/, a Cloudflare Worker),
  // then a peer-to-peer match between the two browsers
  // (docs/gameplay/online-play.md). Frozen: the game never changes it.
  online: Object.freeze({
    // The room server's address, scheme and host with no trailing slash:
    // the owner's deployed Worker (server/, deployed by Cloudflare from this
    // repository: docs/development/online-server.md), reached through its
    // pages.dev gateway (server/gateway/): the Worker has no public address
    // of its own. For a test against a
    // local `npx wrangler dev`, its address goes here for that test only.
    // Empty, or a server that does not answer, and Online Play ends at
    // "Online play is unavailable right now." The itch.io validator allows
    // this one host and no other (tools/itch/hosts.mjs).
    serverUrl: 'https://alva-online.pages.dev',
    // Steps between sampling the local player's input and playing it: the
    // time a frame has to reach the other browser before it is needed. The
    // match goes through a TURN relay, never straight to the other browser
    // (js/online/match-link.js: so neither player learns the other's
    // address), every frame sent at once. Each match chooses its own
    // (js/online/delay.js): the smallest that covers the trip the host's
    // browser measured to the other player and delayMarginMs, within
    // inputDelayRange (3 is 50 ms, 12 is 200 ms). inputDelay (7, about
    // 117 ms) is the delay when the trip could not be measured.
    inputDelay: 7,
    inputDelayRange: Object.freeze({ min: 3, max: 12 }),
    delayMarginMs: 15,
    // How often the host's browser pings the other in the room to measure
    // the trip: every pingIntervalMs until a dozen round trips are in, then
    // every pingRefreshMs.
    pingIntervalMs: 200,
    pingRefreshMs: 5000,
    // The modes a room can be created for, in order: Quick Battle alone for
    // now (the server allows the same list: server/src/rules.js).
    modes: Object.freeze(['quick-battle']),
    // How long the link through the relay may take (the relay's servers
    // asked of the room, then the connection) before "Couldn't connect to
    // your opponent", and how long a match waits for an opponent who
    // stopped answering before "Connection lost".
    connectTimeoutMs: 10000,
    disconnectGraceMs: 10000,
    // Each player's relay password lasts an hour (server/src/privacy.js),
    // and two players can stay in a room far longer, so between matches the
    // host's browser makes the link again once it is this old: well before
    // the password runs out, and with time left for one more match on it.
    linkRenewMs: 40 * 60 * 1000,
    // How long a match waits for the other browser's first input while
    // both load their fighters (slow connections load slowly).
    loadTimeoutMs: 30000,
    // The public rooms list refreshes this often while it is on screen.
    listRefreshMs: 5000,
    // Every this many steps both browsers compare a hash of the match
    // (js/online/state-hash.js): a difference ends it as a desync.
    hashInterval: 60,
    // How many unacknowledged input frames each packet carries again, so a
    // lost packet never stalls the match.
    resendWindow: 30,
    // The two players' tones online, the same as Local Play's (the host is
    // red, the guest blue): the HUD cards, markers and name tags.
    colors: Object.freeze({ p1: '#ff4d5e', p2: '#3d9bff' }),
  }),

  // Select Stage's roster: this many stage slots, laid out for all of them
  // from the start (six by four on a large display). The playable stages
  // (js/data/maps.js MAPS, in order) fill the first slots and every other
  // is an unavailable placeholder, so a new stage simply takes the next
  // one; the roster grows past this only once the stages outnumber it.
  stageRoster: {
    totalSlots: 24,
  },

  // Player 1 keyboard bindings (KeyboardEvent.code), the single source of
  // truth for gameplay keys, keyed by control codename. S / ↓ are the plain
  // `down` direction in battle (the fast fall, and steering a launch
  // downward); menus read their own Down (and Left / Right) from
  // menuBindings below.
  // `shield` is the shared Shield button; each character's `defense` entry
  // decides what it does (e.g. #0001 holds it to Shield; a fighter with no
  // `defense` does nothing on it).
  // The numbered attack buttons sit on the right hand: attack1 to attack3
  // along the row above J K L (U I O), attack4 and attack5 on the row below
  // it (M ,). A fighter only acts on the ones it has a button for (see
  // js/data/loadout.js): e.g. #0001 uses all five (U, I and O for the Jab,
  // Red and Maximum Blue, M and , for Unlimited Void and Hollow Purple),
  // #0002 U, I and O.
  bindings: {
    runLeft: ['KeyA', 'ArrowLeft'],
    runRight: ['KeyD', 'ArrowRight'],
    mouvementLeft: ['KeyQ'],
    mouvementRight: ['KeyE'],
    down: ['KeyS', 'ArrowDown'],
    jump: ['KeyW', 'Space', 'ArrowUp'],
    extra_attack: ['KeyJ'],
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
    // Online Play: on a desync, log both browsers' states to the console
    // (js/online/lockstep.js).
    online: false,
  },
});

// The numbered attacks, in order: every character has attack1 and attack2
// and at most these five, each one a button of its own (see
// js/data/loadout.js).
export const NUMBERED_ATTACKS = Object.freeze(['attack1', 'attack2', 'attack3', 'attack4', 'attack5']);

// The combat buttons: one per numbered attack and the optional
// extra_attack. Each maps to a move through the character's `actions`;
// shield, jump and the directions (down included) are held-state controls,
// read apart.
export const COMBAT_BUTTONS = Object.freeze([
  'extra_attack',
  ...NUMBERED_ATTACKS,
]);

// The control codenames: universal, the same for every character.
export const ACTIONS = Object.freeze([
  'runLeft', 'runRight', 'down', 'jump',
  'extra_attack', 'shield', ...NUMBERED_ATTACKS,
  'pause',
]);

// Neutral names of the controls, the same for every character. A
// character's own names for its buttons (its `mobileAbilities`, e.g.
// #0001's High Kick, Jab and Red) take their place where it has them.
export const ACTION_LABELS = Object.freeze({
  runLeft: 'Move left',
  runRight: 'Move right',
  down: 'Down',
  jump: 'Jump',
  extra_attack: 'Extra attack',
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
  extra_attack: Object.freeze({ number: null, air: false, label: 'Extra attack' }),
  // A fighter's Mash Combo partner (see js/data/mash-combo.js): a grounded
  // close-range strike with no button of its own, authored only by a
  // fighter whose buttons are all taken by moves of another kind, and
  // performed only as a turn of its Mash Combo.
  mash_attack: Object.freeze({ number: null, air: false, label: 'Mash attack' }),
});
