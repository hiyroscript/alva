// Run with node --test tests/systems/ensemble.test.mjs (no dependencies).
// Ensembles (js/data/ensemble.js, js/game/rendering/ensemble.js): a fighter
// drawn as several members is still ONE fighter. Its definition says who
// its members are, where each stands and who performs each move, and the
// registry refuses every broken shape. At runtime one Fighter, one body
// and one combat state drive every member at once: the same state on the
// same step, each in its own clip; a move's performers act while the
// others step back behind them and glide home after, never jumping
// between places; a move is one move however many perform it; the idle
// float only lifts; the whole of it is mirrored with the fighter's facing,
// deterministic, and the same at any frame rate. An ordinary fighter is
// untouched. Exercised on made-up formations and on a test-only fighter
// (tests/fighters/fixtures/ensemble-fighter.mjs); #0006's own values are in
// tests/fighters/0006/. Paint still needs a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, STAGE, duel, fakeSpritesOf, makeFighter } from '../helpers/fighter-harness.mjs';
import { CHARACTERS, getCharacter } from '../../js/data/characters.js';
import {
  ENSEMBLE_DEFAULTS, GROUP_CLIPS, MIN_MEMBERS, ensembleMembers, ensembleProblems, hasClip, isEnsemble, memberIds,
} from '../../js/data/ensemble.js';
import { loadoutProblems } from '../../js/data/loadout.js';
import {
  EnsembleAnimator, EnsembleSprites, createAnimator, fighterParts, formationTargets, idlePose, poseBounds,
} from '../../js/game/rendering/ensemble.js';
import { SpriteAnimator } from '../../js/game/rendering/sprite-animator.js';
import { SpriteSet } from '../../js/game/rendering/sprite-normalizer.js';
import { Fighter } from '../../js/game/fighters/fighter.js';
import { ENSEMBLE_FIGHTER as ENS } from '../fighters/fixtures/ensemble-fighter.mjs';

const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const DEF_0001 = getCharacter('0001');
const clone = (def) => structuredClone(def);
const members = (f) => f.animator.members;
const keys = (f) => members(f).map((m) => m.animator.stateKey);
const place = (f, id) => members(f).find((m) => m.id === id);
const solo = (opts = {}) => makeFighter({ character: ENS, ...opts });
const homeOf = (id) => ENS.ensemble.members.find((m) => m.id === id).home;
const { retreat, spacing, glide } = ENS.ensemble;

// Steps until `pred` holds, failing instead of hanging.
function until(step, pred, held = {}, limit = 600) {
  for (let i = 0; i < limit; i++) if (pred(step(held))) return i + 1;
  throw new Error('condition never reached');
}

// ---- The data -------------------------------------------------------------------

