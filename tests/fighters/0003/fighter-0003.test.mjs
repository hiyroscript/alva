// Run with node --test tests/fighters/0003/fighter-0003.test.mjs (no dependencies).
// #0003, the medic brawler: registered from CHARACTERS alone in roster slot
// 03, its clips cut from one sprite sheet into its own folder and read from
// the real PNGs (tight, 1x, one art-pixel scale, anchored on the body),
// four numbered buttons (two ordinary attacks with their mid-air versions,
// two techniques) and an extra attack, every move a mechanic of its own:
// the Chakra Punch shoving a Shield back, the Leaping Kick's rise, the Heel
// Drop's spike and the crack round its heel, the Heavenly Foot of Pain's
// plunge and the crater it lands in, Cherry Blossom Impact's eruption
// either side, the Mystical Palm Technique's heal and the Chakra Haymaker's
// lunge. The quake, slam and heal they are built on are checked on bespoke
// data in tests/systems/ (quake, slam, technique); the roster, credits and
// translations it adds in empty-roster, settings and i18n. Layout and paint
// still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { DT, STAGE, duel, fakeSpritesOf, makeFighter, stageMap, steps } from '../../helpers/fighter-harness.mjs';
import { ROOT, decodePng, realArt, withFakeCanvas } from '../../helpers/png-art.mjs';
import { CHARACTERS, getCharacter, playableCharacters } from '../../../js/data/characters.js';
import { abilityName } from '../../../js/data/abilities.js';
import { describeLoadout, loadoutProblems } from '../../../js/data/loadout.js';
import { pad } from '../../../js/data/characters/helpers.js';
import { createAttackDefinition } from '../../../js/game/combat/attacks.js';
import { CombatSystem } from '../../../js/game/combat/combat.js';
import { CombatAIController } from '../../../js/game/ai/combat-ai.js';
import { Fighter } from '../../../js/game/fighters/fighter.js';
import { StageCollision } from '../../../js/game/physics.js';
import { mulberry32 } from '../../../js/core/utils.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';
import { CONFIG } from '../../../js/config.js';

const DIR = 'assets/characters/0003/';
const DEF = getCharacter('0003');
const DEF_0001 = getCharacter('0001');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, n, from = 1) => range(n, from).map((i) => `0003_${codename}_${i}.png`);

// #0003 on its own, and against #0001 at `gap`.
const solo = (opts = {}) => makeFighter({ character: DEF, sprites: SPRITES, ...opts });
const versus = (opts = {}) => duel({
  attackerCharacter: DEF, attackerSprites: SPRITES, targetCharacter: DEF_0001, targetSprites: fakeSpritesOf(DEF_0001), ...opts,
});
// Into the air, `rise` steps after a jump.
const airborne = (tick, rise = 12) => {
  tick(P('jump'));
  for (let i = 0; i < rise; i++) tick({});
};
// Lifts `f` `height` off the floor and holds it there.
function hold(f, height) {
  Object.assign(f.body, { y: f.body.y - height, grounded: false, ground: null, gravityScale: 0, vy: 0 });
}
const mine = (d, move) => d.events.filter((e) => e.attacker === d.attacker && (e.move === move || e.ability === move));

const { images: IMAGES, sprites: REAL } = realArt(DEF);

// Every clip and the files it plays, in order.
const CLIPS = {
  idle: named('idle', 4),
  run: named('run', 8),
  jump: named('jump', 2),
  fall: named('fall', 2),
  land: named('land', 2),
  mouvment: named('mouvment', 2),
  midair_mouvment: named('midair_mouvment', 2),
  hurt: named('hurt', 2),
  midair_hurt: named('midair_hurt', 1),
  prepshield: named('prepshield', 1),
  shielding: named('shielding', 1),
  releaseshield: named('releaseshield', 1),
  deflect: named('deflect', 4),
  attack1: named('attack1', 6),
  midair_attack1: named('midair_attack1', 3),
  attack2: named('attack2', 10),
  midair_attack2: named('midair_attack2', 3),
  midair_attack2_impact: named('midair_attack2', 4, 4),
  attack3_cast: named('attack3', 4),
  attack3_release: named('attack3', 5, 5),
  attack4_cast: named('attack4', 6),
  attack4_release: named('attack4', 1, 7),
  extra_attack: named('extra_attack', 8),
};
const FILES = [...new Set(Object.values(CLIPS).flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 48, run: 44, jump: 48, fall: 47, land: 43, mouvment: 31, midair_mouvment: 47, hurt: 48, midair_hurt: 29,
  prepshield: 45, shielding: 44, releaseshield: 46, deflect: 45, attack1: 46, midair_attack1: 49, attack2: 52,
  midair_attack2: 56, midair_attack2_impact: 61, attack3_cast: 47, attack3_release: 43, attack4_cast: 45,
  attack4_release: 45, extra_attack: 48,
};

// ---- Registration -------------------------------------------------------------------

test('#0003 is a real CHARACTERS entry: available, in roster slot 03, after #0001 and #0002', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0003'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0003');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 2);
  assert.deepEqual(playableCharacters().map((c) => c.id), ['0001', '0002', '0003']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.deepEqual(Object.keys(DEF.energy), ['regen'], 'its refill rate only');
});

