// Run with node --test tests/down.test.mjs (no dependencies).
// Down: a plain directional gameplay input (`down`), on S / ↓, D-pad down
// and the left stick held down (no mobile Down button). It does exactly
// two things, both in the air or as a hit lands: the fast fall, and
// steering a launch downward. On the ground it is nothing: no state, no
// pose, no lock on movement or the Dash, no faster Energy or cooldowns, and
// no change to what any button does. Menus keep their own Down. Uses the
// real Fighter, CombatSystem, physics and InputManager (see
// fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, ACTION_LABELS, COMBAT_BUTTONS, CONFIG } from '../js/config.js';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { CombatSystem } from '../js/game/combat.js';
import { HELD_CONTROLS, blankInput } from '../js/game/fighter-controller.js';
import {
  def, DT, SIM_CTX, makeFighter, frameName, stepUntil, steps, duel, startupSteps,
} from './fighter-harness.mjs';

const DOWN = { down: true };
const JUMP = { jump: true, jumpPressed: true };
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });

// Every step's position, speed, state and frame for `script(i)`, `count` steps.
function trace(script, count, opts) {
  const { step } = makeFighter(opts);
  const out = [];
  for (let i = 0; i < count; i++) {
    const f = step(script(i));
    out.push([f.body.x, f.body.y, f.body.vx, f.body.vy, f.state, frameName(f), f.facing]);
  }
  return out;
}

// ---- The input ----------------------------------------------------------------------

test('down is a gameplay direction on S / ↓, a held control and never a combat button; menu Down is untouched', () => {
  assert.deepEqual(ACTIONS.slice(0, 4), ['runLeft', 'runRight', 'down', 'jump']);
  assert.deepEqual(CONFIG.bindings.down, ['KeyS', 'ArrowDown']);
  assert.equal(ACTION_LABELS.down, 'Down');
  assert.ok(HELD_CONTROLS.includes('down'));
  assert.ok(!COMBAT_BUTTONS.includes('down') && !COMBAT_ACTIONS.includes('down'));
  const input = blankInput();
  assert.equal(input.down, false);
  assert.equal(input.downPressed, false);
  // The gameplay actions are exactly these: nothing else on the left hand.
  assert.deepEqual(ACTIONS, [
    'runLeft', 'runRight', 'down', 'jump', 'extra_attack', 'transform', 'shield',
    'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'pause',
  ]);
  assert.deepEqual(Object.keys(CONFIG.bindings).sort(), [...ACTIONS].sort(), 'one binding per action, nothing extra');
  assert.ok(!Object.values(CONFIG.bindings).flat().includes('KeyC'), 'no extra C key');
  assert.deepEqual(CONFIG.menuBindings.down, ['ArrowDown', 'KeyS']);
  assert.deepEqual(CONFIG.menuBindings.up, ['ArrowUp', 'KeyW']);
});

