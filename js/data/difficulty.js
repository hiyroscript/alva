// Quick Battle and Watch Mode difficulty: how well the CPU thinks, never
// what its fighter is allowed to do.
//
// Each level is a profile read by CPU Intelligence
// (js/game/ai/cpu-intelligence/, driven by the CombatAIController in
// js/game/ai/combat-ai.js). All four levels run the same engine with the
// same capabilities: every move, the Dash and the air dash, the Shield, the
// Deflect, edge-guarding and recovery. A profile tunes only how well that
// engine observes, anticipates, evaluates, reacts, plans, adapts and
// executes. Nothing here reaches the fighter: damage, launch, speed, jumps,
// gravity, Dash, Shield, Energy and its costs, cooldowns, hitboxes, hitstun,
// blockstun, timing and every other mechanic are the character's own and
// the shared rules', and identical on every level (see Fighter in
// js/game/fighters/fighter.js). No module of the fighter or the combat
// engine reads a difficulty, and a profile holds only the traits below
// (CAPABILITY): no multiplier for any of those exists, so none can scale a
// hit.
//
// There is no exception. No difficulty and no mode scales a hit, Venture
// included: Adventure's own difficulty (js/data/adventure.js, the Adventure
// update) is a profile built from Easy's (getDifficultyProfile({ venture })),
// smarter level by level and nothing else, and a CPU's fighter always fights
// with the identity's per-fighter modifiers (js/game/combat/modifiers.js;
// the Battle refuses anything else for a CPU's side). A higher level is a
// smarter CPU, never one that hits harder.
//
// Profile traits (seconds and world units are simulation time and space):
//
//   react         [min, max] perception latency: how old the CPU's picture
//                 of its opponent is (resampled now and then within the
//                 window). Nothing the opponent does is seen before it has
//                 been on screen this long; never zero, so even Brutal
//                 needs a few frames.
//   lapse         chance a new opponent action (an attack, a throw, a jump,
//                 a whiff) is not recognized as something to answer.
//   think         [min, max] seconds between tactical reassessments (an
//                 urgent event always gets a look at once).
//   noise         relative jitter on every option's utility: how
//                 consistently the best option is the one chosen.
//   rangeError    world units of spacing misjudgement, either way.
//   predictError  fractional error on the projected motion of the
//                 opponent and its projectiles.
//   lookahead     seconds of the opponent's free motion it projects.
//   planDepth     how far its plans look: combo search depth, the jump arcs
//                 and recovery routes it weighs (1 to 4).
//   comboReliability  chance a follow-up it has found is executed in time.
//   timing        seconds of execution error on a timed press.
//   guard         defensive awareness: how fully a real threat is answered
//                 (Shield, Deflect, a jump or a step away) and how well.
//   perfectShield chance it times a perfect Shield against a hit it saw
//                 coming (always within its own reaction and the rearm).
//   punish        chance an opening (a whiff, a recovery, a bad landing, an
//                 exhausted opponent) is recognized and taken.
//   adapt         how quickly and how far observed opponent habits shape
//                 its choices.
//   energySense   Energy management: what it keeps back, when it spends.
//   riskSense     how fully whiff, punish and elimination risk is weighed.
//   stageSense    ledges, blast zones, edge-guarding and ledge-trapping.
//   opportunity   recognizing finishers, traps and openings worth a commitment.
//   diSkill       chance it steers a launch (holds the best direction) while
//                 stunned, as a player may.
//   recoverySkill how accurately it plans a route back to the stage.
//   initiative    willingness to take the initiative (start offense) rather
//                 than wait for the opponent's commitment.
//   patience      how long it is content to wait on purpose (holding a
//                 position, letting its Launch Point recover, waiting for
//                 the opponent to commit) before it grows impatient and
//                 acts, and how readily it lets a marginal attack go.
//   discipline    how reliably it carries out what its match objective
//                 asks: breaking off to recover when it judges it should,
//                 not chasing small damage while protecting a lead, sticking
//                 with an objective rather than changing its mind.
//   awareness     how fully it reads the match: the score and the clock,
//                 overtime and its Launch Point tiebreak, how exposed each
//                 fighter is where it stands, so how well its match
//                 objective (js/game/ai/cpu-intelligence/objective.js) fits
//                 the situation.
//
// Every trait is ordered by level (see CAPABILITY): a higher level never has
// a slower reaction, a lapse more often or a noisier judgement than a lower
// one. Randomness (seeded) still lets an Easy CPU make a good call now and
// then.

import { ventureProfile } from './adventure.js';

export const DEFAULT_DIFFICULTY = 'medium';

// Which way each trait improves: 1 when a larger value is the smarter CPU,
// -1 when a smaller one is. Ranges compare both bounds.
export const CAPABILITY = Object.freeze({
  react: -1, lapse: -1, think: -1, noise: -1, rangeError: -1, predictError: -1, timing: -1,
  lookahead: 1, planDepth: 1, comboReliability: 1, guard: 1, perfectShield: 1, punish: 1, adapt: 1,
  energySense: 1, riskSense: 1, stageSense: 1, opportunity: 1, diSkill: 1, recoverySkill: 1, initiative: 1,
  patience: 1, discipline: 1, awareness: 1,
});

