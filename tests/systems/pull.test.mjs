// Run with node --test tests/systems/pull.test.mjs (no dependencies).
// Pulls (js/game/combat/pull.js): an attack's or a projectile's `pull`
// draws the opponents within its radius toward its point, straight there
// and never past it, dragging a grounded fighter along the ground (lifting
// it only toward a point above its head) and an airborne one along both
// axes. A raised Shield, a paralysed fighter, the owner and a fighter out
// of play are never drawn. One rule for attacks (only while active) and
// projectiles (while they fly). A pull never shoves its owner: a fighter it
// drew in, still carried toward it, stops against its body. Bespoke pulls
// on the real Fighter and projectiles (see
// tests/helpers/fighter-harness.mjs); #0001 is only the body they act on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPulls, pullToward } from '../../js/game/combat/pull.js';
import { attackReach, createAttackDefinition, resolvePull } from '../../js/game/combat/attacks.js';
import { createProjectileDefinition, Projectile } from '../../js/game/combat/projectile.js';
import { def, DT, duel, fakeSpritesOf, makeFighter, steps, stageMap } from '../helpers/fighter-harness.mjs';
import { StageCollision } from '../../js/game/physics.js';
import { separateFighters } from '../../js/game/fighters/fighter.js';

const PULL = Object.freeze({ radius: 200, speed: 600, offset: { x: 0, y: 0 } });
const middle = (f) => f.body.y - f.body.height / 2;

// A grounded fighter at `x`, facing left.
const standing = (x = 600) => makeFighter({ x, facing: -1 });

// ---- Data ---------------------------------------------------------------------------

