// Run with node --test tests/systems/air-mouvment.test.mjs (no dependencies).
// The air dash: the universal mid-air mouvment (airDashSpeed,
// airDashDuration and airDashUses in js/data/movement.js, each fighter's own
// midair_mouvment clip shown across it), a capability apart from the
// grounded Dash. The same requests (a double tap, a mouvement button) make
// the Dash on the ground and the air dash in the air. Movement only, a set
// number per airtime, given back on landing and by a hit; its speed carries
// on after it. Uses the real Fighter, CombatSystem and combat AI (see
// tests/helpers/fighter-harness.mjs), against both fighters.
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
import { DT, MOVEMENT, duel, fakeSpritesOf, makeFighter, stageMap, steps } from '../helpers/fighter-harness.mjs';
import { DASH_ENERGY_COST } from '../../js/game/combat/combat-state.js';

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

// ---- Data ------------------------------------------------------------------------------

test('both fighters have the universal air dash beside their Dash: the same speed, length and uses, each its own midair_mouvment art', () => {
  assert.equal(MOVEMENT.airDashSpeed, MOVEMENT.dashSpeed, 'as fast as the Dash');
  assert.equal(MOVEMENT.airDashUses, 1, 'once per airtime');
  for (const c of FIGHTERS) {
    const speed = MOVEMENT.airDashSpeed;
    const clip = c.animations.midair_mouvment;
    assert.ok(clip, `#${c.id}: a midair_mouvment clip`);
    assert.notEqual(clip, c.animations.mouvment, 'not the Dash\'s clip');
    assert.equal(clip.loop, false, 'played once');
    for (const url of clip.frames) {
      assert.match(url, new RegExp(`/${c.id}_midair_mouvment_\\d+\\.png$`));
      assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
    }
    const { fighter } = makeFighter({ character: c });
    assert.equal(fighter.airDashDuration, MOVEMENT.airDashDuration, 'the universal length, its clip shown once across it');
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
    assert.equal(f.body.vx, -MOVEMENT.airDashSpeed, 'the universal speed');
    assert.equal(f.body.vy, 0);
    assert.equal(f.combat.energy, energy - DASH_ENERGY_COST, 'the Dash\'s cost');
    let n = 1;
    while (f.dash) {
      assert.equal(f.body.y, y, `step ${n}: flat across the air, no fall`);
      assert.equal(f.body.vy, 0);
      assert.equal(f.dash, dash);
      step({ runLeft: true });
      n++;
    }
    assert.equal(n - 1, steps(MOVEMENT.airDashDuration), 'its universal length');
    assert.ok(Math.abs(f.body.vx) > f.maxSpeed, 'out of it at its own speed, carried on, never cut to top speed');
    assert.ok(Math.abs(f.body.vx) >= MOVEMENT.airDashSpeed - MOVEMENT.airOverspeedDeceleration * DT - 1e-9, 'one step of its burst bleeding off');
    assert.equal(f.burst, true, 'a burst of its own');
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
  assert.equal(d.target.airJumps, MOVEMENT.airJumps);
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

test('the air dash and the Dash are separate capabilities, each its art\'s: either may be had without the other; missing art refuses it, never faked', () => {
  const quiet = console.warn;
  console.warn = () => {};
  try {
    const noAir = fakeSpritesOf(DEF_0001, Object.keys(DEF_0001.animations).filter((k) => k !== 'midair_mouvment'));
    const ground = makeFighter({ sprites: noAir });
    assert.equal(ground.fighter.airDashDuration, 0);
    aloft(ground.fighter, 300);
    ground.step(RIGHT_REQUEST);
    assert.equal(ground.fighter.dash, null, 'no air dash without its art');
    assert.equal(readMoveset(ground.fighter).airDash, null);

    const airOnly = fakeSpritesOf(DEF_0001, Object.keys(DEF_0001.animations).filter((k) => k !== 'mouvment'));
    const air = makeFighter({ sprites: airOnly });
    air.step(RIGHT_REQUEST);
    assert.equal(air.fighter.dash, null, 'no Dash on the ground');
    aloft(air.fighter, 300);
    air.step(RIGHT_REQUEST);
    assert.equal(air.fighter.dash?.air, true, 'yet its air dash');
  } finally {
    console.warn = quiet;
  }

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

test('air dash has its own 0.5-second timer, not refunded by airtime resources or a ground Dash', () => {
  for (const character of FIGHTERS) {
    const { fighter: f, step } = makeFighter({ character });
    assert.equal(f.tryDash(1), true);
    f.endDash();
    aloft(f, -1000);
    assert.equal(f.tryAirDash(-1), true, 'separate from ground Dash');
    assert.equal(f.combat.movementCooldowns.remaining('midair_mouvment'), 0.5);
    f.endDash();
    f.takeHit({ launchSpeed: 0 });
    assert.equal(f.airDashes, f.airDashUses);
    assert.equal(f.tryAirDash(1), false, 'a hit refunds the airtime use, never the repeat timer');
    for (let i = 0; i < 29; i++) step();
    assert.equal(f.tryAirDash(1), false);
    step();
    assert.equal(f.tryAirDash(1), true);
  }
});
