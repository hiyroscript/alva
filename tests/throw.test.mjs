// Run with node --test tests/throw.test.mjs (no dependencies).
// #0001's Throw on the primary action and its shuriken projectile: artwork,
// registration, one-pass playback, one release per press on the release
// frame, independent flight, spin animation, hits through the real
// CombatSystem (no knockback either way, Dodge, Block), cleanup, missing-art
// safety, the ground-only rule, Charge / Defense priority, input and the
// training CPU. The shuriken has no knockback: a hit deals damage and stun
// but never pushes or launches. Uses the real Fighter, CombatSystem,
// projectiles, physics and InputManager (see fighter-harness.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { characterFramePaths } from '../js/data/characters.js';
import { COMBAT_ACTIONS } from '../js/game/character.js';
import { CombatSystem } from '../js/game/combat.js';
import { Projectile, spawnProjectiles, removeDeadProjectiles, createProjectileDefinition } from '../js/game/projectile.js';
import { StageCollision } from '../js/game/physics.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { ACTION_LABELS, CONFIG } from '../js/config.js';
import {
  def, DT, BASE, STAGE, SIM_CTX, fakeSprites, makeFighter, frameName, stepUntil,
  steps, recordAttack, sequence, duel, stageMap,
} from './fighter-harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const THROW = { primary: true, primaryPressed: true };
const HOLD_THROW = { primary: true };
const JUMP = { jump: true, jumpPressed: true };
const DEFENSE = { defense: true, defensePressed: true };
const THROW_FPS = 12;
const SHURIKEN_FPS = 18;
const FRAMES = ['0001_throw1.png', '0001_throw2.png', '0001_throw3.png'];
const SPIN = ['0001_shuriken1.png', '0001_shuriken2.png', '0001_shuriken3.png'];
const SHURIKEN = def.projectiles.shuriken;

// The uploaded PNGs, byte for byte.
const SHA256 = {
  '0001_throw1.png': 'db93901a8ea30a4c894d2bfafe99cefe7c5fb26bbdc5fbf665b78e4697917212',
  '0001_throw2.png': '8bee2abc5a83c4a5f4d2fa15f9298f48008e5c418122a7d4e2062d93ab53f154',
  '0001_throw3.png': 'a334d35e1c6bf82cf7ec6e6665b347d8a52a4df9f8710b028905d1dfe7f3bc82',
  '0001_shuriken1.png': 'f03293fc7b442072c956a09e6e6204564ea0657e7dc0e3df0343e12e01828024',
  '0001_shuriken2.png': '5505ff5e0547db981d99eb78a375874f858aba0d1af1005b5f67c888801d72fd',
  '0001_shuriken3.png': 'b0aba58cfd7d7db490a5f492ffb316706363c563adc30544ce059ac16cae3865',
};

const shurikenName = (p) => p.frame.url.split('/').pop();

// A duel whose target stands far behind the thrower, so shurikens fly free.
function range({ facing = 1 } = {}) {
  const d = duel({ gap: -400, attackerFacing: facing });
  d.attacker.opponent = null; // keep facing forward with the target behind
  d.target.opponent = null;
  return d;
}

// Ticks until the attacker's current attack ends; returns every projectile
// seen meanwhile.
function throwOnce(d, held = HOLD_THROW) {
  const seen = new Set();
  d.tick(THROW);
  for (const p of d.projectiles) seen.add(p);
  while (d.attacker.combat.attack) {
    d.tick(held);
    for (const p of d.projectiles) seen.add(p);
  }
  return seen;
}

// ---- Artwork ------------------------------------------------------------------

test('the six Throw and shuriken sprites live in the canonical #0001 folder, unchanged, and nowhere else', () => {
  const paths = characterFramePaths(def);
  for (const [name, sha] of Object.entries(SHA256)) {
    const url = `./assets/characters/0001/${name}`;
    assert.ok(paths.includes(url), `${url} is preloaded with the character`);
    assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
    assert.ok(!existsSync(ROOT + name), `no root copy of ${name}`);
    const bytes = readFileSync(ROOT + url.slice(2));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, `${name} bytes are the upload`);
  }
  assert.deepEqual(readdirSync(ROOT).filter((n) => /throw|shuriken/i.test(n)), []);
  const dir = readdirSync(ROOT + 'assets/characters/0001/');
  assert.deepEqual(dir.filter((n) => /throw/.test(n)).sort(), FRAMES);
  assert.deepEqual(dir.filter((n) => /shuriken/.test(n)).sort(), SPIN);
  assert.deepEqual(dir.filter((n) => /midairthrow/i.test(n)), [], 'no mid-air Throw art exists');
});

