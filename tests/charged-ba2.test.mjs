// Run with node --test tests/charged-ba2.test.mjs (no dependencies).
// #0001's Charged BA2, the Sphere Rush: the rasen / prasen artwork and its
// registration, typed charged actions, the Charge-then-BA2 trigger and its
// fallbacks, the form -> dash -> confirm -> wait -> explode sequence, the
// two hits, the bind on the opponent, ground dependency, interruption,
// Dodge, Block, walls, facing, Energy, reset / destroy and rendering. Uses
// the real Fighter, CombatState, CombatSystem, ChargedTechnique, physics,
// SpriteSet and Battle (see fighter-harness.mjs); sprite sets carry clip
// metadata only, so scale, anchoring and paint were checked in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterFramePaths } from '../js/data/characters.js';
import { getMap } from '../js/data/maps.js';
import { CombatSystem } from '../js/game/combat.js';
import { ChargedTechnique } from '../js/game/charged-technique.js';
import { StageCollision } from '../js/game/physics.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { TrainingAIController } from '../js/game/fighter-controller.js';
import {
  def, DT, BASE, SIM_CTX, fakeSprites, makeFighter, frameName, steps, duel,
} from './fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CHARGE = { charge: true };
const BA1 = { action1: true, action1Pressed: true };
const BA2 = { action2: true, action2Pressed: true };
const THROW = { primary: true, primaryPressed: true };
const JUMP = { jump: true, jumpPressed: true };
const DEFENSE = { defense: true, defensePressed: true };
const CHARGED_BA1 = { ...CHARGE, ...BA1 };
const CHARGED_BA2 = { ...CHARGE, ...BA2 };

const TECH = def.chargedTechniques.rasenRush;
const RASEN = Array.from({ length: 12 }, (_, i) => `0001_rasen${i + 1}.png`);
const PRASEN = Array.from({ length: 11 }, (_, i) => `0001_prasen${i + 1}.png`);
const NEW_FILES = [...RASEN, ...PRASEN];
// Fixed steps: the form phase (the 6-frame sphere build at 12 fps), the dash
// (the 3 rasenDash frames at 12 fps) and the delay from hit to explosion.
const FORM_STEPS = steps(6 / 12);
const DASH_STEPS = steps(3 / 12);
const DELAY_STEPS = steps(TECH.explosionDelay);

// The uploaded PNGs, byte for byte.
const SHA256 = {
  '0001_rasen1.png': '02fd3e02b89d3aa5770c5a4da092879cfe86557e55ca228aff96b1442605ad86',
  '0001_rasen2.png': 'bbf73065624d62456fc7f4b24564ac597e9461df9c4516c6e28130ce2116a231',
  '0001_rasen3.png': 'f7087a7baf7cbb764362c3a272ea0907fe38fea697db305109d4c0175b6a869d',
  '0001_rasen4.png': '217e109fce593ce929bd78b9969598c0944c584a29536234e297979f87b99597',
  '0001_rasen5.png': '5767f1bb9635353558b0aa8578a746ad751727aee8c90502f4204a257c79c8e3',
  '0001_rasen6.png': 'cb1e299484a8bb282980fb7a03b14a0e6e3a48d93a4ae10b260cfa3ea767ea38',
  '0001_rasen7.png': '7e40c73d98ab47d1a903087c747cdb9a39c1a78c2ba3bd7e19ff8f27a179e277',
  '0001_rasen8.png': '3177859faadb7404c081a0c9794b681fc0b5e53666592a88d432d1668bb4292d',
  '0001_rasen9.png': 'a763576c3917cd327235a6edf2c573b27fcfc7de15bd63df6d19e2c69787755d',
  '0001_rasen10.png': 'eed685e6d3b2852d37e3880af8a3e701da6fc784aeb6e8101caa329b2e38790b',
  '0001_rasen11.png': 'aa2dad10f908c3d747456ee481d581a1d643a945a78f939030cbb671c121ac17',
  '0001_rasen12.png': '3da52cfbe31807c1212e5b0d3f0edff441b847c8a85470ffe78eb06a042fb9dd',
  '0001_prasen1.png': '2fd1f0df389fec58ae473f6d94e841d66acbe886126174062bb7c7c2da91620d',
  '0001_prasen2.png': '4b349f627d0021a6e83501c69f8a240d1e70823ad43c412cce75b2923475261b',
  '0001_prasen3.png': 'cbf9e6571a8e432e966ab0276ccdcda97bee1819cd8e5f66ec3e8d6d616f6a16',
  '0001_prasen4.png': '68e05ef55ff2aab85ddaa663547493bb1ad192405ed062fd7948be5df2c406f9',
  '0001_prasen5.png': '854716f15b93938b7d0bd6b6a517ed83588f7a95b1e2d32f474b852d6dba9c75',
  '0001_prasen6.png': 'aa1ef656e958ccc328f461bca4d35b512a666bc070f9f7b7f24f5c36a86a4b81',
  '0001_prasen7.png': '3a6497f5ed16cc5c442ea42d11e381af9de2d91f439ccb07c0add2f30b773b71',
  '0001_prasen8.png': 'aa06ea1d54f50b6959f42e16f043951f92bc1d370d1e3070530e998e9ac439b4',
  '0001_prasen9.png': '38b417dd6c9b3b46079f1c823911f6d0767c548f5eee9cc96ecf87ff24bce07d',
  '0001_prasen10.png': 'dd86e89d11e447e842a2fd964b2804ac5a7c97d2e0c104361ebfd81f2286259e',
  '0001_prasen11.png': '125e44712106e29110493677ff694191ffb4dcbfd0e667f6c393f520c231b174',
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
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

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

// One step of the owner's technique, as seen after the step.
function snap(f) {
  const t = f.technique;
  return {
    state: f.state, frame: frameName(f), phase: t?.phase ?? null, sphere: name(t?.sphereFrame),
    sphereOwner: t?.sphereOwner ?? null, x: f.body.x, vx: f.body.vx, grounded: f.grounded, facing: f.facing,
  };
}

// Enters Charge, then (already charging, Charge still held) presses BA2.
// Returns the technique started that step.
function start(d, targetHeld = {}) {
  d.tick(CHARGE, targetHeld);
  assert.equal(d.attacker.state, 'charge');
  d.tick(CHARGED_BA2, targetHeld);
  assert.ok(d.attacker.technique, 'the Sphere Rush started');
  return d.attacker.technique;
}

// Ticks (owner input `held`, target input `targetHeld`) until the technique
// reaches `phase` or ends, logging every step; fails instead of hanging.
function runUntil(d, pred, held = () => ({}), targetHeld = () => ({}), limit = 600) {
  const log = [];
  for (let i = 0; !pred(); i++) {
    assert.ok(i < limit, 'condition never reached');
    d.tick(held(i), targetHeld(i));
    log.push(snap(d.attacker));
  }
  return log;
}

// A duel in which the sphere connects: the opponent stands 140 in front and
// pushboxes keep the two apart, as in Battle.update().
const hitDuel = (opts = {}) => duel({ gap: 140, pushboxes: true, ...opts });

// Runs a Sphere Rush in `d` up to its first hit, returning the technique.
function hitConfirm(d, targetHeld = () => ({})) {
  const t = start(d);
  runUntil(d, () => t.phase !== 'form' && t.phase !== 'dash', () => ({}), targetHeld);
  assert.equal(t.phase, 'confirm', `the rush connected (${t.endReason ?? t.phase})`);
  return t;
}

// A private stage (never the shared one), for ledges and walls.
const stageWith = ({ platforms = [], solids = [], left = 0, right = 2000 } = {}) =>
  new StageCollision({ groundLevel: 800, bounds: { left, right }, platforms, solids });

// Stands a fighter on platform `id` of `stage`.
function standOn(fighter, stage, id) {
  const p = stage.platforms.find((q) => q.id === id);
  Object.assign(fighter.body, { y: p.y, prevY: p.y, vy: 0, grounded: true, ground: p });
  fighter.lastGroundY = p.y;
}

// ---- Artwork ----------------------------------------------------------------------

test('the twelve rasen and eleven prasen frames live only in the canonical #0001 folder, unchanged, and preload with #0001', () => {
  const paths = characterFramePaths(def);
  for (const file of NEW_FILES) {
    const url = `./assets/characters/0001/${file}`;
    assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
    assert.ok(!existsSync(ROOT + file), `no root copy of ${file}`);
    const bytes = readFileSync(ROOT + url.slice(2));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), SHA256[file], `${file} bytes are the upload`);
    assert.ok(paths.includes(url), `${url} is preloaded`);
  }
  // Preloaded in frame order, once each, with the rest of the character.
  assert.deepEqual(paths.filter((u) => /\/0001_rasen/.test(u)), RASEN.map((f) => `./assets/characters/0001/${f}`));
  assert.deepEqual(paths.filter((u) => /\/0001_prasen/.test(u)), PRASEN.map((f) => `./assets/characters/0001/${f}`));
  const dir = readdirSync(`${ROOT}assets/characters/0001/`);
  assert.deepEqual(dir.filter((n) => /rasen/.test(n)).sort(), [...NEW_FILES].sort(), 'exactly the 23, no duplicates');
  assert.deepEqual(readdirSync(ROOT).filter((n) => /rasen/i.test(n)), [], 'none left at the repository root');
});

