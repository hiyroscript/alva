// Run with node --test tests/fighters/0005/fighter-0005.test.mjs (no dependencies).
// #0005, the dancing clown: registered from CHARACTERS alone in roster slot
// 05, its clips cut from one sprite sheet into its own folder and read from
// the real PNGs (tight, 1x, one art-pixel scale, anchored on its body
// wherever its neck, tendrils or ghostly hands reach), five numbered
// buttons (three ordinary attacks with their mid-air versions, a technique
// and the roster's first summon) and an extra attack, every move a
// mechanic of its own: the Claw Swipe, the Claw Rake's downward blow, the
// Long Bite's reach (and nothing close to it) and heavy fling, Snapping
// Jaws, Phantom Hands hurling upward, Floating Hands hovering, the
// Deadlights floating whoever faces them, the Red Balloon's phantom biting
// from behind and its fear feeding #0005, and Dark Tendrils seizing and
// reeling in only what is in front. The float, the fear, the gaze and the
// front-only pull it is built on are checked on bespoke data in
// tests/systems/ (float, fear, gaze, pull); the roster, credits and
// translations it adds in empty-roster, settings and i18n. Layout and
// paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { DT, STAGE, duel, fakeSpritesOf, makeFighter, stageMap, steps, cpuFight } from '../../helpers/fighter-harness.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { playerRig, press } from '../../helpers/player-rig.mjs';
import { CHARACTERS, getCharacter, playableCharacters } from '../../../js/data/characters.js';
import { abilityName } from '../../../js/data/abilities.js';
import { describeLoadout, loadoutProblems } from '../../../js/data/loadout.js';
import { isSpecialAbility } from '../../../js/data/special-abilities.js';
import { pad, flick } from '../../../js/data/characters/helpers.js';
import { createAttackDefinition } from '../../../js/game/combat/attacks.js';
import { FLOAT_RISE_SPEED } from '../../../js/game/combat/hit-effects.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { StageCollision } from '../../../js/game/physics.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0005/';
const DEF = getCharacter('0005');
const DEF_0001 = getCharacter('0001');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0005_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0005 on its own, and against #0001 (or `target`) at `gap`.
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
  idle: named('idle', 2),
  run: named('run', 4),
  jump: named('jump', 2),
  fall: named('fall', 1),
  land: named('land', 1),
  mouvment: named('mouvment', 2),
  midair_mouvment: named('midair_mouvment', 2),
  hurt: named('hurt', 1),
  midair_hurt: named('midair_hurt', 1),
  prepshield: named('prepshield', 2),
  shielding: named('shielding', 1),
  releaseshield: named('releaseshield', 2),
  deflect: named('deflect', [1, 2, 2, 3]),
  attack1: named('attack1', 3),
  // The Backhand Rake, its Mash Combo partner: the Deflect's claw sweep under
  // its own codename.
  mash_attack: named('mash_attack', [1, 2, 2, 3]),
  midair_attack1: named('midair_attack1', 5),
  attack2: named('attack2', [1, 2, 3, 4, 5, 6, 7, 8, 9, 4, 3, 2, 1]),
  midair_attack2: named('midair_attack2', [1, 2, 3, 4, 5, 6, 6, 7, 2, 1]),
  attack3: named('attack3', [1, 1, 2, 3, 4, 5, 6]),
  midair_attack3: named('midair_attack3', 7),
  attack4_cast: named('attack4', [1, 2]),
  attack4_release: named('attack4', [3]),
  attack5_summon: named('attack5_summon', 4),
  attack5: named('attack5', 5),
  extra_attack: named('extra_attack', [1, 2, 3, 4, 5, 5, 5, 3, 1]),
};
const OBJECTS = { attack5_object: named('attack5_object', 2) };
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(OBJECTS)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 64, run: 47, jump: 61, fall: 61, land: 42, mouvment: 51, midair_mouvment: 47, hurt: 53, midair_hurt: 55,
  prepshield: 56, shielding: 59, releaseshield: 56, deflect: 71, attack1: 58, mash_attack: 71, midair_attack1: 71, attack2: 51,
  midair_attack2: 50, attack3: 67, midair_attack3: 77, attack4_cast: 56, attack4_release: 56, attack5_summon: 64,
  attack5: 62, extra_attack: 64,
};