test('InputManager samples a held down from S, ↓, D-pad down and the left stick; menus still read their own Down', async () => {
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const { InputManager } = await import('../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const key = (type, code, repeat = false) => listeners[type]({ code, repeat, preventDefault() {} });

  const frame = input.sample();
  assert.ok('down' in frame && 'downPressed' in frame);
  assert.ok(!('dropPressed' in frame), 'no platform drop in the player sample');

  for (const code of ['KeyS', 'ArrowDown']) {
    key('keydown', code);
    let f = input.sample();
    assert.equal(f.down, true, code);
    assert.equal(f.downPressed, true);
    // Held across steps; auto-repeat changes nothing.
    for (let i = 0; i < 5; i++) {
      if (i === 2) key('keydown', code, true);
      f = input.sample();
      assert.equal(f.down, true);
      assert.equal(f.downPressed, false);
    }
    key('keyup', code);
    assert.equal(input.sample().down, false, `${code} released`);
  }

  // Both keys: releasing one keeps Down held.
  key('keydown', 'KeyS');
  key('keydown', 'ArrowDown');
  key('keyup', 'KeyS');
  assert.equal(input.sample().down, true);
  key('keyup', 'ArrowDown');
  assert.equal(input.sample().down, false);

  listeners.gamepadconnected();
  const menu = [];
  input.onPadMenu((cmd) => menu.push(cmd));
  pad.buttons[13] = { pressed: true, value: 1 }; // D-pad down
  input.pollGamepads(0);
  assert.equal(input.sample().down, true);
  assert.deepEqual(menu, ['down'], 'menus still read D-pad down as Down');
  pad.buttons[13] = { pressed: false, value: 0 };
  input.pollGamepads(1000);
  assert.equal(input.sample().down, false);

  pad.axes[1] = 0.9; // left stick down
  input.pollGamepads(2000);
  assert.equal(input.sample().down, true);
  assert.deepEqual(menu, ['down', 'down']);
  pad.axes[1] = 0;
  input.pollGamepads(3000);
  assert.equal(input.sample().down, false);

  // Every other pad mapping, the direct numbered attacks included, is its
  // own action and holds no Down.
  for (const [i, action] of [
    [0, 'jump'], [1, 'attack1'], [4, 'attack2'], [6, 'attack3'], [10, 'attack4'], [11, 'attack5'],
    [5, 'shield'], [7, 'shield'], [2, 'extra_attack'], [3, 'transform'],
  ]) {
    pad.buttons[i] = { pressed: true, value: 1 };
    input.pollGamepads(4000);
    const f = input.sample();
    assert.equal(f[action], true, `button ${i}`);
    assert.equal(f.down, false);
    pad.buttons[i] = { pressed: false, value: 0 };
    input.pollGamepads(4000);
  }
});

// ---- On the ground it is nothing ------------------------------------------------------

test('holding Down on the ground enters no state: the fighter stands in its idle, frame for frame as with nothing held', () => {
  const plain = trace(() => ({}), steps(2));
  const held = trace(() => DOWN, steps(2));
  assert.deepEqual(held, plain);
  assert.ok(held.every(([, , , , state]) => state === 'idle'));
  // Tapped, held, let go: never a pose of its own, on press or on release.
  const tapped = trace((i) => (i % 20 < 10 ? { down: true, downPressed: i % 20 === 0 } : {}), steps(2));
  assert.deepEqual(tapped, plain);
});

test('holding Down never stops or slows normal movement: running, turning and walking off a ledge are exactly as without it', () => {
  const script = (i) => (i < 40 ? { runRight: true } : i < 70 ? { runLeft: true } : {});
  assert.deepEqual(trace((i) => ({ ...script(i), down: true }), 100), trace(script, 100));
  // On the harness ledge (x 900 - 1100), walking right off its edge with
  // Down held walks off it exactly as ever (Down is no drop-through either);
  // once falling, Down is the fast fall.
  const off = (held) => trace(() => ({ runRight: true, ...held }), steps(1.5), { x: 1080, y: 600 });
  const onLedge = (log) => log.slice(0, log.findIndex(([, y]) => y !== 600) + 1);
  assert.deepEqual(onLedge(off(DOWN)), onLedge(off({})), 'the same walk to the edge, the same step off it');
  const landed = (log) => log.findIndex(([, y]) => y === 800);
  assert.ok(landed(off(DOWN)) < landed(off({})), 'then falling faster, to the floor sooner');
  // And standing on it with Down held, nothing drops through.
  const { fighter, step } = makeFighter({ x: 1000, y: 600 });
  for (let i = 0; i < steps(1); i++) step(i % 20 === 0 ? { down: true, downPressed: true } : DOWN);
  assert.equal(fighter.body.ground.id, 'ledge');
  assert.equal(fighter.body.y, 600);
  assert.equal(fighter.state, 'idle');
});

test('holding Down never prevents a Dash: a double tap with it held dashes exactly as without', () => {
  const dash = (held) => {
    const { fighter, step } = makeFighter();
    step({ runRight: true, runRightPressed: true, ...held });
    step(held);
    step({ runRight: true, runRightPressed: true, ...held });
    assert.ok(fighter.dash, 'dashing');
    const log = [];
    while (fighter.dash) log.push([step({ runRight: true, ...held }).body.x, fighter.state]);
    return [log, fighter.combat.energy];
  };
  assert.deepEqual(dash(DOWN), dash({}));
});

test('holding Down never refills Energy faster: one passive rate, whatever is held', () => {
  const refill = (held) => {
    const { fighter, step } = makeFighter();
    fighter.combat.setEnergy(20);
    const out = [];
    for (let i = 0; i < steps(2); i++) out.push(step(held).combat.energy);
    return out;
  };
  const plain = refill({});
  assert.deepEqual(refill(DOWN), plain);
  assert.ok(Math.abs(plain[steps(1) - 1] - (20 + def.energy.regen)) < 1e-6, 'regen per second, exactly');
});

test('holding Down never speeds up a cooldown: Attack 3 and Attack 4 recover in real time either way', () => {
  const recover = (held) => {
    const d = duel({ gap: 600 });
    d.tick(P('attack3'));
    d.until(() => d.attacker.combat.abilityCooldowns.active('attack3'), 1);
    const cd = d.attacker.combat.abilityCooldowns;
    const out = [];
    for (let i = 0; i < steps(1); i++) {
      d.tick(held);
      out.push(cd.remaining('attack3'));
    }
    return out;
  };
  const plain = recover({});
  assert.deepEqual(recover(DOWN), plain);
  assert.ok(Math.abs(plain.at(-1) - 4) < 1e-6, '1 s of cooldown per second');
});

test('Down with any button changes nothing about what that button does', () => {
  // What the press started, and the clones out once a summon's startup
  // (#0001's, from the same press) has run its course.
  const press = (button, held) => {
    const d = duel({ gap: 150 });
    for (let i = 0; i < 10; i++) d.tick(held);
    d.tick({ ...held, ...P(button) });
    const f = d.attacker;
    const started = [f.combat.attack?.def.id ?? null, f.technique?.def.id ?? null, f.combat.shielding, f.state];
    for (let i = 0; i < startupSteps(def, 'attack3'); i++) d.tick(held);
    return [...started, d.clones.length];
  };
  for (const button of [...COMBAT_BUTTONS, 'shield']) {
    assert.deepEqual(press(button, DOWN), press(button, {}), button);
  }
  // The direct numbered attacks need nothing held: attack3 summons (its
  // startup first, then the clone) and attack4 rushes either way.
  assert.deepEqual(press('attack3', {}), [null, null, false, 'summon', 1]);
  assert.deepEqual(press('attack4', {}).slice(0, 2), [null, 'attack4']);
  assert.equal(press('attack4', {}).at(-1), 0);
});

test('the fighter has no state or pose of Down\'s own: only its directional effects read it', () => {
  // Every state a fighter can be in, standing or not, with Down held all
  // the while: none is Down's.
  const states = new Set();
  const { step } = makeFighter();
  const script = [
    ...Array(10).fill(DOWN), { ...DOWN, ...JUMP }, ...Array(60).fill(DOWN),
    ...Array(10).fill({ ...DOWN, runRight: true }), { ...DOWN, shield: true, shieldPressed: true }, ...Array(10).fill({ ...DOWN, shield: true }),
    ...Array(30).fill(DOWN), { ...DOWN, ...P('attack1') }, ...Array(30).fill(DOWN),
  ];
  for (const held of script) states.add(step(held).state);
  assert.deepEqual([...states].sort(), ['attack', 'fall', 'idle', 'jump', 'land', 'run', 'shield', 'shieldRelease'].filter((s) => states.has(s)).sort());
  for (const state of states) {
    assert.ok(['idle', 'run', 'jump', 'fall', 'land', 'attack', 'shield', 'shieldRelease'].includes(state), state);
  }
  // No animation, fallback or stat of its own.
  assert.ok(Object.keys(def.animations).every((k) => !k.startsWith('down')));
  assert.deepEqual(Object.keys(def.animationFallbacks).sort(), ['fall', 'hurt', 'jump', 'land', 'midair_hurt']);
  assert.equal(def.stats, undefined, 'no stat block of a stance');
  assert.deepEqual(Object.keys(def.energy).sort(), ['dashCancelCost', 'dashCost', 'max', 'regen', 'shieldHitCost']);
});

// ---- In the air, and as a hit lands -----------------------------------------------------

test('Down held in the air while falling is the fast fall: faster to the ground, never while rising', () => {
  const fall = (held) => {
    const { fighter, step } = makeFighter();
    step(JUMP);
    let n = 1;
    let fast = false;
    let risingFast = false;
    while (!step(held).grounded) {
      n++;
      if (fighter.fastFalling) fast = true;
      if (fighter.fastFalling && fighter.body.vy <= 0) risingFast = true;
    }
    return { n, fast, risingFast };
  };
  const plain = fall({});
  const quick = fall(DOWN);
  assert.equal(plain.fast, false);
  assert.equal(quick.fast, true, 'it fast-falls');
  assert.equal(quick.risingFast, false, 'never on the way up');
  assert.ok(quick.n < plain.n, `down in ${quick.n} steps, not ${plain.n}`);
  // Held from the jump, it becomes nothing on landing: the fighter stands.
  const { fighter, step } = makeFighter();
  step({ ...JUMP, ...DOWN });
  stepUntil(step, (f) => f.grounded, DOWN);
  for (let i = 0; i < 20; i++) step(DOWN);
  assert.equal(fighter.state, 'idle');
});

test('Down held as a hit lands in the air bends the launch downward; on the ground it bends nothing into the floor', () => {
  const launch = (held, airborne) => {
    const d = duel({ gap: 44 });
    if (airborne) {
      d.tick({}, JUMP);
      for (let i = 0; i < 4; i++) d.tick({}, { jump: true });
    }
    d.tick({}, held);
    assert.equal(d.target.grounded, !airborne);
    d.target.combat.launchPoint = 100;
    return new CombatSystem().applyHit(d.attacker, d.target, d.attacker.attacks.attack1).finalLaunch;
  };
  const plain = launch({}, true);
  const down = launch(DOWN, true);
  assert.equal(plain.y, 0, 'sideways with nothing held');
  assert.ok(down.y > 0, 'bent downward (world y grows down)');
  assert.ok(Math.abs(Math.hypot(down.x, down.y) - Math.hypot(plain.x, plain.y)) < 1e-6, 'its strength untouched');
  const angle = (Math.atan2(down.y, Math.abs(down.x)) * 180) / Math.PI;
  assert.ok(Math.abs(angle - def.launchReaction.steerAngle) < 1e-6, `by the steer angle (${angle})`);
  // Standing, the floor is in the way.
  assert.deepEqual({ ...launch(DOWN, false) }, { ...launch({}, false) });
});

// ---- Controllers ----------------------------------------------------------------------

test('the training CPU never holds Down or presses a combat button, and still drops through platforms to follow', async () => {
  const { TrainingAIController } = await import('../js/game/fighter-controller.js');
  const cpu = new TrainingAIController({ rng: () => 0.3 });
  const player = makeFighter({ x: 700 });
  const bot = makeFighter({ x: 900, facing: -1 });
  player.fighter.opponent = bot.fighter;
  bot.fighter.opponent = player.fighter;
  for (let i = 0; i < 1200; i++) {
    player.step(i % 300 < 150 ? { runRight: true } : { runLeft: true, ...(i % 97 === 0 ? DOWN : {}) });
    const out = cpu.getInput(bot.fighter, DT, SIM_CTX);
    assert.equal(out.down, false);
    assert.equal(out.downPressed, false);
    for (const button of COMBAT_BUTTONS) assert.equal(out[`${button}Pressed`], false, button);
    bot.step(out);
    assert.equal(bot.fighter.combat.attack, null);
  }

  // On the ledge with the player below: the CPU drops down, as before.
  const high = makeFighter({ x: 1000, y: 600, facing: -1 });
  const low = makeFighter({ x: 1000 });
  high.fighter.opponent = low.fighter;
  low.fighter.opponent = high.fighter;
  const follower = new TrainingAIController({ rng: () => 0.3 });
  const states = new Set();
  for (let i = 0; i < steps(3) && high.fighter.body.ground?.id !== '__floor'; i++) {
    low.step();
    high.step(follower.getInput(high.fighter, DT, SIM_CTX));
    states.add(high.fighter.state);
  }
  assert.equal(high.fighter.body.ground?.id, '__floor', 'dropped through the ledge');
  assert.ok(states.has('fall'));
});
