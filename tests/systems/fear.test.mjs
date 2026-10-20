// Run with node --test tests/systems/fear.test.mjs (no dependencies).
// A fear (`fear: seconds`, one of the shared hit effects in
// js/game/combat/hit-effects.js): a real hit that frightens its target for
// that long. Until it runs out, every real hit whoever frightened it lands
// on it (a strike, a projectile, a clone's, a burst) feeds that fighter: the
// hit lands in full, and its damage also comes off the frightener's own
// Launch Point. Nothing else changes for the frightened fighter: it moves,
// acts and Shields as ever, and a blocked hit feeds nothing. Checked on a
// test-only fighter (#0001's body and clips with a frightening Jab) against
// every fighter of the roster through the real Fighter and CombatSystem;
// for the cooldown policy (a fear is exceptional: 3 s), the attack
// classification and the arena (the fear mark, the feeding glow).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { createProjectileDefinition } from '../../js/game/combat/projectile.js';
import { createTechniqueDefinition } from '../../js/game/combat/technique.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { isHarmfulHit } from '../../js/game/combat/offense.js';
import { cooldownClass } from '../../js/data/cooldowns.js';
import { getCharacter } from '../../js/data/characters.js';
import { Battle } from '../../js/game/battle.js';
import { getMap } from '../../js/data/maps.js';
import { HitEffects } from '../../js/game/rendering/hit-fx.js';
import { FEAR_MARK_STYLE, drawFearMark, fearMarkRect, fearMarkTremble } from '../../js/game/rendering/fighter-status.js';
import { DT, STAGE, def, duel, fakeSprites, fakeSpritesOf, makeFighter, steps } from '../helpers/fighter-harness.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BOX = { x: 0, y: -10, w: 10, h: 10 };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const jab = (spec = {}) => createAttackDefinition({ id: 'jab', hitbox: BOX, damage: 3, ...spec });

// The frightener: #0001 whose Jab frightens for 3 s.
const FRIGHTENER = {
  ...def,
  id: 'test-frightener',
  attacks: { ...def.attacks, attack1: { ...def.attacks.attack1, fear: 3, hitCancel: null } },
};
const SPRITES = fakeSpritesOf(FRIGHTENER);
const versus = (target = def, opts = {}) => duel({
  attackerCharacter: FRIGHTENER, attackerSprites: SPRITES, targetCharacter: target, targetSprites: fakeSpritesOf(target), ...opts,
});

// ---- Data -------------------------------------------------------------------------------

test('a fear is seconds from 0 any hit may declare: none by default, inherited like the other hit effects, refused when it is anything else', () => {
  assert.equal(jab({ fear: 4 }).fear, 4);
  assert.equal(jab().fear, 0, 'none by default');
  const multi = createAttackDefinition({
    id: 'c', hitbox: BOX, fear: 2,
    hits: [{ at: 0.1, active: 0.05, damage: 1 }, { at: 0.2, active: 0.05, damage: 1, fear: 0 }],
  });
  assert.deepEqual(multi.hits.map((h) => h.fear), [2, 0], 'a strike takes the attack\'s unless it says');
  const shot = createProjectileDefinition({ id: 'd', speed: 100, damage: 1, fear: 2, pierce: { hits: 2, interval: 0.1 }, finisher: { damage: 3 } });
  assert.equal(shot.finisher.fear, 2, 'a finisher inherits its projectile\'s');
  assert.equal(createTechniqueDefinition({ id: 'e', burst: { hitbox: BOX, hit: { damage: 1, fear: 4 } } }).burst.hit.fear, 4);
  for (const bad of [-1, '2', true, Infinity, NaN]) {
    assert.throws(() => jab({ fear: bad }), /fear must be seconds from 0/, String(bad));
  }
  assert.throws(() => createAttackDefinition({ id: 'g', animation: 'a', pending: true, fear: 1 }), /pending but declares fear/);
});

