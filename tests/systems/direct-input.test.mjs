// Run with node --test tests/systems/direct-input.test.mjs (no dependencies).
// The human player's attack buttons are direct: each asks for its own move
// and nothing else. Covered here: Attack 1 on its cooldown never becomes
// Attack 2 (nor the reverse, nor any button another's); the press for the
// attack already playing, mashed or held, never cuts, restarts or replays
// it and queues nothing to follow it; mashing never beats an attack's own
// length or cooldown; a melee press out of reach starts where the fighter
// stands and may whiff, with nothing moving it toward its target first (no
// Dash's clip, no Energy, the same course as with no target at all); and
// melee and ranged are one shared reading of an attack's data. Combat
// Assist and Combo Assist are gone: no module, state, method or setting
// of either is left. Shared rules: every playable fighter, never one
// fighter's numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { COMBAT_BUTTONS } from '../../js/config.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';
import { readMoveset } from '../../js/game/ai/moveset.js';
import { attackReach, isMeleeAttack, isRangedAttack } from '../../js/game/combat/attacks.js';
import { specialAction } from '../../js/data/loadout.js';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { DT } from '../helpers/fighter-harness.mjs';
import { playerRig, press } from '../helpers/player-rig.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const C1 = getCharacter('0001');
const EPS = 1e-6;

// The ground attack buttons `f` has (attacks, not specials).
const groundAttacks = (f) => COMBAT_BUTTONS.filter((a) => !specialAction(f.def, a) && f.attackFor(a, true));

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

// ---- Each button its own move ---------------------------------------------------------

test('every button asks for its own move: Attack 1 cooling down is never Attack 2, Attack 2 never Attack 1, and no button ever another\'s', () => {
  for (const c of playableCharacters()) {
    const probe = playerRig({ character: c, gap: 900 }).player;
    for (const action of groundAttacks(probe)) {
      const own = probe.attackFor(action);
      const why = `#${c.id} ${action}`;
      const r = playerRig({ character: c, gap: 900 });
      r.player.combat.cooldowns.set(own, 0.4);
      r.tick(press(action));
      assert.equal(r.player.combat.attack, null, `${why}: nothing starts while its own cooldown runs`);
      const seen = watchAttacks(r, 60);
      assert.deepEqual([...seen].filter((s) => !s.startsWith('buffered:')), [], `${why}: no other move instead, ever (${[...seen]})`);
      assert.ok([...seen].every((s) => s === `buffered:${action}`), `${why}: only its own press waits, for the buffer`);
      // Ready, the same press is its own attack.
      const fresh = playerRig({ character: c, gap: 900 });
      fresh.tick(press(action));
      assert.equal(fresh.player.combat.attack?.def.id, own, `${why}: its own attack`);
    }
  }
});

test('the press for the attack already playing, mashed or held, never cuts, restarts or replays it, and nothing follows it', () => {
  for (const c of playableCharacters()) {
    for (const action of groundAttacks(playerRig({ character: c, gap: 900 }).player)) {
      for (const held of [false, true]) {
        const why = `#${c.id} ${action}${held ? ' held' : ' mashed'}`;
        // Close enough to strike: the repeats meet a real hit and its freeze.
        const r = playerRig({ character: c, gap: 40 });
        r.tick(press(action));
        const rec = r.player.combat.attack;
        const combat = r.player.combat;
        let ends = 0;
        const endAttack = combat.endAttack.bind(combat);
        combat.endAttack = () => {
          if (combat.attack === rec) ends++;
          endAttack();
        };
        const animator = r.player.animator;
        const restarts = [];
        const play = animator.play.bind(animator);
        animator.play = (key, opts = {}) => {
          if (opts.restart || key !== animator.stateKey) restarts.push(key);
          return play(key, opts);
        };
        const thrown = new Set();
        let lastTime = 0;
        while (r.player.combat.attack === rec) {
          assert.equal(combat.cooldowns.has(rec.def.id), false, `${why}: no cooldown while it plays`);
          r.tick(held ? { [action]: true } : press(action));
          for (const p of r.projectiles) if (p.ability === rec.def.id) thrown.add(p);
          if (r.player.combat.attack !== rec) break;
          assert.ok(rec.time >= lastTime - EPS, `${why}: never restarted`);
          assert.equal(restarts.length, 0, `${why}: its clip never restarted (${restarts})`);
          assert.equal(r.player.bufferedAttack, null, `${why}: the repeat is not kept for later`);
          lastTime = rec.time;
        }
        assert.ok(rec.time >= rec.def.total - EPS || rec.motion?.done || !r.player.body.grounded, `${why}: played out`);
        assert.equal(ends, 1, `${why}: ended once`);
        const strikes = r.events.filter((e) => e.attacker === r.player && e.move === rec.def.id && e.type !== 'charmed');
        assert.ok(strikes.length <= (rec.def.hits?.length ?? 1), `${why}: ${strikes.length} strike(s), never repeated`);
        assert.ok(thrown.size <= 1, `${why}: one projectile at most`);
        // Nothing follows it: no other attack starts (a press made on the
        // very step it ended is a fresh one for its own move, which waits
        // out that move's cooldown in the buffer and expires).
        assert.equal(r.player.combat.attack, null, `${why}: nothing follows`);
        const later = [...watchAttacks(r, 20)];
        assert.deepEqual(later.filter((s) => s !== `buffered:${action}`), [], `${why}: nothing comes later (${later})`);
      }
    }
  }
});

