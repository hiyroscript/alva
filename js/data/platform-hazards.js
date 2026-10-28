// Platform hazards: the tuning of dynamic one-way platforms a stage may
// have (a stage hazard you can stand on). Pure data, read by the runtime
// in js/game/platform-hazards.js; a map's dynamic platform names its
// behaviour by key (`dynamic.behavior`, see js/data/maps.js), so a future
// stage reuses a behaviour, or adds one here, without new code.
//
// A hazard is a platform, not a weapon: it never deals damage, stuns,
// launches or takes a fighter on contact. What makes it a hazard is that it
// will not stay put: it drifts, rests, fades out from under whoever stands
// on it and forms again somewhere else. Each one runs its own state machine
// on its own random stream (see HAZARD_STATES).
//
// Times are seconds of simulation, distances world units (y down), each
// range [min, max] drawn uniformly from the platform's own stream.

// Every state a hazard's controller can be in. The ordinary ones (it may
// pick any of these when one ends) are idle, horizontal, vertical and
// disappearing; once disappearing starts it always runs disappearing →
// hidden → reappearing, and then picks an ordinary state again.
export const HAZARD_STATES = Object.freeze({
  idle: 'idle',                 // still, collision on
  horizontal: 'horizontal',     // easing left or right, collision on
  vertical: 'vertical',         // easing up or down, collision on
  disappearing: 'disappearing', // fading out where it is, collision on
  hidden: 'hidden',             // invisible, no collision, relocating
  reappearing: 'reappearing',   // fading in where it relocated to
});

export const ORDINARY_STATES = Object.freeze([
  HAZARD_STATES.idle, HAZARD_STATES.horizontal, HAZARD_STATES.vertical, HAZARD_STATES.disappearing,
]);

// The drifting cloud: Asperitas's two hazards. Tuned against the universal
// movement (js/data/movement.js: 420 units / s run, a 112-unit jump, 242
// for the Super Jump, about 103 per air jump): it drifts at a fraction of
// a walk (at most about 110 units / s at the middle of its longest, fastest
// move), so a fighter keeps its feet and can always outrun it; and it
// fades for over half a second before it goes, long enough to see and jump.
export const CLOUD_DRIFT = Object.freeze({
  // How long each ordinary state lasts.
  idleSeconds: Object.freeze([1.5, 4]),
  moveSeconds: Object.freeze([2, 5]),
  // How far one move goes, eased in and out (a sine ease: it starts and
  // ends at rest, so every reversal is gradual).
  horizontalTravel: Object.freeze([60, 140]),
  verticalTravel: Object.freeze([35, 90]),
  // The disappearance: fading out (collision on until it has gone), then
  // hidden (no collision), then fading in at its new place.
  fadeOutSeconds: Object.freeze([0.5, 0.9]),
  hiddenSeconds: Object.freeze([1, 2.5]),
  fadeInSeconds: Object.freeze([0.5, 0.9]),
  // How likely each ordinary state is when the last one ends (relative
  // weights). Never disappearing straight after reappearing: a cloud that
  // has just formed stays at least one ordinary state.
  weights: Object.freeze({ idle: 3, horizontal: 3, vertical: 2.5, disappearing: 1.6 }),
  // A move shorter than this (the region's edge in the way both ways) is
  // not worth starting: the cloud idles instead.
  minTravel: 24,
  // How far from where it vanished a cloud tries to form again (between
  // the two rectangles' top-left corners), when its region allows: never
  // a token shuffle, always a visible relocation. Placements nearer than
  // this are taken only once every farther one has failed.
  minRelocation: 120,
  // Random candidate positions tried per attempt to place it, before the
  // fixed fallbacks (the region's corners and middle). Bounded: placement
  // can fail, never loop.
  placementAttempts: 16,
  // A placement that failed (a fighter in the way, nowhere clear) is tried
  // again after this long hidden, as often as it takes: the cloud waits
  // rather than forming into anyone.
  retrySeconds: 0.2,
  // The share of the fade-in at which collision comes back, if nothing is
  // in the way: the cloud is solid before it is fully opaque but never
  // while it is still faint. Until then (and for as long as a fighter is
  // inside it) it holds at this opacity, half-formed and not solid.
  solidAt: 0.55,
  // The cloud's volume around its collision slab (x to x + w, y to y + h),
  // for every separation and occupancy check: the puffs that rise above its
  // surface and hang below and past its ends. Kept clear of the other
  // platforms and of fighters, so the art never touches either.
  volume: Object.freeze({ side: 14, top: 22, bottom: 16 }),
  // Extra room kept between a forming cloud's volume and any fighter's
  // collider.
  fighterMargin: 10,
});

// Behaviours by key (a map's `dynamic.behavior`).
export const PLATFORM_BEHAVIORS = Object.freeze({
  'cloud-drift': CLOUD_DRIFT,
});
