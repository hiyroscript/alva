import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatFeedback } from '../../js/game/rendering/combat-feedback.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { Projectile, createProjectileDefinition, clashProjectiles } from '../../js/game/combat/projectile.js';
import { Battle } from '../../js/game/battle.js';
import { PracticeSession } from '../../js/game/practice.js';
import { getMap } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { getCharacter } from '../../js/data/characters.js';
import { setLanguage } from '../../js/localization/i18n.js';
import { DT, makeFighter, fakeSpritesOf, probeHit } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() { return new Proxy(this, { get: (target, key) => target[key] ?? (() => {}) }); }
};

const ALL = { damageHints: true, combatHints: true };
const input = { flush() {}, sample: () => ({}) };
const canvas = { getContext: () => ({}) };
const def = getCharacter('0001');
const other = getCharacter('0003');
function rig() {
  const a = makeFighter({ character: def }).fighter;
  const b = makeFighter({ character: other }).fighter;
  const combat = new CombatSystem();
  const feedback = new CombatFeedback();
  const take = (options = ALL, dt = 0) => {
    feedback.update(dt, combat.events, combat.deflections, [a, b], options);
    combat.events.length = 0;
    combat.deflections.length = 0;
  };
  return { a, b, combat, feedback, take };
}
const kinds = (feedback) => feedback.entries.map((entry) => entry.kind);
function shot(owner, { repel = false, erase = false, x = 900, y = 500, direction = 1 } = {}) {
  return new Projectile({
    owner, x, y, direction,
    def: createProjectileDefinition({ id: 'feedbackProbe', speed: 100, lifetime: 3, damage: 3, repel, erase, hitbox: { x: -12, y: -10, w: 24, h: 20 } }),
    anim: { frames: [{ artW: 24, artH: 20 }], fps: 1, loop: true },
  });
}
function battle(mode = 'quick-battle', interfaceSettings = ALL) {
  return new Battle({
    canvas, input, map: getMap('adamaris'), p1Def: def, p2Def: other,
    p1Sprites: fakeSpritesOf(def), p2Sprites: fakeSpritesOf(other), mode, seed: 19,
    interfaceSettings: { showDamageHints: interfaceSettings.damageHints, showCombatHints: interfaceSettings.combatHints },
  });
}

test('resolved hits of every source produce exact numbers on either fighter, including several in a step', () => {
  const { a, b, combat, feedback, take } = rig();
  const sources = [{}, { projectile: shot(a) }, { summon: { def: { id: 'probe' } } }, { technique: { def: { id: 'probe' } } }, { hazard: {} }];
  for (const options of sources) for (const [attacker, target] of [[a, b], [b, a]]) {
    combat.applyHit(attacker, target, probeHit({ id: 'feedbackProbe',  damage: 3 }), options);
  }
  for (let i = 0; i < 5; i++) combat.applyHit(a, b, probeHit({ id: 'feedbackProbe',  damage: 1 }));
  take();
  assert.equal(feedback.entries.length, 15);
  assert.deepEqual(feedback.entries.map((e) => e.text), [...Array(10).fill('+3'), ...Array(5).fill('+1')]);
  assert.equal(feedback.entries.filter((e) => e.target === a).length, 5);
  take(ALL, DT);
  assert.equal(feedback.entries.length, 15, 'a step with no events does not duplicate feedback');
  a.combat.charmBy(2, b);
  combat.applyHit(a, b, probeHit({ id: 'feedbackProbe',  damage: 3 }));
  take();
  assert.equal(feedback.entries.length, 15, 'charmed healing is not damage');
});

test('actual and perfect blocks label the defender; misses, ordinary hitstun and blockstun do not stun', () => {
  const { a, b, combat, feedback, take } = rig();
  b.combat.shielding = true;
  combat.update([a, b]);
  take();
  assert.deepEqual(kinds(feedback), [], 'raising Shield without contact does nothing');
  for (const perfect of [false, true]) {
    Object.defineProperty(b, 'perfectShield', { value: perfect, configurable: true });
    const event = combat.applyHit(a, b, probeHit({ id: 'feedbackProbe',  damage: 5, blockstun: 1, paralyze: 2 }));
    assert.equal(event.perfect, perfect);
    take();
  }
  assert.deepEqual(kinds(feedback), ['blocked', 'blocked']);
  assert.ok(feedback.entries.every((e) => e.target === b));
  b.combat.shielding = false;
  combat.applyHit(a, b, probeHit({ id: 'feedbackProbe',  damage: 3, hitstun: 1 }));
  take();
  assert.deepEqual(kinds(feedback), ['blocked', 'blocked', 'damage']);
});

