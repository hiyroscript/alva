// Run with node --test tests/fighters/0010/fighter-0010.test.mjs (no dependencies).
// #0010, the traitor in the red spacesuit: registered from CHARACTERS alone
// in roster slot 10, its clips cut from one sprite sheet into its own folder
// and read from the real PNGs (tight, 1x, one art-pixel scale, anchored on
// its suit wherever its fists, its pistol, its knife, its tongue, the
// emergency button or the vent reach), five numbered buttons (three
// ordinary attacks with their mid-air versions and two techniques) and an
// extra attack, its Vent. It catches its opponents off guard: Punches and
// the Pistol Whip up close (its Mash Combo), the Air Kick and the Tentacle
// Sweep in the air, the Tongue Lash that reels its target in, the Kill
// (twice as strong on a back turned to it: `backstab`), the Emergency
// Meeting that calls everyone near to the button and holds them there, and
// the Vent, under the floor and out further along it (motion `tunnel`),
// where only the vent's hatch can be hit. At its own true height it is the
// roster's smallest fighter. The roster, credits and translations it adds
// are checked in empty-roster, settings and i18n; the shared `backstab`
// and `tunnel` in hit-effects and tunnel. Layout and paint still need
// real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { STAGE, duel, fakeSpritesOf, makeFighter, steps, cpuFight } from '../../helpers/fighter-harness.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { CHARACTERS, getCharacter, playableCharacters } from '../../../js/data/characters.js';
import { abilityName } from '../../../js/data/abilities.js';
import { loadoutProblems } from '../../../js/data/loadout.js';
import { isSpecialAbility } from '../../../js/data/special-abilities.js';
import { mashComboProblems } from '../../../js/data/mash-combo.js';
import { pad, flick } from '../../../js/data/characters/helpers.js';
import { createAttackDefinition, isMeleeAttack } from '../../../js/game/combat/attacks.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { analyzeCapabilities } from '../../../js/game/ai/cpu-intelligence/capabilities.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0010/';
const DEF = getCharacter('0010');
const DEF_0001 = getCharacter('0001');
const DEF_0007 = getCharacter('0007');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0010_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0010 on its own, and against #0001 (or `target`) at `gap`.
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
  idle: named('idle', [1, 2, 1, 3]),
  run: named('run', [1, 1, 1, 2, 3, 3, 3, 4]),
  jump: named('jump', 4),
  fall: named('fall', 2),
  land: named('land', 2),
  mouvment: named('mouvment', 2),
  midair_mouvment: named('midair_mouvment', 1),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 1),
  prepshield: named('prepshield', 1),
  shielding: named('shielding', 1),
  releaseshield: named('releaseshield', 1),
  deflect: named('deflect', 5),
  attack1: named('attack1', [1, 2, 2, 1, 3, 4, 4]),
  midair_attack1: named('midair_attack1', 4),
  attack2: named('attack2', [1, 2, 3, 4, 3, 5, 6]),
  midair_attack2: named('midair_attack2', 7),
  attack3: named('attack3', [1, 2, 3, 4, 5, 6, 2]),
  attack4_cast: named('attack4', 3),
  attack4_release: named('attack4', range(6, 4)),
  attack5_cast: named('attack5', 3),
  attack5_release: named('attack5', [4, 4, 5, 5]),
  extra_attack: named('extra_attack', [1, 2, 3, 4, 5, 6, 7, 8, 9, 3, 10, 11, 12, 13]),
};
const OBJECTS = {
  attack5_object: named('attack5_object', 2),
};
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(OBJECTS)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 27, run: 27, jump: 27, fall: 29, land: 25, mouvment: 28, midair_mouvment: 20, hurt: 26, midair_hurt: 24,
  prepshield: 27, shielding: 24, releaseshield: 24, deflect: 24, attack1: 27, midair_attack1: 30, attack2: 41,
  midair_attack2: 42, attack3: 30, attack4_cast: 26, attack4_release: 26, attack5_cast: 28, attack5_release: 19,
  extra_attack: 28,
};

// ---- Registration -------------------------------------------------------------------

