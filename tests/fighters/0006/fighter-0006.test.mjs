// Run with node --test tests/fighters/0006/fighter-0006.test.mjs (no dependencies).
// #0006, three sisters who are one fighter: registered once, playable, in
// roster slot 06; its three members' clips cut from one sprite sheet into
// its own folder and read from the real PNGs (tight, 1x, one art-pixel
// scale for all three); one Fighter, one body, one hurtbox, one Launch
// Point, one Energy bar and one Shield, drawn as three members who move,
// jump, fall, Dash, air dash, shield, get hit, fly, fall into the Void and
// come back together; five numbered buttons (two ordinary attacks with
// their mid-air versions and three techniques) and an extra attack, each
// move performed by the sister(s) it names: pink's Power Punch, Heat
// Vision's beam and Ice Breath's freeze, blue's Flying Kick and Sonic
// Scream (carrying, turning shots back, pushing a Shield), green's Tornado
// Spin (pulling, carrying, sweeping up), Flying Punch and Deflect, and the
// Triple Strike of all three, one hit however many draw it; the CPU, the
// camera and a whole Battle treating it as one fighter; and its source
// characters named nowhere. The shared ensemble rules it is built on are
// checked on made-up formations and a test-only fighter in
// tests/systems/ensemble.test.mjs. Paint still needs a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { DT, duel, fakeSpritesOf, makeFighter, steps, cpuFight } from '../../helpers/fighter-harness.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { CHARACTERS, characterFramePaths, getCharacter, getPlayableCharacter, playableCharacters } from '../../../js/data/characters.js';
import { GROUP_CLIPS, ensembleProblems, memberIds } from '../../../js/data/ensemble.js';
import { describeLoadout, loadoutProblems } from '../../../js/data/loadout.js';
import { comfortProblems } from '../../../js/data/controller-profiles.js';
import { abilityName } from '../../../js/data/abilities.js';
import { isSpecialAbility } from '../../../js/data/special-abilities.js';
import { pad, flick } from '../../../js/data/characters/helpers.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { EnsembleAnimator, fighterParts } from '../../../js/game/rendering/ensemble.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { analyzeCapabilities } from '../../../js/game/ai/cpu-intelligence/capabilities.js';
import { Battle } from '../../../js/game/battle.js';
import { getMap } from '../../../js/data/maps.js';
import { CONFIG } from '../../../js/config.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';
import { ENSEMBLE_FIGHTER } from '../fixtures/ensemble-fighter.mjs';

globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const DIR = 'assets/characters/0006/';
const DEF = getCharacter('0006');
const DEF_0001 = getCharacter('0001');
const UNIT = 88 / 52;
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const keys = (f) => f.animator.members.map((m) => m.animator.stateKey);
const member = (f, id) => f.animator.members.find((m) => m.id === id);
const home = (id) => DEF.ensemble.members.find((m) => m.id === id).home;
const solo = (opts = {}) => makeFighter({ character: DEF, ...opts });
// #0006 against #0001 (or `target`) at `gap`.
const versus = (opts = {}, target = DEF_0001) => duel({ attackerCharacter: DEF, targetCharacter: target, ...opts });
// Its hits (and blocks) with `move`.
const mine = (d, move) => d.events.filter((e) => e.attacker === d.attacker && (e.move === move || e.ability === move));
const after = (d, seconds, held = {}, targetHeld = {}) => {
  for (let i = 0; i < steps(seconds); i++) d.tick(held, targetHeld);
};
// Into the air, `rise` steps after a jump.
const airborne = (tick, rise = 8) => {
  tick(P('jump'));
  for (let i = 0; i < rise; i++) tick({ jump: true });
};

// How many files each member's clips have, by codename (the rest: one).
const COUNTS = {
  pink: { idle: 6, run: 7, midair_hurt: 3, mouvment: 2, attack1: 3, attack3: 4, attack4: 10, extra_attack: 4 },
  green: { idle: 3, run: 5, midair_hurt: 3, mouvment: 2, deflect: 3, attack2: 10, midair_attack2: 4, mash_attack: 4, extra_attack: 4 },
  blue: { idle: 3, run: 6, midair_hurt: 3, mouvment: 2, midair_attack1: 3, attack5: 8, extra_attack: 4 },
};
const SINGLES = ['jump', 'fall', 'land', 'hurt', 'prepshield', 'shielding', 'releaseshield', 'midair_mouvment'];
const OBJECTS = { attack3_object: 3, attack5_object: 2 };
const FILES = [
  ...Object.entries(COUNTS).flatMap(([id, counts]) => [...SINGLES.map((c) => [c, 1]), ...Object.entries(counts)]
    .flatMap(([codename, n]) => Array.from({ length: n }, (_, i) => `0006_${codename}_${id}_${i + 1}.png`))),
  ...Object.entries(OBJECTS).flatMap(([codename, n]) => Array.from({ length: n }, (_, i) => `0006_${codename}_${i + 1}.png`)),
].sort();
// Every clip's tallest frame (art pixels).
const HEIGHTS = {
  pink: {
    idle: 43, run: 35, jump: 42, fall: 43, land: 42, hurt: 37, midair_hurt: 37, prepshield: 42, shielding: 45, releaseshield: 42, mouvment: 31, midair_mouvment: 40,
    attack1: 43, attack3_cast: 41, attack3_release: 40, attack4_cast: 41, attack4_release: 38, extra_attack: 45,
  },
  green: {
    idle: 30, run: 29, jump: 36, fall: 30, land: 30, hurt: 29, midair_hurt: 29, prepshield: 33, shielding: 42, releaseshield: 29, mouvment: 25, midair_mouvment: 28,
    deflect: 33, attack2: 30, midair_attack2: 30, mash_attack: 30, extra_attack: 38,
  },
  blue: {
    idle: 30, run: 29, jump: 36, fall: 30, land: 30, hurt: 32, midair_hurt: 32, prepshield: 30, shielding: 43, releaseshield: 29, mouvment: 25, midair_mouvment: 28,
    midair_attack1: 29, attack5_cast: 29, attack5_release: 43, extra_attack: 38,
  },
};
// The codename a clip's files carry: its key, or a technique's own
// (attack4_cast plays attack4's files).
const codenameOf = (key) => key.replace(/_(cast|release)$/, '');

