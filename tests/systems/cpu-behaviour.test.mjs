// Run with node --test tests/systems/cpu-behaviour.test.mjs (no dependencies).
// CPU Intelligence's match-level behaviour, scenario by scenario, on real
// Battles (tests/helpers/cpu-scenario.mjs: the real clock, overtime and
// its closing Void, respawns, stage and platform hazards), every fighter
// through its own data:
//
//   A. a dangerous Launch Point: it breaks off to recover
//   B. an opponent that can be finished: it hunts the finish
//   C. protecting a lead late: it keeps out of needless risk
//   D. a comeback with seconds left: it forces the fight
//   E. recovering Launch Point: break off, recover unhit, come back
//   F. nothing to do: it may stand still, meaning it
//   G. the opponent respawning: it takes up a spot and waits for it
//   H. a fading platform: it steps off before the footing goes
//   I. a hazard's warning: its retreat never ends under one
//   J. a turtle: it stops feeding attacks into a raised Shield
//   K. overtime: it reads the Launch Point tiebreak and the closing Void
//   L. every fighter, through its capabilities
//   M. two cautious CPUs: they never wait on each other for ever
//   N. changing conditions: a break-off gives way to a finish, once
//
// and the intent-aware liveness monitor: a wait the plan means is waiting,
// stillness nothing means is an incident, and a wait is never endless.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scenario, DT } from '../helpers/cpu-scenario.mjs';
import { runMatch } from '../helpers/cpu-match.mjs';
import { playableCharacters } from '../../js/data/characters.js';
import { DIFFICULTY_IDS } from '../../js/data/difficulty.js';
import { makePlan } from '../../js/game/ai/cpu-intelligence/plans.js';
import { STILL_LIMIT, WAIT_LIMIT } from '../../js/game/ai/cpu-intelligence/telemetry.js';
import { OBJECTIVES } from '../../js/game/ai/cpu-intelligence/objective.js';

const F = playableCharacters();
// Each fighter against the next one round the roster: every fighter plays,
// and faces, a different kit.
const PAIRS = F.map((d, i) => [d, F[(i + 1) % F.length]]);
const seconds = (s) => Math.round(s / DT);
const ATTACKS = ['strike', 'dashStrike', 'jumpStrike'];

// Runs `sc` for `secs`, counting the steps under each objective, the fresh
// attack commitments on a free opponent (no follow-up, no answer to a
// threat), and the mean distance between the fighters.
function watch(sc, secs) {
  const objectives = {};
  let fresh = 0;
  let dist = 0;
  let steps = 0;
  let prev = null;
  sc.run(secs, () => {
    // Only while both are in play (a point scored is a new situation).
    if (sc.foe.lostToVoid || sc.cpu.lostToVoid) return;
    objectives[sc.ai.objective.kind] = (objectives[sc.ai.objective.kind] ?? 0) + 1;
    const p = sc.ai.plan;
    if (p && p !== prev && ATTACKS.includes(p.kind) && p.cand && !p.cand.open && !/^(combo|strikes first)/.test(p.reason ?? '')) fresh++;
    prev = p;
    dist += Math.abs(sc.cpu.body.x - sc.foe.body.x);
    steps++;
  });
  const total = Object.values(objectives).reduce((a, b) => a + b, 0);
  return { share: (k) => (objectives[k] ?? 0) / total, objectives, fresh, dist: dist / Math.max(1, steps) };
}

// ---- A. A dangerous Launch Point -------------------------------------------------------

test('A: with a dangerous Launch Point and time on the clock it breaks off to recover, rather than trading on', () => {
  for (const difficulty of ['medium', 'hard', 'brutal']) {
    for (const [cpuDef, foeDef] of PAIRS) {
      const danger = watch(scenario({ difficulty, cpuDef, foeDef, cpuLP: 120, timeLeft: 220, foe: 'ref:competent', seed: 3 }), 4);
      const calm = watch(scenario({ difficulty, cpuDef, foeDef, cpuLP: 0, timeLeft: 220, foe: 'ref:competent', seed: 3 }), 4);
      const msg = `${difficulty} #${cpuDef.id}: ${JSON.stringify(danger.objectives)} vs ${JSON.stringify(calm.objectives)}`;
      assert.ok(danger.share('stabilize') > 0.6, msg);
      assert.equal(calm.share('stabilize'), 0, msg);
    }
  }
});

