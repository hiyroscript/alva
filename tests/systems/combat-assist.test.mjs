// Run with node --test tests/systems/combat-assist.test.mjs (no dependencies).
// Combat Assist (Home › Settings › Combat): a human player's melee press made
// just out of reach closes the gap first with the fighter's mouvment clip,
// free (it never costs Energy), then starts the very attack asked for; in the
// air the same, flat across as an air dash, with midair_mouvment. Covered
// here: which presses get it (melee by the attack's own data, within one
// Dash's or air dash's travel, unless the attack's own reach already covers
// its target; never a ranged attack, a pending one, a summon, a technique or
// the Deflect), that it costs no Energy (and the air dash it uses), the newest melee
// press winning, everything that cancels it, who has it (the player's
// controller with the setting on; never a CPU, in any mode) and what the
// stage does to it. Shared rules: driven from each fighter's own data or a
// fixture, never one fighter's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG, COMBAT_BUTTONS } from '../../js/config.js';
import { Fighter, separateFighters } from '../../js/game/fighters/fighter.js';
import { PlayerController, TrainingAIController, blankInput } from '../../js/game/fighters/fighter-controller.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { readMoveset } from '../../js/game/ai/moveset.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { DEFLECT_ENERGY_COST } from '../../js/game/combat/combat-state.js';
import { isMeleeAttack, isRangedAttack, attackReach } from '../../js/game/combat/attacks.js';
import { assistsAttack, assistRange, meleeGap, ASSIST_MARGIN } from '../../js/game/combat/combat-assist.js';
import { spawnProjectiles, removeDeadProjectiles, clashProjectiles } from '../../js/game/combat/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../../js/game/combat/summon.js';
import { applyPulls } from '../../js/game/combat/pull.js';
import { StageCollision, resolveSolidOverlap } from '../../js/game/physics.js';
import { Battle } from '../../js/game/battle.js';
import { PracticeSession } from '../../js/game/practice.js';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { getMap } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { BASE_FIGHTER_MOVEMENT } from '../../js/data/movement.js';
import { mulberry32 } from '../../js/core/utils.js';
import { fakeSpritesOf, stageMap, DT, frameName, cpuFight } from '../helpers/fighter-harness.mjs';
import { SAMPLE_FIGHTER } from '../fighters/fixtures/sample-fighter.mjs';

// The stage themes a Battle or a PracticeSession builds draw with Path2D:
// a no-op stand-in, as nothing is drawn here.
globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

const C1 = getCharacter('0001');
const MV = BASE_FIGHTER_MOVEMENT;
const FLAT = new StageCollision(stageMap());
const EPS = 1e-6;

// This step's input with `actions` pressed (held, and their press edge).
const press = (...actions) => Object.fromEntries(actions.flatMap((a) => [[a, true], [`${a}Pressed`, true]]));

// Player 1 on a real PlayerController (Combat Assist `assist`), facing a foe
// `gap` units to its right (the foe facing it, on `foeController`: none by
// default, a training dummy). Stepped in Battle.update's order with the real
// CombatSystem, projectiles and clones. `tick(input)` feeds the player one
// input snapshot; `controller` swaps in any other controller for the player.
function rig({
  character = C1, foeCharacter = character, gap = 200, assist = true, x = 800, stage = FLAT,
  foeController = null, sprites, controller, slot = 'p1', label = 'P1',
} = {}) {
  const held = {};
  const input = { sample: () => ({ ...blankInput(), ...held }) };
  const player = new Fighter({
    def: character, sprites: sprites ?? fakeSpritesOf(character), stage, slot, label,
    spawn: { x, facing: 1 }, controller: controller ?? new PlayerController(input, { combatAssist: assist }),
  });
  const foe = new Fighter({
    def: foeCharacter, sprites: fakeSpritesOf(foeCharacter), stage, slot: 'p2', label: 'CPU',
    spawn: { x: x + gap, facing: -1 }, controller: foeController,
  });
  player.opponent = foe;
  foe.opponent = player;
  const fighters = [player, foe];
  const system = new CombatSystem();
  const projectiles = [];
  const clones = [];
  const events = [];
  const ctx = { stage, gravity: CONFIG.sim.gravity };
  const tick = (now = {}) => {
    for (const k of Object.keys(held)) delete held[k];
    Object.assign(held, now);
    const live = fighters.filter((f) => !f.lostToVoid);
    for (const f of live) f.update(DT, ctx);
    separateFighters(player, foe, stage);
    for (const f of live) resolveSolidOverlap(f.body, stage);
    for (const f of live) f.updateAttackFacing();
    spawnProjectiles(live, projectiles);
    for (const p of projectiles) p.update(DT, stage);
    clashProjectiles(projectiles);
    updateClones(clones, DT);
    spawnClones(live, clones, stage);
    applyPulls(live, projectiles, DT);
    events.push(...system.update(live, projectiles, clones));
    removeDeadProjectiles(projectiles);
    removeDeadClones(clones);
    return player;
  };
  return { player, foe, tick, events, projectiles, clones, system, input, held };
}

// Moves the foe so `box` (by default `atk`'s own reach, attackReach: its
// box, or where its motion or pull takes it) is `gap` world units short of
// it (meleeGap).
function placeFoe(r, atk, gap, box = attackReach(atk)) {
  const now = meleeGap(r.player, box, r.foe, 1);
  r.foe.body.x += gap - now;
  r.foe.body.prevX = r.foe.body.x;
}

// Every combat button whose attack (on the ground, or in the air: `air`)
// is melee, for `character`.
function meleeButtons(character, air) {
  const f = rig({ character }).player;
  return COMBAT_BUTTONS.filter((action) => {
    const id = f.attackFor(action, !air);
    return !!id && isMeleeAttack(f.attacks[id]);
  }).map((action) => ({ action, id: f.attackFor(action, !air) }));
}
const groundMelee = (character) => meleeButtons(character, false);

// The player a little way into a jump (rising, two steps after the press),
// at the height its mid-air attacks meet a standing foe.
function airborne(r) {
  r.tick(press('jump'));
  r.tick({ jump: true });
  assert.equal(r.player.grounded, false);
  return r.player;
}

// Steps with nothing pressed until the player's attack starts; returns the
// steps it took (throws if it never does).
function untilAttack(r, limit = 40) {
  for (let i = 1; i <= limit; i++) {
    r.tick();
    if (r.player.combat.attack) return i;
  }
  throw new Error('the attack never started');
}

// Steps `n` times with nothing pressed, returning every attack id the
// player started meanwhile (and any left in its combat buffer).
function watchAttacks(r, n = 60) {
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    r.tick();
    if (r.player.combat.attack) seen.add(r.player.combat.attack.def.id);
    if (r.player.bufferedAttack) seen.add(`buffered:${r.player.bufferedAttack.action}`);
  }
  return seen;
}

// A copy of #0001 under its own id: what a fighter's own data says decides
// everything, never who it is.
function variant(id, changes) {
  return { ...C1, id, displayName: id, available: false, rosterSlot: null, ...changes };
}

// ---- What counts as melee ---------------------------------------------------------

test('melee and ranged are one shared reading of an attack\'s data, the AI moveset\'s and Combat Assist\'s alike', () => {
  for (const c of playableCharacters()) {
    const f = rig({ character: c }).player;
    const ms = readMoveset(f);
    assert.ok(ms.melee.length > 0, `#${c.id} has melee attacks`);
    for (const m of ms.melee) assert.ok(isMeleeAttack(m.atk) && !isRangedAttack(m.atk), `#${c.id} ${m.id}`);
    for (const r of ms.ranged) assert.ok(isRangedAttack(r.atk) && !isMeleeAttack(r.atk), `#${c.id} ${r.id}`);
    for (const atk of Object.values(f.attacks)) {
      assert.equal(isMeleeAttack(atk), !!atk.hitbox && !atk.projectile, `#${c.id} ${atk.id}`);
    }
  }
  // A pending attack (art only) is neither; nothing at all is neither.
  const pending = rig({ character: variant('assist-pending', {
    attacks: { ...C1.attacks, attack1: { animation: 'attack1', pending: true } },
  }) }).player.attacks.attack1;
  assert.equal(isMeleeAttack(pending), false);
  assert.equal(isRangedAttack(pending), false);
  assert.equal(isMeleeAttack(null), false);
  // The moveset reads them through the same functions, never on its own.
  const moveset = read('js/game/ai/moveset.js');
  assert.match(moveset, /isRangedAttack\(atk\)/);
  assert.match(moveset, /isMeleeAttack\(atk\)/);
});