const { images: IMAGES, sprites: REAL } = realArt(DEF);

// ---- Registration and kit ----------------------------------------------------------

test('#0006 is a real CHARACTERS entry: available, in roster slot 06, after #0001 to #0005', () => {
  assert.equal(CHARACTERS.filter((c) => c.id === '0006').length, 1);
  assert.equal(CHARACTERS.find((c) => c.id === '0006'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0006');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 5, 'the sixth slot');
  assert.equal(getPlayableCharacter('0006'), DEF);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.deepEqual(ensembleProblems(DEF), []);
  // No movement of its own; its refill rate and launch reaction, as every
  // fighter has.
  for (const field of ['movement', 'powers', 'launchBounce']) assert.equal(DEF[field], undefined, field);
  assert.deepEqual(DEF.energy, { regen: 14 });
  assert.deepEqual(DEF.launchReaction, { stunPerThousand: 0.15, maxStun: 0.55, tumbleSpeed: 1100, steerAngle: 20 });
});

test('five numbered attacks, each a button of its own: two ordinary with mid-air versions, three techniques; plus the Triple Strike', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { type: 'technique', id: 'attack3' },
    attack4: { type: 'technique', id: 'attack4' },
    attack5: { type: 'technique', id: 'attack5' },
  });
  assert.deepEqual(describeLoadout(DEF), {
    numbered: ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'],
    buttons: ['attack1', 'attack2', 'attack3', 'attack4', 'attack5'],
    air: { attack1: 'midair_attack1', attack2: 'midair_attack2' },
    types: { attack1: 'attack', attack2: 'attack', attack3: 'technique', attack4: 'technique', attack5: 'technique' },
    extra: true,
  });
  // mash_attack is green's Knockout Punch, its Mash Combo partner: no
  // button performs it.
  assert.deepEqual(Object.keys(DEF.attacks).sort(), ['attack1', 'attack2', 'extra_attack', 'mash_attack', 'midair_attack1', 'midair_attack2']);
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'mash_attack'] });
  assert.deepEqual(Object.keys(DEF.techniques), ['attack3', 'attack4', 'attack5']);
  assert.deepEqual(Object.keys(DEF.projectiles), ['attack3_object', 'attack5_object']);
  assert.equal(DEF.summons, undefined);
  // Who performs each: one sister a move, all three for the Triple Strike,
  // green for the Deflect.
  const who = Object.fromEntries([...Object.entries(DEF.attacks), ...Object.entries(DEF.techniques)].map(([id, s]) => [id, s.members]));
  assert.deepEqual(who, {
    attack1: ['pink'], midair_attack1: ['blue'], attack2: ['green'], midair_attack2: ['green'], extra_attack: ['pink', 'green', 'blue'],
    mash_attack: ['green'],
    attack3: ['pink'], attack4: ['pink'], attack5: ['blue'],
  });
  // Its cooldowns are the policy's: Ice Breath's freeze 3 s, none for the
  // rest, the Deflect included; its two ordinary projectile techniques
  // cost 15 Energy instead.
  const { fighter: f } = solo();
  for (const id of Object.keys(DEF.attacks)) assert.equal(f.attacks[id].cooldown, 0, id);
  assert.deepEqual(Object.values(f.techniqueDefs).map((t) => t.cooldown), [0, 3, 0]);
  assert.deepEqual(Object.values(f.techniqueDefs).map((t) => t.energyCost), [15, 0, 15]);
  assert.equal(f.deflect.cooldown, 0);
});

test('one Special: Ice Breath; Heat Vision, the Sonic Scream and the Triple Strike are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack4']);
  assert.equal(isSpecialAbility(DEF, 'attack4'), true);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'attack5', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of the performing sister\'s art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Power Punch', 'Flying Kick', 'Tornado Spin', 'Flying Punch', 'Heat Vision', 'Ice Breath', 'Sonic Scream', 'Triple Strike',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Triple Strike', 'Power Punch', 'Tornado Spin', 'Heat Vision', 'Ice Breath', 'Sonic Scream']);
  assert.deepEqual(buttons('fr'), ['Triple frappe', 'Coup de poing', 'Tornade', 'Vision laser', 'Souffle glacé', 'Cri sonique']);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'mash_attack'].map((m) => STRINGS.fr[`ability.0006.${m}`]),
    ['Coup de pied volant', 'Coup de poing volant', 'Coup de poing assommant']);
  assert.equal(abilityName(DEF, 'mash_attack'), 'Knockout Punch', 'its Mash Combo partner');
  // Each button's picture is the move's own art, from the sister who
  // performs it: pink's burst, her jab, green's tornado, the beam, pink's
  // gale, blue's scream; in the air blue's kick and green's punch.
  const art = (a, air = false) => file(previewFrame(DEF, a, air)?.url ?? 'none');
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => art(a)), [
    '0006_extra_attack_pink_2.png', '0006_attack1_pink_1.png', '0006_attack2_green_7.png', '0006_attack3_object_2.png',
    '0006_attack4_pink_6.png', '0006_attack5_blue_5.png',
  ]);
  assert.deepEqual(['attack1', 'attack2'].map((a) => art(a, true)), ['0006_midair_attack1_blue_2.png', '0006_midair_attack2_green_3.png']);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0006.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: punches on Square, green on Triangle, the Triple Strike on Circle, the beam on R2, Ice Breath on L2, the scream forward on the right stick', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:extra_attack': pad('east'),
    'ground:attack3': pad('r2'),
    'ground:attack4': pad('l2'),
    'ground:attack5': flick('forward'),
    'air:attack1': pad('west'),
    'air:attack2': pad('north'),
    'air:extra_attack': pad('east'),
  });
  assert.deepEqual(comfortProblems(DEF, DEF.controller.layout), [], 'the comfort rules, every one');
});

