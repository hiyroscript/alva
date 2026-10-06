// Shared Fighter test harness (imported by the *.test.mjs files; not a test
// file itself). Runs the real Fighter, physics and SpriteSet resolve logic.
// Sprite sets carry clip metadata only (no decoded PNGs), so scale, anchoring
// and paint still need real-browser verification.
import assert from 'node:assert/strict';
import { getCharacter } from '../../js/data/characters.js';
import { Fighter, separateFighters } from '../../js/game/fighters/fighter.js';
import { CombatSystem } from '../../js/game/combat/combat.js';
import { spawnProjectiles, removeDeadProjectiles, clashProjectiles } from '../../js/game/combat/projectile.js';
import { spawnClones, updateClones, removeDeadClones } from '../../js/game/combat/summon.js';
import { applyPulls } from '../../js/game/combat/pull.js';
import { StageCollision, resolveSolidOverlap } from '../../js/game/physics.js';
import { SpriteSet } from '../../js/game/rendering/sprite-normalizer.js';
import { CombatAIController } from '../../js/game/ai/combat-ai.js';
import { mulberry32 } from '../../js/core/utils.js';
import { CONFIG } from '../../js/config.js';

// The fighter the harness builds when a test names none: #0001, the first
// in the roster. A convenience default, not a reference fighter. Tests of
// #0001's own moves rely on it on purpose; a test of a shared mechanic
// should say which fighter it runs (pass `character` to makeFighter /
// duel, or use harnessFor below), so it never passes only because one
// fighter happens to have particular values.
export const DEFAULT_CHARACTER = getCharacter('0001');
// The default's definition, under the name the older tests import it by.
export const def = DEFAULT_CHARACTER;
export const DT = CONFIG.sim.step;

// The start of every art path of fighter `id`: `${assetBase(id)}idle_1.png`.
export const assetBase = (id) => `./assets/characters/${id}/${id}_`;
// The default fighter's (#0001's) art path start.
export const BASE = assetBase(DEFAULT_CHARACTER.id);

// SpriteSet with the default fighter's (#0001's) clip metadata in place of
// decoded frames. `projectileKeys` and `effectKeys` pick which projectile
// and effect animations have art.
export function fakeSprites(
  keys = Object.keys(DEFAULT_CHARACTER.animations),
  projectileKeys = Object.keys(DEFAULT_CHARACTER.projectileAnimations ?? {}),
  effectKeys = Object.keys(DEFAULT_CHARACTER.effectAnimations ?? {}),
) {
  return fakeSpritesOf(DEFAULT_CHARACTER, keys, projectileKeys, effectKeys);
}