test('#0010 is a real CHARACTERS entry: available, in roster slot 10, after #0001 to #0009', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0010'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0010');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 9);
  assert.deepEqual(playableCharacters().map((c) => c.id), [
    '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014',
  ]);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('five numbered attacks, each a button of its own: three ordinary with mid-air versions, two techniques; plus the Vent', () => {
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
  assert.deepEqual(Object.keys(DEF.techniques), ['attack4', 'attack5']);
  assert.equal(DEF.summons, undefined, 'it summons nobody');
  // The Vent needs the floor: no vent in the air.
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null, 'nothing in the air');
});

test('nothing it does costs Energy but the Deflect: no projectile of its own to throw, and its Specials have their cooldowns', () => {
  const { fighter } = solo();
  for (const a of Object.values(fighter.attacks)) {
    assert.equal(a.energyCost, 0, `${a.id}: no Energy`);
    assert.equal(a.cooldown, 0, `${a.id}: ordinary`);
    assert.equal(a.projectile, null, `${a.id}: throws nothing`);
    assert.equal(isMeleeAttack(a), true, `${a.id}: a strike`);
  }
  assert.deepEqual([fighter.techniqueDefs.attack4.energyCost, fighter.techniqueDefs.attack5.energyCost], [0, 0]);
  assert.equal(fighter.techniqueDefs.attack4.cooldown, 5, 'the Kill: its backstab deals 10, so its kill cooldown is 5 s');
  assert.equal(fighter.techniqueDefs.attack5.cooldown, 3, 'the Emergency Meeting: its hold, 3 s');
});

test('three Specials: the Kill, the Vent and the Emergency Meeting; its Tongue Lash is ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack4', 'extra_attack', 'attack5']);
  for (const move of ['attack4', 'attack5', 'extra_attack']) assert.equal(isSpecialAbility(DEF, move), true, move);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its Mash Combo: Punches and the Pistol Whip, its two close-range strikes; its tongue and its vent are no partner', () => {
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'attack2'] });
  assert.deepEqual(mashComboProblems(DEF), []);
  assert.equal(DEF.attacks.mash_attack, undefined, 'no button-less partner: both are on its buttons');
  for (const id of ['attack3', 'extra_attack']) {
    assert.notDeepEqual(mashComboProblems({ ...DEF, mashCombo: { attacks: ['attack1', id] } }), [], `${id} could not be its partner`);
  }
  const { fighter, step } = solo();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    step(P('attack1'));
    for (let k = 0; k < 4; k++) seen.push(step({}).combat.attack?.def.id);
  }
  for (let i = 0; i < steps(5); i++) seen.push(step({}).combat.attack?.def.id);
  assert.ok(seen.includes('attack2'), 'the Pistol Whip is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'attack5', 'extra_attack'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Punches', 'Air Kick', 'Pistol Whip', 'Tentacle Sweep', 'Tongue Lash', 'Tongue Lash', 'Kill', 'Emergency Meeting', 'Vent',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Vent', 'Punches', 'Pistol Whip', 'Tongue Lash', 'Kill', 'Emergency Meeting']);
  assert.deepEqual(buttons('fr'), ['Conduit', 'Coups de poing', 'Coup de crosse', 'Coup de langue', 'Meurtre', 'Réunion d’urgence']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3'].map((m) => STRINGS.fr[`ability.0010.${m}`]),
    ['Coup de pied aérien', 'Balayage de tentacules', 'Coup de langue']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => art(a)), [
    '0010_extra_attack_3.png', '0010_attack1_3.png', '0010_attack2_4.png', '0010_attack3_4.png', '0010_attack4_5.png',
    '0010_attack5_object_2.png',
  ]);
  assert.deepEqual(['attack1', 'attack2'].map((a) => art(a, true)), ['0010_midair_attack1_2.png', '0010_midair_attack2_4.png']);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0010.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: its strikes on Square and Triangle, its tongue on R2 both ways, the Kill on L2, the Meeting on Circle and the Vent down on the right stick', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:attack3': pad('r2'),
    'ground:attack4': pad('l2'),
    'ground:attack5': pad('east'),
    'ground:extra_attack': flick('down'),
    'air:attack1': pad('west'),
    'air:attack2': pad('north'),
    'air:attack3': pad('r2'),
  });
  assert.equal(DEF.controller.previous, undefined, 'added after settings version 5: no layout of then');
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips and objects play: every file named <id>_<codename>_<frame>.png, none a copy', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 85);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  for (const [key, want] of Object.entries(OBJECTS)) assert.deepEqual(DEF.projectileAnimations[key].frames.map(file), want, key);
  assert.equal(DEF.effectAnimations, undefined, 'no effect art: the vent is in its own clip');
  // The Tongue Lash in the air is its ground clip, played in the air.
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

