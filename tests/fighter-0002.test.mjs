// Run with node --test tests/fighter-0002.test.mjs (no dependencies).
// #0002, Slender Man, the second fighter: registered from CHARACTERS alone,
// every supplied clip wired to its own art (read from the real PNGs), the
// duplicate uploads loaded once, his Basic Attacks art only (pending: they
// hit nothing), no Unique Basic Attack, no Charged BA2 and no CBA ring, the
// CPU going by the same data, nothing of #0001's leaking in, and #0001 vs
// #0002 and #0002 vs #0002 fights that run. His touch buttons are checked
// in controls-ui.test.mjs, his credits in settings.test.mjs and the screens
// that load him in practice-ground, watch-mode and battle-screen tests.
// Layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { DT, duel, fakeSpritesOf, frameName, makeFighter, stageMap, stepUntil } from './fighter-harness.mjs';
import { CONFIG, MOVES } from '../js/config.js';
import { CHARACTERS, TEMPORARY_BASELINE, characterFramePaths, getCharacter } from '../js/data/characters.js';
import { abilityName } from '../js/data/abilities.js';
import { Fighter, separateFighters } from '../js/game/character.js';
import { CombatSystem, createAttackDefinition } from '../js/game/combat.js';
import { spawnProjectiles, removeDeadProjectiles } from '../js/game/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../js/game/clone.js';
import { StageCollision, resolveSolidOverlap } from '../js/game/physics.js';
import { CombatAIController, readMoveset } from '../js/game/combat-ai.js';
import { cbaIndicators } from '../js/game/fighter-status.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { Arena, computeWorldScale } from '../js/game/arena.js';
import { getMap } from '../js/data/maps.js';
import { mulberry32 } from '../js/core/utils.js';

const ROOT = new URL('../', import.meta.url).pathname;
const DIR = 'assets/characters/0002/';
const BASE = `./${DIR}0002_`;
const DEF = getCharacter('0002');
const DEF_0001 = getCharacter('0001');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const files = (anim) => anim.frames.map(file);

// The 38 files supplied at the repository root, now in #0002's folder.
const SUPPLIED = [
  ...[1, 2, 3, 4].map((n) => `0002_ba1_${n}.png`),
  ...[1, 2, 3].map((n) => `0002_ba2_${n}.png`),
  ...[1, 2, 3, 4, 5, 6].map((n) => `0002_cba1_${n}.png`),
  '0002_charge.png', '0002_fall.png',
  ...[1, 2, 3, 4, 5].map((n) => `0002_idle${n}.png`),
  '0002_jump.png', '0002_land.png',
  ...[1, 2, 3, 4].map((n) => `0002_maba1_${n}.png`),
  ...[1, 2, 3, 4].map((n) => `0002_maba2_${n}.png`),
  '0002_midairshielding1.png', '0002_midairshielding2.png', '0002_mouvmen1.png',
  '0002_prepshield.png', '0002_releaseshield.png', '0002_run1.png', '0002_run2.png', '0002_shielding.png',
].sort();

const sha256 = (name) => createHash('sha256').update(readFileSync(`${ROOT}${DIR}${name}`)).digest('hex');

// ---- Registration ---------------------------------------------------------------

