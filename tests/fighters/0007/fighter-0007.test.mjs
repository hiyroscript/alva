// Run with node --test tests/fighters/0007/fighter-0007.test.mjs (no dependencies).
// #0007, the street soldier: registered from CHARACTERS alone in roster
// slot 07, its clips cut from one sprite sheet into its own folder and read
// from the real PNGs (tight, 1x, one art-pixel scale, anchored on its white
// vest wherever its fists, feet, swings or blasts reach), five numbered
// buttons (two ordinary attacks with their mid-air versions, its melee, and
// three techniques, its weapons) and an extra attack, its Pistol. Half its
// moves are melee, every one close range, and half are weapons, every one
// fired on the ground: the Street Combo holding its target to the hook,
// the Uppercut launching, the Flying Kick, the Hammer Fist driving down,
// the Pistol's fast shot, the Molotov Cocktail's fire burning ahead of it,
// the Sawn-Offs blasting both sides at once, and the Rocket Launcher's long
// heave and heavy rocket. The roster, credits and translations it adds are
// checked in empty-roster, settings and i18n. Layout and paint still need
// real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { DT, STAGE, duel, fakeSpritesOf, makeFighter, steps, cpuFight } from '../../helpers/fighter-harness.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { CHARACTERS, getCharacter, playableCharacters } from '../../../js/data/characters.js';
import { abilityName } from '../../../js/data/abilities.js';
import { describeLoadout, loadoutProblems } from '../../../js/data/loadout.js';
import { isSpecialAbility } from '../../../js/data/special-abilities.js';
import { pad, flick } from '../../../js/data/characters/helpers.js';
import { attackReach, createAttackDefinition, isMeleeAttack } from '../../../js/game/combat/attacks.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0007/';
const DEF = getCharacter('0007');
const DEF_0001 = getCharacter('0001');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0007_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0007 on its own, and against #0001 (or `target`) at `gap`.
const solo = (opts = {}) => makeFighter({ character: DEF, sprites: SPRITES, ...opts });
const versus = (opts = {}, target = DEF_0001) => duel({
  attackerCharacter: DEF, attackerSprites: SPRITES, targetCharacter: target, targetSprites: fakeSpritesOf(target), ...opts,
});
// Into the air, `rise` steps after a jump.
const airborne = (tick, rise = 14) => {
  tick(P('jump'));
  for (let i = 0; i < rise; i++) tick({});
};
// Lifts `f` `height` off the floor and holds it there.
function hold(f, height) {
  Object.assign(f.body, { y: f.body.y - height, grounded: false, ground: null, gravityScale: 0, vy: 0 });
}
const mine = (d, move) => d.events.filter((e) => e.attacker === d.attacker && (e.move === move || e.ability === move));
const after = (d, seconds, held = {}, targetHeld = {}) => {
  for (let i = 0; i < steps(seconds); i++) d.tick(held, targetHeld);
};

const { images: IMAGES, sprites: REAL } = realArt(DEF);

// Every clip and the files it plays, in order (a file shown twice is one
// file on disk).
const CLIPS = {
  idle: named('idle', [...Array(22).fill(1), 2, 3, 2]),
  run: named('run', 6),
  jump: named('jump', 2),
  fall: named('fall', 1),
  land: named('land', 1),
  mouvment: named('mouvment', 4),
  midair_mouvment: named('midair_mouvment', 2),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 1),
  prepshield: named('prepshield', 1),
  shielding: named('shielding', 1),
  releaseshield: named('releaseshield', 1),
  deflect: named('deflect', 4),
  attack1: named('attack1', [1, 1, 2, 3, 4, 5, 6, 7]),
  midair_attack1: named('midair_attack1', [1, 2, 2, 1]),
  attack2: named('attack2', [1, 1, 1, 2, 3, 3]),
  midair_attack2: named('midair_attack2', [1, 2, 2, 3, 4, 5]),
  attack3_cast: named('attack3', [1, 2]),
  attack3_release: named('attack3', [3, 4]),
  attack4_cast: named('attack4', [1, 2, 3]),
  attack4_release: named('attack4', [4, 5, 6, 7, 8, 9, 10, 11]),
  attack5_cast: named('attack5', [1, 2, 2]),
  attack5_release: named('attack5', [2, 2]),
  extra_attack: named('extra_attack', [1, 1, 2, 3, 1]),
};
const OBJECTS = {
  extra_attack_object: named('extra_attack_object', 2),
  attack3_object: named('attack3_object', 9),
  attack5_object: named('attack5_object', 1),
};
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(OBJECTS)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 55, run: 49, jump: 51, fall: 51, land: 41, mouvment: 34, midair_mouvment: 47, hurt: 48, midair_hurt: 44,
  prepshield: 42, shielding: 43, releaseshield: 45, deflect: 67, attack1: 45, midair_attack1: 49, attack2: 61,
  midair_attack2: 55, attack3_cast: 51, attack3_release: 43, attack4_cast: 37, attack4_release: 39, attack5_cast: 55,
  attack5_release: 55, extra_attack: 60,
};