test('rasen1-12 are three one-shot fighter clips: rasenForm 1-3, rasenDash 4-6, rasenConfirm 7-12', () => {
  const clip = (key) => def.animations[key].frames.map((u) => u.split('/').pop());
  assert.deepEqual(clip('rasenForm'), RASEN.slice(0, 3));
  assert.deepEqual(clip('rasenDash'), RASEN.slice(3, 6));
  assert.deepEqual(clip('rasenConfirm'), RASEN.slice(6, 12));
  for (const key of ['rasenForm', 'rasenDash', 'rasenConfirm']) {
    const anim = def.animations[key];
    assert.equal(anim.loop, false, `${key} plays once`);
    assert.equal(anim.fps, 12);
    // Fighter poses: they inherit #0001's right-facing art direction.
    assert.equal(anim.sourceFacing, undefined, `${key} inherits the character's sourceFacing`);
    assert.equal(fakeSprites().animations[key].sourceFacing, 1);
    assert.equal(def.effectAnimations[key], undefined);
    assert.equal(def.projectileAnimations[key], undefined);
  }
  // Each pose once, in exactly one clip; no fallback fakes them.
  const all = Object.values(def.animations).flatMap((a) => a.frames).filter((u) => /rasen/.test(u));
  assert.equal(all.length, 12);
  for (const key of ['rasenForm', 'rasenDash', 'rasenConfirm']) assert.equal(def.animationFallbacks[key], undefined);
});

