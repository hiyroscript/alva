// Run with node --test tests/systems/charm.test.mjs (no dependencies).
// A charm (`charm: seconds`, one of the shared hit effects in
// js/game/combat/hit-effects.js): a real hit that charms its target for that
// long. Until it runs out, every hit the charmed fighter would land on
// whoever charmed it (a strike, a projectile, a turned-back projectile)
// heals that fighter instead: its damage taken off the charmer's Launch
// Point, nothing launched, stunned or frozen, recorded as a `charmed`
// event. Nothing else changes for the charmed fighter: it moves, Shields
// and hits anyone else as ever, and a raised Shield still blocks its hits
// like any other. Checked on test-only fighters (#0001's body and clips
// with charms of their own) against #0001, #0002 and #0003 through the real
// Fighter, projectiles and CombatSystem; for the cooldown policy (a charm
// is exceptional: 3 s), the attack classification, the CPU (charmed, it
// strikes nothing at its charmer) and the arena (the charm mark, the heal
// glow).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createProjectileDefinition } from '../../js/game/combat/projectile.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { isHarmfulHit, techniqueOffense } from '../../js/game/combat/offense.js';
import { cooldownClass } from '../../js/data/cooldowns.js';
import { getCharacter } from '../../js/data/characters.js';
import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { HitEffects } from '../../js/game/rendering/hit-fx.js';
import { CHARM_MARK_STYLE, charmMarkRect, drawCharmMark } from '../../js/game/rendering/fighter-status.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { StageCollision } from '../../js/game/physics.js';
import { mulberry32 } from '../../js/core/utils.js';
import { CONFIG } from '../../js/config.js';
import { DT, STAGE, def, duel, fakeSprites, fakeSpritesOf, makeFighter, stageMap, steps } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BOX = { x: 0, y: -10, w: 10, h: 10 };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// The charmer: #0001 whose Jab charms for 2 s, and whose Red throws a
// charming shot. Everything else is #0001's own.
const CHARMER = {
  ...def,
  id: 'test-charmer',
  attacks: { ...def.attacks, attack1: { ...def.attacks.attack1, charm: 2, hitCancel: null } },
  projectiles: { ...def.projectiles, attack2_object: { ...def.projectiles.attack2_object, charm: 1.5, repel: false } },
};
const SPRITES = fakeSpritesOf(CHARMER);
const versus = (target = def, opts = {}) => duel({
  attackerCharacter: CHARMER, attackerSprites: SPRITES, targetCharacter: target, targetSprites: fakeSpritesOf(target), ...opts,
});
const after = (d, seconds, held = {}, targetHeld = {}) => {
  for (let i = 0; i < steps(seconds); i++) d.tick(held, targetHeld);
};
// The charmer's Jab lands on the target: it is charmed from there.
function charmed(target = def, opts = {}) {
  const d = versus(target, opts);
  d.tick(P('attack1'));
  d.until(() => d.events.some((e) => e.type === 'hit'), 40);
  after(d, 0.5);
  return d;
}

// ---- Data -------------------------------------------------------------------------------

test('a charm is seconds from 0 any hit may declare: none by default, inherited like the other hit effects, refused when it is anything else', () => {
  assert.equal(createAttackDefinition({ id: 'a', hitbox: BOX, damage: 3, charm: 2 }).charm, 2);
  assert.equal(createAttackDefinition({ id: 'b', hitbox: BOX, damage: 3 }).charm, 0, 'none by default');
  const multi = createAttackDefinition({
    id: 'c', hitbox: BOX, charm: 1,
    hits: [{ at: 0.1, active: 0.05, damage: 1 }, { at: 0.2, active: 0.05, damage: 1, charm: 0 }],
  });
  assert.deepEqual(multi.hits.map((h) => h.charm), [1, 0], 'a strike takes the attack\'s unless it says');
  const shot = createProjectileDefinition({ id: 'd', speed: 100, damage: 1, charm: 2, pierce: { hits: 2, interval: 0.1 }, finisher: { damage: 3 } });
  assert.equal(shot.finisher.charm, 2, 'a finisher inherits its projectile\'s');
  const cast = createTechniqueDefinition({ id: 'e', burst: { hitbox: BOX, hit: { damage: 1, charm: 2.5 } } });
  assert.equal(cast.burst.hit.charm, 2.5);
  for (const bad of [-1, '2', true, Infinity, NaN]) {
    assert.throws(() => createAttackDefinition({ id: 'f', hitbox: BOX, damage: 3, charm: bad }), /charm must be seconds from 0/, String(bad));
  }
  assert.throws(() => createAttackDefinition({ id: 'g', animation: 'a', pending: true, charm: 1 }), /pending but declares charm/);
});

