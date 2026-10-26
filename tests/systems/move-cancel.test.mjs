// Run with node --test tests/systems/move-cancel.test.mjs (no dependencies).
// Move cancellation, the strict rules: the same for a human player's
// fighter and a CPU's.
//   - An attack that can harm is never cut short just because something
//     else was asked for (the broad player cancellation of PR #114 is
//     gone): another attack, the Extra Attack, a summon or technique, a
//     jump, a Dash or air dash, a Shield press or a Deflect asked for in its
//     startup, active phase or recovery leaves it playing; the request waits
//     in the buffer, as ever. Only an authored, hit-confirmed window
//     (`hitCancel`) cuts it short, and those still do.
//   - The press for the attack already playing never restarts it; once it
//     has finished it may be used again at once (no 0.5 s repeat delay).
//   - A move that harms nobody gives way to any valid request: a heal of
//     its own (#0003's Mystical Palm Technique) before or after it heals.
//   - The Deflect gives way to any valid request by explicit rule, attack
//     though it is: another aerial, an air jump, an air dash, in any phase.
//     Its box strikes and turns nothing back after that, its Energy is
//     never given back, a request that cannot start never ends it, it never
//     restarts into itself, and it still cuts short only what may be cut.
// Shared rules: every playable fighter, never one fighter's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';
import { DASH_ENERGY_COST, DEFLECT_ENERGY_COST } from '../../js/game/combat/combat-state.js';
import { Projectile } from '../../js/game/combat/projectile.js';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { specialAction } from '../../js/data/loadout.js';
import { COMBAT_BUTTONS } from '../../js/config.js';
import { DT } from '../helpers/fighter-harness.mjs';
import { playerRig, press, attackOf } from '../helpers/player-rig.mjs';

const C1 = getCharacter('0001');
const C3 = getCharacter('0003');
const EPS = 1e-6;
const DASH = { mouvementRightPressed: true };
const AIR_DASH = { mouvementLeftPressed: true };

// The player far from its opponent (nothing to hit), with manual facing.
const far = (character, opts = {}) => playerRig({ character, gap: 900, automaticTurnAround: false, ...opts });

// The same fighter driven by a controller of `kind` ('cpu', or none: a bare
// one), fed scripted presses: what a CPU's presses go through.
function driven(character, kind, opts = {}) {
  const held = {};
  const controller = { getInput: () => ({ ...blankInput(), ...held }) };
  if (kind) controller.kind = kind;
  const r = far(character, { controller, ...opts });
  const tick = r.tick;
  r.tick = (now = {}) => {
    for (const k of Object.keys(held)) delete held[k];
    Object.assign(held, now);
    return tick();
  };
  r.until = (pred, input = {}, limit = 600) => {
    for (let i = 0; i < limit; i++) {
      if (pred()) return i;
      r.tick(input);
    }
    if (pred()) return limit;
    throw new Error('condition never reached');
  };
  return r;
}

// Every way a fighter is driven: the human player's and a CPU's.
const RIGS = [['player', (c, o) => far(c, o)], ['cpu', (c, o) => driven(c, 'cpu', o)]];

// The ground attack buttons `f` has (attacks, not specials).
const groundAttacks = (f) => COMBAT_BUTTONS.filter((a) => !specialAction(f.def, a) && f.attackFor(a, true));

// Every pair of different ground attack buttons of `f`.
function pairs(f) {
  const buttons = groundAttacks(f);
  return buttons.flatMap((a) => buttons.filter((b) => f.attackFor(b) !== f.attackFor(a)).map((b) => [a, b]));
}

// Airborne, rising from a held jump, free to act.
function airborne(r) {
  r.tick(press('jump'));
  r.tick({ jump: true });
  return r;
}

// ---- Rule A: an attack is never cut short by a mere request ------------------------------------

