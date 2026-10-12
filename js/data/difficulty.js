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
//
// Every trait is ordered by level (see CAPABILITY): a higher level never has
// a slower reaction, a lapse more often or a noisier judgement than a lower
// one. Randomness (seeded) still lets an Easy CPU make a good call now and
// then.

export const DEFAULT_DIFFICULTY = 'medium';

// Which way each trait improves: 1 when a larger value is the stronger CPU,
// -1 when a smaller one is. Ranges compare both bounds.
export const CAPABILITY = Object.freeze({
  react: -1, lapse: -1, think: -1, noise: -1, rangeError: -1, predictError: -1, timing: -1,
  lookahead: 1, planDepth: 1, comboReliability: 1, guard: 1, perfectShield: 1, punish: 1, adapt: 1,
  energySense: 1, riskSense: 1, stageSense: 1, opportunity: 1, diSkill: 1, recoverySkill: 1, initiative: 1,
});

// The reaction windows are the same for every fighter. They are set
// against startups from about 1/12 s (a jab) through a quarter of a second
// (a telegraphed kick) to half a second or more (a technique's cast, a
// clone's cloud): Easy, a casual player, is usually too late even for the
// kick; Medium answers the slower moves; Hard, a tournament player, reads
// the kick reliably; Brutal sometimes even the jab, but never on the frame
// it starts. Another fighter's moves are read by the same windows, so a
// faster or slower startup is simply harder or easier to answer.
const PROFILES = {
  easy: {
    react: [0.3, 0.46], lapse: 0.3, think: [0.2, 0.34], noise: 0.5, rangeError: 26, predictError: 0.35, timing: 0.07,
    lookahead: 0.12, planDepth: 1, comboReliability: 0.45, guard: 0.35, perfectShield: 0.04, punish: 0.35, adapt: 0.15,
    energySense: 0.3, riskSense: 0.3, stageSense: 0.4, opportunity: 0.35, diSkill: 0.2, recoverySkill: 0.55, initiative: 0.5,
  },
  medium: {
    react: [0.19, 0.3], lapse: 0.14, think: [0.11, 0.2], noise: 0.27, rangeError: 14, predictError: 0.2, timing: 0.04,
    lookahead: 0.25, planDepth: 2, comboReliability: 0.72, guard: 0.6, perfectShield: 0.2, punish: 0.62, adapt: 0.4,
    energySense: 0.55, riskSense: 0.55, stageSense: 0.65, opportunity: 0.6, diSkill: 0.5, recoverySkill: 0.8, initiative: 0.6,
  },
  hard: {
    react: [0.15, 0.22], lapse: 0.06, think: [0.065, 0.11], noise: 0.13, rangeError: 7, predictError: 0.1, timing: 0.02,
    lookahead: 0.4, planDepth: 3, comboReliability: 0.88, guard: 0.82, perfectShield: 0.5, punish: 0.85, adapt: 0.7,
    energySense: 0.8, riskSense: 0.8, stageSense: 0.85, opportunity: 0.82, diSkill: 0.8, recoverySkill: 0.93, initiative: 0.68,
  },
  brutal: {
    react: [0.07, 0.105], lapse: 0.015, think: [0.034, 0.056], noise: 0.04, rangeError: 2, predictError: 0.04, timing: 0.008,
    lookahead: 0.6, planDepth: 4, comboReliability: 0.98, guard: 0.96, perfectShield: 0.85, punish: 0.98, adapt: 0.95,
    energySense: 0.95, riskSense: 0.96, stageSense: 1, opportunity: 0.97, diSkill: 1, recoverySkill: 1, initiative: 0.72,
  },
};

const freezeProfile = (p) => Object.freeze({ ...p, react: Object.freeze([...p.react]), think: Object.freeze([...p.think]) });

// The four choices, in ascending order, as the Difficulty screen lists them:
// the skill each level plays at (js/localization/strings/en.js reads the
// lines from here; fr.js translates them).
export const DIFFICULTIES = Object.freeze([
  { id: 'easy', index: '01', level: 1, name: 'Easy', description: 'A casual player. Beatable, never idle.' },
  { id: 'medium', index: '02', level: 2, name: 'Medium', description: 'A tryhard. Combos, adapts, recovers.' },
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

export function getDifficultyProfile(id) {
  return getDifficulty(id).profile;
}
