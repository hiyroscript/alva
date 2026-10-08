// CPU difficulty: how good a player CPU Intelligence is, never what its
// fighter is allowed to do.
//
// Each level is an intelligence profile read by CPU Intelligence
// (js/game/ai/cpu-intelligence.js and the modules beside it). All four
// levels run the very same intelligence: the same perception, the same
// move knowledge, the same planner and the same executor. A profile only
// sets how well each of those works: how late it sees, how far it
// forecasts, how precise its spacing is, how reliably it confirms a hit,
// times a Shield or a Deflect, recovers and adapts. Nothing here reaches
// the fighter: damage, launch, speed, jumps, gravity, the Dash, the Shield,
// Energy and its costs, cooldowns, hitboxes, hitstun, blockstun, timing,
// respawns and scoring are the character's own and the shared rules', and
// identical on every level (see Fighter in js/game/fighters/fighter.js). No
// module of the fighter or the combat engine reads a difficulty, and a
// profile holds only the traits below (CAPABILITY and TEMPERAMENT): no
// multiplier for any of those exists, so none can scale a hit.
//
// The levels are players, not handicaps:
//
//   easy    a casual player actively trying to win: slow to see things,
//           loose spacing, simple combos, occasional Dashes and Deflects.
//   medium  a tryhard: consistent movement, real pressure, punishes some
//           mistakes, uses its whole kit.
//   hard    a tournament player: fast, fair reactions, strong confirms,
//           edge-guards, manages Energy, few unforced errors.
//   brutal  an elite player: near-optimal practical choices, excellent
//           (never instant) reactions, strong adaptation.
//
// No level is ever idle on purpose: there is no hesitation trait. A weaker
// level is weaker because it perceives, predicts, judges and executes
// worse, never because it waits.
//
// Quality traits (seconds and world units are simulation time and space):
//
//   reaction      [min, max] perception lag: the CPU sees the opponent as
//                 it was this long ago (sampled per event and drifting), so
//                 an attack's startup is only seen once the lag has passed.
//                 Never zero: Brutal still takes a few frames.
//   lapse         chance something new is taken in a second reaction late.
//   think         [min, max] seconds between tactical reassessments (an
//                 urgent event always triggers one at once).
//   noise         relative jitter on every option's value.
//   misjudge      chance a decision takes a plausible second-best option.
//   rangeError    world units of spacing misjudgement, either way.
//   compensation  share (0-1) of its own perception lag it extrapolates
//                 away from what it sees (motion only: never inputs).
//   horizon       seconds of motion forecast (bounded prediction).
//   planDepth     follow-ups it plans in one sequence (combos, setups).
//   punish        how readily an opening (a whiff, recovery, an exhausted
//                 or paralyzed opponent) is recognized and taken.
//   combo         reliability of hit-confirms and follow-ups.
//   defense       how well a seen threat is answered (and how soon).
//   perfectShield chance a Shield is timed into its perfect window.
//   deflect       timing reliability of the Deflect, jump-to-Deflect included.
//   risk          quality of its risk assessment (punish risk, ledges).
//   adaptation    how fast observed opponent habits change its choices.
//   patterns      how strongly a recognized habit may weigh.
//   resources     how carefully Energy is valued and kept for later.
//   stage         stage awareness: ledges, centre control, the closing Void.
//   recover       quality of off-stage recovery timing and routing.
//   mobility      quality of Dash, air dash and mobility-attack use.
//
// Temperament (not a quality: a style, deliberately not ordered by level):
//
//   aggression    its natural leaning toward offence. A smarter CPU picks
//                 aggression or patience from the situation; this is only
//                 where it leans when nothing says otherwise.
//
// Every quality trait is ordered by level (see CAPABILITY): a higher level
// never perceives later, misjudges more or executes worse than a lower one.
// Randomness still lets an Easy CPU make a good call now and then.

export const DEFAULT_DIFFICULTY = 'medium';

