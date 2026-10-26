// Run with node --test tests/systems/turn-around.test.mjs (no dependencies).
// Automatic turn-around (Home › Settings › Combat, on by default): the human
// player's fighter faces the closest valid enemy by itself, and only turns.
// Covered here: on by default for a new player controller; the enemy on
// either side, crossing behind, the player standing, running away and in
// the air; Off as the manual rules exactly; no enemy, one out of play,
// overlapping x and several enemies (the closest, ties settled the same
// way every time); ordinary attacks aimed at the enemy with hitbox and
// sprite together; committed moves (a Dash, an air dash, every motion
// attack, a stun) keeping their course; a released projectile never
// turning with its owner; no CPU, dummy or other controller ever having
// it; Practice Ground's swaps and removals; respawn and restart; and
// determinism at every frame rate. Shared rules: every playable fighter,
// never one fighter's numbers (js/game/fighters/turn-around.js and
// Fighter.turnAroundFacing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, COMBAT_BUTTONS } from '../../js/config.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { PlayerController, TrainingAIController, blankInput } from '../../js/game/fighters/fighter-controller.js';
import { closestEnemy, facingToward, isValidEnemy } from '../../js/game/fighters/turn-around.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { specialAction } from '../../js/data/loadout.js';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { getMap } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { Battle } from '../../js/game/battle.js';
import { PracticeSession } from '../../js/game/practice.js';
import { DT, fakeSpritesOf } from '../helpers/fighter-harness.mjs';
import { FLAT, playerRig, press } from '../helpers/player-rig.mjs';

// The stage themes a Battle or a PracticeSession builds draw with Path2D:
// a no-op stand-in, as nothing is drawn here.
globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const C1 = getCharacter('0001');
const EPS = 1e-6;

// Moves `f` to x at once (no interpolation drift).
const place = (f, x) => Object.assign(f.body, { x, prevX: x });
// The player with its opponent `gap` units to its right, both standing.
const rig = (opts = {}) => playerRig({ character: C1, gap: 300, ...opts });
// What the player's body does each step: where it is and how fast.
const motionOf = (f) => [f.body.x, f.body.y, f.body.vx, f.body.vy, f.state];

// The ground attack buttons `f` has (attacks, not specials).
const groundAttacks = (f) => COMBAT_BUTTONS.filter((a) => !specialAction(f.def, a) && f.attackFor(a, true));

// ---- On by default, and which way ---------------------------------------------------------

test('on by default: a new player controller has it, and the player\'s fighter turns to an enemy on its first step', () => {
  const input = { sample: () => blankInput() };
  assert.equal(new PlayerController(input).automaticTurnAround, true, 'on unless said otherwise');
  assert.equal(new PlayerController(input, {}).automaticTurnAround, true);
  assert.equal(new PlayerController(input, { automaticTurnAround: false }).automaticTurnAround, false);
  for (const gone of ['combatAssist', 'comboAssist']) assert.equal(gone in new PlayerController(input), false, gone);
  const r = rig({ gap: -300 });
  assert.equal(r.player.facing, 1, 'its spawn faces right, away from the enemy');
  assert.equal(r.player.automaticTurnAround, true);
  r.tick();
  assert.equal(r.player.facing, -1, 'turned to the enemy on its left');
});

test('the enemy on the right faces it right, on the left faces it left, and a crossing behind turns it, standing still throughout', () => {
  for (const start of [1, -1]) {
    const r = rig();
    r.player.facing = start;
    const x = r.player.body.x;
    for (const [foeX, want] of [[x + 300, 1], [x - 300, -1], [x + 40, 1], [x - 40, -1], [x + 900, 1]]) {
      place(r.foe, foeX);
      r.tick();
      assert.equal(r.player.facing, want, `${start}: the enemy at ${foeX - x}`);
      for (let i = 0; i < 10; i++) r.tick();
      assert.equal(r.player.facing, want, `${start}: it stays facing it`);
      assert.equal(r.player.body.x, x, 'never moved');
      assert.equal(r.player.body.vx, 0);
      assert.equal(r.player.state, 'idle', 'standing: no run, no Dash, no attack');
      assert.equal(r.player.combat.attack, null);
    }
  }
});

