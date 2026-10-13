// Run with node --test tests/systems/cpu-intelligence.test.mjs (no dependencies).
// CPU Intelligence (js/game/ai/cpu-intelligence/), the one universal CPU
// behind every fighter at every level, measured through the real Fighter,
// CombatSystem, projectiles, pulls, clones and physics:
//
//   A. core behaviour: only player inputs, never idle while free, it closes
//      in, handles stage geometry, answers projectiles, uses the Deflect
//      both ways, meets airborne opponents, gets back from off the stage,
//      manages Energy, plays its Launch Point and the match situation, and
//      punishes what it sees
//   B. move coverage: every move of every playable fighter, at every level,
//      in real fights, and in a constructed opportunity where it is
//      recognized, pressed and does its job
//   C. combat correctness: no level touches a fighter's numbers or rules
//   D. difficulty progression over repeatable scenarios and seeds
//   F. determinism, and the debug trace
//
// The match benchmark (Brutal's 95% target) is tests/benchmarks/cpu-benchmark.mjs,
// run by hand; tests/systems/combat-ai.test.mjs covers the controller's
// contract (press edges, facing, reserved buttons, the ledge guard).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DT, cpuFight, fakeSpritesOf, stageMap } from '../helpers/fighter-harness.mjs';
import { runMatch } from '../helpers/cpu-match.mjs';
import { CONFIG } from '../../js/config.js';
import { Fighter, separateFighters } from '../../js/game/fighters/fighter.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { spawnProjectiles, removeDeadProjectiles, clashProjectiles } from '../../js/game/combat/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../../js/game/combat/summon.js';
import { applyPulls } from '../../js/game/combat/pull.js';
import { StageCollision, resolveSolidOverlap } from '../../js/game/physics.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { CpuIntelligence } from '../../js/game/ai/cpu-intelligence/brain.js';
import { analyzeCapabilities, MOVE_ROLES } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { StageModel } from '../../js/game/ai/cpu-intelligence/stage-model.js';
import { STILL_LIMIT } from '../../js/game/ai/cpu-intelligence/telemetry.js';
import { CAPABILITY, DIFFICULTY_IDS, getDifficultyProfile } from '../../js/data/difficulty.js';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { getMap } from '../../js/data/maps.js';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';
import { mulberry32 } from '../../js/core/utils.js';
import { COOLING_CASTER } from '../fighters/fixtures/cooling-fighters.mjs';

const FIGHTERS = playableCharacters();
const FLAT = new StageCollision(stageMap());
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const seconds = (s) => Math.round(s / DT);
const INPUT_KEYS = Object.keys(blankInput());

// Two fighters in a small ring (the Arena's step order without its
// rendering): `cpu` (slot p2) driven by CPU Intelligence at `difficulty`,
// `foe` (p1) by `script(n, foe)` (nothing pressed by default) or any
// controller. `hover` freezes the foe in the air where it stands.
function arena({
  cpuDef = FIGHTERS[0], foeDef = FIGHTERS[0], difficulty = 'brutal', seed = 1, stage = FLAT, cpuX = 1000, foeX = 1200,
  foeY, cpuY, script = () => ({}), controller = null, hover = false, debug = false,
} = {}) {
  const ai = new CombatAIController({ difficulty, rng: mulberry32(seed), debug });
  let n = 0;
  const foe = new Fighter({
    def: foeDef, sprites: fakeSpritesOf(foeDef), stage, slot: 'p1', label: 'P1', spawn: { x: foeX, y: foeY, facing: Math.sign(cpuX - foeX) || 1 },
    controller: controller ?? { getInput: (self) => ({ ...blankInput(), ...script(n, self) }) },
  });
  const cpu = new Fighter({
    def: cpuDef, sprites: fakeSpritesOf(cpuDef), stage, slot: 'p2', label: 'CPU', spawn: { x: cpuX, y: cpuY, facing: Math.sign(foeX - cpuX) || 1 }, controller: ai,
  });
  foe.opponent = cpu;
  cpu.opponent = foe;
  const world = { stage, projectiles: [], clones: [], combat: new CombatSystem(), score: { p1: 0, p2: 0 }, timeLeft: 99, fighters: [foe, cpu] };
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: world };
  const events = [];
  const deflections = [];
  if (hover) Object.assign(foe.body, { gravityScale: 0, grounded: false, ground: null });
  const step = () => {
    n++;
    if (hover) {
      foe.body.vx = 0;
      foe.body.vy = 0;
    }
    const fighters = world.fighters.filter((f) => !f.lostToVoid);
    for (const f of fighters) f.update(DT, ctx);
    if (fighters.length === 2) separateFighters(fighters[0], fighters[1], stage);
    for (const f of fighters) resolveSolidOverlap(f.body, stage);
    spawnProjectiles(fighters, world.projectiles);
    for (const p of world.projectiles) p.update(DT, stage);
    clashProjectiles(world.projectiles);
    updateClones(world.clones, DT);
    spawnClones(fighters, world.clones, stage);
    applyPulls(fighters, world.projectiles, DT);
    for (const e of world.combat.update(fighters, world.projectiles, world.clones)) events.push({ ...e, step: n });
    for (const d of world.combat.deflections) deflections.push({ ...d, step: n });
    removeDeadProjectiles(world.projectiles);
    removeDeadClones(world.clones);
  };
  const run = (k) => {
    for (let i = 0; i < k; i++) step();
  };
  return { ai, cpu, foe, world, ctx, events, deflections, step, run, get n() { return n; } };
}