// Which way each quality trait improves: 1 when a larger value is the
// stronger CPU, -1 when a smaller one is. Ranges compare both bounds.
export const CAPABILITY = Object.freeze({
  reaction: -1, lapse: -1, think: -1, noise: -1, misjudge: -1, rangeError: -1,
  compensation: 1, horizon: 1, planDepth: 1, punish: 1, combo: 1, defense: 1, perfectShield: 1, deflect: 1,
  risk: 1, adaptation: 1, patterns: 1, resources: 1, stage: 1, recover: 1, mobility: 1,
});

// The style traits a profile also holds, each free on every level.
export const TEMPERAMENT = Object.freeze(['aggression']);

// The reaction windows are the same for every fighter. They are set
// against startups from about 1/12 s (a jab) through a quarter of a second
// (a telegraphed kick) to half a second or more (a technique's cast):
// Easy is usually too late even for the kick, Medium answers the slow
// ones, Hard reads the kick reliably and Brutal sometimes even a quick
// strike, but never on the frame it starts.
const PROFILES = {
  easy: {
    reaction: [0.3, 0.5], lapse: 0.3, think: [0.16, 0.3], noise: 0.5, misjudge: 0.2, rangeError: 26,
    compensation: 0.35, horizon: 0.08, planDepth: 1, punish: 0.3, combo: 0.45, defense: 0.35, perfectShield: 0.08,
    deflect: 0.25, risk: 0.3, adaptation: 0.12, patterns: 0.25, resources: 0.25, stage: 0.4, recover: 0.6, mobility: 0.3,
    aggression: 0.62,
  },
  medium: {
    reaction: [0.19, 0.3], lapse: 0.15, think: [0.1, 0.18], noise: 0.28, misjudge: 0.1, rangeError: 14,
    compensation: 0.6, horizon: 0.18, planDepth: 2, punish: 0.55, combo: 0.7, defense: 0.6, perfectShield: 0.25,
    deflect: 0.5, risk: 0.55, adaptation: 0.3, patterns: 0.5, resources: 0.5, stage: 0.65, recover: 0.78, mobility: 0.55,
    aggression: 0.7,
  },
  hard: {
    reaction: [0.12, 0.19], lapse: 0.06, think: [0.05, 0.1], noise: 0.13, misjudge: 0.04, rangeError: 6,
    compensation: 0.85, horizon: 0.32, planDepth: 3, punish: 0.82, combo: 0.88, defense: 0.82, perfectShield: 0.55,
    deflect: 0.75, risk: 0.8, adaptation: 0.55, patterns: 0.75, resources: 0.75, stage: 0.88, recover: 0.92, mobility: 0.8,
    aggression: 0.58,
  },
  brutal: {
    reaction: [0.075, 0.115], lapse: 0.02, think: [0.033, 0.067], noise: 0.05, misjudge: 0.01, rangeError: 2,
    compensation: 1, horizon: 0.45, planDepth: 3, punish: 0.97, combo: 0.97, defense: 0.95, perfectShield: 0.85,
    deflect: 0.93, risk: 0.95, adaptation: 0.8, patterns: 0.92, resources: 0.92, stage: 1, recover: 0.99, mobility: 0.95,
    aggression: 0.6,
  },
};

const freezeProfile = (p) => Object.freeze({ ...p, reaction: Object.freeze([...p.reaction]), think: Object.freeze([...p.think]) });

// The four choices, in ascending order, as the Difficulty screen lists them.
export const DIFFICULTIES = Object.freeze([
  { id: 'easy', index: '01', level: 1, name: 'Easy', description: 'A casual player. Always trying, often off.' },
  { id: 'medium', index: '02', level: 2, name: 'Medium', description: 'A tryhard. Pressures, punishes some slips.' },
  { id: 'hard', index: '03', level: 3, name: 'Hard', description: 'A tournament player. Few mistakes.' },
  { id: 'brutal', index: '04', level: 4, name: 'Brutal', description: 'Elite. Reads you, adapts, finishes.' },
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