test('#0002 is a real CHARACTERS entry: available, in roster slot 1 (the second), #0001 unchanged in slot 0', () => {
  assert.ok(DEF, 'getCharacter("0002")');
  assert.equal(CHARACTERS.find((c) => c.id === '0002'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0002');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 1);
  assert.equal(DEF_0001.rosterSlot, 0);
  assert.equal(DEF_0001.available, true);
  // The roster is CHARACTERS by slot: #0001 then #0002, every other slot free.
  const available = CHARACTERS.filter((c) => c.available).sort((a, b) => a.rosterSlot - b.rosterSlot);
  assert.deepEqual(available.map((c) => c.id), ['0001', '0002']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.ok(CHARACTERS.every((c) => c.rosterSlot < CONFIG.roster.totalSlots));
});

// ---- Asset registration -----------------------------------------------------------

test('every supplied file lives in #0002\'s folder, byte for byte, and none is left at the root', () => {
  const dir = readdirSync(`${ROOT}${DIR}`).sort();
  assert.deepEqual(dir, SUPPLIED);
  assert.deepEqual(readdirSync(ROOT).filter((n) => n.startsWith('0002_')), [], 'nothing left at the root');
  // The two duplicate uploads really are the same drawings.
  assert.equal(sha256('0002_mouvmen1.png'), sha256('0002_run1.png'));
  assert.equal(sha256('0002_land.png'), sha256('0002_run2.png'));
  assert.equal(sha256('0002_idle2.png'), sha256('0002_idle4.png'), 'the sway turns back through idle2');
});

test('every clip is registered with its own art, in order', () => {
  const A = DEF.animations;
  const expected = {
    idle: ['0002_idle1.png', '0002_idle2.png', '0002_idle3.png', '0002_idle4.png', '0002_idle5.png'],
    run: ['0002_run1.png', '0002_run2.png'],
    jump: ['0002_jump.png'],
    fall: ['0002_fall.png'],
    land: ['0002_land.png'],
    chargeStart: ['0002_charge.png'],
    chargeLoop: ['0002_charge.png'],
    ba1: [1, 2, 3, 4].map((n) => `0002_ba1_${n}.png`),
    maba1: [1, 2, 3, 4].map((n) => `0002_maba1_${n}.png`),
    ba2: [1, 2, 3].map((n) => `0002_ba2_${n}.png`),
    maba2: [1, 2, 3, 4].map((n) => `0002_maba2_${n}.png`),
    shieldStart: ['0002_prepshield.png'],
    shield: ['0002_shielding.png'],
    shieldRelease: ['0002_releaseshield.png'],
    midairShield: ['0002_midairshielding1.png', '0002_midairshielding2.png'],
  };
  assert.deepEqual(Object.keys(A).sort(), Object.keys(expected).sort(), 'exactly these clips');
  for (const [key, names] of Object.entries(expected)) {
    assert.deepEqual(files(A[key]), names, key);
    for (const url of A[key].frames) assert.ok(url.startsWith(BASE), `${url}: relative, in #0002's folder`);
  }
  // Loops where the engine holds a state; single poses held.
  assert.deepEqual(Object.keys(A).filter((k) => A[k].loop), ['idle', 'run', 'chargeLoop', 'midairShield']);
  // The CBA1 art is an effect (a pool with hands rising from it), all six
  // frames in order, the two small first ones included.
  assert.deepEqual(Object.keys(DEF.effectAnimations), ['cba1']);
  assert.deepEqual(files(DEF.effectAnimations.cba1), [1, 2, 3, 4, 5, 6].map((n) => `0002_cba1_${n}.png`));
  assert.equal(DEF.effectAnimations.cba1.sourceFacing, 0);
  // No Charge release pose: letting go returns straight to neutral.
  assert.equal(A.chargeRelease, undefined);
});

test('characterFramePaths loads each registered file once: no duplicate upload, no #0001 file', () => {
  const paths = characterFramePaths(DEF);
  assert.equal(new Set(paths).size, paths.length, 'each file once');
  assert.ok(paths.every((url) => url.startsWith(BASE)), 'only #0002\'s own art');
  const registered = [
    ...Object.values(DEF.animations).flatMap((a) => a.frames),
    ...Object.values(DEF.effectAnimations).flatMap((a) => a.frames),
  ];
  assert.deepEqual([...paths].sort(), [...new Set(registered)].sort());
  // 0002_charge.png plays in two Charge clips but loads once; mouvmen1 (a
  // copy of run1) is not loaded at all.
  assert.equal(paths.filter((u) => u.endsWith('0002_charge.png')).length, 1);
  assert.ok(!paths.some((u) => u.includes('mouvmen')));
  assert.deepEqual(paths.map(file).sort(), SUPPLIED.filter((n) => n !== '0002_mouvmen1.png'));
  for (const url of paths) assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
  // And #0001 loads nothing of #0002's: preloading both available fighters
  // (App.start) loads two disjoint sets, each counted and built on its own.
  const own = characterFramePaths(DEF_0001);
  assert.ok(own.every((u) => u.startsWith('./assets/characters/0001/')));
  assert.equal(own.filter((u) => paths.includes(u)).length, 0);
  assert.equal(paths.length, 37);
});

// ---- What #0002 does not have ---------------------------------------------------------

test('no Unique Basic Attack, Charged BA2, Transform, projectile, summon or charged technique', () => {
  assert.equal(Object.hasOwn(DEF.actions, 'uniqueba'), false, 'left out of actions: not even reserved');
  assert.equal(DEF.actions.transform, null, 'Transform stays reserved');
  assert.deepEqual(DEF.actions.ba1, { ground: 'ba1', air: 'maba1' });
  assert.deepEqual(DEF.actions.ba2, { ground: 'ba2', air: 'maba2' });
  assert.deepEqual(Object.keys(DEF.attacks).sort(), ['ba1', 'ba2', 'maba1', 'maba2']);
  for (const key of ['uniqueba', 'cba2', 'transform']) assert.equal(DEF.animations[key], undefined, key);
  assert.equal(DEF.chargedActions, undefined);
  assert.equal(DEF.chargedTechniques, undefined);
  assert.equal(DEF.summons, undefined);
  assert.equal(DEF.projectiles, undefined);
  assert.equal(DEF.projectileAnimations, undefined);
  // No names of his own, and none borrowed.
  assert.equal(DEF.abilityNames, undefined);
  assert.equal(DEF.mobileAbilities, undefined);
  for (const move of Object.keys(MOVES)) assert.equal(abilityName(DEF, move), MOVES[move].label, move);
  // No art or data of #0001's moves anywhere in his definition.
  assert.doesNotMatch(JSON.stringify(DEF), /0001|rasen|shuriken|throw|clone|Sphere|Shuriken|Punch|Kick/i);
});

test('pressing Unique Basic Attack as #0002 does nothing: no attack, no Throw, no projectile, nothing buffered', () => {
  const d = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, gap: 200 });
  for (let i = 0; i < 20; i++) d.tick(i % 2 ? {} : P('uniqueba'));
  assert.equal(d.attacker.combat.attack, null);
  assert.equal(d.attacker.bufferedAttack, null);
  assert.equal(d.attacker.state, 'idle');
  assert.deepEqual(d.projectiles, []);
  assert.deepEqual(d.events, []);
  assert.equal(d.attacker.attackFor('uniqueba'), null);
  assert.equal(d.attacker.attackMayStart('uniqueba'), false);
  // In the air too.
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step(P('jump'));
  step({ jump: true, ...P('uniqueba') });
  assert.equal(fighter.combat.attack, null);
});

test('Charge + BA2 is his normal BA2 (no Charged BA2, no cooldown, no CBA ring); Charge + BA1 his normal BA1', () => {
  for (const [button, move] of [['ba2', 'ba2'], ['ba1', 'ba1']]) {
    const d = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, gap: 120 });
    d.tick({ charge: true });
    d.tick({ charge: true });
    assert.equal(d.attacker.charging, true);
    assert.equal(d.attacker.tryChargedAction(button), false, 'nothing charged to try');
    d.tick({ charge: true, ...P(button) });
    assert.equal(d.attacker.combat.attack?.def.id, move, `${button}: its own attack`);
    assert.equal(d.attacker.technique, null, 'never a Sphere Rush');
    assert.equal(d.attacker.combat.chargedCooldowns.size, 0, 'no cooldown');
    assert.deepEqual(cbaIndicators(d.attacker), [], 'no CBA1 / CBA2 ring');
    for (let i = 0; i < 60; i++) d.tick({ charge: true });
    assert.deepEqual(d.clones, [], 'never a Clone Attack');
    assert.deepEqual(d.events, []);
  }
});

