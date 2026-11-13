// Run with node --test tests/fighters/0018/fighter-0018.test.mjs (no dependencies).
// #0018, the devoted stalker in a sailor uniform: registered from CHARACTERS
// alone in roster slot 18, her clips cut from one sprite sheet into her own
// folder and read from the real PNGs (tight, 1x, one art-pixel scale,
// anchored on her uniform), five numbered buttons (three ordinary attacks
// with their mid-air versions and two techniques) and an extra attack on the
// ground only. The Kitchen Knife and the Katana Draw up close (her Mash
// Combo), the Air Katana, the Stalker's Lunge and the Stalker's Dive (a
// homing dive; both land far harder in a turned back: `backstab`), the
// Flash Grenade, on the ground and in the air (lobbed: a projectile's `arc`;
// its flash a `gaze` that holds still: `paralyze`), the Diary (a `cloak`)
// and the Axe Swing (10 that shoves a raised guard back, after a breakable
// wind-up). Her Deflect, a flying knee. The roster, credits and translations
// she adds are checked in empty-roster, settings and i18n; the shared `arc`
// in projectile-arc. Layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { duel, fakeSpritesOf, makeFighter, steps, cpuFight } from '../../helpers/fighter-harness.mjs';
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
import { notOurs } from '../../helpers/repository.mjs';

const DIR = 'assets/characters/0018/';
const DEF = getCharacter('0018');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0018_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0018 on her own, and against `target` (#0009 by default) at `gap`.
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

const { images: IMAGES, sprites: REAL } = realArt(DEF);

// Every clip and the files it plays, in order (a file shown twice is one
// file on disk).
const CLIPS = {
  idle: named('idle', 2),
  run: named('run', 6),
  jump: named('jump', 2),
  fall: named('fall', 2),
  land: named('land', 1),
  mouvment: named('mouvment', 2),
  midair_mouvment: named('midair_mouvment', 2),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 2),
  prepshield: named('prepshield', 1),
  shielding: named('shielding', 1),
  releaseshield: named('releaseshield', 1),
  deflect: named('deflect', [1, 2, 2, 3]),
  attack1: named('attack1', [1, 2, 2, 3, 3]),
  midair_attack1: named('midair_attack1', [1, 2, 2, 3]),
  attack2: named('attack2', [1, 2, 3, 4, 4, 4, 5, 5]),
  midair_attack2: named('midair_attack2', [1, 1, 2, 3, 3, 3, 3, 3]),
  attack3: named('attack3', [1, 2, 3, 4, 4, 5, 5, 6, 7, 7]),
  midair_attack3: named('midair_attack3', [1, 2, 3, 4, 4]),
  attack4_cast: named('attack4', [1, 2, 3, 4, 5, 6, 6]),
  attack4_release: named('attack4', [5, 4, 3, 7]),
  attack5_cast: named('attack5', [1, 1, 2, 2, 2, 2]),
  attack5_release: named('attack5', [3, 3, 4, 4]),
  extra_attack: named('extra_attack', [1, 2, 3, 3, 4, 5]),
};
const GRENADE = named('attack3_object', 1);
const FILES = [...new Set([...Object.values(CLIPS).flat(), ...GRENADE])].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 50, run: 50, jump: 52, fall: 52, land: 41, mouvment: 42, midair_mouvment: 42, hurt: 45, midair_hurt: 45,
  prepshield: 50, shielding: 48, releaseshield: 50, deflect: 45, attack1: 48, midair_attack1: 54, attack2: 49,
  midair_attack2: 39, attack3: 57, midair_attack3: 57, attack4_cast: 51, attack4_release: 51, attack5_cast: 45,
  attack5_release: 44, extra_attack: 50,
};

// ---- Registration -------------------------------------------------------------------

