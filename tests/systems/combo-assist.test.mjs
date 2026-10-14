// Run with node --test tests/systems/combo-assist.test.mjs (no dependencies).
// Combo Assist (Home › Settings › Combat): the human player's Attack 1
// pressed again once its attack is over, while that attack's own repeat
// cooldown runs, is Attack 2, and the reverse. Covered here: who has it (the
// player's controller with the setting on; never a CPU, the dummy or a bare
// controller, in any mode), the alternation both ways on the ground and in
// the air from each fighter's own loadout, that a press made while the
// attack still plays never cuts, restarts or turns into the other one (now
// or later), mashing, Off, the buttons that never alternate, the
// alternate's own rules (cooldown, art, airtime, place) and the cooldown it
// reads (the attack's own, however long), and an integration with Combat
// Assist and Run held throughout. Shared rules: every playable fighter or a
// fixture, never one fighter's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { PlayerController, TrainingAIController, blankInput } from '../../js/game/fighters/fighter-controller.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { COMBO_PAIRS, comboAction } from '../../js/game/combat/combo-assist.js';
import { isMeleeAttack } from '../../js/game/combat/attacks.js';
import { assistsAttack } from '../../js/game/combat/combat-assist.js';
import { REPEAT_COOLDOWN } from '../../js/data/cooldowns.js';
import { Battle } from '../../js/game/battle.js';
import { PracticeSession } from '../../js/game/practice.js';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { getMap } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { mulberry32 } from '../../js/core/utils.js';
import { fakeSpritesOf, DT } from '../helpers/fighter-harness.mjs';
import { playerRig, press, attackOf, placeFoeAt, FLAT } from '../helpers/player-rig.mjs';

// The stage themes a Battle or a PracticeSession builds draw with Path2D:
// a no-op stand-in, as nothing is drawn here.
globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const C1 = getCharacter('0001');
const EPS = 1e-6;
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// The player far from its opponent (no Combat Assist approach to muddle
// what starts): Combo Assist `comboAssist`.
const far = (character, opts = {}) => playerRig({ character, gap: 900, combatAssist: false, ...opts });

// Presses `action`, then steps until that attack is over (finished):
// returns the attack id it played.
function playOut(r, action) {
  r.tick(press(action));
  const id = attackOf(r.player);
  assert.ok(id, `${action} started`);
  r.until(() => !r.player.combat.attack);
  return id;
}

// The player high in the air (a long fall ahead), still.
function lift(r) {
  Object.assign(r.player.body, { y: 300, prevY: 300, vy: 0, grounded: false, ground: null });
  r.player.coyote = 0;
}

// ---- Who has it ---------------------------------------------------------------------------------

test('on by default for the human player only: never a CPU, the training dummy or a controller that is not a player\'s', () => {
  const controller = new PlayerController({ sample: blankInput });
  assert.equal(controller.comboAssist, true, 'on by default, as the setting');
  assert.equal(new PlayerController({ sample: blankInput }, { comboAssist: false }).comboAssist, false);
  assert.equal(new PlayerController({ sample: blankInput }, { comboAssist: 'yes' }).comboAssist, false, 'only a real true');
  assert.equal(new PlayerController({ sample: blankInput }, { combatAssist: false }).comboAssist, true, 'apart from Combat Assist');
  const sprites = fakeSpritesOf(C1);
  const has = (c, slot = 'p1', label = 'P1') => new Fighter({
    def: C1, sprites, stage: FLAT, slot, label, spawn: { x: 800, facing: 1 }, controller: c,
  }).comboAssistOn;
  assert.equal(has(controller), true);
  assert.equal(has(controller, 'p2', 'CPU'), true, 'a player is a player whatever its slot or label');
  assert.equal(has(new CombatAIController({ rng: mulberry32(1) })), false);
  assert.equal(has(new TrainingAIController({ rng: mulberry32(1) })), false);
  assert.equal(has(null), false, 'the training dummy has no controller');
  assert.equal(has({ getInput: blankInput, comboAssist: true }), false, 'not a player\'s');
  assert.equal(has({ getInput: blankInput, kind: 'player' }), false, 'a player that has not turned it on');
  // The CPU's code has no Combo Assist of its own.
  assert.equal('comboAssist' in new CombatAIController({ rng: mulberry32(1) }), false);
  assert.doesNotMatch(read('js/game/ai/combat-ai.js'), /comboAssist|Combo Assist/);
});