test('Throw is a three-frame, play-once fighter clip; the shuriken is projectile art, not a fighter pose', () => {
  const clip = def.animations.throw;
  assert.deepEqual(clip.frames, FRAMES.map((n) => `${BASE}${n.slice(5)}`));
  assert.equal(clip.frames.length, 3);
  assert.equal(clip.fps, THROW_FPS);
  assert.equal(clip.loop, false);
  assert.ok(clip.heightRatio > 0.8 && clip.heightRatio <= 1);
  assert.equal(clip.sourceFacing, undefined, 'Throw art faces right like the rest of #0001');
  assert.equal(def.animationFallbacks.throw, undefined, 'never faked with other art');

  // Kept out of the fighter animations, so it is never fitted to fighter height.
  for (const key of Object.keys(def.animations)) assert.doesNotMatch(key, /shuriken/i);
  for (const anim of Object.values(def.animations)) {
    for (const url of anim.frames) assert.doesNotMatch(url, /shuriken/);
  }
  const spin = def.projectileAnimations.shuriken;
  assert.deepEqual(spin.frames, SPIN.map((n) => `${BASE}${n.slice(5)}`));
  assert.equal(spin.fps, SHURIKEN_FPS);
  assert.equal(spin.loop, true);
  assert.equal(SHURIKEN.animation, 'shuriken');
});

test('SpriteSet.build normalizes the shuriken separately: centre anchor, fighter art scale, own size', (t) => {
  t.mock.method(console, 'warn', () => {});
  // Raw-size stand-ins (no canvas in Node): idle is twice the shuriken's size.
  const sizes = { shuriken1: 64, shuriken2: 48, shuriken3: 64 };
  const set = SpriteSet.build(def, (url) => {
    const name = url.match(/0001_(\w+)\.png$/)[1];
    return sizes[name] ? { naturalWidth: sizes[name], naturalHeight: sizes[name] } : { naturalWidth: 64, naturalHeight: 128 };
  });
  assert.equal(set.animations.shuriken, undefined, 'not a fighter animation');
  const spin = set.projectile('shuriken');
  assert.ok(spin);
  assert.equal(spin.frames.length, 3);
  assert.equal(spin.fps, SHURIKEN_FPS);
  assert.equal(spin.loop, true);
  // The reference (idle) frames here are 1 raw px per art px; the shuriken
  // shares that scale instead of being stretched to the fighter's height.
  assert.deepEqual(spin.frames.map((f) => [f.artW, f.artH]), [[64, 64], [48, 48], [64, 64]]);
  for (const f of spin.frames) {
    assert.equal(f.anchorArtX, f.artW / 2, 'centred horizontally');
    assert.equal(f.anchorArtY, f.artH / 2, 'centred vertically');
  }
  assert.ok(spin.frames[0].artH < set.refArtHeight);
  assert.equal(set.projectile('missing'), null);
  assert.ok(characterFramePaths(def).includes(`${BASE}shuriken2.png`));
});

// ---- Registration -------------------------------------------------------------

test('primary is Throw; Special stays reserved; BA1 and BA2 are unchanged', () => {
  assert.equal(def.actions.primary, 'throw');
  assert.equal(def.actions.special, null);
  assert.deepEqual(def.actions.action1, { ground: 'ba1', air: 'midairBa1' });
  assert.deepEqual(def.actions.action2, { ground: 'ba2', air: 'midairBa2' });
  assert.ok(COMBAT_ACTIONS.includes('primary'), 'the internal action keeps its name');
  assert.ok(!COMBAT_ACTIONS.includes('throw'));
  assert.equal(ACTION_LABELS.primary, 'Throw');
  assert.deepEqual(CONFIG.bindings.primary, ['KeyJ']);
});

test('the Throw attack: its own clip, ground-only, one pass, no melee hitbox, one shuriken', () => {
  const { fighter } = makeFighter();
  const atk = fighter.attacks.throw;
  const clip = def.animations.throw;
  assert.equal(atk.animation, 'throw');
  assert.equal(atk.groundOnly, true);
  assert.equal(atk.lockMovement, true);
  assert.equal(atk.hitbox, null, 'no fighter-attached damage');
  assert.deepEqual([atk.startup, atk.active, atk.recovery], [1 / 12, 1 / 12, 1 / 12]);
  assert.ok(Math.abs(atk.total - clip.frames.length / clip.fps) < 1e-9, 'one pass of the clip');
  assert.equal(atk.projectile.id, 'shuriken');
  // Released as the attack reaches throw2, the frame the arm lets go.
  assert.equal(atk.projectile.spawnAt, 1 / THROW_FPS);
  assert.ok(atk.projectile.offset.x > 0 && atk.projectile.offset.y < 0, 'in front, off the ground');
  assert.ok(atk.cooldown >= 0.2 && atk.cooldown <= 0.3);
  assert.equal(atk.damage, 0);
  // The shuriken itself: modest, and never stronger than BA2.
  const proj = fighter.projectileDefs.shuriken;
  assert.equal(proj.animation, 'shuriken');
  assert.ok(proj.damage > 0 && proj.damage < def.attacks.ba2.damage);
  assert.ok(proj.hitstun < def.attacks.ba1.hitstun && proj.hitstun < def.attacks.ba2.hitstun);
  assert.ok(proj.hitstop <= def.attacks.ba1.hitstop);
  assert.deepEqual(SHURIKEN.knockback, { x: 0, y: 0 }, 'no knockback: no push, no launch');
  assert.deepEqual(proj.knockback, { x: 0, y: 0 });
  assert.equal('powers' in SHURIKEN, false, 'a bespoke hit, with no Powers');
  assert.equal('axis' in SHURIKEN.knockback, false, 'numeric knockback, not a Knockback level');
  assert.equal(proj.damage, 4);
  assert.equal(proj.speed, 700);
  assert.ok(proj.speed > 0 && proj.lifetime > 0);
  assert.ok(proj.hitbox.w <= 16 && proj.hitbox.h <= 16, 'a small box around the shuriken');
  assert.equal(proj.hitbox.x, -proj.hitbox.w / 2);
  assert.equal(proj.hitbox.y, -proj.hitbox.h / 2);
  // Projectile definitions validate like attacks do.
  assert.throws(() => createProjectileDefinition({ speed: 1 }), /need an id/);
});

