// Run with node --test tests/systems/combo-queue.test.mjs (no dependencies).
// Combo Assist's queued follow-up: the human player's Attack 1 pressed again
// while Attack 1 still plays queues Attack 2 to follow it, and the reverse.
// The attack playing is never touched (no cut, restart, replay, second
// strike or projectile, its cooldown once); the follow-up starts on the step
// that attack plays out in full, through the ordinary request path (its own
// cooldown, art, airtime, Combat Assist); still in its own repeat delay, it
// waits that out and starts the first step it may; otherwise not at all.
// Covered here: every phase and the last step, the follow-up read from the
// attack really playing, one at most, held buttons, mashing against every
// kind of target, cooldowns (the wait, and three presses being three attacks
// on every fighter), every way the attack can end early and every newer
// request,
// the air (motions, landings, airtime), the four Combat Assist / Combo
// Assist combinations, the HUD's reading of it, CPUs and determinism.
// Shared rules: every playable fighter or a fixture, never one fighter's
// numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';
import { COMBO_PAIRS, followUpAction } from '../../js/game/combat/combo-assist.js';
import { attackPhase, attackReach, isMeleeAttack } from '../../js/game/combat/attacks.js';
import { assistsAttack, meleeGap } from '../../js/game/combat/combat-assist.js';
import { abilityGroups, abilityStatus } from '../../js/game/combat/move-status.js';
import { BASE_FIGHTER_MOVEMENT } from '../../js/data/movement.js';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { DT } from '../helpers/fighter-harness.mjs';
import { playerRig, press, attackOf } from '../helpers/player-rig.mjs';

const C1 = getCharacter('0001');
const EPS = 1e-6;
const PAIRS = Object.entries(COMBO_PAIRS);

// The player far from its opponent (nothing to approach or hit), Combat
// Assist off unless asked for; Combo Assist on unless asked for.
const far = (character, opts = {}) => playerRig({ character, gap: 900, combatAssist: false, ...opts });

// Fixed steps attack `atk` lasts, played out.
const stepsOf = (atk) => Math.round(atk.total / DT);

// The player high in the air (a long fall ahead), still.
function lift(r, y = 300) {
  Object.assign(r.player.body, { y, prevY: y, vy: 0, grounded: false, ground: null });
  r.player.coyote = 0;
}

// Steps while the attack in progress plays, feeding `input(i)` on its i-th
// later step (an object for every step). Returns how many steps it played
// from here, whether it played out in full (CombatState.finished) and what
// came next.
function playThrough(r, input = {}) {
  const rec = r.player.combat.attack;
  assert.ok(rec, 'an attack is playing');
  let steps = 0;
  let natural = false;
  while (r.player.combat.attack === rec) {
    steps++;
    r.tick(typeof input === 'function' ? input(steps) : input);
    if (r.player.combat.finished === rec) natural = true;
    if (steps > 900) throw new Error('never ended');
  }
  return { rec, steps, natural, next: r.player.combat.attack };
}

// Steps `n` times with nothing pressed, asserting no attack starts.
function quiet(r, n, why) {
  for (let i = 0; i < n; i++) {
    r.tick();
    assert.equal(r.player.combat.attack, null, `${why}: nothing comes out later`);
  }
}

// ---- Group A: the queued sequence --------------------------------------------------------------

test('Attack 1 pressed again while it plays: it plays out in full, then Attack 2 from its first frame on the step it ends; Attack 2 the reverse: every fighter', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      const why = `#${c.id} ${first}`;
      const r = far(c);
      r.tick(press(first));
      const rec = r.player.combat.attack;
      assert.equal(rec.def.id, r.player.attackFor(first), why);
      // Let go, then pressed again.
      const run = playThrough(r, (i) => (i === 2 ? press(first) : {}));
      assert.equal(run.steps, stepsOf(rec.def), `${why}: its whole length, never shortened`);
      assert.ok(run.natural, `${why}: played out`);
      const next = run.next;
      assert.equal(next?.def.id, r.player.attackFor(second), `${why}: then ${second}'s attack`);
      assert.equal(next.time, 0, `${why}: from its first frame`);
      assert.equal(next.startedAt, r.player.steps, `${why}: on the very step the first ended, no pause`);
      assert.equal(next.button, first, `${why}: the button pressed for it`);
      assert.equal(r.player.combat.cooldowns.get(rec.def.id), rec.def.cooldown, `${why}: the first attack's cooldown, in full`);
      assert.equal(r.player.combat.cooldowns.has(next.def.id), false, `${why}: the second's cooldown waits for its own end`);
      assert.equal(r.player.comboQueue, null, `${why}: used up`);
      const after = playThrough(r);
      assert.equal(after.steps, stepsOf(next.def), `${why}: the second plays its whole length too`);
      assert.ok(after.natural);
      quiet(r, 40, why);
    }
  }
});

test('a repeat in any phase (startup, strike, recovery, the step before the last) queues it; one on the last step is a press once it is over: the same follow-up, on the same step', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      const atk = far(c).player.attacks[far(c).player.attackFor(first)];
      const n = stepsOf(atk);
      const phases = new Set();
      for (let k = 1; k <= n; k++) {
        const why = `#${c.id} ${first} pressed again ${k} step(s) in`;
        const r = far(c);
        r.tick(press(first));
        const rec = r.player.combat.attack;
        const run = playThrough(r, (i) => {
          if (i !== k) return {};
          return press(first);
        });
        if (k < n) {
          phases.add(attackPhase(atk, k * DT));
        }
        assert.equal(run.steps, n, `${why}: played out in full`);
        assert.equal(run.next?.def.id, r.player.attackFor(second), why);
        assert.equal(run.next.startedAt, r.player.steps, `${why}: on the step ${rec.def.id} ended`);
      }
      for (const phase of ['startup', 'recovery', ...(atk.active > 0 ? ['active'] : [])]) {
        assert.ok(phases.has(phase), `#${c.id} ${first}: queued during its ${phase}`);
      }
    }
  }
});

