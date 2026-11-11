// Run with node --test tests/fighters/0016/fighter-0016.test.mjs (no dependencies).
// #0016, the adventurer with two pistols and a bow: registered from
// CHARACTERS alone in roster slot 16, her clips cut from one sprite sheet
// into her own folder and read from the real PNGs (tight, 1x, one art-pixel
// scale, anchored on her tank top, a drawing a row repeats cut once), five
// numbered buttons (three ordinary attacks with their mid-air versions and
// two techniques) and an extra attack on the ground only. The Kick Combo
// and the Leg Sweep up close (her Mash Combo), the Air Kick, the Flip Kick,
// the Twin Pistols on the ground and in the air (a volley of shots), the
// Silent Arrow (an arrow that lands far harder in a back turned to it:
// `backstab`), the Grapple (her line fired up, hauling her after it and
// drawing in whoever is near the hook), the Medipack (a heal) and her
// Deflect. The roster, credits and translations she adds are
// checked in empty-roster, settings and i18n. Layout and paint still need
// real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { DT, duel, fakeSpritesOf, makeFighter, steps, cpuFight } from '../../helpers/fighter-harness.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { CHARACTERS, getCharacter, playableCharacters } from '../../../js/data/characters.js';
import { abilityName } from '../../../js/data/abilities.js';
import { loadoutProblems, actionType } from '../../../js/data/loadout.js';
import { isSpecialAbility } from '../../../js/data/special-abilities.js';
import { mashComboProblems } from '../../../js/data/mash-combo.js';
import { pad, flick } from '../../../js/data/characters/helpers.js';
import { createAttackDefinition } from '../../../js/game/combat/attacks.js';
import { CombatSystem } from '../../../js/game/combat/combat.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0016/';
const DEF = getCharacter('0016');
const DEF_0001 = getCharacter('0001');
const DEF_0007 = getCharacter('0007');
const DEF_0009 = getCharacter('0009');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0016_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0016 on her own, and against #0009 (or `target`) at `gap`.
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
// Her shots and arrows in play.
const shots = (d) => d.projectiles.filter((p) => p.owner === d.attacker && p.def.animation === 'attack2_object');
const arrows = (d) => d.projectiles.filter((p) => p.owner === d.attacker && p.def.animation === 'attack3_object');
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
  idle: named('idle', [1, 2, 3, 4, 5, 4, 3, 2]),
  run: named('run', 8),
  jump: named('jump', 4),
  fall: named('fall', 5),
  land: named('land', 1),
  mouvment: named('mouvment', 1),
  midair_mouvment: named('midair_mouvment', 4),
  hurt: named('hurt', 3),
  midair_hurt: named('midair_hurt', 6),
  prepshield: named('prepshield', 1),
  shielding: named('shielding', 1),
  deflect: named('deflect', 6),
  attack1: named('attack1', [1, 2, 3, 4, 5, 1, 6, 7, 8, 9, 10, 11]),
  midair_attack1: named('midair_attack1', 6),
  attack2: named('attack2', [1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7, 8, 9]),
  midair_attack2: named('midair_attack2', [1, 2, 3, 2, 3, 2, 3, 4]),
  attack3_cast: named('attack3', [1, 2, 3, 4, 5, 6]),
  attack3_release: named('attack3', [7, 3, 2, 8]),
  attack4: named('attack4', 8),
  midair_attack4: named('midair_attack4', [1, 2, 3, 2, 4, 4, 4]),
  attack5_cast: named('attack5', [1, 2, 3, 4, 5, 4, 5, 4, 5, 4]),
  attack5_release: named('attack5', [2, 1]),
  extra_attack: named('extra_attack', [1, 2, 3, 4, 5, 6, 1]),
};
const PROJECTILES = {
  attack2_object: named('attack2_object', 5),
  attack3_object: named('attack3_object', 1),
};
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(PROJECTILES)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 55, run: 48, jump: 55, fall: 56, land: 48, mouvment: 43, midair_mouvment: 42, hurt: 54, midair_hurt: 50,
  prepshield: 52, shielding: 46, deflect: 58, attack1: 57, midair_attack1: 48, attack2: 50, midair_attack2: 53,
  attack3_cast: 54, attack3_release: 54, attack4: 58, midair_attack4: 96, attack5_cast: 48, attack5_release: 48, extra_attack: 39,
};

// ---- Registration -------------------------------------------------------------------