test('running away: the player moves exactly as with it off, while it faces the enemy; Run never turns it away', () => {
  for (const c of playableCharacters()) {
    const traces = [true, false].map((automaticTurnAround) => {
      const r = playerRig({ character: c, gap: 300, automaticTurnAround });
      const out = [];
      for (let i = 0; i < 90; i++) {
        r.tick(i < 60 ? { runLeft: true, runLeftPressed: i === 0 } : {});
        out.push({ motion: motionOf(r.player), facing: r.player.facing, energy: r.player.combat.energy });
      }
      return { out, r };
    });
    const [on, off] = traces;
    assert.deepEqual(on.out.map((s) => s.motion), off.out.map((s) => s.motion), `#${c.id}: the same run, step for step`);
    assert.deepEqual(on.out.map((s) => s.energy), off.out.map((s) => s.energy), `#${c.id}: Energy untouched`);
    assert.ok(on.r.player.body.x < 800 - 100, `#${c.id}: it really ran away`);
    assert.ok(on.out.every((s) => s.facing === 1), `#${c.id}: on, it faced the enemy throughout`);
    assert.equal(off.out[30].facing, -1, `#${c.id}: off, the run turned it, as ever`);
  }
});

test('in the air: a jump, an air jump and air steering go exactly as with it off, and the facing follows the enemy across', () => {
  const run = (automaticTurnAround) => {
    const r = rig({ automaticTurnAround });
    const x = r.player.body.x;
    const out = [];
    for (let i = 0; i < 70; i++) {
      if (i === 8) place(r.foe, x - 250);
      if (i === 30) place(r.foe, x + 250);
      const input = i === 0 ? press('jump') : i === 20 ? press('jump') : { jump: i < 6, runLeft: i > 4 && i < 40 };
      r.tick(input);
      out.push({ motion: motionOf(r.player), facing: r.player.facing, grounded: r.player.body.grounded, x: r.player.body.x });
    }
    return out;
  };
  const on = run(true);
  const off = run(false);
  assert.deepEqual(on.map((s) => s.motion), off.map((s) => s.motion), 'the same arc, step for step');
  assert.equal(on[10].grounded, false);
  assert.equal(on[10].facing, -1, 'the enemy now on its left: faces left, in the air');
  assert.equal(on[25].grounded, false, 'still in the air after the air jump');
  assert.equal(on[32].facing, 1, 'the enemy back on the right: faces right, mid-air');
});

// ---- Off ------------------------------------------------------------------------------

test('off: the manual rules exactly; an enemy crossing behind never turns it, Run and a Dash do', () => {
  const r = rig({ automaticTurnAround: false });
  const x = r.player.body.x;
  assert.equal(r.player.automaticTurnAround, false);
  assert.equal(r.player.turnAroundFacing(), null, 'nothing to say at all');
  place(r.foe, x - 300);
  for (let i = 0; i < 60; i++) {
    r.tick();
    assert.equal(r.player.facing, 1, 'standing: still facing away from the enemy behind it');
  }
  for (let i = 0; i < 20; i++) r.tick({ runLeft: true });
  assert.equal(r.player.facing, -1, 'running left turns it left');
  for (let i = 0; i < 40; i++) r.tick();
  assert.equal(r.player.facing, -1, 'stopped: the last direction');
  place(r.foe, r.player.body.x + 300);
  for (let i = 0; i < 60; i++) r.tick();
  assert.equal(r.player.facing, -1, 'the enemy back in front of where it faced: still not turned');
  r.tick({ mouvementRightPressed: true });
  assert.equal(r.player.dash?.direction, 1);
  assert.equal(r.player.facing, 1, 'a Dash turns it its way');
  // An attack held one way turns as ever.
  for (let i = 0; i < 60; i++) r.tick();
  r.tick({ ...press('attack1'), runLeft: true });
  assert.equal(r.player.facing, -1, 'an attack started with left held faces left');
});

// ---- No target, overlapping, several ---------------------------------------------------------

