// Run with node --test tests/fighters/0014/fighter-0014.test.mjs (no dependencies).
// #0014, the long-haired martial artist: registered from CHARACTERS alone
// in roster slot 14, its clips cut from one sprite sheet into its own
// folder and read from the real PNGs (tight, 1x, one art-pixel scale,
// anchored on its body, a drawing a row repeats cut once), five numbered
// buttons (three ordinary attacks with their mid-air versions and two
// techniques) and an extra attack on the ground only. Beat Rush and the
// Whirling Uppercut up close (its Mash Combo), Meteodrive and Meteor
// Strike (grabs: a suplex into the floor, a leap carrying its target up to
// hurl it down), the Air Combo, the Divekick and the Somersault in the air,
// its Deflect, Waterkick (a wave along the ground) and the Sunburst Fist, its
// Limit Break, open only once its Limit gauge is full. The shared `limit`
// and `grab` are checked in limit and grab; the roster, credits and
// translations it adds in empty-roster, settings and i18n. Layout and paint
// still need real-browser verification.
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
import { abilityGroups, abilityStatus, activeSpecialAbility, moveRestriction } from '../../../js/game/combat/move-status.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0014/';
const DEF = getCharacter('0014');
const DEF_0001 = getCharacter('0001');
const DEF_0007 = getCharacter('0007');
const DEF_0009 = getCharacter('0009');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0014_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0014 on its own, and against #0009 (or `target`) at `gap`.
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
// Runs `d` until #0014's attack is over, at most `limit` seconds; the
// seconds it took.
function finish(d, held = {}, targetHeld = {}, limit = 2) {
  let n = 0;
  while (d.attacker.combat.attack && n < steps(limit)) {
    d.tick(held, targetHeld);
    n++;
  }
  return n / 60;
}
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
  idle: named('idle', [1, 2, 3, 2, 1, 4]),
  run: named('run', 8),
  jump: named('jump', 3),
  fall: named('fall', 2),
  land: named('land', 1),
  mouvment: named('mouvment', 1),
  midair_mouvment: named('midair_mouvment', 1),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 2),
  prepshield: named('prepshield', 1),
  shielding: named('shielding', 1),
  deflect: named('deflect', [1, 2, 3, 3]),
  attack1: named('attack1', [1, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  midair_attack1: named('midair_attack1', [1, 2, 3, 4, 5, 6, 6]),
  attack2: named('attack2', [1, 1, 2, 3, 4, 5, 6, 7, 8]),
  midair_attack2: named('midair_attack2', 5),
  attack3: named('attack3', [1, 1, 2, 3, 4, 5, 6]),
  midair_attack3: named('midair_attack3', 6),
  extra_attack: named('extra_attack', [1, 1, 2, 3, 4, 5]),
  attack4_cast: named('attack4', [1, 2]),
  attack4_release: named('attack4', [3, 4]),
  attack5_cast: named('attack5', 13),
  attack5_release: named('attack5', [14, 15, 16]),
};
const PROJECTILES = { attack4_object: named('attack4_object', 3) };
const EFFECTS = { attack5_object: named('attack5_object', 4) };
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(PROJECTILES), ...Object.values(EFFECTS)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 50, run: 47, jump: 56, fall: 76, land: 47, mouvment: 47, midair_mouvment: 47, hurt: 47, midair_hurt: 49,
  prepshield: 49, shielding: 49, deflect: 57, attack1: 49, midair_attack1: 56, attack2: 56, midair_attack2: 52,
  attack3: 58, midair_attack3: 51, extra_attack: 52, attack4_cast: 39, attack4_release: 41, attack5_cast: 60,
  attack5_release: 47,
};

// ---- Registration -------------------------------------------------------------------

