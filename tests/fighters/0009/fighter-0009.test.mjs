// Run with node --test tests/fighters/0009/fighter-0009.test.mjs (no dependencies).
// #0009, the young monk of the four elements: registered from CHARACTERS
// alone in roster slot 09, its clips cut from one sprite sheet into its own
// folder and read from the real PNGs (tight, 1x, one art-pixel scale,
// anchored on its trousers wherever its staff, its fire, its water or its
// whirl reach), five numbered buttons (three ordinary attacks with their
// mid-air versions and two techniques) and an extra attack, its Earth
// Pillar. It would rather move an opponent than hurt one: Swift Strikes and
// the Fire Kick up close (its Mash Combo), the Staff Swing and the Rising
// Air Kick in the air, the Air Blast that blows its target away before
// flinging it and blows shots back (the Air Gust in the air, floating), the
// Earth Pillar that throws up whoever stands on it and stops shots, the
// Freezing Splash that freezes, and the Air Sphere, its trance, open only in
// danger. A held direction bends its launches further than anyone's. The
// roster, credits and translations it adds are checked in empty-roster,
// settings and i18n. Layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { STAGE, duel, endanger, fakeSpritesOf, makeFighter, steps, cpuFight } from '../../helpers/fighter-harness.mjs';
import { scenario } from '../../helpers/cpu-scenario.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { CHARACTERS, getCharacter, playableCharacters } from '../../../js/data/characters.js';
import { abilityName } from '../../../js/data/abilities.js';
import { describeLoadout, loadoutProblems } from '../../../js/data/loadout.js';
import { isSpecialAbility } from '../../../js/data/special-abilities.js';
import { mashComboProblems } from '../../../js/data/mash-combo.js';
import { pad, flick } from '../../../js/data/characters/helpers.js';
import { createAttackDefinition, isMeleeAttack, isRangedAttack } from '../../../js/game/combat/attacks.js';
import { abilityGroups, activeSpecialAbility, moveRestriction } from '../../../js/game/combat/move-status.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { analyzeCapabilities, moveReady } from '../../../js/game/ai/cpu-intelligence/capabilities.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0009/';
const DEF = getCharacter('0009');
const DEF_0001 = getCharacter('0001');
const DEF_0007 = getCharacter('0007');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0009_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0009 on its own, and against #0001 (or `target`) at `gap`.
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
  Object.assign(f.body, { y: f.body.y - height, prevY: f.body.y - height, grounded: false, ground: null, gravityScale: 0, vy: 0 });
}
const mine = (d, move) => d.events.filter((e) => e.attacker === d.attacker && (e.move === move || e.ability === move));
const after = (d, seconds, held = {}, targetHeld = {}) => {
  for (let i = 0; i < steps(seconds); i++) d.tick(held, targetHeld);
};

const { images: IMAGES, sprites: REAL } = realArt(DEF);