// Its moves, by what they are: its melee (fists and feet, its ordinary
// attacks) and its weapons (fired on the ground: its techniques and its
// extra attack).
const MELEE = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2'];
const WEAPONS = ['attack3', 'attack4', 'attack5', 'extra_attack'];

// ---- Registration -------------------------------------------------------------------

test('#0007 is a real CHARACTERS entry: available, in roster slot 07, after #0001 to #0006', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0007'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0007');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 6);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.deepEqual(DEF.energy, { regen: 14 }, 'its refill rate only');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('five numbered attacks, each a button of its own: two ordinary with mid-air versions, three techniques; plus the Pistol', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { type: 'technique', id: 'attack3' },
    attack4: { type: 'technique', id: 'attack4' },
    attack5: { type: 'technique', id: 'attack5' },
  });
  assert.deepEqual(describeLoadout(DEF), {
    numbered: ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'],
    buttons: ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'],
    air: { attack1: 'midair_attack1', attack2: 'midair_attack2' },
    types: { attack1: 'attack', attack2: 'attack', attack3: 'technique', attack4: 'technique', attack5: 'technique' },
    extra: true,
  });
  assert.deepEqual(Object.keys(DEF.attacks).sort(), ['attack1', 'attack2', 'extra_attack', 'midair_attack1', 'midair_attack2']);
  assert.deepEqual(Object.keys(DEF.techniques), ['attack3', 'attack4', 'attack5']);
  assert.equal(DEF.summons, undefined, 'it summons nobody');
  assert.deepEqual(Object.keys(DEF.projectiles).sort(), ['attack3_object', 'attack5_object', 'extra_attack_object']);
  assert.equal(DEF.effectAnimations, undefined);
});

test('half melee, half weapons: four close-range strikes of its fists and feet, four weapons fired on the ground', () => {
  assert.equal(MELEE.length, WEAPONS.length);
  assert.deepEqual([...MELEE, ...WEAPONS].sort(), Object.keys(DEF.abilityNames).sort(), 'every move it has, once');
  // Its melee: direct strikes of its own body, none throwing, pulling or
  // carrying it anywhere, each reaching no further than a leg's length.
  for (const id of MELEE) {
    const atk = createAttackDefinition({ id, ...DEF.attacks[id] }, { projectiles: DEF.projectiles });
    assert.equal(isMeleeAttack(atk), true, `${id}: melee`);
    assert.equal(atk.projectile, null, `${id}: throws nothing`);
    assert.equal(atk.pull, null, `${id}: pulls nothing`);
    assert.equal(atk.motion, null, `${id}: no motion of its own`);
    const reach = attackReach(atk);
    assert.ok(reach.x + reach.w <= 72, `${id}: close range (out to ${reach.x + reach.w} units)`);
  }
  // Its weapons: each sends out a projectile or a blast, and none works in
  // the air (a technique is ground-only; the Pistol is too).
  for (const id of WEAPONS) {
    const t = DEF.techniques[id];
    const shot = t ? t.projectile ?? t.burst : DEF.attacks[id].projectile;
    assert.ok(shot, `${id}: a weapon fires something`);
  }
  assert.equal(DEF.attacks.extra_attack.groundOnly, true, 'the Pistol is never fired in the air');
  assert.deepEqual(Object.values(DEF.actions).flatMap((a) => (a?.air ? [a.air] : [])), ['midair_attack1', 'midair_attack2'],
    'in the air, only its fists and feet');
});

