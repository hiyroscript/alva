// Run with node --test tests/systems/move-cancel.test.mjs (no dependencies).
// The human player's move cancellation: a new, valid request made while
// its attack plays (another attack, the Extra Attack, a summon or technique,
// a jump or air jump, a Dash or air dash, a Shield press, a Deflect)
// replaces that attack, hit or not, in any phase, once the new move is known
// to start; its press for the attack already playing is no request; Run,
// held or turned, is never one. Covered here: the replacement and its
// cleanup (the cut attack's cooldown once, no later strike or release, a
// projectile already out kept, Energy only for what costs it), every
// request kind, a request that cannot start cutting nothing, same-step
// precedence, the forced states and commitments that keep their rules (an
// impact freeze, a stun, a paralysis, a Dash's first moment, a technique),
// stale requests, that no CPU's presses change, and determinism. Shared
// rules: every playable fighter, never one fighter's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';
import { DASH_ENERGY_COST, DEFLECT_ENERGY_COST } from '../../js/game/combat/combat-state.js';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { specialAction } from '../../js/data/loadout.js';
import { COMBAT_BUTTONS } from '../../js/config.js';
import { fakeSpritesOf, clipKeysOf, DT } from '../helpers/fighter-harness.mjs';
import { playerRig, press, attackOf, placeFoeAt } from '../helpers/player-rig.mjs';

const C1 = getCharacter('0001');
const EPS = 1e-6;

// The player far from its opponent (nothing to hit), with manual facing
// (Automatic turn-around off) unless asked for: the requests alone.
const far = (character, opts = {}) => playerRig({ character, gap: 900, automaticTurnAround: false, ...opts });

// The ground attack buttons `character` has (attacks, not specials).
const groundAttacks = (f) => COMBAT_BUTTONS.filter((a) => !specialAction(f.def, a) && f.attackFor(a, true));

// Every pair of different ground attack buttons of `f`.
function pairs(f) {
  const buttons = groundAttacks(f);
  return buttons.flatMap((a) => buttons.filter((b) => f.attackFor(b) !== f.attackFor(a)).map((b) => [a, b]));
}

// The player's fighter driven by a controller of `kind` (no player's), the
// same scripted presses: what the CPU, the dummy or a bare controller sees.
function driven(character, kind) {
  const held = {};
  const controller = { getInput: () => ({ ...blankInput(), ...held }) };
  if (kind) controller.kind = kind;
  const r = far(character, { controller });
  const tick = r.tick;
  r.tick = (now = {}) => {
    for (const k of Object.keys(held)) delete held[k];
    Object.assign(held, now);
    return tick();
  };
  return r;
}

// ---- Attack to attack ---------------------------------------------------------------------------

test('a different attack asked for while the player\'s attack plays replaces it at once, in its startup, active phase or recovery, hit or not: every fighter', () => {
  for (const c of playableCharacters()) {
    const probe = far(c).player;
    for (const [first, second] of pairs(probe)) {
      const total = probe.attacks[probe.attackFor(first)].total;
      for (const at of [1, Math.floor(total / DT / 2), Math.round(total / DT) - 2]) {
        const why = `#${c.id} ${first} -> ${second} at step ${at}`;
        const r = far(c);
        r.tick(press(first));
        const cut = r.player.combat.attack;
        for (let i = 1; i < at; i++) r.tick();
        assert.equal(r.player.combat.attack, cut, `${why}: still playing`);
        r.tick(press(second));
        assert.equal(attackOf(r.player), r.player.attackFor(second), why);
        assert.equal(r.player.combat.attack.time, 0, `${why}: from its first frame, on this step`);
        assert.equal(r.player.combat.cooldowns.get(cut.def.id), cut.def.cooldown, `${why}: the cut attack's cooldown, once`);
        assert.equal(r.player.combat.energy, 100, `${why}: an attack-to-attack cut costs nothing`);
      }
    }
  }
});