// ---- Registration -------------------------------------------------------------------

test('#0005 is a real CHARACTERS entry: available, in roster slot 05, after #0001 to #0004', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0005'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0005');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 4);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.deepEqual(Object.keys(DEF.energy), ['regen'], 'its refill rate only');
});

test('five numbered attacks, each a button of its own: three ordinary with mid-air versions, a technique, a summon; plus Dark Tendrils', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { ground: 'attack3', air: 'midair_attack3' },
    attack4: { type: 'technique', id: 'attack4' },
    attack5: { type: 'summon', id: 'attack5' },
  });
  assert.deepEqual(describeLoadout(DEF), {
    numbered: ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'],
    buttons: ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'],
    air: { attack1: 'midair_attack1', attack2: 'midair_attack2', attack3: 'midair_attack3' },
    types: { attack1: 'attack', attack2: 'attack', attack3: 'attack', attack4: 'technique', attack5: 'summon' },
    extra: true,
  });
  // attack5 is the phantom's bite: the attack the summon's clone performs;
  // mash_attack the Backhand Rake, its Mash Combo partner, no button's.
  assert.deepEqual(Object.keys(DEF.attacks).sort(),
    ['attack1', 'attack2', 'attack3', 'attack5', 'extra_attack', 'mash_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3']);
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'mash_attack'] });
  assert.deepEqual(Object.keys(DEF.techniques), ['attack4']);
  assert.deepEqual(Object.keys(DEF.summons), ['attack5']);
  assert.equal(DEF.summons.attack5.attack, 'attack5');
  assert.equal(DEF.projectiles, undefined, 'it throws nothing');
  assert.deepEqual(Object.keys(DEF.effectAnimations), ['attack5_object']);
});

test('two Specials: the Deadlights and the Red Balloon; Dark Tendrils pull, but are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack4', 'attack5']);
  for (const move of ['attack4', 'attack5']) assert.equal(isSpecialAbility(DEF, move), true, move);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'attack5', 'extra_attack'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Claw Swipe', 'Claw Rake', 'Long Bite', 'Snapping Jaws', 'Phantom Hands', 'Floating Hands', 'Deadlights', 'Red Balloon', 'Dark Tendrils',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Dark Tendrils', 'Claw Swipe', 'Long Bite', 'Phantom Hands', 'Deadlights', 'Red Balloon']);
  assert.deepEqual(buttons('fr'), ['Tentacules sombres', 'Coup de griffes', 'Morsure allongée', 'Mains fantômes', 'Lumières mortes', 'Ballon rouge']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3', 'mash_attack'].map((m) => STRINGS.fr[`ability.0005.${m}`]),
    ['Griffes plongeantes', 'Mâchoires claquantes', 'Mains flottantes', 'Revers de griffes']);
  assert.equal(abilityName(DEF, 'mash_attack'), 'Backhand Rake', 'its Mash Combo partner');
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => art(a)), [
    '0005_extra_attack_4.png', '0005_attack1_2.png', '0005_attack2_5.png', '0005_attack3_3.png', '0005_attack4_3.png', '0005_attack5_4.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack3'].map((a) => art(a, true)),
    ['0005_midair_attack1_4.png', '0005_midair_attack2_3.png', '0005_midair_attack3_4.png']);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0005.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: claws, jaws and hands on the face both ways, the tendrils on R2, the Deadlights on L2, the balloons up on the right stick', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:attack3': pad('east'),
    'ground:extra_attack': pad('r2'),
    'ground:attack4': pad('l2'),
    'ground:attack5': flick('up'),
    'air:attack1': pad('west'),
    'air:attack2': pad('north'),
    'air:attack3': pad('east'),
  });
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips and objects play: every file named <id>_<codename>_<frame>.png, none a copy within a clip', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 83);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  assert.deepEqual(DEF.effectAnimations.attack5_object.frames.map(file), OBJECTS.attack5_object);
  // A frame a clip shows again is the same file, never a second one.
  for (const name of FILES) {
    const { pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const twins = FILES.filter((other) => other !== name && other.replace(/_\d+\.png$/, '') === name.replace(/_\d+\.png$/, ''))
      .filter((other) => Buffer.compare(Buffer.from(decodePng(`${ROOT}${DIR}${other}`).pixels), Buffer.from(pixels)) === 0);
    assert.deepEqual(twins, [], `${name}: no copy of it in its own clip`);
  }
});