test('#0018 is a real CHARACTERS entry: available, in roster slot 18, after #0001 to #0017', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0018'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0018');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 17);
  assert.deepEqual(playableCharacters().map((c) => c.id), [
    '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016',
    '0017', '0018',
  ]);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of her own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('five numbered attacks, each a button of its own: three ordinary with their mid-air versions, the Diary and the Axe Swing, techniques; plus the Katana Draw, on the ground only', () => {
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
  assert.equal(actionType(DEF, 'attack4'), 'technique');
  assert.equal(actionType(DEF, 'attack5'), 'technique');
  assert.equal(DEF.summons, undefined, 'she summons nobody');
  assert.equal(DEF.effectAnimations, undefined);
  for (const t of Object.values(DEF.techniques)) assert.equal(t.heal, undefined, 'she never heals');
  assert.deepEqual(Object.keys(DEF.projectiles).sort(), ['attack3_object', 'midair_attack3_object'], 'her grenade, her one projectile');
  // In the air her Triangle / Y does nothing: the Katana Draw is a ground
  // move and nothing takes its place.
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null, 'nothing in the air');
});

test('nothing she does costs Energy; her grenades wait 3 s, the Diary 3 s and the Axe Swing 5 s', () => {
  const { fighter } = solo();
  for (const a of Object.values(fighter.attacks)) assert.equal(a.energyCost, 0, `${a.id}: free`);
  for (const id of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'extra_attack']) {
    assert.equal(fighter.attacks[id].cooldown, 0, `${id}: no cooldown`);
  }
  for (const id of ['attack3', 'midair_attack3']) assert.equal(fighter.attacks[id].cooldown, 3, `${id}: the flash's hold, 3 s`);
  assert.equal(fighter.techniqueDefs.attack4.cooldown, 3, 'the Diary: a cloak, 3 s');
  assert.equal(fighter.techniqueDefs.attack5.cooldown, 5, 'the Axe Swing for 10: 5 s');
  assert.equal(fighter.techniqueDefs.attack4.energyCost, 0);
  assert.equal(fighter.techniqueDefs.attack5.energyCost, 0);
  assert.equal(fighter.deflect.cooldown, 0);
});

test('her Specials: the Diary and the Axe Swing; her knife, katana, lunge, dive and grenade are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack4', 'attack5']);
  for (const move of ['attack4', 'attack5']) assert.equal(isSpecialAbility(DEF, move), true, move);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
  const { fighter, step } = solo();
  step(P('attack5'));
  assert.equal(activeSpecialAbility(fighter), 'attack5', 'the orange mark while she hefts her axe');
});

test('her Mash Combo: the Kitchen Knife and the Katana Draw', () => {
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'extra_attack'] });
  assert.deepEqual(mashComboProblems(DEF), []);
  assert.equal(DEF.attacks.mash_attack, undefined, 'no button-less partner: both are on her buttons');
  const lunge = mashComboProblems({ ...DEF, mashCombo: { attacks: ['attack1', 'attack2'] } });
  assert.ok(lunge.length > 0, 'the Stalker\'s Lunge, a long lunge of her own, is no close-range partner');
  const { fighter, step } = solo();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    step(P('attack1'));
    for (let k = 0; k < 4; k++) seen.push(step({}).combat.attack?.def.id);
  }
  for (let i = 0; i < steps(7); i++) seen.push(step({}).combat.attack?.def.id);
  assert.ok(seen.includes('extra_attack'), 'the Katana Draw is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('her in-game names and touch buttons name each move, in English and French, each on a frame of her own art', () => {
  const moves = [
    'attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'attack5', 'extra_attack',
  ];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Kitchen Knife', 'Air Katana', 'Stalker\'s Lunge', 'Stalker\'s Dive', 'Flash Grenade', 'Air Flash Grenade', 'Diary',
    'Axe Swing', 'Katana Draw',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Kitchen Knife', 'Stalker\'s Lunge', 'Flash Grenade', 'Diary', 'Axe Swing', 'Katana Draw']);
  assert.deepEqual(buttons('fr'), [
    'Couteau de cuisine', 'Fente de la traqueuse', 'Grenade aveuglante', 'Journal', 'Coup de hache', 'Dégainage du katana',
  ]);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3'].map((m) => STRINGS.fr[`ability.0018.${m}`]),
    ['Katana aérien', 'Plongeon de la traqueuse', 'Grenade aveuglante aérienne']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].map((a) => art(a)), [
    '0018_attack1_2.png', '0018_attack2_4.png', '0018_attack3_6.png', '0018_attack4_6.png', '0018_attack5_3.png', '0018_extra_attack_3.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack3'].map((a) => art(a, true)), [
    '0018_midair_attack1_2.png', '0018_midair_attack2_3.png', '0018_midair_attack3_3.png',
  ]);
  for (const a of ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0018.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('her recommended controller layout: her knife on Square, the katana on Triangle, the grenade on R2, the lunge and the dive on the right stick forward, the Diary on L2, the axe on Circle', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:extra_attack': pad('north'),
    'ground:attack2': flick('forward'),
    'ground:attack3': pad('r2'),
    'ground:attack4': pad('l2'),
    'ground:attack5': pad('east'),
    'air:attack1': pad('west'),
    'air:attack2': flick('forward'),
    'air:attack3': pad('r2'),
  });
  assert.equal(DEF.controller.previous, undefined, 'new: no layout of before');
});

