// Run with node --test tests/fighters/0017/fighter-0017.test.mjs (no dependencies).
// #0017, the robot girl of boundless, cartoon strength: registered from
// CHARACTERS alone in roster slot 17, her clips cut from one sprite sheet
// into her own folder and read from the real PNGs (tight, 1x, one art-pixel
// scale, anchored on her overalls), five numbered buttons (four ordinary
// attacks with their mid-air versions and a technique) and an extra attack
// on the ground only. The Spin Kick and the Stick Poke up close (her Mash
// Combo), the Somersault Headbutt, Kiiin! (a run at the speed of sound),
// the Headbutt Dive (a plunge whose landing bursts the ground: a quake),
// the Rocket Headbutt (her rise), the Earth Chop (a 10-damage quake round
// her after a breakable wind-up) and Finders Keepers, on the ground and in
// the air: a touch (`mimic`) that copies her opponent's strongest
// projectile for her next one to throw, or takes all its Energy when it
// throws none. Her Deflect, a shout. The roster, credits and translations
// she adds are checked in empty-roster, settings and i18n. Layout and paint
// still need real-browser verification.
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
import { strongestProjectile } from '../../../js/game/combat/mimic.js';
import { readMoveset } from '../../../js/game/ai/moveset.js';
import { analyzeCapabilities } from '../../../js/game/ai/cpu-intelligence/capabilities.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0017/';
const DEF = getCharacter('0017');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0017_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0017 on her own, and against `target` (#0009 by default) at `gap`.
const solo = (opts = {}) => makeFighter({ character: DEF, sprites: SPRITES, ...opts });
const versus = (opts = {}, target = getCharacter('0009')) => duel({
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
// Her touch landed on `id` (the duel against that fighter, after it).
function touched(id, opts = {}) {
  const d = versus({ gap: 34, ...opts }, getCharacter(id));
  d.tick(P('attack5'));
  after(d, 0.6);
  return d;
}
// The copies she throws in play.
const thrown = (d) => d.projectiles.filter((p) => p.owner === d.attacker);

const { images: IMAGES, sprites: REAL } = realArt(DEF);

// Every clip and the files it plays, in order (a file shown twice is one
// file on disk).
const CLIPS = {
  idle: named('idle', [1, 2, 3, 4, 3, 2]),
  run: named('run', 6),
  jump: named('jump', 2),
  fall: named('fall', 2),
  land: named('land', 1),
  mouvment: named('mouvment', 3),
  midair_mouvment: named('midair_mouvment', 4),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 4),
  prepshield: named('prepshield', 1),
  shielding: named('shielding', 1),
  releaseshield: named('releaseshield', 1),
  deflect: named('deflect', [1, 2, 2, 1]),
  attack1: named('attack1', [1, 2, 2, 3, 3, 4, 4]),
  midair_attack1: named('midair_attack1', [1, 2, 3, 4, 5, 5, 6]),
  attack2: named('attack2', [1, 2, 3, 2, 3, 2, 3, 2, 3, 1]),
  midair_attack2: named('midair_attack2', [1, 1, 2]),
  midair_attack2_impact: named('midair_attack2', [3, 4, 5, 6]),
  attack3: named('attack3', [1, 2, 2, 3, 3, 4]),
  midair_attack3: named('midair_attack3', [1, 1, 1, 1, 2]),
  attack4_cast: named('attack4', [1, 2, 2, 3]),
  attack4_release: named('attack4', [4, 5, 6, 7, 8]),
  attack5: named('attack5', [1, 3, 4, 4, 3, 2, 5]),
  midair_attack5: named('midair_attack5', [1, 2, 2, 2, 1]),
  extra_attack: named('extra_attack', 6),
};
const FILES = [...new Set(Object.values(CLIPS).flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 43, run: 38, jump: 37, fall: 38, land: 31, mouvment: 37, midair_mouvment: 32, hurt: 40, midair_hurt: 40,
  prepshield: 41, shielding: 40, releaseshield: 41, deflect: 33, attack1: 37, midair_attack1: 41, attack2: 37,
  midair_attack2: 36, midair_attack2_impact: 39, attack3: 44, midair_attack3: 37, attack4_cast: 41, attack4_release: 39,
  attack5: 34, midair_attack5: 39, extra_attack: 36,
};

// ---- Registration -------------------------------------------------------------------

test('#0017 is a real CHARACTERS entry: available, in roster slot 17, after #0001 to #0016', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0017'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0017');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 16);
  assert.deepEqual(playableCharacters().map((c) => c.id), [
    '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017',
  ]);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of her own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('five numbered attacks, each a button of its own: four ordinary with their mid-air versions and the Earth Chop, a technique; plus the Stick Poke, on the ground only', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { ground: 'attack3', air: 'midair_attack3' },
    attack4: { type: 'technique', id: 'attack4' },
    attack5: { ground: 'attack5', air: 'midair_attack5' },
  });
  assert.deepEqual(Object.keys(DEF.attacks).sort(), [
    'attack1', 'attack2', 'attack3', 'attack5', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3', 'midair_attack5',
  ]);
  assert.deepEqual(Object.keys(DEF.techniques), ['attack4']);
  assert.equal(actionType(DEF, 'attack4'), 'technique');
  assert.equal(DEF.attacks.extra_attack.groundOnly, true, 'the Stick Poke on the ground only');
  assert.equal(DEF.summons, undefined, 'she summons nobody');
  assert.equal(DEF.projectiles, undefined, 'no shot of her own: only what she copies');
  assert.equal(DEF.projectileAnimations, undefined);
  assert.equal(DEF.effectAnimations, undefined);
  assert.equal(DEF.techniques.attack4.heal, undefined, 'she never heals');
  for (const a of Object.values(DEF.attacks)) assert.notEqual(a.motion?.type, 'homing', 'she never homes in');
  // In the air her Triangle / Y does nothing: the Stick Poke is a ground
  // move and nothing takes its place.
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null, 'nothing in the air');
});