// The reaction windows are the same for every fighter. They are set
// against startups from about a tenth of a second (a jab) through a
// quarter of a second (a telegraphed kick) to half a second or more (a
// technique's cast, a clone's cloud): Easy, a casual player (0.38-0.58 s),
// is always too late for the kick and in time for a half-second cast only
// more often than not; Medium (0.24-0.38 s) answers the kick only at its
// very quickest and the casts every time; Hard, a tournament player
// (0.16-0.24 s), still reads the kick every time; Brutal (0.08-0.12 s) is
// in time for the jab about half the time, and never on the frame it
// starts. Another fighter's moves are read by the same windows, so a
// faster or slower startup is simply harder or easier to answer.
//
// Every level was made less smart (the Easy and Medium traits a quarter to
// two fifths of the way toward worse, Hard's and Brutal's about a tenth):
// later, more lapses and noise, bigger misjudgements, a shorter lookahead,
// a weaker guard, fewer punishes and looser combos, and less sense of the
// stage, the match and its own recovery. Brutal is no longer perfect on
// any trait but its plan depth.
const PROFILES = {
  easy: {
    react: [0.38, 0.58], lapse: 0.45, think: [0.26, 0.42], noise: 0.85, rangeError: 45, predictError: 0.55, timing: 0.11,
    lookahead: 0.07, planDepth: 1, comboReliability: 0.22, guard: 0.2, perfectShield: 0.02, punish: 0.18, adapt: 0.08,
    energySense: 0.17, riskSense: 0.17, stageSense: 0.24, opportunity: 0.19, diSkill: 0.1, recoverySkill: 0.35, initiative: 0.45,
    patience: 0.3, discipline: 0.24, awareness: 0.24,
  },
  medium: {
    react: [0.24, 0.38], lapse: 0.22, think: [0.1, 0.18], noise: 0.43, rangeError: 20, predictError: 0.27, timing: 0.052,
    lookahead: 0.18, planDepth: 2, comboReliability: 0.46, guard: 0.42, perfectShield: 0.13, punish: 0.45, adapt: 0.28,
    energySense: 0.4, riskSense: 0.4, stageSense: 0.48, opportunity: 0.44, diSkill: 0.35, recoverySkill: 0.62, initiative: 0.6,
    patience: 0.5, discipline: 0.44, awareness: 0.44,
  },
  hard: {
    react: [0.16, 0.24], lapse: 0.07, think: [0.045, 0.078], noise: 0.145, rangeError: 8, predictError: 0.11, timing: 0.022,
    lookahead: 0.36, planDepth: 3, comboReliability: 0.77, guard: 0.73, perfectShield: 0.44, punish: 0.8, adapt: 0.62,
    energySense: 0.71, riskSense: 0.71, stageSense: 0.76, opportunity: 0.73, diSkill: 0.71, recoverySkill: 0.84, initiative: 0.68,
    patience: 0.75, discipline: 0.71, awareness: 0.73,
  },
  brutal: {
    react: [0.08, 0.12], lapse: 0.017, think: [0.038, 0.063], noise: 0.06, rangeError: 2.3, predictError: 0.045, timing: 0.009,
    lookahead: 0.54, planDepth: 4, comboReliability: 0.9, guard: 0.87, perfectShield: 0.75, punish: 0.95, adapt: 0.85,
    energySense: 0.85, riskSense: 0.86, stageSense: 0.9, opportunity: 0.87, diSkill: 0.9, recoverySkill: 0.92, initiative: 0.72,
    patience: 0.85, discipline: 0.83, awareness: 0.85,
  },
};

const freezeProfile = (p) => Object.freeze({ ...p, react: Object.freeze([...p.react]), think: Object.freeze([...p.think]) });

// The four choices, in ascending order, as the Difficulty screen lists them:
// the skill each level plays at (js/localization/strings/en.js reads the
// lines from here; fr.js translates them).
export const DIFFICULTIES = Object.freeze([
  { id: 'easy', index: '01', level: 1, name: 'Easy', description: 'A casual player. Beatable, but plays to win.' },
  { id: 'medium', index: '02', level: 2, name: 'Medium', description: 'A regular player. Combos, adapts, recovers.' },
  { id: 'hard', index: '03', level: 3, name: 'Hard', description: 'Tournament level. Punishes mistakes.' },
  { id: 'brutal', index: '04', level: 4, name: 'Brutal', description: 'Elite. Reads, traps and finishes.' },
].map((d) => Object.freeze({ ...d, profile: freezeProfile(PROFILES[d.id]) })));

export const DIFFICULTY_IDS = Object.freeze(DIFFICULTIES.map((d) => d.id));

export function isDifficulty(id) {
  return DIFFICULTY_IDS.includes(id);
}

// The one place a difficulty id is validated: anything that is not one of
// the four (missing, mistyped, stale) is Medium.
export function resolveDifficulty(id) {
  return isDifficulty(id) ? id : DEFAULT_DIFFICULTY;
}

export function getDifficulty(id) {
  const resolved = resolveDifficulty(id);
  return DIFFICULTIES.find((d) => d.id === resolved);
}

// The profile the CPU plays with: a difficulty's (an id; anything unknown is
// Medium's), or, only in Adventure, Venture's at a level ({ venture: level },
// js/data/adventure.js ventureProfile), the same shape and the same traits.
// The four difficulties stay the only ones listed (DIFFICULTIES): Venture
// is no fifth choice, and neither the Difficulty screen nor Watch Mode
// offers it.
export function getDifficultyProfile(id) {
  if (id && typeof id === 'object' && Object.hasOwn(id, 'venture')) return ventureProfile(id.venture);
  return getDifficulty(id).profile;
}
