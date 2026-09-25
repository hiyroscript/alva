// Run with node --test tests/clone.test.mjs (no dependencies).
// #0001's Charged BA1 Clone Attack: the clone-cloud artwork and its effect
// registration, the Charge-then-BA1 trigger, its 5-second cooldown and its
// fallbacks, the clone's appear -> BA1 -> vanish lifecycle, its placement
// behind the opponent, the overhead Mid-air BA2 it performs instead where
// there is no ground behind (platform edges, airborne opponents), detached
// hits (Dodge, Block, hitstop, attribution), independence from its owner,
// and battle restart / rendering. Uses the real
// Fighter, CombatState, CombatSystem, Clone, SpriteSet and Battle (see
// fighter-harness.mjs); sprite sets carry clip metadata only, so scale,
// anchoring and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterFramePaths } from '../js/data/characters.js';
import { getMap } from '../js/data/maps.js';
import { Fighter } from '../js/game/character.js';
import { CombatState, CooldownTimers } from '../js/game/combat.js';
import { Clone } from '../js/game/clone.js';
import { StageCollision, createBody, stepBody } from '../js/game/physics.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { TrainingAIController } from '../js/game/fighter-controller.js';
import {
  def, DT, BASE, STAGE, SIM_CTX, fakeSprites, makeFighter, frameName, stepUntil, steps, duel, stageMap,
} from './fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CHARGE = { charge: true };
const BA1 = { action1: true, action1Pressed: true };
const BA2 = { action2: true, action2Pressed: true };
const THROW = { primary: true, primaryPressed: true };
const JUMP = { jump: true, jumpPressed: true };
const DEFENSE = { defense: true, defensePressed: true };
const CHARGED_BA1 = { ...CHARGE, ...BA1 };

const CLOUD = Array.from({ length: 10 }, (_, i) => `0001_cloneav${i + 1}.png`);
const BA1_FRAMES = ['0001_1ba1.png', '0001_1ba2.png', '0001_1ba3.png', '0001_1ba4.png'];
const SUMMON = def.summons.ba1Clone;
const ATTACK = def.attacks.ba1;
// Fixed steps in one cloud pass (appear or vanish) and in one clone BA1.
const CLOUD_STEPS = steps(CLOUD.length / def.effectAnimations.cloneCloud.fps);
const BA1_STEPS = steps(ATTACK.startup + ATTACK.active + ATTACK.recovery);
// Steps from the spawn step to the first active BA1 step of the clone.
const TO_ACTIVE = CLOUD_STEPS + steps(ATTACK.startup);

// The uploaded PNGs, byte for byte.
const SHA256 = {
  '0001_cloneav1.png': 'ad3557a49ef4ab0933e4b32b278f9284a42002a5cae87abd81ec5a740abadf08',
  '0001_cloneav2.png': '03f406dc9d0e2a7e2e95168c43d2a1c5701cecb7aafe70ec20176f3bf11d54d0',
  '0001_cloneav3.png': '4f62d14d3e4f8f2b1922d96e01085a6957e77b79fd973d1f2a11d3475b2b64fe',
  '0001_cloneav4.png': '059b5a47181155d71a93ca1c936c0fe3ad563c74b26adacbeb3915ee13295b33',
  '0001_cloneav5.png': 'fc62e8f5a82d9d4aa8eac9bad091fc6e0cfd0fd105b048fc5c6d627e74f3b368',
  '0001_cloneav6.png': '1a1a08889967b705097247e115202849f1644421c45cbbfcc0421dc1fa50a33a',
  '0001_cloneav7.png': '7b52193ee43b20958eb6cfbdfb3a8052521e8af2860859f8c4dd9c950ca3787f',
  '0001_cloneav8.png': 'a7a82016d0ce84d0abdadbbe9cd9cbeca73aa4003c35b0f44991de0a0d4c46ba',
  '0001_cloneav9.png': '17dea50509d2616d9b6dc93885b1a9f7a2d3818fe44a30c2a0ee11031e3a67ff',
  '0001_cloneav10.png': '290d3c6f9c62bfb7630fe3247b0af197422583f24f2d0bf0a66e4321ab2052e9',
};

const name = (frame) => frame?.url.split('/').pop() ?? null;
// Consecutive duplicates removed: the order things were shown in.
const order = (list) => list.filter((v) => v !== null).filter((v, i, a) => v !== a[i - 1]);
// Consecutive duplicates collapsed to [value, steps shown].
function runs(list) {
  const out = [];
  for (const v of list) {
    if (out.length && out.at(-1)[0] === v) out.at(-1)[1]++;
    else out.push([v, 1]);
  }
  return out;
}

// Enters Charge, then (already charging, Charge still held) presses BA1.
// Returns the clone spawned that step.
function summon(d, targetHeld = {}) {
  const before = d.clones.length;
  d.tick(CHARGE, targetHeld);
  assert.equal(d.attacker.state, 'charge');
  d.tick(CHARGED_BA1, targetHeld);
  assert.equal(d.clones.length, before + 1, 'one clone per Charged BA1');
  return d.clones.at(-1);
}

const snap = (c) => ({
  phase: c.phase, cloud: name(c.cloudFrame), body: name(c.frame), active: !!c.activeBox({}),
  x: c.x, y: c.y, facing: c.facing, attackTime: c.attackTime,
});

// Every step of a clone from its spawn step until the battle drops it.
// `held(i)` / `targetHeld(i)` script each fighter's input on step i.
function follow(d, clone, held = () => CHARGE, targetHeld = () => ({})) {
  const log = [];
  for (let i = 1; d.clones.includes(clone); i++) {
    assert.ok(i < 600, 'the clone never went away');
    log.push({ ...snap(clone), owner: d.attacker.state, cooling: d.attacker.combat.chargedCooldowns.active('ba1Clone') });
    d.tick(held(i), targetHeld(i));
  }
  return log;
}

function captureWarnings(fn) {
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    fn();
  } finally {
    console.warn = warn;
  }
  return warnings;
}

// ---- Artwork ------------------------------------------------------------------

test('the ten clone-cloud frames live only in the canonical #0001 folder, unchanged, and preload with #0001', () => {
  const paths = characterFramePaths(def);
  const dir = readdirSync(ROOT + 'assets/characters/0001/');
  for (const file of CLOUD) {
    const url = `./assets/characters/0001/${file}`;
    assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
    assert.ok(!existsSync(ROOT + file), `no root copy of ${file}`);
    const bytes = readFileSync(ROOT + url.slice(2));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), SHA256[file], `${file} bytes are the upload`);
    assert.ok(paths.includes(url), `${url} is preloaded`);
  }
  // Preloaded in frame order, with the rest of the character.
  assert.deepEqual(paths.filter((u) => /cloneav/.test(u)), CLOUD.map((f) => `./assets/characters/0001/${f}`));
  assert.deepEqual(dir.filter((n) => /clone/i.test(n)).sort(), [...CLOUD].sort(), 'exactly the ten, no reversed copies');
  assert.deepEqual(readdirSync(ROOT).filter((n) => /clone/i.test(n)), [], 'none left at the repository root');
  // The old typo upload (with a space) is gone for good.
  for (const where of ['', 'assets/characters/0001/']) {
    assert.ok(!existsSync(`${ROOT}${where}0001_ cloneav8.png`), `no "0001_ cloneav8.png" in /${where}`);
    assert.deepEqual(readdirSync(ROOT + where).filter((n) => /\s/.test(n) && /clone/i.test(n)), []);
  }
  assert.ok(paths.every((u) => !/\s/.test(u)));
});

test('the cloud is a one-shot, direction-neutral effect animation (1 -> 10 at 20 fps), not a fighter pose', () => {
  const cloud = def.effectAnimations.cloneCloud;
  assert.deepEqual(cloud.frames, CLOUD.map((f) => `${BASE}${f.slice(5)}`));
  assert.deepEqual(cloud.frames.map((u) => Number(u.match(/cloneav(\d+)\.png$/)[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(cloud.loop, false);
  assert.equal(cloud.fps, 20);
  assert.equal(CLOUD_STEPS, 30, 'one pass is 0.5 s at 60 Hz');
  assert.equal(cloud.sourceFacing, 0);
  assert.equal(cloud.heightRatio, undefined, 'never fitted to the fighter height');
  // Not a fighter animation and not a projectile.
  for (const [key, anim] of Object.entries(def.animations)) {
    assert.ok(anim.frames.every((u) => !/clone/.test(u)), `${key} has no cloud frames`);
  }
  for (const anim of Object.values(def.projectileAnimations)) assert.ok(anim.frames.every((u) => !/clone/.test(u)));
  assert.equal(def.animationFallbacks.cloneCloud, undefined);
  // Only ten frames: the vanish is the same list reversed at runtime, and no
  // other effect uses them.
  const withCloud = Object.keys(def.effectAnimations).filter((k) => def.effectAnimations[k].frames.some((u) => /cloneav/.test(u)));
  assert.deepEqual(withCloud, ['cloneCloud']);
});

test('the Clone Attack is data: a Charged BA1 summon on a 5-second cooldown, reusing ba1 and the cloud', () => {
  // Charged actions are typed: Charged BA1 is this summon (Charged BA2, the
  // Sphere Rush, is a technique; see charged-ba2.test.mjs).
  assert.deepEqual(def.chargedActions.action1, { type: 'summon', id: 'ba1Clone' });
  assert.equal(SUMMON.cooldown, 5);
  assert.equal('energyCost' in SUMMON, false, 'no cost of any kind');
  assert.equal(SUMMON.attack, 'ba1');
  assert.equal(SUMMON.cloud, 'cloneCloud');
  assert.equal(SUMMON.behindDistance, 48);
  assert.equal(SUMMON.effectOffset.x, 0);
  assert.ok(SUMMON.effectOffset.y < 0, 'the cloud centres on the body, above the feet');
  // BA1 itself: Base Launch 1, horizontal, and the summon has no launch data
  // of its own.
  assert.deepEqual(
    { ...ATTACK },
    {
      animation: 'ba1', startup: 1 / 12, active: 1 / 12, recovery: 2 / 12, damage: 5,
      hitbox: { x: 12, y: -64, w: 28, h: 16 }, baseLaunch: 1, directionalLaunch: 'horizontal',
      hitstun: 0.22, blockstun: 0.14, hitstop: 0.06, cooldown: 0.1, groundOnly: true,
    },
  );
  for (const key of ['baseLaunch', 'directionalLaunch', 'launchPoint', 'powers']) assert.equal(key in SUMMON, false, `no summon ${key}`);
  assert.doesNotMatch(readFileSync(ROOT + 'js/game/clone.js', 'utf8'), /knockback|launch\.js|resolveHitLaunch|resolveLaunchStrength|resolveDirectionalLaunch|powers\.js/i,
    'the clone performs the owner\'s resolved attack; it never resolves a launch itself');
  assert.deepEqual(def.actions.action1, { ground: 'ba1', air: 'midairBa1' });
  // No new control: the summon has no action, key or attack of its own.
  assert.equal(def.actions.clone, undefined);
  assert.equal(def.attacks.ba1Clone, undefined);
});

// A decoded-image stand-in: `artW` x `artH` art pixels, each a `px` x `px`
// block, in an opaque two-colour checkerboard (so the grid is detectable).
function blockImage(artW, artH, px) {
  const w = artW * px;
  const h = artH * px;
  const pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) pixels[y * w + x] = (Math.floor(x / px) + Math.floor(y / px)) % 2 ? 0xff00ff00 : 0xff0000ff;
  }
  return { naturalWidth: w, naturalHeight: h, pixels };
}

// Just enough canvas for the normalizer: drawImage + getImageData read the
// stand-in's pixels, createImageData / putImageData hold the resampled crop.
function withFakeCanvas(fn) {
  const saved = globalThis.document;
  globalThis.document = {
    createElement: () => {
      let drawn = null;
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (img) => { drawn = img; },
          getImageData: () => ({ data: new Uint8ClampedArray(drawn.pixels.slice().buffer) }),
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData() {},
        }),
      };
    },
  };
  try {
    return fn();
  } finally {
    globalThis.document = saved;
  }
}