test('nothing she does costs Energy but a throw of a copy; only the Earth Chop waits, 5 s', () => {
  const { fighter } = solo();
  for (const a of Object.values(fighter.attacks)) {
    assert.equal(a.energyCost, 0, `${a.id}: free`);
    assert.equal(a.cooldown, 0, `${a.id}: no cooldown`);
  }
  assert.equal(fighter.techniqueDefs.attack4.cooldown, 5, 'the earth split for 10: the policy\'s 5 s');
  assert.equal(fighter.techniqueDefs.attack4.energyCost, 0, 'a special cooldown is its limit');
  assert.equal(fighter.deflect.cooldown, 0);
  assert.ok(fighter.attacks.attack5.mimic && fighter.attacks.midair_attack5.mimic, 'both Finders Keepers touch');
  for (const id of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'extra_attack']) {
    assert.equal(fighter.attacks[id].mimic, null, `${id}: no touch`);
  }
});

test('her Specials: the Earth Chop and Finders Keepers, on the ground and in the air; her kicks, stick, run and headbutts are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack4', 'attack5', 'midair_attack5']);
  for (const move of ['attack4', 'attack5', 'midair_attack5']) assert.equal(isSpecialAbility(DEF, move), true, move);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
  const { fighter, step } = solo();
  step(P('attack5'));
  assert.equal(activeSpecialAbility(fighter), 'attack5', 'the orange mark while she pokes');
});