test('the queue is the attack\'s own: the press is kept with the attack it repeats, never as a buffered press, and the ordinary 0.15 s buffer is unchanged', () => {
  assert.equal(BASE_FIGHTER_MOVEMENT.attackBuffer, 0.15);
  for (const c of playableCharacters()) {
    const r = far(c);
    r.tick(press('attack1'));
    const rec = r.player.combat.attack;
    r.tick();
    r.tick(press('attack1'));
    const q = r.player.comboQueue;
    assert.equal(q.source, rec, `#${c.id}: tied to the attack it repeats`);
    assert.equal(q.action, 'attack2');
    assert.equal(q.move, r.player.attackFor('attack2'));
    assert.equal(q.place, 'ground');
    assert.equal(r.player.bufferedAttack, null, `#${c.id}: never also in the buffer`);
    // It outlives the buffer's 0.15 s: it lasts as long as its attack.
    while (r.player.combat.attack === rec) {
      assert.equal(r.player.comboQueue, q, `#${c.id}: kept, unchanged`);
      assert.equal(r.player.bufferedAttack, null);
      r.tick();
    }
    assert.equal(attackOf(r.player), r.player.attackFor('attack2'));
  }
});

// ---- Group B: the attack playing is never touched ----------------------------------------------

test('mashed while it plays: the same record, its time and clip running on, no strike or projectile twice, its cooldown once; then the follow-up, played in full too', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      const why = `#${c.id} ${first}`;
      // Close enough to strike: the repeats meet a real hit and its freeze.
      const r = playerRig({ character: c, gap: 40, combatAssist: false });
      r.tick(press(first));
      const rec = r.player.combat.attack;
      const combat = r.player.combat;
      let ends = 0;
      const endAttack = combat.endAttack.bind(combat);
      combat.endAttack = () => {
        if (combat.attack === rec) ends++;
        endAttack();
      };
      const animator = r.player.animator;
      const restarts = [];
      const play = animator.play.bind(animator);
      animator.play = (key, opts = {}) => {
        if (opts.restart || key !== animator.stateKey) restarts.push(key);
        return play(key, opts);
      };
      const thrown = new Set();
      const clip = animator.stateKey;
      let lastTime = 0;
      let lastIndex = -1;
      while (r.player.combat.attack === rec) {
        assert.equal(combat.cooldowns.has(rec.def.id), false, `${why}: no cooldown while it plays`);
        r.tick(press(first));
        for (const p of r.projectiles) if (p.ability === rec.def.id) thrown.add(p);
        if (r.player.combat.attack !== rec) break;
        assert.ok(rec.time >= lastTime - EPS, `${why}: never restarted`);
        assert.equal(restarts.length, 0, `${why}: its clip never restarted (${restarts})`);
        assert.equal(animator.stateKey, clip, `${why}: its own clip throughout`);
        if (!animator.anim?.loop) assert.ok(animator.index >= lastIndex, `${why}: its frames run on, never back`);
        lastIndex = animator.index;
        lastTime = rec.time;
      }
      assert.ok(r.player.combat.finished === rec || rec.time >= rec.def.total - EPS, `${why}: played out`);
      assert.equal(ends, 1, `${why}: ended once`);
      assert.equal(combat.cooldowns.get(rec.def.id), rec.def.cooldown, `${why}: its cooldown once, in full`);
      const strikes = r.events.filter((e) => e.attacker === r.player && e.move === rec.def.id && e.type !== 'charmed');
      assert.ok(strikes.length <= (rec.def.hits?.length ?? 1), `${why}: ${strikes.length} strike(s), never repeated`);
      assert.ok(thrown.size <= 1, `${why}: one projectile at most`);
      assert.equal(attackOf(r.player), r.player.attackFor(second), `${why}: then ${second}`);
      assert.deepEqual(restarts, [r.player.combat.attack.def.animation].filter((k) => k !== rec.def.animation),
        `${why}: only the new attack's own clip starts`);
    }
  }
});

test('a queued follow-up lands exactly as the same attack pressed on that step would: the same hits, damage, Launch Point and Energy', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      const trace = (queued) => {
        const r = playerRig({ character: c, gap: 40, combatAssist: false, comboAssist: queued });
        r.tick(press(first));
        const rec = r.player.combat.attack;
        const out = [];
        let pressedSecond = false;
        for (let i = 0; i < 150; i++) {
          let now = {};
          if (queued && i === 1) now = press(first);
          // Without the queue: the second attack's own button, on the step the first ends.
          if (!queued && !pressedSecond && r.player.combat.attack === rec && rec.time + DT >= rec.def.total - EPS && r.player.combat.hitstop <= 0) {
            now = press(second);
            pressedSecond = true;
          }
          r.tick(now);
          out.push([attackOf(r.player), r.foe.combat.launchPoint, r.player.combat.energy, r.foe.body.x.toFixed(3), r.foe.body.y.toFixed(3)].join(' '));
        }
        return { out, events: r.events.map((e) => [e.type, e.move, e.damage].join(' ')) };
      };
      const a = trace(true);
      const b = trace(false);
      assert.deepEqual(a.events, b.events, `#${c.id} ${first} then ${second}: the same hits`);
      assert.deepEqual(a.out, b.out, `#${c.id} ${first} then ${second}: step for step`);
    }
  }
});

// ---- Group C: holding and mashing ------------------------------------------------------------

test('a button held through the attack is one press: nothing is queued, nothing follows; on every device the same (see request-devices)', () => {
  for (const c of playableCharacters()) {
    for (const [first] of PAIRS) {
      const r = far(c);
      r.tick(press(first));
      const held = { [first]: true };
      playThrough(r, () => {
        assert.equal(r.player.comboQueue, null, `#${c.id} ${first}: held, never queued`);
        return held;
      });
      for (let i = 0; i < 40; i++) {
        r.tick(held);
        assert.equal(r.player.combat.attack, null, `#${c.id} ${first}: held on, nothing comes out`);
      }
    }
  }
});

