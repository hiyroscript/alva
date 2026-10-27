// Run with node --test tests/systems/step-in.test.mjs (no dependencies).
// The shared attack movement (js/data/attack-movement.js): every grounded
// direct melee strike steps in, once, by itself; nothing held ever steers a
// fighter through a move on the ground, and in the air every move keeps the
// universal air control. Checked: the policy and its refusals; every
// fighter's verdicts, move by move (the real roster cases); and on the real
// Fighter, physics and combat for every playable fighter and every move it
// can press, on the ground and in the air: the Step-in from rest (slight,
// once, the way it faces, never for a throw, a cast, a summon, a motion of
// its own or a move that declines it, never in the air, never on landing),
// that no direction, Run or switch of direction held through any move on
// the ground, from rest, a run or a Dash, changes its path at all, that
// every aerial and the Deflect move under exactly the air control a fighter
// has outside an attack, and that the CPU's prediction of each move walks
// the very path the Fighter does. Shared rules, run on each fighter's own
// data (see tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACK_CARRY_DEFAULTS, STEERING_FIELDS, STEP_IN, STEP_IN_VERDICTS, resolveStepIn, stepInEligible,
} from '../../js/data/attack-movement.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { steer, stepInTravel } from '../../js/game/fighters/movement.js';
import { CHARACTERS, getCharacter, playableCharacters } from '../../js/data/characters.js';
import { analyzeCapabilities } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { Track, moveContact } from '../../js/game/ai/cpu-intelligence/prediction.js';
import { StageCollision } from '../../js/game/physics.js';
import { CONFIG } from '../../js/config.js';
import { DT, MOVEMENT as MV, harnessFor, stageMap, steps } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const RIGHT = { runRight: true };
const LEFT = { runLeft: true };
const BOX = { x: 10, y: -60, w: 30, h: 20 };
const ATTACK = { id: 'a', animation: 'x', startup: 0.1, active: 0.05, recovery: 0.1, damage: 3, hitbox: BOX };

// The slight lean the shared Step-in gives (world units from a standstill):
// a lean into the blow, never a stride.
const SLIGHT = 20;

// ---- The policy ------------------------------------------------------------------

test('the shared Step-in: slight, frozen, the same for everyone; four verdicts', () => {
  assert.ok(Object.isFrozen(STEP_IN));
  assert.ok(STEP_IN.speed > 0 && STEP_IN.speed < MV.dashSpeed / 2, 'a lunge, never a Dash');
  assert.ok(STEP_IN.lead > 0 && STEP_IN.lead < 1, 'within the startup');
  assert.deepEqual([...STEP_IN_VERDICTS], ['authored', 'universal', 'declined', 'exempt']);
  assert.deepEqual({ ...ATTACK_CARRY_DEFAULTS }, { momentum: 1, airMomentum: 1, friction: 1 });
  const lean = stepInTravel(createAttackDefinition(ATTACK), MV, DT);
  assert.ok(lean > 5 && lean < SLIGHT, `about ${lean.toFixed(1)} units`);
});

test('verdicts: missing data means the shared Step-in; authored, declined and exempt are told apart', () => {
  const plain = createAttackDefinition(ATTACK);
  assert.equal(plain.stepIn, 'universal');
  assert.deepEqual({ ...plain.step }, { at: ATTACK.startup * STEP_IN.lead, speed: STEP_IN.speed });
  const strings = createAttackDefinition({
    ...ATTACK, startup: undefined, active: undefined, damage: undefined, hits: [{ at: 0.2, active: 0.05, damage: 1 }, { at: 0.3, active: 0.05, damage: 3 }],
  });
  assert.equal(strings.step.at, 0.2 * STEP_IN.lead, 'a string: half way to its first strike');
  const own = createAttackDefinition({ ...ATTACK, step: { at: 0.02, speed: 280 } });
  assert.deepEqual([own.stepIn, own.step.at, own.step.speed], ['authored', 0.02, 280]);
  const none = createAttackDefinition({ ...ATTACK, step: false });
  assert.deepEqual([none.stepIn, none.step], ['declined', null]);
  for (const [why, spec] of [
    ['a throw', { ...ATTACK, hitbox: null, damage: undefined, projectile: { id: 'p', spawnAt: 0.1, offset: { x: 0, y: 0 } } }],
    ['a motion of its own', { ...ATTACK, motion: { type: 'roll', speed: 300 } }],
    ['a hover', { ...ATTACK, motion: { type: 'hover' } }],
    ['a defense', { ...ATTACK, deflectProjectiles: true }],
    ['pending', { id: 'p', animation: 'x', pending: true }],
  ]) {
    const d = createAttackDefinition(spec);
    assert.deepEqual([d.stepIn, d.step], ['exempt', null], why);
    assert.equal(stepInEligible(d), false, why);
  }
  // An authored lunge stands even on a move the policy would leave out.
  assert.equal(createAttackDefinition({ ...ATTACK, motion: { type: 'hover' }, step: { at: 0, speed: 200 } }).stepIn, 'authored');
});

