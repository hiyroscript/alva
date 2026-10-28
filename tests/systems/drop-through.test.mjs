// Run with node --test tests/systems/drop-through.test.mjs (no dependencies).
// The player's platform drop: a tap of Down (S / ↓, the left stick pushed
// down, the touch Down button: pressed and let go within dropTapTime, no
// Jump pressed meanwhile) while standing on a one-way platform that lets
// fighters drop drops the fighter through it as Down is let go
// (Fighter.update, dropThrough in js/game/physics.js). Down held on stands
// ready for the Super Jump, and Down with Jump is the Super Jump, never a
// drop. Covered: every playable fighter, held Down never dropping (a fast
// fall into a landing stands, a long hold stands), the Super Jump from a
// one-way platform and a moving one, the main floor and a platform that
// forbids it, the states that rule it out (an attack, a stun, a paralysis,
// the Shield, a Dash) and the ones that end a tap (a hit, an attack, the
// platform left), the drop's window, a moving cloud, every device on the
// real InputManager, and the CPU holding Down on the ground only with its
// Super Jump's press. Runs the real Fighter and physics (see
// tests/helpers/fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { playableCharacters } from '../../js/data/characters.js';
import { getMap } from '../../js/data/maps.js';
import { StageCollision } from '../../js/game/physics.js';
import { PlatformHazards } from '../../js/game/platform-hazards.js';
import { HAZARD_STATES } from '../../js/data/platform-hazards.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { PlayerController } from '../../js/game/fighters/fighter-controller.js';
import { Executor } from '../../js/game/ai/cpu-intelligence/executor.js';
import { CONFIG } from '../../js/config.js';
import {
  DT, MOVEMENT, STAGE, SIM_CTX, fakeSpritesOf, harnessFor, makeFighter, stageMap, steps,
} from '../helpers/fighter-harness.mjs';

const DROP = { down: true, downPressed: true };
const HELD = { down: true };
// A tap of Down: pressed, then let go on the next step (the drop).
function tap(step, held = {}) {
  step({ ...DROP, ...held });
  return step(held);
}
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
// The harness ledge: a one-way platform, x 900 to 1100, its top at 600, the
// floor's at 800.
const LEDGE_Y = 600;
const FLOOR_Y = 800;

// A fighter standing on the harness ledge.
function onLedge(opts = {}) {
  const h = makeFighter({ x: 1000, y: LEDGE_Y, ...opts });
  h.step({});
  assert.equal(h.fighter.body.ground?.id, 'ledge');
  return h;
}

for (const c of playableCharacters()) {
  test(`#${c.id}: a tap of Down on a one-way platform drops through it as it is let go, all the way to the floor below`, () => {
    const { fighter, step } = harnessFor(c).makeFighter({ x: 1000, y: LEDGE_Y });
    step({});
    step(DROP);
    assert.equal(fighter.body.ground?.id, 'ledge', 'pressed: still standing');
    step({});
    assert.equal(fighter.grounded, false, 'let go: through the platform');
    assert.equal(fighter.body.dropId, 'ledge');
    let n = 0;
    while (!fighter.grounded && n++ < 120) {
      step(HELD);
      assert.ok(fighter.body.y > LEDGE_Y - 1e-9, 'never caught by it on the way');
    }
    assert.equal(fighter.body.ground, STAGE.floor, 'landed on the floor');
    assert.equal(fighter.body.y, FLOOR_Y);
  });

  test(`#${c.id}: Down held on a one-way platform, then Jump, is the Super Jump from it, never a drop`, () => {
    const { fighter, step } = harnessFor(c).makeFighter({ x: 1000, y: LEDGE_Y });
    step({});
    step(DROP);
    for (let i = 0; i < 20; i++) step(HELD);
    assert.equal(fighter.body.ground?.id, 'ledge', 'held: standing ready');
    step({ ...HELD, jump: true, jumpPressed: true });
    assert.ok(fighter.body.vy < -MOVEMENT.jumpVelocity, 'the Super Jump');
    let top = fighter.body.y;
    for (let i = 0; i < 40 && fighter.body.vy < 0; i++) top = Math.min(top, step({}).body.y);
    assert.ok(LEDGE_Y - top > 200, `high above the platform: ${(LEDGE_Y - top).toFixed(0)}`);
  });
}