test('#0014 is a real CHARACTERS entry: available, in roster slot 14, after #0001 to #0013', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0014'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0014');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 13);
  assert.deepEqual(playableCharacters().map((c) => c.id), [
    '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014',
  ]);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('five numbered attacks, each a button of its own: three ordinary with mid-air versions and two techniques; plus the Whirling Uppercut, on the ground only', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { ground: 'attack3', air: 'midair_attack3' },
    attack4: { type: 'technique', id: 'attack4' },
    attack5: { type: 'technique', id: 'attack5' },
  });
  assert.deepEqual(Object.keys(DEF.attacks).sort(), [
    'attack1', 'attack2', 'attack3', 'extra_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3',
  ]);
  assert.equal(DEF.attacks.extra_attack.groundOnly, true, 'the Whirling Uppercut on the ground only');
  assert.deepEqual(Object.keys(DEF.techniques), ['attack4', 'attack5']);
  assert.equal(DEF.summons, undefined, 'it summons nobody');
  assert.deepEqual(Object.keys(DEF.projectiles), ['attack4_object'], 'nothing let go but its wave');
  assert.deepEqual(Object.keys(DEF.effectAnimations), ['attack5_object'], 'and Sunburst Fist\'s explosion');
  for (const t of Object.values(DEF.techniques)) {
    assert.equal(t.heal, undefined, 'it heals nobody');
    assert.equal(t.cloak, undefined, 'it hides from nobody');
  }
  for (const a of Object.values(DEF.attacks)) assert.notEqual(a.motion?.type, 'homing', 'it never homes in');
  // In the air its Triangle / Y does nothing: the Whirling Uppercut is a
  // ground move and nothing takes its place.
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null, 'nothing in the air');
});

test('only Waterkick costs Energy (its wave, 15) and only Sunburst Fist waits: the policy\'s 5 s for its 10', () => {
  const { fighter } = solo();
  for (const a of Object.values(fighter.attacks)) {
    assert.equal(a.energyCost, 0, `${a.id}: no Energy`);
    assert.equal(a.cooldown, 0, `${a.id}: no cooldown, a grab and a carry are ordinary`);
  }
  const wave = fighter.techniqueDefs.attack4;
  assert.deepEqual([wave.energyCost, wave.cooldown, wave.cooldownClass], [15, 0, 'ordinary']);
  const heaven = fighter.techniqueDefs.attack5;
  assert.deepEqual([heaven.energyCost, heaven.cooldown, heaven.cooldownClass], [0, 5, 'tenDamage']);
  assert.equal(heaven.limit, 40, 'its Limit: 40 Launch Points taken');
  assert.equal(wave.limit, 0, 'Waterkick needs none');
  assert.equal(wave.offense.attack && heaven.offense.attack, true);
});