// Every clip and the files it plays, in order (a file shown twice is one
// file on disk).
const CLIPS = {
  idle: named('idle', 5),
  run: named('run', 8),
  jump: named('jump', 3),
  fall: named('fall', 2),
  land: named('land', 3),
  mouvment: named('mouvment', 2),
  midair_mouvment: named('midair_mouvment', 1),
  hurt: named('hurt', 3),
  midair_hurt: named('midair_hurt', 1),
  prepshield: named('prepshield', 1),
  shielding: named('shielding', 1),
  releaseshield: named('releaseshield', 1),
  deflect: named('deflect', 4),
  attack1: named('attack1', [1, 1, 2, 3, 4, 5, 6, 6, 1]),
  midair_attack1: named('midair_attack1', [1, 2, 3, 3, 4]),
  attack2: named('attack2', [1, 1, 1, 2, 3, 3, 4]),
  midair_attack2: named('midair_attack2', 5),
  attack3: named('attack3', [1, 2, 3, 3, 4, 5, 5]),
  attack4_cast: named('attack4', 7),
  attack4_release: named('attack4', range(6, 8)),
  attack5_cast: named('attack5', [1, 2, 3, 4, 5, 4, 5]),
  attack5_release: named('attack5', [4, 5, 4, 5, 4, 5]),
  extra_attack: named('extra_attack', 7),
};
const OBJECTS = {
  attack3_object: named('attack3_object', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 5, 11, 12, 2]),
  midair_attack3_object: named('midair_attack3_object', 8),
  extra_attack_object: named('extra_attack_object', 1),
  attack5_object: named('attack5_object', 6),
};
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(OBJECTS)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 49, run: 45, jump: 48, fall: 46, land: 41, mouvment: 45, midair_mouvment: 44, hurt: 47, midair_hurt: 34,
  prepshield: 48, shielding: 43, releaseshield: 46, deflect: 65, attack1: 48, midair_attack1: 73, attack2: 46,
  midair_attack2: 55, attack3: 47, attack4_cast: 49, attack4_release: 75, attack5_cast: 48, attack5_release: 35,
  extra_attack: 49,
};

// ---- Registration -------------------------------------------------------------------

test('#0009 is a real CHARACTERS entry: available, in roster slot 09, after #0001 to #0008', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0009'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0009');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 8);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('five numbered attacks, each a button of its own: three ordinary with mid-air versions, two techniques; plus the Earth Pillar', () => {
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
  assert.deepEqual(Object.keys(DEF.attacks).sort(), [
    'attack1', 'attack2', 'attack3', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3',
  ]);
  assert.deepEqual(Object.keys(DEF.techniques), ['attack4', 'attack5']);
  assert.equal(DEF.summons, undefined, 'it summons nobody');
});

