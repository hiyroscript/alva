// Run with node --test tests/fighters/0001/fighter-0001.test.mjs (no dependencies).
// #0001 as a fighter: registered from CHARACTERS alone in roster slot 01,
// its clips cut from one sprite sheet into its own folder and read from
// the real PNGs (tight, 1x, the roster's art-pixel size, anchored on the
// body), its five numbered buttons (three ordinary attacks with their
// mid-air versions, two techniques) and the High Kick, its Infinity Shield,
// and the names and touch buttons it presents. What each move does in play
// is in moves-0001.test.mjs, its combos in combos-0001.test.mjs and the CPU
// playing it in cpu-0001.test.mjs. Paint and layout still need a real
// browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { CHARACTERS, characterFramePaths, getCharacter, playableCharacters } from '../../../js/data/characters.js';
import { abilityName } from '../../../js/data/abilities.js';
import { describeLoadout, loadoutProblems, specialAttacks } from '../../../js/data/loadout.js';
import { drawFrame } from '../../../js/game/rendering/sprite-normalizer.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { ICONS } from '../../../js/ui/icons.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';
import { CREDITS, creditsText } from '../../../js/ui/credits.js';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';

const DIR = 'assets/characters/0001/';
const DEF = getCharacter('0001');
const file = (url) => url.split('/').pop();
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const named = (codename, n, from = 1) => range(n).map((i) => `0001_${codename}_${i + from - 1}.png`);
const { images: IMAGES, sprites: REAL } = realArt(DEF);

// Every clip and the files it plays, in order.
const CLIPS = {
  idle: named('idle', 4),
  run: named('run', 8),
  jump: named('jump', 2),
  fall: named('fall', 2),
  land: named('land', 2),
  mouvment: named('mouvment', 1),
  midair_mouvment: named('midair_mouvment', 1),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 1),
  shielding: named('shielding', 1),
  deflect: named('deflect', 4),
  attack1: named('attack1', 6),
  midair_attack1: named('midair_attack1', 5),
  attack2: named('attack2', 5),
  midair_attack2: named('midair_attack2', 4),
  attack3: named('attack3', 5),
  midair_attack3: named('midair_attack3', 4),
  attack4_cast: named('attack4', 6),
  attack4_release: named('attack4', 1, 7),
  attack5_cast: named('attack5', 5),
  attack5_release: named('attack5', 1, 6),
  extra_attack: named('extra_attack', 5),
};
const ORBS = { attack2_object: named('attack2_object', 1), attack3_object: named('attack3_object', 1), attack5_object: named('attack5_object', 1) };
const FILES = [...new Set([...Object.values(CLIPS).flat(), ...Object.values(ORBS).flat()])].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 63, run: 61, jump: 66, fall: 70, land: 59, mouvment: 40, midair_mouvment: 40, hurt: 60, midair_hurt: 51, shielding: 55, deflect: 69,
  attack1: 61, midair_attack1: 60, attack2: 61, midair_attack2: 47, attack3: 62, midair_attack3: 62,
  attack4_cast: 62, attack4_release: 55, attack5_cast: 54, attack5_release: 54, extra_attack: 58,
};

// ---- Registration ---------------------------------------------------------------

test('#0001 is a real CHARACTERS entry: available, first, in roster slot 01', () => {
  assert.equal(CHARACTERS[0], DEF, 'the definition itself, not a copy');
  assert.equal(DEF.id, '0001');
  assert.equal(DEF.displayName, '#0001');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 0);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002']);
});

test('five numbered attacks, each a button of its own: three ordinary with mid-air versions, two techniques; plus the High Kick', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { ground: 'attack3', air: 'midair_attack3' },
    attack4: { type: 'technique', id: 'attack4' },
    attack5: { type: 'technique', id: 'attack5' },
  });
  assert.deepEqual(describeLoadout(DEF), {
    numbered: ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'],
    buttons: ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'],
    air: { attack1: 'midair_attack1', attack2: 'midair_attack2', attack3: 'midair_attack3' },
    types: { attack1: 'attack', attack2: 'attack', attack3: 'attack', attack4: 'technique', attack5: 'technique' },
    extra: true,
  });
  assert.deepEqual(specialAttacks(DEF), ['attack4', 'attack5']);
  assert.deepEqual(Object.keys(DEF.attacks).sort(), [
    'attack1', 'attack2', 'attack3', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3',
  ]);
  for (const [id, atk] of Object.entries(DEF.attacks)) assert.equal(atk.animation, id, `${id} plays its own clip`);
  assert.deepEqual(Object.keys(DEF.techniques), ['attack4', 'attack5']);
  assert.equal(DEF.summons, undefined, 'no summon');
  assert.deepEqual(Object.keys(DEF.projectiles), ['attack2_object', 'attack3_object', 'attack5_object']);
  assert.equal(DEF.attacks.attack2.projectile.id, 'attack2_object');
  assert.equal(DEF.attacks.attack3.projectile.id, 'attack3_object');
  assert.equal(DEF.techniques.attack5.projectile.id, 'attack5_object');
});

