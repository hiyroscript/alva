// CPU Intelligence, layer 2: perception and situational awareness.
//
// Purpose: what the CPU can know of its opponent, and when. Every fixed
// step it records what is visible of the opponent (position, motion,
// footing, its attack and that attack's phase, Shield, Dash, technique,
// stun, Energy, Launch Point, jumps left) into a short history. The CPU
// then sees its opponent as it was `latency` seconds ago (its level's
// reaction window, resampled now and then), carried forward by the motion
// it had then: so a new attack, a jump, a Dash or a turn is only seen once
// it has been on screen for that long, and is never answered on the step it
// starts, on any level. Projectiles and clones are perceived the same way
// (a shot is seen `latency` after it appears; a shot turned back keeps its
// old heading and owner in the CPU's eyes until the turn has been seen).
//
// Changes between two perceived pictures are events (an attack starting, a
// whiff, a jump, a landing, a Dash, the Shield going up or down, a
// technique, a projectile, exhaustion). Each one is recognized, or missed
// on a lapse (the level's `lapse`), and only a recognized one is answered
// or remembered by the opponent model.
//
// Inputs: the CPU's fighter, its opponent, ctx.battle (projectiles, clones),
// the CPU's clock and seeded RNG. Outputs: Perception.
// Important constraints: read-only. The CPU's own state is never delayed (a
// player knows what its own fighter is doing); only the opponent's is. The
// player's raw input is never read: an attack exists for the CPU once the
// fighter has started it.

import { range } from '../../../core/utils.js';
import { attackPhase } from '../../combat/attacks.js';

const HISTORY = 48;
const STEP = 1 / 60;

function blankSnap() {
  return {
    t: -Infinity, x: 0, y: 0, vx: 0, vy: 0, grounded: true, ground: null, halfW: 0, height: 0, gravityScale: 1, maxFall: 1500,
    facing: 1, state: 'idle', attack: null, attackDef: null, attackTime: 0, attackPhase: null, attackHit: false,
    attackConfirmed: false, attackMotion: null, stun: 0, hitstop: 0, paralysis: 0, charm: 0, fear: 0, fearedBy: null,
    shieldStun: 0, shielding: false,
    energy: 100, exhausted: false, lp: 0, dash: null, dashDir: 0, dashSpeed: 0, dashLeft: 0, dashAir: false,
    technique: null, techniqueDef: null, techniquePhase: null, techniqueReleaseIn: 0, techniqueEndIn: 0, techniqueFacing: 1,
    summon: null, summonLeft: 0, airJumps: 0, airDashes: 0, freeFall: false, launched: false, tumbling: false,
    canAct: true, lastGroundY: 0, lost: false,
  };
}

// Copies what is visible of fighter `f` into snapshot `s` at time `t`.
function snap(s, f, t) {
  const b = f.body;
  const c = f.combat;
  s.t = t;
  s.x = b.x;
  s.y = b.y;
  s.vx = b.vx;
  s.vy = b.vy;
  s.grounded = b.grounded;
  s.ground = b.ground;
  s.halfW = b.halfW;
  s.height = b.height;
  s.gravityScale = b.gravityScale;
  s.maxFall = b.maxFall;
  s.facing = f.facing;
  s.state = f.state;
  const a = c.attack;
  s.attack = a;
  s.attackDef = a?.def ?? null;
  s.attackTime = a?.time ?? 0;
  s.attackPhase = a ? attackPhase(a.def, a.time) : null;
  s.attackHit = !!a?.hasHit;
  s.attackConfirmed = !!a?.confirmed;
  s.attackMotion = a?.motion ? { ...a.motion, target: null } : null;
  s.stun = c.stun;
  s.hitstop = c.hitstop;
  s.paralysis = c.paralysis;
  s.charm = c.charm ?? 0;
  // A fear it shows (its mark), and whose it is.
  s.fear = c.fear ?? 0;
  s.fearedBy = s.fear > 0 ? c.frightenedBy ?? null : null;
  s.shieldStun = c.shieldStun;
  s.shielding = c.shielding;
  s.energy = c.energy;
  s.exhausted = c.energyExhausted;
  s.lp = c.launchPoint;
  const d = f.dash;
  s.dash = d;
  s.dashDir = d?.direction ?? 0;
  s.dashSpeed = d?.speed ?? 0;
  s.dashLeft = d ? d.duration - d.time : 0;
  s.dashAir = !!d?.air;
  const tq = f.technique;
  s.technique = tq;
  s.techniqueDef = tq?.def ?? null;
  s.techniquePhase = tq?.phase ?? null;
  s.techniqueReleaseIn = tq?.releaseIn ?? 0;
  s.techniqueEndIn = tq?.endIn ?? 0;
  s.techniqueFacing = tq?.facing ?? f.facing;
  s.summon = f.pendingSummon;
  s.summonLeft = f.pendingSummon ? f.pendingSummon.duration - f.pendingSummon.time : 0;
  s.airJumps = f.airJumps;
  s.airDashes = f.airDashes;
  s.freeFall = f.freeFall;
  s.launched = !!f.launch;
  s.tumbling = f.tumbling;
  s.canAct = f.canAct();
  s.lastGroundY = f.lastGroundY;
  s.lost = !!f.lostToVoid;
  return s;
}

export class Perception {
  constructor(rng, profile) {
    this.rng = rng;
    this.profile = profile;
    this.ring = Array.from({ length: HISTORY }, blankSnap);
    this.view = blankSnap();
    this.prevView = blankSnap();
    this.reset();
  }

  reset() {
    this.head = -1;
    this.count = 0;
    this.latency = range(this.rng, this.profile.react[0], this.profile.react[1]);
    this.resampleAt = 0;
    this.events = [];
    this.shots = new Map();
    this.clones = new Map();
    this.hasView = false;
    this.seenAttack = null;
    this.seenTechnique = null;
    this.seenSummon = null;
    this.lapsedAttack = null;
  }