test('mashing one button never beats the definitions: only its own attack, each played out, again only once its cooldown is over, Energy untouched', () => {
  for (const c of playableCharacters()) {
    for (const action of ['attack1', 'attack2']) {
      const why = `#${c.id} ${action}`;
      const r = playerRig({ character: c, gap: 40 });
      const own = [true, false].map((ground) => r.player.attackFor(action, ground));
      const played = new Map();
      for (let i = 0; i < 240; i++) {
        const before = r.player.combat.attack;
        r.tick(press(action));
        const now = r.player.combat.attack;
        if (before && before !== now) played.get(before).end = r.player.steps;
        if (now && now !== before) played.set(now, { start: r.player.steps });
        assert.equal(r.player.combat.energy, 100, `${why}: attacks never touch Energy`);
      }
      const runs = [...played].map(([rec, t]) => ({ rec, ...t })).filter((x) => x.end != null);
      assert.ok(runs.length >= 2, `${why}: ${runs.map((x) => x.rec.def.id)}`);
      runs.forEach((x, i) => {
        assert.ok(own.includes(x.rec.def.id), `${why}: only its own attack (${x.rec.def.id})`);
        if (i > 0) assert.ok(x.start >= runs[i - 1].end, `${why}: never before the last one ended`);
        const last = runs.slice(0, i).findLast((y) => y.rec.def.id === x.rec.def.id);
        if (last) assert.ok(x.start - last.end >= Math.round(x.rec.def.cooldown / DT), `${why}: again only once its cooldown is over`);
      });
    }
  }
});

// ---- Out of reach -----------------------------------------------------------------------

test('a melee press out of reach starts where the fighter stands and whiffs: the same course as with no target at all, no Dash\'s clip, no Energy', () => {
  for (const c of playableCharacters()) {
    const probe = playerRig({ character: c, gap: 900 }).player;
    for (const action of groundAttacks(probe)) {
      const atk = probe.attacks[probe.attackFor(action)];
      // A homing dash locks on by itself: its own motion, not an approach.
      if (!isMeleeAttack(atk) || atk.motion?.type === 'homing') continue;
      const why = `#${c.id} ${action}`;
      const reach = attackReach(atk);
      // Just past where the attack reaches (where an approach used to start).
      const gap = reach.x + reach.w + probe.def.pushbox.width + 60;
      const run = (withTarget) => {
        const r = playerRig({ character: c, gap: withTarget ? gap : 1100, x: 700 });
        if (!withTarget) r.player.opponent = null;
        r.tick(press(action));
        const started = r.player.combat.attack?.def.id;
        const out = [];
        const clips = new Set();
        for (let i = 0; i < 60; i++) {
          out.push([r.player.body.x, r.player.body.y, r.player.body.vx]);
          clips.add(r.player.animator.stateKey);
          r.tick();
        }
        return { started, out, clips, r };
      };
      const near = run(true);
      const alone = run(false);
      assert.equal(near.started, atk.id, `${why}: the attack starts at once, where it stands`);
      assert.deepEqual(near.out, alone.out, `${why}: the same course as with nobody there`);
      assert.ok(!near.clips.has('mouvment') && !near.clips.has('midair_mouvment'), `${why}: never the Dash's clip`);
      assert.equal(near.r.player.combat.energy, 100, `${why}: no Energy`);
      assert.ok(!near.r.events.some((e) => e.attacker === near.r.player && e.type === 'hit'), `${why}: it whiffs`);
    }
  }
});

