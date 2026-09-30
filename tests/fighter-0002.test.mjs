// Run with node --test tests/fighter-0002.test.mjs (no dependencies).
// #0002, the second fighter: registered from CHARACTERS alone in roster
// slot 02, its seven supplied clips (idle, run, jump, fall, land, hurt and
// mid-air hurt) wired to its own art and read from the real PNGs, no move
// of its own yet (no attack, Shield, Dash, Charge art, projectile or
// effect, and none borrowed from #0001), its movement a marked temporary
// baseline and its body measured from its art, the CPU going by the same
// data, and #0001 vs #0002 and #0002 vs #0002 fights that run. Nothing of
// the fighter that held slot 02 before it is left. Its touch buttons are
// checked in controls-ui.test.mjs, the credits in settings.test.mjs and the
// screens that load it in the practice-ground, watch-mode and battle-screen
// tests. Layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { DT, cpuFight, duel, fakeSpritesOf, frameName, makeFighter, stepUntil } from './fighter-harness.mjs';
import { ROOT, buildReal, firstRun, opaque, rowSpan, sha256, walk } from './real-art.mjs';
import { CONFIG, MOVES } from '../js/config.js';
import { CHARACTERS, TEMPORARY_BASELINE, characterFramePaths, getCharacter } from '../js/data/characters.js';
import { abilityName } from '../js/data/abilities.js';
import { readMoveset } from '../js/game/combat-ai.js';
import { cbaIndicators } from '../js/game/fighter-status.js';
import { Arena, computeWorldScale } from '../js/game/arena.js';
import { getMap } from '../js/data/maps.js';
const DIR = 'assets/characters/0002/';
const BASE = `./${DIR}0002_`;
const DEF = getCharacter('0002');
const DEF_0001 = getCharacter('0001');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const files = (anim) => anim.frames.map(file);
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

// The seventeen files supplied for it, in its folder.
const CLIPS = {
  idle: range(8).map((n) => `0002_idle_${n}.png`),
  run: range(4).map((n) => `0002_run_${n}.png`),
  jump: ['0002_jump.png'],
  fall: ['0002_fall.png'],
  land: ['0002_land.png'],
  hurt: ['0002_hurt.png'],
  midairHurt: ['0002_midairhurt.png'],
};
const SUPPLIED = Object.values(CLIPS).flat().sort();

// Every file the fighter that held slot 02 before it had, none of which
// may be left or asked for.
const RETIRED = [
  ...range(4).map((n) => `0002_ba1_${n}.png`), ...range(3).map((n) => `0002_ba2_${n}.png`),
  ...range(6).map((n) => `0002_cba1_${n}.png`), ...range(4).map((n) => `0002_maba1_${n}.png`),
  ...range(4).map((n) => `0002_maba2_${n}.png`), ...range(5).map((n) => `0002_idle${n}.png`),
  '0002_run1.png', '0002_run2.png', '0002_mouvmen1.png', '0002_charge.png', '0002_prepshield.png',
  '0002_shielding.png', '0002_releaseshield.png', '0002_midairshielding1.png', '0002_midairshielding2.png',
];

// ---- The real art, decoded (see real-art.mjs) ------------------------------------------

const REAL = buildReal(DEF, characterFramePaths(DEF));
// #0001's reference clip alone (its idle), for its art-pixel size.
const REAL_0001_IDLE = buildReal(
  { ...DEF_0001, animations: { idle: DEF_0001.animations.idle }, projectileAnimations: {}, effectAnimations: {} },
  DEF_0001.animations.idle.frames,
);

// ---- Registration ---------------------------------------------------------------