test('mashing during one attack queues exactly one follow-up; a new press during that one may queue the next; nothing stale ever comes out', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      const why = `#${c.id} ${first}`;
      const r = far(c);
      r.tick(press(first));
      r.tick(press(first));
      const q = r.player.comboQueue;
      assert.ok(q, `${why}: queued`);
      const run = playThrough(r, () => {
        if (r.player.combat.attack === q.source) assert.equal(r.player.comboQueue, q, `${why}: one, never replaced or added to`);
        return press(first);
      });
      assert.equal(run.next?.def.id, r.player.attackFor(second), `${why}: one follow-up`);
      // Its own attack queued nothing yet: the mash goes on in it, and its
      // queue is its own, the pair's other attack.
      const follow = run.next;
      r.tick(press(first));
      assert.equal(r.player.comboQueue?.source, follow, `${why}: a new press queues the next`);
      assert.equal(r.player.comboQueue.action, first, `${why}: the other of the pair again`);
      // Let go now: whatever follows comes from that one queue, at most: the
      // queued attack, once its own repeat delay allows (holdFollowUp).
      playThrough(r);
      const waited = r.until(() => r.player.combat.attack, {}, Math.round(0.5 / DT) + 2);
      const third = r.player.combat.attack;
      assert.equal(third.def.id, r.player.attackFor(first), `${why}: the queued one`);
      assert.ok(waited * DT <= 0.5 + EPS, `${why}: never longer than its repeat delay (${waited} steps)`);
      playThrough(r);
      quiet(r, 60, why);
    }
  }
});

test('mashing never beats the definitions: every attack plays out in full, none starts before its own end or its cooldown, no hit or projectile is doubled, Energy untouched; against every kind of target', () => {
  const targets = {
    standing: {},
    shielding: { shield: true },
    airborne: { setUp: (r) => Object.assign(r.foe.body, { y: r.foe.body.y - 60, prevY: r.foe.body.y - 60, grounded: false, ground: null }) },
    'high Launch Point': { setUp: (r) => { r.foe.combat.launchPoint = 150; } },
    'at a ledge': { x: 1900 },
  };
  for (const c of playableCharacters()) {
    for (const [name, { shield = false, setUp = () => {}, x = 800 }] of Object.entries(targets)) {
      const why = `#${c.id} vs a ${name} target`;
      const foeController = { kind: 'dummy', getInput: () => ({ ...blankInput(), shield }) };
      const r = playerRig({ character: c, gap: 40, x, combatAssist: false, foeController });
      setUp(r);
      const played = new Map(); // attack record -> { start, end }
      const thrown = new Set();
      for (let i = 0; i < 300; i++) {
        const before = r.player.combat.attack;
        r.tick(press('attack1'));
        const now = r.player.combat.attack;
        if (before && before !== now) {
          Object.assign(played.get(before), { end: r.player.steps, to: r.events.length });
          assert.equal(r.player.combat.finished, before, `${why}: ${before.def.id} played out, never cut by a repeat`);
        }
        if (now && now !== before) played.set(now, { start: r.player.steps, from: r.events.length });
        for (const p of r.projectiles) thrown.add(p);
        assert.equal(r.player.combat.energy, 100, `${why}: attacks never touch Energy`);
      }
      const runs = [...played].map(([rec, t]) => ({ rec, ...t }));
      const pair = [r.player.attackFor('attack1'), r.player.attackFor('attack2')];
      assert.ok(runs.length >= 2, `${why}: ${runs.map((x) => x.rec.def.id)}`);
      runs.forEach((x, i) => {
        assert.ok(pair.includes(x.rec.def.id), `${why}: only the pair (${x.rec.def.id})`);
        if (i > 0) assert.ok(x.start >= runs[i - 1].end, `${why}: never before the last one ended`);
        const last = runs.slice(0, i).findLast((y) => y.rec.def.id === x.rec.def.id);
        if (last) assert.ok(x.start - last.end >= Math.round(x.rec.def.cooldown / DT), `${why}: ${x.rec.def.id} again only once its cooldown is over`);
        const own = r.events.slice(x.from, x.to).filter((e) => e.attacker === r.player && e.move === x.rec.def.id);
        assert.ok(own.length <= (x.rec.def.hits?.length ?? 1), `${why}: ${x.rec.def.id} never strikes twice`);
      });
      const throws = runs.filter((x) => x.rec.def.projectile).length;
      assert.ok(thrown.size <= throws, `${why}: ${thrown.size} projectiles for ${throws} throws`);
      if (shield) {
        assert.ok(r.events.every((e) => e.target !== r.foe || e.type === 'block'), `${why}: the Shield blocks every one`);
        assert.equal(r.foe.combat.launchPoint, 0, `${why}: nothing gets through`);
      }
    }
  }
});

// ---- Group D: read from the attack really playing ---------------------------------------------

test('the follow-up is the pair\'s other attack of the attack really playing: Attack 1 repeated during the Attack 2 its own last press made queues Attack 1', () => {
  for (const c of playableCharacters()) {
    const a1 = far(c).player.attackFor('attack1');
    const a2 = far(c).player.attackFor('attack2');
    for (const pressed of ['attack1', 'attack2']) {
      const r = far(c);
      r.tick(press('attack1'));
      r.until(() => !r.player.combat.attack);
      r.tick(press('attack1'));
      const kicks = r.player.combat.attack;
      assert.equal(kicks.def.id, a2, `#${c.id}: Combo Assist's Attack 2`);
      assert.equal(kicks.button, 'attack1', 'asked for by Attack 1');
      r.tick();
      r.tick(press(pressed));
      assert.equal(r.player.combat.attack, kicks, `#${c.id}: ${pressed} never cuts it`);
      assert.equal(r.player.comboQueue?.action, 'attack1', `#${c.id}: ${pressed} during it queues Attack 1, never Attack 2 again`);
      assert.equal(r.player.comboQueue.move, a1);
      assert.equal(followUpAction(r.player, kicks), 'attack1');
    }
  }
});

test('Attack 2 pressed during an Attack 1 its own button made is a new request: it cuts as ever, nothing queued', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    r.tick(press('attack1'));
    const jab = r.player.combat.attack;
    r.tick(press('attack2'));
    assert.notEqual(r.player.combat.attack, jab, `#${c.id}: the player's own cancellation`);
    assert.equal(attackOf(r.player), r.player.attackFor('attack2'));
    assert.equal(r.player.comboQueue, null);
    assert.equal(r.player.combat.cooldowns.get(jab.def.id), jab.def.cooldown, 'the cut attack\'s cooldown, once');
  }
});