// ---- Art --------------------------------------------------------------------------

test('her folder holds exactly the frames her clips and her grenade play: every file named <id>_<codename>_<frame>.png', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 69);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  assert.deepEqual(DEF.projectileAnimations.attack3_object.frames.map(file), GRENADE);
  // A clip plays its own codename's files: a drawing two codenames share
  // (her Dash's lean in the air, her lunge as her dive, her throw from the
  // ground and from the air, her springing up as she hops to throw, her
  // hand at her sheathed katana as her guard rises and falls) is one file
  // under each, and none twice under one (the sheet's grenade, drawn five
  // times the same along its arc, is one file; her phone lowered, the way
  // it came, plays the files it was raised with).
  const seen = new Map();
  const same = [];
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const key = `${w}x${h}:${Buffer.from(pixels).toString('base64')}`;
    const codename = name.replace(/^0018_/, '').replace(/_\d+\.png$/, '');
    if (seen.has(key)) same.push([seen.get(key), codename]);
    else seen.set(key, codename);
  }
  assert.deepEqual(same.filter(([a, b]) => a === b), [], 'no file twice under one codename');
  assert.deepEqual([...new Set(same.map((pair) => pair.sort().join('=')))].sort(), [
    'attack2=midair_attack2', 'attack3=jump', 'attack3=midair_attack3', 'extra_attack=prepshield', 'extra_attack=releaseshield',
    'midair_mouvment=mouvment',
  ]);
});

test('every frame is cut clean: none of the sheet\'s navy background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 0 && g === 64 && b === 128), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel: about 85 units tall', () => {
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
});

test('anchors keep her body in place: on her uniform, wherever her blades, their arcs or her lunge reach', () => {
  const at = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  assert.deepEqual(at('idle'), [15.5, 13.5]);
  // Her katana's arc, her blade held low behind her and her lunge stretched
  // out would pull the automatic anchor off her body.
  const off = (key, n, codename = key) => {
    const f = REAL.animations[key].frames.find((x) => x.url.endsWith(`_${codename}_${n}.png`));
    return Math.abs(f.anchorArtX - withFakeCanvas(() => f.anchorX));
  };
  for (const [key, n, codename] of [['extra_attack', 3], ['extra_attack', 4], ['attack5_release', 3, 'attack5'], ['attack2', 4]]) {
    assert.ok(off(key, n, codename) > 1, `${key} ${n}: on her body, not her reach`);
  }
  for (const key of ['idle', 'run', 'attack1', 'attack2', 'attack4_cast', 'extra_attack', 'attack5_release', 'hurt']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is her head under her pink hair', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(50 * DEF.visual.portrait.size), 'from her second stance frame, 50 pixels tall');
});

// ---- Up close --------------------------------------------------------------------------

test('the Kitchen Knife: a quick backhand slash, 3 at Base Launch 1 sideways, her quickest blow', () => {
  const d = versus({ gap: 34 });
  d.tick(P('attack1'));
  after(d, 0.4);
  assert.deepEqual(shape(mine(d, 'attack1')), [['hit', 3, 1, 'horizontal']]);
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.05) && near(atk.total, 0.25), 'a twentieth of a second to the slash, a quarter in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const far = versus({ gap: 110 });
  far.tick(P('attack1'));
  after(far, 0.4);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of her knife\'s reach, nothing');
});