test('prasen1-11 are three one-shot, direction-neutral sphere effects: build 1-6, impact 7-9, explosion 10-11', () => {
  const clip = (key) => def.effectAnimations[key].frames.map((u) => u.split('/').pop());
  assert.deepEqual(clip('rasenSphereBuild'), PRASEN.slice(0, 6));
  assert.deepEqual(clip('rasenSphereImpact'), PRASEN.slice(6, 9));
  assert.deepEqual(clip('rasenSphereExplosion'), PRASEN.slice(9, 11));
  for (const key of ['rasenSphereBuild', 'rasenSphereImpact', 'rasenSphereExplosion']) {
    const anim = def.effectAnimations[key];
    assert.equal(anim.loop, false, `${key} plays once`);
    assert.equal(anim.fps, 12);
    assert.equal(anim.sourceFacing, 0, 'a round effect: never mirrored');
    assert.equal(anim.heightRatio, undefined, 'never fitted to the fighter height');
    assert.equal(def.animations[key], undefined, 'not a fighter pose');
    assert.equal(def.projectileAnimations[key], undefined, 'not a projectile');
  }
  // Formation 0.5 s, impact 0.25 s, explosion about 0.167 s.
  const pass = (key) => def.effectAnimations[key].frames.length / def.effectAnimations[key].fps;
  assert.ok(close(pass('rasenSphereBuild'), 0.5));
  assert.ok(close(pass('rasenSphereImpact'), 0.25));
  assert.ok(close(pass('rasenSphereExplosion'), 1 / 6));
  assert.equal(def.projectiles.rasenRush, undefined);
  assert.equal(def.summons.rasenRush, undefined);
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

// Just enough canvas for the normalizer (see clone.test.mjs).
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

test('SpriteSet normalizes rasen as fighter poses and prasen as effects at their own art size', () => {
  // The real frame sizes, read from the PNG headers; in the browser every
  // rasen and prasen frame detects as 2 source pixels per art pixel.
  const size = (file) => {
    const png = readFileSync(`${ROOT}assets/characters/0001/${file}`);
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  const set = withFakeCanvas(() => {
    const images = new Map([[`${BASE}idle1.png`, blockImage(35, 52, 16)]]);
    for (const file of NEW_FILES) {
      const [w, h] = size(file);
      images.set(`${BASE}${file.slice(5)}`, blockImage(w / 2, h / 2, 2));
    }
    const pick = (anims, keys) => Object.fromEntries(keys.map((k) => [k, anims[k]]));
    const character = {
      ...def,
      animations: {
        idle: { frames: [`${BASE}idle1.png`], fps: 7, loop: true },
        ...pick(def.animations, ['rasenForm', 'rasenDash', 'rasenConfirm']),
      },
      projectileAnimations: {},
      effectAnimations: pick(def.effectAnimations, ['rasenSphereBuild', 'rasenSphereImpact', 'rasenSphereExplosion']),
    };
    return SpriteSet.build(character, (url) => images.get(url));
  });
  assert.deepEqual(set.missing, []);
  for (const key of ['rasenForm', 'rasenDash', 'rasenConfirm']) {
    const anim = set.animations[key];
    assert.ok(set.has(key), `${key} is a fighter animation`);
    assert.equal(anim.sourceFacing, 1);
    for (const f of anim.frames) {
      const [w, h] = size(name(f));
      // One art pixel per fighter art pixel, bottom-centre (torso) anchored.
      assert.equal(f.artW, w / 2);
      assert.equal(f.artH, h / 2);
      assert.equal(f.anchorArtY, undefined, 'bottom-anchored, not centred');
    }
  }
  for (const key of ['rasenSphereBuild', 'rasenSphereImpact', 'rasenSphereExplosion']) {
    const anim = set.effect(key);
    assert.ok(anim, `${key} is an effect`);
    assert.equal(set.has(key), false);
    assert.equal(anim.sourceFacing, 0);
    for (const f of anim.frames) {
      const [w, h] = size(name(f));
      assert.equal(f.artW, w / 2, 'its own art size');
      assert.equal(f.anchorArtX, f.artW / 2, 'centre-anchored');
      assert.equal(f.anchorArtY, f.artH / 2);
    }
  }
  // The complete sphere (prasen6) is 38 x 41 art pixels: about 64 x 69
  // world units at #0001's scale, whatever the fighter's height.
  const full = set.effect('rasenSphereBuild').frames[5];
  assert.deepEqual([full.artW, full.artH], [38, 41]);
  assert.ok(Math.abs(full.artW * set.worldPerArt - 64.3) < 0.1);
});

// ---- Data -------------------------------------------------------------------------

test('charged actions are typed: Charged BA1 is the Clone summon, Charged BA2 the Sphere Rush technique', () => {
  assert.deepEqual(def.chargedActions, {
    action1: { type: 'summon', id: 'ba1Clone' },
    action2: { type: 'technique', id: 'rasenRush' },
  });
  // The normal buttons are untouched.
  assert.deepEqual(def.actions.action2, { ground: 'ba2', air: 'midairBa2' });
  assert.deepEqual(def.actions.action1, { ground: 'ba1', air: 'midairBa1' });
  // The Sphere Rush is its own data: not an attack, summon or projectile.
  assert.equal(def.attacks.rasenRush, undefined);
  assert.equal(def.summons.rasenRush, undefined);
  assert.equal(def.projectiles.rasenRush, undefined);
  const { fighter } = makeFighter();
  assert.ok(fighter.techniqueDefs.rasenRush);
  assert.ok(Object.isFrozen(fighter.techniqueDefs.rasenRush));
  assert.deepEqual(Object.keys(fighter.summonDefs), ['ba1Clone']);
});

test('the Sphere Rush data: 1050 dash, 4 + 16 = 20 damage, 2.0 s delay, no Energy cost, and normal BA2 is unchanged', () => {
  assert.equal(TECH.formAnimation, 'rasenForm');
  assert.equal(TECH.dashAnimation, 'rasenDash');
  assert.equal(TECH.confirmAnimation, 'rasenConfirm');
  assert.equal(TECH.sphereBuild, 'rasenSphereBuild');
  assert.equal(TECH.sphereImpact, 'rasenSphereImpact');
  assert.equal(TECH.sphereExplosion, 'rasenSphereExplosion');
  assert.equal(TECH.dashSpeed, 1050);
  assert.equal(TECH.explosionDelay, 2.0);
  assert.equal(TECH.energyCost, 0);
  assert.equal(TECH.firstHit.damage, 4);
  assert.deepEqual(TECH.firstHit.knockback, { x: 0, y: 0 }, 'the setup never launches');
  assert.equal(TECH.explosionHit.damage, 16);
  assert.equal(TECH.firstHit.damage + TECH.explosionHit.damage, 20);
  assert.deepEqual(TECH.explosionHit.knockback, { x: 420, y: 220 });
  assert.equal(TECH.explosionHit.hitstun, 0.55);
  assert.ok(TECH.explosionHit.hitstop > TECH.firstHit.hitstop);
  // A hand offset for every frame the sphere is held through, and a box
  // centred on the sphere.
  assert.equal(TECH.handOffsets.rasenForm.length, 3);
  assert.equal(TECH.handOffsets.rasenDash.length, 3);
  const box = TECH.sphereHitbox;
  assert.equal(box.x, -box.w / 2);
  assert.equal(box.y, -box.h / 2);
  assert.deepEqual(TECH.targetOffset, { x: 0, y: -48 });
  // Normal BA2 keeps its own data (its launch is its own High vertical
  // Knockback, not the explosion's knockback).
  assert.deepEqual(
    { ...def.attacks.ba2 },
    {
      animation: 'ba2', startup: 3 / 12, active: 2 / 12, recovery: 2 / 12, damage: 8,
      hitbox: { x: 10, y: -88, w: 24, h: 78 }, knockback: { axis: 'vertical', level: 'high' },
      hitstun: 0.24, blockstun: 0.15, hitstop: 0.07, cooldown: 0.15, groundOnly: true,
    },
  );
});

// ---- Trigger ----------------------------------------------------------------------

test('Charge, then BA2 while still charging: the Sphere Rush starts on rasen1 and prasen1, out of Charge, costing nothing', () => {
  const d = duel({ gap: 600 });
  d.tick(CHARGE);
  assert.equal(d.attacker.state, 'charge');
  d.tick(CHARGED_BA2);
  const t = d.attacker.technique;
  assert.ok(t instanceof ChargedTechnique);
  assert.equal(t.def.id, 'rasenRush');
  assert.equal(t.phase, 'form');
  assert.equal(d.attacker.state, 'technique');
  assert.equal(d.attacker.charging, false, 'left Charge');
  assert.equal(d.attacker.combat.attack, null, 'not an attack: no ordinary BA2');
  assert.equal(d.attacker.combat.cooldowns.size, 0);
  assert.equal(d.attacker.animator.anim.key, 'rasenForm');
  assert.equal(frameName(d.attacker), '0001_rasen1.png');
  assert.equal(name(t.sphereFrame), '0001_prasen1.png');
  assert.equal(t.sphereOwner, 'fighter');
  assert.equal(d.attacker.combat.energy, 100);
  assert.equal(d.attacker.combat.lastIntent, 'action2');
  assert.deepEqual(d.clones, []);
  assert.deepEqual(d.projectiles, []);
  assert.deepEqual(d.events, []);
  assert.equal(d.attacker.canAct(), false, 'the technique owns the fighter');

  // Holding BA2 (no new press) never restarts it.
  d.tick({ ...CHARGE, action2: true });
  assert.equal(d.attacker.technique, t);
  assert.equal(frameName(d.attacker), '0001_rasen1.png');
});

test('Charge and BA2 pressed together from idle is an ordinary BA2', () => {
  const d = duel();
  d.tick({ ...CHARGE, chargePressed: true, ...BA2 });
  assert.equal(d.attacker.technique, null);
  assert.equal(d.attacker.state, 'attack');
  assert.equal(d.attacker.combat.attack.def.id, 'ba2');
  assert.equal(frameName(d.attacker), '0001_2ba1.png');
  d.until(() => d.events.length > 0);
  assert.equal(d.events[0].damage, 8);
  assert.equal(d.events[0].technique, null);
  assert.equal(d.attacker.combat.energy, 100);
});

test('letting go of Charge on the BA2 step is an ordinary BA2: no technique, no release pose, no Energy', () => {
  const d = duel();
  for (let i = 0; i < 20; i++) d.tick(CHARGE);
  assert.equal(d.attacker.animator.anim.key, 'chargeLoop');
  d.tick(BA2); // charge: false with action2Pressed: true
  assert.equal(d.attacker.technique, null);
  assert.equal(d.attacker.combat.attack.def.id, 'ba2');
  assert.equal(frameName(d.attacker), '0001_2ba1.png', 'straight into BA2');
  const states = [];
  while (d.attacker.state === 'attack') {
    d.tick();
    states.push(d.attacker.state);
  }
  assert.ok(!states.includes('chargeRelease'), states.join());
  assert.ok(!states.includes('technique'));
  assert.equal(d.attacker.combat.energy, 100);
});

// ---- Formation --------------------------------------------------------------------

test('the sphere forms prasen1 -> prasen6 in the hand while #0001 stands on rasen1 -> rasen3; only then does he dash', () => {
  const d = duel({ gap: 900 });
  const t = start(d);
  const log = [snap(d.attacker)];
  // Charge let go straight away: the technique carries on without it.
  log.push(...runUntil(d, () => t.phase !== 'form'));
  const form = log.filter((s) => s.phase === 'form');
  const first = log.find((s) => s.phase === 'dash');
  assert.equal(form.length, FORM_STEPS, 'formation lasts one pass of the build (0.5 s)');
  assert.deepEqual(order(form.map((s) => s.sphere)), PRASEN.slice(0, 6), 'the build plays once, in order');
  assert.deepEqual(order(form.map((s) => s.frame)), RASEN.slice(0, 3), 'the poses play once, in order');
  // rasen3 is held (never looped back) until the sphere is complete, and the
  // complete prasen6 is on screen before the dash.
  assert.deepEqual(runs(form.map((s) => s.frame)).map(([f]) => f), RASEN.slice(0, 3));
  assert.equal(form.at(-1).sphere, '0001_prasen6.png');
  assert.equal(form.at(-1).frame, '0001_rasen3.png');
  // Poses and sphere change on the same steps.
  const frameSteps = steps(1 / 12);
  assert.deepEqual(runs(form.map((s) => s.sphere)).map(([, n]) => n), [frameSteps - 1, 5, 5, 5, 5, frameSteps + 1]);
  assert.deepEqual(runs(form.map((s) => s.frame)).map(([, n]) => n), [frameSteps - 1, 5, FORM_STEPS - 9]);
  // No movement at all while forming: #0001 stands still, facing locked.
  assert.ok(form.every((s) => s.x === 500 && s.vx === 0 && s.grounded && s.facing === 1));
  assert.ok(form.every((s) => s.state === 'technique' && s.sphereOwner === 'fighter'));
  // The dash starts on the next step, sphere still complete.
  assert.equal(first.frame, '0001_rasen4.png');
  assert.equal(first.sphere, '0001_prasen6.png');
  assert.ok(first.x > 500);
});

test('the sphere sits in the hand: its centre follows the hand offset of the pose on screen, mirrored with facing', () => {
  for (const facing of [1, -1]) {
    const d = duel({ gap: 900, attackerFacing: facing });
    const t = start(d);
    const seen = new Set();
    runUntil(d, () => !d.attacker.technique || d.attacker.technique.phase === 'confirm', () => ({}), () => ({}));
    // Replay with checks at every step.
    const e = duel({ gap: 900, attackerFacing: facing });
    const u = start(e);
    for (let i = 0; e.attacker.technique && i < 100; i++) {
      const clip = e.attacker.animator.anim.key;
      const offsets = TECH.handOffsets[clip];
      const o = offsets[e.attacker.animator.index];
      const [cx, cy] = u.sphereCenter();
      assert.ok(close(cx, e.attacker.body.x + o.x * facing), `${clip} ${e.attacker.animator.index} x`);
      assert.ok(close(cy, e.attacker.body.y + o.y), `${clip} y`);
      seen.add(`${clip}:${e.attacker.animator.index}`);
      e.tick();
    }
    assert.equal(t.endReason, 'miss');
    assert.deepEqual([...seen].sort(), ['rasenDash:0', 'rasenDash:1', 'rasenDash:2', 'rasenForm:0', 'rasenForm:1', 'rasenForm:2']);
  }
  // Held in the rear palm while forming and dashing, then swung in front on
  // rasen6; always at hand height, never at the feet.
  for (const [clip, list] of Object.entries(TECH.handOffsets)) {
    list.forEach((o, i) => {
      assert.ok(o.y < -35 && o.y > -60, `${clip}[${i}] at hand height`);
      assert.ok(Math.abs(o.x) > 10 && Math.abs(o.x) < 45, `${clip}[${i}] at arm's length`);
    });
  }
  assert.ok(TECH.handOffsets.rasenDash[2].x > 0, 'swung forward on rasen6');
});

// ---- Dash -------------------------------------------------------------------------

test('the dash: rasen4 -> rasen6 at a fixed 1050 in the locked facing, the complete sphere in hand, whatever is pressed', () => {
  for (const facing of [1, -1]) {
    const d = duel({ gap: 900, attackerFacing: facing });
    const t = start(d);
    runUntil(d, () => t.phase === 'dash');
    const log = [snap(d.attacker)];
    const noise = [{ left: true }, { right: true }, JUMP, DEFENSE, BA1, THROW, CHARGED_BA1, { right: true, left: false }];
    log.push(...runUntil(d, () => !d.attacker.technique, (i) => noise[i % noise.length]));
    const dash = log.filter((s) => s.phase === 'dash');
    assert.equal(dash.length, DASH_STEPS, 'one pass of rasenDash (0.25 s)');
    assert.deepEqual(order(dash.map((s) => s.frame)), RASEN.slice(3, 6));
    assert.ok(dash.every((s) => s.sphere === '0001_prasen6.png'), 'the complete sphere, never rebuilt');
    assert.ok(dash.every((s) => s.vx === 1050 * facing && s.facing === facing && s.grounded));
    for (let i = 1; i < dash.length; i++) assert.ok(close(dash[i].x - dash[i - 1].x, 1050 * facing * DT));
    // About 262 world units: a committed rush, stepped, never a teleport.
    assert.ok(close(Math.abs(dash.at(-1).x - 500), 1050 * DASH_STEPS * DT));
    assert.ok(Math.abs(Math.abs(dash.at(-1).x - 500) - 262.5) < 1e-6);
    assert.equal(d.attacker.combat.attack, null);
    assert.equal(d.attacker.combat.defenseAction, null);
    assert.deepEqual(d.clones, []);
    assert.deepEqual(d.projectiles, []);
  }
});

// ---- Miss -------------------------------------------------------------------------

test('a clean miss: no hit, bind, rasen7-12 or prasen7-11; the sphere is gone and #0001 is idle at once', () => {
  const d = duel({ gap: 800, pushboxes: true });
  const t = start(d);
  const log = [snap(d.attacker), ...runUntil(d, () => !d.attacker.technique)];
  assert.equal(t.endReason, 'miss');
  assert.equal(t.phase, 'done');
  assert.equal(t.sphereFrame, null, 'no sphere left');
  assert.equal(log.length, 1 + FORM_STEPS + DASH_STEPS, 'form, dash, then over on the next step');
  const shown = log.map((s) => s.frame);
  assert.ok(!shown.some((f) => RASEN.slice(6).includes(f)), 'no confirm frames');
  assert.ok(!log.some((s) => PRASEN.slice(6).includes(s.sphere)), 'no impact or explosion frames');
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.health, 100);
  assert.equal(d.target.combat.immobilized, false);
  // Straight back to normal: idle, no slide, no recovery sequence.
  assert.equal(d.attacker.state, 'idle');
  assert.equal(d.attacker.body.vx, 0);
  const x = d.attacker.body.x;
  d.tick();
  assert.equal(d.attacker.body.x, x);
  d.tick({ right: true });
  assert.ok(d.attacker.body.vx > 0, 'free to move again');
  assert.equal(d.attacker.combat.energy, 100);
});

// ---- Hit ---------------------------------------------------------------------------

test('a hit: exactly one contact, 100 -> 96, the rush stops, and the target is bound and still with the sphere on it', () => {
  const d = hitDuel();
  const t = hitConfirm(d);
  assert.equal(d.events.length, 1);
  const [event] = d.events;
  assert.equal(event.type, 'hit');
  assert.equal(event.damage, 4);
  assert.equal(event.attacker, d.attacker);
  assert.equal(event.target, d.target);
  assert.equal(event.technique, t);
  assert.equal(event.summon, null);
  assert.equal(event.projectile, null);
  assert.equal(d.target.combat.health, 96);
  // Contact on the swing, the complete sphere meeting the target.
  assert.equal(t.firstHitDone, true);
  assert.equal(t.hitConfirmed, true);
  assert.equal(t.target, d.target);
  assert.equal(d.attacker.body.vx, 0, 'the rush stops at once');
  assert.equal(d.target.body.vx, 0);
  assert.equal(d.target.grounded, true, 'no launch on the first hit');
  assert.equal(d.target.combat.immobilized, true);
  assert.equal(d.target.combat.isBoundBy(t), true);
  assert.equal(d.target.combat.hitstop, TECH.firstHit.hitstop);
  assert.equal(d.attacker.combat.hitstop, 0, 'the technique\'s hits freeze only the target');
  // The confirm sequence starts on the hit step, sphere on the target.
  assert.equal(t.phase, 'confirm');
  assert.equal(frameName(d.attacker), '0001_rasen7.png');
  assert.equal(t.sphereOwner, 'target');
  assert.equal(name(t.sphereFrame), '0001_prasen7.png');
  assert.deepEqual(t.sphereCenter(), [d.target.body.x, d.target.body.y - 48]);
  // No more contact checks, no slide through the target.
  const x = d.attacker.body.x;
  for (let i = 0; i < 30; i++) d.tick();
  assert.equal(d.events.length, 1, 'hit 1 happens exactly once');
  assert.equal(d.attacker.body.x, x);
  assert.equal(t.sphereHitbox(), null);
});

test('after the hit #0001 plays rasen7 -> rasen12 once and holds it; the sphere plays prasen7 -> prasen9 and holds it', () => {
  const d = hitDuel();
  const t = hitConfirm(d);
  const log = [snap(d.attacker), ...runUntil(d, () => t.phase === 'explode')];
  const before = log.slice(0, -1);
  assert.equal(before.length, DELAY_STEPS, 'every step from the hit to the explosion');
  assert.deepEqual(order(before.map((s) => s.frame)), RASEN.slice(6, 12), 'exactly rasen7 -> rasen12');
  assert.deepEqual(runs(before.map((s) => s.frame)).slice(0, 5).map(([, n]) => n), [5, 5, 5, 5, 5], 'at 12 fps');
  assert.equal(before.at(-1).frame, '0001_rasen12.png', 'rasen12 held through the wait');
  assert.deepEqual(order(before.map((s) => s.sphere)), PRASEN.slice(6, 9), 'exactly prasen7 -> prasen9, never looped');
  assert.equal(runs(before.map((s) => s.sphere)).at(-1)[1], DELAY_STEPS - 10, 'prasen9 held until the explosion');
  assert.ok(before.every((s) => s.sphereOwner === 'target'));
  assert.deepEqual([...new Set(before.map((s) => s.phase))], ['confirm', 'wait']);
  assert.equal(log.at(-1).frame, '0001_rasen12.png', 'rasen12 still held as it explodes');
});

test('the explosion comes exactly 2.0 s after the hit step: prasen10 -> prasen11, 96 -> 80, target released then launched', () => {
  const d = hitDuel();
  const t = hitConfirm(d);
  // Never early: still bound, one hit, on every step before the 120th.
  for (let i = 1; i < DELAY_STEPS; i++) {
    d.tick();
    assert.notEqual(t.phase, 'explode', `step ${i}`);
    assert.equal(d.target.combat.health, 96);
    assert.equal(d.target.combat.immobilized, true);
  }
  d.tick();
  assert.equal(t.phase, 'explode', 'exactly 2.0 s of fixed steps after the hit step');
  assert.equal(name(t.sphereFrame), '0001_prasen10.png', 'hit 2 lands on the first explosion frame');
  assert.equal(d.events.length, 2);
  const blast = d.events[1];
  assert.equal(blast.type, 'hit');
  assert.equal(blast.damage, 16);
  assert.equal(blast.technique, t);
  assert.equal(d.target.combat.health, 80);
  // Released before the knockback, so the launch is intact.
  assert.equal(d.target.combat.immobilized, false);
  assert.equal(d.target.body.vx, 420);
  assert.equal(d.target.body.vy, -220);
  assert.equal(d.target.grounded, false);
  assert.equal(d.target.combat.stun, 0.55);
  assert.equal(d.target.combat.hitstop, 0.12);
  assert.ok(d.target.combat.hitstop > TECH.firstHit.hitstop);
  // prasen10 -> prasen11 once, then the sphere is gone and #0001 is free.
  const log = [snap(d.attacker), ...runUntil(d, () => !d.attacker.technique)];
  assert.deepEqual(order(log.map((s) => s.sphere)), ['0001_prasen10.png', '0001_prasen11.png']);
  assert.equal(t.endReason, 'done');
  assert.equal(t.sphereFrame, null);
  assert.equal(d.attacker.state, 'idle');
  // The target flies off after its freeze, then lands.
  const x = d.target.body.x;
  d.until(() => d.target.grounded);
  assert.ok(d.target.body.x > x + 20, 'launched away');
  for (let i = 0; i < steps(1); i++) d.tick();
  assert.equal(d.events.length, 2, 'exactly two damage events: contact and explosion');
  assert.equal(d.target.combat.health, 80, '4 + 16 = 20 in all');
});

test('a full Sphere Rush is exactly two damage events and spends no Energy on either side', () => {
  const d = hitDuel();
  start(d);
  const energy = [d.attacker.combat.energy, d.target.combat.energy];
  d.until(() => !d.attacker.technique);
  for (let i = 0; i < steps(1); i++) d.tick();
  assert.deepEqual(d.events.map((e) => [e.type, e.damage]), [['hit', 4], ['hit', 16]]);
  assert.deepEqual([d.attacker.combat.energy, d.target.combat.energy], energy);
  assert.deepEqual(energy, [100, 100]);
  // With no Energy at all it still works: it costs nothing.
  const broke = hitDuel();
  broke.attacker.combat.energy = 0;
  start(broke);
  broke.until(() => !broke.attacker.technique);
  assert.equal(broke.events.length, 2);
  assert.equal(broke.attacker.combat.energy, 0, 'nothing refunded or gained');
});

// ---- Bind --------------------------------------------------------------------------

test('a bound target can neither move, jump, charge, throw, attack, dodge nor turn until it is released', () => {
  const d = hitDuel();
  const t = hitConfirm(d);
  const { target } = d;
  const x = target.body.x;
  const facing = target.facing;
  const presses = [
    { left: true }, { right: true }, JUMP, CHARGE, BA1, BA2, THROW, DEFENSE,
    { ...CHARGE, left: true }, CHARGED_BA1, CHARGED_BA2, { ...DEFENSE, right: true }, { dropPressed: true },
  ];
  for (let i = 0; t.phase !== 'explode'; i++) {
    d.tick({}, presses[i % presses.length]);
    if (t.phase === 'explode') break;
    assert.equal(target.combat.attack, null, `step ${i}`);
    assert.equal(target.combat.defenseAction, null);
    assert.equal(target.charging, false);
    assert.equal(target.technique, null);
    assert.deepEqual(target.summons, []);
    assert.deepEqual(target.releases, []);
    assert.equal(target.body.x, x);
    assert.equal(target.body.vx, 0);
    assert.equal(target.grounded, true);
    assert.equal(target.facing, facing);
    assert.ok(['hitstun', 'bound'].includes(target.state), target.state);
    assert.equal(frameName(target), '0001_hurt.png', 'caught: the hurt pose');
  }
  assert.equal(target.combat.immobilized, false);
  assert.deepEqual(d.clones, []);
  assert.deepEqual(d.projectiles, []);
  assert.equal(target.combat.energy, 100);
  // Released and recovered, it moves again.
  d.until(() => target.combat.stun <= 0 && target.grounded && target.combat.hitstop <= 0);
  const before = target.body.x;
  for (let i = 0; i < 10; i++) d.tick({}, { right: true });
  assert.ok(target.body.x > before);
});

test('the bind is its own status: a token only its technique releases, not a long hitstun', () => {
  const d = hitDuel();
  const t = hitConfirm(d);
  const c = d.target.combat;
  assert.ok(c.stun <= TECH.firstHit.hitstun, 'hitstun stays the first hit\'s own');
  // Another source cannot release it...
  c.unbind({});
  assert.equal(c.immobilized, true);
  // ...and a second hold is not released by this technique's.
  const other = {};
  c.bind(other);
  t.releaseTarget();
  assert.equal(c.immobilized, true);
  assert.equal(c.isBoundBy(t), false);
  c.unbind(other);
  assert.equal(c.immobilized, false);
  // Its bind gone, the technique lets go of the target and ends.
  d.tick();
  assert.equal(d.attacker.technique, null);
  assert.equal(t.endReason, 'released');
  for (let i = 0; i < DELAY_STEPS + 20; i++) d.tick();
  assert.equal(d.events.length, 1, 'no explosion without the bind');
});

test('#0001 stays committed through the wait: no run, attack, clone, Dodge, Throw, Jump or Charge', () => {
  const d = hitDuel();
  const t = hitConfirm(d);
  const x = d.attacker.body.x;
  const presses = [
    { right: true }, { left: true }, JUMP, BA1, BA2, CHARGED_BA1, CHARGED_BA2, THROW, DEFENSE, CHARGE, { ...CHARGE, left: true },
  ];
  for (let i = 0; t.phase !== 'explode'; i++) {
    d.tick(presses[i % presses.length]);
    assert.equal(d.attacker.state, 'technique');
    assert.equal(d.attacker.body.x, x);
    assert.equal(d.attacker.grounded, true);
    assert.equal(d.attacker.charging, false);
    assert.equal(d.attacker.combat.attack, null);
    assert.equal(d.attacker.combat.defenseAction, null);
    assert.equal(d.attacker.facing, 1);
  }
  assert.deepEqual(d.clones, []);
  assert.deepEqual(d.projectiles, []);
  assert.equal(d.attacker.combat.energy, 100);
});

test('once it is over, a Charge still held does not charge again until it is let go and held anew', () => {
  const d = hitDuel();
  start(d);
  d.until(() => !d.attacker.technique);
  // Charge held through all of it (never let go since the press).
  const e = hitDuel();
  start(e);
  for (let i = 0; e.attacker.technique && i < 400; i++) e.tick(CHARGE);
  assert.equal(e.attacker.technique, null);
  for (let i = 0; i < 20; i++) {
    e.tick(CHARGE);
    assert.notEqual(e.attacker.state, 'charge');
    assert.notEqual(e.attacker.state, 'chargeRelease');
  }
  e.tick();
  e.tick(CHARGE);
  assert.equal(e.attacker.state, 'charge', 'a fresh Charge through the normal state machine');
  assert.equal(frameName(e.attacker), '0001_charge1.png');
  // Let go during the technique, a Charge pressed right as it ends charges.
  const f = duel({ gap: 900 });
  start(f);
  while (f.attacker.technique) f.tick();
  f.tick(CHARGE);
  assert.equal(f.attacker.state, 'charge');
});

test('a first hit that knocks the target out ends the technique at once: no bind, no delayed explosion', () => {
  const d = hitDuel();
  d.target.combat.health = 3;
  const t = start(d);
  d.until(() => !d.attacker.technique);
  assert.equal(t.endReason, 'ko');
  assert.equal(d.events.length, 1);
  assert.equal(d.target.combat.health, 0);
  assert.equal(d.target.combat.immobilized, false);
  for (let i = 0; i < DELAY_STEPS + 20; i++) d.tick();
  assert.equal(d.events.length, 1, 'a defeated fighter is not hit again');

  // Knocked out by something else during the wait: released, no explosion.
  const other = hitDuel();
  const u = hitConfirm(other);
  for (let i = 0; i < 30; i++) other.tick();
  other.target.combat.health = 0;
  other.tick();
  assert.equal(u.endReason, 'ko');
  assert.equal(other.attacker.technique, null);
  assert.equal(other.target.combat.immobilized, false);
  for (let i = 0; i < DELAY_STEPS; i++) other.tick();
  assert.equal(other.events.length, 1);
});

// ---- Ground ------------------------------------------------------------------------

test('ground lost during formation cancels it: no sphere, no hit, and #0001 falls', () => {
  const ledge = { id: 'slab', x: 300, y: 700, w: 400, h: 16, dropThrough: true };
  const stage = stageWith({ platforms: [ledge] });
  const d = duel({ stage, gap: 150 });
  standOn(d.attacker, stage, 'slab');
  standOn(d.target, stage, 'slab');
  const t = start(d);
  for (let i = 0; i < 10; i++) d.tick();
  assert.equal(t.phase, 'form');
  // The platform vanishes under him mid-formation.
  stage.platforms.length = 0;
  d.tick();
  assert.equal(d.attacker.technique, null, 'cancelled on the step the ground went');
  assert.equal(t.endReason, 'ground');
  assert.equal(t.sphereFrame, null);
  assert.equal(d.attacker.grounded, false);
  assert.equal(d.attacker.state, 'fall');
  assert.equal(frameName(d.attacker), '0001_fall1.png');
  d.until(() => d.attacker.grounded);
  assert.equal(d.attacker.body.y, 800, 'down to the floor, no invisible platform');
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.health, 100);
  assert.equal(d.attacker.combat.energy, 100);
});

test('dashing off a ledge ends the rush on that step: the sphere is gone and #0001 falls from where he is', () => {
  for (const facing of [1, -1]) {
    // A slab ending 100 units ahead of #0001; the opponent far away below.
    const ledge = facing > 0
      ? { id: 'slab', x: 300, y: 700, w: 300, h: 16, dropThrough: true }
      : { id: 'slab', x: 400, y: 700, w: 300, h: 16, dropThrough: true };
    const stage = stageWith({ platforms: [ledge] });
    const d = duel({ stage, gap: 900, attackerFacing: facing });
    standOn(d.attacker, stage, 'slab');
    const t = start(d);
    runUntil(d, () => t.phase === 'dash');
    let last;
    while (d.attacker.technique) {
      last = snap(d.attacker);
      d.tick();
    }
    assert.equal(t.endReason, 'ground');
    assert.equal(last.phase, 'dash');
    assert.equal(d.attacker.grounded, false);
    assert.equal(d.attacker.state, 'fall');
    assert.equal(d.attacker.body.vx, 0, 'the dash stops');
    assert.equal(t.sphereFrame, null);
    // Past the edge (never snapped back), and straight down from there.
    const edge = facing > 0 ? ledge.x + ledge.w : ledge.x;
    const x = d.attacker.body.x;
    assert.ok(facing > 0 ? x - d.attacker.body.halfW >= edge : x + d.attacker.body.halfW <= edge);
    const ys = [];
    for (let i = 0; i < 8; i++) {
      d.tick();
      ys.push(d.attacker.body.y);
      assert.equal(d.attacker.body.x, x);
    }
    assert.ok(ys.every((y, i) => i === 0 || y > ys[i - 1]), 'falling at once: no hover');
    assert.deepEqual(d.events, []);
  }
});

test('ground lost after the hit cancels the rest: hit 1 stays, the target is freed at once, no explosion, #0001 falls', () => {
  // #0001 on a low slab, the opponent on the floor just in front of it.
  const slab = { id: 'slab', x: 200, y: 770, w: 520, h: 16, dropThrough: true };
  const stage = stageWith({ platforms: [slab] });
  const d = duel({ stage, gap: 140, pushboxes: true });
  standOn(d.attacker, stage, 'slab');
  assert.equal(d.target.body.ground.id, '__floor');
  const t = hitConfirm(d);
  assert.equal(d.target.combat.health, 96);
  for (let i = 0; i < 40; i++) d.tick();
  assert.equal(t.phase, 'wait');
  stage.platforms.length = 0;
  d.tick();
  assert.equal(d.attacker.technique, null);
  assert.equal(t.endReason, 'ground');
  assert.equal(t.sphereFrame, null);
  assert.equal(d.target.combat.immobilized, false, 'freed on the same step');
  assert.equal(d.attacker.state, 'fall');
  for (let i = 0; i < DELAY_STEPS + 30; i++) d.tick();
  assert.equal(d.events.length, 1, 'hit 2 never comes');
  assert.equal(d.target.combat.health, 96, 'hit 1 is kept');
});

// ---- Interruption ------------------------------------------------------------------

test('a hit on #0001 cancels the technique in formation, dash or wait: Hurt, no sphere, the target freed, no armour', () => {
  const system = new CombatSystem();
  for (const when of ['form', 'dash', 'wait']) {
    const d = hitDuel();
    const t = start(d);
    if (when === 'wait') runUntil(d, () => t.phase === 'wait');
    else runUntil(d, () => t.phase === when);
    d.tick();
    assert.equal(t.phase, when);
    const bound = d.target.combat.immobilized;
    assert.equal(bound, when === 'wait');
    // A real BA1 from the opponent, through the real CombatSystem.
    const event = system.applyHit(d.target, d.attacker, d.target.attacks.ba1);
    assert.equal(event.type, 'hit');
    assert.equal(d.attacker.technique, null, `${when}: cancelled by the hit itself`);
    assert.equal(t.endReason, 'hit');
    assert.equal(t.sphereFrame, null);
    assert.equal(d.target.combat.immobilized, false);
    assert.equal(d.attacker.combat.health, 94, 'full damage: no armour');
    assert.ok(Math.abs(d.attacker.body.vx) > 0, 'full knockback');
    d.tick();
    assert.equal(d.attacker.state, 'hitstun');
    assert.equal(frameName(d.attacker), '0001_hurt.png');
    const hits = d.events.length;
    for (let i = 0; i < DELAY_STEPS + 20; i++) d.tick();
    assert.equal(d.events.length, hits, `${when}: nothing more from the cancelled technique`);
    assert.equal(d.target.combat.health, when === 'wait' ? 96 : 100, 'damage already dealt stays');
  }
  // A punch that really lands during formation does the same.
  const d = duel({ gap: 44 });
  const t = start(d);
  d.tick({}, BA1);
  d.until(() => d.events.length > 0);
  assert.equal(d.events[0].attacker, d.target);
  assert.equal(d.attacker.technique, null);
  assert.equal(t.endReason, 'hit');
  d.tick();
  assert.equal(d.attacker.state, 'hitstun');
});

// ---- Dodge and Block ---------------------------------------------------------------

// Step (from the BA2 press) on which the rush first touches an opponent 250
// in front: on rasen6, one step after the swing begins.
function contactStep(extra = {}) {
  const d = duel({ gap: 250, pushboxes: true, ...extra });
  start(d);
  let n = 1;
  while (d.attacker.technique?.phase !== 'confirm') {
    d.tick();
    n++;
    assert.ok(n < 100);
  }
  return n;
}

test('Dodge invulnerability makes the rush pass unspent: no hit or bind, and a miss if nothing valid follows', () => {
  const C = contactStep();
  assert.equal(C, FORM_STEPS + 11, 'contact on the second rasen6 step');
  // Invulnerable from the contact step to the end of the dash: a clean miss.
  const d = duel({ gap: 250, pushboxes: true });
  const t = start(d);
  runUntil(d, () => !d.attacker.technique, () => ({}), (i) => (i + 2 === C - 5 ? DEFENSE : {}));
  assert.equal(t.endReason, 'miss');
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.health, 100);
  assert.equal(d.target.combat.immobilized, false);
  assert.equal(t.firstHitDone, false, 'the sphere was never used up');
});