// Fights between CPUs at one level, every pairing of the playable fighters
// both ways round, run once and shared by the tests below.
const FIGHT_SECONDS = 50;
const fights = new Map();
function fightsAt(difficulty) {
  if (!fights.has(difficulty)) {
    const list = [];
    for (const [x, y] of [[0, 1], [1, 0]]) {
      list.push(cpuFight(FIGHTERS[x], FIGHTERS[y % FIGHTERS.length], { seconds: FIGHT_SECONDS, seed: 3, difficulty }));
    }
    fights.set(difficulty, list);
  }
  return fights.get(difficulty);
}

// ---- A. Core behaviour --------------------------------------------------------------

test('every level, every fighter: a player\'s input snapshot, each press of a held button, never a press the fighter refuses', () => {
  const keys = Object.keys(blankInput()).sort();
  for (const difficulty of DIFFICULTY_IDS) {
    for (const { log } of fightsAt(difficulty)) {
      for (const [f, steps] of log) {
        for (const s of steps) {
          for (const k of keys) assert.equal(typeof s[k], 'boolean', `${difficulty} #${f.def.id}: ${k}`);
          for (const k of keys) {
            if (k.endsWith('Pressed') && s[k] && !k.startsWith('mouvement') && k !== 'dropPressed') {
              assert.ok(s[k.slice(0, -'Pressed'.length)], `${difficulty} #${f.def.id}: ${k} without its button held`);
            }
          }
          assert.equal(s.dropPressed, false, 'there is no platform drop');
          assert.ok(!(s.mouvementLeftPressed && s.mouvementRightPressed), 'one Dash direction at a time');
        }
        assert.equal(f.controller.telemetry.counters.invalidInputs, 0, `${difficulty} #${f.def.id}: every press started its move`);
      }
    }
  }
});

test('Rule A: free to act, it is never idle for longer than a deliberate pause, at any level', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    for (const { log } of fightsAt(difficulty)) {
      for (const [f, steps] of log) {
        let still = 0;
        let worst = 0;
        let free = 0;
        for (const s of steps) {
          const acting = INPUT_KEYS.some((k) => s[k]);
          if (s.free && !acting) still++;
          else still = 0;
          if (s.free) free++;
          worst = Math.max(worst, still);
        }
        assert.ok(free > seconds(5), `${difficulty} #${f.def.id}: it was free to act (${free} steps)`);
        assert.ok(worst * DT <= STILL_LIMIT + 0.2, `${difficulty} #${f.def.id}: still ${(worst * DT).toFixed(2)} s at most`);
        assert.ok(f.controller.telemetry.counters.inactivity <= 1, `${difficulty} #${f.def.id}: inactivity incidents ${f.controller.telemetry.counters.inactivity}`);
        assert.equal(f.controller.telemetry.counters.stuckNavigation, 0, `${difficulty} #${f.def.id}: never stuck`);
      }
    }
  }
});

test('every level closes in on a distant opponent with either fighter', () => {
  for (const cpuDef of FIGHTERS) {
    for (const difficulty of DIFFICULTY_IDS) {
      const r = arena({ cpuDef, difficulty, seed: 2, cpuX: 300, foeX: 1700 });
      let closest = Infinity;
      for (let i = 0; i < seconds(5); i++) {
        r.step();
        closest = Math.min(closest, Math.abs(r.cpu.body.x - r.foe.body.x));
      }
      assert.ok(closest < 260 || r.events.some((e) => e.attacker === r.cpu), `#${cpuDef.id} ${difficulty}: closed to ${closest.toFixed(0)}`);
    }
  }
});