test('every frame is cut clean: none of the sheet\'s red-orange background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 191 && g === 51 && b === 0), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 64);
  assert.ok(near(REAL.worldPerArt, 88 / 52), 'the same world size per art pixel as the rest of the roster');
  assert.ok(near(DEF.visual.height, 64 * 88 / 52), 'about 108 units tall: the tallest of the roster');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(near(anim.maxArtH, HEIGHTS[key]), `${key}: tallest frame ${anim.maxArtH}`);
    for (const f of anim.frames) {
      assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
      assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth), `${key}: its width`);
      assert.ok(near(f.artH, IMAGES.get(f.url).naturalHeight), `${key}: its height`);
    }
  }
  for (const f of REAL.effects.attack5_object.frames) assert.ok(near(f.unit, 1), 'its balloons: one file pixel per art pixel');
});

test('anchors keep the body in place: authored on the body wherever its neck, tendrils, hands or claws reach', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  assert.deepEqual(ax('attack2').slice(0, 9), [29, 28.5, 28.5, 28.5, 28, 28, 28, 28, 28]);
  assert.deepEqual(ax('extra_attack').slice(0, 5), [18.5, 18.5, 18, 18, 17]);
  // The neck stretches 150 units out in front: the automatic anchor (the
  // upper art's opaque middle) would follow it far off the body.
  const auto = withFakeCanvas(() => REAL.animations.attack2.frames.map((f) => f.anchorX));
  assert.ok(auto[4] > ax('attack2')[4] + 40, 'the authored anchor stays on the body, behind the jaws');
  // Arcs swept under the feet: the feet stay where they are.
  assert.deepEqual(REAL.animations.midair_attack1.frames.map((f) => f.anchorArtY), [61, 62, 66, 64, 64]);
  assert.deepEqual(REAL.animations.deflect.frames.map((f) => f.anchorArtY), [51, 57, 57, 42]);
  for (const key of ['idle', 'run', 'hurt', 'shielding', 'attack1', 'attack2', 'extra_attack']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its face', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(64 * DEF.visual.portrait.size));
});

// ---- Its moves -------------------------------------------------------------------------

test('the Claw Swipe: quick (a quarter of a second), 3 and Base Launch 1 sideways', () => {
  const d = versus({ gap: 44 });
  d.tick(P('attack1'));
  after(d, 0.3);
  const [hit] = mine(d, 'attack1');
  assert.deepEqual([hit.type, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 3, 1, 'horizontal']);
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 1 / 12) && near(atk.total, 0.25), 'its swipe at 1/12 s, a quarter of a second in all');
});

test('the Claw Rake: a sweep that holds the target (1), then a blow through the front that drives it down (3, Base Launch 1)', () => {
  const d = versus({ gap: 30 });
  airborne(d.tick);
  // The target held in the air just below it.
  hold(d.target, d.target.body.y - (d.attacker.body.y + 10));
  d.tick(P('attack1'));
  after(d, 0.4);
  const hits = mine(d, 'midair_attack1');
  assert.deepEqual(hits.map((e) => e.damage), [1, 3]);
  assert.equal(hits[1].directionalLaunch, 'reverseVertical');
  assert.ok(hits[1].finalLaunch.y > 0, 'down');
});

