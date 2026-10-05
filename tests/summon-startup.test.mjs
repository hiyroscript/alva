// Run with node --test tests/summon-startup.test.mjs (no dependencies).
// A summon's startup (its `startupAnimation`, js/game/combat/summon.js): the owner's
// own summoning pose, played once between the accepted press and the summon
// request. #0001's Clone Attack: its four attack3_summon frames (restored
// byte for byte from the repository's history, the poses of the retired
// held Down stance, renamed for Attack 3), the press that starts it at once,
// the poses in order at 10 fps, the clone queued only as it ends, the
// cooldown from the press, the owner committed to it (still, facing kept,
// no other action), every way it is cut short (a hit, lost ground, the
// Void, a reset, a target that is gone) with no clone and the cooldown kept,
// the refusals that start nothing, a summon with no startup, and the combat
// AI pressing Attack 3 into the same commitment. The clone after it:
// clone.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterFramePaths } from '../js/data/characters.js';
import { getMap } from '../js/data/maps.js';
import { Fighter } from '../js/game/fighters/fighter.js';
import { Clone, createSummonDefinition } from '../js/game/combat/summon.js';
import { readMoveset } from '../js/game/ai/moveset.js';
import {
  def, DT, BASE, STAGE, cpuFight, duel, fakeSprites, fakeSpritesOf, frameName, makeFighter, startupSteps, steps,
} from './fighter-harness.mjs';
import { SAMPLE_FIGHTER } from './sample-fighter.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ATTACK1 = { attack1: true, attack1Pressed: true };
const ATTACK3 = { attack3: true, attack3Pressed: true };
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });

const STARTUP = def.animations.attack3_summon;
const POSES = [1, 2, 3, 4].map((n) => `0001_attack3_summon_${n}.png`);
// One pass of attack3_summon: 4 frames at 10 fps, 0.4 s, 24 fixed steps.
const STARTUP_STEPS = startupSteps(def, 'attack3');

// The four restored frames, byte for byte: the files the repository held
// at 538d73a, in the order they played there (the two startup poses, then
// the two held ones), each under its Attack 3 name. `blob` is git's own id
// of those bytes.
const RESTORED = [
  { file: POSES[0], sha256: '82369588a62d1d1d93c85cae095b413f91b3fc880001a2084787442da93efbaf', blob: '8c61ef66bd3605abd4974a83c96d7776af9eda4c' },
  { file: POSES[1], sha256: '28739fdd884f5e271d5458118fe1ffbe2325f3bf53ebea3440672e46214534d0', blob: '42aa5cb71b8aeaab2d204031dfebfb9d6889cfaf' },
  { file: POSES[2], sha256: 'f14f01451ab15056f0b57c0915d3bd4211e1760699f2067b010dcf1e95c47b21', blob: '211a17c5afe078f085184934d040fff1a3e91a35' },
  { file: POSES[3], sha256: '8ba0b0c8f2ec29cb72b673531b7c87dac25d173c70447e9aa4e5105631a39e7c', blob: '8f07c7644ffd7addbfeee3ef92006ad6e5b5a2a5' },
];

const runs = (list) => list.reduce((out, v) => {
  if (out.length && out.at(-1)[0] === v) out.at(-1)[1]++;
  else out.push([v, 1]);
  return out;
}, []);

function captureWarnings(fn) {
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = warn;
  }
  return warnings;
}

// ---- The art ----------------------------------------------------------------------

