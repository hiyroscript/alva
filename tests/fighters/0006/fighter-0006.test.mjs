// Run with node --test tests/fighters/0006/fighter-0006.test.mjs (no dependencies).
// #0006, three sisters who are one fighter: registered once, in roster slot
// 06, not playable while its moves are still to come; its three members'
// clips cut from one sprite sheet into its own folder and read from the
// real PNGs (tight, 1x, one art-pixel scale for all three); one Fighter,
// one body, one hurtbox, one Launch Point, one Energy bar and one Shield,
// drawn as three members who move, jump, fall, Dash, air dash, shield, get
// hit, fly, fall into the Void and come back together, a single member
// (green) performing the Deflect; the CPU, the camera and a whole Battle
// treating it as one fighter; and its source characters named nowhere. The
// shared ensemble rules it is built on are checked on made-up formations
// and a test-only fighter in tests/systems/ensemble.test.mjs. Paint still
// needs a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DT, duel, fakeSpritesOf, makeFighter, cpuFight } from '../../helpers/fighter-harness.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { CHARACTERS, characterFramePaths, getCharacter, getPlayableCharacter, playableCharacters } from '../../../js/data/characters.js';
import { GROUP_CLIPS, ensembleProblems, memberIds } from '../../../js/data/ensemble.js';
import { loadoutProblems } from '../../../js/data/loadout.js';
import { hasAuthoredLayout } from '../../../js/data/controller-profiles.js';
import { EnsembleAnimator, fighterParts } from '../../../js/game/rendering/ensemble.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { Battle } from '../../../js/game/battle.js';
import { getMap } from '../../../js/data/maps.js';
import { CONFIG } from '../../../js/config.js';
import { STRINGS } from '../../../js/localization/i18n.js';
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

// Every member's clips: codename -> the frames it plays, by member.
const FRAMES = {
  pink: { idle: 6, run: 7, midair_hurt: 3, mouvment: 2 },
  green: { idle: 3, run: 5, midair_hurt: 3, mouvment: 2 },
  blue: { idle: 3, run: 6, midair_hurt: 3, mouvment: 2 },
};
// Their tallest frames (art pixels).
const HEIGHTS = {
  pink: { idle: 43, run: 35, jump: 42, fall: 43, land: 42, hurt: 37, midair_hurt: 37, prepshield: 42, shielding: 45, releaseshield: 42, mouvment: 31, midair_mouvment: 40 },
  green: { idle: 30, run: 29, jump: 36, fall: 30, land: 30, hurt: 29, midair_hurt: 29, prepshield: 33, shielding: 42, releaseshield: 29, mouvment: 25, midair_mouvment: 28, deflect: 33 },
  blue: { idle: 30, run: 29, jump: 36, fall: 30, land: 30, hurt: 32, midair_hurt: 32, prepshield: 30, shielding: 43, releaseshield: 29, mouvment: 25, midair_mouvment: 28 },
};
const FILES = Object.entries(HEIGHTS).flatMap(([id, clips]) => Object.keys(clips).flatMap((codename) => {
  const n = FRAMES[id][codename] ?? (codename === 'deflect' ? 3 : 1);
  return Array.from({ length: n }, (_, i) => `0006_${codename}_${id}_${i + 1}.png`);
})).sort();

const { images: IMAGES, sprites: REAL } = realArt(DEF);

// ---- Registration ------------------------------------------------------------------

