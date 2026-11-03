// Run with node --test tests/fighters/0011/fighter-0011.test.mjs (no dependencies).
// #0011, the young spider in the black and red suit: registered from
// CHARACTERS alone in roster slot 11, its clips cut from one sprite sheet
// into its own folder and read from the real PNGs (tight, 1x, one
// art-pixel scale, anchored on its suit wherever its webbing, its venom's
// lightning or a kick's blur reach), five numbered buttons (three ordinary
// attacks with their mid-air versions and two techniques) and an extra
// attack, its Venom Jump. Punches and the Spin Kick up close (its Mash
// Combo), the Air Kick and the Somersault Kick in the air, the Web Shot
// that sticks its target where it stands, Web Lines that reel it in, the
// Venom Punch that stuns it stiff, the Venom Jump that carries it up and
// throws it high, and Camouflage, out of sight (`cloak`) until it strikes
// or is struck. The roster, credits and translations it adds are checked
// in empty-roster, settings and i18n; the shared `cloak` in cloak. Layout
// and paint still need real-browser verification.
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
import { createAttackDefinition } from '../../../js/game/combat/attacks.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { Perception } from '../../../js/game/ai/cpu-intelligence/perception.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0011/';
const DEF = getCharacter('0011');
const DEF_0001 = getCharacter('0001');
const DEF_0007 = getCharacter('0007');
const DEF_0009 = getCharacter('0009');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0011_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0011 on its own, and against #0009 (or `target`) at `gap`.
const solo = (opts = {}) => makeFighter({ character: DEF, sprites: SPRITES, ...opts });
const versus = (opts = {}, target = DEF_0009) => duel({
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
  idle: named('idle', [1, 2, 3, 2]),
  run: named('run', 6),
  jump: named('jump', 3),
  fall: named('fall', 2),
  land: named('land', 2),
  mouvment: named('mouvment', 2),
  midair_mouvment: named('midair_mouvment', 1),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 1),
  shielding: named('shielding', 1),
  deflect: named('deflect', 5),
  attack1: named('attack1', [1, 2, 3, 4, 5, 6, 7, 8, 8]),
  midair_attack1: named('midair_attack1', [1, 2, 3, 3]),
  attack2: named('attack2', 5),
  midair_attack2: named('midair_attack2', [1, 2, 2, 3]),
  attack3: named('attack3', [1, 2, 1, 1]),
  midair_attack3: named('midair_attack3', [1, 2, 3, 4, 4]),
  attack4_cast: named('attack4', 3),
  attack4_release: named('attack4', range(3, 4)),
  attack5_cast: named('attack5', [1, 1, 2, 2]),
  attack5_release: named('attack5', [3, 4, 5, 5]),
  extra_attack: named('extra_attack', 4),
};
const PROJECTILES = { attack3_object: named('attack3_object', 4) };
const EFFECTS = { attack5_object: named('attack5_object', 5) };
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(PROJECTILES), ...Object.values(EFFECTS)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 49, run: 40, jump: 60, fall: 44, land: 43, mouvment: 43, midair_mouvment: 37, hurt: 43, midair_hurt: 28,
  shielding: 42, deflect: 60, attack1: 45, midair_attack1: 45, attack2: 47,
  midair_attack2: 53, attack3: 43, midair_attack3: 39, attack4_cast: 29, attack4_release: 29, attack5_cast: 45,
  attack5_release: 40, extra_attack: 66,
};

// ---- Registration -------------------------------------------------------------------

test('#0011 is a real CHARACTERS entry: available, in roster slot 11, after #0001 to #0010', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0011'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0011');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 10);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('five numbered attacks, each a button of its own: three ordinary with mid-air versions, two techniques; plus the Venom Jump, on the ground and in the air', () => {
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
  assert.deepEqual(Object.keys(DEF.projectiles), ['attack3_object'], 'nothing thrown but its webbing');
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack?.def.id, 'extra_attack', 'the Venom Jump in the air');
});