test('one Special: the Rocket Launcher; the Molotov Cocktail\'s fire and the Sawn-Offs\' blasts are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack5']);
  assert.equal(isSpecialAbility(DEF, 'attack5'), true);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'attack4', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Street Combo', 'Flying Kick', 'Uppercut', 'Hammer Fist', 'Molotov Cocktail', 'Sawn-Offs', 'Rocket Launcher', 'Pistol',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Pistol', 'Street Combo', 'Uppercut', 'Molotov Cocktail', 'Sawn-Offs', 'Rocket Launcher']);
  assert.deepEqual(buttons('fr'), ['Pistolet', 'Combo de rue', 'Crochet montant', 'Cocktail Molotov', 'Canons sciés', 'Lance-roquettes']);
  assert.deepEqual(['midair_attack1', 'midair_attack2'].map((m) => STRINGS.fr[`ability.0007.${m}`]), ['Coup de pied sauté', 'Coup de marteau']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => art(a)), [
    '0007_extra_attack_2.png', '0007_attack1_3.png', '0007_attack2_2.png', '0007_attack3_object_5.png', '0007_attack4_6.png', '0007_attack5_2.png',
  ]);
  assert.deepEqual(['attack1', 'attack2'].map((a) => art(a, true)), ['0007_midair_attack1_2.png', '0007_midair_attack2_3.png']);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0007.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: fists and feet on Square and Triangle both ways, the Sawn-Offs on Circle, the Pistol on R2, the Rocket Launcher on L2, the molotov thrown forward on the right stick', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:attack3': flick('forward'),
    'ground:attack4': pad('east'),
    'ground:attack5': pad('l2'),
    'ground:extra_attack': pad('r2'),
    'air:attack1': pad('west'),
    'air:attack2': pad('north'),
  });
  assert.equal(DEF.controller.previous, undefined, 'added after settings version 5: no layout of then');
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips and objects play: every file named <id>_<codename>_<frame>.png, none a copy within its codename', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 78);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  for (const [key, want] of Object.entries(OBJECTS)) assert.deepEqual(DEF.projectileAnimations[key].frames.map(file), want, key);
  // A frame a clip shows again is the same file, never a second one.
  for (const name of FILES) {
    const { pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const twins = FILES.filter((other) => other !== name && other.replace(/_\d+\.png$/, '') === name.replace(/_\d+\.png$/, ''))
      .filter((other) => Buffer.compare(Buffer.from(decodePng(`${ROOT}${DIR}${other}`).pixels), Buffer.from(pixels)) === 0);
    assert.deepEqual(twins, [], `${name}: no copy of it under its codename`);
  }
});

test('every frame is cut clean: none of the sheet\'s teal background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 0 && g === 119 && b === 120), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 55);
  assert.ok(near(REAL.worldPerArt, 88 / 52), 'the same world size per art pixel as the rest of the roster');
  assert.ok(near(DEF.visual.height, 55 * 88 / 52), 'about 93 units tall, standing');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(near(anim.maxArtH, HEIGHTS[key]), `${key}: tallest frame ${anim.maxArtH}`);
    for (const f of anim.frames) {
      assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
      assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth), `${key}: its width`);
      assert.ok(near(f.artH, IMAGES.get(f.url).naturalHeight), `${key}: its height`);
    }
  }
  for (const key of Object.keys(OBJECTS)) {
    for (const f of REAL.projectiles[key].frames) assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
  }
});

test('anchors keep the body in place: authored on its vest wherever its fists, swings or blasts reach', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  assert.deepEqual(ax('attack1'), [22, 22, 24.5, 31, 32, 21, 25.5, 23.5]);
  assert.deepEqual(ax('attack4_release'), [29, 34.5, 41.5, 42.5, 43, 43, 42.5, 25.5]);
  // The blasts either side are as wide as the body three times over: the
  // automatic anchor (the upper art's opaque middle) is pulled off the
  // vest by the swinging arc of the Hammer Fist and the cross's long arm.
  const auto = withFakeCanvas(() => REAL.animations.midair_attack2.frames.map((f) => f.anchorX));
  assert.ok(auto[3] > ax('midair_attack2')[3] + 8, 'the authored anchor stays on the body, behind the arc');
  // The Deflect's arc swept under the feet: the feet stay where they are.
  assert.deepEqual(REAL.animations.deflect.frames.map((f) => f.anchorArtY), [47, 63, 38, 39]);
  for (const key of ['idle', 'run', 'hurt', 'shielding', 'attack1', 'attack2', 'extra_attack', 'attack4_release']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('its stance blinks now and then: its eyes open for most of every loop, one quick blink', () => {
  const idle = DEF.animations.idle;
  assert.equal(idle.loop, true);
  const seconds = (pred) => idle.frames.filter((url) => pred(file(url))).length / idle.fps;
  const open = seconds((name) => name === '0007_idle_1.png');
  const blink = seconds((name) => name !== '0007_idle_1.png');
  assert.ok(near(open, 2.75) && near(blink, 3 / 8), `eyes open ${open} s, a blink of ${blink} s`);
  // The three drawings differ only in the eyes: half shut and shut come
  // once each way, inside one blink, never back to back with another.
  assert.deepEqual(idle.frames.slice(-3).map(file), ['0007_idle_2.png', '0007_idle_3.png', '0007_idle_2.png']);
});

test('the roster portrait is its face', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(55 * DEF.visual.portrait.size));
});