// ---- The approach -------------------------------------------------------------------

test('just out of reach, a melee press closes the gap with the mouvment clip, then its own attack starts: every fighter, every ground melee button', () => {
  for (const c of playableCharacters()) {
    for (const { action, id } of groundMelee(c)) {
      const why = `#${c.id} ${action}`;
      const r = rig({ character: c });
      const { player, foe } = r;
      const atk = player.attacks[id];
      const before = JSON.stringify(atk);
      placeFoe(r, atk, 60);
      const max = player.combat.energy;
      const x0 = player.body.x;
      r.tick(press(action));
      const a = player.combatAssist;
      assert.ok(a, `${why}: the approach starts`);
      assert.equal(a.action, action, why);
      assert.equal(a.attack, atk, `${why}: the attack it serves is the fighter's own`);
      assert.equal(a.target, foe, why);
      assert.equal(player.combat.attack, null, `${why}: no attack, no hitbox yet`);
      assert.equal(player.state, 'assist', why);
      assert.equal(player.animator.anim.key, 'mouvment', `${why}: the Dash's own clip`);
      assert.equal(frameName(player), `${c.id}_mouvment_1.png`, `${why}: from its first frame`);
      assert.equal(player.facing, 1, `${why}: facing its target`);
      assert.equal(player.combat.energy, max, `${why}: free, nothing paid`);
      assert.ok(Math.abs(player.body.vx - MV.dashSpeed) < EPS, `${why}: at the Dash's speed`);
      // Closing in step by step: never faster than the Dash, never a jump.
      let last = player.body.x;
      let started = 0;
      for (let i = 0; i < 30 && !player.combat.attack; i++) {
        r.tick();
        const moved = player.body.x - last;
        assert.ok(moved >= -EPS && moved <= MV.dashSpeed * DT + EPS, `${why}: a step of ${moved}`);
        assert.equal(player.body.grounded, true, why);
        last = player.body.x;
        if (!player.combat.attack) {
          assert.equal(player.state, 'assist', why);
          assert.equal(player.animator.anim.key, 'mouvment', why);
        }
        started = i + 1;
      }
      assert.ok(player.combat.attack, `${why}: its attack starts`);
      assert.equal(player.combat.attack.def, atk, `${why}: the very attack asked for`);
      assert.equal(player.combat.attack.time, 0, `${why}: from its start`);
      assert.equal(player.combatAssist, null);
      assert.equal(JSON.stringify(atk), before, `${why}: the attack is unchanged`);
      assert.ok(Object.isFrozen(atk));
      // It stopped where the attack reaches, having covered only that.
      const gap = meleeGap(player, attackReach(atk), foe, 1);
      assert.ok(gap < 0 && gap >= -ASSIST_MARGIN - EPS, `${why}: in reach at ${gap}`);
      assert.ok(Math.abs(player.body.x - x0 - (60 + ASSIST_MARGIN)) < 1e-3, `${why}: 61 units covered`);
      assert.ok(started <= Math.ceil((60 + ASSIST_MARGIN) / (MV.dashSpeed * DT)) + 1, why);
      // Nothing paid at any point.
      assert.equal(player.combat.energy, max, why);
    }
  }
});

test('from its first step the assisted attack is exactly the attack thrown in reach: its frames, timing, hits and effect', () => {
  for (const c of playableCharacters()) {
    for (const { action, id } of groundMelee(c)) {
      const why = `#${c.id} ${action}`;
      const assisted = rig({ character: c });
      placeFoe(assisted, assisted.player.attacks[id], 60);
      assisted.tick(press(action));
      untilAttack(assisted);
      const box = assisted.player.attacks[id].hitbox;
      const at = meleeGap(assisted.player, box, assisted.foe, 1);
      // The same attack, Combat Assist off, thrown from that very spot.
      const plain = rig({ character: c, assist: false });
      placeFoe(plain, plain.player.attacks[id], at, box);
      plain.tick(press(action));
      assert.ok(plain.player.combat.attack, why);
      const record = (r) => {
        const out = [];
        for (let i = 0; i < 70; i++) {
          const p = r.player;
          out.push([
            p.state, frameName(p), p.combat.attack?.def.id ?? '-', p.combat.phase ?? '-', p.combat.attack?.time.toFixed(4) ?? '-',
            (r.foe.body.x - p.body.x).toFixed(3), p.body.vx.toFixed(3), r.foe.combat.launchPoint, r.foe.combat.stun.toFixed(4),
          ].join(' '));
          r.tick();
        }
        return out;
      };
      const a = record(assisted);
      const b = record(plain);
      assert.deepEqual(a, b, why);
      assert.ok(assisted.foe.combat.launchPoint > 0 || assisted.events.some((e) => e.attacker === assisted.player), `${why}: it lands`);
    }
  }
});

test('already in reach: the attack starts at once, with no approach and no Energy spent', () => {
  for (const c of playableCharacters()) {
    for (const { action, id } of groundMelee(c)) {
      const r = rig({ character: c });
      placeFoe(r, r.player.attacks[id], -5);
      const energy = r.player.combat.energy;
      const x = r.player.body.x;
      r.tick(press(action));
      assert.equal(r.player.combatAssist, null, `#${c.id} ${action}`);
      assert.equal(r.player.combat.attack?.def.id, id);
      assert.equal(r.player.combat.energy, energy);
      assert.ok(Math.abs(r.player.body.x - x) < 1);
    }
  }
});

test('too far for one Dash: the attack starts where the fighter stands and may whiff; no approach, no Energy', () => {
  for (const c of playableCharacters()) {
    for (const { action, id } of groundMelee(c)) {
      const r = rig({ character: c });
      const range = assistRange(r.player);
      assert.ok(Math.abs(range - MV.dashSpeed * MV.dashDuration) < EPS, 'one grounded Dash\'s travel');
      placeFoe(r, r.player.attacks[id], range + 5);
      const energy = r.player.combat.energy;
      r.tick(press(action));
      assert.equal(r.player.combatAssist, null, `#${c.id} ${action}`);
      assert.equal(r.player.combat.attack?.def.id, id);
      assert.equal(r.player.combat.energy, energy);
      // Its own motion only (a step-in, a roll), never a run across the stage.
      for (let i = 0; i < 60; i++) r.tick();
      assert.equal(r.events.filter((e) => e.attacker === r.player).length, 0, 'a whiff');
      // Just inside the limit (measured from the box its strike is drawn
      // with, never its motion), the same press is assisted.
      const near = rig({ character: c });
      placeFoe(near, near.player.attacks[id], range - ASSIST_MARGIN - 1, near.player.attacks[id].hitbox);
      near.tick(press(action));
      assert.ok(near.player.combatAssist, `#${c.id} ${action}: within one Dash`);
    }
  }
});

test('turned off, every press behaves exactly as without the feature: movement, attacks, Energy and input all unchanged', () => {
  const script = (i) => {
    if (i === 2) return press('attack1');
    if (i === 40) return { runRight: true, runRightPressed: true };
    if (i >= 40 && i < 52) return { runRight: true };
    if (i === 60) return press('extra_attack');
    if (i === 90) return press('attack2');
    if (i === 140) return { runRight: true, runRightPressed: true };
    if (i === 143) return { runRight: true, runRightPressed: true };
    if (i === 150) return press('attack1');
    if (i === 180) return press('jump');
    if (i === 190) return press('attack1');
    return {};
  };
  const run = (opts) => {
    const r = rig({ gap: 200, ...opts });
    const out = [];
    for (let i = 0; i < 260; i++) {
      r.tick(script(i));
      const p = r.player;
      out.push([p.state, frameName(p), p.body.x.toFixed(3), p.body.y.toFixed(3), p.combat.energy.toFixed(4), p.combat.attack?.def.id ?? '-', r.foe.combat.launchPoint].join(' '));
    }
    return out;
  };
  // Off, and a controller that knows nothing of Combat Assist at all.
  const off = run({ assist: false });
  const held = {};
  const bare = rig({ gap: 200, controller: { getInput: () => ({ ...blankInput(), ...held }) } });
  const without = [];
  for (let i = 0; i < 260; i++) {
    for (const k of Object.keys(held)) delete held[k];
    Object.assign(held, script(i));
    bare.tick();
    const p = bare.player;
    without.push([p.state, frameName(p), p.body.x.toFixed(3), p.body.y.toFixed(3), p.combat.energy.toFixed(4), p.combat.attack?.def.id ?? '-', bare.foe.combat.launchPoint].join(' '));
  }
  assert.deepEqual(off, without);
  assert.ok(!off.some((line) => line.startsWith('assist')));
  // On, the same script does differ: the first Jab closes in.
  const on = run({ assist: true });
  assert.ok(on.some((line) => line.startsWith('assist')));
  assert.notDeepEqual(on, off);
});