test('four numbered attacks, each a button of its own: two ordinary with mid-air versions, two techniques; plus the Chakra Haymaker', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    transform: null,
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { type: 'technique', id: 'attack3' },
    attack4: { type: 'technique', id: 'attack4' },
  });
  assert.deepEqual(describeLoadout(DEF), {
    numbered: ['attack1', 'attack2', 'attack3', 'attack4'],
    buttons: ['attack1', 'attack2', 'attack3', 'attack4'],
    air: { attack1: 'midair_attack1', attack2: 'midair_attack2' },
    types: { attack1: 'attack', attack2: 'attack', attack3: 'technique', attack4: 'technique' },
    extra: true,
  });
  assert.deepEqual(Object.keys(DEF.attacks).sort(), ['attack1', 'attack2', 'extra_attack', 'midair_attack1', 'midair_attack2']);
  assert.deepEqual(Object.keys(DEF.techniques), ['attack3', 'attack4']);
  for (const field of ['summons', 'projectiles', 'projectileAnimations', 'effectAnimations']) assert.equal(DEF[field], undefined, `no ${field}`);
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  assert.deepEqual(
    ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'attack3', 'attack4', 'extra_attack'].map((m) => abilityName(DEF, m)),
    ['Chakra Punch', 'Leaping Kick', 'Heel Drop', 'Heavenly Foot of Pain', 'Cherry Blossom Impact', 'Mystical Palm Technique', 'Chakra Haymaker'],
  );
  assert.equal(abilityName(DEF, 'attack5'), 'Attack 5', 'what it does not have keeps the neutral name');
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Chakra Haymaker', 'Chakra Punch', 'Heel Drop', 'Cherry Blossom Impact', 'Mystical Palm Technique']);
  assert.deepEqual(buttons('fr'), ['Swing de chakra', 'Poing de chakra', 'Coup de talon', 'Impact des fleurs de cerisier', 'Technique de la paume mystique']);
  const art = (a) => previewFrame(DEF, a)?.url.split('/').pop() ?? null;
  assert.deepEqual(['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4'].map(art), [
    '0003_extra_attack_5.png', '0003_attack1_4.png', '0003_attack2_6.png', '0003_attack3_3.png', '0003_attack4_4.png',
  ]);
  for (const a of ['extra_attack', 'attack1', 'attack2', 'attack3', 'attack4']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  assert.equal(mobileAbility(DEF, 'attack5'), null, 'no fifth button');
  assert.equal(mobileAbility(DEF, 'transform').pending, true, 'Transform reserved');
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0003.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: the strikes on single face buttons, the heavy blows behind R2, the heal behind L2', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:attack3': pad('west', { modifier: 'r2' }),
    'ground:attack4': pad('north', { modifier: 'l2' }),
    'ground:extra_attack': pad('north', { modifier: 'r2' }),
    'air:attack1': pad('west'),
    'air:attack2': pad('north'),
  });
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips play: every file named <id>_<codename>_<frame>.png', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 82);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
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