test('a different attack asked for in an attack\'s startup, active phase or recovery never replaces it: it plays out in full, player or CPU, every fighter', () => {
  for (const c of playableCharacters()) {
    for (const [who, rig] of RIGS) {
      const probe = rig(c).player;
      for (const [first, second] of pairs(probe)) {
        const total = probe.attacks[probe.attackFor(first)].total;
        for (const at of [1, Math.floor(total / DT / 2), Math.round(total / DT) - 2]) {
          const why = `#${c.id} ${who} ${first} -> ${second} at step ${at}`;
          const r = rig(c);
          r.tick(press(first));
          const record = r.player.combat.attack;
          const paid = r.player.combat.energy;
          for (let i = 1; i < at; i++) r.tick();
          r.tick(press(second));
          assert.equal(r.player.combat.attack, record, `${why}: still playing`);
          assert.ok(r.player.combat.energy >= paid - EPS, `${why}: nothing paid for the request`);
          while (r.player.combat.attack === record) r.tick();
          assert.ok(record.time >= record.def.total - EPS, `${why}: played out in full`);
        }
      }
    }
  }
});

test('the Extra Attack, a summon or technique, a jump, a Dash, a Shield press and a Deflect never cut an attack short either: nothing starts, nothing is paid', () => {
  for (const c of playableCharacters()) {
    for (const [who, rig] of RIGS) {
      const requests = [
        press('extra_attack'), ...COMBAT_BUTTONS.filter((a) => specialAction(c, a)).map((a) => press(a)),
        press('jump'), DASH, press('shield'),
      ];
      for (const request of requests) {
        const r = rig(c);
        const first = groundAttacks(r.player).find((a) => !(request[`${a}Pressed`]));
        r.tick(press(first));
        const record = r.player.combat.attack;
        const paid = r.player.combat.energy;
        r.tick();
        r.tick(request);
        const why = `#${c.id} ${who} ${first} then ${Object.keys(request).join('+')}`;
        assert.equal(r.player.combat.attack, record, `${why}: the attack plays on`);
        assert.equal(r.player.technique, null, why);
        assert.equal(r.player.pendingSummon, null, why);
        assert.equal(r.player.dash, null, why);
        assert.equal(r.player.combat.shielding, false, why);
        assert.equal(r.player.grounded, true, `${why}: no jump`);
        assert.ok(r.player.combat.energy >= paid - EPS, `${why}: nothing paid for the request`);
      }
      // In the air: a Deflect, an air jump and an air dash never cut an
      // aerial that has not hit.
      for (const request of [press('shield'), press('jump'), AIR_DASH]) {
        const r = airborne(rig(c));
        r.tick(press('attack1'));
        const aerial = r.player.combat.attack;
        assert.ok(aerial, `#${c.id} ${who}: an aerial`);
        const jumps = r.player.airJumps;
        r.tick();
        r.tick(request);
        const why = `#${c.id} ${who} aerial then ${Object.keys(request).join('+')}`;
        assert.equal(r.player.combat.attack, aerial, `${why}: the aerial plays on`);
        assert.equal(r.player.airJumps, jumps, `${why}: no air jump`);
        assert.equal(r.player.dash, null, why);
        assert.equal(r.player.combat.energy, 100, `${why}: nothing paid`);
      }
    }
  }
});

test('a request made during an attack waits in the buffer and comes out as the attack ends naturally, never before', () => {
  for (const c of playableCharacters()) {
    for (const [who, rig] of RIGS) {
      const probe = rig(c).player;
      for (const [first, second] of pairs(probe)) {
        const r = rig(c);
        r.tick(press(first));
        const record = r.player.combat.attack;
        // Pressed two steps before its end, within the buffer.
        while (record.time + 3 * DT < record.def.total - EPS) r.tick();
        r.tick(press(second));
        assert.equal(r.player.combat.attack, record, `#${c.id} ${who}: not yet`);
        r.until(() => r.player.combat.attack !== record);
        assert.ok(record.time >= record.def.total - EPS, `#${c.id} ${who} ${first}: ended naturally`);
        assert.equal(attackOf(r.player), r.player.attackFor(second), `#${c.id} ${who} ${first} -> ${second}: out on the first free step`);
      }
    }
  }
});