test('only newly applied or extended paralysis stuns, sharing rows with damage', () => {
  const { a, b, combat, feedback, take } = rig();
  const hit = probeHit({ id: 'feedbackProbe',  damage: 3, paralyze: 2 });
  combat.applyHit(a, b, hit);
  take();
  assert.deepEqual(kinds(feedback), ['damage', 'stunned']);
  assert.deepEqual(feedback.entries.map((e) => e.stack), [0, 1]);
  for (let i = 0; i < 10; i++) take(ALL, DT);
  assert.equal(feedback.entries.filter((e) => e.kind === 'stunned').length, 1);
  combat.applyHit(a, b, hit);
  take();
  assert.equal(feedback.entries.filter((e) => e.kind === 'stunned').length, 1, 'unchanged hold is not reapplied');
  b.combat.paralysis = 1;
  combat.applyHit(a, b, hit);
  take();
  assert.equal(feedback.entries.filter((e) => e.kind === 'stunned').length, 2, 'extended hold is reapplied');
  combat.applyHit(a, b, probeHit({ id: 'feedbackProbe',  damage: 3, paralyze: 2, baseLaunch: 1, directionalLaunch: 'horizontal' }));
  take();
  assert.equal(feedback.entries.filter((e) => e.kind === 'stunned').length, 2, 'a launching hit releases the hold');
});

test('damage and combat hints are independent in every combination', () => {
  for (const damageHints of [false, true]) for (const combatHints of [false, true]) {
    const { a, b, combat, feedback, take } = rig();
    combat.applyHit(a, b, probeHit({ id: 'feedbackProbe',  damage: 3, paralyze: 2 }));
    take({ damageHints, combatHints });
    assert.deepEqual(kinds(feedback), [...(damageHints ? ['damage'] : []), ...(combatHints ? ['stunned'] : [])]);
    assert.equal(b.combat.launchPoint, 3);
    assert.equal(b.combat.paralysis, 2);
    take({ damageHints: false, combatHints: false });
    assert.deepEqual(kinds(feedback), [], 'turning a preference off clears its existing messages');
  }
});

test('Deflect snapshots each redirected projectile, including repelling clashes, never erasures or collisions', () => {
  const { a, b, combat, feedback, take } = rig();
  const atk = a.deflect;
  // Use the fighter's real resolved aerial Deflect capability.
  assert.ok(atk);
  a.combat.attack = { def: atk, time: atk.startup, hasHit: false };
  const box = atk.hitbox;
  const x = a.body.x + box.x + box.w / 2;
  const y = a.body.y + box.y + box.h / 2;
  const incoming = [shot(b, { x, y, direction: -1 }), shot(b, { x: x + 1, y, direction: -1 })];
  combat.update([a], incoming);
  assert.equal(combat.deflections.length, 2);
  take();
  assert.deepEqual(kinds(feedback), ['deflected', 'deflected']);
  assert.deepEqual(feedback.entries[0].point, { x, y });
  incoming[0].x += 200;
  incoming[0].alive = false;
  assert.deepEqual(feedback.entries[0].point, { x, y }, 'no dependency on a vanished/moving object');
  assert.equal(feedback.entries[0].target, null, 'never anchored to the deflecting fighter');
  for (const pair of [[{}, {}], [{ erase: true }, {}], [{ repel: true }, { repel: true }]]) {
    assert.equal(clashProjectiles([shot(a, pair[0]), shot(b, pair[1])]).length, 0);
  }
  const repel = shot(a, { repel: true });
  const plain = shot(b, { direction: -1 });
  const redirects = clashProjectiles([repel, plain]);
  combat.update([], [], [], redirects);
  take();
  assert.equal(feedback.entries.length, 3);
  assert.equal(plain.owner, a);
  assert.equal(clashProjectiles([repel, plain]).length, 0, 'same redirection is not reported twice');
});

test('Arena captures all fixed steps and post-combat stage hazards in both battle modes', () => {
  for (const mode of ['quick-battle', 'watch']) {
    const arena = battle(mode);
    arena.setPhase('fight');
    arena.p1.controller = arena.p2.controller = null;
    let hits = 0;
    // Resolve an actual hazard hit through the combat system, at the same
    // point in the Arena step that the volcano resolves its landed rocks.
    arena.stageHazards.resolve = (fighters, combat) => {
      const f = fighters[hits++ % 2];
      combat.hazardHit(f, probeHit({ id: 'feedbackProbe',  damage: 3 }), { x: f.body.x - 100, y: f.body.y - 200, w: 200, h: 300 }, {});
    };
    arena.render = () => {};
    arena.frame(DT * 3);
    assert.equal(hits, 3);
    assert.equal(arena.feedback.entries.length, 3, 'one feedback entry per fixed step, not per frame');
    assert.equal(arena.feedback.entries.filter((e) => e.target === arena.p1).length, 2);
    const ages = arena.feedback.entries.map((e) => e.age);
    arena.render();
    arena.render();
    assert.deepEqual(arena.feedback.entries.map((e) => e.age), ages, 'paused rendering never ages entries');
    arena.restart();
    assert.deepEqual(arena.feedback.entries, []);
    arena.feedback.add('blocked', { target: arena.p1 });
    arena.onVoid(arena.p1);
    assert.deepEqual(arena.feedback.entries, []);
    arena.feedback.add('blocked', { target: arena.p2 });
    arena.destroy();
    assert.deepEqual(arena.feedback.entries, []);
  }
});