test('three members, back to front pink, green and blue: pink hovering in the middle, green behind, blue in front', () => {
  assert.deepEqual(memberIds(DEF), ['pink', 'green', 'blue']);
  assert.deepEqual(DEF.ensemble.members.map((m) => [m.id, m.home]), [
    ['pink', { x: 0, y: -14 }], ['green', { x: -19, y: 0 }], ['blue', { x: 19, y: 0 }],
  ]);
  assert.deepEqual(DEF.animations, {}, 'its art is its members\'');
  for (const m of DEF.ensemble.members) {
    for (const key of GROUP_CLIPS) assert.ok(m.animations[key], `${m.id}: ${key}`);
    assert.equal('deflect' in m.animations, m.id === 'green', `${m.id}: the Deflect is green's`);
  }
  assert.deepEqual(DEF.deflect.members, ['green']);
  assert.equal(DEF.ensemble.referenceMember, 'pink');
  assert.deepEqual([DEF.ensemble.retreat, DEF.ensemble.spacing, DEF.ensemble.glide], [18, 18, 260]);
  assert.deepEqual(DEF.ensemble.float, { height: 3, period: 1.4 });
});

// ---- The art ----------------------------------------------------------------------

test('its folder holds exactly the frames its members\' clips and its objects play: every file <id>_<codename>_<member>_<frame>.png', () => {
  const files = readdirSync(`${ROOT}${DIR}`).sort();
  assert.deepEqual(files, FILES);
  assert.equal(files.length, 135);
  assert.deepEqual(characterFramePaths(DEF).map(file).sort(), FILES, 'every file loaded, none missing');
  for (const m of DEF.ensemble.members) {
    for (const [key, clip] of Object.entries(m.animations)) {
      for (const [i, url] of clip.frames.entries()) {
        assert.match(file(url), new RegExp(`^0006_${codenameOf(key)}_${m.id}_\\d+\\.png$`), `${m.id} ${key} ${i}`);
      }
    }
  }
  for (const [key, clip] of Object.entries(DEF.projectileAnimations)) {
    for (const url of clip.frames) assert.match(file(url), new RegExp(`^0006_${key}_\\d+\\.png$`), key);
  }
  // A file shown twice is one file: pink's idle shows its first frame
  // again, green's Deflect its whirl twice, Ice Breath ends on its second
  // frame (the breath drawn in), the Triple Strike holds its streak.
  const of = (id, key) => DEF.ensemble.members.find((m) => m.id === id).animations[key].frames.map(file);
  assert.deepEqual(of('pink', 'idle'), [1, 2, 3, 4, 5, 1, 6].map((n) => `0006_idle_pink_${n}.png`));
  assert.deepEqual(of('green', 'deflect'), [1, 2, 2, 3].map((n) => `0006_deflect_green_${n}.png`));
  assert.deepEqual(of('pink', 'attack4_cast'), [1, 2, 3, 4].map((n) => `0006_attack4_pink_${n}.png`));
  assert.deepEqual(of('pink', 'attack4_release'), [5, 6, 7, 8, 9, 10, 2].map((n) => `0006_attack4_pink_${n}.png`));
  for (const id of ['pink', 'green', 'blue']) {
    assert.deepEqual(of(id, 'extra_attack'), [1, 1, 2, 3, 2, 4].map((n) => `0006_extra_attack_${id}_${n}.png`));
  }
  // No copy of a frame within a clip's files.
  for (const name of FILES) {
    const { pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const twins = FILES.filter((other) => other !== name && other.replace(/_\d+\.png$/, '') === name.replace(/_\d+\.png$/, ''))
      .filter((other) => Buffer.compare(Buffer.from(decodePng(`${ROOT}${DIR}${other}`).pixels), Buffer.from(pixels)) === 0);
    assert.deepEqual(twins, [], `${name}: no copy of it in its own clip`);
  }
});

test('every frame is cut clean: none of the sheet\'s grey background left, fully opaque or clear, cropped tight', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 70 && g === 71 && b === 71), `${name}: none of the sheet's background`);
    }
    const any = (n, f) => Array.from({ length: n }, (_, i) => i).some(f);
    assert.ok(any(w, (x) => alpha(x, 0)) && any(w, (x) => alpha(x, h - 1)) && any(h, (y) => alpha(0, y)) && any(h, (y) => alpha(w - 1, y)), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, all three at the roster\'s size per art pixel; the group is 57 art pixels tall', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 57, 'pink\'s 43, lifted 14');
  assert.ok(near(REAL.worldPerArt, UNIT));
  assert.ok(near(DEF.visual.height, 57 * UNIT), 'about 96 units');
  for (const m of REAL.members) {
    assert.ok(near(m.set.worldPerArt, UNIT), `${m.id}: the same pixel size`);
    assert.deepEqual(Object.keys(m.set.animations).sort(), Object.keys(HEIGHTS[m.id]).sort(), `${m.id}: every clip`);
    const clips = DEF.ensemble.members.find((x) => x.id === m.id).animations;
    for (const [key, anim] of Object.entries(m.set.animations)) {
      assert.ok(near(anim.maxArtH, HEIGHTS[m.id][key]), `${m.id} ${key}: tallest frame ${anim.maxArtH}`);
      for (const [i, f] of anim.frames.entries()) {
        assert.ok(near(f.unit, 1), `${m.id} ${key}: one file pixel per art pixel`);
        assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth) && near(f.artH, IMAGES.get(f.url).naturalHeight));
        // Standing on the bottom of its art, unless the clip says where
        // its feet are (a gale or a burst reaching below them).
        assert.equal(f.anchorArtY, clips[key].anchorY?.[i] ?? f.artH, `${m.id} ${key} ${i}: its feet`);
      }
    }
  }
  // The projectiles' art, at the same pixel size.
  for (const key of Object.keys(OBJECTS)) assert.ok(REAL.projectiles[key]?.frames.length === OBJECTS[key], key);
});