test('the press for the attack already playing never restarts or stacks it; once it has finished it may be used again at once', () => {
  for (const c of playableCharacters()) {
    for (const [who, rig] of RIGS) {
      for (const action of groundAttacks(rig(c).player)) {
        const r = rig(c);
        r.tick(press(action));
        const record = r.player.combat.attack;
        while (record.time + DT < record.def.total - EPS) {
          r.tick(press(action));
          assert.equal(r.player.combat.attack, record, `#${c.id} ${who} ${action}: never restarted`);
          assert.equal(r.player.bufferedAttack, null, `#${c.id} ${who} ${action}: never stacked`);
        }
        r.until(() => r.player.combat.attack !== record);
        if (record.def.cooldown > 0) continue; // a 3 s / 5 s move waits for its cooldown
        r.until(() => r.player.canAct());
        r.tick(press(action));
        assert.notEqual(r.player.combat.attack, record, `#${c.id} ${who} ${action}`);
        assert.equal(attackOf(r.player), record.def.id, `#${c.id} ${who} ${action}: again, no repeat delay`);
      }
    }
  }
});

// ---- Legitimate windows still cut -------------------------------------------------------------

test('an attack that hit and reached its hitCancel is still cut short by another attack, a jump or a Dash (15), player or CPU', () => {
  for (const c of playableCharacters()) {
    for (const [who, rig] of RIGS) {
      const probe = rig(c).player;
      const first = 'attack1';
      const atk = probe.attacks[probe.attackFor(first)];
      if (atk.hitCancel == null) continue;
      const second = groundAttacks(probe).find((a) => probe.attackFor(a) !== atk.id && !probe.attacks[probe.attackFor(a)].energyCost);
      for (const [label, request, check] of [
        ['attack', press(second), (p) => attackOf(p) === p.attackFor(second)],
        ['jump', press('jump'), (p) => !p.grounded && !p.combat.attack],
        ['Dash', DASH, (p) => !!p.dash && !p.combat.attack],
      ]) {
        const r = rig(c, { gap: 40 });
        r.tick(press(first));
        const record = r.player.combat.attack;
        r.until(() => r.player.combat.cancellable || r.player.combat.attack !== record, {}, 60);
        if (!r.player.combat.cancellable) continue; // out of reach for this fighter's spacing
        const before = r.player.combat.energy;
        r.tick(request);
        assert.ok(check(r.player), `#${c.id} ${who}: ${label} out of the hit-confirmed window`);
        if (label === 'Dash') assert.equal(before - r.player.combat.energy, DASH_ENERGY_COST, 'the Dash cancel\'s 15');
      }
    }
  }
});