test('#0016 is a real CHARACTERS entry: available, in roster slot 16, after #0001 to #0015', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0016'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0016');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 15);
  assert.deepEqual(playableCharacters().map((c) => c.id), [
    '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016',
  ]);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of her own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('five numbered attacks, each a button of its own: three ordinary with their mid-air versions, the Silent Arrow and the Medipack techniques; plus the Leg Sweep, on the ground only', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { type: 'technique', id: 'attack3' },
    attack4: { ground: 'attack4', air: 'midair_attack4' },
    attack5: { type: 'technique', id: 'attack5' },
  });
  assert.deepEqual(Object.keys(DEF.attacks).sort(), [
    'attack1', 'attack2', 'attack4', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack4',
  ]);
  assert.deepEqual(Object.keys(DEF.techniques).sort(), ['attack3', 'attack5']);
  assert.equal(actionType(DEF, 'attack3'), 'technique');
  assert.equal(actionType(DEF, 'attack5'), 'technique');
  assert.equal(DEF.attacks.extra_attack.groundOnly, true, 'the Leg Sweep on the ground only');
  assert.equal(DEF.summons, undefined, 'she summons nobody');
  assert.equal(DEF.effectAnimations, undefined);
  assert.deepEqual(Object.keys(DEF.projectiles).sort(), ['attack2_object', 'attack3_object', 'midair_attack2_object'], 'her shots and her arrow');
  for (const a of Object.values(DEF.attacks)) assert.notEqual(a.motion?.type, 'homing', 'she never homes in');
  // In the air her Triangle / Y does nothing: the Leg Sweep is a ground
  // move and nothing takes its place.
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null, 'nothing in the air');
});

test('her shots and her arrow cost 15 Energy each, nothing else anything; only the Medipack waits, 3 s', () => {
  const { fighter } = solo();
  const cost = Object.fromEntries(Object.values(fighter.attacks).map((a) => [a.id, a.energyCost]));
  assert.deepEqual(cost, {
    extra_attack: 0, attack1: 0, midair_attack1: 0, attack2: 15, midair_attack2: 15, attack4: 0, midair_attack4: 0,
  });
  for (const a of Object.values(fighter.attacks)) assert.equal(a.cooldown, 0, `${a.id}: no cooldown`);
  assert.equal(fighter.techniqueDefs.attack3.energyCost, 15, 'the arrow, a construct');
  assert.equal(fighter.techniqueDefs.attack3.cooldown, 0, 'an ordinary shot');
  assert.equal(fighter.techniqueDefs.attack5.energyCost, 0, 'a heal costs nothing');
  assert.equal(fighter.techniqueDefs.attack5.cooldown, 3, 'a heal: the policy\'s 3 s');
  assert.equal(fighter.deflect.cooldown, 0);
});

test('her Special: the Medipack, the one move that heals her; her kicks, pistols, bow and grapple are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack5']);
  assert.equal(isSpecialAbility(DEF, 'attack5'), true);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'attack4', 'midair_attack4', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
  const { fighter, step } = solo();
  step(P('attack5'));
  assert.equal(activeSpecialAbility(fighter), 'attack5', 'the orange mark while she kneels');
});

test('her Mash Combo: the Kick Combo and the Leg Sweep, her two close-range strikes; her shots, arrow and grapple are no partner', () => {
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'extra_attack'] });
  assert.deepEqual(mashComboProblems(DEF), []);
  assert.equal(DEF.attacks.mash_attack, undefined, 'no button-less partner: both are on her buttons');
  const { fighter, step } = solo();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    step(P('attack1'));
    for (let k = 0; k < 4; k++) seen.push(step({}).combat.attack?.def.id);
  }
  for (let i = 0; i < steps(7); i++) seen.push(step({}).combat.attack?.def.id);
  assert.ok(seen.includes('extra_attack'), 'the Leg Sweep is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('her in-game names and touch buttons name each move, in English and French, each on a frame of her own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'attack4', 'midair_attack4', 'attack5', 'extra_attack'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Kick Combo', 'Air Kick', 'Twin Pistols', 'Air Twin Pistols', 'Silent Arrow', 'Flip Kick', 'Grapple', 'Medipack', 'Leg Sweep',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Kick Combo', 'Twin Pistols', 'Silent Arrow', 'Flip Kick', 'Medipack', 'Leg Sweep']);
  assert.deepEqual(buttons('fr'), ['Combo de pieds', 'Pistolets jumeaux', 'Flèche silencieuse', 'Salto frappé', 'Trousse de soins', 'Balayage']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack4'].map((m) => STRINGS.fr[`ability.0016.${m}`]),
    ['Coup de pied aérien', 'Pistolets jumeaux aériens', 'Grappin']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].map((a) => art(a)), [
    '0016_attack1_9.png', '0016_attack2_4.png', '0016_attack3_6.png', '0016_attack4_3.png', '0016_attack5_4.png', '0016_extra_attack_3.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack4'].map((a) => art(a, true)), [
    '0016_midair_attack1_4.png', '0016_midair_attack2_3.png', '0016_midair_attack4_4.png',
  ]);
  for (const a of ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0016.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('her recommended controller layout: her kicks on Square, the sweep on Triangle, her pistols on R2, the arrow on the right stick forward, the backflip and the grapple on the right stick up, the Medipack on L2', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:extra_attack': pad('north'),
    'ground:attack2': pad('r2'),
    'ground:attack3': flick('forward'),
    'ground:attack4': flick('up'),
    'ground:attack5': pad('l2'),
    'air:attack1': pad('west'),
    'air:attack2': pad('r2'),
    'air:attack4': flick('up'),
  });
  assert.equal(DEF.attacks.midair_attack4.motion.type, 'rise', 'the stick up in the air for the move that rises');
  assert.equal(DEF.controller.previous, undefined, 'new: no layout of before');
});