test('the portrait is the group: all three at home, cropped round their heads', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait);
  assert.equal(portrait.width, portrait.height);
  // Green's left edge to blue's right, at home.
  const idle = (id) => REAL.member(id).animations.idle.frames[0];
  const left = -19 - idle('green').anchorArtX;
  const right = 19 - idle('blue').anchorArtX + idle('blue').artW;
  assert.equal(portrait.width, Math.round((right - left) * DEF.visual.portrait.size));
  assert.equal(DEF.visual.portrait.size, 0.8);
});

// ---- One fighter --------------------------------------------------------------------

test('one Fighter: one body, one collider, one pushbox, one hurtbox, one Launch Point, one Energy bar, one Shield', () => {
  const { fighter: f } = solo();
  assert.ok(f.animator instanceof EnsembleAnimator);
  assert.equal(f.animator.members.length, 3);
  // Round the middle of the group, pink's bow to the floor: as wide as a
  // single fighter, green's back and blue's front reaching past it.
  assert.deepEqual(DEF.hurtboxes, [{ x: -18, y: -88, w: 36, h: 88 }]);
  assert.deepEqual(f.hurtboxes, DEF.hurtboxes);
  assert.deepEqual([DEF.collider.width, DEF.collider.height, DEF.pushbox.width], [32, 84, 36], 'a single fighter\'s size');
  assert.equal(f.combat.launchPoint, 0);
  assert.equal(f.combat.energy, 100);
  assert.equal(f.defense.type, 'shield');
  assert.equal(f.deflect.damage, 3);
  assert.equal(f.deflect.baseLaunch, 2);
  assert.equal(f.deflect.cooldown, 0);
});

test('all three are always drawn, together: idle, running, jumping, falling, landing, Dashing, air dashing, shielding, deflecting, attacking', () => {
  const { fighter: f, step } = solo();
  const script = [
    ...Array(30).fill({}), ...Array(20).fill({ runRight: true }), ...Array(30).fill({}), P('jump'), ...Array(70).fill({}),
    { runRight: true, mouvementRightPressed: true }, ...Array(40).fill({}), P('jump'), ...Array(6).fill({ jump: true }),
    { runRight: true, mouvementRightPressed: true }, ...Array(80).fill({}), P('shield'), ...Array(20).fill({ shield: true }),
    ...Array(30).fill({}), P('jump'), ...Array(8).fill({ jump: true }), P('shield'), ...Array(60).fill({}),
    P('attack1'), ...Array(30).fill({}), P('extra_attack'), ...Array(40).fill({}), P('attack5'), ...Array(60).fill({}),
  ];
  const states = new Set();
  for (const held of script) {
    step(held);
    f.interpolate(1);
    states.add(f.state);
    const parts = fighterParts(f);
    assert.equal(parts.length, 3, `${f.state}: three members drawn`);
    assert.deepEqual(new Set(parts.map((p) => p.member)), new Set(['pink', 'green', 'blue']));
    if (f.state !== 'attack' && f.state !== 'technique') {
      const want = f.animationFor(f.state);
      assert.deepEqual(keys(f), [want, want, want], `${f.state}: the same state, the same step`);
    }
  }
  for (const s of ['idle', 'run', 'jump', 'fall', 'land', 'dash', 'shield', 'shieldRelease', 'attack', 'technique']) assert.ok(states.has(s), s);
});

test('one body moves them: the members never leave the fighter, whatever it does, and once settled stand apart', () => {
  const { fighter: f, step } = solo();
  let turning = 0;
  for (const held of [...Array(30).fill({ runRight: true }), P('jump'), ...Array(40).fill({ runLeft: true }), ...Array(60).fill({})]) {
    step(held);
    // Within the formation's own reach of the fighter's origin, never more.
    for (const m of f.animator.members) assert.ok(Math.abs(m.x) <= 19 + 18 + 18 + 1e-9 && m.y <= 0 && m.y >= -14, `${m.id}: ${m.x}, ${m.y}`);
    // Settled, never on one spot: three individuals, 19 apart. A turn
    // passes green and blue by each other, briefly (under a fifth of a
    // second each time).
    const settled = f.animator.members.every((m) => m.x === home(m.id).x * f.facing);
    const xs = f.animator.members.map((m) => m.x).sort((a, b) => a - b);
    if (settled) {
      assert.deepEqual([xs[1] - xs[0], xs[2] - xs[1]], [19, 19]);
      turning = 0;
    } else {
      assert.ok(++turning <= 12, 'in place again soon');
    }
  }
});