// ---- Its melee -------------------------------------------------------------------------

test('the Street Combo: a jab and a cross that hold the target, then a hook that knocks it back (1, 1, 3 at Base Launch 1)', () => {
  const d = versus({ gap: 50 });
  d.tick(P('attack1'));
  after(d, 0.5);
  const hits = mine(d, 'attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 1], ['hit', 3]]);
  assert.ok(hits.slice(0, 2).every((e) => e.launchSpeed === 0), 'held for the next blow');
  assert.deepEqual([hits[2].baseLaunch, hits[2].directionalLaunch], [1, 'horizontal']);
  assert.ok(hits[2].finalLaunch.x > 0, 'knocked away from it');
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.4), 'its jab at 0.1 s, 0.4 s in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  // Out of an arm's reach, nothing.
  const far = versus({ gap: 110 });
  far.tick(P('attack1'));
  after(far, 0.5);
  assert.deepEqual(mine(far, 'attack1'), []);
});

test('the Uppercut: a fifth of a second to see coming, then 5 straight up (Base Launch 2), and a jump may chase its target', () => {
  const d = versus({ gap: 44 });
  d.tick(P('attack2'));
  after(d, 0.25);
  const [hit] = mine(d, 'attack2');
  assert.deepEqual([hit.type, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 5, 2, 'vertical']);
  assert.ok(hit.finalLaunch.y < 0, 'up');
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  assert.ok(near(atk.startup, 0.2) && near(atk.total, 0.4));
  // Once it has hit, the fist held high gives way to a jump.
  while (!d.attacker.combat.cancellable && d.attacker.combat.attack) d.tick();
  assert.ok(d.attacker.combat.cancellable, 'its hit-confirmed window opens');
  d.tick(P('jump'));
  assert.equal(d.attacker.combat.attack, null, 'cut short');
  assert.ok(d.attacker.body.vy < 0, 'off after it');
});

test('the Flying Kick: a kick thrown out feet first in the air, 3 at Base Launch 2 sideways', () => {
  const d = versus({ gap: 50 });
  airborne(d.tick);
  hold(d.target, d.target.body.y - d.attacker.body.y);
  d.tick(P('attack1'));
  after(d, 0.3);
  const [hit] = mine(d, 'midair_attack1');
  assert.deepEqual([hit.type, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 3, 2, 'horizontal']);
  assert.ok(hit.finalLaunch.x > 0, 'away from it');
});

test('the Hammer Fist: both fists swung down in front of it, 3 at Base Launch 2 downward', () => {
  const d = versus({ gap: 36 });
  airborne(d.tick);
  hold(d.target, d.target.body.y - (d.attacker.body.y + 20));
  d.tick(P('attack2'));
  after(d, 0.45);
  const [hit] = mine(d, 'midair_attack2');
  assert.deepEqual([hit.type, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 3, 2, 'reverseVertical']);
  assert.ok(hit.finalLaunch.y > 0, 'down');
});

// ---- Its weapons -----------------------------------------------------------------------

test('the Pistol: drawn in 2/15 s, then a bullet across most of the stage (1400 units/s, out to 560), 3 at Base Launch 1, 15 Energy a shot', () => {
  for (const [gap, lands] of [[80, true], [540, true], [640, false]]) {
    const d = versus({ gap });
    d.tick(P('extra_attack'));
    assert.ok(near(d.attacker.combat.energy, 85, 1e-6), 'paid as it fires');
    after(d, 0.8);
    const hits = mine(d, 'extra_attack');
    assert.equal(hits.length > 0, lands, `${gap} away`);
    if (lands) assert.deepEqual([hits[0].source, hits[0].damage, hits[0].baseLaunch], ['projectile', 3, 1]);
  }
  const shot = DEF.projectiles.extra_attack_object;
  assert.ok(near(shot.speed * shot.lifetime, 560, 1e-6));
  const atk = createAttackDefinition({ id: 'extra_attack', ...DEF.attacks.extra_attack }, { projectiles: DEF.projectiles });
  assert.ok(near(atk.projectile.spawnAt, 2 / 15) && near(atk.total, 1 / 3), 'fired at 2/15 s, a third of a second in all');
});