test('what it creates costs Energy, and nothing else does: the Air Blast, the Air Gust and the Earth Pillar 15 each; its strikes, its staff and its techniques nothing', () => {
  const { fighter } = solo();
  const cost = Object.fromEntries(Object.entries(fighter.attacks).map(([id, a]) => [id, a.energyCost]));
  assert.deepEqual(cost, {
    attack1: 0, midair_attack1: 0, attack2: 0, midair_attack2: 0, attack3: 15, midair_attack3: 15, extra_attack: 15,
  });
  for (const id of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2']) assert.equal(isMeleeAttack(fighter.attacks[id]), true, id);
  for (const id of ['attack3', 'midair_attack3', 'extra_attack']) assert.equal(isRangedAttack(fighter.attacks[id]), true, id);
  assert.equal(fighter.techniqueDefs.attack4.energyCost, 0, 'the Freezing Splash freezes: its cooldown is its limit');
  assert.equal(fighter.techniqueDefs.attack5.energyCost, 0, 'the Air Sphere deals 10: its cooldown is its limit');
  assert.equal(fighter.techniqueDefs.attack4.cooldown, 3);
  assert.equal(fighter.techniqueDefs.attack5.cooldown, 5);
  for (const a of Object.values(fighter.attacks)) assert.equal(a.cooldown, 0, `${a.id}: ordinary`);
});

test('two Specials: the Freezing Splash and the Air Sphere; its Air Blast, Air Gust and Earth Pillar are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack4', 'attack5']);
  for (const move of ['attack4', 'attack5']) assert.equal(isSpecialAbility(DEF, move), true, move);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its Mash Combo: Swift Strikes and the Fire Kick, its two close-range strikes; its wind and its rock are no partner', () => {
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'attack2'] });
  assert.deepEqual(mashComboProblems(DEF), []);
  assert.equal(DEF.attacks.mash_attack, undefined, 'no button-less partner: both are on its buttons');
  for (const id of ['attack3', 'extra_attack']) {
    assert.notDeepEqual(mashComboProblems({ ...DEF, mashCombo: { attacks: ['attack1', id] } }), [], `${id} could not be its partner`);
  }
  // Five presses of Swift Strikes' button set off the series: the Fire Kick
  // comes second.
  const { fighter, step } = solo();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    step(P('attack1'));
    for (let k = 0; k < 4; k++) seen.push(step({}).combat.attack?.def.id);
  }
  for (let i = 0; i < steps(5); i++) seen.push(step({}).combat.attack?.def.id);
  assert.ok(seen.includes('attack2'), 'the Fire Kick is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'attack5', 'extra_attack'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Swift Strikes', 'Staff Swing', 'Fire Kick', 'Rising Air Kick', 'Air Blast', 'Air Gust', 'Freezing Splash', 'Air Sphere', 'Earth Pillar',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Earth Pillar', 'Swift Strikes', 'Fire Kick', 'Air Blast', 'Freezing Splash', 'Air Sphere']);
  assert.deepEqual(buttons('fr'), ['Pilier de terre', 'Frappes rapides', 'Coup de pied de feu', 'Souffle d’air', 'Gerbe glacée', 'Sphère d’air']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3'].map((m) => STRINGS.fr[`ability.0009.${m}`]),
    ['Coup de bâton', 'Coup de pied aérien ascendant', 'Rafale d’air']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => art(a)), [
    '0009_extra_attack_object_1.png', '0009_attack1_6.png', '0009_attack2_2.png', '0009_attack3_object_7.png', '0009_attack4_8.png',
    '0009_attack5_4.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack3'].map((a) => art(a, true)),
    ['0009_midair_attack1_3.png', '0009_midair_attack2_3.png', '0009_midair_attack3_object_4.png']);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0009.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: its strikes on Square and Triangle, its wind on R2 both ways, the Air Sphere on L2, the splash forward and the rock up on the right stick', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:attack3': pad('r2'),
    'ground:attack4': flick('forward'),
    'ground:attack5': pad('l2'),
    'ground:extra_attack': flick('up'),
    'air:attack1': pad('west'),
    'air:attack2': flick('up'),
    'air:attack3': pad('r2'),
  });
  assert.equal(DEF.controller.previous, undefined, 'added after settings version 5: no layout of then');
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips and objects play: every file named <id>_<codename>_<frame>.png, none a copy', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 111);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  for (const [key, want] of Object.entries(OBJECTS)) {
    const clip = DEF.projectileAnimations[key] ?? DEF.effectAnimations[key];
    assert.deepEqual(clip.frames.map(file), want, key);
  }
  // The Air Gust is the Air Blast's own clip, played in the air.
  assert.equal(DEF.attacks.midair_attack3.animation, 'attack3');
  // A drawing the sheet repeats is one file, played again: no two files
  // anywhere in the folder are the same picture.
  const seen = new Map();
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const key = `${w}x${h}:${Buffer.from(pixels).toString('base64')}`;
    assert.equal(seen.get(key), undefined, `${name} is a copy of ${seen.get(key)}`);
    seen.set(key, name);
  }
});

test('every frame is cut clean: none of the sheet\'s green background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 0 && g === 150 && b === 0), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 49);
  assert.ok(near(REAL.worldPerArt, 88 / 52), 'the same world size per art pixel as the rest of the roster');
  assert.ok(near(DEF.visual.height, 49 * 88 / 52), 'about 83 units tall');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(near(anim.maxArtH, HEIGHTS[key]), `${key}: tallest frame ${anim.maxArtH}`);
    for (const f of anim.frames) {
      assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
      assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth), `${key}: its width`);
      assert.ok(near(f.artH, IMAGES.get(f.url).naturalHeight), `${key}: its height`);
    }
  }
  // Its wind, its rock and its sphere are drawn at the same art-pixel size,
  // centred where they are.
  for (const anim of [...Object.values(REAL.projectiles), ...Object.values(REAL.effects)]) {
    for (const f of anim.frames) assert.ok(near(f.unit, 1) && near(f.anchorArtX, f.artW / 2) && near(f.anchorArtY, f.artH / 2), anim.key);
  }
  assert.deepEqual(Object.keys(REAL.projectiles).sort(), ['attack3_object', 'extra_attack_object', 'midair_attack3_object']);
  assert.deepEqual(Object.keys(REAL.effects), ['attack5_object']);
});