test('a hit lands once on the one fighter: one event, its damage once, all three hurt on the same step, and launched they fly as one', () => {
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, gap: 44 });
  d.tick(P('attack1'));
  d.until(() => d.target.state === 'hitstun');
  const events = d.events.filter((e) => e.target === d.target);
  assert.equal(events.length, 1, 'one hit event');
  assert.equal(d.target.combat.launchPoint, events[0].damage, 'its damage once');
  assert.deepEqual(keys(d.target), ['hurt', 'hurt', 'hurt']);
  // Launched hard: one velocity, three flung members on it.
  d.until(() => d.target.state !== 'hitstun');
  for (let i = 0; i < 40; i++) d.tick({});
  d.target.combat.launchPoint = 150;
  d.target.body.x = d.attacker.body.x + 40;
  d.tick(P('extra_attack'));
  d.until(() => d.target.state === 'hitstun' && !d.target.grounded);
  assert.deepEqual(keys(d.target), ['midair_hurt', 'midair_hurt', 'midair_hurt']);
  const before = fighterParts(d.target).map((p) => p.x - d.target.renderX);
  for (let i = 0; i < 5; i++) d.tick({});
  d.target.interpolate(1);
  const after5 = fighterParts(d.target).map((p) => p.x - d.target.renderX);
  assert.deepEqual(after5, before, 'the same places round one flying body');
});

test('one hurtbox: a strike sweeping the whole group lands once, for its own damage, never once per member', () => {
  const d = duel({ attackerCharacter: ENSEMBLE_FIGHTER, targetCharacter: DEF, gap: 40 });
  d.tick({});
  d.tick(P('extra_attack'));
  d.until(() => !d.attacker.combat.attack);
  assert.equal(d.events.filter((e) => e.target === d.target).length, 1);
  assert.equal(d.target.combat.launchPoint, 3);
});

test('the Shield: all three raise their bubbles at once, one Shield blocks the hit once for 15 Energy, and they lower them together', () => {
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, gap: 44 });
  d.tick({}, P('shield'));
  assert.deepEqual(keys(d.target), ['prepshield', 'prepshield', 'prepshield']);
  for (let i = 0; i < 30; i++) d.tick({}, { shield: true });
  assert.deepEqual(keys(d.target), ['shielding', 'shielding', 'shielding']);
  const energy = d.target.combat.energy;
  d.tick(P('attack1'), { shield: true });
  for (let i = 0; i < 30 && !d.events.some((e) => e.target === d.target); i++) d.tick({}, { shield: true });
  const events = d.events.filter((e) => e.target === d.target);
  assert.deepEqual(events.map((e) => e.type), ['block'], 'one block');
  assert.equal(d.target.combat.launchPoint, 0);
  assert.equal(d.target.combat.energy, energy - 15, 'paid once');
  for (let i = 0; i < 20; i++) d.tick({}, { shield: true });
  d.tick({}, {});
  assert.deepEqual(keys(d.target), ['releaseshield', 'releaseshield', 'releaseshield']);
});

test('the Deflect: green alone whirls (pink and blue drop back behind her), one strike for 15 Energy, turning a projectile back once', () => {
  const { fighter: f, step } = solo();
  step(P('jump'));
  for (let i = 0; i < 8; i++) step({ jump: true });
  step(P('shield'));
  assert.equal(f.combat.attack.def.id, 'deflect');
  assert.deepEqual(keys(f), ['idle', 'deflect', 'idle']);
  assert.equal(f.combat.energy, 85);
  for (let i = 0; i < 9; i++) step({});
  assert.deepEqual([member(f, 'green').x, member(f, 'green').y], [0, 0], 'green at the front');
  assert.ok(member(f, 'blue').x < 0 && member(f, 'pink').x < member(f, 'blue').x, 'the others behind her');
  // Against #0001's Red, an orb thrown at it while it hangs in the air:
  // caught by green's whirl the step it goes live, turned back, once.
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, gap: 400 });
  Object.assign(d.target.body, { y: 400, prevY: 400, vx: 0, vy: 0, grounded: false, ground: null, gravityScale: 0 });
  d.tick({}, P('shield'));
  assert.equal(d.target.combat.energy, 85, 'one Deflect, paid once');
  while (d.target.combat.phase !== 'startup' || d.target.combat.attack.time + DT < d.target.deflect.startup - 1e-6) d.tick();
  const b = d.target.body;
  const def = d.attacker.projectileDefs.attack2_object;
  const red = new Projectile({ owner: d.attacker, def, anim: d.attacker.sprites.projectile(def.animation), x: b.x - 12 - 600 * DT, y: b.y - 40, direction: 1 });
  d.projectiles.push(red);
  d.tick();
  assert.equal(red.owner, d.target, 'turned back, now #0006\'s');
  assert.equal(d.target.combat.launchPoint, 0, 'no hit on it');
});

test('facing either way, from either side: the same formation mirrored, steady once settled', () => {
  for (const facing of [1, -1]) {
    const { fighter: f, step } = solo({ facing });
    for (let i = 0; i < 30; i++) step({});
    for (const m of f.animator.members) assert.deepEqual([m.x, m.y], [home(m.id).x * facing, home(m.id).y], `${facing}: ${m.id}`);
    for (const p of fighterParts(f)) assert.equal(p.flip, facing === -1);
  }
});

// ---- The moves ------------------------------------------------------------------------