test('melee and ranged are one shared reading of an attack\'s data: the AI moveset\'s and every other reader\'s alike', () => {
  for (const c of playableCharacters()) {
    const f = playerRig({ character: c }).player;
    const ms = readMoveset(f);
    assert.ok(ms.melee.length > 0, `#${c.id} has melee attacks`);
    for (const m of ms.melee) assert.ok(isMeleeAttack(m.atk) && !isRangedAttack(m.atk), `#${c.id} ${m.id}`);
    for (const r of ms.ranged) assert.ok(isRangedAttack(r.atk) && !isMeleeAttack(r.atk), `#${c.id} ${r.id}`);
    for (const atk of Object.values(f.attacks)) {
      assert.equal(isMeleeAttack(atk), !!atk.hitbox && !atk.projectile, `#${c.id} ${atk.id}`);
    }
  }
  // A pending attack (art only) is neither; nothing at all is neither.
  const pending = playerRig({ character: { ...C1, id: 'pending-variant', attacks: { ...C1.attacks, attack1: { animation: 'attack1', pending: true } } } })
    .player.attacks.attack1;
  assert.equal(isMeleeAttack(pending), false);
  assert.equal(isRangedAttack(pending), false);
  assert.equal(isMeleeAttack(null), false);
  // The moveset reads them through the same functions, never on its own.
  const moveset = read('js/game/ai/moveset.js');
  assert.match(moveset, /isRangedAttack\(atk\)/);
  assert.match(moveset, /isMeleeAttack\(atk\)/);
});

// ---- Nothing of the assists left ------------------------------------------------------------

test('Combat Assist and Combo Assist are gone: no module, Fighter state or method, controller option, setting or queued look', () => {
  for (const file of ['js/game/combat/combat-assist.js', 'js/game/combat/combo-assist.js']) assert.equal(existsSync(new URL(file, ROOT)), false, file);
  const r = playerRig({ character: C1 });
  r.tick(press('attack1'));
  r.tick(press('attack1'));
  for (const field of ['combatAssist', 'comboQueue']) assert.equal(field in r.player, false, field);
  for (const method of [
    'tryCombatAssist', 'combatAssistFor', 'assistPlan', 'assistIntents', 'stepCombatAssist', 'finishCombatAssist', 'cancelCombatAssist',
    'comboAction', 'noteFollowUp', 'queueFollowUp', 'holdFollowUp', 'attackSteer',
  ]) assert.equal(typeof Fighter.prototype[method], 'undefined', method);
  for (const getter of ['combatAssistOn', 'comboAssistOn', 'queuedFollowUp']) {
    assert.equal(Object.getOwnPropertyDescriptor(Fighter.prototype, getter), undefined, getter);
  }
  assert.equal('finished' in r.player.combat, false, 'no record of a played-out attack for a queue to wait on');
  assert.equal('turnHold' in r.player.combat.attack, false);
  assert.equal(r.player.bufferedAttack?.hold, undefined);
  for (const option of ['combatAssist', 'comboAssist']) assert.equal(option in r.player.controller, false, option);
  // No runtime source names either.
  for (const file of [
    'js/game/fighters/fighter.js', 'js/game/fighters/fighter-controller.js', 'js/game/arena.js', 'js/game/battle.js', 'js/game/practice.js',
    'js/game/rendering/hit-fx.js', 'js/game/combat/move-status.js', 'js/ui/ability-hud.js', 'js/ui/touch-controls.js', 'js/ui/settings-dialog.js',
    'js/screens/battle-screen.js', 'js/screens/practice-screen.js', 'css/ability-hud.css', 'css/touch-controls.css', 'css/settings.css',
  ]) {
    assert.doesNotMatch(read(file), /combatAssist|comboAssist|Combat Assist|Combo Assist|comboQueue|queuedFollowUp|is-queued|turnHold/, file);
  }
  // The player's input sample carries nothing of them either.
  assert.deepEqual(Object.keys(blankInput()).filter((k) => /assist|combo|queue/i.test(k)), []);
});