test('only Attack 1 and Attack 2 queue: the Extra Attack and Attack 3 repeated while they play queue nothing and are never followed; the Deflect neither', () => {
  for (const c of playableCharacters()) {
    for (const action of ['extra_attack', 'attack3']) {
      const r = far(c);
      if (!r.player.attackFor(action)) continue;
      r.tick(press(action));
      if (!r.player.combat.attack) continue;
      assert.equal(followUpAction(r.player, r.player.combat.attack), null, `#${c.id} ${action}`);
      playThrough(r, () => press(action));
      assert.equal(r.player.comboQueue, null);
      quiet(r, 30, `#${c.id} ${action}`);
    }
    const air = far(c);
    lift(air);
    air.tick(press('shield'));
    if (air.player.combat.attack?.def === air.player.deflect) {
      assert.equal(followUpAction(air.player, air.player.combat.attack), null, `#${c.id}: the Deflect`);
    }
  }
});

// ---- Group E: cooldowns ------------------------------------------------------------------------

test('one still in its repeat delay as its attack ends waits it out and starts the first step it may; every timer untouched, nothing else in its place', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      for (const wait of [2, Math.round(0.5 / DT)]) {
        const why = `#${c.id} ${first}, ${wait} steps of cooldown left`;
        const r = far(c);
        const secondId = r.player.attackFor(second);
        r.tick(press(first));
        const rec = r.player.combat.attack;
        r.tick(press(first));
        assert.ok(r.player.comboQueue, `${why}: queued`);
        // Still cooling `wait` steps after the first ends (it has n - 1 steps
        // left to play).
        r.player.combat.cooldowns.set(secondId, (stepsOf(rec.def) - 1 + wait) * DT);
        const run = playThrough(r);
        assert.ok(run.natural, why);
        assert.equal(run.next, null, `${why}: not yet`);
        assert.equal(r.player.comboQueue, null);
        assert.equal(r.player.bufferedAttack?.action, second, `${why}: held for it`);
        assert.equal(r.player.queuedFollowUp?.move, secondId, `${why}: still shown as queued`);
        assert.equal(r.player.combat.cooldowns.get(rec.def.id), rec.def.cooldown, `${why}: the first's own, once`);
        for (let i = 1; i < wait; i++) {
          r.tick();
          assert.equal(r.player.combat.attack, null, `${why}: never before its cooldown is over`);
        }
        r.tick();
        assert.equal(attackOf(r.player), secondId, `${why}: the step its cooldown ends`);
        assert.equal(r.player.combat.attack.button, first, `${why}: the button pressed for it`);
        assert.equal(r.player.queuedFollowUp, null);
        playThrough(r);
        quiet(r, 60, why);
      }
    }
  }
});

test('one whose cooldown outlasts the repeat delay (3 s, 5 s) is dropped as its attack ends: never retried, nothing in its place, every timer untouched', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      const why = `#${c.id} ${first}`;
      const r = far(c);
      const secondId = r.player.attackFor(second);
      r.tick(press(first));
      const rec = r.player.combat.attack;
      r.tick(press(first));
      r.player.combat.cooldowns.set(secondId, (stepsOf(rec.def) - 1) * DT + 0.6);
      const run = playThrough(r);
      assert.equal(run.next, null, `${why}: nothing starts`);
      assert.equal(r.player.comboQueue, null, `${why}: dropped`);
      assert.equal(r.player.bufferedAttack, null, `${why}: never held`);
      assert.ok(Math.abs(r.player.combat.cooldowns.get(secondId) - 0.6) < 1e-9, `${why}: its cooldown runs on as ever`);
      assert.equal(r.player.combat.cooldowns.get(rec.def.id), rec.def.cooldown, `${why}: the first's own, once`);
      quiet(r, 60, why);
    }
  }
});

test('three presses of Attack 1 are three attacks on every fighter, whatever its attack lengths: the third as soon as its repeat delay allows', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    const a1 = r.player.attackFor('attack1');
    const a2 = r.player.attackFor('attack2');
    r.tick(press('attack1'));
    r.tick();
    r.tick(press('attack1'));
    const second = r.player.combat.attack.def.id === a1 ? playThrough(r).next : r.player.combat.attack;
    assert.equal(second?.def.id, a2, `#${c.id}: Attack 2 second`);
    r.tick();
    r.tick(press('attack1'));
    playThrough(r);
    const waited = r.until(() => r.player.combat.attack, {}, 60);
    assert.equal(attackOf(r.player), a1, `#${c.id}: Attack 1 third`);
    // It waited exactly what was left of Attack 1's repeat delay.
    const expected = Math.max(0, Math.round((r.player.attacks[a1].cooldown - second.def.total) / DT));
    assert.ok(Math.abs(waited - expected) <= 1, `#${c.id}: waited ${waited} steps, its cooldown left ${expected}`);
  }
});

test('while one waits out its cooldown, any newer request replaces it, a hit drops it, and so does input locked', () => {
  const requests = {
    jump: press('jump'),
    Dash: { mouvementRightPressed: true },
    Shield: press('shield'),
    'another attack': press('extra_attack'),
  };
  for (const c of playableCharacters()) {
    const waiting = () => {
      const r = far(c);
      const a2 = r.player.attackFor('attack2');
      r.tick(press('attack1'));
      const rec = r.player.combat.attack;
      r.tick(press('attack1'));
      r.player.combat.cooldowns.set(a2, (stepsOf(rec.def) - 1 + 10) * DT);
      playThrough(r);
      assert.equal(r.player.queuedFollowUp?.move, a2, `#${c.id}: waiting`);
      return { r, a2 };
    };
    for (const [name, now] of Object.entries(requests)) {
      const { r, a2 } = waiting();
      r.tick(now);
      assert.equal(r.player.queuedFollowUp, null, `#${c.id} ${name}: replaced`);
      for (let i = 0; i < 40; i++) {
        r.tick(name === 'Shield' && i < 15 ? { shield: true } : {});
        assert.notEqual(attackOf(r.player), a2, `#${c.id} ${name}: never comes`);
      }
    }
    const hit = waiting();
    hit.r.player.takeHit({ launchSpeed: 0 });
    assert.equal(hit.r.player.queuedFollowUp, null, `#${c.id}: a hit drops it`);
    const locked = waiting();
    locked.r.player.inputLocked = true;
    locked.r.tick();
    assert.equal(locked.r.player.queuedFollowUp, null, `#${c.id}: input locked`);
    for (let i = 0; i < 30; i++) assert.equal(locked.r.tick().combat.attack, null);
  }
});

