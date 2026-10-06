// Run with node --test tests/systems/air-mouvment.test.mjs (no dependencies).
// The air dash: each fighter's own mid-air mouvment (its movement profile's
// airDashSpeed and airDashUses, its midair_mouvment clip), a capability
// apart from its grounded Dash. The same requests (a double tap, a
// mouvement button) make the Dash on the ground and the air dash in the
// air. Movement only, a set number per airtime, given back on landing and
// by a hit. Uses the real Fighter, CombatSystem and combat AI (see
// tests/helpers/fighter-harness.mjs), against both fighters' own data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { getCharacter } from '../../js/data/characters.js';
import { CONFIG } from '../../js/config.js';
import { Projectile } from '../../js/game/combat/projectile.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { readMoveset } from '../../js/game/ai/moveset.js';
import { StageCollision } from '../../js/game/physics.js';
import { mulberry32 } from '../../js/core/utils.js';
import { DT, duel, fakeSpritesOf, makeFighter, stageMap, steps } from '../helpers/fighter-harness.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const FIGHTERS = [DEF_0001, DEF_0002];
const RIGHT_REQUEST = { runRight: true, mouvementRightPressed: true };
const LEFT_REQUEST = { runLeft: true, mouvementLeftPressed: true };
const JUMP = { jump: true, jumpPressed: true };

function aloft(f, y = 400, x = f.body.x) {
  Object.assign(f.body, { x, prevX: x, y, prevY: y, vx: 0, vy: 0, grounded: false, ground: null });
}

// One pass of `def`'s clip `key`, in seconds.
const pass = (def, key) => def.animations[key].frames.length / def.animations[key].fps;

// ---- Data ------------------------------------------------------------------------------

test('both fighters have an air dash of their own beside their Dash: its own speed, uses and midair_mouvment art', () => {
  for (const [c, speed] of [[DEF_0001, 950], [DEF_0002, 1100]]) {
    assert.equal(c.movement.airDashSpeed, speed, `#${c.id}: about its Dash's speed`);
    assert.equal(c.movement.airDashUses, 1, `#${c.id}: once per airtime`);
    const clip = c.animations.midair_mouvment;
    assert.ok(clip, `#${c.id}: a midair_mouvment clip`);
    assert.notEqual(clip, c.animations.mouvment, 'not the Dash\'s clip');
    assert.equal(clip.loop, false, 'played once');
    for (const url of clip.frames) {
      assert.match(url, new RegExp(`/${c.id}_midair_mouvment_\\d+\\.png$`));
      assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
    }
    const { fighter } = makeFighter({ character: c });
    assert.ok(Math.abs(fighter.airDashDuration - pass(c, 'midair_mouvment')) < 1e-9, 'it lasts one pass of its clip');
    assert.equal(fighter.airDashUses, 1);
    const moves = readMoveset(fighter);
    assert.ok(Math.abs(moves.airDash.distance - speed * fighter.airDashDuration) < 1e-9, 'the CPU knows how far it goes');
  }
});

// ---- The request -----------------------------------------------------------------------

for (const c of FIGHTERS) {
  test(`#${c.id}: on the ground a request is the Dash, in the air its air dash: its own clip, speed, facing and flat path`, () => {
    const ground = makeFighter({ character: c });
    ground.step(RIGHT_REQUEST);
    assert.equal(ground.fighter.dash?.air, false, 'on the ground: the Dash');
    assert.equal(ground.fighter.animator.anim.key, 'mouvment');

    const { fighter: f, step } = makeFighter({ character: c, facing: 1 });
    aloft(f, 400);
    step({});
    const y = f.body.y;
    const energy = f.combat.energy;
    step(LEFT_REQUEST);
    const dash = f.dash;
    assert.equal(dash?.air, true, 'in the air: the air dash');
    assert.equal(f.state, 'dash');
    assert.equal(f.animator.anim.key, 'midair_mouvment', 'its own clip');
    assert.equal(f.facing, -1, 'facing the way it dashes at once');
    assert.equal(f.body.vx, -c.movement.airDashSpeed, 'its own speed');
    assert.equal(f.body.vy, 0);
    assert.equal(f.combat.energy, energy - c.energy.dashCost, 'the Dash\'s cost');
    let n = 1;
    while (f.dash) {
      assert.equal(f.body.y, y, `step ${n}: flat across the air, no fall`);
      assert.equal(f.body.vy, 0);
      assert.equal(f.dash, dash);
      step({ runLeft: true });
      n++;
    }
    assert.equal(n - 1, steps(pass(c, 'midair_mouvment')), 'one pass of its clip');
    assert.ok(Math.abs(f.body.vx) <= f.maxSpeed + 1e-9, 'out of it at no more than top speed');
    step({});
    assert.ok(f.body.vy > 0, 'then it falls as ever');
    assert.ok(['jump', 'fall'].includes(f.state));
  });
}

