// Run with node --test tests/systems/cloak.test.mjs (no dependencies).
// The shared `cloak`: what a technique may let go of besides a projectile, a
// burst and a heal, for any fighter (js/game/combat/technique.js). Released,
// it cloaks its own fighter for its seconds (CombatState.cloakFor): drawn as
// a faint shimmer (Arena.cloakAlpha) and out of a CPU's sight (it sees the
// fighter where it vanished: js/game/ai/cpu-intelligence/perception.js),
// until it runs out or the fighter shows itself, by starting a move or being
// reached by a hit. No invulnerability: it is struck, pushed and pulled as
// ever. A cast that only cloaks harms nobody, so it is no attack and gives
// way to any move; its cooldown is the policy's 3 s; it costs no Energy.
// Exercised here on a test-only fighter (#0001 with a cloak in place of its
// Unlimited Void), never in the game; #0011's Camouflage in fighter-0011.
import test from 'node:test';
import assert from 'node:assert/strict';
import { duel, fakeSpritesOf, makeFighter, steps } from '../helpers/fighter-harness.mjs';
import { getCharacter } from '../../js/data/characters.js';
import { loadoutProblems } from '../../js/data/loadout.js';
import { cooldownClass } from '../../js/data/cooldowns.js';
import { CombatState } from '../../js/game/combat/combat-state.js';
import { createTechniqueDefinition, techniqueProblem } from '../../js/game/combat/technique.js';
import { analyzeCapabilities, moveReady } from '../../js/game/ai/cpu-intelligence/capabilities.js';
import { Perception } from '../../js/game/ai/cpu-intelligence/perception.js';
import { Arena } from '../../js/game/arena.js';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const BASE = getCharacter('0001');
const CLOAKER = Object.freeze({
  ...BASE,
  id: 'test-cloaker',
  displayName: 'Cloaker',
  available: false,
  rosterSlot: null,
  specialAbilities: ['attack5'],
  techniques: { ...BASE.techniques, attack4: { castAnimation: 'attack4_cast', releaseAnimation: 'attack4_release', cloak: 1.5 } },
});
const SPRITES = fakeSpritesOf(CLOAKER);
const solo = () => makeFighter({ character: CLOAKER, sprites: SPRITES });

// ---- The schema ------------------------------------------------------------------------

test('a cloak is seconds from 0; a cast that only cloaks releases something, harms nobody, waits 3 s and costs nothing', () => {
  const t = createTechniqueDefinition({ id: 'attack4', castAnimation: 'a', releaseAnimation: 'b', cloak: 2 });
  assert.equal(t.cloak, 2);
  assert.equal(t.offense.attack, false, 'no attack');
  assert.equal(t.freeCancel, true, 'it gives way to any move');
  assert.deepEqual([t.cooldownClass, t.cooldown, t.energyCost], ['exceptional', 3, 0]);
  assert.equal(cooldownClass('technique', { cloak: 2 }), 'exceptional');
  assert.equal(createTechniqueDefinition({ id: 'x', heal: 3 }).cloak, 0, 'none by default');
  for (const bad of [-1, Number.NaN, '2', Infinity]) {
    assert.throws(() => createTechniqueDefinition({ id: 'x', cloak: bad }), /cloak must be a number of seconds from 0/, String(bad));
  }
  const { fighter } = solo();
  assert.equal(techniqueProblem(fighter, fighter.techniqueDefs.attack4), null, 'it releases its cloak');
  assert.match(techniqueProblem(fighter, { ...fighter.techniqueDefs.attack4, cloak: 0 }), /no heal and no cloak/);
  assert.deepEqual(loadoutProblems(CLOAKER), []);
  assert.ok(loadoutProblems({ ...CLOAKER, techniques: { ...CLOAKER.techniques, attack4: { ...CLOAKER.techniques.attack4, cloak: 0 } } })
    .some((p) => /releases nothing/.test(p)));
});

test('the state: the longer cloak wins, it runs down in real time, a freeze included, and reveal ends it', () => {
  const c = new CombatState();
  assert.equal(c.cloaked, false);
  c.cloakFor(1);
  c.cloakFor(0.5);
  assert.equal(c.cloak, 1, 'the longer wins');
  c.hitstop = 0.2;
  for (let i = 0; i < 30; i++) c.update(1 / 60);
  assert.ok(Math.abs(c.cloak - 0.5) < 1e-9, 'through a freeze too');
  for (let i = 0; i < 30; i++) c.update(1 / 60);
  assert.equal(c.cloaked, false, 'gone at its end, to the step');
  c.cloakFor(3);
  c.reveal();
  assert.equal(c.cloak, 0);
});

// ---- In play ---------------------------------------------------------------------------