// The same for any character: every clip, projectile and effect it
// declares has art unless the keys say otherwise.
export function fakeSpritesOf(
  character,
  keys = Object.keys(character.animations),
  projectileKeys = Object.keys(character.projectileAnimations ?? {}),
  effectKeys = Object.keys(character.effectAnimations ?? {}),
) {
  const set = new SpriteSet(character);
  for (const key of keys) {
    const anim = character.animations[key];
    set.animations[key] = {
      key, fps: anim.fps, loop: anim.loop !== false,
      sourceFacing: anim.sourceFacing ?? character.sourceFacing ?? 1,
      frames: anim.frames.map((url) => ({ url })),
    };
  }
  for (const key of projectileKeys) {
    const anim = character.projectileAnimations[key];
    set.projectiles[key] = {
      key, fps: anim.fps, loop: anim.loop !== false, sourceFacing: anim.sourceFacing ?? 0,
      frames: anim.frames.map((url) => ({ url })),
    };
  }
  for (const key of effectKeys) {
    const anim = character.effectAnimations[key];
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

// One fighter on its own, stepped by hand. `character` is the definition it
// is built from (the default fighter when left out) and `sprites` its art
// (by default every clip `character` declares). `stage` swaps in another
// StageCollision (ledges, walls).
export function makeFighter({ character = DEFAULT_CHARACTER, sprites = fakeSpritesOf(character), x = 500, y, facing = 1, stage = STAGE } = {}) {
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

// ---- Attack helpers ----------------------------------------------------

export const steps = (seconds) => Math.round(seconds / DT);

// Fixed steps a summon's startup lasts: one pass of `character`'s summon
// `id`'s startupAnimation (0 for a summon without one). Its clone is queued
// this many steps after the press step: the press step and the steps after
// it show the startup, and the next one sends the clone out.
export function startupSteps(character, id) {
  const clip = character.animations?.[character.summons?.[id]?.startupAnimation];
  return clip ? steps(clip.frames.length / clip.fps) : 0;
}
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
// stepped in Battle.update()'s order. `attackerCharacter` and
// `targetCharacter` swap in other definitions (e.g. one with no Energy
// refill, or another fighter altogether; each gets its own art unless
// `attackerSprites` / `targetSprites` say otherwise); `targetFacing` overrides the
// target's starting facing (by default it faces the attacker). `stage`
// and `x` (the attacker's spawn) place them; `pushboxes` also keeps the two
// bodies apart and out of solids, as Battle.update() does.
export function duel({
  gap = 44, attackerFacing = 1, attackerSprites, attackerCharacter, targetSprites, targetCharacter, targetFacing = -attackerFacing,
  stage = STAGE, x = 500, pushboxes = false,
} = {}) {
  const a = makeFighter({ x, facing: attackerFacing, sprites: attackerSprites, character: attackerCharacter, stage });
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
      separateFighters(a.fighter, b.fighter, stage);
      for (const f of fighters) resolveSolidOverlap(f.body, stage);
    }
    spawnProjectiles(fighters, projectiles);
    for (const p of projectiles) p.update(DT, stage);
    clashProjectiles(projectiles);
    updateClones(clones, DT);
    spawnClones(fighters, clones, stage);
    applyPulls(fighters, projectiles, DT);
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

// Two CPUs (CombatAIController) in a real fight on a flat stage, stepped in
// Battle.update's order. Returns every step's inputs and states, keyed by
// fighter; `cooling` lists the summons and techniques cooling down after
// the step. `spritesA` / `spritesB` swap in other art (by default each
// fighter's every clip).
export function cpuFight(defA, defB, { seconds = 30, seed = 3, difficulty = 'brutal', spritesA, spritesB } = {}) {
  const stage = new StageCollision(stageMap());
  const make = (def, sprites, x, facing, slot, n) => new Fighter({
    def, sprites: sprites ?? fakeSpritesOf(def), stage, slot, label: `CPU ${n}`, spawn: { x, facing },
    controller: new CombatAIController({ difficulty, rng: mulberry32(seed + n) }),
  });
  const a = make(defA, spritesA, 900, 1, 'p1', 1);
  const b = make(defB, spritesB, 1100, -1, 'p2', 2);
  a.opponent = b;
  b.opponent = a;
  const world = { stage, projectiles: [], clones: [], combat: new CombatSystem(), score: { p1: 0, p2: 0 }, timeLeft: 99, fighters: [a, b] };
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: world };
  const log = new Map([[a, []], [b, []]]);
  const events = [];
  for (let n = 0; n < seconds / DT; n++) {
    for (const f of world.fighters) {
      if (f.lostToVoid) continue;
      f.update(DT, ctx);
      log.get(f).push({
        ...f.controller.out, attack: f.combat.attack?.def.id ?? null, shielding: f.combat.shielding,
        state: f.state, grounded: f.grounded, frame: frameName(f), cooling: [...f.combat.abilityCooldowns.entries.keys()],
      });
      // Back on stage at once if the Void takes one: the fight goes on.
      if (f.body.y > 1600 || Math.abs(f.body.x - 1000) > 1800) f.respawn(stage);
    }
    separateFighters(a, b, stage);
    for (const f of world.fighters) resolveSolidOverlap(f.body, stage);
    spawnProjectiles(world.fighters, world.projectiles);
    for (const p of world.projectiles) p.update(DT, stage);
    clashProjectiles(world.projectiles);
    updateClones(world.clones, DT);
    spawnClones(world.fighters, world.clones, stage);
    applyPulls(world.fighters, world.projectiles, DT);
    events.push(...world.combat.update(world.fighters, world.projectiles, world.clones));
    removeDeadProjectiles(world.projectiles);
    removeDeadClones(world.clones);
  }
  return { a, b, log, events, world };
}

// The harness bound to one fighter: the same helpers, built from
// `character` (its own definition and art) instead of the default. For
// tests that run a shared mechanic over several fighters:
//
//   for (const c of playableCharacters()) {
//     const { makeFighter } = harnessFor(c);
//     ...
//   }
export function harnessFor(character) {
  return {
    def: character,
    fakeSprites: (...keys) => fakeSpritesOf(character, ...keys),
    makeFighter: (opts = {}) => makeFighter({ character, ...opts }),
    duel: (opts = {}) => duel({ attackerCharacter: character, targetCharacter: character, ...opts }),
  };
}