test('her Mash Combo: the Spin Kick and the Stick Poke; a touch is never a partner', () => {
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'extra_attack'] });
  assert.deepEqual(mashComboProblems(DEF), []);
  assert.equal(DEF.attacks.mash_attack, undefined, 'no button-less partner: both are on her buttons');
  const touch = mashComboProblems({ ...DEF, mashCombo: { attacks: ['attack1', 'attack5'] } });
  assert.ok(touch.some((p) => /mimics/.test(p)), 'Finders Keepers refused as a partner: its next use throws');
  const { fighter, step } = solo();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    step(P('attack1'));
    for (let k = 0; k < 4; k++) seen.push(step({}).combat.attack?.def.id);
  }
  for (let i = 0; i < steps(7); i++) seen.push(step({}).combat.attack?.def.id);
  assert.ok(seen.includes('extra_attack'), 'the Stick Poke is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('her in-game names and touch buttons name each move, in English and French, each on a frame of her own art', () => {
  const moves = [
    'attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'attack5', 'midair_attack5', 'extra_attack',
  ];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Spin Kick', 'Somersault Headbutt', 'Kiiin!', 'Headbutt Dive', 'Rocket Headbutt', 'Air Rocket Headbutt', 'Earth Chop',
    'Finders Keepers', 'Air Finders Keepers', 'Stick Poke',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Spin Kick', 'Kiiin!', 'Rocket Headbutt', 'Earth Chop', 'Finders Keepers', 'Stick Poke']);
  assert.deepEqual(buttons('fr'), ['Coup de pied tournoyant', 'Kiiin !', 'Coup de tête fusée', 'Fend-la-Terre', 'Trouvé, gardé', 'Coup de bâton']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3', 'midair_attack5'].map((m) => STRINGS.fr[`ability.0017.${m}`]),
    ['Coup de tête salto', 'Coup de tête plongeant', 'Coup de tête fusée aérien', 'Trouvé, gardé aérien']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].map((a) => art(a)), [
    '0017_attack1_3.png', '0017_attack2_2.png', '0017_attack3_2.png', '0017_attack4_4.png', '0017_attack5_4.png', '0017_extra_attack_4.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack3', 'attack5'].map((a) => art(a, true)), [
    '0017_midair_attack1_5.png', '0017_midair_attack2_2.png', '0017_midair_attack3_1.png', '0017_midair_attack5_2.png',
  ]);
  for (const a of ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0017.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('her recommended controller layout: her kick on Square, the stick on Triangle, Finders Keepers on R2, Kiiin! on the right stick forward, the dive down, the rocket up, the Earth Chop on L2', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:extra_attack': pad('north'),
    'ground:attack2': flick('forward'),
    'ground:attack3': flick('up'),
    'ground:attack4': pad('l2'),
    'ground:attack5': pad('r2'),
    'air:attack1': pad('west'),
    'air:attack2': flick('down'),
    'air:attack3': flick('up'),
    'air:attack5': pad('r2'),
  });
  assert.equal(DEF.attacks.midair_attack2.motion.type, 'slam', 'the stick down in the air for the move that plunges');
  assert.equal(DEF.attacks.midair_attack3.motion.type, 'rise', 'the stick up for the move that rises');
  assert.equal(DEF.controller.previous, undefined, 'new: no layout of before');
});

// ---- Art --------------------------------------------------------------------------

test('her folder holds exactly the frames her clips play: every file named <id>_<codename>_<frame>.png, none a copy of another', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 79);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  // A drawing the sheet repeats (her arms-out stride, her shout, her tumble)
  // was cut once.
  const seen = new Map();
  const same = [];
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const key = `${w}x${h}:${Buffer.from(pixels).toString('base64')}`;
    if (seen.has(key)) same.push(`${seen.get(key)} = ${name}`);
    else seen.set(key, name);
  }
  assert.deepEqual(same, [], 'no file twice');
});

test('every frame is cut clean: none of the sheet\'s periwinkle background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 128 && g === 128 && b === 255), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel: about 73 units tall', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 43);
  assert.ok(near(REAL.worldPerArt, 88 / 52), 'the same world size per art pixel as the rest of the roster');
  assert.ok(near(DEF.visual.height, 43 * 88 / 52), 'about 73 units tall');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(near(anim.maxArtH, HEIGHTS[key]), `${key}: tallest frame ${anim.maxArtH}`);
    assert.ok(near(anim.heightRatio, HEIGHTS[key] / 43), `${key}: its heightRatio`);
    for (const f of anim.frames) {
      assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
      assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth), `${key}: its width`);
      assert.ok(near(f.artH, IMAGES.get(f.url).naturalHeight), `${key}: its height`);
    }
  }
});