// ---- Playback -----------------------------------------------------------------

test('one Throw press plays throw1, throw2, throw3 once, then idle', () => {
  const { fighter, step } = makeFighter();
  const log = recordAttack(step, THROW);
  assert.deepEqual(sequence(log), FRAMES);
  assert.ok(log.every((s) => s.id === 'throw' && s.anim === 'throw' && s.grounded));
  assert.equal(log.length, steps(3 / THROW_FPS), 'exactly one pass');
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0001_idle1.png');
  assert.equal(fighter.combat.attack, null);
  assert.ok(fighter.combat.cooldowns.has('throw'), 'cooldown after the Throw');
});

test('holding Throw neither loops the clip nor throws again; a new press after the cooldown does', () => {
  const d = range();
  const first = throwOnce(d);
  assert.equal(first.size, 1, 'one shuriken per press');
  // Keep holding for two seconds: nothing more.
  const later = new Set();
  for (let i = 0; i < steps(2); i++) {
    d.tick(HOLD_THROW);
    assert.notEqual(d.attacker.state, 'attack');
    for (const p of d.projectiles) if (!first.has(p)) later.add(p);
  }
  assert.equal(later.size, 0);
  // Release and press again: a second Throw, a second shuriken.
  d.tick();
  const second = throwOnce(d);
  assert.equal(second.size, 1);
  assert.ok(![...second].some((p) => first.has(p)));
});

test('a press during the cooldown is refused; one right after it throws', () => {
  const d = range();
  throwOnce(d, {});
  d.tick(THROW);
  assert.equal(d.attacker.combat.attack, null, 'still cooling down');
  stepUntil(() => { d.tick(); return d.attacker; }, (f) => !f.combat.cooldowns.has('throw'));
  d.tick(THROW);
  assert.equal(d.attacker.combat.attack?.def.id, 'throw');
});

test('the shuriken appears exactly once, on throw2, the release frame', () => {
  const d = range();
  const log = [];
  d.tick(THROW);
  const seen = new Set();
  do {
    for (const p of d.projectiles) seen.add(p);
    log.push({ frame: frameName(d.attacker), count: d.projectiles.length, phase: d.attacker.combat.phase });
    d.tick(HOLD_THROW);
  } while (d.attacker.state === 'attack');
  const first = log.findIndex((s) => s.count > 0);
  assert.ok(first > 0, 'a shuriken is released during the Throw');
  assert.equal(log[first].frame, '0001_throw2.png', 'on the release frame');
  assert.ok(log.slice(0, first).every((s) => s.count === 0), 'not before it');
  assert.ok(log.slice(0, first).every((s) => s.frame !== '0001_throw3.png'));
  assert.equal(log.filter((s) => s.frame === '0001_throw1.png' && s.count > 0).length, 0, 'never during the wind-up');
  assert.ok(log.slice(first).every((s) => s.count === 1), 'exactly one, and it stays');
  assert.equal(log[first].phase, 'active');
  assert.equal(seen.size, 1);
  // Before the Throw ends, not after.
  assert.ok(first < log.length - 1);
});

test('the shuriken starts at the throwing hand, not the feet or the fighter centre', () => {
  for (const facing of [1, -1]) {
    const d = range({ facing });
    d.tick(THROW);
    while (!d.projectiles.length) d.tick(HOLD_THROW);
    const p = d.projectiles[0];
    const { offset } = def.attacks.throw.projectile;
    const body = d.attacker.body;
    // Spawned at the offset (mirrored with facing), then one step of flight.
    assert.equal(p.prevX, body.x + offset.x * facing);
    assert.equal(p.prevY, body.y + offset.y);
    assert.ok(p.y < body.y - 20 && p.y > body.y - def.collider.height, 'hand height, not the feet or head');
    assert.ok((p.prevX - body.x) * facing > 0, 'in front of the fighter');
  }
});

// ---- Flight ---------------------------------------------------------------------

test('a shuriken flies the way #0001 faced at release, every step, even after #0001 turns', () => {
  for (const facing of [1, -1]) {
    const d = range({ facing });
    d.tick(THROW);
    while (!d.projectiles.length) d.tick(HOLD_THROW);
    const p = d.projectiles[0];
    assert.equal(p.direction, facing);
    assert.equal(p.vx, SHURIKEN.speed * facing);
    let x = p.x;
    const turn = facing === 1 ? { left: true } : { right: true };
    for (let i = 0; i < 30; i++) {
      // Once the Throw ends, run the other way: the shuriken does not care.
      d.tick(d.attacker.combat.attack ? {} : turn);
      assert.ok(p.alive);
      assert.ok((p.x - x) * facing > 0, `step ${i}: moving ${facing > 0 ? 'right' : 'left'}`);
      assert.ok(Math.abs(p.x - x - SHURIKEN.speed * facing * DT) < 1e-9, 'constant speed');
      assert.equal(p.y, p.prevY, 'straight, no drop or homing');
      x = p.x;
    }
    assert.equal(d.attacker.facing, -facing, 'the thrower did turn around');
    assert.equal(p.direction, facing);
  }
});