test('a charm is exceptional, like a heal or a paralysis: 3 s, and a ten-damage charm still 5 s', () => {
  assert.equal(cooldownClass('attack', { hitbox: BOX, damage: 3, charm: 1 }), 'exceptional');
  assert.equal(createAttackDefinition({ id: 'a', hitbox: BOX, damage: 3, charm: 1 }).cooldown, 3);
  assert.equal(createTechniqueDefinition({ id: 't', burst: { hitbox: BOX, hit: { damage: 1, charm: 2.5 } } }).cooldown, 3);
  assert.equal(createTechniqueDefinition({ id: 't', burst: { hitbox: BOX, hit: { damage: 10, charm: 2.5 } } }).cooldown, 5);
  const projectiles = { x_object: { damage: 3, charm: 1 } };
  assert.equal(cooldownClass('attack', { hitbox: null, projectile: { id: 'x_object' } }, { projectiles }), 'exceptional', 'a thrown one too');
  assert.equal(createAttackDefinition({ id: 'b', hitbox: BOX, damage: 3, charm: 0 }).cooldown, 0, 'no charm, no cooldown');
});

test('a hit that charms is an attack, whatever else it does', () => {
  assert.equal(isHarmfulHit({ damage: 0, charm: 1 }), true);
  assert.equal(isHarmfulHit({ damage: 0, charm: 0 }), false);
  const song = createTechniqueDefinition({ id: 's', burst: { hitbox: BOX, hit: { damage: 1, charm: 2.5 } } });
  assert.deepEqual([...techniqueOffense(song).sources], ['burst']);
  assert.equal(song.offense.attack, true);
});

// ---- Charming -----------------------------------------------------------------------------

test('a real hit charms its target, by the attacker, for its seconds; the event says so', () => {
  for (const target of ['0001', '0002', '0003'].map(getCharacter)) {
    const d = versus(target);
    d.tick(P('attack1'));
    d.until(() => d.events.length > 0, 40);
    const [hit] = d.events;
    assert.equal(hit.type, 'hit', target.id);
    assert.equal(hit.charm, 2);
    assert.equal(d.target.combat.charmedBy, d.attacker);
    assert.ok(d.target.combat.charm > 1.9 && d.target.combat.charm <= 2, `#${target.id}: ${d.target.combat.charm}`);
    assert.equal(d.target.combat.charmedTo(d.attacker), true);
    assert.equal(d.attacker.combat.charm, 0, 'the charmer is not charmed');
  }
});

test('a blocked hit charms nobody', () => {
  const d = versus();
  d.tick({}, { shield: true });
  d.tick(P('attack1'), { shield: true });
  for (let i = 0; i < 40 && !d.events.length; i++) d.tick({}, { shield: true });
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.events[0].charm, 0);
  assert.equal(d.target.combat.charm, 0);
  assert.equal(d.target.combat.charmedBy, null);
});

// ---- Charmed ---------------------------------------------------------------------------------

test('charmed, its hit on its charmer heals the charmer instead: no Launch Point added, no launch, stun or freeze, never confirmed', () => {
  for (const target of ['0001', '0002', '0003'].map(getCharacter)) {
    const d = charmed(target, { gap: 30 });
    d.attacker.combat.launchPoint = 20;
    const vx = d.attacker.body.vx;
    const recovery = d.attacker.combat.launchRecoveryRemaining;
    d.events.length = 0;
    d.tick({}, P('attack1'));
    for (let i = 0; i < 40 && !d.events.length; i++) d.tick();
    const [e] = d.events;
    assert.equal(e?.type, 'charmed', `#${target.id}`);
    assert.equal(e.attacker, d.target, 'its hit');
    assert.equal(e.target, d.attacker, 'on its charmer');
    assert.equal(e.damage, 0);
    assert.ok(e.heal > 0, 'it heals');
    assert.equal(d.attacker.combat.launchPoint, 20 - e.heal, `#${target.id}: Launch Point taken off`);
    assert.equal(e.launchPointBefore - e.launchPointAfter, e.heal);
    assert.equal(e.launchSpeed, 0);
    assert.deepEqual(e.finalLaunch, { x: 0, y: 0 });
    assert.equal(d.attacker.combat.stun, 0, 'no stun');
    assert.equal(d.attacker.combat.hitstop, 0, 'no freeze');
    assert.equal(d.attacker.body.vx, vx, 'not moved');
    assert.equal(d.attacker.combat.launchRecoveryRemaining <= recovery, true, 'recovery not restarted');
    assert.notEqual(d.target.combat.attack?.confirmed, true, 'no hit to follow up');
  }
});