test('SpriteSet normalizes the cloud as an effect at its own art size, on the fighter\'s art-pixel scale', () => {
  // The real frame sizes, read from the PNG headers. In the browser the
  // cloud's pixel grid detects as 2 source pixels per art pixel.
  const size = (file) => {
    const png = readFileSync(`${ROOT}assets/characters/0001/${file}`);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  const build = (height, clouds = true) => withFakeCanvas(() => {
    const images = new Map([[`${BASE}idle1.png`, blockImage(35, 52, 16)]]);
    if (clouds) for (const file of CLOUD) {
      const [w, h] = size(file);
      images.set(`${BASE}${file.slice(5)}`, blockImage(w / 2, h / 2, 2));
    }
    const character = {
      ...def,
      animations: { idle: { frames: [`${BASE}idle1.png`], fps: 7, loop: true } },
      projectileAnimations: {},
      effectAnimations: { cloneCloud: def.effectAnimations.cloneCloud },
      visual: { ...def.visual, height },
    };
    return SpriteSet.build(character, (url) => images.get(url));
  });

  const set = build(88);
  const cloud = set.effect('cloneCloud');
  assert.ok(cloud, 'sprites.effect("cloneCloud")');
  assert.equal(cloud, set.effects.cloneCloud);
  assert.equal(set.has('cloneCloud'), false, 'not a fighter animation');
  assert.equal(set.animations.cloneCloud, undefined);
  assert.equal(set.projectile('cloneCloud'), null);
  assert.deepEqual(cloud.frames.map((f) => name(f)), CLOUD);
  assert.equal(cloud.fps, 20);
  assert.equal(cloud.loop, false);
  assert.equal(cloud.sourceFacing, 0, 'direction-neutral: never mirrored');
  for (const [i, f] of cloud.frames.entries()) {
    const [w, h] = size(CLOUD[i]);
    assert.equal(f.detected, 2);
    // Native size in art pixels, centre-anchored.
    assert.equal(f.artW, w / 2, CLOUD[i]);
    assert.equal(f.artH, h / 2, CLOUD[i]);
    assert.equal(f.anchorArtX, f.artW / 2);
    assert.equal(f.anchorArtY, f.artH / 2);
  }
  // cloneav7 is 65 art pixels square: about 110 world units at #0001's scale.
  assert.equal(set.refArtHeight, 52);
  assert.ok(Math.abs(cloud.frames[6].artH * set.worldPerArt - 110) < 1);

  // A different fighter height changes the art-pixel scale, never the
  // cloud's art size: it is not fitted to the fighter.
  const tall = build(176);
  assert.equal(tall.worldPerArt, set.worldPerArt * 2);
  assert.deepEqual(tall.effect('cloneCloud').frames.map((f) => [f.artW, f.artH]), cloud.frames.map((f) => [f.artW, f.artH]));

  // Frames that fail to load are reported, and no art means no effect.
  const none = build(88, false);
  assert.equal(none.effect('cloneCloud'), null);
  assert.deepEqual(none.missing, def.effectAnimations.cloneCloud.frames);
});

// ---- Cooldown helpers ------------------------------------------------------------

test('CooldownTimers: start, remaining, duration and progress; recovery at any rate, never below 0', () => {
  const c = new CooldownTimers();
  assert.equal(c.active('a'), false);
  assert.deepEqual([c.remaining('a'), c.duration('a'), c.progress('a')], [0, 0, 1], 'ready: a complete ring');
  c.start('a', 5);
  assert.deepEqual([c.active('a'), c.remaining('a'), c.duration('a'), c.progress('a')], [true, 5, 5, 0], 'fresh: an empty ring');
  c.update(2.5);
  assert.deepEqual([c.remaining('a'), c.duration('a'), c.progress('a')], [2.5, 5, 0.5], 'halfway: half a ring');
  c.update(0.5, 2);
  assert.deepEqual([c.remaining('a'), c.progress('a')], [1.5, 0.7]);
  c.update(10);
  assert.deepEqual([c.active('a'), c.remaining('a'), c.progress('a')], [false, 0, 1], 'never negative: simply ready');
  // Independent entries; a zero cooldown is none.
  c.start('a', 5);
  c.start('b', 3);
  c.update(1);
  assert.deepEqual([c.remaining('a'), c.remaining('b')], [4, 2]);
  c.start('c', 0);
  assert.equal(c.active('c'), false);
  c.clear();
  assert.equal(c.size, 0);
  // A fighter's charged cooldowns are apart from its attack recovery.
  const state = new CombatState(def.stats);
  assert.ok(state.chargedCooldowns instanceof CooldownTimers);
  assert.ok(state.cooldowns instanceof Map);
  for (const key of ['energy', 'maxEnergy', 'health', 'maxHealth']) assert.equal(key in state, false, key);
});

// ---- Trigger --------------------------------------------------------------------

test('Charge, then BA1 while still charging: one clone, a 5.0 s cooldown, and the owner keeps charging', () => {
  const d = duel();
  d.tick(CHARGE);
  assert.equal(d.attacker.state, 'charge');
  assert.equal(d.attacker.charging, true);
  d.tick(CHARGED_BA1);
  assert.equal(d.clones.length, 1);
  const [clone] = d.clones;
  assert.ok(clone instanceof Clone);
  assert.equal(clone.owner, d.attacker);
  assert.equal(clone.target, d.target);
  assert.equal(clone.phase, 'appear');
  assert.equal(name(clone.cloudFrame), CLOUD[0], 'the cloud starts on frame 1');
  assert.equal(clone.frame, null, 'no clone body yet');
  const cd = d.attacker.combat.chargedCooldowns;
  assert.deepEqual([cd.remaining('ba1Clone'), cd.duration('ba1Clone')], [5, 5], 'Charged BA1\'s 5.0 s cooldown starts');
  assert.equal(cd.active('rasenRush'), false, 'Charged BA2 stays ready');
  assert.equal(d.attacker.summons.length, 0, 'the request was consumed');
  // The owner performs nothing: no attack, no BA1 art, no cooldown.
  assert.equal(d.attacker.state, 'charge');
  assert.equal(d.attacker.charging, true);
  assert.equal(d.attacker.combat.attack, null);
  assert.notEqual(d.attacker.animator.anim.key, 'ba1');
  assert.equal(d.attacker.combat.cooldowns.size, 0);
  assert.equal(d.attacker.combat.lastIntent, 'action1');
  assert.deepEqual(d.events, []);

  // Holding BA1 (no new press) never summons again.
  for (let i = 0; i < steps(1); i++) d.tick({ ...CHARGE, action1: true });
  assert.equal(d.clones.length, 1);
  assert.equal(d.clones[0], clone, 'still the first one, mid-lifecycle');
  assert.ok(cd.active('ba1Clone'));
  assert.equal(d.attacker.combat.attack, null);
  assert.equal(d.attacker.state, 'charge');
});

test('Charge and BA1 pressed together from idle is an ordinary BA1: no clone, no cooldown', () => {
  const d = duel();
  d.tick({ ...CHARGE, chargePressed: true, ...BA1 });
  assert.equal(d.attacker.state, 'attack');
  assert.equal(d.attacker.combat.attack.def.id, 'ba1');
  assert.equal(frameName(d.attacker), '0001_1ba1.png');
  assert.equal(d.attacker.combat.chargedCooldowns.size, 0);
  assert.equal(d.clones.length, 0);
  d.until(() => !d.attacker.combat.attack);
  assert.equal(d.clones.length, 0);
  assert.equal(d.attacker.combat.chargedCooldowns.size, 0);
});

test('letting go of Charge on the BA1 step is an ordinary BA1: no clone, no release pose, no cooldown', () => {
  const d = duel();
  stepUntil(() => { d.tick(CHARGE); return d.attacker; }, (f) => f.animator.anim.key === 'chargeLoop');
  d.tick(BA1);
  assert.equal(d.attacker.state, 'attack');
  assert.equal(d.attacker.combat.attack.def.id, 'ba1');
  assert.equal(frameName(d.attacker), '0001_1ba1.png', 'straight into BA1');
  assert.equal(d.clones.length, 0);
  const states = [];
  while (d.attacker.state === 'attack') {
    d.tick();
    states.push(d.attacker.state);
  }
  assert.ok(!states.includes('chargeRelease'), states.join());
  assert.equal(d.clones.length, 0);
  assert.equal(d.attacker.combat.chargedCooldowns.size, 0);
});

test('Charged BA1 cannot be reused while cooling down: the press does nothing at all, and the cooldown runs on', () => {
  const d = duel();
  const first = summon(d);
  const cd = d.attacker.combat.chargedCooldowns;
  for (let i = 0; i < steps(0.5); i++) d.tick(CHARGE);
  const before = cd.remaining('ba1Clone');
  assert.ok(before > 0 && before < 5);
  d.tick(CHARGED_BA1);
  assert.equal(d.clones.length, 1, 'no second clone');
  assert.equal(d.clones[0], first);
  assert.deepEqual(d.attacker.summons, []);
  // Unavailable means unavailable: no ordinary BA1 in its place, no reset.
  assert.equal(d.attacker.combat.attack, null, 'no BA1 either');
  assert.equal(d.attacker.state, 'charge', 'still charging');
  assert.ok(cd.remaining('ba1Clone') < before, 'never restarted');
  assert.equal(cd.duration('ba1Clone'), 5);
  // Pressed again and again while it cools: still nothing.
  for (let i = 0; i < steps(1); i++) d.tick(i % 10 === 0 ? CHARGED_BA1 : CHARGE);
  assert.equal(d.attacker.combat.attack, null);
  assert.ok(d.clones.every((c) => c === first));
});

test('Charged BA1 is ready again 5 s after its use at the normal rate, whether or not the clone hit', () => {
  for (const hit of [true, false]) {
    const d = duel();
    const clone = summon(d);
    // Let go of Charge: nothing speeds the cooldown up now. Without a hit,
    // the target walks away before the punch.
    const used = d.attacker.combat.chargedCooldowns;
    let n = 0;
    while (used.active('ba1Clone')) {
      d.tick({}, !hit && n < steps(0.5) ? { right: true } : {});
      n++;
      assert.ok(n < steps(6));
    }
    assert.equal(clone.alive, false);
    assert.equal(d.events.some((e) => e.summon === clone), hit, hit ? 'the clone hit' : 'the clone missed');
    // Summoned on the charging step, 5 s at 1x after it.
    assert.ok(Math.abs(n * DT - 5) <= DT, `${n} steps`);
    // Ready: the next Charged BA1 summons again.
    d.tick(CHARGE);
    d.tick(CHARGED_BA1);
    assert.equal(d.clones.length, 1);
    assert.notEqual(d.clones[0], clone);
    assert.equal(used.remaining('ba1Clone'), 5);
  }
});

test('missing cloud art: no clone, no cooldown started, a warning, and an ordinary BA1', () => {
  const d = duel({ attackerSprites: fakeSprites(undefined, undefined, []) });
  let warnings = captureWarnings(() => {
    d.tick(CHARGE);
    d.tick(CHARGED_BA1);
  });
  assert.equal(d.clones.length, 0);
  assert.equal(d.attacker.combat.chargedCooldowns.active('ba1Clone'), false);
  assert.equal(d.attacker.combat.attack?.def.id, 'ba1');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ba1Clone.*cloneCloud.*no animation frames/);

  // Missing BA1 art: no clone, no cooldown, and (as before) no BA1 either.
  const noBa1 = duel({ attackerSprites: fakeSprites(Object.keys(def.animations).filter((k) => k !== 'ba1')) });
  warnings = captureWarnings(() => {
    noBa1.tick(CHARGE);
    noBa1.tick(CHARGED_BA1);
  });
  assert.equal(noBa1.clones.length, 0);
  assert.equal(noBa1.attacker.combat.chargedCooldowns.active('ba1Clone'), false);
  assert.equal(noBa1.attacker.combat.attack, null);
  assert.equal(noBa1.attacker.state, 'charge');
  assert.ok(warnings.some((w) => /ba1Clone.*"ba1" has no animation frames/.test(w)), warnings.join('\n'));

  // No opponent to appear behind: nothing to summon, no cooldown.
  const alone = makeFighter();
  alone.step(CHARGE);
  alone.step(CHARGED_BA1);
  assert.equal(alone.fighter.summons.length, 0);
  assert.equal(alone.fighter.combat.chargedCooldowns.active('ba1Clone'), false);
  assert.equal(alone.fighter.combat.attack?.def.id, 'ba1');
});

