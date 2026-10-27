// Run with node --test tests/fighters/0008/fighter-0008.test.mjs (no dependencies).
// #0008, the rubber pirate: registered from CHARACTERS alone in roster
// slot 08, its clips cut from one sprite sheet into its own folder and read
// from the real PNGs (tight, 1x, one art-pixel scale, anchored on its blue
// shorts wherever its stretched limbs, its balloon or its giant fist
// reach), five numbered buttons (three ordinary attacks with their mid-air
// versions and two techniques) and an extra attack, its Gum-Gum Pistol.
// Every move is its own body, and throws nothing: Jab and Straight, the
// Crescent Kick of its Mash Combo, the Gatling's barrage of stretched fists,
// the Pistol's long arm, the Stamp's legs reaching down, the Rocket's
// slingshot dive, the Balloon that bounces projectiles back (floating in
// the air), the Feast that heals it and the Giant Pistol's breakable
// wind-up and giant fist. Its stretched limbs are still its body: its
// hurtboxes reach out along them. Its rubber body rebounds off what it is
// launched into sooner and harder than anyone. The roster, credits and
// translations it adds are checked in empty-roster, settings and i18n.
// Layout and paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { DT, STAGE, duel, fakeSpritesOf, makeFighter, steps, cpuFight, stageMap, probeHit } from '../../helpers/fighter-harness.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { CHARACTERS, getCharacter, playableCharacters } from '../../../js/data/characters.js';
import { abilityName } from '../../../js/data/abilities.js';
import { describeLoadout, loadoutProblems } from '../../../js/data/loadout.js';
import { isSpecialAbility } from '../../../js/data/special-abilities.js';
import { mashComboProblems } from '../../../js/data/mash-combo.js';
import { pad, flick } from '../../../js/data/characters/helpers.js';
import { attackReach, createAttackDefinition, isMeleeAttack } from '../../../js/game/combat/attacks.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { CombatSystem } from '../../../js/game/combat/combat.js';
import { LAUNCH_BOUNCE } from '../../../js/game/combat/launch-bounce.js';
import { StageCollision } from '../../../js/game/physics.js';
import { LAUNCH_UNIT_SPEED } from '../../../js/data/launch.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0008/';
const DEF = getCharacter('0008');
const DEF_0001 = getCharacter('0001');
const DEF_0007 = getCharacter('0007');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0008_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0008 on its own, and against #0001 (or `target`) at `gap`.
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
  idle: named('idle', 6),
  run: named('run', 8),
  jump: named('jump', 3),
  fall: named('fall', 3),
  land: named('land', 3),
  mouvment: named('mouvment', 2),
  midair_mouvment: named('midair_mouvment', 1),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 1),
  prepshield: named('prepshield', 1),
  shielding: named('shielding', 1),
  releaseshield: named('releaseshield', 1),
  deflect: named('deflect', [1, 2, 1, 2]),
  attack1: named('attack1', [1, 1, 2, 2, 3, 4, 5, 6, 7]),
  mash_attack: named('mash_attack', 4),
  midair_attack1: named('midair_attack1', [1, 2, 2, 3, 4]),
  attack2: named('attack2', [1, 1, 2, 3, 4, 5, 2, 3, 4, 5, 6, 7]),
  midair_attack2: named('midair_attack2', [1, 2, 3, 4, 3, 4, 5]),
  attack3: named('attack3', [1, 2, 3, 4, 5, 6, 5, 4, 7, 8, 9]),
  attack4_cast: named('attack4', 5),
  attack4_release: named('attack4', [6, 7, 8, 9, 10, 9, 10]),
  attack5_cast: named('attack5', 9),
  attack5_release: named('attack5', range(9, 10)),
  extra_attack: named('extra_attack', [1, 2, 3, 3, 4, 5, 5, 6]),
};
const FILES = [...new Set(Object.values(CLIPS).flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 47, run: 47, jump: 48, fall: 48, land: 40, mouvment: 42, midair_mouvment: 37, hurt: 44, midair_hurt: 30,
  prepshield: 44, shielding: 35, releaseshield: 44, deflect: 48, attack1: 46, mash_attack: 60, midair_attack1: 112,
  attack2: 51, midair_attack2: 45, attack3: 63, attack4_cast: 61, attack4_release: 49, attack5_cast: 50, attack5_release: 48,
  extra_attack: 42,
};

// Its body (its stance's hurtboxes), to tell where a stretched limb adds
// to it.
const BODY = DEF.hurtboxes;

// ---- Registration -------------------------------------------------------------------

test('#0008 is a real CHARACTERS entry: available, in roster slot 08, after #0001 to #0007', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0008'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0008');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 7);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('five numbered attacks, each a button of its own: three ordinary with mid-air versions, two techniques; plus the Gum-Gum Pistol', () => {
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
  assert.deepEqual(Object.keys(DEF.attacks).sort(), [
    'attack1', 'attack2', 'attack3', 'extra_attack', 'mash_attack', 'midair_attack1', 'midair_attack2', 'midair_attack3',
  ]);
  assert.deepEqual(Object.keys(DEF.techniques), ['attack4', 'attack5']);
  assert.equal(DEF.summons, undefined, 'it summons nobody');
});

