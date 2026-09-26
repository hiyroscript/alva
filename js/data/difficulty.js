// Quick Battle difficulty: how well the CPU thinks, never what its fighter
// is allowed to do.
//
// Each level is a profile read by the combat AI (js/game/combat-ai.js). The
// profile tunes the controller's perception and judgement only: how soon it
// notices what the opponent does, how often it reassesses, how noisy and how
// careful its choices are and how far ahead it projects movement. Nothing here
// reaches the fighter: damage, launch, speed, jumps, Dash, Shield, Energy,
// cooldowns, hitboxes and every other mechanic are the character's own and
// identical on every level (see Fighter in js/game/character.js).
//
// Profile traits (seconds and world units are simulation time and space):
//
//   react       [min, max] delay from seeing something (an attack's startup,
//               a projectile, a clone's cloud, a Charge, a whiff) to acting
//               on it. Sampled per event, so it varies from one to the next.
//               Never zero: Brutal still takes a few frames.
//   lapse       chance an event is never noticed at all.
//   think       [min, max] seconds between neutral reassessments.
//   noise       relative jitter on every option's score (decision randomness).
//   hesitation  chance a neutral reassessment just waits instead of acting.
//   rangeError  world units of spacing misjudgement, either way.
//   lookahead   seconds of motion projected when judging where the opponent,
//               its attacks and projectiles will be (0: where they are now).
//   guard       defensive awareness: how strongly a real threat is answered
//               (Shield, stepping or jumping away) instead of ignored.
//   punish      how readily an opening (a whiff, recovery, a Charge, an
//               exhausted opponent) is noticed and taken.
//   charged     judgement with Charge and charged actions.
//   dash        how much Dash is part of its movement.
//   plan        seconds a multi-step plan (approach then strike, Charge then a
//               charged action) is kept before it is thought over again.
//   aggression  weight on offence against waiting and spacing.
//   stage       stage awareness: ledge caution, centre-stage preference and
//               the value of knocking the opponent toward the Void.
//   energyCare  how much Energy it keeps back for the Shield.
//
// Every trait is ordered by level (see CAPABILITY): a higher level never has a
// slower reaction, a lapse more often or a noisier judgement than a lower one.
// Randomness still lets an Easy CPU make a good call now and then.

export const DEFAULT_DIFFICULTY = 'medium';

// Which way each trait improves: 1 when a larger value is the stronger CPU,
// -1 when a smaller one is. Ranges compare both bounds.
export const CAPABILITY = Object.freeze({
  react: -1, lapse: -1, think: -1, noise: -1, hesitation: -1, rangeError: -1,
  lookahead: 1, guard: 1, punish: 1, charged: 1, dash: 1, plan: 1, aggression: 1, stage: 1, energyCare: 1,
});

// Reaction windows sit against #0001's startups (BA1 1/12 s, BA2 3/12 s, the
// Sphere Rush's 0.5 s form, a clone's 0.5 s cloud): Easy is usually too late
// even for BA2, Medium answers the slow ones, Hard reads BA2 reliably and
// Brutal sometimes even BA1, but never on the frame it starts.
const PROFILES = {
  easy: {
    react: [0.45, 0.85], lapse: 0.4, think: [0.45, 0.85], noise: 0.6, hesitation: 0.32, rangeError: 28,
    lookahead: 0, guard: 0.3, punish: 0.15, charged: 0.12, dash: 0, plan: 0,
    aggression: 0.45, stage: 0.3, energyCare: 0.15,
  },
  medium: {
    react: [0.22, 0.45], lapse: 0.18, think: [0.24, 0.46], noise: 0.32, hesitation: 0.14, rangeError: 14,
    lookahead: 0.1, guard: 0.55, punish: 0.45, charged: 0.45, dash: 0.25, plan: 0.45,
    aggression: 0.55, stage: 0.6, energyCare: 0.45,
  },
  hard: {
    react: [0.1, 0.24], lapse: 0.06, think: [0.12, 0.24], noise: 0.14, hesitation: 0.05, rangeError: 6,
    lookahead: 0.22, guard: 0.8, punish: 0.8, charged: 0.78, dash: 0.55, plan: 0.7,
    aggression: 0.62, stage: 0.85, energyCare: 0.7,
  },
  brutal: {
    react: [0.05, 0.14], lapse: 0.02, think: [0.06, 0.13], noise: 0.05, hesitation: 0.02, rangeError: 2,
    lookahead: 0.34, guard: 0.95, punish: 1, charged: 1, dash: 0.7, plan: 0.9,
    aggression: 0.66, stage: 1, energyCare: 0.85,
  },
};

const freezeProfile = (p) => Object.freeze({ ...p, react: Object.freeze([...p.react]), think: Object.freeze([...p.think]) });

// The four choices, in ascending order, as the Difficulty screen lists them.
export const DIFFICULTIES = Object.freeze([
  { id: 'easy', index: '01', level: 1, name: 'Easy', description: 'Slower reactions. Leaves openings.' },
  { id: 'medium', index: '02', level: 2, name: 'Medium', description: 'Balanced reactions and decisions.' },
  { id: 'hard', index: '03', level: 3, name: 'Hard', description: 'Fast reactions. Defends and punishes.' },
  { id: 'brutal', index: '04', level: 4, name: 'Brutal', description: 'Sharp reactions. Relentless decisions.' },
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