test('the Molotov Cocktail: the bottle bursts into flames 150 units ahead, burning whoever stays in it (1, 1, 1, then 3 straight up); never at its feet', () => {
  const t = DEF.techniques.attack3;
  assert.ok(near(SPRITES.duration(t.castAnimation), 1 / 6) && near(SPRITES.duration(t.releaseAnimation), 1 / 6),
    'at ordinary-attack pace: it is no Special');
  for (const [gap, lands] of [[40, false], [100, true], [150, true], [200, true], [260, false]]) {
    const d = versus({ gap });
    d.tick(P('attack3'));
    assert.ok(d.attacker.technique, 'cast');
    after(d, 1.2);
    const hits = mine(d, 'attack3');
    assert.equal(hits.length > 0, lands, `${gap} away`);
    if (!lands) continue;
    assert.deepEqual(hits.map((e) => e.damage), [1, 1, 1, 3], `${gap} away`);
    assert.ok(hits.slice(0, 3).every((e) => e.launchSpeed === 0), 'the flames keep their hold');
    assert.deepEqual([hits[3].baseLaunch, hits[3].directionalLaunch], [2, 'vertical']);
  }
  const f = solo().fighter;
  assert.equal(f.techniqueDefs.attack3.cooldown, 0, '6 in all: no cooldown');
  assert.equal(f.techniqueDefs.attack3.energyCost, 15, 'an ordinary construct');
  // A Shield puts it out at the first flame it blocks.
  const s = versus({ gap: 150 });
  s.tick({}, { shield: true });
  s.tick(P('attack3'), { shield: true });
  after(s, 1.2, {}, { shield: true });
  assert.deepEqual(mine(s, 'attack3').map((e) => e.type), ['block']);
});

test('the Sawn-Offs: a blast to each side at once, 5 straight up whoever is in front or behind; out of their reach, nothing', () => {
  for (const [gap, lands] of [[50, true], [80, true], [-60, true], [-80, true], [110, false], [-110, false]]) {
    const d = versus({ gap, targetFacing: gap > 0 ? -1 : 1 });
    d.tick(P('attack4'));
    after(d, 1);
    const hits = mine(d, 'attack4');
    assert.equal(hits.length > 0, lands, `${gap} away`);
    if (!lands) continue;
    assert.deepEqual([hits[0].source, hits[0].damage, hits[0].baseLaunch, hits[0].directionalLaunch], ['technique', 5, 2, 'vertical']);
    assert.ok(hits[0].finalLaunch.y < 0, 'blasted up');
  }
  const f = solo().fighter;
  assert.deepEqual([f.techniqueDefs.attack4.cooldown, f.techniqueDefs.attack4.energyCost], [0, 15]);
});

test('the Rocket Launcher: 0.75 s heaving it up and aiming, then a rocket that strikes for 10 at Base Launch 3, every 5 s from its release', () => {
  const t = DEF.techniques.attack5;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.75) && near(SPRITES.duration(t.releaseAnimation), 1 / 3),
    'a deliberate Special: 0.75 s + 1/3 s');
  const d = versus({ gap: 500 });
  d.tick(P('attack5'));
  assert.equal(activeSpecialAbility(d.attacker), 'attack5', 'its orange mark shows');
  assert.equal(d.attacker.combat.abilityCooldowns.active('attack5'), false, 'nothing starts on the press');
  assert.ok(near(d.attacker.combat.energy, 100, 1e-6), 'a 5 s move costs no Energy');
  while (d.attacker.technique && !d.projectiles.length) d.tick();
  assert.equal(d.attacker.combat.abilityCooldowns.active('attack5'), true, 'its cooldown starts as the rocket leaves');
  assert.ok(near(d.attacker.combat.abilityCooldowns.remaining('attack5'), 5, DT * 2));
  after(d, 1);
  const [hit] = mine(d, 'attack5');
  assert.deepEqual([hit.type, hit.source, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 'projectile', 10, 3, 'horizontal']);
  assert.ok(hit.finalLaunch.x > 0, 'flung far away from it');
  // Out past its 770 units, it is gone before it gets there.
  const far = versus({ gap: 900 });
  far.tick(P('attack5'));
  after(far, 2.5);
  assert.deepEqual(mine(far, 'attack5'), []);
});