test('Quick Battle and Practice Ground give it to Player 1 only, as saved; Watch Mode to nobody', () => {
  const canvas = { getContext: () => ({}) };
  const sprites = fakeSpritesOf(C1);
  const input = { flush() {}, sample: blankInput };
  const battle = (opts) => new Battle({ canvas, map: getMap('desert'), p1Def: C1, p2Def: C1, p1Sprites: sprites, p2Sprites: sprites, input, seed: 2, ...opts });
  assert.equal(battle({}).p1.comboAssistOn, true, 'on by default');
  assert.equal(battle({}).p2.comboAssistOn, false, 'never the CPU');
  const off = battle({ comboAssist: false });
  assert.equal(off.p1.comboAssistOn, false);
  assert.equal(off.p1.combatAssistOn, true, 'Combat Assist is its own setting');
  assert.equal(battle({ combatAssist: false }).p1.comboAssistOn, true, 'and the reverse');
  for (const comboAssist of [true, false]) {
    const watch = battle({ mode: 'watch', comboAssist });
    assert.equal(watch.p1.comboAssistOn || watch.p2.comboAssistOn, false, 'Watch Mode: two CPUs');
    const session = new PracticeSession({ canvas, map: PRACTICE_MAP, def: C1, sprites, input, comboAssist });
    session.setCPU(C1, sprites);
    assert.equal(session.player.comboAssistOn, comboAssist);
    assert.equal(session.cpu.comboAssistOn, false, 'the practice CPU');
    session.setFighter(getCharacter('0002'), fakeSpritesOf(getCharacter('0002')));
    assert.equal(session.player.comboAssistOn, comboAssist, 'Change Fighter keeps it');
  }
  // The screens read the saved setting as each session starts.
  for (const file of ['js/screens/battle-screen.js', 'js/screens/practice-screen.js']) {
    assert.match(read(file), /comboAssist: app\.settings\.comboAssist/, file);
  }
});

// ---- The alternation ------------------------------------------------------------------------------

test('Attack 1 pressed again during its own repeat cooldown is Attack 2, and Attack 2\'s is Attack 1: every fighter, on the ground', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of Object.entries(COMBO_PAIRS)) {
      const why = `#${c.id} ${first}`;
      const r = far(c);
      const played = playOut(r, first);
      assert.equal(played, r.player.attackFor(first), why);
      assert.ok(r.player.combat.cooldowns.has(played), `${why}: its repeat cooldown runs`);
      r.tick();
      r.tick(press(first));
      assert.equal(attackOf(r.player), r.player.attackFor(second), `${why} again: ${second}'s attack, from the fighter's own loadout`);
      assert.equal(r.player.combat.attack.time, 0, `${why}: on that very step`);
      assert.ok(r.player.combat.cooldowns.has(played), `${why}: the first attack's cooldown runs on, untouched`);
      assert.equal(r.player.bufferedAttack, null);
    }
  }
});

test('in the air the air moves alternate: the mid-air Attack 1 cooling down makes Attack 1 the mid-air Attack 2, and the reverse', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of Object.entries(COMBO_PAIRS)) {
      const r = far(c);
      lift(r);
      const airFirst = r.player.attackFor(first, false);
      const airSecond = r.player.attackFor(second, false);
      if (!airFirst || !airSecond) continue;
      // A slam plunges until it lands (#0003's Heavenly Foot of Pain): it
      // never leaves its fighter in the air for a second press there.
      if (r.player.attacks[airFirst].motion?.type === 'slam') continue;
      r.tick(press(first));
      assert.equal(attackOf(r.player), airFirst, `#${c.id}: ${first} in the air`);
      r.until(() => !r.player.combat.attack);
      assert.equal(r.player.grounded, false, 'still in the air');
      r.tick(press(first));
      assert.equal(attackOf(r.player), airSecond, `#${c.id} ${first} again in the air: ${airSecond}`);
    }
  }
});