test('refusals: a malformed step, `step: null`, a pending move\'s step, any steering field', () => {
  assert.throws(() => createAttackDefinition({ ...ATTACK, step: null }), /step: false/);
  assert.throws(() => createAttackDefinition({ ...ATTACK, step: { at: -1, speed: 100 } }), /step needs/);
  assert.throws(() => createAttackDefinition({ ...ATTACK, step: { at: 0, speed: 0 } }), /step needs/);
  assert.throws(() => createAttackDefinition({ ...ATTACK, step: true }), /step needs/);
  assert.throws(() => resolveStepIn({ step: 'yes' }, createAttackDefinition(ATTACK)), /step needs/);
  assert.throws(() => createAttackDefinition({ id: 'p', animation: 'x', pending: true, step: false }), /pending/);
  assert.throws(() => createAttackDefinition({ ...ATTACK, momentum: 1.5 }), /share from 0 to 1/);
  assert.throws(() => createAttackDefinition({ ...ATTACK, friction: -1 }), /rate from 0/);
  assert.deepEqual([...STEERING_FIELDS], ['mobility', 'control', 'airControl', 'topSpeed', 'airTopSpeed', 'lockMovement']);
  for (const field of STEERING_FIELDS) {
    assert.throws(() => createAttackDefinition({ ...ATTACK, [field]: field === 'mobility' ? 'quick' : 0.5 }), /steering of its own/, field);
  }
  // No fighter's data carries one, its Deflect's included.
  for (const c of CHARACTERS) {
    for (const [id, spec] of [...Object.entries(c.attacks ?? {}), ['deflect', c.deflect ?? {}]]) {
      for (const field of STEERING_FIELDS) assert.equal(spec[field], undefined, `#${c.id} ${id} ${field}`);
    }
  }
});

// ---- The roster ---------------------------------------------------------------------

// What a grounded activation of each move does (the mandatory roster cases).
const VERDICTS = {
  '0001': { attack1: 'universal', attack2: 'exempt', attack3: 'exempt', extra_attack: 'authored' },
  '0002': { attack1: 'universal', attack2: 'universal', attack3: 'exempt', extra_attack: 'exempt' },
  '0003': { attack1: 'universal', attack2: 'authored', extra_attack: 'authored' },
  '0004': { attack1: 'universal', attack2: 'universal', attack3: 'universal', extra_attack: 'exempt' },
  '0005': { attack1: 'universal', attack2: 'universal', attack3: 'declined', extra_attack: 'declined', attack5: 'declined' },
  '0006': { attack1: 'universal', attack2: 'exempt', extra_attack: 'exempt' },
  '0007': { attack1: 'universal', attack2: 'universal', extra_attack: 'exempt' },
  '0008': { attack1: 'universal', attack2: 'universal', attack3: 'declined', extra_attack: 'declined' },
};