// ---- Regressions ----------------------------------------------------------------

test('ordinary ground and mid-air BA1 are unchanged: no clone and no charged cooldown', () => {
  const ground = duel();
  ground.tick(BA1);
  assert.equal(ground.attacker.combat.attack.def.id, 'ba1');
  ground.until(() => ground.events.length > 0);
  assert.equal(ground.events[0].damage, 5);
  assert.equal(ground.events[0].summon, null);
  assert.equal(ground.attacker.combat.hitstop, 0.06, 'the owner\'s own punch still freezes the owner');

  const air = duel({ gap: 200 });
  air.tick(JUMP);
  // Charge held in the air never charges, so BA1 is the mid-air kick.
  for (let i = 0; i < 10; i++) air.tick({ ...CHARGE, jump: true });
  assert.equal(air.attacker.grounded, false);
  air.tick(CHARGED_BA1);
  assert.equal(air.attacker.combat.attack.def.id, 'midairBa1');
  for (const d of [ground, air]) {
    d.until(() => !d.attacker.combat.attack && d.attacker.grounded);
    assert.equal(d.clones.length, 0);
    assert.equal(d.attacker.combat.chargedCooldowns.size, 0);
  }
});

test('Charged BA2 (its own Sphere Rush technique), Throw and Defense summon no clone and never start Charged BA1\'s cooldown', () => {
  for (const [press, check] of [
    [BA2, (d) => assert.equal(d.attacker.technique?.def.id, 'rasenRush')],
    [THROW, (d) => assert.equal(d.attacker.combat.attack?.def.id, 'throw')],
    [DEFENSE, (d) => assert.equal(d.attacker.combat.defenseAction?.type, 'dodge')],
  ]) {
    const d = duel();
    d.tick(CHARGE);
    d.tick({ ...CHARGE, ...press });
    check(d);
    assert.equal(d.attacker.charging, false, 'it interrupts Charge as before');
    d.until(() => !d.attacker.combat.attack && !d.attacker.combat.defenseAction && !d.attacker.technique);
    for (let i = 0; i < 30; i++) d.tick(CHARGE);
    assert.equal(d.clones.length, 0);
    assert.equal(d.attacker.combat.chargedCooldowns.active('ba1Clone'), false);
  }
  // The Throw still throws its shuriken.
  const t = duel({ gap: 300 });
  t.tick(CHARGE);
  t.tick({ ...CHARGE, ...THROW });
  t.until(() => t.projectiles.length > 0);
  assert.equal(t.clones.length, 0);
});

// ---- Lifecycle ------------------------------------------------------------------

test('the clone appears through clouds 1 -> 10, punches with the real BA1 frames, vanishes 10 -> 1, then is removed', () => {
  const d = duel();
  const clone = summon(d);
  const log = follow(d, clone);
  assert.equal(d.clones.length, 0, 'removed after the last cloud frame');
  assert.equal(clone.alive, false);

  const appear = log.filter((s) => s.phase === 'appear');
  const attack = log.filter((s) => s.phase === 'attack');
  const vanish = log.filter((s) => s.phase === 'vanish');
  assert.deepEqual(log.map((s) => s.phase), [...appear, ...attack, ...vanish].map((s) => s.phase), 'appear -> attack -> vanish');
  assert.deepEqual(order(appear.map((s) => s.cloud)), CLOUD, 'appearance plays 1 -> 10 once');
  assert.deepEqual(order(vanish.map((s) => s.cloud)), [...CLOUD].reverse(), 'vanishing plays 10 -> 1 once');
  assert.deepEqual(order(log.map((s) => s.body)), BA1_FRAMES, 'the body is exactly 1ba1 -> 1ba4');
  // Each cloud frame shows for 1/20 s both ways: the same timing.
  const frameSteps = steps(1 / 20);
  assert.deepEqual(runs(appear.map((s) => s.cloud)), CLOUD.map((f) => [f, frameSteps]));
  assert.deepEqual(runs(vanish.map((s) => s.cloud)), [...CLOUD].reverse().map((f) => [f, frameSteps]));
  assert.equal(appear.length, CLOUD_STEPS);
  assert.equal(vanish.length, CLOUD_STEPS);
  // The cloud clears over the clone's first BA1 frame; then only the body.
  assert.deepEqual(appear.filter((s) => s.body).map((s) => [s.cloud, s.body]), Array(frameSteps).fill([CLOUD[9], BA1_FRAMES[0]]));
  assert.ok(attack.every((s) => s.cloud === null && s.body));
  assert.ok(vanish.every((s) => s.body === null), 'the body is gone as the cloud reverses');
  // A hitbox only on BA1's active frame, never in a cloud.
  assert.ok(appear.every((s) => !s.active));
  assert.ok(vanish.every((s) => !s.active));
  assert.ok(attack.filter((s) => s.active).every((s) => s.body === '0001_1ba2.png'));
  // It hit (the target stood still): one BA1 hit, the clone's freeze included.
  assert.equal(d.events.length, 1);
  assert.equal(attack.length, BA1_STEPS + Math.ceil(ATTACK.hitstop / DT));
  // The owner charged throughout and paid once.
  assert.ok(log.every((s) => s.owner === 'charge'));
  assert.ok(log.every((s) => s.cooling), 'Charged BA1 cools down through the clone\'s whole life');
});

test('the clone is summoned behind the target, on its back side, facing it; the spot is snapshotted once', () => {
  // Target facing left (toward the owner on its left): its back is to the right.
  const left = duel();
  assert.equal(left.target.facing, -1);
  const a = summon(left);
  assert.equal(a.x, left.target.body.x + 48, 'right of the target');
  assert.equal(a.facing, -1, 'facing left, toward it');
  assert.equal(a.y, left.target.body.y);

  // Target facing right (toward the owner on its right): back to the left.
  const right = duel({ attackerFacing: -1 });
  assert.equal(right.target.facing, 1);
  const b = summon(right);
  assert.equal(b.x, right.target.body.x - 48, 'left of the target');
  assert.equal(b.facing, 1, 'facing right, toward it');

  // A target facing away from the owner: still its back side, which is now
  // between the two fighters. The owner's side does not decide it.
  const away = duel({ targetFacing: 1 });
  const c = summon(away);
  assert.equal(c.x, away.target.body.x - 48);
  assert.equal(c.facing, 1);

  // On a platform (the harness ledge, x 900 - 1100), with the platform
  // still under the spot behind: the clone stands at the target's feet
  // height, no physics.
  const high = duel();
  high.target.body.x = 1000;
  high.target.body.y = 600;
  const h = Clone.summon(high.attacker, { id: 'ba1Clone', target: high.target }, STAGE);
  assert.equal(h.x, 1048);
  assert.equal(h.y, 600);
  assert.equal(h.attackDef.id, 'ba1');
  assert.equal('body' in h, false);
});

test('the clone never follows: the target can walk straight through its spot, and the punch whiffs', () => {
  const d = duel();
  const clone = summon(d);
  const spot = { x: clone.x, y: clone.y, facing: clone.facing };
  // The target runs right, through the clone's position and away.
  const log = follow(d, clone, () => CHARGE, (i) => (i < CLOUD_STEPS ? { right: true } : {}));
  assert.ok(d.target.body.x > spot.x + 60, 'no pushbox stopped it');
  for (const s of log) assert.deepEqual({ x: s.x, y: s.y, facing: s.facing }, spot);
  // Whiff: no Launch Point added, and the full BA1 still plays and recovers.
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.launchPoint, 0);
  const attack = log.filter((s) => s.phase === 'attack');
  assert.equal(attack.length, BA1_STEPS, 'startup, active and recovery, no freeze');
  // BA1's own 12 fps: every frame for 1/12 s, the hitbox on frame 2.
  assert.deepEqual(runs(attack.map((s) => s.body)), BA1_FRAMES.map((f) => [f, steps(1 / 12)]));
  assert.deepEqual(attack.filter((s) => s.active).map((s) => s.body), Array(steps(ATTACK.active)).fill('0001_1ba2.png'));
  assert.deepEqual(order(log.filter((s) => s.phase === 'vanish').map((s) => s.cloud)), [...CLOUD].reverse());
  assert.equal(d.clones.length, 0);
});