// ---- B. An opponent that can be finished ---------------------------------------------

test('B: an opponent exposed by the ledge is finished: its commitments are launches that can end a life, and they do', () => {
  for (const difficulty of ['medium', 'hard', 'brutal']) {
    let launches = 0;
    let commits = 0;
    for (const [cpuDef, foeDef] of PAIRS) {
      let kos = 0;
      for (const seed of [3, 4, 5]) {
        // Yerma's right ledge is at 2480: the opponent by it, the CPU on the
        // centre side.
        const sc = scenario({ difficulty, cpuDef, foeDef, seed, cpuX: 2150, foeX: 2330, foeLP: 130, timeLeft: 200, foe: 'ref:competent' });
        let prev = null;
        sc.run(6, () => {
          const p = sc.ai.plan;
          if (p && p !== prev && p.cand) {
            commits++;
            if (p.cand.ko > 0.3) launches++;
          }
          prev = p;
          if (sc.foe.lostToVoid) {
            kos++;
            return false;
          }
          return true;
        });
      }
      assert.ok(kos >= 2, `${difficulty} #${cpuDef.id}: finished ${kos} of 3`);
    }
    // Most of them: since attacks steer (js/data/attack-mobility.js), the
    // competent opponent's own strikes carry it out of the corner more
    // often, so the fight runs on into neutral pokes after a launch misses
    // (seeds 3-10: 0.58-0.59 at every level, against 0.63-0.69 when attacks
    // could not be steered; with the opponent's strikes unsteered the CPU's
    // own share is back to 0.62-0.74). Its finishing is checked above.
    assert.ok(launches / commits > 0.5, `${difficulty}: ${launches} of ${commits} commitments were launches that can end a life`);
  }
});

// ---- C, D. The score and the clock ---------------------------------------------------

// Over every pairing and four seeds, while the CPU holds `objectives`: how
// often it goes in after a free opponent (a Dash-in or a jump-in from the
// ground: initiating, not countering, so neither a combo following up its
// own hit nor striking first against a threat, as in watch above) and how
// much of the time it moves toward it, per second; and the Launch Point it
// takes per second. (A higher level goes in from the ground only about once
// every two seconds, so fewer seeds leave too few to compare.)
function posture(base, score, timeLeft, objectives) {
  let t = 0;
  let initiate = 0;
  let toward = 0;
  let taken = 0;
  for (const [cpuDef, foeDef] of PAIRS) {
    for (const seed of [5, 6, 7, 8]) {
      const sc = scenario({ ...base, cpuDef, foeDef, seed, score, timeLeft });
      let prev = null;
      let lp = sc.cpu.combat.launchPoint;
      sc.run(6, () => {
        if (sc.foe.lostToVoid || sc.cpu.lostToVoid) return false;
        const inside = objectives.includes(sc.ai.objective.kind);
        const p = sc.ai.plan;
        if (inside) {
          t += DT;
          const fresh = p && p !== prev && p.cand && !p.cand.open && !/^(combo|strikes first)/.test(p.reason ?? '');
          if (fresh && (p.cand.kind === 'dashStrike' || (p.cand.kind === 'jumpStrike' && p.cand.jump && p.cand.jump !== 'air'))) initiate++;
          if (sc.cpu.body.grounded && sc.cpu.body.vx * Math.sign(sc.foe.body.x - sc.cpu.body.x) > 60) toward += DT;
          taken += Math.max(0, sc.cpu.combat.launchPoint - lp);
        }
        lp = sc.cpu.combat.launchPoint;
        prev = p;
        return true;
      });
    }
  }
  return { t, initiate: initiate / t, toward: toward / t, taken: taken / t };
}

