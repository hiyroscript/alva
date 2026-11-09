// Run with node --test tests/fighters/0012/fighter-0012.test.mjs (no dependencies).
// #0012, the cyborg ninja in silver armour: registered from CHARACTERS
// alone in roster slot 12, its clips cut from one sprite sheet into its own
// folder and read from the real PNGs (tight, 1x, one art-pixel scale,
// anchored on its body wherever its blade's sweeps, the Deflect's whirl or
// Swift Strike's trail reach, a drawing the sheet repeats in another row cut
// once), five numbered buttons (four ordinary attacks with their mid-air
// versions and a technique) and an extra attack, Shuriken. Twin Cuts and
// the Cleave up close (its Mash Combo), the Whirlwind Cut, the Rising Arc
// and the Falling Cut in the air, Shuriken thrown three at a time (a
// `volley`), the Deflect Stance that turns shots back, Swift Strike that
// dashes through its target, the Rising Strike that dashes straight up, its
// Deflect's whirl of cuts, and Dragonblade, a 10-damage cleave with the
// dragon spirit round it. The roster, credits and translations it adds are
// checked in empty-roster, settings and i18n; the shared `volley` in volley.
// Layout and paint still need real-browser verification.
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
import { createAttackDefinition, lastShotAt } from '../../../js/game/combat/attacks.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0012/';
const DEF = getCharacter('0012');
const DEF_0001 = getCharacter('0001');
const DEF_0007 = getCharacter('0007');
const DEF_0009 = getCharacter('0009');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0012_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0012 on its own, and against #0009 (or `target`) at `gap`.
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
const after = (d, seconds, held = {}, targetHeld = {}) => {
  for (let i = 0; i < steps(seconds); i++) d.tick(held, targetHeld);
};
// A projectile of #0007's (its Pistol's shot) flying at `target` from
// `dx` behind or ahead of it, at its chest.
function shotAt(d, shooter, target, dx, direction) {
  const def = shooter.projectileDefs.extra_attack_object;
  const b = target.body;
  d.projectiles.push(new Projectile({ owner: shooter, def, anim: shooter.sprites.projectile(def.animation), x: b.x + dx, y: b.y - 50, direction }));
}

const { images: IMAGES, sprites: REAL } = realArt(DEF);

// Every clip and the files it plays, in order (a file shown twice is one
// file on disk).
const CLIPS = {
  idle: named('idle', 10),
  run: named('run', 10),
  jump: named('jump', 3),
  fall: named('fall', 2),
  land: named('land', 1),
  mouvment: named('mouvment', 7),
  midair_mouvment: named('midair_mouvment', 2),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 2),
  shielding: named('shielding', 1),
  deflect: named('deflect', 6),
  attack1: named('attack1', 10),
  midair_attack1: named('midair_attack1', 13),
  attack2: named('attack2', 9),
  midair_attack2: named('midair_attack2', 7),
  attack3: named('attack3', [1, 2, 3, 4, 3, 2, 3, 4, 1]),
  midair_attack3: named('midair_attack3', 8),
  attack4: named('attack4', 11),
  midair_attack4: named('midair_attack4', 7),
  attack5_cast: named('attack5', 5),
  attack5_release: named('attack5', range(8, 6)),
  extra_attack: named('extra_attack', 8),
};
const PROJECTILES = { extra_attack_object: named('extra_attack_object', 4) };
const EFFECTS = { attack5_object: named('attack5_object', 11) };
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(PROJECTILES), ...Object.values(EFFECTS)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 57, run: 50, jump: 56, fall: 53, land: 32, mouvment: 60, midair_mouvment: 55, hurt: 59, midair_hurt: 64,
  shielding: 48, deflect: 68, attack1: 91, midair_attack1: 69, attack2: 63, midair_attack2: 83, attack3: 52,
  midair_attack3: 101, attack4: 66, midair_attack4: 102, attack5_cast: 58, attack5_release: 68, extra_attack: 48,
};

// ---- Registration -------------------------------------------------------------------