test('anchors keep the body in place: authored on its trousers wherever its staff, its water or its whirl reach', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  // The staff held far behind it, then swung far ahead: the body stays
  // where it is, at the right of the frame, then at its left.
  assert.deepEqual(ax('midair_attack1'), [41, 44.5, 14, 14, 9]);
  // The splash bursts far ahead of it.
  assert.deepEqual(ax('attack4_release'), [19, 19, 18, 19, 19.5, 19.5]);
  const auto = withFakeCanvas(() => REAL.animations.attack4_release.frames.map((f) => f.anchorX));
  assert.ok(Math.abs(auto[0] - ax('attack4_release')[0]) > 15, 'the authored anchor stays on the body, not the splash');
  // The water drawn along the ground behind it.
  assert.deepEqual(ax('attack4_cast').slice(0, 3), [37.5, 37.5, 36.5]);
  for (const key of Object.keys(CLIPS)) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its face', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(49 * DEF.visual.portrait.size));
});

// ---- Its strikes ---------------------------------------------------------------------

test('Swift Strikes: a jab that holds the target, then a straight that knocks it back (1, 3 at Base Launch 1)', () => {
  const d = versus({ gap: 50 });
  d.tick(P('attack1'));
  after(d, 0.5);
  const hits = mine(d, 'attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 3]]);
  assert.equal(hits[0].launchSpeed, 0, 'held for the straight');
  assert.deepEqual([hits[1].baseLaunch, hits[1].directionalLaunch], [1, 'horizontal']);
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.45), 'its jab at 0.1 s, 0.45 s in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const far = versus({ gap: 120 });
  far.tick(P('attack1'));
  after(far, 0.5);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of a fist\'s reach, nothing');
});

test('the Fire Kick: fire swept round its feet holds the target, either side, then the flaming kick sends it flying (1, then 3 at Base Launch 2)', () => {
  const d = versus({ gap: 50 });
  d.tick(P('attack2'));
  after(d, 0.6);
  const hits = mine(d, 'attack2');
  assert.deepEqual(hits.map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 3]]);
  assert.equal(hits[0].launchSpeed, 0, 'held for the kick');
  assert.deepEqual([hits[1].baseLaunch, hits[1].directionalLaunch], [2, 'horizontal']);
  // The fire at its feet reaches behind it too.
  const back = versus({ gap: 30, targetFacing: 1 });
  Object.assign(back.target.body, { x: back.attacker.body.x - 30, prevX: back.attacker.body.x - 30 });
  back.tick(P('attack2'));
  after(back, 0.6);
  assert.deepEqual(mine(back, 'attack2').map((e) => e.damage), [1], 'the sweep catches it behind; the kick goes the other way');
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  assert.ok(near(atk.startup, 2 / 15) && near(atk.total, 7 / 15) && atk.damage === 4);
  assert.equal(atk.stepIn, 'universal');
});

test('the Staff Swing: the staff over its head and down through a great arc in front of it (3 at Base Launch 2), out to 96 units', () => {
  for (const [gap, lands] of [[40, true], [90, true], [140, false]]) {
    const d = versus({ gap });
    hold(d.attacker, 40);
    hold(d.target, 40);
    d.tick(P('attack1'));
    assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack1');
    after(d, 0.4);
    const hits = mine(d, 'midair_attack1');
    assert.equal(hits.length > 0, lands, `${gap} away`);
    if (lands) assert.deepEqual([hits[0].damage, hits[0].baseLaunch, hits[0].directionalLaunch], [3, 2, 'horizontal']);
  }
});