test('the real art normalizes at one art pixel per file pixel, the roster\'s size per art pixel', () => {
  assert.equal(REAL.usable, true);
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.refArtHeight, 48);
  assert.ok(Math.abs(REAL.worldPerArt - 88 / 52) < 1e-9, 'the same world size per art pixel as #0001 and #0002');
  assert.ok(Math.abs(DEF.visual.height - 48 * 88 / 52) < 1e-9, 'about 81 units tall');
  for (const [key, anim] of Object.entries(REAL.animations)) {
    assert.equal(anim.maxArtH, HEIGHTS[key], `${key}: tallest frame`);
    for (const f of anim.frames) {
      assert.ok(Math.abs(f.unit - 1) < 1e-9, `${key}: one file pixel per art pixel`);
      assert.equal(f.artW, IMAGES.get(f.url).naturalWidth);
      assert.equal(f.artH, IMAGES.get(f.url).naturalHeight);
    }
  }
});

test('anchors keep the body in place: authored on the red top where an arm, a trail or flung hair would drag it', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  assert.deepEqual(ax('attack1'), [12, 13, 17, 19, 19.5, 14.5]);
  assert.deepEqual(ax('extra_attack'), [10.5, 11, 11, 15.5, 21, 23.5, 24, 13]);
  assert.deepEqual(ax('attack3_release'), [16, 15, 15, 15, 13.5]);
  assert.deepEqual(ax('mouvment'), [27, 31]);
  // The Heavenly Foot of Pain's last plunge frame: the feet above the heel's
  // arc, so the arc sweeps below the body instead of lifting it.
  const slam = REAL.animations.midair_attack2.frames;
  assert.deepEqual(slam.map((f) => f.anchorArtY), [56, 51, 36]);
  assert.ok(slam[2].anchorArtY < slam[2].artH);
  for (const key of ['idle', 'run', 'hurt', 'shielding', 'attack1', 'attack2', 'extra_attack', 'midair_attack2_impact']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its face', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(48 * DEF.visual.portrait.size));
});

// ---- Its moves -------------------------------------------------------------------------

test('the Chakra Punch: quick, 3 and a push, and a Shield that blocks it is shoved back', () => {
  const d = versus({ gap: 34 });
  d.tick(P('attack1'));
  d.until(() => d.events.length > 0, 30);
  const [hit] = d.events;
  assert.equal(hit.type, 'hit');
  assert.equal(hit.move, 'attack1');
  assert.equal(hit.damage, 3);
  assert.equal(hit.baseLaunch, 1);
  assert.equal(hit.directionalLaunch, 'horizontal');
  const b = versus({ gap: 34 });
  b.tick({}, { shield: true });
  b.tick(P('attack1'), { shield: true });
  for (let i = 0; i < 30 && !b.events.length; i++) b.tick({}, { shield: true });
  assert.equal(b.events[0].type, 'block');
  assert.ok(b.target.body.vx > 300, 'the guard holds, the ground under it does not');
});

test('the Leaping Kick rises off the air as it strikes: its anti-air and its way back, once per airtime', () => {
  const { fighter, step } = solo();
  airborne(step, 20);
  const y0 = fighter.body.y;
  step(P('attack1'));
  for (let i = 0; i < steps(3 / 15); i++) step({});
  assert.ok(fighter.body.y < y0 - 40, `it rose (${(y0 - fighter.body.y).toFixed(0)} units)`);
  assert.equal(fighter.combat.attack.def.motion.type, 'rise');
  while (fighter.combat.attack) step({});
  step(P('attack1'));
  assert.notEqual(fighter.combat.attack?.def.id, 'midair_attack1', 'not again before it lands');
  // Its kick: 3, Base Launch 2 sideways.
  const atk = createAttackDefinition({ id: 'midair_attack1', ...DEF.attacks.midair_attack1 });
  assert.deepEqual([atk.damage, atk.baseLaunch, atk.directionalLaunch, atk.airUses], [3, 2, 'horizontal', 1]);
});