test('#0002 is a real CHARACTERS entry: available, in roster slot 1 (the second), #0001 unchanged in slot 0', () => {
  assert.ok(DEF, 'getCharacter("0002")');
  assert.equal(CHARACTERS.find((c) => c.id === '0002'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0002');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 1);
  assert.equal(DEF_0001.rosterSlot, 0);
  assert.equal(DEF_0001.available, true);
  // The roster is CHARACTERS by slot: #0001, #0002 and #0003 (see
  // fighter-0003.test.mjs), every other slot free.
  const available = CHARACTERS.filter((c) => c.available).sort((a, b) => a.rosterSlot - b.rosterSlot);
  assert.deepEqual(available.map((c) => c.id), ['0001', '0002', '0003']);
  assert.deepEqual(CHARACTERS.map((c) => c.id), ['0001', '0002', '0003']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.ok(CHARACTERS.every((c) => c.rosterSlot < CONFIG.roster.totalSlots));
});

// ---- Assets -----------------------------------------------------------------------

test('its folder holds exactly the seventeen supplied files; nothing is left at the root', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), SUPPLIED);
  assert.deepEqual(readdirSync(ROOT).filter((n) => /\.png$/i.test(n) && /^000\d/.test(n)), [], 'no fighter art at the root');
  const all = walk();
  // Its art was uploaded partly as 0003_*.png; the only 0003 files now are
  // #0003's own, in #0003's folder.
  assert.deepEqual(all.filter((p) => /(^|\/)0003_/.test(p) && !p.startsWith('assets/characters/0003/')), [], 'no stray 0003 file');
  assert.deepEqual(all.filter((p) => RETIRED.some((n) => p.endsWith(`/${n}`))), [], 'no retired file anywhere');
  // Idle's fifth frame is a copy of its first: the loop's middle.
  assert.equal(sha256(`${DIR}0002_idle_5.png`), sha256(`${DIR}0002_idle_1.png`));
});

test('exactly its seven clips, each with its own art in order; only idle and run loop', () => {
  const A = DEF.animations;
  assert.deepEqual(Object.keys(A).sort(), Object.keys(CLIPS).sort(), 'exactly these clips');
  for (const [key, names] of Object.entries(CLIPS)) {
    assert.deepEqual(files(A[key]), names, key);
    for (const url of A[key].frames) assert.ok(url.startsWith(BASE), `${url}: relative, in #0002's folder`);
  }
  assert.equal(A.idle.frames.length, 8);
  assert.equal(A.run.frames.length, 4);
  assert.deepEqual(Object.keys(A).filter((k) => A[k].loop), ['idle', 'run']);
  // Run playback follows its speed (see Fighter.updateState).
  assert.ok(A.run.minSpeedScale > 0 && A.run.minSpeedScale < 1);
  // The land state lasts one pass of its single frame: short.
  assert.ok(1 / A.land.fps <= 0.1, 'a touchdown lasts no more than 0.1 s');
});

test('characterFramePaths loads the seventeen files once each, every one on disk; none of #0001\'s or the retired art', () => {
  const paths = characterFramePaths(DEF);
  assert.equal(new Set(paths).size, paths.length, 'each file once');
  assert.deepEqual(paths.map(file).sort(), SUPPLIED);
  assert.ok(paths.every((url) => url.startsWith(BASE)), 'only #0002\'s own art');
  for (const url of paths) assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
  assert.ok(!paths.some((url) => RETIRED.includes(file(url))));
  // #0001 loads nothing of #0002's: preloading both available fighters
  // (App.start) loads two disjoint sets.
  const own = characterFramePaths(DEF_0001);
  assert.ok(own.every((u) => u.startsWith('./assets/characters/0001/')));
  assert.equal(own.filter((u) => paths.includes(u)).length, 0);
});

test('no code, page or style asks for a retired file or names the old fighter', () => {
  const sources = walk('js/').filter((p) => p.endsWith('.js')).concat(['index.html', 'styles.css']);
  const retired = new RegExp(`${RETIRED.map((n) => n.replace('.png', '')).join('|')}|0002_(ba\\d|maba|cba|shield|charge)`);
  for (const path of sources) {
    const source = readFileSync(`${ROOT}${path}`, 'utf8');
    assert.doesNotMatch(source, retired, path);
    assert.doesNotMatch(source, /slender/i, path);
  }
});

// ---- What #0002 does not have -----------------------------------------------------------