test('one whose cooldown ends on the very step its attack ends starts on that step: cooldowns recover first, as for any press', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    const a2 = r.player.attackFor('attack2');
    r.tick(press('attack1'));
    const rec = r.player.combat.attack;
    r.tick(press('attack1'));
    // Its last step of cooldown is the step the Jab plays its last (it has
    // n - 1 steps left).
    r.player.combat.cooldowns.set(a2, (stepsOf(rec.def) - 1) * DT);
    playThrough(r);
    assert.equal(attackOf(r.player), a2, `#${c.id}`);
  }
});

test('a longer cooldown stays whole: a 10-damage Attack 1 keeps its 5 s; the follow-up neither shortens nor waits on it, and nothing global is added', () => {
  const long = {
    ...C1, id: 'queue-long', displayName: 'queue-long', available: false, rosterSlot: null,
    attacks: { ...C1.attacks, attack1: { ...C1.attacks.attack1, damage: 10 } },
  };
  const r = far(long);
  r.tick(press('attack1'));
  r.tick(press('attack1'));
  const run = playThrough(r);
  assert.equal(run.next?.def.id, 'attack2', 'the follow-up on the step Attack 1 ends');
  assert.ok(Math.abs(r.player.combat.cooldowns.get('attack1') - 5) < 1e-9, 'Attack 1\'s 5 s, whole');
  const before = r.player.combat.cooldowns.get('attack1');
  playThrough(r);
  const after = r.player.combat.cooldowns.get('attack1');
  assert.ok(Math.abs(before - after - stepsOf(r.player.attacks.attack2) * DT) < 1e-9, 'it ran on through Attack 2, nothing more, nothing less');
  assert.ok(r.player.combat.cooldowns.has('attack2'), 'Attack 2\'s own from its own end');
  // Its own button pressed during Attack 2 queues Attack 1, which is
  // still cooling as Attack 2 ends: nothing.
  const fresh = far(long);
  fresh.tick(press('attack1'));
  fresh.tick(press('attack1'));
  playThrough(fresh);
  fresh.tick(press('attack1'));
  assert.equal(fresh.player.comboQueue?.action, 'attack1');
  assert.equal(playThrough(fresh).next, null, 'Attack 1 still on its 5 s');
});

test('a repeat during an impact freeze queues it; nothing starts inside the freeze, every cooldown recovers through it, and the follow-up comes as the attack plays out', () => {
  let frozen = 0;
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      const r = playerRig({ character: c, gap: 40, combatAssist: false });
      const atk = r.player.attacks[r.player.attackFor(first)];
      if (!atk.hitbox || atk.projectile) continue;
      r.tick(press(first));
      const rec = r.player.combat.attack;
      try {
        r.until(() => r.player.combat.hitstop > 0 || r.player.combat.attack !== rec, {}, 120);
      } catch { continue; }
      if (r.player.combat.attack !== rec || r.player.combat.hitstop <= 0) continue;
      const why = `#${c.id} ${first}`;
      const secondId = r.player.attackFor(second);
      r.player.combat.cooldowns.set(secondId, 0.2);
      const time = rec.time;
      r.tick(press(first));
      assert.equal(r.player.comboQueue?.source, rec, `${why}: queued inside the freeze`);
      assert.equal(rec.time, time, `${why}: frozen`);
      assert.ok(r.player.combat.cooldowns.get(secondId) < 0.2, `${why}: cooldowns recover through it`);
      while (r.player.combat.hitstop > 0) {
        r.tick();
        assert.equal(r.player.combat.attack, rec, `${why}: nothing starts inside the freeze`);
      }
      const run = playThrough(r);
      if (!run.natural) continue;
      frozen++;
      assert.equal(run.next?.def.id, secondId, `${why}: then ${second}`);
    }
  }
  assert.ok(frozen >= 5, `queued through a freeze: ${frozen}`);
});

// ---- Group F: ended early, or replaced by a newer request ---------------------------------------

test('a real hit on the player drops it: the attack is interrupted and nothing follows the stun', () => {
  for (const c of playableCharacters()) {
    const r = playerRig({ character: c, gap: -40, foeFacing: 1, combatAssist: false });
    r.player.facing = 1;
    r.tick(press('attack1'));
    r.tick(press('attack1'));
    assert.ok(r.player.comboQueue, `#${c.id}: queued`);
    const foeAtk = Object.values(r.foe.attacks).find((a) => a.hitbox && !a.pending);
    r.system.applyHit(r.foe, r.player, foeAtk, { facing: 1 });
    assert.equal(r.player.comboQueue, null, `#${c.id}: gone with the hit`);
    r.until(() => r.player.combat.stun <= 0 && r.player.combat.hitstop <= 0 && !r.player.combat.immobilized);
    quiet(r, 60, `#${c.id}`);
  }
});

test('a paralysis or a stun interrupts the attack: its queue goes with it', () => {
  for (const c of playableCharacters()) {
    for (const hold of ['paralysis', 'stun']) {
      const r = far(c);
      r.tick(press('attack1'));
      r.tick(press('attack1'));
      r.player.combat[hold] = 0.3;
      r.tick();
      assert.equal(r.player.combat.attack, null, `#${c.id} ${hold}`);
      assert.equal(r.player.comboQueue, null, `#${c.id} ${hold}: dropped`);
      r.until(() => !r.player.combat[hold]);
      quiet(r, 40, `#${c.id} ${hold}`);
    }
  }
});