test('an ensemble is data: the definitions keep its rules, and every broken shape is refused with the problem named', () => {
  assert.equal(MIN_MEMBERS, 2);
  assert.deepEqual([...GROUP_CLIPS], [
    'idle', 'run', 'jump', 'fall', 'land', 'hurt', 'midair_hurt', 'prepshield', 'shielding', 'releaseshield', 'mouvment', 'midair_mouvment',
  ]);
  for (const def of [...CHARACTERS, ENS]) assert.deepEqual(ensembleProblems(def), [], def.id);
  assert.deepEqual(loadoutProblems(ENS), [], 'its moves keep the loadout rules, their clips its performers\'');
  assert.equal(isEnsemble(ENS), true);
  assert.equal(isEnsemble(DEF_0001), false);
  assert.deepEqual(memberIds(ENS), ['pink', 'green', 'blue']);
  assert.deepEqual(ensembleMembers(DEF_0001), []);

  const breaks = (edit, pattern, base = ENS) => {
    const def = clone(base);
    edit(def);
    const problems = ensembleProblems(def);
    assert.ok(problems.some((p) => pattern.test(p)), `${pattern}: ${problems.join(' | ')}`);
  };
  const m = (def, id) => def.ensemble.members.find((x) => x.id === id);
  breaks((d) => { d.ensemble.members = d.ensemble.members.slice(0, 1); }, /has 1 members: 2 or more/);
  breaks((d) => { m(d, 'blue').id = 'pink'; }, /member id "pink" is used twice/);
  breaks((d) => { m(d, 'blue').id = 'Blue'; }, /is not lowercase letters/);
  breaks((d) => { delete m(d, 'blue').home; }, /member "blue" has no home/);
  breaks((d) => { delete m(d, 'blue').animations.idle; }, /member "blue" has no idle clip/);
  breaks((d) => { d.animations = { idle: m(d, 'pink').animations.idle }; }, /own `animations` stays empty/);
  breaks((d) => { delete m(d, 'green').animations.run; }, /group clip "run" is only pink, blue's/);
  breaks((d) => { delete d.attacks.attack1.members; }, /attack "attack1" names no members/);
  breaks((d) => { d.attacks.attack1.members = []; }, /attack "attack1" names no members/);
  breaks((d) => { d.attacks.attack1.members = ['purple']; }, /attack "attack1" names purple, no member/);
  breaks((d) => { d.attacks.attack1.members = ['blue', 'blue']; }, /names a member twice/);
  breaks((d) => { delete m(d, 'blue').animations.attack1; }, /attack "attack1" plays "attack1", which not every member performing it has/);
  breaks((d) => { d.deflect.members = ['green', 'pink']; }, /its Deflect names 2 members: one member performs it/);
  breaks((d) => { delete d.deflect.members; }, /its Deflect names no members/);
  breaks((d) => { d.attacks.attack3.formation = { purple: { x: 0, y: 0 } }; }, /formation places "purple", no member/);
  breaks((d) => { d.attacks.attack3.formation = { pink: { x: 0 } }; }, /formation place for "pink" is not \{ x, y \}/);
  breaks((d) => { d.summons = { attack4: { attack: 'attack1', cloud: 'attack4_object' } }; }, /an ensemble has no summons/);
  breaks((d) => { d.ensemble.glide = 0; }, /glide is not a speed/);
  breaks((d) => { d.ensemble.retreat = -1; }, /retreat is not a distance/);
  breaks((d) => { d.ensemble.float = { height: 3 }; }, /float is not/);
  breaks((d) => { d.ensemble.referenceMember = 'purple'; }, /referenceMember "purple" is no member/);
  breaks((d) => { d.ensemble.asideAnimation = 'deflect'; }, /asideAnimation "deflect" is not every member's/);
  breaks((d) => { delete m(d, 'green').animations.shielding; }, /Shield's groundAnimation "shielding" is not every member's/);
  // A move of an ordinary fighter names no members: it has none.
  breaks((d) => { d.attacks.attack1.members = ['pink']; }, /attack "attack1" names members, but the fighter has no `ensemble`/, DEF_0001);
  // The loadout reads its clips from the performers.
  const missing = clone(ENS);
  delete m(missing, 'blue').animations.attack1;
  assert.ok(loadoutProblems(missing).some((p) => /attack "attack1" plays "attack1", which is not in the `animations` of every member performing it/.test(p)));
  assert.equal(hasClip(ENS, 'attack1', ['blue']), true);
  assert.equal(hasClip(ENS, 'deflect', ['green']), true);
  assert.equal(hasClip(ENS, 'deflect'), false, 'not every member\'s');
  assert.equal(hasClip(DEF_0001, 'attack1'), true, 'an ordinary fighter\'s own animations');
});

test('an ensemble is held to the loadout rules as any fighter is: no moves, or one, is refused, playable or not', () => {
  const moveless = { ...clone(ENS), actions: undefined, attacks: undefined };
  const problems = loadoutProblems(moveless);
  assert.ok(problems.some((p) => /no `actions`/.test(p)) && problems.some((p) => /attack1 needs a button/.test(p)), problems.join(' | '));
  assert.equal(moveless.available, false, 'unplayable, and refused all the same');
  const one = clone(ENS);
  delete one.actions.attack2;
  assert.ok(loadoutProblems(one).some((p) => /attack2/.test(p)), 'one numbered attack is not enough');
  assert.ok(loadoutProblems({ ...clone(ENS), actions: {} }).length, 'an empty `actions` is refused');
});

// ---- The formation --------------------------------------------------------------

test('the formation: home with no performers; one performer at the origin and the others lined up behind it; several centred; a move\'s own places', () => {
  const crew = [{ id: 'a', home: { x: -10, y: 0 } }, { id: 'b', home: { x: 0, y: -5 } }, { id: 'c', home: { x: 10, y: 2 } }];
  const spec = { retreat: 6, spacing: 4 };
  const at = (performers, formation) => Object.fromEntries(formationTargets(crew, performers, spec, formation));
  assert.deepEqual(at(null), { a: { x: -10, y: 0 }, b: { x: 0, y: -5 }, c: { x: 10, y: 2 } });
  // One: at the origin, on the ground; the others behind, the one nearest
  // the front first, at their home heights.
  assert.deepEqual(at(['c']), { c: { x: 0, y: 0 }, b: { x: -6, y: -5 }, a: { x: -10, y: 0 } });
  assert.deepEqual(at(['a']), { a: { x: 0, y: 0 }, c: { x: -6, y: 2 }, b: { x: -10, y: -5 } });
  // Two: their home places, centred on the origin; the other behind both.
  assert.deepEqual(at(['a', 'c']), { a: { x: -10, y: 0 }, c: { x: 10, y: 2 }, b: { x: -16, y: -5 } });
  assert.deepEqual(at(['b', 'c']), { b: { x: -5, y: -5 }, c: { x: 5, y: 2 }, a: { x: -11, y: 0 } });
  // All: home (centred, as theirs already is).
  assert.deepEqual(at(['a', 'b', 'c']), at(null));
  // A move's own places win.
  assert.deepEqual(at(['a', 'b', 'c'], { b: { x: 0, y: -20 } }).b, { x: 0, y: -20 });
  assert.deepEqual(at(['c'], { a: { x: -30, y: 0 } }).a, { x: -30, y: 0 });
  assert.equal(ENSEMBLE_DEFAULTS.asideAnimation, 'idle');
});

// ---- One fighter -------------------------------------------------------------------

test('one Fighter, one body, one combat state: no member has a body, a Launch Point, Energy or a cooldown of its own', () => {
  const { fighter: f } = solo();
  assert.ok(f instanceof Fighter);
  assert.ok(f.animator instanceof EnsembleAnimator);
  assert.ok(f.sprites instanceof EnsembleSprites);
  assert.equal(members(f).length, 3);
  for (const m of members(f)) {
    for (const field of ['body', 'combat', 'launchPoint', 'energy', 'cooldowns', 'hurtboxes', 'controller', 'facing', 'state']) {
      assert.equal(m[field], undefined, `${m.id}: no ${field}`);
    }
    assert.deepEqual(Object.keys(m).sort(), [
      'animator', 'float', 'home', 'id', 'lift', 'performing', 'phase', 'prevLift', 'prevX', 'prevY', 'renderX', 'renderY', 'x', 'y',
    ], `${m.id}: art and a place only`);
  }
  assert.deepEqual(f.hurtboxes, ENS.hurtboxes, 'its one hurtbox');
  assert.equal(ENS.hurtboxes.length, 1);
});

test('every member plays the fighter\'s state on the same step: idle, run, jump, fall, land, Dash, air dash, the Shield, hitstun and a launch', () => {
  const { fighter: f, step } = solo();
  const seen = new Set();
  const check = (label) => {
    const want = f.animationFor(f.state);
    assert.deepEqual(keys(f), [want, want, want], `${label}: every member on ${want}`);
    seen.add(want);
  };
  step({});
  check('idle');
  for (let i = 0; i < 10; i++) { step({ runRight: true }); check('run'); }
  for (let i = 0; i < 30; i++) step({});
  step(P('jump'));
  check('jump');
  until(step, (x) => x.state === 'fall');
  check('fall');
  until(step, (x) => x.state === 'land');
  check('land');
  for (let i = 0; i < 30; i++) step({});
  step({ runRight: true, mouvementRightPressed: true });
  assert.ok(f.dash);
  check('Dash');
  while (f.dash) step({});
  for (let i = 0; i < 30; i++) step({});
  step(P('jump'));
  for (let i = 0; i < 6; i++) step({ jump: true });
  step({ runRight: true, mouvementRightPressed: true });
  assert.ok(f.dash?.air);
  check('air dash');
  until(step, (x) => x.grounded && !x.dash);
  for (let i = 0; i < 30; i++) step({});
  step(P('shield'));
  check('Shield up');
  for (let i = 0; i < 10; i++) { step({ shield: true }); check('Shield held'); }
  step({});
  check('Shield down');
  assert.deepEqual([...seen].sort(), ['fall', 'idle', 'jump', 'land', 'midair_mouvment', 'mouvment', 'prepshield', 'releaseshield', 'run', 'shielding'].sort());
  // Hit and launched: all three, the same step.
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: ENS, gap: 44 });
  d.tick(P('attack2'));
  d.until(() => d.target.state === 'hitstun');
  assert.deepEqual(keys(d.target), Array(3).fill(d.target.animationFor('hitstun')));
  d.target.combat.launchPoint = 140;
  d.until(() => d.target.state !== 'hitstun');
  d.tick(P('extra_attack'));
  d.until(() => d.target.state === 'hitstun' && !d.target.grounded);
  assert.deepEqual(keys(d.target), Array(3).fill('midair_hurt'), 'launched: all three flung');
});

