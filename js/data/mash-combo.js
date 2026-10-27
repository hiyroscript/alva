// The Mash Combo: the universal rules of the one automatic attack series
// every fighter has, and the per-fighter pair it is made of.
//
// Purpose: one place for the mechanic's numbers and for what a fighter's
// `mashCombo` entry must be. The engine (js/game/combat/mash-combo.js and
// the Fighter) reads these; nothing here runs a combo.
//
//   The trigger    the same eligible button pressed MASH_COMBO.presses (5)
//                  times, each a fresh press (a held button, a key's
//                  autorepeat or a press of another combat button never
//                  counts), the gap between two of them no longer than
//                  `maxGap` and the five within `window` seconds of each
//                  other (rolling: an older press drops off). On the ground
//                  only. Presses for the move already playing count even
//                  though they start nothing (see Fighter.pressRequest).
//   The series     `turns` (12) automatic activations of exactly two moves,
//                  A and B, alternating, the one whose button was mashed
//                  first: A B A B ... so each plays six times. Every turn runs
//                  `rate` times faster (its startup, strikes, recovery, Step-in
//                  and clip together). Turns 1 to 11 have an effective Base
//                  Launch of 0 (every strike of them: their damage still adds
//                  Launch Point, their hitstun and hitstop stay); turn 12
//                  strikes with its own authored launch, the finisher.
//   The lock       nothing the fighter's own controls ask for cancels it (no
//                  attack, Special, jump, Dash, Shield, Deflect or hit-cancel),
//                  and presses made during it are dropped, never kept for
//                  later. A hit that stuns, a paralysis, a launch, losing the
//                  ground, the Void or a reset ends it at once; a turn a
//                  Shield blocks plays out and ends it there.
//
// A fighter's pair (its `mashCombo`):
//
//   mashCombo: { attacks: ['attack1', 'extra_attack'] }
//
// two ordinary grounded close-range melee strikes of its own (see
// mashComboProblems for every check): direct blows of its body at close
// fighting distance, never a projectile, a summon, a technique, a Special,
// a move with a 3 s or 5 s cooldown, an aerial, a pull, a carry, a roll or a
// dash, a pass-through, or a strike reaching past MASH_COMBO.reach. Every
// playable fighter must have one (js/data/characters.js refuses a
// definition without it). Each named move is a ground attack one of its
// buttons starts (attackN's ground move, or extra_attack) or, for a fighter
// whose buttons are all taken by moves of another kind, its MASH_PARTNER:
// the `mash_attack` move, a close-range strike that has no button of its
// own and is performed only as the Mash Combo's partner turn (the series
// is then always triggered from the other move's button).
//
// Inputs: a character definition. Outputs: MASH_COMBO, MASH_PARTNER,
// mashPairOf, mashTriggers, mashSequence, mashComboProblems,
// assertMashCombo.
// Important constraints: frozen and universal; nothing here names a
// fighter. A move's eligibility comes from what it does, checked from its
// resolved definition, never from its codename or its number.

import { createAttackDefinition } from '../game/combat/attacks.js';
import { specialAction } from './loadout.js';
import { hasClip } from './ensemble.js';

// The mechanic's tuning (seconds and world units).
export const MASH_COMBO = Object.freeze({
  // Fresh presses of one button that trigger it.
  presses: 5,
  // The five presses fit in this rolling window (first to fifth)...
  window: 0.8,
  // ...and no two in a row are further apart than this.
  maxGap: 0.3,
  // Automatic turns in the series: an even number, so each move plays half.
  turns: 12,
  // How much faster each turn plays than the move does on its own.
  rate: 2,
  // How long a recognized combo may wait for the move in progress (the
  // ordinary activation its first press started) to allow it, before it is
  // dropped: longer than any eligible move.
  armWait: 0.6,
  // The furthest any strike of an eligible move may reach in front of its
  // fighter's origin, and the furthest out its box may start (world units):
  // close fighting distance, about two bodies.
  reach: 64,
  nearEdge: 32,
  // The fastest an authored Step-in of an eligible move may lunge (units/s):
  // a lean into the blow, never a travelling move.
  maxStep: 400,
});

// The codename of the move a fighter may author only as its Mash Combo
// partner (see the header): no button reaches it.
export const MASH_PARTNER = 'mash_attack';

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// `def`'s pair of attack ids ([A, B]) as it declares it, or null.
export function mashPairOf(def) {
  const attacks = def?.mashCombo?.attacks;
  return Array.isArray(attacks) && attacks.length === 2 ? attacks : null;
}

// The combat button whose ground move is attack `id` for `def`, or null (a
// MASH_PARTNER, or a move no button starts on the ground).
export function groundButtonOf(def, id) {
  const mapping = def?.actions?.[id];
  if (!mapping || specialAction(def, id)) return null;
  if (typeof mapping === 'string') return mapping === id ? id : null;
  return isObject(mapping) && mapping.ground === id ? id : null;
}

// The buttons that trigger `def`'s Mash Combo: button -> the pair's attack
// it starts (the series' first move), for each move of the pair a button
// starts. Empty without a pair.
export function mashTriggers(def) {
  const pair = mashPairOf(def);
  const out = new Map();
  if (!pair) return out;
  for (const id of pair) {
    const button = groundButtonOf(def, id);
    if (button) out.set(button, id);
  }
  return out;
}