test('ground and air are each their own: a ground attack cooling down never alternates the air press, nor the reverse', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    playOut(r, 'attack1');
    assert.ok(r.player.combat.cooldowns.has(r.player.attackFor('attack1', true)));
    lift(r);
    r.tick(press('attack1'));
    assert.equal(attackOf(r.player), r.player.attackFor('attack1', false), `#${c.id}: its own mid-air Attack 1, ready`);
  }
});

test('Attack 1 pressed while Attack 1 plays (any phase, mashed every step) is never cut, restarted or turned into Attack 2, now or later; the same for Attack 2', () => {
  for (const c of playableCharacters()) {
    for (const action of Object.keys(COMBO_PAIRS)) {
      for (const comboAssist of [true, false]) {
        const why = `#${c.id} ${action}, Combo Assist ${comboAssist ? 'on' : 'off'}`;
        const r = far(c, { comboAssist });
        r.tick(press(action));
        const record = r.player.combat.attack;
        let last = -1;
        // Pressed on every step it is still playing (the last one included:
        // the step it ends on is its own end, never a press during it).
        while (record.time + DT < record.def.total - EPS) {
          assert.equal(r.player.combat.attack, record, `${why}: the same attack throughout`);
          assert.ok(record.time > last, `${why}: never restarted`);
          last = record.time;
          r.tick(press(action));
          assert.equal(r.player.bufferedAttack, null, `${why}: nothing kept for later`);
        }
        assert.equal(r.player.combat.attack, record, `${why}: still the same attack`);
        r.tick();
        assert.equal(r.player.combat.attack, null, `${why}: it played out in full, on its own`);
        // After it, nothing it never asked for: no scheduled Attack 2.
        for (let i = 0; i < 40; i++) {
          r.tick();
          assert.equal(r.player.combat.attack, null, `${why}: nothing comes out later`);
        }
      }
    }
  }
});

test('a press made on the very step the attack ends is a press once it is over: Attack 2 with Combo Assist, nothing without', () => {
  for (const c of playableCharacters()) {
    for (const comboAssist of [true, false]) {
      const r = far(c, { comboAssist });
      r.tick(press('attack1'));
      const record = r.player.combat.attack;
      while (r.player.combat.attack === record) r.tick(press('attack1'));
      assert.ok(record.time >= record.def.total - EPS, 'played out');
      assert.equal(attackOf(r.player), comboAssist ? r.player.attackFor('attack2') : null, `#${c.id} ${comboAssist}`);
    }
  }
});

test('Attack 1 pressed during the Attack 2 its own last press made is that same request: the Attack 2 plays out, never cut, even once Attack 1 is ready', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    playOut(r, 'attack1');
    r.tick(press('attack1'));
    const second = r.player.combat.attack;
    assert.equal(second.def.id, r.player.attackFor('attack2'));
    assert.equal(second.button, 'attack1', 'asked for by Attack 1');
    // Attack 1's cooldown over while Attack 2 still plays.
    r.player.combat.cooldowns.delete(r.player.attackFor('attack1'));
    while (second.time + DT < second.def.total - EPS) {
      r.tick(press('attack1'));
      assert.equal(r.player.combat.attack, second, `#${c.id}: never cut by its own button`);
    }
    // Attack 2's own button is its own too; another button is a real request.
    const other = far(c);
    playOut(other, 'attack1');
    other.tick(press('attack1'));
    const kicks = other.player.combat.attack;
    other.tick(press('attack2'));
    assert.equal(other.player.combat.attack, kicks, `#${c.id}: Attack 2's own button`);
  }
});