test('no move at all: every combat input left out, no attack, Shield, Dash, charged action, projectile or effect', () => {
  assert.deepEqual(DEF.actions, {}, 'Unique Basic Attack, Transform, BA1 and BA2 all left out: not even reserved');
  assert.deepEqual(DEF.attacks, {});
  for (const key of ['defense', 'chargedActions', 'chargedTechniques', 'summons', 'projectiles', 'projectileAnimations', 'effectAnimations']) {
    assert.equal(DEF[key], undefined, key);
  }
  assert.equal(DEF.movement.dashSpeed, undefined, 'no Dash');
  for (const key of ['ba1', 'maba1', 'ba2', 'maba2', 'uniqueba', 'transform', 'dash', 'shield', 'midairShield', 'chargeStart', 'chargeLoop']) {
    assert.equal(DEF.animations[key], undefined, key);
  }
  // No names of its own, and none borrowed.
  assert.equal(DEF.abilityNames, undefined);
  assert.equal(DEF.mobileAbilities, undefined);
  for (const move of Object.keys(MOVES)) assert.equal(abilityName(DEF, move), MOVES[move].label, move);
  // No art or data of #0001's moves anywhere in its definition.
  assert.doesNotMatch(JSON.stringify(DEF), /0001|rasen|shuriken|throw|clone|Sphere|Shuriken|Punch|Kick/i);
});

test('every combat button does nothing for it, on the ground, in the air and while Charging: no warning either', () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const d = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, gap: 60 });
    for (const action of ['uniqueba', 'transform', 'ba1', 'ba2']) {
      assert.equal(d.attacker.attackFor(action), null, action);
      assert.equal(d.attacker.attackMayStart(action), false, action);
      assert.equal(d.attacker.tryChargedAction(action), false, action);
      for (let i = 0; i < 6; i++) d.tick(i % 2 ? {} : P(action));
      d.tick({ charge: true });
      d.tick({ charge: true });
      d.tick({ charge: true, ...P(action) });
      d.tick();
    }
    assert.equal(d.attacker.combat.attack, null);
    assert.equal(d.attacker.bufferedAttack, null);
    assert.equal(d.attacker.technique, null);
    assert.equal(d.attacker.combat.chargedCooldowns.size, 0, 'no cooldown');
    assert.deepEqual(cbaIndicators(d.attacker), [], 'no CBA1 / CBA2 ring');
    assert.deepEqual([d.projectiles, d.clones, d.events], [[], [], []]);
    assert.equal(d.target.combat.launchPoint, 0);
    // In the air too.
    const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
    step(P('jump'));
    for (const action of ['uniqueba', 'transform', 'ba1', 'ba2']) {
      step({ jump: true, ...P(action) });
      assert.equal(fighter.combat.attack, null, `air ${action}`);
    }
    assert.equal(fighter.grounded, false);
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = warn;
  }
});

test('Shield and a double tap do nothing either: no Shield, no Dash, no warning', () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
    step(P('shield'));
    for (let i = 0; i < 10; i++) step({ shield: true });
    assert.equal(fighter.combat.shielding, false);
    assert.equal(fighter.state, 'idle');
    assert.equal(fighter.shieldAllowed(), false);
    step(P('runRight'));
    step();
    step(P('runRight'));
    assert.equal(fighter.dash, null);
    assert.equal(fighter.tryDash(1), false);
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = warn;
  }
});

// ---- Temporary baseline and body ------------------------------------------------------

test('its Powers and movement are the marked temporary baseline, only what a fighter without moves needs', () => {
  assert.equal(DEF.movement, TEMPORARY_BASELINE.movement);
  assert.equal(DEF.powers, TEMPORARY_BASELINE.powers);
  assert.deepEqual(DEF.powers, { jump: 2, speed: 2 }, 'each Power\'s default tier');
  assert.deepEqual(Object.keys(TEMPORARY_BASELINE).sort(), ['movement', 'powers'], 'the body is its own, not a baseline');
  assert.notEqual(DEF.movement, DEF_0001.movement, 'copied, never shared with #0001');
  for (const key of ['attackBuffer', 'dashSpeed', 'dashTapWindow']) assert.equal(key in DEF.movement, false, key);
  for (const key of ['energy', 'stats', 'launchReaction', 'launchBounce']) assert.equal(DEF[key], undefined, key);
  // Marked as temporary where it is defined and used, and so is the body.
  const source = readFileSync(`${ROOT}js/data/characters.js`, 'utf8');
  assert.equal(source.match(/TODO #0002: replace temporary baseline when authored attributes are supplied\./g)?.length, 2);
  assert.match(source, /TODO #0002: temporary body/);
});

// ---- Animation at runtime --------------------------------------------------------------

// The order frames were shown in over `n` steps, consecutive repeats dropped.
function shown(step, n, held) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const name = frameName(step(held));
    if (name !== out.at(-1)) out.push(name);
  }
  return out;
}

test('idle cycles through all eight frames in order, looping', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step();
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0002_idle_1.png');
  const seen = shown(step, Math.round(2 / DT));
  assert.deepEqual(seen.slice(0, 8), CLIPS.idle, 'every frame, in order');
  assert.deepEqual(seen.slice(8, 15), CLIPS.idle.slice(0, 7), 'and round again');
});

