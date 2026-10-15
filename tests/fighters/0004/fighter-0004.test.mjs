// Run with node --test tests/fighters/0004/fighter-0004.test.mjs (no dependencies).
// #0004, the virtual singer: registered from CHARACTERS alone in roster
// slot 04, its clips cut from one sprite sheet into its own folder and read
// from the real PNGs (tight, 1x, one art-pixel scale, anchored on the body
// whatever its twin tails do), five numbered buttons (three ordinary
// attacks with their mid-air versions, two techniques) and an extra
// attack, every move a mechanic of its own: the Dance Combo's held swipe,
// the Air Dance's sweep and crescent, the Leek Swing's reach, the
// Leekspin's climb carrying its target, the Crescent Kick's anti-air, the
// Stage Dive's spike and landing, Ievan Polkka's dancing double, World is
// Mine's charm (its target's hits heal it) with its ring of sound, and the
// Melody's note turning projectiles back. The charm and the burst's art it
// is built on are checked on bespoke data in tests/systems/ (charm,
// technique); the roster, credits and translations it adds in
// empty-roster, settings and i18n. Layout and paint still need
// real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { DT, STAGE, duel, fakeSpritesOf, makeFighter, stageMap, steps } from '../../helpers/fighter-harness.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { CHARACTERS, getCharacter, playableCharacters } from '../../../js/data/characters.js';
import { abilityName } from '../../../js/data/abilities.js';
import { describeLoadout, loadoutProblems } from '../../../js/data/loadout.js';
import { isSpecialAbility } from '../../../js/data/special-abilities.js';
import { pad } from '../../../js/data/characters/helpers.js';
import { createAttackDefinition } from '../../../js/game/combat/attacks.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { CombatSystem } from '../../../js/game/combat/combat.js';
import { CombatAIController } from '../../../js/game/ai/combat-ai.js';
import { Fighter } from '../../../js/game/fighters/fighter.js';
import { StageCollision } from '../../../js/game/physics.js';
import { mulberry32 } from '../../../js/core/utils.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';
import { CONFIG } from '../../../js/config.js';

const DIR = 'assets/characters/0004/';
const DEF = getCharacter('0004');
const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, n, from = 1) => range(n, from).map((i) => `0004_${codename}_${i}.png`);

// #0004 on its own, and against #0001 (or `target`) at `gap`.
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

// Every clip and the files it plays, in order.
const CLIPS = {
  idle: named('idle', 4),
  run: named('run', 8),
  jump: named('jump', 2),
  fall: named('fall', 3),
  land: named('land', 2),
  mouvment: named('mouvment', 2),
  midair_mouvment: named('midair_mouvment', 2),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 1),
  shielding: named('shielding', 1),
  deflect: named('deflect', 4),
  attack1: named('attack1', 7),
  midair_attack1: named('midair_attack1', 7),
  attack2: named('attack2', 3),
  midair_attack2: named('midair_attack2', 5),
  attack3: named('attack3', 8),
  midair_attack3: named('midair_attack3', 3),
  midair_attack3_impact: named('midair_attack3', 3, 4),
  attack4_cast: named('attack4', 4),
  attack4_release: named('attack4', 1, 4),
  attack5_cast: named('attack5', 1),
  attack5_release: named('attack5', 1, 2),
  extra_attack: named('extra_attack', 4),
};
const OBJECTS = {
  extra_attack_object: named('extra_attack_object', 4),
  attack4_object: named('attack4_object', 8),
  attack5_object: named('attack5_object', 39),
};
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(OBJECTS)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 49, run: 55, jump: 54, fall: 74, land: 47, mouvment: 50, midair_mouvment: 52, hurt: 47, midair_hurt: 28,
  shielding: 46, deflect: 58, attack1: 67, midair_attack1: 67, attack2: 56, midair_attack2: 80, attack3: 51,
  midair_attack3: 83, midair_attack3_impact: 61, attack4_cast: 49, attack4_release: 49, attack5_cast: 49,
  attack5_release: 49, extra_attack: 49,
};