test('anchors keep her body in place: on her overalls, wherever her kick\'s arc, the bursting ground or her finger reach', () => {
  const at = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  assert.deepEqual(at('idle'), [14, 14, 14, 14, 14, 14]);
  // The ground bursting round her feet and her arms flung out would pull
  // the automatic anchor off her body.
  const off = (key, n, codename = key) => {
    const f = REAL.animations[key].frames.find((x) => x.url.endsWith(`_${codename}_${n}.png`));
    return Math.abs(f.anchorArtX - withFakeCanvas(() => f.anchorX));
  };
  for (const [key, n, codename] of [['attack4_release', 4, 'attack4'], ['midair_attack2_impact', 6, 'midair_attack2'], ['attack1', 3]]) {
    assert.ok(off(key, n, codename) > 1, `${key} ${n}: on her body, not her reach`);
  }
  // Her head-first flight keeps her where its twin without the arc is: the
  // arc that sweeps under her is not the floor.
  const flip = REAL.animations.midair_attack1.frames;
  const arc = flip.find((f) => f.url.endsWith('_5.png'));
  assert.ok(arc.anchorArtY < arc.artH, 'its arc below her feet');
  for (const key of ['idle', 'run', 'attack2', 'attack4_cast', 'extra_attack', 'attack5', 'hurt']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is her head under her cap', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(41 * DEF.visual.portrait.size), 'from her first stance frame, 41 pixels tall');
});

// ---- Up close --------------------------------------------------------------------------

test('the Spin Kick: a kick that holds (1), then swept round in an arc, knocking away (3 at Base Launch 2 sideways)', () => {
  const d = versus({ gap: 36 });
  d.tick(P('attack1'));
  after(d, 0.5);
  assert.deepEqual(shape(mine(d, 'attack1')), [['hit', 1, 0, null], ['hit', 3, 2, 'horizontal']]);
  assert.ok(mine(d, 'attack1').at(-1).finalLaunch.x > 0, 'sent away the way she kicks');
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.05) && near(atk.total, 0.35), 'a twentieth of a second to her kick, seven in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const blocked = versus({ gap: 36 });
  blocked.tick(P('attack1'), { shield: true });
  after(blocked, 0.5, {}, { shield: true });
  assert.deepEqual(mine(blocked, 'attack1').map((e) => e.type), ['block'], 'blocked, the string stops there');
  const far = versus({ gap: 130 });
  far.tick(P('attack1'));
  after(far, 0.5);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of her leg\'s reach, nothing');
});

test('the Stick Poke: her stick brought down before her (3 at Base Launch 2 sideways), her quickest blow', () => {
  const d = versus({ gap: 34 });
  d.tick(P('extra_attack'));
  after(d, 0.4);
  assert.deepEqual(shape(mine(d, 'extra_attack')), [['hit', 3, 2, 'horizontal']]);
  const atk = createAttackDefinition({ id: 'extra_attack', ...DEF.attacks.extra_attack });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.3), 'three tenths of a second');
  assert.equal(atk.stepIn, 'universal');
});