test('the four summoning poses are #0001\'s attack3_summon_1-4: the restored bytes, unchanged, under Attack 3 names', () => {
  for (const { file, sha256, blob } of RESTORED) {
    const bytes = readFileSync(`${ROOT}assets/characters/0001/${file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, `${file}: the historical bytes`);
    const id = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(id, blob, `${file}: git's own blob of them`);
    // A transparent RGBA PNG at #0001's own 8x art scale, like its other poses.
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.deepEqual([bytes[24], bytes[25]], [8, 6], `${file}: 8-bit RGBA`);
    assert.equal(bytes.readUInt32BE(20), 416, `${file}: 52 art pixels tall`);
  }
});

test('attack3_summon is a one-shot #0001 fighter clip: the four poses in order, at 10 fps, preloaded, with no fallback', () => {
  assert.deepEqual(STARTUP.frames, POSES.map((f) => `${BASE}${f.slice(5)}`));
  assert.equal(STARTUP.fps, 10);
  assert.equal(STARTUP.loop, false, 'played once, never held in a loop');
  assert.equal(STARTUP.heightRatio, 1);
  assert.equal(STARTUP_STEPS, 24, '0.4 s');
  assert.equal(STARTUP.frames.length / STARTUP.fps, 0.4);
  // A pose of the fighter's, not an effect: the clone's smoke is
  // attack3_object, an effect of its own.
  for (const table of ['effectAnimations', 'projectileAnimations']) {
    for (const anim of Object.values(def[table])) assert.ok(anim.frames.every((u) => !/attack3_summon/.test(u)), table);
  }
  assert.ok(def.effectAnimations.attack3_object.frames.every((u) => /attack3_object_\d+\.png$/.test(u)));
  const paths = characterFramePaths(def);
  assert.deepEqual(paths.filter((u) => /attack3_summon/.test(u)), STARTUP.frames, 'preloaded with #0001, in order');
  assert.equal(def.animationFallbacks.attack3_summon, undefined, 'never faked with another pose');
});

test('the startup is summon data, generic: startupAnimation names the owner\'s clip; no fighter is named in the engine', () => {
  assert.equal(def.summons.attack3.startupAnimation, 'attack3_summon');
  assert.equal(createSummonDefinition({ id: 'x' }).startupAnimation, null, 'optional: none by default');
  assert.equal(createSummonDefinition({ id: 'x', startupAnimation: 'pose' }).startupAnimation, 'pose');
  for (const file of [
    'js/game/fighters/fighter.js', 'js/game/combat/summon.js', 'js/game/combat/combat.js', 'js/game/combat/attacks.js',
    'js/game/combat/combat-state.js', 'js/game/arena.js', 'js/game/practice.js',
  ]) {
    const code = readFileSync(`${ROOT}${file}`, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /'000\d'|#000\d|attack3_summon|attack3_object|'attack3'/, `${file}: nothing about one fighter or button`);
    assert.doesNotMatch(code, /mobileAbilities|preview/, `${file}: never the touch art`);
  }
});

// ---- The press ----------------------------------------------------------------------

test('Attack 3 accepted: the summoning pose shows on the press step itself, the cooldown starts, no clone yet', () => {
  const d = duel();
  d.tick(ATTACK3);
  const f = d.attacker;
  assert.equal(f.state, 'summon');
  assert.equal(f.animator.anim.key, 'attack3_summon', 'no idle frame before it');
  assert.equal(frameName(f), POSES[0]);
  assert.deepEqual({ ...f.pendingSummon }, { id: 'attack3', target: d.target, animation: 'attack3_summon', duration: 0.4, time: 0 });
  assert.equal(f.combat.attack, null, 'not an attack');
  assert.equal(f.technique, null, 'nor a technique');
  assert.deepEqual(f.summons, [], 'nothing queued');
  assert.deepEqual(d.clones, [], 'nothing spawned');
  assert.equal(f.combat.abilityCooldowns.remaining('attack3'), 5, 'the cooldown, from acceptance');
  assert.equal(f.canAct(), false);
  assert.equal(f.combat.lastIntent, 'attack3');
});

test('the four poses play once, in order, a tenth of a second each; the clone is queued on the very step they end', () => {
  const d = duel();
  const f = d.attacker;
  const shown = [];
  d.tick(ATTACK3);
  shown.push(frameName(f));
  while (!d.clones.length) {
    assert.equal(f.state, 'summon');
    assert.deepEqual(f.summons, []);
    d.tick();
    if (!d.clones.length) shown.push(frameName(f));
    assert.ok(shown.length <= STARTUP_STEPS, 'no clone before the startup is over');
  }
  assert.deepEqual(runs(shown), POSES.map((p) => [p, steps(1 / STARTUP.fps)]), '1 -> 2 -> 3 -> 4, 6 steps each');
  assert.equal(shown.length, STARTUP_STEPS);
  // The step after the last pose: the clone, at its first cloud frame, and
  // the owner free in its idle, all at once.
  const [clone] = d.clones;
  assert.ok(clone instanceof Clone);
  assert.equal(clone.phase, 'appear');
  assert.equal(clone.cloudFrame.url.split('/').pop(), '0001_attack3_object_1.png');
  assert.equal(clone.attackDef.id, 'attack1');
  assert.equal(clone.target, d.target);
  assert.equal(f.pendingSummon, null);
  assert.equal(f.state, 'idle');
  assert.equal(f.canAct(), true);
  // Its smoke is the clone's, never on the owner; its poses are the
  // owner's, never on the clone.
  assert.ok(shown.every((n) => /attack3_summon/.test(n)));
  for (let i = 0; i < 40; i++) {
    d.tick();
    if (clone.frame) assert.doesNotMatch(clone.frame.url, /attack3_summon/);
    assert.doesNotMatch(frameName(f), /attack3_object|attack3_summon/);
  }
});

test('during the startup #0001 is committed: no attack, Throw, summon, technique, Dash, jump or Shield, standing still, facing kept', () => {
  const tries = [
    ATTACK1, P('attack2'), P('extra_attack'), P('attack4'), ATTACK3, P('jump'), { shield: true, shieldPressed: true },
    { mouvementRightPressed: true }, { mouvementLeftPressed: true }, P('runLeft'), P('runLeft'), P('transform'),
  ];
  for (const press of tries) {
    const d = duel({ gap: 200 });
    const f = d.attacker;
    d.tick(ATTACK3);
    const { x, y } = f.body;
    const facing = f.facing;
    for (let i = 1; i < STARTUP_STEPS - steps(f.def.movement.attackBuffer) - 1; i++) {
      d.tick(i % 3 === 1 ? press : { runLeft: true, down: true, jump: true, shield: true });
      const label = Object.keys(press).join('+');
      assert.equal(f.state, 'summon', `${label} (step ${i})`);
      assert.equal(f.combat.attack, null, label);
      assert.equal(f.technique, null, label);
      assert.equal(f.dash, null, label);
      assert.equal(f.combat.shielding, false, label);
      assert.equal(f.grounded, true, label);
      assert.deepEqual([f.body.x, f.body.y, f.body.vx], [x, y, 0], `${label}: not a step taken`);
      assert.equal(f.facing, facing, `${label}: facing held`);
      assert.equal(f.combat.abilityCooldowns.active('attack4'), false, `${label}: attack4 not spent`);
    }
    // It still ends on time, the clone out, the fighter free.
    while (f.pendingSummon) d.tick();
    d.tick();
    assert.equal(d.clones.length, 1, Object.keys(press).join('+'));
  }
});

test('running into it, #0001 stops dead to summon, and holding a direction never turns or moves it; the clone still faces as the target does', () => {
  const d = duel({ gap: 300 });
  const f = d.attacker;
  for (let i = 0; i < 20; i++) d.tick({ runRight: true });
  assert.ok(f.body.vx > 100, 'running');
  d.tick({ runRight: true, ...ATTACK3 });
  assert.equal(f.body.vx, 0, 'no slide under the pose');
  const x = f.body.x;
  for (let i = 1; i < STARTUP_STEPS; i++) {
    d.tick({ runLeft: true });
    assert.equal(f.facing, 1, 'facing kept: right, as it was pressed');
    assert.equal(f.body.x, x);
  }
  d.tick({ runLeft: true });
  assert.equal(d.clones.length, 1);
  assert.equal(d.clones[0].facing, d.target.facing, 'its own placement rule, unchanged');
  assert.equal(d.clones[0].x, d.target.body.x - d.target.facing * def.summons.attack3.behindDistance);
});

test('holding Attack 3 summons once: one startup, one clone; a press while it plays or cools does nothing', () => {
  // Every startup begun and every clone sent out over `seconds` of `held(i)`.
  const count = (held, seconds) => {
    const d = duel();
    const seen = new Set();
    let starts = 0;
    let was = false;
    for (let i = 0; i < steps(seconds); i++) {
      d.tick(held(i));
      const now = d.attacker.state === 'summon';
      if (now && !was) starts++;
      was = now;
      for (const c of d.clones) seen.add(c);
    }
    return [starts, seen.size];
  };
  // Pressed once, then held for 4.5 s (its cooldown never runs out): one.
  assert.deepEqual(count((i) => (i === 0 ? ATTACK3 : { attack3: true }), 4.5), [1, 1]);
  // Held for 6 s: once the cooldown is over, holding is still no press.
  assert.deepEqual(count((i) => (i === 0 ? ATTACK3 : { attack3: true }), 6), [1, 1]);
  // Pressed again and again: during the startup, and all through the
  // cooldown, nothing; the first press after the cooldown, a second.
  assert.deepEqual(count((i) => (i % 7 === 0 ? ATTACK3 : { attack3: true }), 6), [2, 2]);
});

test('an attack pressed in the startup\'s last moments is the input buffer\'s, as after any action: it comes out as the startup ends', () => {
  const d = duel({ gap: 200 });
  const f = d.attacker;
  d.tick(ATTACK3);
  for (let i = 1; i < STARTUP_STEPS - 1; i++) d.tick();
  d.tick(ATTACK1);
  assert.equal(f.state, 'summon', 'not during it');
  assert.equal(f.bufferedAttack?.action, 'attack1');
  d.tick();
  assert.equal(d.clones.length, 1);
  assert.equal(f.combat.attack?.def.id, 'attack1', 'then, on the step the startup ends');
});

// ---- Cut short --------------------------------------------------------------------

test('a hit cuts the startup short: the hurt pose on the hit\'s own step, no clone ever, and the cooldown runs on', () => {
  for (const [label, hitter] of [['a punch', ATTACK1], ['a shuriken', P('extra_attack')]]) {
    const d = duel({ gap: hitter === ATTACK1 ? 44 : 200 });
    const f = d.attacker;
    d.tick(ATTACK3);
    d.tick({}, hitter);
    let n = 2;
    while (!d.events.some((e) => e.target === f)) {
      assert.equal(f.state, 'summon', `${label}: posing until it lands`);
      d.tick();
      n++;
      assert.ok(n <= STARTUP_STEPS, `${label}: it lands during the startup`);
    }
    // The very step the hit lands: no pose of the summon left.
    assert.equal(f.pendingSummon, null, label);
    assert.equal(f.state, 'hitstun', label);
    assert.equal(frameName(f), '0001_hurt_1.png', `${label}: hurt at once`);
    const remaining = f.combat.abilityCooldowns.remaining('attack3');
    assert.ok(remaining > 4 && remaining < 5, `${label}: still cooling`);
    for (let i = 0; i < steps(1.5); i++) d.tick();
    assert.deepEqual(d.clones, [], `${label}: no clone`);
    assert.deepEqual(f.summons, []);
    assert.ok(f.combat.abilityCooldowns.active('attack3'), `${label}: no refund`);
    // Pressed again while it cools: nothing, not even a pose.
    d.tick(ATTACK3);
    assert.notEqual(f.state, 'summon');
  }
});

test('ground lost during the startup cuts it short: the fighter falls from where it is, with no clone, the cooldown kept', () => {
  // On the harness ledge (x 900 - 1100, y 600), the target beside it.
  const d = duel({ x: 1080, gap: 44 });
  const f = d.attacker;
  f.spawn = { x: 1080, y: 600, facing: 1 };
  f.reset(STAGE);
  assert.equal(f.body.y, 600);
  d.tick(ATTACK3);
  assert.equal(f.state, 'summon');
  for (let i = 0; i < 5; i++) d.tick();
  // Pushed off the edge (as a body pushing past it would): nothing under it.
  f.body.x = 1100 + f.def.collider.width;
  d.tick();
  assert.equal(f.grounded, false);
  assert.equal(f.pendingSummon, null, 'cut short');
  assert.equal(f.state, 'fall', 'falling at once, in its fall pose');
  while (!f.grounded) d.tick();
  for (let i = 0; i < STARTUP_STEPS; i++) d.tick();
  assert.deepEqual(d.clones, []);
  assert.ok(f.combat.abilityCooldowns.active('attack3'));
});

test('a target gone before the cue gets no clone, and no other target does: the cooldown is spent all the same', () => {
  // Its opponent changed under it (another fighter in its place).
  const d = duel();
  d.tick(ATTACK3);
  const stranger = makeFighter({ x: 700, facing: -1 }).fighter;
  d.attacker.opponent = stranger;
  for (let i = 0; i < STARTUP_STEPS + 30; i++) d.tick();
  assert.deepEqual(d.clones, [], 'never retargeted');
  assert.equal(d.attacker.state, 'idle', 'the startup played out, then nothing');
  assert.ok(d.attacker.combat.abilityCooldowns.active('attack3'));
  // Its target out of play (lost to the Void) as the cue comes.
  const v = duel();
  v.tick(ATTACK3);
  for (let i = 1; i < STARTUP_STEPS; i++) v.tick();
  v.target.lostToVoid = true;
  v.tick();
  assert.deepEqual(v.clones, []);
  assert.deepEqual(v.attacker.summons, []);
  assert.ok(v.attacker.combat.abilityCooldowns.active('attack3'));
});

// A real Battle on Desert, scripted Player 1, a still CPU (see clone.test.mjs).
async function realBattle() {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../js/game/battle.js');
  const sprites = fakeSprites();
  const script = { once: {} };
  const input = { flush() {}, sample() { const out = { ...script.once }; script.once = {}; return out; } };
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input,
  });
  battle.p2.controller = null;
  battle.setPhase('fight');
  battle.update(DT);
  return { battle, script };
}