test('#0012 is a real CHARACTERS entry: available, in roster slot 12, after #0001 to #0011', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0012'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0012');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 11);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('five numbered attacks, each a button of its own: four ordinary with mid-air versions and a technique; plus Shuriken, on the ground and in the air', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { ground: 'attack3', air: 'midair_attack3' },
    attack4: { ground: 'attack4', air: 'midair_attack4' },
    attack5: { type: 'technique', id: 'attack5' },
  });
  assert.deepEqual(Object.keys(DEF.attacks).sort(), [
    'attack1', 'attack2', 'attack3', 'attack4', 'extra_attack',
    'midair_attack1', 'midair_attack2', 'midair_attack3', 'midair_attack4',
  ]);
  assert.deepEqual(Object.keys(DEF.techniques), ['attack5']);
  assert.equal(DEF.summons, undefined, 'it summons nobody');
  assert.deepEqual(Object.keys(DEF.projectiles), ['extra_attack_object'], 'nothing thrown but its shuriken');
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack?.def.id, 'extra_attack', 'Shuriken in the air');
});

test('only Shuriken costs Energy (15 a throw, its three shots one use) and only Dragonblade waits: the policy\'s 5 s for its 10', () => {
  const { fighter } = solo();
  for (const a of Object.values(fighter.attacks)) {
    assert.equal(a.energyCost, a.id === 'extra_attack' ? 15 : 0, `${a.id}: its Energy`);
    assert.equal(a.cooldown, 0, `${a.id}: no cooldown`);
  }
  assert.equal(fighter.attacks.extra_attack.cooldownClass, 'ordinary', 'three shuriken of 1: ordinary');
  const t = fighter.techniqueDefs.attack5;
  assert.deepEqual([t.energyCost, t.cooldown, t.cooldownClass], [0, 5, 'tenDamage']);
  assert.equal(t.offense.attack, true);
});