test('every move is its own body: it throws nothing, carries no weapon, and none of its moves costs Energy', () => {
  assert.equal(DEF.projectiles, undefined, 'no projectile at all');
  assert.equal(DEF.projectileAnimations, undefined);
  assert.equal(DEF.effectAnimations, undefined);
  const { fighter } = solo();
  for (const [id, spec] of Object.entries(DEF.attacks)) {
    const atk = createAttackDefinition({ id, ...spec });
    assert.equal(isMeleeAttack(atk), true, `${id}: a strike of its body`);
    assert.equal(atk.energyCost, 0, `${id}: free`);
  }
  assert.equal(fighter.techniqueDefs.attack4.energyCost, 0, 'the Feast heals: its cooldown is its limit');
  assert.equal(fighter.techniqueDefs.attack5.energyCost, 0, 'the Giant Pistol deals 10: its cooldown is its limit');
});

test('two Specials: the Feast and the Gum-Gum Giant Pistol; its Gatling, Balloon and Rocket are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack4', 'attack5']);
  for (const move of ['attack4', 'attack5']) assert.equal(isSpecialAbility(DEF, move), true, move);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its Mash Combo: Jab and Straight with the Crescent Kick, its one close-range strike with no button', () => {
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'mash_attack'] });
  assert.deepEqual(mashComboProblems(DEF), []);
  assert.equal(Object.values(DEF.actions).some((a) => a === 'mash_attack' || a?.ground === 'mash_attack'), false, 'no button performs it');
  // Every other ground move is no close-range strike: each reaches far
  // out, surrounds it, or strikes nobody.
  for (const id of ['attack2', 'attack3', 'extra_attack']) {
    const without = { ...DEF, mashCombo: { attacks: ['attack1', id] } };
    assert.notDeepEqual(mashComboProblems(without), [], `${id} could not be its partner`);
  }
  // Five presses of Jab and Straight's button set off the series: the
  // Crescent Kick comes second.
  const { fighter, step } = solo();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    step(P('attack1'));
    for (let k = 0; k < 4; k++) seen.push(step({}).combat.attack?.def.id);
  }
  for (let i = 0; i < steps(4); i++) seen.push(step({}).combat.attack?.def.id);
  assert.ok(seen.includes('mash_attack'), 'the Crescent Kick is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'midair_attack3', 'attack4', 'attack5', 'extra_attack', 'mash_attack'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Jab and Straight', 'Gum-Gum Stamp', 'Gum-Gum Gatling', 'Gum-Gum Rocket', 'Gum-Gum Balloon', 'Floating Balloon', 'Feast',
    'Gum-Gum Giant Pistol', 'Gum-Gum Pistol', 'Crescent Kick',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Gum-Gum Pistol', 'Jab and Straight', 'Gum-Gum Gatling', 'Gum-Gum Balloon', 'Feast', 'Gum-Gum Giant Pistol']);
  assert.deepEqual(buttons('fr'), [
    'Gomu Gomu no Pistol', 'Jab et direct', 'Gomu Gomu no Gatling', 'Gomu Gomu no Fûsen', 'Festin', 'Gomu Gomu no Gigant Pistol',
  ]);
  assert.deepEqual(['midair_attack1', 'midair_attack2', 'midair_attack3', 'mash_attack'].map((m) => STRINGS.fr[`ability.0008.${m}`]),
    ['Gomu Gomu no Stamp', 'Gomu Gomu no Rocket', 'Ballon flottant', 'Coup de pied croissant']);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5'].map((a) => art(a)), [
    '0008_extra_attack_5.png', '0008_attack1_6.png', '0008_attack2_4.png', '0008_attack3_4.png', '0008_attack4_6.png', '0008_attack5_12.png',
  ]);
  assert.deepEqual(['attack1', 'attack2', 'attack3'].map((a) => art(a, true)), ['0008_midair_attack1_2.png', '0008_midair_attack2_3.png', '0008_attack3_4.png']);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4', 'attack5']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0008.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: its fists, flurry and balloon on the face both ways, the Pistol on R2, the Feast on L2, the giant fist forward on the right stick', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:attack3': pad('east'),
    'ground:attack4': pad('l2'),
    'ground:attack5': flick('forward'),
    'ground:extra_attack': pad('r2'),
    'air:attack1': pad('west'),
    'air:attack2': pad('north'),
    'air:attack3': pad('east'),
  });
  assert.equal(DEF.controller.previous, undefined, 'added after settings version 5: no layout of then');
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips play: every file named <id>_<codename>_<frame>.png, none a copy within its codename', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 104);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  // The Floating Balloon is the Balloon, played in the air: the same clip.
  assert.equal(DEF.attacks.midair_attack3.animation, 'attack3');
  // A frame a clip shows again is the same file, never a second one.
  for (const name of FILES) {
    const { pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const twins = FILES.filter((other) => other !== name && other.replace(/_\d+\.png$/, '') === name.replace(/_\d+\.png$/, ''))
      .filter((other) => Buffer.compare(Buffer.from(decodePng(`${ROOT}${DIR}${other}`).pixels), Buffer.from(pixels)) === 0);
    assert.deepEqual(twins, [], `${name}: no copy of it under its codename`);
  }
});