test('the Void cuts a startup short: its target taken, or the summoner itself; no clone, and a respawn is fresh', async () => {
  // The target falls into the Void mid-startup.
  {
    const { battle, script } = await realBattle();
    script.once = ATTACK3;
    battle.update(DT);
    assert.equal(battle.p1.state, 'summon');
    battle.p2.body.y = battle.map.voidBounds.bottom + 100;
    battle.update(DT);
    assert.equal(battle.p2.lostToVoid, true);
    assert.equal(battle.p1.pendingSummon, null, 'nothing left to summon at');
    assert.equal(battle.p1.state, 'idle');
    for (let i = 0; i < STARTUP_STEPS; i++) battle.update(DT);
    assert.deepEqual(battle.clones, []);
    assert.ok(battle.p1.combat.abilityCooldowns.active('attack3'), 'spent');
  }
  // The summoner itself.
  {
    const { battle, script } = await realBattle();
    script.once = ATTACK3;
    battle.update(DT);
    battle.p1.body.y = battle.map.voidBounds.bottom + 100;
    battle.update(DT);
    assert.equal(battle.p1.lostToVoid, true);
    assert.equal(battle.p1.pendingSummon, null);
    for (let i = 0; i < STARTUP_STEPS; i++) battle.update(DT);
    assert.deepEqual(battle.clones, []);
    while (battle.p1.lostToVoid) battle.update(DT);
    assert.equal(battle.p1.pendingSummon, null, 'respawned fresh');
    assert.equal(battle.p1.combat.abilityCooldowns.active('attack3'), false, 'every cooldown ready');
    assert.equal(battle.p1.state, 'idle');
  }
});