test('on the City rooftop it climbs to an opponent standing on the tower deck', () => {
  const map = getMap('city');
  const stage = new StageCollision(map);
  const deck = map.platforms.find((p) => p.id === 'tower-deck');
  for (const difficulty of DIFFICULTY_IDS) {
    const r = arena({ difficulty, seed: 4, stage, cpuX: 1300, foeX: deck.x + deck.w / 2, foeY: deck.y });
    let reached = false;
    for (let i = 0; i < seconds(6) && !reached; i++) {
      r.step();
      // Up on the deck with it, or hitting it there.
      reached = (r.cpu.body.grounded && Math.abs(r.cpu.body.y - deck.y) < 2) || r.events.some((e) => e.attacker === r.cpu && e.target === r.foe);
    }
    assert.ok(reached, `${difficulty}: reached the deck`);
    assert.equal(r.ai.telemetry.counters.stuckNavigation, 0);
  }
});

test('a projectile wall: Hard and Brutal get out of the way of nearly every shot, Brutal\'s #0002 Deflects some back', () => {
  const shooter = getCharacter('0001');
  const result = {};
  for (const difficulty of DIFFICULTY_IDS) {
    let hits = 0;
    let deflected = 0;
    for (const cpuDef of FIGHTERS) {
      for (let seed = 0; seed < 4; seed++) {
        const r = arena({
          cpuDef, foeDef: shooter, difficulty, seed: 900 + seed, cpuX: 930, foeX: 700,
          script: (n) => (n % 70 === 5 ? P(n % 140 === 5 ? 'attack2' : 'attack3') : {}),
        });
        // Its own offense held: only its answers act.
        r.ai.neutral = false;
        for (let i = 0; i < 600; i++) {
          r.foe.body.x = 700;
          r.step();
        }
        hits += r.events.filter((e) => e.target === r.cpu && e.type === 'hit').length;
        deflected += r.deflections.filter((d) => d.fighter === r.cpu).length;
      }
    }
    result[difficulty] = { hits, deflected };
  }
  const { easy, medium, hard, brutal } = result;
  const msg = JSON.stringify(result);
  assert.ok(easy.hits > medium.hits && medium.hits > hard.hits, `fewer hits taken level by level: ${msg}`);
  assert.ok(brutal.hits <= medium.hits / 4 && hard.hits <= medium.hits / 2, msg);
  assert.ok(brutal.deflected >= 2, `Brutal turns shots back: ${msg}`);
});

test('the Deflect turns Hollow Purple back on its caster', () => {
  const D = getCharacter('0001');
  let deflected = 0;
  let struckCaster = 0;
  for (let seed = 0; seed < 6; seed++) {
    let cast = false;
    const r = arena({ cpuDef: D, foeDef: D, difficulty: 'brutal', seed: 600 + seed, cpuX: 1220, foeX: 800, script: (n) => (n === 5 ? P('attack5') : {}) });
    r.ai.neutral = false;
    for (let i = 0; i < 150; i++) {
      r.step();
      cast ||= !!r.foe.technique;
    }
    assert.ok(cast);
    deflected += r.deflections.filter((d) => d.fighter === r.cpu).length;
    if (r.events.some((e) => e.target === r.foe && e.move === 'attack5_object')) struckCaster++;
    assert.ok(!r.events.some((e) => e.target === r.cpu && e.move === 'attack5_object'), 'it never takes it');
  }
  assert.ok(deflected >= 4, `deflected ${deflected}/6`);
  assert.ok(struckCaster >= 2, `its own sphere struck the caster ${struckCaster}/6`);
});

test('the Deflect is an attack too: in fights it swats opponents, at every level', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    let swats = 0;
    let landed = 0;
    for (const { a, b, events } of fightsAt(difficulty)) {
      for (const f of [a, b]) swats += f.controller.telemetry.moveUsage.get('shield:air') ?? 0;
      landed += events.filter((e) => e.type === 'hit' && e.move === 'deflect').length;
    }
    assert.ok(swats >= 4, `${difficulty}: Deflects pressed (${swats})`);
    assert.ok(landed >= 1, `${difficulty}: Deflects that hit (${landed})`);
  }
});