test('the Rising Air Kick: it rides the air up as it kicks, launching its target straight up (3 at Base Launch 2); once per airtime', () => {
  const { fighter, step } = solo();
  airborne(step, 20);
  const y0 = fighter.body.y;
  step(P('attack2'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack2');
  assert.equal(fighter.combat.attack.def.motion.type, 'rise');
  for (let i = 0; i < steps(0.2); i++) step({});
  assert.ok(fighter.body.y < y0 - 30, `it rose ${y0 - fighter.body.y} units`);
  while (fighter.combat.attack) step({});
  step(P('attack2'));
  assert.notEqual(fighter.combat.attack?.def.id, 'midair_attack2', 'used up until it lands');
  // Against a target hanging above it.
  const d = versus({ gap: 14 });
  hold(d.attacker, 20);
  hold(d.target, 70);
  d.tick(P('attack2'));
  after(d, 0.4);
  const [hit] = mine(d, 'midair_attack2');
  assert.deepEqual([hit.type, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 3, 2, 'vertical']);
  assert.ok(hit.finalLaunch.y < 0, 'up');
});

// ---- Its wind -------------------------------------------------------------------------

test('the Air Blast: a cone of wind that drags its target along with it, then flings it (1, 1, then 3 at Base Launch 2); 4/15 s to see it coming', () => {
  const atk = createAttackDefinition({ id: 'attack3', ...DEF.attacks.attack3 }, { projectiles: DEF.projectiles });
  assert.ok(near(atk.projectile.spawnAt, 4 / 15) && near(atk.total, 7 / 15));
  const d = versus({ gap: 130 });
  const x0 = d.target.body.x;
  d.tick(P('attack3'));
  assert.ok(d.attacker.combat.maxEnergy - d.attacker.combat.energy > 14, 'it paid 15 for the wind');
  after(d, 1.2);
  const hits = mine(d, 'attack3_object');
  assert.deepEqual(hits.map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 1], ['hit', 3]]);
  assert.ok(hits.slice(0, 2).every((e) => e.launchSpeed === 0), 'no launch: the wind carries it');
  assert.deepEqual([hits[2].baseLaunch, hits[2].directionalLaunch], [2, 'horizontal']);
  assert.ok(d.target.body.x - x0 > 80, `blown ${Math.round(d.target.body.x - x0)} units away`);
  // Out of the wind's reach, nothing.
  const far = versus({ gap: 400 });
  far.tick(P('attack3'));
  after(far, 1.2);
  assert.deepEqual(mine(far, 'attack3_object'), []);
});

test('the Air Blast blows a projectile back at its thrower, now #0009\'s', () => {
  // #0007 fires its pistol at it from 300 away as it blows.
  const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 300 });
  d.tick({}, P('attack3'));
  after(d, 0.2);
  d.tick(P('extra_attack'));
  after(d, 1);
  assert.deepEqual(d.events.filter((e) => e.target === d.target && e.type === 'hit'), [], 'the bullet never struck it');
  const back = d.events.find((e) => e.attacker === d.target && e.target === d.attacker && e.redirected);
  assert.ok(back, 'its own bullet comes back at #0007');
  assert.equal(back.ability, 'extra_attack');
});