test('the Long Bite: all along its neck, from right up close out to the jaws (16 to 198 units), three bites that hold, then a heavy fling (5, Base Launch 3)', () => {
  for (const [gap, lands] of [[36, true], [60, true], [150, true], [240, false]]) {
    const d = versus({ gap });
    d.tick(P('attack2'));
    after(d, 0.9);
    const hits = mine(d, 'attack2');
    assert.equal(hits.length > 0, lands, `${gap} away`);
    if (!lands) continue;
    assert.deepEqual(hits.map((e) => e.damage), [1, 1, 1, 5]);
    assert.ok(hits.slice(0, 3).every((e) => e.launchSpeed === 0), 'held in the jaws');
    assert.deepEqual([hits[3].baseLaunch, hits[3].directionalLaunch], [3, 'horizontal']);
    assert.ok(hits[3].finalLaunch.x > 0, 'flung away from it');
  }
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  assert.ok(near(atk.startup, 4 / 15) && near(atk.total, 13 / 15), 'a good quarter of a second to see coming, 0.87 s in all');
  assert.equal(atk.cooldown, 0, 'its bites add up to 8: no cooldown at all');
});

test('Snapping Jaws: a shorter bite in the air, all along its neck from right up close (16 to 118 units), that chews, then flings (1, 1, 3 at Base Launch 2)', () => {
  for (const [gap, lands] of [[34, true], [90, true], [150, false]]) {
    const d = versus({ gap });
    airborne(d.tick);
    hold(d.target, d.target.body.y - d.attacker.body.y);
    d.tick(P('attack2'));
    after(d, 0.6);
    const hits = mine(d, 'midair_attack2');
    assert.equal(hits.length > 0, lands, `${gap} away`);
    if (!lands) continue;
    assert.deepEqual(hits.map((e) => e.damage), [1, 1, 3], `${gap} away`);
    assert.deepEqual([hits[2].baseLaunch, hits[2].directionalLaunch], [2, 'horizontal']);
  }
});

test('Phantom Hands: four bursts of ghostly hands, the last hurling the target up (3, Base Launch 2 straight up)', () => {
  const d = versus({ gap: 80 });
  d.tick(P('attack3'));
  after(d, 0.7);
  const hits = mine(d, 'attack3');
  assert.deepEqual(hits.map((e) => e.damage), [1, 1, 1, 3]);
  assert.deepEqual([hits[3].baseLaunch, hits[3].directionalLaunch], [2, 'vertical']);
  assert.ok(hits[3].finalLaunch.y < 0, 'up');
});