test('the Power Punch: pink alone at the front, a jab that holds (1) then a cross (3, Base Launch 1 sideways), in a quarter of a second', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack1'));
  assert.equal(d.attacker.combat.attack.def.id, 'attack1');
  assert.deepEqual(keys(d.attacker), ['attack1', 'idle', 'idle'], 'pink performs it, green and blue aside');
  let at = 0;
  while (d.attacker.combat.attack) {
    d.tick();
    at++;
    if (at === 8) assert.deepEqual([member(d.attacker, 'pink').x, member(d.attacker, 'pink').y], [0, 0], 'pink at the front, on the ground');
  }
  assert.deepEqual(mine(d, 'attack1').map((e) => [e.type, e.damage, e.baseLaunch ?? 0, e.directionalLaunch ?? null]),
    [['hit', 1, 0, null], ['hit', 3, 1, 'horizontal']]);
  const { fighter: f } = solo();
  assert.ok(near(f.attacks.attack1.total, 4 / 15), 'four frames at 15 fps');
  assert.equal(f.attacks.attack1.groundOnly, true);
  assert.equal(f.attacks.attack1.stepIn, 'universal', 'a grounded punch: the shared Step-in');
});

test('the Flying Kick: blue alone kicks out feet first in the air, 3 and Base Launch 1 sideways', () => {
  const d = versus({ gap: 40 });
  airborne(d.tick);
  Object.assign(d.target.body, { y: d.attacker.body.y, prevY: d.attacker.body.y, vy: 0, grounded: false, ground: null, gravityScale: 0 });
  d.tick(P('attack1'));
  assert.equal(d.attacker.combat.attack.def.id, 'midair_attack1');
  assert.deepEqual(keys(d.attacker), ['idle', 'idle', 'midair_attack1'], 'blue performs it');
  d.until(() => !d.attacker.combat.attack);
  assert.deepEqual(mine(d, 'midair_attack1').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 1, 'horizontal']]);
  assert.ok(near(solo().fighter.attacks.midair_attack1.total, 4 / 15));
});

test('the Tornado Spin: green spins up, then rolls on as a tornado, drawing in whoever is near, carrying it (1 x4) and sweeping it up (3, Base Launch 2 upward)', () => {
  // Right up close: all five strikes.
  const d = versus({ gap: 40 });
  const x = d.attacker.body.x;
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.attack.def.id, 'attack2');
  assert.deepEqual(keys(d.attacker), ['idle', 'attack2', 'idle'], 'green performs it');
  d.until(() => !d.attacker.combat.attack);
  assert.ok(d.attacker.body.x > x + 40, `it rolls on (${d.attacker.body.x - x})`);
  const hits = mine(d, 'attack2');
  assert.deepEqual(hits.map((e) => e.damage), [1, 1, 1, 1, 3], 'four carrying strikes, then the sweep');
  assert.deepEqual([hits[4].baseLaunch, hits[4].directionalLaunch], [2, 'vertical']);
  assert.ok(hits[4].launchSpeed > 0, 'swept up into the air');
  // From further off (110): the tornado draws its target in as it spins,
  // and still sweeps it up.
  const far = versus({ gap: 110 });
  far.tick(P('attack2'));
  after(far, 5 / 15);
  assert.ok(far.target.body.x - far.attacker.body.x < 110 - 30, 'drawn in');
  far.until(() => !far.attacker.combat.attack);
  const caught = mine(far, 'attack2');
  assert.ok(caught.length >= 4 && caught.at(-1).damage === 3, caught.map((e) => e.damage).join(', '));
  const atk = solo().fighter.attacks.attack2;
  assert.ok(near(atk.total, 11 / 15), '0.73 s: a commitment');
  assert.deepEqual([atk.groundOnly, atk.stepIn, atk.motion.type, atk.passThrough], [true, 'exempt', 'roll', true]);
  assert.equal(atk.pull.radius, 120);
});

test('the Flying Punch: green alone throws her fist forward in the air, its finisher: 5, Base Launch 3 sideways, once per airtime', () => {
  const d = versus({ gap: 40 });
  airborne(d.tick);
  Object.assign(d.target.body, { y: d.attacker.body.y, prevY: d.attacker.body.y, vy: 0, grounded: false, ground: null, gravityScale: 0 });
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.attack.def.id, 'midair_attack2');
  assert.deepEqual(keys(d.attacker), ['idle', 'midair_attack2', 'idle'], 'green performs it');
  d.until(() => !d.attacker.combat.attack);
  assert.deepEqual(mine(d, 'midair_attack2').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 5, 3, 'horizontal']]);
  // Once per airtime: a second press before landing starts nothing.
  for (let i = 0; i < steps(0.6) && !d.attacker.grounded; i++) {
    d.tick(i === 0 ? P('attack2') : {});
    assert.notEqual(d.attacker.combat.attack?.def.id, 'midair_attack2', 'used up this airtime');
  }
  const atk = solo().fighter.attacks.midair_attack2;
  assert.ok(near(atk.startup, 0.2), 'a fifth of a second to see it coming');
  assert.equal(atk.airUses, 1);
});

test('the Triple Strike: all three lock on and streak at the opponent together, one hit for 5 (Base Launch 2 sideways), whoever draws it', () => {
  // In reach of its lock-on (220, middle to middle): it homes in and lands.
  const d = versus({ gap: 200 });
  d.tick(P('extra_attack'));
  assert.equal(d.attacker.combat.attack.def.id, 'extra_attack');
  assert.deepEqual(keys(d.attacker), ['extra_attack', 'extra_attack', 'extra_attack'], 'all three perform it');
  d.until(() => !d.attacker.combat.attack);
  assert.deepEqual(mine(d, 'extra_attack').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 5, 2, 'horizontal']],
    'one move, one hit');
  assert.equal(d.target.combat.launchPoint, 5);
  // Out of reach: straight ahead, and it whiffs.
  const far = versus({ gap: 360 });
  far.tick(P('extra_attack'));
  far.until(() => !far.attacker.combat.attack);
  assert.deepEqual(mine(far, 'extra_attack'), []);
  // In the air too, once per airtime.
  const { fighter: f, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(f.combat.attack?.def.id, 'extra_attack');
  while (f.combat.attack) step({});
  step(P('extra_attack'));
  assert.notEqual(f.combat.attack?.def.id, 'extra_attack', 'used up this airtime');
  const atk = f.attacks.extra_attack;
  assert.deepEqual([atk.motion.type, atk.motion.range, atk.airUses, atk.groundOnly], ['homing', 220, 1, false]);
  assert.ok(near(atk.startup, 2 / 12) && near(atk.total, 6 / 12));
});