test('held Down never drops: standing, held past the tap, or fast-falling into a landing on it, it stands', () => {
  // Pressed and held past the tap's window, then let go: it stands.
  const stand = onLedge();
  stand.step(DROP);
  for (let i = 0; i < steps(MOVEMENT.dropTapTime) + 2; i++) stand.step(HELD);
  stand.step({});
  for (let i = 0; i < 30; i++) stand.step({});
  assert.equal(stand.fighter.body.ground?.id, 'ledge', 'held past the tap');
  // Just inside the window, it drops.
  const quick = onLedge();
  quick.step(DROP);
  for (let i = 0; i < steps(MOVEMENT.dropTapTime) - 1; i++) quick.step(HELD);
  quick.step({});
  assert.equal(quick.fighter.grounded, false, 'let go inside the window');
  // Jumping up off it, then fast-falling back onto it, Down held all the
  // way down and on after, then let go.
  const fall = onLedge();
  fall.step(P('jump'));
  for (let i = 0; i < 120 && fall.fighter.body.vy < 0; i++) fall.step({});
  fall.step(DROP);
  let fast = false;
  for (let i = 0; i < 120 && !fall.fighter.grounded; i++) {
    const f = fall.step(HELD);
    fast ||= f.fastFalling;
  }
  assert.ok(fast, 'a fast fall');
  assert.equal(fall.fighter.body.ground?.id, 'ledge', 'landed on it');
  for (let i = 0; i < 3; i++) fall.step(HELD);
  fall.step({});
  for (let i = 0; i < 30; i++) fall.step({});
  assert.equal(fall.fighter.body.ground?.id, 'ledge', 'and stays on it, Down let go');
  // A fresh tap: now it drops.
  tap(fall.step);
  assert.equal(fall.fighter.grounded, false);
});

test('the main floor and a platform that forbids it never drop; nor does a solid', () => {
  const floor = makeFighter({ x: 500 });
  floor.step({});
  tap(floor.step);
  assert.equal(floor.fighter.body.ground, STAGE.floor, 'the main floor');
  assert.equal(floor.fighter.body.y, FLOOR_Y);
  const stage = new StageCollision(stageMap({
    platforms: [{ id: 'deck', x: 900, y: 600, w: 200, h: 16, dropThrough: false }],
    solids: [{ id: 'block', x: 300, y: 700, w: 120, h: 100 }],
  }));
  const deck = makeFighter({ stage, x: 1000, y: 600 });
  deck.step({});
  tap(deck.step);
  assert.equal(deck.fighter.body.ground?.id, 'deck', 'a platform that forbids it (Sol-Noir\'s water-tower deck)');
  const block = makeFighter({ stage, x: 360, y: 700 });
  block.step({});
  assert.equal(block.fighter.body.ground?.id, 'block');
  tap(block.step);
  assert.equal(block.fighter.body.ground?.id, 'block', 'a solid');
  assert.equal(getMap('city').platforms.find((p) => p.id === 'tower-deck').dropThrough, false);
});

test('never out of an attack, a stun, a paralysis, the Shield or a Dash; Jump pressed with it is the Super Jump', () => {
  const stays = (why, setup) => {
    const h = onLedge();
    setup(h);
    h.step({ ...DROP, ...(h.extra ?? {}) });
    h.step({ ...(h.extra ?? {}) });
    assert.equal(h.fighter.body.ground?.id, 'ledge', why);
  };
  stays('in an attack', (h) => h.step(P('attack1')));
  stays('stunned', (h) => { h.fighter.combat.stun = 0.4; });
  stays('paralyzed', (h) => { h.fighter.combat.paralyze(0.5); });
  stays('behind the Shield', (h) => {
    h.step(P('shield'));
    h.extra = { shield: true };
  });
  stays('dashing', (h) => h.step({ runRight: true, mouvementRightPressed: true }));
  // Jump with it: the Super Jump, from the platform.
  const jump = onLedge();
  jump.step({ ...DROP, ...P('jump') });
  assert.equal(jump.fighter.grounded, false);
  assert.ok(jump.fighter.body.vy < -MOVEMENT.jumpVelocity, 'rising: the Super Jump');
  for (let i = 0; i < 4; i++) jump.step({ jump: true });
  assert.ok(jump.fighter.body.y < LEDGE_Y, 'above the platform it stood on');
  // Free again (the attack over), a fresh tap drops.
  const after = onLedge();
  after.step(P('attack1'));
  while (after.fighter.combat.attack) after.step({});
  tap(after.step);
  assert.equal(after.fighter.grounded, false, 'once free, it drops');
});