test('the spin animation loops shuriken1-3 at its own frame rate while it flies', () => {
  const d = range();
  d.tick(THROW);
  while (!d.projectiles.length) d.tick(HOLD_THROW);
  const p = d.projectiles[0];
  const shown = [];
  for (let i = 0; i < 40; i++) {
    shown.push(shurikenName(p));
    assert.equal(p.frameIndex, Math.floor(p.age * SHURIKEN_FPS + 1e-6) % 3);
    d.tick();
  }
  const order = shown.filter((n, i, a) => n !== a[i - 1]);
  assert.deepEqual(order.slice(0, 6), [...SPIN, ...SPIN], 'loops 1, 2, 3, 1, 2, 3');
  assert.ok(order.length >= 9, 'keeps spinning: never frozen on one frame');
  // Each frame holds for 1 / 18 s: three or four 60 Hz steps.
  const runs = [];
  for (const n of shown) {
    if (runs.length && runs.at(-1).n === n) runs.at(-1).len++;
    else runs.push({ n, len: 1 });
  }
  for (const r of runs.slice(1, -1)) assert.ok(r.len === 3 || r.len === 4, `held ${r.len} steps`);
  // The spin never changes the speed.
  assert.equal(p.vx, SHURIKEN.speed);
});

test('the shuriken art mirrors with its direction; movement never depends on it', () => {
  const right = range({ facing: 1 });
  const left = range({ facing: -1 });
  for (const d of [right, left]) {
    d.tick(THROW);
    while (!d.projectiles.length) d.tick(HOLD_THROW);
  }
  assert.equal(right.projectiles[0].flip, false);
  assert.equal(left.projectiles[0].flip, true);
  // Direction-neutral art (no sourceFacing) is never mirrored.
  const neutral = new Projectile({
    owner: right.attacker, def: right.projectiles[0].def, x: 0, y: 0, direction: -1,
    anim: { ...right.projectiles[0].anim, sourceFacing: 0 },
  });
  assert.equal(neutral.flip, false);
  assert.equal(neutral.vx, -SHURIKEN.speed);
});

test('the Throw locks movement and facing; the release keeps #0001\'s logical facing', () => {
  const { fighter, step } = makeFighter();
  stepUntil(step, (f) => f.state === 'run', { right: true });
  step({ right: true, ...THROW });
  assert.equal(fighter.state, 'attack');
  const vx = [];
  while (fighter.state === 'attack') {
    assert.equal(fighter.facing, 1, 'holding Left never turns the Throw around');
    vx.push(fighter.body.vx);
    step({ left: true, primary: true });
  }
  assert.ok(vx.every((v, i) => i === 0 || v <= vx[i - 1]), 'slows under normal deceleration');
  assert.equal(fighter.releases.length, 1, 'queued for the battle to spawn');
  assert.equal(fighter.releases[0].direction, 1);
  assert.equal(fighter.releases[0].id, 'shuriken');
});

// ---- Hits -----------------------------------------------------------------------

test('a shuriken hits once for its damage, stun and hitstop, with no knockback, then disappears', () => {
  const d = duel({ gap: 200 });
  const startX = d.target.body.x;
  const floor = d.target.body.y;
  d.tick(THROW);
  d.until(() => d.events.length > 0);
  const [ev] = d.events;
  assert.equal(ev.type, 'hit');
  assert.equal(ev.attacker, d.attacker, '#0001 is credited');
  assert.equal(ev.target, d.target);
  assert.equal(ev.damage, SHURIKEN.damage);
  assert.equal(ev.projectile.def.id, 'shuriken');
  assert.equal(d.target.combat.health, 100 - SHURIKEN.damage);
  assert.ok(Math.abs(d.target.combat.stun - SHURIKEN.hitstun) < 1e-9);
  assert.equal(d.target.combat.hitstop, SHURIKEN.hitstop);
  assert.equal(d.target.combat.health, 96);
  assert.equal(d.target.body.vx, 0, 'not pushed');
  assert.equal(d.target.body.vy, 0, 'no launch');
  assert.equal(d.target.grounded, true);
  assert.equal(d.attacker.combat.hitstop, 0, 'the thrower is not frozen by a distant hit');
  assert.equal(d.projectiles.length, 0, 'destroyed on impact');
  assert.equal(ev.projectile.alive, false);
  d.tick();
  assert.equal(d.target.state, 'hitstun');
  assert.equal(frameName(d.target), '0001_hurt.png');
  // No repeated damage from the same shuriken.
  for (let i = 0; i < 90; i++) d.tick();
  assert.equal(d.events.length, 1);
  assert.equal(d.target.combat.health, 100 - SHURIKEN.damage);
  assert.equal(d.target.body.x, startX, 'not pushed back: stays where it was hit');
  assert.equal(d.target.body.y, floor);
  assert.equal(d.target.grounded, true);
});