test('C, D: ahead late it protects its lead (lets the opponent come, still counters, takes less); behind with seconds left it forces the fight', () => {
  for (const difficulty of ['medium', 'hard', 'brutal']) {
    for (const [cpuDef, foeDef] of PAIRS) {
      const base = { difficulty, cpuDef, foeDef, cpuLP: 30, foeLP: 30, foe: 'ref:competent', seed: 5, cpuX: 1700, foeX: 1950 };
      const ahead = watch(scenario({ ...base, score: [2, 1], timeLeft: 20 }), 3);
      const even = watch(scenario({ ...base, score: [1, 1], timeLeft: 200 }), 3);
      const behind = watch(scenario({ ...base, score: [0, 2], timeLeft: 12 }), 3);
      assert.ok(ahead.share('protect') + ahead.share('survive') > 0.8, `${difficulty} #${cpuDef.id} ahead: ${JSON.stringify(ahead.objectives)}`);
      assert.ok(behind.share('force') > 0.8, `${difficulty} #${cpuDef.id} behind: ${JSON.stringify(behind.objectives)}`);
      assert.equal(even.share('protect') + even.share('force'), 0, `${difficulty} #${cpuDef.id} even: ${JSON.stringify(even.objectives)}`);
    }
    const base = { difficulty, cpuLP: 30, foeLP: 30, foe: 'ref:competent', cpuX: 1700, foeX: 1950 };
    const ahead = posture(base, [2, 1], 25, ['protect', 'survive']);
    const even = posture(base, [1, 1], 200, ['build']);
    const behind = posture(base, [0, 2], 14, ['force']);
    const msg = `${difficulty}: ${JSON.stringify({ ahead, even, behind })}`;
    assert.ok(ahead.initiate < even.initiate * 0.85 && ahead.initiate < behind.initiate, msg);
    assert.ok(ahead.toward < even.toward && ahead.toward < behind.toward, msg);
    assert.ok(ahead.taken < even.taken, msg);
  }
});

test('C, D: Easy reads the match less fully: it misses some of what the score and clock ask of it', () => {
  let read = 0;
  let asked = 0;
  for (const [cpuDef, foeDef] of PAIRS) {
    const base = { difficulty: 'easy', cpuDef, foeDef, cpuLP: 30, foeLP: 30, foe: 'ref:competent', seed: 5, cpuX: 1700, foeX: 1950 };
    read += watch(scenario({ ...base, score: [2, 1], timeLeft: 20 }), 4).share('protect');
    read += watch(scenario({ ...base, score: [0, 2], timeLeft: 12 }), 4).share('force');
    asked += 2;
  }
  assert.ok(read / asked < 0.8, `Easy read the match ${(100 * read / asked).toFixed(0)}% of the time`);
  assert.ok(read / asked > 0.1, `but it does read it sometimes (${(100 * read / asked).toFixed(0)}%)`);
});

// ---- K. Overtime ----------------------------------------------------------------------

test('K: level in overtime it reads the Launch Point tiebreak: protects a lower Launch Point, forces the fight with a higher one', () => {
  for (const difficulty of ['hard', 'brutal']) {
    for (const [cpuDef, foeDef] of PAIRS) {
      const base = { difficulty, cpuDef, foeDef, score: [1, 1], overtime: true, timeLeft: 10, foe: 'ref:competent', seed: 7, cpuX: 1700, foeX: 1950 };
      // 10 s left: both recover 16 by the end; 0 against 60 stays a win.
      const winning = scenario({ ...base, cpuLP: 0, foeLP: 60 });
      winning.run(0.5);
      assert.equal(winning.ai.objective.tiebreak, 1, `${difficulty} #${cpuDef.id}: ahead on the tiebreak`);
      const w = watch(winning, 3);
      assert.ok(w.share('protect') + w.share('survive') + w.share('finish') > 0.8, `${difficulty} #${cpuDef.id} winning: ${JSON.stringify(w.objectives)}`);
      const losing = scenario({ ...base, cpuLP: 60, foeLP: 0 });
      losing.run(0.5);
      assert.equal(losing.ai.objective.tiebreak, -1, `${difficulty} #${cpuDef.id}: behind on the tiebreak`);
      const l = watch(losing, 3);
      assert.ok(l.share('force') > 0.8, `${difficulty} #${cpuDef.id} losing: ${JSON.stringify(l.objectives)}`);
      // Both recovering to 0 before the end is a draw: neither ahead.
      const level = scenario({ ...base, cpuLP: 6, foeLP: 10 });
      level.run(0.3);
      assert.equal(level.ai.objective.tiebreak, 0, `${difficulty} #${cpuDef.id}: both back to 0, a draw`);
    }
  }
});