// ---- Registration -------------------------------------------------------------------

test('#0004 is a real CHARACTERS entry: available, in roster slot 04, after #0001, #0002 and #0003', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0004'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0004');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 3);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002', '0003', '0004']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.deepEqual(Object.keys(DEF.energy), ['regen'], 'its refill rate only');
});

test('five numbered attacks, each a button of its own: three ordinary with mid-air versions, two techniques; plus the Melody', () => {
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
  assert.deepEqual(Object.keys(DEF.attacks).sort(),
    ['attack1', 'attack2', 'attack3', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3']);
  assert.deepEqual(Object.keys(DEF.techniques), ['attack4', 'attack5']);
  assert.deepEqual(Object.keys(DEF.projectiles).sort(), ['attack4_object', 'extra_attack_object']);
  assert.deepEqual(Object.keys(DEF.effectAnimations), ['attack5_object']);
  assert.equal(DEF.summons, undefined, 'no summon: its double is a projectile that stays put');
});

test('one Special: World is Mine, the song that charms; Ievan Polkka is a technique the player sees as an ordinary attack', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack5']);
  assert.equal(isSpecialAbility(DEF, 'attack5'), true);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'attack5', 'extra_attack'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Dance Combo', 'Air Dance', 'Leek Swing', 'Leekspin', 'Crescent Kick', 'Stage Dive', 'Ievan Polkka', 'World is Mine', 'Melody',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Melody', 'Dance Combo', 'Leek Swing', 'Crescent Kick', 'Ievan Polkka', 'World is Mine']);
  assert.deepEqual(buttons('fr'), ['Mélodie', 'Combo dansé', 'Coup de poireau', 'Coup de pied croissant', 'Ievan Polkka', 'World is Mine']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3'].map((m) => STRINGS.fr[`ability.0004.${m}`]),
    ['Danse aérienne', 'Poireau tournoyant', 'Plongeon de scène']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => art(a)), [
    '0004_extra_attack_object_1.png', '0004_attack1_3.png', '0004_attack2_2.png', '0004_attack3_5.png',
    '0004_attack4_object_1.png', '0004_attack5_2.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack3'].map((a) => art(a, true)),
    ['0004_midair_attack1_4.png', '0004_midair_attack2_3.png', '0004_midair_attack3_2.png']);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  assert.equal(mobileAbility(DEF, 'transform'), null, 'no Transform button');
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0004.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: dance on Square, the leek on Triangle, the kicks by direction, the note on R1, the techniques behind the triggers', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:attack3': pad('west', { direction: 'up' }),
    'ground:attack4': pad('north', { modifier: 'r2' }),
    'ground:attack5': pad('north', { modifier: 'l2' }),
    'ground:extra_attack': pad('r1'),
    'air:attack1': pad('west'),
    'air:attack2': pad('north'),
    'air:attack3': pad('west', { direction: 'down' }),
  });
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips and objects play: every file named <id>_<codename>_<frame>.png', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 128);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  assert.deepEqual(DEF.projectileAnimations.extra_attack_object.frames.map(file), OBJECTS.extra_attack_object);
  assert.deepEqual(DEF.projectileAnimations.attack4_object.frames.map(file), OBJECTS.attack4_object);
  assert.deepEqual(DEF.effectAnimations.attack5_object.frames.map(file), OBJECTS.attack5_object);
});

