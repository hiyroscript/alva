// Fighter profiles: Discover's editorial card for each fighter, keyed by
// fighter id. A profile is one difficulty rating and a localized play-style
// description, written by reading the fighter's definition and
// specification; it is never a second source of gameplay: the definition
// (js/data/characters/<id>.js) and its specification
// (docs/characters/<id>.md) stay authoritative for every mechanic, and
// nothing here is read by the game itself.
//
// `difficulty` is ONE whole number from 1 to DIFFICULTY_MAX, never split
// into "to learn" and "to master": it rates both together, how hard the
// fighter is to pick up and play effectively AND how hard it is to master
// (DIFFICULTY_SCALE says what each step means). It is assigned by a person,
// never derived from move counts or any other data.
//
// `descriptionKey` is the translation key of its play-style description
// (js/localization/strings/en.js and fr.js): how the fighter plays, not a
// move list. Use two concise sentences (about 30–55 words) on approach,
// strengths and vulnerabilities; no named moves, numerical mechanics,
// rating commentary, lore or claims of faster universal movement.
//
// `reviewedSourceHash` is the SHA-256 of the fighter's definition source
// (js/data/characters/<id>.js read as UTF-8, line endings normalized to
// \n) at the time this profile was last reviewed against it. It is a
// maintenance guard only, checked by tests/fighters/profiles.test.mjs:
// once the definition changes, the test fails until someone rechecks the
// rating and the description and records the new hash
// (docs/characters/adding-characters.md says how). It lives here, never in
// the definition itself, so the hash never covers itself.
//
// Every playable fighter must have a valid, current profile (the tests
// enforce it). Discover still copes with a fighter that has none (a
// test-only fighter, say): it shows it as not rated.

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 5;

// What each step of the one rating means, so later ratings stay
// consistent with these. Documentation for whoever rates a fighter; the
// game shows only the stars.
export const DIFFICULTY_SCALE = Object.freeze({
  1: 'Very easy to learn and comparatively simple to master.',
  2: 'An easy core game plan with little extra to master.',
  3: 'Approachable fundamentals, with meaningful decision-making and execution depth at higher levels.',
  4: 'Demanding to use well, with substantial mastery requirements.',
  5: 'Difficult both to pilot effectively and to master: highly layered mechanics, situational decisions, setup or resource requirements, or punishing commitments.',
});

// The fields a profile has, and only these.
const FIELDS = Object.freeze(['difficulty', 'descriptionKey', 'reviewedSourceHash']);

// Throws, naming the fighter and the problem, for a profile that is not
// exactly one whole rating from DIFFICULTY_MIN to DIFFICULTY_MAX, a
// description key and a SHA-256 review hash.
export function assertFighterProfile(id, profile) {
  const who = `Fighter profile "${id}"`;
  if (!profile || typeof profile !== 'object') throw new Error(`${who} is missing.`);
  const extra = Object.keys(profile).filter((k) => !FIELDS.includes(k));
  if (extra.length) throw new Error(`${who} has unknown field(s) ${extra.join(', ')}: a profile has one difficulty, a description key and a review hash.`);
  const { difficulty, descriptionKey, reviewedSourceHash } = profile;
  if (!Number.isInteger(difficulty) || difficulty < DIFFICULTY_MIN || difficulty > DIFFICULTY_MAX) {
    throw new Error(`${who}: difficulty must be one whole number from ${DIFFICULTY_MIN} to ${DIFFICULTY_MAX} (got ${difficulty}).`);
  }
  if (typeof descriptionKey !== 'string' || !descriptionKey) throw new Error(`${who} needs a descriptionKey.`);
  if (typeof reviewedSourceHash !== 'string' || !/^[0-9a-f]{64}$/.test(reviewedSourceHash)) {
    throw new Error(`${who} needs a reviewedSourceHash: the SHA-256 (64 lowercase hex digits) of its definition's source.`);
  }
}

export const FIGHTER_PROFILES = Object.freeze({
  // A space-control and setup fighter with a large, contextual toolkit:
  // five numbered attacks and an extra one, projectiles that pull, repel,
  // reflect and erase, hovering aerials, a homing kick, a paralysis setup,
  // a long-commitment finisher, Infinity and an aerial Deflect, under
  // Energy and cooldown management. Hard to pilot and to master.
  '0001': Object.freeze({
    difficulty: 5,
    descriptionKey: 'discover.fighter.0001.playStyle',
    reviewedSourceHash: '5d48a4d579ee5e58d350861a49c6d3dcd9521c3bc1cfd5a8ad834b605b6fc59c',
  }),
  // A momentum rushdown and aerial chaser: a readable core game plan, with
  // mastery in momentum, air uses and free fall, approach angles, trap
  // placement and not overcommitting.
  '0002': Object.freeze({
    difficulty: 3,
    descriptionKey: 'discover.fighter.0002.playStyle',
    reviewedSourceHash: '25bcadbe010db31a33bf7948fc5de0dee3ff8b8fc137bad281e13fc740d256de',
  }),
});

for (const [id, profile] of Object.entries(FIGHTER_PROFILES)) assertFighterProfile(id, profile);

// `id`'s profile, or null for a fighter that has none.
export function getFighterProfile(id) {
  return Object.hasOwn(FIGHTER_PROFILES, id) ? FIGHTER_PROFILES[id] : null;
}