test('K: in late overtime the closing Void makes the stage more dangerous to it, as its launch predictions see the live Void', () => {
  for (const [cpuDef, foeDef] of PAIRS) {
    // Over a band of spots up to the right ledge (2480) and of Launch
    // Points, struck from the centre side: how many it would likely not
    // survive (Alva's recoveries are strong: only near the ledge is a
    // launch lethal, and nearer the closing Void sooner).
    const lethal = (overtime) => {
      const sc = scenario({ difficulty: 'brutal', cpuDef, foeDef, overtime, timeLeft: overtime ? 4 : 200, cpuX: 1800, foeX: 1700 });
      // The spots are on the ground, where it starts: by 0.05 s in it may
      // already have jumped (a jump-in is its opening for some fighters).
      const floor = sc.cpu.body.y;
      sc.run(0.05);
      const s = sc.ai.situation;
      sc.ai.evaluator.begin(s);
      let n = 0;
      for (let x = 2200; x <= 2470; x += 15) {
        for (let extra = 5; extra <= 80; extra += 5) n += sc.ai.strategy.dangerAt(s, sc.ai.evaluator.judge, x, floor, extra) > 0.5 ? 1 : 0;
      }
      return n;
    };
    const regulation = lethal(false);
    const late = lethal(true);
    assert.ok(late > regulation, `#${cpuDef.id}: ${late} lethal spots late in overtime, ${regulation} in regulation`);
  }
});

// ---- E. Recovering Launch Point ------------------------------------------------------

// An opponent that walks up to 260 units and stands there: no pressure.
const stroller = (n, self) => {
  const o = self.opponent;
  if (!o || o.lostToVoid) return {};
  const dx = o.body.x - self.body.x;
  return Math.abs(dx) > 260 ? (dx > 0 ? { runRight: true } : { runLeft: true }) : {};
};

// One break-off at Launch Point 90 with lots of time: when the CPU took up
// the stabilize objective and when it left it (still alive, and with what
// Launch Point), and its telemetry.
function breakOff(difficulty, cpuDef, foeDef, foe) {
  const sc = scenario({ difficulty, cpuDef, foeDef, cpuLP: 90, timeLeft: 250, foe, seed: 4, cpuX: 1750, foeX: 2000 });
  const out = { entered: null, left: null, lpLeft: null, scored: false };
  sc.run(25, (i) => {
    if (sc.foe.lostToVoid) out.scored = true;
    if (sc.foe.lostToVoid || sc.cpu.lostToVoid || sc.battle.score.p1 > 0) return false;
    const stabilizing = sc.ai.objective.kind === 'stabilize';
    if (stabilizing && out.entered == null) out.entered = i * DT;
    if (!stabilizing && out.entered != null && out.left == null) {
      out.left = i * DT;
      out.lpLeft = sc.cpu.combat.launchPoint;
    }
    return true;
  });
  out.report = sc.ai.telemetry.report();
  return out;
}

test('E: in danger with room to spare it breaks off and recovers; pressed, it guards behind its Shield; left alone, it comes back once recovered', () => {
  for (const difficulty of ['medium', 'hard', 'brutal']) {
    let shielded = 0;
    let recovered = 0;
    let back = 0;
    for (const [cpuDef, foeDef] of PAIRS) {
      const pressed = breakOff(difficulty, cpuDef, foeDef, 'ref:competent');
      assert.ok(pressed.entered != null && pressed.entered < 2, `${difficulty} #${cpuDef.id}: broke off at ${pressed.entered} s`);
      if (pressed.report.shields > 0) shielded++;
      if (pressed.report.lpRecovered > 0) recovered++;
      const alone = breakOff(difficulty, cpuDef, foeDef, stroller);
      assert.ok(alone.entered != null && alone.entered < 2, `${difficulty} #${cpuDef.id} alone: broke off at ${alone.entered} s`);
      // Back on the attack: the objective left once recovered, or the
      // harmless opponent knocked out meanwhile.
      if ((alone.left != null && alone.lpLeft < 85) || alone.scored) back++;
    }
    assert.ok(shielded >= 3, `${difficulty}: Shielded while pressed in ${shielded} of ${PAIRS.length}`);
    assert.ok(recovered >= 2, `${difficulty}: recovered Launch Point keeping out of the fight in ${recovered} of ${PAIRS.length}`);
    assert.ok(back >= 3, `${difficulty}: left alone, came back to the fight recovered in ${back} of ${PAIRS.length}`);
  }
});

// ---- F. Nothing to do ------------------------------------------------------------------

