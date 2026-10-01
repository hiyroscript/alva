// Run with node --test tests/fighter-0002.test.mjs (no dependencies).
// #0002, the speedster: registered from CHARACTERS alone in roster slot 02,
// its clips cut from one sprite sheet into its own folder and read from the
// real PNGs (tight, 1x, one art-pixel scale, anchored on the body), three
// ordinary numbered buttons, and every move a mechanic of its own: the One-Two's two
// strikes, the lock-on Homing Attack, the Rapid Kicks' held flurry, the
// Bounce Attack's plunge and rebound, the Spin Attack's roll, the Blue
// Tornado's carrying lift and free fall, and the Whirlwind's travelling,
// piercing tornado. Then the engine rules they are built on (strikes,
// motions, carry, piercing projectiles, per-airtime starts, the vertical
// anchor), the CPU playing them, and its touch buttons and names. The
// roster, credits and translations it adds are checked in empty-roster,
// settings and i18n. Layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import {
  DT, STAGE, cpuFight, duel, fakeSpritesOf, frameName, makeFighter, stageMap, stepUntil, steps,
} from './fighter-harness.mjs';
import { CONFIG, NUMBERED_ATTACKS } from '../js/config.js';
import { CHARACTERS, characterFramePaths, getCharacter, playableCharacters } from '../js/data/characters.js';
import { abilityName } from '../js/data/abilities.js';
import { describeLoadout, loadoutProblems, specialAttacks } from '../js/data/loadout.js';
import { attackReach, createAttackDefinition, strikeLive } from '../js/game/combat.js';
import { createProjectileDefinition } from '../js/game/projectile.js';
import { CombatAIController, readMoveset } from '../js/game/combat-ai.js';
import { Fighter } from '../js/game/character.js';
import { SpriteSet, drawFrame } from '../js/game/sprite-normalizer.js';
import { StageCollision } from '../js/game/physics.js';
import { mulberry32 } from '../js/core/utils.js';
import { mobileAbility, previewFrame } from '../js/ui/mobile-abilities.js';
import { ICONS } from '../js/ui/icons.js';
import { STRINGS, setLanguage } from '../js/core/i18n.js';

const ROOT = new URL('../', import.meta.url).pathname;
const DIR = 'assets/characters/0002/';
const DEF = getCharacter('0002');
const DEF_0001 = getCharacter('0001');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const named = (codename, n) => range(n).map((i) => `0002_${codename}_${i}.png`);

// #0002 on its own, and against a target (#0001 by default) at `gap`.
const solo = (opts = {}) => makeFighter({ character: DEF, sprites: SPRITES, ...opts });
const versus = (opts = {}) => duel({
  attackerCharacter: DEF, attackerSprites: SPRITES,
  targetCharacter: DEF_0001, targetSprites: fakeSpritesOf(DEF_0001), ...opts,
});
// Steps until the fighter is in the air and rising well clear of the ground.
const airborne = (step, rise = 8) => {
  step(P('jump'));
  for (let i = 0; i < rise; i++) step({});
};

// ---- Real art (a PNG decoder and just enough canvas for the normalizer) ---------

function decodePng(path) {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  let header = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      header = [data[8], data[9], data[12]];
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  assert.deepEqual(header, [8, 6, 0], `${path}: 8-bit RGBA, not interlaced`);
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

const IMAGES = new Map(characterFramePaths(DEF).map((url) => [url, decodePng(ROOT + url.slice(2))]));
const REAL = withFakeCanvas(() => SpriteSet.build(DEF, (url) => IMAGES.get(url)));

// Every clip and the files it plays, in order.
const CLIPS = {
  idle: named('idle', 8),
  run: named('run', 12),
  jump: named('jump', 8),
  fall: named('fall', 1),
  mouvment: named('mouvment', 4),
  hurt: named('hurt', 1),
  midair_hurt: named('midair_hurt', 1),
  shielding: named('shielding', 1),
  attack1: named('attack1', 4),
  midair_attack1: named('midair_attack1', 8),
  attack2: [...named('attack2', 4), ...named('attack2', 4)],
  midair_attack2: named('midair_attack2', 8),
  attack3: named('attack3', 8),
  midair_attack3: named('midair_attack3', 4),
  extra_attack: named('extra_attack', 9),
};
const FILES = [...new Set([...Object.values(CLIPS).flat(), ...named('extra_attack_object', 4)])].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 39, run: 40, jump: 30, fall: 48, mouvment: 36, hurt: 42, midair_hurt: 32, shielding: 39,
  attack1: 39, midair_attack1: 30, attack2: 80, midair_attack2: 30, attack3: 30, midair_attack3: 46, extra_attack: 39,
};

// ---- Registration ---------------------------------------------------------------

test('#0002 is a real CHARACTERS entry: available, in roster slot 02, after #0001', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0002'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0002');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 1);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
});