// ---- Art --------------------------------------------------------------------------

test('her folder holds exactly the frames her clips and her projectiles play: every file named <id>_<codename>_<frame>.png', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 112);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  for (const [key, want] of Object.entries(PROJECTILES)) assert.deepEqual(DEF.projectileAnimations[key].frames.map(file), want, key);
  // A drawing a row repeats (her stance between kicks, the bow raised and
  // lowered, her aim between shots) is one file, played again. The same
  // drawing in two rows is each row's own (every clip plays its own
  // codename's files): the sheet draws her backflip on the ground and in
  // the air alike, and her sprint as the leap of her shots in the air.
  const ACROSS = [
    ['0016_deflect_1.png', '0016_midair_attack2_1.png'], ['0016_deflect_1.png', '0016_mouvment_1.png'],
    ...[[2, 3], [3, 4], [4, 5], [5, 6], [6, 7]].map(([a, b]) => [`0016_attack4_${b}.png`, `0016_deflect_${a}.png`]),
    ['0016_attack4_1.png', '0016_land_1.png'], ['0016_attack4_2.png', '0016_jump_1.png'],
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

test('every frame is cut clean: none of the sheet\'s green background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 34 && g === 177 && b === 76), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel: about 93 units tall', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 55);
  assert.ok(near(REAL.worldPerArt, 88 / 52), 'the same world size per art pixel as the rest of the roster');
  assert.ok(near(DEF.visual.height, 55 * 88 / 52), 'about 93 units tall');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(near(anim.maxArtH, HEIGHTS[key]), `${key}: tallest frame ${anim.maxArtH}`);
    assert.ok(near(anim.heightRatio, HEIGHTS[key] / 55), `${key}: its heightRatio`);
    for (const f of anim.frames) {
      assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
      assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth), `${key}: its width`);
      assert.ok(near(f.artH, IMAGES.get(f.url).naturalHeight), `${key}: its height`);
    }
  }
  // Her shots and her arrow are drawn at the same art-pixel size, centred
  // where they are; a shot is the same either way, the arrow mirrored the
  // way it flies; a shot's streak thins once across its run.
  for (const anim of Object.values(REAL.projectiles)) {
    for (const f of anim.frames) assert.ok(near(f.unit, 1) && near(f.anchorArtX, f.artW / 2) && near(f.anchorArtY, f.artH / 2), anim.key);
    assert.equal(anim.loop, false, anim.key);
  }
  assert.equal(REAL.projectiles.attack2_object.sourceFacing, 0);
  assert.equal(REAL.projectiles.attack3_object.sourceFacing, 1);
  const shot = DEF.projectileAnimations.attack2_object;
  assert.ok(Math.abs(shot.frames.length / shot.fps - DEF.projectiles.attack2_object.lifetime) < 0.1, 'its streak thins across its run');
});