test('one Special: Dragonblade; Shuriken, the Deflect Stance and Swift Strike are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack5']);
  assert.equal(isSpecialAbility(DEF, 'attack5'), true);
  for (const move of [
    'attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'midair_attack4', 'extra_attack',
  ]) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its Mash Combo: Twin Cuts and the Cleave, its two close-range cuts; Shuriken, the Deflect Stance and Swift Strike are no partner', () => {
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'attack2'] });
  assert.deepEqual(mashComboProblems(DEF), []);
  assert.equal(DEF.attacks.mash_attack, undefined, 'no button-less partner: both are on its buttons');
  for (const id of ['attack3', 'attack4', 'extra_attack']) {
    assert.notDeepEqual(mashComboProblems({ ...DEF, mashCombo: { attacks: ['attack1', id] } }), [], `${id} could not be its partner`);
  }
  const { fighter, step } = solo();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    step(P('attack1'));
    for (let k = 0; k < 4; k++) seen.push(step({}).combat.attack?.def.id);
  }
  for (let i = 0; i < steps(6); i++) seen.push(step({}).combat.attack?.def.id);
  assert.ok(seen.includes('attack2'), 'the Cleave is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = [
    'attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'midair_attack4', 'attack5', 'extra_attack',
  ];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Twin Cuts', 'Whirlwind Cut', 'Cleave', 'Rising Arc', 'Deflect Stance', 'Falling Cut', 'Swift Strike', 'Rising Strike', 'Dragonblade', 'Shuriken',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Shuriken', 'Twin Cuts', 'Cleave', 'Deflect Stance', 'Swift Strike', 'Dragonblade']);
  assert.deepEqual(buttons('fr'), ['Shuriken', 'Double entaille', 'Coup fendant', 'Posture de renvoi', 'Frappe rapide', 'Lame du dragon']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3', 'midair_attack4'].map((m) => STRINGS.fr[`ability.0012.${m}`]),
    ['Entaille tourbillon', 'Arc ascendant', 'Entaille plongeante', 'Frappe ascendante']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => art(a)), [
    '0012_extra_attack_object_1.png', '0012_attack1_4.png', '0012_attack2_6.png', '0012_attack3_3.png', '0012_attack4_5.png',
    '0012_attack5_7.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack3', 'attack4'].map((a) => art(a, true)),
    ['0012_midair_attack1_1.png', '0012_midair_attack2_4.png', '0012_midair_attack3_5.png', '0012_midair_attack4_3.png']);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0012.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: its cuts on Square and Triangle, the Deflect Stance on Circle, Shuriken on R2 both ways, Dragonblade on L2, Swift Strike forward and the Rising Strike up on the right stick', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:attack3': pad('east'),
    'ground:attack4': flick('forward'),
    'ground:attack5': pad('l2'),
    'ground:extra_attack': pad('r2'),
    'air:attack1': pad('west'),
    'air:attack2': pad('north'),
    'air:attack3': pad('east'),
    'air:attack4': flick('up'),
    'air:extra_attack': pad('r2'),
  });
  assert.equal(DEF.attacks.midair_attack4.motion.type, 'rise', 'the stick up only for a move that rises');
  assert.equal(DEF.attacks.midair_attack3.motion, undefined, 'the Falling Cut plunges nowhere: never the stick down');
  assert.equal(DEF.controller.previous, undefined, 'new: no layout of before');
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips, projectile and effect play: every file named <id>_<codename>_<frame>.png, none a copy', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 151);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  for (const [key, want] of Object.entries(PROJECTILES)) assert.deepEqual(DEF.projectileAnimations[key].frames.map(file), want, key);
  for (const [key, want] of Object.entries(EFFECTS)) assert.deepEqual(DEF.effectAnimations[key].frames.map(file), want, key);
  // A drawing the sheet repeats (in the same row, or in another: its
  // Dragonblade borrows the Deflect Stance's guard and Swift Strike's dash)
  // is one file, played again, never a copy: no two files anywhere in the
  // folder are the same picture.
  const seen = new Map();
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const key = `${w}x${h}:${Buffer.from(pixels).toString('base64')}`;
    assert.equal(seen.get(key), undefined, `${name} is a copy of ${seen.get(key)}`);
    seen.set(key, name);
  }
});

test('every frame is cut clean: none of the sheet\'s teal background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 30 && g === 159 && b === 157), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 57);
  assert.ok(near(REAL.worldPerArt, 88 / 52), 'the same world size per art pixel as the rest of the roster');
  assert.ok(near(DEF.visual.height, 57 * 88 / 52), 'about 96 units tall');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(near(anim.maxArtH, HEIGHTS[key]), `${key}: tallest frame ${anim.maxArtH}`);
    assert.ok(near(anim.heightRatio, HEIGHTS[key] / 57), `${key}: its heightRatio`);
    for (const f of anim.frames) {
      assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
      assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth), `${key}: its width`);
      assert.ok(near(f.artH, IMAGES.get(f.url).naturalHeight), `${key}: its height`);
    }
  }
  // Its shuriken and its dragon are drawn at the same art-pixel size,
  // centred where they are.
  for (const anim of [...Object.values(REAL.projectiles), ...Object.values(REAL.effects)]) {
    for (const f of anim.frames) assert.ok(near(f.unit, 1) && near(f.anchorArtX, f.artW / 2) && near(f.anchorArtY, f.artH / 2), anim.key);
  }
  assert.deepEqual(Object.keys(REAL.projectiles), ['extra_attack_object']);
  assert.equal(REAL.projectiles.extra_attack_object.loop, true, 'its shuriken spin for as long as they fly');
  assert.deepEqual(Object.keys(REAL.effects), ['attack5_object']);
  assert.equal(REAL.effects.attack5_object.sourceFacing, 1, 'the dragon turns with the cut');
});