// ---- Art-only (pending) Basic Attacks ---------------------------------------------------

test('a pending attack plays one pass of its clip and strikes nothing; combat fields are refused', () => {
  const atk = createAttackDefinition({ id: 'ba1', animation: 'ba1', pending: true }, { clipDuration: 0.4 });
  assert.equal(atk.pending, true);
  assert.equal(atk.total, 0.4);
  assert.deepEqual([atk.startup, atk.active, atk.recovery], [0, 0, 0.4]);
  assert.deepEqual([atk.hitbox, atk.projectile, atk.damage, atk.baseLaunch, atk.directionalLaunch], [null, null, 0, 0, null]);
  assert.deepEqual([atk.cooldown, atk.hitCancel], [0, null]);
  for (const field of ['damage', 'hitbox', 'projectile', 'baseLaunch', 'directionalLaunch', 'hitstun', 'cooldown', 'hitCancel', 'startup']) {
    const value = field === 'hitbox' ? { x: 0, y: 0, w: 1, h: 1 } : field === 'directionalLaunch' ? 'vertical' : 1;
    assert.throws(() => createAttackDefinition({ id: 'x', animation: 'x', pending: true, [field]: value }), new RegExp(field), field);
  }
  // Every #0002 attack is one, timed by its own clip.
  const { fighter } = makeFighter({ character: DEF, sprites: SPRITES });
  for (const [id, atk2] of Object.entries(fighter.attacks)) {
    const clip = DEF.animations[atk2.animation];
    assert.equal(atk2.pending, true, id);
    assert.equal(atk2.animation, id);
    assert.ok(Math.abs(atk2.total - clip.frames.length / clip.fps) < 1e-9, id);
  }
});