test('no summon or technique: every numbered button an ordinary attack, and Energy with its one refill rate', () => {
  for (const field of ['summons', 'techniques', 'stats']) assert.equal(DEF[field], undefined, field);
  assert.deepEqual(specialAttacks(DEF), []);
  assert.deepEqual(Object.keys(DEF.energy).sort(), ['dashCancelCost', 'dashCost', 'max', 'regen', 'shieldHitCost']);
});

test('three numbered attacks, each a button of its own with its mid-air version, plus the extra_attack; Transform reserved', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    transform: null,
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { ground: 'attack3', air: 'midair_attack3' },
  });
  assert.deepEqual(describeLoadout(DEF), {
    numbered: ['attack1', 'attack2', 'attack3'],
    buttons: ['attack1', 'attack2', 'attack3'],
    air: { attack1: 'midair_attack1', attack2: 'midair_attack2', attack3: 'midair_attack3' },
    types: { attack1: 'attack', attack2: 'attack', attack3: 'attack' },
    extra: true,
  });
  assert.deepEqual(Object.keys(DEF.attacks).sort(), [
    'attack1', 'attack2', 'attack3', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3',
  ]);
  for (const [id, atk] of Object.entries(DEF.attacks)) assert.equal(atk.animation, id, `${id} plays its own clip`);
  assert.deepEqual(Object.keys(DEF.projectiles), ['extra_attack_object']);
  assert.equal(DEF.attacks.extra_attack.projectile.id, 'extra_attack_object');
});

test('its attack3 is an ordinary attack by its data alone: made a summon with no summon behind it, the loadout refuses it', () => {
  const summoned = { ...DEF, actions: { ...DEF.actions, attack3: { type: 'summon', id: 'attack3' } } };
  assert.ok(loadoutProblems(summoned).some((p) => /summons attack3, which is not in `summons`/.test(p)));
});

test('its in-game names and touch buttons name each move, in English and French', () => {
  assert.deepEqual(
    [...NUMBERED_ATTACKS.slice(0, 3), ...NUMBERED_ATTACKS.slice(0, 3).map((a) => `midair_${a}`), 'extra_attack'].map((m) => abilityName(DEF, m)),
    ['One-Two', 'Rapid Kicks', 'Spin Attack', 'Homing Attack', 'Bounce Attack', 'Blue Tornado', 'Whirlwind'],
  );
  assert.equal(abilityName(DEF, 'attack4'), 'Attack 4', 'what it does not have keeps the neutral name');
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Whirlwind', 'Punch', 'Kick', 'Spin']);
  assert.deepEqual(buttons('fr'), ['Tourbillon', 'Coup de poing', 'Coup de pied', 'Vrille']);
  // Each shows a frame of its own move's art, in its own colours: the
  // Whirlwind sending its tornado off, the One-Two's straight, the Rapid
  // Kicks, the Spin Attack's ball; and Jump its own jump, curling up.
  const art = (a) => previewFrame(DEF, a)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'jump'].map(art), [
    '0002_extra_attack_6.png', '0002_attack1_4.png', '0002_attack2_2.png', '0002_attack3_5.png', '0002_jump_1.png',
  ]);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3']) {
    const ability = mobileAbility(DEF, a);
    assert.equal(ability.sprite.url, DEF.animations[DEF.mobileAbilities[a].preview.animation].frames[DEF.mobileAbilities[a].preview.frame]);
    assert.ok(existsSync(`${ROOT}${ability.sprite.url.slice(2)}`), a);
    assert.equal(ability.sprite.mirrored, false, 'drawn facing right, as the buttons read');
  }
  assert.equal(DEF.mobileAbilities.extra_attack.preview.frame, Math.round(DEF.attacks.extra_attack.projectile.spawnAt * DEF.animations.extra_attack.fps), 'the frame its tornado leaves on');
  assert.notEqual(art('jump'), art('attack3'), 'Jump never looks like the Spin');
  assert.equal(mobileAbility(DEF, 'attack4'), null, 'no fourth button');
  assert.equal(mobileAbility(DEF, 'transform').pending, true, 'Transform reserved');
  assert.equal(mobileAbility(DEF, 'transform').icon, ICONS.transform, 'Transform keeps its star');
  assert.equal(mobileAbility(DEF, 'transform').sprite, null);
  assert.equal(STRINGS.fr['ability.0002.attack3'], 'Vrille');
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips play: every file named <id>_<codename>_<frame>.png', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 85);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(DEF.projectileAnimations.extra_attack_object.frames.map(file), named('extra_attack_object', 4));
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
});