test('an opponent in the air above it is met with an aerial or an anti-air, at every level, with either fighter', () => {
  for (const cpuDef of FIGHTERS) {
    for (const difficulty of DIFFICULTY_IDS) {
      let met = 0;
      for (let seed = 0; seed < 3; seed++) {
        // Hanging 150 above the floor, a little ahead.
        const r = arena({ cpuDef, difficulty, seed: 40 + seed, cpuX: 1000, foeX: 1080, foeY: 650, hover: true });
        for (let i = 0; i < seconds(3) && !met; i++) {
          r.step();
          if (r.events.some((e) => e.attacker === r.cpu && e.target === r.foe)) met++;
        }
      }
      assert.ok(met >= 1, `#${cpuDef.id} ${difficulty}: it reached the airborne opponent`);
    }
  }
});

test('off the stage it gets back, at every level, from below the ledge, far out and drifting away', () => {
  const ledge = 2000;
  const starts = [{ x: ledge + 120, y: 860, vx: 0 }, { x: ledge + 300, y: 760, vx: 0 }, { x: ledge + 80, y: 700, vx: 450 }];
  for (const cpuDef of FIGHTERS) {
    for (const difficulty of DIFFICULTY_IDS) {
      let back = 0;
      for (const [i, s] of starts.entries()) {
        const r = arena({ cpuDef, difficulty, seed: 70 + i, cpuX: 1000, foeX: 600 });
        Object.assign(r.cpu.body, { x: s.x, y: s.y, vx: s.vx, vy: 0, grounded: false, ground: null });
        for (let k = 0; k < seconds(4) && !r.cpu.body.grounded; k++) {
          r.step();
          if (r.cpu.body.y > 1500) break;
        }
        if (r.cpu.body.grounded && r.cpu.body.x <= ledge) back++;
      }
      const need = difficulty === 'easy' ? 2 : 3;
      assert.ok(back >= need, `#${cpuDef.id} ${difficulty}: back ${back}/${starts.length}`);
    }
  }
});

test('Energy: no level empties its bar often, and Brutal empties it no more than Easy', () => {
  const tired = {};
  for (const difficulty of DIFFICULTY_IDS) {
    let n = 0;
    for (const { log } of fightsAt(difficulty)) {
      for (const steps of log.values()) {
        let was = false;
        for (const s of steps) {
          if (s.exhausted && !was) n++;
          was = s.exhausted;
        }
      }
    }
    tired[difficulty] = n;
  }
  for (const difficulty of DIFFICULTY_IDS) assert.ok(tired[difficulty] <= 4, `${difficulty}: exhausted ${tired[difficulty]} times in ${FIGHT_SECONDS * 4} s`);
  assert.ok(tired.brutal <= tired.easy, JSON.stringify(tired));
});

test('its Launch Point shapes its strategy: in danger it turns to survival; with the opponent in danger it hunts the finish', () => {
  for (const difficulty of ['medium', 'hard', 'brutal']) {
    const share = (cpuLP, foeLP) => {
      const r = arena({ difficulty, seed: 9, cpuX: 1000, foeX: 1250 });
      r.cpu.combat.launchPoint = cpuLP;
      r.foe.combat.launchPoint = foeLP;
      const modes = {};
      for (let i = 0; i < seconds(4); i++) {
        r.step();
        // Keep the Launch Points where the scenario puts them.
        r.cpu.combat.launchPoint = Math.max(r.cpu.combat.launchPoint, cpuLP);
        r.foe.combat.launchPoint = Math.max(r.foe.combat.launchPoint, foeLP);
        modes[r.ai.strategy.mode] = (modes[r.ai.strategy.mode] ?? 0) + 1;
      }
      return modes;
    };
    const calm = share(0, 0);
    const danger = share(160, 0);
    const finish = share(0, 160);
    assert.ok((danger.survival ?? 0) > (calm.survival ?? 0) + seconds(1), `${difficulty}: survival ${JSON.stringify(danger)} vs ${JSON.stringify(calm)}`);
    // With a launch that ends the opponent's life in hand: finishing,
    // trapping it or rushing it down, never the patient neutral game.
    const hunting = (m) => (m.finisherHunt ?? 0) + (m.trapControl ?? 0) + (m.rushdown ?? 0);
    assert.ok(hunting(finish) > hunting(calm) + seconds(1) && (finish.finisherHunt ?? 0) > 0, `${difficulty}: ${JSON.stringify(finish)} vs ${JSON.stringify(calm)}`);
  }
});

