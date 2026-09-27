import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { getCharacter, characterFramePaths } from '../js/data/characters.js';
import { fakeSpritesOf, makeFighter } from './fighter-harness.mjs';
import { mobileAbility } from '../js/ui/mobile-abilities.js';
const def = getCharacter('0002');
test('#0002 registers only its seven finished frames and an idle portrait', () => {
  assert.equal(def.available, true);
  assert.equal(def.rosterSlot, 1);
  assert.deepEqual(Object.keys(def.animations), ['idle', 'run']);
  assert.equal(def.animations.idle.frames.length, 5);
  assert.equal(def.animations.run.frames.length, 2);
  assert.equal(def.visual.portrait.animation, 'idle');
  assert.equal(characterFramePaths(def).length, 7);
  for (const path of characterFramePaths(def)) assert.ok(existsSync(new URL('../' + path, import.meta.url)));
});
test('#0002 moves, returns to idle and holds its own art in missing states', () => {
  const sprites = fakeSpritesOf(def);
  const { fighter, step } = makeFighter({ character: def, sprites });
  for (let i = 0; i < 20; i++) step({ runRight: true });
  assert.equal(fighter.animator.stateKey, 'run');
  for (let i = 0; i < 30; i++) step();
  assert.equal(fighter.animator.stateKey, 'idle');
  for (const key of Object.keys(def.animationFallbacks)) {
    fighter.animator.play(key); fighter.animator.update(1);
    assert.equal(fighter.animator.frame, sprites.animations.idle.frames[0]);
    assert.equal(fighter.animator.hold, 0);
  }
});
test('#0002 unfinished actions are reserved, harmless and use no borrowed combat data', () => {
  const { fighter, step } = makeFighter({ character: def, sprites: fakeSpritesOf(def) });
  for (const action of ['ba1', 'ba2', 'uniqueba', 'transform', 'shield']) {
    for (let i = 0; i < 30; i++) step({ [action]: true, [`${action}Pressed`]: true });
    assert.equal(fighter.technique, null);
    if (action !== 'shield') assert.equal(mobileAbility(def, action).pending, true);
  }
  for (const key of ['attacks', 'projectiles', 'summons', 'chargedTechniques', 'chargedActions']) assert.deepEqual(def[key], {});
  assert.equal(def.defense, null);
});