test('F: safe, ahead and unthreatened, it may stand still: deliberately, with its reason, never as an incident', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    for (const [cpuDef, foeDef] of PAIRS) {
      // Two points up with 25 s left, the opponent far across the stage
      // doing nothing.
      const sc = scenario({ difficulty: difficulty === 'easy' ? 'medium' : difficulty, cpuDef, foeDef, score: [2, 0], timeLeft: 25, seed: 6, cpuX: 1500, foeX: 2350 });
      sc.run(6);
      const r = sc.ai.telemetry.report();
      assert.ok(r.waitSeconds > 2, `${difficulty} #${cpuDef.id}: waited ${r.waitSeconds} s of 6`);
      assert.equal(r.inactivity, 0, `${difficulty} #${cpuDef.id}: no inactivity`);
      const reasons = Object.keys(r.waitReasons);
      assert.ok(reasons.some((w) => /lead|clock|spacing/.test(w)), `${difficulty} #${cpuDef.id}: ${reasons}`);
    }
  }
});

// ---- G. The opponent respawning ------------------------------------------------------

test('G: while the opponent respawns it attacks nobody, takes up a spot and waits there (healing itself if it can)', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    for (const [cpuDef, foeDef] of PAIRS) {
      const sc = scenario({ difficulty, cpuDef, foeDef, seed: 8, cpuX: 1600, foeX: 2000, cpuLP: 40 });
      sc.run(0.3);
      sc.foe.lostToVoid = true;
      let pressed = 0;
      let heals = 0;
      sc.run(1.8, () => {
        const out = sc.ai.out;
        if (['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].some((a) => out[`${a}Pressed`]) && !sc.cpu.technique?.def.heal) pressed++;
        if (sc.cpu.technique?.def.heal) heals++;
      });
      assert.equal(pressed, 0, `${difficulty} #${cpuDef.id}: no attack at nobody`);
      const r = sc.ai.telemetry.report();
      assert.equal(r.inactivity, 0, `${difficulty} #${cpuDef.id}: no inactivity`);
      assert.ok(heals > 0 || (r.waitReasons['opponent respawning'] ?? 0) > 0 || sc.ai.plan?.kind === 'reposition', `${difficulty} #${cpuDef.id}: ${JSON.stringify(r.waitReasons)}`);
      // A fighter with a heal of its own uses the respite.
      if (analyzeHeal(sc.cpu)) assert.ok(heals > 0, `${difficulty} #${cpuDef.id} heals itself while the opponent is out`);
      sc.foe.lostToVoid = false;
    }
  }
});

function analyzeHeal(f) {
  return Object.values(f.techniqueDefs ?? {}).some((t) => t.heal > 0);
}

// ---- H. A fading platform --------------------------------------------------------------

test('H: on a cloud that visibly starts to fade it steps off before the footing goes, as often as it notices, never knowing more', () => {
  const off = {};
  for (const difficulty of ['easy', 'brutal']) {
    off[difficulty] = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const cpuDef = F[seed % F.length];
      const sc = scenario({ map: 'asperitas', difficulty, cpuDef, foeDef: F[0], seed, foeX: 2300 });
      const hazards = sc.battle.hazards;
      const c = hazards.controllers[0];
      // Hold the clouds still, the CPU standing in the middle of one, its
      // own initiative held (only the footing can move it).
      for (const h of hazards.controllers) h.begin('idle');
      c.duration = 99;
      const p = c.platform;
      Object.assign(sc.cpu.body, { x: p.x + p.w / 2, y: p.y, grounded: true, ground: p, vx: 0, vy: 0 });
      sc.ai.neutral = false;
      sc.run(0.5);
      assert.equal(sc.cpu.body.ground, p, 'standing on the cloud');
      c.begin('disappearing');
      let stepped = false;
      sc.run(1.2, () => {
        if (c.state === 'disappearing' && sc.cpu.body.ground !== p) stepped = true;
        return c.state === 'disappearing';
      });
      if (stepped) off[difficulty]++;
    }
  }
  assert.ok(off.brutal >= 4, `Brutal stepped off in time ${off.brutal} of 6`);
  assert.ok(off.easy < 6, `Easy not every time (${off.easy} of 6)`);
  assert.ok(off.brutal > off.easy, JSON.stringify(off));
});

// ---- I, N. Hazards and changing conditions ---------------------------------------------