test('Practice keeps exactly one CPU damage number with either preference and clears replaced fighters', () => {
  for (const enabled of [false, true]) {
    const session = new PracticeSession({ canvas, input, map: PRACTICE_MAP, def, sprites: fakeSpritesOf(def), interfaceSettings: { showDamageHints: enabled, showCombatHints: true } });
    session.setCPU(other, fakeSpritesOf(other));
    session.combat.applyHit(session.player, session.cpu, probeHit({ id: 'feedbackProbe',  damage: 3, paralyze: 2 }));
    session.updateFeedback(0);
    assert.equal(session.damageNumbers.length, 1);
    assert.deepEqual(kinds(session.feedback), ['damage', 'stunned']);
    session.removeCPU();
    assert.deepEqual(session.feedback.entries, []);
    session.feedback.add('blocked', { target: session.player });
    session.setFighter(other, fakeSpritesOf(other));
    assert.deepEqual(session.feedback.entries, []);
  }
});

test('display preferences never change a seeded fight or its cooldown and recovery timers', () => {
  const enabled = battle('watch');
  const disabled = battle('watch', {});
  for (const arena of [enabled, disabled]) arena.setPhase('fight');
  const state = (arena) => ({
    score: arena.score, time: arena.timeLeft,
    fighters: arena.fighters.map((f) => ({
      x: f.body.x, y: f.body.y, vx: f.body.vx, vy: f.body.vy,
      energy: f.combat.energy, launchPoint: f.combat.launchPoint,
      recovery: f.combat.launchRecoveryRemaining, paralysis: f.combat.paralysis,
      cooldowns: [...f.combat.cooldowns], abilities: [...f.combat.abilityCooldowns.entries],
    })),
  });
  for (let step = 0; step < 600; step++) {
    enabled.update(DT);
    disabled.update(DT);
    assert.deepEqual(state(enabled), state(disabled));
  }
});

test('resolved hits interrupt passive recovery; blocked hits and healing preserve its schedule', () => {
  const { a, b, combat } = rig();
  const hit = probeHit({ id: 'recoveryProbe', damage: 3 });
  combat.applyHit(a, b, hit);
  b.combat.updateLaunchRecovery(2);
  assert.equal(b.combat.recoveringLaunchPoint, true);
  b.combat.shielding = true;
  combat.applyHit(a, b, hit);
  assert.equal(b.combat.recoveringLaunchPoint, true);
  b.combat.heal(1);
  assert.equal(b.combat.recoveringLaunchPoint, true);
  b.combat.shielding = false;
  combat.applyHit(a, b, hit);
  assert.equal(b.combat.recoveringLaunchPoint, false);
  b.combat.heal(1);
  assert.equal(b.combat.recoveringLaunchPoint, false);
});

test('rendering follows camera and fighters, separates mixed feedback, translates and respects reduced motion', () => {
  const { a, feedback } = rig();
  feedback.add('damage', { target: a, damage: 3 });
  feedback.add('stunned', { target: a });
  feedback.add('deflected', { point: { x: 700, y: 400 }, top: -20 });
  const drawn = [];
  const ctx = { save() {}, restore() {}, strokeText() {}, measureText: (text) => ({ width: text.length * 9 }), fillText(text, x, y) { drawn.push({ text, x, y, alpha: this.globalAlpha, color: this.fillStyle }); } };
  const arena = { ctx, view: { scale: 1, dpr: 1, pxW: 1000, pxH: 800, x: 0, y: 0 }, reducedMotion: false,
    toScreen(x, y) { return [(x - this.view.x) * this.view.scale, (y - this.view.y) * this.view.scale]; },
    markerAnchor(f) { return this.toScreen(f.body.x, 600).concat(600); }, statusTop: () => 300 };
  const draw = () => { drawn.length = 0; feedback.draw(arena); return structuredClone(drawn); };
  setLanguage('en');
  const first = draw();
  assert.ok(first[1].y < first[0].y - 15);
  assert.equal(first[2].x, 700);
  assert.equal(first[2].y, 378);
  arena.view.x = 100;
  arena.view.scale = 2;
  assert.equal(draw()[2].x, 1200);
  arena.view.x = 0;
  arena.view.scale = 1;
  a.body.x += 30;
  assert.equal(draw()[0].x, first[0].x + 30);
  feedback.entries.forEach((e) => { e.age = 0.6; });
  assert.ok(draw()[0].y < first[0].y);
  arena.reducedMotion = true;
  assert.equal(draw()[0].y, first[0].y);
  assert.ok(draw()[0].alpha < 1);
  setLanguage('fr');
  assert.deepEqual(draw().map((e) => e.text), ['+3', 'Étourdi', 'Renvoyé']);
  setLanguage('en');
  feedback.update(0.2, [], [], [a], ALL);
  assert.deepEqual(feedback.entries, []);
});
