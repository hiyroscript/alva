// Adventure (the Adventure update): Select Mode's first mode, thirty levels
// played in order against one CPU difficulty of its own, Venture, which
// grows with every level, and five Perquisites, permanent upgrades the
// player picks from two cards before the battles of levels 5, 10, 15, 20,
// 25 and 30.
//
// Everything Adventure decides is here: how many levels there are and which
// offer a Perquisite, how much smarter Venture is at each level, the
// Perquisites and their scaling, which two cards a milestone offers, and
// the modifiers (js/game/combat/modifiers.js) the player's fighter gets in
// an Adventure battle. The saved progress (the levels
// unlocked and cleared, the Perquisites owned, the milestones' offers and
// picks) lives in js/core/adventure-progress.js; the screens in
// js/screens/adventure-*.js. Nothing outside Adventure reads any of it: no
// other mode builds a modifier, and the combat engine reads only the
// modifiers the Battle hands each fighter, never this module.
//
// Venture
//
//   Level 1 is Easy exactly (js/data/difficulty.js). Every level, Venture is
//   VENTURE_SMARTS_GROWTH (1.5) times smarter than the level before: every
//   trait's distance from perfect play is divided by 1.5 (ventureProfile),
//   so its intelligence factor at level L is 1.5^(L-1). Perfect play is the
//   physical limit of each trait (VENTURE_LIMITS), never Brutal: a reaction
//   and a reassessment of at least two simulation steps, no lapse, no
//   noise, no misjudgement, no timing error, a full plan depth (4) and every
//   probability 1. By Level 6 it reacts faster than Brutal and plans as
//   deep, by Level 9 it matches or passes Brutal on 22 of its 24 traits, and
//   from Level 11 it is past Brutal on every trait but plan depth (4 for
//   both). No trait ever gets worse from one level to the next (the
//   CAPABILITY ordering).
//
//   Smarter is all it ever gets: Venture never scales a hit. Its fighter is
//   the same at every level as at any difficulty, with the same damage,
//   launch, speed, Energy and every other mechanic. A CPU has no Perquisite
//   and a difficulty has no modifier, so an Adventure battle gives the CPU's
//   side nothing (adventureModifiers): the identity's modifiers, which the
//   Battle insists on for a CPU (js/game/battle.js). Level 30 hits exactly
//   as hard as Level 1, and as Easy does in Quick Battle.
//
//   ventureProfile is the only place the smarts are computed: retune
//   VENTURE_SMARTS_GROWTH and everything (the CPU, the HUD's line, the
//   level selector's) follows.
//
// Perquisites
//
//   Five, each with five levels (I to V). Level n's effect is its base
//   times 1 + 0.5 x (n - 1) (PERQUISITE_LEVEL_STEP): I x1, II x1.5, III x2,
//   IV x2.5, V x3. An offer is always two different Perquisites, each at
//   the next level the player does not own yet (level I of one they do not
//   have); one at V never comes up again, and a level once owned never
//   does. The pair is drawn from the run's seed and the milestone's level
//   (perquisiteOffer), and saved with the milestone, so a reload shows the
//   same two cards.

import { CAPABILITY, getDifficultyProfile } from './difficulty.js';
import { LAUNCH_RECOVERY_AMOUNT, LAUNCH_RECOVERY_INTERVAL, LAUNCH_RECOVERY_DELAY } from './launch.js';
import { mulberry32, deriveSeed } from '../core/utils.js';

// ---- Levels -------------------------------------------------------------------------

export const ADVENTURE_LEVELS = 30;

// The levels whose first start offers a Perquisite.
export const PERQUISITE_MILESTONES = Object.freeze([5, 10, 15, 20, 25, 30]);

export function isAdventureLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= ADVENTURE_LEVELS;
}

export function isMilestone(level) {
  return PERQUISITE_MILESTONES.includes(level);
}

// A level as the interface writes it: two digits ("07").
export const levelLabel = (level) => String(level).padStart(2, '0');

// ---- Venture ------------------------------------------------------------------------

export const VENTURE_SMARTS_GROWTH = 1.5;

// The level Venture starts from.
export const VENTURE_BASE_DIFFICULTY = 'easy';

