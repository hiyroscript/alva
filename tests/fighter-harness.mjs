// Shared Fighter test harness (imported by the *.test.mjs files; not a test
// file itself). Runs the real Fighter, physics and SpriteSet resolve logic.
// Sprite sets carry clip metadata only (no decoded PNGs), so scale, anchoring
// and paint still need real-browser verification.
import { getCharacter } from '../js/data/characters.js';
import { Fighter } from '../js/game/character.js';
import { StageCollision } from '../js/game/physics.js';
import { SpriteSet } from '../js/game/sprite-normalizer.js';
import { CONFIG } from '../js/config.js';

export const def = getCharacter('0001');
export const DT = CONFIG.sim.step;
export const BASE = './assets/characters/0001/0001_';

// SpriteSet with the definition's clip metadata in place of decoded frames.
export function fakeSprites(keys = Object.keys(def.animations)) {
  const set = new SpriteSet(def);
  for (const key of keys) {
    const anim = def.animations[key];
    set.animations[key] = {
      key, fps: anim.fps, loop: anim.loop !== false,
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