test('a shuriken pushes the target neither way, whichever way it flies and wherever the thrower then faces', () => {
  for (const facing of [1, -1]) {
    const d = duel({ gap: 320, attackerFacing: facing });
    d.attacker.opponent = null;
    d.tick(THROW);
    while (d.attacker.combat.attack) d.tick(HOLD_THROW);
    // Turn around before the shuriken arrives.
    const back = facing === 1 ? { left: true } : { right: true };
    d.tick(back);
    d.tick(back);
    assert.equal(d.attacker.facing, -facing);
    assert.equal(d.events.length, 0, 'still in flight');
    const startX = d.target.body.x;
    d.until(() => d.events.length > 0);
    assert.equal(d.attacker.facing, -facing, 'facing away at impact');
    assert.equal(d.events[0].type, 'hit');
    assert.equal(d.events[0].attacker, d.attacker, 'the thrower is credited');
    // 0 along the shuriken's direction: -0 when it flies left, still 0.
    assert.equal(Math.abs(d.target.body.vx), 0, `not knocked ${facing > 0 ? 'right' : 'left'}`);
    assert.equal(d.target.body.vy, 0, 'no launch');
    while (d.target.combat.stun > 0 || d.target.combat.hitstop > 0) d.tick();
    assert.equal(d.target.body.x, startX, 'not displaced');
    assert.equal(d.target.grounded, true);
  }
});

test('a shuriken hit leaves an airborne target\'s vertical velocity alone', () => {
  const { fighter } = makeFighter();
  const shuriken = fighter.projectileDefs.shuriken;
  for (const vy of [-300, 0, 450]) {
    const d = duel({ gap: 200 });
    Object.assign(d.target.body, { y: 600, vy, grounded: false, ground: null });
    const p = { owner: d.attacker, def: shuriken, direction: 1 };
    const system = new CombatSystem();
    const event = system.applyHit(d.attacker, d.target, shuriken, { facing: 1, projectile: p });
    assert.equal(event.type, 'hit');
    assert.equal(event.damage, 4);
    assert.equal(d.target.combat.health, 96);
    assert.ok(Math.abs(d.target.combat.stun - SHURIKEN.hitstun) < 1e-9, 'hitstun');
    assert.equal(d.target.combat.hitstop, SHURIKEN.hitstop);
    assert.equal(d.target.body.vy, vy, 'no vertical knockback: the fall or rise carries on');
    assert.equal(d.target.body.vx, 0, 'no horizontal knockback');
    assert.equal(d.target.body.grounded, false);
  }
});

test('the thrower getting hit after the release does not stop the shuriken', () => {
  const d = duel({ gap: 320 });
  d.tick(THROW);
  while (!d.projectiles.length) d.tick(HOLD_THROW);
  const p = d.projectiles[0];
  // Knock the thrower into hitstun mid-Throw.
  d.attacker.combat.stun = 0.3;
  d.tick();
  assert.equal(d.attacker.state, 'hitstun');
  assert.ok(p.alive);
  d.until(() => d.events.length > 0);
  assert.equal(d.events[0].projectile, p);
  // A Throw interrupted before its release frame throws nothing.
  const e = duel({ gap: 320 });
  e.tick(THROW);
  e.attacker.combat.stun = 0.3;
  for (let i = 0; i < 30; i++) e.tick();
  assert.equal(e.projectiles.length, 0);
  assert.equal(e.attacker.releases.length, 0);
});

// Ticks a fresh duel, target at `gap`, pressing Defense for the target on
// tick `dodgeAt` (0 = with the Throw press); returns the log and the duel.
function shurikenVsDodge(dodgeAt, { gap = 260, setup } = {}) {
  const d = duel({ gap });
  setup?.(d);
  const log = [];
  for (let i = 0; i < 120; i++) {
    const before = d.events.length;
    d.tick(i === 0 ? THROW : {}, i === dodgeAt ? DEFENSE : {});
    const p = d.projectiles[0];
    log.push({ i, hit: d.events.length > before, alive: !!p, x: p?.x, invulnerable: d.target.combat.invulnerable });
    if (d.events.length || (!p && i > 20)) break;
  }
  return { ...d, log };
}

test('a shuriken passes through a Dodge\'s invulnerable frames without being used up', () => {
  // Where an undodged shuriken lands.
  const probe = shurikenVsDodge(-1);
  const hitAt = probe.log.find((s) => s.hit).i;
  // Dodge so the evasive frame (dodge2, 5 steps from the press) meets it.
  const d = shurikenVsDodge(hitAt - 5);
  assert.ok(d.log.some((s) => s.i >= hitAt && s.invulnerable), 'overlapped during the evasive frame');
  assert.deepEqual(d.events, [], 'no hit, no block event');
  assert.equal(d.target.combat.health, 100);
  assert.equal(d.target.combat.stun, 0);
  assert.equal(d.target.combat.hitstop, 0);
  assert.equal(d.target.body.vx, 0, 'no knockback');
  const after = d.log.filter((s) => s.i > hitAt + 4 && s.alive);
  assert.ok(after.length > 10, 'still flying afterwards');
  assert.ok(Math.max(...after.map((s) => s.x)) > d.target.body.x + 100, 'flew on past #0001');
  assert.equal(d.target.combat.energy, 100);
});