test('BA1 / BA2 play their own art on the ground (ba1, ba2) and in the air (maba1, maba2), every frame in order', () => {
  for (const [button, move] of [['ba1', 'ba1'], ['ba2', 'ba2']]) {
    const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
    step(P(button));
    assert.equal(fighter.combat.attack?.def.id, move);
    const shown = [];
    while (fighter.state === 'attack') {
      shown.push(frameName(fighter));
      step();
    }
    assert.deepEqual([...new Set(shown)], files(DEF.animations[move]), move);
    const clip = DEF.animations[move];
    assert.equal(shown.length, Math.round(clip.frames.length / clip.fps / DT), `${move}: one pass of the clip`);
    assert.equal(fighter.state, 'idle');
  }
  for (const [button, move] of [['ba1', 'maba1'], ['ba2', 'maba2']]) {
    const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
    step(P('jump'));
    for (let i = 0; i < 4; i++) step({ jump: true });
    step(P(button));
    assert.equal(fighter.grounded, false);
    assert.equal(fighter.combat.attack?.def.id, move);
    assert.equal(fighter.animator.anim.key, move);
    assert.equal(frameName(fighter), files(DEF.animations[move])[0]);
  }
});

test('his Basic Attacks never hit: no event, no Launch Point, no stun, whatever they overlap', () => {
  for (const target of [DEF_0001, DEF]) {
    const d = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, targetCharacter: target, targetSprites: fakeSpritesOf(target), gap: 30 });
    for (const button of ['ba1', 'ba2', 'ba1', 'ba2']) {
      d.tick(P(button));
      d.until(() => !d.attacker.combat.attack);
    }
    assert.deepEqual(d.events, [], `vs ${target.id}`);
    assert.equal(d.target.combat.launchPoint, 0);
    assert.equal(d.target.combat.stun, 0);
  }
});

