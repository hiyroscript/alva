// Combat architecture.
//
// Attacks are pure data on the character definition; Fighter turns each entry
// into a frozen definition with createAttackDefinition(). Every character
// keys its attacks by the universal move codenames (MOVES in js/config.js),
// whatever it calls them in game: a numbered attack is `attackN` on the
// ground and `midair_attackN` in the air (both on the attackN button), the
// extra attack `extra_attack`. Which numbered attacks a character has, each
// a button of its own, is its loadout (js/data/loadout.js).
// #0001's (its punch, kunai slash, kick, air kick and Throw) are the real
// attacks so far; see js/data/characters.js. The general shape:
//
//   attacks: {
//     attack1: {
//       animation: 'attack1', startup: 0.07, active: 0.05, recovery: 0.16,
//       damage: 6, hitbox: { x: 18, y: -62, w: 34, h: 18 },
//       baseLaunch: 1, directionalLaunch: 'horizontal', hitstun: 0.22, blockstun: 0.14, cooldown: 0.1,
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
// Every hit (an attack's, a projectile's, a technique's) declares
// its Base Launch (`baseLaunch`: 0, 1, 2 or 3, a multiplier, never a
// velocity) and its Directional Launch (`directionalLaunch`: null,
// 'horizontal', 'vertical' or 'reverseVertical'), independently of each
// other and of its damage (see js/data/launch.js). createAttackDefinition
// validates them once; a hit that declares neither never launches.
//
// An attack needs real frames for its `animation`; without them it is refused
// rather than faked. Its hitbox only exists during the active phase.
// Hitboxes are defined facing right relative to the fighter's origin
// (bottom-centre) and mirrored automatically.
//
// Every attack also says how the fighter moves while it plays (see
// Fighter.moveHorizontal). Normal locomotion is off, but that is not the
// same as standing still: the attack keeps a share of the speed the fighter
// carried into it (`momentum` on the ground, `airMomentum` in the air; on
// the ground never more than that share of the fighter's top speed), lets the fighter
// steer with a share of its normal acceleration and top speed (`control`,
// `airControl`: 0 is none, 1 is all), and lets the rest of that speed run
// down under `friction` x the ground deceleration (the air drag in the air).
// A `step` is movement the attack makes itself: as its time crosses `at`,
// the fighter's forward speed is raised to at least `speed` (on the ground
// only). The defaults are a planted attack: all the speed kept, no steering,
// normal friction.
//
//   attack2: { ..., momentum: 0.5, friction: 0.5, step: { at: 0, speed: 280 } },
//   midair_attack1: { ..., airMomentum: 1, airControl: 0.6 },
//   extra_attack: { ..., momentum: 0.5, control: 0.3, friction: 0.6 },
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
// See js/game/projectile.js.
//
//   extra_attack: {
//     animation: 'extra_attack', startup: 1 / 12, active: 1 / 12, recovery: 1 / 12,
//     hitbox: null, projectile: { id: 'extra_attack_object', spawnAt: 1 / 12, offset: { x: 16, y: -38 } },
//     cooldown: 0.25, groundOnly: true,
//   },
//
// A multi-hit attack lists its strikes in `hits` instead of one hitbox:
// each strikes at most once, while its own window is open (`at` to `at +
// active`, seconds into the attack), on the first opponent its box meets,
// and resolves with its own `damage`, `baseLaunch` and `directionalLaunch`
// (0 and none unless it declares them). A strike's `hitbox`, `hitstun`,
// `blockstun`, `hitstop` and `carry` default to the attack's own. The
// attack's startup and active phase follow from its strikes (startup to the
// first one's window, active until the last one's closes; declaring either
// is refused), and so do the fields a reader of the whole attack goes by:
// `hitbox` is the box round every strike's, `damage` their sum, and
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
// velocity while it lasts (gravity included, where it says so). Four kinds:
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
//           `fallSpeed` (no gravity; air steering as its `airControl`
//           allows) until it meets the ground or an opponent: either sends
//           it back up at `rebound` and ends the attack at once, so it can
//           bounce again. Meeting the ground this way is no landing.
//   rise    the lift. The startup hangs, then the fighter rises at `speed`
//           (no gravity; air steering as its `airControl` allows) for the
//           active phase, and carries on up from there under gravity.
//   roll    the ground roll. Through the startup the fighter curls up,
//           sliding on as a planted attack does; then it rolls the way it
//           faces at `speed` plus `keep` x the running speed it had as the
//           attack started (never more than `maxSpeed`), losing `friction`
//           units/s every second on the ground and nothing in the air (off
//           a ledge it flies on), for the rest of the attack; a wall stops
//           it. No steering. A Shield that blocks it stops it dead, sending
//           it back at `recoil`.
//
// A motion attack never turns while it plays (a homing dash faces the way
// it flies), and never starts while its fighter is still flying from a
// launch (see Fighter.launch): a hang, a dash, a plunge or a lift would wipe
// out the launch that carries it away, so it has to recover first (an air
// jump, a fast fall, or landing).
//
//   midair_attack1: { ..., motion: { type: 'homing', range: 240, speed: 1000, rebound: 760, recoil: 140, exit: 0.2 } },
//   midair_attack2: { ..., motion: { type: 'bounce', fallSpeed: 1300, rebound: 900 } },
//   midair_attack3: { ..., motion: { type: 'rise', speed: 460 } },
//   attack3: { ..., motion: { type: 'roll', speed: 400, keep: 0.8, maxSpeed: 820, friction: 420, recoil: 260 } },
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
// No cooldown or hit-cancel, and it moves like any planted attack (the
// defaults below). Nothing about it names a fighter: any fighter whose art
// arrives before its attributes can use it.
//
//   attack1: { animation: 'attack1', pending: true },
//
// `shield` is the shared player input; each character's `defense` entry says
// what it does, that is how the character defends (see
// createDefenseDefinition). The one type so far is the Shield, a held guard
// all the way round the fighter:
//
//   defense: {
//     type: 'shield',
//     groundAnimation: 'shielding', airAnimation: 'midair_shielding',
//     // Optional one-frame poses around the grounded hold:
//     groundStartAnimation: 'prepshield', groundReleaseAnimation: 'releaseshield',
//     // Optional slow fall while it is up in the air:
//     slowFallSpeed: 200, slowFallBrake: 6000,
//   }
//
// While it is up (CombatState.shielding, see Fighter.update) any hit that
// reaches the fighter's own hurtboxes, from either side, is blocked: it adds
// no Launch Point and launches nothing, and the fighter pays
// energy.shieldHitCost for that one hit instead. The Shield holds through
// the hit's hitstop and blockstun (CombatState.shieldStun), never a hurt
// pose. Holding it costs nothing; it cannot rise or stay up while the
// fighter is exhausted (CombatState.canShield).
//
// A hit's `damage` is added to the target's Launch Point
// (CombatState.launchPoint) first. Its launch strength is then exactly Base
// Launch x that new Launch Point, sent along its Directional Launch (see
// CombatSystem.applyHit). No Launch Point defeats a fighter: only the Void
// takes one out of play.
//
// A summon (see js/game/clone.js) is a detached attacker: a temporary clone
// that performs one of its owner's attacks from its own position and facing.
// Its hits resolve through the same applyHit and credit the owner, but, like
// a projectile's, they never freeze the owner.
//
// A technique (see js/game/technique.js) is performed by the fighter itself
// but is not an attack either: its sphere's contact, the
// ticks while it holds the target and its delayed explosion are its hits,
// resolved here through applyHit with their own data. They freeze only the
// target. A confirmed contact binds the target (CombatState.bind): a hold on
// it, separate from hitstun, that only the technique which placed it
// releases.
//
// A summon or a technique on a numbered button (see js/data/loadout.js) is
// not paid for: each has its own cooldown (CombatState.abilityCooldowns, see
// CooldownTimers), keyed by the attack it is (attack3, attack4), started
// when it is used and apart from the short recovery cooldowns of ordinary
// attacks (CombatState.cooldowns). Both run down in real time.
//
// Energy (CombatState.energy, see resolveEnergy) is the one resource a
// fighter spends, and only on Dash and Shield: a Dash pays dashCost as it
// starts (dashCancelCost when it cuts short an attack that hit), and every
// hit the Shield blocks costs shieldHitCost. Either works
// with less left than it costs, but then takes all of it. It refills by
// itself at one passive rate. Emptied, it exhausts the fighter: no Dash or
// Shield until it is full again. Nothing else (movement, jumps, attacks,
// summons, techniques) ever touches it.