test('anchors keep the body in place: authored on its body wherever its blade, a whirl or a trail reach, and on its feet where the art reaches below them', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  const ay = (key) => REAL.animations[key].frames.map((f) => f.anchorArtY);
  const auto = (key) => withFakeCanvas(() => REAL.animations[key].frames.map((f) => f.anchorX));
  // Swift Strike's trail: on its body, a blur at the trail's head.
  assert.deepEqual(ax('attack4').slice(3, 9), [117, 43, 44, 48, 198, 159]);
  assert.ok(Math.abs(auto('attack4')[7] - 198) > 40, 'the trail would pull the automatic anchor far behind it');
  // The Whirlwind Cut's ball, wherever its sweep is: the sweep would drag
  // the automatic anchor round with it.
  assert.ok(Math.abs(auto('midair_attack1')[7] - ax('midair_attack1')[7]) > 25);
  // Twin Cuts' sweep out ahead would pull it forward off the body.
  assert.ok(auto('attack1')[7] - ax('attack1')[7] > 30);
  // Its standing pose between its planted feet; its run on its head.
  assert.deepEqual(ax('run'), Array(10).fill(30));
  // The Whirlwind Cut's ball stays where it is as its sweep goes round.
  assert.deepEqual(ay('midair_attack1').slice(2, 7), [35, 29, 30, 36, 38]);
  // A cut swept under its feet never lifts it off the ground.
  assert.equal(ay('attack1')[6], 43);
  assert.ok(ay('attack1')[6] < REAL.animations.attack1.frames[6].artH - 20);
  for (const key of ['idle', 'run', 'jump', 'fall', 'land', 'shielding', 'attack4', 'midair_attack4', 'extra_attack']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its helmeted head', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(57 * DEF.visual.portrait.size), 'from its first stand frame, 57 pixels tall');
});

// ---- Its cuts ------------------------------------------------------------------------

test('Twin Cuts: a chop that holds the target, then a rising cut that knocks it back (1, 3 at Base Launch 1)', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack1'));
  after(d, 0.6);
  const hits = mine(d, 'attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 3]]);
  assert.equal(hits[0].launchSpeed, 0, 'held for the rising cut');
  assert.deepEqual([hits[1].baseLaunch, hits[1].directionalLaunch], [1, 'horizontal']);
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.5), 'its chop at 0.1 s, half a second in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const far = versus({ gap: 130 });
  far.tick(P('attack1'));
  after(far, 0.6);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of its blade\'s reach, nothing');
});

test('the Cleave: a two-handed cut over its head and down that knocks the target away (3 at Base Launch 2)', () => {
  const d = versus({ gap: 46 });
  d.tick(P('attack2'));
  after(d, 0.5);
  assert.deepEqual(mine(d, 'attack2').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 2, 'horizontal']]);
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  assert.ok(near(atk.startup, 0.2) && near(atk.total, 0.45));
});

test('the Whirlwind Cut: its blade sweeps a ring round it in the air, ahead (1), behind (1) and over it (3 at Base Launch 2)', () => {
  const ahead = versus({ gap: 44 });
  hold(ahead.attacker, 40);
  hold(ahead.target, 40);
  ahead.tick(P('attack1'));
  after(ahead, 0.5);
  const hits = mine(ahead, 'midair_attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 3]], 'ahead: the front sweep, then the one over it');
  assert.deepEqual([hits[1].baseLaunch, hits[1].directionalLaunch], [2, 'horizontal']);
  const behind = versus({ gap: -50, attackerFacing: 1, targetFacing: 1 });
  behind.attacker.facing = 1;
  hold(behind.attacker, 40);
  hold(behind.target, 40);
  behind.tick(P('attack1'));
  after(behind, 0.5);
  assert.equal(mine(behind, 'midair_attack1')[0]?.damage, 1, 'behind it: the sweep under and behind');
});

test('the Rising Arc: a cut swept up from under it, launching straight up (3 at Base Launch 2)', () => {
  const d = versus({ gap: 50 });
  hold(d.attacker, 40);
  hold(d.target, 40);
  d.tick(P('attack2'));
  after(d, 0.4);
  assert.deepEqual(mine(d, 'midair_attack2').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 2, 'vertical']]);
});