test('after a Dodge\'s invulnerable frames the same rush can still connect', () => {
  const C = contactStep();
  const d = duel({ gap: 250, pushboxes: true });
  const t = start(d);
  const invulnerableSteps = [];
  runUntil(d, () => t.phase !== 'form' && t.phase !== 'dash', () => ({}), (i) => {
    if (d.target.combat.invulnerable) invulnerableSteps.push(i);
    return i + 2 === C - 8 ? DEFENSE : {};
  });
  assert.equal(t.phase, 'confirm');
  assert.ok(invulnerableSteps.length > 0);
  assert.equal(d.events.length, 1);
  assert.equal(d.target.combat.health, 96);
  assert.equal(d.target.combat.immobilized, true);
});

test('Block (future fighters): a guarded contact is a normal block with chip damage; no bind, no explosion, the rush ends', () => {
  const blocker = { ...def, defense: { type: 'block' }, stats: { ...def.stats, blockDamageScale: 0.25 } };
  const d = hitDuel({ targetCharacter: blocker });
  const t = start(d, { defense: true });
  runUntil(d, () => !d.attacker.technique, () => ({}), () => ({ defense: true }));
  assert.equal(t.endReason, 'blocked');
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.events[0].technique, t);
  assert.ok(close(d.target.combat.health, 100 - 4 * 0.25), 'chip damage');
  assert.equal(d.target.combat.immobilized, false);
  assert.equal(d.attacker.state, 'idle');
  for (let i = 0; i < DELAY_STEPS + 20; i++) d.tick({}, { defense: true });
  assert.equal(d.events.length, 1, 'no delayed explosion');
  // A guard facing away does not block it.
  const away = hitDuel({ targetCharacter: blocker, targetFacing: 1 });
  away.target.opponent = null;
  const u = start(away, { defense: true });
  runUntil(away, () => u.phase !== 'form' && u.phase !== 'dash', () => ({}), () => ({ defense: true }));
  assert.equal(u.phase, 'confirm');
  assert.equal(away.events[0].type, 'hit');
});