test('run cycles through all four frames in order', () => {
  const { step } = makeFighter({ character: DEF, sprites: SPRITES });
  stepUntil(step, (f) => f.state === 'run', { runRight: true });
  const seen = shown(step, 60, { runRight: true });
  assert.ok(seen.length >= 8);
  const start = CLIPS.run.indexOf(seen[0]);
  assert.deepEqual(seen.slice(0, 8), range(8).map((n) => CLIPS.run[(start + n - 1) % 4]), 'every frame, in order');
});

test('on its real art, the run plays at the speed the fighter runs', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: REAL });
  stepUntil(step, (f) => f.state === 'run', { runRight: true });
  const rates = [];
  for (let i = 0; i < 20; i++) rates.push(step({ runRight: true }).animator.speed);
  assert.ok(rates.at(0) < 1, 'slower while it gathers speed');
  assert.equal(rates.at(-1), 1, 'full rate at top speed');
  // Letting go slows the legs with the body until it stops.
  let slowest = 1;
  while (fighter.state === 'run') {
    step();
    if (fighter.state === 'run') slowest = Math.min(slowest, fighter.animator.speed);
  }
  assert.ok(slowest < 1 && slowest >= DEF.animations.run.minSpeedScale, `${slowest}`);
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0002_idle_1.png');
});

test('jump art while rising, fall art while descending, one short land frame on touchdown, then idle', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step();
  step(P('jump'));
  assert.equal(fighter.state, 'jump');
  assert.equal(frameName(fighter), '0002_jump.png');
  for (;;) {
    step({ jump: true });
    if (fighter.body.vy >= 0) break;
    assert.equal(frameName(fighter), '0002_jump.png', 'rising');
  }
  assert.equal(fighter.state, 'fall');
  for (;;) {
    step();
    if (fighter.grounded) break;
    assert.equal(frameName(fighter), '0002_fall.png', 'descending');
  }
  assert.equal(fighter.state, 'land');
  let landing = 0;
  while (fighter.state === 'land') {
    assert.equal(frameName(fighter), '0002_land.png');
    landing++;
    step();
  }
  assert.equal(landing, Math.round(1 / DEF.animations.land.fps / DT), 'one pass of the land frame');
  assert.equal(fighter.state, 'idle');
  // The air jump plays the jump frame again.
  step(P('jump'));
  stepUntil(step, (f) => f.body.vy > 0);
  step(P('jump'));
  assert.equal(fighter.airJumped, true);
  assert.equal(frameName(fighter), '0002_jump.png');
});

test('landing never holds movement up: a run carries straight on through the land frame', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  stepUntil(step, (f) => Math.abs(f.body.vx) >= f.maxSpeed - 1e-6, { runRight: true });
  step({ runRight: true, ...P('jump') });
  stepUntil(step, (f) => f.grounded, { runRight: true });
  assert.equal(fighter.state, 'land');
  const x = fighter.x;
  step({ runRight: true });
  assert.ok(fighter.body.vx >= fighter.maxSpeed - 1e-6, 'still at top speed');
  assert.ok(fighter.x > x);
  stepUntil(step, (f) => f.state === 'run', { runRight: true });
  // And a jump straight out of the land frame takes off at once.
  const again = makeFighter({ character: DEF, sprites: SPRITES });
  again.step(P('jump'));
  stepUntil(again.step, (f) => f.grounded);
  assert.equal(again.fighter.state, 'land');
  again.step(P('jump'));
  assert.equal(again.fighter.state, 'jump');
});