test('the Air Gust: in the air, it floats where it is as a quick puff of wind pushes its target away (1, carried); once per airtime', () => {
  const { fighter, step } = solo();
  airborne(step, 6);
  step(P('attack3'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack3');
  assert.equal(fighter.combat.attack.def.motion.type, 'hover');
  const y0 = fighter.body.y;
  while (fighter.combat.attack) step({});
  assert.ok(Math.abs(fighter.body.y - y0) < 4, 'it held its height');
  step(P('attack3'));
  assert.notEqual(fighter.combat.attack?.def.id, 'midair_attack3', 'used up until it lands');
  const d = versus({ gap: 100 });
  hold(d.attacker, 50);
  hold(d.target, 50);
  const x0 = d.target.body.x;
  d.tick(P('attack3'));
  after(d, 0.6);
  const [hit] = mine(d, 'midair_attack3_object');
  assert.deepEqual([hit.type, hit.damage, hit.launchSpeed], ['hit', 1, 0]);
  assert.ok(d.target.body.x - x0 > 20, `pushed ${Math.round(d.target.body.x - x0)} units away`);
  assert.equal(d.attacker.projectileDefs.midair_attack3_object.repel, true, 'and it blows shots back');
});

// ---- Its rock -------------------------------------------------------------------------

test('the Earth Pillar: rock rises out of the ground ahead and throws up whoever stands there (5 at Base Launch 2); one in the air is passed by', () => {
  const d = versus({ gap: 84 });
  d.tick(P('extra_attack'));
  after(d, 1);
  const [hit] = mine(d, 'extra_attack_object');
  assert.deepEqual([hit.type, hit.source, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 'projectile', 5, 2, 'vertical']);
  assert.ok(hit.finalLaunch.y < 0, 'thrown up');
  // It stays where it rose (no speed) for 0.75 s.
  const s = versus({ gap: 400 });
  s.tick(P('extra_attack'));
  while (!s.projectiles.length) s.tick();
  const pillar = s.projectiles[0];
  const x = pillar.x;
  assert.ok(near(x - s.attacker.body.x, 84, 1e-6), '84 units ahead of it');
  after(s, 0.5);
  assert.equal(pillar.x, x, 'it never moves');
  assert.equal(pillar.alive, true);
  after(s, 0.3);
  assert.equal(pillar.alive, false, 'gone after 0.75 s');
  // Held in the air over it, the target is passed by.
  const a = versus({ gap: 84 });
  hold(a.target, 60);
  a.tick(P('extra_attack'));
  after(a, 1);
  assert.deepEqual(mine(a, 'extra_attack_object'), [], 'rising out of the ground, it reaches only a fighter standing on it');
  // On the ground only.
  const { fighter, step } = solo();
  airborne(step, 20);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null);
});

test('the Earth Pillar stops a shot that meets it: #0007\'s bullet is gone against the rock', () => {
  const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 300 });
  d.tick({}, P('extra_attack'));
  while (!d.projectiles.some((p) => p.owner === d.target)) d.tick();
  d.tick(P('extra_attack'));
  after(d, 0.6);
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'the bullet never reached it');
  assert.ok(!d.projectiles.some((p) => p.owner === d.attacker), 'the bullet is gone');
});

// ---- Its water ------------------------------------------------------------------------

test('the Freezing Splash: water drawn up and thrown, bursting in an icy splash that freezes its target for a second (3, no launch); every 3 s', () => {
  const t = DEF.techniques.attack4;
  assert.ok(near(SPRITES.duration(t.castAnimation), 7 / 15) && near(SPRITES.duration(t.releaseAnimation), 0.5));
  for (const [gap, lands] of [[50, true], [140, true], [200, false]]) {
    const d = versus({ gap });
    d.tick(P('attack4'));
    if (gap === 50) assert.equal(activeSpecialAbility(d.attacker), 'attack4', 'its orange mark shows');
    after(d, 1.2);
    const hits = mine(d, 'attack4');
    assert.equal(hits.length > 0, lands, `${gap} away`);
    if (!lands) continue;
    assert.deepEqual([hits[0].type, hits[0].source, hits[0].damage, hits[0].launchSpeed], ['hit', 'technique', 3, 0]);
    assert.ok(near(hits[0].paralysis, 1), 'frozen for a second');
    assert.ok(d.attacker.combat.abilityCooldowns.active('attack4'), 'its 3 s run from the release');
  }
  // Frozen, it cannot act.
  const d = versus({ gap: 80 });
  d.tick(P('attack4'));
  while (!mine(d, 'attack4').length) d.tick();
  const x = d.target.body.x;
  after(d, 0.5, {}, { runRight: true, ...P('attack1') });
  assert.equal(d.target.body.x, x, 'held where it stands');
  assert.equal(d.target.combat.attack, null, 'and does nothing');
});