test('no enemy: nothing turns it and nothing fails; its facing is manual until an enemy is back', () => {
  const r = rig();
  r.player.opponent = null;
  for (const start of [1, -1]) {
    r.player.facing = start;
    for (let i = 0; i < 30; i++) r.tick();
    assert.equal(r.player.facing, start, 'standing alone: its own facing kept');
  }
  assert.equal(r.player.turnAroundFacing(), null);
  for (let i = 0; i < 20; i++) r.tick({ runRight: true });
  assert.equal(r.player.facing, 1, 'Run turns it, as ever');
  r.player.opponent = r.foe;
  place(r.foe, r.player.body.x - 200);
  r.tick();
  assert.equal(r.player.facing, -1, 'an enemy back: faced at once');
});

test('an enemy out of play (lost to the Void, waiting to respawn) is never faced: no turn, no error, until it is back', () => {
  const r = rig();
  r.player.facing = 1;
  place(r.foe, r.player.body.x - 200);
  r.foe.lostToVoid = true;
  for (let i = 0; i < 30; i++) {
    r.tick();
    assert.equal(r.player.facing, 1, 'nothing to face');
  }
  assert.equal(r.player.turnAroundFacing(), null);
  r.foe.lostToVoid = false;
  r.tick();
  assert.equal(r.player.facing, -1, 'back in play: faced');
  // Bad position data is never faced either.
  for (const bad of [NaN, Infinity, -Infinity]) {
    r.player.facing = 1;
    const x = r.foe.body.x;
    r.foe.body.x = bad;
    assert.equal(r.player.turnAroundFacing(), null, String(bad));
    r.player.settleFacing();
    assert.equal(r.player.facing, 1, String(bad));
    r.foe.body.x = x;
  }
});

test('the enemy at the very same x keeps the last facing: never 0, never NaN', () => {
  for (const start of [1, -1]) {
    const r = rig();
    place(r.foe, r.player.body.x + 200 * start);
    r.tick();
    assert.equal(r.player.facing, start);
    // Straight above it, then exactly level with it.
    Object.assign(r.foe.body, { x: r.player.body.x, prevX: r.player.body.x, y: r.player.body.y - 300, prevY: r.player.body.y - 300 });
    for (let i = 0; i < 5; i++) {
      r.player.settleFacing();
      assert.equal(r.player.facing, start, 'straight above: kept');
      assert.equal(r.player.turnAroundFacing(), start);
    }
    place(r.foe, r.player.body.x);
    r.foe.body.y = r.player.body.y;
    r.player.settleFacing();
    assert.equal(r.player.facing, start, 'level and overlapping: kept');
    assert.ok(r.player.facing === 1 || r.player.facing === -1);
  }
});

test('several enemies: the closest valid one, by world distance (x and y), ties settled the same way every time', () => {
  const body = (x, y) => ({ x, y });
  const me = { body: body(1000, 500), combat: {}, lostToVoid: false };
  const fighter = (x, y, more = {}) => ({ body: body(x, y), combat: {}, lostToVoid: false, ...more });
  const near = fighter(900, 500);
  const far = fighter(1300, 500);
  assert.equal(closestEnemy(me, [far, near]), near);
  assert.equal(closestEnemy(me, [near, far]), near);
  // Height counts: one straight above is further than one level and close.
  const above = fighter(1010, 100);
  const level = fighter(850, 500);
  assert.equal(closestEnemy(me, [above, level]), level);
  // Ties: the one listed first, every time, whichever side.
  const left = fighter(900, 500);
  const right = fighter(1100, 500);
  for (let i = 0; i < 5; i++) {
    assert.equal(closestEnemy(me, [left, right]), left);
    assert.equal(closestEnemy(me, [right, left]), right);
  }
  // Never itself, a missing one, one out of play, one without a real
  // position, or anything that is not a fighter (no combat state: a
  // projectile, a clone, an effect, a hazard).
  const gone = fighter(990, 500, { lostToVoid: true });
  const nan = fighter(NaN, 500);
  const projectile = { body: body(995, 500), owner: near };
  const hazard = { x: 998, y: 500 };
  assert.equal(closestEnemy(me, [me, null, undefined, gone, nan, projectile, hazard, far]), far);
  assert.equal(closestEnemy(me, [me, gone, nan, projectile]), null);
  assert.equal(closestEnemy(me, []), null);
  assert.equal(closestEnemy({ body: body(NaN, 0) }, [near]), null, 'no position of its own: nothing');
  for (const bad of [me, null, gone, nan, projectile, hazard]) assert.equal(isValidEnemy(me, bad), false);
  assert.equal(isValidEnemy(me, near), true);
  assert.deepEqual([facingToward(me, near), facingToward(me, far), facingToward(me, fighter(1000, 0))], [-1, 1, null]);
  // On a real fighter, given several enemies, it faces the closest.
  const r = rig();
  const second = new Fighter({
    def: C1, sprites: fakeSpritesOf(C1), stage: FLAT, slot: 'p3', label: 'CPU 2', spawn: { x: r.player.body.x - 120, facing: 1 }, controller: null,
  });
  Object.defineProperty(r.player, 'enemies', { get: () => [r.foe, second] });
  r.tick();
  assert.equal(r.player.facing, -1, 'the closer one, on its left');
  place(second, r.player.body.x - 600);
  r.tick();
  assert.equal(r.player.facing, 1, 'now the one on its right is closer');
  second.lostToVoid = true;
  place(second, r.player.body.x - 50);
  r.tick();
  assert.equal(r.player.facing, 1, 'one out of play is never the closest');
});