// ---- Never for anything but a grounded melee press ---------------------------------------

test('ranged attacks never get it: a projectile attack starts where the fighter stands, nothing paid', () => {
  for (const c of playableCharacters()) {
    const f = rig({ character: c }).player;
    const ranged = COMBAT_BUTTONS.filter((a) => {
      const id = f.attackFor(a, true);
      return id && isRangedAttack(f.attacks[id]);
    });
    assert.ok(ranged.length > 0, `#${c.id} has a projectile attack`);
    for (const action of ranged) {
      const r = rig({ character: c, gap: 150 });
      const energy = r.player.combat.energy;
      r.tick(press(action));
      assert.equal(r.player.combatAssist, null, `#${c.id} ${action}`);
      assert.equal(r.player.combat.attack?.def.id, r.player.attackFor(action, true));
      assert.equal(r.player.combat.energy, energy);
    }
  }
});

test('summons, techniques, pending attacks and reserved buttons never get it', () => {
  // A technique (#0001's attack4) and a reserved button (its transform).
  const t = rig({ gap: 150 });
  t.tick(press('attack4'));
  assert.ok(t.player.technique, 'the technique starts');
  assert.equal(t.player.combatAssist, null);
  assert.equal(t.player.combat.energy, t.player.combat.maxEnergy);
  const reserved = rig({ gap: 150 });
  reserved.tick(press('transform'));
  assert.equal(reserved.player.combatAssist, null);
  assert.equal(reserved.player.combat.attack, null);
  assert.equal(reserved.player.state, 'idle', 'a reserved button does nothing');
  // A summon (the sample fighter's attack3).
  const s = rig({ character: SAMPLE_FIGHTER, gap: 150 });
  s.tick(press('attack3'));
  assert.equal(s.player.combatAssist, null);
  assert.ok(s.player.pendingSummon || s.player.summons.length || s.clones.length, 'the summon goes out');
  // A pending attack: its clip plays where the fighter stands.
  const pendingFighter = variant('assist-pending', {
    attacks: { ...C1.attacks, extra_attack: { animation: 'extra_attack', pending: true } },
  });
  const p = rig({ character: pendingFighter, gap: 150 });
  p.tick(press('extra_attack'));
  assert.equal(p.player.combatAssist, null);
  assert.equal(p.player.combat.attack?.def.pending, true);
  assert.equal(p.player.combat.energy, p.player.combat.maxEnergy);
});

test('the Deflect never gets it: on the ground the button is the Shield, in the air the Deflect, as ever', () => {
  for (const c of playableCharacters()) {
    const g = rig({ character: c, gap: 150 });
    g.tick(press('shield'));
    assert.equal(g.player.combatAssist, null);
    assert.equal(g.player.combat.shielding, true, `#${c.id}: the Shield`);
    const r = rig({ character: c });
    airborne(r);
    placeFoe(r, r.player.deflect, 40);
    const energy = r.player.combat.energy;
    r.tick(press('shield'));
    assert.equal(r.player.combatAssist, null, `#${c.id}: no approach`);
    assert.equal(r.player.combat.attack?.def, r.player.deflect, `#${c.id}: the Deflect, where it is`);
    assert.equal(r.player.combat.energy, energy - DEFLECT_ENERGY_COST, `#${c.id}: the Deflect's own price, nothing more`);
  }
});

// ---- In the air ------------------------------------------------------------------------

// The player `steps` steps into a jump (Jump held throughout: past
// highJumpWindow it is the higher jump), so anywhere from just off the
// ground to the top of the arc.
function jumpFor(r, steps) {
  r.tick(press('jump'));
  for (let i = 1; i < steps; i++) r.tick({ jump: true });
  assert.equal(r.player.grounded, false);
  return r.player;
}

test('in the air, a melee press out of reach closes in straight at the target, from anywhere in a jump, and its mid-air attack lands', () => {
  let tried = 0;
  for (const c of playableCharacters()) {
    for (const { action, id } of meleeButtons(c, true)) {
      // A homing dash's own lock-on is its approach (tested below).
      if (rig({ character: c }).player.attacks[id].motion?.type === 'homing') continue;
      // Low in the jump, near its top, and high in the higher jump.
      for (const steps of [3, 8, 14]) {
        const why = `#${c.id} ${action} (${id}), ${steps} steps into a jump`;
        const r = rig({ character: c, gap: 150 });
        const { player, foe } = r;
        const atk = player.attacks[id];
        jumpFor(r, steps);
        // Its own reach already meets the target: the attack as ever.
        if (meleeGap(player, attackReach(atk), foe, 1) < 0) continue;
        tried++;
        const max = player.combat.energy;
        const airDashes = player.airDashes;
        const start = { x: player.body.x, y: player.body.y };
        r.tick(press(action));
        const a = player.combatAssist;
        assert.ok(a, `${why}: the approach starts`);
        assert.equal(a.air, true);
        assert.equal(a.attack, atk);
        assert.equal(player.state, 'assist');
        assert.equal(player.animator.anim.key, 'midair_mouvment', `${why}: the air dash's own clip`);
        assert.equal(frameName(player), `${c.id}_midair_mouvment_1.png`, `${why}: from its first frame`);
        assert.equal(player.combat.energy, max, `${why}: free, nothing paid`);
        assert.equal(player.airDashes, airDashes - 1, `${why}: it uses the airtime's air dash`);
        while (player.combatAssist) {
          const step = Math.hypot(player.body.x - player.body.prevX, player.body.y - player.body.prevY);
          assert.ok(step <= MV.airDashSpeed * DT + EPS, `${why}: never faster than the air dash (${step})`);
          assert.ok(Number.isFinite(player.body.x) && Number.isFinite(player.body.y), `${why}: a real position`);
          assert.equal(player.grounded, false, `${why}: it never lands on the way`);
          assert.equal(player.combat.attack, null, `${why}: no hitbox meanwhile`);
          r.tick();
        }
        assert.equal(player.combat.attack?.def, atk, `${why}: the very mid-air attack asked for`);
        assert.equal(player.combat.attack.airborne, true);
        assert.ok(Math.hypot(player.body.x - start.x, player.body.y - start.y) <= assistRange(player, true) + EPS, `${why}: one air dash at most`);
        for (let i = 0; i < 50 && !r.events.some((e) => e.attacker === player); i++) r.tick();
        assert.ok(r.events.some((e) => e.attacker === player && e.move === id), `${why}: it lands`);
        assert.ok(Number.isFinite(player.body.x) && Number.isFinite(player.body.y));
      }
    }
  }
  assert.ok(tried >= 10, `mid-air attacks tried from several heights (${tried})`);
});

test('at the target\'s height, low in a jump, the mid-air approach is the air dash\'s: flat across, only the gap covered', () => {
  const r = rig();
  const { player, foe } = r;
  const atk = player.attacks.midair_attack1;
  airborne(r);
  placeFoe(r, atk, 30);
  // Its box already shares the target's height, deep enough: no rise or fall.
  const y = player.body.y;
  const x0 = player.body.x;
  r.tick(press('attack1'));
  assert.ok(player.combatAssist?.air);
  assert.ok(Math.abs(player.body.vx - MV.airDashSpeed) < EPS, 'at the air dash\'s speed');
  while (player.combatAssist) {
    assert.equal(player.body.y, y, 'flat across, no fall');
    r.tick();
  }
  assert.equal(player.combat.attack?.def, atk);
  assert.ok(player.body.x - x0 < 30 + atk.hitbox.w, 'only into reach, never far past it');
  assert.ok(meleeGap(player, atk.hitbox, foe, 1) < -ASSIST_MARGIN, 'well into reach, not at its edge');
  assert.equal(player.body.vx, 0, 'stopped where it reached');
  assert.equal(player.body.vy, 0);
});