test('a pull needs a positive radius and speed; its point defaults to the origin, and it reaches both sides unless it says front', () => {
  assert.equal(resolvePull(null, 'x'), null);
  assert.deepEqual(resolvePull({ radius: 100, speed: 300 }, 'x'), { radius: 100, speed: 300, front: false, offset: { x: 0, y: 0 } });
  assert.equal(resolvePull({ radius: 100, speed: 300, front: true }, 'x').front, true);
  assert.throws(() => resolvePull({ radius: 100, speed: 300, front: 'yes' }, 'x'), /front must be true or false/);
  assert.ok(Object.isFrozen(resolvePull({ radius: 1, speed: 1, offset: { x: 3 } }, 'x').offset));
  assert.throws(() => resolvePull({ radius: 0, speed: 300 }, 'Attack "a"'), /Attack "a"'s pull needs a positive radius and speed/);
  assert.throws(() => resolvePull({ radius: 100 }, 'x'), /positive radius and speed/);
  assert.throws(() => createAttackDefinition({ id: 'testPull', damage: 1, hitbox: { x: 0, y: 0, w: 1, h: 1 }, pull: { radius: -1, speed: 1 } }), /pull/);
  assert.throws(() => createProjectileDefinition({ id: 'testOrb', damage: 1, pull: { speed: 5 } }), /pull/);
  assert.equal(createProjectileDefinition({ id: 'testOrb', damage: 1 }).pull, null);
});

test('the CPU reads an attack\'s reach as its box widened to the pull\'s circle', () => {
  const atk = createAttackDefinition({
    id: 'testPull', damage: 1, hitbox: { x: 10, y: -60, w: 30, h: 30 }, pull: { radius: 100, speed: 500, offset: { x: 40, y: -50 } },
  });
  assert.deepEqual(attackReach(atk), { x: -60, y: -150, w: 200, h: 200 });
  const plain = createAttackDefinition({ id: 'testPlain', damage: 1, hitbox: { x: 10, y: -60, w: 30, h: 30 } });
  assert.deepEqual(attackReach(plain), plain.hitbox);
});

test('nothing in the pull rule names a fighter or a move', () => {
  const code = readFileSync(new URL('../../js/game/combat/pull.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /000\d|attack\d|extra_attack|midair/);
});

// ---- One step of a pull ---------------------------------------------------------------

test('a grounded fighter within the radius is dragged along the ground toward the point, at the pull\'s speed', () => {
  const { fighter } = standing(600);
  const y = middle(fighter);
  assert.equal(pullToward(fighter, 450, y, PULL, DT), true);
  assert.equal(fighter.body.vx, -600);
  assert.equal(fighter.body.vy, 0, 'not lifted');
  assert.equal(fighter.body.grounded, true);
  // Outside the radius: untouched.
  const far = standing(900).fighter;
  assert.equal(pullToward(far, 450, y, PULL, DT), false);
  assert.equal(far.body.vx, 0);
});

test('never past the point: closer than a step\'s travel, it arrives exactly', () => {
  const { fighter } = standing(600);
  pullToward(fighter, 595, middle(fighter), PULL, DT);
  assert.ok(Math.abs(fighter.body.vx * DT + 5) < 1e-9, 'exactly the 5 units left');
  const on = standing(600).fighter;
  on.body.vx = 120;
  assert.equal(pullToward(on, 600, middle(on), PULL, DT), true);
  assert.equal(on.body.vx, 0, 'on the point it stops');
});

test('a point above its head lifts a grounded fighter off the ground; an airborne one is drawn along both axes', () => {
  const { fighter } = standing(600);
  const head = fighter.body.y - fighter.body.height;
  pullToward(fighter, 600, head - 60, PULL, DT);
  assert.ok(fighter.body.vy < 0, 'lifted');
  assert.equal(fighter.body.grounded, false);
  const air = standing(600).fighter;
  Object.assign(air.body, { y: 600, grounded: false, ground: null });
  pullToward(air, 500, middle(air) + 100, PULL, DT);
  assert.ok(Math.abs(air.body.vx - (-600 * Math.SQRT1_2)) < 1e-9);
  assert.ok(Math.abs(air.body.vy - 600 * Math.SQRT1_2) < 1e-9);
});

test('a raised Shield holds its ground, and so does a paralysed fighter or one out of play', () => {
  const shield = standing(600);
  shield.step({ shield: true, shieldPressed: true });
  assert.equal(shield.fighter.combat.shielding, true);
  assert.equal(pullToward(shield.fighter, 450, middle(shield.fighter), PULL, DT), false);
  const held = standing(600).fighter;
  held.combat.paralyze(1);
  assert.equal(pullToward(held, 450, middle(held), PULL, DT), false);
  const gone = standing(600).fighter;
  gone.lostToVoid = true;
  assert.equal(pullToward(gone, 450, middle(gone), PULL, DT), false);
});

// ---- Attacks and projectiles -----------------------------------------------------------

// A fighter whose attack1 is a pulling strike, at x 500 facing right, and a
// target at `x`; with `front`, a pull that reaches only the side it faces.
function pullingDuel(x, front = false) {
  const character = {
    ...def,
    attacks: {
      ...def.attacks,
      attack1: {
        ...def.attacks.attack1, startup: 0.1, active: 0.2, recovery: 0.1, hitCancel: 0,
        pull: { radius: 220, speed: 800, offset: { x: 40, y: -50 }, ...(front ? { front: true } : {}) },
      },
    },
  };
  const a = makeFighter({ character, x: 500 });
  const t = makeFighter({ x, facing: -1 });
  a.fighter.opponent = t.fighter;
  t.fighter.opponent = a.fighter;
  return { a, t };
}

test('an attack pulls only while its active phase is open, toward its own point, and never its owner', () => {
  const { a, t } = pullingDuel(680);
  a.step({ attack1: true, attack1Pressed: true });
  const xs = [];
  for (let i = 0; i < steps(0.5); i++) {
    t.fighter.body.vx = 0;
    applyPulls([a.fighter, t.fighter], [], DT);
    xs.push([a.fighter.combat.phase, t.fighter.body.vx, a.fighter.body.vx]);
    a.step({});
    t.step({});
  }
  const pulled = xs.filter(([, vx]) => vx < 0).map(([phase]) => phase);
  assert.ok(pulled.length > 0, 'drawn in');
  assert.ok(pulled.every((phase) => phase === 'active'), 'only while active');
  assert.ok(xs.filter(([phase]) => phase === 'startup' || phase === 'recovery').every(([, vx]) => vx === 0));
  assert.ok(t.fighter.body.x < 680, 'it came closer');
});

test('a pull that reaches only its front leaves an opponent behind it where it is, and draws one ahead as ever', () => {
  for (const [x, drawn] of [[380, false], [680, true]]) {
    const plain = pullingDuel(x);
    const front = pullingDuel(x, true);
    for (const d of [plain, front]) {
      d.a.step({ attack1: true, attack1Pressed: true });
      for (let i = 0; i < steps(0.1); i++) d.a.step({});
      assert.equal(d.a.fighter.combat.phase, 'active');
      d.t.fighter.body.vx = 0;
      applyPulls([d.a.fighter, d.t.fighter], [], DT);
    }
    assert.notEqual(plain.t.fighter.body.vx, 0, `x ${x}: a pull reaches both sides`);
    assert.equal(front.t.fighter.body.vx !== 0, drawn, `x ${x}: ${drawn ? 'ahead, drawn' : 'behind, left alone'}`);
  }
  // Its reach, for the CPU, is the circle's front half and the box.
  const atk = createAttackDefinition({
    id: 'testFront', damage: 1, hitbox: { x: 10, y: -60, w: 30, h: 30 }, pull: { radius: 100, speed: 500, offset: { x: 40, y: -50 }, front: true },
  });
  assert.deepEqual(attackReach(atk), { x: 0, y: -150, w: 140, h: 200 });
});

test('a projectile\'s front-only pull reaches only the way it flies', () => {
  const owner = standing(300).fighter;
  const ahead = standing(520).fighter;
  const behind = standing(330).fighter;
  const orb = new Projectile({
    owner,
    def: createProjectileDefinition({ id: 'testOrb', damage: 1, speed: 100, lifetime: 0.5, pull: { radius: 200, speed: 400, front: true } }),
    anim: { frames: [{}], fps: 1, loop: true },
    x: 400, y: middle(ahead), direction: 1,
  });
  applyPulls([owner, ahead, behind], [orb], DT);
  assert.equal(ahead.body.vx, -400, 'ahead of it: drawn back to it');
  assert.equal(behind.body.vx, 0, 'behind it: left alone');
});

test('a projectile pulls toward its centre for as long as it flies, never its owner, and stops once spent', () => {
  const stage = new StageCollision(stageMap());
  const owner = standing(300).fighter;
  const target = standing(520).fighter;
  const orb = new Projectile({
    owner,
    def: createProjectileDefinition({ id: 'testOrb', damage: 1, speed: 100, lifetime: 0.5, pull: { radius: 200, speed: 400 } }),
    anim: { frames: [{}], fps: 1, loop: true },
    x: 400, y: middle(target), direction: 1,
  });
  applyPulls([owner, target], [orb], DT);
  assert.equal(target.body.vx, -400, 'toward the orb');
  assert.equal(owner.body.vx, 0, 'its owner never');
  target.body.vx = 0;
  for (let i = 0; i < steps(0.5); i++) orb.update(DT, stage);
  assert.equal(orb.alive, false);
  applyPulls([owner, target], [orb], DT);
  assert.equal(target.body.vx, 0, 'spent: no pull');
});

// ---- Never a shove ----------------------------------------------------------------------

test('a fighter a pull drew in stops against the fighter that pulled it: the puller holds its ground', () => {
  const stage = new StageCollision(stageMap());
  const puller = standing(500).fighter;
  const drawn = standing(520).fighter;
  drawn.combat.stun = 0.4;
  drawn.body.vx = -600;
  drawn.drawnBy = puller;
  separateFighters(puller, drawn, stage);
  assert.equal(puller.body.x, 500, 'the puller is not pushed');
  const apart = (puller.def.pushbox.width + drawn.def.pushbox.width) / 2;
  assert.equal(drawn.body.x, 500 + apart, 'stopped against its body');
  assert.equal(drawn.body.vx, 0, 'its speed toward it gone');
  // Anyone else's overlap is split evenly, as ever.
  const a = standing(500).fighter;
  const b = standing(520).fighter;
  separateFighters(a, b, stage);
  assert.ok(a.body.x < 500 && b.body.x > 520);
  assert.ok(Math.abs((500 - a.body.x) - (b.body.x - 520)) < 1e-9);
});

test('drawn by a pull, a fighter is held by it while drawn and while still carried, helpless, toward its puller; free again, it pushes as ever', () => {
  const { a, t } = pullingDuel(680);
  a.step({ attack1: true, attack1Pressed: true });
  for (let i = 0; i < steps(0.1); i++) a.step({});
  applyPulls([a.fighter, t.fighter], [], DT);
  assert.equal(t.fighter.drawnBy, a.fighter, 'drawn by its pull');
  // Carried on toward it, stunned: still held once the pull is over.
  for (let i = 0; i < steps(0.4); i++) a.step({});
  assert.equal(a.fighter.combat.attack, null, 'the pull is over');
  t.fighter.combat.stun = 0.3;
  t.fighter.body.vx = -300;
  applyPulls([a.fighter, t.fighter], [], DT);
  assert.equal(t.fighter.drawnBy, a.fighter);
  // Moving away, or free to act: done with it.
  t.fighter.body.vx = 200;
  applyPulls([a.fighter, t.fighter], [], DT);
  assert.equal(t.fighter.drawnBy, null, 'moving away');
  t.fighter.drawnBy = a.fighter;
  t.fighter.body.vx = -300;
  t.fighter.combat.stun = 0;
  applyPulls([a.fighter, t.fighter], [], DT);
  assert.equal(t.fighter.drawnBy, null, 'free to act');
  // A projectile's pull holds its target for its owner.
  const owner = standing(300).fighter;
  const target = standing(520).fighter;
  const orb = new Projectile({
    owner,
    def: createProjectileDefinition({ id: 'testOrb', damage: 1, speed: 100, lifetime: 0.5, pull: { radius: 200, speed: 400 } }),
    anim: { frames: [{}], fps: 1, loop: true },
    x: 400, y: middle(target), direction: 1,
  });
  applyPulls([owner, target], [orb], DT);
  assert.equal(target.drawnBy, owner);
  target.reset(target.stage);
  assert.equal(target.drawnBy, null, 'a reset clears it');
});

test('a pull that lets go of a fighter still rushing in never shoves its owner back: it stops at its body', () => {
  // A long reach, a brief pull, a seizing stun: let go mid-flight, the
  // target slides on into the puller.
  const character = {
    ...def,
    attacks: {
      ...def.attacks,
      attack1: {
        ...def.attacks.attack1, startup: 0.1, active: 0.1, recovery: 0.3, hitCancel: null, baseLaunch: 0, directionalLaunch: null,
        hitbox: { x: 20, y: -100, w: 300, h: 80 }, hitstun: 0.8,
        pull: { radius: 300, speed: 1100, offset: { x: 40, y: -50 } },
        // A reach that seizes from afar (tendrils): it never steps in.
        step: false,
      },
    },
  };
  const d = duel({ gap: 290, attackerCharacter: character, attackerSprites: fakeSpritesOf(character), pushboxes: true });
  const x0 = d.attacker.body.x;
  d.tick({ attack1: true, attack1Pressed: true });
  let fastest = 0;
  for (let i = 0; i < steps(1); i++) {
    d.tick();
    if (d.attacker.combat.attack?.phase !== 'active') fastest = Math.max(fastest, -d.target.body.vx);
  }
  assert.ok(fastest > 500, 'let go while still rushing in');
  assert.equal(d.attacker.body.x, x0, 'its owner holds its ground');
  const apart = (d.attacker.def.pushbox.width + d.target.def.pushbox.width) / 2;
  assert.ok(Math.abs(d.target.body.x - d.attacker.body.x - apart) < 1e-6, 'the target stopped against it');
});
