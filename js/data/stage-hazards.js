// Stage hazards that are not platforms: the tuning of the hazards a map lists
// under `hazards` (js/data/maps.js), each naming its behaviour by key
// (`behavior`). Pure data, read by the runtime in js/game/stage-hazards.js,
// so a future stage reuses a behaviour, or adds one here, without new code.
// (The drifting platforms a fighter stands on are a different kind of
// hazard: js/data/platform-hazards.js.) Today: Adamaris's volcano, and
// Jökull's breakable ice sections and blizzard.
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

// ---- Jökull: the breakable ice sections ---------------------------------------

// How many qualifying contacts a breakable ice section takes: the one that
// reaches it starts the section breaking away. The one number to change to
// make the ice tougher or more fragile (ICE_SECTION.maxContacts).
export const MAX_ICE_CONTACTS = 15;

// The states a breakable ice section goes through, in order, never back:
// it never reforms in a match (only a new match, a rematch, builds it
// again). Its collision is on through `intact` and `critical`, and off from
// the very first step of `separating`.
export const ICE_SECTION_STATES = Object.freeze({
  intact: 'intact',         // standing, cracking further with each contact
  critical: 'critical',     // phase A, the critical fracture: shaking, cracks racing; still solid
  separating: 'separating', // phase B, structural separation: torn from the centre; no collision
  collapsing: 'collapsing', // phase C, the collapse: its pieces falling into the abyss
  destroyed: 'destroyed',   // gone for the rest of the match
});

// The damage a section shows, by how far its contacts have come (art, and
// what a CPU can read off it), in fifths of its durability: with 15
// contacts, 0 clean thick ice; 1–3 hairline fractures; 4–6 branching cracks
// and frost chips; 7–9 cracks across the top and the front face; 10–12 deep
// fractures and the inner seam opening; 13–14 critical instability (large
// cracks, trembling, and its whole span a danger zone the CPUs can see);
// 15 structural failure. Indexed by iceDamageLevel
// (js/game/stage-hazards.js).
export const ICE_DAMAGE_LEVELS = Object.freeze(['intact', 'hairline', 'branching', 'spreading', 'deep', 'unstable', 'failure']);

// A breakable ice section (Jökull's two wings): it takes one contact for
// every new footing a fighter takes on it (a landing of any kind, or
// stepping onto it from the centre: see IceSectionController), never one
// per step, and breaks away on its maxContacts-th. Tuned so the break is an
// unmistakable event that still never takes footing away without warning:
// a section shows its damage from the first contact, trembles through its
// last fifth (`unstable`, see ICE_DAMAGE_LEVELS), and once broken shakes for criticalSeconds while still solid
// (long enough to see and jump), then goes.
export const ICE_SECTION = Object.freeze({
  maxContacts: MAX_ICE_CONTACTS,
  // The break's three phases (seconds of simulation): A, still solid; B,
  // collision off from its first step; C, the pieces falling.
  criticalSeconds: 0.3,
  separationSeconds: 0.32,
  collapseSeconds: 1.1,
  // How long one contact's reaction plays (art: the stress highlight, the
  // local tremor, the chips thrown up).
  impactSeconds: 0.5,
  // The pieces it breaks into: `columns` across by three rows (the top
  // slab, its depth `slabDepth`, then the foundation in two), `shards`
  // small ones thrown out as it tears.
  columns: 3,
  slabDepth: 70,
  shards: 18,
  // The falling pieces' gravity (world units / s²), a share of it while
  // they only sag apart (phase B), how hard they are pushed out from the
  // centre (world units / s) and spun (radians / s).
  debrisGravity: 2400,
  separationGravity: 0.22,
  pushOut: Object.freeze([30, 110]),
  spin: Object.freeze([0.25, 1.1]),
  shardSpeed: Object.freeze([160, 420]),
  // How far past the Void's bottom a piece falls before it is dropped.
  cullBelow: 500,
  // How deep the jagged line it tears along cuts into the centre's face
  // (world units, never at its top: the walkable edge stays exactly where
  // the collision ends).
  tearDepth: 16,
  // A preview's demonstration (js/ui/stage-preview.js: no fighters there
  // to land): a contact every `contactSeconds` at a random place on the
  // section, until it breaks; restSeconds after it has gone, the preview
  // (never a match) builds it again and starts over.
  demo: Object.freeze({ contactSeconds: Object.freeze([0.35, 0.8]), restSeconds: 2.6 }),
});

// ---- Jökull: the blizzard ---------------------------------------------------------

// The chance that a weather check starts a blizzard, exactly: one draw per
// eligible check (BLIZZARD.checkSeconds apart while the weather is calm),
// never per step or per frame.
export const BLIZZARD_CHANCE = 0.25;

// The weather's states, always in this order: a successful check starts
// the warning, which builds into the blizzard, which clears back to calm.
// Only `calm` checks for the next one, so two blizzards can never overlap.
export const WEATHER_STATES = Object.freeze({
  calm: 'calm',         // ambient snow and wind; a check every checkSeconds
  warning: 'warning',   // the storm building: wind rising, snow thickening, fog drawing in
  blizzard: 'blizzard', // the whiteout at full strength
  clearing: 'clearing', // the storm dying back down to calm
});

// The blizzard: Jökull's visibility hazard. It never touches play: no
// damage, Launch Point, stun, push or pull, and it never touches the ice's
// durability. Only what the battle canvas shows changes (the theme), the
// HUD never. Tuned so a storm is an event, not the weather: one check in
// four starts one, a few times a match on average.
export const BLIZZARD = Object.freeze({
  chance: BLIZZARD_CHANCE,
  // The calm a match opens with, before its first check.
  openingCalmSeconds: Object.freeze([5, 8]),
  // Between two checks while calm (after a failed check, or a blizzard
  // that has cleared).
  checkSeconds: Object.freeze([12, 18]),
  // The three stages of a storm.
  warningSeconds: Object.freeze([1, 1.5]),
  blizzardSeconds: Object.freeze([6, 9]),
  clearingSeconds: Object.freeze([1, 1.5]),
  // A preview's demonstration (js/ui/stage-preview.js): a shorter calm and
  // a storm at every check, so the stage shows what it does. Never a match.
  demo: Object.freeze({
    openingCalmSeconds: Object.freeze([2.5, 3.5]),
    checkSeconds: Object.freeze([8, 11]),
    chance: 1,
  }),
});

// Behaviours by key (a map hazard's `behavior`).
export const STAGE_HAZARD_BEHAVIORS = Object.freeze({
  volcano: VOLCANO,
  'ice-section': ICE_SECTION,
  blizzard: BLIZZARD,
});