// ---- Attacks ----------------------------------------------------------------------------

test('an ordinary attack starts facing the enemy and lands on it behind the player, its hitbox and sprite turned together, every fighter', () => {
  for (const c of playableCharacters()) {
    for (const action of groundAttacks(playerRig({ character: c, gap: 900 }).player)) {
      const probe = playerRig({ character: c, gap: 900 }).player;
      const atk = probe.attacks[probe.attackFor(action)];
      if (atk.motion || atk.projectile || !atk.hitbox) continue;
      const why = `#${c.id} ${action}`;
      const r = playerRig({ character: c, gap: -40 });
      r.player.facing = 1;
      r.player.attackVisualFacing = null;
      r.tick(press(action));
      assert.equal(r.player.combat.attack?.def.id, atk.id, why);
      assert.equal(r.player.facing, -1, `${why}: started facing the enemy on its left`);
      while (r.player.combat.attack) {
        assert.equal(r.player.visualFacing, r.player.facing, `${why}: the sprite faces the way the hitbox does`);
        r.tick();
      }
      assert.ok(r.events.some((e) => e.attacker === r.player && e.target === r.foe), `${why}: it landed on the enemy behind`);
      // The same press with it off strikes the way it faces: away.
      const off = playerRig({ character: c, gap: -40, automaticTurnAround: false });
      off.tick(press(action));
      assert.equal(off.player.facing, 1, `${why}: off, the way it faced`);
    }
  }
});

test('an enemy switching sides during an ordinary attack turns it, sprite and hitbox together, through its startup, strike and recovery', () => {
  const r = rig({ gap: 300 });
  r.tick(press('attack1'));
  const record = r.player.combat.attack;
  assert.ok(record && !record.def.motion);
  const x = r.player.body.x;
  let side = 1;
  while (r.player.combat.attack === record) {
    side = -side;
    place(r.foe, x + 300 * side);
    r.tick();
    if (r.player.combat.attack !== record) break;
    assert.equal(r.player.facing, side, 'turned to the enemy');
    assert.equal(r.player.visualFacing, side, 'its art with it');
  }
});

test('a technique and a summon\'s startup start facing the enemy too', () => {
  for (const c of playableCharacters()) {
    for (const action of COMBAT_BUTTONS) {
      const special = specialAction(c, action);
      if (!special) continue;
      const r = playerRig({ character: c, gap: -300 });
      r.player.facing = 1;
      r.tick(press(action));
      if (!r.player.technique && !r.player.pendingSummon && !r.player.summons.length) continue;
      assert.equal(r.player.facing, -1, `#${c.id} ${action} (${special.type})`);
    }
  }
});

// ---- Committed moves --------------------------------------------------------------------

test('a Dash and an air dash keep their own way: the enemy behind never turns or slows them, and it is faced again once they end', () => {
  for (const air of [false, true]) {
    const why = air ? 'air dash' : 'Dash';
    const run = (automaticTurnAround) => {
      const r = rig({ gap: 300, automaticTurnAround });
      if (air) {
        r.tick(press('jump'));
        r.tick({ jump: true });
        r.tick();
      }
      r.tick({ mouvementLeftPressed: true });
      assert.equal(r.player.dash?.direction, -1, why);
      const out = [];
      while (r.player.dash) {
        out.push({ motion: motionOf(r.player), facing: r.player.facing, energy: r.player.combat.energy });
        r.tick();
      }
      return { out, r };
    };
    const on = run(true);
    const off = run(false);
    assert.deepEqual(on.out, off.out, `${why}: the same, step for step, its facing included`);
    assert.ok(on.out.every((s) => s.facing === -1), `${why}: facing its own way throughout, the enemy behind it`);
    on.r.tick();
    assert.equal(on.r.player.facing, 1, `${why}: over, it faces the enemy again`);
  }
});

