// Attack schema: how a character's `attacks` entries become the frozen
// attack definitions the Fighter, the CombatSystem, summons and the combat AI
// all read. Universal: every fighter's attacks go through the same
// createAttackDefinition, whatever the fighter.
//
// Inputs: one attack entry from a character definition
// (js/data/characters/<id>.js), plus its id; Base Launch / Directional
// Launch and damage validation from js/data/launch.js, the hit effects
// (paralyze, blockPush) from js/game/combat/hit-effects.js and the attack
// classification from js/game/combat/offense.js.
// Outputs: createAttackDefinition, attackPhase, attackReleaseAt, strikeLive, attackReach,
// isMeleeAttack / isRangedAttack (what kind of strike an attack is),
// MOTION_TYPES and PHASE_EPSILON (the slack every phase boundary compares with).
// Important constraints: definitions are frozen and validated once; a
// field this schema does not know is carried along untouched, never
// guessed at. Defaults below (and the shared attack movement, see
// js/data/attack-movement.js) change every fighter that leaves the field
// out.
//
//
// Attacks are pure data on the character definition; Fighter turns each entry
// into a frozen definition with createAttackDefinition(). Every character
// keys its attacks by the universal move codenames (MOVES in js/config.js),
// whatever it calls them in game: a numbered attack is `attackN` on the
// ground and `midair_attackN` in the air (both on the attackN button), the
// extra attack `extra_attack`. Which numbered attacks a character has, each
// a button of its own, is its loadout (js/data/loadout.js). Each fighter's
// own attacks are in its definition (js/data/characters/<id>.js). The
// general shape, with example values:
//
//   attacks: {
//     attack1: {
//       animation: 'attack1', startup: 0.07, active: 0.05, recovery: 0.16,
//       damage: 3, hitbox: { x: 18, y: -62, w: 34, h: 18 },
//       baseLaunch: 1, directionalLaunch: 'horizontal', hitstun: 0.22, blockstun: 0.14,
//     },
//     attack2: { ..., baseLaunch: 2, directionalLaunch: 'vertical' },
//     midair_attack2: { animation: 'midair_attack2', ..., baseLaunch: 2, directionalLaunch: 'reverseVertical' },
//   },
//   // One attack per control codename, or { ground, air } chosen by grounded state.
//   actions: {
//     extra_attack: 'extra_attack',
//     attack1: { ground: 'attack1', air: 'midair_attack1' },
//     attack2: { ground: 'attack2', air: 'midair_attack2' },
//   }
//
// Every hit (an attack's, a projectile's, a technique's) deals one of the
// damage tiers (1, 3, 5 or 10: ALLOWED_DAMAGE_VALUES in js/data/launch.js)
// and declares its Base Launch (`baseLaunch`: 0, 1, 2 or 3, a multiplier, never a
// velocity) and its Directional Launch (`directionalLaunch`: null,
// 'horizontal', 'vertical' or 'reverseVertical'), independently of each
// other and of its damage (see js/data/launch.js). createAttackDefinition
// validates all three once; a hit that declares neither launch field never
// launches. An attack that strikes (one with a hitbox) must declare its
// damage; one without (a throw: its projectile is the hit) may not.
//
// `cooldown` is a per-move reuse delay, never added to attack phases. It is
// the cooldown policy's (js/data/cooldowns.js), derived from what the
// attack does: 5 s for one that deals 10 damage (its strikes, its slam's
// impact, the projectile it throws: pass the fighter's `projectiles` so a
// throw is judged by its projectile), 3 s for one that paralyzes, else
// none at all (an ordinary attack, the Deflect included). An entry may
// leave it out; one it declares must agree. Every definition records its
// class (`cooldownClass`). A special cooldown starts once, as the attack
// is released (`releaseAt`, see attackReleaseAt; a slam with an impact as
// that impact lands): never as it starts, and never for one interrupted
// before then. Nothing starts as it ends, is cut short or is interrupted.
//
// `energyCost` is what one use of it costs as it starts (the Energy
// policy's, js/data/energy.js): 15 for an ordinary attack that throws a
// projectile (a construct), 0 for every other (a melee strike, a throw
// with a special cooldown). Derived; one an entry declares must agree.
//
// `freeCancel` says whether the attack gives way to any valid request
// while it plays (see yieldsToRequests in js/game/combat/offense.js): an
// attack that can harm never does (only an authored, hit-confirmed
// `hitCancel` cuts it short), one that cannot (a pending attack) does, and
// so does the Deflect, a defense, by explicit rule.
//
// An attack needs real frames for its `animation`; without them it is refused
// rather than faked. Its hitbox only exists during the active phase.
// Hitboxes are defined facing right relative to the fighter's origin
// (bottom-centre) and mirrored automatically.
//
// Every attack moves its fighter by the same rules (see
// js/data/attack-movement.js and attackDrift in
// js/game/fighters/movement.js). It keeps a share of the speed the
// fighter carried into it (`momentum` on the ground, `airMomentum` in the
// air: all of it unless it says otherwise). On the ground nothing held
// steers it (no direction, no Run): that speed runs down under `friction`
// x the universal ground deceleration (1 unless it says otherwise). In the
// air every attack keeps the universal air control, the same as outside
// any attack. Declaring any field of the retired Attack Mobility system
// (`mobility`, `control`, `airControl`, `topSpeed`, `airTopSpeed`,
// `lockMovement`) is refused.
//
// A grounded direct strike also steps in: once per activation, the
// fighter's forward speed is raised to at least the Step-in's speed as its
// time crosses the Step-in's `at` (on the ground only, and only for an
// activation that started there). Every eligible strike has the shared one
// (STEP_IN) without writing anything; a move writes `step: { at, speed }`
// for a lunge of its own, or `step: false` for one that never lunges. The
// definition records the verdict (`stepIn`: 'authored', 'universal',
// 'declined' or 'exempt') and the lunge (`step`, or null).
//
//   attack2: { ..., step: { at: 0, speed: 280 }, friction: 0.6 },
//   extra_attack: { ..., step: false, momentum: 0 },
//   midair_attack2: { ..., airMomentum: 0.5, motion: { type: 'slam', ... } },
//
// `hitCancel` (seconds into the attack, or null for never) is how a
// connected attack makes room for a follow-up: once it has hit (a Shield's
// block does not count) and its time has reached hitCancel, another attack,
// a jump or a Dash may cut the rest of it short (see
// CombatState.cancellable), its cooldown starting as if it had finished.
// Nothing else does: walking and the Shield still wait for its end.
// Left alone, it plays out in full, and a whiffed or blocked attack keeps
// its whole recovery.
//
// A projectile attack has `hitbox: null` (no melee strike) and a `projectile`
// event instead: once its time crosses `spawnAt` it releases that projectile,
// exactly once, from `offset` (facing right from the origin, mirrored). The
// projectile is named after the attack that throws it (`<attack>_object`).
// See js/game/combat/projectile.js.
//
//   extra_attack: {
//     animation: 'extra_attack', startup: 1 / 12, active: 1 / 12, recovery: 1 / 12,
//     hitbox: null, projectile: { id: 'extra_attack_object', spawnAt: 1 / 12, offset: { x: 16, y: -38 } },
//     groundOnly: true,
//   },
//
// A multi-hit attack lists its strikes in `hits` instead of one hitbox:
// each strikes at most once, while its own window is open (`at` to `at +
// active`, seconds into the attack), on the first opponent its box meets,
// and resolves with its own `damage` (required: each strike is a hit of
// its own, one of the damage tiers), `baseLaunch` and `directionalLaunch`
// (0 and none unless it declares them). A strike's `hitbox`, `hitstun`,
// `blockstun`, `hitstop` and `carry` default to the attack's own. The
// attack's startup and active phase follow from its strikes (startup to the
// first one's window, active until the last one's closes; declaring either
// is refused), and so do the fields a reader of the whole attack goes by:
// `hitbox` is the box round every strike's, `damage` their sum (derived,
// so it need not be a tier itself), and
// `baseLaunch` / `directionalLaunch` the last strike's (the finisher). A
// Shield that blocks a strike stops the string there: the later strikes
// strike nothing (so a flurry can never empty a Shield on its own).
//
//   attack2: {
//     animation: 'attack2', recovery: 1 / 20, hitbox: { x: 14, y: -70, w: 72, h: 70 }, hitstun: 0.25,
//     hits: [
//       { at: 2 / 20, active: 1 / 20, damage: 1 },
//       { at: 3 / 20, active: 1 / 20, damage: 3, baseLaunch: 2, directionalLaunch: 'horizontal' },
//     ],
//   },
//
// `carry` (a strike's, a projectile's or an attack's own) drags what it hits
// along: a real hit that launches nothing takes the velocity of whatever
// struck (the attacker's body, or the projectile), less `lift` upward, so a
// rising strike carries its target up with it and a travelling one along.
//
//   carry: { lift: 0 },
//
// `motion` is movement the attack makes itself, owning the fighter's
// velocity while it lasts (gravity included, where it says so). Six kinds:
//
//   homing  the lock-on dash. Through the startup the fighter hangs in the
//           air (no gravity, its drift braking). As the active phase opens
//           it locks on to its opponent if it is in play, within `range` of
//           the fighter's middle (middle to middle) and not behind it, and
//           dashes at `speed`, re-aimed at the target's middle every step,
//           until the active phase is over; with nobody to lock on to it
//           dashes straight ahead instead. Contact (a hit or a block) ends
//           the dash: the fighter springs off the target, `rebound` upward
//           and `recoil` back. A dash that ends without contact keeps
//           `exit` of its velocity; one that reaches the ground stops there.
//   bounce  the plunge. The startup hangs, then the fighter drops at a fixed
//           `fallSpeed` (no gravity; its drift under the universal air
//           control) until it meets the ground or an opponent: either sends
//           it back up at `rebound` and ends the attack at once, so it can
//           bounce again. Meeting the ground this way is no landing.
//   slam    the plunge that lands. The startup hangs, then the fighter
//           drops at a fixed `fallSpeed` (no gravity; its drift under the
//           universal air control) until it meets the ground, striking
//           whatever it passes on the way (an opponent never stops it).
//           Meeting the ground ends the plunge there: the fighter stands
//           where it landed, its `impact` (if any: `{ hitbox, hit,
//           animation }`) strikes once every opponent its box meets round
//           the landing point (facing right from the fighter's origin,
//           mirrored; its hit an attack's own, a `quake` included), and
//           the attack goes straight to its recovery: the landing, played
//           on the ground (no landing cancel) in its impact's `animation`
//           if it names one. A plunge whose active phase runs out in the
//           air lands nothing: it carries on under gravity.
//   rise    the lift. The startup hangs, then the fighter rises at `speed`
//           (no gravity; its drift under the universal air control) for the
//           active phase, and carries on up from there under gravity.
//   roll    the ground roll. Through the startup the fighter curls up,
//           sliding on as any attack does; then it rolls the way it
//           faces at `speed` plus `keep` x the running speed it had as the
//           attack started (never more than `maxSpeed`), losing `friction`
//           units/s every second on the ground and nothing in the air (off
//           a ledge it flies on), for the rest of the attack; a wall stops
//           it. Nothing steers the roll itself. A Shield that blocks it
//           stops it dead, sending it back at `recoil`.
//
// A motion attack never turns while it plays (a homing dash faces the way
// it flies), and never starts while its fighter is still flying from a
// launch (see Fighter.launch): a hang, a dash, a plunge or a lift would wipe
// out the launch that carries it away, so it has to recover first (an air
// jump, a fast fall, or landing).
//
//   midair_attack1: { ..., motion: { type: 'homing', range: 240, speed: 1000, rebound: 760, recoil: 140, exit: 0.2 } },
//   midair_attack2: { ..., motion: { type: 'bounce', fallSpeed: 1300, rebound: 900 } },
//   midair_attack2: { ..., motion: { type: 'slam', fallSpeed: 1500, impact: {
//     hitbox: { x: -110, y: -40, w: 220, h: 44 }, hit: { damage: 3, baseLaunch: 2, directionalLaunch: 'vertical', quake: true },
//     animation: 'midair_attack2_impact' } } },
//   midair_attack3: { ..., motion: { type: 'rise', speed: 460 } },
//   attack3: { ..., motion: { type: 'roll', speed: 400, keep: 0.8, maxSpeed: 820, friction: 420, recoil: 260 } },
//   midair_attack1: { ..., motion: { type: 'hover' } },
//
// `pull` draws opponents in while the attack's active phase is open: every
// step, an opponent whose middle is within `radius` of the point `offset`
// (facing right from the fighter's origin, mirrored with its facing) is
// moved toward that point at up to `speed` world units / s, straight
// there, never past it. A raised Shield holds its ground (it is not
// pulled), and so does a fighter held in place (paralyzed) or out of play.
// With `front: true` it reaches only the side it faces: an opponent whose
// middle is behind its fighter is left where it is. The attack's own
// hitbox then meets whoever was drawn into it. The same rule runs a
// projectile's `pull` (see js/game/combat/projectile.js), its front the
// way it flies.
//
//   midair_attack3: { ..., pull: { radius: 150, speed: 900, offset: { x: 44, y: -60 } } },
//   extra_attack: { ..., pull: { radius: 300, speed: 900, offset: { x: 30, y: -60 }, front: true } },
//
// `deflectProjectiles: true` turns projectiles back: while the attack's
// active phase is open, any other fighter's projectile its hitbox meets is
// turned around and becomes this fighter's (see
// CombatSystem.deflectProjectiles in js/game/combat/combat.js), before any
// projectile strikes on that step. Only an attack that says so does it
// (every fighter's Deflect, see js/game/combat/deflect.js); a hitbox alone
// never stops a projectile.
//
//   deflect: { ..., hitbox: { x: 6, y: -118, w: 44, h: 98 }, deflectProjectiles: true },
//
// Every hit may also declare the shared hit effects (see
// js/game/combat/hit-effects.js): `paralyze`, `blockPush`, `quake` (it
// reaches only fighters standing on the ground), `charm` (for a while
// its target's hits on this fighter heal it instead), `float` (it lifts
// its target, held helpless, into the air), `fear` (for a while this
// fighter's hits on its target feed it) and `gaze` (it reaches only a
// fighter facing it). A multi-hit attack's
// strikes take the attack's own unless they declare theirs. None
// gets past an active Shield, and nothing may declare a way past one
// (`unblockable` and the rest of SHIELD_BYPASS_FIELDS in
// js/game/combat/offense.js are refused): every attack is blockable.
//
// Every definition built here carries its classification, `offense` (see
// js/game/combat/offense.js), inferred from what it does: an attack that
// strikes, throws a projectile or turns projectiles back is an attack
// (`offense.attack`), and one that turns them back is a defense too
// (`offense.defense`: the Deflect). A pending attack is neither. An entry
// may state `offensive` only to agree with that.
//
// Four more fields shape an attack's body. `airUses` (a count) is how many
// times it may start in the air before the fighter lands again or is hit (0,
// the default, is no limit). `freeFall: true` spends the rest of the
// airtime: started in the air, it leaves the fighter in free fall, with no
// attack or air jump left until it lands or is hit (a recovery move's
// price). `passThrough: true` lets the fighter pass
// through other fighters while it plays (no pushbox). `hurtboxes` replaces
// the fighter's own hurtboxes while it plays (a roll tucked into a ball is
// a smaller target).
//
// A pending attack (`pending: true`) is one whose art is in but whose
// combat attributes are not authored yet: it plays its clip once, first
// frame to last, and strikes nothing. It has no hitbox, projectile, damage
// or launch, and declaring any of them is refused (drop `pending` to author
// them). Its length is one pass of its clip (the fighter's art decides it:
// see createAttackDefinition's `clipDuration`), all of it recovery, so the
// fighter is committed and harmless for exactly as long as the art plays.
// No cooldown, no Energy, no hit-cancel, no Step-in; it gives way to any
// valid request (it harms nobody); it carries its fighter's speed like any
// attack. Nothing
// about it names a fighter: any fighter whose art arrives before its
// attributes can use it.
//
//   attack1: { animation: 'attack1', pending: true },

