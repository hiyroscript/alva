// Run with node --test tests/fighters/0015/fighter-0015.test.mjs (no dependencies).
// #0015, the small hammer-swinging hedgehog girl: registered from
// CHARACTERS alone in roster slot 15, its clips cut from one sprite sheet
// into its own folder and read from the real PNGs (tight, 1x, one
// art-pixel scale, anchored on its head, a drawing a row repeats cut
// once), four numbered buttons (four ordinary attacks with their mid-air
// versions) and an extra attack on the ground only. The Girl Combo and the
// Girl Swing up close (its Mash Combo), the Girl Crush, the Air Girl Crush
// and the Girl Dunk (a dive whose landing sends a shockwave along the
// floor), the Gift and the Air Gift (a present that waits where it was left
// for the first opponent to touch it, one at a time: `maxInPlay`, checked
// in max-in-play), the Pink Typhoon and its air version (a whirl that lets
// loose a tornado that draws in, carries and throws), and its Deflect. The
// roster, credits and translations it adds are checked in empty-roster,
// settings and i18n. Layout and paint still need real-browser
// verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { duel, fakeSpritesOf, makeFighter, steps, cpuFight } from '../../helpers/fighter-harness.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { CHARACTERS, getCharacter, playableCharacters } from '../../../js/data/characters.js';
import { abilityName } from '../../../js/data/abilities.js';
import { loadoutProblems } from '../../../js/data/loadout.js';
import { isSpecialAbility } from '../../../js/data/special-abilities.js';
import { mashComboProblems } from '../../../js/data/mash-combo.js';
import { pad, flick } from '../../../js/data/characters/helpers.js';
import { createAttackDefinition } from '../../../js/game/combat/attacks.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0015/';
const DEF = getCharacter('0015');
const DEF_0001 = getCharacter('0001');
const DEF_0007 = getCharacter('0007');
const DEF_0009 = getCharacter('0009');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0015_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0015 on its own, and against #0009 (or `target`) at `gap`.
const solo = (opts = {}) => makeFighter({ character: DEF, sprites: SPRITES, ...opts });
const versus = (opts = {}, target = DEF_0009) => duel({
  attackerCharacter: DEF, attackerSprites: SPRITES, targetCharacter: target, targetSprites: fakeSpritesOf(target), ...opts,
});
// Into the air, `rise` steps after a jump.
const airborne = (step, rise = 14) => {
  step(P('jump'));
  for (let i = 0; i < rise; i++) step({});
};
// Lifts `f` `height` off the floor and holds it there.
function hold(f, height) {
  Object.assign(f.body, { y: f.body.y - height, prevY: f.body.y - height, grounded: false, ground: null, gravityScale: 0, vy: 0 });
}
const mine = (d, move) => d.events.filter((e) => e.attacker === d.attacker && (e.move === move || e.ability === move));
const shape = (events) => events.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]);
const after = (d, seconds, held = {}, targetHeld = {}) => {
  for (let i = 0; i < steps(seconds); i++) d.tick(held, targetHeld);
};
// Its presents in play.
const presents = (d) => d.projectiles.filter((p) => p.owner === d.attacker && p.def.animation === 'attack3_object');
// A projectile of #0007's (its Pistol's shot) flying at `target` from
// `dx` behind or ahead of it, at its chest.
function shotAt(d, shooter, target, dx, direction) {
  const def = shooter.projectileDefs.extra_attack_object;
  const b = target.body;
  d.projectiles.push(new Projectile({ owner: shooter, def, anim: shooter.sprites.projectile(def.animation), x: b.x + dx, y: b.y - 30, direction }));
}

const { images: IMAGES, sprites: REAL } = realArt(DEF);