test('the cut attack never strikes or releases after it: a melee cut before its strike lands nothing, a throw cut before its release throws nothing, one already out flies on', () => {
  for (const c of playableCharacters()) {
    const f = far(c).player;
    for (const [first, second] of pairs(f)) {
      const atk = f.attacks[f.attackFor(first)];
      const r = playerRig({ character: c, gap: 40, automaticTurnAround: false });
      r.tick(press(first));
      r.tick(press(second));
      for (let i = 0; i < 90; i++) r.tick();
      assert.ok(!r.events.some((e) => e.attacker === r.player && e.move === atk.id), `#${c.id}: ${atk.id} cut in its startup never strikes`);
      if (atk.projectile) {
        assert.ok(!r.projectiles.some((p) => p.ability === atk.id) && !r.events.some((e) => e.move === atk.id),
          `#${c.id}: ${atk.id} cut before its release never throws`);
      }
    }
    // A throw cut after its release: the projectile it threw is kept.
    for (const action of groundAttacks(f)) {
      const atk = f.attacks[f.attackFor(action)];
      if (!atk.projectile) continue;
      const other = groundAttacks(f).find((a) => f.attackFor(a) !== atk.id);
      const r = far(c);
      r.tick(press(action));
      r.until(() => r.projectiles.length > 0);
      const thrown = r.projectiles[0];
      if (r.player.combat.attack?.def !== atk) continue;
      r.tick(press(other));
      assert.notEqual(attackOf(r.player), atk.id);
      assert.ok(r.projectiles.includes(thrown), `#${c.id}: ${atk.id}'s projectile flies on`);
      for (let i = 0; i < 30; i++) r.tick();
      assert.equal(r.projectiles.filter((p) => p.ability === atk.id).length <= 1, true, 'never a second one');
    }
  }
});

test('the player\'s press for the attack already playing is no request: never cut, restarted or kept, in any phase', () => {
  for (const c of playableCharacters()) {
    for (const action of groundAttacks(far(c).player)) {
      const r = far(c);
      r.tick(press(action));
      const record = r.player.combat.attack;
      while (record.time + DT < record.def.total - EPS) {
        r.tick(press(action));
        assert.equal(r.player.combat.attack, record, `#${c.id} ${action}`);
        assert.equal(r.player.bufferedAttack, null);
      }
    }
  }
});

test('a request that cannot start never cuts anything: its cooldown, no art, its starts for the airtime, a ground-only move in the air, an unavailable technique', () => {
  for (const c of playableCharacters()) {
    const probe = far(c).player;
    for (const [first, second] of pairs(probe)) {
      const secondId = probe.attackFor(second);
      // Its cooldown.
      const r = far(c);
      r.tick(press(first));
      const record = r.player.combat.attack;
      r.player.combat.cooldowns.set(secondId, 5);
      r.tick(press(second));
      assert.equal(r.player.combat.attack, record, `#${c.id} ${second} cooling: ${first} plays on`);
      assert.equal(r.player.combat.cooldowns.has(record.def.id), false, 'no cooldown started for it');
      // No art.
      const sprites = fakeSpritesOf(c, clipKeysOf(c).filter((k) => k !== c.attacks[secondId].animation));
      const bare = far(c, { sprites });
      bare.tick(press(first));
      const kept = bare.player.combat.attack;
      bare.tick(press(second));
      assert.equal(bare.player.combat.attack, kept, `#${c.id} ${second} without art: ${first} plays on`);
    }
    // In the air: a mid-air move used up for the airtime, and a ground-only
    // move, cut nothing.
    const air = far(c);
    Object.assign(air.player.body, { y: 300, prevY: 300, vy: 0, grounded: false, ground: null });
    air.player.coyote = 0;
    air.tick(press('attack1'));
    const aerial = air.player.combat.attack;
    assert.ok(aerial);
    const used = ['attack2', 'attack3'].find((a) => air.player.attacks[air.player.attackFor(a, false)]?.airUses > 0);
    if (used) {
      const id = air.player.attackFor(used, false);
      air.player.airAttacks.set(id, air.player.attacks[id].airUses);
      air.tick(press(used));
      assert.equal(air.player.combat.attack, aerial, `#${c.id}: ${id} used up, the aerial plays on`);
    }
  }
  // A technique on cooldown (#0001's Unlimited Void) cuts nothing; a ready
  // one replaces the attack.
  const r = far(C1);
  r.tick(press('attack1'));
  const jab = r.player.combat.attack;
  r.player.combat.abilityCooldowns.start('attack4', 3);
  r.tick(press('attack4'));
  assert.equal(r.player.combat.attack, jab, 'cooling technique: the Jab plays on');
  assert.equal(r.player.technique, null);
});