test('every frame is cut clean: none of the sheet\'s red-orange background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 228 && g === 66 && b === 48), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel: the roster\'s smallest fighter', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 27);
  assert.ok(near(REAL.worldPerArt, 88 / 52), 'the same world size per art pixel as the rest of the roster');
  assert.ok(near(DEF.visual.height, 27 * 88 / 52), 'about 46 units tall');
  for (const c of playableCharacters().filter((x) => x !== DEF)) {
    assert.ok(c.visual.height > DEF.visual.height + 15, `#${c.id} stands taller`);
  }
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(near(anim.maxArtH, HEIGHTS[key]), `${key}: tallest frame ${anim.maxArtH}`);
    for (const f of anim.frames) {
      assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
      assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth), `${key}: its width`);
      assert.ok(near(f.artH, IMAGES.get(f.url).naturalHeight), `${key}: its height`);
    }
  }
  // The meeting's call is drawn at the same art-pixel size, centred where
  // it is.
  for (const anim of Object.values(REAL.projectiles)) {
    for (const f of anim.frames) assert.ok(near(f.unit, 1) && near(f.anchorArtX, f.artW / 2) && near(f.anchorArtY, f.artH / 2), anim.key);
  }
  assert.deepEqual(Object.keys(REAL.projectiles), ['attack5_object']);
});

test('anchors keep the body in place: authored on its suit wherever its knife, its tongue, the button or the vent reach', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  // The knife's slash swept far behind it: the body stays at the frame's
  // middle.
  assert.deepEqual(ax('attack4_release'), [23.5, 12.5, 14.5, 12, 11.5, 13.5]);
  // The pistol's trail and the emergency button would pull the automatic
  // anchor off the body.
  const auto = (key) => withFakeCanvas(() => REAL.animations[key].frames.map((f) => f.anchorX));
  assert.ok(Math.abs(auto('attack2')[1] - ax('attack2')[1]) > 8, 'on the body, not the pistol\'s trail');
  assert.ok(Math.abs(auto('attack5_release')[0] - ax('attack5_release')[0]) > 8, 'on the body, not the button');
  // The tongue far ahead of it, the button beside it.
  assert.deepEqual(ax('attack3').slice(2, 6), [13.5, 16, 15, 11.5]);
  assert.deepEqual(ax('attack5_release'), [14, 14, 12.5, 12.5]);
  // The vent alone, while it is inside: on the vent's middle.
  assert.deepEqual(ax('extra_attack').slice(3, 9), [15, 18.5, 20, 20, 13, 13]);
  for (const key of Object.keys(CLIPS)) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its visor', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(26 * DEF.visual.portrait.size), 'from its first stand frame, 26 pixels tall');
});

// ---- Its strikes ---------------------------------------------------------------------

test('Punches: a hook that holds the target, then a straight that knocks it back (1, 3 at Base Launch 1)', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack1'));
  after(d, 0.5);
  const hits = mine(d, 'attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 3]]);
  assert.equal(hits[0].launchSpeed, 0, 'held for the straight');
  assert.deepEqual([hits[1].baseLaunch, hits[1].directionalLaunch], [1, 'horizontal']);
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.05) && near(atk.total, 0.35), 'its hook at 0.05 s, 0.35 s in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const far = versus({ gap: 110 });
  far.tick(P('attack1'));
  after(far, 0.5);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of a fist\'s reach, nothing');
});

test('the Pistol Whip: the pistol cracked down holds the target, then a shot point-blank knocks it away (1, then 3 at Base Launch 2)', () => {
  const d = versus({ gap: 50 });
  d.tick(P('attack2'));
  after(d, 0.6);
  const hits = mine(d, 'attack2');
  assert.deepEqual(hits.map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 3]]);
  assert.equal(hits[0].launchSpeed, 0, 'held for the shot');
  assert.deepEqual([hits[1].baseLaunch, hits[1].directionalLaunch, hits[1].source], [2, 'horizontal', 'melee']);
  assert.equal(d.projectiles.length, 0, 'nothing flies out of it');
});