test('a move one member performs: she plays it at the origin, the others play their aside clip and step back behind her, then everyone glides home', () => {
  const { fighter: f, step } = solo();
  step({});
  step(P('attack1'));
  assert.equal(f.state, 'attack');
  assert.equal(place(f, 'blue').animator.stateKey, 'attack1');
  assert.equal(place(f, 'pink').animator.stateKey, 'idle');
  assert.equal(place(f, 'green').animator.stateKey, 'idle');
  // Each step every member moves at most glide x dt toward its place.
  let last = members(f).map((m) => [m.x, m.y]);
  const limit = glide * DT + 1e-9;
  const watch = () => {
    members(f).forEach((m, i) => assert.ok(Math.hypot(m.x - last[i][0], m.y - last[i][1]) <= limit, `${m.id}: glides, never jumps`));
    last = members(f).map((m) => [m.x, m.y]);
  };
  // Long enough for them to arrive: the attack, held a while by its repeat.
  for (let i = 0; i < 12 && f.state === 'attack'; i++) { step({}); watch(); }
  const blue = place(f, 'blue');
  assert.ok(blue.x < homeOf('blue').x, 'blue stepped from her home to the origin');
  // Behind her, the way the fighter faces (right): pink, then green.
  assert.ok(place(f, 'pink').x < blue.x && place(f, 'green').x < place(f, 'pink').x + 1e-9);
  while (f.state === 'attack') { step({}); watch(); }
  for (let i = 0; i < 40; i++) { step({}); watch(); }
  for (const m of members(f)) assert.deepEqual([m.x, m.y], [homeOf(m.id).x, homeOf(m.id).y], `${m.id}: home again`);
  assert.deepEqual(keys(f), ['idle', 'idle', 'idle']);
});