test('a newer request wins: another attack, a technique or summon, a jump, a Dash, the Shield or the Deflect replaces the queued follow-up, which never comes', () => {
  const requests = {
    'another attack': (f) => (f.attackFor('attack3', f.grounded) ? press('attack3') : press('extra_attack')),
    jump: () => press('jump'),
    Dash: () => ({ mouvementRightPressed: true }),
    Shield: () => press('shield'),
  };
  for (const c of playableCharacters()) {
    for (const [name, request] of Object.entries(requests)) {
      const why = `#${c.id} ${name}`;
      const r = far(c);
      const a2 = r.player.attackFor('attack2');
      r.tick(press('attack1'));
      const rec = r.player.combat.attack;
      r.tick(press('attack1'));
      assert.ok(r.player.comboQueue, why);
      const now = request(r.player);
      r.tick(now);
      assert.equal(r.player.comboQueue, null, `${why}: replaced`);
      assert.notEqual(r.player.combat.attack, rec, `${why}: it took over (the player's own cancellation)`);
      const held = name === 'Shield' ? { shield: true } : {};
      for (let i = 0; i < 60; i++) {
        r.tick(i < 20 ? held : {});
        assert.notEqual(attackOf(r.player), a2, `${why}: Attack 2 never comes`);
      }
    }
    // The Deflect, in the air.
    const air = far(c);
    lift(air);
    air.tick(press('attack1'));
    air.tick(press('attack1'));
    if (!air.player.comboQueue || !air.player.deflect) continue;
    air.tick(press('shield'));
    assert.equal(air.player.combat.attack?.def, air.player.deflect, `#${c.id}: the Deflect takes over`);
    assert.equal(air.player.comboQueue, null, `#${c.id}: the Deflect replaces it`);
  }
  // A technique (#0001's Unlimited Void): the queued Attack 2 never follows it.
  const r = far(C1);
  r.tick(press('attack1'));
  r.tick(press('attack1'));
  r.tick(press('attack4'));
  assert.equal(r.player.technique?.def.id, 'attack4');
  assert.equal(r.player.comboQueue, null);
  r.until(() => !r.player.technique);
  quiet(r, 40, 'after the technique');
});

test('a newer request that cannot start still replaces it: the player asked for something else', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    const other = ['attack3', 'extra_attack'].find((a) => r.player.attackFor(a));
    r.player.combat.cooldowns.set(r.player.attackFor(other), 5);
    r.tick(press('attack1'));
    const rec = r.player.combat.attack;
    r.tick(press('attack1'));
    r.tick(press(other));
    assert.equal(r.player.combat.attack, rec, `#${c.id}: ${other} cooling cuts nothing`);
    assert.equal(r.player.comboQueue, null, `#${c.id}: but the queue is gone`);
    playThrough(r);
    quiet(r, 40, `#${c.id}`);
  }
});

test('a repeat made together with any other request queues nothing: one move per step, the other request decides', () => {
  for (const c of playableCharacters()) {
    for (const extra of [press('attack2'), press('jump'), { mouvementRightPressed: true }]) {
      const r = far(c);
      r.tick(press('attack1'));
      r.tick({ ...press('attack1'), ...extra });
      assert.equal(r.player.comboQueue, null, `#${c.id} ${JSON.stringify(extra)}`);
    }
  }
});

test('on the step the attack ends, a fresh request takes the step and the follow-up never starts too: never two moves on one step', () => {
  for (const c of playableCharacters()) {
    for (const [name, now] of [['jump', press('jump')], ['another attack', press('attack3')], ['Dash', { mouvementRightPressed: true }]]) {
      const r = far(c);
      if (name === 'another attack' && !r.player.attackFor('attack3')) continue;
      r.tick(press('attack1'));
      const rec = r.player.combat.attack;
      r.tick(press('attack1'));
      while (rec.time + DT < rec.def.total - EPS) r.tick();
      const startsBefore = r.player.steps;
      r.tick(now);
      assert.equal(r.player.combat.finished, rec, `#${c.id}: it played out on this step`);
      assert.notEqual(attackOf(r.player), r.player.attackFor('attack2'), `#${c.id} ${name}: the follow-up gave way`);
      if (name === 'jump') assert.ok(r.player.body.vy < 0, `#${c.id}: it jumped`);
      if (name === 'Dash') assert.ok(r.player.dash, `#${c.id}: it dashed`);
      if (name === 'another attack') assert.equal(attackOf(r.player), r.player.attackFor('attack3'));
      assert.ok(r.player.steps === startsBefore + 1);
    }
  }
});

test('the Shield pressed as the attack ends takes the step: the Shield goes up, the follow-up is dropped', () => {
  let shielded = 0;
  for (const c of playableCharacters()) {
    const r = far(c);
    if (!r.player.shieldAllowed()) continue;
    r.tick(press('attack1'));
    const rec = r.player.combat.attack;
    r.tick(press('attack1'));
    while (rec.time + DT < rec.def.total - EPS) r.tick();
    r.tick(press('shield'));
    assert.equal(r.player.combat.finished, rec, `#${c.id}: it played out on this step`);
    assert.equal(r.player.combat.attack, null, `#${c.id}: no follow-up`);
    assert.equal(r.player.combat.shielding, true, `#${c.id}: the Shield went up`);
    assert.equal(r.player.comboQueue, null);
    for (let i = 0; i < 30; i++) r.tick(i < 10 ? { shield: true } : {});
    assert.equal(r.player.combat.attack, null, `#${c.id}: and never later`);
    shielded++;
  }
  assert.ok(shielded > 0);
});

test('Run held or turned throughout never drops it: the follow-up comes as ever', () => {
  for (const c of playableCharacters()) {
    for (const run of [{ runRight: true }, { runLeft: true }]) {
      const r = far(c);
      r.tick({ ...run, ...press('attack1') });
      r.tick(run);
      r.tick({ ...run, ...press('attack1') });
      const out = playThrough(r, (i) => (i % 5 === 0 ? { runLeft: !run.runLeft, runRight: !!run.runLeft } : run));
      assert.equal(out.next?.def.id, r.player.attackFor('attack2'), `#${c.id} ${JSON.stringify(run)}`);
    }
  }
});