test('every motion attack keeps its course, hitboxes and physical facing with the enemy crossing behind: only its art may turn', () => {
  let seen = 0;
  for (const c of playableCharacters()) {
    for (const air of [false, true]) {
      const probe = playerRig({ character: c, gap: 900 }).player;
      for (const action of COMBAT_BUTTONS) {
        if (specialAction(c, action)) continue;
        const id = probe.attackFor(action, !air);
        const atk = id ? probe.attacks[id] : null;
        if (!atk?.motion || (air && atk.groundOnly)) continue;
        const why = `#${c.id} ${id}`;
        const run = (automaticTurnAround) => {
          // The enemy far ahead as it starts (the same facing either way),
          // then far behind at once: out of reach, nothing to hit.
          const r = playerRig({ character: c, gap: 900, x: 1000, automaticTurnAround });
          if (air) {
            r.tick(press('jump'));
            r.tick({ jump: true });
          }
          r.tick(press(action));
          const record = r.player.combat.attack;
          if (record?.def.id !== id) return null;
          place(r.foe, Math.max(20, r.player.body.x - 900));
          const out = [];
          for (;;) {
            r.tick();
            if (r.player.combat.attack !== record) break;
            out.push({ motion: motionOf(r.player), facing: r.player.facing, hurt: r.player.hurtboxes, time: record.time });
          }
          return out;
        };
        const on = run(true);
        const off = run(false);
        if (!on || !off) continue;
        seen++;
        assert.deepEqual(on.map((s) => s.motion), off.map((s) => s.motion), `${why}: the same course, step for step`);
        assert.deepEqual(on.map((s) => s.facing), off.map((s) => s.facing), `${why}: its physical facing (its hitboxes) untouched`);
      }
    }
  }
  assert.ok(seen >= 3, `motion attacks checked (${seen})`);
});

test('a stun, a paralysis and a technique hold the facing: the enemy crossing behind turns it only once they end', () => {
  const r = rig({ gap: 300 });
  r.tick();
  r.player.combat.stun = 0.3;
  place(r.foe, r.player.body.x - 300);
  for (let i = 0; i < 10; i++) {
    r.tick();
    assert.equal(r.player.facing, 1, 'in hitstun: never turned');
  }
  r.player.combat.stun = 0;
  r.tick();
  assert.equal(r.player.facing, -1, 'free again: faced');
  r.player.combat.paralysis = 0.3;
  place(r.foe, r.player.body.x + 300);
  r.tick();
  assert.equal(r.player.facing, -1, 'paralysed: never turned');
});

test('a released projectile never turns with its owner: it flies on the way it was thrown', () => {
  let seen = 0;
  for (const c of playableCharacters()) {
    const probe = playerRig({ character: c, gap: 900 }).player;
    for (const action of groundAttacks(probe)) {
      const atk = probe.attacks[probe.attackFor(action)];
      if (!atk.projectile) continue;
      const r = playerRig({ character: c, gap: 1600, x: 300 });
      r.tick(press(action));
      r.until(() => r.projectiles.length > 0 || !r.player.combat.attack);
      const shot = r.projectiles[0];
      // One that draws fighters in would pull the enemy back in front.
      if (!shot || shot.def.pull) continue;
      seen++;
      assert.equal(shot.direction, 1, `#${c.id} ${action}: thrown at the enemy`);
      const vx = shot.vx;
      place(r.foe, r.player.body.x - 250);
      for (let i = 0; i < 10; i++) r.tick();
      assert.equal(r.player.facing, -1, `#${c.id} ${action}: its owner turned`);
      assert.equal(shot.direction, 1, `#${c.id} ${action}: the projectile did not`);
      assert.equal(Math.sign(shot.vx), Math.sign(vx));
    }
  }
  assert.ok(seen > 0, 'projectile attacks checked');
});