test('Heat Vision: 0.3 s with pink\'s eyes heating up, then a beam from her eyes, the fastest shot in the roster: 3, Base Launch 1 sideways', () => {
  const d = versus({ gap: 420 });
  d.tick(P('attack3'));
  assert.equal(d.attacker.technique?.def.id, 'attack3');
  assert.deepEqual(keys(d.attacker), ['attack3_cast', 'idle', 'idle'], 'pink casts it');
  while (!d.projectiles.length) d.tick();
  const beam = d.projectiles[0];
  assert.equal(beam.owner, d.attacker);
  assert.equal(beam.vx, 1500, 'at 1500 units/s');
  assert.ok(near(beam.y, d.attacker.body.y - 46), 'from her eyes');
  d.until(() => mine(d, 'attack3_object').length > 0, 60);
  assert.deepEqual(mine(d, 'attack3_object').map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 3, 1, 'horizontal']]);
  // 600 units in 0.4 s: no shot in the roster is faster.
  assert.ok(near(beam.def.speed * beam.def.lifetime, 600));
  for (const p of playableCharacters().filter((c) => c.id !== '0006').flatMap((c) => Object.values(c.projectiles ?? {}))) {
    assert.ok(p.speed < 1500, 'none is faster');
  }
  // A hit before it lets go breaks it: nothing released.
  const broken = versus({ gap: 44 }, DEF_0001);
  broken.tick(P('attack3'), {});
  broken.tick({}, P('attack1'));
  for (let i = 0; i < 40; i++) broken.tick();
  assert.equal(broken.projectiles.length, 0, 'broken, no beam');
});

test('Ice Breath: pink breathes a freezing gale; whoever it reaches in front is frozen solid for 1.4 s; behind is untouched, a Shield blocks it', () => {
  for (const [gap, shield, want] of [[90, false, 'hit'], [-90, false, null], [200, false, null], [90, true, 'block']]) {
    const d = versus({ gap });
    const guard = shield ? { shield: true } : {};
    d.tick({}, guard);
    d.tick(P('attack4'), guard);
    assert.equal(d.attacker.technique?.def.id, 'attack4');
    assert.equal(activeSpecialAbility(d.attacker), 'attack4', 'its Special mark shows');
    assert.deepEqual(keys(d.attacker), ['attack4_cast', 'idle', 'idle'], 'pink performs it');
    while (d.attacker.technique && !mine(d, 'attack4').length) d.tick({}, guard);
    const e = mine(d, 'attack4');
    assert.equal(e[0]?.type ?? null, want, `${gap}${shield ? ', Shield up' : ''}`);
    if (want !== 'hit') continue;
    assert.deepEqual([e[0].damage, e[0].paralysis], [3, 1.4]);
    assert.equal(d.target.combat.immobilized, true, 'frozen');
    const x = d.target.body.x;
    after(d, 1.3, {}, { runRight: true });
    assert.equal(d.target.combat.immobilized, true, 'still frozen');
    assert.equal(d.target.body.x, x, 'held in place, however it pushes');
    after(d, 0.2);
    assert.equal(d.target.combat.immobilized, false, 'thawed');
  }
  assert.equal(solo().fighter.techniqueDefs.attack4.cooldown, 3, 'a freeze: the policy\'s 3 s');
});

test('the Sonic Scream: blue screams a wave of sound that clears the floor, carries whoever it meets (1, 1), then flings it (3, Base Launch 2 sideways)', () => {
  const d = versus({ gap: 220 });
  d.tick(P('attack5'));
  assert.equal(d.attacker.technique?.def.id, 'attack5');
  assert.deepEqual(keys(d.attacker), ['idle', 'idle', 'attack5_cast'], 'blue casts it');
  while (!d.projectiles.length) d.tick();
  const wave = d.projectiles[0];
  // A shot that touches the floor is gone: the wave flies just over it.
  for (let i = 0; i < 4; i++) d.tick();
  assert.equal(wave.alive, true, 'still flying after it leaves her');
  assert.ok(wave.y - wave.def.hitbox.y - wave.def.hitbox.h < 0 || wave.y + wave.def.hitbox.y + wave.def.hitbox.h <= d.attacker.body.y, 'over the floor');
  d.until(() => !wave.alive, 120);
  assert.deepEqual(mine(d, 'attack5_object').map((e) => [e.type, e.damage, e.baseLaunch ?? 0]), [['hit', 1, 0], ['hit', 1, 0], ['hit', 3, 2]]);
  // It turns another fighter's shot back: #0002's whirlwind, met head on.
  const r = versus({ gap: 600 }, getCharacter('0002'));
  r.tick(P('attack5'));
  while (!r.projectiles.length) r.tick();
  const mineWave = r.projectiles[0];
  const def = r.target.projectileDefs.extra_attack_object;
  const shot = new Projectile({ owner: r.target, def, anim: r.target.sprites.projectile(def.animation), x: mineWave.x + 80, y: mineWave.y, direction: -1 });
  r.projectiles.push(shot);
  for (let i = 0; i < 10 && shot.owner !== r.attacker; i++) r.tick();
  assert.equal(shot.owner, r.attacker, 'turned back, now #0006\'s');
  assert.ok(shot.vx > 0 && mineWave.alive, 'flying back the way the wave goes, the wave flying on');
  // A raised Shield blocks it and is shoved back along it.
  const s = versus({ gap: 220 });
  s.tick({}, { shield: true });
  const x = s.target.body.x;
  s.tick(P('attack5'), { shield: true });
  for (let i = 0; i < 120 && !mine(s, 'attack5_object').length; i++) s.tick({}, { shield: true });
  for (let i = 0; i < 10; i++) s.tick({}, { shield: true });
  assert.equal(mine(s, 'attack5_object')[0].type, 'block');
  assert.ok(s.target.body.x > x + 5, 'pushed back');
});

