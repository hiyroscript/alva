// Shared Fighter test harness (imported by the *.test.mjs files; not a test
// file itself). Runs the real Fighter, physics and SpriteSet resolve logic.
// Sprite sets carry clip metadata only (no decoded PNGs), so scale, anchoring
// and paint still need real-browser verification.
import assert from 'node:assert/strict';
import { getCharacter } from '../js/data/characters.js';
import { Fighter } from '../js/game/character.js';
import { CombatSystem } from '../js/game/combat.js';
import { spawnProjectiles, removeDeadProjectiles } from '../js/game/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../js/game/clone.js';
import { StageCollision, separate, resolveSolidOverlap } from '../js/game/physics.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { CONFIG } from '../js/config.js';

export const def = getCharacter('0001');
export const DT = CONFIG.sim.step;
export const BASE = './assets/characters/0001/0001_';

// SpriteSet with the definition's clip metadata in place of decoded frames.
// `projectileKeys` and `effectKeys` pick which projectile and effect
// animations have art.
export function fakeSprites(
  keys = Object.keys(def.animations),
  projectileKeys = Object.keys(def.projectileAnimations),
  effectKeys = Object.keys(def.effectAnimations),
) {
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
  for (const key of effectKeys) {
    const anim = def.effectAnimations[key];
    set.effects[key] = {
      key, fps: anim.fps, loop: anim.loop !== false, sourceFacing: anim.sourceFacing ?? 0,
      frames: anim.frames.map((url) => ({ url })),
    };
  }
  set.usable = true;
  return set;
}

// A test stage in the maps' schema (js/data/maps.js): a finite main floor
// with its top at `top` from `left` to `right`, and the Void far around it.
export function stageMap({ left = 0, right = 2000, top = 800, platforms = [], solids = [] } = {}) {
  return {
    mainStage: { left, right, top, bottom: top + 800 },
    voidBounds: { left: left - 900, right: right + 900, top: top - 1400, bottom: top + 800 },
    cameraBounds: { left: left - 1000, right: right + 1000, top: top - 1500, bottom: top + 900 },
    platforms,
    solids,
  };
}

export const STAGE = new StageCollision(stageMap({
  platforms: [{ id: 'ledge', x: 900, y: 600, w: 200, h: 16 }],
}));

export const SIM_CTX = { stage: STAGE, gravity: CONFIG.sim.gravity };

// `stage` swaps in another StageCollision (ledges, walls).
export function makeFighter({ sprites = fakeSprites(), x = 500, y, facing = 1, character = def, stage = STAGE } = {}) {
  const input = {};
  const controller = { getInput: () => ({ ...input }) };
  const fighter = new Fighter({
    def: character, sprites, stage, slot: 0, label: 'P1', controller,
    spawn: { x, y, facing },
  });
  const ctx = stage === STAGE ? SIM_CTX : { stage, gravity: CONFIG.sim.gravity };
  const step = (held = {}) => {
    for (const k of Object.keys(input)) delete input[k];
    Object.assign(input, held);
    fighter.update(DT, ctx);
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

// Two fighters, their projectiles and clones and the real CombatSystem,
// stepped in Battle.update()'s order. `targetCharacter` swaps in another
// definition (e.g. a Block-type fighter); `targetFacing` overrides the
// target's starting facing (by default it faces the attacker). `stage`
// and `x` (the attacker's spawn) place them; `pushboxes` also keeps the two
// bodies apart and out of solids, as Battle.update() does.
export function duel({
  gap = 44, attackerFacing = 1, attackerSprites, targetSprites, targetCharacter, targetFacing = -attackerFacing,
  stage = STAGE, x = 500, pushboxes = false,
} = {}) {
  const a = makeFighter({ x, facing: attackerFacing, sprites: attackerSprites, stage });
  const b = makeFighter({
    x: x + gap * attackerFacing, facing: targetFacing, sprites: targetSprites, character: targetCharacter, stage,
  });
  a.fighter.opponent = b.fighter;
  b.fighter.opponent = a.fighter;
  const system = new CombatSystem();
  const events = [];
  const projectiles = [];
  const clones = [];
  const fighters = [a.fighter, b.fighter];
  const tick = (held = {}, targetHeld = {}) => {
    a.step(held);
    b.step(targetHeld);
    if (pushboxes) {
      separate(a.fighter.body, b.fighter.body, a.fighter.def.pushbox.width / 2, b.fighter.def.pushbox.width / 2, stage);
      for (const f of fighters) resolveSolidOverlap(f.body, stage);
    }
    spawnProjectiles(fighters, projectiles);
    for (const p of projectiles) p.update(DT, stage);
    updateClones(clones, DT);
    spawnClones(fighters, clones, stage);
    events.push(...system.update(fighters, projectiles, clones));
    removeDeadProjectiles(projectiles);
    removeDeadClones(clones);
  };
  // Ticks until `pred` holds; fails instead of hanging.
  const until = (pred, limit = 600) => {
    for (let i = 0; i < limit && !pred(); i++) tick();
    assert.ok(pred(), 'condition never reached');
  };
  return { attacker: a.fighter, target: b.fighter, tick, until, events, projectiles, clones };
}