test('a tap that is interrupted never drops later: a hit, an attack, a jump or leaving the platform ends it', () => {
  const ends = (why, between) => {
    const h = onLedge();
    h.step(DROP);
    between(h);
    h.step({});
    for (let i = 0; i < 40; i++) h.step({});
    assert.notEqual(h.fighter.body.dropId, 'ledge', `${why}: no drop`);
  };
  ends('a hit', (h) => h.fighter.takeHit({ launchSpeed: 0 }));
  ends('an attack', (h) => h.step({ ...HELD, ...P('attack1') }));
  ends('a Shield', (h) => h.step({ ...HELD, ...P('shield') }));
  ends('a jump', (h) => h.step({ ...HELD, ...P('jump') }));
  // Walked off onto the floor below: letting go there drops nothing.
  const off = onLedge();
  off.step(DROP);
  let n = 0;
  while (off.fighter.body.ground?.id === 'ledge' && n++ < 120) off.step({ ...HELD, runRight: true });
  while (!off.fighter.grounded && n++ < 240) off.step({ ...HELD, runRight: true });
  assert.equal(off.fighter.body.ground, STAGE.floor);
  off.step({});
  assert.equal(off.fighter.body.ground, STAGE.floor, 'still on the floor');
  assert.equal(off.fighter.dropTap, null);
});

test('the drop ignores that platform for dropThroughTime, then lands on it again from above', () => {
  const { fighter, step } = onLedge();
  tap(step);
  assert.equal(fighter.body.dropId, 'ledge');
  for (let i = 0; i < steps(MOVEMENT.dropThroughTime) + 1; i++) step({});
  assert.equal(fighter.body.dropId, null, 'the platform is solid from above again');
  // Back up through it (one-way from below) and onto it.
  const back = makeFighter({ x: 1000 });
  back.step(P('jump'));
  let landed = false;
  for (let i = 0; i < 120 && !landed; i++) {
    back.step({ jump: true, ...(i === 18 ? { jumpPressed: true } : {}) });
    landed = back.fighter.body.ground?.id === 'ledge';
  }
  assert.ok(landed, 'landed on it again');
});

test('a moving cloud drops a fighter through it too, while it moves; the cloud carries on', () => {
  const stage = new StageCollision(getMap('asperitas'));
  const hazards = new PlatformHazards(stage, { seed: 1 });
  const c = hazards.controllers[0];
  const p = c.platform;
  // Drifting across.
  c.state = HAZARD_STATES.horizontal;
  c.from = { x: p.x, y: p.y };
  c.to = { x: p.x + 100, y: p.y };
  c.time = 0;
  c.duration = 2;
  const { fighter, step } = makeFighter({ stage, x: p.x + p.w / 2, y: p.y - 0.5 });
  const tick = (held = {}) => {
    hazards.update(DT, [fighter]);
    return step(held);
  };
  for (let i = 0; i < 10; i++) tick();
  assert.equal(fighter.body.ground, p, 'riding it');
  tick(DROP);
  assert.equal(fighter.body.ground, p, 'pressed: still riding it');
  tick();
  assert.equal(fighter.grounded, false, 'dropped through');
  for (let i = 0; i < 60 && !fighter.grounded; i++) tick(HELD);
  assert.notEqual(fighter.body.ground, p, 'never back on it on the way down');
  assert.ok(p.x > c.from.x, 'the cloud moved on');
});

test('every device drops: S and ↓, the left stick pushed down and the touch Down button, each one tap', async () => {
  const { controllerRig } = await import('../helpers/fake-gamepad.mjs');
  const key = (type, code) => (rig) => rig.listeners[type][0]({ code, repeat: false, preventDefault() {} });
  const devices = {
    S: [key('keydown', 'KeyS'), key('keyup', 'KeyS')],
    '↓': [key('keydown', 'ArrowDown'), key('keyup', 'ArrowDown')],
    'left stick down': [(rig) => rig.stick(0, 0.9), (rig) => rig.stick(0, 0)],
    'touch Down': [(rig) => rig.input.setTouch('down', true), (rig) => rig.input.setTouch('down', false)],
  };
  const c = playableCharacters()[0];
  for (const name of Object.keys(devices)) {
    const rig = await controllerRig();
    const fighter = new Fighter({
      def: c, sprites: fakeSpritesOf(c), stage: STAGE, slot: 0, label: 'P1',
      controller: new PlayerController(rig.input), spawn: { x: 1000, y: LEDGE_Y, facing: 1 },
    });
    for (let i = 0; i < 3; i++) fighter.update(DT, SIM_CTX);
    assert.equal(fighter.body.ground?.id, 'ledge', name);
    const [press, release] = devices[name];
    press(rig);
    fighter.update(DT, SIM_CTX);
    assert.equal(fighter.body.ground?.id, 'ledge', `${name}: pressed, still standing`);
    release(rig);
    fighter.update(DT, SIM_CTX);
    assert.equal(fighter.grounded, false, `${name}: dropped`);
  }
  assert.deepEqual(CONFIG.bindings.down, ['KeyS', 'ArrowDown']);
});