test('a summon or technique asked for during the player\'s attack replaces it when it may start; a technique in progress keeps its commitment', () => {
  const r = far(C1);
  r.tick(press('attack1'));
  r.tick(press('attack4'));
  assert.equal(r.player.technique?.def.id, 'attack4', 'Unlimited Void starts');
  assert.equal(r.player.combat.attack, null);
  assert.ok(r.player.combat.cooldowns.has('attack1'), 'the Jab\'s cooldown from the cut');
  assert.ok(r.player.combat.abilityCooldowns.active('attack4'), 'its own cooldown from acceptance, once');
  // Nothing cuts the technique: attacks, another technique, a jump, a Dash, the Shield.
  const technique = r.player.technique;
  for (const now of [press('extra_attack'), press('attack5'), press('jump'), { mouvementRightPressed: true }, press('shield')]) {
    r.tick(now);
    assert.equal(r.player.technique, technique, JSON.stringify(now));
  }
  assert.equal(r.player.combat.energy, 100);
});

// ---- Jump, Dash, Shield, Deflect -------------------------------------------------------------------

test('a jump asked for during the player\'s attack cuts it and jumps; one pressed with the attack loses to it, as ever', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    r.tick(press('attack1'));
    const id = attackOf(r.player);
    r.tick();
    r.tick(press('jump'));
    assert.equal(r.player.grounded, false, `#${c.id}: jumping`);
    assert.equal(r.player.combat.attack, null);
    assert.ok(r.player.combat.cooldowns.has(id), 'the attack\'s cooldown from the cut');
    // Pressed on the same step as the attack: the attack wins and plays out.
    const same = far(c);
    same.tick({ ...press('attack1'), ...press('jump') });
    const record = same.player.combat.attack;
    assert.ok(record);
    same.until(() => same.player.combat.attack !== record);
    assert.ok(record.time >= record.def.total - EPS, `#${c.id}: the attack played out`);
    assert.equal(same.player.grounded, true, 'the jump never came');
    // In the air: an air jump cuts the aerial.
    const air = far(c);
    air.tick(press('jump'));
    air.tick({ jump: true });
    air.tick(press('attack1'));
    const aerial = air.player.combat.attack;
    assert.ok(aerial);
    const jumps = air.player.airJumps;
    air.tick();
    air.tick(press('jump'));
    assert.equal(air.player.combat.attack, null, `#${c.id}: the aerial cut`);
    assert.equal(air.player.airJumps, jumps - 1, 'by an air jump');
    assert.ok(air.player.body.vy < 0);
  }
});