import { cooldownClass, resolveCooldown } from '../../data/cooldowns.js';
import { resolveMoveEnergy } from '../../data/energy.js';
import { resolveAttackCarry, resolveStepIn } from '../../data/attack-movement.js';
import { resolveHitDamage, resolveHitLaunch } from '../../data/launch.js';
import { createHit, resolveHitEffects } from './hit-effects.js';
import { assertNoShieldBypass, attackOffense, resolveOffense, yieldsToRequests } from './offense.js';

const ATTACK_DEFAULTS = {
  animation: null,
  startup: 0.08,
  active: 0.06,
  recovery: 0.18,
  damage: 0,         // none until declared: an attack that strikes must declare its own (see above)
  hitbox: { x: 0, y: -60, w: 30, h: 20 },
  hitstun: 0.2,
  blockstun: 0.12,
  hitstop: 0.06,
  cooldown: 0,
  groundOnly: false,
  // momentum, airMomentum and friction: see resolveAttackCarry in
  // js/data/attack-movement.js. `step` and `stepIn`: see resolveStepIn.
  hitCancel: null,   // seconds in: from then on, once it has hit, an attack, a jump or a Dash may cut it short
  baseLaunch: 0,
  directionalLaunch: null,
  projectile: null, // { id, spawnAt, offset } for a projectile attack
  pending: false,   // art only, its attributes not authored yet (see above)
  hits: null,        // a multi-hit attack's strikes (see above)
  carry: null,       // { lift }: a real hit drags its target along (see above)
  motion: null,      // movement the attack makes itself (see above)
  airUses: 0,        // starts allowed per airtime; 0 is no limit
  freeFall: false,   // started in the air, it leaves the fighter in free fall (see above)
  passThrough: false, // passes through other fighters while it plays
  hurtboxes: null,   // the fighter's hurtboxes while it plays; null keeps its own
  pull: null,        // { radius, speed, offset }: draws opponents in while it is active (see above)
  deflectProjectiles: false, // its live hitbox turns other fighters' projectiles back (see above)
  paralyze: 0,       // the shared hit effects (js/game/combat/hit-effects.js)
  blockPush: 0,
  quake: false,
  charm: 0,
  float: 0,
  fear: 0,
  gaze: false,
};