test('the match situation shapes its strategy: behind late it presses, ahead late it protects its lead', () => {
  // Over several fights, so no one exchange (a blow blocked or landed)
  // decides it.
  const modes = (mine, theirs, timeLeft) => {
    const seen = {};
    for (const seed of [12, 13, 14, 15]) {
      const r = arena({ difficulty: 'brutal', seed, cpuX: 1000, foeX: 1300 });
      r.world.score = { p1: theirs, p2: mine };
      r.world.timeLeft = timeLeft;
      r.cpu.combat.launchPoint = 60;
      r.foe.combat.launchPoint = 60;
      for (let i = 0; i < seconds(4); i++) {
        r.step();
        r.world.timeLeft = timeLeft;
        seen[r.ai.strategy.mode] = (seen[r.ai.strategy.mode] ?? 0) + 1;
      }
    }
    return seen;
  };
  const pressing = (m) => (m.rushdown ?? 0) + (m.finisherHunt ?? 0);
  const patient = (m) => (m.neutral ?? 0) + (m.controlledOffense ?? 0) + (m.counterplay ?? 0) + (m.survival ?? 0) + (m.zoning ?? 0);
  const behind = modes(0, 2, 20);
  const ahead = modes(2, 0, 20);
  const msg = `behind ${JSON.stringify(behind)} / ahead ${JSON.stringify(ahead)}`;
  assert.ok(pressing(behind) > pressing(ahead), msg);
  assert.ok(patient(ahead) > patient(behind), msg);
});

test('in overtime it reads the closing Void: its stage model follows the live Void, never a copy', () => {
  const stage = new StageCollision(getMap('desert'));
  const model = StageModel.of(stage);
  const before = { ...stage.void };
  assert.deepEqual({ ...model.void }, before);
  stage.closeVoid(0.8, CONFIG.battle.overtimeVoid);
  assert.notDeepEqual({ ...stage.void }, before, 'overtime closed it');
  assert.deepEqual({ ...model.void }, { ...stage.void }, 'the CPU sees the Void in force');
  stage.closeVoid(0, CONFIG.battle.overtimeVoid);
});

test('it punishes a whiffed High Kick before the kicker recovers, and Brutal far more surely than Easy', () => {
  const kick = getCharacter('0001').attacks.extra_attack;
  const punished = {};
  for (const difficulty of DIFFICULTY_IDS) {
    let n = 0;
    let struck = 0;
    for (let seed = 0; seed < 8; seed++) {
      // Watching (its own offense held) as the opponent kicks at the air,
      // well out of reach; free to act once the kick is live.
      const r = arena({ difficulty, seed: 300 + seed, cpuX: 1000, foeX: 1340, script: (k) => (k === 40 ? P('extra_attack') : {}) });
      r.ai.neutral = false;
      r.run(39 + seconds(kick.startup));
      r.ai.neutral = true;
      for (let i = 0; i < seconds(kick.active + kick.recovery + 0.1); i++) {
        r.step();
        if (r.events.some((e) => e.attacker === r.cpu && e.target === r.foe && e.type === 'hit')) {
          n++;
          break;
        }
      }
      if (r.events.some((e) => e.attacker === r.foe)) struck++;
    }
    punished[difficulty] = n;
    if (difficulty === 'brutal' || difficulty === 'hard') assert.equal(struck, 0, `${difficulty} never runs into the kick`);
  }
  // Easy mostly sees the kick too late to time it; Medium sometimes.
  assert.ok(punished.brutal >= 6 && punished.hard >= 5, JSON.stringify(punished));
  assert.ok(punished.medium >= punished.easy && punished.brutal >= punished.easy + 4, JSON.stringify(punished));
});

// ---- B. Move coverage ---------------------------------------------------------------