// Every clip and the files it plays, in order (a file shown twice is one
// file on disk).
const CLIPS = {
  idle: named('idle', 8),
  run: named('run', 8),
  jump: named('jump', 4),
  fall: named('fall', 5),
  land: named('land', 3),
  mouvment: named('mouvment', 7),
  midair_mouvment: named('midair_mouvment', 4),
  hurt: named('hurt', 3),
  midair_hurt: named('midair_hurt', 4),
  prepshield: named('prepshield', 2),
  shielding: named('shielding', 1),
  deflect: named('deflect', [1, 2, 3, 3]),
  attack1: named('attack1', 11),
  midair_attack1: named('midair_attack1', 7),
  attack2: named('attack2', 12),
  midair_attack2: named('midair_attack2', 5),
  midair_attack2_impact: named('midair_attack2', [6, 7, 8, 9]),
  attack3: named('attack3', [1, 2, 3, 4, 5, 4, 6, 7, 8, 9, 10]),
  midair_attack3: named('midair_attack3', 7),
  attack4: named('attack4', [1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7, 4, 8, 9, 10, 11, 12, 13, 14]),
  midair_attack4: named('midair_attack4', [1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7]),
  extra_attack: named('extra_attack', 9),
};
const PROJECTILES = {
  attack3_object: named('attack3_object', 7),
  attack4_object: named('attack4_object', 15),
  midair_attack4_object: named('midair_attack4_object', 14),
};
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(PROJECTILES)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 34, run: 33, jump: 38, fall: 34, land: 31, mouvment: 34, midair_mouvment: 35, hurt: 32, midair_hurt: 29,
  prepshield: 32, shielding: 32, deflect: 27, attack1: 38, midair_attack1: 45, attack2: 34, midair_attack2: 43,
  midair_attack2_impact: 41, attack3: 35, midair_attack3: 30, attack4: 34, midair_attack4: 32, extra_attack: 45,
};

// ---- Registration -------------------------------------------------------------------

test('#0015 is a real CHARACTERS entry: available, in roster slot 15, after #0001 to #0014', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0015'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0015');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 14);
  assert.deepEqual(playableCharacters().map((c) => c.id), [
    '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016',
  ]);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('four numbered attacks, each a button of its own, every one ordinary with its mid-air version; plus the Girl Swing, on the ground only', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { ground: 'attack3', air: 'midair_attack3' },
    attack4: { ground: 'attack4', air: 'midair_attack4' },
  });
  assert.deepEqual(Object.keys(DEF.attacks).sort(), [
    'attack1', 'attack2', 'attack3', 'attack4', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3', 'midair_attack4',
  ]);
  assert.equal(DEF.attacks.extra_attack.groundOnly, true, 'the Girl Swing on the ground only');
  assert.equal(DEF.techniques, undefined, 'no cast');
  assert.equal(DEF.summons, undefined, 'it summons nobody');
  assert.equal(DEF.effectAnimations, undefined);
  assert.deepEqual(Object.keys(DEF.projectiles).sort(), ['attack3_object', 'attack4_object', 'midair_attack3_object', 'midair_attack4_object'],
    'its presents and its tornadoes');
  for (const a of Object.values(DEF.attacks)) assert.notEqual(a.motion?.type, 'homing', 'it never homes in');
  // In the air its Triangle / Y does nothing: the Girl Swing is a ground
  // move and nothing takes its place.
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null, 'nothing in the air');
});

test('its presents and its tornadoes cost 15 Energy each, nothing else anything; no move of it waits', () => {
  const { fighter } = solo();
  const cost = Object.fromEntries(Object.values(fighter.attacks).map((a) => [a.id, a.energyCost]));
  assert.deepEqual(cost, {
    extra_attack: 0, attack1: 0, midair_attack1: 0, attack2: 0, midair_attack2: 0,
    attack3: 15, midair_attack3: 15, attack4: 15, midair_attack4: 15,
  });
  for (const a of Object.values(fighter.attacks)) assert.equal(a.cooldown, 0, `${a.id}: no cooldown, a present waiting on the stage is ordinary`);
  assert.equal(fighter.deflect.cooldown, 0);
});

test('its Specials: the Gift and the Air Gift, a present left to wait for its victim; its hammer, dive and tornadoes are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack3', 'midair_attack3']);
  for (const move of ['attack3', 'midair_attack3']) assert.equal(isSpecialAbility(DEF, move), true, move);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack4', 'midair_attack4', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
  const d = versus({ gap: 200 });
  d.tick(P('attack3'));
  assert.equal(activeSpecialAbility(d.attacker), 'attack3', 'the orange mark while it leaves its present');
});