test('the Air Kick: both legs kicked out ahead (3 at Base Launch 2)', () => {
  const d = versus({ gap: 36 });
  hold(d.attacker, 40);
  hold(d.target, 40);
  d.tick(P('attack1'));
  after(d, 0.3);
  const hits = mine(d, 'midair_attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 2, 'horizontal']]);
});

test('the Tentacle Sweep: tentacles burst out and sweep a great arc round it, either side, launching straight up (3 at Base Launch 2)', () => {
  for (const gap of [40, -40]) {
    const d = versus({ gap: Math.abs(gap), attackerFacing: Math.sign(gap) * -1 === 1 ? -1 : 1 });
    hold(d.attacker, 60);
    hold(d.target, 60);
    d.tick(P('attack2'));
    after(d, 0.4);
    const hits = mine(d, 'midair_attack2');
    assert.deepEqual(hits.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 2, 'vertical']], `${gap}`);
  }
});

// ---- Its tongue ----------------------------------------------------------------------

test('the Tongue Lash: its tongue out to 70 units holds its target (3, no launch) and reels it in to its feet', () => {
  const d = versus({ gap: 76 });
  const x = d.target.body.x;
  d.tick(P('attack3'));
  after(d, 0.6);
  const hits = mine(d, 'attack3');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.launchSpeed]), [['hit', 3, 0]]);
  assert.ok(d.target.body.x < x - 30, 'reeled in toward it');
  assert.ok(Math.abs(d.target.body.x - d.attacker.body.x) < 40, 'to its feet');
  // Behind it, nothing reels: its tongue goes out the way it faces.
  const b = versus({ gap: -60 });
  const bx = b.target.body.x;
  b.tick(P('attack3'));
  after(b, 0.6);
  assert.deepEqual(mine(b, 'attack3'), []);
  assert.equal(b.target.body.x, bx);
  // Out of its reach, nothing.
  const far = versus({ gap: 130 });
  far.tick(P('attack3'));
  after(far, 0.6);
  assert.deepEqual(mine(far, 'attack3'), []);
});

test('the Tongue Lash in the air reels its target in on both axes', () => {
  const d = versus({ gap: 70 });
  hold(d.attacker, 120);
  hold(d.target, 60);
  d.tick(P('attack3'));
  after(d, 0.5);
  assert.deepEqual(mine(d, 'midair_attack3').map((e) => [e.type, e.damage]), [['hit', 3]]);
});

// ---- The Kill ------------------------------------------------------------------------

test('the Kill: a fifth of a second, then the knife: 5 at Base Launch 2 from the front; 10 at Base Launch 3 on a back turned to it', () => {
  const t = DEF.techniques.attack4;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.2) && near(SPRITES.duration(t.releaseAnimation), 0.4));
  const front = versus({ gap: 50 });
  front.tick(P('attack4'));
  assert.equal(activeSpecialAbility(front.attacker), 'attack4', 'its orange mark shows');
  after(front, 0.8);
  assert.deepEqual(mine(front, 'attack4').map((e) => [e.type, e.source, e.damage, e.baseLaunch, e.directionalLaunch, e.backstab]),
    [['hit', 'technique', 5, 2, 'horizontal', false]]);
  // Its target faces away from it: the kill.
  const back = versus({ gap: 50, targetFacing: 1 });
  back.tick(P('attack4'));
  after(back, 0.8);
  const kill = mine(back, 'attack4');
  assert.deepEqual(kill.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch, e.backstab]), [['hit', 10, 3, 'horizontal', true]]);
  assert.ok(kill[0].launchSpeed > mine(front, 'attack4')[0].launchSpeed * 2, 'thrown far harder');
  // Then it waits out its kill cooldown, 5 s from the release.
  assert.ok(back.attacker.combat.abilityCooldowns.active('attack4'));
  back.tick(P('attack4'));
  assert.equal(back.attacker.technique, null, 'no second kill yet');
  after(back, 4.5);
  assert.equal(back.attacker.combat.abilityCooldowns.active('attack4'), false, 'ready again after 5 s');
  // Out of the knife's reach, nothing.
  const far = versus({ gap: 100 });
  far.tick(P('attack4'));
  after(far, 0.8);
  assert.deepEqual(mine(far, 'attack4'), []);
});