// The simulation step (CONFIG.timing.step): the shortest a reaction or a
// reassessment can physically be is two of them, never the step something
// starts on.
const STEP = 1 / 60;

// Perfect play, trait by trait: the bound each one closes in on. A trait
// where less is better (CAPABILITY -1) closes in on its floor, one where
// more is better (CAPABILITY 1) on its ceiling.
export const VENTURE_LIMITS = Object.freeze({
  react: 2 * STEP, think: 2 * STEP, lapse: 0, noise: 0, rangeError: 0, predictError: 0, timing: 0,
  // Seconds of the opponent's free motion it projects: past a second it is
  // a guess, however well read.
  lookahead: 1,
  planDepth: 4,
  comboReliability: 1, guard: 1, perfectShield: 1, punish: 1, adapt: 1, energySense: 1, riskSense: 1, stageSense: 1,
  opportunity: 1, diSkill: 1, recoverySkill: 1, initiative: 1, patience: 1, discipline: 1, awareness: 1,
});

const clampLevel = (level) => Math.min(ADVENTURE_LEVELS, Math.max(1, Math.floor(Number(level) || 1)));

// How much smarter Venture is at `level` than at Level 1: 1.5^(L-1).
export function ventureSmarts(level) {
  return VENTURE_SMARTS_GROWTH ** (clampLevel(level) - 1);
}

// One trait value `easy` moved toward its `limit` by `factor`: its distance
// divided by the factor.
const closer = (easy, limit, factor) => limit + (easy - limit) / factor;

const profiles = new Map();

// Venture's CPU profile at `level` (1 to 30; anything else is clamped): the
// same shape as a difficulty's (js/data/difficulty.js), every trait's
// distance from perfect play (VENTURE_LIMITS) divided by 1.5^(L-1). The plan
// depth is a whole number (rounded). Level 1 is Easy's profile exactly.
// Frozen, built once per level.
export function ventureProfile(level) {
  const lv = clampLevel(level);
  if (profiles.has(lv)) return profiles.get(lv);
  const easy = getDifficultyProfile(VENTURE_BASE_DIFFICULTY);
  if (lv === 1) {
    profiles.set(lv, easy);
    return easy;
  }
  const factor = ventureSmarts(lv);
  const out = {};
  for (const trait of Object.keys(CAPABILITY)) {
    const limit = VENTURE_LIMITS[trait];
    const value = easy[trait];
    // Each value lies between Easy's and its limit by construction, so a
    // probability stays within 0 to 1 and nothing passes its bound.
    if (Array.isArray(value)) out[trait] = Object.freeze(value.map((v) => closer(v, limit, factor)));
    else if (trait === 'planDepth') out[trait] = Math.round(closer(value, limit, factor));
    else out[trait] = closer(value, limit, factor);
  }
  const profile = Object.freeze(out);
  profiles.set(lv, profile);
  return profile;
}

// The difficulty spec for Venture at `level`, as getDifficultyProfile takes
// it ({ venture: level }): how well the CPU thinks, and nothing else.
export const ventureSpec = (level) => Object.freeze({ venture: clampLevel(level) });

// ---- Perquisites --------------------------------------------------------------------

export const PERQUISITE_MAX_LEVEL = 5;
export const PERQUISITE_LEVEL_STEP = 0.5;

// The five, in the order the interface lists them. `base` is level I's
// effect: a share for the percentages, Launch Points for Nearly Immortal.
//
//   braveSoldier           damage received down (the Launch Point real hits
//                          add to the player)
//   nearlyImmortal         Launch Points recovered per recovery tick up
//                          (LAUNCH_RECOVERY_AMOUNT, 2)
//   velociousImmuneSystem  recovery ticks come faster (LAUNCH_RECOVERY_INTERVAL,
//                          0.5 s, shortened; never the 2 s delay before
//                          recovery starts)
//   maximumEnergy          every Energy cost down (the Dash, the air dash,
//                          a blocked hit, the Deflect, every move's own)
//   redoutableStrength     damage dealt up (on the player's real hits)
export const PERQUISITES = Object.freeze([
  { id: 'braveSoldier', base: 0.08, unit: 'share' },
  { id: 'nearlyImmortal', base: 0.5, unit: 'points' },
  { id: 'velociousImmuneSystem', base: 0.08, unit: 'share' },
  { id: 'maximumEnergy', base: 0.08, unit: 'share' },
  { id: 'redoutableStrength', base: 0.08, unit: 'share' },
].map((p) => Object.freeze(p)));