import { resolveHitLaunch, resolveLaunchStrength, resolveDirectionalLaunch } from '../data/launch.js';

const ATTACK_DEFAULTS = {
  animation: null,
  startup: 0.08,
  active: 0.06,
  recovery: 0.18,
  damage: 0,
  hitbox: { x: 0, y: -60, w: 30, h: 20 },
  hitstun: 0.2,
  blockstun: 0.12,
  hitstop: 0.06,
  cooldown: 0,
  groundOnly: false,
  // The attack governs the fighter's movement while it plays (see the
  // fields below). False leaves normal locomotion on throughout.
  lockMovement: true,
  momentum: 1,       // x the horizontal speed kept as it starts on the ground
  airMomentum: 1,    // the same, starting in the air
  control: 0,        // share (0-1) of normal steering kept on the ground
  airControl: 0,     // the same in the air
  friction: 1,       // x the ground deceleration while it is not steered
  step: null,        // { at, speed }: forward speed raised to `speed` as its time crosses `at`
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
};

// Every kind of attack motion (see above), with its fields' defaults. The
// ones a kind cannot do without are listed in MOTION_REQUIRED.
const MOTION_DEFAULTS = Object.freeze({
  homing: Object.freeze({ range: 0, speed: 0, rebound: 0, recoil: 0, exit: 0 }),
  bounce: Object.freeze({ fallSpeed: 0, rebound: 0 }),
  rise: Object.freeze({ speed: 0 }),
  roll: Object.freeze({ speed: 0, keep: 0, maxSpeed: Infinity, friction: 0, recoil: 0 }),
});
const MOTION_REQUIRED = Object.freeze({
  homing: ['range', 'speed'], bounce: ['fallSpeed'], rise: ['speed'], roll: ['speed'],
});

export const MOTION_TYPES = Object.freeze(Object.keys(MOTION_DEFAULTS));