test('hit on the ground it shows its hurt art; hit in the air, its mid-air hurt art', () => {
  // Grounded: #0001's BA1 pushes it along the floor.
  const ground = duel({ targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  ground.tick(P('ba1'));
  ground.until(() => ground.events.length > 0);
  assert.equal(ground.events[0].target, ground.target);
  assert.equal(ground.events[0].type, 'hit');
  ground.tick();
  assert.equal(ground.target.state, 'hitstun');
  assert.equal(ground.target.grounded, true);
  assert.equal(frameName(ground.target), '0002_hurt.png');
  // Airborne: caught mid-jump by #0001's mid-air BA1.
  const air = duel({ targetCharacter: DEF, targetSprites: SPRITES, gap: 30 });
  air.tick(P('jump'), P('jump'));
  for (let i = 0; i < 6; i++) air.tick({ jump: true }, { jump: true });
  air.tick({ jump: true, ...P('ba1') }, { jump: true });
  air.until(() => air.events.length > 0);
  air.tick();
  assert.equal(air.target.state, 'hitstun');
  assert.equal(air.target.grounded, false);
  assert.equal(frameName(air.target), '0002_midairhurt.png');
});

test('Charge (the universal stance) holds its first idle frame, and letting go returns straight to idle', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step({ charge: true });
  assert.equal(fighter.state, 'charge');
  for (let i = 0; i < 30; i++) assert.equal(frameName(step({ charge: true })), '0002_idle_1.png');
  step();
  assert.equal(fighter.state, 'idle', 'no release pose of anyone else\'s');
  // Down held in the air is still the fast fall.
  step(P('jump'));
  stepUntil(step, (f) => f.body.vy > 0);
  stepUntil(step, (f) => f.body.vy >= DEF.movement.fastFallSpeed - 1e-6, { charge: true }, 30);
});

test('its art faces right: mirrored when it faces left, never otherwise', () => {
  for (const facing of [1, -1]) {
    const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES, facing });
    step();
    assert.equal(fighter.spriteFlip, facing === -1, `idle facing ${facing}`);
    step(P('jump'));
    assert.equal(fighter.spriteFlip, facing === -1, `jump facing ${facing}`);
  }
  // Running left turns the art with it.
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  stepUntil(step, (f) => f.state === 'run', { runLeft: true });
  assert.equal(fighter.facing, -1);
  assert.equal(fighter.spriteFlip, true);
});

test('no state it can be in resolves to anyone else\'s art', () => {
  const keys = new Set([
    ...Object.keys(DEF.animations), ...Object.keys(DEF_0001.animations),
    'hurt', 'midairHurt', 'dash', 'chargeStart', 'chargeLoop', 'chargeRelease', 'uniqueba', 'transform', 'cba1', 'cba2',
  ]);
  for (const key of keys) {
    const { anim } = SPRITES.resolve(key);
    for (const f of anim.frames) assert.ok(f.url.startsWith(BASE), `${key}: ${f.url}`);
  }
});

// ---- The real art: grids, scale, anchors and body -----------------------------------------

test('the real art: every frame found and 2x, one art-pixel scale, the 39-pixel idle as reference', () => {
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.usable, true);
  assert.equal(REAL.refArtHeight, 39);
  for (const [key, anim] of Object.entries(REAL.animations)) {
    for (const f of anim.frames) {
      assert.equal(f.detected, 2, `${f.url}: its pixel grid found`);
      assert.equal(f.unit, 1);
    }
    // heightRatio (the fallback if a grid is ever not found) matches the art.
    assert.ok(Math.abs(anim.maxArtH / 39 - DEF.animations[key].heightRatio) < 1e-9, key);
  }
  assert.deepEqual(REAL.animations.idle.frames.map((f) => f.artH), [39, 39, 38, 39, 39, 39, 38, 39]);
  assert.deepEqual(Object.values(REAL.animations).map((a) => a.maxArtH), [39, 36, 45, 48, 38, 42, 36]);
});