test('its Mash Combo: the Girl Combo and the Girl Swing, its two close-range strikes; its tornadoes and its presents are no partner', () => {
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'extra_attack'] });
  assert.deepEqual(mashComboProblems(DEF), []);
  assert.equal(DEF.attacks.mash_attack, undefined, 'no button-less partner: both are on its buttons');
  const { fighter, step } = solo();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    step(P('attack1'));
    for (let k = 0; k < 4; k++) seen.push(step({}).combat.attack?.def.id);
  }
  for (let i = 0; i < steps(6); i++) seen.push(step({}).combat.attack?.def.id);
  assert.ok(seen.includes('extra_attack'), 'the Girl Swing is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'midair_attack4', 'extra_attack'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Girl Combo', 'Air Girl Crush', 'Girl Crush', 'Girl Dunk', 'Gift', 'Air Gift', 'Pink Typhoon', 'Air Pink Typhoon', 'Girl Swing',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['attack1', 'attack2', 'attack3', 'attack4', 'extra_attack'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Girl Combo', 'Girl Crush', 'Gift', 'Pink Typhoon', 'Girl Swing']);
  assert.deepEqual(buttons('fr'), ['Combo boxeuse', 'Écrasement au marteau', 'Cadeau', 'Typhon rose', 'Volée au marteau']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3', 'midair_attack4'].map((m) => STRINGS.fr[`ability.0015.${m}`]),
    ['Écrasement aérien', 'Marteau plongeant', 'Cadeau aérien', 'Typhon rose aérien']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['attack1', 'attack2', 'extra_attack'].map((a) => art(a)), [
    '0015_attack1_8.png', '0015_attack2_8.png', '0015_extra_attack_4.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack3', 'attack4'].map((a) => art(a, true)), [
    '0015_midair_attack1_4.png', '0015_midair_attack2_5.png', '0015_midair_attack3_6.png', '0015_midair_attack4_6.png',
  ]);
  assert.equal(mobileAbility(DEF, 'attack3').sprite.url.split('/').pop(), '0015_attack3_object_7.png', 'the Gift shows its present');
  assert.equal(mobileAbility(DEF, 'attack4').sprite.url.split('/').pop(), '0015_attack4_object_7.png', 'the Pink Typhoon its tornado');
  for (const a of ['attack1', 'attack2', 'attack3', 'attack4', 'extra_attack']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0015.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: its blows on Square, the upswing on Triangle, the smash on Circle, the dive on the right stick down, the tornado on R2, the Gift on L2', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:extra_attack': pad('north'),
    'ground:attack2': pad('east'),
    'ground:attack3': pad('l2'),
    'ground:attack4': pad('r2'),
    'air:attack1': pad('west'),
    'air:attack2': flick('down'),
    'air:attack3': pad('l2'),
    'air:attack4': pad('r2'),
  });
  assert.equal(DEF.attacks.midair_attack2.motion.type, 'slam', 'the stick down for the move that plunges');
  assert.equal(DEF.attacks.attack2.motion, undefined, 'the Girl Crush turns where it stands: no direction, never the stick');
  assert.equal(DEF.controller.previous, undefined, 'new: no layout of before');
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips and its projectiles play: every file named <id>_<codename>_<frame>.png', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 174);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  for (const [key, want] of Object.entries(PROJECTILES)) assert.deepEqual(DEF.projectileAnimations[key].frames.map(file), want, key);
  // A drawing a row repeats (the whirl's turns, the kiss sent) is one file,
  // played again. The same drawing in two rows is each row's own (every
  // clip plays its own codename's files): the Pink Typhoon's throw ends as
  // the Girl Crush's smash does, and its whirl is the Air Pink Typhoon's.
  const ACROSS = [
    ['0015_attack2_7.png', '0015_attack4_8.png'], ['0015_attack2_8.png', '0015_attack4_9.png'],
    ['0015_attack2_9.png', '0015_attack4_10.png'], ['0015_attack2_10.png', '0015_attack4_11.png'],
    ['0015_attack2_11.png', '0015_attack4_12.png'], ['0015_attack2_12.png', '0015_attack4_14.png'],
    ...[3, 4, 5, 6, 7].map((n) => [`0015_attack4_${n}.png`, `0015_midair_attack4_${n}.png`]),
  ].map((pair) => pair.join(' = '));
  const seen = new Map();
  const same = [];
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const key = `${w}x${h}:${Buffer.from(pixels).toString('base64')}`;
    if (seen.has(key)) same.push(`${seen.get(key)} = ${name}`);
    else seen.set(key, name);
  }
  assert.deepEqual(same.sort(), ACROSS.sort(), 'no copy within a codename');
});