test('no side walls clamp where the clone appears: behind a target at a ledge is open air, so it appears overhead, and never moves afterwards', () => {
  const owner = makeFighter({ x: 90, facing: -1 }).fighter;
  // Its back to the main floor's left edge (x 0): the spot behind (x -18) is
  // over open air, so the clone appears over the target instead.
  const nearLeft = makeFighter({ x: 30, facing: 1 }).fighter;
  const l = Clone.summon(owner, { id: 'ba1Clone', target: nearLeft }, STAGE);
  assert.deepEqual([l.attackDef.id, l.x, l.y, l.facing], ['midairBa2', 30, nearLeft.body.y - 36, 1]);
  const nearRight = makeFighter({ x: 1975, facing: -1 }).fighter;
  const r = Clone.summon(owner, { id: 'ba1Clone', target: nearRight }, STAGE);
  assert.deepEqual([r.attackDef.id, r.x, r.facing], ['midairBa2', 1975, -1]);
  // A step further in, the spot behind still overlaps the floor: the clone
  // stands there, unclamped (no longer pulled in to 1983).
  const inside = makeFighter({ x: 1940, facing: -1 }).fighter;
  const c = Clone.summon(owner, { id: 'ba1Clone', target: inside }, STAGE);
  assert.deepEqual([c.attackDef.id, c.x, c.y], ['ba1', 1988, inside.body.y]);
  for (let i = 0; i < 60; i++) r.update(DT);
  assert.equal(r.x, 1975);
});

// ---- No ground behind: the overhead Mid-air BA2 -------------------------------------

// A one-way roof 200 above the floor (x 800 - 1200) with a lower step off its
// right edge (x 1200 - 1400, 100 above the floor): past either roof edge
// there is only something lower to stand on.
const ROOF_Y = 600;
const ROOF = new StageCollision(stageMap({
  platforms: [
    { id: 'roof', x: 800, y: ROOF_Y, w: 400, h: 16 },
    { id: 'step', x: 1200, y: 700, w: 200, h: 16 },
  ],
}));
const MB2 = def.attacks.midairBa2;
const MB2_FRAMES = ['0001_midair1ba1.png', '0001_midair1ba2.png', '0001_midair1ba3.png', '0001_midair1ba4.png', '0001_midair1ba5.png'];
const MB2_STEPS = steps(MB2.startup + MB2.active + MB2.recovery);
const MB2_TO_ACTIVE = CLOUD_STEPS + steps(MB2.startup);
const HALF = def.collider.width / 2;

// Stands `f` at `x` on whatever surface is at `y` (the real spawn
// placement), facing `facing`.
function place(f, stage, x, y, facing) {
  f.spawn = { x, y, facing };
  f.reset(stage);
}

// A duel on ROOF: the target stands on the roof at `targetX`, facing
// `facing`, with the owner on the roof just in front of it (so its back is to
// the other side and it keeps facing the owner).
function roofDuel(targetX, facing, opts = {}) {
  const d = duel({ stage: ROOF, ...opts });
  place(d.target, ROOF, targetX, ROOF_Y, facing);
  place(d.attacker, ROOF, targetX + facing * 44, ROOF_Y, -facing);
  return d;
}

// Target spots on the roof whose back is past the roof's edge: its right
// edge facing left, its left edge facing right.
const EDGES = [[1180, -1], [820, 1]];

test('StageCollision.supportsAt: a surface at that very height under the span, never a lower one', () => {
  assert.equal(ROOF.supportsAt(990, 1024, ROOF_Y), true, 'on the roof');
  assert.equal(ROOF.supportsAt(1300, 1334, 700), true, 'on the step');
  assert.equal(ROOF.supportsAt(400, 434, 800), true, 'on the floor');
  assert.equal(ROOF.supportsAt(1300, 1334, ROOF_Y), false, 'the step is lower than the roof');
  assert.equal(ROOF.surfaceBelow(1300, 1334, ROOF_Y).ref.id, 'step', 'even though surfaceBelow finds it');
  assert.equal(ROOF.supportsAt(400, 434, ROOF_Y), false, 'the floor is lower still');
  assert.equal(ROOF.supportsAt(990, 1024, 500), false, 'in the air over the roof');
  // Any horizontal overlap counts, as it does for a landing body.
  assert.equal(ROOF.supportsAt(1199, 1233, ROOF_Y), true);
  assert.equal(ROOF.supportsAt(1200, 1234, ROOF_Y), false);
  // Solids' tops too, within the physics tolerance of the height.
  const block = new StageCollision(stageMap({ solids: [{ id: 'b', x: 100, y: 700, w: 50, h: 100 }] }));
  assert.equal(block.supportsAt(110, 144, 700), true);
  assert.equal(block.supportsAt(110, 144, 700.4), true);
  assert.equal(block.supportsAt(110, 144, 702), false);
});

test('the no-ground fallback is data: the summon reuses midairBa2 over the target; nothing about midairBa2 changes', () => {
  assert.deepEqual(SUMMON.noGround, { attack: 'midairBa2', offset: { x: 0, y: -36 } });
  assert.equal(SUMMON.attack, 'ba1', 'BA1 stays the normal clone attack');
  assert.equal(SUMMON.cooldown, 5, 'one cooldown, whichever way it appears');
  assert.deepEqual(
    { ...MB2 },
    {
      animation: 'midairBa2', startup: 2 / 12, active: 1 / 12, recovery: 2 / 12, damage: 10,
      hitbox: { x: 8, y: -44, w: 40, h: 40 }, baseLaunch: 2, directionalLaunch: 'reverseVertical',
      hitstun: 0.22, blockstun: 0.14, hitstop: 0.06, cooldown: 0.1,
    },
  );
  assert.equal(def.attacks.ba1Clone, undefined);
  // The clone engine never names a fighter, a summon or an attack.
  const src = readFileSync(ROOT + 'js/game/clone.js', 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /0001|ba1Clone|midairBa2|'ba1'/);
  const f = makeFighter().fighter;
  assert.deepEqual(f.summonDefs.ba1Clone.noGround, SUMMON.noGround);
  assert.ok(Object.isFrozen(f.summonDefs.ba1Clone.noGround));
});

test('supported ground is unchanged: behind the target either way it faces, BA1, 5 damage, Base Launch 1 horizontal', () => {
  for (const attackerFacing of [1, -1]) {
    const d = duel({ attackerFacing });
    const facing = d.target.facing;
    assert.equal(facing, -attackerFacing);
    const clone = summon(d);
    assert.equal(clone.attackDef, d.attacker.attacks.ba1);
    assert.equal(clone.animator.anim.key, 'ba1');
    assert.equal(clone.x, d.target.body.x - facing * 48);
    assert.equal(clone.y, d.target.body.y);
    assert.equal(clone.facing, facing);
    const log = follow(d, clone);
    assert.deepEqual(order(log.filter((s) => s.phase === 'appear').map((s) => s.cloud)), CLOUD);
    assert.deepEqual(order(log.map((s) => s.body)), BA1_FRAMES);
    assert.deepEqual(order(log.filter((s) => s.phase === 'vanish').map((s) => s.cloud)), [...CLOUD].reverse());
    assert.equal(d.events.length, 1);
    assert.equal(d.events[0].damage, 5, 'the clone\'s BA1 adds 5');
    assert.equal(d.target.combat.launchPoint, 5);
    assert.ok(d.attacker.combat.chargedCooldowns.active('ba1Clone'));
  }
  // BA1's own authored launch, inherited through the shared applyHit: 115 +
  // 5 = 120, then 1 x 120 along the clone's facing, no upward launch.
  const d = duel();
  d.target.combat.launchPoint = 115;
  const clone = summon(d);
  d.until(() => d.events.length > 0);
  const [e] = d.events;
  assert.deepEqual([e.damage, e.baseLaunch, e.directionalLaunch], [5, 1, 'horizontal']);
  assert.deepEqual([e.launchPointBefore, e.launchPointAfter, e.launchStrength], [115, 120, 120]);
  assert.equal(d.target.body.vx, 120 * clone.facing);
  assert.equal(d.target.body.vy, 0);
});

test('on a platform with support behind the target, the clone still stands behind it and uses BA1', () => {
  for (const [targetX, facing] of [[1000, -1], [1000, 1], [1150, -1], [850, 1]]) {
    const d = roofDuel(targetX, facing);
    const clone = summon(d);
    assert.equal(d.target.body.y, ROOF_Y);
    assert.equal(d.target.facing, facing);
    assert.equal(clone.attackDef.id, 'ba1', `${targetX} facing ${facing}`);
    assert.equal(clone.x, targetX - facing * 48);
    assert.equal(clone.y, ROOF_Y);
    assert.equal(clone.facing, facing);
  }
});

test('support follows the physics: the clone stands behind exactly where a body there would stand on the roof', () => {
  const owner = makeFighter({ stage: ROOF }).fighter;
  const modes = new Set();
  for (let targetX = 1140; targetX <= 1183; targetX++) {
    const target = makeFighter({ x: targetX, y: ROOF_Y, facing: -1, stage: ROOF }).fighter;
    assert.equal(target.body.y, ROOF_Y);
    const clone = Clone.summon(owner, { id: 'ba1Clone', target }, ROOF);
    // A body of the owner's collider, resting at the behind spot: does one
    // step of the real physics keep it on the roof?
    const behind = targetX + 48;
    const probe = createBody({ x: behind, y: ROOF_Y, width: def.collider.width, height: def.collider.height });
    stepBody(probe, DT, ROOF, SIM_CTX.gravity);
    const stands = probe.grounded && probe.y === ROOF_Y;
    assert.equal(clone.attackDef.id, stands ? 'ba1' : 'midairBa2', `target at ${targetX}`);
    modes.add(clone.attackDef.id);
  }
  assert.deepEqual([...modes], ['ba1', 'midairBa2'], 'both sides of the edge were covered');
  // The last supported spot overlaps the roof by a single unit.
  const at = (x) => Clone.summon(owner, { id: 'ba1Clone', target: makeFighter({ x, y: ROOF_Y, facing: -1, stage: ROOF }).fighter }, ROOF);
  assert.equal(at(1168).attackDef.id, 'ba1');
  assert.equal(at(1168).x - HALF, 1199);
  assert.equal(at(1169).attackDef.id, 'midairBa2');
});

test('at a platform edge with nothing behind at its height, the clone appears over the target and uses midairBa2', () => {
  for (const [targetX, facing] of EDGES) {
    const d = roofDuel(targetX, facing);
    const clone = summon(d);
    // The target itself stands on the roof; only the spot behind it is bare.
    assert.equal(d.target.grounded, true);
    assert.equal(d.target.body.y, ROOF_Y);
    assert.equal(d.target.body.ground.id, 'roof');
    assert.equal(ROOF.supportsAt(targetX - facing * 48 - HALF, targetX - facing * 48 + HALF, ROOF_Y), false);
    assert.equal(clone.attackDef, d.attacker.attacks.midairBa2, `${targetX} facing ${facing}`);
    assert.equal(clone.attackDef.id, 'midairBa2');
    assert.equal(clone.animator.anim.key, 'midairBa2');
    assert.equal(clone.x, d.target.body.x);
    assert.equal(clone.y, d.target.body.y - 36);
    assert.equal(clone.facing, d.target.facing);
    assert.equal(clone.facing, facing);
    assert.equal(clone.phase, 'appear');
    assert.equal(name(clone.cloudFrame), CLOUD[0]);
    assert.ok(d.attacker.combat.chargedCooldowns.active('ba1Clone'), 'the same single cooldown');
    assert.equal(d.attacker.state, 'charge');
    for (const key of ['body', 'pushbox', 'hurtboxes']) assert.equal(key in clone, false, `no ${key}`);
  }
});