test('the capability analyzer reads every fighter\'s whole kit from its data, a fighter it has never seen included', () => {
  for (const D of [...FIGHTERS, COOLING_CASTER]) {
    const f = new Fighter({ def: D, sprites: fakeSpritesOf(D), stage: FLAT, spawn: { x: 1000 } });
    const caps = analyzeCapabilities(f);
    // Every button the fighter has, on the ground and in the air.
    for (const [action, entry] of Object.entries(D.actions)) {
      if (!entry) continue;
      const ground = typeof entry === 'string' ? entry : entry.ground;
      const air = typeof entry === 'string' ? null : entry.air;
      if (ground) assert.ok(caps.moves.some((m) => m.action === action && !m.air), `#${D.id} ${action} on the ground`);
      if (air) assert.ok(caps.moves.some((m) => m.action === action && m.air), `#${D.id} ${action} in the air`);
    }
    assert.ok(caps.deflect && caps.moves.includes(caps.deflect), `#${D.id}: its Deflect is a move`);
    for (const m of caps.moves) {
      assert.ok(m.roles.size > 0, `#${D.id} ${m.key}: has a role`);
      for (const role of m.roles) assert.ok(MOVE_ROLES.includes(role), role);
      assert.ok(m.startup >= 0 && m.total > 0, `#${D.id} ${m.key}: its timing`);
    }
    for (const [role, list] of caps.roles) {
      assert.ok(MOVE_ROLES.includes(role));
      for (const m of list) assert.ok(caps.moves.includes(m) && m.roles.has(role));
    }
  }
});

test('every move of every fighter is used in real fights, at every level', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const usage = new Map();
    const kits = new Map();
    for (const { a, b } of fightsAt(difficulty)) {
      for (const f of [a, b]) {
        kits.set(f.def.id, analyzeCapabilities(f).moves.map((m) => m.key));
        const u = usage.get(f.def.id) ?? new Map();
        for (const [k, v] of f.controller.telemetry.moveUsage) u.set(k, (u.get(k) ?? 0) + v);
        usage.set(f.def.id, u);
      }
    }
    for (const [id, keys] of kits) {
      const u = usage.get(id);
      const missing = keys.filter((k) => !(u.get(k) > 0));
      assert.deepEqual(missing, [], `${difficulty} #${id} never used: ${missing.join(', ')}`);
    }
  }
});

// A placement where move `m` of `D` does its job against a standing (or
// hovering) opponent: found by trying distances and heights at Brutal,
// where the evaluator must list it as an attack that meets the target, and
// it must land, with some room to spare (the first such, or the roomiest).
function opportunityFor(D, m) {
  const reach = m.reach ? m.reach.x + m.reach.w * 0.5 : m.projectile ? 200 : 60;
  const dists = [...new Set([Math.round(reach), 30, 60, 100, 150, 220, 320].map((d) => Math.max(20, d)))];
  const lifts = m.air ? [0, 60, 120, 220] : [0, 120];
  let best = null;
  for (const lift of lifts) {
    for (const dx of dists) {
      const o = tryOpportunity(D, m, 'brutal', { dx, lift });
      if (!o.recognized || !o.landed) continue;
      if (o.margin >= 12) return { dx, lift };
      if (!best || o.margin > best.margin) best = { dx, lift, margin: o.margin };
    }
  }
  return best;
}

// One opportunity for move `m` at `difficulty`: the CPU's own offense held,
// it watches the opponent at `dx` (`lift` above the floor) long enough to
// see it, jumps if the move is an aerial, and at the first step its
// evaluator lists `m` as a strike that meets the target, presses it.
function tryOpportunity(D, move, difficulty, { dx, lift }, seed = 5) {
  const r = arena({ cpuDef: D, foeDef: D, difficulty, seed, cpuX: 1000, foeX: 1000 + dx, foeY: lift ? 800 - lift : undefined, hover: lift > 0 });
  // The same move in this CPU's own reading of its fighter.
  const m = analyzeCapabilities(r.cpu).moves.find((x) => x.key === move.key);
  r.ai.neutral = false;
  r.run(seconds(getDifficultyProfile(difficulty).react[1] + 0.15));
  if (m.air) r.ai.command({ jump: 'ground', dir: 0 });
  const out = { recognized: false, started: false, landed: false };
  const list = [];
  for (let i = 0; i < seconds(1.2) && !out.recognized; i++) {
    r.step();
    if (!r.ai.situation.present || (m.air && r.cpu.body.grounded && i > 2)) continue;
    // As the CPU will see it when it presses (next step): the picture
    // rebuilt from where its fighter is now.
    const sit = r.ai.situation.build(r.ai, r.cpu, r.foe, r.ctx, true);
    r.ai.evaluator.begin(sit);
    r.ai.evaluator.candidates(sit, list, {});
    const c = list.find((x) => x.move === m && x.kind === 'strike' && x.p > 0.05);
    if (!c) continue;
    out.recognized = true;
    out.margin = Math.min(c.margin, c.marginUp);
    r.ai.command({ press: m.action });
  }
  if (!out.recognized) return out;
  const startEvents = r.events.length;
  for (let i = 0; i < seconds(m.total + 2); i++) {
    r.step();
    const atk = r.cpu.combat.attack;
    if (atk && (atk.def.id === m.id || (m.kind === 'deflect' && atk.def === r.cpu.deflect))) out.started = true;
    if (r.cpu.technique?.def.id === m.id || r.cpu.pendingSummon) out.started = true;
    if (r.events.slice(startEvents).some((e) => e.attacker === r.cpu && e.target === r.foe)) {
      out.landed = true;
      break;
    }
  }
  return out;
}