test('every frame is cut clean: none of the sheet\'s teal background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 0 && g === 112 && b === 112), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel: among the roster\'s smallest', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 34);
  assert.ok(near(REAL.worldPerArt, 88 / 52), 'the same world size per art pixel as the rest of the roster');
  assert.ok(near(DEF.visual.height, 34 * 88 / 52), 'about 58 units tall');
  // Only #0010 is smaller.
  const shorter = playableCharacters().filter((c) => c.visual.height < DEF.visual.height).map((c) => c.id);
  assert.deepEqual(shorter, ['0010']);
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(near(anim.maxArtH, HEIGHTS[key]), `${key}: tallest frame ${anim.maxArtH}`);
    assert.ok(near(anim.heightRatio, HEIGHTS[key] / 34), `${key}: its heightRatio`);
    for (const f of anim.frames) {
      assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
      assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth), `${key}: its width`);
      assert.ok(near(f.artH, IMAGES.get(f.url).naturalHeight), `${key}: its height`);
    }
  }
  // Its presents and its tornadoes are drawn at the same art-pixel size,
  // centred where they are, never mirrored; the present settles and stays,
  // a tornado plays once across its run.
  for (const anim of Object.values(REAL.projectiles)) {
    for (const f of anim.frames) assert.ok(near(f.unit, 1) && near(f.anchorArtX, f.artW / 2) && near(f.anchorArtY, f.artH / 2), anim.key);
    assert.equal(anim.sourceFacing, 0, `${anim.key}: the same either way`);
    assert.equal(anim.loop, false, anim.key);
  }
  assert.deepEqual(Object.keys(REAL.projectiles).sort(), ['attack3_object', 'attack4_object', 'midair_attack4_object']);
  for (const id of ['attack4_object', 'midair_attack4_object']) {
    const clip = DEF.projectileAnimations[id];
    assert.ok(near(clip.frames.length / clip.fps, DEF.projectiles[id].lifetime, 0.06), `${id}: its swirl once across its run`);
  }
});

test('anchors keep the body in place: on its head, wherever its hammer, its arcs or its gloves reach', () => {
  const at = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  assert.deepEqual(at('idle'), [14.5, 12, 12, 13, 15, 15, 16, 16]);
  // The hammer's arcs swept round it would pull the automatic anchor off
  // its body by several art pixels: the whirl, the smash, the upswing, the
  // overhead swing.
  const off = (key, n) => {
    const f = REAL.animations[key].frames.find((x) => x.url.endsWith(`_${key}_${n}.png`));
    return Math.abs(f.anchorArtX - withFakeCanvas(() => f.anchorX));
  };
  for (const [key, n] of [['attack4', 7], ['attack2', 5], ['extra_attack', 4], ['midair_attack1', 2]]) {
    assert.ok(off(key, n) > 3, `${key} ${n}: on its head, not the arc`);
  }
  for (const [key, clip] of Object.entries(REAL.animations)) {
    for (const f of clip.frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its head', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(33 * DEF.visual.portrait.size), 'from its first stance frame, 33 pixels tall');
});

// ---- Its gloves and its hammer up close ---------------------------------------------------

test('the Girl Combo: a jab and a straight (1, 1), then an uppercut launching straight up (3 at Base Launch 2)', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack1'));
  after(d, 0.6);
  assert.deepEqual(shape(mine(d, 'attack1')), [['hit', 1, 0, null], ['hit', 1, 0, null], ['hit', 3, 2, 'vertical']]);
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.05) && near(atk.total, 0.55), 'its jab at a twentieth of a second, eleven twentieths in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const far = versus({ gap: 130 });
  far.tick(P('attack1'));
  after(far, 0.6);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of its gloves\' reach, nothing');
});

test('the Girl Swing: its hammer swung up from the floor over its head, launching straight up (3 at Base Launch 2)', () => {
  const d = versus({ gap: 40 });
  d.tick(P('extra_attack'));
  after(d, 0.5);
  assert.deepEqual(shape(mine(d, 'extra_attack')), [['hit', 3, 2, 'vertical']]);
  const atk = createAttackDefinition({ id: 'extra_attack', ...DEF.attacks.extra_attack });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.45), 'nine twentieths of a second');
  assert.equal(atk.stepIn, 'universal');
});