test('one Special: Sunburst Fist, its Limit Break; its rushes, throws, leap and wave are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack5']);
  assert.equal(isSpecialAbility(DEF, 'attack5'), true);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its Mash Combo: Beat Rush and the Whirling Uppercut, its two close-range strikes; its throws are no partner', () => {
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
  assert.ok(seen.includes('extra_attack'), 'the Whirling Uppercut is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'extra_attack', 'attack4', 'attack5'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Beat Rush', 'Air Combo', 'Meteodrive', 'Divekick', 'Meteor Strike', 'Somersault', 'Whirling Uppercut', 'Waterkick', 'Sunburst Fist',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['attack1', 'attack2', 'attack3', 'extra_attack', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Beat Rush', 'Meteodrive', 'Meteor Strike', 'Whirling Uppercut', 'Waterkick', 'Sunburst Fist']);
  assert.deepEqual(buttons('fr'), ['Rafale de coups', 'Suplex météore', 'Frappe météore', 'Uppercut tournoyant', 'Coup de pied aquatique', 'Poing solaire']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3'].map((m) => STRINGS.fr[`ability.0014.${m}`]),
    ['Combo aérien', 'Coup de pied plongeant', 'Salto']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['attack1', 'attack2', 'attack3', 'extra_attack', 'attack5'].map((a) => art(a)), [
    '0014_attack1_5.png', '0014_attack2_4.png', '0014_attack3_5.png', '0014_extra_attack_3.png', '0014_attack5_10.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack3'].map((a) => art(a, true)), [
    '0014_midair_attack1_5.png', '0014_midair_attack2_4.png', '0014_midair_attack3_3.png',
  ]);
  assert.equal(mobileAbility(DEF, 'attack4').sprite.url.split('/').pop(), '0014_attack4_object_1.png', 'Waterkick shows its wave');
  for (const a of ['attack1', 'attack2', 'attack3', 'extra_attack', 'attack4', 'attack5']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0014.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: its rush on Square, the uppercut on Triangle, the suplex on Circle, the leaps on the right stick up, the dive on the right stick down, the wave on R2, Sunburst Fist on L2', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:extra_attack': pad('north'),
    'ground:attack2': pad('east'),
    'ground:attack3': flick('up'),
    'ground:attack4': pad('r2'),
    'ground:attack5': pad('l2'),
    'air:attack1': pad('west'),
    'air:attack2': flick('down'),
    'air:attack3': flick('up'),
  });
  assert.equal(DEF.attacks.midair_attack2.motion.type, 'slam', 'the stick down for the move that plunges');
  assert.equal(DEF.attacks.attack3.motion.type, 'rise', 'the stick up for the moves that rise');
  assert.equal(DEF.attacks.midair_attack3.motion.type, 'rise');
  assert.equal(DEF.controller.previous, undefined, 'new: no layout of before');
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips, its wave and its explosion play: every file named <id>_<codename>_<frame>.png', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 101);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  for (const [key, want] of Object.entries(PROJECTILES)) assert.deepEqual(DEF.projectileAnimations[key].frames.map(file), want, key);
  for (const [key, want] of Object.entries(EFFECTS)) assert.deepEqual(DEF.effectAnimations[key].frames.map(file), want, key);
  // A drawing a row repeats (its stance) is one file, played again. The same drawing in two rows is each row's own (every
  // clip plays its own codename's files): the two throws reach and seize
  // alike, Beat Rush's guard is the Sunburst Fist's drawing back, and the jump's
  // takeoff, the landing and the end of Meteodrive are one crouch.
  const ACROSS = [
    ['0014_attack2_1.png', '0014_attack3_1.png'], ['0014_attack2_2.png', '0014_attack3_2.png'],
    ['0014_attack1_3.png', '0014_attack5_12.png'], ['0014_attack2_8.png', '0014_jump_1.png'], ['0014_attack2_8.png', '0014_land_1.png'],
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
      assert.ok(!(a && r === 21 && g === 108 && b === 56), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 50);
  assert.ok(near(REAL.worldPerArt, 88 / 52), 'the same world size per art pixel as the rest of the roster');
  assert.ok(near(DEF.visual.height, 50 * 88 / 52), 'about 85 units tall');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(near(anim.maxArtH, HEIGHTS[key]), `${key}: tallest frame ${anim.maxArtH}`);
    assert.ok(near(anim.heightRatio, HEIGHTS[key] / 50), `${key}: its heightRatio`);
    for (const f of anim.frames) {
      assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
      assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth), `${key}: its width`);
      assert.ok(near(f.artH, IMAGES.get(f.url).naturalHeight), `${key}: its height`);
    }
  }
  // Its wave and its explosion are drawn at the same art-pixel size, centred
  // where they are; the wave turned with the way it runs, curling for as
  // long as it runs, the explosion played once.
  for (const f of [...REAL.projectiles.attack4_object.frames, ...REAL.effects.attack5_object.frames]) {
    assert.ok(near(f.unit, 1) && near(f.anchorArtX, f.artW / 2) && near(f.anchorArtY, f.artH / 2));
  }
  assert.deepEqual(Object.keys(REAL.projectiles), ['attack4_object']);
  assert.deepEqual(Object.keys(REAL.effects), ['attack5_object']);
  assert.equal(REAL.projectiles.attack4_object.sourceFacing, 1, 'the wave turns with its run');
  assert.equal(REAL.projectiles.attack4_object.loop, true);
  assert.equal(REAL.effects.attack5_object.loop, false);
});