test('the Heel Drop: the heel drives whoever is in front down, then the ground cracks round it under whoever still stands there', () => {
  // In front: the heel's spike (3, downward).
  const front = versus({ gap: 30 });
  front.tick(P('attack2'));
  for (let i = 0; i < steps(0.4); i++) front.tick();
  const [heel] = mine(front, 'attack2');
  assert.equal(heel.type, 'hit');
  assert.equal(heel.damage, 3);
  assert.equal(heel.directionalLaunch, 'reverseVertical');
  // Behind, out of the heel's way: only the crack, a quake (1, popped up).
  const behind = versus({ gap: -40, attackerFacing: 1 });
  behind.tick(P('attack2'));
  for (let i = 0; i < steps(0.4); i++) behind.tick();
  const crack = mine(behind, 'attack2');
  assert.equal(crack.length, 1);
  assert.equal(crack[0].damage, 1);
  assert.ok(crack[0].finalLaunch.y < 0, 'popped upward');
  // ...and off the ground there, nothing at all.
  const above = versus({ gap: -40, attackerFacing: 1 });
  hold(above.target, 30);
  above.tick(P('attack2'));
  for (let i = 0; i < steps(0.4); i++) above.tick();
  assert.deepEqual(mine(above, 'attack2'), [], 'the crack runs through the ground only');
});

test('the Heavenly Foot of Pain plunges heel-first and splits the ground where it lands: 5 and a big launch upward to whoever stands near', () => {
  for (const [gap, lifted, want] of [[100, 0, 'hit'], [-100, 0, 'hit'], [100, 60, null]]) {
    const d = versus({ gap });
    if (lifted) hold(d.target, lifted);
    airborne(d.tick);
    d.tick(P('attack2'));
    for (let i = 0; i < 120 && !d.attacker.body.grounded; i++) d.tick();
    assert.equal(d.attacker.combat.attack?.motion?.landed, true, 'landed, heel in the ground');
    assert.equal(d.attacker.animator.anim.key, 'midair_attack2_impact');
    const impact = mine(d, 'midair_attack2');
    assert.equal(impact[0]?.type ?? null, want, `${gap} away, ${lifted} up`);
    if (want) {
      assert.equal(impact[0].damage, 5);
      assert.equal(impact[0].baseLaunch, 3);
      assert.ok(impact[0].finalLaunch.y < 0);
    }
  }
});

test('Cherry Blossom Impact: a cast, then the ground erupts 150 either side, throwing up everyone standing on it; a jump clears it, a Shield blocks it', () => {
  const cast = DEF.animations.attack3_cast;
  for (const [gap, lifted, shield, want] of [[120, 0, false, 'hit'], [-120, 0, false, 'hit'], [120, 50, false, null], [120, 0, true, 'block'], [200, 0, false, null]]) {
    const d = versus({ gap });
    if (lifted) hold(d.target, lifted);
    const guard = shield ? { shield: true } : {};
    d.tick({}, guard);
    d.tick(P('attack3'), guard);
    assert.ok(d.attacker.technique, 'cast');
    let n = 0;
    while (d.attacker.technique && n < 120) {
      d.tick({}, guard);
      n++;
    }
    const e = mine(d, 'attack3');
    assert.equal(e[0]?.type ?? null, want, `${gap} away, ${lifted} up${shield ? ', Shield up' : ''}`);
    if (want === 'hit') {
      assert.equal(e[0].damage, 5);
      assert.equal(e[0].baseLaunch, 3);
      assert.ok(e[0].finalLaunch.y < 0, 'thrown upward');
      assert.equal(e[0].source, 'technique');
    }
    assert.equal(d.attacker.techniqueDefs.attack3.cooldown, 0.5, 'a quake and a launch earn no cooldown: only the repeat delay');
    assert.equal(d.attacker.combat.abilityCooldowns.active('attack3'), false, 'over before the cast and release are');
  }
  assert.ok(Math.abs(cast.frames.length / cast.fps - 0.4) < 1e-9, 'a 0.4 s cast to see it coming');
});

test('the Mystical Palm Technique heals it of 10 Launch Points as it stands up; a hit while it kneels breaks it', () => {
  const { fighter, step } = solo();
  fighter.combat.launchPoint = 40;
  fighter.combat.launchRecoveryRemaining = 99;
  step(P('attack4'));
  let n = 0;
  while (!fighter.heals.length && n < 120) {
    step({});
    n++;
  }
  assert.ok(Math.abs((n + 1) * DT - 1) < 0.05, `a full second knelt (${((n + 1) * DT).toFixed(2)} s)`);
  assert.deepEqual(fighter.heals, [{ amount: 10, ability: 'attack4' }]);
  assert.equal(fighter.combat.launchPoint, 30);
  assert.equal(fighter.combat.abilityCooldowns.duration('attack4'), 3, 'a heal: the policy\'s 3 s');
  // Broken while it kneels.
  const d = versus({ gap: 300 });
  d.attacker.combat.launchPoint = 40;
  d.tick(P('attack4'));
  for (let i = 0; i < 20; i++) d.tick();
  new CombatSystem().applyHit(d.target, d.attacker, createAttackDefinition({ id: 'testHit', damage: 1, hitstun: 0.2, hitstop: 0 }));
  for (let i = 0; i < steps(1.5); i++) d.tick();
  assert.equal(d.attacker.combat.launchPoint, 41, 'nothing healed');
});