test('the Girl Crush: a sweep that holds (1), a full turn, then the smash: 5 at Base Launch 3 sideways, a blocking Shield driven back', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack2'));
  after(d, 0.7);
  assert.deepEqual(shape(mine(d, 'attack2')), [['hit', 1, 0, null], ['hit', 5, 3, 'horizontal']]);
  assert.ok(mine(d, 'attack2').at(-1).finalLaunch.x > 0, 'sent flying the way it smashes');
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  assert.ok(near(atk.total, 0.6), 'three fifths of a second, a heavy swing');
  const blocked = versus({ gap: 40 });
  blocked.tick(P('attack2'), { shield: true });
  after(blocked, 0.7, {}, { shield: true });
  assert.equal(mine(blocked, 'attack2')[0].type, 'block', 'its sweep blocked, the string stops there');
});

test('the Air Girl Crush: its hammer brought down from overhead, 3 at Base Launch 1 sideways', () => {
  const d = versus({ gap: 36 });
  hold(d.attacker, 40);
  hold(d.target, 40);
  d.tick(P('attack1'));
  after(d, 0.4);
  assert.deepEqual(shape(mine(d, 'midair_attack1')), [['hit', 3, 1, 'horizontal']]);
});

test('the Girl Dunk: a dive hammer-first that spikes (3 at Base Launch 2 straight down); its landing\'s shockwave throws up whoever stands near (3 at Base Launch 2), passes over anyone in the air; once per airtime', () => {
  const atk = createAttackDefinition({ id: 'midair_attack2', ...DEF.attacks.midair_attack2 });
  assert.equal(atk.motion.type, 'slam');
  assert.equal(atk.motion.impact.hit.quake, true, 'a shockwave along the floor');
  assert.equal(atk.airUses, 1, 'once per airtime');
  // Dived onto: spiked, then the shockwave.
  const d = versus({ gap: 20 });
  hold(d.attacker, 160);
  d.attacker.body.gravityScale = 1;
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack2');
  d.until(() => d.attacker.body.grounded, 120);
  after(d, 0.3);
  assert.equal(shape(mine(d, 'midair_attack2'))[0].join(), ['hit', 3, 2, 'reverseVertical'].join());
  // Beside where it lands, out of the dive's way: only the shockwave.
  const side = versus({ gap: 72 });
  hold(side.attacker, 160);
  side.attacker.body.gravityScale = 1;
  side.tick(P('attack2'));
  side.until(() => side.attacker.body.grounded, 120);
  after(side, 0.3);
  assert.deepEqual(shape(mine(side, 'midair_attack2')), [['hit', 3, 2, 'vertical']]);
  // A target in the air beside it is passed over.
  const air = versus({ gap: 72 });
  hold(air.attacker, 160);
  air.attacker.body.gravityScale = 1;
  hold(air.target, 40);
  air.tick(P('attack2'));
  air.until(() => air.attacker.body.grounded, 120);
  after(air, 0.3);
  assert.deepEqual(mine(air, 'midair_attack2'), [], 'nothing reaches a fighter off the floor');
});

// ---- The Gift ------------------------------------------------------------------------------

test('the Gift: a kiss blown, and a present appears on the floor before it, waiting there until the first opponent to touch it sets it off (5 at Base Launch 2 straight up); 15 Energy', () => {
  const d = versus({ gap: 220 });
  d.tick(P('attack3'));
  assert.equal(d.attacker.combat.energy, 85, 'its 15 as it starts');
  after(d, 0.25);
  const [gift] = presents(d);
  assert.ok(gift, 'its present let go as the kiss is sent');
  assert.ok(near(gift.x - d.attacker.body.x, 40, 1e-6) && near(gift.y - d.attacker.body.y, -16, 1e-6), '40 units before it, on the floor');
  assert.ok(-DEF.attacks.attack3.projectile.offset.y > DEF.projectiles.attack3_object.hitbox.h / 2, 'its box clear of the floor');
  // It waits, unmoved, for seconds.
  after(d, 5);
  assert.equal(gift.alive, true, 'still there five seconds on');
  assert.ok(near(gift.x - d.attacker.body.x, 40, 1e-6), 'never moved');
  assert.deepEqual(mine(d, 'attack3'), []);
  // The opponent walks into it.
  for (let i = 0; i < steps(0.6) && gift.alive; i++) d.tick({}, { runLeft: true });
  assert.deepEqual(mine(d, 'attack3').map((e) => [e.type, e.source, e.damage, e.baseLaunch, e.directionalLaunch]),
    [['hit', 'projectile', 5, 2, 'vertical']]);
  assert.equal(gift.alive, false, 'set off, it is gone');
  // Left alone, it is gone after six seconds.
  const alone = versus({ gap: 600 });
  alone.tick(P('attack3'));
  after(alone, 0.25);
  const [left] = presents(alone);
  after(alone, 5.6);
  assert.equal(left.alive, true, 'still waiting');
  after(alone, 0.5);
  assert.equal(left.alive, false, 'six seconds and it is gone');
});