test('its moves are not just damage: each one names the mechanic it is built on', () => {
  const { attacks: a, projectiles: p, techniques: t, defense } = DEF;
  assert.deepEqual(a.midair_attack1.motion, { type: 'hover' }, 'the Floating Straight stands on the air');
  assert.deepEqual(a.extra_attack.motion, { type: 'hover' }, 'and so does the High Kick in the air');
  assert.equal(a.midair_attack2.motion.type, 'homing', 'the Red Kick locks on');
  assert.ok(a.midair_attack3.pull, 'Blue yanks the opponent in');
  assert.equal(p.attack2_object.repel, true, 'Red turns projectiles back');
  assert.ok(p.attack2_object.blockPush > 0, 'and shoves a Shield');
  assert.ok(p.attack3_object.pull && p.attack3_object.pierce && p.attack3_object.finisher, 'Maximum Blue drags in and grinds');
  assert.equal(p.attack5_object.erase, true, 'Hollow Purple erases');
  assert.equal(p.attack5_object.unblockable, true);
  assert.equal(t.attack4.burst.hit.unblockable, true, 'Unlimited Void is a sure hit');
  assert.ok(t.attack4.burst.hit.paralyze > 0, 'that paralyzes');
  assert.ok(defense.stall > 0, 'Infinity stalls blows');
  assert.equal(defense.airAnimation, undefined, 'and is the ground\'s only');
  assert.equal(DEF.deflect.deflectProjectiles, true, 'its Deflect turns projectiles back');
  assert.ok(DEF.animations.midair_mouvment, 'it dashes in the air too (the universal air dash, with its own art)');
  assert.equal(DEF.movement, undefined, 'and runs, jumps and Dashes as everyone does');
  for (const id of ['attack2_object', 'attack3_object', 'attack5_object']) assert.ok(p[id].rotationSpeed >= 2000, `${id} spins fast`);
});

test('its in-game names and touch buttons name each move, in English and French', () => {
  assert.deepEqual(
    ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'attack5', 'extra_attack'].map((m) => abilityName(DEF, m)),
    ['Jab', 'Floating Straight', 'Red', 'Red Kick', 'Maximum Blue', 'Blue', 'Unlimited Void', 'Hollow Purple', 'High Kick'],
  );
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['High Kick', 'Jab', 'Red', 'Maximum Blue', 'Unlimited Void', 'Hollow Purple']);
  assert.deepEqual(buttons('fr'), ['Coup de pied haut', 'Direct', 'Rouge', 'Bleu maximal', 'Vide infini', 'Violet creux']);
  assert.equal(STRINGS.fr['ability.0001.midair_attack2'], 'Coup de pied rouge');
  // Each shows a frame of its own art: the kick, the Jab's punch, the orb
  // each projectile button throws, Unlimited Void's hand sign; Jump keeps
  // the universal arrow.
  const art = (a) => previewFrame(DEF, a)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'jump'].map(art), [
    '0001_extra_attack_4.png', '0001_attack1_4.png', '0001_attack2_object_1.png', '0001_attack3_object_1.png',
    '0001_attack4_6.png', '0001_attack5_object_1.png', null,
  ]);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
    const ability = mobileAbility(DEF, a);
    assert.ok(existsSync(`${ROOT}${ability.sprite.url.slice(2)}`), a);
    assert.equal(ability.sprite.mirrored, false, 'drawn facing right, as the buttons read');
  }
});