test('anchors keep the body in place: between its feet where both are planted, on its white top elsewhere', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  const auto = (key) => withFakeCanvas(() => REAL.animations[key].frames.map((f) => f.anchorX));
  // Its long hair streams out behind it and would pull the automatic anchor
  // back off its body: as it runs, Dashes, jumps and falls.
  for (const key of ['run', 'mouvment', 'midair_mouvment', 'jump', 'fall']) {
    assert.ok(ax(key).every((a, i) => a - auto(key)[i] > 3), `${key}: on its body, ahead of its hair`);
  }
  // Its stance between its planted feet.
  assert.deepEqual(ax('idle'), [19.5, 21.5, 18, 21.5, 19.5, 24]);
  for (const [key, clip] of Object.entries(REAL.animations)) {
    for (const f of clip.frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its head', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(49 * DEF.visual.portrait.size), 'from its first stance frame, 49 pixels tall');
});

// ---- Its rushes ------------------------------------------------------------------------

test('Beat Rush: a jab and a blurred fist (1, 1), then the straight from the shoulder (a heavy 5 at Base Launch 1)', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack1'));
  after(d, 0.6);
  const hits = mine(d, 'attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [
    ['hit', 1, 0, null], ['hit', 1, 0, null], ['hit', 5, 1, 'horizontal'],
  ]);
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.5), 'its jab at 0.1 s, half a second in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const far = versus({ gap: 130 });
  far.tick(P('attack1'));
  after(far, 0.6);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of its fists\' reach, nothing');
});

test('the Air Combo: two punches in the air (1, then 3 at Base Launch 2 sideways)', () => {
  const d = versus({ gap: 44 });
  hold(d.attacker, 40);
  hold(d.target, 40);
  d.tick(P('attack1'));
  after(d, 0.4);
  const hits = mine(d, 'midair_attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 1, 0, null], ['hit', 3, 2, 'horizontal']]);
});

test('the Whirling Uppercut: whirled down low, a fist driven up (1), then the uppercut launching straight up (3 at Base Launch 2)', () => {
  const d = versus({ gap: 40 });
  d.tick(P('extra_attack'));
  after(d, 0.5);
  const hits = mine(d, 'extra_attack');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [
    ['hit', 1, 0, null], ['hit', 3, 2, 'vertical'],
  ]);
  const atk = createAttackDefinition({ id: 'extra_attack', ...DEF.attacks.extra_attack });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.3), 'three tenths of a second');
  assert.equal(atk.stepIn, 'universal');
});

// ---- Its throws -----------------------------------------------------------------------

test('Meteodrive: it seizes (1) and suplexes its target into the floor (5 at Base Launch 3 straight down); hurt enough, the target rebounds up off it', () => {
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  assert.equal(atk.grab.recovery, 0, 'a grab');
  assert.ok(near(atk.grab.until, 0.2), 'its seizure live until a fifth of a second');
  const d = versus({ gap: 36 });
  d.tick(P('attack2'));
  after(d, 0.7);
  assert.deepEqual(mine(d, 'attack2').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [
    ['hit', 1, 0, null], ['hit', 5, 3, 'reverseVertical'],
  ]);
  assert.ok(d.target.body.grounded, 'barely hurt, it stays on the floor it was thrown into');
  // Hurt enough, the floor sends it back up (the shared launch bounce).
  const hurt = versus({ gap: 36 });
  hurt.target.combat.launchPoint = 60;
  hurt.tick(P('attack2'));
  let rose = 0;
  for (let i = 0; i < steps(1); i++) {
    hurt.tick();
    rose = Math.max(rose, 800 - hurt.target.body.y);
  }
  assert.ok(rose > 60, `it rebounds off the floor (${rose.toFixed(0)} units up)`);
});