test('a hit before the splash lets go breaks it: no splash, no cooldown', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack4'));
  after(d, 0.1);
  d.tick({}, P('attack1'));
  after(d, 1);
  assert.equal(d.attacker.technique, null, 'broken');
  assert.deepEqual(mine(d, 'attack4'), []);
  assert.equal(d.attacker.combat.abilityCooldowns.active('attack4'), false, 'ready again at once');
});

// ---- Its trance -----------------------------------------------------------------------

test('the Air Sphere opens only in danger: under 30 Launch Point a press does nothing, the ability HUD holds it back and the CPU waits', () => {
  assert.equal(DEF.techniques.attack5.minLaunchPoint, 30);
  const { fighter, step } = solo();
  const entry = abilityGroups(DEF).ground.find((e) => e.move === 'attack5');
  step({});
  fighter.combat.launchPoint = 29;
  step(P('attack5'));
  assert.equal(fighter.technique, null, 'nothing starts');
  assert.equal(moveRestriction(fighter, entry, 'ground'), 'danger');
  const m = analyzeCapabilities(fighter).moves.find((x) => x.kind === 'technique' && x.id === 'attack5');
  assert.equal(moveReady(fighter, m), false);
  fighter.combat.launchPoint = 30;
  assert.equal(moveRestriction(fighter, entry, 'ground'), null);
  assert.equal(moveReady(fighter, m), true);
  step(P('attack5'));
  assert.equal(fighter.technique?.def.id, 'attack5', 'in danger, it sinks into its trance');
  // The Freezing Splash needs no danger.
  assert.equal(DEF.techniques.attack4.minLaunchPoint, undefined);
});

test('the Air Sphere: seven twelfths of a second into meditation, then a sphere of air bursts out round it (10 at Base Launch 3, straight up), either side; every 5 s', () => {
  const t = DEF.techniques.attack5;
  assert.ok(near(SPRITES.duration(t.castAnimation), 7 / 12) && near(SPRITES.duration(t.releaseAnimation), 0.5),
    'a deliberate Special: 7/12 s + 0.5 s');
  for (const [gap, side, lands] of [[50, 1, true], [50, -1, true], [100, 1, false]]) {
    const d = versus({ gap });
    if (side < 0) Object.assign(d.target.body, { x: d.attacker.body.x - gap, prevX: d.attacker.body.x - gap });
    endanger(d.attacker);
    d.tick(P('attack5'));
    assert.equal(activeSpecialAbility(d.attacker), 'attack5', 'its orange mark shows');
    after(d, 1.2);
    const hits = mine(d, 'attack5');
    assert.equal(hits.length > 0, lands, `${gap} away, side ${side}`);
    if (!lands) continue;
    assert.deepEqual([hits[0].type, hits[0].source, hits[0].damage, hits[0].baseLaunch, hits[0].directionalLaunch],
      ['hit', 'technique', 10, 3, 'vertical']);
    assert.ok(hits[0].finalLaunch.y < 0, 'thrown up');
    assert.equal(d.attacker.combat.abilityCooldowns.active('attack5'), true, 'its 5 s run from the release');
  }
  // Its sphere is the burst's own art, played once round it as it goes out.
  assert.deepEqual(t.burst.effect, { animation: 'attack5_object', offset: { x: 0, y: -30 } });
});

// ---- Its defense and its body ---------------------------------------------------------

test('its Deflect: its staff twirled over its head, in the air, that turns projectiles back', () => {
  assert.equal(DEF.deflect.deflectProjectiles, true);
  assert.equal(DEF.deflect.animation, 'deflect');
  const { fighter, step } = solo();
  airborne(step);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
  // #0007's bullet, met in the air by the whirl, goes back.
  const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 400 });
  hold(d.target, 60);
  const def = d.attacker.projectileDefs.extra_attack_object;
  const b = d.target.body;
  d.tick({}, P('shield'));
  assert.equal(d.target.combat.attack?.def.id, 'deflect');
  // A bullet arriving as the whirl turns.
  d.projectiles.push(new Projectile({ owner: d.attacker, def, anim: d.attacker.sprites.projectile(def.animation), x: b.x - 110, y: b.y - 60, direction: 1 }));
  after(d, 0.3);
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0009');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.events.some((e) => e.redirected), 'turned back');
});

