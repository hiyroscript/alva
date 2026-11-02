// Run with node --test tests/systems/tunnel.test.mjs (no dependencies).
// A tunnel (`motion: { type: 'tunnel', distance, hide, at, show, hurtboxes
// }`, one of the attack motions in js/game/combat/attacks.js): a way under
// the floor. From `hide` the fighter is inside the floor: it passes through
// other fighters, no pull moves it, and all of it there is to hit is its
// `hurtboxes` (never none: it is never out of reach, there is no
// invulnerability). At `at` it moves at once along the ground it stands on,
// up to `distance` the way it faces (tunnelExit: never past that ground's
// end, never into a solid or the Void, under a wall standing on it), and at
// `show` it is out, its own hurtboxes back. Ground only. Checked through
// the schema, the real Fighter and the CombatSystem, and the CPU's
// prediction of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAttackDefinition, attackReach } from '../../js/game/combat/attacks.js';
import { cooldownClass } from '../../js/data/cooldowns.js';
import { tunnelExit, TUNNEL_STEP } from '../../js/game/fighters/movement.js';
import { pullToward } from '../../js/game/combat/pull.js';
import { StageCollision } from '../../js/game/physics.js';
import { def, duel, fakeSpritesOf, makeFighter, stageMap, steps } from '../helpers/fighter-harness.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const HATCH = [{ x: -22, y: -30, w: 44, h: 30 }];
const TUNNEL = { type: 'tunnel', distance: 240, hide: 0.1, at: 0.3, show: 0.4, hurtboxes: HATCH };
const ATTACK = {
  id: 'extra_attack', animation: 'attack1', startup: 0.4, active: 0.1, recovery: 0.1, hitbox: { x: -20, y: -40, w: 40, h: 40 },
  damage: 3, groundOnly: true, momentum: 0, motion: TUNNEL,
};

test('a tunnel is ground only, in, through and out in that order, and always has something to hit while it is in', () => {
  const atk = createAttackDefinition(ATTACK);
  assert.equal(atk.motion.type, 'tunnel');
  assert.deepEqual(atk.motion.hurtboxes, HATCH);
  assert.equal(atk.stepIn, 'exempt', 'a motion of its own: no Step-in');
  assert.equal(cooldownClass('attack', ATTACK), 'ordinary', 'a motion earns no cooldown');
  assert.throws(() => createAttackDefinition({ ...ATTACK, groundOnly: false }), /tunnels through the floor: it must be groundOnly/);
  assert.throws(() => createAttackDefinition({ ...ATTACK, motion: { ...TUNNEL, at: 0.05 } }), /0 <= hide <= at <= show/);
  assert.throws(() => createAttackDefinition({ ...ATTACK, motion: { ...TUNNEL, show: 0.9 } }), /comes out after the attack is over/);
  assert.throws(() => createAttackDefinition({ ...ATTACK, motion: { ...TUNNEL, hurtboxes: [] } }), /never nothing to hit/);
  assert.throws(() => createAttackDefinition({ ...ATTACK, motion: { ...TUNNEL, hurtboxes: undefined } }), /never nothing to hit/);
  assert.throws(() => createAttackDefinition({ ...ATTACK, motion: { ...TUNNEL, distance: 0 } }), /needs a positive distance/);
  // Its reach for the CPU: the strike wherever it may come out.
  assert.deepEqual(attackReach(atk), { x: -20, y: -40, w: 280, h: 40 });
});

test('where it comes out: up to its distance along the ground, never past where that ground ends, into a solid or into the Void', () => {
  const stage = new StageCollision(stageMap({
    left: 0, right: 2000, top: 800,
    platforms: [{ id: 'p', x: 300, y: 600, w: 200, h: 16 }],
    solids: [{ id: 'wall', x: 1200, y: 700, w: 40, h: 100 }],
  }));
  const body = (x, y = 800) => ({ x, y, halfW: 14, height: 44, grounded: true });
  assert.equal(tunnelExit(stage, body(500), 1, 240), 740, 'its whole distance');
  assert.equal(tunnelExit(stage, body(500), -1, 240), 260, 'the other way');
  assert.equal(tunnelExit(stage, body(1900), 1, 240), 2000, 'to the main floor\'s edge, never past it');
  assert.equal(tunnelExit(stage, body(400, 600), 1, 240), 500, 'along its platform to its end, never off it');
  assert.equal(TUNNEL_STEP, 4, 'searched four units at a time');
  assert.equal(tunnelExit(stage, body(1100), 1, 240), 1340, 'under the wall standing on the floor');
  assert.equal(tunnelExit(stage, body(1100), 1, 120), 1184, 'never inside the wall: short of it');
  assert.equal(tunnelExit(stage, { ...body(500), grounded: false }, 1, 240), 500, 'off the ground, nowhere');
  // The Void comes before the floor's end on a continuous ground.
  const closed = new StageCollision(stageMap({ left: 0, right: 2000, top: 800 }));
  closed.closeVoid(1, { sideEndGap: 0, bottomEndGap: 400 });
  const x = tunnelExit(closed, body(1950), 1, 240);
  assert.equal(closed.inVoid({ x, y: 800, height: 44 }), false, 'never into the Void');
});