test('every frame is cut clean: no green sheet background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 0 && g === 90 && b === 20), `${name}: none of the sheet's green`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, #0001\'s size per art pixel', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 39);
  assert.ok(Math.abs(REAL.worldPerArt - 88 / 52) < 1e-9, 'the same world size per art pixel as #0001');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.equal(anim.maxArtH, HEIGHTS[key], `${key}: tallest frame`);
    for (const f of anim.frames) {
      assert.ok(Math.abs(f.unit - 1) < 1e-9, `${key}: one file pixel per art pixel`);
      assert.equal(f.artW, IMAGES.get(f.url).naturalWidth);
      assert.equal(f.artH, IMAGES.get(f.url).naturalHeight);
    }
  }
  for (const f of REAL.projectile('extra_attack_object').frames) {
    assert.equal(f.unit, 1);
    assert.equal(f.anchorArtY, f.artH / 2, 'the tornado is centred on the projectile');
  }
});

test('anchors keep the body in place: authored on the ball, the tornado, the whirlwind and the planted feet', () => {
  for (const key of ['jump', 'midair_attack1', 'midair_attack2', 'attack3', 'midair_attack3']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtX, f.artW / 2, `${key}: spun on its own middle`);
  }
  assert.deepEqual(REAL.animations.attack1.frames.map((f) => f.anchorArtX), [14, 13, 13, 13]);
  assert.deepEqual(REAL.animations.extra_attack.frames.map((f) => f.anchorArtX), [16, 23.5, 23.5, 25.5, 25.5, 28, 29, 26, 25]);
  // The Rapid Kicks' feet are above the bottom of the art: its trails
  // sweep below the standing foot, and must not lift the body.
  const kicks = REAL.animations.attack2.frames;
  assert.deepEqual(kicks.map((f) => f.anchorArtY), [59, 57, 59, 61, 59, 57, 59, 61]);
  for (const f of kicks) assert.ok(f.anchorArtY < f.artH, 'the feet above the trails');
  // Everything else stands on the bottom of its art.
  for (const key of ['idle', 'run', 'fall', 'hurt', 'shielding', 'extra_attack']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, key);
  }
});

test('drawFrame puts a frame\'s feet (its anchorY) on the point it is drawn at', () => {
  const calls = [];
  const ctx = {
    save() {}, restore() {}, scale() {},
    translate: (x, y) => calls.push(['translate', x, y]),
    drawImage: (...args) => calls.push(['drawImage', ...args.slice(1)]),
  };
  const kick = REAL.animations.attack2.frames[0];
  drawFrame(ctx, kick, 100, 200, 2, false);
  assert.deepEqual(calls.at(-1), ['drawImage', -Math.round(kick.anchorArtX * 2), -118, kick.artW * 2, kick.artH * 2]);
  const idle = REAL.animations.idle.frames[0];
  drawFrame(ctx, idle, 100, 200, 2, false);
  assert.equal(calls.at(-1)[2], -Math.round(idle.artH * 2), 'a frame with no anchorY stands on its bottom, as ever');
});

test('the roster portrait is its face', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(39 * 0.62));
});

// ---- Down ------------------------------------------------------------------------------

test('Down on the ground is nothing: no state, no faster refill, and a Dash still starts while it is held', () => {
  const { fighter, step } = solo();
  fighter.combat.setEnergy(50);
  for (let i = 0; i < 30; i++) step({ down: true });
  assert.equal(fighter.state, 'idle');
  assert.ok(Math.abs(fighter.combat.energy - (50 + 30 * DT * DEF.energy.regen)) < 1e-6, 'the normal refill only');
  // Walking still works with Down held: nothing locks the fighter in place.
  for (let i = 0; i < 10; i++) step({ down: true, runRight: true });
  assert.ok(fighter.body.vx > 100);
  step({ down: true });
  for (let i = 0; i < 12; i++) step({ down: true });
  step({ down: true, runRight: true, runRightPressed: true });
  step({ down: true });
  step({ down: true, runRight: true, runRightPressed: true });
  assert.ok(fighter.dash, 'a double tap Dashes, Down held or not');
});

test('in the air Down still fast-falls', () => {
  const { fighter, step } = solo();
  step(P('jump'));
  stepUntil(step, (f) => f.body.vy > 0, {});
  step({ down: true });
  assert.equal(fighter.fastFalling, true);
});

test('the CPU plans no summon or technique with it: it has none', () => {
  const s = makeFighter({ character: DEF, sprites: SPRITES });
  const foe = makeFighter({ x: 1200, facing: -1 });
  s.fighter.opponent = foe.fighter;
  foe.fighter.opponent = s.fighter;
  const ai = new CombatAIController({ difficulty: 'brutal', rng: mulberry32(1) });
  assert.deepEqual(readMoveset(s.fighter).specials, []);
  assert.deepEqual(ai.specialOptions({ self: s.fighter, p: ai.profile, canAct: true, grounded: true, ms: readMoveset(s.fighter) }), []);
});

// ---- attack1: the One-Two ----------------------------------------------------------------

test('the One-Two strikes twice in one press: the jab on frame 2 holds, the straight on frame 4 pushes', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack1'));
  d.until(() => d.events.length === 2);
  const [jab, straight] = d.events;
  assert.deepEqual([jab.move, jab.damage, jab.baseLaunch, jab.launchSpeed], ['attack1', 1, 0, 0]);
  assert.deepEqual([straight.move, straight.damage, straight.baseLaunch, straight.directionalLaunch], ['attack1', 2, 1, 'horizontal']);
  assert.equal(straight.finalLaunch.x, 30, 'Base Launch 1 x the 3 Launch Point, sideways');
  assert.ok(straight.launchPointBefore === 1, 'the jab\'s Launch Point is there first');
  const def = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.deepEqual(def.hits.map((h) => h.at * 15), [1, 3], 'frames 2 and 4');
  assert.equal(def.damage, 3, 'the whole attack: its strikes\' sum');
  assert.equal(def.startup, 1 / 15);
  assert.ok(Math.abs(def.total - 5 / 15) < 1e-9);
});

// ---- attack2: the Rapid Kicks ------------------------------------------------------------

test('the Rapid Kicks: a 0.2 s wind-up, three kicks that hold the target, then the fourth flings it', () => {
  const d = versus({ gap: 44 });
  d.tick(P('attack2'));
  d.until(() => d.events.length === 4);
  const kicks = d.events;
  assert.deepEqual(kicks.map((e) => e.damage), [1, 1, 1, 3]);
  assert.deepEqual(kicks.slice(0, 3).map((e) => e.launchSpeed), [0, 0, 0], 'held in place');
  assert.deepEqual([kicks[3].baseLaunch, kicks[3].directionalLaunch], [2, 'horizontal']);
  assert.equal(kicks[3].finalLaunch.x, 2 * 6 * 10);
  // Each kick's stun outlasts the gap to the next: the target never gets out.
  const def = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  for (let i = 0; i < 3; i++) assert.ok(def.hits[i].hitstun > def.hits[i + 1].at - def.hits[i].at + def.hits[i].hitstop);
  assert.equal(def.startup, 4 / 20);
  assert.equal(def.hitCancel, null, 'no hit-cancel: a committed flurry');
  assert.ok(def.cooldown > def.hits[3].hitstun, 'free again well before another flurry');
});

test('a Shield stops the flurry at the kick it blocks: one block, one Energy cost, no later kick', () => {
  const d = versus({ gap: 44 });
  d.tick(P('attack2'), { shield: true });
  for (let i = 0; i < 40; i++) d.tick({}, { shield: true });
  assert.deepEqual(d.events.map((e) => e.type), ['block']);
  assert.equal(d.events[0].energyCost, DEF_0001.energy.shieldHitCost, 'one kick\'s cost');
  assert.equal(d.events[0].damage, 0);
});

// ---- midair_attack1: the Homing Attack ------------------------------------------------------

test('the Homing Attack hangs for the lock-on, then dashes at its opponent, re-aimed every step', () => {
  const d = versus({ gap: 190 });
  const { attacker: me } = d;
  d.tick(P('jump'));
  for (let i = 0; i < 9; i++) d.tick();
  d.tick(P('attack1'));
  assert.equal(me.combat.attack.def.id, 'midair_attack1');
  // The hang: no gravity, no rise.
  for (let i = 0; i < 7; i++) {
    d.tick();
    assert.equal(me.body.vy, 0, 'hanging');
  }
  d.tick();
  d.tick();
  const m = me.combat.attack.motion;
  assert.equal(m.target, d.target, 'locked on');
  const speed = Math.hypot(me.body.vx, me.body.vy);
  assert.ok(Math.abs(speed - 1000) < 1e-6, 'at its dash speed');
  assert.ok(me.body.vx > 0 && me.body.vy > 0, 'down and ahead, at the grounded target');
  d.until(() => d.events.length > 0);
  const [hit] = d.events;
  assert.deepEqual([hit.type, hit.move, hit.damage, hit.directionalLaunch], ['hit', 'midair_attack1', 2, 'vertical']);
  // It springs off: up, and back.
  assert.equal(me.body.vy, -760);
  assert.equal(me.body.vx, -140);
  assert.equal(me.airJumps, DEF.movement.airJumps, 'its air jump given back');
});

test('with nobody in range it dashes straight ahead, and keeps a fifth of its speed as the dash ends', () => {
  const { fighter, step } = solo();
  const far = makeFighter({ x: 1800, facing: -1 });
  fighter.opponent = far.fighter;
  airborne(step);
  step(P('attack1'));
  stepUntil(step, (f) => f.combat.phase === 'active', {});
  step({});
  assert.equal(fighter.combat.attack.motion.target, null);
  assert.equal(fighter.body.vx, 1000);
  assert.equal(fighter.body.vy, 0);
  stepUntil(step, (f) => f.combat.phase === 'recovery', {});
  // A fifth of its speed, less one step of the air's drag.
  assert.ok(Math.abs(fighter.body.vx - (200 - DEF.movement.airDeceleration * DT)) < 1e-6, 'a fifth of its speed');
});

test('an opponent behind it is never locked on to', () => {
  const d = versus({ gap: -150 });
  d.tick(P('jump'));
  for (let i = 0; i < 9; i++) d.tick();
  d.tick(P('attack1'));
  for (let i = 0; i < 10; i++) d.tick();
  assert.equal(d.attacker.combat.attack.motion.target, null);
  assert.ok(d.attacker.body.vx > 0, 'straight on the way it faces');
});

test('once per airtime: a second press before landing does nothing; landing gives it back', () => {
  const { fighter, step } = solo();
  airborne(step, 4);
  step(P('attack1'));
  stepUntil(step, (f) => !f.combat.attack, {});
  step(P('attack1'));
  assert.equal(fighter.combat.attack, null, 'used up until it lands');
  stepUntil(step, (f) => f.grounded, {});
  airborne(step, 4);
  step(P('attack1'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack1');
});

// ---- midair_attack2: the Bounce Attack --------------------------------------------------------

test('the Bounce Attack plunges at a fixed speed and bounces back up off the ground: no landing, the attack over', () => {
  const { fighter, step } = solo();
  airborne(step);
  step(P('attack2'));
  stepUntil(step, (f) => f.combat.phase === 'active', {});
  step({});
  assert.equal(fighter.body.vy, 1300);
  stepUntil(step, (f) => f.body.vy < 0, {});
  assert.equal(fighter.body.vy, -900, 'rebounding');
  assert.equal(fighter.grounded, false, 'no landing');
  assert.equal(fighter.combat.attack, null, 'the attack is over');
  assert.notEqual(fighter.state, 'land');
  // Once more in the same airtime (the press kept through its short
  // cooldown), and no more.
  step(P('attack2'));
  stepUntil(step, (f) => f.combat.attack?.def.id === 'midair_attack2', {}, 10);
  stepUntil(step, (f) => !f.combat.attack, {});
  step(P('attack2'));
  for (let i = 0; i < 10; i++) {
    step({});
    assert.equal(fighter.combat.attack, null, 'twice per airtime');
  }
});

test('a Bounce Attack that meets an opponent spikes it and bounces off', () => {
  const d = versus({ gap: 10 });
  const { attacker: me } = d;
  d.tick(P('jump'));
  for (let i = 0; i < 18; i++) d.tick();
  d.tick(P('attack2'));
  d.until(() => d.events.length > 0);
  const [hit] = d.events;
  assert.deepEqual([hit.type, hit.move, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 'midair_attack2', 2, 2, 'reverseVertical']);
  assert.equal(me.body.vy, -900);
  assert.equal(me.combat.attack, null);
});

// ---- attack3: the Spin Attack ------------------------------------------------------------------

test('the Spin Attack curls up, then rolls at its own speed plus 0.8 of the run it had, as a smaller target', () => {
  const still = solo();
  still.step(P('attack3'));
  assert.deepEqual(still.fighter.hurtboxes, DEF.attacks.attack3.hurtboxes, 'the ball\'s hurtbox');
  assert.ok(still.fighter.body.vx === 0, 'curling, not rolling yet');
  stepUntil(still.step, (f) => f.combat.phase === 'active', {});
  assert.ok(Math.abs(still.fighter.body.vx - 400) < 1, 'its own speed from a standstill');
  const run = solo();
  for (let i = 0; i < 30; i++) run.step({ runRight: true, runRightPressed: i === 0 });
  assert.equal(run.fighter.body.vx, 360, 'running at Speed Power 3');
  run.step(P('attack3'));
  stepUntil(run.step, (f) => f.combat.phase === 'active', {});
  assert.ok(Math.abs(run.fighter.body.vx - (400 + 0.8 * 360)) < 1, 'plus 0.8 of the run');
  stepUntil(run.step, (f) => !f.combat.attack, {});
  assert.deepEqual(run.fighter.hurtboxes, DEF.hurtboxes, 'its own hurtboxes back');
});

test('the roll bowls its target over and rolls on through it', () => {
  const d = versus({ gap: 120, pushboxes: true });
  d.tick(P('attack3'));
  d.until(() => d.events.length > 0);
  assert.deepEqual([d.events[0].move, d.events[0].damage, d.events[0].directionalLaunch], ['attack3', 2, 'horizontal']);
  assert.equal(d.attacker.passingThrough, true);
  d.until(() => d.attacker.body.x > d.target.body.x + 30);
});

test('a Shield stops the roll dead and sends it back', () => {
  const d = versus({ gap: 120 });
  d.tick(P('attack3'), { shield: true });
  for (let i = 0; i < 60 && !d.events.length; i++) d.tick({}, { shield: true });
  assert.equal(d.events[0].type, 'block');
  assert.equal(d.attacker.body.vx, -260);
  d.tick({}, { shield: true });
  assert.ok(d.attacker.body.vx < 0, 'rolling back, not on');
});

// ---- midair_attack3: the Blue Tornado ----------------------------------------------------------

test('the Blue Tornado rises about 175 units, carrying its target up with it, then flings it upward', () => {
  const d = versus({ gap: 10 });
  const { attacker: me, target } = d;
  d.tick(P('jump'), P('jump'));
  for (let i = 0; i < 3; i++) d.tick({}, { jump: true });
  const from = me.body.y;
  d.tick(P('attack3'));
  assert.equal(me.combat.attack.def.id, 'midair_attack3');
  d.until(() => d.events.length >= 1);
  assert.equal(target.body.vy, me.body.vy, 'carried: the target takes its velocity');
  d.until(() => d.events.length >= 4);
  assert.deepEqual(d.events.map((e) => e.damage), [1, 1, 1, 2]);
  assert.equal(d.events[3].directionalLaunch, 'vertical');
  let top = me.body.y;
  d.until(() => {
    top = Math.min(top, me.body.y);
    return me.body.vy > 0;
  });
  assert.ok(from - top > 150, `rose ${Math.round(from - top)} units`);
});

test('after the Blue Tornado it is in free fall: no attack and no air jump until it lands', () => {
  const { fighter, step } = solo();
  airborne(step, 4);
  step(P('attack3'));
  stepUntil(step, (f) => !f.combat.attack, {});
  assert.equal(fighter.freeFall, true);
  assert.equal(fighter.airJumps, 1, 'its air jump is still counted...');
  step(P('jump'));
  assert.ok(fighter.body.vy > -fighter.jumpVelocity * 0.9 + 1, '...but no air jump comes out');
  for (const button of ['attack1', 'attack2', 'attack3']) {
    step(P(button));
    assert.equal(fighter.combat.attack, null, `${button}: nothing`);
  }
  stepUntil(step, (f) => f.grounded, {});
  assert.equal(fighter.freeFall, false);
});

// ---- extra_attack: the Whirlwind ---------------------------------------------------------------

test('the Whirlwind spins up a tornado and sends it off on frame 6: slow, and it keeps what it catches', () => {
  const d = versus({ gap: 160 });
  d.tick(P('extra_attack'));
  d.until(() => d.projectiles.length === 1);
  const tornado = d.projectiles[0];
  assert.equal(frameName(d.attacker), '0002_extra_attack_6.png');
  assert.equal(tornado.vx, 260);
  d.until(() => d.events.length === 1);
  const first = d.events[0];
  assert.deepEqual([first.move, first.damage, first.launchSpeed], ['extra_attack_object', 1, 0]);
  assert.equal(d.target.body.vx, 260, 'dragged along');
  assert.equal(d.target.body.vy, -300, 'and lifted');
  assert.equal(tornado.alive, true, 'it stays');
  // Strikes never come faster than its interval (by its own clock).
  const at = [tornado.lastStrike];
  while (d.events.length < 5) {
    d.tick();
    if (d.events.length > at.length) at.push(tornado.lastStrike);
  }
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 0.14 - 1e-9, `strike ${i + 1}`);
  assert.deepEqual(d.events.map((e) => e.damage), [1, 1, 1, 1, 2]);
  assert.equal(d.events[4].directionalLaunch, 'vertical', 'the finisher flings it upward');
  assert.equal(tornado.alive, false, 'spent after its fifth strike');
});

test('a Shield blocks the tornado once and it is gone', () => {
  const d = versus({ gap: 160 });
  d.tick(P('extra_attack'), { shield: true });
  for (let i = 0; i < 80; i++) d.tick({}, { shield: true });
  assert.deepEqual(d.events.map((e) => e.type), ['block']);
  assert.equal(d.projectiles.length, 0);
});

// ---- The engine rules they are built on ---------------------------------------------------------

test('a multi-hit attack derives its startup, active phase, box, damage and finisher from its strikes', () => {
  const def = createAttackDefinition({
    id: 'attack2', animation: 'attack2', recovery: 0.1, hitbox: { x: 0, y: -40, w: 20, h: 20 },
    hits: [
      { at: 0.1, active: 0.05, damage: 1 },
      { at: 0.2, active: 0.05, damage: 2, hitbox: { x: 10, y: -60, w: 30, h: 10 }, baseLaunch: 2, directionalLaunch: 'vertical' },
    ],
  });
  assert.equal(def.startup, 0.1);
  assert.ok(Math.abs(def.active - 0.15) < 1e-9);
  assert.deepEqual({ ...def.hitbox }, { x: 0, y: -60, w: 40, h: 40 });
  assert.equal(def.damage, 3);
  assert.deepEqual([def.baseLaunch, def.directionalLaunch], [2, 'vertical']);
  assert.deepEqual({ ...def.hits[0].hitbox }, { x: 0, y: -40, w: 20, h: 20 }, 'a strike takes the attack\'s box');
  assert.equal(strikeLive(def.hits[0], 0.1), true);
  assert.equal(strikeLive(def.hits[0], 0.15), false);
});

test('a multi-hit attack refuses fields its strikes own, strikes out of order, and strikes with no box', () => {
  const base = { id: 'attack2', animation: 'attack2', hitbox: { x: 0, y: -40, w: 20, h: 20 } };
  assert.throws(() => createAttackDefinition({ ...base, startup: 0.1, hits: [{ at: 0.1, active: 0.1 }] }), /declares startup/);
  assert.throws(() => createAttackDefinition({ ...base, damage: 3, hits: [{ at: 0.1, active: 0.1 }] }), /declares damage/);
  assert.throws(() => createAttackDefinition({ ...base, hits: [{ at: 0.2, active: 0.1 }, { at: 0.1, active: 0.1 }] }), /before/);
  assert.throws(() => createAttackDefinition({ id: 'attack2', hits: [{ at: 0.1, active: 0.1 }] }), /no hitbox/);
  assert.throws(() => createAttackDefinition({ ...base, hits: [] }), /list of strikes/);
  assert.throws(() => createAttackDefinition({ id: 'attack1', animation: 'attack1', pending: true, hits: [] }), /pending/);
});

test('a motion is one of four kinds, with the speed it cannot do without', () => {
  const base = { id: 'attack3', animation: 'attack3', hitbox: { x: 0, y: -40, w: 20, h: 20 } };
  assert.throws(() => createAttackDefinition({ ...base, motion: { type: 'teleport' } }), /homing, bounce, rise, roll/);
  assert.throws(() => createAttackDefinition({ ...base, motion: { type: 'roll' } }), /positive speed/);
  assert.throws(() => createAttackDefinition({ ...base, motion: { type: 'homing', speed: 900 } }), /positive range/);
  const roll = createAttackDefinition({ ...base, motion: { type: 'roll', speed: 400 } });
  assert.deepEqual({ ...roll.motion }, { type: 'roll', speed: 400, keep: 0, maxSpeed: Infinity, friction: 0, recoil: 0 });
  assert.equal(createAttackDefinition(base).motion, null);
});

test('attackReach sweeps a motion attack\'s box along its path, for the CPU', () => {
  const reach = (id) => attackReach(createAttackDefinition({ id, ...DEF.attacks[id] }));
  const box = DEF.attacks.attack3.hitbox;
  const roll = reach('attack3');
  assert.ok(roll.w > box.w + 100, 'a roll reaches well ahead');
  assert.equal(roll.x, box.x);
  const plunge = reach('midair_attack2');
  assert.ok(plunge.h > 500 && plunge.y === DEF.attacks.midair_attack2.hitbox.y, 'a plunge reaches down');
  const lift = reach('midair_attack3');
  assert.ok(lift.y < DEF.attacks.midair_attack3.hitbox.y - 100, 'a lift reaches up');
  const homing = reach('midair_attack1');
  assert.ok(homing.w >= 240 && homing.h >= 480, 'a homing dash its lock-on range');
  assert.deepEqual(attackReach(createAttackDefinition({ id: 'attack1', ...DEF_0001.attacks.attack1 })), { ...DEF_0001.attacks.attack1.hitbox });
});

test('a piercing projectile needs 2 or more hits and an interval; a finisher needs a pierce', () => {
  const base = { id: 'extra_attack_object', animation: 'extra_attack_object', speed: 100 };
  assert.throws(() => createProjectileDefinition({ ...base, pierce: { hits: 1, interval: 0.1 } }), /2 or more hits/);
  assert.throws(() => createProjectileDefinition({ ...base, pierce: { hits: 3, interval: 0 } }), /positive interval/);
  assert.throws(() => createProjectileDefinition({ ...base, finisher: { damage: 1 } }), /no pierce/);
  const p = createProjectileDefinition({ ...base, hitstun: 0.3, pierce: { hits: 3, interval: 0.1 }, finisher: { damage: 4 } });
  assert.deepEqual([p.finisher.damage, p.finisher.hitstun, p.finisher.baseLaunch], [4, 0.3, 0]);
});

test('no motion attack starts while it is still flying from a launch: it recovers first', () => {
  const d = versus({ gap: 40 });
  const { attacker: me } = d;
  // The target's attack2 launches #0002 upward, hard (from 80 Launch Point).
  me.combat.launchPoint = 80;
  d.tick({}, P('attack2'));
  d.until(() => me.launch && me.combat.stun <= 0 && !me.grounded, 200);
  d.tick(P('attack1'));
  assert.equal(me.combat.attack, null, 'no Homing Attack out of the launch');
  d.tick(P('attack3'));
  assert.equal(me.combat.attack, null, 'nor a Blue Tornado');
  // An air jump is recovering: then it may.
  d.tick(P('jump'));
  d.tick({});
  d.tick(P('attack3'));
  assert.equal(me.combat.attack?.def.id, 'midair_attack3');
});

test('a motion attack never turns while it plays', () => {
  const { fighter, step } = solo();
  step(P('attack3'));
  for (let i = 0; i < 12; i++) step({ runLeft: true });
  assert.equal(fighter.facing, 1);
  assert.ok(fighter.body.vx > 0, 'rolling on the way it set off');
});

// ---- The CPU ------------------------------------------------------------------------------------

test('the CPU reads every move from the data: its motions, and no summon or technique', () => {
  const f = new Fighter({ def: DEF, sprites: SPRITES, stage: STAGE, spawn: { x: 500 } });
  const moves = readMoveset(f);
  assert.deepEqual(moves.melee.map((m) => [m.action, m.id, m.air, m.motion]).sort(), [
    ['attack1', 'attack1', false, null], ['attack1', 'midair_attack1', true, 'homing'],
    ['attack2', 'attack2', false, null], ['attack2', 'midair_attack2', true, 'bounce'],
    ['attack3', 'attack3', false, 'roll'], ['attack3', 'midair_attack3', true, 'rise'],
  ]);
  assert.deepEqual(moves.ranged.map((r) => r.id), ['extra_attack']);
  assert.deepEqual(moves.specials, []);
  assert.equal(moves.shield, true);
});

test('knocked off the stage with its air jump spent, the CPU rises back on its Blue Tornado', () => {
  const stage = new StageCollision(stageMap({ left: 0, right: 1000 }));
  const ai = new CombatAIController({ difficulty: 'hard', rng: mulberry32(2) });
  const me = new Fighter({ def: DEF, sprites: SPRITES, stage, slot: 'p1', label: 'CPU', spawn: { x: 1100, y: 700 }, controller: ai });
  const foe = new Fighter({ def: DEF_0001, sprites: fakeSpritesOf(DEF_0001), stage, slot: 'p2', label: 'P', spawn: { x: 500 } });
  me.opponent = foe;
  foe.opponent = me;
  me.airJumps = 0;
  me.body.vy = 100;
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: { projectiles: [], clones: [] } };
  let used = false;
  for (let i = 0; i < 90 && !used; i++) {
    me.update(DT, ctx);
    used = me.combat.attack?.def.id === 'midair_attack3';
  }
  assert.ok(used, 'the Blue Tornado');
});

test('the CPU sends its Whirlwind at an opponent turtling behind its Shield at mid range', () => {
  for (const gap of [200, 340]) {
    const stage = new StageCollision(stageMap());
    const ai = new CombatAIController({ difficulty: 'hard', rng: mulberry32(3) });
    const me = new Fighter({ def: DEF, sprites: SPRITES, stage, slot: 'p1', label: 'CPU', spawn: { x: 900, facing: 1 }, controller: ai });
    const foe = new Fighter({
      def: DEF_0001, sprites: fakeSpritesOf(DEF_0001), stage, slot: 'p2', label: 'P', spawn: { x: 900 + gap, facing: -1 },
      controller: { getInput: () => ({ shield: true }) },
    });
    me.opponent = foe;
    foe.opponent = me;
    const ctx = { stage, gravity: CONFIG.sim.gravity, battle: { projectiles: [], clones: [], combat: { events: [] } } };
    let thrown = false;
    for (let i = 0; i < 360 && !thrown; i++) {
      me.update(DT, ctx);
      foe.update(DT, ctx);
      thrown = me.combat.attack?.def.id === 'extra_attack';
    }
    assert.ok(thrown, `${gap} units away`);
  }
});

test('CPU fights with #0002 run: against #0001 and itself, every move used, no summon or technique cooldown of its own', () => {
  const used = new Set();
  // A seeded sample of real fights (seed 3: one that sees the mid-air
  // moves; which ones come up depends on how #0001 plays, its Clone
  // Attack's summoning startup included).
  for (const [a, b] of [[DEF, DEF_0001], [DEF_0001, DEF], [DEF, DEF]]) {
    const { log } = cpuFight(a, b, { seconds: 40, seed: 3, difficulty: 'brutal' });
    for (const [f, steps] of log) {
      if (f.def !== DEF) continue;
      for (const s of steps) {
        if (s.attack) used.add(s.attack);
        assert.deepEqual(s.cooling, []);
      }
    }
  }
  for (const id of ['attack1', 'attack2', 'attack3']) assert.ok(used.has(id), id);
  assert.ok(['midair_attack1', 'midair_attack2', 'midair_attack3'].filter((id) => used.has(id)).length >= 2, 'its aerials too');
});

// ---- On screen ----------------------------------------------------------------------------------

test('its touch controls show three numbered buttons, in slots 1 to 3, the Whirlwind on top', async () => {
  const { attackSlots } = await import('../js/game/touch-controls.js');
  const shown = (action) => mobileAbility(DEF, action) !== null;
  assert.deepEqual([...attackSlots(shown)], [['attack1', 1], ['attack2', 2], ['attack3', 3]]);
  assert.equal(shown('extra_attack'), true);
});

test('a timing sanity check: the Dash lasts one pass of its four frames', () => {
  const { fighter, step } = solo();
  step({ runRight: true, runRightPressed: true });
  step({});
  step({ runRight: true, runRightPressed: true });
  assert.ok(fighter.dash);
  assert.equal(fighter.dash.duration, 4 / 20);
  assert.equal(fighter.body.vx, 1100);
  assert.equal(steps(fighter.dash.duration), 12);
});