test('drawn at #0001\'s size per art pixel: 66 units tall, its pixels the same size on screen as #0001\'s', () => {
  assert.equal(REAL_0001_IDLE.refArtHeight, 52);
  assert.ok(Math.abs(REAL.worldPerArt - REAL_0001_IDLE.worldPerArt) < 1e-12);
  assert.ok(Math.abs(DEF.visual.height - 66) < 1e-9);
  assert.ok(Math.abs(DEF.visual.height / DEF_0001.visual.height - 0.75) < 1e-9);
  // So the view is the same whoever is Player 1, snapped to whole device
  // pixels or not, and both fighters stay crisp.
  for (const map of [getMap('desert'), getMap('city')]) {
    for (const [w, h] of [[1280, 720], [1920, 1080], [1688, 780], [800, 600]]) {
      assert.ok(Math.abs(computeWorldScale(w, h, REAL_0001_IDLE, map) - computeWorldScale(w, h, REAL, map)) < 1e-9, `${map.id} ${w}x${h}`);
    }
  }
  const arena = { view: { scale: 2 }, worldPerArt: REAL_0001_IDLE.worldPerArt };
  assert.ok(Math.abs(Arena.prototype.pxPerArtOf.call(arena, REAL) - Arena.prototype.pxPerArtOf.call(arena, REAL_0001_IDLE)) < 1e-12);
});

test('the head never moves between idle, land, jump and mid-air hurt; the run holds its body still', () => {
  // The crest over the head (the first run of its first two rows; the
  // jump's raised hand is beside it), from the anchor.
  const crest = (f) => [0, 1].map((y) => firstRun(f, y).map((x) => x - f.anchorArtX));
  const idle1 = REAL.animations.idle.frames[0];
  for (const key of ['idle', 'land', 'jump', 'midairHurt']) {
    for (const f of REAL.animations[key].frames) assert.deepEqual(crest(f), crest(idle1), f.url);
  }
  // The run's leaning face: the front of its top rows, from the anchor.
  const front = (f) => Math.max(...range(11).map((y) => rowSpan(f, y - 1)[1])) - f.anchorArtX;
  const run = REAL.animations.run.frames;
  assert.deepEqual(run.map(front), run.map(() => front(run[0])));
  // Every authored anchor only takes out the wobble: it stays within an
  // art pixel of the automatic torso anchor, so no pose is drawn off its body.
  for (const anim of Object.values(REAL.animations)) {
    for (const f of anim.frames) assert.ok(Math.abs(f.anchorArtX - f.anchorX / f.unit) < 1, `${f.url}: ${f.anchorArtX} vs ${f.anchorX}`);
  }
  // Standing, the feet are under it: the anchor lies within its shoes.
  for (const f of [...REAL.animations.idle.frames, ...REAL.animations.land.frames]) {
    const [lo, hi] = rowSpan(f, f.h - 1);
    assert.ok(lo < f.anchorArtX && f.anchorArtX < hi, f.url);
  }
});

test('its body matches its art: the hurtboxes cover the drawn idle and little else, the collider its height', () => {
  const k = REAL.worldPerArt;
  const idle = REAL.animations.idle.frames;
  // A world box (from the origin, facing right) in art pixels of frame `f`.
  const inBox = (f, box, x, y) => {
    const wx = (x + 0.5 - f.anchorArtX) * k;
    const wy = (y + 0.5 - f.h) * k;
    return wx >= box.x && wx <= box.x + box.w && wy >= box.y && wy <= box.y + box.h;
  };
  for (const f of idle) {
    let drawn = 0;
    let covered = 0;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (!opaque(f, x, y)) continue;
        drawn++;
        if (DEF.hurtboxes.some((hb) => inBox(f, hb, x, y))) covered++;
      }
    }
    assert.ok(covered / drawn >= 0.8, `${f.url}: ${(covered / drawn).toFixed(3)} of the art is hittable`);
  }
  // Each box is mostly body, not air.
  for (const hb of DEF.hurtboxes) {
    let inside = 0;
    let filled = 0;
    for (let y = 0; y < idle[0].h; y++) {
      for (let x = 0; x < idle[0].w; x++) {
        if (!inBox(idle[0], hb, x, y)) continue;
        inside++;
        if (opaque(idle[0], x, y)) filled++;
      }
    }
    assert.ok(filled / inside >= 0.7, `${JSON.stringify(hb)}: ${(filled / inside).toFixed(3)} filled`);
  }
  // Head over body, meeting, down to the feet; both inside the art's width.
  const [head, body] = DEF.hurtboxes;
  assert.equal(head.y + head.h, body.y);
  assert.equal(body.y + body.h, 0);
  const [left, right] = [-idle[0].anchorArtX * k, (idle[0].w - idle[0].anchorArtX) * k];
  for (const hb of DEF.hurtboxes) assert.ok(hb.x >= left && hb.x + hb.w <= right, JSON.stringify(hb));
  // The collider stands as tall as the head's top (the thin crest above it
  // left out), as wide as the torso and legs, the pushbox a little wider.
  assert.ok(Math.abs(DEF.collider.height - (idle[0].h - 1) * k) < k);
  assert.equal(DEF.collider.height, -head.y);
  assert.ok(DEF.collider.width < body.w && DEF.pushbox.width > DEF.collider.width);
  // Its own, not #0001's.
  assert.notDeepEqual(DEF.collider, DEF_0001.collider);
  assert.notDeepEqual(DEF.hurtboxes, DEF_0001.hurtboxes);
});