test('nothing it does costs Energy but the Deflect; the Web Shot, Camouflage and the Venom Punch wait the policy\'s 3 s', () => {
  const { fighter } = solo();
  for (const a of Object.values(fighter.attacks)) {
    assert.equal(a.energyCost, 0, `${a.id}: no Energy`);
    assert.equal(a.cooldown, a.id === 'attack3' ? 3 : 0, `${a.id}: its cooldown`);
  }
  assert.equal(fighter.attacks.attack3.cooldownClass, 'exceptional', 'the Web Shot holds whoever it strikes');
  assert.deepEqual([fighter.techniqueDefs.attack4.energyCost, fighter.techniqueDefs.attack5.energyCost], [0, 0]);
  assert.equal(fighter.techniqueDefs.attack4.cooldown, 3, 'Camouflage: a cloak, 3 s');
  assert.equal(fighter.techniqueDefs.attack5.cooldown, 3, 'the Venom Punch: its hold, 3 s');
  assert.equal(fighter.techniqueDefs.attack4.offense.attack, false, 'Camouflage harms nobody: no attack');
  assert.equal(fighter.techniqueDefs.attack4.freeCancel, true, 'so it gives way to any move');
  assert.equal(fighter.techniqueDefs.attack5.offense.attack, true);
});

test('two Specials: Camouflage and the Venom Punch; its webs and its Venom Jump are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack4', 'attack5']);
  for (const move of ['attack4', 'attack5']) assert.equal(isSpecialAbility(DEF, move), true, move);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its Mash Combo: Punches and the Spin Kick, its two close-range strikes; its webs and its Venom Jump are no partner', () => {
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
  assert.ok(seen.includes('attack2'), 'the Spin Kick is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'attack5', 'extra_attack'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Punches', 'Air Kick', 'Spin Kick', 'Somersault Kick', 'Web Shot', 'Web Lines', 'Camouflage', 'Venom Punch', 'Venom Jump',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Venom Jump', 'Punches', 'Spin Kick', 'Web Shot', 'Camouflage', 'Venom Punch']);
  assert.deepEqual(buttons('fr'), ['Saut venimeux', 'Coups de poing', 'Coup de pied retourné', 'Tir de toile', 'Camouflage', 'Coup de poing venimeux']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3'].map((m) => STRINGS.fr[`ability.0011.${m}`]),
    ['Coup de pied aérien', 'Coup de pied salto', 'Lignes de toile']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => art(a)), [
    '0011_extra_attack_2.png', '0011_attack1_3.png', '0011_attack2_3.png', '0011_attack3_2.png', '0011_attack4_3.png',
    '0011_attack5_3.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack3'].map((a) => art(a, true)),
    ['0011_midair_attack1_2.png', '0011_midair_attack2_2.png', '0011_midair_attack3_4.png']);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0011.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: its strikes on Square and Triangle, its webs on R2 both ways, Camouflage on L2, the Venom Punch on Circle and the Venom Jump up on the right stick both ways', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:attack3': pad('r2'),
    'ground:attack4': pad('l2'),
    'ground:attack5': pad('east'),
    'ground:extra_attack': flick('up'),
    'air:attack1': pad('west'),
    'air:attack2': pad('north'),
    'air:attack3': pad('r2'),
    'air:extra_attack': flick('up'),
  });
  assert.equal(DEF.attacks.extra_attack.motion.type, 'rise', 'the stick up only for a move that rises');
  assert.equal(DEF.controller.previous, undefined, 'new: no layout of before');
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips, projectile and effect play: every file named <id>_<codename>_<frame>.png, none a copy', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 77);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  for (const [key, want] of Object.entries(PROJECTILES)) assert.deepEqual(DEF.projectileAnimations[key].frames.map(file), want, key);
  for (const [key, want] of Object.entries(EFFECTS)) assert.deepEqual(DEF.effectAnimations[key].frames.map(file), want, key);
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