test('released, it cloaks its own fighter for its seconds, its cooldown starting then; broken before, nothing', () => {
  const { fighter, step } = solo();
  step(P('attack4'));
  while (fighter.technique?.phase === 'cast') step({});
  assert.equal(fighter.combat.cloaked, true);
  assert.ok(fighter.combat.abilityCooldowns.active('attack4'));
  for (let i = 0; i < steps(1.6); i++) step({});
  assert.equal(fighter.combat.cloaked, false, 'for its seconds');
  const d = duel({ attackerCharacter: BASE, targetCharacter: CLOAKER, targetSprites: SPRITES, gap: 40 });
  d.tick({}, P('attack4'));
  d.tick(P('attack1'));
  for (let i = 0; i < steps(1); i++) d.tick();
  assert.equal(d.target.combat.cloaked, false, 'a hit in its cast: no cloak');
  assert.equal(d.target.combat.abilityCooldowns.active('attack4'), false, 'and no cooldown');
});

test('no invulnerability: a cloaked fighter is struck, pulled and pushed as ever, and a hit or a block shows it', () => {
  const d = duel({ attackerCharacter: BASE, targetCharacter: CLOAKER, targetSprites: SPRITES, gap: 40 });
  d.target.combat.cloakFor(5);
  d.tick(P('attack1'));
  for (let i = 0; i < 30; i++) d.tick();
  assert.ok(d.events.some((e) => e.type === 'hit' && e.target === d.target), 'struck');
  assert.equal(d.target.combat.cloaked, false, 'shown');
});

test('its first move shows it, whatever it is: a strike, a throw, a technique, the Deflect; moving never does', () => {
  for (const press of ['attack1', 'attack2', 'attack5']) {
    const { fighter, step } = solo();
    step({});
    fighter.combat.cloakFor(5);
    step(P(press));
    assert.equal(fighter.combat.cloaked, false, press);
  }
  const { fighter, step } = solo();
  step(P('jump'));
  for (let i = 0; i < 10; i++) step({});
  fighter.combat.cloakFor(5);
  step(P('shield'));
  assert.equal(fighter.combat.cloaked, false, 'the Deflect');
  const r = solo();
  r.fighter.combat.cloakFor(5);
  for (let i = 0; i < 20; i++) r.step({ runRight: true });
  r.step({ mouvementRightPressed: true });
  for (let i = 0; i < 20; i++) r.step({});
  r.step(P('jump'));
  for (let i = 0; i < 20; i++) r.step({});
  assert.equal(r.fighter.combat.cloaked, true, 'running, Dashing and jumping keep it');
  r.fighter.respawn(r.fighter.stage);
  assert.equal(r.fighter.combat.cloaked, false, 'a respawn is a fresh life');
});

test('drawn as a faint shimmer, steady under reduced motion; anyone else in full', () => {
  const { fighter } = solo();
  const arena = { reducedMotion: true, fxTime: 1.3 };
  assert.equal(Arena.prototype.cloakAlpha.call(arena, fighter), 1);
  fighter.combat.cloakFor(1);
  assert.equal(Arena.prototype.cloakAlpha.call(arena, fighter), 0.2);
  const moving = Arena.prototype.cloakAlpha.call({ reducedMotion: false, fxTime: 1.3 }, fighter);
  assert.ok(moving > 0.1 && moving < 0.3, `a shimmer (${moving})`);
});

// ---- The CPU ---------------------------------------------------------------------------

test('a CPU cannot see a cloaked opponent: the picture it last saw stands where it vanished, until it shows itself', () => {
  const d = duel({ attackerCharacter: CLOAKER, attackerSprites: SPRITES, targetCharacter: BASE, gap: 400 });
  const eye = new Perception(() => 0.5, { react: [0.15, 0.15], lapse: 0 });
  let clock = 0;
  const look = () => {
    clock += 1 / 60;
    return eye.observe(d.attacker, { projectiles: [] }, clock, d.target);
  };
  for (let i = 0; i < 30; i++) {
    d.tick({ runRight: true });
    look();
  }
  d.attacker.combat.cloakFor(5);
  // Its reaction time still shows the last of it moving...
  const before = look();
  assert.equal(before.hidden, false);
  for (let i = 0; i < 12; i++) {
    d.tick({ runRight: true });
    look();
  }
  // ...then it stands where it was last seen, doing nothing.
  const ghost = look();
  const x = ghost.x;
  assert.deepEqual([ghost.hidden, ghost.vx, ghost.vy, ghost.attack, ghost.dash], [true, 0, 0, null, null]);
  for (let i = 0; i < 30; i++) {
    d.tick({ runRight: true });
    assert.equal(look().x, x, 'never followed');
  }
  d.attacker.combat.reveal();
  for (let i = 0; i < 12; i++) look();
  assert.equal(look().hidden, false, 'seen again once it shows itself, after the reaction time');
});

test('the CPU knows a cloak of its own: a move for a safe moment, ready with nobody to fight, never a strike', () => {
  const { fighter } = solo();
  const caps = analyzeCapabilities(fighter);
  const m = caps.moves.find((x) => x.id === 'attack4');
  assert.equal(m.cloak, 1.5);
  assert.ok(m.roles.has('cloak'));
  assert.equal(m.offense.attack, false);
  fighter.opponent = { lostToVoid: true };
  assert.equal(moveReady(fighter, m), true, 'a pure utility, like a heal');
  assert.ok(caps.moves.filter((x) => x.id !== 'attack4').every((x) => x.cloak === 0));
});