test('a reset or respawn mid-startup leaves nothing of it', () => {
  const d = duel();
  d.tick(ATTACK3);
  d.tick();
  d.attacker.reset(STAGE);
  assert.equal(d.attacker.pendingSummon, null);
  assert.equal(d.attacker.state, 'idle');
  assert.equal(d.attacker.combat.abilityCooldowns.size, 0);
  for (let i = 0; i < STARTUP_STEPS + 10; i++) d.tick();
  assert.deepEqual(d.clones, []);
});

// ---- Refused: nothing at all -------------------------------------------------------

test('a refused Attack 3 plays no pose and spends no cooldown: in the air, alone, cooling down, or missing any of its art', () => {
  const nothing = (f, label) => {
    assert.equal(f.pendingSummon, null, `${label}: no startup`);
    assert.notEqual(f.state, 'summon', label);
    assert.deepEqual(f.summons, [], label);
    assert.equal(f.combat.attack, null, `${label}: no attack in its place`);
    assert.equal(f.bufferedAttack, null, `${label}: nothing kept for later`);
  };
  // Alone (Practice Ground with no CPU).
  const alone = makeFighter();
  alone.step(ATTACK3);
  nothing(alone.fighter, 'alone');
  assert.equal(alone.fighter.combat.abilityCooldowns.active('attack3'), false);
  // In the air.
  const air = duel({ gap: 200 });
  air.tick(P('jump'));
  air.tick({ jump: true });
  air.tick(ATTACK3);
  nothing(air.attacker, 'in the air');
  assert.equal(air.attacker.combat.abilityCooldowns.active('attack3'), false);
  // Missing the startup pose, the cloud or the clone's attack art.
  for (const [label, sprites] of [
    ['no startup art', fakeSprites(Object.keys(def.animations).filter((k) => k !== 'attack3_summon'))],
    ['no cloud art', fakeSprites(undefined, undefined, [])],
    ['no attack1 art', fakeSprites(Object.keys(def.animations).filter((k) => k !== 'attack1'))],
  ]) {
    const d = duel({ attackerSprites: sprites });
    const warnings = captureWarnings(() => d.tick(ATTACK3));
    nothing(d.attacker, label);
    assert.equal(d.attacker.combat.abilityCooldowns.active('attack3'), false, label);
    assert.equal(warnings.length, 1, label);
    for (let i = 0; i < STARTUP_STEPS + 5; i++) d.tick();
    assert.deepEqual(d.clones, [], `${label}: never an invisible clone`);
  }
});