test('the others step back fully while the move holds: one performer at the origin, the rest lined up behind it, retreat and spacing apart', () => {
  const { fighter: f } = solo();
  f.animator.play('attack1', { performers: ['blue'] });
  for (let i = 0; i < 60; i++) f.animator.update(DT, 1);
  assert.deepEqual([place(f, 'blue').x, place(f, 'blue').y], [0, 0]);
  assert.deepEqual([place(f, 'pink').x, place(f, 'pink').y], [-retreat, homeOf('pink').y]);
  assert.deepEqual([place(f, 'green').x, place(f, 'green').y], [-retreat - spacing, 0]);
  // Facing left, everything mirrored.
  for (let i = 0; i < 60; i++) f.animator.update(DT, -1);
  assert.deepEqual([place(f, 'pink').x, place(f, 'green').x], [retreat, retreat + spacing]);
});

test('a combination: two members perform one move together while the third steps back; all three perform one with a formation of its own', () => {
  const d = duel({ attackerCharacter: ENS, gap: 50 });
  d.tick({});
  d.tick(P('attack2'));
  const f = d.attacker;
  assert.equal(f.combat.attack.def.id, 'attack2');
  assert.deepEqual(keys(f), ['attack2', 'attack2', 'idle'], 'pink and green, blue aside');
  // Blue crosses behind them (46.5 art pixels, under a fifth of a second)
  // while the move still plays.
  for (let i = 0; i < 11; i++) d.tick({});
  assert.equal(f.combat.attack?.def.id, 'attack2');
  assert.equal(place(f, 'blue').x, -9.5 - retreat, 'blue behind them');
  assert.deepEqual([place(f, 'pink').x, place(f, 'green').x], [9.5, -9.5], 'the pair centred on the origin');
  d.until(() => !f.combat.attack);
  // One move: one hit, its own damage once, and no cooldown (an ordinary
  // move has none).
  const hits = d.events.filter((e) => e.attacker === f && e.type === 'hit');
  assert.equal(hits.length, 1);
  assert.equal(d.target.combat.launchPoint, 3);
  assert.deepEqual([...f.combat.cooldowns.keys()], []);
  for (let i = 0; i < 60; i++) d.tick({});
  // All three.
  d.tick(P('attack3'));
  assert.deepEqual(keys(f), ['attack3', 'attack3', 'attack3']);
  for (let i = 0; i < 20 && f.combat.attack; i++) d.tick({});
  const s = solo();
  s.step({});
  s.step(P('attack3'));
  for (let i = 0; i < 20; i++) s.fighter.animator.update(DT, 1);
  assert.deepEqual([place(s.fighter, 'pink').x, place(s.fighter, 'pink').y], [0, -30], 'pink where the move puts her');
  assert.deepEqual([place(s.fighter, 'blue').x, place(s.fighter, 'green').x], [homeOf('blue').x, homeOf('green').x], 'the others at home');
});