test('I, N: a retreat whose spot comes under a hazard\'s warning is abandoned, and never toward one; a spot it picks is never under one', () => {
  for (const [cpuDef, foeDef] of PAIRS) {
    const sc = scenario({ difficulty: 'brutal', cpuDef, foeDef, cpuLP: 120, timeLeft: 250, seed: 9, cpuX: 1800, foeX: 1900, foe: 'ref:competent' });
    let abandoned = false;
    let warned = null;
    sc.run(6, () => {
      const p = sc.ai.plan;
      if (p?.kind === 'retreat' && warned == null) {
        // A warning shows over where it is going (as a falling rock's would).
        warned = p.targetX;
        sc.battle.stage.dangerZones.push({ id: 'test-warning', x: p.targetX, radius: 60, height: 40, timeLeft: 2 });
      }
      if (warned != null && sc.ai.lastInterrupt === 'retreat spot under a warning') abandoned = true;
      for (const z of sc.battle.stage.dangerZones) {
        if (p?.kind === 'retreat' && p !== null && Math.abs(p.targetX - z.x) < z.radius && sc.ai.lastInterrupt !== 'retreat spot under a warning' && p.start > sc.ai.clock - 0.05 && warned !== p.targetX) {
          assert.fail(`#${cpuDef.id}: a retreat toward a warning`);
        }
      }
    });
    if (warned != null) assert.ok(abandoned, `#${cpuDef.id}: retreat toward ${Math.round(warned)} abandoned under the warning`);
  }
});

test('N: breaking off to recover gives way to the finish when the opponent becomes exposed, without changing its mind back and forth', () => {
  for (const difficulty of ['hard', 'brutal']) {
    for (const [cpuDef, foeDef] of PAIRS) {
      const sc = scenario({ difficulty, cpuDef, foeDef, cpuLP: 110, timeLeft: 250, seed: 11, cpuX: 1700, foeX: 2000, foe: 'ref:competent' });
      sc.run(2.5);
      assert.equal(sc.ai.objective.kind, 'stabilize', `${difficulty} #${cpuDef.id}: recovering first`);
      // The opponent battered and by the ledge, the CPU's Launch Point back down.
      sc.cpu.combat.launchPoint = 20;
      sc.foe.combat.launchPoint = 160;
      sc.foe.body.x = 2400;
      const changes = sc.ai.telemetry.counters.objectiveChanges;
      let finishAt = null;
      sc.run(3, (i) => {
        if (sc.ai.objective.kind === 'finish' && finishAt == null) finishAt = i * DT;
        if (sc.foe.lostToVoid) return false;
        return true;
      });
      assert.ok(finishAt != null || sc.foe.lostToVoid, `${difficulty} #${cpuDef.id}: ${sc.ai.objective.kind}`);
      assert.ok(finishAt == null || finishAt < 2, `${difficulty} #${cpuDef.id}: took up the finish after ${finishAt} s`);
      assert.ok(sc.ai.telemetry.counters.objectiveChanges - changes <= 3, `${difficulty} #${cpuDef.id}: ${sc.ai.telemetry.counters.objectiveChanges - changes} changes of mind`);
    }
  }
});

// ---- J. A turtle -----------------------------------------------------------------------