test('a lower surface under the spot behind does not count: only support at the target\'s own foot height does', () => {
  // Right roof edge: the step (100 lower) is under the spot behind.
  const step = roofDuel(1180, -1);
  assert.equal(ROOF.surfaceBelow(1228 - HALF, 1228 + HALF, ROOF_Y).ref.id, 'step');
  assert.equal(summon(step).attackDef.id, 'midairBa2');
  // Left roof edge: only the floor (200 lower) is under it.
  const floor = roofDuel(820, 1);
  assert.equal(ROOF.surfaceBelow(772 - HALF, 772 + HALF, ROOF_Y).ref.id, '__floor');
  assert.equal(summon(floor).attackDef.id, 'midairBa2');
  // The harness ledge (x 900 - 1100, y 600) over the floor (y 800), the
  // same way.
  const onLedge = makeFighter({ x: 1090, y: 600, facing: -1 }).fighter;
  assert.equal(onLedge.body.y, 600);
  assert.equal(STAGE.surfaceBelow(1138 - HALF, 1138 + HALF, 600).y, 800);
  const past = Clone.summon(makeFighter().fighter, { id: 'ba1Clone', target: onLedge }, STAGE);
  assert.equal(past.attackDef.id, 'midairBa2');
  assert.equal(past.x, 1090);
  assert.equal(past.y, 564);
});

test('an airborne target gets the overhead midairBa2, snapshotted where it was at the summon', () => {
  for (const attackerFacing of [1, -1]) {
    const d = duel({ attackerFacing });
    d.tick(CHARGE, JUMP);
    for (let i = 0; i < 8; i++) d.tick(CHARGE, { jump: true });
    assert.equal(d.attacker.state, 'charge');
    assert.equal(d.target.grounded, false);
    d.tick(CHARGED_BA1, { jump: true });
    assert.equal(d.clones.length, 1);
    const [clone] = d.clones;
    assert.ok(d.target.body.y < 800 - 36, 'well off the floor');
    assert.equal(clone.attackDef.id, 'midairBa2');
    assert.equal(clone.x, d.target.body.x);
    assert.equal(clone.y, d.target.body.y - 36);
    assert.equal(clone.facing, d.target.facing);
    assert.ok(d.attacker.combat.chargedCooldowns.active('ba1Clone'));
    const spot = { x: clone.x, y: clone.y, facing: clone.facing };
    const log = follow(d, clone);
    for (const s of log) assert.deepEqual({ x: s.x, y: s.y, facing: s.facing }, spot, 'no gravity, no landing');
    assert.deepEqual(order(log.map((s) => s.body)), MB2_FRAMES);
  }
});

test('the overhead clone appears, kicks with the real five midairBa2 frames on their own timing, then vanishes', () => {
  for (const [targetX, facing] of EDGES) {
    const d = roofDuel(targetX, facing);
    const clone = summon(d);
    const log = follow(d, clone);
    assert.equal(d.clones.length, 0);
    assert.equal(clone.alive, false);
    const appear = log.filter((s) => s.phase === 'appear');
    const attack = log.filter((s) => s.phase === 'attack');
    const vanish = log.filter((s) => s.phase === 'vanish');
    assert.deepEqual(log.map((s) => s.phase), [...appear, ...attack, ...vanish].map((s) => s.phase));
    // The same cloud, both ways, at the same timing.
    assert.deepEqual(runs(appear.map((s) => s.cloud)), CLOUD.map((f) => [f, steps(1 / 20)]));
    assert.deepEqual(runs(vanish.map((s) => s.cloud)), [...CLOUD].reverse().map((f) => [f, steps(1 / 20)]));
    // Mid-air BA2 frame 1 (not BA1's) shows under the last cloud frame.
    assert.deepEqual(appear.filter((s) => s.body).map((s) => [s.cloud, s.body]), Array(steps(1 / 20)).fill([CLOUD[9], MB2_FRAMES[0]]));
    assert.deepEqual(order(log.map((s) => s.body)), MB2_FRAMES);
    assert.ok(log.every((s) => !BA1_FRAMES.includes(s.body)), 'no ground BA1 frame');
    assert.ok(vanish.every((s) => s.body === null));
    // The hitbox only on frame 3, for midairBa2's own active time, and
    // never in a cloud.
    assert.ok(appear.every((s) => !s.active) && vanish.every((s) => !s.active));
    const active = attack.filter((s) => s.active);
    assert.equal(active.length, steps(MB2.active) + Math.ceil(MB2.hitstop / DT), 'its active time, held through the freeze');
    assert.ok(active.every((s) => s.body === '0001_midair1ba3.png'));
    // The stationary target was hit: its five frames plus the clone's freeze.
    assert.equal(d.events.length, 1);
    assert.equal(attack.length, MB2_STEPS + Math.ceil(MB2.hitstop / DT));
    // Stationary the whole time, never falling.
    for (const s of log) assert.deepEqual([s.x, s.y, s.facing], [targetX, ROOF_Y - 36, facing]);
    assert.ok(log.every((s) => s.owner === 'charge' && s.cooling));
  }
});

test('the overhead kick lands on a stationary target through the real hitbox and hurtboxes, credited to the owner', () => {
  for (const [targetX, facing] of EDGES) {
    const d = roofDuel(targetX, facing);
    const clone = summon(d);
    assert.equal(clone.attackDef, d.attacker.attacks.midairBa2);
    // Mid-air BA2's own Base Launch 2, reverse vertical: no sideways push.
    assert.deepEqual([clone.attackDef.baseLaunch, clone.attackDef.directionalLaunch], [2, 'reverseVertical']);
    let n = 0;
    while (!d.events.length) {
      d.tick(CHARGE);
      assert.ok(++n <= MB2_TO_ACTIVE, 'it connects on its first active step');
    }
    assert.equal(n, MB2_TO_ACTIVE);
    assert.equal(clone.attackPhase, 'active');
    assert.equal(name(clone.frame), '0001_midair1ba3.png');
    assert.equal(d.events.length, 1);
    const [e] = d.events;
    assert.equal(e.type, 'hit');
    assert.equal(e.attacker, d.attacker);
    assert.equal(e.target, d.target);
    assert.equal(e.summon, clone);
    assert.equal(e.projectile, null);
    assert.equal(e.technique, null);
    assert.equal(e.damage, 10, 'the overhead Mid-air BA2 adds 10');
    assert.equal(d.target.combat.launchPoint, 10);
    assert.equal(d.target.combat.stun, MB2.hitstun);
    assert.equal(d.target.combat.hitstop, MB2.hitstop);
    assert.equal(clone.hitstop, MB2.hitstop, 'the clone freezes on impact');
    assert.equal(d.attacker.combat.hitstop, 0, 'the owner never does');
    assert.equal(d.attacker.state, 'charge');
    assert.equal(d.attacker.combat.cooldowns.has('midairBa2'), false);
  }
});

test('the overhead kick drives the target downward with mid-air BA2\'s Base Launch 2 reverse vertical: 110 + 10 = 120, vy +240', () => {
  for (const [targetX, facing] of EDGES) {
    const d = roofDuel(targetX, facing);
    d.target.combat.launchPoint = 110;
    summon(d);
    d.until(() => d.events.length > 0);
    assert.ok(d.target.body.vx === 0, 'no sideways push');
    assert.ok(d.target.body.vy > 0, 'downward: world y grows down');
    assert.equal(d.events[0].launchStrength, 240);
    assert.equal(d.target.body.vy, 240, '2 x 120, downward');
    assert.equal(d.target.body.grounded, false);
  }
});

test('the overhead kick hits once, however many steps its active box overlaps the target', () => {
  const d = roofDuel(1180, -1);
  const clone = summon(d);
  let overlapSteps = 0;
  while (d.clones.includes(clone)) {
    d.tick(CHARGE);
    if (clone.activeBox()) overlapSteps++;
  }
  assert.equal(overlapSteps, steps(MB2.active) + Math.ceil(MB2.hitstop / DT), 'live across several steps (and the freeze)');
  assert.equal(d.events.length, 1, 'one hit event');
  assert.equal(d.target.combat.launchPoint, 10, 'one damage application');
  assert.equal(clone.hasHit, true);
  assert.equal(clone.hitbox(), null, 'used up');
});

test('a Dodge\'s invulnerable frames let the overhead kick pass through unspent; after them it can still connect', () => {
  const dodgeStartup = steps(def.defense.ground.startup);
  const covered = roofDuel(1180, -1);
  const clone = summon(covered);
  let activeSteps = 0;
  for (let i = 1; covered.clones.includes(clone); i++) {
    covered.tick(CHARGE, i === MB2_TO_ACTIVE - dodgeStartup ? DEFENSE : {});
    if (!clone.activeBox()) continue;
    activeSteps++;
    assert.equal(covered.target.combat.invulnerable, true, `invulnerable while the kick is live (step ${i})`);
  }
  assert.equal(activeSteps, steps(MB2.active));
  assert.deepEqual(covered.events, []);
  assert.equal(covered.target.combat.launchPoint, 0);
  assert.equal(covered.target.combat.stun, 0);
  assert.equal(covered.target.body.vy, 0, 'no spike');
  assert.equal(covered.target.grounded, true);
  assert.equal(clone.hasHit, false, 'not used up by the Dodge');
  assert.equal(clone.hitstop, 0);

  const late = roofDuel(1180, -1);
  const c2 = summon(late);
  const invulnerable = [];
  let hitAt = null;
  for (let i = 1; late.clones.includes(c2); i++) {
    late.tick(CHARGE, i === MB2_TO_ACTIVE - dodgeStartup - 2 ? DEFENSE : {});
    if (late.target.combat.invulnerable) invulnerable.push(i);
    if (hitAt === null && late.events.length) hitAt = i;
  }
  assert.ok(invulnerable.includes(MB2_TO_ACTIVE), 'the window covered the start of the kick');
  assert.equal(hitAt, invulnerable.at(-1) + 1, 'it connects on the first step after the window');
  assert.equal(late.events.length, 1);
  assert.equal(late.events[0].summon, c2);
  assert.equal(late.target.combat.launchPoint, 10);
});