// The frozen motion of attack `owner` from its `motion` entry, or null. An
// unknown kind, or one missing a speed it cannot do without, is refused.
function resolveMotion(spec, owner) {
  if (!spec) return null;
  const defaults = MOTION_DEFAULTS[spec.type];
  if (!defaults) throw new Error(`[Alva] ${owner} has motion type "${spec.type}" (${MOTION_TYPES.join(', ')})`);
  const motion = { ...defaults, ...spec };
  for (const field of MOTION_REQUIRED[spec.type]) {
    if (!(motion[field] > 0)) throw new Error(`[Alva] ${owner}'s ${spec.type} motion needs a positive ${field}`);
  }
  return Object.freeze(motion);
}

// The fields a strike of a multi-hit attack takes from the attack when it
// does not declare its own, and the ones only the strikes may declare.
const STRIKE_INHERITS = Object.freeze(['hitbox', 'hitstun', 'blockstun', 'hitstop', 'carry']);
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
    if (!(h.at >= 0) || !(h.active > 0)) throw new Error(`[Alva] ${who} needs an \`at\` from 0 and a positive \`active\``);
    if (h.at < last) throw new Error(`[Alva] ${who} starts before the strike listed ahead of it`);
    last = h.at;
    const strike = { id: spec.id, index, at: h.at, active: h.active, damage: h.damage ?? 0 };
    // The attack's own fields, or the defaults, except the box: a strike
    // with none of its own and none on the attack is refused, never given a
    // default box nobody drew.
    for (const field of STRIKE_INHERITS) strike[field] = h[field] !== undefined ? h[field] : base[field];
    strike.hitbox = h.hitbox ?? spec.hitbox ?? null;
    if (!strike.hitbox) throw new Error(`[Alva] ${who} has no hitbox (its own or the attack's)`);
    return Object.freeze({ ...strike, ...resolveHitLaunch(h, who) });
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
  if (!m) return hb;
  const t = def.active;
  if (m.type === 'roll') {
    const brake = m.friction > 0 ? Math.min(t, m.speed / m.friction) : t;
    const reach = m.speed * brake - 0.5 * m.friction * brake * brake;
    return { x: hb.x, y: hb.y, w: hb.w + reach, h: hb.h };
  }
  if (m.type === 'bounce') return { x: hb.x, y: hb.y, w: hb.w, h: hb.h + m.fallSpeed * t };
  if (m.type === 'rise') return { x: hb.x, y: hb.y - m.speed * t, w: hb.w, h: hb.h + m.speed * t };
  const cy = hb.y + hb.h / 2;
  return { x: hb.x, y: cy - m.range - hb.h / 2, w: m.range + hb.w, h: 2 * m.range + hb.h };
}

// Whether multi-hit strike `hit` is live `time` seconds into its attack.
export function strikeLive(hit, time) {
  return time >= hit.at - PHASE_EPSILON && time < hit.at + hit.active - PHASE_EPSILON;
}

// Attack time is a sum of fixed steps, so compare phase boundaries with a
// little slack: a phase that is a whole number of steps long (e.g. 1 / 12 s at
// 60 Hz) then lasts exactly that many steps instead of drifting by one.
const PHASE_EPSILON = 1e-6;

// 'startup' | 'active' | 'recovery' for an attack `time` seconds in. Shared
// by fighters (CombatState.phase) and clones.
export function attackPhase(def, time) {
  if (time < def.startup - PHASE_EPSILON) return 'startup';
  if (time < def.startup + def.active - PHASE_EPSILON) return 'active';
  return 'recovery';
}

// What a pending attack may not declare: everything that would make it hit
// or time a strike.
const PENDING_REFUSED = Object.freeze([
  'startup', 'active', 'recovery', 'damage', 'hitbox', 'projectile', 'baseLaunch', 'directionalLaunch',
  'hitstun', 'blockstun', 'hitstop', 'cooldown', 'hitCancel', 'hits', 'carry', 'motion',
]);

// Frozen attack definition from a character's attack entry (plus its `id`).
// Its `baseLaunch` and `directionalLaunch` are validated here, once, as
// declared: neither is inferred from the damage, the hitbox or the other.
// A pending attack (see above) lasts `clipDuration` seconds, one pass of
// its clip, and strikes nothing.
export function createAttackDefinition(spec, { clipDuration = 0 } = {}) {
  if (!spec?.id) throw new Error('[Alva] Attack definitions need an id');
  if (spec.pending) {
    const declared = PENDING_REFUSED.filter((field) => spec[field] !== undefined);
    if (declared.length) {
      throw new Error(`[Alva] Attack "${spec.id}" is pending but declares ${declared.join(', ')}: drop \`pending\` to author it`);
    }
    const def = {
      ...ATTACK_DEFAULTS, ...spec,
      pending: true, startup: 0, active: 0, recovery: Math.max(0, clipDuration), hitbox: null, projectile: null,
    };
    def.total = def.recovery;
    return Object.freeze(def);
  }
  const def = spec.hits
    ? { ...ATTACK_DEFAULTS, ...spec }
    : { ...ATTACK_DEFAULTS, ...spec, ...resolveHitLaunch(spec, `Attack "${spec.id}"`) };
  if (spec.hits) Object.assign(def, resolveStrikes(spec, def));
  def.motion = resolveMotion(spec.motion, `Attack "${spec.id}"`);
  def.total = def.startup + def.active + def.recovery;
  return Object.freeze(def);
}