test('never in a freeze, a stun or a paralysis: a press during the hit\'s freeze waits; a paralysis or a stun takes the attack away', () => {
  for (const c of playableCharacters()) {
    const f = far(c).player;
    const [first, second] = pairs(f).find(([a]) => f.attacks[f.attackFor(a)].hitbox && !f.attacks[f.attackFor(a)].projectile);
    const r = playerRig({ character: c, gap: 40, automaticTurnAround: false });
    r.tick(press(first));
    r.until(() => r.player.combat.hitstop > 0);
    const record = r.player.combat.attack;
    r.tick(press(second));
    assert.equal(r.player.combat.attack, record, `#${c.id}: never inside the freeze`);
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
    r.tick(DASH);
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

// ---- The Deflect is cancellable ------------------------------------------------------------------

test('a Deflect gives way to another aerial in its startup, active phase or recovery: player or CPU, every fighter', () => {
  for (const c of playableCharacters()) {
    for (const [who, rig] of RIGS) {
      const total = rig(c).player.deflect.total;
      for (const at of [1, Math.floor(total / DT / 2), Math.round(total / DT) - 2]) {
        const r = airborne(rig(c));
        r.tick(press('shield'));
        const deflect = r.player.combat.attack;
        assert.equal(deflect?.def, r.player.deflect, `#${c.id} ${who}: Deflecting`);
        assert.equal(r.player.combat.energy, 100 - DEFLECT_ENERGY_COST);
        for (let i = 1; i < at; i++) r.tick();
        if (r.player.combat.attack !== deflect || r.player.grounded) continue;
        const before = r.player.combat.energy;
        r.tick(press('attack1'));
        const why = `#${c.id} ${who} at step ${at}`;
        assert.equal(attackOf(r.player), r.player.attackFor('attack1', false), `${why}: the aerial replaces it`);
        assert.equal(r.player.combat.attack.time, 0, `${why}: from its first frame`);
        assert.equal(r.player.combat.attack.def.deflectProjectiles, false, `${why}: nothing turns projectiles back any more`);
        assert.ok(r.player.combat.energy >= before - EPS, `${why}: the Deflect's 15 is not given back, nothing else paid`);
        assert.equal(r.player.combat.cooldowns.size, 0, `${why}: no cooldown anywhere`);
      }
    }
  }
});

test('a Deflect gives way to an air jump and to an air dash, each paying only its own cost', () => {
  for (const c of playableCharacters()) {
    for (const [who, rig] of RIGS) {
      const j = airborne(rig(c));
      j.tick(press('shield'));
      const jumps = j.player.airJumps;
      j.tick();
      j.tick(press('jump'));
      assert.equal(j.player.combat.attack, null, `#${c.id} ${who}: the Deflect is over`);
      assert.equal(j.player.airJumps, jumps - 1, `#${c.id} ${who}: by an air jump`);
      assert.ok(j.player.body.vy < 0, 'rising');

      const d = airborne(rig(c));
      d.tick(press('shield'));
      d.tick();
      const before = d.player.combat.energy;
      d.tick(AIR_DASH);
      assert.equal(d.player.dash?.air, true, `#${c.id} ${who}: the air dash`);
      assert.equal(d.player.combat.attack, null, 'the Deflect is over');
      assert.ok(Math.abs(before - d.player.combat.energy - DASH_ENERGY_COST) < EPS, `#${c.id} ${who}: the air dash's own 15`);
      assert.ok(Math.abs(d.player.combat.energy - (100 - DEFLECT_ENERGY_COST - DASH_ENERGY_COST) - d.player.energyDef.regen * DT) < EPS,
        `#${c.id} ${who}: two separate payments`);
    }
  }
});

test('a Deflect never restarts into itself, never gives way on its own step, and a request that cannot start never ends it', () => {
  for (const c of playableCharacters()) {
    for (const [who, rig] of RIGS) {
      // Pressed again (held or tapped): the same Deflect plays on, nothing paid.
      const r = airborne(rig(c));
      r.tick(press('shield'));
      const deflect = r.player.combat.attack;
      const energy = r.player.combat.energy;
      for (let i = 0; i < 4; i++) {
        r.tick(i % 2 ? { shield: true } : press('shield'));
        if (r.player.combat.attack !== deflect) break;
        assert.ok(r.player.combat.energy >= energy - EPS, `#${c.id} ${who}: never paid again`);
      }
      // Pressed with an attack on the same step: the Deflect wins that step.
      const same = airborne(rig(c));
      same.tick({ ...press('shield'), ...press('attack1') });
      assert.equal(same.player.combat.attack?.def, same.player.deflect, `#${c.id} ${who}: the Deflect on its own step`);
      // Exhausted by the Deflect itself: an air dash cannot start, and the
      // Deflect plays on.
      const tired = airborne(rig(c));
      tired.player.combat.setEnergy(DEFLECT_ENERGY_COST);
      tired.tick(press('shield'));
      const kept = tired.player.combat.attack;
      assert.equal(tired.player.combat.energyExhausted, true);
      tired.tick(AIR_DASH);
      assert.equal(tired.player.combat.attack, kept, `#${c.id} ${who}: no air dash, the Deflect plays on`);
      // No air jump left: the jump cannot start, the Deflect plays on.
      const spent = airborne(rig(c));
      spent.tick(press('shield'));
      const held = spent.player.combat.attack;
      spent.player.airJumps = 0;
      spent.tick(press('jump'));
      assert.equal(spent.player.combat.attack, held, `#${c.id} ${who}: no jump, the Deflect plays on`);
    }
  }
});

test('a cancelled Deflect turns nothing back after it ends; a projectile it already turned back stays turned', () => {
  for (const c of playableCharacters()) {
    const r = playerRig({ character: c, foeCharacter: C1, gap: 600, automaticTurnAround: false });
    airborne(r);
    r.tick(press('shield'));
    r.until(() => r.player.combat.phase === 'active');
    const shot = () => {
      const p = Projectile.release(r.foe, { id: 'attack2_object', offset: { x: 0, y: 0 }, direction: -1 });
      const hb = r.player.deflect.hitbox;
      const b = r.player.body;
      p.x = (r.player.facing > 0 ? b.x + hb.x : b.x - hb.x - hb.w) + hb.w / 2;
      p.y = b.y + hb.y + hb.h / 2;
      return p;
    };
    const first = shot();
    r.system.update([r.player, r.foe], [first], []);
    assert.equal(first.owner, r.player, `#${c.id}: turned back while the Deflect is live`);
    r.tick(press('jump'));
    assert.equal(r.player.combat.attack, null, `#${c.id}: cancelled by an air jump`);
    assert.equal(first.owner, r.player, `#${c.id}: what it turned back stays turned`);
    const second = shot();
    r.system.update([r.player, r.foe], [second], []);
    assert.equal(second.owner, r.foe, `#${c.id}: nothing turned back after the cancel`);
  }
});

test('a Deflect cuts short only what may be cut: an aerial that has not hit plays on, cancelling out of a Deflect is not cancelling into one', () => {
  for (const c of playableCharacters()) {
    for (const [who, rig] of RIGS) {
      const r = airborne(rig(c));
      r.tick(press('attack1'));
      const aerial = r.player.combat.attack;
      r.tick();
      r.tick(press('shield'));
      assert.equal(r.player.combat.attack, aerial, `#${c.id} ${who}: the aerial plays on`);
      assert.equal(r.player.combat.energy, 100, `#${c.id} ${who}: no Deflect paid`);
    }
  }
});

// ---- A move that harms nobody is cancellable ------------------------------------------------------

test('a heal of its own gives way to any valid request: before it heals nothing is healed and no cooldown starts; after, both are kept', () => {
  const requests = [
    ['attack', press('attack1'), (p) => attackOf(p) === p.attackFor('attack1')],
    ['technique', press('attack3'), (p) => p.technique?.def.id === 'attack3'],
    ['jump', press('jump'), (p) => !p.grounded],
    ['Dash', DASH, (p) => !!p.dash],
    ['Shield', press('shield'), (p) => p.combat.shielding],
  ];
  for (const [who, rig] of RIGS) {
    for (const [label, request, check] of requests) {
      // Before the release.
      const r = rig(C3);
      r.player.combat.launchPoint = 30;
      r.tick(press('attack4'));
      const cast = r.player.technique;
      assert.equal(cast?.def.id, 'attack4', `${who}: the Mystical Palm Technique`);
      assert.equal(cast.def.freeCancel, true, 'a heal harms nobody');
      r.tick();
      r.tick(request);
      assert.notEqual(r.player.technique, cast, `${who} ${label}: the cast is over`);
      assert.ok(check(r.player), `${who} ${label}: started`);
      assert.equal(r.player.combat.launchPoint, 30, `${who} ${label}: nothing healed`);
      assert.equal(r.player.combat.abilityCooldowns.active('attack4'), false, `${who} ${label}: no cooldown, never released`);
      // After the release: the heal and its 3 s are kept.
      const h = rig(C3);
      h.player.combat.launchPoint = 30;
      h.tick(press('attack4'));
      h.until(() => h.player.technique?.released);
      assert.equal(h.player.combat.launchPoint, 20, `${who}: healed 10`);
      assert.ok(Math.abs(h.player.combat.abilityCooldowns.remaining('attack4') - 3) < EPS, `${who}: its 3 s from the release`);
      h.tick(request);
      assert.notEqual(h.player.technique?.def.id, 'attack4', `${who} ${label}: the release pose is cut`);
      assert.ok(check(h.player), `${who} ${label}: started`);
      assert.ok(h.player.combat.abilityCooldowns.active('attack4'), `${who} ${label}: the cooldown runs on`);
      assert.equal(h.player.combat.launchPoint, 20, `${who} ${label}: the heal is kept`);
    }
  }
  // Its own button again during the cast restarts nothing.
  const r = far(C3);
  r.tick(press('attack4'));
  const cast = r.player.technique;
  r.tick();
  r.tick(press('attack4'));
  assert.equal(r.player.technique, cast, 'never into itself');
});

test('a technique or summon that harms keeps its commitment: no request ends it', () => {
  const r = far(C1);
  r.tick(press('attack4'));
  const technique = r.player.technique;
  for (const now of [press('attack1'), press('extra_attack'), press('attack5'), press('jump'), DASH, press('shield')]) {
    r.tick(now);
    assert.equal(r.player.technique, technique, JSON.stringify(now));
  }
  assert.equal(r.player.combat.energy, 100);
  const c5 = getCharacter('0005');
  const s = far(c5);
  s.tick(press('attack5'));
  const summon = s.player.pendingSummon;
  assert.ok(summon, 'the Red Balloon\'s startup');
  for (const now of [press('attack1'), press('jump'), DASH, press('shield')]) {
    s.tick(now);
    if (!s.player.pendingSummon) break;
    assert.equal(s.player.pendingSummon, summon, JSON.stringify(now));
  }
});

// ---- Whose, and how ------------------------------------------------------------------------------

test('the player, a CPU and a bare controller are bound by exactly the same rules: the same presses, the same steps', () => {
  const run = (c, make) => {
    const r = make(c);
    const out = [];
    const script = {
      0: press('attack1'), 3: press('attack2'), 6: DASH, 9: press('jump'), 40: press('jump'), 42: press('shield'), 44: press('attack1'),
      80: press('extra_attack'), 82: press('attack1'), 120: press('attack1'),
    };
    for (let i = 0; i < 160; i++) {
      r.tick(script[i] ?? {});
      const p = r.player;
      out.push([p.state, attackOf(p), p.body.x.toFixed(4), p.body.y.toFixed(4), p.combat.energy.toFixed(3)].join(' '));
    }
    return out;
  };
  for (const c of playableCharacters()) {
    const player = run(c, (x) => far(x));
    assert.deepEqual(run(c, (x) => driven(x, 'cpu')), player, `#${c.id}: CPU`);
    assert.deepEqual(run(c, (x) => driven(x)), player, `#${c.id}: bare controller`);
  }
});

test('deterministic: the same requests resolve the same way, step for step', () => {
  const run = (c) => {
    const r = playerRig({ character: c, gap: 260 });
    const out = [];
    const script = {
      0: press('attack1'), 4: press('attack3'), 9: press('extra_attack'), 30: DASH, 34: press('attack2'),
      60: press('jump'), 62: press('shield'), 64: press('attack1'), 90: press('attack1'), 92: press('shield'),
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