test('#0001 still hits #0002 through his (placeholder) hurtboxes, and he shows a held idle frame in hitstun', () => {
  const d = duel({ targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  d.tick(P('ba1'));
  d.until(() => d.events.length > 0);
  assert.equal(d.events[0].target, d.target);
  assert.equal(d.events[0].type, 'hit');
  d.tick();
  assert.equal(d.target.state, 'hitstun');
  assert.equal(frameName(d.target), '0002_idle1.png', 'no hurt art: the first idle frame, held');
});

// ---- Temporary baseline ----------------------------------------------------------------

test('his body and movement are the marked temporary baseline, with no Dash; nothing else is guessed', () => {
  assert.equal(DEF.movement, TEMPORARY_BASELINE.movement);
  assert.equal(DEF.collider, TEMPORARY_BASELINE.collider);
  assert.equal(DEF.pushbox, TEMPORARY_BASELINE.pushbox);
  assert.equal(DEF.hurtboxes, TEMPORARY_BASELINE.hurtboxes);
  assert.equal(DEF.powers, TEMPORARY_BASELINE.powers);
  assert.equal(DEF.movement.dashSpeed, undefined, 'no Dash without Dash art');
  for (const key of ['energy', 'stats', 'launchReaction', 'launchBounce']) assert.equal(DEF[key], undefined, key);
  assert.deepEqual(Object.keys(DEF.defense).sort(), ['airAnimation', 'groundAnimation', 'groundReleaseAnimation', 'groundStartAnimation', 'type']);
  // Marked as temporary where it is used.
  const source = readFileSync(`${ROOT}js/data/characters.js`, 'utf8');
  assert.equal(source.match(/TODO #0002: replace temporary baseline when authored attributes are supplied\./g)?.length, 2);
  // A double tap never Dashes, and never warns about it.
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step(P('runRight'));
  step();
  step(P('runRight'));
  assert.equal(fighter.dash, null);
});

// ---- Animation at runtime ----------------------------------------------------------------

test('he loads and plays his own clips: idle, run, jump, fall, land', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step();
  assert.equal(fighter.state, 'idle');
  const idle = new Set();
  for (let i = 0; i < 60; i++) idle.add(frameName(step()));
  assert.deepEqual([...idle].sort(), ['0002_idle1.png', '0002_idle2.png', '0002_idle3.png', '0002_idle4.png', '0002_idle5.png']);
  stepUntil(step, (f) => f.state === 'run', { runRight: true });
  const run = new Set();
  for (let i = 0; i < 30; i++) run.add(frameName(step({ runRight: true })));
  assert.deepEqual([...run].sort(), ['0002_run1.png', '0002_run2.png']);
  // The flicker keeps its rate whatever the speed.
  assert.equal(fighter.animator.speed, 1);
  for (let i = 0; i < 30; i++) step();
  step(P('jump'));
  assert.equal(fighter.state, 'jump');
  assert.equal(frameName(fighter), '0002_jump.png');
  stepUntil(step, (f) => f.state === 'fall');
  assert.equal(frameName(fighter), '0002_fall.png');
  stepUntil(step, (f) => f.grounded);
  assert.equal(fighter.state, 'land');
  assert.equal(frameName(fighter), '0002_land.png');
  stepUntil(step, (f) => f.state === 'idle');
});

test('Charge shows his one kneeling pose, held; letting go returns straight to neutral', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step({ charge: true });
  assert.equal(fighter.state, 'charge');
  assert.equal(fighter.animator.anim.key, 'chargeStart');
  assert.equal(frameName(fighter), '0002_charge.png');
  for (let i = 0; i < 30; i++) step({ charge: true });
  assert.equal(fighter.animator.anim.key, 'chargeLoop');
  assert.equal(frameName(fighter), '0002_charge.png');
  step();
  assert.equal(fighter.state, 'idle', 'no release pose of anyone else\'s');
  assert.equal(frameName(fighter), '0002_idle1.png');
});

test('the Shield uses his own four clips: raise, hold, lower on the ground, and both mid-air frames in the air', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step(P('shield'));
  assert.equal(fighter.state, 'shield');
  assert.equal(frameName(fighter), '0002_prepshield.png');
  for (let i = 0; i < 10; i++) step({ shield: true });
  assert.equal(frameName(fighter), '0002_shielding.png');
  step();
  assert.equal(fighter.state, 'shieldRelease');
  assert.equal(frameName(fighter), '0002_releaseshield.png');
  stepUntil(step, (f) => f.state === 'idle');

  step(P('jump'));
  for (let i = 0; i < 3; i++) step({ jump: true });
  const air = new Set();
  step({ ...P('shield') });
  for (let i = 0; i < 20; i++) air.add(frameName(step({ shield: true })));
  assert.equal(fighter.state, 'shield');
  assert.deepEqual([...air].sort(), ['0002_midairshielding1.png', '0002_midairshielding2.png']);
});

test('his art faces right: mirrored when he faces left, never otherwise', () => {
  for (const facing of [1, -1]) {
    const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES, facing });
    step();
    assert.equal(fighter.spriteFlip, facing === -1, `idle facing ${facing}`);
    step(P('ba1'));
    assert.equal(fighter.spriteFlip, facing === -1, `ba1 facing ${facing}`);
  }
  // Turning mid-attack turns the art with him.
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step(P('ba2'));
  step({ runLeft: true });
  assert.equal(fighter.facing, -1);
  assert.equal(fighter.spriteFlip, true);
});