test('Block (future fighters): the overhead kick goes through applyHit like any hit; a block suppresses its spike', () => {
  const blocker = { ...def, defense: { type: 'block' } };
  const GUARD = { defense: true };
  // The guard faces the owner, the way the clone faces: not into it.
  const open = roofDuel(1180, -1, { targetCharacter: blocker });
  open.target.combat.launchPoint = 110;
  const c1 = summon(open, GUARD);
  assert.equal(c1.attackDef.id, 'midairBa2');
  while (!open.events.length) open.tick(CHARGE, GUARD);
  assert.equal(open.target.combat.blocking, true, 'the guard was up');
  assert.equal(open.events[0].type, 'hit');
  assert.equal(open.events[0].damage, 10);
  assert.equal(open.target.body.vy, 240, 'the full spike: 2 x 120');

  // Turned to face the clone: a normal block. Its chip damage still adds
  // to Launch Point, but the block cancels the reverse vertical launch.
  const front = roofDuel(1180, -1, { targetCharacter: blocker });
  const c2 = summon(front, GUARD);
  front.target.opponent = null;
  front.target.facing = -c2.facing;
  while (!front.events.length) front.tick(CHARGE, GUARD);
  const [e] = front.events;
  assert.equal(e.type, 'block');
  assert.equal(e.attacker, front.attacker);
  assert.equal(e.summon, c2);
  assert.equal(e.damage, MB2.damage * front.target.combat.blockDamageScale, 'chip damage');
  assert.equal(front.target.combat.stun, MB2.blockstun);
  assert.ok(front.target.body.vx === 0);
  assert.equal(front.target.body.vy, 0, 'no spike on a block');
  assert.equal(front.target.combat.launchPoint, e.damage, 'the chip damage still counts');
  assert.equal(front.target.body.grounded, true);
  assert.equal(c2.hitstop, MB2.hitstop);
  assert.equal(front.attacker.combat.hitstop, 0);
});

test('the overhead clone never follows: position, facing and attack stay put, and the kick whiffs', () => {
  const d = roofDuel(1180, -1);
  const clone = summon(d);
  const spot = { x: clone.x, y: clone.y, facing: clone.facing, attackDef: clone.attackDef };
  // The target walks off along the roof, away from the spot, and stands.
  const log = follow(d, clone, () => CHARGE, (i) => (i < CLOUD_STEPS ? { left: true } : {}));
  assert.ok(d.target.body.x < spot.x - 80, 'it walked away');
  assert.equal(d.target.body.y, ROOF_Y, 'still on the roof');
  for (const s of log) assert.deepEqual({ x: s.x, y: s.y, facing: s.facing }, { x: spot.x, y: spot.y, facing: spot.facing });
  assert.equal(clone.attackDef, spot.attackDef, 'the attack choice never changes');
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.launchPoint, 0);
  const attack = log.filter((s) => s.phase === 'attack');
  assert.equal(attack.length, MB2_STEPS, 'all five frames, no freeze');
  assert.deepEqual(runs(attack.map((s) => s.body)), MB2_FRAMES.map((f) => [f, steps(1 / 12)]));
  assert.deepEqual(attack.filter((s) => s.active).map((s) => s.body), Array(steps(MB2.active)).fill('0001_midair1ba3.png'));
  assert.deepEqual(order(log.filter((s) => s.phase === 'vanish').map((s) => s.cloud)), [...CLOUD].reverse());
  assert.equal(d.clones.length, 0);

  // Nor does a spot chosen behind a grounded target become overhead later.
  const g = roofDuel(1000, -1);
  const behind = summon(g);
  const gLog = follow(g, behind, () => CHARGE, () => ({ right: true }));
  assert.ok(g.target.body.y > ROOF_Y, 'the target ran off the roof edge');
  assert.equal(behind.attackDef.id, 'ba1');
  assert.ok(gLog.every((s) => s.x === 1048 && s.y === ROOF_Y));
  assert.deepEqual(order(gLog.map((s) => s.body)), BA1_FRAMES);
});

test('missing no-ground attack art or data: no clone anywhere, no cooldown started, a warning, and an ordinary BA1', () => {
  const noArt = fakeSprites(Object.keys(def.animations).filter((k) => k !== 'midairBa2'));
  // At a roof edge (where it would be needed) and on the floor (where it
  // would not): the same refusal, so the cooldown never depends on the spot.
  for (const d of [roofDuel(1180, -1, { attackerSprites: noArt }), duel({ attackerSprites: noArt })]) {
    const warnings = captureWarnings(() => {
      d.tick(CHARGE);
      d.tick(CHARGED_BA1);
    });
    assert.equal(d.clones.length, 0, 'no invisible clone');
    assert.equal(d.attacker.summons.length, 0);
    assert.equal(d.attacker.combat.chargedCooldowns.active('ba1Clone'), false, 'no cooldown');
    assert.equal(d.attacker.combat.attack?.def.id, 'ba1', 'the press falls through to BA1');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /ba1Clone.*no-ground attack "midairBa2" has no animation frames/);
  }

  // Data missing: no such attack, or no hitbox.
  const { midairBa2, ...rest } = def.attacks;
  for (const [character, problem] of [
    [{ ...def, attacks: rest }, /no-ground attack "midairBa2" is not defined/],
    [{ ...def, attacks: { ...def.attacks, midairBa2: { ...midairBa2, hitbox: null } } }, /no-ground attack "midairBa2" has no hitbox/],
  ]) {
    const a = makeFighter({ character, stage: ROOF, x: 1136, y: ROOF_Y, facing: 1 });
    const b = makeFighter({ stage: ROOF, x: 1180, y: ROOF_Y, facing: -1 });
    a.fighter.opponent = b.fighter;
    const warnings = captureWarnings(() => {
      a.step(CHARGE);
      a.step(CHARGED_BA1);
    });
    assert.equal(a.fighter.summons.length, 0);
    assert.equal(a.fighter.combat.chargedCooldowns.active('ba1Clone'), false);
    assert.equal(a.fighter.combat.attack?.def.id, 'ba1');
    assert.match(warnings.join('\n'), problem);
    // Nor does a request that got through anyway spawn a broken clone.
    let clone;
    const spawnWarnings = captureWarnings(() => {
      clone = Clone.summon(a.fighter, { id: 'ba1Clone', target: b.fighter }, ROOF);
    });
    assert.equal(clone, null);
    assert.match(spawnWarnings.join('\n'), problem);
  }
});

test('a summon without a no-ground fallback keeps the old placement: behind at foot height, even past an edge', () => {
  const plain = { ...def.summons.ba1Clone };
  delete plain.noGround;
  const character = { ...def, summons: { ba1Clone: plain } };
  // No midairBa2 art needed either.
  const sprites = fakeSprites(Object.keys(def.animations).filter((k) => k !== 'midairBa2'));
  const owner = makeFighter({ character, sprites, stage: ROOF }).fighter;
  assert.equal(owner.summonDefs.ba1Clone.noGround, null);
  for (const [targetX, facing] of EDGES) {
    const target = makeFighter({ x: targetX, y: ROOF_Y, facing, stage: ROOF }).fighter;
    const clone = Clone.summon(owner, { id: 'ba1Clone', target }, ROOF);
    assert.equal(clone.attackDef.id, 'ba1');
    assert.equal(clone.x, targetX - facing * 48);
    assert.equal(clone.y, ROOF_Y);
  }
});

test('stage edges: support is judged at the very spot behind, and neither spot is ever clamped', () => {
  // Platforms flush with the main floor's edges: the spot behind a target at
  // the very edge is past them, one a little further in is on them.
  const edge = new StageCollision(stageMap({
    platforms: [{ id: 'sill', x: 0, y: ROOF_Y, w: 100, h: 16 }, { id: 'far', x: 1900, y: ROOF_Y, w: 100, h: 16 }],
  }));
  const owner = makeFighter({ stage: edge }).fighter;
  const summonAt = (x, facing, o = owner) => {
    const target = makeFighter({ x, y: ROOF_Y, facing, stage: edge }).fighter;
    return Clone.summon(o, { id: 'ba1Clone', target }, edge);
  };
  const l = summonAt(30, 1);
  assert.deepEqual([l.attackDef.id, l.x, l.y], ['midairBa2', 30, ROOF_Y - 36], 'x -18 is off the sill');
  const inL = summonAt(60, 1);
  assert.deepEqual([inL.attackDef.id, inL.x, inL.y], ['ba1', 12, ROOF_Y], 'x 12 is on it');
  const r = summonAt(1975, -1);
  assert.deepEqual([r.attackDef.id, r.x], ['midairBa2', 1975]);
  const inR = summonAt(1940, -1);
  assert.deepEqual([inR.attackDef.id, inR.x], ['ba1', 1988]);

  // Airborne targets out past both edges: overhead, wherever they are.
  for (const [x, facing] of [[-40, 1], [-40, -1], [2040, 1], [2040, -1]]) {
    const target = makeFighter({ x, facing, stage: edge }).fighter;
    target.body.y = 500;
    const c = Clone.summon(owner, { id: 'ba1Clone', target }, edge);
    assert.equal(c.attackDef.id, 'midairBa2');
    assert.equal(c.x, x);
  }

  // A sideways offset mirrors with facing, unclamped like the spot behind.
  const shifted = { ...def, summons: { ba1Clone: { ...def.summons.ba1Clone, noGround: { attack: 'midairBa2', offset: { x: 40, y: -36 } } } } };
  const o = makeFighter({ character: shifted, stage: edge }).fighter;
  const at = (x, facing) => {
    const target = makeFighter({ x, facing, stage: edge }).fighter;
    target.body.y = 500;
    return Clone.summon(o, { id: 'ba1Clone', target }, edge);
  };
  assert.equal(at(1000, 1).x, 1040);
  assert.equal(at(1000, -1).x, 960);
  assert.equal(at(1000, 1).y, 464);
  assert.equal(at(1975, 1).x, 2015);
  assert.equal(at(25, -1).x, -15);
  const moved = at(1975, 1);
  for (let i = 0; i < 60; i++) moved.update(DT);
  assert.equal(moved.x, 2015);
});

test('on the real City map: behind on a catwalk\'s middle, overhead at its edge', () => {
  const stage = new StageCollision(getMap('city'));
  const overpass = stage.platforms.find((p) => p.id === 'overpass');
  const owner = makeFighter({ stage }).fighter;
  const on = (x, facing) => {
    const target = makeFighter({ x, y: overpass.y, facing, stage }).fighter;
    assert.equal(target.body.y, overpass.y);
    return [target, Clone.summon(owner, { id: 'ba1Clone', target }, stage)];
  };
  const [, mid] = on(overpass.x + 130, 1);
  assert.deepEqual([mid.attackDef.id, mid.x, mid.y], ['ba1', overpass.x + 82, overpass.y]);
  const [t, edge] = on(overpass.x + 25, 1);
  assert.deepEqual([edge.attackDef.id, edge.x, edge.y, edge.facing], ['midairBa2', t.body.x, overpass.y - 36, 1]);
  // The main roof far below is no support at the catwalk's height.
  const behind = overpass.x - 23;
  assert.equal(stage.surfaceBelow(behind - HALF, behind + HALF, overpass.y).y, stage.groundY);
});

// ---- Hits ---------------------------------------------------------------------------

