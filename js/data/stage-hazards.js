// Stage hazards that are not platforms: the tuning of the hazards a map lists
// under `hazards` (js/data/maps.js), each naming its behaviour by key
// (`behavior`). Pure data, read by the runtime in js/game/stage-hazards.js,
// so a future stage reuses a behaviour, or adds one here, without new code.
// (The drifting platforms a fighter stands on are a different kind of
// hazard: js/data/platform-hazards.js.)
//
// Times are seconds of simulation, distances world units (y down), each
// range [min, max] drawn uniformly from the hazard's own random stream.

import { createHit } from '../game/combat/hit-effects.js';

// The two states a volcano is ever in. Neither follows from the other: when
// a period ends, the next one is drawn at random (see VOLCANO.eruptChance),
// so a dormant spell can follow a dormant one and an eruption an eruption.
export const VOLCANO_STATES = Object.freeze({
  dormant: 'dormant',   // smoke and steam only: no rocks, no warnings
  erupting: 'erupting', // glowing, smoking and throwing rocks at the beach
});

// The visible phases inside an eruption, in order: art only (and when rocks
// may be thrown). They are never drawn at random: every eruption runs
// buildup → burst → active → cooldown over its length.
export const ERUPTION_PHASES = Object.freeze({
  buildup: 'buildup',   // the crater brightens, the smoke thickens: no rocks yet
  burst: 'burst',       // lava and smoke burst out: the first rocks fly
  active: 'active',     // sustained activity: more volleys
  cooldown: 'cooldown', // the plume dies down: no new rocks
});

// A volcanic rock's hit: a stage hazard's, never a fighter's (it has no
// owner, credits nobody and is never a projectile anyone can turn back).
// Both sizes deal 1 (the lightest tier): a large rock is no more damaging,
// only harder launching. Each launches straight up, Base Launch x the
// target's new Launch Point, through the shared launch rules
// (js/data/launch.js); a raised Shield blocks it like any hit.
const rockHit = (id, baseLaunch, extra) => createHit(id, {
  damage: 1, baseLaunch, directionalLaunch: 'vertical', ...extra,
}, `Volcanic rock "${id}"`);

// The two rocks. `radius` is the impact's reach on the sand (world units,
// the red warning's radius exactly), `height` how far above the sand the
// impact reaches (a fighter whose collider is wholly higher is missed: a
// rock lands, it does not fill a column of sky), `flight` how long it flies
// from the crater to the beach, `warning` how long before it lands its red
// circle shows, and `size` its drawn radius at the fighters' depth (art).
export const VOLCANIC_ROCKS = Object.freeze({
  small: Object.freeze({
    id: 'small',
    radius: 46,
    height: 110,
    flight: Object.freeze([2.1, 2.5]),
    warning: 1.1,
    size: 15,
    hit: rockHit('volcanic-rock-small', 1, { hitstun: 0.32, blockstun: 0.14, hitstop: 0.06 }),
  }),
  large: Object.freeze({
    id: 'large',
    radius: 72,
    height: 140,
    flight: Object.freeze([2.5, 2.9]),
    warning: 1.3,
    size: 26,
    hit: rockHit('volcanic-rock-large', 2, { hitstun: 0.38, blockstun: 0.18, hitstop: 0.09 }),
  }),
});

// The volcano: Adamaris's hazard. Tuned so an eruption is an event, not the
// weather: about two fifths of the periods are eruptions, each a handful of
// volleys of one to three rocks, every rock shown well over a second before
// it lands (against the universal 420 units / s run, enough to clear even a
// large rock's circle from its middle in about a third of that).
export const VOLCANO = Object.freeze({
  // How long each period lasts.
  dormantSeconds: Object.freeze([6, 11]),
  eruptingSeconds: Object.freeze([7, 11]),
  // The chance that the next period is an eruption, whatever this one was:
  // both outcomes are possible at every draw (never an alternation).
  eruptChance: 0.42,
  // The first period of a match (and of a preview): dormant, this long, so
  // nobody is struck before the fight has begun.
  openingDormantSeconds: Object.freeze([4, 7]),
  // An eruption's phases: its buildup and burst from the start, its
  // cooldown at the end (the rest is active). Rocks fly from the burst's
  // start until the cooldown.
  buildupSeconds: 1.4,
  burstSeconds: 0.6,
  cooldownSeconds: 1.8,
  // Seconds between volleys while rocks fly (the first comes as the burst
  // starts), and how many rocks each volley throws.
  volleyInterval: Object.freeze([1, 1.8]),
  volleyRocks: Object.freeze([1, 3]),
  // The chance each rock is a large one.
  largeChance: 0.35,
  // Rocks spread out: a rock lands at least this far (world units) past
  // the edge of every other rock's impact still to come within
  // `spacingWindow` seconds of it. Tried `placementAttempts` times, then
  // the best try is taken (never a loop).
  spacing: 30,
  spacingWindow: 0.9,
  placementAttempts: 10,
  // Where a rock's flight starts, relative to the crater (art: the theme
  // draws it there). `arc` is how high above the straight line from the
  // crater to the landing its path bows (world units).
  arc: Object.freeze([180, 320]),
  // How long an impact's effects last (art; the hit itself is one step).
  impactSeconds: 0.9,
});

// Behaviours by key (a map hazard's `behavior`).
export const STAGE_HAZARD_BEHAVIORS = Object.freeze({
  volcano: VOLCANO,
});