test('an attack that already reaches its target by its own motion needs no approach: a homing dash\'s lock-on, a roll\'s path', () => {
  for (const c of playableCharacters()) {
    for (const air of [true, false]) {
      for (const { action, id } of meleeButtons(c, air)) {
        const r = rig({ character: c });
        const atk = r.player.attacks[id];
        const reach = attackReach(atk);
        const box = atk.hitbox;
        // Only attacks whose own reach is longer than their box.
        if (reach.x + reach.w <= box.x + box.w) continue;
        if (air) airborne(r);
        // Out of the box's reach, inside the attack's own.
        placeFoe(r, atk, -5);
        assert.ok(meleeGap(r.player, box, r.foe, 1) > 0, `#${c.id} ${id}: out of its box's reach`);
        const energy = r.player.combat.energy;
        r.tick(press(action));
        assert.equal(r.player.combatAssist, null, `#${c.id} ${id}: no approach`);
        assert.equal(r.player.combat.attack?.def, atk, `#${c.id} ${id}: it starts at once`);
        assert.equal(r.player.combat.energy, energy);
      }
    }
  }
});

test('a homing attack is never served by an approach, however short its lock-on: it homes in by itself', () => {
  // Every playable fighter's homing attacks, beyond their lock-on.
  let homing = 0;
  for (const c of playableCharacters()) {
    for (const air of [true, false]) {
      for (const { action, id } of meleeButtons(c, air)) {
        const r = rig({ character: c });
        const atk = r.player.attacks[id];
        if (atk.motion?.type !== 'homing') continue;
        homing++;
        assert.equal(assistsAttack(atk), false, `#${c.id} ${id}`);
        if (air) airborne(r);
        placeFoe(r, atk, 20);
        const energy = r.player.combat.energy;
        r.tick(press(action));
        assert.equal(r.player.combatAssist, null, `#${c.id} ${id}`);
        assert.equal(r.player.combat.attack?.def, atk, `#${c.id} ${id}: it starts at once`);
        assert.equal(r.player.combat.energy, energy);
      }
    }
  }
  assert.ok(homing >= 2, 'both playable fighters have a homing attack');
  // A fighter whose homing attacks lock on from only 40 units: an attack
  // without homing would be assisted from where they are pressed, these
  // never are, on the ground or in the air.
  const shortLock = { type: 'homing', range: 40, speed: 900, rebound: 300, recoil: 100, exit: 0.2 };
  const homer = variant('assist-homer', {
    attacks: {
      ...C1.attacks,
      attack1: { ...C1.attacks.attack1, motion: shortLock },
      midair_attack1: { ...C1.attacks.midair_attack1, motion: shortLock },
    },
  });
  for (const air of [false, true]) {
    const r = rig({ character: homer });
    if (air) airborne(r);
    const atk = r.player.attacks[air ? 'midair_attack1' : 'attack1'];
    placeFoe(r, atk, 40);
    assert.ok(meleeGap(r.player, atk.hitbox, r.foe, 1) + ASSIST_MARGIN < assistRange(r.player, air), 'within an approach\'s range');
    r.tick(press('attack1'));
    assert.equal(r.player.combatAssist, null, air ? 'in the air' : 'on the ground');
    assert.equal(r.player.combat.attack?.def, atk, 'the homing attack, at once');
  }
  // The same box without homing is assisted from there.
  const plain = rig();
  airborne(plain);
  placeFoe(plain, plain.player.attacks.midair_attack1, 40);
  plain.tick(press('attack1'));
  assert.ok(plain.player.combatAssist);
  // Pressed while an approach runs, a homing attack is another move: the
  // approach ends and it starts at once, where the fighter is.
  const r = rig();
  airborne(r);
  placeFoe(r, r.player.attacks.midair_attack1, 60);
  r.tick(press('attack1'));
  assert.ok(r.player.combatAssist?.air);
  const energy = r.player.combat.energy;
  r.tick(press('attack2'));
  assert.equal(r.player.combatAssist, null);
  assert.equal(r.player.combat.attack?.def.id, 'midair_attack2', 'the Red Kick, at once');
  assert.ok(r.player.combat.energy >= energy, 'nothing more paid');
  assert.equal(watchAttacks(r, 60).has('midair_attack1'), false, 'the Floating Straight never comes');
});

test('in the air it takes the airtime\'s air dash: with none left there is no approach, but the attack still starts', () => {
  const r = rig();
  airborne(r);
  r.player.airDashes = 0;
  placeFoe(r, r.player.attacks.midair_attack1, 30);
  r.tick(press('attack1'));
  assert.equal(r.player.combatAssist, null);
  assert.equal(r.player.combat.attack?.def.id, 'midair_attack1', 'where it is');
  // After an approach, an air dash asked for has none left: it waits for the
  // ground, as one asked for with none left always does.
  const used = rig();
  airborne(used);
  placeFoe(used, used.player.attacks.midair_attack1, 30);
  used.tick(press('attack1'));
  assert.ok(used.player.combatAssist);
  assert.equal(used.player.airDashes, 0);
  untilAttack(used);
  for (let i = 0; i < 20; i++) used.tick();
  used.tick({ mouvementRightPressed: true });
  assert.equal(used.player.dash, null, 'no second burst in the same airtime');
  // Exhausted, it is the airtime's air dash that counts, never Energy: the
  // approach starts all the same, and costs none.
  const tired = rig();
  airborne(tired);
  tired.player.combat.setEnergy(0);
  placeFoe(tired, tired.player.attacks.midair_attack1, 30);
  tired.tick(press('attack1'));
  assert.ok(tired.player.combatAssist, 'exhausted, it still closes in');
  assert.equal(tired.player.airDashes, 0, 'with the airtime\'s air dash');
  assert.ok(Math.abs(tired.player.combat.energy - tired.player.energyDef.regen * DT) < 1e-9, 'nothing paid, the refill goes on');
});

test('in the air the newest melee press wins too, and an air jump, the Deflect, a Dash request or another move cancels it', () => {
  // Replaced: the High Kick instead of the Floating Straight.
  const swap = rig();
  airborne(swap);
  placeFoe(swap, swap.player.attacks.midair_attack1, 60);
  swap.tick(press('attack1'));
  swap.tick(press('extra_attack'));
  assert.equal(swap.player.combatAssist?.action, 'extra_attack');
  const energy = swap.player.combat.energy;
  untilAttack(swap);
  assert.equal(swap.player.combat.attack.def.id, 'extra_attack');
  assert.ok(swap.player.combat.energy >= energy, 'no second cost');
  assert.equal(watchAttacks(swap, 60).has('midair_attack1'), false);
  const closingAir = (character = C1, action = 'attack1') => {
    const r = rig({ character });
    airborne(r);
    placeFoe(r, r.player.attacks[r.player.attackFor(action, false)], 60);
    r.tick(press(action));
    assert.ok(r.player.combatAssist?.air, 'closing in, in the air');
    return r;
  };
  // An air jump: from where it is, on that step.
  const jump = closingAir();
  const jumps = jump.player.airJumps;
  jump.tick(press('jump'));
  assert.equal(jump.player.combatAssist, null);
  assert.equal(jump.player.airJumps, jumps - 1, 'an air jump');
  assert.ok(jump.player.body.vy < 0);
  assert.equal(watchAttacks(jump, 60).has('midair_attack1'), false);
  // The Deflect.
  const deflect = closingAir();
  deflect.tick(press('shield'));
  assert.equal(deflect.player.combatAssist, null);
  assert.equal(deflect.player.combat.attack?.def, deflect.player.deflect);
  // A Dash request: no air dash is left, so it waits for the ground.
  const dash = closingAir();
  dash.tick({ mouvementRightPressed: true });
  assert.equal(dash.player.combatAssist, null);
  assert.equal(dash.player.dash, null);
  assert.equal(watchAttacks(dash, 60).has('midair_attack1'), false);
  // Another move: #0002's Whirlwind (a projectile attack) cancels its
  // approach for the Bounce Attack.
  const other = closingAir(getCharacter('0002'), 'attack2');
  other.tick(press('extra_attack'));
  assert.equal(other.player.combatAssist, null);
  assert.equal(watchAttacks(other, 60).has('midair_attack2'), false);
  // A hit.
  const hit = closingAir();
  hit.system.applyHit(hit.foe, hit.player, hit.foe.attacks.attack1);
  assert.equal(hit.player.combatAssist, null);
});