// Every kind of attack motion (see above), with its fields' defaults. The
// ones a kind cannot do without are listed in MOTION_REQUIRED.
const MOTION_DEFAULTS = Object.freeze({
  homing: Object.freeze({ range: 0, speed: 0, rebound: 0, recoil: 0, exit: 0 }),
  bounce: Object.freeze({ fallSpeed: 0, rebound: 0 }),
  rise: Object.freeze({ speed: 0 }),
  roll: Object.freeze({ speed: 0, keep: 0, maxSpeed: Infinity, friction: 0, recoil: 0 }),
  hover: Object.freeze({}),
  slam: Object.freeze({ fallSpeed: 0, impact: null }),
});
const MOTION_REQUIRED = Object.freeze({
  homing: ['range', 'speed'], bounce: ['fallSpeed'], rise: ['speed'], roll: ['speed'], hover: [], slam: ['fallSpeed'],
});

export const MOTION_TYPES = Object.freeze(Object.keys(MOTION_DEFAULTS));

// The frozen motion of attack `id` (`owner` in errors) from its `motion`
// entry, or null. An unknown kind, or one missing a speed it cannot do
// without, is refused; so is an impact on anything but a slam.
function resolveMotion(spec, owner, id) {
  if (!spec) return null;
  const defaults = MOTION_DEFAULTS[spec.type];
  if (!defaults) throw new Error(`[Alva] ${owner} has motion type "${spec.type}" (${MOTION_TYPES.join(', ')})`);
  const motion = { ...defaults, ...spec };
  for (const field of MOTION_REQUIRED[spec.type]) {
    if (!(motion[field] > 0)) throw new Error(`[Alva] ${owner}'s ${spec.type} motion needs a positive ${field}`);
  }
  if (spec.impact !== undefined && spec.type !== 'slam') throw new Error(`[Alva] ${owner}'s ${spec.type} motion has an impact: only a slam lands with one`);
  if (spec.type === 'slam') motion.impact = resolveImpact(spec.impact, owner, id);
  return Object.freeze(motion);
}