test('the Katana Draw: drawn in one cut and sheathed, 3 at Base Launch 2 sideways', () => {
  const d = versus({ gap: 50 });
  d.tick(P('extra_attack'));
  after(d, 0.4);
  assert.deepEqual(shape(mine(d, 'extra_attack')), [['hit', 3, 2, 'horizontal']]);
  const atk = createAttackDefinition({ id: 'extra_attack', ...DEF.attacks.extra_attack });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.3), 'three tenths of a second');
  assert.equal(atk.stepIn, 'universal');
  assert.equal(atk.groundOnly, true);
});

test('the Air Katana: her katana swept round before her in mid-air, 3 at Base Launch 2 sideways', () => {
  const d = versus({ gap: 50 });
  hold(d.attacker, 40);
  hold(d.target, 40);
  d.tick(P('attack1'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack1');
  after(d, 0.4);
  assert.deepEqual(shape(mine(d, 'midair_attack1')), [['hit', 3, 2, 'horizontal']]);
});

// ---- The stalker ------------------------------------------------------------------------

test('the Stalker\'s Lunge: away low along the ground, knife first (3 at Base Launch 1); into a back turned to her, 5 at Base Launch 3', () => {
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  assert.equal(atk.motion.type, 'roll', 'away along the ground, her own motion');
  assert.equal(atk.stepIn, 'exempt', 'no Step-in on top of it');
  assert.ok(near(atk.total, 8 / 15), 'eight fifteenths of a second');
  const { fighter, step } = solo();
  const x0 = fighter.body.x;
  step(P('attack2'));
  for (let i = 0; i < steps(0.6); i++) step({});
  assert.ok(fighter.body.x - x0 > 80, `a real lunge (${(fighter.body.x - x0).toFixed(0)} units)`);
  const front = versus({ gap: 130 });
  front.tick(P('attack2'));
  after(front, 0.7);
  assert.deepEqual(mine(front, 'attack2').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch, e.backstab]),
    [['hit', 3, 1, 'horizontal', false]]);
  const back = versus({ gap: 130, targetFacing: 1 });
  back.tick(P('attack2'));
  after(back, 0.7);
  const stab = mine(back, 'attack2');
  assert.deepEqual(stab.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch, e.backstab]), [['hit', 5, 3, 'horizontal', true]]);
  assert.ok(stab[0].launchSpeed > mine(front, 'attack2')[0].launchSpeed, 'sent flying');
  const blocked = versus({ gap: 130 });
  blocked.tick(P('attack2'), { shield: true });
  after(blocked, 0.7, {}, { shield: true });
  assert.deepEqual(mine(blocked, 'attack2').map((e) => [e.type, e.damage, e.backstab]), [['block', 0, false]]);
  const far = versus({ gap: 220 });
  far.tick(P('attack2'));
  after(far, 0.7);
  assert.deepEqual(mine(far, 'attack2'), [], 'past her lunge, nothing');
});