test('every fighter\'s verdicts, as its moves really work', () => {
  for (const [id, verdicts] of Object.entries(VERDICTS)) {
    const { makeFighter } = harnessFor(getCharacter(id));
    const f = makeFighter().fighter;
    for (const [move, verdict] of Object.entries(verdicts)) assert.equal(f.attacks[move].stepIn, verdict, `#${id} ${move}`);
    // Every move with no step of its own and nothing to exempt it has the
    // shared one: no move is left out because it says nothing.
    for (const [move, atk] of Object.entries(f.attacks)) {
      const spec = getCharacter(id).attacks[move];
      if (spec.step === undefined) assert.equal(atk.stepIn, stepInEligible(atk) ? 'universal' : 'exempt', `#${id} ${move}`);
    }
    if (f.deflect) assert.equal(f.deflect.stepIn, 'exempt', `#${id} Deflect: a defense`);
  }
  // The authored lunges keep their own numbers.
  const kick = harnessFor(getCharacter('0001')).makeFighter().fighter.attacks.extra_attack;
  assert.deepEqual([kick.step.speed, kick.friction], [300, 0.6]);
  const k3 = harnessFor(getCharacter('0003')).makeFighter().fighter.attacks;
  assert.deepEqual([k3.attack2.step.speed, k3.extra_attack.step.speed, k3.extra_attack.friction], [220, 360, 0.7]);
  // The Dark Tendrils root: none of a run kept.
  assert.equal(harnessFor(getCharacter('0005')).makeFighter().fighter.attacks.extra_attack.momentum, 0);
});

// Every move a fighter can press, by place: [{ action, kind, id, def }].
function pressable(f, place) {
  const out = [];
  for (const [action, mapping] of Object.entries(f.def.actions ?? {})) {
    if (!mapping) continue;
    if (mapping.type) {
      if (place === 'ground') out.push({ action, kind: mapping.type, id: mapping.id, def: null });
      continue;
    }
    const id = typeof mapping === 'string' ? mapping : mapping[place];
    const atk = id ? f.attacks[id] : null;
    if (!atk || (place === 'air' && atk.groundOnly)) continue;
    out.push({ action, kind: 'attack', id, def: atk });
  }
  if (place === 'air' && f.deflect) out.push({ action: 'shield', kind: 'deflect', id: 'deflect', def: f.deflect });
  return out;
}

const busy = (f) => !!(f.combat.attack || f.technique || f.pendingSummon);

// Aims every move the fighter starts the way it faces (as a CPU's are
// aimed), so a held direction can never turn it: any difference a held
// direction then makes to its path would be steering.
function aim(f) {
  f.controller.attackFacing = () => f.facing;
}

// The path of `move` pressed from `setup` ('rest', 'run', 'dash' or 'air'),
// with `held(k)` held on the k-th step from the press on, until the move is
// over: [x, y, vx, vy] per step, and the fighter.
function trace(makeFighter, move, setup, held = () => ({})) {
  const h = makeFighter({ x: 400 });
  const f = h.fighter;
  aim(f);
  for (let i = 0; i < 5; i++) h.step({});
  if (setup === 'run') for (let i = 0; i < 20; i++) h.step(RIGHT);
  if (setup === 'dash') {
    h.step({ ...RIGHT, mouvementRightPressed: true });
    while (f.dash && f.dash.time < MV.dashCancelTime) h.step({});
  }
  if (setup === 'air') {
    h.step(P('jump'));
    for (let i = 0; i < 6; i++) h.step({});
  }
  h.step({ ...held(0), ...P(move.action) });
  const started = busy(f);
  const record = f.combat.attack;
  const path = [];
  for (let k = 1; busy(f) && k < 400; k++) {
    path.push([f.body.x, f.body.y, f.body.vx, f.body.vy]);
    h.step(held(k));
  }
  return { f, path, started, record };
}

const HELD = {
  'Run held': () => RIGHT,
  'held back': () => LEFT,
  'switching sides': (k) => (k % 6 < 3 ? RIGHT : LEFT),
  'Run pressed after it starts': (k) => (k >= 2 ? { ...RIGHT, runRightPressed: k === 2 } : {}),
  'switched late in it': (k) => (k >= 8 ? LEFT : RIGHT),
};