test('every frame is cut clean: none of the sheet\'s teal background left, fully opaque or clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const { naturalWidth: w, naturalHeight: h, pixels } = decodePng(`${ROOT}${DIR}${name}`);
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      assert.ok(!(a && r === 0 && g === 102 && b === 102), `${name}: none of the sheet's background`);
    }
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 47);
  assert.ok(near(REAL.worldPerArt, 88 / 52), 'the same world size per art pixel as the rest of the roster');
  assert.ok(near(DEF.visual.height, 47 * 88 / 52), 'about 80 units tall, crouched to fight');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.ok(near(anim.maxArtH, HEIGHTS[key]), `${key}: tallest frame ${anim.maxArtH}`);
    for (const f of anim.frames) {
      assert.ok(near(f.unit, 1), `${key}: one file pixel per art pixel`);
      assert.ok(near(f.artW, IMAGES.get(f.url).naturalWidth), `${key}: its width`);
      assert.ok(near(f.artH, IMAGES.get(f.url).naturalHeight), `${key}: its height`);
    }
  }
});

test('anchors keep the body in place: authored on its shorts wherever its stretched limbs, balloon or giant fist reach', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  // The arm stretched far back behind it: the body stays at the right of
  // the frame, where it is.
  assert.deepEqual(ax('extra_attack'), [17, 54, 86.5, 86.5, 21, 16, 16, 16]);
  assert.deepEqual(ax('attack5_cast').slice(4), [67, 87.5, 137.5, 138.5, 139.5]);
  // The automatic anchor would follow the swinging giant fist off the body.
  const auto = withFakeCanvas(() => REAL.animations.attack5_cast.frames.map((f) => f.anchorX));
  assert.ok(Math.abs(auto[8] - ax('attack5_cast')[8]) > 20, 'the authored anchor stays on the body, not the fist');
  // The Stamp's legs reach down below its feet: the feet stay where they
  // would be.
  assert.deepEqual(REAL.animations.midair_attack1.frames.map((f) => f.anchorArtY), [29, 40, 40, 40, 33]);
  for (const key of ['idle', 'run', 'hurt', 'shielding', 'attack1', 'attack2', 'attack3', 'extra_attack', 'attack5_release']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its face', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(47 * DEF.visual.portrait.size));
});

// ---- Its moves -------------------------------------------------------------------------