// A test-only fighter (#0001's body and clips) whose extra attack is a
// tunnel.
const MOLE = {
  ...def,
  id: 'test-mole',
  attacks: { ...def.attacks, extra_attack: ATTACK },
  actions: { ...def.actions, extra_attack: 'extra_attack' },
  mashCombo: def.mashCombo,
};

test('inside the floor: only its hatch can be hit, it passes through fighters, no pull moves it; out again, all of it', () => {
  const { fighter, step } = makeFighter({ character: MOLE, sprites: fakeSpritesOf(MOLE) });
  step(P('extra_attack'));
  const seen = [];
  for (let i = 0; i < steps(0.6); i++) {
    step({});
    seen.push([fighter.combat.attack?.time ?? null, fighter.inFloor, fighter.body.x]);
  }
  const inside = seen.filter(([, inFloor]) => inFloor);
  assert.ok(inside.length > 0);
  assert.ok(inside.every(([t]) => t >= 0.1 - 1e-6 && t < 0.4), 'between its hide and its show');
  // While inside: the hatch, through fighters, held where it is against a pull.
  const { fighter: f2, step: s2 } = makeFighter({ character: MOLE, sprites: fakeSpritesOf(MOLE) });
  s2(P('extra_attack'));
  for (let i = 0; i < steps(0.15); i++) s2({});
  assert.equal(f2.inFloor, true);
  assert.deepEqual(f2.hurtboxes, HATCH);
  assert.equal(f2.passingThrough, true);
  assert.equal(pullToward(f2, f2.body.x + 100, f2.body.y - 20, { radius: 300, speed: 900 }, 1 / 60), false, 'no pull moves it');
  for (let i = 0; i < steps(0.3); i++) s2({});
  assert.equal(f2.inFloor, false);
  assert.deepEqual(f2.hurtboxes, def.hurtboxes, 'its own hurtboxes back');
  assert.equal(f2.passingThrough, false);
});

test('it moves along the floor once, all at once, at its `at`: nowhere in between, and on the ground there', () => {
  const { fighter, step } = makeFighter({ character: MOLE, sprites: fakeSpritesOf(MOLE), x: 500 });
  step(P('extra_attack'));
  const xs = [];
  for (let i = 0; i < steps(0.6); i++) xs.push(step({}).body.x);
  assert.deepEqual([...new Set(xs)], [500, 740]);
  assert.equal(xs.indexOf(740), steps(0.3) - 1, 'the step its time reaches its at');
  assert.equal(fighter.body.grounded, true);
  assert.equal(fighter.body.prevX, fighter.body.x, 'drawn nowhere in between');
});

test('a hit on the hatch flushes it out, a blow over the hatch meets nothing; its strike comes out where it does', () => {
  // A blow at #0001's Jab height passes over the hatch.
  const high = duel({ targetCharacter: MOLE, targetSprites: fakeSpritesOf(MOLE), gap: 40 });
  high.tick({}, P('extra_attack'));
  for (let i = 0; i < steps(0.12); i++) high.tick();
  high.tick(P('attack1'));
  for (let i = 0; i < 12; i++) high.tick();
  assert.deepEqual(high.events.filter((e) => e.target === high.target), [], 'over the hatch');
  // It comes out under an opponent 240 ahead and strikes there.
  const d = duel({ attackerCharacter: MOLE, attackerSprites: fakeSpritesOf(MOLE), gap: 240 });
  d.tick(P('extra_attack'));
  for (let i = 0; i < steps(0.6); i++) d.tick();
  assert.deepEqual(d.events.filter((e) => e.attacker === d.attacker).map((e) => [e.type, e.damage]), [['hit', 3]]);
});

test('the shared code names no fighter or move for it', () => {
  for (const file of ['js/game/fighters/movement.js', 'js/game/combat/attacks.js']) {
    const code = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /000\d|\bvent\b/i, file);
  }
});