test('mashing Attack 1 alternates whole attacks, every one played out: no restart loop, never a cut', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    const started = [];
    let current = null;
    for (let i = 0; i < 240; i++) {
      const before = r.player.combat.attack;
      r.tick(press('attack1'));
      const now = r.player.combat.attack;
      if (now && now !== before) {
        if (before) assert.ok(before.time >= before.def.total - EPS, `#${c.id}: ${before.def.id} ended on its own, never cut`);
        started.push(now.def.id);
      }
      if (current && current !== now && !now) assert.ok(current.time >= current.def.total - EPS, `#${c.id}: played out`);
      current = now;
    }
    const a1 = r.player.attackFor('attack1');
    const a2 = r.player.attackFor('attack2');
    assert.ok(started.length >= 4, `#${c.id}: ${started.join(' ')}`);
    started.forEach((id, i) => assert.equal(id, i % 2 === 0 ? a1 : a2, `#${c.id}: ${started.join(' ')}`));
  }
});

test('off: Attack 1 during its own cooldown never becomes Attack 2 (nor the reverse); a press within the last buffer is its own attack', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of Object.entries(COMBO_PAIRS)) {
      const r = far(c, { comboAssist: false });
      playOut(r, first);
      r.tick(press(first));
      assert.equal(r.player.combat.attack, null, `#${c.id} ${first}: cooling down, nothing`);
      const seen = new Set();
      for (let i = 0; i < 60; i++) seen.add(attackOf(r.tick()));
      assert.ok(!seen.has(r.player.attackFor(second)), `#${c.id}: never ${second}`);
    }
  }
});

test('only Attack 1 and Attack 2 alternate: Extra Attack and Attack 3 to 5 pressed while cooling down are their own presses', () => {
  assert.deepEqual(COMBO_PAIRS, { attack1: 'attack2', attack2: 'attack1' });
  for (const c of playableCharacters()) {
    const f = far(c).player;
    for (const action of ['extra_attack', 'transform', 'attack3', 'attack4', 'attack5']) {
      const id = f.attackFor(action);
      if (id) f.combat.cooldowns.set(id, 0.4);
      assert.equal(comboAction(f, action), action, `#${c.id} ${action}`);
    }
    // In play: Attack 3 cooling down is never Attack 1 or 2.
    const r = far(c);
    if (!r.player.attackFor('attack3')) continue;
    playOut(r, 'attack3');
    r.tick(press('attack3'));
    assert.equal(r.player.combat.attack, null, `#${c.id}: attack3 cooling, nothing else`);
  }
});

test('the alternate keeps its own rules: its cooldown, its art, its starts for the airtime; unavailable, the press stays its own and nothing is forced', () => {
  for (const c of playableCharacters()) {
    // Its cooldown: both cooling, the press stays Attack 1, kept only as
    // Attack 1, and Attack 2 never comes.
    const r = far(c);
    const a2 = r.player.attackFor('attack2');
    playOut(r, 'attack1');
    r.player.combat.cooldowns.set(a2, 0.4);
    assert.equal(r.player.comboAction('attack1'), 'attack1', `#${c.id}: Attack 2 cooling`);
    r.tick(press('attack1'));
    assert.equal(r.player.combat.attack, null);
    assert.equal(r.player.bufferedAttack?.action, 'attack1', 'kept as its own press, as ever');
    // Its art: none, never forced.
    const sprites = fakeSpritesOf(c, Object.keys(c.animations).filter((k) => k !== c.attacks[a2].animation));
    const bare = far(c, { sprites });
    playOut(bare, 'attack1');
    assert.equal(bare.player.comboAction('attack1'), 'attack1', `#${c.id}: Attack 2 without art`);
    for (let i = 0; i < 40; i++) assert.notEqual(attackOf(bare.tick(press('attack1'))), a2);
  }
  // Its starts for this airtime: #0002's mid-air Attack 2 (the Bounce
  // Attack) used up never comes from a mid-air Attack 1 press.
  for (const c of playableCharacters()) {
    const r = far(c);
    lift(r);
    const air2 = r.player.attackFor('attack2', false);
    const atk = r.player.attacks[air2];
    if (!(atk?.airUses > 0)) continue;
    r.player.airAttacks.set(air2, atk.airUses);
    r.tick(press('attack1'));
    r.until(() => !r.player.combat.attack);
    assert.equal(r.player.comboAction('attack1'), 'attack1', `#${c.id}: ${air2} used up this airtime`);
    r.tick(press('attack1'));
    assert.notEqual(attackOf(r.player), air2);
  }
});