// ---- Airborne target, facing, walls -----------------------------------------------

test('a target caught in the air stays locked but keeps falling under gravity, the sphere following it down', () => {
  const C = contactStep();
  const d = duel({ gap: 250, pushboxes: true });
  const t = start(d);
  runUntil(d, () => t.phase !== 'form' && t.phase !== 'dash', () => ({}), (i) => (i + 2 === C - 2 ? JUMP : {}));
  assert.equal(t.phase, 'confirm');
  assert.equal(d.target.grounded, false, 'caught airborne');
  assert.equal(d.target.combat.immobilized, true);
  const ys = [];
  while (!d.target.grounded) {
    d.tick({}, { left: true, jump: true });
    ys.push(d.target.body.y);
    const [cx, cy] = t.sphereCenter();
    assert.equal(cx, d.target.body.x);
    assert.equal(cy, d.target.body.y - 48, 'the sphere follows its body');
    assert.equal(d.target.body.vx, 0);
    if (!d.target.grounded && d.target.combat.hitstop <= 0) assert.equal(frameName(d.target), '0001_midairhurt.png');
    assert.ok(ys.length < 120, 'never hovers');
  }
  assert.ok(ys.some((y, i) => i > 0 && y > ys[i - 1]), 'it came down');
  assert.equal(d.target.body.y, 800);
  assert.equal(d.target.combat.immobilized, true, 'still caught on landing');
  assert.equal(frameName(d.target), '0001_hurt.png');
  d.until(() => !d.attacker.technique);
  assert.equal(d.events.length, 2);
});