test('Meteodrive that seizes nobody, or meets a raised Shield, lets go at a fifth of a second: no throw', () => {
  const d = versus({ gap: 200 });
  d.tick(P('attack2'));
  const t = finish(d);
  assert.ok(near(t, 0.2, 0.02), `over at ${t}`);
  assert.deepEqual(mine(d, 'attack2'), []);
  const guarded = versus({ gap: 36 });
  guarded.tick({}, P('shield'));
  after(guarded, 0.3, {}, { shield: true });
  guarded.tick(P('attack2'), { shield: true });
  finish(guarded, {}, { shield: true });
  assert.deepEqual(mine(guarded, 'attack2').map((e) => e.type), ['block'], 'the seizure blocked: nothing follows');
});

test('Meteor Strike: it seizes, leaps up carrying its target, then hurls it down into the floor (1, 1, then 5 at Base Launch 3 straight down)', () => {
  const atk = createAttackDefinition({ id: 'attack3', ...DEF.attacks.attack3 });
  assert.equal(atk.motion.type, 'rise');
  assert.ok(atk.grab, 'a grab');
  const d = versus({ gap: 36 });
  d.tick(P('attack3'));
  let carried = 0;
  let leapt = 0;
  for (let i = 0; i < steps(0.4); i++) {
    d.tick();
    carried = Math.max(carried, 800 - d.target.body.y);
    leapt = Math.max(leapt, 800 - d.attacker.body.y);
  }
  after(d, 1);
  assert.deepEqual(mine(d, 'attack3').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [
    ['hit', 1, 0, null], ['hit', 1, 0, null], ['hit', 5, 3, 'reverseVertical'],
  ]);
  assert.ok(leapt > 80, `it leaps (${leapt.toFixed(0)} units)`);
  assert.ok(carried > 40, `carrying its target up (${carried.toFixed(0)} units)`);
  assert.ok(d.attacker.body.grounded && d.target.body.grounded, 'both back down');
});

test('Meteor Strike that seizes nobody never leaves the ground: it lets go at a fifth of a second', () => {
  const d = versus({ gap: 200 });
  d.tick(P('attack3'));
  let highest = 0;
  let n = 0;
  while (d.attacker.combat.attack && n < 120) {
    d.tick();
    highest = Math.max(highest, 800 - d.attacker.body.y);
    n++;
  }
  assert.ok(near(n / 60, 0.2, 0.02), `over at ${n / 60}`);
  assert.equal(highest, 0, 'it never leapt');
  assert.ok(d.attacker.body.grounded);
});

// ---- In the air -----------------------------------------------------------------------

test('the Divekick: a flip, then a dive heel-first that spikes whoever it meets (3 at Base Launch 2 straight down); once per airtime', () => {
  const atk = createAttackDefinition({ id: 'midair_attack2', ...DEF.attacks.midair_attack2 });
  assert.equal(atk.motion.type, 'slam');
  assert.equal(atk.motion.impact, null, 'nothing bursts where it lands');
  const d = versus({ gap: 20 });
  hold(d.attacker, 160);
  d.attacker.body.gravityScale = 1;
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack2');
  d.until(() => d.attacker.body.grounded, 120);
  after(d, 0.3);
  assert.deepEqual(mine(d, 'midair_attack2').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 2, 'reverseVertical']]);
  const { fighter, step } = solo();
  airborne(step, 4);
  step(P('attack2'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack2');
  assert.equal(atk.airUses, 1, 'once per airtime');
});