test('Jab and Straight: a jab that holds the target, then a straight that knocks it back (1, 3 at Base Launch 1)', () => {
  const d = versus({ gap: 50 });
  d.tick(P('attack1'));
  after(d, 0.5);
  const hits = mine(d, 'attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage]), [['hit', 1], ['hit', 3]]);
  assert.equal(hits[0].launchSpeed, 0, 'held for the straight');
  assert.deepEqual([hits[1].baseLaunch, hits[1].directionalLaunch], [1, 'horizontal']);
  assert.ok(hits[1].finalLaunch.x > 0, 'knocked away from it');
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.45), 'its jab at 0.1 s, 0.45 s in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const far = versus({ gap: 110 });
  far.tick(P('attack1'));
  after(far, 0.5);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of an arm\'s reach, nothing');
});

test('the Gum-Gum Gatling: five stretched fists that hold the target, then a blow that sends it flying (1 x 5, then 3 at Base Launch 2), out to 110 units', () => {
  for (const [gap, lands] of [[50, true], [100, true], [140, false]]) {
    const d = versus({ gap });
    d.tick(P('attack2'));
    after(d, 0.8);
    const hits = mine(d, 'attack2');
    assert.equal(hits.length > 0, lands, `${gap} away`);
    if (!lands) continue;
    assert.deepEqual(hits.map((e) => e.damage), [1, 1, 1, 1, 1, 3], `${gap} away`);
    assert.ok(hits.slice(0, 5).every((e) => e.launchSpeed === 0), 'held to the last blow');
    assert.deepEqual([hits[5].baseLaunch, hits[5].directionalLaunch], [2, 'horizontal']);
  }
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  assert.ok(near(atk.total, 0.6) && atk.damage === 8, '0.6 s, 8 at the most: no cooldown');
  assert.equal(atk.cooldown, 0);
});

test('the Gum-Gum Pistol: a quarter of a second stretching the arm back, then the fist out to 96 units (5 at Base Launch 3); never leaning in', () => {
  for (const [gap, lands] of [[40, true], [90, true], [130, false]]) {
    const d = versus({ gap });
    d.tick(P('extra_attack'));
    after(d, 0.8);
    const hits = mine(d, 'extra_attack');
    assert.equal(hits.length > 0, lands, `${gap} away`);
    if (lands) assert.deepEqual([hits[0].source, hits[0].damage, hits[0].baseLaunch, hits[0].directionalLaunch], ['melee', 5, 3, 'horizontal']);
  }
  const atk = createAttackDefinition({ id: 'extra_attack', ...DEF.attacks.extra_attack });
  assert.ok(near(atk.startup, 4 / 15) && near(atk.total, 8 / 15));
  assert.equal(atk.stepIn, 'declined', 'its arm is what travels');
  assert.ok(attackReach(atk).x + attackReach(atk).w >= 96);
  // On the ground only.
  const { fighter, step } = solo();
  airborne(step, 20);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null);
});

test('a stretched limb is still its body: struck on its outstretched arm, it is struck', () => {
  // Its body alone: a shot at chest height stopped short of it would miss.
  for (const id of ['extra_attack', 'attack2']) {
    const boxes = DEF.attacks[id].hurtboxes;
    assert.deepEqual(boxes.slice(0, BODY.length), BODY, `${id}: its body, as ever`);
    const arm = boxes.at(-1);
    assert.ok(arm.x > 0 && arm.x + arm.w > 90, `${id}: and its arm, far out in front`);
  }
  // #0007's bullet, flying at its arm's height at it as it shoots its
  // Pistol back: the bullet meets the arm first, far out in front of its
  // body.
  const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 400 });
  d.tick({}, P('extra_attack'));
  while (d.target.combat.attack?.def.id === 'extra_attack' && d.target.combat.phase === 'startup') d.tick();
  const def = d.attacker.projectileDefs.extra_attack_object;
  const b = d.target.body;
  d.projectiles.push(new Projectile({ owner: d.attacker, def, anim: d.attacker.sprites.projectile(def.animation), x: b.x - 160, y: b.y - 38, direction: 1 }));
  let hit = null;
  for (let i = 0; i < 20 && !hit; i++) {
    d.tick();
    hit = d.events.find((e) => e.attacker === d.attacker && e.type === 'hit');
  }
  assert.ok(hit, 'the bullet strikes it');
  assert.ok(b.x - hit.point.x > 40, `on the arm, ${b.x - hit.point.x} units in front of its body`);
  // Standing in its stance, the same bullet passes over its arm's place
  // and meets its body.
  const s = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 400 });
  const sb = s.target.body;
  s.projectiles.push(new Projectile({ owner: s.attacker, def, anim: s.attacker.sprites.projectile(def.animation), x: sb.x - 160, y: sb.y - 38, direction: 1 }));
  let body = null;
  for (let i = 0; i < 20 && !body; i++) {
    s.tick();
    body = s.events.find((e) => e.attacker === s.attacker && e.type === 'hit');
  }
  assert.ok(body && sb.x - body.point.x < 30, 'on its body');
});

