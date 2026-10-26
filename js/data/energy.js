// The Energy policy: what every fighter's bar holds and what everything
// that spends it costs, the same for every fighter, human or CPU.
//
// Purpose: one source of truth for Energy prices. Every action that spends
// Energy costs the same nominal amount, ENERGY_COST (15): a Dash, an air
// dash and a Dash cancel, a Deflect, each hit a Shield blocks (a perfect
// Shield's included), and every move that creates a gameplay construct
// without a special cooldown (constructEnergyCost). No fighter and no move
// has a price of its own.
//
// Inputs: a move's kind ('attack', 'technique' or 'summon'), its definition
// (what it creates) and its cooldown class (js/data/cooldowns.js).
// Outputs: MAX_ENERGY, ENERGY_COST and the named costs, createsConstruct,
// constructEnergyCost and resolveMoveEnergy.
// Important constraints: a construct is read from structured data, never
// from a name, a button or a fighter: a projectile an attack throws or a
// technique releases, a technique's burst (a gameplay-affecting area round
// its caster), a summon's clone. A purely visual effect (a burst's `effect`
// clip, a cloud) and a heal of the caster's own are none, and neither is a
// melee strike, a slam's impact or a pull: they are the move itself.
//
// A construct move with a special cooldown (3 s or 5 s) pays nothing for
// its construct: its cooldown is its limit. An ordinary one (no cooldown)
// pays CONSTRUCT_ENERGY_COST, once per activation, as it starts (see
// Fighter.payEnergy): never per projectile, hit, frame, clone attack or
// turned-back flight, and never for a press that is refused. Interrupted
// after it started, nothing is given back. It needs the fighter not to be
// exhausted, exactly as a Dash or a Deflect does; with less left than it
// costs it takes all that is left, emptying the bar (see
// CombatState.spendEnergy).

// What a full bar holds: where every fighter starts, and what a respawn or
// a restart refills it to.
export const MAX_ENERGY = 100;

// The one nominal price of everything that spends Energy.
export const ENERGY_COST = 15;

export const DASH_ENERGY_COST = ENERGY_COST;      // a Dash or an air dash, a Dash cancel included
export const BLOCK_ENERGY_COST = ENERGY_COST;     // each hit the Shield blocks, a perfect Shield's included
export const DEFLECT_ENERGY_COST = ENERGY_COST;   // each Deflect, as it starts
export const CONSTRUCT_ENERGY_COST = ENERGY_COST; // each activation of an ordinary construct move, as it starts

// Whether move `def` of `kind` creates a gameplay construct (see the top):
// an attack that throws a projectile, a technique that releases a
// projectile or a burst, a summon (its clone).
export function createsConstruct(kind, def) {
  if (!def) return false;
  if (kind === 'summon') return true;
  if (kind === 'technique') return !!(def.projectile || def.burst);
  if (kind === 'attack') return !!def.projectile;
  return false;
}

// The Energy one activation of move `def` of `kind` costs as it starts:
// CONSTRUCT_ENERGY_COST when it creates a construct and its cooldown class
// `cls` is ordinary, else 0.
export function constructEnergyCost(kind, def, cls = 'ordinary') {
  return createsConstruct(kind, def) && cls === 'ordinary' ? CONSTRUCT_ENERGY_COST : 0;
}

// The Energy cost move `def` (named `owner` in errors) really has (see
// constructEnergyCost). A definition may leave `energyCost` out (and
// should: it is derived); one it declares must agree, or it is refused.
export function resolveMoveEnergy(value, owner, kind, def, cls) {
  const policy = constructEnergyCost(kind, def, cls);
  if (value !== undefined && value !== policy) {
    throw new Error(`[Alva] ${owner} declares energyCost ${value}: the Energy policy gives it ${policy} (js/data/energy.js)`);
  }
  return policy;
}