test('facing is snapshotted: right rushes right, left rushes left, and an opponent crossing behind changes nothing', () => {
  const right = duel({ gap: 900 });
  start(right);
  right.until(() => right.attacker.technique?.phase === 'dash');
  assert.ok(right.attacker.body.vx > 0);
  const left = duel({ gap: 900, attackerFacing: -1 });
  start(left);
  left.until(() => left.attacker.technique?.phase === 'dash');
  assert.ok(left.attacker.body.vx < 0);

  // Standing still, #0001 would turn to face an opponent behind him; during
  // the technique he never does, and the rush goes the original way.
  const d = duel({ gap: 200 });
  const t = start(d);
  d.target.body.x = 300;
  d.target.body.prevX = 300;
  const log = runUntil(d, () => !d.attacker.technique);
  assert.ok(log.filter((s) => s.phase).every((s) => s.facing === 1));
  assert.equal(t.facing, 1);
  assert.ok(d.attacker.body.x > 700, 'rushed right, away from the opponent');
  assert.equal(t.endReason, 'miss');
  d.tick();
  assert.equal(d.attacker.facing, -1, 'free again, it turns as usual');
});

test('a solid wall stops the rush: no pass-through, no hit behind it, and the technique ends as a miss', () => {
  const wall = { id: 'wall', x: 640, y: 600, w: 40, h: 200 };
  const stage = stageWith({ solids: [wall] });
  const d = duel({ stage, gap: 260, pushboxes: true });
  const t = start(d);
  const log = runUntil(d, () => !d.attacker.technique);
  assert.equal(t.endReason, 'wall');
  assert.ok(log.every((s) => s.x + d.attacker.body.halfW <= wall.x), 'never inside or past the wall');
  assert.equal(d.attacker.body.x, wall.x - d.attacker.body.halfW);
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.health, 100);
  assert.equal(d.attacker.state, 'idle');
  assert.equal(t.sphereFrame, null);
  // The stage's own edge is a wall too: never beyond the bounds.
  const edge = duel({ x: 1900, gap: -600, pushboxes: true });
  edge.attacker.opponent = null; // keep it facing the edge
  const u = start(edge);
  edge.until(() => !edge.attacker.technique);
  assert.equal(u.endReason, 'wall');
  assert.equal(edge.attacker.body.x, 2000 - edge.attacker.body.halfW);
});