test('anchors keep her body in place: on her tank top, wherever her pistols, her bow, her line or her kicks reach; her flips keep the sheet\'s ground', () => {
  const at = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  assert.deepEqual(at('idle'), [20, 20, 20, 20, 20, 20, 20, 20]);
  // Her pistols held out, her bow, her line and her kicking leg would pull
  // the automatic anchor off her body.
  const off = (key, n) => {
    const f = REAL.animations[key].frames.find((x) => x.url.endsWith(`_${key.replace(/_(cast|release)$/, '')}_${n}.png`));
    return Math.abs(f.anchorArtX - withFakeCanvas(() => f.anchorX));
  };
  for (const [key, n] of [['attack2', 3], ['attack3_cast', 3], ['attack1', 8], ['attack4', 4], ['midair_attack4', 2]]) {
    assert.ok(off(key, n) > 3, `${key} ${n}: on her body, not her reach`);
  }
  // The backflip leaves the floor and comes back to it: its frames keep the
  // sheet's ground line, not the bottom of their art.
  const flip = REAL.animations.attack4.frames;
  assert.ok(flip[3].anchorArtY > flip[3].artH + 10, 'over on her back, off the floor');
  assert.ok(flip[2].anchorArtY < flip[2].artH, 'her kick\'s arc sweeps under her feet');
  for (const key of ['idle', 'run', 'attack2', 'attack3_cast', 'extra_attack', 'attack5_cast', 'hurt']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is her head', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(55 * DEF.visual.portrait.size), 'from her first stance frame, 55 pixels tall');
});

// ---- Her kicks ---------------------------------------------------------------------

test('the Kick Combo: a high kick that holds (1), then a kick driven out off her hands, knocking away (3 at Base Launch 2 sideways)', () => {
  const d = versus({ gap: 44 });
  d.tick(P('attack1'));
  after(d, 0.7);
  assert.deepEqual(shape(mine(d, 'attack1')), [['hit', 1, 0, null], ['hit', 3, 2, 'horizontal']]);
  assert.ok(mine(d, 'attack1').at(-1).finalLaunch.x > 0, 'sent away the way she kicks');
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.6), 'its high kick at a tenth of a second, three fifths in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const blocked = versus({ gap: 44 });
  blocked.tick(P('attack1'), { shield: true });
  after(blocked, 0.7, {}, { shield: true });
  assert.deepEqual(mine(blocked, 'attack1').map((e) => e.type), ['block'], 'her high kick blocked, the string stops there');
  const far = versus({ gap: 140 });
  far.tick(P('attack1'));
  after(far, 0.7);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of her legs\' reach, nothing');
});

test('the Leg Sweep: her leg swept out along the floor, tripping up (3 at Base Launch 1 straight up), her quickest blow', () => {
  const d = versus({ gap: 40 });
  d.tick(P('extra_attack'));
  after(d, 0.5);
  assert.deepEqual(shape(mine(d, 'extra_attack')), [['hit', 3, 1, 'vertical']]);
  const atk = createAttackDefinition({ id: 'extra_attack', ...DEF.attacks.extra_attack });
  assert.ok(near(atk.startup, 0.05) && near(atk.total, 0.35), 'seven twentieths of a second');
  assert.equal(atk.stepIn, 'universal');
  // Low along the floor: it passes under a fighter held a little off it.
  const over = versus({ gap: 40 });
  hold(over.target, 40);
  over.tick(P('extra_attack'));
  after(over, 0.5);
  assert.deepEqual(mine(over, 'extra_attack'), [], 'nothing reaches a fighter over her leg');
  // Ground only.
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null);
});

test('the Flip Kick: a backflip whose kick sweeps up before her, launching straight up (3 at Base Launch 2)', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack4'));
  assert.equal(d.attacker.combat.attack?.def.id, 'attack4');
  after(d, 0.5);
  assert.deepEqual(shape(mine(d, 'attack4')), [['hit', 3, 2, 'vertical']]);
  const atk = createAttackDefinition({ id: 'attack4', ...DEF.attacks.attack4 });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.4), 'two fifths of a second');
  assert.equal(atk.stepIn, 'universal');
  // Its kick reaches over her too, an answer to a fighter coming down on her.
  const above = versus({ gap: 20 });
  hold(above.target, 40);
  above.tick(P('attack4'));
  after(above, 0.5);
  assert.deepEqual(shape(mine(above, 'attack4')), [['hit', 3, 2, 'vertical']]);
});

test('the Air Kick: a high kick from mid-air, 3 at Base Launch 1 sideways', () => {
  const d = versus({ gap: 40 });
  hold(d.attacker, 40);
  hold(d.target, 40);
  d.tick(P('attack1'));
  after(d, 0.4);
  assert.deepEqual(shape(mine(d, 'midair_attack1')), [['hit', 3, 1, 'horizontal']]);
});