test('the Falling Cut: a cut brought down from over its head, spiking straight down (3 at Base Launch 2); it never plunges', () => {
  const d = versus({ gap: 50 });
  hold(d.attacker, 80);
  hold(d.target, 50);
  const y = d.attacker.body.y;
  d.tick(P('attack3'));
  after(d, 0.4);
  assert.deepEqual(mine(d, 'midair_attack3').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 2, 'reverseVertical']]);
  assert.ok(d.target.body.vy > 0 || d.target.body.grounded, 'sent down');
  assert.equal(d.attacker.body.y, y, 'held where it was: no motion of its own');
});

// ---- Shuriken -------------------------------------------------------------------------

test('Shuriken: three thrown one after another, a fifteenth of a second apart, each 1 with no launch; 15 Energy for the three', () => {
  const atk = createAttackDefinition({ id: 'extra_attack', ...DEF.attacks.extra_attack }, { projectiles: DEF.projectiles });
  assert.deepEqual(atk.projectile.volley, { count: 3, interval: 1 / 15 });
  assert.ok(near(lastShotAt(atk), 4 / 15) && near(atk.total, 8 / 15));
  const d = versus({ gap: 300 });
  d.tick(P('extra_attack'));
  assert.equal(d.attacker.combat.energy, 85, 'one 15 as the throw starts');
  let most = 0;
  for (let i = 0; i < steps(0.6); i++) {
    d.tick();
    most = Math.max(most, d.projectiles.length);
  }
  assert.equal(most, 3, 'three shuriken in the air at once');
  const hits = mine(d, 'extra_attack');
  assert.deepEqual(hits.map((e) => [e.type, e.source, e.damage, e.launchSpeed]), [
    ['hit', 'projectile', 1, 0], ['hit', 'projectile', 1, 0], ['hit', 'projectile', 1, 0],
  ]);
  assert.equal(d.target.combat.launchPoint, 3);
  assert.ok(d.attacker.combat.energy > 85, 'nothing more paid for the second and third');
  // Out of their reach (about 470 units), nothing.
  const far = versus({ gap: 600 });
  far.tick(P('extra_attack'));
  after(far, 1);
  assert.deepEqual(mine(far, 'extra_attack'), []);
});

test('Shuriken in the air too; a raised Shield that blocks one stops the rest: one block, never three', () => {
  const air = versus({ gap: 260 });
  hold(air.attacker, 40);
  hold(air.target, 40);
  air.tick(P('extra_attack'));
  assert.equal(air.attacker.combat.attack?.def.id, 'extra_attack', 'thrown in the air');
  after(air, 0.7);
  assert.equal(mine(air, 'extra_attack').length, 3, 'all three find a target at its height');
  const d = versus({ gap: 200 });
  d.tick({}, P('shield'));
  after(d, 0.3, {}, { shield: true });
  d.tick(P('extra_attack'), { shield: true });
  after(d, 0.8, {}, { shield: true });
  assert.deepEqual(mine(d, 'extra_attack').map((e) => e.type), ['block']);
  assert.equal(d.projectiles.length, 0, 'the rest gone');
});

// ---- The Deflect Stance and the Deflect --------------------------------------------------

test('the Deflect Stance: its blade held out on the ground turns a shot back at its thrower', () => {
  const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 400, targetFacing: -1 });
  d.tick({}, P('attack3'));
  assert.equal(d.target.combat.attack?.def.id, 'attack3');
  after(d, 0.1);
  shotAt(d, d.attacker, d.target, -60, 1);
  after(d, 0.3);
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0012');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.events.some((e) => e.redirected), 'turned back');
  const atk = createAttackDefinition({ id: 'attack3', ...DEF.attacks.attack3 });
  assert.ok(near(atk.total, 0.75) && near(atk.active, 7 / 12), 'three quarters of a second, live for seven twelfths');
  assert.equal(atk.offense.defense, true, 'a defense as well as an attack');
  assert.equal(atk.freeCancel, true, 'so it gives way to any valid request');
  assert.equal(atk.stepIn, 'exempt', 'it never steps in');
});