// A slam's frozen impact (see `slam` above) from its `impact` entry, or
// null: its box (facing right from the fighter's origin where it lands,
// mirrored), its hit (an attack's hit, validated as one: see createHit in
// js/game/combat/hit-effects.js, its id the attack's own) and the clip its
// landing plays, if any.
function resolveImpact(spec, owner, id) {
  if (!spec) return null;
  const who = `${owner}'s impact`;
  assertNoShieldBypass(spec, who);
  const box = spec.hitbox;
  if (!(box?.w > 0 && box?.h > 0)) throw new Error(`[Alva] ${who} needs a hitbox`);
  if (!spec.hit) throw new Error(`[Alva] ${who} needs a hit`);
  return Object.freeze({
    hitbox: Object.freeze({ x: box.x ?? 0, y: box.y ?? 0, w: box.w, h: box.h }),
    hit: createHit(id, spec.hit, who),
    animation: spec.animation ?? null,
  });
}

// The frozen pull (see `pull` above) of `owner` from its `pull` entry, or
// null. Its radius and speed must be positive; its point defaults to the
// fighter's origin, and it reaches both sides unless it says `front`.
export function resolvePull(spec, owner) {
  if (!spec) return null;
  if (!(spec.radius > 0) || !(spec.speed > 0)) throw new Error(`[Alva] ${owner}'s pull needs a positive radius and speed`);
  if (spec.front !== undefined && typeof spec.front !== 'boolean') throw new Error(`[Alva] ${owner}'s pull front must be true or false`);
  const o = spec.offset ?? {};
  return Object.freeze({ ...spec, front: !!spec.front, offset: Object.freeze({ x: o.x ?? 0, y: o.y ?? 0 }) });
}