test('J: against an opponent that sits behind its Shield it learns the habit and presses when the Shield drops, the more surely the higher the level', () => {
  const seen = {};
  for (const difficulty of ['easy', 'hard', 'brutal']) {
    const t = (seen[difficulty] = { up: 0, down: 0, hits: 0, turtling: 0 });
    for (const [cpuDef, foeDef] of PAIRS) {
      // The Shield down for a fifth of a second every two seconds. Every
      // attack is blockable; a Shield is beaten by waiting for it, or by
      // draining it, never by an unblockable.
      const turtle = (n) => ({ shield: n % 120 > 12 });
      const sc = scenario({ difficulty, cpuDef, foeDef, seed: 12, cpuX: 1700, foeX: 1900, foe: turtle });
      sc.run(14, () => {
        const out = sc.ai.out;
        if (['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].some((a) => out[`${a}Pressed`])) {
          if (sc.foe.combat.shielding) t.up++;
          else t.down++;
        }
        t.hits += sc.battle.combat.events.filter((e) => e.attacker === sc.cpu && e.type === 'hit').length;
      });
      t.turtling += sc.ai.opponent.turtling / PAIRS.length;
    }
  }
  const msg = JSON.stringify(seen);
  assert.ok(seen.brutal.down > seen.brutal.up, `Brutal presses mostly while the Shield is down: ${msg}`);
  for (const difficulty of ['hard', 'brutal']) assert.ok(seen[difficulty].hits > 10, `${difficulty} lands its hits in those moments: ${msg}`);
  const intoShield = (d) => seen[d].up / Math.max(1, seen[d].up + seen[d].down);
  assert.ok(intoShield('easy') > intoShield('hard') && intoShield('hard') > intoShield('brutal'), `the lower the level, the more it feeds the Shield: ${msg}`);
  assert.ok(seen.brutal.turtling > 0.6 && seen.easy.turtling < seen.brutal.turtling, `the habit learnt as fast as the level adapts: ${msg}`);
});

// ---- M. Two cautious CPUs --------------------------------------------------------------

test('M: two CPUs that both choose to wait never wait on each other for ever', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    for (const [cpuDef, foeDef] of PAIRS.slice(0, 2)) {
      // Both in danger, both breaking off to recover, all the time in the world.
      const sc = scenario({ difficulty, cpuDef, foeDef, cpuLP: 100, foeLP: 100, timeLeft: 250, seed: 13, cpuX: 1500, foeX: 2100, foe: difficulty });
      let lastPress = 0;
      let lull = 0;
      sc.run(40, (i) => {
        const t = i * DT;
        const pressed = (f) => ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].some((a) => f.controller.out?.[`${a}Pressed`]);
        if (pressed(sc.cpu) || pressed(sc.foe) || sc.cpu.lostToVoid || sc.foe.lostToVoid) lastPress = t;
        lull = Math.max(lull, t - lastPress);
      });
      assert.ok(lull < WAIT_LIMIT + 6, `${difficulty} #${cpuDef.id}: ${lull.toFixed(1)} s without an attack`);
    }
  }
});

test('M: impatient, or after waiting too long at its spacing, it steps into its own range rather than waiting at the edge of the opponent\'s', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    for (const [cpuDef, foeDef] of PAIRS) {
      const sc = scenario({ difficulty, cpuDef, foeDef, timeLeft: 250, seed: 18, cpuX: 1500, foeX: 2100 });
      sc.run(0.5);
      const ai = sc.ai;
      const s = ai.situation;
      const own = Math.max(28, ai.idealRange(s) - 6);
      // Patient, it keeps the spacing its mode wants (here beyond its own
      // reach: waiting for the opponent to come).
      ai.objective.impatience = 0;
      ai.restlessUntil = -Infinity;
      ai.pressure.resetUntil = -Infinity;
      const patient = ai.footwork(s).dist;
      const name = `${difficulty} #${cpuDef.id}`;
      assert.equal(patient, ai.spacing(s), name);
      assert.ok(patient > own, `${name}: its spacing (${patient}) beyond its own range (${own})`);
      // Nothing happening for longer than its patience: it goes in.
      ai.objective.impatience = 1;
      ai.plan = null;
      assert.equal(ai.footwork(s).dist, own, `${name}: impatient`);
      // A wait at its spacing that ran past WAIT_LIMIT (see liveness): the
      // same, for a moment.
      ai.objective.impatience = 0;
      ai.restlessUntil = ai.clock + 1.5;
      ai.plan = null;
      const restless = ai.footwork(s);
      assert.equal(restless.dist, own, `${name}: restless`);
      assert.match(restless.reason, /stepping in/, name);
    }
  }
});

// ---- Liveness --------------------------------------------------------------------------

test('liveness: a plan that should move but does not is an incident, by its cause, and a fresh plan follows', () => {
  for (const difficulty of DIFFICULTY_IDS) {
    const sc = scenario({ difficulty, seed: 14, cpuX: 1500, foeX: 2300 });
    sc.run(0.5);
    // A broken plan: committed, it holds no direction.
    sc.ai.plan = makePlan('move', { dir: 0, until: sc.ai.clock + 5, reason: 'test: broken' }, sc.ai);
    const before = sc.ai.telemetry.counters.inactivity;
    sc.run(STILL_LIMIT + 0.2);
    const r = sc.ai.telemetry.report();
    assert.equal(r.inactivity - before, 1, `${difficulty}: one incident`);
    assert.equal(r.inactivityCauses['move not moving'], 1, `${difficulty}: ${JSON.stringify(r.inactivityCauses)}`);
    assert.notEqual(sc.ai.plan?.reason, 'test: broken', `${difficulty}: replaced`);
  }
});