// ---- Her pistols -------------------------------------------------------------------

test('the Twin Pistols: four shots, one after another, each 1 with no launch; 15 Energy for all four', () => {
  const d = versus({ gap: 200 });
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.energy, 85, 'her 15 as she starts, once');
  after(d, 0.8);
  assert.deepEqual(mine(d, 'attack2').map((e) => [e.type, e.source, e.damage, e.baseLaunch]),
    [['hit', 'projectile', 1, 0], ['hit', 'projectile', 1, 0], ['hit', 'projectile', 1, 0], ['hit', 'projectile', 1, 0]]);
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 }, { projectiles: DEF.projectiles });
  assert.deepEqual(atk.projectile.volley, { count: 4, interval: 0.1 });
  assert.ok(near(atk.total, 0.65), 'thirteen twentieths of a second');
  assert.ok(-DEF.attacks.attack2.projectile.offset.y > DEF.projectiles.attack2_object.hitbox.h / 2, 'its shots clear of the floor');
  // Out of their run (about 300 units), nothing.
  const out = versus({ gap: 420 });
  out.tick(P('attack2'));
  after(out, 1);
  assert.deepEqual(mine(out, 'attack2'), []);
  // A Shield that blocks one stops the rest.
  const blocked = versus({ gap: 200 });
  blocked.tick(P('attack2'), { shield: true });
  after(blocked, 1, {}, { shield: true });
  assert.deepEqual(mine(blocked, 'attack2').map((e) => e.type), ['block']);
  assert.equal(shots(blocked).length, 0);
});

test('the Air Twin Pistols: three shots from mid-air, each 1; 15 Energy', () => {
  const d = versus({ gap: 160 });
  hold(d.attacker, 50);
  hold(d.target, 50);
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack2');
  assert.equal(d.attacker.combat.energy, 85);
  after(d, 0.8);
  assert.deepEqual(mine(d, 'midair_attack2').map((e) => [e.type, e.source, e.damage]),
    [['hit', 'projectile', 1], ['hit', 'projectile', 1], ['hit', 'projectile', 1]]);
});

// ---- Her bow ----------------------------------------------------------------------------

test('the Silent Arrow: two fifths of a second drawing her bow, then an arrow far across the stage: 3 at Base Launch 1 sideways; 15 Energy', () => {
  const t = DEF.techniques.attack3;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.4) && near(SPRITES.duration(t.releaseAnimation), 4 / 15));
  const d = versus({ gap: 400 });
  d.tick(P('attack3'));
  assert.equal(d.attacker.technique?.def.id, 'attack3', 'she draws');
  assert.equal(d.attacker.combat.energy, 85, 'its 15 as it starts');
  after(d, 0.3);
  assert.equal(arrows(d).length, 0, 'not loosed yet');
  after(d, 0.15);
  assert.equal(arrows(d).length, 1, 'loosed as the cast ends');
  after(d, 1);
  assert.deepEqual(mine(d, 'attack3').map((e) => [e.type, e.source, e.damage, e.baseLaunch, e.directionalLaunch, e.backstab]),
    [['hit', 'projectile', 3, 1, 'horizontal', false]]);
  assert.ok(-t.projectile.offset.y > DEF.projectiles.attack3_object.hitbox.h / 2, 'its box clear of the floor');
  // Out of its flight (about 470 units), nothing.
  const out = versus({ gap: 620 });
  out.tick(P('attack3'));
  after(out, 1.6);
  assert.deepEqual(mine(out, 'attack3'), []);
  // A technique: the ground only, never in the air.
  const { fighter, step } = solo();
  airborne(step);
  step(P('attack3'));
  assert.equal(fighter.technique, null, 'nothing in the air');
});

test('the hunter\'s shot: an arrow in the back of an opponent turned away lands as 5 at Base Launch 3; a raised Shield blocks it either way', () => {
  const front = versus({ gap: 400 });
  front.tick(P('attack3'));
  after(front, 1.2);
  const back = versus({ gap: 400, targetFacing: 1 });
  back.tick(P('attack3'));
  after(back, 1.2);
  const stab = mine(back, 'attack3');
  assert.deepEqual(stab.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch, e.backstab]), [['hit', 5, 3, 'horizontal', true]]);
  assert.ok(stab[0].launchSpeed > mine(front, 'attack3')[0].launchSpeed, 'thrown harder');
  const blocked = versus({ gap: 400, targetFacing: 1 });
  blocked.tick(P('attack3'), { shield: true });
  after(blocked, 1.2, {}, { shield: true });
  assert.deepEqual(mine(blocked, 'attack3').map((e) => [e.type, e.damage, e.backstab]), [['block', 0, false]]);
});

