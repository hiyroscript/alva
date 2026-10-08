// Universal movement: the one set of locomotion numbers every fighter runs
// on, and the reference copy Discover shows for it.
//
// Purpose: run, jump, the triple jump, the fast fall, the Dash and the air
// dash are the same for every fighter on the roster. A fighter's identity
// is its moves (their motion included: a homing dash, a roll, a hover),
// never a faster run, a higher jump or a longer Dash. So no fighter
// definition declares movement numbers: the shared rules
// (js/game/fighters/movement.js) and the Fighter
// (js/game/fighters/fighter.js) read BASE_FIGHTER_MOVEMENT, and a new
// fighter gets every one of these values without writing any of them.
//
// Inputs: none. Outputs: BASE_FIGHTER_MOVEMENT, MOVEMENT_FIELDS,
// movementProblems / assertUniversalMovement (the registry refuses a
// definition that tries to declare its own), and the Discover copy
// (MOVEMENT_SUMMARY, MOVEMENT_GUIDE).
//
// Important constraints: frozen, and the only source. Changing a value here
// changes every fighter at once, which is the point. A move that travels in
// its own way says so in its own attack data (`motion`, `step`, `momentum`
// and friends: see js/game/combat/attacks.js), never here.

// Every value in world units and seconds (the fixed step is 1/60 s; world
// gravity is CONFIG.sim.gravity, 2500 units/s²).
export const BASE_FIGHTER_MOVEMENT = Object.freeze({
  // ---- Ground -------------------------------------------------------------
  // Top speed: what holding a direction builds toward from rest, on the
  // ground and in the air. Not a cap: speed above it (a Dash's, a jump out
  // of one) bleeds off by the overspeed rates below, never at once.
  maxSpeed: 420,
  // Rest to top speed in five steps (about 80 ms).
  acceleration: 6000,
  // Letting go stops a full run in about 90 ms, an 18-unit slide.
  deceleration: 4800,
  // Pressing against the way it moves brakes at acceleration x turnBoost
  // (never softer than deceleration), then accelerates the new way: a
  // full turn in six steps, never a one-step flip.
  turnBoost: 2.2,
  // Above top speed with nothing held: the excess bleeds off at this rate.
  overspeedDeceleration: 5400,
  // ...and holding the way it moves: far more gently, so speed earned is
  // kept for longer by whoever keeps going.
  overspeedHoldDeceleration: 2400,

  // ---- Air ------------------------------------------------------------------
  // Steering bends the drift instead of replacing it.
  airAcceleration: 4000,
  // The gentle drag with nothing held.
  airDeceleration: 360,
  airTurnBoost: 2.0,
  // A burst the fighter gave itself (a Dash's or an air dash's, see
  // Fighter.burst) bleeds off above top speed in the air at this rate. A
  // launch's speed never does: it flies on under the air drag alone.
  airOverspeedDeceleration: 2600,

  // ---- Jumps and falling ------------------------------------------------------
  // The normal jump's upward speed: about 170 units high.
  jumpVelocity: 920,
  gravityScale: 1,
  maxFallSpeed: 1500,
  // Down held while falling speeds the fall toward fastFallSpeed.
  fastFallAcceleration: 14000,
  fastFallSpeed: 1500,
  // How long after leaving the ground a ground jump is still allowed, and
  // how long a jump press waits for the first step it can be used.
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  // Jump still held this long after takeoff makes the higher jump, up to
  // highJumpHeight x the normal jump's height.
  highJumpWindow: 0.15,
  highJumpHeight: 1.4,
  // The triple jump: the ground jump, then two more in the air, each at
  // airJumpRatio x the jump's speed (about 105 units each). Landing or a hit
  // gives both back. Kept to that height so no stage's highest footing can
  // jump a fighter into the Void above it.
  airJumps: 2,
  airJumpRatio: 0.78,

  // ---- The Dash and the air dash ---------------------------------------------
  // An explicit mouvement request Dashes on the ground and air dashes in the air. Each is a burst
  // at its speed (never slower than the fighter already goes that way) for
  // its duration, its clip played once across it; an attack, a jump or a
  // Deflect may cut either short from dashCancelTime on. Its speed carries
  // on after it.
  dashSpeed: 1250,
  dashDuration: 1 / 6,
  dashCancelTime: 0.05,
  airDashSpeed: 1250,
  airDashDuration: 1 / 6,
  airDashUses: 1,

  // ---- Combat responsiveness --------------------------------------------------
  // How long an attack press the fighter cannot act on yet is kept.
  attackBuffer: 0.15,

  // ---- Stunned ------------------------------------------------------------------
  // How a launch or push runs down while stunned, whatever is held: the
  // rates Launch Point is tuned against (js/data/launch.js).
  hitstunFriction: 1600,
  hitstunAirDrag: 210,

  // How long a platform drop ignores the platform (the training CPU's).
  dropThroughTime: 0.28,
});

// Every universal movement field.
export const MOVEMENT_FIELDS = Object.freeze(Object.keys(BASE_FIGHTER_MOVEMENT));

// What a fighter definition may not declare: its own movement profile, the
// retired Powers (Jump Power and Speed Power, which once set a fighter's
// jump and top speed by tier) or any universal movement field at its top
// level. Problems, as messages (none: an empty list).
export function movementProblems(def) {
  const owner = def?.displayName ?? def?.id ?? 'A fighter';
  const out = [];
  if (def?.movement !== undefined) out.push(`${owner} declares \`movement\`: movement is universal (js/data/movement.js)`);
  if (def?.powers !== undefined) out.push(`${owner} declares \`powers\`: Jump Power and Speed Power are retired; movement is universal`);
  for (const field of MOVEMENT_FIELDS) {
    if (def && Object.hasOwn(def, field)) out.push(`${owner} declares \`${field}\`: movement is universal`);
  }
  return out;
}

// Throws, naming every problem, for a definition that declares movement of
// its own (see movementProblems).
export function assertUniversalMovement(def) {
  const problems = movementProblems(def);
  if (problems.length) throw new Error(`[Alva] ${problems.join('; ')}`);
}

// ---- Discover ---------------------------------------------------------------------

// The reference copy (English; js/localization/strings/en.js reads it from
// here, fr.js translates it): mechanics only, no numbers, no fighter.
export const MOVEMENT_SUMMARY =
  'Movement is the same for everyone: one run, one set of jumps, one Dash. What sets each apart is their moves.';

export const MOVEMENT_GUIDE = Object.freeze([
  Object.freeze({
    id: 'run',
    name: 'Run',
    description: 'Quick to full speed and quick to turn. Speed you build carries on through jumps, attacks and landings.',
  }),
  Object.freeze({ id: 'jump', name: 'Jump', description: 'A tap is the normal jump; held a little longer, the higher jump.' }),
  Object.freeze({
    id: 'airJumps',
    name: 'Triple jump',
    description: 'Two more jumps in mid-air. Landing or being hit gives them back.',
  }),
  Object.freeze({ id: 'fastFall', name: 'Fast fall', description: 'Hold Down while falling to drop faster.' }),
  Object.freeze({
    id: 'dash',
    name: 'Dash',
    description: 'Press Q/E, Select/View + left/right on gamepad, or a movement button for a burst of speed. An attack or a jump can cut in after a moment.',
  }),
  Object.freeze({ id: 'airDash', name: 'Air dash', description: 'The Dash in mid-air, flat across, once per airtime.' }),
]);