test('every move of every fighter, in an opportunity made for it, is recognized, pressed and does its job, at every level', () => {
  for (const D of FIGHTERS) {
    const f = new Fighter({ def: D, sprites: fakeSpritesOf(D), stage: FLAT, spawn: { x: 1000 } });
    for (const m of analyzeCapabilities(f).moves) {
      const spot = opportunityFor(D, m);
      assert.ok(spot, `#${D.id} ${m.key}: an opportunity where it is the tool`);
      for (const difficulty of DIFFICULTY_IDS) {
        // A lower level misjudges ranges (its rangeError): it gets a few
        // more tries at the same opportunity.
        let ok = null;
        for (let seed = 5; seed < 13 && !ok; seed++) {
          const o = tryOpportunity(D, m, difficulty, spot, seed);
          if (o.recognized && o.started && o.landed) ok = o;
        }
        assert.ok(ok, `#${D.id} ${m.key} at ${difficulty} (dx ${spot.dx}, lift ${spot.lift})`);
      }
    }
  }
});

// ---- C. Combat correctness ----------------------------------------------------------

test('no level changes what a fighter is or can do: its moves, movement, Energy, Shield and Deflect are its own', () => {
  const snapshot = (f) => JSON.stringify({
    attacks: f.attacks, movement: f.movement, energy: f.energyDef, projectiles: f.projectileDefs, deflect: f.deflect,
    techniques: f.techniqueDefs, defense: f.defense, maxEnergy: f.combat.maxEnergy, airJumps: f.movement.airJumps,
  });
  const fresh = new Map(FIGHTERS.map((D) => [D.id, snapshot(new Fighter({ def: D, sprites: fakeSpritesOf(D), stage: FLAT, spawn: { x: 1000 } }))]));
  for (const difficulty of DIFFICULTY_IDS) {
    for (const { a, b } of fightsAt(difficulty)) {
      for (const f of [a, b]) assert.equal(snapshot(f), fresh.get(f.def.id), `${difficulty} #${f.def.id}`);
    }
    // A profile holds only how well the CPU thinks.
    assert.deepEqual(Object.keys(getDifficultyProfile(difficulty)).sort(), Object.keys(CAPABILITY).sort());
  }
});

test('hit-cancels and follow-ups: the stronger levels chain their attacks within the rules', () => {
  const chains = {};
  for (const difficulty of DIFFICULTY_IDS) {
    let n = 0;
    for (const { a, b } of fightsAt(difficulty)) n += a.controller.telemetry.counters.combos + b.controller.telemetry.counters.combos;
    chains[difficulty] = n;
  }
  assert.ok(chains.brutal > chains.easy, JSON.stringify(chains));
  assert.ok(chains.hard > chains.easy, JSON.stringify(chains));
});