test('an explicit Dash request during the player\'s attack cuts it for the Dash\'s 25; Run, held, turned or pressed, never does; one asked on the attack\'s own step loses to it', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    r.tick(press('attack1'));
    const id = attackOf(r.player);
    r.tick({ runLeft: true, runLeftPressed: true });
    r.tick({ runRight: true, runRightPressed: true });
    assert.equal(attackOf(r.player), id, `#${c.id}: Run never cuts`);
    r.tick({ runRight: true, mouvementRightPressed: true });
    assert.ok(r.player.dash, `#${c.id}: the Dash`);
    assert.equal(r.player.combat.attack, null);
    assert.ok(r.player.combat.cooldowns.has(id));
    assert.equal(r.player.combat.energy, 100 - DASH_ENERGY_COST, 'the Dash cancel\'s cost, nothing more');
    // Exhausted: no Dash, and the attack plays on (nothing spent).
    const tired = far(c);
    tired.player.combat.setEnergy(0);
    tired.tick(press('attack1'));
    const record = tired.player.combat.attack;
    tired.tick({ mouvementRightPressed: true });
    assert.equal(tired.player.combat.attack, record, `#${c.id}: exhausted, the attack plays on`);
    assert.equal(tired.player.dash, null);
    // Asked on the attack's own step: the attack wins and plays out.
    const same = far(c);
    same.tick({ ...press('attack1'), mouvementRightPressed: true });
    const first = same.player.combat.attack;
    same.until(() => same.player.combat.attack !== first);
    assert.ok(first.time >= first.def.total - EPS, `#${c.id}: played out`);
    assert.equal(same.player.dash, null);
    // In the air: the air dash cuts the aerial.
    const air = far(c);
    air.tick(press('jump'));
    air.tick({ jump: true });
    air.tick(press('attack1'));
    air.tick();
    air.tick({ mouvementLeftPressed: true });
    assert.equal(air.player.dash?.air, true, `#${c.id}: the air dash`);
    assert.equal(air.player.combat.attack, null);
  }
});

test('Run held or turned through the player\'s whole attack never cuts it; the attack turns with the direction held, as ever', () => {
  for (const c of playableCharacters()) {
    for (const action of groundAttacks(far(c).player)) {
      const r = far(c);
      r.tick(press(action));
      const record = r.player.combat.attack;
      let i = 0;
      while (r.player.combat.attack === record) {
        const left = Math.floor(i++ / 3) % 2 === 0;
        r.tick(left ? { runLeft: true, runLeftPressed: i % 3 === 1 } : { runRight: true, runRightPressed: i % 3 === 1 });
        if (r.player.combat.attack === record && !record.def.motion) assert.equal(r.player.facing, left ? -1 : 1, 'turned by the direction held');
      }
      assert.ok(record.time >= record.def.total - EPS, `#${c.id} ${action}: played out under Run`);
    }
  }
});

test('a Shield pressed during the player\'s attack cuts it and goes up on that step; a Shield held since before it never does; in the air the press is the Deflect', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    r.tick(press('attack1'));
    const id = attackOf(r.player);
    r.tick();
    r.tick(press('shield'));
    assert.equal(r.player.combat.shielding, true, `#${c.id}: the Shield is up`);
    assert.equal(r.player.combat.attack, null);
    assert.ok(r.player.combat.cooldowns.has(id));
    // Held since before the attack (pressed while exhausted, so the attack
    // could start), the Shield never cuts it once it may go up again.
    const held = far(c);
    held.player.combat.setEnergy(0);
    held.tick(press('shield'));
    held.tick({ shield: true, ...press('attack1') });
    const record = held.player.combat.attack;
    assert.ok(record, 'the attack starts: no Shield to hold');
    held.player.combat.setEnergy(100);
    while (held.player.combat.attack === record) held.tick({ shield: true });
    assert.ok(record.time >= record.def.total - EPS, `#${c.id}: never cut by a Shield held from before it`);
    // In the air: a Deflect cuts the aerial, for its own 15.
    const air = far(c);
    air.tick(press('jump'));
    air.tick({ jump: true });
    air.tick(press('attack1'));
    air.tick();
    air.tick(press('shield'));
    assert.equal(air.player.combat.attack?.def, air.player.deflect, `#${c.id}: the Deflect`);
    assert.equal(air.player.combat.energy, 100 - DEFLECT_ENERGY_COST);
  }
});

// ---- Forced states and commitments -------------------------------------------------------------