test('no state he can be in resolves to anyone else\'s art', () => {
  const keys = new Set([
    ...Object.keys(DEF.animations), ...Object.keys(DEF_0001.animations),
    'hurt', 'midairHurt', 'dash', 'chargeRelease', 'uniqueba', 'transform', 'cba1', 'cba2',
  ]);
  for (const key of keys) {
    const { anim } = SPRITES.resolve(key);
    for (const f of anim.frames) assert.ok(f.url.startsWith(BASE), `${key}: ${f.url}`);
  }
});

// ---- The real art: grids, scale and anchors -----------------------------------------------

// A decoded PNG (8-bit RGBA, not interlaced, as every #0002 file is) in
// the shape the normalizer reads: naturalWidth / naturalHeight and pixels.
function decodePng(path) {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.deepEqual([data[8], data[9], data[12]], [8, 6, 0], `${path}: 8-bit RGBA, not interlaced`);
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = new Uint8ClampedArray(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      let v = raw[y * (stride + 1) + 1 + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { naturalWidth: width, naturalHeight: height, pixels: px };
}

// Just enough canvas for the normalizer, keeping the resampled crop it puts
// (canvas.image) so the test can read it back.
function withFakeCanvas(fn) {
  const saved = globalThis.document;
  globalThis.document = {
    createElement: () => {
      let drawn = null;
      const canvas = {
        width: 0,
        height: 0,
        image: null,
        getContext: () => ({
          drawImage: (img) => { drawn = img; },
          getImageData: () => ({ data: new Uint8ClampedArray(drawn.pixels) }),
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: (image) => { canvas.image = image; },
        }),
      };
      return canvas;
    },
  };
  try {
    return fn();
  } finally {
    globalThis.document = saved;
  }
}

const IMAGES = new Map(SUPPLIED.map((name) => [`${BASE}${name.slice(5)}`, decodePng(`${ROOT}${DIR}${name}`)]));
const build = (def = DEF) => withFakeCanvas(() => SpriteSet.build(def, (url) => IMAGES.get(url)));
const REAL = build();

// Where the right shoe's toe cap starts in a normalized frame (art pixels):
// the pattern every one of his standing poses draws it with (2 on, 2 off,
// 8 on), looked for in the bottom four rows. Null without one.
function rightShoe(f) {
  const data = f.canvas.image.data;
  const on = (x, y) => data[(y * f.w + x) * 4 + 3] > 16;
  for (let y = f.h - 1; y >= f.h - 4; y--) {
    for (let x = 1; x + 11 < f.w; x++) {
      const sig = [...Array(12)].map((_, i) => on(x + i, y));
      if (!on(x - 1, y) && sig.every((v, i) => v === (i < 2 || i >= 4))) return x;
    }
  }
  return null;
}

test('the real art: grids detected, one art-pixel scale for every clip, the tall 85-pixel idle as reference', () => {
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.usable, true);
  assert.equal(REAL.refArtHeight, 85);
  assert.ok(Math.abs(REAL.worldPerArt - DEF.visual.height / 85) < 1e-9);
  const idle = REAL.animations.idle.frames;
  assert.deepEqual(idle.map((f) => f.detected), [8, 8, 8, 8, 8], 'the neutral poses are 8x');
  assert.deepEqual(idle.map((f) => f.artH), [85, 85, 85, 85, 84]);
  assert.equal(REAL.animations.ba1.frames[0].detected, 2, 'the attacks are 2x');
  assert.equal(REAL.animations.ba1.frames[0].artH, 85, '...on the same art scale');
  // prepshield and shielding are drawn 1x (no grid): heightRatio puts them
  // at one art pixel per file pixel, level with releaseshield (2x).
  for (const key of ['shieldStart', 'shield', 'shieldRelease']) {
    const f = REAL.animations[key].frames[0];
    assert.ok(Math.abs(f.artH - 71) < 1e-9, key);
    assert.ok(Math.abs(f.unit - 1) < 1e-9, `${key}: one file pixel per art pixel`);
  }
  assert.deepEqual(REAL.animations.shield.frames.map((f) => f.detected), [1]);
  // The CBA1 effect keeps every frame at its own size, the tiny first pool included.
  const cba1 = REAL.effect('cba1');
  assert.deepEqual(cba1.frames.map((f) => [f.artW, f.artH]), [[12, 6], [18, 9], [39, 41], [40, 47], [53, 53], [60, 63]]);
  assert.equal(REAL.has('cba1'), false, 'an effect, never a fighter pose');
  // A quarter taller than #0001 in the world.
  assert.equal(DEF.visual.height, 110);
  assert.ok(DEF.visual.height > DEF_0001.visual.height * 1.2);
});

test('his feet stay planted: the right shoe sits 3 art pixels right of the anchor from idle to run, land and BA1', () => {
  for (const key of ['idle', 'run', 'land', 'ba1']) {
    for (const f of REAL.animations[key].frames) {
      const shoe = rightShoe(f);
      assert.notEqual(shoe, null, `${f.url}: its right shoe is found`);
      assert.equal(shoe - f.anchorArtX, 3, `${f.url}`);
    }
  }
  // The tendrils would have dragged the automatic anchor far off his feet.
  const auto = build({
    ...DEF,
    animations: Object.fromEntries(Object.entries(DEF.animations).map(([k, a]) => [k, { ...a, anchorX: undefined }])),
  });
  const drift = auto.animations.ba1.frames.map((f) => Math.abs(rightShoe(f) - f.anchorArtX - 3));
  assert.ok(Math.max(...drift) > 20, `${drift}`);
  // Mid-air BA1: his body never moves across its four frames, only the tendrils grow.
  assert.deepEqual(REAL.animations.maba1.frames.map((f) => f.anchorArtX), [20, 20, 20, 20]);
  // The three grounded Shield poses share their feet, so their anchor.
  const shields = ['shieldStart', 'shield', 'shieldRelease'].map((k) => REAL.animations[k].frames[0].anchorArtX);
  assert.deepEqual(shields, [10, 10, 10]);
  // Every authored anchor lies on its frame.
  for (const anim of Object.values(REAL.animations)) {
    for (const f of anim.frames) assert.ok(f.anchorArtX > 0 && f.anchorArtX < f.artW, f.url);
  }
});

test('the view frames the stage the same whoever is picked; #0002 stands a quarter taller on it', () => {
  const r = CONFIG.render;
  const sets = { '0001': { worldPerArt: DEF_0001.visual.height / 52 }, '0002': { worldPerArt: DEF.visual.height / 85 } };
  const snapped = r.pixelPerfect;
  try {
    // Before snapping to whole device pixels, exactly the same view.
    r.pixelPerfect = false;
    for (const map of [getMap('desert'), getMap('city')]) {
      for (const [w, h] of [[1280, 720], [1920, 1080], [1688, 780], [800, 600]]) {
        assert.ok(Math.abs(computeWorldScale(w, h, sets['0001'], map) - computeWorldScale(w, h, sets['0002'], map)) < 1e-9, `${map.id} ${w}x${h}`);
      }
    }
  } finally {
    r.pixelPerfect = snapped;
  }
  // Snapped, Player 1's art decides the last few percent, as ever.
  for (const [w, h] of [[1280, 720], [1688, 780]]) {
    const a = computeWorldScale(w, h, sets['0001'], getMap('desert'));
    const b = computeWorldScale(w, h, sets['0002'], getMap('desert'));
    assert.ok(Math.abs(a - b) / a <= 0.12, `${w}x${h}`);
  }
  // Each fighter drawn at its own art scale: in the world, #0002 is 110 to #0001's 88.
  const arena = { view: { scale: 2 }, worldPerArt: sets['0001'].worldPerArt };
  const px = (id) => Arena.prototype.pxPerArtOf.call(arena, sets[id]);
  assert.ok(Math.abs(px('0001') * 52 - 88 * 2) < 1e-9);
  assert.ok(Math.abs(px('0002') * 85 - 110 * 2) < 1e-9);
});

// ---- The CPU and whole fights ----------------------------------------------------------------

test('the CPU reads his moveset from his data: no melee, ranged, charged move or Dash to press', () => {
  const { fighter } = makeFighter({ character: DEF, sprites: SPRITES });
  const ms = readMoveset(fighter);
  assert.deepEqual([ms.melee, ms.ranged, ms.charged], [[], [], []]);
  assert.equal(ms.dash, null);
  assert.equal(ms.shield, true);
});

// Two CPUs (CombatAIController) in a real fight on a flat stage, stepped in
// Battle.update's order. Returns every step's inputs, keyed by fighter.
function cpuFight(defA, defB, { seconds = 30, seed = 3, difficulty = 'brutal' } = {}) {
  const stage = new StageCollision(stageMap());
  const make = (def, x, facing, slot, n) => new Fighter({
    def, sprites: fakeSpritesOf(def), stage, slot, label: `CPU ${n}`, spawn: { x, facing },
    controller: new CombatAIController({ difficulty, rng: mulberry32(seed + n) }),
  });
  const a = make(defA, 900, 1, 'p1', 1);
  const b = make(defB, 1100, -1, 'p2', 2);
  a.opponent = b;
  b.opponent = a;
  const world = { stage, projectiles: [], clones: [], combat: new CombatSystem(), score: { p1: 0, p2: 0 }, timeLeft: 99, fighters: [a, b] };
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: world };
  const inputs = new Map([[a, []], [b, []]]);
  const events = [];
  for (let n = 0; n < seconds / DT; n++) {
    for (const f of world.fighters) {
      if (f.lostToVoid) continue;
      f.update(DT, ctx);
      inputs.get(f).push({ ...f.controller.out, attack: f.combat.attack?.def.id ?? null });
      // Back on stage at once if the Void takes one: the fight goes on.
      if (f.body.y > 1600 || Math.abs(f.body.x - 1000) > 1800) f.respawn(stage);
    }
    separateFighters(a, b, stage);
    for (const f of world.fighters) resolveSolidOverlap(f.body, stage);
    spawnProjectiles(world.fighters, world.projectiles);
    for (const p of world.projectiles) p.update(DT, stage);
    updateClones(world.clones, DT);
    spawnClones(world.fighters, world.clones, stage);
    events.push(...world.combat.update(world.fighters, world.projectiles, world.clones));
    removeDeadProjectiles(world.projectiles);
    removeDeadClones(world.clones);
  }
  return { a, b, inputs, events, world };
}