const SHIELD_DEFAULTS = Object.freeze({
  groundAnimation: null,
  airAnimation: null,
  groundStartAnimation: null,
  groundReleaseAnimation: null,
  // A hit that lands within perfectWindow seconds of the Shield going up is
  // a perfect block: free, with no blockstun. Only a Shield raised after
  // being down for perfectRearm seconds has that window, so tapping `shield`
  // over and over never keeps one open. 0 is none.
  perfectWindow: 0,
  perfectRearm: 0,
  // Up in the air, the Shield slows the fall: a faster one brakes toward
  // slowFallSpeed (world units / s) at slowFallBrake (per second), and it
  // never falls faster while the Shield stays up. 0 is none: it falls as
  // ever.
  slowFallSpeed: 0,
  slowFallBrake: 6000,
});

// Frozen form of a character's `defense` entry, or null for a fighter that
// has none (the `shield` input then does nothing). Typed, so a future
// fighter can defend in another way; an unknown type is refused.
export function createDefenseDefinition(spec) {
  if (!spec) return null;
  if (spec.type === 'shield') return Object.freeze({ ...SHIELD_DEFAULTS, ...spec });
  throw new Error(`[Alva] Unknown defense type "${spec.type}"`);
}

// A character's `energy` entry, every field optional:
//
//   energy: {
//     max: 100,           // full, and where every fighter starts
//     regen: 12,          // per second, whatever the fighter is doing
//     dashCost: 15,       // spent once as a Dash starts
//     dashCancelCost: 40, // ...instead, by a Dash that cuts short an attack that hit
//     shieldHitCost: 25,  // spent once for every hit the Shield blocks
//   }
//
// A cost larger than what is left is still paid: it takes the rest, which
// empties the bar and exhausts the fighter (see CombatState.spendEnergy).
// Left out, dashCancelCost is the fighter's dashCost.
const ENERGY_DEFAULTS = Object.freeze({
  max: 100, regen: 12, dashCost: 15, shieldHitCost: 25,
});

// Frozen Energy settings: the character's entry over the defaults.
export function resolveEnergy(spec) {
  const energy = { ...ENERGY_DEFAULTS, ...spec };
  energy.dashCancelCost ??= energy.dashCost;
  return Object.freeze(energy);
}

// Named cooldowns that each remember their full length, so progress can be
// read back (1 - remaining / duration) without knowing where they came from.
// Used for the summons' and techniques' cooldowns
// (CombatState.abilityCooldowns).
export class CooldownTimers {
  constructor() {
    this.entries = new Map(); // id -> { remaining, duration } in seconds
  }

  // Starts (or restarts) `id` at `seconds`. A cooldown of 0 is no cooldown.
  start(id, seconds) {
    if (seconds > 0) this.entries.set(id, { remaining: seconds, duration: seconds });
    else this.entries.delete(id);
  }

  // Whether `id` is still cooling down.
  active(id) {
    return this.entries.has(id);
  }

  // Seconds left on `id`, 0 when it is ready.
  remaining(id) {
    return this.entries.get(id)?.remaining ?? 0;
  }

  // Full length of `id`'s current cooldown, 0 when it is ready.
  duration(id) {
    return this.entries.get(id)?.duration ?? 0;
  }

  // How far `id` has recovered, from 0 as it starts to 1 once it is ready.
  progress(id) {
    const e = this.entries.get(id);
    if (!e) return 1;
    return Math.min(1, Math.max(0, 1 - e.remaining / e.duration));
  }

  // Every cooldown recovers `dt` seconds; one that reaches 0 (to within a
  // little slack, as the steps are sums of floats) is over. Never negative.
  update(dt) {
    for (const [id, e] of this.entries) {
      if (e.remaining - dt <= PHASE_EPSILON) this.entries.delete(id);
      else e.remaining -= dt;
    }
  }