test('the Somersault Headbutt: a forward flip from mid-air ending head-first, 3 at Base Launch 2 sideways', () => {
  const d = versus({ gap: 36 });
  hold(d.attacker, 40);
  hold(d.target, 40);
  d.tick(P('attack1'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack1');
  after(d, 0.4);
  assert.deepEqual(shape(mine(d, 'midair_attack1')), [['hit', 3, 2, 'horizontal']]);
});

// ---- Kiiin! and the headbutts ---------------------------------------------------------

test('Kiiin!: away along the ground at the speed of sound, sending whoever she meets flying (3 at Base Launch 3 sideways), back to her run\'s speed as it ends', () => {
  const { fighter, step } = solo();
  const x0 = fighter.body.x;
  step(P('attack2'));
  assert.equal(fighter.combat.attack?.def.id, 'attack2');
  for (let i = 0; i < steps(0.7); i++) step({});
  assert.ok(fighter.body.x - x0 > 280, `a long run (${(fighter.body.x - x0).toFixed(0)} units)`);
  assert.ok(Math.abs(fighter.body.vx) < fighter.maxSpeed, 'back below her own run\'s top speed');
  const d = versus({ gap: 200 });
  d.tick(P('attack2'));
  after(d, 0.7);
  assert.deepEqual(shape(mine(d, 'attack2')), [['hit', 3, 3, 'horizontal']]);
  // A raised Shield stops her dead and sends her back.
  const blocked = versus({ gap: 160 });
  blocked.tick(P('attack2'), { shield: true });
  after(blocked, 0.7, {}, { shield: true });
  assert.deepEqual(mine(blocked, 'attack2').map((e) => e.type), ['block']);
  assert.ok(blocked.attacker.body.x < blocked.target.body.x, 'never through it');
  // Ground only: its air move is the Headbutt Dive.
  assert.equal(DEF.attacks.attack2.groundOnly, true);
});

test('the Headbutt Dive: plunged head-first from mid-air, a spike (3 at Base Launch 2 down); the ground bursts round where she lands, only for those standing on it (3, a quake)', () => {
  const atk = createAttackDefinition({ id: 'midair_attack2', ...DEF.attacks.midair_attack2 });
  assert.equal(atk.motion.type, 'slam');
  assert.equal(atk.motion.impact.hit.quake, true);
  assert.equal(atk.airUses, 1, 'once per airtime');
  // Someone beside where she lands is thrown up by the burst.
  const d = versus({ gap: 50 });
  hold(d.attacker, 120);
  d.attacker.body.gravityScale = 1;
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack2');
  after(d, 0.8);
  assert.deepEqual(shape(mine(d, 'midair_attack2')), [['hit', 3, 2, 'vertical']], 'the burst');
  assert.equal(d.attacker.grounded, true, 'landed');
  // Someone under her is spiked.
  const under = versus({ gap: 0 });
  hold(under.attacker, 90);
  under.attacker.body.gravityScale = 1;
  hold(under.target, 30);
  under.tick(P('attack2'));
  after(under, 0.4);
  assert.deepEqual(shape(mine(under, 'midair_attack2')).slice(0, 1), [['hit', 3, 2, 'reverseVertical']], 'spiked');
});

test('the Rocket Headbutt: launched up head-first, on the ground and in the air, carrying her target and sending it sky-high (3 at Base Launch 3); once per airtime in the air', () => {
  const { fighter, step } = solo();
  const y0 = fighter.body.y;
  step(P('attack3'));
  assert.equal(fighter.combat.attack?.def.id, 'attack3');
  for (let i = 0; i < steps(0.3); i++) step({});
  assert.ok(fighter.body.y < y0 - 90, `launched up (${(y0 - fighter.body.y).toFixed(0)} units)`);
  // In the air too, once.
  const air = solo();
  airborne(air.step, 20);
  const y1 = air.fighter.body.y;
  air.step(P('attack3'));
  assert.equal(air.fighter.combat.attack?.def.id, 'midair_attack3');
  for (let i = 0; i < steps(0.25); i++) air.step({});
  assert.ok(air.fighter.body.y < y1 - 60, 'up from mid-air');
  for (let i = 0; i < steps(0.2); i++) air.step({});
  air.step(P('attack3'));
  assert.notEqual(air.fighter.combat.attack?.def.id, 'midair_attack3', 'spent for this airtime');
  const d = versus({ gap: 30 });
  d.tick(P('attack3'));
  after(d, 0.5);
  assert.deepEqual(shape(mine(d, 'attack3')), [['hit', 1, 0, null], ['hit', 3, 3, 'vertical']]);
});

// ---- The Earth Chop --------------------------------------------------------------------

test('the Earth Chop: two fifths of a second winding up, then the ground split round her, 120 units either side: 10 at Base Launch 3 straight up; 5 s', () => {
  const t = DEF.techniques.attack4;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.4) && near(SPRITES.duration(t.releaseAnimation), 1 / 3));
  for (const side of [1, -1]) {
    const d = versus({ gap: 70 * side });
    d.tick(P('attack4'));
    assert.equal(d.attacker.technique?.def.id, 'attack4');
    after(d, 0.3);
    assert.deepEqual(mine(d, 'attack4'), [], 'nothing while she winds up');
    after(d, 0.2);
    assert.deepEqual(shape(mine(d, 'attack4')), [['hit', 10, 3, 'vertical']], `side ${side}`);
    assert.equal(d.attacker.combat.abilityCooldowns.duration('attack4'), 5);
  }
  // A quake: whoever is off the ground is passed by.
  const jumped = versus({ gap: 70 });
  hold(jumped.target, 30);
  jumped.tick(P('attack4'));
  after(jumped, 0.6);
  assert.deepEqual(mine(jumped, 'attack4'), [], 'jumping clears it');
  // Out of its reach, nothing.
  const far = versus({ gap: 190 });
  far.tick(P('attack4'));
  after(far, 0.6);
  assert.deepEqual(mine(far, 'attack4'), []);
  // A raised Shield blocks it.
  const blocked = versus({ gap: 70 });
  blocked.tick(P('attack4'), { shield: true });
  after(blocked, 0.6, {}, { shield: true });
  assert.deepEqual(mine(blocked, 'attack4').map((e) => e.type), ['block']);
});

test('a hit while she winds up breaks the Earth Chop: nothing split, no cooldown', () => {
  const d = versus({ gap: 70 });
  d.tick(P('attack4'));
  for (let i = 0; i < 10; i++) d.tick();
  new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 }));
  after(d, 0.8);
  assert.equal(d.attacker.technique, null, 'broken');
  assert.deepEqual(mine(d, 'attack4'), []);
  assert.equal(d.attacker.combat.abilityCooldowns.active('attack4'), false);
});