test('#0001 vs #0002, #0002 vs #0001 and #0002 vs #0002 CPU fights run; #0002 never uses a move he lacks', () => {
  for (const [defA, defB] of [[DEF_0001, DEF], [DEF, DEF_0001], [DEF, DEF]]) {
    const { a, b, inputs, events, world } = cpuFight(defA, defB);
    for (const f of [a, b]) {
      if (f.def !== DEF) continue;
      const log = inputs.get(f);
      assert.equal(log.filter((i) => i.uniquebaPressed).length, 0, 'never presses Unique Basic Attack');
      assert.ok(log.every((i) => i.attack === null || f.attacks[i.attack]?.pending), 'only his own (art-only) attacks');
      assert.equal(f.combat.chargedCooldowns.size, 0);
      assert.equal(f.technique, null);
      assert.ok(events.every((e) => e.attacker !== f), 'his art-only attacks never hit');
    }
    // A live fight: #0001's CPU lands its hits on #0002's placeholder hurtboxes.
    if (defA !== defB) assert.ok(events.some((e) => e.type === 'hit' && e.target.def === DEF), 'hits land on #0002');
    assert.deepEqual(world.projectiles.filter((p) => p.owner.def === DEF), []);
    assert.deepEqual(world.clones.filter((c) => c.owner.def === DEF), []);
    for (const f of [a, b]) assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), `${f.def.id} stays in the world`);
  }
});