test('input locked (time up) or Combo Assist turned off drops it; a reset or a respawn leaves none behind', () => {
  for (const c of playableCharacters()) {
    const locked = far(c);
    locked.tick(press('attack1'));
    locked.tick(press('attack1'));
    locked.player.inputLocked = true;
    locked.tick();
    assert.equal(locked.player.comboQueue, null, `#${c.id}: locked`);
    playThrough(locked);
    quiet(locked, 30, `#${c.id} locked`);
    const off = far(c);
    off.tick(press('attack1'));
    off.tick(press('attack1'));
    off.player.controller.comboAssist = false;
    off.tick();
    assert.equal(off.player.comboQueue, null, `#${c.id}: turned off`);
    const reset = far(c);
    reset.tick(press('attack1'));
    reset.tick(press('attack1'));
    reset.player.respawn(reset.player.stage);
    assert.equal(reset.player.comboQueue, null, `#${c.id}: respawned`);
    quiet(reset, 30, `#${c.id} respawned`);
  }
});

// ---- Group G: the air --------------------------------------------------------------------------

test('in the air the air moves queue: a mid-air attack played out in the air is followed by the pair\'s other mid-air attack; one ended by its motion or a landing never is', () => {
  let followed = 0;
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      const why = `#${c.id} mid-air ${first}`;
      const r = far(c);
      lift(r);
      const airFirst = r.player.attackFor(first, false);
      const airSecond = r.player.attackFor(second, false);
      r.tick(press(first));
      const rec = r.player.combat.attack;
      assert.equal(rec?.def.id, airFirst, why);
      r.tick();
      r.tick(press(first));
      assert.equal(r.player.comboQueue?.move, airSecond, `${why}: the air's own follow-up`);
      assert.equal(r.player.comboQueue.place, 'air');
      const run = playThrough(r);
      if (run.natural && !r.player.grounded) {
        followed++;
        assert.equal(run.next?.def.id, airSecond, `${why}: then ${airSecond}`);
        assert.equal(run.next.airborne, true);
      } else {
        // A bounce, a landing cancel or a slam landed: never the ground's
        // move in its place, and never later.
        assert.notEqual(run.next?.def.id, r.player.attackFor(second, true), `${why}: never the ground's`);
        assert.equal(run.next, null, `${why}: ended by its motion or the ground, nothing follows`);
        assert.equal(r.player.queuedFollowUp, null, `${why}: no longer queued`);
        r.tick();
        assert.equal(r.player.comboQueue, null, `${why}: dropped`);
        assert.equal(r.player.combat.attack, null);
      }
    }
  }
  assert.ok(followed >= 4, 'most air moves are followed');
});

test('the air\'s limits hold: a follow-up spent for the airtime, or free fall, queues nothing; the ground\'s is never put in its place', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      const r = far(c);
      lift(r);
      const airSecond = r.player.attackFor(second, false);
      const atk = r.player.attacks[airSecond];
      r.tick(press(first));
      if (!r.player.combat.attack) continue;
      if (atk.airUses > 0) {
        r.player.airAttacks.set(airSecond, atk.airUses);
        r.tick(press(first));
        assert.equal(r.player.comboQueue, null, `#${c.id}: ${airSecond} used up`);
        const run = playThrough(r);
        assert.notEqual(run.next?.def.id, airSecond);
        assert.notEqual(run.next?.def.id, r.player.attackFor(second, true));
      }
      const ff = far(c);
      lift(ff);
      ff.tick(press(first));
      if (!ff.player.combat.attack) continue;
      ff.player.freeFall = true;
      ff.tick(press(first));
      assert.equal(ff.player.comboQueue, null, `#${c.id}: free fall`);
    }
  }
});

test('leaving the place the attack started in drops it: a ground attack carried into the air is never followed by an air move', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    r.tick(press('attack1'));
    r.tick(press('attack1'));
    assert.equal(r.player.comboQueue?.place, 'ground');
    lift(r);
    r.tick();
    assert.equal(r.player.comboQueue, null, `#${c.id}`);
    const run = playThrough(r);
    assert.equal(run.next, null, `#${c.id}: nothing follows`);
  }
});

// ---- Group H: with Combat Assist -------------------------------------------------------------------

test('the four settings: a queued melee follow-up out of reach gets Combat Assist\'s ordinary approach (no Energy), a ranged one never; Combo Assist off queues nothing', () => {
  let approached = 0;
  for (const c of playableCharacters()) {
    for (const [first, second] of PAIRS) {
      for (const comboAssist of [true, false]) {
        for (const combatAssist of [true, false]) {
          const why = `#${c.id} ${first}, Combo ${comboAssist}, Combat ${combatAssist}`;
          const r = playerRig({ character: c, gap: 900, comboAssist, combatAssist });
          r.tick(press(first));
          const rec = r.player.combat.attack;
          r.tick(press(first));
          assert.equal(!!r.player.comboQueue, comboAssist, `${why}: queued only with Combo Assist`);
          const secondAtk = r.player.attacks[r.player.attackFor(second)];
          while (rec.time + DT < rec.def.total - EPS) r.tick();
          // Just out of the second attack's reach, within one Dash.
          r.foe.body.x = r.player.body.x + 600;
          if (isMeleeAttack(secondAtk)) r.foe.body.x += 40 - meleeGap(r.player, attackReach(secondAtk), r.foe, 1);
          r.foe.body.prevX = r.foe.body.x;
          r.tick();
          if (!comboAssist) {
            assert.equal(r.player.combat.attack, null, `${why}: nothing`);
            assert.equal(r.player.combatAssist, null);
            continue;
          }
          const served = combatAssist && assistsAttack(secondAtk);
          if (served && r.player.combatAssist) {
            approached++;
            assert.equal(r.player.combatAssist.action, second, `${why}: closing in for it`);
            assert.equal(r.player.combatAssist.button, first);
            assert.equal(r.player.combat.energy, 100, `${why}: no Energy`);
            let starts = 0;
            for (let i = 0; i < 60; i++) {
              const before = r.player.combat.attack;
              r.tick();
              assert.equal(r.player.bufferedAttack, null, `${why}: never a second copy kept`);
              assert.equal(r.player.comboQueue, null);
              if (r.player.combat.attack && r.player.combat.attack !== before) starts++;
              assert.equal(r.player.combat.energy, 100);
            }
            assert.equal(starts, 1, `${why}: its attack once`);
          } else {
            assert.equal(r.player.combatAssist, null, `${why}: ${served ? 'nothing in the way allowed' : 'never served'}: no approach`);
            assert.equal(attackOf(r.player), secondAtk.id, `${why}: in place, its own reach`);
          }
        }
      }
    }
  }
  assert.ok(approached > 0, 'the approach served queued follow-ups');
});