// ---- Finders Keepers --------------------------------------------------------------------

test('Finders Keepers: her finger poked out (1, no launch); a real hit copies the strongest projectile her opponent throws into her hands', () => {
  const atk = createAttackDefinition({ id: 'attack5', ...DEF.attacks.attack5 });
  assert.ok(near(atk.startup, 2 / 15) && near(atk.total, 7 / 15), 'a deliberate poke: seven fifteenths of a second');
  assert.deepEqual(atk.mimic, { spawnAt: 2 / 15, offset: { x: 32, y: -30 }, siphon: 100 });
  // The strongest by what one throw deals one target, then its launch:
  // #0007's rocket (10) over its pistol (3) and its fire (which never
  // flies); #0016's arrow (3, 5 in a turned back) over her pistol shots
  // (1); #0001's sphere (10) over Red and Blue; #0006's scream (its three
  // strikes, 5) over Heat Vision (3); #0009's Air Blast (5) over its Air
  // Gust (1), never its Earth Pillar (it stays where it rises); #0015's
  // tornado (6), never its present.
  const want = {
    '0007': 'attack5_object', '0016': 'attack3_object', '0001': 'attack5_object', '0006': 'attack5_object',
    '0009': 'attack3_object', '0015': 'attack4_object', '0002': 'extra_attack_object', '0013': 'attack3_object',
  };
  for (const [id, projectile] of Object.entries(want)) {
    const d = touched(id);
    const touch = mine(d, 'attack5');
    assert.deepEqual(touch.map((e) => [e.type, e.damage, e.baseLaunch, e.copied, e.siphoned]), [['hit', 1, 0, projectile, 0]], id);
    assert.equal(d.attacker.combat.copy?.id, projectile, `${id}: in her hands`);
    assert.equal(d.attacker.combat.copy.def, d.target.projectileDefs[projectile], `${id}: its own definition`);
    assert.equal(d.attacker.combat.copy.sprites, d.target.sprites, `${id}: drawn in its own art`);
    assert.equal(d.target.combat.energy, 100, `${id}: its Energy left alone`);
  }
});

test('her next Finders Keepers throws the copy instead: the projectile alone, hers now, striking as its thrower\'s does; out of her hands once thrown', () => {
  const d = touched('0016');
  assert.equal(d.attacker.combat.copy?.id, 'attack3_object');
  // Back off out of reach of a poke: the throw is a shot.
  d.target.body.x = d.attacker.body.x + 260;
  after(d, 0.2);
  const energy = d.attacker.combat.energy;
  d.tick(P('attack5'));
  assert.equal(d.attacker.combat.attack?.def.id, 'attack5', 'the same move');
  assert.equal(d.attacker.combat.attack.def.hitbox, null, 'it strikes nothing itself');
  assert.equal(d.attacker.combat.energy, energy - 15, 'an ordinary copy: a construct, 15 Energy');
  after(d, 0.1);
  assert.equal(thrown(d).length, 0, 'not yet');
  after(d, 0.05);
  const [arrow] = thrown(d);
  assert.ok(arrow, 'thrown as her finger goes out');
  assert.equal(arrow.def, d.target.projectileDefs.attack3_object, 'the arrow itself, without the bow');
  assert.equal(arrow.sprites, d.target.sprites, 'in its own art');
  assert.equal(arrow.direction, 1, 'the way she faces');
  assert.equal(d.attacker.combat.copy, null, 'out of her hands');
  after(d, 0.6);
  assert.deepEqual(mine(d, 'attack5').slice(1).map((e) => [e.type, e.source, e.damage, e.baseLaunch]), [['hit', 'projectile', 3, 1]],
    'the arrow\'s own hit, credited to her');
  // With nothing in her hands, the next one pokes again.
  after(d, 0.3);
  d.target.body.x = d.attacker.body.x + 34;
  d.tick(P('attack5'));
  assert.ok(d.attacker.combat.attack.def.hitbox, 'a poke again');
});