  // Records this step's picture of `foe` (and the projectiles and clones in
  // play), then rebuilds the CPU's view of it `latency` ago and the events
  // between that view and the last one.
  observe(foe, world, clock, self) {
    if (clock >= this.resampleAt) {
      this.latency = range(this.rng, this.profile.react[0], this.profile.react[1]);
      this.resampleAt = clock + range(this.rng, 0.6, 1.2);
    }
    this.head = (this.head + 1) % HISTORY;
    snap(this.ring[this.head], foe, clock);
    this.count = Math.min(HISTORY, this.count + 1);
    this.trackShots(world, clock, self);
    const then = clock - this.latency;
    // The newest picture at least `latency` old, or the oldest kept.
    let pick = null;
    for (let i = 0; i < this.count; i++) {
      const s = this.ring[(this.head - i + HISTORY) % HISTORY];
      pick = s;
      if (s.t <= then + 1e-9) break;
    }
    const prev = this.prevView;
    Object.assign(prev, this.view);
    Object.assign(this.view, pick);
    this.view.age = clock - pick.t;
    const had = this.hasView;
    this.hasView = true;
    this.events.length = 0;
    if (had) this.diff(prev, this.view, clock);
    return this.view;
  }

  // Events between two perceived pictures (see the header).
  diff(a, b, clock) {
    const lapse = this.profile.lapse;
    const push = (kind, data = null) => {
      const recognized = this.rng() >= lapse;
      this.events.push({ kind, data, at: clock, recognized });
      return recognized;
    };
    if (b.attack && b.attack !== this.seenAttack) {
      this.seenAttack = b.attack;
      const ok = push('attack', b.attackDef);
      this.lapsedAttack = ok ? null : b.attack;
    }
    if (a.attack && a.attack === b.attack && a.attackPhase === 'active' && b.attackPhase === 'recovery' && !b.attackConfirmed) {
      push(b.attackHit ? 'blocked' : 'whiff', b.attackDef);
    }
    if (b.technique && b.technique !== this.seenTechnique) {
      this.seenTechnique = b.technique;
      push('technique', b.techniqueDef);
    }
    if (b.summon && b.summon !== this.seenSummon) {
      this.seenSummon = b.summon;
      push('summon', b.summon.id);
    }
    if (a.grounded && !b.grounded && b.vy < 0 && !(b.stun > 0)) push('jump');
    else if (!a.grounded && !b.grounded && b.vy < a.vy - 300 && b.airJumps < a.airJumps) push('airJump');
    if (!a.grounded && b.grounded) push('land');
    if (b.dashDir && (!a.dashDir || b.dashLeft > a.dashLeft + 1e-6)) push(b.dashAir ? 'airDash' : 'dash', b.dashDir);
    if (!a.shielding && b.shielding) push('shield');
    if (a.shielding && !b.shielding) push('shieldDown');
    if (!a.exhausted && b.exhausted) push('exhausted');
    if (!(a.stun > 0) && b.stun > 0) push('stunned');
  }

  // Whether the attack the CPU now sees was recognized (not lapsed).
  attackRecognized(attack) {
    return attack && attack !== this.lapsedAttack;
  }

  // Keeps track of every projectile and clone: when each was first seen,
  // and its heading and owner as the CPU perceives them.
  trackShots(world, clock, self) {
    const list = world?.projectiles ?? [];
    for (const p of list) {
      if (!p.alive) continue;
      let tr = this.shots.get(p);
      if (!tr) {
        tr = { p, born: clock, owner: p.owner, dir: p.direction, changedAt: -Infinity, prevOwner: p.owner, prevDir: p.direction, x0: p.x };
        this.shots.set(p, tr);
      } else if (p.owner !== tr.owner || p.direction !== tr.dir) {
        tr.prevOwner = tr.owner;
        tr.prevDir = tr.dir;
        tr.owner = p.owner;
        tr.dir = p.direction;
        tr.changedAt = clock;
        tr.x0 = p.x;
      }
    }
    for (const [p, tr] of this.shots) {
      if (!p.alive || !list.includes(p)) this.shots.delete(p);
      else tr.self = self;
    }
    for (const c of world?.clones ?? []) {
      if (!this.clones.has(c)) this.clones.set(c, { c, born: clock });
    }
    for (const c of this.clones.keys()) if (!c.alive) this.clones.delete(c);
  }

  // The projectiles the CPU can see now, as it sees them: { p, owner, dir,
  // x, y, vx, def, age, known } (projectiles younger than its latency are
  // not seen yet).
  perceivedShots(clock, out = []) {
    out.length = 0;
    for (const tr of this.shots.values()) {
      const p = tr.p;
      if (clock - tr.born < this.latency) continue;
      const stale = clock - tr.changedAt < this.latency;
      const dir = stale ? tr.prevDir : tr.dir;
      const owner = stale ? tr.prevOwner : tr.owner;
      const x = stale ? tr.x0 + dir * p.speed * (clock - tr.changedAt) : p.x;
      out.push({ p, owner, dir, x, y: p.y, vx: dir * p.speed, def: p.def, age: p.age, hits: p.hits, ready: p.ready });
    }
    return out;
  }

  // The clones the CPU can see now ({ c, ... } once seen `latency` ago).
  perceivedClones(clock, out = []) {
    out.length = 0;
    for (const tr of this.clones.values()) if (clock - tr.born >= this.latency) out.push(tr.c);
    return out;
  }

  // Steps of latency (whole fixed steps).
  get latencySteps() {
    return Math.max(1, Math.round(this.latency / STEP));
  }
}