test('#0006 is registered once, in roster slot 06, and not playable while its moves are still to come', () => {
  assert.equal(CHARACTERS.filter((c) => c.id === '0006').length, 1);
  assert.equal(DEF.displayName, '#0006');
  assert.equal(DEF.rosterSlot, 5, 'the sixth slot');
  assert.equal(CHARACTERS.filter((c) => c.rosterSlot === 5).length, 1, 'one slot');
  assert.equal(DEF.available, false);
  assert.equal(getPlayableCharacter('0006'), null);
  assert.ok(!playableCharacters().includes(DEF));
  // Its moves are still to come: none, and nothing invented to fill the
  // loadout. The rules wait for them (see js/data/loadout.js).
  for (const table of ['actions', 'attacks', 'summons', 'techniques', 'projectiles', 'mobileAbilities', 'abilityNames', 'abilityDescriptions', 'specialAbilities']) {
    assert.equal(DEF[table], undefined, `no ${table}`);
  }
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(ensembleProblems(DEF), []);
  // A layout of its own, with nothing to bind yet: the universal inputs.
  assert.equal(hasAuthoredLayout(DEF), true);
  assert.deepEqual(DEF.controller.layout, {});
  // No movement of its own.
  for (const field of ['movement', 'powers', 'energy', 'launchReaction', 'launchBounce']) assert.equal(DEF[field], undefined, field);
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

test('its folder holds exactly the frames its members\' clips play: every file <id>_<codename>_<member>_<frame>.png', () => {
  const files = readdirSync(`${ROOT}${DIR}`).sort();
  assert.deepEqual(files, FILES);
  assert.equal(files.length, 72);
  assert.deepEqual(characterFramePaths(DEF).map(file).sort(), FILES, 'every file loaded, none missing');
  for (const m of DEF.ensemble.members) {
    for (const [key, clip] of Object.entries(m.animations)) {
      for (const [i, url] of clip.frames.entries()) {
        assert.match(file(url), new RegExp(`^0006_${key}_${m.id}_\\d+\\.png$`), `${m.id} ${key} ${i}`);
      }
    }
  }
  // Pink's idle shows its first frame again, and green's Deflect its whirl
  // twice: the same file each time.
  assert.deepEqual(DEF.ensemble.members[0].animations.idle.frames.map(file), [1, 2, 3, 4, 5, 1, 6].map((n) => `0006_idle_pink_${n}.png`));
  assert.deepEqual(DEF.ensemble.members[1].animations.deflect.frames.map(file), [
    '0006_deflect_green_1.png', '0006_deflect_green_2.png', '0006_deflect_green_2.png', '0006_deflect_green_3.png',
  ]);
  // No copy of a frame within a clip.
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
    for (const [key, anim] of Object.entries(m.set.animations)) {
      assert.ok(near(anim.maxArtH, HEIGHTS[m.id][key]), `${m.id} ${key}: tallest frame ${anim.maxArtH}`);
      for (const f of anim.frames) {
        assert.ok(near(f.unit, 1), `${m.id} ${key}: one file pixel per art pixel`);
        assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth) && near(f.artH, IMAGES.get(f.url).naturalHeight));
        assert.equal(f.anchorArtY, f.artH, `${m.id} ${key}: stands on the bottom of its art`);
      }
    }
  }
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
  assert.deepEqual(DEF.hurtboxes, [{ x: -30, y: -92, w: 60, h: 92 }]);
  assert.deepEqual(f.hurtboxes, DEF.hurtboxes);
  assert.deepEqual([DEF.collider.width, DEF.collider.height, DEF.pushbox.width], [40, 84, 52]);
  assert.equal(f.combat.launchPoint, 0);
  assert.equal(f.combat.energy, 100);
  assert.equal(f.defense.type, 'shield');
  assert.equal(f.deflect.damage, 3);
  assert.equal(f.deflect.baseLaunch, 2);
  assert.equal(f.deflect.cooldown, 0);
});

test('all three are always drawn, together: idle, running, jumping, falling, landing, Dashing, air dashing, shielding, deflecting', () => {
  const { fighter: f, step } = solo();
  const script = [
    ...Array(30).fill({}), ...Array(20).fill({ runRight: true }), ...Array(30).fill({}), P('jump'), ...Array(70).fill({}),
    { runRight: true, mouvementRightPressed: true }, ...Array(40).fill({}), P('jump'), ...Array(6).fill({ jump: true }),
    { runRight: true, mouvementRightPressed: true }, ...Array(80).fill({}), P('shield'), ...Array(20).fill({ shield: true }),
    ...Array(30).fill({}), P('jump'), ...Array(8).fill({ jump: true }), P('shield'), ...Array(60).fill({}),
  ];
  const states = new Set();
  for (const held of script) {
    step(held);
    f.interpolate(1);
    states.add(f.state);
    const parts = fighterParts(f);
    assert.equal(parts.length, 3, `${f.state}: three members drawn`);
    assert.deepEqual(new Set(parts.map((p) => p.member)), new Set(['pink', 'green', 'blue']));
    if (f.state !== 'attack') {
      const want = f.animationFor(f.state);
      assert.deepEqual(keys(f), [want, want, want], `${f.state}: the same state, the same step`);
    }
  }
  for (const s of ['idle', 'run', 'jump', 'fall', 'land', 'dash', 'shield', 'shieldRelease', 'attack']) assert.ok(states.has(s), s);
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
  const after = fighterParts(d.target).map((p) => p.x - d.target.renderX);
  assert.deepEqual(after, before, 'the same places round one flying body');
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

test('the camera, the CPU and a whole Battle treat it as one fighter', () => {
  const b = battle(3);
  assert.equal(b.fighters.length, 2, 'two fighters, not four');
  assert.equal(b.primary, b.p1);
  assert.deepEqual(b.cameraTargets, [b.p1, b.p2], 'the camera frames the one fighter');
  // The CPU plays it through the one fighter's controls, against #0001.
  const fight = cpuFight(DEF, DEF_0001, { seconds: 12, seed: 5 });
  const log = fight.log.get(fight.a);
  assert.ok(log.some((s) => s.runLeft || s.runRight), 'it moves');
  assert.ok(log.some((s) => s.jumpPressed || s.mouvementLeftPressed || s.mouvementRightPressed || s.shield), 'and jumps, Dashes or shields');
  assert.ok(log.every((s) => !['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack'].some((k) => s[`${k}Pressed`] && s.attack)), 'no attack of its own: it has none');
  assert.equal(fight.a.animator.members.length, 3);
  assert.equal(fighterParts(fight.a).length, 3);
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