test('the clone BA1 hits once with BA1\'s damage, stun and launch from the clone, credited to the owner', () => {
  const d = duel();
  d.target.combat.launchPoint = 115;
  const clone = summon(d);
  // The owner's own BA1 definition, so the clone resolves nothing itself:
  // Base Launch 1, horizontal.
  assert.equal(clone.attackDef, d.attacker.attacks.ba1);
  assert.deepEqual([clone.attackDef.baseLaunch, clone.attackDef.directionalLaunch], [1, 'horizontal']);
  d.until(() => d.events.length > 0);
  assert.equal(d.events.length, 1);
  const [e] = d.events;
  assert.equal(e.type, 'hit');
  assert.equal(e.attacker, d.attacker, 'the owner is the attacker');
  assert.equal(e.target, d.target);
  assert.equal(e.summon, clone);
  assert.equal(e.projectile, null);
  assert.equal(e.damage, 5, 'the clone\'s BA1 adds 5');
  assert.equal(d.target.combat.launchPoint, 120, '115 + 5');
  assert.equal(e.launchStrength, 120, '1 x 120');
  assert.equal(d.target.combat.stun, ATTACK.hitstun);
  assert.equal(d.target.combat.hitstop, ATTACK.hitstop);
  // Launched along the clone's facing (left, away from the clone), even
  // though the owner faces right.
  assert.equal(d.attacker.facing, 1);
  assert.equal(d.target.body.vx, -120);
  assert.equal(clone.hasHit, true);
  assert.equal(clone.attackPhase, 'active');
  assert.equal(clone.hitbox(), null, 'used up');
  assert.ok(clone.activeBox(), 'still active for the debug overlay');
  // No cooldown for the owner's own BA1, and it stays free to act.
  assert.equal(d.attacker.combat.cooldowns.has('ba1'), false);
  assert.equal(d.attacker.combat.canAct(), true);
  const log = follow(d, clone);
  assert.equal(d.events.length, 1, 'one hit per clone punch');
  assert.ok(log.some((s) => s.phase === 'attack' && s.body === '0001_1ba4.png'), 'recovery plays out');
  assert.deepEqual(order(log.filter((s) => s.phase === 'vanish').map((s) => s.cloud)), [...CLOUD].reverse());
  assert.equal(d.clones.length, 0);
  assert.equal(d.target.combat.launchPoint, 120);
});

test('a clone hit freezes the target and the clone, never the owner, whose Charge keeps animating', () => {
  const d = duel();
  const solo = makeFighter();
  solo.step(CHARGE);
  const clone = summon(d);
  solo.step(CHARGE);
  const compare = () => {
    assert.equal(d.attacker.state, solo.fighter.state);
    assert.equal(d.attacker.stateTime, solo.fighter.stateTime);
    assert.equal(frameName(d.attacker), frameName(solo.fighter));
    assert.equal(d.attacker.combat.hitstop, 0);
  };
  while (!d.events.length) {
    d.tick(CHARGE);
    solo.step(CHARGE);
    compare();
  }
  assert.equal(d.target.combat.hitstop, ATTACK.hitstop);
  assert.equal(clone.hitstop, ATTACK.hitstop, 'the clone pauses on impact');
  const frozenAt = clone.attackTime;
  const frame = name(clone.frame);
  const freeze = Math.ceil(ATTACK.hitstop / DT);
  for (let i = 0; i < freeze; i++) {
    d.tick(CHARGE);
    solo.step(CHARGE);
    compare();
    assert.equal(clone.attackTime, frozenAt, `frozen step ${i}`);
    assert.equal(name(clone.frame), frame);
  }
  d.tick(CHARGE);
  solo.step(CHARGE);
  compare();
  assert.ok(clone.attackTime > frozenAt, 'then its attack resumes');
});

test('a Dodge\'s invulnerable frames let the clone BA1 pass through unspent; after them it can still connect', () => {
  // The Dodge's invulnerable frames exactly cover the clone's active frame.
  const dodgeStartup = steps(def.defense.ground.startup);
  const covered = duel();
  const clone = summon(covered);
  let activeSteps = 0;
  for (let i = 1; covered.clones.includes(clone); i++) {
    covered.tick(CHARGE, i === TO_ACTIVE - dodgeStartup ? DEFENSE : {});
    if (!clone.activeBox()) continue;
    activeSteps++;
    assert.equal(covered.target.combat.invulnerable, true, `invulnerable while the punch is live (step ${i})`);
  }
  assert.equal(activeSteps, steps(ATTACK.active));
  assert.deepEqual(covered.events, []);
  assert.equal(covered.target.combat.launchPoint, 0);
  assert.equal(covered.target.combat.stun, 0);
  assert.equal(covered.target.body.vx, 0, 'no launch');
  assert.equal(clone.hasHit, false, 'not used up by the Dodge');
  assert.equal(clone.hitstop, 0, 'no freeze');

  // Invulnerable a little earlier: the punch is still live when the window
  // ends, and connects as a normal hit.
  const late = duel();
  const c2 = summon(late);
  const invulnerable = [];
  let hitAt = null;
  for (let i = 1; late.clones.includes(c2); i++) {
    late.tick(CHARGE, i === TO_ACTIVE - dodgeStartup - 2 ? DEFENSE : {});
    if (late.target.combat.invulnerable) invulnerable.push(i);
    if (hitAt === null && late.events.length) hitAt = i;
  }
  assert.ok(invulnerable.includes(TO_ACTIVE), 'the window covered the start of the punch');
  assert.equal(hitAt, invulnerable.at(-1) + 1, 'it connects on the first step after the window');
  assert.equal(late.events.length, 1);
  assert.equal(late.events[0].type, 'hit');
  assert.equal(late.events[0].summon, c2);
  assert.equal(late.target.combat.launchPoint, 5);
});

test('Block (future fighters): a guard facing away does not block the clone; turned toward it, it does', () => {
  const blocker = { ...def, defense: { type: 'block' } };
  const GUARD = { defense: true };

  // The guard faces the owner, so the clone at its back gets through, even
  // though the owner's own facing points into the guard.
  const back = duel({ targetCharacter: blocker });
  summon(back, GUARD);
  while (!back.events.length) back.tick(CHARGE, GUARD);
  assert.equal(back.target.combat.blocking, true, 'the guard was up');
  assert.equal(back.target.facing, -1, 'toward the owner, away from the clone');
  assert.equal(back.attacker.facing, 1, 'the owner faces into the guard; its facing does not count');
  assert.equal(back.events[0].type, 'hit');
  assert.equal(back.events[0].damage, 5);
  assert.equal(back.target.combat.stun, ATTACK.hitstun);

  // Turned to face the clone before the punch: a normal block.
  const front = duel({ targetCharacter: blocker });
  // 119 + the chip damage (5 x 0.2 = 1) is 120: a raw 1 x 120, halved by
  // the Block afterward.
  front.target.combat.launchPoint = 119;
  const clone = summon(front, GUARD);
  front.target.opponent = null;
  front.target.facing = -clone.facing;
  while (!front.events.length) front.tick(CHARGE, GUARD);
  const [e] = front.events;
  assert.equal(e.type, 'block');
  assert.equal(e.attacker, front.attacker);
  assert.equal(e.damage, ATTACK.damage * front.target.combat.blockDamageScale, 'chip damage');
  assert.equal(front.target.combat.stun, ATTACK.blockstun);
  assert.equal(front.target.combat.launchPoint, 120);
  assert.equal(e.launchStrength, 120, 'the raw strength, before Block');
  assert.equal(front.target.body.vx, 60 * clone.facing, 'half of it, from the clone');
  assert.equal(clone.hitstop, ATTACK.hitstop, 'a blocked punch still pauses the clone');
  assert.equal(front.attacker.combat.hitstop, 0);
});

// ---- Independence ---------------------------------------------------------------

test('the owner keeps charging, unfrozen, for the clone\'s whole life, and never plays BA1', () => {
  // The owner against a fighter that only ever holds Charge.
  const d = duel();
  const solo = makeFighter();
  solo.step(CHARGE);
  const clone = summon(d);
  solo.step(CHARGE);
  const anims = new Set();
  const shown = [];
  while (d.clones.includes(clone)) {
    d.tick(CHARGE);
    solo.step(CHARGE);
    anims.add(d.attacker.animator.anim.key);
    shown.push(frameName(d.attacker));
    assert.equal(d.attacker.state, 'charge');
    assert.equal(d.attacker.stateTime, solo.fighter.stateTime, 'the Charge clock never pauses');
    assert.equal(frameName(d.attacker), frameName(solo.fighter));
    assert.equal(d.attacker.combat.hitstop, 0);
    assert.equal(d.attacker.combat.attack, null);
  }
  assert.deepEqual([...anims], ['chargeStart', 'chargeLoop'], 'its own Charge art only, never BA1');
  assert.ok(shown.every((n) => /^0001_charge[12ab]\.png$/.test(n)));
  assert.equal(d.events.length, 1, 'the clone hit meanwhile');
});

test('letting go of Charge after the summon plays the normal release pose; the clone carries on', () => {
  const d = duel();
  const clone = summon(d);
  d.tick();
  assert.equal(d.attacker.state, 'chargeRelease', 'the existing voluntary release');
  assert.equal(frameName(d.attacker), '0001_charge1.png');
  const log = follow(d, clone, () => ({}));
  assert.deepEqual(order(log.filter((s) => s.phase === 'appear').map((s) => s.cloud)), CLOUD);
  assert.deepEqual(order(log.map((s) => s.body)), BA1_FRAMES);
  assert.deepEqual(order(log.filter((s) => s.phase === 'vanish').map((s) => s.cloud)), [...CLOUD].reverse());
  assert.equal(d.clones.length, 0);
  assert.equal(d.attacker.state, 'idle');
});

test('Jump, BA2, Throw or a Dodge by the owner after the summon leave the clone\'s lifecycle intact', () => {
  for (const press of [JUMP, BA2, THROW, DEFENSE]) {
    const d = duel({ gap: 150 });
    const clone = summon(d);
    const log = follow(d, clone, (i) => (i === 1 ? press : {}));
    assert.deepEqual(order(log.filter((s) => s.phase === 'appear').map((s) => s.cloud)), CLOUD);
    assert.deepEqual(order(log.map((s) => s.body)), BA1_FRAMES);
    assert.deepEqual(order(log.filter((s) => s.phase === 'vanish').map((s) => s.cloud)), [...CLOUD].reverse());
    assert.equal(d.clones.length, 0);
    assert.ok(d.attacker.combat.chargedCooldowns.active('ba1Clone'), 'still cooling down');
  }
});

test('an owner hit after summoning goes into hitstun; the clone carries on, and the cooldown is not refunded', () => {
  const d = duel();
  const clone = summon(d);
  // The target punches the owner right after the summon.
  d.tick(CHARGE, BA1);
  d.until(() => d.events.some((e) => e.target === d.attacker));
  d.tick(CHARGE);
  assert.equal(d.attacker.state, 'hitstun');
  assert.equal(d.attacker.combat.launchPoint, 5);
  assert.equal(clone.alive, true);
  assert.equal(d.clones.length, 1);
  const log = follow(d, clone);
  assert.deepEqual(order(log.map((s) => s.body)), BA1_FRAMES);
  assert.deepEqual(order(log.filter((s) => s.phase === 'vanish').map((s) => s.cloud)), [...CLOUD].reverse());
  assert.ok(d.attacker.combat.chargedCooldowns.active('ba1Clone'), 'no refund');
  assert.equal(d.clones.length, 0);
});