test('every device makes the Super Jump off a platform: the keyboard\'s pairs, the left stick down with Cross / A, two fingers on touch', async () => {
  const { controllerRig } = await import('../helpers/fake-gamepad.mjs');
  const key = (code, type = 'keydown') => (rig) => rig.listeners[type][0]({ code, repeat: false, preventDefault() {} });
  // Each: Down first (held a while), then Jump; or both on one sample.
  const devices = {
    'S, then Space': [key('KeyS'), key('Space')],
    'S, then W': [key('KeyS'), key('KeyW')],
    'S, then ↑': [key('KeyS'), key('ArrowUp')],
    '↓, then Space': [key('ArrowDown'), key('Space')],
    'left stick down, then Cross / A': [(rig) => rig.stick(0, 0.9), (rig) => rig.press('south')],
    'touch Down held, then touch Jump': [(rig) => rig.input.setTouch('down', true), (rig) => rig.input.setTouch('jump', true)],
  };
  const c = playableCharacters()[0];
  for (const together of [false, true]) {
    for (const [name, [down, jump]] of Object.entries(devices)) {
      const rig = await controllerRig();
      const fighter = new Fighter({
        def: c, sprites: fakeSpritesOf(c), stage: STAGE, slot: 0, label: 'P1',
        controller: new PlayerController(rig.input), spawn: { x: 1000, y: LEDGE_Y, facing: 1 },
      });
      for (let i = 0; i < 3; i++) fighter.update(DT, SIM_CTX);
      down(rig);
      if (!together) for (let i = 0; i < 20; i++) fighter.update(DT, SIM_CTX);
      assert.equal(fighter.body.ground?.id, 'ledge', `${name}: Down held, standing`);
      jump(rig);
      fighter.update(DT, SIM_CTX);
      const label = `${name}${together ? ' (one sample)' : ''}`;
      assert.ok(fighter.body.vy < -MOVEMENT.jumpVelocity, `${label}: the Super Jump`);
      assert.ok(fighter.superJumpTakeoff, `${label}: its takeoff`);
      assert.notEqual(fighter.body.dropId, 'ledge', `${label}: never a drop`);
    }
  }
});

test('the CPU holds Down on the ground only on its Super Jump\'s press step (it walks off a platform), and still fast-falls in the air', () => {
  const ex = new Executor();
  const self = (grounded) => ({
    body: { grounded, vx: 0, vy: 200, wall: 0, x: 1000, y: LEDGE_Y, halfW: 15, height: 80 },
    movement: MOVEMENT, canAct: () => true, dashDuration: MOVEMENT.dashDuration, combat: { attack: null },
  });
  for (let i = 0; i < 4; i++) {
    ex.begin(i * DT);
    if (i !== 1) ex.fastFall();
    const out = ex.finish(self(true), STAGE);
    assert.equal(out.down, false, `step ${i}: no Down on the ground`);
    assert.equal(out.downPressed, false);
  }
  ex.begin(1);
  ex.fastFall();
  const air = ex.finish(self(false), STAGE);
  assert.equal(air.down, true, 'the fast fall in the air');
  assert.equal(air.downPressed, true);
  // The Super Jump: Down and Jump pressed together on one step, Down let go
  // on the next while Jump is still held a moment.
  const sup = new Executor();
  sup.begin(0);
  assert.equal(sup.jump(self(true), 'super'), true);
  const press = sup.finish(self(true), STAGE);
  assert.deepEqual([press.down, press.downPressed, press.jump, press.jumpPressed], [true, true, true, true], 'the chord');
  sup.begin(DT);
  const next = sup.finish(self(true), STAGE);
  assert.deepEqual([next.down, next.jump, next.jumpPressed], [false, true, false], 'Down let go, Jump held a moment');
  // A normal jump never holds Down.
  const plain = new Executor();
  plain.begin(0);
  plain.jump(self(true), 'normal');
  assert.equal(plain.finish(self(true), STAGE).down, false);
  // On a real platform the CPU's Super Jump goes up, never through it.
  const { fighter, step } = onLedge();
  const cpu = new Executor();
  for (let i = 0; i < 6; i++) {
    cpu.begin(i * DT);
    if (i === 0) cpu.jump(fighter, 'super');
    step({ ...cpu.finish(fighter, STAGE) });
  }
  assert.ok(fighter.body.y < LEDGE_Y - 60, 'rising above the platform');
  assert.notEqual(fighter.body.dropId, 'ledge', 'never dropped');
});