  clear() {
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

// Per-fighter combat state.
export class CombatState {
  constructor(energy = resolveEnergy()) {
    // Launch Point: starts at 0 on every fresh life and only ever grows, by
    // exactly the damage each hit deals (see CombatSystem.applyHit). Never
    // negative, no maximum, and it never stops the fighter acting; a
    // launching hit multiplies it by its Base Launch.
    this.launchPoint = 0;
    // Energy for Dash and Shield (see resolveEnergy): full at the start,
    // never below 0 or above maxEnergy. Emptying it (however it happens)
    // exhausts the fighter, and only a full refill clears that (see
    // setEnergy).
    this.energySpec = energy;
    this.maxEnergy = energy.max;
    this.energy = energy.max;
    this.energyExhausted = false;
    // The Shield is up (see Fighter.update): hits that reach the fighter are
    // blocked (see CombatSystem.applyHit).
    this.shielding = false;
    this.stun = 0;          // hitstun remaining
    this.shieldStun = 0;    // blockstun remaining, held in the Shield
    this.hitstop = 0;       // freeze frames on impact
    // { def, time, hasHit, confirmed, confirmedAt, projectileSpawned,
    // stepped, struck, blocked, motion }: hasHit once its hitbox (any of its
    // strikes) has struck anyone, confirmed (at its time confirmedAt) only
    // for a hit a Shield did not block, stepped once its `step` has moved
    // the fighter. A multi-hit attack also keeps the strikes it has dealt
    // (`struck`, by index) and whether a Shield stopped it (`blocked`); a
    // motion attack its motion's progress (`motion`, see Fighter).
    this.attack = null;
    this.release = null;    // the attack's projectile, released this step (see Fighter.update)
    // Ordinary attacks' short recovery cooldowns: attack id -> seconds left.
    this.cooldowns = new Map();
    // The summons' and techniques' own cooldowns (#0001's attack3 and
    // attack4), by the attack each one is: the Fighter starts them, and
    // they recover in real time (see update).
    this.abilityCooldowns = new CooldownTimers();
    this.lastIntent = null; // last combat button pressed (see Fighter.tryAction)
    // Whatever holds this fighter in place (a technique that caught
    // it), each by its own token so a source only ever releases its own hold.
    this.binds = new Set();
  }

  get attacking() {
    return !!this.attack;
  }

  // The attack in progress hit (a block does not count) and has reached its
  // hitCancel time: another attack, a jump or a Dash may cut the rest of it
  // short (see Fighter.tryAction, Fighter.tryDash and the jump in
  // Fighter.update). Never during the hit's freeze, a stun or a bind.
  get cancellable() {
    const a = this.attack;
    const at = a?.def.hitCancel;
    return !!a && a.confirmed && at != null && this.hitstop <= 0 && this.stun <= 0 && !this.immobilized &&
      a.time >= at - PHASE_EPSILON;
  }

  // Seconds the attack in progress has been cancellable (see cancellable),
  // or -1 while it is not: it may cut itself short into itself only once
  // its own cooldown has run for that long.
  get cancellableFor() {
    if (!this.cancellable) return -1;
    const a = this.attack;
    return a.time - Math.max(a.def.hitCancel, a.confirmedAt);
  }

  // Ends the attack in progress now: finished, or cut short once it is
  // cancellable. Its cooldown starts either way.
  endAttack() {
    const a = this.attack;
    if (!a) return;
    if (a.def.cooldown > 0) this.cooldowns.set(a.def.id, a.def.cooldown);
    this.attack = null;
  }

  // Drops the attack in progress with nothing left behind (no cooldown): a
  // hit or a bind took the fighter out of it (see Fighter.update).
  interruptAttack() {
    this.attack = null;
    this.release = null;
  }

  get phase() {
    const a = this.attack;
    return a ? attackPhase(a.def, a.time) : null;
  }

  // Bound: caught and held by a technique (see bind). Unlike
  // hitstun it has no timer: it lasts until its source releases it.
  get immobilized() {
    return this.binds.size > 0;
  }

  bind(source) {
    this.binds.add(source);
  }

  // Releases only `source`'s hold; any other stays.
  unbind(source) {
    this.binds.delete(source);
  }

  isBoundBy(source) {
    return this.binds.has(source);
  }

  // Free of any attack, stun (a Shield's blockstun included) or bind.
  // Launch Point never matters here, however high it is, and neither does
  // Energy. (An attack that hit may still be cut short by another attack or
  // a jump: see cancellable.)
  canAct() {
    return !this.attack && this.stun <= 0 && this.shieldStun <= 0 && !this.immobilized;
  }

  // ---- Energy -----------------------------------------------------------------

  // Whether something that costs Energy may start now: any time the fighter
  // is not exhausted, however little is left (see spendEnergy).
  canUseEnergy() {
    return !this.energyExhausted;
  }

  // Whether the Shield may be up: never while exhausted. A block it cannot
  // fully pay for still stands; it empties the bar (see CombatSystem.applyHit).
  canShield() {
    return this.canUseEnergy();
  }

  // Pays `cost` at once, if canUseEnergy allows it. True when paid. With
  // less than `cost` left it takes all of it: the bar is empty and the
  // fighter exhausted until it refills completely.
  spendEnergy(cost) {
    if (!this.canUseEnergy()) return false;
    this.setEnergy(this.energy - cost);
    return true;
  }

  regenEnergy(amount) {
    this.setEnergy(this.energy + amount);
  }

  // One step of passive recovery: regen per second.
  updateEnergy(dt) {
    this.regenEnergy(dt * this.energySpec.regen);
  }

  // Full again, not exhausted (a fresh fighter, a respawn).
  refillEnergy() {
    this.setEnergy(this.maxEnergy);
  }

  // energy / maxEnergy, from 0 to 1.
  get energyRatio() {
    return this.maxEnergy > 0 ? Math.min(1, Math.max(0, this.energy / this.maxEnergy)) : 0;
  }

  // Every change goes through here: clamped to [0, max] (to within a little
  // slack, as steps are sums of floats). Reaching 0 exhausts the fighter;
  // only reaching max again clears it.
  setEnergy(value) {
    const max = this.maxEnergy;
    let v = Math.min(max, Math.max(0, value));
    if (v <= PHASE_EPSILON) {
      v = 0;
      this.energyExhausted = true;
    } else if (v >= max - PHASE_EPSILON) {
      v = max;
      this.energyExhausted = false;
    }
    this.energy = v;
  }

  update(dt) {
    for (const [id, t] of this.cooldowns) {
      if (t - dt <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, t - dt);
    }
    // Every step, frozen or not, whatever the fighter holds or does.
    this.abilityCooldowns.update(dt);
    if (this.hitstop > 0) {
      // To within a little slack, so a freeze a whole number of steps long
      // (0.05 s) lasts exactly that many.
      this.hitstop = this.hitstop - dt <= PHASE_EPSILON ? 0 : this.hitstop - dt;
      return;
    }
    if (this.stun > 0) this.stun = Math.max(0, this.stun - dt);
    if (this.shieldStun > 0) this.shieldStun = Math.max(0, this.shieldStun - dt);
    if (this.attack) {
      this.attack.time += dt;
      // One-shot release: the step the attack's time crosses `spawnAt`. A
      // throw interrupted by a hit before that point throws nothing.
      const proj = this.attack.def.projectile;
      if (proj && !this.attack.projectileSpawned && this.attack.time >= proj.spawnAt - PHASE_EPSILON) {
        this.attack.projectileSpawned = true;
        if (this.stun <= 0) this.release = proj;
      }
      if (this.attack.time >= this.attack.def.total - PHASE_EPSILON) this.endAttack();
    }
  }
}

// How a fighter responds to being launched (the character's
// `launchReaction`, every field optional; the defaults change nothing):
//
//   launchReaction: {
//     stunPerThousand: 0.2,  // extra hitstun, seconds per 1000 units/s of launch speed
//     maxStun: 0.7,          // ...never more than this
//     tumbleSpeed: 1100,     // launched at least this fast, it tumbles
//     steerAngle: 15,        // degrees a held direction may bend a launch
//   }
//
// None of it changes a launch's strength: Launch Point, Base Launch and the
// direction's own speed stay exactly as js/data/launch.js resolves them.
const NO_REACTION = Object.freeze({ stunPerThousand: 0, maxStun: 0, tumbleSpeed: Infinity, steerAngle: 0 });

export function resolveLaunchReaction(spec) {
  return Object.freeze({ ...NO_REACTION, ...spec });
}

// The extra hitstun a launch at `speed` (world units per second) adds for
// `reaction`: stunPerThousand per 1000 units/s, up to maxStun. A harder
// launch keeps its target helpless longer, so a big hit reads as one.
export function resolveLaunchStun(speed, reaction = NO_REACTION) {
  if (!(speed > 0)) return 0;
  return Math.min(reaction.maxStun, (speed / 1000) * reaction.stunPerThousand);
}

// Launch steering: `launch` (a world-space velocity { x, y }, y downward)
// bent toward the direction `held` ({ x, y }: -1, 0 or 1 each; y -1 is up)
// by up to `maxDegrees`. Only the part of `held` across the launch counts
// (the sine of the angle between them), so holding along it or against it
// bends nothing; the speed never changes. No launch, no direction or no
// angle: `launch` as it is.
export function steerLaunch(launch, held, maxDegrees) {
  const speed = Math.hypot(launch.x, launch.y);
  const hl = Math.hypot(held?.x ?? 0, held?.y ?? 0);
  if (!(speed > 0) || !(hl > 0) || !(maxDegrees > 0)) return launch;
  const lx = launch.x / speed;
  const ly = launch.y / speed;
  const across = lx * (held.y / hl) - ly * (held.x / hl);
  if (!across) return launch;
  const a = (across * maxDegrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Object.freeze({ x: (lx * c - ly * s) * speed, y: (lx * s + ly * c) * speed });
}

// World-space rectangle for a box defined relative to a fighter origin.
export function worldBox(fighter, box, out = {}) {
  const facing = fighter.facing;
  out.x = facing > 0 ? fighter.body.x + box.x : fighter.body.x - box.x - box.w;
  out.y = fighter.body.y + box.y;
  out.w = box.w;
  out.h = box.h;
  return out;
}

const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Where hitbox `hit` meets `target`'s hurtboxes: the centre of its overlap
// with the first one it touches ({ x, y }, world units), or null when it
// touches none. The point only places the hit's effects.
function strikePoint(hit, target) {
  for (const hb of target.hurtboxes ?? target.def.hurtboxes) {
    const box = worldBox(target, hb, scratchHurt);
    if (!intersects(hit, box)) continue;
    const x0 = Math.max(hit.x, box.x);
    const x1 = Math.min(hit.x + hit.w, box.x + box.w);
    const y0 = Math.max(hit.y, box.y);
    const y1 = Math.min(hit.y + hit.h, box.y + box.h);
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }
  return null;
}

// The middle of `target`'s body, where a hit with no box of its own lands.
const bodyPoint = (target) => ({ x: target.body.x, y: target.body.y - target.body.height / 2 });

// What a fighter's strike carries its target along at (see `carry`).
const bodyVelocity = (f) => ({ x: f.body.vx, y: f.body.vy });

const scratchHit = {};
const scratchHurt = {};

// Resolves hits each simulation step: fighters' melee hitboxes, then live
// projectiles (see js/game/projectile.js), then summoned clones (see
// js/game/clone.js), then techniques (see js/game/technique.js). A
// shielding target is struck exactly like any other (its own hurtboxes,
// never a bigger circle): applyHit decides the hit is blocked, and the
// hitbox is used up either way.
export class CombatSystem {
  constructor() {
    // { type: 'hit' | 'block', attacker, target, move, damage, energyCost,
    //   launchPointBefore, launchPointAfter, baseLaunch, directionalLaunch,
    //   launchStrength, finalLaunch, launchSpeed, hitstun, perfect, point,
    //   projectile, summon, technique }
    // `damage` is what the hit added to the target's Launch Point (0 on a
    // block), `move` the id of the attack or hit that dealt it and
    // `energyCost` what the target's Shield paid for it: shieldHitCost, or
    // whatever was left when that was less (0 on a hit).
    // `baseLaunch` is the hit's Base Launch (0-3) and `directionalLaunch` its
    // direction; `launchStrength` is baseLaunch x launchPointAfter (0 on a
    // block), and `finalLaunch` the world-space velocity { x, y } the target
    // was given: that strength at LAUNCH_UNIT_SPEED per point along the
    // direction (y grows downward; zero for no launch), bent by the
    // target's launch steering; `launchSpeed` its length and `hitstun` the
    // stun it dealt, a harder launch's longer. `perfect` marks a block by a
    // Shield raised just in time (see Fighter.perfectShield) and `point` is
    // where the hit landed, for the effects. `attacker` is the
    // owner for a projectile or clone hit; `projectile`, `summon` and
    // `technique` are null for the fighter's own melee.
    this.events = [];
  }

  update(fighters, projectiles = [], clones = []) {
    this.events.length = 0;
    for (const attacker of fighters) {
      const atk = attacker.combat.attack;
      if (!atk || attacker.combat.phase !== 'active') continue;
      if (atk.def.hits) {
        this.strike(attacker, atk, fighters);
        continue;
      }
      // A projectile attack has no melee hitbox: its damage is the projectile's.
      if (!atk.def.hitbox || atk.hasHit) continue;
      const hit = worldBox(attacker, atk.def.hitbox, scratchHit);
      for (const target of fighters) {
        if (target === attacker) continue;
        const point = strikePoint(hit, target);
        if (!point) continue;
        // One hit per attack, blocked or not; only a real hit (never a
        // block) opens its hitCancel.
        atk.hasHit = true;
        const event = this.applyHit(attacker, target, atk.def, { point, velocity: bodyVelocity(attacker) });
        atk.confirmed = event.type === 'hit';
        atk.confirmedAt = atk.time;
        attacker.attackContact?.(atk, event);
        break;
      }
    }
    for (const p of projectiles) {
      if (!p.alive) continue;
      const hit = p.hitbox(scratchHit);
      for (const target of fighters) {
        if (target === p.owner || !p.ready) continue;
        if (!strikePoint(hit, target)) continue;
        // One hit, then it is gone (a Shielded projectile included); a
        // piercing one strikes again every so often until its last strike,
        // its finisher (see js/game/projectile.js).
        const def = p.nextHit;
        const event = this.applyHit(p.owner, target, def, {
          facing: p.direction, projectile: p, point: { x: p.x, y: p.y }, velocity: { x: p.vx, y: 0 },
        });
        p.struck(event.type === 'block');
        break;
      }
    }
    for (const c of clones) {
      // Only during the attack's active phase, and only once per attack.
      const hit = c.hitbox(scratchHit);
      if (!hit) continue;
      for (const target of fighters) {
        if (target === c.owner) continue;
        const point = strikePoint(hit, target);
        if (!point) continue;
        c.hasHit = true;
        // The clone's own facing, never the owner's: a horizontal launch
        // travels from the clone.
        this.applyHit(c.owner, target, c.attackDef, { facing: c.facing, summon: c, point });
        c.hitstop = c.attackDef.hitstop;
        break;
      }
    }
    for (const owner of fighters) {
      const t = owner.technique;
      if (!t) continue;
      // The ticks while it holds its target, one hit each: Launch Point
      // only, no launch. Never on the explosion's step (see
      // Technique.update).
      this.applyTicks(owner, t);
      // The delayed explosion, on the step its first frame shows: the target
      // is released first, then takes the big hit and its launch.
      if (t.explosionDue) {
        const target = t.takeExplosion();
        if (target) this.applyHit(owner, target, t.def.explosionHit, { facing: t.facing, technique: t });
        continue;
      }
      // The rushing sphere: only while dashing, and only until it connects.
      const hit = t.sphereHitbox(scratchHit);
      if (!hit) continue;
      for (const target of fighters) {
        if (target === owner) continue;
        const point = strikePoint(hit, target);
        if (!point) continue;
        // The contact, exactly once; the sphere stops searching after it. A
        // Shield blocks it and the technique ends there; otherwise the
        // target is bound and its first tick lands on this same step.
        const event = this.applyHit(owner, target, t.def.firstHit, { facing: t.facing, technique: t, point });
        const ended = t.contact(target, event.type === 'block');
        if (ended) owner.endTechnique(ended);
        else this.applyTicks(owner, t);
        break;
      }
    }
    return this.events;
  }

  // A multi-hit attack's strikes (see `hits` above) this step: each one
  // live in its own window, at most once, on the first opponent its box
  // meets. Any real hit confirms the attack (its hitCancel counts from the
  // first); a blocked strike ends the string, so no later one strikes.
  strike(attacker, atk, fighters) {
    atk.struck ??= new Set();
    for (const h of atk.def.hits) {
      if (atk.blocked) return;
      if (atk.struck.has(h.index) || !strikeLive(h, atk.time)) continue;
      const box = worldBox(attacker, h.hitbox, scratchHit);
      for (const target of fighters) {
        if (target === attacker) continue;
        const point = strikePoint(box, target);
        if (!point) continue;
        atk.struck.add(h.index);
        atk.hasHit = true;
        const event = this.applyHit(attacker, target, h, { point, velocity: bodyVelocity(attacker) });
        if (event.type === 'block') atk.blocked = true;
        else if (!atk.confirmed) {
          atk.confirmed = true;
          atk.confirmedAt = atk.time;
        }
        attacker.attackContact?.(atk, event);
        break;
      }
    }
  }

  // Every tick `t` has due this step, each one tickHit on its target.
  applyTicks(owner, t) {
    for (let target = t.takeTick(); target; target = t.takeTick()) {
      this.applyHit(owner, target, t.def.tickHit, { facing: t.facing, technique: t });
    }
  }

  // Shared by melee, projectiles, clones and techniques. `facing` is
  // the direction the hit travels: the attacker's facing for melee, the
  // projectile's own direction (fixed when thrown), the clone's facing
  // (fixed when summoned) or the technique's (fixed when it started). A
  // detached hit (a projectile's, a clone's or a technique's) freezes only
  // its target.
  //
  // A target whose Shield is up blocks the hit, whichever side it comes
  // from: no Launch Point, no launch and no hitstun, only the hit's hitstop
  // and its blockstun, held in the Shield. The Shield pays
  // energy.shieldHitCost for it, once, or all that is left when that is
  // less: a block that empties the bar exhausts the fighter and drops the
  // Shield straight away, so a later hit, even on this same step, lands in
  // full. The block itself stands.
  //
  // Otherwise the damage is added to the target's Launch Point first, so
  // the hit that raises it already launches from the new total. The launch
  // strength is exactly Base Launch x that Launch Point, sent along the
  // hit's Directional Launch at LAUNCH_UNIT_SPEED world units per second per
  // point (see js/data/launch.js). A hit that does not launch (Base Launch
  // 0 or no direction) leaves the target's velocity as it is. Returns the
  // event it recorded.
  //
  // A hit with `carry` (see above) that lands and launches nothing gives the
  // target `velocity`, what struck it (the attacker's body, a projectile),
  // less its `lift` upward: it is dragged along.
  applyHit(attacker, target, def, {
    facing = attacker.facing, projectile = null, summon = null, technique = null,
    detached = !!(projectile || summon || technique), point = bodyPoint(target), velocity = null,
  } = {}) {
    const tc = target.combat;
    const blocked = tc.shielding;
    // A perfect Shield (raised just in time, see Fighter.perfectShield)
    // blocks for free: no Energy and no blockstun, so its fighter can answer
    // at once.
    const perfect = blocked && !!target.perfectShield;
    let energyCost = 0;
    if (blocked && !perfect) {
      energyCost = Math.min(tc.energySpec.shieldHitCost, tc.energy);
      tc.spendEnergy(tc.energySpec.shieldHitCost);
      if (!tc.canShield()) tc.shielding = false;
    }
    const damage = blocked ? 0 : def.damage;
    const launchPointBefore = tc.launchPoint;
    tc.launchPoint = Math.max(0, launchPointBefore + damage);
    const launchPointAfter = tc.launchPoint;
    const launchStrength = blocked ? 0 : resolveLaunchStrength(def.baseLaunch, launchPointAfter);
    // The target may bend its launch a little with the direction it holds
    // as the hit lands (launch steering: never the strength, only the angle;
    // see steerLaunch), and a harder launch stuns it longer.
    // Standing on the ground, Down bends nothing: the floor is in the way.
    const reaction = target.launchReaction;
    const held = target.steerHeld && target.body.grounded && target.steerHeld.y > 0 ? { x: target.steerHeld.x, y: 0 } : target.steerHeld;
    const finalLaunch = steerLaunch(
      resolveDirectionalLaunch(def.directionalLaunch, launchStrength, facing), held, reaction?.steerAngle,
    );
    const launchSpeed = Math.hypot(finalLaunch.x, finalLaunch.y);
    const hitstun = def.hitstun > 0 ? def.hitstun + resolveLaunchStun(launchSpeed, reaction) : 0;
    // A hit with no stun or freeze of its own (a technique's tick)
    // leaves any already running as it is. A block's stun holds the Shield
    // only while it is still up.
    if (blocked) {
      if (tc.shielding && def.blockstun > 0 && !perfect) tc.shieldStun = def.blockstun;
    } else if (hitstun > 0) {
      tc.stun = hitstun;
    }
    if (def.hitstop > 0) tc.hitstop = def.hitstop;
    if (!detached) attacker.combat.hitstop = def.hitstop;
    // ...and a technique: no armour. It ends at once, releasing
    // whatever it held, before the launch below moves the fighter. So does
    // a summon's startup: the hurt pose shows on this very step, and no
    // clone comes of it.
    target.endTechnique?.('hit');
    target.cancelSummon?.();
    if (finalLaunch.x || finalLaunch.y) {
      // A launch replaces the target's sideways speed (a vertical one sends
      // it straight up or down) and, when it has one, its vertical speed.
      target.body.vx = finalLaunch.x;
      if (finalLaunch.y) {
        target.body.vy = finalLaunch.y;
        target.body.grounded = false;
      }
    } else if (!blocked && def.carry && velocity) {
      target.body.vx = velocity.x;
      target.body.vy = velocity.y - (def.carry.lift ?? 0);
      if (target.body.vy < 0) {
        target.body.grounded = false;
        target.body.ground = null;
      }
    }
    const event = {
      type: blocked ? 'block' : 'hit', attacker, target, move: def.id ?? null,
      damage, energyCost, launchPointBefore, launchPointAfter,
      baseLaunch: def.baseLaunch, directionalLaunch: def.directionalLaunch, launchStrength, finalLaunch,
      launchSpeed, hitstun: blocked ? 0 : hitstun, perfect, point,
      projectile, summon, technique,
    };
    // The target's own reaction to a real hit (its air jump back, see
    // Fighter.takeHit).
    if (!blocked) target.takeHit?.(event);
    this.events.push(event);
    return event;
  }
}