test('an owner launched after summoning, at a high Launch Point, leaves its clone to finish; nothing new is summoned', () => {
  const d = duel();
  d.attacker.combat.launchPoint = 250;
  const clone = summon(d);
  d.tick(CHARGE, BA2);
  d.until(() => d.events.some((e) => e.target === d.attacker));
  assert.ok(d.attacker.combat.launchPoint > 250);
  const log = follow(d, clone, () => CHARGED_BA1);
  assert.deepEqual(order(log.map((s) => s.body)), BA1_FRAMES);
  assert.deepEqual(order(log.filter((s) => s.phase === 'vanish').map((s) => s.cloud)), [...CLOUD].reverse());
  assert.equal(d.clones.length, 0, 'no retarget, no second clone');
  assert.ok(d.attacker.combat.chargedCooldowns.active('ba1Clone'));
});

test('clones from successive Charged BA1s never overlap: each waits out the 5 s cooldown and runs its own clock', () => {
  const d = duel();
  // Every clone's state after every step, from its spawn step on.
  const logs = new Map();
  const tick = (held) => {
    d.tick(held);
    for (const c of d.clones) {
      if (!logs.has(c)) logs.set(c, []);
      logs.get(c).push(snap(c));
    }
  };
  tick(CHARGE);
  for (let i = 0; i < 3; i++) {
    tick(CHARGED_BA1);
    assert.equal(d.clones.length, 1, `clone ${i + 1}`);
    // Charged all along: the cooldown recovers at 2x, still well after the
    // clone is gone.
    while (d.attacker.combat.chargedCooldowns.active('ba1Clone')) {
      tick(CHARGE);
      assert.ok(d.clones.length <= 1);
    }
    assert.equal(d.clones.length, 0);
  }
  assert.equal(logs.size, 3);
  for (const [c, log] of logs) {
    assert.deepEqual(order(log.filter((s) => s.phase === 'appear').map((s) => s.cloud)), CLOUD);
    assert.deepEqual(order(log.map((s) => s.body)), BA1_FRAMES);
    assert.deepEqual(order(log.filter((s) => s.phase === 'vanish').map((s) => s.cloud)), [...CLOUD].reverse());
    assert.equal(log.filter((s) => s.phase === 'appear').length, CLOUD_STEPS, 'a full pass each');
    assert.equal(log.filter((s) => s.phase === 'vanish').length, CLOUD_STEPS);
    assert.equal(c.alive, false);
  }
  assert.ok(d.events.filter((e) => e.summon).length >= 1);
  assert.ok(d.events.filter((e) => e.summon).every((e) => e.attacker === d.attacker));
});

test('a clone is not a fighter: no Launch Point, controller, pushbox or hurtboxes', () => {
  const d = duel();
  const clone = summon(d);
  assert.equal(clone instanceof Fighter, false);
  for (const key of ['launchPoint', 'combat', 'controller', 'body', 'pushbox', 'hurtboxes', 'jumpBuffer', 'coyote', 'label', 'slot']) {
    assert.equal(key in clone, false, `no ${key}`);
  }
  // Only fighters are ever hit: the target punching through the clone's
  // spot hits nothing.
  d.target.opponent = null;
  d.target.facing = 1;
  d.tick(CHARGE, BA1);
  d.until(() => !d.target.combat.attack);
  assert.ok(d.events.every((e) => e.target !== clone));
});

// ---- Training CPU ---------------------------------------------------------------

test('the training CPU never charges, summons or attacks, and starts no cooldown of its own', () => {
  const cpu = new TrainingAIController({ rng: () => 0.3 });
  const d = duel({ gap: 200 });
  for (let i = 0; i < steps(12); i++) {
    const out = cpu.getInput(d.target, DT, SIM_CTX);
    for (const k of ['charge', 'chargePressed', 'action1Pressed', 'action2Pressed', 'primaryPressed', 'specialPressed', 'defensePressed']) {
      assert.equal(out[k], false, k);
    }
    d.tick(i % 90 === 45 ? CHARGED_BA1 : CHARGE, out);
    assert.equal(d.target.summons.length, 0);
    assert.notEqual(d.target.state, 'charge');
    assert.equal(d.target.combat.attack, null);
    assert.equal(d.target.combat.chargedCooldowns.size, 0);
  }
  assert.ok(d.events.some((e) => e.summon), 'the player\'s clones did reach it');
  assert.ok(d.clones.every((c) => c.owner === d.attacker));
});

// ---- Battle -----------------------------------------------------------------------

// A real Battle with scripted Player 1 input. Stage themes build Path2D art,
// which Node lacks, so a do-nothing stand-in takes its place.
function realBattle(mapId = 'desert') {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  return import('../js/game/battle.js').then(({ Battle }) => {
    const sprites = fakeSprites();
    const script = { held: {}, once: {} };
    const input = {
      flush() {},
      sample() {
        const out = { ...script.held, ...script.once };
        script.once = {};
        return out;
      },
    };
    const battle = new Battle({
      canvas: { getContext: () => ({}) }, map: getMap(mapId), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input,
    });
    return { battle, script, sprites };
  });
}

test('Battle summons, owns and drops clones; restart and rematch clear them and every cooldown', async () => {
  const { battle, script } = await realBattle();
  battle.setPhase('fight');
  script.held = CHARGE;
  battle.update(DT);
  script.once = BA1;
  battle.update(DT);
  assert.equal(battle.clones.length, 1);
  assert.equal(name(battle.clones[0].cloudFrame), CLOUD[0], 'spawned on cloud frame 1 in the same step');
  assert.equal(battle.p1.combat.chargedCooldowns.remaining('ba1Clone'), 5);
  assert.equal(battle.p1.state, 'charge');
  assert.deepEqual(battle.fighters, [battle.p1, battle.p2], 'never a fighter');
  battle.update(DT);
  script.once = BA1;
  battle.update(DT);
  assert.equal(battle.clones.length, 1, 'still cooling down: no second clone');
  assert.equal(battle.p2.combat.chargedCooldowns.size, 0);

  battle.restart();
  assert.equal(battle.clones.length, 0, 'no clone survives a rematch');
  assert.equal(battle.p1.combat.chargedCooldowns.size, 0, 'a rematch starts with every cooldown ready');
  assert.equal(battle.p2.combat.chargedCooldowns.size, 0);
  assert.deepEqual(battle.p1.summons, []);
  for (let i = 0; i < 30; i++) battle.update(DT);
  assert.equal(battle.clones.length, 0, 'intro locks input: nothing is summoned');

  // A clone left to run its course is dropped by the battle.
  battle.setPhase('fight');
  script.held = CHARGE;
  battle.update(DT);
  script.once = BA1;
  battle.update(DT);
  const [clone] = battle.clones;
  let n = 0;
  while (battle.clones.length && n++ < 600) battle.update(DT);
  assert.equal(battle.clones.length, 0);
  assert.equal(clone.alive, false);
  const freeze = clone.hasHit ? Math.ceil(ATTACK.hitstop / DT) : 0;
  assert.equal(n, CLOUD_STEPS + BA1_STEPS + freeze + CLOUD_STEPS, 'appear, BA1, vanish, then dropped');

  // Still cooling down, then ready again.
  script.once = BA1;
  battle.update(DT);
  assert.equal(battle.clones.length, 0);
  while (battle.p1.combat.chargedCooldowns.active('ba1Clone')) battle.update(DT);
  script.once = BA1;
  battle.update(DT);
  assert.equal(battle.clones.length, 1);
  battle.destroy();
  assert.deepEqual(battle.clones, []);
  assert.deepEqual(battle.fighters, []);
});

test('Battle draws clones behind both fighters, with no shadow, ring or name tag, and never mirrors the cloud', async () => {
  const { battle, script, sprites } = await realBattle();
  // Give every frame something drawable that says which frame it is.
  const tag = (anims) => {
    for (const anim of Object.values(anims)) {
      for (const f of anim.frames) Object.assign(f, { canvas: { id: name(f) }, artW: 10, artH: 20, anchorArtX: 5, anchorArtY: 10 });
    }
  };
  tag(sprites.animations);
  tag(sprites.effects);
  const calls = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => {
      calls.push([k, ...args]);
      return { width: 10 };
    }),
    set: () => true,
  });
  battle.ctx = ctx;
  battle.theme = { prepare() {}, drawBackground() {}, drawTerrain() {}, drawForeground() {}, drawVoid() {}, update() {}, shadow: { alpha: 0.3, skew: 0, stretch: 1 } };
  Object.assign(battle.view, { ctx, pxW: 1280, pxH: 720, scale: 1, x: 1300, y: 400, w: 1280, h: 720 });
  battle.pxPerArt = 2;

  battle.setPhase('fight');
  script.held = CHARGE;
  battle.update(DT);
  script.once = BA1;
  battle.update(DT);
  battle.p2.controller = null;
  const clone = battle.clones[0];
  const draws = () => {
    calls.length = 0;
    battle.render();
    return calls.filter((c) => c[0] === 'drawImage').map((c) => c[1].id);
  };
  // Whether the drawImage of `id` sits inside a save() ... scale(-1, 1).
  const mirrored = (id) => {
    const at = calls.findIndex((c) => c[0] === 'drawImage' && c[1].id === id);
    const from = calls.slice(0, at).map((c) => c[0]).lastIndexOf('save');
    return calls.slice(from, at).some((c) => c[0] === 'scale' && c[1] === -1);
  };
  // Appearing: the cloud, then P2, then P1.
  let drawn = draws();
  assert.equal(drawn.length, 3);
  assert.equal(drawn[0], CLOUD[0]);
  assert.equal(clone.facing, -1);
  assert.equal(mirrored(CLOUD[0]), false, 'the cloud is never mirrored');
  // Two shadows + rings and two name tags: none for the clone (the other
  // text is the summoner's CAB1 cooldown, see fighter-status.test.mjs).
  const nameTags = () => calls.filter((c) => c[0] === 'fillText' && ['P1', 'CPU'].includes(c[1])).length;
  assert.equal(nameTags(), 2);
  assert.deepEqual(
    calls.filter((c) => c[0] === 'fillText' && /^CAB[12]$/.test(c[1])).map((c) => c[1]), ['CAB1'],
    'only P1\'s CAB1, cooling down: nothing for its ready CAB2, the CPU or the clone',
  );
  assert.equal(calls.filter((c) => c[0] === 'ellipse').length, 4);

  while (clone.phase !== 'attack') battle.update(DT);
  drawn = draws();
  assert.equal(drawn.length, 3);
  assert.equal(drawn[0], '0001_1ba1.png', 'the clone body first, behind the fighters');
  // Facing left, right-facing art: mirrored like the fighters' own frames.
  assert.equal(mirrored('0001_1ba1.png'), true);
  assert.equal(nameTags(), 2);

  // Debug: the clone's hitbox is drawn (and labelled) only while active.
  battle.debug = true;
  const labels = () => {
    calls.length = 0;
    battle.render();
    return calls.filter((c) => c[0] === 'fillText').map((c) => c[1]).filter((t) => /^clone /.test(t));
  };
  assert.deepEqual(labels(), []);
  while (!clone.activeBox()) battle.update(DT);
  assert.deepEqual(labels(), ['clone ba1']);
  while (clone.phase !== 'vanish') battle.update(DT);
  assert.deepEqual(labels(), []);
});