// The series for a combo triggered through `first` of `pair`: `turns`
// attack ids, alternating, `first` first.
export function mashSequence(pair, first, turns = MASH_COMBO.turns) {
  const second = pair[0] === first ? pair[1] : pair[0];
  return Array.from({ length: turns }, (_, i) => (i % 2 === 0 ? first : second));
}

// Every box a resolved attack definition strikes with.
const strikeBoxes = (atk) => (atk.hits ? atk.hits.map((h) => h.hitbox) : atk.hitbox ? [atk.hitbox] : []);

// Why resolved attack `atk` (id `id`, raw entry `spec`) is not an ordinary
// grounded close-range melee strike, one reason each; empty when it is.
function strikeProblems(atk, spec) {
  const out = [];
  if (atk.pending) out.push('it is pending (no strike authored)');
  if (!atk.hitbox) out.push('it has no hitbox of its own (no direct strike)');
  if (atk.projectile) out.push('it throws a projectile');
  if (atk.cooldown > 0) out.push(`it has a ${atk.cooldown} s cooldown`);
  if (atk.energyCost > 0) out.push('it costs Energy (a construct move)');
  if (atk.motion && atk.motion.type !== 'hover') out.push(`its ${atk.motion.type} motion moves it on its own`);
  if (atk.pull) out.push('it pulls');
  if (atk.carry || atk.hits?.some((h) => h.carry)) out.push('it carries its target along');
  if (atk.passThrough) out.push('it passes through fighters');
  if (atk.deflectProjectiles) out.push('it turns projectiles back (a defense)');
  if (atk.freeFall) out.push('it spends the airtime');
  if (atk.step && atk.step.speed > MASH_COMBO.maxStep) out.push(`its Step-in lunges at ${atk.step.speed} units/s (a travelling move)`);
  for (const box of strikeBoxes(atk)) {
    if (box.x + box.w > MASH_COMBO.reach) out.push(`a strike reaches ${box.x + box.w} units out (close range is ${MASH_COMBO.reach})`);
    else if (box.x > MASH_COMBO.nearEdge) out.push(`a strike starts ${box.x} units out (a ranged strike)`);
  }
  if (spec?.members && !Array.isArray(spec.members)) out.push('its members are not a list');
  return [...new Set(out)];
}

// Every way `def`'s Mash Combo pair breaks the rules (see the header), one
// sentence each; empty when it keeps them all.
export function mashComboProblems(def) {
  const problems = [];
  const say = (text) => problems.push(text);
  const entry = def?.mashCombo;
  if (!isObject(entry)) {
    say('it has no `mashCombo`: every fighter needs two grounded close-range melee strikes for its Mash Combo');
    return problems;
  }
  const extra = Object.keys(entry).filter((key) => key !== 'attacks');
  if (extra.length) say(`its mashCombo declares ${extra.join(', ')}: only \`attacks\` is a fighter's own`);
  const pair = entry.attacks;
  if (!Array.isArray(pair) || pair.length !== 2 || pair.some((id) => typeof id !== 'string')) {
    say('its mashCombo.attacks must name exactly two attacks');
    return problems;
  }
  if (pair[0] === pair[1]) say(`its mashCombo names "${pair[0]}" twice: the pair is two distinct moves`);
  const projectiles = def.projectiles ?? null;
  for (const id of pair) {
    const spec = def.attacks?.[id];
    const who = `mashCombo attack "${id}"`;
    if (!spec) {
      say(`${who} is not in \`attacks\``);
      continue;
    }
    if (id.startsWith('midair_')) say(`${who} is an aerial: the Mash Combo is grounded`);
    if (id !== MASH_PARTNER && !groundButtonOf(def, id)) say(`${who} is not the ground move of any button (nor the button-less ${MASH_PARTNER})`);
    if (specialAction(def, id)) say(`${who}'s button is a summon or a technique`);
    if ((def.specialAbilities ?? []).includes(id)) say(`${who} is a Special ability`);
    let atk = null;
    try {
      atk = createAttackDefinition({ id, ...spec }, { projectiles });
    } catch (err) {
      say(`${who} is not a valid attack (${err.message})`);
      continue;
    }
    for (const reason of strikeProblems(atk, spec)) say(`${who} is not a grounded close-range melee strike: ${reason}`);
    if (!spec.animation || !hasClip(def, spec.animation, spec.members)) say(`${who} plays "${spec.animation}", which has no clip`);
  }
  if (!pair.some((id) => groundButtonOf(def, id))) say('neither mashCombo attack has a button: nothing could trigger it');
  if (def.attacks?.[MASH_PARTNER] && !pair.includes(MASH_PARTNER)) {
    say(`attacks.${MASH_PARTNER} is no move of its mashCombo: it has no button, so nothing would ever perform it`);
  }
  return problems;
}

// Throws, naming every problem, if `def` breaks the Mash Combo rules.
export function assertMashCombo(def) {
  const problems = mashComboProblems(def);
  if (problems.length) {
    throw new Error(`[Alva] Character "${def?.id}" breaks the Mash Combo rules:\n- ${problems.join('\n- ')}`);
  }
}
