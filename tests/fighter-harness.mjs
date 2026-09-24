// Shared Fighter test harness (imported by the *.test.mjs files; not a test
// file itself). Runs the real Fighter, physics and SpriteSet resolve logic.
// Sprite sets carry clip metadata only (no decoded PNGs), so scale, anchoring
// and paint still need real-browser verification.
import assert from 'node:assert/strict';
import { getCharacter } from '../js/data/characters.js';
import { Fighter } from '../js/game/character.js';
import { CombatSystem } from '../js/game/combat.js';
import { spawnProjectiles, removeDeadProjectiles } from '../js/game/projectile.js';
import { StageCollision } from '../js/game/physics.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { CONFIG } from '../js/config.js';

export const def = getCharacter('0001');
export const DT = CONFIG.sim.step;
export const BASE = './assets/characters/0001/0001_';

// SpriteSet with the definition's clip metadata in place of decoded frames.
// `projectileKeys` picks which projectile animations have art.
export function fakeSprites(keys = Object.keys(def.animations), projectileKeys = Object.keys(def.projectileAnimations)) {
  const set = new SpriteSet(def);
  for (const key of keys) {
    const anim = def.animations[key];
    set.animations[key] = {
      key, fps: anim.fps, loop: anim.loop !== false,
      sourceFacing: anim.sourceFacing ?? def.sourceFacing ?? 1,
      frames: anim.frames.map((url) => ({ url })),
    };
  }
  for (const key of projectileKeys) {
    const anim = def.projectileAnimations[key];
    set.projectiles[key] = {
      key, fps: anim.fps, loop: anim.loop !== false, sourceFacing: anim.sourceFacing ?? 0,
      frames: anim.frames.map((url) => ({ url })),
    };
  }
  set.usable = true;
  return set;
}

export const STAGE = new StageCollision({
  groundLevel: 800,
  bounds: { left: 0, right: 2000 },
  platforms: [{ id: 'ledge', x: 900, y: 600, w: 200, h: 16 }],
  solids: [],
});

export const SIM_CTX = { stage: STAGE, gravity: CONFIG.sim.gravity };

export function makeFighter({ sprites = fakeSprites(), x = 500, y, facing = 1, character = def } = {}) {
  const input = {};
  const controller = { getInput: () => ({ ...input }) };
  const fighter = new Fighter({
    def: character, sprites, stage: STAGE, slot: 0, label: 'P1', controller,
    spawn: { x, y, facing },
  });
  const step = (held = {}) => {
    for (const k of Object.keys(input)) delete input[k];
    Object.assign(input, held);
    fighter.update(DT, SIM_CTX);
    return fighter;
  };
  return { fighter, step };
}

export const frameName = (f) => f.animator.frame?.url.split('/').pop();

// Steps until `pred` holds, returning the number of steps taken.
export function stepUntil(step, pred, held, limit = 600) {
  for (let i = 1; i <= limit; i++) if (pred(step(held))) return i;
  throw new Error('condition never reached');
}

// ---- Attack helpers (Basic Attack 1 and 2 tests) --------------------------

export const steps = (seconds) => Math.round(seconds / DT);
export const frameNo = (name) => Number(name.match(/(\d+)\.png$/)[1]);

// Records every step of an attack until the fighter leaves the attack state.
export function recordAttack(step, held) {
  const log = [];
  let f = step(held);
  while (f.state === 'attack') {
    log.push({ id: f.combat.attack.def.id, phase: f.combat.phase, frame: frameName(f), anim: f.animator.anim.key, grounded: f.grounded });
    f = step();
  }
  return log;
}

// Consecutive duplicates removed: the order frames were shown in.
export const sequence = (log) => log.map((s) => s.frame).filter((n, i, a) => n !== a[i - 1]);

// Two fighters, their projectiles and the real CombatSystem, stepped in
// Battle.update()'s order. `targetCharacter` swaps in another definition
// (e.g. a Block-type fighter).
export function duel({ gap = 44, attackerFacing = 1, attackerSprites, targetSprites, targetCharacter } = {}) {
  const x = 500;
  const a = makeFighter({ x, facing: attackerFacing, sprites: attackerSprites });
  const b = makeFighter({
    x: x + gap * attackerFacing, facing: -attackerFacing, sprites: targetSprites, character: targetCharacter,
  });
  a.fighter.opponent = b.fighter;
  b.fighter.opponent = a.fighter;
  const system = new CombatSystem();
  const events = [];
  const projectiles = [];
  const fighters = [a.fighter, b.fighter];
  const tick = (held = {}, targetHeld = {}) => {
    a.step(held);
    b.step(targetHeld);
    spawnProjectiles(fighters, projectiles);
    for (const p of projectiles) p.update(DT, STAGE);
    events.push(...system.update(fighters, projectiles));
    removeDeadProjectiles(projectiles);
  };
  // Ticks until `pred` holds; fails instead of hanging.
  const until = (pred, limit = 600) => {
    for (let i = 0; i < limit && !pred(); i++) tick();
    assert.ok(pred(), 'condition never reached');
  };
  return { attacker: a.fighter, target: b.fighter, tick, until, events, projectiles };
}