// ---- One fighter in every mode ---------------------------------------------------------

// A real Watch Mode Battle between #0006 and #0001, stepped by hand.
function battle(seed = 1) {
  return new Battle({
    canvas: { getContext: () => ({}) }, map: getMap('desert'), mode: 'watch', seed, difficulty: 'medium',
    p1Def: DEF, p2Def: DEF_0001, p1Sprites: fakeSpritesOf(DEF), p2Sprites: fakeSpritesOf(DEF_0001),
    input: { flush() {}, sample: () => ({}) },
  });
}

test('into the Void and back: the one fighter is lost (the opponent scores once), the whole group gone, then back at its spawn together', () => {
  const b = battle();
  b.setPhase('fight');
  const f = b.p1;
  f.controller = null;
  b.p2.controller = null;
  f.combat.launchPoint = 42;
  f.body.x = b.stage.void.right + 200;
  b.update(DT);
  assert.equal(f.lostToVoid, true);
  assert.equal(b.score.p2, 1, 'one point, once');
  assert.ok(!b.inPlay.includes(f), 'out of play, all three');
  for (let i = 0; i < 10; i++) b.update(DT);
  assert.equal(b.score.p2, 1);
  let n = 0;
  while (f.lostToVoid && n++ < (CONFIG.battle.respawnSeconds + 1) / DT) b.update(DT);
  assert.equal(f.lostToVoid, false, 'respawned');
  assert.equal(f.combat.launchPoint, 0);
  assert.ok(b.inPlay.includes(f));
  for (const m of f.animator.members) {
    assert.ok(Math.abs(m.x - home(m.id).x * f.facing) <= 260 * DT * 2 + 1e-9, `${m.id}: back in formation`);
  }
  assert.equal(fighterParts(f).length, 3);
});

test('the camera, the CPU and a whole Battle treat it as one fighter; the CPU plays its whole kit through it', () => {
  const b = battle(3);
  assert.equal(b.fighters.length, 2, 'two fighters, not four');
  assert.equal(b.primary, b.p1);
  assert.deepEqual(b.cameraTargets, [b.p1, b.p2], 'the camera frames the one fighter');
  // The CPU plays it through the one fighter's controls, against the
  // roster: every move of its kit, its Deflect included, over a few fights.
  const used = new Map();
  const kit = analyzeCapabilities(solo().fighter).moves.map((m) => m.key);
  // Its slow ground flurry is a rare pick now that its quick strikes never
  // wait (no repeat delay): the rest of the roster, if it has not come up.
  const extra = [[getCharacter('0002'), 6], [getCharacter('0004'), 5]];
  for (const entry of [[DEF_0001, 5], [getCharacter('0003'), 6], [getCharacter('0005'), 7], ...extra]) {
    if (extra.includes(entry) && kit.every((k) => used.get(k) > 0)) break;
    const [foe, seed] = entry;
    const fight = cpuFight(DEF, foe, { seconds: 30, seed });
    for (const [k, v] of fight.a.controller.telemetry.moveUsage) used.set(k, (used.get(k) ?? 0) + v);
    assert.equal(fighterParts(fight.a).length, 3);
  }
  assert.deepEqual(kit.filter((k) => !(used.get(k) > 0)), [], `every move used: ${JSON.stringify(Object.fromEntries(used))}`);
});

// ---- Names and credits -------------------------------------------------------------------

test('its credits are the sheet\'s, in both languages, and its source characters are named nowhere', () => {
  assert.equal(STRINGS.en['credits.sprites0006.title'], '#0006 sprite source');
  assert.equal(STRINGS.en['credits.sprites0006.sheet'], 'Sprite sheet by NotEverything123');
  assert.match(STRINGS.en['credits.sprites0006.sheetCredits'], /Cosbydaf.*Kenshin Himura.*Misse-the-cat/);
  assert.match(STRINGS.fr['credits.sprites0006.sheetCredits'], /Cosbydaf.*Kenshin Himura.*Misse-the-cat/);
  // Neither the show, its initials, its town nor the three sisters' names
  // (spelled in pieces, so this file never names them either; the common
  // words two of the names are, lowercase, and #0003's Cherry Blossom
  // Impact, are other things).
  const show = new RegExp(['power', 'puff'].join(''), 'i');
  const names = new RegExp(`\\b(${['P' + 'PG', 'Town' + 'sville', 'Mojo ' + 'Jojo', 'Butter' + 'cup', 'Bub' + 'bles'].join('|')})\\b|(?<!Cherry )\\b${'Blos' + 'som'}\\b(?! Impact)`);
  const banned = { test: (text) => show.test(text) || names.test(text) };
  const scan = (dir) => readdirSync(new URL(dir, `file://${ROOT}`), { recursive: true })
    .filter((f) => /\.(js|mjs|md|html|css|json|webmanifest)$/.test(f)).map((f) => `${dir}${f}`);
  for (const path of [...scan('js/'), ...scan('docs/'), ...scan('tests/'), 'README.md', 'ALVA_SPEC.md', 'UPDATES.md', 'CLAUDE.md', 'index.html']) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => banned.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  for (const url of characterFramePaths(DEF)) assert.equal(banned.test(url), false, url);
});
