// Attack movement: how an attack moves its fighter while it plays, the same
// rules for every fighter, every move and every controller.
//
// Purpose: two universal rules, kept apart.
//
//   The Step-in   every grounded direct melee strike carries its fighter a
//                 slight way forward, once per activation, by itself: no
//                 direction need be held. A move that writes its own `step`
//                 ({ at, speed }) lunges as it says instead; one that writes
//                 `step: false` never lunges (it roots its fighter, or its
//                 strikes are something it conjures away from its body, not
//                 its body's own). Everything else never lunges: a throw (its
//                 projectile is the attack), a move with a motion of its own
//                 (a homing dash, a roll, a plunge, a lift, a hover: its motion
//                 is its movement), the Deflect (a defense) and a pending move.
//                 An activation started in the air never lunges at all, and
//                 neither does a clone or anything else that is not the
//                 fighter itself performing the move (only the Fighter, and
//                 the CPU's prediction of it, apply a Step-in).
//   No steering   nothing held moves a fighter while an attack plays: no
//                 direction, no Run, on the ground or in the air, whatever the
//                 move, its cooldown or its class. What carries it is only
//                 what it already had (`momentum`: the share of its speed the
//                 attack keeps as it starts, `airMomentum` in the air), its
//                 Step-in, its own motion, gravity and outside forces; the
//                 speed it is not given runs down under the universal ground
//                 deceleration (x its `friction`) or the air drag.
//
// The verdict is recorded on every attack definition (`stepIn`): 'authored'
// (its own step), 'universal' (the shared one: STEP_IN), 'declined' (`step:
// false`) or 'exempt' (no direct strike of its body's to lunge with). `step`
// is then the lunge a grounded activation makes, or null. Whether an
// activation makes it is decided as it starts (see Fighter.startAttack): on
// the ground only.
//
// Inputs: a raw attack entry and its resolved definition (see
// createAttackDefinition in js/game/combat/attacks.js).
// Outputs: STEP_IN, STEP_IN_VERDICTS, STEERING_FIELDS, ATTACK_CARRY_DEFAULTS,
// stepInEligible, resolveStepIn, resolveAttackCarry.
// Important constraints: frozen and universal, like the movement numbers
// (js/data/movement.js). Nothing here names a fighter or a button; a move's
// classification comes from what it does (its strikes, its projectile, its
// motion), and an exception is written in the move's own data, validated.

// The shared Step-in, in the units of the universal movement values: the
// forward speed a grounded strike is raised to (never slower than its
// fighter already goes that way), as its time reaches `lead` x its lead (the
// first strike's start), so the slide is spent by the time the strike goes
// live. 360 is the roster's strongest authored lunge; under the universal
// deceleration (4800) it carries a fighter about 11 units: a lean into the
// blow, never a Dash (1250 for a sixth of a second).
export const STEP_IN = Object.freeze({ speed: 360, lead: 0.5 });

export const STEP_IN_VERDICTS = Object.freeze(['authored', 'universal', 'declined', 'exempt']);

// The fields of the retired Attack Mobility system (attack steering, and the
// tiers that supplied it). An attack declaring any of them is refused: no
// attack is ever steered.
export const STEERING_FIELDS = Object.freeze([
  'mobility', 'control', 'airControl', 'topSpeed', 'airTopSpeed', 'lockMovement',
]);

// What an attack keeps of the movement it starts with, unless it says
// otherwise: all of its speed, on the ground and in the air, running down
// under the universal ground deceleration (friction 1).
export const ATTACK_CARRY_DEFAULTS = Object.freeze({ momentum: 1, airMomentum: 1, friction: 1 });

const SHARES = Object.freeze(['momentum', 'airMomentum']);

// { momentum, airMomentum, friction } of raw attack entry `spec` (`owner` in
// errors): its own, or the defaults. A share outside 0 to 1, a negative
// friction, or any steering field, is refused.
export function resolveAttackCarry(spec, owner = 'An attack') {
  const steering = STEERING_FIELDS.filter((field) => spec?.[field] !== undefined);
  if (steering.length) {
    throw new Error(`[Alva] ${owner} declares ${steering.join(', ')}: attacks are never steered (js/data/attack-movement.js)`);
  }
  const out = {};
  for (const [field, fallback] of Object.entries(ATTACK_CARRY_DEFAULTS)) {
    const value = spec?.[field] ?? fallback;
    const share = SHARES.includes(field);
    const ok = typeof value === 'number' && Number.isFinite(value) && value >= 0 && (!share || value <= 1);
    if (!ok) throw new Error(`[Alva] ${owner} declares ${field} ${value}: ${share ? 'a share from 0 to 1' : 'a rate from 0'}`);
    out[field] = value;
  }
  return out;
}

// Whether resolved attack definition `def` is a direct strike of its body's
// that the shared Step-in applies to: it strikes (a hitbox), throws nothing,
// makes no motion of its own, is no defense (the Deflect) and is authored.
export function stepInEligible(def) {
  return !!def && !def.pending && !!def.hitbox && !def.projectile && !def.motion && !def.deflectProjectiles;
}

// { step, stepIn } for raw attack entry `spec` and its resolved definition
// `def` (its phases, hitbox, projectile and motion final): see the header.
// `step` is frozen { at, speed } or null.
export function resolveStepIn(spec, def, owner = 'An attack') {
  const declared = spec?.step;
  if (declared === false) return { step: null, stepIn: 'declined' };
  if (declared === null) throw new Error(`[Alva] ${owner} declares step null: write step: false for a move that never lunges`);
  if (declared !== undefined) {
    const ok = declared && typeof declared === 'object' && Number.isFinite(declared.at) && declared.at >= 0 &&
      Number.isFinite(declared.speed) && declared.speed > 0;
    if (!ok) throw new Error(`[Alva] ${owner}'s step needs an \`at\` from 0 and a positive \`speed\``);
    return { step: Object.freeze({ at: declared.at, speed: declared.speed }), stepIn: 'authored' };
  }
  if (!stepInEligible(def)) return { step: null, stepIn: 'exempt' };
  return { step: Object.freeze({ at: def.startup * STEP_IN.lead, speed: STEP_IN.speed }), stepIn: 'universal' };
}
