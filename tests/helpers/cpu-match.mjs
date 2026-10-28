// Full CPU matches for tests and benchmarks (imported by *.test.mjs files and
// tests/benchmarks/; not a test file itself). A real Battle (js/game/battle.js)
// in Watch Mode on a real stage, both sides driven by any controllers (CPU
// Intelligence at any level, or a reference opponent), stepped at the fixed
// rate until the result, with the measurements the CPU benchmark reports:
// the winner and why, points, Launch Point dealt and taken, eliminations
// and accidental self-eliminations, hits, combos (hits that follow within
// a second), punishes (hits on an opponent in its recovery), Shields and
// Deflects that worked, recoveries, Energy exhaustion, and each CPU's own
// telemetry (move usage, invalid inputs, inactivity, stuck navigation,
// failed plans). Deterministic: the same arguments play the same match.

import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { mulberry32, deriveSeed } from '../../js/core/utils.js';
import { fakeSpritesOf, DT } from './fighter-harness.mjs';
import { ReferenceOpponent } from './reference-opponents.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

// A controller from a spec: a difficulty id ('easy' ... 'brutal') for CPU
// Intelligence, or 'ref:<style>' for a reference opponent.
export function controllerFor(spec, seed) {
  const rng = mulberry32(seed);
  if (spec.startsWith('ref:')) return new ReferenceOpponent({ style: spec.slice(4), rng });
  return new CombatAIController({ difficulty: spec, rng });
}

function sideStats() {
  return {
    points: 0, dealt: 0, taken: 0, hits: 0, blocked: 0, combos: 0, punishes: 0, kos: 0, selfKOs: 0, falls: 0,
    shieldBlocks: 0, deflects: 0, exhausted: 0, maxLP: 0,
  };
}

const ATTACK_KEYS = ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'];
// How soon a turn back the other way counts as a reversal (a twitch), seconds.
const REVERSAL_WINDOW = 0.35;

// What a side's inputs look like over the match, for telling a CPU that
// plays with a purpose from one that fidgets: while both fighters are in
// play in the fight, seconds free to act on the ground, seconds of those
// with nothing held at all and the fighter at rest (`still`), the longest
// such stretch, how much of it the controller meant (`intended`: its plan
// was a deliberate wait, see CpuIntelligence.waiting), direction reversals
// within REVERSAL_WINDOW while free to move, on the ground (a twitch back
// and forth) and in the air (drift corrections), attack presses, jumps,
// Dashes, seconds behind a raised Shield, and seconds in each strategic mode
// and match objective a CPU reports. Rates are per minute in play.
function behaviour() {
  return {
    inPlay: 0, free: 0, still: 0, longestStill: 0, intended: 0, reversals: 0, airReversals: 0, presses: 0, jumps: 0, dashes: 0,
    shield: 0, modes: {}, objectives: {}, run: 0, lastDir: 0, lastDirAt: -Infinity,
  };
}

function observe(rec, f, out, t, dt) {
  const ctrl = f.controller;
  const free = f.canAct() && f.body.grounded;
  rec.inPlay += dt;
  const dir = out.runLeft ? -1 : out.runRight ? 1 : 0;
  const pressed = ATTACK_KEYS.some((k) => out[`${k}Pressed`]) || (out.shieldPressed && !f.body.grounded);
  const held = dir || out.jump || out.shield || out.down || out.mouvementLeftPressed || out.mouvementRightPressed ||
    ATTACK_KEYS.some((k) => out[k]);
  if (pressed) rec.presses++;
  if (out.jumpPressed) rec.jumps++;
  if (out.mouvementLeftPressed || out.mouvementRightPressed) rec.dashes++;
  if (out.shield && f.body.grounded) rec.shield += dt;
  // Only directions held while free to move count (steering a launch in
  // hitstun, as a player may, is no fidget).
  if (dir && f.canAct()) {
    if (rec.lastDir && dir !== rec.lastDir && t - rec.lastDirAt < REVERSAL_WINDOW) {
      if (f.body.grounded) rec.reversals++;
      else rec.airReversals++;
    }
    rec.lastDir = dir;
    rec.lastDirAt = t;
  }
  if (free) {
    rec.free += dt;
    if (!held && Math.abs(f.body.vx) < 15) {
      rec.still += dt;
      rec.run += dt;
      rec.longestStill = Math.max(rec.longestStill, rec.run);
      if (ctrl?.waiting) rec.intended += dt;
    } else rec.run = 0;
  } else rec.run = 0;
  const mode = ctrl?.strategy?.mode;
  if (mode) rec.modes[mode] = (rec.modes[mode] ?? 0) + dt;
  const objective = ctrl?.objective?.kind;
  if (objective) rec.objectives[objective] = (rec.objectives[objective] ?? 0) + dt;
}

function summarize(rec) {
  const minutes = Math.max(1e-9, rec.inPlay / 60);
  const round = (v, k = 100) => Math.round(v * k) / k;
  const share = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v, 10)]));
  return {
    inPlaySeconds: round(rec.inPlay, 10), freeSeconds: round(rec.free, 10), stillSeconds: round(rec.still, 10), longestStill: round(rec.longestStill),
    intendedStill: round(rec.intended, 10), reversalsPerMin: round(rec.reversals / minutes, 10),
    airReversalsPerMin: round(rec.airReversals / minutes, 10),
    pressesPerMin: round(rec.presses / minutes, 10), jumpsPerMin: round(rec.jumps / minutes, 10),
    dashesPerMin: round(rec.dashes / minutes, 10), shieldSeconds: round(rec.shield, 10),
    modes: share(rec.modes), objectives: share(rec.objectives),
  };
}