test('Floating Hands: it floats in place for the barrage, once per airtime', () => {
  const { fighter, step } = solo();
  airborne(step, 20);
  step(P('attack3'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack3');
  const y = fighter.body.y;
  while (fighter.combat.attack) {
    assert.ok(Math.abs(fighter.body.y - y) < 1, 'hovering where it started');
    step({});
  }
  step(P('attack3'));
  assert.equal(fighter.combat.attack?.def.id ?? null, null, 'once per airtime');
});

test('the Deadlights: 0.4 s splitting its face open, then whoever faces it in front floats up helpless for 1.6 s; a back turned to it is untouched', () => {
  const t = DEF.techniques.attack4;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.4) && near(SPRITES.duration(t.releaseAnimation), 1 / 3),
    'a deliberate Special: 0.4 s + 1/3 s');
  for (const [gap, targetFacing, shield, want] of [
    [120, -1, false, 'hit'], [120, 1, false, null], [-120, 1, false, null], [240, -1, false, null], [120, -1, true, 'block'],
  ]) {
    const d = versus({ gap, targetFacing });
    const guard = shield ? { shield: true } : {};
    d.tick({}, guard);
    d.tick(P('attack4'), guard);
    assert.equal(activeSpecialAbility(d.attacker), 'attack4', 'its orange mark shows');
    while (d.attacker.technique) d.tick({}, guard);
    const e = mine(d, 'attack4');
    const why = `${gap} away, facing ${targetFacing}${shield ? ', Shield up' : ''}`;
    assert.equal(e[0]?.type ?? null, want, why);
    if (want !== 'hit') {
      assert.equal(d.target.combat.afloat, false, why);
      continue;
    }
    assert.deepEqual([e[0].damage, e[0].float, e[0].launchSpeed], [1, 1.6, 0]);
    assert.equal(d.target.combat.afloat, true);
    const y = d.target.body.y;
    after(d, 0.5);
    assert.ok(d.target.body.y < y - FLOAT_RISE_SPEED * 0.4, 'rising');
    assert.equal(d.target.body.grounded, false);
  }
  assert.equal(solo().fighter.techniqueDefs.attack4.cooldown, 3, 'a float: the policy\'s 3 s');
});

test('Dark Tendrils seize what they meet in front and reel it in; one behind is left alone, a raised Shield holds its ground', () => {
  const d = versus({ gap: 250 });
  d.tick(P('extra_attack'));
  after(d, 0.5);
  const [seize] = mine(d, 'extra_attack');
  assert.deepEqual([seize.type, seize.damage, seize.launchSpeed], ['hit', 1, 0]);
  assert.ok(d.target.body.x - d.attacker.body.x < 130, `reeled in: ${d.target.body.x - d.attacker.body.x} away`);
  assert.ok(d.target.combat.stun > 0, 'still held as #0005 may act again');
  // Behind it: not pulled, not seized.
  const back = versus({ gap: -200, targetFacing: 1 });
  back.tick(P('extra_attack'));
  after(back, 0.5);
  assert.deepEqual(mine(back, 'extra_attack'), []);
  assert.ok(near(back.attacker.body.x - back.target.body.x, 200, 1), 'left where it was');
  // A Shield: it blocks the seizing and is not drawn in.
  const s = versus({ gap: 250 });
  s.tick({}, { shield: true });
  s.tick(P('extra_attack'), { shield: true });
  after(s, 0.5, {}, { shield: true });
  assert.deepEqual(mine(s, 'extra_attack').map((e) => e.type), ['block']);
  assert.ok(s.target.body.x - s.attacker.body.x > 240, 'it held its ground');
});

test('Dark Tendrils root #0005 where it stands: pressed on the run, either way, it keeps none of its speed', () => {
  for (const dir of [1, -1]) {
    const { fighter, step } = solo();
    const run = dir > 0 ? { runRight: true } : { runLeft: true };
    for (let i = 0; i < steps(0.6); i++) step(run);
    assert.ok(Math.abs(fighter.body.vx) > 300, 'running');
    step({ ...run, ...P('extra_attack') });
    assert.equal(fighter.combat.attack?.def.id, 'extra_attack');
    const x0 = fighter.body.x;
    for (let i = 0; i < steps(0.5); i++) step(run);
    assert.ok(Math.abs(fighter.body.x - x0) < 1e-6, `${dir > 0 ? 'forward' : 'backward'}: it stays where it pressed it`);
  }
});

test('Dark Tendrils never shove #0005 back: whoever they reel in from the far end, still rushing in as they let go, stops against its body', () => {
  for (const target of playableCharacters()) {
    const d = versus({ gap: 285, pushboxes: true }, target);
    const x0 = d.attacker.body.x;
    d.tick(P('extra_attack'));
    after(d, 1.2);
    assert.equal(mine(d, 'extra_attack')[0]?.type, 'hit', `#${target.id}: seized`);
    assert.equal(d.attacker.body.x, x0, `#${target.id}: #0005 holds its ground`);
    const apart = (DEF.pushbox.width + target.pushbox.width) / 2;
    assert.ok(d.target.body.x - d.attacker.body.x < apart + 1, `#${target.id}: reeled in to its body`);
  }
});