test('a heal never takes the charmer below 0 Launch Point', () => {
  const d = charmed(def, { gap: 30 });
  d.attacker.combat.launchPoint = 1;
  d.events.length = 0;
  d.tick({}, P('attack1'));
  for (let i = 0; i < 40 && !d.events.length; i++) d.tick();
  assert.equal(d.events[0].type, 'charmed');
  assert.equal(d.events[0].heal, 1);
  assert.equal(d.attacker.combat.launchPoint, 0);
});

test('its projectiles heal its charmer too, and are used up', () => {
  // #0001 charmed by a charmer, then throwing Red at it from afar.
  const d = versus(def, { gap: 200 });
  d.target.combat.charmBy(2, d.attacker);
  d.attacker.combat.launchPoint = 30;
  d.events.length = 0;
  d.tick({}, P('attack2'));
  for (let i = 0; i < 60 && !d.events.length; i++) d.tick();
  const [e] = d.events;
  assert.equal(e?.type, 'charmed');
  assert.equal(e.source, 'projectile');
  assert.equal(e.heal, getCharacter('0001').projectiles.attack2_object.damage);
  assert.equal(d.projectiles.length, 0, 'gone, as after a hit');
});

test('its charmer\'s raised Shield blocks its hits like any other: a block, Energy paid, nothing healed', () => {
  const d = charmed(def, { gap: 30 });
  d.attacker.combat.launchPoint = 20;
  d.events.length = 0;
  d.tick({ shield: true }, {});
  d.tick({ shield: true }, P('attack1'));
  for (let i = 0; i < 40 && !d.events.length; i++) d.tick({ shield: true });
  assert.equal(d.events[0].type, 'block');
  assert.ok(d.events[0].energyCost > 0);
  assert.equal(d.attacker.combat.launchPoint, 20);
});

test('it is charmed by one fighter only: its hits on anyone else land as ever', () => {
  const a = makeFighter().fighter;
  const charmer = makeFighter({ x: 700 }).fighter;
  const other = makeFighter({ x: 300 }).fighter;
  a.combat.charmBy(2, charmer);
  const system = new CombatSystem();
  const jab = createAttackDefinition({ id: 'jab', hitbox: BOX, damage: 3, baseLaunch: 1, directionalLaunch: 'horizontal' });
  const onOther = system.applyHit(a, other, jab);
  assert.equal(onOther.type, 'hit');
  assert.equal(other.combat.launchPoint, 3);
  charmer.combat.launchPoint = 10;
  const onCharmer = system.applyHit(a, charmer, jab);
  assert.equal(onCharmer.type, 'charmed');
  assert.equal(charmer.combat.launchPoint, 7);
});

test('a charm lasts its seconds, frozen or not; the longer one wins; another charmer\'s replaces it; a reset clears it', () => {
  const f = makeFighter().fighter;
  const one = makeFighter({ x: 700 }).fighter;
  const two = makeFighter({ x: 300 }).fighter;
  const c = f.combat;
  c.charmBy(1, one);
  c.hitstop = 0.5;
  for (let i = 0; i < steps(0.5); i++) c.update(DT);
  assert.ok(near(c.charm, 0.5, 1e-6), 'it ran through the freeze');
  c.charmBy(0.2, one);
  assert.ok(near(c.charm, 0.5, 1e-6), 'the longer one stays');
  c.charmBy(2, one);
  assert.ok(near(c.charm, 2, 1e-6));
  c.charmBy(0.3, two);
  assert.equal(c.charmedBy, two, 'another charmer\'s replaces it');
  assert.ok(near(c.charm, 0.3, 1e-6));
  for (let i = 0; i < steps(0.3); i++) c.update(DT);
  assert.equal(c.charm, 0);
  assert.equal(c.charmedBy, null, 'over: charmed by nobody');
  assert.equal(c.charmedTo(two), false);
  c.charmBy(2, one);
  f.reset(STAGE);
  assert.equal(f.combat.charm, 0, 'a reset (or a respawn) clears it');
  assert.equal(f.combat.charmedBy, null);
});

test('once it runs out, its hits land on its old charmer again', () => {
  const d = charmed(def, { gap: 30 });
  after(d, 2);
  assert.equal(d.target.combat.charm, 0);
  d.events.length = 0;
  d.tick({}, P('attack1'));
  for (let i = 0; i < 40 && !d.events.length; i++) d.tick();
  assert.equal(d.events[0].type, 'hit');
  assert.equal(d.events[0].target, d.attacker);
});