test('a fear is exceptional: 3 s, and a ten-damage fear 5 s; a hit that frightens is an attack', () => {
  assert.equal(cooldownClass('attack', { hitbox: BOX, damage: 3, fear: 1 }), 'exceptional');
  assert.equal(jab({ fear: 1 }).cooldown, 3);
  assert.equal(createTechniqueDefinition({ id: 't', burst: { hitbox: BOX, hit: { damage: 10, fear: 2 } } }).cooldown, 5);
  const attacks = { attack1: { hitbox: BOX, damage: 3, fear: 4 } };
  assert.equal(cooldownClass('summon', { attack: 'attack1' }, { attacks }), 'exceptional', 'a clone\'s bite too');
  assert.equal(isHarmfulHit({ damage: 0, fear: 1 }), true);
});

// ---- Frightening and feeding ---------------------------------------------------------------

test('a real hit frightens its target, by the attacker, for its seconds; that hit itself feeds nothing', () => {
  for (const target of ['0001', '0002', '0003', '0004', '0005'].map(getCharacter)) {
    const d = versus(target);
    d.attacker.combat.launchPoint = 20;
    d.tick(P('attack1'));
    d.until(() => d.events.length > 0, 40);
    const [hit] = d.events;
    assert.equal(hit.type, 'hit', `#${target.id}`);
    assert.equal(hit.fear, 3);
    assert.equal(hit.fed, 0, 'not frightened yet as it lands: no feeding');
    assert.equal(d.target.combat.frightenedBy, d.attacker);
    assert.equal(d.target.combat.frightenedOf(d.attacker), true);
    assert.ok(d.target.combat.fear > 2.9 && d.target.combat.fear <= 3);
    assert.equal(d.attacker.combat.fear, 0, 'the frightener is not frightened');
    assert.equal(d.attacker.combat.launchPoint, 20);
  }
});

test('frightened, every real hit its frightener lands on it feeds the frightener: the hit in full, its damage off the frightener\'s Launch Point', () => {
  const a = makeFighter().fighter;
  const b = makeFighter({ x: 540 }).fighter;
  const system = new CombatSystem();
  b.combat.frightenBy(3, a);
  a.combat.launchPoint = 10;
  const e = system.applyHit(a, b, jab({ baseLaunch: 1, directionalLaunch: 'horizontal' }));
  assert.equal(e.type, 'hit');
  assert.equal(e.damage, 3, 'the hit lands in full');
  assert.equal(b.combat.launchPoint, 3);
  assert.ok(e.launchSpeed > 0, 'and launches as ever');
  assert.equal(e.fed, 3);
  assert.equal(a.combat.launchPoint, 7, 'fed: 3 off its own');
  // Never below 0.
  a.combat.launchPoint = 1;
  assert.equal(system.applyHit(a, b, jab()).fed, 1);
  assert.equal(a.combat.launchPoint, 0);
  // A projectile, a clone or a burst of its own feeds it all the same.
  a.combat.launchPoint = 9;
  const shot = system.applyHit(a, b, createProjectileDefinition({ id: 'p', speed: 100, damage: 1 }), { projectile: { ability: 'p' } });
  assert.equal(shot.fed, 1);
  assert.equal(a.combat.launchPoint, 8);
});

test('a blocked hit feeds nothing and frightens nobody; anyone else\'s hit on the frightened fighter feeds nobody', () => {
  const a = makeFighter().fighter;
  const b = makeFighter({ x: 540 }).fighter;
  const other = makeFighter({ x: 300 }).fighter;
  const system = new CombatSystem();
  b.combat.frightenBy(3, a);
  a.combat.launchPoint = 10;
  b.combat.shielding = true;
  const blocked = system.applyHit(a, b, jab({ fear: 2 }));
  assert.equal(blocked.type, 'block');
  assert.deepEqual([blocked.fed, blocked.fear], [0, 0]);
  assert.equal(a.combat.launchPoint, 10);
  b.combat.shielding = false;
  other.combat.launchPoint = 10;
  assert.equal(system.applyHit(other, b, jab()).fed, 0, 'frightened of one fighter only');
  assert.equal(other.combat.launchPoint, 10);
});

test('frightened, it moves, acts and Shields as ever', () => {
  const d = versus(def, { gap: 120 });
  d.target.combat.frightenBy(3, d.attacker);
  d.tick({}, P('attack1'));
  assert.ok(d.target.combat.attack, 'it attacks');
  for (let i = 0; i < steps(0.6); i++) d.tick();
  d.tick({}, { shield: true });
  assert.equal(d.target.combat.shielding, true, 'it Shields');
});