test('a move is one move however many bodies draw it: one strike across the whole group hits once, for its own damage', () => {
  const d = duel({ attackerCharacter: ENS, gap: 40 });
  d.tick({});
  d.tick(P('extra_attack'));
  d.until(() => !d.attacker.combat.attack);
  const hits = d.events.filter((e) => e.attacker === d.attacker);
  assert.equal(hits.length, 1);
  assert.equal(d.target.combat.launchPoint, 3, 'its 3, once');
  // And hit by a wide strike, an ensemble takes it once.
  const back = duel({ attackerCharacter: ENS, targetCharacter: ENS, gap: 40 });
  back.tick({});
  back.tick(P('extra_attack'));
  back.until(() => !back.attacker.combat.attack);
  assert.equal(back.events.filter((e) => e.target === back.target).length, 1);
  assert.equal(back.target.combat.launchPoint, 3);
});

test('the Deflect: one member performs it, the others aside; one strike, one Energy cost', () => {
  const { fighter: f, step } = solo();
  step(P('jump'));
  for (let i = 0; i < 8; i++) step({ jump: true });
  const energy = f.combat.energy;
  step(P('shield'));
  assert.equal(f.combat.attack?.def.id, 'deflect');
  assert.deepEqual(keys(f), ['idle', 'deflect', 'idle'], 'green alone');
  assert.equal(f.combat.energy, energy - 15, 'one Deflect, paid once');
  assert.deepEqual(fighterParts(f).at(-1).member, 'green', 'drawn in front');
});