test('the Stalker\'s Dive: from mid-air, knife first straight at her prey wherever it is (homing), once per airtime; harder into a turned back', () => {
  const atk = createAttackDefinition({ id: 'midair_attack2', ...DEF.attacks.midair_attack2 });
  assert.equal(atk.motion.type, 'homing');
  assert.equal(atk.airUses, 1);
  // Her prey on the ground below and ahead: she dives down at it.
  const d = versus({ gap: 140 });
  hold(d.attacker, 90);
  d.attacker.body.gravityScale = 1;
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack2');
  after(d, 0.6);
  assert.deepEqual(shape(mine(d, 'midair_attack2')), [['hit', 3, 2, 'horizontal']]);
  const back = versus({ gap: 140, targetFacing: 1 });
  hold(back.attacker, 90);
  back.attacker.body.gravityScale = 1;
  back.tick(P('attack2'));
  after(back, 0.6);
  assert.deepEqual(mine(back, 'midair_attack2').map((e) => [e.damage, e.baseLaunch, e.backstab]), [[5, 3, true]]);
});

// ---- The Flash Grenade ---------------------------------------------------------------

test('the Flash Grenade: a hop, then a grenade lobbed in an arc, rising and coming down ahead of her; the floor ends it', () => {
  const proj = DEF.projectiles.attack3_object;
  assert.deepEqual(proj.arc, { lift: 120, gravity: 1500 });
  assert.ok(-DEF.attacks.attack3.projectile.offset.y > proj.hitbox.h / 2, 'its box clear of the floor as it leaves her hand');
  const d = versus({ gap: 2000 });
  const x0 = d.attacker.body.x;
  const floor = d.attacker.body.y;
  d.tick(P('attack3'));
  assert.equal(d.attacker.combat.attack?.def.id, 'attack3');
  let hop = 0;
  const path = [];
  for (let i = 0; i < steps(1.4); i++) {
    d.tick();
    hop = Math.max(hop, floor - d.attacker.body.y);
    for (const p of d.projectiles) path.push({ x: p.x - x0, up: floor - p.y });
  }
  assert.ok(hop > 30 && hop < 60, `she hops (${hop.toFixed(0)} units)`);
  assert.ok(path.length > 10, 'it flies');
  const top = Math.max(...path.map((p) => p.up));
  assert.ok(top > path[0].up, 'it rises first');
  assert.ok(path.at(-1).up < path[0].up - 80, 'then comes down');
  assert.ok(path.at(-1).x > 220 && path.at(-1).x < 300, `landing about 260 units ahead (${path.at(-1).x.toFixed(0)})`);
  assert.equal(d.projectiles.length, 0, 'the floor ended it');
  assert.equal(d.attacker.grounded, true, 'and she is down again');
});

test('the flash holds still whoever it reaches facing it: 1, no launch, a 1 s paralysis; a back turned to it is passed by', () => {
  const d = versus({ gap: 220 });
  d.tick(P('attack3'));
  d.until(() => mine(d, 'attack3_object').length > 0);
  assert.deepEqual(mine(d, 'attack3_object').map((e) => [e.type, e.damage, e.baseLaunch, e.source]), [['hit', 1, 0, 'projectile']]);
  assert.ok(d.target.combat.paralysis > 0.9, 'held still for its second');
  assert.ok(d.attacker.combat.cooldowns.has('attack3'), 'the policy\'s 3 s, for its hold, from the throw');
  // Its back to her: the flash is not seen.
  const away = versus({ gap: 220, targetFacing: 1 });
  away.tick(P('attack3'));
  after(away, 1.2);
  assert.deepEqual(mine(away, 'attack3_object'), [], 'passed by');
  // Too close: the lob sails over.
  const close = versus({ gap: 80 });
  close.tick(P('attack3'));
  after(close, 1.2);
  assert.deepEqual(mine(close, 'attack3_object'), [], 'over its head');
  // A raised Shield blocks it.
  const blocked = versus({ gap: 220 });
  blocked.tick(P('attack3'), { shield: true });
  after(blocked, 1.2, {}, { shield: true });
  assert.deepEqual(mine(blocked, 'attack3_object').map((e) => e.type), ['block']);
});