test('the Deadlights cast as Dark Tendrils\' seizing ends let go while the prey is still held; pressed earlier they never cut the tendrils', () => {
  // A technique never cuts an attack short, not even one that hit (for a
  // player as for a CPU): pressed during the tendrils it does nothing; cast
  // the step they end, the lights still catch the prey they hold.
  const r = playerRig({ character: DEF, foeCharacter: DEF_0001, gap: 220 });
  const at = (move) => r.events.findIndex((e) => e.attacker === r.player && (e.move === move || e.ability === move));
  let step = 0;
  const tick = (input = {}) => {
    step++;
    r.tick(input);
    return r.events.length;
  };
  const stepOf = new Map();
  const mark = (move) => {
    if (!stepOf.has(move) && at(move) >= 0) stepOf.set(move, step);
  };
  tick(press('extra_attack'));
  const tendrils = r.player.combat.attack;
  for (let i = 0; i < 60 && !r.player.combat.cancellable; i++) {
    tick();
    mark('extra_attack');
  }
  assert.ok(stepOf.has('extra_attack') && r.player.combat.cancellable, 'seized, and the reel-in done');
  tick(press('attack4'));
  assert.equal(r.player.technique, null, 'the cast never cuts the tendrils short');
  assert.equal(r.player.combat.attack, tendrils, 'they play on');
  while (r.player.combat.attack === tendrils) tick();
  tick(press('attack4'));
  assert.ok(r.player.technique, 'cast as the tendrils end');
  let heldAsTheyGo = null;
  while (r.player.technique) {
    const stun = r.foe.combat.stun;
    tick();
    mark('attack4');
    if (heldAsTheyGo === null && stepOf.has('attack4')) heldAsTheyGo = stun;
  }
  const lights = r.events[at('attack4')];
  assert.equal(lights?.type, 'hit', 'caught in the lights');
  assert.equal(r.foe.combat.afloat, true);
  const after = (stepOf.get('attack4') - stepOf.get('extra_attack')) * DT;
  assert.ok(heldAsTheyGo > 0, `the lights let go ${after.toFixed(3)} s after the seizing, while the prey is still held`);
});

test('the Red Balloon: a third of a second gathering, then balloons rise behind the opponent and a phantom bites its back: 3, its prey afraid for 2.5 s', () => {
  const d = versus({ gap: 200 });
  d.tick(P('attack5'));
  assert.ok(d.attacker.pendingSummon, 'its startup pose');
  assert.equal(activeSpecialAbility(d.attacker), 'attack5', 'its orange mark shows');
  d.until(() => d.clones.length > 0, steps(0.5));
  const [phantom] = d.clones;
  assert.equal(phantom.facing, d.target.facing, 'it faces the way its prey does: at its back');
  assert.ok(near(phantom.x, d.target.body.x - d.target.facing * 60, 1e-6), '60 units behind it');
  assert.equal(phantom.cloud.key, 'attack5_object', 'out of the balloons');
  assert.equal(d.attacker.pendingSummon, null, '#0005 itself is free again');
  d.until(() => mine(d, 'attack5').length > 0, steps(1));
  const [bite] = mine(d, 'attack5');
  assert.deepEqual([bite.type, bite.source, bite.damage, bite.fear], ['hit', 'summon', 3, 2.5]);
  assert.ok(Math.sign(bite.finalLaunch.x) === Math.sign(d.attacker.body.x - d.target.body.x), 'knocked toward #0005');
  assert.equal(d.target.combat.frightenedOf(d.attacker), true);
  // Afraid, every hit #0005 lands on it feeds #0005.
  d.attacker.combat.launchPoint = 20;
  d.target.body.x = d.attacker.body.x + 44;
  d.target.body.vx = 0;
  after(d, 0.3);
  d.events.length = 0;
  d.tick(P('attack1'));
  after(d, 0.3);
  const [claw] = mine(d, 'attack1');
  assert.equal(claw?.type, 'hit');
  assert.equal(claw.fed, 3, 'fed');
  assert.equal(d.attacker.combat.launchPoint, 17);
  assert.equal(d.attacker.summonDefs.attack5.cooldown, 3, 'a fear: the policy\'s 3 s');
});