test('a double tap in the air is the air dash too, through the same reading of the taps', () => {
  for (const c of FIGHTERS) {
    const { fighter: f, step } = makeFighter({ character: c });
    step(JUMP);
    step({ runRight: true, runRightPressed: true });
    step({});
    step({ runRight: true, runRightPressed: true });
    assert.equal(f.dash?.air, true, `#${c.id}`);
    assert.equal(f.dash.direction, 1);
  }
});

// ---- Movement only ----------------------------------------------------------------------

test('an air dash is movement only: no hitbox, damage or launch, no Shield or Deflect, no invulnerability', () => {
  for (const c of FIGHTERS) {
    // Straight through an opponent: nothing struck.
    const d = duel({ attackerCharacter: c, gap: 60 });
    aloft(d.attacker, 500);
    aloft(d.target, 500, d.target.body.x);
    d.tick(RIGHT_REQUEST);
    assert.equal(d.attacker.dash?.air, true);
    while (d.attacker.dash) {
      assert.equal(d.attacker.combat.attack, null, 'no attack');
      assert.equal(d.attacker.combat.shielding, false, 'no Shield');
      d.tick({ runRight: true });
    }
    assert.deepEqual(d.events, [], `#${c.id}: no hit`);
    // A projectile meets it: not turned back, it strikes.
    const s = duel({ targetCharacter: c, gap: 300 });
    aloft(s.target, 500, s.target.body.x);
    s.tick({}, LEFT_REQUEST);
    assert.equal(s.target.dash?.air, true);
    const def = s.attacker.projectileDefs.attack2_object;
    const red = new Projectile({
      owner: s.attacker, def, anim: s.attacker.sprites.projectile(def.animation),
      x: s.target.body.x - 20, y: s.target.body.y - 40, direction: 1,
    });
    s.projectiles.push(red);
    s.tick();
    assert.equal(red.owner, s.attacker, 'never Deflected');
    assert.equal(s.events[0]?.type, 'hit', `#${c.id}: no invulnerability`);
    assert.equal(s.events[0].target, s.target);
    s.tick();
    assert.equal(s.target.dash, null, 'the hit ends it');
  }
});

// ---- Uses ---------------------------------------------------------------------------------

test('one air dash per airtime: a second is refused with nothing spent; landing gives it back, so does a hit, an air jump does not', () => {
  for (const c of FIGHTERS) {
    const { fighter: f, step } = makeFighter({ character: c });
    aloft(f, 300);
    step(RIGHT_REQUEST);
    assert.equal(f.airDashes, 0);
    while (f.dash) step({});
    const energy = f.combat.energy;
    step(LEFT_REQUEST);
    assert.equal(f.dash, null, `#${c.id}: no second one this airtime`);
    assert.ok(f.combat.energy >= energy, 'nothing spent');
    step(JUMP);
    step(LEFT_REQUEST);
    assert.equal(f.dash, null, 'an air jump gives none back');
    while (!f.grounded) step({});
    assert.equal(f.airDashes, 1, 'landing gives it back');
    step(JUMP);
    step({});
    step(LEFT_REQUEST);
    assert.equal(f.dash?.air, true, 'airborne again: one more');
  }
  // A hit gives it back, as it does the air jump (Fighter.takeHit).
  const d = duel({ gap: 40 });
  aloft(d.attacker, 500);
  aloft(d.target, 500, d.target.body.x);
  d.target.airDashes = 0;
  d.target.airJumps = 0;
  d.tick({ attack1: true, attack1Pressed: true });
  d.until(() => d.events.length > 0);
  assert.equal(d.events[0].type, 'hit');
  assert.equal(d.target.airDashes, 1, 'given back with the air jump');
  assert.equal(d.target.airJumps, DEF_0001.movement.airJumps);
});