for (const c of playableCharacters()) {
  const { makeFighter } = harnessFor(c);
  const probe = makeFighter().fighter;
  const name = `#${c.id}`;
  const ground = pressable(probe, 'ground');
  const air = pressable(probe, 'air');

  test(`${name}: from a standstill, nothing held, each grounded strike steps in slightly once the way it faces; nothing else moves`, () => {
    for (const move of ground) {
      for (const facing of [1, -1]) {
        const h = makeFighter({ x: 1000, facing });
        aim(h.fighter);
        h.step({});
        const x0 = h.fighter.body.x;
        h.step(P(move.action));
        // A summon needs someone to appear behind (see the summon test below).
        if (move.kind === 'summon') continue;
        assert.ok(busy(h.fighter), `${move.id}: started`);
        const record = h.fighter.combat.attack;
        let rises = 0;
        let last = h.fighter.body.vx * facing;
        let x = h.fighter.body.x;
        while (busy(h.fighter)) {
          x = h.fighter.body.x;
          h.step({});
          const v = h.fighter.body.vx * facing;
          if (v > last + 1e-9) rises++;
          last = v;
        }
        const travel = (x - x0) * facing;
        const atk = move.def;
        if (atk?.motion && atk.motion.type !== 'hover') continue; // its own motion is its movement
        if (atk?.step) {
          assert.deepEqual(record.step, atk.step, `${move.id}: this activation's Step-in is its definition's`);
          assert.ok(travel > 2 && travel < 30, `${move.id} facing ${facing}: a slight step forward (${travel.toFixed(1)})`);
          assert.ok(rises <= 1, `${move.id}: once (${rises})`);
          if (atk.stepIn === 'universal') {
            assert.ok(Math.abs(travel - stepInTravel(atk, MV, DT)) < 1e-6, `${move.id}: the shared Step-in's travel`);
          }
        } else {
          assert.ok(Math.abs(travel) < 1e-9, `${move.id} (${move.kind}, ${atk?.stepIn ?? 'no attack'}): it stays where it stands (${travel})`);
        }
      }
    }
  });

  test(`${name}: an aerial, a Deflect, never steps in, and landing never makes it lunge`, () => {
    for (const move of air) {
      const h = makeFighter({ x: 400 });
      aim(h.fighter);
      h.step(P('jump'));
      h.step({});
      h.step(P(move.action));
      const record = h.fighter.combat.attack;
      assert.ok(record, `${move.id}: started`);
      assert.equal(record.step, null, `${move.id}: no Step-in for an activation in the air`);
      while (h.fighter.combat.attack === record) h.step({});
    }
    // Started just above the floor, a plain aerial lands while it plays and
    // never lunges from there.
    for (const move of air) {
      if (move.def.motion) continue;
      const h = makeFighter({ x: 400 });
      aim(h.fighter);
      h.step(P('jump'));
      while (h.fighter.body.vy < 0 || h.fighter.body.y < 790) h.step({});
      h.step(P(move.action));
      const record = h.fighter.combat.attack;
      if (!record) continue;
      const vx = [];
      while (h.fighter.combat.attack === record) {
        h.step({});
        vx.push(h.fighter.body.vx);
      }
      assert.ok(vx.every((v) => Math.abs(v) < 1e-9), `${move.id}: never pushed forward on landing`);
    }
  });

  test(`${name}: on the ground, no direction, Run or switch held through any move changes its path: from rest, a run or a Dash`, () => {
    for (const [setup, moves] of [['rest', ground], ['run', ground], ['dash', ground]]) {
      let tried = 0;
      for (const move of moves) {
        const neutral = trace(makeFighter, move, setup);
        // Refused there: a summon with nobody to appear behind (see the
        // summon test below), a technique or summon out of a Dash (neither
        // cuts one short). Every attack starts.
        if (!neutral.started) {
          assert.ok(move.kind === 'summon' || move.kind === 'technique', `${move.id} from ${setup}: started`);
          continue;
        }
        tried++;
        for (const [label, held] of Object.entries(HELD)) {
          const other = trace(makeFighter, move, setup, held);
          assert.deepEqual(other.path, neutral.path, `${move.id} from ${setup}, ${label}: never steered`);
        }
      }
      assert.ok(tried > 0, `${setup}: moves tried`);
    }
  });

  test(`${name}: in the air, every move keeps the universal air control: held, it moves the fighter exactly as outside an attack`, () => {
    for (const move of air) {
      const neutral = trace(makeFighter, move, 'air');
      assert.ok(neutral.started, `${move.id}: started`);
      const right = trace(makeFighter, move, 'air', () => RIGHT);
      const left = trace(makeFighter, move, 'air', () => LEFT);
      const k = Math.min(neutral.path.length, right.path.length, left.path.length) - 1;
      assert.ok(right.path[k][0] > neutral.path[k][0] && left.path[k][0] < neutral.path[k][0],
        `${move.id}: held right it goes right, held left it goes left (${left.path[k][0]} < ${neutral.path[k][0]} < ${right.path[k][0]})`);
      // The same for a CPU's controller and a player's.
      for (const kind of ['cpu', 'player']) {
        const other = trace((o) => {
          const h = makeFighter(o);
          h.fighter.controller.kind = kind;
          return h;
        }, move, 'air', () => RIGHT);
        assert.deepEqual(other.path, right.path, `${move.id}: a ${kind}'s air control alike`);
      }
      // Step by step, wherever its own motion does not set the speed
      // itself (a homing dash, a roll), the speed changes exactly as the
      // universal air control changes it outside an attack.
      const type = move.def.motion?.type;
      if (type === 'homing' || type === 'roll') continue;
      const h = makeFighter({ x: 400 });
      aim(h.fighter);
      for (let i = 0; i < 5; i++) h.step({});
      h.step(P('jump'));
      for (let i = 0; i < 6; i++) h.step({});
      h.step({ ...RIGHT, ...P(move.action) });
      const record = h.fighter.combat.attack;
      let checked = 0;
      for (let i = 0; i < 400 && h.fighter.combat.attack === record; i++) {
        const before = { vx: h.fighter.body.vx, grounded: false };
        const burst = h.fighter.burst;
        const airborne = !h.fighter.body.grounded;
        h.step(LEFT);
        if (!airborne || h.fighter.body.grounded || h.fighter.combat.attack !== record) continue;
        steer(before, MV, -1, DT, burst);
        assert.ok(Math.abs(h.fighter.body.vx - before.vx) < 1e-9, `${move.id}, step ${i}: ${h.fighter.body.vx} vs the air control's ${before.vx}`);
        checked++;
      }
      assert.ok(checked > 0, `${move.id}: checked in the air`);
    }
  });

  test(`${name}: the CPU and the player move alike: a CPU's or a player's Run through a move changes nothing`, () => {
    for (const move of ground) {
      const base = trace(makeFighter, move, 'run');
      for (const kind of ['cpu', 'player']) {
        const run = trace((o) => {
          const h = makeFighter(o);
          h.fighter.controller.kind = kind;
          return h;
        }, move, 'run', () => RIGHT);
        assert.deepEqual(run.path, base.path, `${move.id}: a ${kind}'s Run moves it no further`);
      }
    }
  });

  test(`${name}: normal movement comes back the step the move is over`, () => {
    for (const move of ground) {
      const h = makeFighter({ x: 400 });
      aim(h.fighter);
      h.step({});
      h.step(P(move.action));
      while (busy(h.fighter)) h.step(RIGHT);
      if (h.fighter.combat.stun > 0) continue;
      const v = h.fighter.body.vx;
      h.step(RIGHT);
      assert.ok(h.fighter.body.vx > v, `${move.id}: running again at once`);
    }
  });

  test(`${name}: the CPU's prediction of each move walks the path the Fighter does`, () => {
    const caps = analyzeCapabilities(probe);
    const foe = new Track(4);
    foe.push({ x: 1900, y: 800, vx: 0, vy: 0, grounded: true });
    const hurt = { hw: 12, top: -100, bottom: 0 };
    const self = new Track(400);
    for (const [setup, place, moves] of [['rest', 'ground', ground], ['run', 'ground', ground], ['air', 'air', air]]) {
      for (const move of moves) {
        if (move.kind !== 'attack') continue;
        const m = caps.moves.find((x) => x.key === `${move.action}:${place}` && x.kind !== 'deflect');
        if (!m) continue;
        // The state the press is made from.
        const h = makeFighter({ x: 400 });
        aim(h.fighter);
        for (let i = 0; i < 5; i++) h.step({});
        if (setup === 'run') for (let i = 0; i < 20; i++) h.step(RIGHT);
        if (setup === 'air') {
          h.step(P('jump'));
          for (let i = 0; i < 6; i++) h.step({});
        }
        const b = h.fighter.body;
        const st = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, grounded: b.grounded, ground: b.ground, halfW: b.halfW, height: b.height };
        const real = [];
        h.step(P(move.action));
        if (!h.fighter.combat.attack) continue;
        const record = h.fighter.combat.attack;
        while (h.fighter.combat.attack === record && !b.grounded === (place === 'air')) {
          real.push(b.x);
          h.step({});
        }
        moveContact(probe.stage, CONFIG.sim.gravity, m, st, 1, foe, hurt, self);
        const n = Math.min(real.length, self.len);
        assert.ok(n > 0, `${move.id}: predicted`);
        for (let k = 0; k < n; k++) {
          assert.ok(Math.abs(self.x[k] - real[k]) < 1e-6, `${move.id} from ${setup}, step ${k}: predicted ${self.x[k]} vs ${real[k]}`);
        }
      }
    }
  });
}