test('a hit while she draws breaks the Silent Arrow: no arrow', () => {
  const d = versus({ gap: 300 });
  d.tick(P('attack3'));
  for (let i = 0; i < 10; i++) d.tick();
  new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 }));
  after(d, 1);
  assert.equal(d.attacker.technique, null, 'broken');
  assert.equal(arrows(d).length, 0, 'nothing loosed');
});

// ---- Up -------------------------------------------------------------------------------

test('the Grapple: fired straight up from mid-air, she is hauled up after it, drawing in whoever is near the hook and striking them up (3 at Base Launch 2); once per airtime', () => {
  const atk = createAttackDefinition({ id: 'midair_attack4', ...DEF.attacks.midair_attack4 });
  assert.equal(atk.motion.type, 'rise');
  assert.equal(atk.airUses, 1, 'once per airtime');
  assert.ok(atk.pull.radius > 0, 'her line draws in');
  // She rises.
  const { fighter, step } = solo();
  airborne(step, 20);
  const y0 = fighter.body.y;
  step(P('attack4'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack4');
  for (let i = 0; i < steps(0.45); i++) step({});
  assert.ok(fighter.body.y < y0 - 80, `hauled up (${(y0 - fighter.body.y).toFixed(0)} units)`);
  // Not again before she lands.
  for (let i = 0; i < steps(0.3); i++) step({});
  step(P('attack4'));
  assert.notEqual(fighter.combat.attack?.def.id, 'midair_attack4', 'spent for this airtime');
  // Someone above and to her side is drawn in and struck up.
  const d = versus({ gap: 60 });
  hold(d.attacker, 60);
  d.attacker.body.gravityScale = 1;
  hold(d.target, 190);
  d.tick(P('attack4'));
  after(d, 0.6);
  assert.deepEqual(shape(mine(d, 'midair_attack4')), [['hit', 3, 2, 'vertical']]);
});

// ---- The Medipack -------------------------------------------------------------------------

test('the Medipack heals her of 10 Launch Points as she gets back up; a hit while she kneels breaks it', () => {
  const { fighter, step } = solo();
  fighter.combat.launchPoint = 40;
  fighter.combat.launchRecoveryRemaining = 99;
  step(P('attack5'));
  let n = 0;
  while (!fighter.heals.length && n < 120) {
    step({});
    n++;
  }
  assert.ok(Math.abs((n + 1) * DT - 1) < 0.05, `a full second knelt (${((n + 1) * DT).toFixed(2)} s)`);
  assert.deepEqual(fighter.heals, [{ amount: 10, ability: 'attack5' }]);
  assert.equal(fighter.combat.launchPoint, 30);
  assert.equal(fighter.combat.abilityCooldowns.duration('attack5'), 3, 'a heal: the policy\'s 3 s');
  // Broken while she kneels.
  const d = versus({ gap: 300 });
  d.attacker.combat.launchPoint = 40;
  d.tick(P('attack5'));
  for (let i = 0; i < 20; i++) d.tick();
  new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 }));
  after(d, 1.5);
  assert.equal(d.attacker.combat.launchPoint, 41, 'nothing healed');
});

// ---- Her defense ---------------------------------------------------------------------------

test('her Deflect: a somersault kick, in the air, that turns projectiles back', () => {
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
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0016');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.deflections.length, 'turned back');
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays her whole kit: her kicks, her pistols on the ground and in the air, her bow, her shot up and her grapple', () => {
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
  for (const move of ['attack1:ground', 'attack1:air', 'attack2:ground', 'attack2:air', 'attack3:ground', 'attack4:ground', 'extra_attack:ground']) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
});

// ---- Her source -----------------------------------------------------------------------

// The character behind #0016, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who she is.) Her
// names are put together here so this file never spells them.
const UNNAMED = new RegExp([
  `\\b${['l', 'a', 'r', 'a'].join('')}\\b`,
  ['c', 'r', 'o', 'f', 't'].join(''),
  `${['t', 'o', 'm', 'b'].join('')}[\\s_-]*${['r', 'a', 'i', 'd', 'e', 'r'].join('')}`,
].join('|'), 'i');
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

test('the character behind #0016 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0016.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: her name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
});