test('a shuriken still overlapping when the invulnerable frames end connects then', () => {
  const probe = shurikenVsDodge(-1);
  const hitAt = probe.log.find((s) => s.hit).i;
  // The evasive frame ends two steps after the shuriken first overlaps.
  const d = shurikenVsDodge(hitAt - 8);
  const hit = d.log.find((s) => s.hit);
  assert.ok(hit, 'it connects');
  assert.ok(hit.i > hitAt, 'later than an undodged shuriken');
  assert.ok(d.log.some((s) => s.i >= hitAt && s.i < hit.i && s.invulnerable), 'passed through first');
  assert.equal(d.events.length, 1);
  assert.equal(d.events[0].type, 'hit');
  assert.equal(d.target.combat.health, 100 - SHURIKEN.damage);
  assert.equal(d.target.combat.defenseAction, null, 'the hit cancels the Dodge recovery');
});

test('a Block-type fighter guarding toward a shuriken blocks it with chip damage and blockstun, and no knockback', () => {
  const blocker = { ...def, defense: { type: 'block' }, stats: { ...def.stats, blockDamageScale: 0.25 } };
  for (const facing of [1, -1]) {
    const d = duel({ gap: 200, attackerFacing: facing, targetCharacter: blocker });
    d.tick(THROW, { defense: true, defensePressed: true });
    for (let i = 0; i < 120 && !d.events.length; i++) d.tick({}, { defense: true });
    assert.equal(d.target.combat.blocking, true);
    assert.equal(d.events.length, 1);
    assert.equal(d.events[0].type, 'block');
    assert.ok(Math.abs(d.events[0].damage - SHURIKEN.damage * 0.25) < 1e-9, 'chip damage');
    assert.ok(Math.abs(d.target.combat.stun - SHURIKEN.blockstun) < 1e-9, 'blockstun');
    assert.equal(Math.abs(d.target.body.vx), 0, 'no knockback to halve');
    assert.equal(d.projectiles.length, 0, 'gone after the blocked impact');
  }
  // Guarding the other way does not block it.
  const d = duel({ gap: 200, targetCharacter: blocker });
  d.target.opponent = null;
  d.target.facing = 1; // back to the thrower
  d.tick(THROW, { defense: true, defensePressed: true });
  for (let i = 0; i < 120 && !d.events.length; i++) d.tick({}, { defense: true });
  assert.equal(d.target.combat.blocking, true);
  assert.equal(d.events[0].type, 'hit');
});

test('the thrower cannot hit itself, and a projectile never damages anyone twice', () => {
  const d = range();
  d.tick(THROW);
  while (!d.projectiles.length) d.tick(HOLD_THROW);
  const p = d.projectiles[0];
  // Drag the thrower into its own shuriken's path.
  d.attacker.body.x = p.x + 30;
  d.tick();
  d.tick();
  assert.deepEqual(d.events, []);
  assert.equal(d.attacker.combat.health, 100);
});

// ---- Cleanup --------------------------------------------------------------------

test('a missed shuriken disappears when its lifetime ends or it flies into the Void, never at a ledge', () => {
  // Right, from x 516: its lifetime runs out long before the Void.
  const r = range({ facing: 1 });
  r.tick(THROW);
  while (!r.projectiles.length) r.tick(HOLD_THROW);
  const p = r.projectiles[0];
  while (r.projectiles.length) r.tick();
  assert.equal(p.alive, false);
  assert.ok(Math.abs(p.age - SHURIKEN.lifetime) < DT, `lived ${p.age}s`);
  assert.ok(p.x < STAGE.void.right);
  assert.equal(r.events.length, 0);
  // Left, from x 484: past the main floor's edge at 0 it flies on over the
  // open air; the Void (x -900) is further than it ever flies.
  const l = range({ facing: -1 });
  l.tick(THROW);
  while (!l.projectiles.length) l.tick(HOLD_THROW);
  const q = l.projectiles[0];
  let pastLedge = false;
  while (l.projectiles.length) {
    l.tick();
    if (q.alive && q.hitbox().x + SHURIKEN.hitbox.w < STAGE.floor.x) pastLedge = true;
  }
  assert.ok(pastLedge, 'flew on past the ledge');
  assert.ok(Math.abs(q.age - SHURIKEN.lifetime) < DT, 'its lifetime ended it');
  // A Void within reach takes it as soon as it has flown clean into it.
  const near = new StageCollision({ ...stageMap(), voidBounds: { left: -200, right: 2200, top: -600, bottom: 1600 } });
  const { fighter } = makeFighter({ stage: near });
  const proj = createProjectileDefinition({ id: 'shuriken', ...SHURIKEN });
  const v = new Projectile({ owner: fighter, def: proj, anim: fighter.sprites.projectile('shuriken'), x: 100, y: 762, direction: -1 });
  const list = [v];
  while (list.length) {
    v.update(DT, near);
    removeDeadProjectiles(list);
  }
  assert.ok(v.age < SHURIKEN.lifetime, 'the Void came first');
  const box = v.hitbox();
  assert.ok(box.x + box.w < -200 && box.x + box.w > -200 - SHURIKEN.speed * DT, 'just into the Void');
});