// The fields a strike of a multi-hit attack takes from the attack when it
// does not declare its own, and the ones only the strikes may declare.
const STRIKE_INHERITS = Object.freeze([
  'hitbox', 'hitstun', 'blockstun', 'hitstop', 'carry', 'paralyze', 'blockPush', 'quake', 'charm', 'float', 'fear', 'gaze',
]);
const STRIKE_ONLY = Object.freeze(['startup', 'active', 'damage', 'baseLaunch', 'directionalLaunch']);

// A multi-hit attack's strikes, frozen and validated, and what they make of
// the whole attack (see `hits` above): its startup and active phase, the box
// round every strike's, its damage and its finisher's launch.
function resolveStrikes(spec, base) {
  const owner = `Attack "${spec.id}"`;
  if (!Array.isArray(spec.hits) || !spec.hits.length) throw new Error(`[Alva] ${owner}'s hits must be a list of strikes`);
  const declared = STRIKE_ONLY.filter((field) => spec[field] !== undefined);
  if (declared.length) throw new Error(`[Alva] ${owner} lists hits but declares ${declared.join(', ')}: each strike declares its own`);
  let last = -Infinity;
  const hits = spec.hits.map((h, index) => {
    const who = `${owner} hit ${index + 1}`;
    assertNoShieldBypass(h, who);
    if (!(h.at >= 0) || !(h.active > 0)) throw new Error(`[Alva] ${who} needs an \`at\` from 0 and a positive \`active\``);
    if (h.at < last) throw new Error(`[Alva] ${who} starts before the strike listed ahead of it`);
    last = h.at;
    const strike = { id: spec.id, index, at: h.at, active: h.active, damage: resolveHitDamage(h.damage, who) };
    // The attack's own fields, or the defaults, except the box: a strike
    // with none of its own and none on the attack is refused, never given a
    // default box nobody drew.
    for (const field of STRIKE_INHERITS) strike[field] = h[field] !== undefined ? h[field] : base[field];
    strike.hitbox = h.hitbox ?? spec.hitbox ?? null;
    if (!strike.hitbox) throw new Error(`[Alva] ${who} has no hitbox (its own or the attack's)`);
    return Object.freeze({ ...strike, ...resolveHitLaunch(h, who), ...resolveHitEffects(strike, who) });
  });
  const startup = hits[0].at;
  const end = Math.max(...hits.map((h) => h.at + h.active));
  const x0 = Math.min(...hits.map((h) => h.hitbox.x));
  const y0 = Math.min(...hits.map((h) => h.hitbox.y));
  const x1 = Math.max(...hits.map((h) => h.hitbox.x + h.hitbox.w));
  const y1 = Math.max(...hits.map((h) => h.hitbox.y + h.hitbox.h));
  const finisher = hits[hits.length - 1];
  return {
    hits: Object.freeze(hits),
    startup,
    active: end - startup,
    hitbox: Object.freeze({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }),
    damage: hits.reduce((sum, h) => sum + h.damage, 0),
    baseLaunch: finisher.baseLaunch,
    directionalLaunch: finisher.directionalLaunch,
  };
}