// ---- Who has it ---------------------------------------------------------------------------

test('only a player\'s controller with the setting on has it: never a CPU, the training CPU, the dummy or another kind, by slot, label or fighter', () => {
  const make = (controller, slot = 'p1', label = 'P1') => new Fighter({
    def: C1, sprites: fakeSpritesOf(C1), stage: FLAT, slot, label, spawn: { x: 1000, facing: 1 }, controller,
  });
  const input = { sample: () => blankInput() };
  assert.equal(make(new PlayerController(input)).automaticTurnAround, true);
  assert.equal(make(new PlayerController(input), 'p2', 'CPU').automaticTurnAround, true, 'a player\'s whatever its slot or label');
  assert.equal(make(new PlayerController(input, { automaticTurnAround: false })).automaticTurnAround, false);
  const others = [
    new CombatAIController({ difficulty: 'hard' }),
    new TrainingAIController(),
    null,
    { getInput: () => blankInput() },
    { kind: 'cpu', automaticTurnAround: true, getInput: () => blankInput() },
    { kind: 'dummy', automaticTurnAround: true, getInput: () => blankInput() },
  ];
  for (const controller of others) {
    const f = make(controller);
    assert.equal(f.automaticTurnAround, false, String(controller?.kind ?? controller));
    assert.equal(f.turnAroundFacing(), null);
  }
  // A CPU behind, standing on neutral input, never turns by itself.
  const cpu = make({ kind: 'cpu', automaticTurnAround: true, getInput: () => blankInput() });
  const foe = make(null, 'p2', 'CPU');
  cpu.opponent = foe;
  place(foe, 700);
  for (let i = 0; i < 30; i++) cpu.update(DT, { stage: FLAT, gravity: CONFIG.sim.gravity });
  cpu.settleFacing();
  assert.equal(cpu.facing, 1);
});

test('a Quick Battle CPU never has it: every step its aim is its own intelligence\'s, the player\'s setting on or off', () => {
  const sprites = fakeSpritesOf(C1);
  for (const automaticTurnAround of [true, false]) {
    const battle = new Battle({
      canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: C1, p2Def: C1, p1Sprites: sprites, p2Sprites: sprites,
      input: { flush() {}, sample: () => blankInput() }, difficulty: 'hard', seed: 5, automaticTurnAround,
    });
    battle.setPhase('fight');
    const cpu = battle.p2;
    assert.ok(cpu.controller instanceof CombatAIController);
    assert.equal(battle.p1.automaticTurnAround, automaticTurnAround);
    let attacks = 0;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      battle.update(DT);
      assert.equal(cpu.automaticTurnAround, false);
      assert.equal(cpu.turnAroundFacing(), null, 'nothing of the player\'s setting');
      assert.equal(cpu.attackTargetFacing(), cpu.controller.attackFacing(cpu), 'its own attackFacing, as ever');
      if (cpu.combat.attack) attacks++;
    }
    assert.ok(attacks > 0, 'it fought');
    battle.destroy();
  }
});

// ---- Modes --------------------------------------------------------------------------------

test('Practice Ground: it faces the dummy, a swapped-in fighter and a replaced dummy; removing the dummy leaves no target and no error', () => {
  const sprites = fakeSpritesOf(C1);
  const session = new PracticeSession({
    canvas: { getContext: () => ({}) }, map: PRACTICE_MAP, def: C1, sprites, input: { flush() {}, sample: () => blankInput() },
  });
  session.setCPU(C1, sprites);
  const step = (n = 1) => { for (let i = 0; i < n; i++) session.update(DT); };
  const behind = () => place(session.cpu, session.player.body.x - 250 * session.player.facing);
  step();
  const facing = session.player.facing;
  behind();
  step();
  assert.equal(session.player.facing, -facing, 'turned to the dummy behind it');
  assert.equal(session.cpu.facing, session.map.spawnPoints[1].facing, 'the dummy never turns');
  // A swapped-in fighter has it too.
  session.setFighter(C1, sprites);
  assert.equal(session.player.automaticTurnAround, true);
  step();
  const swapped = session.player.facing;
  behind();
  step();
  assert.equal(session.player.facing, -swapped, 'the new fighter turned');
  // A replaced dummy is faced as well.
  session.setCPU(C1, sprites);
  behind();
  const before = session.player.facing;
  step();
  assert.equal(session.player.facing, -before, 'the new dummy faced');
  // No dummy: nothing to face, nothing fails; Run turns it by hand.
  session.removeCPU();
  const alone = session.player.facing;
  step(30);
  assert.equal(session.player.facing, alone, 'alone: its facing kept');
  // Back again: faced at once.
  session.setCPU(C1, sprites);
  behind();
  const now = session.player.facing;
  step();
  assert.equal(session.player.facing, -now, 'a dummy back: faced');
  session.destroy();
});