test('the Air Flash Grenade: thrown level from mid-air, falling on whoever is below and ahead', () => {
  assert.deepEqual(DEF.projectiles.midair_attack3_object.arc, { lift: 0, gravity: 1500 });
  const d = versus({ gap: 200 });
  hold(d.attacker, 120);
  d.tick(P('attack3'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack3');
  after(d, 1.2);
  assert.deepEqual(mine(d, 'midair_attack3_object').map((e) => [e.type, e.damage]), [['hit', 1]]);
  assert.ok(d.target.combat.paralysis > 0, 'held still');
});

test('flashed, then got behind: the lunge into the back it cannot turn', () => {
  const d = versus({ gap: 220 });
  d.tick(P('attack3'));
  d.until(() => d.target.combat.paralysis > 0);
  d.until(() => d.attacker.grounded && !d.attacker.combat.attack);
  // She walks round behind it while it is held still.
  d.attacker.body.x = d.target.body.x + 60;
  d.attacker.facing = -1;
  d.tick(P('attack2'));
  after(d, 0.6);
  assert.deepEqual(mine(d, 'attack2').map((e) => [e.damage, e.backstab]), [[5, true]]);
});

// ---- The Diary --------------------------------------------------------------------------

test('the Diary: seven tenths of a second with her phone out, then she is out of sight for 3 s; every 3 s, no Energy', () => {
  const t = DEF.techniques.attack4;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.7) && near(SPRITES.duration(t.releaseAnimation), 0.4));
  const { fighter, step } = solo();
  step(P('attack4'));
  assert.equal(activeSpecialAbility(fighter), 'attack4');
  for (let i = 0; i < steps(0.6); i++) step({});
  assert.equal(fighter.combat.cloaked, false, 'not while she reads');
  for (let i = 0; i < steps(0.15); i++) step({});
  assert.equal(fighter.combat.cloaked, true, 'out of sight');
  assert.ok(fighter.combat.abilityCooldowns.active('attack4'), 'its cooldown from the release');
  assert.equal(fighter.combat.energy, 100, 'no Energy');
  for (let i = 0; i < steps(3.1); i++) step({});
  assert.equal(fighter.combat.cloaked, false, 'until it runs out');
});

test('a hit while she reads breaks the Diary: no cloak, no cooldown; her first strike shows her again', () => {
  const d = versus({ gap: 70 });
  d.tick(P('attack4'));
  for (let i = 0; i < 10; i++) d.tick();
  new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 }));
  after(d, 1);
  assert.equal(d.attacker.technique, null, 'broken');
  assert.equal(d.attacker.combat.cloaked, false);
  assert.equal(d.attacker.combat.abilityCooldowns.active('attack4'), false);
  const s = versus({ gap: 40 });
  s.attacker.combat.cloakFor(3);
  s.tick(P('attack1'));
  assert.equal(s.attacker.combat.cloaked, false, 'shown as she strikes');
});

// ---- The Axe Swing ---------------------------------------------------------------------

test('the Axe Swing: three fifths of a second hefting her axe, then swung up and round her: 10 at Base Launch 3 straight up; 5 s', () => {
  const t = DEF.techniques.attack5;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.6) && near(SPRITES.duration(t.releaseAnimation), 4 / 15));
  const d = versus({ gap: 60 });
  d.tick(P('attack5'));
  assert.equal(d.attacker.technique?.def.id, 'attack5');
  after(d, 0.5);
  assert.deepEqual(mine(d, 'attack5'), [], 'nothing while she hefts it');
  after(d, 0.2);
  assert.deepEqual(shape(mine(d, 'attack5')), [['hit', 10, 3, 'vertical']]);
  assert.equal(d.attacker.combat.abilityCooldowns.duration('attack5'), 5);
  // Behind her too: the arc starts by her heels.
  const behind = versus({ gap: -20 });
  behind.tick(P('attack5'));
  after(behind, 0.8);
  assert.equal(mine(behind, 'attack5').length, 1, 'just behind her');
  const far = versus({ gap: 120 });
  far.tick(P('attack5'));
  after(far, 0.8);
  assert.deepEqual(mine(far, 'attack5'), [], 'out of its arc');
});