// ---- The float, the facing, the frame rate --------------------------------------------

test('the idle float: only while idling, only up off its place, never past its height, faded in and out', () => {
  const { fighter: f, step } = solo();
  const { height } = ENS.ensemble.float;
  let most = 0;
  for (let i = 0; i < 240; i++) {
    step({});
    for (const m of members(f)) {
      assert.ok(m.lift <= 0 && m.lift >= -height - 1e-9, `${m.id}: ${m.lift}`);
      most = Math.min(most, m.lift);
    }
  }
  assert.ok(most < -height * 0.9, 'it does float');
  const beats = members(f).map((m) => m.lift.toFixed(4));
  assert.equal(new Set(beats).size, 3, 'each on her own beat');
  // Running, the float fades out: a lift never jumps.
  let prev = members(f).map((m) => m.lift);
  for (let i = 0; i < 30; i++) {
    step({ runRight: true });
    members(f).forEach((m, k) => assert.ok(Math.abs(m.lift - prev[k]) < height * 0.2, 'smooth'));
    prev = members(f).map((m) => m.lift);
  }
  assert.ok(members(f).every((m) => m.lift === 0), 'none while running');
});

test('facing: the formation is mirrored with the fighter, turning glides it over, and it settles the same each way', () => {
  const right = solo({ facing: 1 });
  const left = solo({ facing: -1 });
  for (const m of members(right.fighter)) assert.deepEqual([m.x, m.y], [homeOf(m.id).x, homeOf(m.id).y]);
  for (const m of members(left.fighter)) assert.deepEqual([m.x, m.y], [-homeOf(m.id).x, homeOf(m.id).y], 'spawned facing left: mirrored');
  // Turning: never a jump, and mirrored home once it settles.
  const { fighter: f, step } = right;
  let last = members(f).map((m) => m.x);
  for (let i = 0; i < 40; i++) {
    step(i < 10 ? { runLeft: true } : {});
    members(f).forEach((m, k) => assert.ok(Math.abs(m.x - last[k]) <= glide * DT + 1e-9));
    last = members(f).map((m) => m.x);
  }
  assert.equal(f.facing, -1);
  for (const m of members(f)) assert.equal(m.x, -homeOf(m.id).x, `${m.id}: mirrored home`);
  // Each part is mirrored by its own clip: drawn facing the way the fighter does.
  for (const p of fighterParts(f)) assert.equal(p.flip, true);
});

test('deterministic at any frame rate: the same fixed steps whatever the render rate, and drawn between them', () => {
  // Arena.frame's accumulator: render frames of `dt` feed fixed steps.
  const run = (dt, seconds) => {
    const f = new Fighter({ def: ENS, sprites: fakeSpritesOf(ENS), stage: STAGE, slot: 'p1', label: 'P1', spawn: { x: 500, facing: 1 }, controller: null });
    let n = 0;
    const script = (k) => (k === 20 ? P('attack1') : k > 80 && k < 110 ? { runLeft: true } : k === 150 ? P('jump') : {});
    f.controller = { getInput: () => script(n) };
    const log = [];
    let acc = 0;
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      acc += dt;
      while (acc >= DT) {
        f.update(DT, { stage: STAGE, gravity: 3000 });
        acc -= DT;
        n++;
        log.push(members(f).map((m) => [m.x, m.y, m.lift, m.animator.stateKey, m.animator.index].join()).join('|'));
      }
      f.interpolate(acc / DT);
      for (const m of members(f)) {
        const lo = Math.min(m.prevX, m.x) - 1e-9;
        const hi = Math.max(m.prevX, m.x) + 1e-9;
        assert.ok(m.renderX >= lo && m.renderX <= hi, 'drawn between its last two steps');
      }
    }
    return log;
  };
  const sixty = run(1 / 60, 4);
  for (const rate of [30, 75, 144]) {
    const other = run(1 / rate, 4);
    const n = Math.min(sixty.length, other.length);
    assert.ok(n > 230);
    assert.deepEqual(other.slice(0, n), sixty.slice(0, n), `${rate} Hz: the same steps`);
  }
});