test('respawn and restart: the setting stays, and it faces the enemy as soon as both are in play', () => {
  const sprites = fakeSpritesOf(C1);
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: C1, p2Def: C1, p1Sprites: sprites, p2Sprites: sprites,
    input: { flush() {}, sample: () => blankInput() },
  });
  battle.p2.controller = null;
  battle.setPhase('fight');
  const { p1, p2 } = battle;
  const [spawn1] = battle.map.spawnPoints;
  // P1 into the Void; meanwhile the enemy waits behind P1's spawn.
  Object.assign(p1.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(p1.lostToVoid, true);
  place(p2, spawn1.x - 250 * spawn1.facing);
  const wait = Math.round(CONFIG.battle.respawnSeconds / DT);
  for (let i = 0; i < wait && p1.lostToVoid; i++) battle.update(DT);
  assert.equal(p1.lostToVoid, false, 'back');
  battle.update(DT);
  assert.equal(p1.automaticTurnAround, true, 'kept through the respawn');
  assert.equal(p1.facing, -spawn1.facing, 'faced the enemy behind its spawn');
  // The enemy lost to the Void: nothing to face, nothing turns.
  const facing = p1.facing;
  Object.assign(p2.body, { y: battle.stage.void.bottom + 100, grounded: false, ground: null });
  battle.update(DT);
  assert.equal(p2.lostToVoid, true);
  for (let i = 0; i < 20; i++) battle.update(DT);
  assert.equal(p1.facing, facing, 'kept while the enemy is out of play');
  // A restart keeps the controller and its setting.
  battle.restart();
  battle.setPhase('fight');
  assert.equal(battle.p1.automaticTurnAround, true, 'kept through a restart');
  place(battle.p2, battle.p1.body.x - 250 * battle.p1.facing);
  const restarted = battle.p1.facing;
  battle.update(DT);
  assert.equal(battle.p1.facing, -restarted, 'faced after the restart');
  battle.destroy();
});

// ---- Determinism --------------------------------------------------------------------------

test('deterministic: the same presses give the same facing and motion step for step, at every rendering frame rate', () => {
  const sprites = fakeSpritesOf(C1);
  const run = (hz) => {
    let t = 0;
    const input = {
      flush() {},
      // Held input from the simulation clock: presses land on the same step whatever the frame rate.
      sample() {
        const i = Math.round(t / DT);
        t += DT;
        const k = i % 90;
        return {
          ...blankInput(), runRight: k < 25, runLeft: k > 50 && k < 70, jump: k === 30, jumpPressed: k === 30,
          attack1: k === 10 || k === 75, attack1Pressed: k === 10 || k === 75,
        };
      },
    };
    const battle = new Battle({
      canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: C1, p2Def: C1, p1Sprites: sprites, p2Sprites: sprites, input,
    });
    battle.p2.controller = null;
    battle.setPhase('fight');
    // The dummy walked across the player now and then: a side switch to follow.
    const facings = [];
    for (let s = 0; s < 4 * hz; s++) {
      battle.frame(1 / hz + 1e-9);
      facings.push(battle.p1.facing);
    }
    const f = battle.p1;
    const out = [f.body.x, f.body.y, f.state, f.facing, battle.p2.combat.launchPoint, f.steps];
    battle.destroy();
    return { out, facings };
  };
  const at60 = run(60);
  assert.deepEqual(run(30).out, at60.out);
  assert.deepEqual(run(144).out, at60.out);
  assert.deepEqual(run(60), at60, 'and again, the same');
  assert.ok(at60.facings.every((f) => f === 1 || f === -1), 'never 0 or NaN');
});