test('the Rocket Launcher drives a raised Shield back, and a hit before it fires breaks it: no rocket, no cooldown', () => {
  const s = versus({ gap: 300 });
  s.tick({}, { shield: true });
  s.tick(P('attack5'), { shield: true });
  const x0 = s.target.body.x;
  after(s, 1.6, {}, { shield: true });
  assert.deepEqual(mine(s, 'attack5').map((e) => e.type), ['block']);
  assert.ok(s.target.body.x > x0 + 20, `driven back ${s.target.body.x - x0} units`);
  // #0001's jab lands during the heave.
  const d = versus({ gap: 40 });
  d.tick(P('attack5'));
  after(d, 0.2);
  d.tick({}, P('attack1'));
  after(d, 0.6);
  assert.equal(d.attacker.technique, null, 'broken');
  assert.deepEqual(d.projectiles.filter((p) => p.owner === d.attacker), [], 'nothing fired');
  assert.equal(d.attacker.combat.abilityCooldowns.active('attack5'), false, 'ready again at once');
});

test('no weapon of its fires in the air: the Pistol and every technique do nothing there', () => {
  for (const move of WEAPONS) {
    const { fighter, step } = solo();
    airborne(step, 20);
    step(P(move));
    assert.equal(fighter.combat.attack, null, `${move}: no attack`);
    assert.equal(fighter.technique, null, `${move}: no cast`);
    assert.ok(near(fighter.combat.energy, 100), `${move}: nothing paid`);
  }
});

test('its Deflect: a two-fisted swat in front of it, in the air, that turns projectiles back', () => {
  assert.equal(DEF.deflect.deflectProjectiles, true);
  assert.equal(DEF.deflect.animation, 'deflect');
  const { fighter, step } = solo();
  airborne(step);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays its whole kit: its fists and feet, its gun, its fire, its blasts and its rocket', () => {
  // Every fighter as its opponent, at Medium and at Brutal, on two seeds.
  const used = new Map();
  let rockets = 0;
  for (const difficulty of ['medium', 'brutal']) {
    for (const seed of [1, 2]) {
      for (const foe of playableCharacters()) {
        const { log, events } = cpuFight(DEF, foe, { seconds: 30, seed, difficulty });
        const me = [...log.keys()].find((f) => f.def === DEF && f.slot === 'p1');
        for (const [k, v] of me.controller.telemetry.moveUsage) used.set(k, (used.get(k) ?? 0) + v);
        rockets += events.filter((x) => x.attacker === me && x.type === 'hit' && x.ability === 'attack5').length;
      }
    }
  }
  for (const move of [
    'attack1:ground', 'attack1:air', 'attack2:ground', 'attack2:air', 'attack3:ground', 'attack4:ground', 'attack5:ground',
    'extra_attack:ground',
  ]) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
  assert.ok(rockets > 0, 'a rocket lands now and then');
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0007, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names are put together here so this file never spells them.
const UNNAMED = new RegExp([
  ['\\b', 'c', '\\.?', 'j', '\\b'].join(''),
  ['c', 'a', 'r', 'l', ' ?', 'j', 'o', 'h', 'n', 's', 'o', 'n'].join(''),
  ['s', 'a', 'n', ' ?', 'a', 'n', 'd', 'r', 'e', 'a', 's'].join(''),
  ['g', 'r', 'a', 'n', 'd', ' ?', 't', 'h', 'e', 'f', 't'].join(''),
].join('|'), 'i');
const BINARY = /\.(png|jpe?g|gif|webp|ico)$/i;

function repositoryPaths(dir = '') {
  return readdirSync(`${ROOT}${dir}` || './', { withFileTypes: true }).flatMap((e) => {
    if (e.name === '.git' || e.name === 'node_modules') return [];
    const path = `${dir}${e.name}`;
    return e.isDirectory() ? [`${path}/`, ...repositoryPaths(`${path}/`)] : [path];
  });
}

test('the character behind #0007 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0007.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
  assert.ok(STAGE);
});