test('the window is the attack\'s own repeat cooldown, however long: nothing shortened, overwritten or timed apart', () => {
  const long = { ...C1, id: 'combo-long', displayName: 'combo-long', available: false, rosterSlot: null,
    attacks: { ...C1.attacks, attack1: { ...C1.attacks.attack1, cooldown: 2 } } };
  const r = far(long);
  playOut(r, 'attack1');
  assert.ok(Math.abs(r.player.combat.cooldowns.get('attack1') - 2) < 0.05, 'its authored 2 s');
  for (let i = 0; i < Math.round(1.5 / DT); i++) r.tick();
  r.tick(press('attack1'));
  assert.equal(attackOf(r.player), 'attack2', '1.5 s later, still its cooldown: Attack 2');
  const left = r.player.combat.cooldowns.get('attack1');
  assert.ok(left > 0.4 && left < 0.55, `Attack 1's own cooldown runs on untouched: ${left}`);
  r.until(() => !r.player.combat.attack);
  r.until(() => !r.player.combat.cooldowns.has('attack1'));
  r.until(() => !r.player.combat.cooldowns.has('attack2'));
  r.tick(press('attack1'));
  assert.equal(attackOf(r.player), 'attack1', 'once it is over, Attack 1 is Attack 1 again');
  assert.equal(REPEAT_COOLDOWN, 0.5, 'the shared baseline is unchanged');
  // No timer of its own: Combo Assist reads the combat state alone.
  const src = read('js/game/combat/combo-assist.js');
  assert.doesNotMatch(src, /Math\.random|Date\.|performance\.|setTimeout|setInterval|requestAnimationFrame|document\.|window\.|\b0\.5\b/);
  assert.match(src, /cooldowns\.has\(source\)/);
});

test('an interrupted Attack 1 cooling down alternates too: the player\'s own cut and a hit both start its repeat cooldown', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    const a1 = r.player.attackFor('attack1');
    r.tick(press('attack1'));
    // The player's own cut: Attack 3 (or the Extra Attack) cuts Attack 1.
    const other = ['attack3', 'extra_attack'].find((a) => r.player.attackFor(a));
    r.tick(press(other));
    assert.notEqual(attackOf(r.player), a1);
    assert.ok(r.player.combat.cooldowns.has(a1), 'its cooldown from the cut');
    assert.equal(r.player.comboAction('attack1'), 'attack2', `#${c.id}: Attack 1 now asks for Attack 2`);
    // A hit's stun takes the player out of Attack 1 (Fighter.update:
    // CombatState.interruptAttack): its cooldown starts, and once the stun
    // is over Attack 1 is Attack 2 while it runs.
    const hit = far(c);
    hit.tick(press('attack1'));
    hit.player.combat.stun = 0.2;
    hit.tick();
    assert.equal(hit.player.combat.attack, null, 'interrupted');
    assert.ok(hit.player.combat.cooldowns.has(a1), `#${c.id}: interrupted, its cooldown runs`);
    hit.until(() => hit.player.combat.stun <= 0);
    hit.tick(press('attack1'));
    assert.equal(attackOf(hit.player), hit.player.attackFor('attack2'), `#${c.id}: after the hit`);
  }
});

test('a CPU pressing Attack 1 during its cooldown never gets Attack 2: its presses are untouched', () => {
  for (const c of playableCharacters()) {
    const held = {};
    const cpu = { kind: 'cpu', getInput: () => ({ ...blankInput(), ...held }) };
    const r = far(c, { controller: cpu });
    const step = (now = {}) => {
      for (const k of Object.keys(held)) delete held[k];
      Object.assign(held, now);
      r.tick();
    };
    step(press('attack1'));
    r.until(() => !r.player.combat.attack);
    for (let i = 0; i < 30; i++) {
      step(press('attack1'));
      assert.notEqual(attackOf(r.player), r.player.attackFor('attack2'), `#${c.id}`);
    }
  }
});