test('a fear lasts its seconds, frozen or not; the longer one wins; another fighter\'s replaces it; a reset clears it', () => {
  const f = makeFighter().fighter;
  const one = makeFighter({ x: 700 }).fighter;
  const two = makeFighter({ x: 300 }).fighter;
  const c = f.combat;
  c.frightenBy(1, one);
  c.hitstop = 0.5;
  for (let i = 0; i < steps(0.5); i++) c.update(DT);
  assert.ok(near(c.fear, 0.5, 1e-6), 'it ran through the freeze');
  c.frightenBy(0.2, one);
  assert.ok(near(c.fear, 0.5, 1e-6), 'the longer one stays');
  c.frightenBy(0.3, two);
  assert.equal(c.frightenedBy, two, 'another fighter\'s replaces it');
  for (let i = 0; i < steps(0.3); i++) c.update(DT);
  assert.equal(c.fear, 0);
  assert.equal(c.frightenedBy, null);
  c.frightenBy(2, one);
  f.reset(STAGE);
  assert.equal(f.combat.fear, 0);
  assert.equal(f.combat.frightenedBy, null);
});

// ---- On screen --------------------------------------------------------------------------------

test('a hit that feeds glows on its attacker beside its own effects', () => {
  const fx = new HitEffects({ reducedMotion: false });
  const a = makeFighter().fighter;
  const b = makeFighter({ x: 540 }).fighter;
  fx.take([{ type: 'hit', attacker: a, target: b, damage: 3, fed: 3, hitstun: 0.3, launchSpeed: 0, point: { x: 540, y: 760 } }], {});
  const heal = fx.sparks.find((s) => s.kind === 'heal');
  assert.ok(heal, 'a heal glow');
  assert.equal(heal.x, a.body.x, 'on the attacker');
  assert.ok(fx.sparks.some((s) => s.kind === 'hit'), 'and the hit\'s own spark');
});

test('the fear mark: a drop of cold sweat over a frightened fighter for exactly as long as it is frightened, above its other marks', () => {
  const sprites = fakeSprites();
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites,
    input: { flush() {}, sample: () => ({}) },
  });
  battle.p2.controller = null;
  const { p1, p2 } = battle;
  Object.assign(battle.view, { pxW: 1280, pxH: 720, scale: 1.2, x: p1.body.x - 533, y: p1.body.y - 420, w: 1066, h: 600 });
  battle.setPhase('fight');
  assert.equal(battle.fearMarkRect(p2), null);
  p2.combat.frightenBy(1, p1);
  const rect = battle.fearMarkRect(p2);
  assert.ok(rect, 'shown');
  const [x] = battle.markerAnchor(p2);
  assert.ok(Math.abs(rect.x + rect.w / 2 - x) <= 1, 'centred over it');
  assert.ok(rect.y + rect.h < battle.markerTop(p2), 'above its tag');
  assert.equal(battle.statusTop(p2), rect.y - 1);
  // Charmed too: above the heart.
  p2.combat.charmBy(1, p1);
  assert.ok(battle.fearMarkRect(p2).y + battle.fearMarkRect(p2).h < battle.charmMarkRect(p2).y, 'above the charm mark');
  assert.equal(battle.fearMarkRect(p1), null, 'the frightener has none');
  for (let i = 0; i < steps(1); i++) p2.combat.update(DT);
  assert.equal(battle.fearMarkRect(p2), null, 'gone as it runs out');
  // Drawn in its pale blue with a glint, trembling (still with reduced motion).
  const fills = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'fill' ? () => fills.push(t.fillStyle) : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  drawFearMark(ctx, fearMarkRect(400, 200, 1.2, 1), 1, 0, true);
  assert.deepEqual(fills, [FEAR_MARK_STYLE.fill, FEAR_MARK_STYLE.shine]);
  assert.equal(fearMarkTremble(0.03, 1, true), 0);
  assert.notEqual(fearMarkTremble(0.03, 1, false), 0);
  battle.destroy();
});