// ---- Drawing -----------------------------------------------------------------------

test('what is drawn: an ordinary fighter is one part, as before; an ensemble one part per member, at its place, performers in front', () => {
  const { fighter: one, step: stepOne } = makeFighter({ character: DEF_0001 });
  stepOne({});
  one.interpolate(1);
  assert.ok(one.animator instanceof SpriteAnimator);
  const [part, ...rest] = fighterParts(one);
  assert.deepEqual(rest, []);
  assert.deepEqual(part, { frame: one.animator.frame, x: one.renderX, y: one.renderY, flip: one.spriteFlip });
  const { fighter: f, step } = solo();
  step({});
  f.interpolate(1);
  const parts = fighterParts(f);
  assert.deepEqual(parts.map((p) => p.member), ['pink', 'green', 'blue'], 'back to front');
  const unit = f.sprites.worldPerArt;
  for (const p of parts) {
    const m = place(f, p.member);
    assert.equal(p.x, f.renderX + m.renderX * unit);
    assert.equal(p.y, f.renderY + m.renderY * unit);
    assert.equal(p.frame, m.animator.frame);
  }
  step(P('attack1'));
  assert.equal(fighterParts(f).at(-1).member, 'blue', 'the performer in front');
});

test('the group\'s sprites answer for it: a clip is there when its members have it, one pass is the longest member\'s, one art-pixel size', () => {
  const s = fakeSpritesOf(ENS);
  assert.ok(s instanceof EnsembleSprites);
  assert.equal(s.usable, true);
  assert.equal(s.has('idle'), true);
  assert.equal(s.has('deflect'), true, 'green has it, and only she needs it');
  assert.equal(s.has('attack9'), false);
  assert.equal(s.duration('run'), Math.max(...s.members.map((m) => m.set.duration('run'))));
  assert.ok(s.members.every((m) => m.set.worldPerArt === s.worldPerArt));
  assert.equal(s.member('green'), s.members[1].set);
  // Without a member's art, a clip she needs is missing for the group.
  const partial = new EnsembleSprites(ENS, s.members.map((m) => {
    if (m.id !== 'green') return m.set;
    const set = new SpriteSet({ ...ENS, ensemble: undefined, animations: {} });
    Object.assign(set.animations, m.set.animations);
    delete set.animations.deflect;
    set.usable = true;
    return set;
  }));
  assert.equal(partial.has('deflect'), false);
  assert.equal(createAnimator(s) instanceof EnsembleAnimator, true);
  // A menu's idle pose: every member at home.
  const pose = idlePose({ members: s.members.map((m) => ({ ...m, set: { animations: { idle: { fps: 6, frames: [{ anchorArtX: 5, anchorArtY: 10, artW: 10, artH: 10 }] } } } })) }, 0);
  assert.deepEqual(pose.map((p) => [p.dx, p.dy]), s.members.map((m) => [m.home.x, m.home.y]));
  assert.deepEqual(poseBounds(pose), { left: -19 - 5, right: 19 + 5, top: -14 - 10, bottom: 0 });
});

test('every other fighter is untouched: its own sprite set, one animator, nothing named in its moves', () => {
  for (const def of CHARACTERS.filter((c) => !isEnsemble(c))) {
    const sprites = fakeSpritesOf(def);
    assert.ok(sprites instanceof SpriteSet, def.id);
    assert.ok(createAnimator(sprites) instanceof SpriteAnimator, def.id);
    const { fighter: f } = makeFighter({ character: def });
    assert.ok(f.animator instanceof SpriteAnimator);
    for (const atk of Object.values(def.attacks ?? {})) assert.equal(atk.members, undefined);
    assert.equal(def.deflect?.members, undefined);
  }
});