test('the Gum-Gum Stamp: both legs stretched down from 100 units up, stamping the target down (3, Base Launch 2 downward); the legs can be hit', () => {
  const d = versus({ gap: 6 });
  hold(d.attacker, 100);
  d.tick(P('attack1'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack1');
  after(d, 0.4);
  const [hit] = mine(d, 'midair_attack1');
  assert.deepEqual([hit.type, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 3, 2, 'reverseVertical']);
  assert.ok(hit.finalLaunch.y > 0, 'down');
  // From higher up, its legs fall short.
  const far = versus({ gap: 6 });
  hold(far.attacker, 280);
  far.tick(P('attack1'));
  after(far, 0.4);
  assert.deepEqual(mine(far, 'midair_attack1'), []);
  // While it plays, its legs count as its body down to its feet' reach.
  const legs = DEF.attacks.midair_attack1.hurtboxes.at(-1);
  assert.ok(legs.y >= 0 && legs.y + legs.h >= 120, 'its hurtboxes reach down its legs');
});

test('the Gum-Gum Rocket: flung head first at its opponent like a slingshot (3, Base Launch 2 sideways), once per airtime', () => {
  const d = versus({ gap: 200 });
  airborne(d.tick);
  hold(d.target, d.target.body.y - d.attacker.body.y);
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack2');
  after(d, 0.5);
  const [hit] = mine(d, 'midair_attack2');
  assert.deepEqual([hit.type, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 3, 2, 'horizontal']);
  // Once per airtime: a second press before landing does nothing.
  const { fighter, step } = solo();
  airborne(step, 10);
  step(P('attack2'));
  for (let i = 0; i < steps(0.6) && fighter.combat.attack; i++) step({});
  if (!fighter.grounded) {
    step(P('attack2'));
    assert.notEqual(fighter.combat.attack?.def.id, 'midair_attack2', 'used up until it lands');
  }
});

test('the Gum-Gum Balloon: whoever touches it is bounced straight up (1, Base Launch 2), on either side', () => {
  for (const gap of [30, -30]) {
    const d = versus({ gap: Math.abs(gap), targetFacing: -1 });
    if (gap < 0) Object.assign(d.target.body, { x: d.attacker.body.x - 30, prevX: d.attacker.body.x - 30 });
    d.tick(P('attack3'));
    after(d, 1);
    const [hit] = mine(d, 'attack3');
    assert.deepEqual([hit.type, hit.damage, hit.baseLaunch, hit.directionalLaunch], ['hit', 1, 2, 'vertical'], `${gap}`);
    assert.ok(hit.finalLaunch.y < 0, 'bounced up');
  }
  const atk = createAttackDefinition({ id: 'attack3', ...DEF.attacks.attack3 });
  assert.ok(near(atk.startup, 0.25) && near(atk.total, 11 / 12), 'a quarter of a second to blow up, 0.92 s in all');
  assert.equal(atk.cooldown, 0);
});

test('the Gum-Gum Balloon bounces a projectile back at its thrower, now #0008\'s, and it strikes the thrower', () => {
  // #0007 fires its pistol at it from 300 away as it blows itself up.
  const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 300 });
  d.tick(P('extra_attack'), P('attack3'));
  for (let i = 0; i < steps(1); i++) d.tick();
  assert.deepEqual(d.events.filter((e) => e.target === d.target && e.type === 'hit'), [], 'the bullet never struck it');
  const back = d.events.find((e) => e.attacker === d.target && e.target === d.attacker && e.redirected);
  assert.ok(back, 'its own bullet comes back at #0007');
  assert.equal(back.ability, 'extra_attack');
});