test('the Somersault: a flipping kick that rises (1, then 3 at Base Launch 2 straight up), its recovery: once per airtime', () => {
  const { fighter, step } = solo();
  airborne(step, 20);
  const before = fighter.body.y;
  const vy = fighter.body.vy;
  step(P('attack3'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack3');
  let top = before;
  for (let i = 0; i < steps(0.4); i++) top = Math.min(top, step({}).body.y);
  assert.ok(vy > 0 || before - top > 60, 'it rises');
  assert.ok(before - top > 60, `about ${(before - top).toFixed(0)} units up`);
  step(P('attack3'));
  assert.notEqual(fighter.combat.attack?.def.id, 'midair_attack3', 'once per airtime');
  const d = versus({ gap: 30 });
  hold(d.attacker, 40);
  hold(d.target, 70);
  d.tick(P('attack3'));
  after(d, 0.4);
  assert.deepEqual(mine(d, 'midair_attack3').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [
    ['hit', 1, 0, null], ['hit', 3, 2, 'vertical'],
  ]);
});

test('its Deflect: a kick swept up through a red arc, in the air, that turns projectiles back', () => {
  assert.equal(DEF.deflect.deflectProjectiles, true);
  const { fighter, step } = solo();
  airborne(step);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
  const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 400 });
  hold(d.target, 60);
  d.tick({}, P('shield'));
  shotAt(d, d.attacker, d.target, -120, 1);
  after(d, 0.3);
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0014');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.deflections.length, 'turned back');
});

// ---- Waterkick ----------------------------------------------------------------------------

test('Waterkick: a fifth of a second lunging low, then a wave runs out along the ground (3 at Base Launch 1); 15 Energy', () => {
  const t = DEF.techniques.attack4;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.2) && near(SPRITES.duration(t.releaseAnimation), 0.2));
  assert.deepEqual(t.projectile, { id: 'attack4_object', offset: { x: 44, y: -20 } });
  const box = DEF.projectiles.attack4_object.hitbox;
  assert.ok(-t.projectile.offset.y > box.h / 2, 'its box clear of the floor where it appears');
  assert.equal(DEF.projectiles.attack4_object.quake, true, 'a wave along the ground');
  const d = versus({ gap: 150 });
  d.tick(P('attack4'));
  assert.equal(activeSpecialAbility(d.attacker), null, 'no Special: an everyday tool');
  assert.equal(d.attacker.combat.energy, 85, 'its 15 as it starts');
  let wave = null;
  for (let i = 0; i < steps(0.8); i++) {
    d.tick();
    wave ??= d.projectiles.find((p) => p.owner === d.attacker) ?? null;
  }
  assert.ok(wave, 'its wave let go');
  assert.equal(wave.direction, 1, 'the way it faces');
  assert.deepEqual(mine(d, 'attack4').map((e) => [e.type, e.source, e.damage, e.baseLaunch, e.directionalLaunch]),
    [['hit', 'projectile', 3, 1, 'horizontal']]);
  // A target in the air is passed under: a jump clears it.
  const air = versus({ gap: 150 });
  hold(air.target, 60);
  air.tick(P('attack4'));
  after(air, 1);
  assert.deepEqual(mine(air, 'attack4'), [], 'over a target in the air, it runs on');
  // Out of its run (about 260 units), nothing.
  const far = versus({ gap: 420 });
  far.tick(P('attack4'));
  after(far, 1.2);
  assert.deepEqual(mine(far, 'attack4'), []);
});

// ---- Sunburst Fist and the Limit ----------------------------------------------------------

test('Sunburst Fist is held back until its Limit gauge is full: a press does nothing, the HUD shows the gauge filling', () => {
  const d = versus({ gap: 80 });
  const entry = abilityGroups(d.attacker.def).ground.find((e) => e.action === 'attack5');
  assert.equal(d.attacker.combat.limitGauge, 0, 'a fresh life: empty');
  assert.equal(moveRestriction(d.attacker, entry, 'ground'), 'limit');
  assert.equal(abilityStatus(d.attacker, entry, 'ground').limitFill, 0);
  d.tick(P('attack5'));
  assert.equal(d.attacker.technique, null, 'nothing starts');
  assert.equal(d.attacker.combat.energy, 100, 'nothing paid');
  // Struck, its gauge fills by the damage of each real hit it takes.
  const hit = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  hit.tick(P('attack1'));
  after(hit, 0.6);
  const taken = hit.events.filter((e) => e.target === hit.target && e.type === 'hit').reduce((s, e) => s + e.damage, 0);
  assert.ok(taken > 0);
  assert.equal(hit.target.combat.limitGauge, taken, 'exactly the damage it took');
  const status = abilityStatus(hit.target, entry, 'ground');
  assert.ok(near(status.limitFill, taken / 40), 'the HUD shows the gauge filling');
  assert.equal(status.restriction, 'limit');
});