// ---- Walls, clones, the CPU's reading of a lunge ------------------------------------------

test('a Step-in against a wall stops at it: it moves the body through the physics, never through a solid', () => {
  const stage = new StageCollision(stageMap({ solids: [{ id: 'wall', x: 520, y: 700, w: 40, h: 100 }] }));
  const { makeFighter } = harnessFor(getCharacter('0001'));
  const h = makeFighter({ x: 520 - 17, stage });
  h.step({});
  const limit = 520 - h.fighter.body.halfW;
  h.step(P('attack1'));
  while (h.fighter.combat.attack) {
    h.step({});
    assert.ok(h.fighter.body.x <= limit + 1e-6, `${h.fighter.body.x}`);
  }
});

test('a summon never moves its owner, and its clone never steps in: the phantom bites from where it appears', () => {
  const { duel } = harnessFor(getCharacter('0005'));
  const d = duel({ gap: 200 });
  const x0 = d.attacker.body.x;
  d.tick(P('attack5'));
  assert.ok(d.attacker.pendingSummon, 'its startup');
  while (d.attacker.pendingSummon) {
    assert.equal(d.attacker.body.x, x0, 'the owner holds still, Run held or not');
    d.tick(RIGHT);
  }
  d.until(() => d.clones.length > 0, steps(0.5));
  const [phantom] = d.clones;
  const px = phantom.x;
  for (let i = 0; i < steps(1) && d.clones.includes(phantom); i++) {
    d.tick(RIGHT);
    assert.equal(phantom.x, px, 'the phantom never moves');
  }
});