test('every frame is cut clean: none of the sheet\'s purple background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 128 && g === 0 && b === 128), `${name}: none of the sheet's background`);
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
  assert.ok(Math.abs(REAL.worldPerArt - 88 / 52) < 1e-9, 'the same world size per art pixel as the rest of the roster');
  assert.ok(Math.abs(DEF.visual.height - 49 * 88 / 52) < 1e-9, 'about 83 units tall');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(Math.abs(anim.maxArtH - HEIGHTS[key]) < 1e-9, `${key}: tallest frame ${anim.maxArtH}`);
    for (const f of anim.frames) {
      assert.ok(Math.abs(f.unit - 1) < 1e-9, `${key}: one file pixel per art pixel`);
      assert.ok(Math.abs(f.artW - IMAGES.get(f.url).naturalWidth) < 1e-9, `${key}: its width`);
      assert.ok(Math.abs(f.artH - IMAGES.get(f.url).naturalHeight) < 1e-9, `${key}: its height`);
    }
  }
  // Its objects at the same art-pixel size: the note, the little double,
  // the ring of sound.
  for (const anim of [...Object.values(REAL.projectiles), ...Object.values(REAL.effects)]) {
    for (const f of anim.frames) assert.ok(Math.abs(f.unit - 1) < 1e-9, `${anim.key}: one file pixel per art pixel`);
  }
});

test('anchors keep the body in place: authored on the body wherever the twin tails, the leek or a trail would drag it', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  assert.deepEqual(ax('run'), [30.5, 36.5, 38, 37, 31.5, 36.5, 37, 37.5]);
  assert.deepEqual(ax('mouvment'), [32, 42]);
  assert.deepEqual(ax('attack1'), [25, 25.5, 25, 25.5, 16.5, 15.5, 15]);
  assert.deepEqual(ax('midair_attack2'), [18.5, 36, 48, 17.5, 26.5]);
  // The run's hair streams far behind: the automatic anchor (the upper
  // body's opaque middle) would sit well behind the body.
  const auto = withFakeCanvas(() => REAL.animations.run.frames.map((f) => f.anchorX));
  assert.ok(ax('run').every((x, i) => x > auto[i] + 5), 'the authored anchor is on the body, ahead of the hair');
  for (const key of ['idle', 'run', 'hurt', 'shielding', 'attack1', 'attack2', 'midair_attack3_impact']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its face', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(49 * DEF.visual.portrait.size));
});

// ---- Its moves -------------------------------------------------------------------------

test('the Dance Combo: a swipe that holds the opponent (1, no launch), then a punch (3, Base Launch 1 sideways)', () => {
  const d = versus({ gap: 34 });
  d.tick(P('attack1'));
  after(d, 0.4);
  const [swipe, punch] = mine(d, 'attack1');
  assert.deepEqual([swipe.type, swipe.damage, swipe.launchSpeed], ['hit', 1, 0]);
  assert.deepEqual([punch.type, punch.damage, punch.baseLaunch, punch.directionalLaunch], ['hit', 3, 1, 'horizontal']);
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(atk.hits[0].hitstun > atk.hits[1].at - atk.hits[0].at, 'the swipe holds it for the punch');
  assert.ok(Math.abs(atk.startup - 0.1) < 1e-9 && Math.abs(atk.total - 0.35) < 1e-9, 'quick: its first strike at 0.1 s, 0.35 s in all');
});

test('the Air Dance: a low sweep, then a rising crescent that sends the opponent up', () => {
  const d = versus({ gap: 30 });
  airborne(d.tick);
  Object.assign(d.target.body, { y: d.attacker.body.y + 8, grounded: false, ground: null, gravityScale: 0, vy: 0 });
  d.tick(P('attack1'));
  after(d, 0.4);
  const hits = mine(d, 'midair_attack1');
  assert.deepEqual(hits.map((e) => e.damage), [1, 3]);
  assert.equal(hits[1].directionalLaunch, 'vertical');
  assert.ok(hits[1].finalLaunch.y < 0, 'up');
});

test('the Leek Swing: its longest reach, 3 and Base Launch 2 sideways, and a Shield shoved back', () => {
  for (const [gap, want] of [[40, 'hit'], [60, 'hit'], [90, null]]) {
    const d = versus({ gap });
    d.tick(P('attack2'));
    after(d, 0.45);
    const e = mine(d, 'attack2');
    assert.equal(e[0]?.type ?? null, want, `${gap} away`);
    if (want) assert.deepEqual([e[0].damage, e[0].baseLaunch, e[0].directionalLaunch], [3, 2, 'horizontal']);
  }
  const b = versus({ gap: 50 });
  b.tick({}, { shield: true });
  b.tick(P('attack2'), { shield: true });
  for (let i = 0; i < 30 && !b.events.length; i++) b.tick({}, { shield: true });
  assert.equal(b.events[0].type, 'block');
  assert.ok(b.target.body.vx > 250, 'shoved back');
});

test('the Leekspin rises, carrying whoever it catches up with it, then flings it away; once per airtime', () => {
  const d = versus({ gap: 26 });
  airborne(d.tick);
  Object.assign(d.target.body, { y: d.attacker.body.y + 6, grounded: false, ground: null, gravityScale: 0, vy: 0 });
  d.target.body.gravityScale = 1;
  const y0 = d.attacker.body.y;
  const t0 = d.target.body.y;
  d.tick(P('attack2'));
  let rose = 0;
  let carried = 0;
  for (let i = 0; i < steps(0.4); i++) {
    d.tick();
    rose = Math.max(rose, y0 - d.attacker.body.y);
    carried = Math.max(carried, t0 - d.target.body.y);
  }
  const hits = mine(d, 'midair_attack2');
  assert.deepEqual(hits.map((e) => e.damage), [1, 1, 3]);
  assert.ok(rose > 80, `it rose (${rose.toFixed(0)} units)`);
  assert.ok(carried > 60, `its target rose with it (${carried.toFixed(0)} units)`);
  assert.deepEqual([hits[2].baseLaunch, hits[2].directionalLaunch], [2, 'horizontal']);
  // Once per airtime.
  const { fighter, step } = solo();
  airborne(step, 20);
  step(P('attack2'));
  while (fighter.combat.attack) step({});
  step(P('attack2'));
  assert.notEqual(fighter.combat.attack?.def.id, 'midair_attack2', 'not again before it lands');
});

test('the Crescent Kick: an anti-air, 3 and Base Launch 2 straight up, reaching over its head', () => {
  const d = versus({ gap: 34 });
  hold(d.target, 60);
  d.tick(P('attack3'));
  for (let i = 0; i < steps(0.45); i++) {
    d.tick();
    if (!d.target.combat.stun) d.target.body.vy = 0;
  }
  const [kick] = mine(d, 'attack3');
  assert.equal(kick?.type, 'hit', 'it meets a target in the air above it');
  assert.deepEqual([kick.damage, kick.baseLaunch, kick.directionalLaunch], [3, 2, 'vertical']);
  assert.ok(kick.finalLaunch.y < 0 && kick.finalLaunch.x === 0, 'straight up');
});

test('the Stage Dive plunges feet first, driving down whatever it meets, and lands in a crouch that pops up anyone beside it', () => {
  // Beside the landing: only the landing's pop.
  for (const [gap, want] of [[40, true], [-40, true], [140, false]]) {
    const d = versus({ gap: gap + 200 });
    airborne(d.tick);
    d.target.body.x = d.attacker.body.x + gap;
    d.tick(P('attack3'));
    for (let i = 0; i < 120 && !d.attacker.body.grounded; i++) d.tick();
    assert.equal(d.attacker.animator.anim.key, 'midair_attack3_impact', 'landed in its crouch');
    const pops = mine(d, 'midair_attack3');
    assert.equal(pops.length > 0, want, `${gap} away`);
    if (want) assert.deepEqual([pops[0].damage, pops[0].baseLaunch, pops[0].directionalLaunch], [1, 1, 'vertical']);
  }
  // Under it on the way down: the spike.
  const d = versus({ gap: 0 });
  airborne(d.tick, 20);
  d.target.body.x = d.attacker.body.x;
  hold(d.target, 0);
  d.target.body.y = d.attacker.body.y + 70;
  d.tick(P('attack3'));
  for (let i = 0; i < 40 && !mine(d, 'midair_attack3').length; i++) d.tick();
  const [spike] = mine(d, 'midair_attack3');
  assert.deepEqual([spike.damage, spike.baseLaunch, spike.directionalLaunch], [3, 2, 'reverseVertical']);
  assert.ok(spike.finalLaunch.y > 0, 'driven down');
});

test('Ievan Polkka: a cast, then its little double stands where it appears, striking whoever stays by it six times, the last a launch; 5 s, its strikes adding up to 10', () => {
  const d = versus({ gap: 64 });
  d.tick(P('attack4'));
  assert.ok(d.attacker.technique, 'casting');
  let x = null;
  for (let i = 0; i < steps(3); i++) {
    d.tick();
    if (d.projectiles.length && x === null) x = d.projectiles[0].x;
    if (d.projectiles.length) assert.equal(d.projectiles[0].x, x, 'it never moves');
  }
  assert.ok(Math.abs(x - (d.attacker.body.x + 62)) < 1e-6, 'in front of #0004');
  const hits = mine(d, 'attack4');
  assert.deepEqual(hits.map((e) => e.damage), [1, 1, 1, 1, 1, 5]);
  assert.ok(hits.slice(0, 5).every((e) => e.launchSpeed === 0), 'held, not knocked away');
  assert.ok(hits[5].finalLaunch.y < 0, 'then thrown up');
  assert.equal(hits[0].source, 'projectile');
  assert.equal(d.attacker.techniqueDefs.attack4.cooldown, 5);
  assert.equal(d.attacker.combat.abilityCooldowns.duration('attack4'), 5);
  // A Shield stops it at the first strike it blocks.
  const b = versus({ gap: 64 });
  b.tick({}, { shield: true });
  b.tick(P('attack4'), { shield: true });
  after(b, 1.2, {}, { shield: true });
  assert.deepEqual(mine(b, 'attack4').map((e) => e.type), ['block']);
  assert.equal(b.projectiles.length, 0, 'gone');
});

test('World is Mine: half a second singing, then a ring of sound round it that charms everyone it reaches for 2.5 s; their hits heal it', () => {
  const t = DEF.techniques.attack5;
  assert.ok(Math.abs(SPRITES.duration(t.castAnimation) - 0.5) < 1e-9 && Math.abs(SPRITES.duration(t.releaseAnimation) - 1 / 3) < 1e-9,
    'a deliberate Special: 0.5 s + 1/3 s');
  for (const [gap, lift, shield, want] of [[120, 0, false, 'hit'], [-120, 0, false, 'hit'], [100, 70, false, 'hit'], [200, 0, false, null], [100, 0, true, 'block']]) {
    const d = versus({ gap });
    if (lift) hold(d.target, lift);
    const guard = shield ? { shield: true } : {};
    d.tick({}, guard);
    d.tick(P('attack5'), guard);
    assert.equal(activeSpecialAbility(d.attacker), 'attack5', 'its orange mark shows');
    let given = [];
    while (d.attacker.technique) {
      d.tick({}, guard);
      given = given.concat(d.attacker.effects);
    }
    const e = mine(d, 'attack5');
    assert.equal(e[0]?.type ?? null, want, `${gap} away, ${lift} up${shield ? ', Shield up' : ''}`);
    assert.equal(d.target.combat.charmedTo(d.attacker), want === 'hit', 'charmed only by a real hit');
    if (want === 'hit') assert.deepEqual([e[0].damage, e[0].charm, e[0].launchSpeed], [1, 2.5, 0]);
    assert.deepEqual(given.map((g) => g.animation), ['attack5_object'], 'its ring of sound goes out as it lets go');
    assert.equal(d.attacker.techniqueDefs.attack5.cooldown, 3, 'a charm: the policy\'s 3 s');
  }
  // Charmed, #0001 punches it: it heals.
  const d = versus({ gap: 60 });
  d.tick(P('attack5'));
  while (d.attacker.technique) d.tick();
  d.attacker.combat.launchPoint = 30;
  d.target.body.x = d.attacker.body.x + 40;
  after(d, 0.3);
  d.tick({}, P('attack1'));
  for (let i = 0; i < 30 && !d.events.some((e) => e.type === 'charmed'); i++) d.tick();
  const healed = d.events.find((e) => e.type === 'charmed');
  assert.ok(healed, 'the punch healed it');
  assert.equal(d.attacker.combat.launchPoint, 30 - healed.heal);
});

test('the Melody: a sung note across the stage (3, Base Launch 1 sideways) that turns back the projectile it meets', () => {
  const d = versus({ gap: 300 });
  d.tick(P('extra_attack'));
  for (let i = 0; i < 80 && !d.events.length; i++) d.tick();
  const [hit] = d.events;
  assert.deepEqual([hit.type, hit.damage, hit.baseLaunch, hit.directionalLaunch, hit.source], ['hit', 3, 1, 'horizontal', 'projectile']);
  // #0002's tornado coming the other way is turned back, #0002's no longer.
  const t = versus({ gap: 420 }, DEF_0002);
  t.tick({}, P('extra_attack'));
  after(t, 0.4);
  t.tick(P('extra_attack'));
  let turned = false;
  for (let i = 0; i < 90 && !turned; i++) {
    t.tick();
    turned = t.projectiles.some((p) => p.def.id === 'extra_attack_object' && p.ability === 'extra_attack' && p.owner === t.attacker && p.redirected);
  }
  assert.ok(turned, 'the tornado turned back, now #0004\'s');
  // Ground only.
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null);
});

test('its Deflect: an uppercut whose arc turns projectiles back', () => {
  assert.equal(DEF.deflect.deflectProjectiles, true);
  assert.equal(DEF.deflect.animation, 'deflect');
  const { fighter, step } = solo();
  airborne(step);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
});

// ---- The CPU ---------------------------------------------------------------------------

// #0004 as a CPU at Brutal against #0001 `apart` units away, held where it
// is and held still (`stunned`: kept in hitstun, unable to get away):
// whether it sings within `seconds`.
function cpuSings(apart, seconds, stunned) {
  const stage = new StageCollision(stageMap());
  const cpu = new Fighter({
    def: DEF, sprites: SPRITES, stage, slot: 'p2', label: 'CPU', spawn: { x: 400, facing: 1 },
    controller: new CombatAIController({ difficulty: 'brutal', rng: mulberry32(3) }),
  });
  const foe = new Fighter({ def: DEF_0001, sprites: fakeSpritesOf(DEF_0001), stage, slot: 'p1', label: 'P1', spawn: { x: 400 + apart, facing: -1 } });
  cpu.opponent = foe;
  foe.opponent = cpu;
  const world = { stage, projectiles: [], clones: [], combat: new CombatSystem(), score: { p1: 0, p2: 0 }, timeLeft: 99, fighters: [foe, cpu] };
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: world };
  for (let i = 0; i < seconds / DT; i++) {
    if (stunned) foe.combat.stun = 1;
    foe.update(DT, ctx);
    foe.body.x = 400 + apart;
    cpu.body.x = 400;
    cpu.update(DT, ctx);
    world.combat.update(world.fighters, [], []);
    if (cpu.technique?.def.id === 'attack5') return true;
  }
  return false;
}

test('the CPU sings when its song can reach someone who cannot get away, and never at someone out of reach', () => {
  assert.equal(cpuSings(110, 1.5, true), true, 'in reach, held: it sings');
  assert.equal(cpuSings(700, 1.5, true), false, 'out of reach: never');
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0004, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names are put together here so this file never spells them.
const UNNAMED = new RegExp([['h', 'a', 't', 's', 'u', 'n', 'e'], ['m', 'i', 'k', 'u']].map((l) => l.join('')).join('|'), 'i');
const BINARY = /\.(png|jpe?g|gif|webp|ico)$/i;

function repositoryPaths(dir = '') {
  return readdirSync(`${ROOT}${dir}` || './', { withFileTypes: true }).flatMap((e) => {
    if (e.name === '.git' || e.name === 'node_modules') return [];
    const path = `${dir}${e.name}`;
    return e.isDirectory() ? [`${path}/`, ...repositoryPaths(`${path}/`)] : [path];
  });
}

test('the character behind #0004 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0004.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
  assert.equal(STAGE instanceof StageCollision, true);
});