// ---- Missing art -------------------------------------------------------------------

test('each missing fighter clip or sphere effect refuses the Sphere Rush: normal BA2, a warning, nothing invisible', () => {
  const missing = [
    ['rasenForm', 'fighter'], ['rasenDash', 'fighter'], ['rasenConfirm', 'fighter'],
    ['rasenSphereBuild', 'effect'], ['rasenSphereImpact', 'effect'], ['rasenSphereExplosion', 'effect'],
  ];
  for (const [key, kind] of missing) {
    const sprites = kind === 'fighter'
      ? fakeSprites(Object.keys(def.animations).filter((k) => k !== key))
      : fakeSprites(undefined, undefined, Object.keys(def.effectAnimations).filter((k) => k !== key));
    const d = duel({ attackerSprites: sprites });
    const warnings = captureWarnings(() => {
      d.tick(CHARGE);
      d.tick(CHARGED_BA2);
    });
    assert.equal(d.attacker.technique, null, key);
    assert.equal(d.attacker.combat.attack?.def.id, 'ba2', `${key}: the same press is a normal BA2`);
    assert.equal(frameName(d.attacker), '0001_2ba1.png');
    assert.equal(warnings.length, 1, key);
    assert.match(warnings[0], new RegExp(`rasenRush.*"${key}" has no animation frames`));
    d.until(() => !d.attacker.combat.attack);
    assert.ok(d.events.every((e) => e.technique === null && e.damage === 8), `${key}: only BA2's own hit`);
    assert.equal(d.target.combat.immobilized, false);
    assert.equal(d.attacker.combat.energy, 100);
  }
  // Bad data is refused the same way.
  const bad = { ...def, chargedTechniques: { rasenRush: { ...TECH, dashSpeed: 0 } } };
  const d = duel();
  d.attacker.techniqueDefs.rasenRush = makeFighter({ character: bad }).fighter.techniqueDefs.rasenRush;
  const warnings = captureWarnings(() => {
    d.tick(CHARGE);
    d.tick(CHARGED_BA2);
  });
  assert.equal(d.attacker.technique, null);
  assert.equal(d.attacker.combat.attack?.def.id, 'ba2');
  assert.match(warnings[0], /rasenRush.*dashSpeed/);
});

test('an Energy cost, when the data sets one, is paid once and refused without enough Energy (none is set today)', () => {
  const costly = { ...def, chargedTechniques: { rasenRush: { ...TECH, energyCost: 30 } } };
  const paid = duel({ gap: 900, attackerSprites: fakeSprites() });
  paid.attacker.techniqueDefs.rasenRush = makeFighter({ character: costly }).fighter.techniqueDefs.rasenRush;
  start(paid);
  assert.equal(paid.attacker.combat.energy, 70);
  paid.until(() => !paid.attacker.technique);
  assert.equal(paid.attacker.combat.energy, 70, 'paid once');
  const poor = duel();
  poor.attacker.techniqueDefs.rasenRush = paid.attacker.techniqueDefs.rasenRush;
  poor.attacker.combat.energy = 20;
  poor.tick(CHARGE);
  poor.tick(CHARGED_BA2);
  assert.equal(poor.attacker.technique, null);
  assert.equal(poor.attacker.combat.attack?.def.id, 'ba2');
  assert.equal(poor.attacker.combat.energy, 20);
});

// ---- Regressions -------------------------------------------------------------------

test('Charged BA1 is still the 25 Energy Clone Attack and keeps #0001 charging; it starts no technique', () => {
  const d = duel();
  d.tick(CHARGE);
  d.tick(CHARGED_BA1);
  assert.equal(d.clones.length, 1);
  assert.equal(d.attacker.combat.energy, 75);
  assert.equal(d.attacker.state, 'charge');
  assert.equal(d.attacker.technique, null);
  // Clone first, then the Sphere Rush from the same Charge.
  d.tick(CHARGE);
  d.tick(CHARGED_BA2);
  assert.ok(d.attacker.technique);
  assert.equal(d.clones.length, 1, 'the Sphere Rush summons nothing');
  assert.equal(d.attacker.combat.energy, 75);
});