test('the Kill is blocked like any hit, back turned or not, and a hit before the knife strikes breaks it: no kill, no cooldown', () => {
  const d = versus({ gap: 50, targetFacing: 1 });
  d.tick(P('attack4'), P('shield'));
  after(d, 0.8, {}, { shield: true });
  assert.deepEqual(mine(d, 'attack4').map((e) => [e.type, e.damage, e.backstab]), [['block', 0, false]]);
  // (#0002's Jab: #0001's passes over its head.)
  const broken = versus({ gap: 40 }, getCharacter('0002'));
  broken.tick(P('attack4'));
  after(broken, 0.05);
  broken.tick({}, P('attack1'));
  after(broken, 1);
  assert.equal(broken.attacker.technique, null, 'broken');
  assert.deepEqual(mine(broken, 'attack4'), []);
  assert.equal(broken.attacker.combat.abilityCooldowns.active('attack4'), false, 'ready again at once');
});

// ---- The Vent ------------------------------------------------------------------------

test('the Vent: into the floor, out 240 units further along it, bursting out at whoever stands there (3, a stun, no launch)', () => {
  const d = versus({ gap: 240 });
  const x = d.attacker.body.x;
  d.tick(P('extra_attack'));
  assert.equal(activeSpecialAbility(d.attacker), 'extra_attack', 'its orange mark shows');
  const path = [];
  for (let i = 0; i < steps(0.7); i++) {
    d.tick();
    path.push(d.attacker.body.x);
  }
  assert.equal(path[steps(0.3)], x, 'still where it went in');
  assert.equal(path[path.length - 1], x + 240, 'out 240 units further along');
  assert.equal(new Set(path).size, 2, 'all at once: nowhere in between');
  const hits = mine(d, 'extra_attack');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.launchSpeed, e.source]), [['hit', 3, 0, 'melee']]);
  // It keeps none of the speed it runs in with.
  const run = versus({ gap: 600 });
  for (let i = 0; i < 20; i++) run.tick({ runRight: true });
  const at = run.attacker.body.x;
  run.tick(P('extra_attack'));
  after(run, 0.2);
  assert.ok(Math.abs(run.attacker.body.x - at) < 12, 'it stops where it goes in');
});

test('inside the floor only the vent\'s hatch can be hit: a high blow passes over it, a low one flushes it out', () => {
  const { fighter, step } = solo();
  step(P('extra_attack'));
  for (let i = 0; i < steps(0.2); i++) step({});
  assert.equal(fighter.inFloor, true);
  assert.deepEqual(fighter.hurtboxes, DEF.attacks.extra_attack.motion.hurtboxes);
  assert.ok(fighter.hurtboxes.every((b) => b.y + b.h <= 0 && b.y >= -30), 'all of it on the floor, 30 units tall');
  assert.equal(fighter.passingThrough, true, 'it passes under fighters');
  // #0007's pistol shot flies over the hatch; #0001's Jab passes over it,
  // and #0009's fire swept round its feet flushes it out.
  const high = duel({ attackerCharacter: getCharacter('0009'), targetCharacter: DEF, targetSprites: SPRITES, gap: 44 });
  high.tick({}, P('extra_attack'));
  for (let i = 0; i < steps(0.15); i++) high.tick();
  high.tick(P('attack2'));
  after(high, 0.4);
  const flushed = high.events.filter((e) => e.target === high.target && e.type === 'hit');
  assert.ok(flushed.length > 0, 'the low sweep meets the hatch');
  assert.equal(high.target.combat.attack, null, 'out of its vent, the attack over');
});

test('the Vent never comes out past where the ground it stands on ends, inside a solid or in the Void', () => {
  // Near the floor's right edge (the stage's main floor ends at 2000).
  const { fighter, step } = solo({ x: 1900 });
  step(P('extra_attack'));
  after({ tick: () => step({}) }, 0.7);
  assert.ok(fighter.body.x <= 2000 && fighter.body.x > 1900, 'out at the edge, never past it');
  assert.equal(fighter.body.grounded, true, 'on the ground');
});