test('solid blocks stop a shuriken, the main floor\'s body included; one-way platforms and open air do not', () => {
  const stage = new StageCollision(stageMap({
    platforms: [{ id: 'ledge', x: 600, y: 760, w: 200, h: 16 }],
    solids: [{ id: 'rock', x: 1000, y: 740, w: 80, h: 60 }],
  }));
  const { fighter } = makeFighter();
  const proj = createProjectileDefinition({ id: 'shuriken', ...SHURIKEN });
  const p = new Projectile({ owner: fighter, def: proj, anim: fighter.sprites.projectile('shuriken'), x: 500, y: 762, direction: 1 });
  const list = [p];
  let passedPlatform = false;
  while (list.length) {
    p.update(DT, stage);
    if (p.x > 800 && p.alive) passedPlatform = true;
    removeDeadProjectiles(list);
  }
  assert.ok(passedPlatform, 'flew through the one-way platform');
  const box = p.hitbox();
  assert.ok(box.x + box.w > 1000 && box.x < 1000 + SHURIKEN.speed * DT, 'stopped at the rock face');
  // Above the rock, it flies on.
  const high = new Projectile({ owner: fighter, def: proj, anim: fighter.sprites.projectile('shuriken'), x: 500, y: 700, direction: 1 });
  for (let i = 0; i < 60; i++) high.update(DT, stage);
  assert.ok(high.alive && high.x > 1080);
  // Below the stage's top, out past its edge, the main floor's cliff face
  // stops it like any solid.
  const low = new Projectile({ owner: fighter, def: proj, anim: fighter.sprites.projectile('shuriken'), x: -300, y: 900, direction: 1 });
  while (low.alive) low.update(DT, stage);
  assert.ok(low.age < SHURIKEN.lifetime);
  const lb = low.hitbox();
  assert.ok(lb.x + lb.w > 0 && lb.x < SHURIKEN.speed * DT, 'stopped at the cliff face');
});

test('spawnProjectiles consumes each release once; removeDeadProjectiles keeps the rest in order', () => {
  const a = makeFighter();
  const b = makeFighter({ x: 900, facing: -1 });
  a.fighter.releases.push({ id: 'shuriken', offset: { x: 16, y: -38 }, direction: 1 });
  b.fighter.releases.push({ id: 'shuriken', offset: { x: 16, y: -38 }, direction: -1 });
  const list = [];
  spawnProjectiles([a.fighter, b.fighter], list);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((p) => p.owner), [a.fighter, b.fighter]);
  assert.equal(a.fighter.releases.length, 0);
  spawnProjectiles([a.fighter, b.fighter], list);
  assert.equal(list.length, 2, 'no second spawn');
  list[0].alive = false;
  removeDeadProjectiles(list);
  assert.deepEqual(list.map((p) => p.owner), [b.fighter]);
  a.fighter.reset(STAGE);
  assert.deepEqual(a.fighter.releases, []);
});

// ---- Missing art ----------------------------------------------------------------

test('missing Throw art refuses the Throw: no pose, no shuriken', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const keys = Object.keys(def.animations).filter((k) => k !== 'throw');
  const d = duel({ gap: 200, attackerSprites: fakeSprites(keys) });
  d.tick(THROW);
  assert.equal(d.attacker.combat.attack, null);
  assert.equal(d.attacker.state, 'idle', 'no idle-as-throw');
  for (let i = 0; i < 60; i++) d.tick(HOLD_THROW);
  assert.equal(d.projectiles.length, 0);
  assert.deepEqual(d.events, []);
  assert.match(warn.mock.calls[0].arguments[0], /Attack "throw" has no animation frames/);
});

test('missing shuriken art refuses the Throw: never an invisible damaging projectile', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const d = duel({ gap: 200, attackerSprites: fakeSprites(Object.keys(def.animations), []) });
  d.tick(THROW);
  assert.equal(d.attacker.combat.attack, null);
  assert.equal(d.attacker.state, 'idle');
  for (let i = 0; i < 90; i++) d.tick(i % 20 === 0 ? THROW : {});
  assert.equal(d.projectiles.length, 0);
  assert.deepEqual(d.events, []);
  assert.equal(d.target.combat.health, 100);
  assert.match(warn.mock.calls[0].arguments[0], /throws "shuriken", which has no animation frames/);
  // Even a stray release is never spawned without art.
  d.attacker.releases.push({ id: 'shuriken', offset: { x: 0, y: -40 }, direction: 1 });
  const list = [];
  spawnProjectiles([d.attacker], list);
  assert.deepEqual(list, []);
  assert.match(warn.mock.calls.at(-1).arguments[0], /Projectile "shuriken" has no animation frames/);
});

// ---- Ground only ------------------------------------------------------------------

test('Throw in the air does nothing: no ground art in the air, no shuriken, Jump / Fall continue', () => {
  for (const when of ['rising', 'falling']) {
    const d = range();
    d.tick(JUMP);
    if (when === 'falling') d.until(() => d.attacker.body.vy > 0);
    else d.tick();
    const plain = d.attacker.body.vy;
    d.tick(THROW);
    assert.equal(d.attacker.combat.attack, null);
    assert.ok(['jump', 'fall'].includes(d.attacker.state), d.attacker.state);
    assert.ok(d.attacker.body.vy > plain, 'gravity carries on');
    for (let i = 0; i < 30 && !d.attacker.grounded; i++) {
      d.tick(i % 5 ? HOLD_THROW : THROW);
      assert.notEqual(d.attacker.animator.anim.key, 'throw');
    }
    assert.equal(d.projectiles.length, 0);
    assert.deepEqual(d.attacker.releases, []);
    assert.equal(d.attacker.combat.cooldowns.has('throw'), false);
  }
});