test('the Floating Balloon: it floats where it is for the whole balloon, and bounces projectiles back; once per airtime', () => {
  const { fighter, step } = solo();
  airborne(step, 6);
  step(P('attack3'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack3');
  assert.equal(fighter.combat.attack.def.motion.type, 'hover');
  assert.equal(fighter.combat.attack.def.deflectProjectiles, true);
  const y0 = fighter.body.y;
  while (fighter.combat.attack) step({});
  assert.ok(Math.abs(fighter.body.y - y0) < 4, 'it held its height');
  step(P('attack3'));
  assert.notEqual(fighter.combat.attack?.def.id, 'midair_attack3', 'used up until it lands');
});

test('the Feast: five sixths of a second raising its food, then it has healed 10; a hit before the first bite breaks it; once every 3 s', () => {
  const t = DEF.techniques.attack4;
  assert.ok(near(SPRITES.duration(t.castAnimation), 5 / 6) && near(SPRITES.duration(t.releaseAnimation), 7 / 12));
  const d = versus({ gap: 300 });
  d.attacker.combat.launchPoint = 30;
  d.tick(P('attack4'));
  assert.equal(activeSpecialAbility(d.attacker), 'attack4', 'its orange mark shows');
  while (d.attacker.technique && d.attacker.combat.launchPoint === 30) d.tick();
  assert.equal(d.attacker.combat.launchPoint, 20, 'healed as it bites in');
  assert.ok(near(d.attacker.combat.abilityCooldowns.remaining('attack4'), 3, DT * 2), 'its 3 s start as it eats');
  // Broken by #0001's jab before it bites in: nothing healed, no cooldown.
  const b = versus({ gap: 40 });
  b.attacker.combat.launchPoint = 30;
  b.tick(P('attack4'));
  after(b, 0.2);
  b.tick({}, P('attack1'));
  after(b, 1);
  assert.equal(b.attacker.technique, null, 'broken');
  assert.ok(b.attacker.combat.launchPoint > 30, 'nothing healed, and the jab landed');
  assert.equal(b.attacker.combat.abilityCooldowns.active('attack4'), false, 'ready again at once');
});

test('the Gum-Gum Giant Pistol: 0.75 s blowing up and swinging the fist back, then a giant fist out to 224 units (10 at Base Launch 3), every 5 s from its release', () => {
  const t = DEF.techniques.attack5;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.75) && near(SPRITES.duration(t.releaseAnimation), 0.6),
    'a deliberate Special: 0.75 s + 0.6 s');
  for (const [gap, lands] of [[60, true], [200, true], [260, false]]) {
    const d = versus({ gap });
    d.tick(P('attack5'));
    if (gap === 200) {
      assert.equal(activeSpecialAbility(d.attacker), 'attack5', 'its orange mark shows');
      assert.equal(d.attacker.combat.abilityCooldowns.active('attack5'), false, 'nothing starts on the press');
    }
    after(d, 1.5);
    const hits = mine(d, 'attack5');
    assert.equal(hits.length > 0, lands, `${gap} away`);
    if (!lands) continue;
    assert.deepEqual([hits[0].type, hits[0].source, hits[0].damage, hits[0].baseLaunch, hits[0].directionalLaunch],
      ['hit', 'technique', 10, 3, 'horizontal']);
    assert.ok(hits[0].finalLaunch.x > 0, 'flung far away from it');
    assert.equal(d.attacker.combat.abilityCooldowns.active('attack5'), true, 'its 5 s run from the release');
  }
});

test('the Gum-Gum Giant Pistol drives a raised Shield back, and a hit before it lets go breaks it: no fist, no cooldown', () => {
  const s = versus({ gap: 150 });
  s.tick({}, { shield: true });
  s.tick(P('attack5'), { shield: true });
  const x0 = s.target.body.x;
  after(s, 1.4, {}, { shield: true });
  assert.deepEqual(mine(s, 'attack5').map((e) => e.type), ['block']);
  assert.ok(s.target.body.x > x0 + 20, `driven back ${s.target.body.x - x0} units`);
  // #0001's jab lands during the wind-up.
  const d = versus({ gap: 40 });
  d.tick(P('attack5'));
  after(d, 0.2);
  d.tick({}, P('attack1'));
  after(d, 1.2);
  assert.equal(d.attacker.technique, null, 'broken');
  assert.deepEqual(mine(d, 'attack5'), [], 'no fist');
  assert.equal(d.attacker.combat.abilityCooldowns.active('attack5'), false, 'ready again at once');
});