test('in the air an approach for a queued follow-up uses the airtime\'s air dash, as Combat Assist always does, and still no Energy', () => {
  let seen = 0;
  for (const c of playableCharacters()) {
    const r = playerRig({ character: c, gap: 900 });
    lift(r);
    r.tick(press('attack1'));
    const rec = r.player.combat.attack;
    r.tick(press('attack1'));
    const second = r.player.attacks[r.player.attackFor('attack2', false)];
    if (!r.player.comboQueue || !assistsAttack(second)) continue;
    while (r.player.combat.attack === rec && rec.time + DT < rec.def.total - EPS) r.tick();
    if (r.player.combat.attack !== rec || r.player.grounded) continue;
    Object.assign(r.foe.body, { y: r.player.body.y, prevY: r.player.body.y, vy: 0, grounded: false, ground: null });
    r.foe.body.x = r.player.body.x + 600;
    r.foe.body.x += 40 - meleeGap(r.player, attackReach(second), r.foe, 1);
    r.foe.body.prevX = r.foe.body.x;
    const dashes = r.player.airDashes;
    r.tick();
    if (!r.player.combatAssist) continue;
    seen++;
    assert.equal(r.player.combatAssist.air, true, `#${c.id}`);
    assert.equal(r.player.airDashes, dashes - 1, `#${c.id}: the airtime's air dash`);
    assert.equal(r.player.combat.energy, 100, `#${c.id}: no Energy`);
  }
  assert.ok(seen > 0, 'at least one fighter closes in the air');
});

test('during Combat Assist\'s approach a repeat is no repeat: no attack plays yet, nothing is queued; an approach cancelled leaves nothing behind', () => {
  let approaches = 0;
  for (const c of playableCharacters()) {
    const r = playerRig({ character: c, gap: 600 });
    const atk = r.player.attacks[r.player.attackFor('attack1')];
    if (!assistsAttack(atk)) continue;
    r.foe.body.x = r.player.body.x + 600 + 40 - meleeGap(r.player, attackReach(atk), r.foe, 1);
    r.foe.body.prevX = r.foe.body.x;
    r.tick(press('attack1'));
    if (!r.player.combatAssist) continue;
    approaches++;
    r.tick(press('attack1'));
    assert.equal(r.player.comboQueue, null, `#${c.id}: an approach is no attack`);
    r.tick(press('jump'));
    assert.equal(r.player.combatAssist, null, `#${c.id}: cancelled`);
    assert.equal(r.player.comboQueue, null);
    quiet(r, 60, `#${c.id}: the cancelled approach's attack`);
  }
  assert.ok(approaches > 0);
});

// ---- Group J: whose, the HUD, determinism -----------------------------------------------------------

test('a CPU, the training dummy or a bare controller never queues: their repeats are untouched, nothing follows', () => {
  for (const c of playableCharacters()) {
    for (const kind of ['cpu', undefined]) {
      const held = {};
      const controller = { getInput: () => ({ ...blankInput(), ...held }) };
      if (kind) controller.kind = kind;
      const r = far(c, { controller });
      const tick = (now = {}) => {
        for (const k of Object.keys(held)) delete held[k];
        Object.assign(held, now);
        r.tick();
      };
      tick(press('attack1'));
      const rec = r.player.combat.attack;
      while (r.player.combat.attack === rec) {
        tick(press('attack1'));
        assert.equal(r.player.comboQueue, null, `#${c.id} ${kind}`);
      }
      assert.notEqual(attackOf(r.player), r.player.attackFor('attack2'), `#${c.id} ${kind}: never a follow-up`);
    }
  }
});

test('the HUD reads it: the queued move\'s tile in its place while it waits, never any other, gone once it starts or is dropped; never shown as ready', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    const groups = abilityGroups(c);
    const queuedTiles = () => ['ground', 'air'].flatMap((place) => groups[place]
      .filter((entry) => abilityStatus(r.player, entry, place).queued).map((entry) => `${place}:${entry.move}`));
    r.tick(press('attack1'));
    assert.deepEqual(queuedTiles(), [], `#${c.id}: nothing yet`);
    r.player.combat.cooldowns.set(r.player.attackFor('attack2'), 0.05);
    r.tick(press('attack1'));
    assert.deepEqual(queuedTiles(), [`ground:${r.player.attackFor('attack2')}`], `#${c.id}: Attack 2's ground tile`);
    const entry = groups.ground.find((e) => e.move === r.player.attackFor('attack2'));
    const status = abilityStatus(r.player, entry, 'ground');
    assert.equal(status.ready, false, `#${c.id}: queued is never ready while it cools`);
    assert.equal(status.cooldown.cooling, true);
    playThrough(r);
    assert.deepEqual(queuedTiles(), [], `#${c.id}: gone once it starts`);
    r.player.lostToVoid = true;
    r.tick(press('attack1'));
    assert.deepEqual(queuedTiles(), [], `#${c.id}: never for a fighter out of play`);
  }
});

test('deterministic: the same presses give the same queues and attacks, step for step', () => {
  const run = (c) => {
    const r = playerRig({ character: c, gap: 220 });
    const out = [];
    for (let i = 0; i < 260; i++) {
      const now = i % 9 === 0 ? press('attack1') : i % 13 === 0 ? press('attack2') : i % 31 === 0 ? press('jump') : { runRight: i > 120 };
      r.tick(now);
      const q = r.player.comboQueue;
      out.push([r.player.state, attackOf(r.player), q ? `${q.action}@${q.at}` : '-', r.player.body.x.toFixed(4), r.foe.combat.launchPoint].join(' '));
    }
    return out;
  };
  for (const c of playableCharacters()) assert.deepEqual(run(c), run(c), `#${c.id}`);
});