test('the CPU reads where the Vent comes out: its reach is the strike swept along the floor', () => {
  const caps = analyzeCapabilities(solo().fighter);
  const vent = caps.moves.find((m) => m.key === 'extra_attack:ground');
  assert.deepEqual(vent.reach, { x: -28, y: -48, w: 296, h: 48 });
  assert.ok(vent.roles.has('mobility') && vent.roles.has('approach'));
});

// ---- The Emergency Meeting -----------------------------------------------------------

test('the Emergency Meeting: the button slammed, everyone within 260 units called to it, either side, and held there 1.2 s (1, no launch); every 3 s', () => {
  const t = DEF.techniques.attack5;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.25) && near(SPRITES.duration(t.releaseAnimation), 1 / 3));
  for (const [gap, facing] of [[200, -1], [180, 1]]) {
    const d = versus({ gap, attackerFacing: facing === -1 ? 1 : -1 });
    const x = d.target.body.x;
    d.tick(P('attack5'));
    assert.equal(activeSpecialAbility(d.attacker), 'attack5');
    after(d, 0.9);
    const hits = mine(d, 'attack5');
    assert.deepEqual(hits.map((e) => [e.type, e.source, e.damage, e.launchSpeed]), [['hit', 'projectile', 1, 0]], `${gap}`);
    assert.ok(near(hits[0].paralysis, 1.2), 'held for the meeting');
    assert.ok(Math.abs(d.target.body.x - d.attacker.body.x) < Math.abs(x - d.attacker.body.x) - 80, 'called to the button');
    assert.ok(d.attacker.combat.abilityCooldowns.active('attack5'), 'its 3 s from the release');
  }
  // Out of its call, nothing.
  const far = versus({ gap: 400 });
  const x = far.target.body.x;
  far.tick(P('attack5'));
  after(far, 0.9);
  assert.deepEqual(mine(far, 'attack5'), []);
  assert.equal(far.target.body.x, x);
  // A raised Shield holds its ground, and blocks the call.
  const guarded = versus({ gap: 120 });
  const gx = guarded.target.body.x;
  guarded.tick(P('attack5'), P('shield'));
  after(guarded, 0.9, {}, { shield: true });
  assert.equal(guarded.target.body.x, gx, 'not called');
});

// ---- Defense --------------------------------------------------------------------------

test('its Deflect: its body rolled over sideways, in the air, that turns projectiles back', () => {
  assert.equal(DEF.deflect.deflectProjectiles, true);
  const { fighter, step } = solo();
  airborne(step);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
  const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 400 });
  hold(d.target, 60);
  const def = d.attacker.projectileDefs.extra_attack_object;
  const b = d.target.body;
  d.tick({}, P('shield'));
  d.projectiles.push(new Projectile({ owner: d.attacker, def, anim: d.attacker.sprites.projectile(def.animation), x: b.x - 90, y: b.y - 24, direction: 1 }));
  after(d, 0.3);
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0010');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.events.some((e) => e.redirected), 'turned back');
});

test('small: #0001\'s Jab passes over its head, while every other fighter\'s Jab meets it standing', () => {
  for (const c of playableCharacters()) {
    const d = duel({ attackerCharacter: c, targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
    d.tick(P('attack1'));
    after(d, 0.5);
    assert.equal(d.events.length > 0, c.id !== '0001', `#${c.id}'s Jab`);
  }
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays its whole kit: its strikes, its tongue, its kill, its meeting and its vent', () => {
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
    'attack5:ground', 'extra_attack:ground',
  ]) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0010, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names and its game's are put together here so this file never spells
// them.
const UNNAMED = new RegExp([
  ['i', 'm', 'p', 'o', 's', 't'].join(''),
  ['a', 'm', 'o', 'n', 'g', ' ?', 'u', 's', '\\b'].join(''),
  ['a', 'm', 'o', 'g', 'u', 's'].join(''),
  ['c', 'r', 'e', 'w', 'm', 'a', 't', 'e'].join(''),
  ['i', 'n', 'n', 'e', 'r', 's', 'l', 'o', 't', 'h'].join(''),
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

test('the character behind #0010 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0010.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
  assert.ok(STAGE);
});