test('the Deflect Stance gives way to any move; a fighter who walks into it takes a flick of the blade (1, no launch)', () => {
  const { fighter, step } = solo();
  step(P('attack3'));
  for (let i = 0; i < 6; i++) step({});
  step(P('attack1'));
  assert.equal(fighter.combat.attack?.def.id, 'attack1', 'cut short for Twin Cuts');
  const d = versus({ gap: 40 });
  d.tick(P('attack3'));
  after(d, 0.8);
  assert.deepEqual(mine(d, 'attack3').map((e) => [e.type, e.damage, e.launchSpeed]), [['hit', 1, 0]]);
});

test('its Deflect: its blade spun in a whirl of orange cuts, in the air, that turns projectiles back', () => {
  assert.equal(DEF.deflect.deflectProjectiles, true);
  const { fighter, step } = solo();
  airborne(step);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
  const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 400 });
  hold(d.target, 60);
  d.tick({}, P('shield'));
  shotAt(d, d.attacker, d.target, -90, 1);
  after(d, 0.3);
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0012');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.events.some((e) => e.redirected), 'turned back');
});

// ---- Swift Strike -----------------------------------------------------------------------

test('Swift Strike: a dash of about 210 units that cuts through its target and leaves it behind (3 at Base Launch 1)', () => {
  const d = versus({ gap: 90 });
  const x = d.attacker.body.x;
  d.tick(P('attack4'));
  after(d, 0.7);
  const hits = mine(d, 'attack4');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 1, 'horizontal']]);
  const travelled = d.attacker.body.x - x;
  assert.ok(travelled > 180 && travelled < 260, `it dashes (${Math.round(travelled)} units)`);
  assert.ok(d.attacker.body.x > d.target.body.x - 10 || hits.length, 'through its target');
  const atk = createAttackDefinition({ id: 'attack4', ...DEF.attacks.attack4 });
  assert.deepEqual([atk.passThrough, atk.motion.type, atk.stepIn], [true, 'roll', 'exempt']);
  // Alone, it passes the spot its target would stand on.
  const lone = solo({ x: 300 });
  lone.step(P('attack4'));
  for (let i = 0; i < steps(0.7); i++) lone.step({});
  assert.ok(lone.fighter.body.x - 300 > 180);
});

test('Swift Strike: a raised Shield stops it dead and throws it back', () => {
  const d = versus({ gap: 120 });
  d.tick({}, P('shield'));
  after(d, 0.2, {}, { shield: true });
  d.tick(P('attack4'), { shield: true });
  after(d, 0.6, {}, { shield: true });
  assert.deepEqual(mine(d, 'attack4').map((e) => e.type), ['block']);
  assert.ok(d.attacker.body.x < d.target.body.x, 'never through a Shield');
});

test('the Rising Strike: it dashes straight up through its target (3 at Base Launch 2 straight up), once per airtime', () => {
  const d = versus({ gap: 20 });
  hold(d.attacker, 30);
  d.attacker.body.gravityScale = 1;
  hold(d.target, 90);
  const y = d.attacker.body.y;
  d.tick(P('attack4'));
  let top = y;
  for (let i = 0; i < steps(0.5); i++) {
    d.tick();
    top = Math.min(top, d.attacker.body.y);
  }
  assert.ok(y - top > 140, `it rises (${Math.round(y - top)} units)`);
  assert.deepEqual(mine(d, 'midair_attack4').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 2, 'vertical']]);
  const { fighter, step } = solo();
  airborne(step, 4);
  step(P('attack4'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack4');
  while (fighter.combat.attack) step({});
  step(P('attack4'));
  assert.equal(fighter.combat.attack, null, 'used up for this airtime');
});

// ---- Dragonblade --------------------------------------------------------------------------