test('Rule C: no fighter is named anywhere in the CPU', () => {
  const dir = new URL('../../js/game/ai/', import.meta.url);
  const ids = FIGHTERS.flatMap((D) => [D.id, D.displayName].filter(Boolean));
  for (const file of readdirSync(dir, { recursive: true }).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(new URL(file, dir), 'utf8').replace(/\/\/.*$/gm, '');
    for (const id of ids) assert.ok(!src.includes(`'${id}'`) && !src.includes(`"${id}"`), `${file} names ${id}`);
    // Nothing reads which fighter it is (a move's own id is fine).
    assert.ok(!/\b(self|foe|fighter|opponent|f|s\.self|s\.foe)\.def\.id\b/.test(src), `${file}: no branching on a fighter's id`);
    assert.ok(!/['"]\d{4}['"]/.test(src), `${file}: no fighter id`);
  }
});

// ---- D. Difficulty progression ------------------------------------------------------

test('level by level, against the same reference opponent: Easy, a casual player, clearly trails the others', () => {
  const stats = {};
  for (const difficulty of DIFFICULTY_IDS) {
    const s = { taken: 0, seconds: 0, hits: 0, presses: 0, wins: 0, games: 0 };
    for (const map of ['desert', 'city']) {
      for (const [x, y] of [[0, 1], [1, 0]]) {
        const m = runMatch({ a: difficulty, b: 'ref:balanced', defA: FIGHTERS[x], defB: FIGHTERS[y], map, seed: 1, maxSeconds: 150 });
        s.games++;
        if (m.outcome === 'p1') s.wins++;
        s.taken += m.stats.p1.taken;
        s.seconds += m.seconds;
        s.hits += m.stats.p1.hits;
        s.presses += Object.values(m.telemetry.p1.moveUsage).reduce((t, v) => t + v, 0);
      }
    }
    stats[difficulty] = s;
  }
  const msg = JSON.stringify(stats);
  const [easy, medium, hard, brutal] = DIFFICULTY_IDS.map((d) => stats[d]);
  // The reference opponent is no match for the upper levels (the head to
  // head test below orders those): Easy, a casual player, clearly trails
  // them, and Brutal's offense is cleaner than Easy's.
  assert.ok(easy.taken > medium.taken && easy.taken > Math.max(hard.taken, brutal.taken) * 1.4, `Launch Point taken: ${msg}`);
  assert.ok(easy.seconds > Math.max(hard.seconds, brutal.seconds), `time to win: ${msg}`);
  assert.ok(brutal.hits / brutal.presses > easy.hits / easy.presses, `hits per attack: ${msg}`);
  assert.equal(brutal.wins, brutal.games, msg);
});

test('level by level, head to head: the stronger level takes more points', () => {
  // Each pairing on one stage, both fighters each way round (the full
  // series is the benchmark's).
  for (const [hi, lo, map] of [['medium', 'easy', 'desert'], ['hard', 'medium', 'city'], ['brutal', 'hard', 'desert']]) {
    let mine = 0;
    let theirs = 0;
    for (const [x, y] of [[0, 1], [1, 0]]) {
      const m = runMatch({ a: hi, b: lo, defA: FIGHTERS[x], defB: FIGHTERS[y], map, seed: 2, maxSeconds: 240 });
      mine += m.stats.p1.points;
      theirs += m.stats.p2.points;
    }
    assert.ok(mine > theirs, `${hi} ${mine} : ${lo} ${theirs}`);
  }
});

// ---- F. Determinism and debugging ---------------------------------------------------

test('deterministic: the same seed plays the same match, decision for decision', () => {
  const spec = { a: 'brutal', b: 'hard', defA: FIGHTERS[0], defB: FIGHTERS[FIGHTERS.length - 1], map: 'city', seed: 21, maxSeconds: 25 };
  const one = runMatch(spec);
  const two = runMatch(spec);
  assert.deepEqual(two, one);
  const other = runMatch({ ...spec, seed: 22 });
  assert.notDeepEqual(other.telemetry, one.telemetry, 'another seed plays differently');
});

test('the debug trace explains each decision from its own data, and costs nothing when off', () => {
  const r = arena({ difficulty: 'hard', seed: 3, debug: true, cpuX: 900, foeX: 1150 });
  r.run(seconds(4));
  const trace = r.ai.telemetry.trace;
  assert.ok(trace.length > 10);
  for (const e of trace) {
    assert.ok(typeof e.mode === 'string' && typeof e.plan === 'string', 'mode and plan');
    assert.ok('danger' in e && 'finish' in e && 'myLP' in e && 'foeLP' in e && 'energy' in e && 'opponent' in e);
  }
  assert.ok(trace.some((e) => e.move && e.hitChance != null && e.reason.includes('lands in')), 'an attack with its hit chance and why');
  assert.match(r.ai.telemetry.explain(), /^\[\w+\] \w+/);
  const quiet = arena({ difficulty: 'hard', seed: 3, cpuX: 900, foeX: 1150 });
  quiet.run(seconds(4));
  assert.equal(quiet.ai.telemetry.trace.length, 0);
  assert.ok(quiet.ai.telemetry.counters.decisions > 10, 'the counters still run');
  assert.ok(new CpuIntelligence({ difficulty: 'easy' }) instanceof CpuIntelligence);
});