// One match: `a` and `b` are controller specs for P1 (CPU 1) and P2 (CPU 2),
// `defA` / `defB` their fighters. Runs to the result (or `maxSeconds`).
export function runMatch({ a, b, defA, defB, map = 'desert', seed = 1, maxSeconds = 600, matchSeconds } = {}) {
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(map), mode: 'watch', seed, difficulty: 'medium',
    p1Def: defA, p2Def: defB, p1Sprites: fakeSpritesOf(defA), p2Sprites: fakeSpritesOf(defB),
    input: { flush() {}, sample: () => ({}) },
  });
  battle.p1.controller = controllerFor(a, deriveSeed(seed, 11));
  battle.p2.controller = controllerFor(b, deriveSeed(seed, 12));
  if (matchSeconds != null) {
    battle.roundSeconds = matchSeconds;
    battle.timeLeft = matchSeconds;
  }
  battle.setPhase('fight');
  const stats = { p1: sideStats(), p2: sideStats() };
  const lastHit = { p1: -Infinity, p2: -Infinity };
  const lastHitBy = { p1: -Infinity, p2: -Infinity };
  const lost = { p1: false, p2: false };
  const tired = { p1: false, p2: false };
  let t = 0;
  let steps = 0;
  // Behaviour (see behaviour): each side's inputs, read as its controller
  // returns them, while both are in play in the fight; and the longest lull
  // (neither side pressing an attack) and the longest stretch with no
  // contact (no hit and no block) over the match.
  const habits = { p1: behaviour(), p2: behaviour() };
  let lastPress = 0;
  let lastContact = 0;
  let longestLull = 0;
  let longestNoContact = 0;
  for (const f of battle.fighters) {
    const ctrl = f.controller;
    const inner = ctrl.getInput.bind(ctrl);
    ctrl.getInput = (self, dt, ctx) => {
      const out = inner(self, dt, ctx);
      if (battle.phase === 'fight' && !self.lostToVoid && self.opponent && !self.opponent.lostToVoid) {
        observe(habits[self.slot], self, out, t, dt);
        if (ATTACK_KEYS.some((k) => out[`${k}Pressed`])) lastPress = t;
      }
      return out;
    };
  }
  // Each side's match controller, kept: the celebration after the match
  // takes a CPU's place (see Battle.startCelebration).
  const controllers = { p1: battle.p1.controller, p2: battle.p2.controller };
  const limit = Math.round(maxSeconds / DT);
  while (!battle.matchOver && steps < limit) {
    const live = battle.phase === 'fight';
    battle.update(DT);
    steps++;
    t += DT;
    if (battle.combat.events.length) lastContact = t;
    if (live && battle.fighters.every((f) => !f.lostToVoid)) {
      longestLull = Math.max(longestLull, t - lastPress);
      longestNoContact = Math.max(longestNoContact, t - lastContact);
    } else {
      lastPress = t;
      lastContact = t;
    }
    for (const e of battle.combat.events) {
      const by = e.attacker.slot;
      const on = e.target.slot;
      if (e.type === 'hit') {
        stats[by].hits++;
        stats[by].dealt += e.damage;
        stats[on].taken += e.damage;
        if (t - lastHitBy[by] < 1) stats[by].combos++;
        lastHitBy[by] = t;
        lastHit[on] = t;
        const foeAttack = e.target.combat.attack;
        if (foeAttack && foeAttack.def && e.target.combat.phase === 'recovery') stats[by].punishes++;
      } else {
        stats[by].blocked++;
        stats[on].shieldBlocks++;
      }
    }
    for (const d of battle.combat.deflections) stats[d.fighter.slot].deflects++;
    for (const f of battle.fighters) {
      const side = f.slot;
      stats[side].maxLP = Math.max(stats[side].maxLP, f.combat.launchPoint);
      if (f.lostToVoid && !lost[side] && live) {
        stats[side].falls++;
        if (t - lastHit[side] > 3) stats[side].selfKOs++;
        else stats[f.opponent.slot].kos++;
      }
      lost[side] = f.lostToVoid;
      if (f.combat.energyExhausted && !tired[side]) stats[side].exhausted++;
      tired[side] = f.combat.energyExhausted;
    }
  }
  stats.p1.points = battle.score.p1;
  stats.p2.points = battle.score.p2;
  const done = battle.matchOver;
  const result = done ? battle.result : { outcome: battle.score.p1 > battle.score.p2 ? 'p1' : battle.score.p2 > battle.score.p1 ? 'p2' : 'draw', reason: 'cut' };
  const telemetry = (f) => (controllers[f.slot]?.telemetry ? controllers[f.slot].telemetry.report() : null);
  stats.p1.behaviour = summarize(habits.p1);
  stats.p2.behaviour = summarize(habits.p2);
  return {
    outcome: result.outcome, reason: result.reason, seconds: t, stats,
    longestLull: Math.round(longestLull * 100) / 100, longestNoContact: Math.round(longestNoContact * 100) / 100,
    telemetry: { p1: telemetry(battle.p1), p2: telemetry(battle.p2) },
  };
}