test('Sunburst Fist: its power gathered into its fist, then the punch: 10 at Base Launch 3, its explosion where it lands; the Limit spent; every 5 s', () => {
  const t = DEF.techniques.attack5;
  assert.ok(near(SPRITES.duration(t.castAnimation), 13 / 20) && near(SPRITES.duration(t.releaseAnimation), 0.2));
  const d = versus({ gap: 80 });
  d.attacker.combat.limitGauge = 40;
  d.tick(P('attack5'));
  assert.ok(d.attacker.technique, 'full: it gathers');
  assert.equal(activeSpecialAbility(d.attacker), 'attack5', 'under the Special mark');
  after(d, 0.55);
  assert.deepEqual(mine(d, 'attack5'), [], 'nothing yet: still gathering');
  assert.equal(d.attacker.combat.limitGauge, 40, 'the gauge is still full while it gathers');
  let explosion = null;
  for (let i = 0; i < steps(0.4); i++) {
    d.tick();
    explosion ??= d.attacker.effects.find((e) => e.animation === 'attack5_object') ?? null;
  }
  assert.deepEqual(mine(d, 'attack5').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 10, 3, 'horizontal']]);
  assert.ok(explosion, 'the explosion where its fist lands');
  assert.ok(explosion.x > d.attacker.body.x, 'before it');
  assert.equal(d.attacker.combat.limitGauge, 0, 'its Limit broken: the gauge spent');
  assert.ok(d.attacker.combat.abilityCooldowns.active('attack5'), 'its 5 s from the release');
  assert.equal(d.attacker.combat.energy, 100, 'no Energy');
  // A raised Shield blocks it like any hit: the gauge is spent all the same.
  const guarded = versus({ gap: 80 });
  guarded.attacker.combat.limitGauge = 55;
  guarded.tick(P('attack5'), P('shield'));
  after(guarded, 1.2, {}, { shield: true });
  assert.deepEqual(mine(guarded, 'attack5').map((e) => e.type), ['block']);
  assert.equal(guarded.attacker.combat.limitGauge, 0, 'all of it spent, the surplus too');
});

test('Sunburst Fist is broken by a hit before its punch: nothing released, no cooldown, the Limit kept', () => {
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  d.target.combat.limitGauge = 40;
  d.tick({}, P('attack5'));
  assert.ok(d.target.technique, 'gathering');
  d.tick(P('attack1'));
  after(d, 0.6);
  assert.equal(d.target.technique, null, 'broken');
  assert.equal(d.target.combat.abilityCooldowns.active('attack5'), false, 'nothing released, no cooldown');
  assert.ok(d.target.combat.limitGauge > 40, 'the Limit kept, and fuller for the blows');
  assert.deepEqual(d.events.filter((e) => e.attacker === d.target), []);
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays its whole kit: its rushes, its throws, its leap and its dive, the wave and, its Limit full, Sunburst Fist', () => {
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
    'attack1:ground', 'attack1:air', 'attack2:ground', 'attack2:air', 'attack3:ground', 'attack3:air', 'extra_attack:ground',
    'attack4:ground', 'attack5:ground',
  ]) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0014, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names are put together here so this file never spells them.
const UNNAMED = new RegExp([
  ['t', 'i', 'f', 'a'].join(''),
  ['l', 'o', 'c', 'k', 'h', 'a', 'r', 't'].join(''),
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

test('the character behind #0014 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0014.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
});