test('its sprite sheet is credited, linked to where it was published, without naming what it depicts', () => {
  const group = CREDITS.find((g) => g.title === 'credits.sprites0001.title');
  assert.ok(group);
  assert.equal(group.lines[0].href, 'https://www.deviantart.com/finhj/art/1084627848');
  const text = creditsText().find((g) => g.title === '#0001 sprite source');
  assert.deepEqual(text.lines, ['Sprite sheet by Finhj on DeviantArt', 'Sheet credits: ZetrasBlack, R0B4N']);
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips play: every file named <id>_<codename>_<frame>.png', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 78);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  for (const [key, want] of Object.entries(ORBS)) assert.deepEqual(DEF.projectileAnimations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  assert.deepEqual(characterFramePaths(DEF).map(file).sort(), FILES);
});

test('every frame is cut clean: fully opaque or clear, no sheet background left, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    let opaque = 0;
    for (let i = 0; i < w * h; i++) {
      const a = pixels[i * 4 + 3];
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      if (a) opaque++;
    }
    assert.ok(opaque < w * h, `${name}: its background made clear`);
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 63, 'its idle');
  assert.ok(Math.abs(REAL.worldPerArt - 88 / 52) < 1e-9, 'the same world size per art pixel as every fighter');
  assert.ok(Math.abs(DEF.visual.height - 63 * 88 / 52) < 1e-9, 'about 107 units: a tall fighter');
  assert.equal(DEF.visual.pixelSize, 1);
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.equal(anim.maxArtH, HEIGHTS[key], `${key}: tallest frame`);
    assert.ok(Math.abs(DEF.animations[key].heightRatio - HEIGHTS[key] / 63) < 1e-9, `${key}: sized by its tallest frame`);
    for (const f of anim.frames) {
      assert.ok(Math.abs(f.unit - 1) < 1e-9, `${key}: one file pixel per art pixel`);
      assert.equal(f.artW, IMAGES.get(f.url).naturalWidth);
      assert.equal(f.artH, IMAGES.get(f.url).naturalHeight);
    }
  }
  for (const id of Object.keys(ORBS)) {
    for (const f of REAL.projectile(id).frames) {
      assert.equal(f.unit, 1);
      assert.equal(f.anchorArtX, f.artW / 2, `${id}: centred on the projectile`);
      assert.equal(f.anchorArtY, f.artH / 2);
    }
  }
});

test('anchors keep the body in place: authored on the shirt where an arm or a glow reaches out, the kick on its planted foot', () => {
  for (const key of ['attack1', 'midair_attack1', 'attack2', 'attack3', 'midair_attack3', 'attack4_cast', 'attack4_release',
    'attack5_cast', 'attack5_release', 'extra_attack', 'hurt', 'deflect']) {
    assert.deepEqual(REAL.animations[key].frames.map((f) => f.anchorArtX), DEF.animations[key].anchorX, `${key}: as authored`);
  }
  // A punch reaching out never drags the body forward: the Jab's and the
  // Floating Straight's anchors stay well inside their widest frames.
  for (const key of ['attack1', 'midair_attack1']) {
    for (const f of REAL.animations[key].frames) assert.ok(f.anchorArtX < f.artW * 0.62, `${key}: on the body, not the fist`);
  }
  // Every pose stands on the bottom of its art.
  for (const [key, anim] of Object.entries(REAL.animations)) {
    for (const f of anim.frames) assert.equal(f.anchorArtY, f.artH, key);
  }
});

test('drawFrame puts a frame\'s feet on the point it is drawn at; the roster portrait is its face', () => {
  const calls = [];
  const ctx = {
    save() {}, restore() {}, scale() {},
    translate: (x, y) => calls.push(['translate', x, y]),
    drawImage: (...args) => calls.push(['drawImage', ...args.slice(1)]),
  };
  const idle = REAL.animations.idle.frames[0];
  drawFrame(ctx, idle, 100, 200, 2, false);
  assert.equal(calls.at(-1)[2], -Math.round(idle.artH * 2), 'standing on the point');
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(63 * DEF.visual.portrait.size));
});

// ---- Body ---------------------------------------------------------------------------

test('its body is measured from its idle: a collider and hurtboxes up to its head', () => {
  assert.deepEqual(DEF.collider, { width: 32, height: 100 });
  const top = Math.min(...DEF.hurtboxes.map((h) => h.y));
  const bottom = Math.max(...DEF.hurtboxes.map((h) => h.y + h.h));
  assert.equal(bottom, 0, 'down to its feet');
  assert.ok(Math.abs(-top - DEF.visual.height) < 4, 'up to the top of its head');
  for (const h of DEF.hurtboxes) assert.ok(Math.abs(h.x + h.w / 2) <= 0.5, 'centred on its body');
});