test('never in a freeze, a stun or a paralysis: a press during the hit\'s freeze waits and cuts the attack as the freeze ends', () => {
  for (const c of playableCharacters()) {
    const f = far(c).player;
    // A melee first attack (its own hit freezes it), then another.
    const [first, second] = pairs(f).find(([a]) => f.attacks[f.attackFor(a)].hitbox && !f.attacks[f.attackFor(a)].projectile);
    const r = playerRig({ character: c, gap: 40, automaticTurnAround: false });
    r.tick(press(first));
    r.until(() => r.player.combat.hitstop > 0);
    const record = r.player.combat.attack;
    r.tick(press(second));
    assert.equal(r.player.combat.attack, record, `#${c.id}: never inside the freeze`);
    assert.equal(r.player.bufferedAttack?.action, second, 'kept');
    r.until(() => r.player.combat.attack !== record);
    assert.equal(attackOf(r.player), r.player.attackFor(second), `#${c.id}: out as the freeze ends`);
    // A paralysis or a stun takes the attack away; nothing is cut into
    // meanwhile, and a press is kept only for the buffer.
    for (const hold of ['paralysis', 'stun']) {
      const s = far(c);
      s.tick(press(first));
      s.player.combat[hold] = 0.5;
      s.tick(press(second));
      assert.equal(s.player.combat.attack, null, `#${c.id} ${hold}: the attack is over`);
      for (let i = 0; i < 12; i++) assert.equal(s.tick(press(second)).combat.attack, null, `#${c.id} ${hold}: nothing while held`);
    }
  }
});

test('a Dash keeps its first moment: an attack asked for before its cancel time waits for it, then starts', () => {
  for (const c of playableCharacters()) {
    const r = far(c);
    r.tick({ mouvementRightPressed: true });
    const dash = r.player.dash;
    r.tick(press('attack1'));
    if (r.player.dash) {
      assert.equal(r.player.dash, dash, `#${c.id}: still dashing`);
      assert.equal(r.player.combat.attack, null);
    }
    r.until(() => r.player.combat.attack, {}, 10);
    assert.equal(attackOf(r.player), r.player.attackFor('attack1'), `#${c.id}: out once the Dash may be cut`);
  }
});

test('a hit makes the player\'s earlier requests stale: none comes out after the stun', () => {
  for (const c of playableCharacters()) {
    const r = playerRig({ character: c, gap: 40, automaticTurnAround: false });
    r.player.combat.cooldowns.set(r.player.attackFor('attack2'), 0.05);
    r.tick(press('attack2'));
    assert.equal(r.player.bufferedAttack?.action, 'attack2', 'kept for its cooldown');
    r.player.takeHit({ launchSpeed: 0 });
    assert.equal(r.player.bufferedAttack, null, `#${c.id}: gone with the hit`);
    assert.equal(r.player.bufferedDash, null);
    assert.equal(r.player.jumpBuffer, 0);
  }
});

// ---- Whose, and how ------------------------------------------------------------------------------

test('the same presses from a CPU\'s, the dummy\'s or a bare controller never cut its attack: the old rules hold for anyone but the player', () => {
  for (const c of playableCharacters()) {
    for (const kind of ['cpu', undefined]) {
      const r = driven(c, kind);
      r.tick(press('attack1'));
      const record = r.player.combat.attack;
      for (const now of [press('attack3'), press('jump'), { mouvementRightPressed: true }, press('shield'), press('extra_attack')]) {
        if (r.player.combat.attack !== record) break;
        r.tick(now);
        assert.equal(r.player.combat.attack, record, `#${c.id} ${kind}: ${JSON.stringify(now)}`);
      }
      assert.equal(r.player.playerControlled, false);
    }
  }
});

test('deterministic: the same requests cut the same way, step for step', () => {
  const run = (c) => {
    const r = playerRig({ character: c, gap: 260 });
    const out = [];
    const script = {
      0: press('attack1'), 4: press('attack3'), 9: press('extra_attack'), 30: { mouvementRightPressed: true }, 34: press('attack2'),
      60: press('jump'), 62: press('attack1'), 64: press('shield'), 90: press('attack1'), 92: press('shield'),
    };
    for (let i = 0; i < 160; i++) {
      r.tick({ runRight: i > 20 && i < 80, ...(script[i] ?? {}) });
      const p = r.player;
      out.push([p.state, attackOf(p), p.body.x.toFixed(4), p.body.y.toFixed(4), p.combat.energy.toFixed(3), [...p.combat.cooldowns.keys()].join(',')].join(' '));
    }
    return out;
  };
  for (const c of playableCharacters()) assert.deepEqual(run(c), run(c), `#${c.id}`);
});