test('every frame is cut clean: none of the sheet\'s blue background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 67 && g === 94 && b === 255), `${name}: none of the sheet's background`);
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
  // Its webbing and its lightning are drawn at the same art-pixel size,
  // centred where they are.
  for (const anim of [...Object.values(REAL.projectiles), ...Object.values(REAL.effects)]) {
    for (const f of anim.frames) assert.ok(near(f.unit, 1) && near(f.anchorArtX, f.artW / 2) && near(f.anchorArtY, f.artH / 2), anim.key);
  }
  assert.deepEqual(Object.keys(REAL.projectiles), ['attack3_object']);
  assert.deepEqual(Object.keys(REAL.effects), ['attack5_object']);
});

test('anchors keep the body in place: authored on its suit wherever a blur, its webbing or its lightning reach', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  // The air dash: on its body, at the frame's left, its web line ahead.
  const auto = (key) => withFakeCanvas(() => REAL.animations[key].frames.map((f) => f.anchorX));
  assert.deepEqual(ax('midair_mouvment'), [9]);
  // The flip's great blur, the roundhouse's, the crescent's: on its head
  // and chest.
  assert.equal(ax('deflect')[2], 19);
  assert.ok(Math.abs(auto('deflect')[2] - 19) > 8, 'on its body, not the blur');
  assert.equal(ax('attack2')[2], 22);
  assert.equal(ax('midair_attack2')[1], 18);
  for (const key of Object.keys(CLIPS)) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its masked head', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(49 * DEF.visual.portrait.size), 'from its first stand frame, 49 pixels tall');
});

// ---- Its strikes ---------------------------------------------------------------------

test('Punches: a straight that holds the target, then a jab that knocks it back (1, 3 at Base Launch 1)', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack1'));
  after(d, 0.6);
  const hits = mine(d, 'attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 3]]);
  assert.equal(hits[0].launchSpeed, 0, 'held for the jab');
  assert.deepEqual([hits[1].baseLaunch, hits[1].directionalLaunch], [1, 'horizontal']);
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.45), 'its straight at 0.1 s, 0.45 s in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const far = versus({ gap: 120 });
  far.tick(P('attack1'));
  after(far, 0.6);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of a fist\'s reach, nothing');
});

test('the Spin Kick: a roundhouse swept round that knocks the target away (3 at Base Launch 2)', () => {
  const d = versus({ gap: 46 });
  d.tick(P('attack2'));
  after(d, 0.5);
  assert.deepEqual(mine(d, 'attack2').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 2, 'horizontal']]);
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  assert.ok(near(atk.total, 1 / 3), 'a third of a second');
});

test('the Air Kick: a kick swept out ahead (3 at Base Launch 2 sideways)', () => {
  const d = versus({ gap: 44 });
  hold(d.attacker, 40);
  hold(d.target, 40);
  d.tick(P('attack1'));
  after(d, 0.3);
  assert.deepEqual(mine(d, 'midair_attack1').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 2, 'horizontal']]);
});

test('the Somersault Kick: its crescent sweeps over and round it, either side, launching straight up (3 at Base Launch 2)', () => {
  for (const attackerFacing of [1, -1]) {
    const d = versus({ gap: 20, attackerFacing: -attackerFacing, targetFacing: attackerFacing });
    d.attacker.facing = attackerFacing;
    hold(d.attacker, 40);
    hold(d.target, 30);
    d.tick(P('attack2'));
    after(d, 0.3);
    assert.deepEqual(mine(d, 'midair_attack2').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 2, 'vertical']], `${attackerFacing}`);
  }
});

// ---- Its webs ------------------------------------------------------------------------

test('the Web Shot: a ball of webbing from afar that sticks its target where it stands (1, held 0.35 s, no launch); every 3 s', () => {
  const d = versus({ gap: 320 });
  d.tick(P('attack3'));
  after(d, 0.1);
  assert.equal(d.projectiles.length, 1, 'its webbing flies');
  assert.deepEqual([d.projectiles[0].def.speed, d.projectiles[0].def.lifetime], [760, 0.55]);
  after(d, 0.5);
  const hits = mine(d, 'attack3');
  assert.deepEqual(hits.map((e) => [e.type, e.source, e.damage, e.launchSpeed]), [['hit', 'projectile', 1, 0]]);
  assert.ok(near(hits[0].paralysis, 0.35), 'stuck where it stands');
  assert.ok(d.attacker.combat.cooldowns.has('attack3'), 'its 3 s, from the shot');
  assert.equal(d.attacker.combat.energy, 100, 'no Energy');
  // Pressed again at once, nothing: the next waits out its cooldown.
  d.tick(P('attack3'));
  assert.equal(d.attacker.combat.attack, null);
  // Out of its reach, nothing.
  const far = versus({ gap: 520 });
  far.tick(P('attack3'));
  after(far, 0.8);
  assert.deepEqual(mine(far, 'attack3'), []);
});

test('Web Lines: both web lines shot down ahead in the air, striking whoever they catch (3, a stun) and reeling it in', () => {
  const d = versus({ gap: 90 });
  hold(d.attacker, 40);
  const x = d.target.body.x;
  d.tick(P('attack3'));
  after(d, 0.5);
  const hits = mine(d, 'midair_attack3');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.launchSpeed]), [['hit', 3, 0]]);
  assert.ok(d.target.body.x < x - 20, `reeled in (${x} to ${d.target.body.x})`);
  assert.equal(d.projectiles.length, 0, 'the lines are no projectile');
  // Behind it, nobody is reeled.
  const back = versus({ gap: 60, attackerFacing: 1 });
  back.attacker.facing = -1;
  hold(back.attacker, 40);
  const bx = back.target.body.x;
  back.tick(P('attack3'));
  after(back, 0.5);
  assert.equal(back.target.body.x, bx, 'its front only');
});

// ---- Its venom ------------------------------------------------------------------------

test('the Venom Punch: a third of a second, then its fist and its lightning stun whoever is in front stiff (3, held 1.2 s); every 3 s', () => {
  const t = DEF.techniques.attack5;
  assert.ok(near(SPRITES.duration(t.castAnimation), 1 / 3) && near(SPRITES.duration(t.releaseAnimation), 1 / 3));
  const d = versus({ gap: 70 });
  d.tick(P('attack5'));
  assert.equal(activeSpecialAbility(d.attacker), 'attack5');
  after(d, 0.7);
  const hits = mine(d, 'attack5');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.launchSpeed]), [['hit', 3, 0]]);
  assert.ok(near(hits[0].paralysis, 1.2), 'stunned stiff');
  assert.ok(d.attacker.combat.abilityCooldowns.active('attack5'), 'its 3 s from the release');
  assert.equal(d.attacker.effects.length + 1 > 0, true);
  // Behind it, nothing.
  const back = versus({ gap: 50 });
  back.attacker.facing = -1;
  back.tick(P('attack5'));
  after(back, 0.7);
  assert.deepEqual(mine(back, 'attack5'), []);
  // A raised Shield blocks it: no hold.
  const guarded = versus({ gap: 60 });
  guarded.tick(P('attack5'), P('shield'));
  after(guarded, 0.7, {}, { shield: true });
  assert.deepEqual(mine(guarded, 'attack5').map((e) => e.type), ['block']);
  assert.equal(guarded.target.combat.paralysis, 0);
});

test('the Venom Punch is broken by a hit before it lets go: no lightning, no cooldown', () => {
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  d.tick({}, P('attack5'));
  assert.ok(d.target.technique, 'casting');
  d.tick(P('attack1'));
  after(d, 0.4);
  assert.equal(d.target.technique, null, 'broken');
  assert.equal(d.target.combat.abilityCooldowns.active('attack5'), false, 'nothing released, no cooldown');
  assert.deepEqual(d.events.filter((e) => e.attacker === d.target), []);
});

test('the Venom Jump: from the ground it springs up crackling, carrying its target with it (1), then throws it high (3 at Base Launch 2 straight up)', () => {
  const d = versus({ gap: 30 });
  const y = d.attacker.body.y;
  d.tick(P('extra_attack'));
  let top = y;
  for (let i = 0; i < steps(0.6); i++) {
    d.tick();
    top = Math.min(top, d.attacker.body.y);
  }
  assert.ok(y - top > 60, `it rises off the ground (${Math.round(y - top)} units)`);
  const hits = mine(d, 'extra_attack');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 1, 0, null], ['hit', 3, 2, 'vertical']]);
  // From the ground it is a grounded move: nothing held steers it.
  const path = (held) => {
    const h = solo({ x: 400 });
    h.fighter.controller.attackFacing = () => h.fighter.facing;
    for (let i = 0; i < 5; i++) h.step({});
    h.step(P('extra_attack'));
    const out = [];
    while (h.fighter.combat.attack) {
      const f = h.step(held);
      if (f.combat.attack) out.push(f.body.x);
    }
    return out;
  };
  assert.deepEqual(path({ runRight: true }), path({}));
});

test('the Venom Jump in the air: once per airtime, its way back to the stage; landing gives it back', () => {
  const { fighter, step } = solo();
  airborne(step, 4);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack?.def.id, 'extra_attack');
  while (fighter.combat.attack) step({});
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null, 'used up for this airtime');
  for (let i = 0; i < 300 && !fighter.body.grounded; i++) step({});
  step({});
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack?.def.id, 'extra_attack', 'given back on the ground');
});

// ---- Camouflage -------------------------------------------------------------------------

test('Camouflage: three tenths of a second fading, then it is cloaked for 2.5 s; every 3 s, no Energy', () => {
  const t = DEF.techniques.attack4;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.3) && near(SPRITES.duration(t.releaseAnimation), 0.3));
  const { fighter, step } = solo();
  step(P('attack4'));
  assert.equal(activeSpecialAbility(fighter), 'attack4');
  for (let i = 0; i < steps(0.25); i++) step({});
  assert.equal(fighter.combat.cloaked, false, 'not before the cast ends');
  for (let i = 0; i < steps(0.1); i++) step({});
  assert.equal(fighter.combat.cloaked, true, 'out of sight');
  assert.ok(fighter.combat.abilityCooldowns.active('attack4'), 'its cooldown from the release');
  assert.equal(fighter.combat.energy, 100, 'no Energy');
  for (let i = 0; i < steps(2.6); i++) step({});
  assert.equal(fighter.combat.cloaked, false, 'until it runs out');
});

test('Camouflage is no invulnerability: cloaked, it is struck as ever, and any hit shows it; its first move shows it too', () => {
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  d.target.combat.cloakFor(2.5);
  d.tick(P('attack1'));
  after(d, 0.4);
  assert.equal(d.events.filter((e) => e.target === d.target && e.type === 'hit').length > 0, true, 'struck where it really is');
  assert.equal(d.target.combat.cloaked, false, 'and shown');
  // Blocked, it shows itself too.
  const b = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  b.tick({}, P('shield'));
  for (let i = 0; i < 10; i++) b.tick({}, { shield: true });
  b.target.combat.cloakFor(2.5);
  b.tick(P('attack1'), { shield: true });
  after(b, 0.4, {}, { shield: true });
  assert.ok(b.events.some((e) => e.type === 'block'));
  assert.equal(b.target.combat.cloaked, false);
  // Its own first move: an attack, the Deflect or a technique.
  for (const press of [P('attack1'), P('attack5')]) {
    const { fighter, step } = solo();
    fighter.combat.cloakFor(2.5);
    step({});
    assert.equal(fighter.combat.cloaked, true);
    step(press);
    assert.equal(fighter.combat.cloaked, false, 'it shows itself as it strikes');
  }
  const { fighter, step } = solo();
  airborne(step);
  fighter.combat.cloakFor(2.5);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
  assert.equal(fighter.combat.cloaked, false, 'the Deflect shows it');
  // Running, jumping and Dashing keep it hidden.
  const r = solo();
  r.fighter.combat.cloakFor(2.5);
  for (let i = 0; i < 10; i++) r.step({ runRight: true });
  r.step(P('jump'));
  for (let i = 0; i < 10; i++) r.step({});
  assert.equal(r.fighter.combat.cloaked, true, 'moving never shows it');
});

test('Camouflage gives way to any move in its release, the cloak kept', () => {
  const { fighter, step } = solo();
  step(P('attack4'));
  for (let i = 0; i < steps(0.35); i++) step({});
  assert.ok(fighter.technique && fighter.combat.cloaked, 'in its release pose, cloaked');
  step(P('jump'));
  assert.equal(fighter.technique, null, 'a jump cuts it short');
  assert.equal(fighter.combat.cloaked, true, 'still cloaked');
});

test('a CPU cannot see it cloaked: it sees it where it vanished, doing nothing, and sees it again once it shows itself', () => {
  const d = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, targetCharacter: DEF_0001, gap: 300 });
  const eye = new Perception(() => 0.5, { react: [0.1, 0.1], lapse: 0 });
  let clock = 0;
  const look = () => {
    clock += 1 / 60;
    return eye.observe(d.attacker, { projectiles: [] }, clock, d.target);
  };
  for (let i = 0; i < 20; i++) {
    d.tick();
    look();
  }
  const x = d.attacker.body.x;
  d.attacker.combat.cloakFor(2.5);
  for (let i = 0; i < 60; i++) {
    d.tick({ runRight: true });
    look();
  }
  const v = look();
  assert.ok(d.attacker.body.x > x + 100, 'it moved');
  assert.equal(v.x, x, 'still seen where it vanished');
  assert.deepEqual([v.vx, v.attack, v.hidden], [0, null, true], 'doing nothing');
  d.attacker.combat.reveal();
  for (let i = 0; i < 12; i++) look();
  assert.ok(Math.abs(look().x - d.attacker.body.x) < 1e-9, 'seen again, after its reaction time');
});

// ---- Defense --------------------------------------------------------------------------

test('its Deflect: a flip whose legs sweep a great arc, in the air, that turns projectiles back', () => {
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
  d.projectiles.push(new Projectile({ owner: d.attacker, def, anim: d.attacker.sprites.projectile(def.animation), x: b.x - 90, y: b.y - 40, direction: 1 }));
  after(d, 0.3);
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0011');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.events.some((e) => e.redirected), 'turned back');
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays its whole kit: its strikes, its webs, its venom, its Venom Jump and its camouflage', () => {
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
    'attack5:ground', 'extra_attack:ground', 'extra_attack:air',
  ]) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0011, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names, its city and its publisher are put together here so this file
// never spells them.
const UNNAMED = new RegExp([
  ['\\b', 'm', 'i', 'l', 'e', 's', '\\b'].join(''),
  ['m', 'o', 'r', 'a', 'l', 'e', 's'].join(''),
  ['s', 'p', 'i', 'd', 'e', 'r', '[- ]?', 'm', 'a', 'n'].join(''),
  ['s', 'p', 'i', 'd', 'e', 'r', '[- ]?', 'v', 'e', 'r', 's', 'e'].join(''),
  ['m', 'a', 'r', 'v', 'e', 'l'].join(''),
  ['b', 'r', 'o', 'o', 'k', 'l', 'y', 'n'].join(''),
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

test('the character behind #0011 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0011.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
  assert.ok(STAGE);
});