test('every shooter\'s copy, thrown on the ground and in the air, flies and strikes: one too tall for her hand leaves lifted clear of the floor', () => {
  for (const target of playableCharacters()) {
    for (const air of [false, true]) {
      const d = touched(target.id);
      const copy = d.attacker.combat.copy;
      if (!copy) continue;
      d.attacker.combat.setEnergy(100);
      d.target.combat.launchPoint = 0;
      after(d, 1.2);
      d.target.body.x = d.attacker.body.x + 160;
      d.target.body.vx = 0;
      // In the air: just off the floor, where a tall copy would meet it too
      // (her target stays on the ground: #0014's wave is a quake, meeting
      // only fighters standing on it).
      if (air) hold(d.attacker, 6);
      const from = d.events.length;
      d.tick(P('attack5'));
      assert.equal(d.attacker.combat.attack?.def.id, air ? 'midair_attack5' : 'attack5', `#${target.id}`);
      const offset = d.attacker.combat.attack.def.projectile.offset;
      const hb = copy.def.hitbox;
      assert.ok(offset.y + hb.y + hb.h < 0, `#${target.id}'s ${copy.id}: its box clear of her feet`);
      after(d, 2.5);
      const landed = d.events.slice(from).filter((e) => e.attacker === d.attacker && e.source === 'projectile');
      assert.ok(landed.length > 0, `#${target.id}'s ${copy.id} ${air ? 'in the air' : 'on the ground'}: flew and struck`);
    }
  }
});

test('a copy that deals 10 earns its 5 s once thrown (no Energy), keeping the touch waiting; one that holds earns 3 s', () => {
  const d = touched('0007');
  d.target.body.x = d.attacker.body.x + 300;
  const energy = d.attacker.combat.energy;
  d.tick(P('attack5'));
  assert.equal(d.attacker.combat.energy, energy, 'a 5 s copy pays nothing');
  after(d, 0.3);
  assert.equal(thrown(d)[0]?.def.damage, 10, 'the rocket, without the launcher');
  assert.ok(Math.abs(d.attacker.combat.cooldowns.get('attack5') - 5) < 0.3, 'its 5 s, from the throw');
  after(d, 0.5);
  d.tick(P('attack5'));
  assert.notEqual(d.attacker.combat.attack?.def.id, 'attack5', 'the touch waits with it');
  const web = touched('0011');
  web.target.body.x = web.attacker.body.x + 200;
  web.tick(P('attack5'));
  after(web, 0.3);
  assert.ok(Math.abs(web.attacker.combat.cooldowns.get('attack5') - 3) < 0.3, 'the webbing that holds: 3 s');
});

test('a block takes nothing; a throw cut short before it lets go keeps the copy; a fresh life holds none', () => {
  const blocked = versus({ gap: 34 }, getCharacter('0007'));
  blocked.tick(P('attack5'), { shield: true });
  after(blocked, 0.6, {}, { shield: true });
  assert.deepEqual(mine(blocked, 'attack5').map((e) => [e.type, e.copied, e.siphoned, e.energyCost]), [['block', null, 0, 15]],
    'only the block\'s own 15');
  assert.equal(blocked.attacker.combat.copy, null, 'nothing copied through a Shield');
  assert.equal(blocked.target.combat.energyExhausted, false);
  const cut = touched('0016');
  cut.target.body.x = cut.attacker.body.x + 260;
  after(cut, 0.2);
  cut.tick(P('attack5'));
  after(cut, 0.1);
  new CombatSystem().applyHit(cut.target, cut.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.3, hitstop: 0 }));
  after(cut, 0.4);
  assert.equal(thrown(cut).length, 0, 'nothing thrown');
  assert.equal(cut.attacker.combat.copy?.id, 'attack3_object', 'still in her hands');
  cut.attacker.respawn(cut.attacker.stage);
  assert.equal(cut.attacker.combat.copy, null, 'gone with the old life');
});