test('the CPU tells a lean from a lunge: the shared Step-in never makes a strike an approach', () => {
  for (const c of playableCharacters()) {
    const caps = analyzeCapabilities(harnessFor(c).makeFighter().fighter);
    for (const m of caps.moves) {
      if (m.air || m.stepIn !== 'universal') continue;
      assert.ok(m.lunge > 0 && m.lunge < SLIGHT, `#${c.id} ${m.key}: its real travel (${m.lunge})`);
      if (!m.motion) assert.equal(m.roles.has('approach'), false, `#${c.id} ${m.key}: not an approach`);
    }
    for (const m of caps.moves) if (m.air) assert.equal(m.lunge, 0, `#${c.id} ${m.key}: no lunge in the air`);
  }
});

test('a turn turns a Step-in still to come with the strike; once made, a turn never redirects it', () => {
  for (const c of playableCharacters()) {
    const { makeFighter } = harnessFor(c);
    for (const move of pressable(makeFighter().fighter, 'ground')) {
      if (!move.def?.step || move.def.motion) continue;
      // `from`: the step it is held from (0: at once, 'stepped': once the
      // Step-in is made).
      const play = (held, from = 0) => {
        const h = makeFighter({ x: 1000 });
        h.step({});
        h.step(P(move.action));
        const record = h.fighter.combat.attack;
        const xs = [];
        while (h.fighter.combat.attack) {
          h.step(from === 'stepped' && !record.stepped ? {} : held);
          if (h.fighter.combat.attack) xs.push(h.fighter.body.x - 1000);
        }
        return { xs, facing: h.fighter.facing };
      };
      const straight = play({});
      assert.ok(straight.xs.at(-1) > 0, `#${c.id} ${move.id}: forward`);
      const turned = play(LEFT);
      assert.equal(turned.facing, -1, `#${c.id} ${move.id}: a direction held turns an attack`);
      for (let k = 0; k < straight.xs.length; k++) {
        assert.ok(Math.abs(turned.xs[k] + straight.xs[k]) < 1e-9, `#${c.id} ${move.id}: turned at once, it lunges the new way, the mirror of the straight one`);
      }
      const late = play(LEFT, 'stepped');
      assert.equal(late.facing, -1, `#${c.id} ${move.id}: turned after it`);
      assert.deepEqual(late.xs, straight.xs, `#${c.id} ${move.id}: its Step-in, once made, never redirected`);
    }
  }
});