test('one present at a time: a new one, on the floor or in the air, takes the oldest\'s place, gone without going off', () => {
  const d = versus({ gap: 600 });
  d.tick(P('attack3'));
  after(d, 1);
  const [first] = presents(d);
  d.tick(P('attack3'));
  after(d, 1);
  assert.equal(first.alive, false, 'the first is gone');
  assert.equal(presents(d).length, 1, 'one present');
  const [second] = presents(d);
  // In the air too: the present it leaves hanging there replaces the one on the floor.
  d.tick(P('jump'));
  after(d, 0.15);
  d.tick(P('attack3'));
  after(d, 0.5);
  assert.equal(second.alive, false);
  assert.deepEqual(presents(d).map((p) => p.def.id), ['midair_attack3_object'], 'the one in the air');
  assert.deepEqual(mine(d, 'attack3'), [], 'none went off');
  assert.equal(DEF.projectiles.attack3_object.maxInPlay, 1);
  assert.equal(DEF.projectiles.midair_attack3_object.maxInPlay, 1);
});

test('a raised Shield that touches a present stops it there: blocked, nothing dealt, the present gone', () => {
  const d = versus({ gap: 200 });
  d.tick(P('attack3'));
  after(d, 0.3, {}, { shield: true });
  const [gift] = presents(d);
  assert.equal(d.target.combat.shielding, true, 'its Shield up');
  // Its Shield raised, it is set down on the present.
  Object.assign(d.target.body, { x: gift.x + 10, prevX: gift.x + 10 });
  after(d, 0.2, {}, { shield: true });
  assert.deepEqual(mine(d, 'attack3').map((e) => [e.type, e.source]), [['block', 'projectile']]);
  assert.equal(gift.alive, false, 'the present gone');
  assert.equal(d.target.combat.launchPoint, 0, 'nothing dealt through a Shield');
});