test('the Air Finders Keepers touches in the air too, and throws a copy she holds from mid-air', () => {
  const d = versus({ gap: 30 }, getCharacter('0013'));
  hold(d.attacker, 40);
  hold(d.target, 40);
  d.tick(P('attack5'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack5');
  after(d, 0.4);
  assert.equal(d.attacker.combat.copy?.id, 'attack3_object', 'the lions copied');
  d.target.body.x = d.attacker.body.x + 220;
  d.tick(P('attack5'));
  after(d, 0.15);
  assert.equal(thrown(d)[0]?.def, d.target.projectileDefs.attack3_object, 'thrown from mid-air');
});

test('an opponent that throws nothing gives up all its Energy to her: exhausted, every bit of it hers, never past her bar', () => {
  for (const id of ['0003', '0005', '0008', '0010', '0017']) {
    const d = versus({ gap: 34 }, getCharacter(id));
    d.attacker.combat.energy = 30;
    d.tick(P('attack5'));
    after(d, 0.3);
    const [touch] = mine(d, 'attack5');
    assert.deepEqual([touch.type, touch.copied, touch.siphoned], ['hit', null, 100], id);
    assert.equal(d.target.combat.energyExhausted, true, `${id}: exhausted`);
    assert.ok(d.target.combat.energy < 10, `${id}: emptied`);
    assert.equal(d.attacker.combat.energy, 100, `${id}: hers, up to her full bar`);
    assert.equal(d.attacker.combat.copy, null, `${id}: nothing to copy`);
  }
  assert.equal(strongestProjectile({ projectileDefs: {}, sprites: null }), null);
});

test('the CPU knows a held copy as a ranged throw, and a touch as a melee strike', () => {
  const d = touched('0016');
  const caps = analyzeCapabilities(d.attacker);
  assert.ok(readMoveset(d.attacker).ranged.some((r) => r.action === 'attack5'), 'a throw while she holds a copy');
  assert.equal(caps.copy, d.attacker.combat.copy);
  const fresh = solo().fighter;
  assert.ok(readMoveset(fresh).melee.some((m) => m.action === 'attack5' && m.atk.mimic), 'a touch with nothing in her hands');
});

// ---- Her defense ---------------------------------------------------------------------------

test('her Deflect: a hop and a shout, in the air, that blows projectiles back', () => {
  assert.equal(DEF.deflect.deflectProjectiles, true);
  const { fighter, step } = solo();
  airborne(step);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
  const shooter = getCharacter('0007');
  const d = duel({ attackerCharacter: shooter, targetCharacter: DEF, targetSprites: SPRITES, gap: 400 });
  hold(d.target, 40);
  d.tick({}, P('shield'));
  const def = d.attacker.projectileDefs.extra_attack_object;
  const b = d.target.body;
  d.projectiles.push(new Projectile({
    owner: d.attacker, def, anim: d.attacker.sprites.projectile(def.animation), x: b.x - 120, y: b.y - 30, direction: 1,
  }));
  after(d, 0.3);
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0017');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.deflections.length, 'blown back');
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays her whole kit: her kick and headbutts, Kiiin!, the dive, the rocket, the Earth Chop, Finders Keepers and its throw', () => {
  const used = new Map();
  // What reached the opponent from a copy she threw (she has no shot of
  // her own: a projectile of hers not turned back by her Deflect is one).
  let copies = 0;
  let siphoned = 0;
  for (const difficulty of ['medium', 'brutal']) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const foe of ['0001', '0007', '0003']) {
        const { log, events } = cpuFight(DEF, getCharacter(foe), { seconds: 30, seed, difficulty });
        const me = [...log.keys()].find((f) => f.def === DEF && f.slot === 'p1');
        for (const [k, v] of me.controller.telemetry.moveUsage) used.set(k, (used.get(k) ?? 0) + v);
        copies += events.filter((e) => e.attacker === me && e.source === 'projectile' && !e.redirected).length;
        siphoned += events.filter((e) => e.attacker === me && e.siphoned > 0).length;
      }
    }
  }
  for (const move of ['attack1:ground', 'attack1:air', 'attack2:ground', 'attack3:ground', 'attack4:ground', 'attack5:ground', 'extra_attack:ground']) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
  assert.ok(copies > 0, `it throws what it copies (${copies})`);
  assert.ok(siphoned > 0, `it takes the Energy of one that throws nothing (${siphoned})`);
});

// ---- Her source -----------------------------------------------------------------------

// The character behind #0017, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who she is.) Her
// names, her family's and her series' are put together here so this file
// never spells them.
const UNNAMED = new RegExp([
  ['a', 'r', 'a', 'l', 'e'].join(''),
  ['n', 'o', 'r', 'i', 'm', 'a', 'k', 'i'].join(''),
  `\\b${['s', 'l', 'u', 'm', 'p'].join('')}\\b`,
  ['s', 'e', 'n', 'b', 'e', 'i'].join(''),
  ['g', 'a', 't', 'c', 'h', 'a', 'n'].join(''),
  `\\bn['’]?${['c', 'h', 'a'].join('')}\\b`,
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

test('the character behind #0017 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0017.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: her name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
});