test('the Chakra Haymaker: the glove tugged, a lunge, and the overhand blow: 5, Base Launch 3 sideways, a Shield driven back', () => {
  const d = versus({ gap: 70 });
  const x0 = d.attacker.body.x;
  d.tick(P('extra_attack'));
  d.until(() => d.events.length > 0, 40);
  const [hit] = d.events;
  assert.equal(hit.move, 'extra_attack');
  assert.equal(hit.damage, 5);
  assert.equal(hit.baseLaunch, 3);
  assert.equal(hit.directionalLaunch, 'horizontal');
  assert.ok(d.attacker.body.x > x0 + 10, 'it lunged in');
  const b = versus({ gap: 70 });
  b.tick({}, { shield: true });
  b.tick(P('extra_attack'), { shield: true });
  for (let i = 0; i < 40 && !b.events.length; i++) b.tick({}, { shield: true });
  assert.equal(b.events[0].type, 'block');
  assert.ok(b.target.body.vx > 600, 'driven back across the ground');
  // Ground only.
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null);
});

// ---- The CPU ---------------------------------------------------------------------------

// #0003 as a CPU at Brutal against a still #0001, `apart` units away, with
// `lp` Launch Point: whether it starts its heal within `seconds`.
function cpuHeals(apart, lp, seconds) {
  const stage = new StageCollision(stageMap());
  const cpu = new Fighter({
    def: DEF, sprites: SPRITES, stage, slot: 'p2', label: 'CPU', spawn: { x: 400, facing: 1 },
    controller: new CombatAIController({ difficulty: 'brutal', rng: mulberry32(7) }),
  });
  const foe = new Fighter({ def: DEF_0001, sprites: fakeSpritesOf(DEF_0001), stage, slot: 'p1', label: 'P1', spawn: { x: 400 + apart, facing: -1 } });
  cpu.opponent = foe;
  foe.opponent = cpu;
  const world = { stage, projectiles: [], clones: [], combat: new CombatSystem(), score: { p1: 0, p2: 0 }, timeLeft: 99, fighters: [foe, cpu] };
  const ctx = { stage, gravity: CONFIG.sim.gravity, battle: world };
  cpu.combat.launchPoint = lp;
  for (let i = 0; i < seconds / DT; i++) {
    foe.update(DT, ctx);
    foe.body.x = 400 + apart;
    cpu.update(DT, ctx);
    world.combat.update(world.fighters, [], []);
    if (cpu.technique?.def.id === 'attack4') return true;
  }
  return false;
}

test('the CPU heals when the opponent cannot reach it in time and it has taken enough, never in reach or for a scratch', () => {
  assert.equal(cpuHeals(1200, 40, 2), true, 'far away, hurt: it heals');
  assert.equal(cpuHeals(90, 40, 1.5), false, 'within reach: never');
  assert.equal(cpuHeals(1200, 5, 1.5), false, 'a scratch is not worth the cast');
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0003, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names are put together here so this file never spells them.
const UNNAMED = new RegExp([['s', 'a', 'k', 'u', 'r', 'a'], ['h', 'a', 'r', 'u', 'n', 'o']].map((l) => l.join('')).join('|'), 'i');
const BINARY = /\.(png|jpe?g|gif|webp|ico)$/i;

function repositoryPaths(dir = '') {
  return readdirSync(`${ROOT}${dir}` || './', { withFileTypes: true }).flatMap((e) => {
    if (e.name === '.git' || e.name === 'node_modules') return [];
    const path = `${dir}${e.name}`;
    return e.isDirectory() ? [`${path}/`, ...repositoryPaths(`${path}/`)] : [path];
  });
}

test('the character behind #0003 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0003.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
  assert.equal(STAGE instanceof StageCollision, true);
});
