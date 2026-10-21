// Run with node --test tests/systems/drop-through.test.mjs (no dependencies).
// The player's platform drop: a fresh Down press (S / ↓, the left stick
// pushed down, the touch Down button) while standing on a one-way platform
// that lets fighters drop drops the fighter through it (Fighter.update,
// dropThrough in js/game/physics.js). Covered: every playable fighter, held
// Down never dropping (a fast fall into a landing stands), the main floor
// and a platform that forbids it, the states that rule it out (an attack, a
// stun, a paralysis, the Shield, a Dash), a jump pressed with it, the drop's
// window, a moving cloud, every device on the real InputManager, and the
// CPU never pressing Down on the ground. Runs the real Fighter and physics
// (see tests/helpers/fighter-harness.mjs).
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
  test(`#${c.id}: a fresh Down press on a one-way platform drops through it, all the way to the floor below`, () => {
    const { fighter, step } = harnessFor(c).makeFighter({ x: 1000, y: LEDGE_Y });
    step({});
    step(DROP);
    assert.equal(fighter.grounded, false, 'through the platform');
    assert.equal(fighter.body.dropId, 'ledge');
    let n = 0;
    while (!fighter.grounded && n++ < 120) {
      step(HELD);
      assert.ok(fighter.body.y > LEDGE_Y - 1e-9, 'never caught by it on the way');
    }
    assert.equal(fighter.body.ground, STAGE.floor, 'landed on the floor');
    assert.equal(fighter.body.y, FLOOR_Y);
  });
}

test('held Down never drops: standing, walking onto a platform or fast-falling into a landing on it, it stands', () => {
  // Standing with Down held from before.
  const stand = onLedge();
  for (let i = 0; i < 60; i++) stand.step(HELD);
  assert.equal(stand.fighter.body.ground?.id, 'ledge');
  // Jumping up off it, then fast-falling back onto it, Down held all the
  // way down and on after.
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
  for (let i = 0; i < 30; i++) fall.step(HELD);
  assert.equal(fall.fighter.body.ground?.id, 'ledge', 'and stays on it');
  // Let go and press again: now it drops.
  fall.step({});
  fall.step(DROP);
  assert.equal(fall.fighter.grounded, false);
});

test('the main floor and a platform that forbids it never drop; nor does a solid', () => {
  const floor = makeFighter({ x: 500 });
  floor.step({});
  floor.step(DROP);
  assert.equal(floor.fighter.body.ground, STAGE.floor, 'the main floor');
  assert.equal(floor.fighter.body.y, FLOOR_Y);
  const stage = new StageCollision(stageMap({
    platforms: [{ id: 'deck', x: 900, y: 600, w: 200, h: 16, dropThrough: false }],
    solids: [{ id: 'block', x: 300, y: 700, w: 120, h: 100 }],
  }));
  const deck = makeFighter({ stage, x: 1000, y: 600 });
  deck.step({});
  deck.step(DROP);
  assert.equal(deck.fighter.body.ground?.id, 'deck', 'a platform that forbids it (Sol-Noir\'s water-tower deck)');
  const block = makeFighter({ stage, x: 360, y: 700 });
  block.step({});
  assert.equal(block.fighter.body.ground?.id, 'block');
  block.step(DROP);
  assert.equal(block.fighter.body.ground?.id, 'block', 'a solid');
  assert.equal(getMap('city').platforms.find((p) => p.id === 'tower-deck').dropThrough, false);
});

test('never out of an attack, a stun, a paralysis, the Shield or a Dash; a jump pressed with it jumps', () => {
  const stays = (why, setup) => {
    const h = onLedge();
    setup(h);
    h.step({ ...DROP, ...(h.extra ?? {}) });
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
  // Jump with it: the jump, from the platform.
  const jump = onLedge();
  jump.step({ ...DROP, ...P('jump') });
  assert.equal(jump.fighter.grounded, false);
  assert.ok(jump.fighter.body.vy < 0, 'rising: the jump');
  for (let i = 0; i < 4; i++) jump.step({ jump: true });
  assert.ok(jump.fighter.body.y < LEDGE_Y, 'above the platform it stood on');
  // Free again (the attack over), a fresh press drops.
  const after = onLedge();
  after.step(P('attack1'));
  while (after.fighter.combat.attack) after.step({});
  after.step(DROP);
  assert.equal(after.fighter.grounded, false, 'once free, it drops');
});

test('the drop ignores that platform for dropThroughTime, then lands on it again from above', () => {
  const { fighter, step } = onLedge();
  step(DROP);
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
  assert.equal(fighter.grounded, false, 'dropped through');
  for (let i = 0; i < 60 && !fighter.grounded; i++) tick(HELD);
  assert.notEqual(fighter.body.ground, p, 'never back on it on the way down');
  assert.ok(p.x > c.from.x, 'the cloud moved on');
});

test('every device drops: S and ↓, the left stick pushed down and the touch Down button, each one press', async () => {
  const { controllerRig } = await import('../helpers/fake-gamepad.mjs');
  const devices = {
    S: (rig) => rig.listeners.keydown[0]({ code: 'KeyS', repeat: false, preventDefault() {} }),
    '↓': (rig) => rig.listeners.keydown[0]({ code: 'ArrowDown', repeat: false, preventDefault() {} }),
    'left stick down': (rig) => rig.stick(0, 0.9),
    'touch Down': (rig) => rig.input.setTouch('down', true),
  };
  const c = playableCharacters()[0];
  for (const [name, press] of Object.entries(devices)) {
    const rig = await controllerRig();
    const fighter = new Fighter({
      def: c, sprites: fakeSpritesOf(c), stage: STAGE, slot: 0, label: 'P1',
      controller: new PlayerController(rig.input), spawn: { x: 1000, y: LEDGE_Y, facing: 1 },
    });
    for (let i = 0; i < 3; i++) fighter.update(DT, SIM_CTX);
    assert.equal(fighter.body.ground?.id, 'ledge', name);
    press(rig);
    fighter.update(DT, SIM_CTX);
    assert.equal(fighter.grounded, false, `${name}: dropped`);
  }
  assert.deepEqual(CONFIG.bindings.down, ['KeyS', 'ArrowDown']);
});

test('the CPU never presses Down on the ground (it walks off a platform), and still fast-falls in the air', () => {
  const ex = new Executor();
  const self = (grounded) => ({
    body: { grounded, vx: 0, vy: 200, wall: 0, x: 1000, y: LEDGE_Y, halfW: 15 },
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
});