test('normal BA2 is unchanged outside Charge: 2ba1-2ba7 for 8 on the ground, midair1ba1-5 in the air, no sphere', () => {
  const ground = duel();
  ground.tick(BA2);
  const frames = [];
  while (ground.attacker.combat.attack) {
    frames.push(frameName(ground.attacker));
    ground.tick();
  }
  assert.deepEqual(order(frames), Array.from({ length: 7 }, (_, i) => `0001_2ba${i + 1}.png`));
  assert.deepEqual(ground.events.map((e) => [e.type, e.damage, e.technique]), [['hit', 8, null]]);
  assert.equal(ground.attacker.technique, null);

  const air = duel({ gap: 300 });
  air.tick(JUMP);
  for (let i = 0; i < 6; i++) air.tick({ ...CHARGE, jump: true });
  air.tick(CHARGED_BA2); // Charge is ground-only, so this is mid-air BA2
  assert.equal(air.attacker.combat.attack?.def.id, 'midairBa2');
  const airFrames = [];
  while (air.attacker.combat.attack) {
    airFrames.push(frameName(air.attacker));
    air.tick();
  }
  assert.deepEqual(order(airFrames), Array.from({ length: 5 }, (_, i) => `0001_midair1ba${i + 1}.png`));
  assert.equal(air.attacker.technique, null);
});

test('the training CPU never charges or presses BA2, and its neutral input is simply ignored while bound', () => {
  const cpu = new TrainingAIController({ rng: () => 0.3 });
  const d = hitDuel();
  start(d, cpu.getInput(d.target, DT, SIM_CTX));
  for (let i = 0; d.attacker.technique && i < 400; i++) {
    const out = cpu.getInput(d.target, DT, SIM_CTX);
    for (const k of ['charge', 'chargePressed', 'action1Pressed', 'action2Pressed', 'primaryPressed', 'defensePressed']) {
      assert.equal(out[k], false, k);
    }
    d.tick({}, out);
    assert.equal(d.target.technique, null);
    assert.equal(d.target.combat.attack, null);
  }
  assert.equal(d.events.length, 2);
});

// ---- Battle ------------------------------------------------------------------------

// A real Battle with scripted Player 1 input (see clone.test.mjs). Stage
// themes build Path2D art, which Node lacks, so a do-nothing stand-in takes
// its place.
async function realBattle() {
  globalThis.Path2D ??= class {
    constructor() {
      return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
    }
  };
  const { Battle } = await import('../js/game/battle.js');
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
    canvas: { getContext: () => ({}) }, map: getMap('desert'), p1Def: def, p2Def: def, p1Sprites: sprites, p2Sprites: sprites, input,
  });
  battle.p2.controller = null; // a still opponent
  return { battle, script, sprites };
}

// Puts P2 140 in front of P1 and runs a Sphere Rush up to its hit.
function battleHit(battle, script) {
  battle.setPhase('fight');
  battle.p2.body.x = battle.p1.body.x + 140;
  script.held = CHARGE;
  battle.update(DT);
  script.held = {};
  script.once = CHARGED_BA2;
  battle.update(DT);
  const t = battle.p1.technique;
  assert.ok(t);
  while (t.phase === 'form' || t.phase === 'dash') battle.update(DT);
  assert.equal(t.phase, 'confirm');
  return t;
}

test('Battle: restart and rematch clear the technique, its sphere, the bind and the pending explosion', async () => {
  const { battle, script } = await realBattle();
  const t = battleHit(battle, script);
  assert.equal(battle.p2.combat.health, 96);
  assert.equal(battle.p2.combat.immobilized, true);
  battle.restart();
  assert.equal(battle.p1.technique, null);
  assert.equal(t.phase, 'done');
  assert.equal(t.endReason, 'reset');
  assert.equal(t.target, null);
  assert.equal(t.owner, null);
  assert.equal(battle.p2.combat.immobilized, false);
  assert.equal(battle.p2.combat.health, 100);
  assert.equal(battle.p1.state, 'idle');
  for (let i = 0; i < DELAY_STEPS + 30; i++) battle.update(DT);
  assert.equal(battle.p2.combat.health, 100, 'no explosion survives a rematch');
  assert.equal(battle.p1.technique, null);

  // Resetting the owner alone frees the opponent at once...
  const again = battleHit(battle, script);
  battle.p1.reset(battle.stage);
  assert.equal(again.endReason, 'reset');
  assert.equal(battle.p2.combat.immobilized, false);
  // ...and resetting the caught opponent alone ends the owner's technique.
  battle.p1.reset(battle.stage);
  battle.p2.reset(battle.stage);
  const third = battleHit(battle, script);
  battle.p2.reset(battle.stage);
  battle.update(DT);
  assert.equal(third.endReason, 'released');
  assert.equal(battle.p1.technique, null);
});

test('Battle: leaving it drops every technique reference', async () => {
  const { battle, script } = await realBattle();
  const { p1, p2 } = battle;
  const t = battleHit(battle, script);
  battle.destroy();
  assert.equal(p1.technique, null);
  assert.equal(t.owner, null);
  assert.equal(t.target, null);
  assert.equal(t.phase, 'done');
  assert.equal(p2.combat.immobilized, false);
  assert.deepEqual(battle.fighters, []);
});

test('Battle draws the sphere over both fighters, in the hand then on the target, never mirrored; debug outlines it', async () => {
  const { battle, script, sprites } = await realBattle();
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
  battle.theme = { prepare() {}, drawBackground() {}, drawTerrain() {}, drawForeground() {}, update() {}, shadow: { alpha: 0.3, skew: 0, stretch: 1 } };
  Object.assign(battle.view, { ctx, pxW: 1280, pxH: 720, scale: 1, x: 1000, y: 400, w: 1280, h: 720 });
  battle.pxPerArt = 2;
  const render = () => {
    for (const f of battle.fighters) f.interpolate(1);
    calls.length = 0;
    battle.render();
    return calls;
  };
  const draws = () => render().filter((c) => c[0] === 'drawImage').map((c) => c[1].id);
  const translateBefore = (id) => {
    const at = calls.findIndex((c) => c[0] === 'drawImage' && c[1].id === id);
    return calls.slice(0, at).filter((c) => c[0] === 'translate').at(-1).slice(1);
  };
  const mirrored = (id) => {
    const at = calls.findIndex((c) => c[0] === 'drawImage' && c[1].id === id);
    const from = calls.slice(0, at).map((c) => c[0]).lastIndexOf('save');
    return calls.slice(from, at).some((c) => c[0] === 'scale' && c[1] === -1);
  };

  // P1 faces left here, so its frames are mirrored but the sphere never is.
  battle.setPhase('fight');
  battle.p1.facing = -1;
  battle.p2.body.x = battle.p1.body.x - 140;
  battle.p2.facing = 1;
  script.held = CHARGE;
  battle.update(DT);
  script.held = {};
  script.once = CHARGED_BA2;
  battle.update(DT);
  const t = battle.p1.technique;
  assert.deepEqual(draws(), ['0001_idle1.png', '0001_rasen1.png', '0001_prasen1.png'], 'P2, P1, then the sphere on top');
  assert.equal(mirrored('0001_rasen1.png'), true);
  assert.equal(mirrored('0001_prasen1.png'), false, 'a round effect is never mirrored');
  const [hx, hy] = t.sphereCenter(true);
  assert.deepEqual(translateBefore('0001_prasen1.png'), [Math.round(hx - 1000), Math.round(hy - 400)]);
  assert.equal(hx, battle.p1.body.x - TECH.handOffsets.rasenForm[0].x, 'the hand offset mirrors with facing');

  // Debug: the rushing sphere's box is dashed and labelled while it searches.
  battle.debug = true;
  while (t.phase !== 'dash') battle.update(DT);
  let labels = render().filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.ok(labels.includes('charged ba2 dash'), labels.join());
  assert.ok(calls.some((c) => c[0] === 'setLineDash' && c[1].length), 'dashed, unlike melee and projectile boxes');
  while (t.phase === 'dash') battle.update(DT);
  assert.equal(t.phase, 'confirm');
  labels = render().filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.ok(labels.includes('charged ba2 confirm'), 'the attached sphere\'s centre is marked');
  assert.ok(labels.includes('bound'), 'the caught opponent is labelled');
  assert.ok(labels.some((l) => /cpu .*\(bound\)/.test(l)));
  battle.debug = false;
  labels = render().filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.ok(!labels.some((l) => /charged|bound/.test(l)), 'nothing of it in normal play');

  // On the target now, still drawn last, centred on it.
  const drawn = draws();
  assert.equal(drawn.at(-1), '0001_prasen7.png');
  const [cx, cy] = t.sphereCenter(true);
  assert.deepEqual([cx, cy], [battle.p2.renderX, battle.p2.renderY - 48]);
  assert.deepEqual(translateBefore('0001_prasen7.png'), [Math.round(cx - 1000), Math.round(cy - 400)]);
  while (battle.p1.technique) battle.update(DT);
  assert.deepEqual(draws().filter((id) => /prasen/.test(id)), [], 'gone once it is over');
});
