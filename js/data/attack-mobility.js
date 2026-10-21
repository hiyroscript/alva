// Attack mobility: how much movement an attack leaves its fighter while it
// plays, the same few tiers for every fighter.
//
// Purpose: an attack's movement is six numbers (see the attack fields in
// js/game/combat/attacks.js and steerAttack in
// js/game/fighters/movement.js): the share of its speed it keeps as it
// starts (`momentum`, `airMomentum`), the share of normal steering
// authority it leaves (`control`, `airControl`: how quickly the held
// direction changes its velocity), the share of top speed that steering
// may build toward (`topSpeed`, `airTopSpeed`) and how hard the speed it
// is not steering runs down (`friction`, x the ground deceleration).
// Writing all six on every attack would invite forty slightly different
// guesses, so an attack names its tier (`mobility`) and the tier supplies
// them; a field the attack writes itself wins over its tier's, for the
// moves whose own mechanic needs it (a cast that roots, a plunge's drift).
//
// Steering authority and the speed it builds toward are separate on
// purpose: a quick strike with 80% of the steering keeps the whole run (it
// only turns a little more slowly), where the old single share made a 50%
// attack both slower to steer and capped at half of top speed.
//
// A tier is chosen by what the attack does, never by its name, slot,
// damage or clip length (each fighter's definition says why each move has
// the tier it has):
//
//   quick    a light, fast strike (a jab, a swipe, a quick aerial): mobile
//            and responsive, the run and the drift carried on through it
//   medium   a strike with a clear wind-up or recovery, an ordinary cast,
//            an everyday aerial with a motion of its own: steerable, its
//            speed held to a little under the run's
//   heavy    a deliberate commitment (a finisher, a long flurry, a cast
//            that sets a trap, a plunge): a little steering, slowly
//   planted  no steering at all: the speed it starts with runs down under
//            its friction (a move that roots its fighter, a roll's curl)
//
// An attack that names none is `medium` (DEFAULT_ATTACK_MOBILITY): an
// ordinary attack never defaults to standing its fighter still.
//
// Inputs: none. Outputs: ATTACK_MOBILITY, MOBILITY_TIERS, MOBILITY_FIELDS,
// DEFAULT_ATTACK_MOBILITY and resolveMobility (an attack entry's tier and
// fields, validated).
// Important constraints: frozen and universal, like the movement numbers
// (js/data/movement.js): changing a tier changes every attack of that tier
// on every fighter, which is the point. Nothing here names a fighter.

// Every tier's six numbers. Shares are 0 to 1 of the universal movement
// values (BASE_FIGHTER_MOVEMENT): `control` of the acceleration (and of the
// turn's braking), `topSpeed` of maxSpeed; `friction` scales the ground
// deceleration on what is not steered.
export const ATTACK_MOBILITY = Object.freeze({
  quick: Object.freeze({
    momentum: 1, airMomentum: 1, control: 0.8, airControl: 0.9, topSpeed: 1, airTopSpeed: 1, friction: 0.6,
  }),
  medium: Object.freeze({
    momentum: 0.9, airMomentum: 1, control: 0.55, airControl: 0.7, topSpeed: 0.6, airTopSpeed: 0.9, friction: 0.8,
  }),
  heavy: Object.freeze({
    momentum: 0.6, airMomentum: 0.9, control: 0.2, airControl: 0.4, topSpeed: 0.25, airTopSpeed: 0.6, friction: 1,
  }),
  planted: Object.freeze({
    momentum: 1, airMomentum: 1, control: 0, airControl: 0, topSpeed: 1, airTopSpeed: 1, friction: 1,
  }),
});

export const MOBILITY_TIERS = Object.freeze(Object.keys(ATTACK_MOBILITY));
export const MOBILITY_FIELDS = Object.freeze(Object.keys(ATTACK_MOBILITY.quick));
export const DEFAULT_ATTACK_MOBILITY = 'medium';

// The fields that are shares of a universal value, 0 to 1; `friction` may
// be any rate from 0.
const SHARES = Object.freeze(['momentum', 'airMomentum', 'control', 'airControl', 'topSpeed', 'airTopSpeed']);

// Attack entry `spec`'s mobility: { mobility, ...the six fields }, its
// tier's (DEFAULT_ATTACK_MOBILITY when it names none) with the fields the
// entry writes itself in their place. An unknown tier, or a share outside
// 0 to 1 (a negative friction), is refused, naming `owner`.
export function resolveMobility(spec, owner = 'An attack') {
  const mobility = spec?.mobility ?? DEFAULT_ATTACK_MOBILITY;
  const tier = ATTACK_MOBILITY[mobility];
  if (!tier) throw new Error(`[Alva] ${owner} has mobility "${mobility}" (${MOBILITY_TIERS.join(', ')})`);
  const out = { mobility };
  for (const field of MOBILITY_FIELDS) {
    const value = spec?.[field] ?? tier[field];
    const ok = typeof value === 'number' && Number.isFinite(value) && value >= 0 && (!SHARES.includes(field) || value <= 1);
    if (!ok) throw new Error(`[Alva] ${owner} declares ${field} ${value}: ${SHARES.includes(field) ? 'a share from 0 to 1' : 'a rate from 0'}`);
    out[field] = value;
  }
  return out;
}