// ---- Without a startup ---------------------------------------------------------------

test('a summon with no startupAnimation keeps the immediate summon: its clone on the press step, its owner free at once', () => {
  assert.equal(SAMPLE_FIGHTER.summons.attack3.startupAnimation, undefined);
  for (const character of [SAMPLE_FIGHTER, { ...def, summons: { attack3: { ...def.summons.attack3, startupAnimation: null } } }]) {
    const d = duel({ attackerCharacter: character, attackerSprites: fakeSpritesOf(character) });
    d.tick(ATTACK3);
    assert.equal(d.clones.length, 1, `${character.id}: on the press step`);
    assert.equal(d.attacker.pendingSummon, null);
    assert.equal(d.attacker.state, 'idle');
    assert.equal(d.attacker.canAct(), true);
    assert.ok(d.attacker.combat.abilityCooldowns.active('attack3'));
    assert.equal(startupSteps(character, 'attack3'), 0);
  }
});

// ---- The CPU -----------------------------------------------------------------------

test('the combat AI presses Attack 3 directly and goes through the same startup: it counts it, and does nothing else meanwhile', () => {
  const f = new Fighter({ def, sprites: fakeSprites(), stage: STAGE, spawn: { x: 500 } });
  const clone = readMoveset(f).specials.find((c) => c.id === 'attack3');
  const cloud = def.effectAnimations.attack3_object;
  assert.ok(Math.abs(clone.lead - (0.4 + cloud.frames.length / cloud.fps + def.attacks.attack1.startup)) < 1e-9, 'its startup in its lead');
  let casts = 0;
  for (const seed of [3, 5]) {
    const { a, log } = cpuFight(def, def, { seconds: 40, seed, difficulty: 'brutal' });
    const steps0001 = log.get(a);
    for (const [i, s] of steps0001.entries()) {
      if (s.state !== 'summon') continue;
      if (steps0001[i - 1]?.state !== 'summon') {
        casts++;
        assert.ok(s.attack3Pressed, 'started by its own Attack 3 press');
        assert.equal(s.frame, POSES[0]);
      }
      assert.ok(/attack3_summon/.test(s.frame), s.frame);
      assert.equal(s.attack, null);
      assert.equal(s.shielding, false);
      assert.equal(s.grounded, true);
    }
  }
  assert.ok(casts >= 2, `it summons (${casts})`);
});