// ---- The CPU ---------------------------------------------------------------------------------

// A Brutal CPU (#0002) next to a still #0001 it has been charmed by for
// `charm` seconds: the attacks it starts over `seconds`.
function cpuAttacks(charm, seconds) {
  const stage = new StageCollision(stageMap());
  const D2 = getCharacter('0002');
  const cpu = new Fighter({
    def: D2, sprites: fakeSpritesOf(D2), stage, slot: 'p2', label: 'CPU', spawn: { x: 400, facing: 1 },
    controller: new CombatAIController({ difficulty: 'brutal', rng: mulberry32(5) }),
  });
  const foe = new Fighter({ def, sprites: fakeSprites(), stage, slot: 'p1', label: 'P1', spawn: { x: 460, facing: -1 } });
  cpu.opponent = foe;
  foe.opponent = cpu;
  const world = { stage, projectiles: [], clones: [], combat: new CombatSystem(), score: { p1: 0, p2: 0 }, timeLeft: 99, fighters: [foe, cpu] };
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: world };
  if (charm > 0) cpu.combat.charmBy(charm, foe);
  const started = [];
  for (let i = 0; i < steps(seconds); i++) {
    const before = cpu.combat.attack;
    foe.update(DT, ctx);
    cpu.update(DT, ctx);
    world.combat.update(world.fighters, [], []);
    const a = cpu.combat.attack;
    if (a && a !== before && a.def.id !== 'deflect') started.push({ id: a.def.id, at: i * DT, charmed: cpu.combat.charm > 0 });
  }
  return started;
}

test('a charmed CPU strikes nothing at its charmer until the charm runs out, then fights as ever', () => {
  assert.ok(cpuAttacks(0, 2).length > 0, 'uncharmed, right beside it, it attacks');
  const started = cpuAttacks(1.5, 4);
  assert.deepEqual(started.filter((s) => s.charmed), [], 'nothing while charmed');
  assert.ok(started.some((s) => s.at > 1.5), 'free again, it attacks');
});

// ---- On screen --------------------------------------------------------------------------------

test('the charmer glows as a charmed hit heals it: no shake, flash or impact spark', () => {
  const fx = new HitEffects({ reducedMotion: false });
  const a = makeFighter().fighter;
  const b = makeFighter({ x: 540 }).fighter;
  fx.take([{ type: 'charmed', attacker: a, target: b, damage: 0, heal: 3, hitstun: 0, launchSpeed: 0, point: { x: 540, y: 760 } }], {});
  assert.deepEqual(fx.sparks.map((s) => s.kind), ['heal']);
  assert.equal(fx.sparks[0].x, b.body.x, 'on the charmer');
  assert.equal(fx.shake.amp, 0);
  assert.equal(fx.flashes.size, 0);
});

test('the charm mark: a pink heart over a charmed fighter for exactly as long as it is charmed, above its tag (and its Special mark)', () => {
  const sprites = fakeSprites();
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites,
    input: { flush() {}, sample: () => ({}) },
  });
  battle.p2.controller = null;
  const { p1, p2 } = battle;
  Object.assign(battle.view, { pxW: 1280, pxH: 720, scale: 1.2, x: p1.body.x - 533, y: p1.body.y - 420, w: 1066, h: 600 });
  battle.setPhase('fight');
  assert.equal(battle.charmMarkRect(p2), null);
  p2.combat.charmBy(1, p1);
  const rect = battle.charmMarkRect(p2);
  assert.ok(rect, 'shown');
  const [x] = battle.markerAnchor(p2);
  assert.ok(Math.abs(rect.x + rect.w / 2 - x) <= 1, 'centred over it');
  assert.ok(rect.y + rect.h < battle.markerTop(p2), 'above its tag');
  assert.equal(battle.statusTop(p2), rect.y - 1);
  assert.equal(battle.charmMarkRect(p1), null, 'the charmer has none');
  for (let i = 0; i < steps(1); i++) p2.combat.update(DT);
  assert.equal(battle.charmMarkRect(p2), null, 'gone as it runs out');
  // Drawn as a heart in its pink, outlined.
  const fills = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'fill' ? () => fills.push(t.fillStyle) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  drawCharmMark(ctx, charmMarkRect(400, 200, 1.2, 1), 1, 0, true);
  assert.deepEqual(fills, [CHARM_MARK_STYLE.fill]);
  battle.destroy();
});