export const PERQUISITE_IDS = Object.freeze(PERQUISITES.map((p) => p.id));

export const getPerquisite = (id) => PERQUISITES.find((p) => p.id === id) ?? null;

export const isPerquisite = (id) => PERQUISITE_IDS.includes(id);

// Level n's multiple of the base: 1 + 0.5 x (n - 1); 0 below level I.
export function perquisiteScale(n) {
  if (!(n >= 1)) return 0;
  return 1 + PERQUISITE_LEVEL_STEP * (Math.min(PERQUISITE_MAX_LEVEL, Math.floor(n)) - 1);
}

// Perquisite `id`'s effect at level `n` (0 for none): its base x the scale.
export function perquisiteEffect(id, n) {
  const p = getPerquisite(id);
  return p ? p.base * perquisiteScale(n) : 0;
}

// The modifiers a player owning `levels` ({ id: 0..5 }) fights with: the
// identity's but for what their Perquisites change.
export function perquisiteModifiers(levels = {}) {
  const at = (id) => perquisiteEffect(id, levels?.[id] ?? 0);
  return Object.freeze({
    damageTaken: 1 - at('braveSoldier'),
    recoveryAmountBonus: at('nearlyImmortal'),
    recoveryIntervalScale: 1 - at('velociousImmuneSystem'),
    energyCostScale: 1 - at('maximumEnergy'),
    damageDealt: 1 + at('redoutableStrength'),
  });
}

// The plain numbers a card states for `id` at level `n`: { percent } for a
// share (8 for 8 %), { points, total } for Nearly Immortal (0.5 more, 2.5 a
// tick), { percent, interval, normal, delay } for Velocious Immune System.
export function perquisiteNumbers(id, n) {
  const effect = perquisiteEffect(id, n);
  const percent = Math.round(effect * 100);
  if (id === 'nearlyImmortal') return { points: effect, total: LAUNCH_RECOVERY_AMOUNT + effect, normal: LAUNCH_RECOVERY_AMOUNT };
  if (id === 'velociousImmuneSystem') {
    return { percent, interval: LAUNCH_RECOVERY_INTERVAL * (1 - effect), normal: LAUNCH_RECOVERY_INTERVAL, delay: LAUNCH_RECOVERY_DELAY };
  }
  return { percent };
}

// I to V.
export const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V']);

// The Perquisites a player owning `levels` can still be offered: those
// below level V.
export function offerablePerquisites(levels = {}) {
  return PERQUISITE_IDS.filter((id) => (levels?.[id] ?? 0) < PERQUISITE_MAX_LEVEL);
}

// The two cards milestone `milestone` offers a player owning `levels`, from
// the run's `seed`: two different Perquisites below level V, drawn on the
// seed's stream for that milestone, so the same seed and milestone always
// draw the same pair. Each card is that Perquisite's next level
// (offerLevel). Fewer than two left (never, with six picks in a run over 25
// levels): what there is.
export function perquisiteOffer(levels, seed, milestone) {
  const pool = offerablePerquisites(levels);
  const rng = mulberry32(deriveSeed(seed >>> 0, 0x70657200 + milestone));
  const out = [];
  while (out.length < 2 && pool.length) {
    const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// The level of `id` an offer gives a player owning `levels`: one above
// what they have.
export function offerLevel(levels, id) {
  return Math.min(PERQUISITE_MAX_LEVEL, (levels?.[id] ?? 0) + 1);
}

// ---- An Adventure battle --------------------------------------------------------------

// The modifiers an Adventure battle hands its sides, at any level: the
// player's (p1) from the Perquisites they own (`levels`); the CPU's (p2)
// none, so the identity's at every level (Venture never scales a hit).
export function adventureModifiers(levels) {
  return Object.freeze({ p1: perquisiteModifiers(levels) });
}

// The numbers the interface shows for Venture at `level`: how many times
// smarter than at Level 1 (each language writes it to two decimals:
// ×11.39, ×11,39).
export function ventureNumbers(level) {
  return { smarts: ventureSmarts(level) };
}