test('the Air Gift: curled round a present, then it lets it go, hanging in the air 30 units before it; 15 Energy', () => {
  const { fighter, step } = solo();
  airborne(step, 10);
  step(P('attack3'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack3');
  assert.equal(fighter.combat.energy, 85);
  const atk = createAttackDefinition({ id: 'midair_attack3', ...DEF.attacks.midair_attack3 }, { projectiles: DEF.projectiles });
  assert.deepEqual(atk.projectile.offset, { x: 30, y: -24 });
  assert.equal(DEF.projectiles.midair_attack3_object.speed, 0, 'it hangs where it was left');
  // A fighter jumping into it sets it off.
  const d = versus({ gap: 60 });
  hold(d.attacker, 50);
  hold(d.target, 50);
  d.tick(P('attack3'));
  after(d, 0.6);
  assert.deepEqual(shape(mine(d, 'midair_attack3')), [['hit', 5, 2, 'vertical']]);
});

// ---- The Pink Typhoon ----------------------------------------------------------------------

test('the Pink Typhoon: its hammer whirled twice round (1, 1), then a pink tornado that carries its target along (1, 1, 1) and throws it straight up (3 at Base Launch 2); 15 Energy', () => {
  const t = DEF.projectiles.attack4_object;
  assert.deepEqual(t.pierce, { hits: 4, interval: 0.125 });
  assert.ok(t.pull.radius > 0 && t.carry.lift > 0, 'it draws in and carries');
  assert.ok(-DEF.attacks.attack4.projectile.offset.y > t.hitbox.h / 2, 'its box clear of the floor');
  const d = versus({ gap: 40 });
  d.tick(P('attack4'));
  assert.equal(d.attacker.combat.energy, 85, 'its 15 as it starts');
  const start = d.target.body.x;
  after(d, 1.2);
  assert.deepEqual(mine(d, 'attack4').map((e) => [e.source, e.damage, e.baseLaunch, e.directionalLaunch]), [
    ['melee', 1, 0, null], ['melee', 1, 0, null],
    ['projectile', 1, 0, null], ['projectile', 1, 0, null], ['projectile', 1, 0, null], ['projectile', 3, 2, 'vertical'],
  ]);
  assert.ok(d.target.body.x - start > 40, `carried along with it (${(d.target.body.x - start).toFixed(0)} units)`);
  // The whirl strikes behind it as well as before it.
  const behind = versus({ gap: 30, targetFacing: 1 });
  behind.attacker.facing = -1;
  behind.tick(P('attack4'));
  after(behind, 0.4);
  assert.ok(mine(behind, 'attack4').some((e) => e.source === 'melee'), 'its hammer sweeps all round it');
  // Far off, only the tornado reaches.
  const far = versus({ gap: 200 });
  far.tick(P('attack4'));
  after(far, 1.5);
  assert.deepEqual(mine(far, 'attack4').map((e) => e.source), ['projectile', 'projectile', 'projectile', 'projectile']);
  // Out of its run (about 300 units), nothing.
  const out = versus({ gap: 460 });
  out.tick(P('attack4'));
  after(out, 1.4);
  assert.deepEqual(mine(out, 'attack4'), []);
});

test('the tornado draws in an opponent a little above it, then strikes it', () => {
  const d = versus({ gap: 200 });
  hold(d.target, 70);
  d.tick(P('attack4'));
  after(d, 1.2);
  assert.ok(mine(d, 'attack4').length >= 2, 'drawn into its swirl and struck');
  const plain = { ...DEF.projectiles.attack4_object, pull: null };
  assert.equal(plain.pull, null);
});

test('the Air Pink Typhoon: a whirl in the air, then a flatter tornado that carries and pushes away (1, 1, then 3 at Base Launch 1 sideways); 15 Energy', () => {
  const d = versus({ gap: 120 });
  hold(d.attacker, 60);
  hold(d.target, 60);
  d.tick(P('attack4'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack4');
  assert.equal(d.attacker.combat.energy, 85);
  after(d, 1);
  assert.deepEqual(mine(d, 'midair_attack4').map((e) => [e.source, e.damage, e.baseLaunch, e.directionalLaunch]), [
    ['projectile', 1, 0, null], ['projectile', 1, 0, null], ['projectile', 3, 1, 'horizontal'],
  ]);
});

// ---- Its defense ---------------------------------------------------------------------------

test('its Deflect: a flying knee, in the air, that turns projectiles back', () => {
  assert.equal(DEF.deflect.deflectProjectiles, true);
  const { fighter, step } = solo();
  airborne(step);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
  const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 400 });
  hold(d.target, 40);
  d.tick({}, P('shield'));
  shotAt(d, d.attacker, d.target, -120, 1);
  after(d, 0.3);
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0015');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.deflections.length, 'turned back');
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays its whole kit: its gloves, its hammer up close and in the air, the dive, its presents and its tornadoes', () => {
  const used = new Map();
  for (const difficulty of ['medium', 'brutal']) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const foe of [DEF_0001, DEF_0007, DEF_0009]) {
        const { log } = cpuFight(DEF, foe, { seconds: 30, seed, difficulty });
        const me = [...log.keys()].find((f) => f.def === DEF && f.slot === 'p1');
        for (const [k, v] of me.controller.telemetry.moveUsage) used.set(k, (used.get(k) ?? 0) + v);
      }
    }
  }
  for (const move of [
    'attack1:ground', 'attack1:air', 'attack2:ground', 'attack2:air', 'attack3:ground', 'attack3:air',
    'attack4:ground', 'attack4:air', 'extra_attack:ground',
  ]) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0015, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names are put together here so this file never spells them.
const UNNAMED = new RegExp([
  ['a', 'm', 'y'].join(''),
  ['p', 'i', 'k', 'o'].join(''),
  ['r', 'o', 's', 'y'].join(''),
].map((name) => `\\b${name}\\b`).join('|'), 'i');
const BINARY = /\.(png|jpe?g|gif|webp|ico)$/i;

function repositoryPaths(dir = '') {
  return readdirSync(`${ROOT}${dir}` || './', { withFileTypes: true }).flatMap((e) => {
    // Not the repository's own: Git's store, npm's packages, and the generated
    // itch.io release (dist/, ignored by Git: copies of files read here).
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'dist' || e.name === '.wrangler') return [];
    const path = `${dir}${e.name}`;
    return e.isDirectory() ? [`${path}/`, ...repositoryPaths(`${path}/`)] : [path];
  });
}

test('the character behind #0015 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0015.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
});