test('the same rules as a Dash: never stunned, paralyzed, mid-attack, mid-dash, exhausted, in free fall or still flying from a launch', () => {
  const refused = (label, setup) => {
    const { fighter: f, step } = makeFighter(setup.options);
    aloft(f, 300);
    setup.before?.(f, step);
    const was = f.dash;
    const energy = f.combat.energy;
    step(RIGHT_REQUEST);
    assert.equal(f.dash, was, `${label}: no new air dash`);
    assert.ok(f.combat.energy >= energy - 1e-9, `${label}: nothing spent`);
  };
  refused('stunned', { before: (f) => { f.combat.stun = 0.3; } });
  refused('paralyzed', { before: (f) => f.combat.paralyze(1) });
  refused('in an attack that may not be cut short', { before: (f, step) => step({ attack1: true, attack1Pressed: true }) });
  refused('already dashing', { before: (f, step) => { step(LEFT_REQUEST); assert.ok(f.dash); } });
  refused('exhausted', { before: (f) => { f.combat.setEnergy(0); f.combat.regenEnergy(40); } });
  refused('in free fall', {
    options: { character: DEF_0002 },
    before: (f, step) => {
      step({ attack3: true, attack3Pressed: true });
      while (f.combat.attack) step({});
    },
  });
  refused('flying from a launch', { before: (f) => { f.launch = { bounces: 0 }; } });
  // The Deflect wins a step that asks for both.
  const { fighter, step } = makeFighter();
  aloft(fighter, 300);
  step({ ...RIGHT_REQUEST, shield: true, shieldPressed: true });
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
  assert.equal(fighter.dash, null);
});

test('the air dash and the Dash are separate capabilities: either may be had without the other; missing art refuses it, never faked', () => {
  const noAir = { ...DEF_0001, id: 'test-no-air-dash', movement: { ...DEF_0001.movement, airDashSpeed: 0 } };
  const ground = makeFighter({ character: noAir });
  assert.equal(ground.fighter.airDashUses, 0);
  aloft(ground.fighter, 300);
  ground.step(RIGHT_REQUEST);
  assert.equal(ground.fighter.dash, null, 'no air dash without its speed');
  assert.equal(readMoveset(ground.fighter).airDash, null);

  const airOnly = { ...DEF_0001, id: 'test-air-only', movement: { ...DEF_0001.movement, dashSpeed: 0 } };
  const air = makeFighter({ character: airOnly });
  air.step(RIGHT_REQUEST);
  assert.equal(air.fighter.dash, null, 'no Dash on the ground');
  aloft(air.fighter, 300);
  air.step(RIGHT_REQUEST);
  assert.equal(air.fighter.dash?.air, true, 'yet its air dash');

  const warnings = [];
  const warn = console.warn;
  console.warn = (msg) => warnings.push(msg);
  try {
    const sprites = fakeSpritesOf(DEF_0001, Object.keys(DEF_0001.animations).filter((k) => k !== 'midair_mouvment'));
    const { fighter: f, step } = makeFighter({ sprites });
    step(RIGHT_REQUEST);
    assert.equal(f.dash?.air, false, 'the Dash still works');
    while (f.dash) step({});
    aloft(f, 300);
    const energy = f.combat.energy;
    step(RIGHT_REQUEST);
    assert.equal(f.dash, null, 'no air dash without its art');
    assert.equal(f.state === 'dash', false, 'never the Dash\'s clip in its place');
    assert.ok(f.combat.energy >= energy, 'nothing spent');
    assert.equal(readMoveset(f).airDash, null);
  } finally {
    console.warn = warn;
  }
  assert.ok(warnings.some((w) => /Air dash has no midair_mouvment animation frames/.test(w)), 'logged clearly');
});

// ---- The CPU ---------------------------------------------------------------------------------

test('knocked off the stage with its air dash left, a CPU air dashes home', () => {
  for (const c of FIGHTERS) {
    const stage = new StageCollision(stageMap({ left: 0, right: 1000 }));
    const ai = new CombatAIController({ difficulty: 'brutal', rng: mulberry32(5) });
    const me = new Fighter({ def: c, sprites: fakeSpritesOf(c), stage, slot: 'p1', label: 'CPU', spawn: { x: 1180, y: 700 }, controller: ai });
    const foe = new Fighter({ def: DEF_0001, sprites: fakeSpritesOf(DEF_0001), stage, slot: 'p2', label: 'P', spawn: { x: 500 } });
    me.opponent = foe;
    foe.opponent = me;
    me.airJumps = 0;
    const ctx = { stage, gravity: CONFIG.sim.gravity, battle: { projectiles: [], clones: [] } };
    let dashed = null;
    for (let i = 0; i < 60 && !dashed; i++) {
      me.update(DT, ctx);
      if (me.dash?.air) dashed = me.dash;
    }
    assert.ok(dashed, `#${c.id}: an air dash`);
    assert.equal(dashed.direction, -1, 'toward the stage');
  }
});