test('liveness: a walk the ledge guard keeps holding back is a navigation failure, not a wait', () => {
  const sc = scenario({ difficulty: 'hard', seed: 15, cpuX: 2440, foeX: 1500 });
  // Standing at rest near the right ledge (2480), its own initiative held.
  sc.ai.neutral = false;
  sc.run(0.3);
  assert.ok(sc.cpu.body.grounded && Math.abs(sc.cpu.body.vx) < 1, 'at rest on the stage');
  sc.ai.plan = makePlan('move', { dir: 1, until: sc.ai.clock + 5, reason: 'test: off the ledge' }, sc.ai);
  sc.run(STILL_LIMIT + 0.6);
  const r = sc.ai.telemetry.report();
  assert.ok(r.inactivityCauses['held back at a ledge'] >= 1, JSON.stringify(r.inactivityCauses));
  assert.ok(r.navigationFailures >= 1);
  assert.ok(sc.cpu.body.grounded, 'still on the stage');
});

test('liveness: a deliberate wait is waiting, not inactivity; it is reassessed, and never endless', () => {
  // Waits that could run on: the opponent out of play for good (every
  // level), and far ahead late with the opponent far off doing nothing (the
  // levels that read the score that way).
  const cases = [
    ...DIFFICULTY_IDS.map((difficulty) => ({ difficulty, gone: true })),
    ...['medium', 'hard', 'brutal'].map((difficulty) => ({ difficulty, score: [2, 0], timeLeft: 40 })),
  ];
  for (const { difficulty, gone, score, timeLeft } of cases) {
    const sc = scenario({ difficulty, seed: 16, score, timeLeft, cpuX: 1500, foeX: 2400 });
    if (gone) sc.foe.lostToVoid = true;
    let run = 0;
    let longest = 0;
    sc.run(24, () => {
      const still = sc.cpu.canAct() && sc.cpu.body.grounded && !sc.cpu.moveDir && Math.abs(sc.cpu.body.vx) < 15;
      run = still ? run + DT : 0;
      longest = Math.max(longest, run);
    });
    const r = sc.ai.telemetry.report();
    const name = `${difficulty}${gone ? ' (opponent gone)' : ' (ahead)'}`;
    assert.equal(r.inactivity, 0, `${name}: ${JSON.stringify(r.inactivityCauses)}`);
    assert.ok(r.waitSeconds > 4, `${name}: waited ${r.waitSeconds} s`);
    assert.ok(longest <= WAIT_LIMIT + 0.5 || sc.ai.objective.kind === 'survive', `${name}: still ${longest.toFixed(1)} s at most`);
    if (longest > WAIT_LIMIT - 1) assert.ok(r.longWaits >= 1, `${name}: a long wait was reassessed`);
  }
});

// ---- Telemetry -------------------------------------------------------------------------

test('telemetry explains the match objective, waits, retreats and their ends, cheaply', () => {
  const sc = scenario({ difficulty: 'hard', debug: true, cpuLP: 110, timeLeft: 250, seed: 17, foe: 'ref:competent', cpuX: 1700, foeX: 2000 });
  sc.run(8);
  const t = sc.ai.telemetry;
  assert.ok(t.trace.every((e) => typeof e.objective === 'string' && typeof e.intent === 'string' && typeof e.plan === 'string'));
  assert.ok(t.trace.some((e) => e.objective === 'stabilize' && /Launch Point/.test(e.objectiveWhy)), 'why it breaks off, in words');
  assert.ok(t.events.some((e) => /^objective \w+ → stabilize$/.test(e.event)), 'the objective change');
  assert.ok(t.trace.some((e) => e.intent === 'wait' && /recovers|lead|clock/.test(e.reason)), 'a wait and why');
  assert.match(t.explain(), /^\[\w+ · \w+\] \w+/);
  const r = t.report();
  for (const k of Object.keys(r.objectiveTime)) assert.ok(OBJECTIVES.includes(k), k);
  assert.ok(r.objectiveTime.stabilize > 2);
  assert.ok(r.lpRecovered > 0 && r.retreats + r.waits > 0, JSON.stringify(r));
  // Off, nothing is kept but the counters.
  const quiet = scenario({ difficulty: 'hard', cpuLP: 110, timeLeft: 250, seed: 17, foe: 'ref:competent', cpuX: 1700, foeX: 2000 });
  quiet.run(8);
  assert.equal(quiet.ai.telemetry.trace.length, 0);
  assert.equal(quiet.ai.telemetry.events.length, 0);
  assert.ok(quiet.ai.telemetry.counters.decisions > 10);
});