test('a raised guard blocks the Axe Swing but is shoved back; a hit while she hefts it breaks it', () => {
  const blocked = versus({ gap: 60 });
  blocked.tick(P('attack5'), { shield: true });
  after(blocked, 0.6, {}, { shield: true });
  const x0 = blocked.target.body.x;
  after(blocked, 0.25, {}, { shield: true });
  assert.deepEqual(mine(blocked, 'attack5').map((e) => e.type), ['block']);
  assert.ok(blocked.target.body.x - x0 > 15, `shoved back (${(blocked.target.body.x - x0).toFixed(0)} units)`);
  const d = versus({ gap: 60 });
  d.tick(P('attack5'));
  for (let i = 0; i < 10; i++) d.tick();
  new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 }));
  after(d, 0.8);
  assert.equal(d.attacker.technique, null, 'broken');
  assert.deepEqual(mine(d, 'attack5'), []);
  assert.equal(d.attacker.combat.abilityCooldowns.active('attack5'), false);
});

// ---- Defense --------------------------------------------------------------------------

test('her Deflect: a flying knee, in the air, that kicks projectiles back', () => {
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
    owner: d.attacker, def, anim: d.attacker.sprites.projectile(def.animation), x: b.x - 120, y: b.y - 40, direction: 1,
  }));
  after(d, 0.3);
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0018');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.deflections.length, 'kicked back');
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays her whole kit: her knife and katana, the lunge and the dive, the grenade, the Diary and the axe', () => {
  const used = new Map();
  let flashed = 0;
  for (const difficulty of ['medium', 'brutal']) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const foe of ['0001', '0007', '0003']) {
        const { log, events } = cpuFight(DEF, getCharacter(foe), { seconds: 30, seed, difficulty });
        const me = [...log.keys()].find((f) => f.def === DEF && f.slot === 'p1');
        for (const [k, v] of me.controller.telemetry.moveUsage) used.set(k, (used.get(k) ?? 0) + v);
        flashed += events.filter((e) => e.attacker === me && e.source === 'projectile' && e.type === 'hit' && !e.redirected).length;
      }
    }
  }
  for (const move of ['attack1:ground', 'attack1:air', 'attack2:ground', 'attack3:ground', 'attack4:ground', 'attack5:ground', 'extra_attack:ground']) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
  assert.ok(flashed > 0, `its grenades find their mark (${flashed})`);
});

// ---- Her source -----------------------------------------------------------------------

// The character behind #0018, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who she is.) Her
// names, her beloved's and her series' are put together here so this file
// never spells them.
const UNNAMED = new RegExp([
  ['g', 'a', 's', 'a', 'i'].join(''),
  `\\b${['y', 'u', 'n', 'o'].join('')}\\b`,
  ['y', 'u', 'k', 'i', 't', 'e', 'r', 'u'].join(''),
  ['y', 'u', 'k', 'k', 'i'].join(''),
  `\\b${['m', 'i', 'r', 'a', 'i'].join('')}\\b`,
  ['n', 'i', 'k', 'k', 'i'].join(''),
  ['f', 'u', 't', 'u', 'r', 'e', ' ', 'd', 'i', 'a', 'r', 'y'].join(''),
].join('|'), 'i');
const BINARY = /\.(png|jpe?g|gif|webp|ico)$/i;

function repositoryPaths(dir = '') {
  return readdirSync(`${ROOT}${dir}` || './', { withFileTypes: true }).flatMap((e) => {
    // Not the repository's own (tests/helpers/repository.mjs).
    const path = `${dir}${e.name}`;
    if (notOurs(path)) return [];
    return e.isDirectory() ? [`${path}/`, ...repositoryPaths(`${path}/`)] : [path];
  });
}

test('the character behind #0018 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0018.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: her name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
});