test('the Red Balloon\'s phantom is blocked by a Shield from behind as from anywhere, and a summon with nobody to haunt does nothing', () => {
  const d = versus({ gap: 200 });
  d.tick(P('attack5'), { shield: true });
  for (let i = 0; i < steps(1.5); i++) d.tick({}, { shield: true });
  assert.deepEqual(mine(d, 'attack5').map((e) => e.type), ['block']);
  assert.equal(d.target.combat.frightenedOf(d.attacker), false, 'no fear through a Shield');
  const { fighter, step } = solo();
  step(P('attack5'));
  assert.equal(fighter.pendingSummon, null, 'no opponent: nothing');
  assert.equal(fighter.combat.abilityCooldowns.active('attack5'), false, 'and no cooldown spent');
});

test('its Deflect: a claw swept round in a wide arc that turns projectiles back', () => {
  assert.equal(DEF.deflect.deflectProjectiles, true);
  assert.equal(DEF.deflect.animation, 'deflect');
  const { fighter, step } = solo();
  airborne(step);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays its whole kit: across real fights its Specials land, and its prey\'s fear feeds it', () => {
  // Every fighter as its opponent, at Medium and at Brutal, on two seeds:
  // a cast or a phantom lands only now and then against a CPU that sees it
  // coming, so the fights are many.
  const used = new Map();
  let floats = 0;
  let fears = 0;
  let fed = 0;
  for (const difficulty of ['medium', 'brutal']) {
    for (const seed of [1, 2]) {
      for (const foe of playableCharacters()) {
        const { log, events } = cpuFight(DEF, foe, { seconds: 30, seed, difficulty });
        const me = [...log.keys()].find((f) => f.def === DEF && f.slot === 'p1');
        for (const [k, v] of me.controller.telemetry.moveUsage) used.set(k, (used.get(k) ?? 0) + v);
        for (const e of events.filter((x) => x.attacker === me && x.type === 'hit')) {
          if (e.float > 0) floats++;
          if (e.fear > 0) fears++;
          fed += e.fed;
        }
      }
    }
  }
  for (const move of [
    'attack1:ground', 'attack1:air', 'attack2:ground', 'attack2:air', 'attack3:ground', 'attack3:air',
    'attack4:ground', 'attack5:ground', 'extra_attack:ground',
  ]) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
  assert.ok(floats > 0, 'the Deadlights float someone');
  assert.ok(fears > 0 && fed > 0, 'the Red Balloon frightens, and it feeds');
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0005, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// name is put together here so this file never spells it.
const UNNAMED = new RegExp(['p', 'e', 'n', 'n', 'y', 'w', 'i', 's', 'e'].join(''), 'i');
const BINARY = /\.(png|jpe?g|gif|webp|ico)$/i;

function repositoryPaths(dir = '') {
  return readdirSync(`${ROOT}${dir}` || './', { withFileTypes: true }).flatMap((e) => {
    if (e.name === '.git' || e.name === 'node_modules') return [];
    const path = `${dir}${e.name}`;
    return e.isDirectory() ? [`${path}/`, ...repositoryPaths(`${path}/`)] : [path];
  });
}

test('the character behind #0005 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0005.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
  assert.equal(STAGE instanceof StageCollision, true);
  assert.equal(typeof stageMap, 'function');
});