test('Dragonblade: half a second into its stance, then its cleave and the dragon spirit: 10 at Base Launch 3 on either side; every 5 s', () => {
  const t = DEF.techniques.attack5;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.5) && near(SPRITES.duration(t.releaseAnimation), 8 / 15));
  for (const gap of [90, -50]) {
    const d = versus({ gap, targetFacing: gap > 0 ? -1 : 1 });
    d.attacker.facing = 1;
    d.tick(P('attack5'));
    assert.equal(activeSpecialAbility(d.attacker), 'attack5', 'under the Special mark');
    after(d, 0.45);
    assert.deepEqual(mine(d, 'attack5'), [], 'nothing yet: still drawing its blade');
    after(d, 0.2);
    const hits = mine(d, 'attack5');
    assert.deepEqual(hits.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 10, 3, 'horizontal']], `gap ${gap}`);
    assert.ok(d.attacker.combat.abilityCooldowns.active('attack5'), 'its 5 s from the release');
    assert.equal(d.attacker.combat.energy, 100, 'no Energy');
  }
  // Out of its reach, nothing.
  const far = versus({ gap: 220 });
  far.tick(P('attack5'));
  after(far, 0.8);
  assert.deepEqual(mine(far, 'attack5'), []);
  // A raised Shield blocks it.
  const guarded = versus({ gap: 80 });
  guarded.tick(P('attack5'), P('shield'));
  after(guarded, 0.8, {}, { shield: true });
  assert.deepEqual(mine(guarded, 'attack5').map((e) => e.type), ['block']);
});

test('Dragonblade lets its dragon spirit go as it cleaves: the effect handed to its fighter, centred over it', () => {
  const d = versus({ gap: 300 });
  d.tick(P('attack5'));
  let effect = null;
  for (let i = 0; i < steps(0.7) && !effect; i++) {
    d.tick();
    effect = d.attacker.technique?.takeEffect?.() ?? d.attacker.effects?.find?.((e) => e.animation === 'attack5_object') ?? null;
  }
  assert.ok(effect, 'its dragon');
  assert.equal(effect.animation, 'attack5_object');
});

test('Dragonblade is broken by a hit before it lets go: no cleave, no cooldown', () => {
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  d.tick({}, P('attack5'));
  assert.ok(d.target.technique, 'casting');
  d.tick(P('attack1'));
  after(d, 0.6);
  assert.equal(d.target.technique, null, 'broken');
  assert.equal(d.target.combat.abilityCooldowns.active('attack5'), false, 'nothing released, no cooldown');
  assert.deepEqual(d.events.filter((e) => e.attacker === d.target), []);
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays its whole kit: its cuts, its shuriken, its stance, its dashes and Dragonblade', () => {
  const used = new Map();
  for (const difficulty of ['medium', 'brutal']) {
    for (const seed of [1, 2]) {
      for (const foe of [DEF_0001, DEF_0007, DEF_0009]) {
        const { log } = cpuFight(DEF, foe, { seconds: 30, seed, difficulty });
        const me = [...log.keys()].find((f) => f.def === DEF && f.slot === 'p1');
        for (const [k, v] of me.controller.telemetry.moveUsage) used.set(k, (used.get(k) ?? 0) + v);
      }
    }
  }
  for (const move of [
    'attack1:ground', 'attack1:air', 'attack2:ground', 'attack2:air', 'attack3:ground', 'attack3:air', 'attack4:ground',
    'attack4:air', 'attack5:ground', 'extra_attack:ground', 'extra_attack:air',
  ]) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0012, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names, its game and its family's are put together here so this file
// never spells them.
const UNNAMED = new RegExp([
  ['g', 'e', 'n', 'j', 'i'].join(''),
  ['o', 'v', 'e', 'r', '[- ]?', 'w', 'a', 't', 'c', 'h'].join(''),
  ['s', 'h', 'i', 'm', 'a', 'd', 'a'].join(''),
  ['h', 'a', 'n', 'z', 'o'].join(''),
  ['h', 'a', 'n', 'a', 'm', 'u', 'r', 'a'].join(''),
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

test('the character behind #0012 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0012.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
});