test('its Deflect: a whirl of arms and legs, in the air, that turns projectiles back', () => {
  assert.equal(DEF.deflect.deflectProjectiles, true);
  assert.equal(DEF.deflect.animation, 'deflect');
  const { fighter, step } = solo();
  airborne(step);
  step(P('shield'));
  assert.equal(fighter.combat.attack?.def.id, 'deflect');
});

// ---- Its rubber body ---------------------------------------------------------------

test('its rubber body rebounds off a wall from a launch that only stops anyone else, and sends more of it back', () => {
  assert.deepEqual(DEF.launchBounce, { minImpactSpeed: 400, wallRestitution: 0.9, floorRestitution: 0.8, ceilingRestitution: 0.85 });
  const FLOOR = 800;
  const into = (character) => {
    const stage = new StageCollision(stageMap({ solids: [{ id: 'wall', x: 600, y: FLOOR - 200, w: 60, h: 200 }] }));
    const { fighter, step } = makeFighter({ character, sprites: fakeSpritesOf(character), stage, x: 600 - character.collider.width / 2 - 30 });
    fighter.combat.launchPoint = 560 / LAUNCH_UNIT_SPEED;
    const hit = probeHit({ id: 'testLaunch', damage: 0, baseLaunch: 1, directionalLaunch: 'horizontal', hitstun: 0.3, hitstop: 0 });
    new CombatSystem().applyHit(fighter, fighter, hit, { facing: 1, detached: true });
    for (let i = 0; i < 60 && fighter.body.wall !== 1; i++) step({});
    return fighter;
  };
  // Into the wall at about 450 units/s: under everyone's 500, over its 400.
  const other = into(DEF_0001);
  assert.ok(other.body.impactVx > 400 && other.body.impactVx < LAUNCH_BOUNCE.minImpactSpeed, `${other.body.impactVx}`);
  assert.ok(other.body.vx === 0 && !other.bounce, 'anyone else stops dead');
  const rubber = into(DEF);
  assert.ok(rubber.bounce, '#0008 rebounds');
  assert.ok(near(rubber.body.vx, -rubber.body.impactVx * 0.9), 'with nine tenths of its speed');
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays its whole kit: its fists, its stretched punches and stamps, its slingshot, its balloon, its meal and its giant fist', () => {
  // Every fighter as its opponent, at Medium and at Brutal, on two seeds.
  const used = new Map();
  let giants = 0;
  for (const difficulty of ['medium', 'brutal']) {
    for (const seed of [1, 2]) {
      for (const foe of playableCharacters()) {
        const { log, events } = cpuFight(DEF, foe, { seconds: 30, seed, difficulty });
        const me = [...log.keys()].find((f) => f.def === DEF && f.slot === 'p1');
        for (const [k, v] of me.controller.telemetry.moveUsage) used.set(k, (used.get(k) ?? 0) + v);
        giants += events.filter((x) => x.attacker === me && x.type === 'hit' && x.ability === 'attack5').length;
      }
    }
  }
  for (const move of [
    'attack1:ground', 'attack1:air', 'attack2:ground', 'attack2:air', 'attack3:ground', 'attack4:ground', 'attack5:ground',
    'extra_attack:ground',
  ]) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
  assert.ok(giants > 0, 'a giant fist lands now and then');
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0008, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names are put together here so this file never spells them.
const UNNAMED = new RegExp([
  ['l', 'u', 'f', 'f', 'y'].join(''),
  ['m', 'o', 'n', 'k', 'e', 'y', ' ?', 'd', '\\b'].join(''),
  ['o', 'n', 'e', ' ?-?', 'p', 'i', 'e', 'c', 'e'].join(''),
  ['m', 'u', 'g', 'i', 'w', 'a', 'r', 'a'].join(''),
  ['s', 't', 'r', 'a', 'w', ' ?-?', 'h', 'a', 't'].join(''),
].join('|'), 'i');
const BINARY = /\.(png|jpe?g|gif|webp|ico)$/i;

function repositoryPaths(dir = '') {
  return readdirSync(`${ROOT}${dir}` || './', { withFileTypes: true }).flatMap((e) => {
    if (e.name === '.git' || e.name === 'node_modules') return [];
    const path = `${dir}${e.name}`;
    return e.isDirectory() ? [`${path}/`, ...repositoryPaths(`${path}/`)] : [path];
  });
}

test('the character behind #0008 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0008.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
  assert.ok(STAGE);
});