test('in the air it never passes a wall, a ceiling or a floor in the way, nor goes further than one air dash: no approach, the attack where it is', () => {
  // A pillar between them.
  const walled = new StageCollision(stageMap({ solids: [{ id: 'pillar', x: 860, y: 600, w: 20, h: 200 }] }));
  const r = rig({ stage: walled, x: 800, gap: 120 });
  airborne(r);
  r.tick(press('attack1'));
  assert.equal(r.player.combatAssist, null);
  assert.equal(r.player.combat.attack?.def.id, 'midair_attack1');
  // A platform it would land on, diving at a target past it.
  // (The dive ends with the attacker's feet about 40 units over the
  // target's: a deck lower than that is no obstacle, one higher is.)
  const below = new StageCollision(stageMap({ platforms: [{ id: 'deck', x: 830, y: 775, w: 60, h: 16 }] }));
  const clear = rig({ stage: below, x: 800, gap: 160 });
  jumpFor(clear, 14);
  clear.tick(press('attack1'));
  assert.ok(clear.player.combatAssist, 'over a low deck it still dives');
  const decked = new StageCollision(stageMap({ platforms: [{ id: 'deck', x: 830, y: 745, w: 60, h: 16 }] }));
  const d = rig({ stage: decked, x: 800, gap: 160 });
  jumpFor(d, 14);
  assert.ok(d.player.body.y < 745 - 90, 'well above the deck');
  d.tick(press('attack1'));
  assert.equal(d.player.combatAssist, null, 'it would land on the deck on the way');
  // Beyond one air dash's travel, straight line: high in the higher jump,
  // the target far along the floor.
  const far = rig({ gap: 230 });
  jumpFor(far, 22);
  far.tick(press('attack1'));
  assert.equal(far.player.combatAssist, null);
  assert.equal(far.player.combat.attack?.def.id, 'midair_attack1', 'it starts where it is, and may whiff');
  // A wall reached mid-way ends it: the target moved behind the pillar.
  const mid = rig({ stage: walled, x: 700, gap: 150 });
  airborne(mid);
  mid.tick(press('attack1'));
  assert.ok(mid.player.combatAssist);
  mid.foe.body.x = 940;
  mid.foe.body.prevX = 940;
  mid.tick();
  assert.equal(mid.player.combatAssist, null);
  assert.equal(watchAttacks(mid, 40).has('midair_attack1'), false);
});