test('light on the wind: a held direction bends its launches further than anyone\'s (30 degrees)', () => {
  assert.equal(DEF.launchReaction.steerAngle, 30);
  for (const c of playableCharacters().filter((x) => x !== DEF)) {
    assert.ok((c.launchReaction?.steerAngle ?? 0) < 30, `#${c.id}`);
  }
  assert.equal(DEF.launchBounce, undefined, 'it rebounds as everyone does');
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays its whole kit: its strikes, its staff, its wind, its rock, its water and, once in danger, its trance', () => {
  // Every fighter as its opponent, at Medium and at Brutal, on two seeds.
  const used = new Map();
  for (const difficulty of ['medium', 'brutal']) {
    for (const seed of [1, 2]) {
      for (const foe of playableCharacters()) {
        const { log } = cpuFight(DEF, foe, { seconds: 30, seed, difficulty });
        const me = [...log.keys()].find((f) => f.def === DEF && f.slot === 'p1');
        for (const [k, v] of me.controller.telemetry.moveUsage) used.set(k, (used.get(k) ?? 0) + v);
      }
    }
  }
  for (const move of [
    'attack1:ground', 'attack1:air', 'attack2:ground', 'attack2:air', 'attack3:ground', 'attack3:air', 'attack4:ground',
    'extra_attack:ground',
  ]) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
  // Its trance only in danger: held at 40 Launch Point against an opponent
  // that fights back, the CPU sinks into it now and then (its Mash Combo,
  // when one is open, comes first).
  let spheres = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const sc = scenario({ cpuDef: DEF, foeDef: DEF_0001, difficulty: 'brutal', seed, cpuLP: 40, holdLP: true, foe: 'ref:balanced' });
    sc.run(15);
    spheres += sc.ai.telemetry.moveUsage.get('attack5:ground') ?? 0;
  }
  assert.ok(spheres > 0, 'in danger, it uses its Air Sphere');
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0009, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names, its companions' and its work's are put together here so this file
// never spells them.
const UNNAMED = new RegExp([
  ['a', 'a', 'n', 'g'].join(''),
  ['a', 'v', 'a', 't', 'a', 'r'].join(''),
  ['l', 'a', 's', 't', ' ?', 'a', 'i', 'r', 'b', 'e', 'n', 'd', 'e', 'r'].join(''),
  ['k', 'a', 't', 'a', 'r', 'a'].join(''),
  ['s', 'o', 'k', 'k', 'a'].join(''),
  ['z', 'u', 'k', 'o'].join(''),
  ['\\b', 't', 'o', 'p', 'h', '\\b'].join(''),
  ['\\b', 'a', 'p', 'p', 'a', '\\b'].join(''),
  ['o', 'z', 'a', 'i'].join(''),
  ['g', 'y', 'a', 't', 's', 'o'].join(''),
].join('|'), 'i');
const BINARY = /\.(png|jpe?g|gif|webp|ico)$/i;

function repositoryPaths(dir = '') {
  return readdirSync(`${ROOT}${dir}` || './', { withFileTypes: true }).flatMap((e) => {
    // Not the repository's own: Git's store, npm's packages, and the generated
    // itch.io release (dist/, ignored by Git: copies of files read here).
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'dist') return [];
    const path = `${dir}${e.name}`;
    return e.isDirectory() ? [`${path}/`, ...repositoryPaths(`${path}/`)] : [path];
  });
}

test('the character behind #0009 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0009.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
  assert.ok(STAGE);
});