// ---- Priority -------------------------------------------------------------------

test('Throw cuts straight out of Charge (no release pose); a held Charge restarts from charge1 after', () => {
  const d = range();
  const CHARGE = { charge: true };
  for (let i = 0; i < 30; i++) d.tick(CHARGE);
  assert.equal(d.attacker.state, 'charge');
  d.tick({ ...CHARGE, ...THROW });
  assert.equal(d.attacker.state, 'attack');
  assert.equal(frameName(d.attacker), '0001_throw1.png');
  const states = [];
  while (d.attacker.combat.attack) {
    d.tick(CHARGE);
    states.push(d.attacker.state);
  }
  assert.ok(!states.includes('chargeRelease'));
  assert.equal(d.attacker.state, 'charge');
  assert.equal(frameName(d.attacker), '0001_charge1.png');
  // Letting go of Charge during the Throw: no release pose afterwards either.
  const e = range();
  for (let i = 0; i < 30; i++) e.tick(CHARGE);
  e.tick(THROW);
  const after = [];
  while (e.attacker.combat.attack) e.tick();
  for (let i = 0; i < 10; i++) {
    e.tick();
    after.push(e.attacker.state);
  }
  assert.ok(!after.includes('chargeRelease'), after.join());
  assert.equal(e.projectiles.length, 1);
});

test('Throw pressed with Defense wins; no Dodge starts; Defense during the Throw does nothing', () => {
  const d = range();
  d.tick({ ...THROW, ...DEFENSE });
  assert.equal(d.attacker.combat.attack?.def.id, 'throw');
  assert.equal(d.attacker.combat.defenseAction, null, 'never both');
  // Presses while it plays are ignored, not buffered.
  for (let i = 1; i < steps(3 / THROW_FPS); i++) {
    d.tick(DEFENSE);
    assert.equal(d.attacker.combat.attack?.def.id, 'throw');
    assert.equal(d.attacker.combat.defenseAction, null);
    assert.notEqual(d.attacker.state, 'defense');
  }
  d.tick({ defense: true });
  assert.equal(d.attacker.combat.attack, null);
  assert.equal(d.attacker.combat.defenseAction, null, 'nothing was buffered');
  // BA1's same-step priority over Defense is unchanged.
  const b = range();
  b.tick({ action1: true, action1Pressed: true, ...DEFENSE });
  assert.equal(b.attacker.combat.attack?.def.id, 'ba1');
  assert.equal(b.attacker.combat.defenseAction, null);
});

test('Throw and its shuriken change no Energy', () => {
  const d = duel({ gap: 200 });
  d.tick(THROW);
  d.until(() => d.events.length > 0);
  for (let i = 0; i < 30; i++) d.tick();
  for (const f of [d.attacker, d.target]) {
    assert.equal(f.combat.energy, 100);
    assert.equal(f.combat.maxEnergy, 100);
  }
});

// ---- Input and CPU ----------------------------------------------------------------

test('J and gamepad X / Square still press the internal primary action, labelled Throw', async () => {
  const listeners = {};
  globalThis.window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  globalThis.document = { addEventListener() {}, hidden: false };
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
  const { InputManager } = await import('../js/core/input-manager.js');
  const input = new InputManager(CONFIG.bindings);
  const pressed = () => {
    const f = input.sample();
    return COMBAT_ACTIONS.filter((a) => f[`${a}Pressed`]);
  };
  assert.deepEqual(CONFIG.bindings.primary, ['KeyJ']);
  assert.equal(ACTION_LABELS.primary, 'Throw');
  listeners.keydown({ code: 'KeyJ', repeat: false, preventDefault() {} });
  assert.deepEqual(pressed(), ['primary']);
  assert.equal(input.sample().primaryPressed, false, 'one press edge per press');
  listeners.keyup({ code: 'KeyJ', repeat: false, preventDefault() {} });
  listeners.gamepadconnected();
  pad.buttons[2] = { pressed: true, value: 1 };
  input.pollGamepads(0);
  assert.deepEqual(pressed(), ['primary']);
  pad.buttons[2] = { pressed: false, value: 0 };
  input.pollGamepads(0);
  pad.buttons[3] = { pressed: true, value: 1 };
  input.pollGamepads(0);
  assert.deepEqual(pressed(), ['special'], 'Y / Triangle is still Special');
});

test('the training CPU never throws', async () => {
  const { TrainingAIController } = await import('../js/game/fighter-controller.js');
  const cpu = new TrainingAIController({ rng: () => 0.42 });
  const d = duel({ gap: 300 });
  for (let i = 0; i < 1500; i++) {
    const out = cpu.getInput(d.target, DT, SIM_CTX);
    assert.equal(out.primary, false);
    assert.equal(out.primaryPressed, false);
    d.tick(i % 200 < 100 ? { right: true } : { left: true }, out);
    assert.equal(d.target.combat.attack, null);
    assert.deepEqual(d.target.releases, []);
    assert.ok(d.projectiles.every((p) => p.owner !== d.target));
  }
});