test('what an attack reaches is its own data: a longer box stops the approach sooner, whoever the fighter is', () => {
  const long = variant('assist-long', {
    attacks: { ...C1.attacks, attack1: { ...C1.attacks.attack1, hitbox: { x: 12, y: -82, w: 90, h: 26 } } },
  });
  const stopAt = (character) => {
    const r = rig({ character, gap: 230 });
    r.tick(press('attack1'));
    assert.ok(r.player.combatAssist);
    untilAttack(r);
    return r.foe.body.x - r.player.body.x;
  };
  const short = stopAt(C1);
  const longer = stopAt(long);
  assert.ok(Math.abs(longer - short - 62) < 1e-3, `the box is 62 units longer: ${short} vs ${longer}`);
  // An attack whose box is behind the fighter could only reach through its
  // target: no approach.
  const behind = variant('assist-behind', {
    attacks: { ...C1.attacks, attack1: { ...C1.attacks.attack1, hitbox: { x: -60, y: -82, w: 30, h: 26 } } },
  });
  const r = rig({ character: behind, gap: 120 });
  r.tick(press('attack1'));
  assert.equal(r.player.combatAssist, null);
  assert.equal(r.player.combat.attack?.def.id, 'attack1');
  // The rules name no fighter, slot or label.
  for (const file of ['js/game/combat/combat-assist.js']) {
    const src = read(file).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(src, /'0001'|'0002'|#000|slot|label|'p1'|'P1'/, file);
  }
  const fighter = read('js/game/fighters/fighter.js');
  const body = fighter.slice(fighter.indexOf('get combatAssistOn()'), fighter.indexOf('cancelCombatAssist() {'));
  assert.doesNotMatch(body, /slot|label|'p1'|'P1'|'000\d'/);
});

// ---- Energy ---------------------------------------------------------------------------

test('Energy: Combat Assist costs none at all, as it starts, for a replacement or on a cancel, and the refill never stops for it', () => {
  for (const c of playableCharacters()) {
    const r = rig({ character: c, gap: 240 });
    const { player } = r;
    const { regen } = player.energyDef;
    const from = 40;
    player.combat.setEnergy(from);
    r.tick(press('attack1'));
    assert.ok(player.combatAssist, `#${c.id}: closing in`);
    assert.ok(Math.abs(player.combat.energy - (from + regen * DT)) < 1e-9, `#${c.id}: nothing paid, refilled on its very step`);
    r.tick();
    assert.ok(Math.abs(player.combat.energy - (from + 2 * regen * DT)) < 1e-9, `#${c.id}: refilling on`);
    r.tick(press('attack1'));
    assert.ok(player.combatAssist, `#${c.id}: still closing in`);
    assert.ok(Math.abs(player.combat.energy - (from + 3 * regen * DT)) < 1e-9, `#${c.id}: a replacement pays nothing`);
    r.tick(press('jump'));
    assert.equal(player.combatAssist, null, 'cancelled');
    assert.ok(Math.abs(player.combat.energy - (from + 4 * regen * DT)) < 1e-9, `#${c.id}: nothing to give back, nothing given`);
  }
});

test('full, partly spent or exhausted, the approach starts the same and never touches Energy', () => {
  for (const c of playableCharacters()) {
    for (const { action, id } of groundMelee(c)) {
      for (const energy of [100, 55, 3, 0]) {
        const why = `#${c.id} ${action} on ${energy}`;
        const r = rig({ character: c });
        placeFoe(r, r.player.attacks[id], 80);
        r.player.combat.setEnergy(energy);
        const exhausted = r.player.combat.energyExhausted;
        assert.equal(exhausted, energy === 0, why);
        r.tick(press(action));
        assert.ok(r.player.combatAssist, `${why}: it closes in`);
        assert.equal(r.player.combatAssist.attack, r.player.attacks[id], why);
        const expected = Math.min(100, energy + r.player.energyDef.regen * DT);
        assert.ok(Math.abs(r.player.combat.energy - expected) < 1e-9, `${why}: nothing spent, the refill as ever`);
        assert.equal(r.player.combat.energyExhausted, exhausted, `${why}: it never exhausts anyone`);
        untilAttack(r);
        assert.equal(r.player.combat.attack?.def.id, id, `${why}: its attack, once in reach`);
      }
    }
  }
});

// ---- The newest melee press wins -----------------------------------------------------------

test('a melee press while closing in replaces the attack it ends in: only the newest comes out, never the first', () => {
  const r = rig();
  const { player } = r;
  placeFoe(r, player.attacks.attack1, 150);
  r.tick(press('attack1'));
  assert.equal(player.combatAssist.action, 'attack1');
  r.tick(press('extra_attack'));
  assert.equal(player.combatAssist?.action, 'extra_attack', 'replaced');
  assert.equal(player.combatAssist.attack, player.attacks.extra_attack);
  assert.equal(player.bufferedAttack, null, 'the Jab is not kept anywhere');
  untilAttack(r);
  assert.equal(player.combat.attack.def.id, 'extra_attack');
  const later = watchAttacks(r, 90);
  assert.ok(!later.has('attack1') && !later.has('buffered:attack1'), [...later].join());
  // Several in a row: the newest each time.
  const many = rig({ character: getCharacter('0002') });
  placeFoe(many, many.player.attacks.attack1, 170);
  many.tick(press('attack1'));
  many.tick(press('attack2'));
  assert.equal(many.player.combatAssist.action, 'attack2');
  many.tick(press('attack3'));
  assert.equal(many.player.combatAssist.action, 'attack3');
  many.tick(press('attack1'));
  assert.equal(many.player.combatAssist?.action, 'attack1');
  untilAttack(many);
  assert.equal(many.player.combat.attack.def.id, 'attack1');
  const after = watchAttacks(many, 120);
  assert.deepEqual([...after].filter((id) => id !== 'attack1'), [], 'nothing replaced ever comes out');
});

test('a replacement re-measures the approach: its own reach decides where it stops, and one already in reach starts at once', () => {
  // A replacement's own reach: the High Kick reaches further than the Jab.
  const kick = rig();
  placeFoe(kick, kick.player.attacks.attack1, 150);
  kick.tick(press('extra_attack'));
  untilAttack(kick);
  const kickStop = kick.foe.body.x - kick.player.body.x;
  const jab = rig();
  placeFoe(jab, jab.player.attacks.attack1, 150);
  jab.tick(press('attack1'));
  untilAttack(jab);
  const jabStop = jab.foe.body.x - jab.player.body.x;
  assert.ok(kickStop > jabStop + 10, `${kickStop} vs ${jabStop}`);
  const swap = rig();
  placeFoe(swap, swap.player.attacks.attack1, 150);
  swap.tick(press('attack1'));
  swap.tick(press('extra_attack'));
  untilAttack(swap);
  assert.ok(Math.abs(swap.foe.body.x - swap.player.body.x - kickStop) < 1e-6, 'it stops where the High Kick reaches');
  // Already in reach the moment it replaces: no more approach.
  const r = rig();
  const { player, foe } = r;
  placeFoe(r, player.attacks.attack1, 60);
  r.tick(press('attack1'));
  r.tick();
  const kickGap = meleeGap(player, player.attacks.extra_attack.hitbox, foe, 1);
  assert.ok(player.combatAssist && meleeGap(player, player.attacks.attack1.hitbox, foe, 1) > 0, 'the Jab is still short');
  assert.ok(kickGap < -ASSIST_MARGIN, 'the High Kick already reaches');
  const x = player.body.x;
  r.tick(press('extra_attack'));
  assert.equal(player.combatAssist, null);
  assert.equal(player.combat.attack?.def.id, 'extra_attack', 'on that very step');
  assert.equal(player.combat.attack.time, 0);
  assert.ok(player.body.x - x < 1, 'no further approach');
});

test('a replacement that cannot start (its cooldown) ends the approach with nothing, never the older attack', () => {
  const r = rig();
  const { player } = r;
  placeFoe(r, player.attacks.attack1, 150);
  player.combat.cooldowns.set('extra_attack', 1);
  r.tick(press('attack1'));
  r.tick(press('extra_attack'));
  assert.equal(player.combatAssist, null);
  const seen = watchAttacks(r, 90);
  assert.equal(seen.size, 0, [...seen].join());
});

// ---- Cancelled ------------------------------------------------------------------------------

// A player closing in on its target with the Jab, several steps from it.
function closing(opts = {}) {
  const r = rig(opts);
  placeFoe(r, r.player.attacks.attack1, 170);
  r.tick(press('attack1'));
  r.tick();
  assert.ok(r.player.combatAssist, 'closing in');
  return r;
}

test('a jump cancels it and jumps on that very step; the Jab never comes', () => {
  const r = closing();
  const energy = r.player.combat.energy;
  r.tick(press('jump'));
  assert.equal(r.player.combatAssist, null);
  assert.ok(r.player.body.vy < 0 && !r.player.grounded, 'airborne at once');
  assert.ok(r.player.combat.energy >= energy, 'no Energy back, none spent');
  const seen = watchAttacks(r, 90);
  assert.ok(!seen.has('attack1') && !seen.has('midair_attack1'), [...seen].join());
});

test('a Dash, by double tap or mouvement button, cancels it and Dashes by the ordinary rules, paying its own cost', () => {
  for (const ask of ['tap', 'button']) {
    const r = closing();
    const { player } = r;
    if (ask === 'tap') {
      r.tick({ runRight: true, runRightPressed: true });
      assert.ok(player.combatAssist, 'a single press is no Dash and changes nothing');
      r.tick({});
    }
    const energy = player.combat.energy;
    r.tick(ask === 'tap' ? { runRight: true, runRightPressed: true } : { mouvementRightPressed: true });
    assert.equal(player.combatAssist, null, ask);
    assert.ok(player.dash, `${ask}: a real Dash`);
    assert.equal(player.state, 'dash');
    assert.ok(Math.abs(player.combat.energy - (energy - player.energyDef.dashCost)) < 1e-9, `${ask}: its own dashCost`);
    const seen = watchAttacks(r, 90);
    assert.equal(seen.has('attack1'), false, ask);
  }
  // Either way: a Dash the other way, too.
  const back = closing();
  back.tick({ mouvementLeftPressed: true });
  assert.equal(back.player.dash?.direction, -1);
});

test('the Shield cancels it and goes up at once; in the air the same button is a Deflect, as ever', () => {
  const r = closing();
  r.tick(press('shield'));
  assert.equal(r.player.combatAssist, null);
  assert.equal(r.player.combat.shielding, true, 'the Shield is up on that step');
  for (let i = 0; i < 20; i++) r.tick({ shield: true });
  assert.equal(r.player.combat.shielding, true);
  assert.equal(watchAttacks(r, 60).has('attack1'), false);
  // Lifted off its ground mid-approach (as a pull may), the shield press is
  // the Deflect: it cancels the approach and starts by the ordinary rules.
  const lifted = closing();
  const { player } = lifted;
  player.body.grounded = false;
  player.body.ground = null;
  player.body.y -= 40;
  player.body.vy = -200;
  lifted.tick(press('shield'));
  assert.equal(player.combatAssist, null);
  assert.equal(player.combat.attack?.def, player.deflect, 'the Deflect');
  assert.equal(watchAttacks(lifted, 60).has('attack1'), false);
});

test('any other move pressed while closing in cancels it and starts as ever on that step: a projectile, a technique, a summon', () => {
  const shot = closing();
  shot.tick(press('attack2'));
  assert.equal(shot.player.combatAssist, null);
  assert.equal(shot.player.combat.attack?.def.id, 'attack2', 'the throw, at once');
  const seenShot = watchAttacks(shot, 90);
  assert.ok(shot.projectiles.length > 0 || shot.events.some((e) => e.projectile), 'its projectile went out');
  assert.equal(seenShot.has('attack1'), false);
  const technique = closing();
  technique.tick(press('attack4'));
  assert.equal(technique.player.combatAssist, null);
  assert.ok(technique.player.technique, 'the technique, at once');
  assert.equal(watchAttacks(technique, 120).has('attack1'), false);
  const summon = closing({ character: SAMPLE_FIGHTER });
  summon.tick(press('attack3'));
  assert.equal(summon.player.combatAssist, null);
  assert.ok(summon.player.pendingSummon || summon.player.summons.length || summon.clones.length, 'the summon, at once');
  assert.equal(watchAttacks(summon, 120).has('attack1'), false);
  // A pending attack is another move too: it plays, the Jab never comes.
  const pendingFighter = variant('assist-pending', {
    attacks: { ...C1.attacks, extra_attack: { animation: 'extra_attack', pending: true } },
  });
  const pending = closing({ character: pendingFighter });
  pending.tick(press('extra_attack'));
  assert.equal(pending.player.combatAssist, null);
  assert.equal(pending.player.combat.attack?.def.pending, true);
  assert.equal(watchAttacks(pending, 90).has('attack1'), false);
  // A reserved button does nothing at all, the approach included.
  const reserved = closing();
  reserved.tick(press('transform'));
  assert.ok(reserved.player.combatAssist, 'still closing in');
});

test('a hit or a paralysis cancels it: never invulnerable, and the Jab never comes', () => {
  const r = closing();
  const { player, foe, system } = r;
  const event = system.applyHit(foe, player, foe.attacks.attack1);
  assert.equal(event.type, 'hit', 'it can be hit while closing in');
  assert.equal(player.combatAssist, null, 'on the hit itself');
  assert.equal(player.state, 'hitstun');
  assert.equal(watchAttacks(r, 90).has('attack1'), false);
  const held = closing();
  held.player.combat.paralyze(0.5);
  held.tick();
  assert.equal(held.player.combatAssist, null);
  assert.equal(held.player.state, 'bound');
  assert.equal(watchAttacks(held, 90).has('attack1'), false);
});

test('ground lost, a target gone, a reset or a respawn ends it with nothing left behind', () => {
  // Lifted off its ground (as a pull may).
  const lifted = closing();
  lifted.player.body.grounded = false;
  lifted.player.body.y -= 30;
  lifted.tick();
  assert.equal(lifted.player.combatAssist, null);
  assert.equal(watchAttacks(lifted, 90).has('attack1'), false);
  // Its target lost to the Void, or taken out (another opponent instead).
  const lost = closing();
  lost.foe.lostToVoid = true;
  lost.tick();
  assert.equal(lost.player.combatAssist, null);
  assert.equal(watchAttacks(lost, 60).has('attack1'), false);
  const swapped = closing();
  swapped.player.opponent = rig().foe;
  swapped.tick();
  assert.equal(swapped.player.combatAssist, null);
  const gone = closing();
  gone.player.opponent = null;
  gone.tick();
  assert.equal(gone.player.combatAssist, null);
  // A reset or a respawn: a clean fighter.
  for (const how of ['reset', 'respawn']) {
    const r = closing();
    r.player[how](FLAT);
    assert.equal(r.player.combatAssist, null, how);
    assert.equal(r.player.state, 'idle');
    assert.equal(watchAttacks(r, 60).has('attack1'), false, how);
  }
});

test('in a mode: the Void, a removed or replaced practice CPU, the arena going and a restart each end it', () => {
  const canvas = { getContext: () => ({}) };
  const sprites = fakeSpritesOf(C1);
  const held = {};
  const input = { flush() {}, sample: () => ({ ...blankInput(), ...held }) };
  const start = (arena, player, foe) => {
    player.body.x = foe.body.x - 40 - 170;
    player.body.prevX = player.body.x;
    player.facing = 1;
    foe.facing = -1;
    Object.assign(held, press('attack1'));
    arena.update(DT);
    for (const k of Object.keys(held)) delete held[k];
    assert.ok(player.combatAssist, 'closing in');
  };
  const session = new PracticeSession({ canvas, map: PRACTICE_MAP, def: C1, sprites, input });
  session.setCPU(C1, sprites);
  start(session, session.player, session.cpu);
  session.removeCPU();
  assert.equal(session.player.combatAssist, null, 'its target taken out');
  session.setCPU(C1, sprites);
  start(session, session.player, session.cpu);
  session.setCPU(C1, sprites);
  assert.equal(session.player.combatAssist, null, 'its target replaced');
  start(session, session.player, session.cpu);
  session.detachFromPlay(session.cpu, 'void');
  assert.equal(session.player.combatAssist, null, 'its target lost to the Void');
  start(session, session.player, session.cpu);
  session.detachFromPlay(session.player, 'void');
  assert.equal(session.player.combatAssist, null, 'the fighter lost to the Void');
  start(session, session.player, session.cpu);
  const player = session.player;
  session.destroy();
  assert.equal(player.combatAssist, null, 'the arena going');
  const battle = new Battle({ canvas, map: getMap('desert'), p1Def: C1, p2Def: C1, p1Sprites: sprites, p2Sprites: sprites, input, seed: 4 });
  battle.p2.controller = null;
  battle.setPhase('fight');
  start(battle, battle.p1, battle.p2);
  battle.restart();
  assert.equal(battle.p1.combatAssist, null, 'a restart');
  battle.setPhase('fight');
  start(battle, battle.p1, battle.p2);
  battle.setPhase('timeup');
  battle.update(DT);
  assert.equal(battle.p1.combatAssist, null, 'its input locked: time up');
});

// ---- The stage ---------------------------------------------------------------------------------

test('a wall between them: no approach (the attack starts where it stands); a wall reached mid-way ends it', () => {
  // A wall from x 880 to 900, standing on the floor.
  const walled = new StageCollision(stageMap({ solids: [{ id: 'wall', x: 880, y: 700, w: 20, h: 100 }] }));
  const r = rig({ stage: walled, x: 850, gap: 160 });
  r.tick(press('attack1'));
  assert.equal(r.player.combatAssist, null);
  assert.equal(r.player.combat.attack?.def.id, 'attack1');
  // No wall on the way at first; then the target is past one.
  const r2 = rig({ stage: walled, x: 700, gap: 160 });
  r2.tick(press('attack1'));
  assert.ok(r2.player.combatAssist);
  r2.foe.body.x = 940;
  r2.foe.body.prevX = 940;
  r2.tick();
  assert.equal(r2.player.combatAssist, null);
  assert.equal(r2.player.body.vx, 0, 'it stops where it is');
  assert.ok(r2.player.body.x + r2.player.body.halfW <= 880 + EPS);
  assert.equal(watchAttacks(r2, 60).has('attack1'), false);
});

test('a ledge: never an approach off its ground, never an aerial Dash; one whose target moves past a ledge stops at it', () => {
  // The main floor ends at 1000; the target stands on an island across a gap.
  const islands = new StageCollision(stageMap({ left: 0, right: 1000, solids: [{ id: 'island', x: 1050, y: 800, w: 400, h: 200 }] }));
  const r = rig({ stage: islands, x: 960, gap: 130 });
  assert.ok(r.foe.grounded && r.player.grounded);
  r.tick(press('attack1'));
  assert.equal(r.player.combatAssist, null, 'the stop would be over the gap');
  assert.equal(r.player.combat.attack?.def.id, 'attack1');
  for (let i = 0; i < 30; i++) r.tick();
  assert.equal(r.player.grounded, true, 'still on its ground');
  // Closing in on its target at the main floor's edge, which then steps
  // onto the island: the stop it would need now is over the gap.
  const r2 = rig({ stage: islands, x: 880, gap: 120 });
  r2.tick(press('attack1'));
  assert.ok(r2.player.combatAssist);
  r2.foe.body.x = 1085;
  r2.foe.body.prevX = 1085;
  const x = r2.player.body.x;
  r2.tick();
  assert.equal(r2.player.combatAssist, null, 'ended at the ledge');
  assert.equal(r2.player.body.vx, 0, 'stopped, never carried off');
  assert.ok(Math.abs(r2.player.body.x - x) < EPS);
  const seen = watchAttacks(r2, 40);
  assert.equal(seen.has('attack1'), false);
  assert.equal(r2.player.grounded, true, 'it never went off the ledge');
  assert.ok(r2.player.body.x <= 1000 + r2.player.body.halfW);
  assert.equal(r2.player.dash, null, 'no Dash of any kind');
});

test('another level is out of reach: no approach to a target on a platform above or below', () => {
  const stage = new StageCollision(stageMap({ platforms: [{ id: 'high', x: 900, y: 640, w: 300, h: 16 }] }));
  const r = rig({ stage, x: 840, gap: 140 });
  // The foe on the platform above, within a Dash across.
  r.foe.body.y = 640;
  r.foe.body.grounded = true;
  r.foe.body.ground = stage.platforms[0];
  r.tick(press('attack1'));
  assert.equal(r.player.combatAssist, null);
  assert.equal(r.player.combat.attack?.def.id, 'attack1', 'it starts where it stands');
  // From the platform down to the floor, the same.
  const down = rig({ stage, x: 960, gap: 140 });
  down.player.body.y = 640;
  down.player.body.grounded = true;
  down.player.body.ground = stage.platforms[0];
  down.tick(press('attack1'));
  assert.equal(down.player.combatAssist, null);
});

test('while closing in it strikes nothing, never passes through its target and is drawn as its Dash', () => {
  for (const c of playableCharacters()) {
    for (const { action, id } of groundMelee(c)) {
      const r = rig({ character: c });
      placeFoe(r, r.player.attacks[id], 60);
      r.tick(press(action));
      assert.ok(r.player.combatAssist, `#${c.id} ${action}`);
      const contact = (r.player.def.pushbox.width + r.foe.def.pushbox.width) / 2;
      while (r.player.combatAssist) {
        assert.equal(r.player.combat.attack, null, 'no hitbox');
        assert.equal(r.events.filter((e) => e.attacker === r.player).length, 0, 'no damage');
        assert.ok(r.foe.body.x - r.player.body.x >= contact - EPS, `#${c.id} ${action}: never into its target`);
        assert.equal(r.player.facing, 1, 'facing its target throughout');
        assert.equal(r.player.animator.anim.key, 'mouvment');
        r.tick();
      }
      assert.ok(r.foe.body.x - r.player.body.x > 0, 'still in front of it');
    }
  }
});

// ---- Who has it ---------------------------------------------------------------------------------

test('only a player\'s controller with the setting on has it: never by slot, label or fighter, never a CPU', () => {
  const on = new PlayerController({ sample: blankInput });
  assert.equal(on.kind, 'player');
  assert.equal(on.combatAssist, true, 'on by default, as the setting');
  assert.equal(new PlayerController({ sample: blankInput }, { combatAssist: false }).combatAssist, false);
  assert.equal(new PlayerController({ sample: blankInput }, { combatAssist: 'yes' }).combatAssist, false, 'only a real true');
  const sprites = fakeSpritesOf(C1);
  const has = (controller, slot = 'p1', label = 'P1') => new Fighter({
    def: C1, sprites, stage: FLAT, slot, label, spawn: { x: 800, facing: 1 }, controller,
  }).combatAssistOn;
  assert.equal(has(on), true);
  assert.equal(has(on, 'p2', 'CPU'), true, 'a player is a player whatever its slot or label');
  assert.equal(has(new CombatAIController({ rng: mulberry32(1) })), false, 'P1\'s slot and label make no CPU a player');
  assert.equal(has(new TrainingAIController({ rng: mulberry32(1) })), false);
  assert.equal(has(null), false, 'the training dummy has no controller');
  assert.equal(has({ getInput: blankInput, combatAssist: true }), false, 'not a player\'s');
  assert.equal(has({ getInput: blankInput, kind: 'player' }), false, 'a player that has not turned it on');
  // And the CPU's controller never carries the setting.
  assert.equal('combatAssist' in new CombatAIController({ rng: mulberry32(1) }), false);
  assert.doesNotMatch(read('js/game/ai/combat-ai.js'), /combatAssist|Combat Assist/);
});

test('Quick Battle gives it to Player 1 only, as saved; Watch Mode to nobody; Practice Ground to the player, never the CPU', () => {
  const canvas = { getContext: () => ({}) };
  const sprites = fakeSpritesOf(C1);
  const input = { flush() {}, sample: blankInput };
  const battle = (opts) => new Battle({ canvas, map: getMap('desert'), p1Def: C1, p2Def: C1, p1Sprites: sprites, p2Sprites: sprites, input, seed: 2, ...opts });
  const quick = battle({});
  assert.equal(quick.p1.combatAssistOn, true, 'on by default');
  assert.equal(quick.p2.combatAssistOn, false, 'never the CPU');
  assert.ok(quick.p2.controller instanceof CombatAIController);
  const off = battle({ combatAssist: false });
  assert.equal(off.p1.combatAssistOn, false);
  assert.equal(off.p2.combatAssistOn, false);
  for (const combatAssist of [true, false]) {
    const watch = battle({ mode: 'watch', combatAssist });
    assert.equal(watch.p1.combatAssistOn, false, 'CPU 1');
    assert.equal(watch.p2.combatAssistOn, false, 'CPU 2');
    assert.ok(watch.p1.controller instanceof CombatAIController && watch.p2.controller instanceof CombatAIController);
    // A restart or rematch keeps it that way.
    watch.restart();
    assert.equal(watch.p1.combatAssistOn || watch.p2.combatAssistOn, false);
  }
  quick.restart();
  assert.equal(quick.p1.combatAssistOn, true, 'a restart keeps the player\'s');
  for (const combatAssist of [true, false]) {
    const session = new PracticeSession({ canvas, map: PRACTICE_MAP, def: C1, sprites, input, combatAssist });
    session.setCPU(C1, sprites);
    assert.equal(session.player.combatAssistOn, combatAssist);
    assert.equal(session.cpu.combatAssistOn, false, 'the practice CPU');
    session.setFighter(getCharacter('0002'), fakeSpritesOf(getCharacter('0002')));
    assert.equal(session.player.combatAssistOn, combatAssist, 'Change Fighter keeps it');
  }
  assert.equal(new PracticeSession({ canvas, map: PRACTICE_MAP, def: C1, sprites, input }).player.combatAssistOn, true, 'on by default');
});

test('the setting never changes a CPU: its decisions and movement are the same with the player\'s Combat Assist on or off', () => {
  const canvas = { getContext: () => ({}) };
  const sprites = fakeSpritesOf(C1);
  const run = (combatAssist) => {
    const input = { flush() {}, sample: blankInput };
    const b = new Battle({ canvas, map: getMap('desert'), p1Def: C1, p2Def: C1, p1Sprites: sprites, p2Sprites: sprites, input, seed: 7, combatAssist });
    b.fx = { take() {}, takeBounce() {}, reset() {}, timeScale: 1, sampleTrail() {} };
    b.setPhase('fight');
    const out = [];
    for (let i = 0; i < 900; i++) {
      b.update(DT);
      const c = b.p2;
      out.push([JSON.stringify(c.controller.out), c.body.x.toFixed(3), c.body.y.toFixed(3), c.state, c.combat.attack?.def.id ?? '-', b.p1.combat.launchPoint].join(' '));
    }
    return out;
  };
  const on = run(true);
  assert.deepEqual(on, run(false));
  assert.ok(new Set(on.map((l) => l.split(' ')[4])).size > 1, 'the CPU really fought');
  // Two CPUs fighting never close in this way, whatever they press.
  for (const c of playableCharacters()) {
    const { log, a, b } = cpuFight(c, c, { seconds: 12, seed: 5 });
    for (const f of [a, b]) {
      assert.equal(f.combatAssistOn, false);
      assert.ok(!log.get(f).some((s) => s.state === 'assist'), `#${c.id}`);
    }
  }
});

// ---- Deterministic -------------------------------------------------------------------------------------

test('fixed-step and deterministic: the same presses give the same approach, from simulation data alone', () => {
  const run = () => {
    const r = rig({ character: getCharacter('0002'), gap: 210 });
    const out = [];
    const script = { 0: press('attack1'), 3: press('attack2'), 30: press('attack3'), 70: press('attack1'), 72: press('jump') };
    for (let i = 0; i < 160; i++) {
      r.tick(script[i] ?? {});
      out.push([r.player.state, r.player.body.x, r.player.body.y, r.player.combat.energy, r.player.combatAssist?.action ?? '-'].join(' '));
    }
    return out;
  };
  assert.deepEqual(run(), run());
  // Simulation data only: no clock, timer, randomness, DOM or render position.
  const src = read('js/game/combat/combat-assist.js');
  assert.doesNotMatch(src, /Math\.random|Date\.|performance\.|setTimeout|setInterval|requestAnimationFrame|document|window|renderX|renderY|interpolate/);
  const fighter = read('js/game/fighters/fighter.js');
  const assist = fighter.slice(fighter.indexOf('get combatAssistOn()'), fighter.indexOf('cancelCombatAssist() {'));
  assert.doesNotMatch(assist, /Math\.random|Date\.|setTimeout|renderX|renderY/);
});

test('Combat Assist ignores and never starts Dash timers, but completion still checks the attack timer', () => {
  for (const coolingDash of [false, true]) {
    const r = rig();
    const f = r.player;
    placeFoe(r, f.attacks.attack1, 80);
    if (coolingDash) f.combat.movementCooldowns.start('mouvment', 0.5);
    r.tick(press('attack1'));
    assert.ok(f.combatAssist, 'approach allowed even while real Dash cools');
    assert.equal(f.combat.movementCooldowns.size, coolingDash ? 1 : 0, 'approach did not create a timer');
    const before = f.combat.movementCooldowns.remaining('mouvment');
    f.combat.cooldowns.set('attack1', 5);
    f.finishCombatAssist(0);
    assert.equal(f.combat.attack, null, 'no attack through cooldown');
    assert.equal(f.bufferedAttack, null, 'no delayed attack either');
    assert.equal(f.combat.movementCooldowns.remaining('mouvment'), before);
  }
});