// ---- With Combat Assist and Run ----------------------------------------------------------------------

test('integration: running in with Run held throughout, Attack 1 closes in and lands, then Attack 1 again during its cooldown is Attack 2 with its own Combat Assist; nothing lost, nothing cut by Run', () => {
  for (const c of playableCharacters()) {
    for (const [first, second] of Object.entries(COMBO_PAIRS)) {
      const why = `#${c.id} ${first} then ${second}`;
      const r = playerRig({ character: c, gap: 600 });
      const run = { runRight: true };
      for (let i = 0; i < 25; i++) r.tick(run);
      const firstAtk = r.player.attacks[r.player.attackFor(first)];
      // Just out of reach of the first attack, within one Dash.
      placeFoeAt(r, 150);
      r.tick({ ...run, ...press(first) });
      if (assistsAttack(firstAtk)) assert.ok(r.player.combatAssist || r.player.combat.attack, `${why}: closing in or in reach`);
      // Run held through the approach and the attack: never a cut.
      const startedFirst = r.until(() => r.player.combat.attack?.def === firstAtk, run, 60);
      assert.ok(startedFirst >= 0);
      const record = r.player.combat.attack;
      while (r.player.combat.attack === record) {
        assert.equal(r.player.facing, 1, `${why}: facing its target`);
        r.tick(run);
      }
      assert.ok(record.time >= record.def.total - EPS, `${why}: ${first} played out, Run never cut it`);
      // During its cooldown, still running: the press is Attack 2.
      assert.ok(r.player.combat.cooldowns.has(firstAtk.id));
      const secondAtk = r.player.attacks[r.player.attackFor(second)];
      if (isMeleeAttack(secondAtk)) placeFoeAt(r, 150);
      r.tick({ ...run, ...press(first) });
      const assisted = !!r.player.combatAssist;
      assert.ok(assisted || r.player.combat.attack?.def === secondAtk, `${why}: Attack 2 asked for`);
      if (assistsAttack(secondAtk)) assert.ok(assisted, `${why}: ${secondAtk.id} is melee: its own Combat Assist`);
      else assert.equal(assisted, false, `${why}: ${secondAtk.id} is not served by an approach`);
      r.until(() => r.player.combat.attack?.def === secondAtk, run, 60);
      assert.equal(r.player.facing, 1);
      const hits = r.events.filter((e) => e.attacker === r.player && e.type === 'hit').map((e) => e.move);
      assert.ok(hits.includes(firstAtk.id) || !isMeleeAttack(firstAtk), `${why}: ${firstAtk.id} landed (${hits})`);
    }
  }
});

test('integration in the air: a mid-air Attack 1 cooling down, Attack 1 again is the mid-air Attack 2, Run held throughout', () => {
  for (const c of playableCharacters()) {
    const r = playerRig({ character: c, gap: 900 });
    lift(r);
    const run = { runRight: true };
    r.tick({ ...run, ...press('attack1') });
    const air1 = r.player.attackFor('attack1', false);
    assert.equal(attackOf(r.player), air1);
    r.until(() => !r.player.combat.attack, run);
    if (r.player.grounded) continue;
    r.tick({ ...run, ...press('attack1') });
    assert.equal(attackOf(r.player), r.player.attackFor('attack2', false), `#${c.id}`);
  }
});

test('deterministic: the same presses give the same alternation, step for step', () => {
  const run = () => {
    const r = playerRig({ character: getCharacter('0002'), gap: 220 });
    const out = [];
    for (let i = 0; i < 200; i++) {
      const now = i % 7 === 0 ? press('attack1') : i % 11 === 0 ? press('attack2') : { runRight: i > 100 };
      r.tick(now);
      out.push([r.player.state, attackOf(r.player), r.player.body.x.toFixed(4), r.player.combatAssist?.action ?? '-'].join(' '));
    }
    return out;
  };
  assert.deepEqual(run(), run());
});