// Where attack `def`'s strikes can land over its whole active phase, facing
// right from the fighter's origin (the hitbox itself, for an attack that
// makes no motion of its own): a roll's box swept along its path from a
// standstill, a plunge's down and a lift's up, and a homing dash's lock-on
// range round the box's middle, ahead of it. For readers that plan or fear
// an attack (the combat AI), never for resolving one. Null without a
// hitbox.
export function attackReach(def) {
  const hb = def?.hitbox;
  if (!hb) return null;
  const m = def.motion;
  if (!m || m.type === 'hover') return pullReach(def, hb);
  const t = def.active;
  if (m.type === 'roll') {
    const brake = m.friction > 0 ? Math.min(t, m.speed / m.friction) : t;
    const reach = m.speed * brake - 0.5 * m.friction * brake * brake;
    return { x: hb.x, y: hb.y, w: hb.w + reach, h: hb.h };
  }
  if (m.type === 'bounce') return { x: hb.x, y: hb.y, w: hb.w, h: hb.h + m.fallSpeed * t };
  if (m.type === 'slam') {
    // The plunge, and its impact where the plunge would land at the
    // furthest.
    const fall = m.fallSpeed * t;
    const plunge = { x: hb.x, y: hb.y, w: hb.w, h: hb.h + fall };
    const ib = m.impact?.hitbox;
    if (!ib) return plunge;
    const x0 = Math.min(plunge.x, ib.x);
    const y0 = Math.min(plunge.y, ib.y + fall);
    const x1 = Math.max(plunge.x + plunge.w, ib.x + ib.w);
    const y1 = Math.max(plunge.y + plunge.h, ib.y + ib.h + fall);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  if (m.type === 'rise') return { x: hb.x, y: hb.y - m.speed * t, w: hb.w, h: hb.h + m.speed * t };
  const cy = hb.y + hb.h / 2;
  return { x: hb.x, y: cy - m.range - hb.h / 2, w: m.range + hb.w, h: 2 * m.range + hb.h };
}

// What kind of strike attack definition `def` is, for every reader that
// sorts attacks (today the combat AI's moveset in js/game/ai/moveset.js),
// so no two can ever disagree: a projectile attack is ranged; an attack
// with a hitbox of its own and no projectile is melee. A pending attack has
// neither, so it is neither.
export function isRangedAttack(def) {
  return !!def?.projectile;
}

export function isMeleeAttack(def) {
  return !!def?.hitbox && !def.projectile;
}

// An attack's box widened to take in its pull (see `pull` above): an
// opponent anywhere in the pull's circle is drawn into the box, so the
// strike reaches it there.
function pullReach(def, hb) {
  const p = def.pull;
  if (!p) return hb;
  const x0 = Math.min(hb.x, p.front ? Math.max(0, p.offset.x - p.radius) : p.offset.x - p.radius);
  const y0 = Math.min(hb.y, p.offset.y - p.radius);
  const x1 = Math.max(hb.x + hb.w, p.offset.x + p.radius);
  const y1 = Math.max(hb.y + hb.h, p.offset.y + p.radius);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Whether multi-hit strike `hit` is live `time` seconds into its attack.
export function strikeLive(hit, time) {
  return time >= hit.at - PHASE_EPSILON && time < hit.at + hit.active - PHASE_EPSILON;
}

// Attack time is a sum of fixed steps, so compare phase boundaries with a
// little slack: a phase that is a whole number of steps long (e.g. 1 / 12 s at
// 60 Hz) then lasts exactly that many steps instead of drifting by one.
export const PHASE_EPSILON = 1e-6;

// 'startup' | 'active' | 'recovery' for an attack `time` seconds in. Shared
// by fighters (CombatState.phase) and clones.
export function attackPhase(def, time) {
  if (time < def.startup - PHASE_EPSILON) return 'startup';
  if (time < def.startup + def.active - PHASE_EPSILON) return 'active';
  return 'recovery';
}

// Seconds into attack `def` at which it is released (see RELEASE_EVENTS in
// js/data/cooldowns.js), or null when no time releases it: a single strike
// as it goes live (its startup over), a multi-hit string as its last
// strike goes live, a throw as its projectile spawns (an attack that does
// both, once both have). A slam with an impact is released by the impact
// itself, as it lands (see Fighter.landSlam), and a pending attack never
// is: both null.
export function attackReleaseAt(def) {
  if (!def || def.pending) return null;
  if (def.motion?.type === 'slam' && def.motion.impact) return null;
  let at = null;
  if (def.hits?.length) at = def.hits[def.hits.length - 1].at;
  else if (def.hitbox) at = def.startup;
  if (def.projectile) at = Math.max(at ?? 0, def.projectile.spawnAt ?? 0);
  return at;
}

// What a pending attack may not declare: everything that would make it hit
// or time a strike.
const PENDING_REFUSED = Object.freeze([
  'startup', 'active', 'recovery', 'damage', 'hitbox', 'projectile', 'baseLaunch', 'directionalLaunch',
  'hitstun', 'blockstun', 'hitstop', 'cooldown', 'hitCancel', 'hits', 'carry', 'motion', 'pull',
  'deflectProjectiles', 'paralyze', 'blockPush', 'quake', 'charm', 'float', 'fear', 'gaze', 'energyCost', 'step',
]);

// Frozen attack definition from a character's attack entry (plus its `id`).
// Its `baseLaunch` and `directionalLaunch` are validated here, once, as
// declared: neither is inferred from the damage, the hitbox or the other.
// A pending attack (see above) lasts `clipDuration` seconds, one pass of
// its clip, and strikes nothing. `projectiles` is the fighter's own
// `projectiles` entry: the one this attack throws counts toward its
// cooldown class (see `cooldown` above).
export function createAttackDefinition(spec, { clipDuration = 0, projectiles = null } = {}) {
  if (!spec?.id) throw new Error('[Alva] Attack definitions need an id');
  const owner = `Attack "${spec.id}"`;
  assertNoShieldBypass(spec, owner);
  if (spec.pending) {
    const declared = PENDING_REFUSED.filter((field) => spec[field] !== undefined);
    if (declared.length) {
      throw new Error(`[Alva] Attack "${spec.id}" is pending but declares ${declared.join(', ')}: drop \`pending\` to author it`);
    }
    const def = {
      ...ATTACK_DEFAULTS, ...spec, ...resolveAttackCarry(spec, owner),
      pending: true, startup: 0, active: 0, recovery: Math.max(0, clipDuration), hitbox: null, projectile: null,
    };
    def.total = def.recovery;
    def.cooldownClass = 'ordinary';
    def.releaseAt = null;
    def.energyCost = 0;
    def.step = null;
    def.stepIn = 'exempt';
    def.offense = resolveOffense(spec, attackOffense(def), owner);
    def.freeCancel = yieldsToRequests(def.offense);
    return Object.freeze(def);
  }
  const def = spec.hits
    ? { ...ATTACK_DEFAULTS, ...spec, ...resolveAttackCarry(spec, owner) }
    : { ...ATTACK_DEFAULTS, ...spec, ...resolveAttackCarry(spec, owner), ...resolveHitLaunch(spec, owner) };
  Object.assign(def, resolveHitEffects(spec, owner));
  if (spec.hits) Object.assign(def, resolveStrikes(spec, def));
  else if (def.hitbox) def.damage = resolveHitDamage(spec.damage, owner);
  else if (spec.damage !== undefined) {
    throw new Error(`[Alva] ${owner} declares damage but has no hitbox: its projectile's hit is the one that deals damage`);
  }
  def.cooldownClass = cooldownClass('attack', spec, { projectiles });
  def.cooldown = resolveCooldown(spec.cooldown, owner, { cls: def.cooldownClass });
  def.energyCost = resolveMoveEnergy(spec.energyCost, owner, 'attack', def, def.cooldownClass);
  def.motion = resolveMotion(spec.motion, owner, spec.id);
  def.pull = resolvePull(spec.pull, owner);
  def.deflectProjectiles = !!def.deflectProjectiles;
  if (def.deflectProjectiles && !def.hitbox) throw new Error(`[Alva] ${owner} deflects projectiles but has no hitbox to do it with`);
  def.total = def.startup + def.active + def.recovery;
  def.releaseAt = attackReleaseAt(def);
  Object.assign(def, resolveStepIn(spec, def, owner));
  def.offense = resolveOffense(spec, attackOffense(def), owner);
  def.freeCancel = yieldsToRequests(def.offense);
  return Object.freeze(def);
}