test('the roster portrait is the whole head', () => {
  const cfg = DEF.visual.portrait;
  const f = REAL.animations[cfg.animation].frames[cfg.frame];
  const size = Math.round(f.artH * cfg.size);
  const cx = f.headArtX;
  const cy = f.artH * cfg.centerY;
  // The head is the top 19 rows, crest to chin.
  assert.ok(cy - size / 2 <= 0 && cy + size / 2 >= 19, 'crest to chin');
  // Its face (the front of those rows) and the bulk of the quills behind.
  const spans = range(19).map((n) => rowSpan(f, n - 1));
  assert.ok(cx + size / 2 >= Math.max(...spans.map((s) => s[1])), 'the whole face');
  assert.ok(cx - size / 2 <= 1, 'the quills');
});

// ---- The CPU and whole fights ----------------------------------------------------------------

test('the CPU reads its moveset from its data: no melee, ranged, charged move, Shield or Dash to press', () => {
  const { fighter } = makeFighter({ character: DEF, sprites: SPRITES });
  const ms = readMoveset(fighter);
  assert.deepEqual([ms.melee, ms.ranged, ms.charged], [[], [], []]);
  assert.equal(ms.dash, null);
  assert.equal(ms.shield, false);
});

test('#0001 vs #0002, #0002 vs #0001 and #0002 vs #0002 CPU fights run; #0002 never uses a move, is hit and shows its hurt art', () => {
  for (const [defA, defB] of [[DEF_0001, DEF], [DEF, DEF_0001], [DEF, DEF]]) {
    const { a, b, log, events, world } = cpuFight(defA, defB);
    for (const f of [a, b]) {
      if (f.def !== DEF) continue;
      const steps = log.get(f);
      assert.ok(steps.every((s) => s.attack === null && !s.shielding), 'never attacks or shields');
      assert.equal(f.combat.chargedCooldowns.size, 0);
      assert.equal(f.technique, null);
      assert.ok(events.every((e) => e.attacker !== f), 'never hits anyone');
      assert.ok(steps.every((s) => s.frame.startsWith('0002_')), 'only its own art');
      assert.ok(steps.some((s) => s.state === 'run'), 'it moves');
      if (defA !== defB) {
        assert.ok(steps.some((s) => s.state === 'jump'), 'it jumps');
        // A live fight: #0001's CPU lands its hits, and #0002 shows them.
        assert.ok(events.some((e) => e.type === 'hit' && e.target === f), 'hits land on #0002');
        const stunned = steps.filter((s) => s.state === 'hitstun');
        assert.ok(stunned.length > 0);
        for (const s of stunned) assert.equal(s.frame, s.grounded ? '0002_hurt.png' : '0002_midairhurt.png');
      }
    }
    assert.deepEqual(world.projectiles.filter((p) => p.owner.def === DEF), []);
    assert.deepEqual(world.clones.filter((c) => c.owner.def === DEF), []);
    for (const f of [a, b]) assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), `${f.def.id} stays in the world`);
  }
});
