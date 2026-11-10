// Run with node --test tests/fighters/0013/fighter-0013.test.mjs (no dependencies).
// #0013, the pale-eyed palm fighter: registered from CHARACTERS alone in
// roster slot 13, its clips cut from one sprite sheet into its own folder
// and read from the real PNGs (tight, 1x, one art-pixel scale, anchored on
// its body wherever its chakra, its dome or its field reach, a drawing the
// sheet repeats cut once), four numbered buttons (two ordinary attacks
// with their mid-air versions and two techniques) and an extra attack on the
// ground only. The Gentle Fist and the Sweep Kick up close (its Mash Combo),
// the Air Palm and the Falling Palm in the air, the Protective Palms that
// strike all round it and turn shots back, its Deflect, the Twin Lion Fists
// and the Sixty-Four Palms, and the shared `drain` its palms cut its
// targets' Energy with. The roster, credits and translations it adds are
// checked in empty-roster, settings and i18n; the shared `drain` in drain.
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
import { MAX_ENERGY } from '../../../js/data/energy.js';
import { pad, flick } from '../../../js/data/characters/helpers.js';
import { createAttackDefinition } from '../../../js/game/combat/attacks.js';
import { activeSpecialAbility } from '../../../js/game/combat/move-status.js';
import { Projectile } from '../../../js/game/combat/projectile.js';
import { mobileAbility, previewFrame } from '../../../js/ui/mobile-abilities.js';
import { STRINGS, setLanguage } from '../../../js/localization/i18n.js';

const DIR = 'assets/characters/0013/';
const DEF = getCharacter('0013');
const DEF_0001 = getCharacter('0001');
const DEF_0007 = getCharacter('0007');
const DEF_0009 = getCharacter('0009');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const range = (n, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const named = (codename, order) => (typeof order === 'number' ? range(order) : order).map((i) => `0013_${codename}_${i}.png`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// #0013 on its own, and against #0009 (or `target`) at `gap`.
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
  idle: named('idle', [1, 2, 1, 3]),
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
  deflect: named('deflect', 4),
  attack1: named('attack1', 10),
  midair_attack1: named('midair_attack1', 5),
  attack2: named('attack2', [1, 2, 3, 4, 5, 6, 6]),
  midair_attack2: named('midair_attack2', 4),
  midair_attack2_impact: named('midair_attack2', [5]),
  extra_attack: named('extra_attack', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 3, 13, 14]),
  attack3_cast: named('attack3', 4),
  attack3_release: named('attack3', range(4, 5)),
  attack4_cast: named('attack4', 8),
  attack4_release: named('attack4', range(6, 9)),
};
const PROJECTILES = { attack3_object: named('attack3_object', 4) };
const FILES = [...new Set([...Object.values(CLIPS), ...Object.values(PROJECTILES)].flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 50, run: 46, jump: 53, fall: 53, land: 44, mouvment: 44, midair_mouvment: 44, hurt: 45, midair_hurt: 44,
  prepshield: 48, shielding: 44, deflect: 52, attack1: 48, midair_attack1: 53, attack2: 49, midair_attack2: 48,
  midair_attack2_impact: 42, extra_attack: 81, attack3_cast: 48, attack3_release: 48, attack4_cast: 81,
  attack4_release: 63,
};

// ---- Registration -------------------------------------------------------------------

test('#0013 is a real CHARACTERS entry: available, in roster slot 13, after #0001 to #0012', () => {
  assert.equal(CHARACTERS.find((c) => c.id === '0013'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0013');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 12);
  assert.deepEqual(playableCharacters().map((c) => c.id), [
    '0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013',
  ]);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.equal(DEF.movement, undefined, 'no movement of its own');
  assert.equal(DEF.energy, undefined, 'the shared refill rate');
  assert.equal(DEF.ensemble, undefined, 'one body, drawn as one');
});

test('four numbered attacks, each a button of its own: two ordinary with mid-air versions and two techniques; plus the Protective Palms, on the ground only', () => {
  assert.deepEqual(loadoutProblems(DEF), []);
  assert.deepEqual(DEF.actions, {
    extra_attack: 'extra_attack',
    attack1: { ground: 'attack1', air: 'midair_attack1' },
    attack2: { ground: 'attack2', air: 'midair_attack2' },
    attack3: { type: 'technique', id: 'attack3' },
    attack4: { type: 'technique', id: 'attack4' },
  });
  assert.deepEqual(Object.keys(DEF.attacks).sort(), [
    'attack1', 'attack2', 'extra_attack', 'midair_attack1', 'midair_attack2',
  ]);
  assert.equal(DEF.attacks.midair_attack3, undefined, 'no Rising Palm: the sheet draws no aerial for it');
  assert.equal(DEF.attacks.extra_attack.groundOnly, true, 'the Protective Palms on the ground only');
  assert.deepEqual(Object.keys(DEF.techniques), ['attack3', 'attack4']);
  assert.equal(DEF.summons, undefined, 'it summons nobody');
  assert.deepEqual(Object.keys(DEF.projectiles), ['attack3_object'], 'nothing let go but its lions');
  assert.equal(DEF.effectAnimations, undefined);
  for (const t of Object.values(DEF.techniques)) assert.equal(t.heal, undefined, 'it heals nobody');
  // In the air its Circle / O does nothing: the Protective Palms are a
  // ground move and nothing takes their place.
  const { fighter, step } = solo();
  airborne(step);
  step(P('extra_attack'));
  assert.equal(fighter.combat.attack, null, 'nothing in the air');
});

test('only the Twin Lion Fists costs Energy (its burst, 15) and only the Sixty-Four Palms waits: the policy\'s 5 s for its 10', () => {
  const { fighter } = solo();
  for (const a of Object.values(fighter.attacks)) {
    assert.equal(a.energyCost, 0, `${a.id}: no Energy`);
    assert.equal(a.cooldown, 0, `${a.id}: no cooldown, a drain is ordinary`);
  }
  const lions = fighter.techniqueDefs.attack3;
  assert.deepEqual([lions.energyCost, lions.cooldown, lions.cooldownClass], [15, 0, 'ordinary']);
  const palms = fighter.techniqueDefs.attack4;
  assert.deepEqual([palms.energyCost, palms.cooldown, palms.cooldownClass], [0, 5, 'tenDamage']);
  assert.equal(lions.offense.attack && palms.offense.attack, true);
});

test('two Specials: the Twin Lion Fists and the Sixty-Four Palms; its palms, kicks and dome are ordinary to the player', () => {
  assert.deepEqual(DEF.specialAbilities, ['attack3', 'attack4']);
  for (const move of ['attack3', 'attack4']) assert.equal(isSpecialAbility(DEF, move), true, move);
  for (const move of ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'extra_attack']) {
    assert.equal(isSpecialAbility(DEF, move), false, move);
  }
});

test('its Mash Combo: the Gentle Fist and the Sweep Kick, its two close-range strikes; the dome is no partner', () => {
  assert.deepEqual(DEF.mashCombo, { attacks: ['attack1', 'attack2'] });
  assert.deepEqual(mashComboProblems(DEF), []);
  assert.equal(DEF.attacks.mash_attack, undefined, 'no button-less partner: both are on its buttons');
  const { fighter, step } = solo();
  const seen = [];
  for (let i = 0; i < 5; i++) {
    step(P('attack1'));
    for (let k = 0; k < 4; k++) seen.push(step({}).combat.attack?.def.id);
  }
  for (let i = 0; i < steps(6); i++) seen.push(step({}).combat.attack?.def.id);
  assert.ok(seen.includes('attack2'), 'the Sweep Kick is performed');
  assert.equal(fighter.combat.attack, null, 'and the series is over');
});

test('its in-game names and touch buttons name each move, in English and French, each on a frame of its own art', () => {
  const moves = ['attack1', 'midair_attack1', 'attack2', 'midair_attack2', 'extra_attack', 'attack3', 'attack4'];
  assert.deepEqual(moves.map((m) => abilityName(DEF, m)), [
    'Gentle Fist', 'Air Palm', 'Sweep Kick', 'Falling Palm', 'Protective Palms', 'Twin Lion Fists', 'Sixty-Four Palms',
  ]);
  const buttons = (language) => {
    setLanguage(language);
    try {
      return ['attack1', 'attack2', 'extra_attack', 'attack3', 'attack4'].map((a) => mobileAbility(DEF, a).label);
    } finally {
      setLanguage('en');
    }
  };
  assert.deepEqual(buttons('en'), ['Gentle Fist', 'Sweep Kick', 'Protective Palms', 'Twin Lion Fists', 'Sixty-Four Palms']);
  assert.deepEqual(buttons('fr'), ['Poing souple', 'Balayage', 'Paumes protectrices', 'Poings des lions jumeaux', 'Soixante-quatre paumes']);
  assert.deepEqual(['midair_attack1', 'midair_attack2'].map((m) => STRINGS.fr[`ability.0013.${m}`]),
    ['Paume aérienne', 'Paume plongeante']);
  assert.equal(STRINGS.fr['ability.0013.midair_attack3'], undefined, 'no Rising Palm left in French either');
  assert.equal(STRINGS.en['ability.0013.midair_attack3'], undefined);
  const art = (a, air = false) => previewFrame(DEF, a, air)?.url.split('/').pop() ?? null;
  assert.deepEqual(['attack1', 'attack2', 'extra_attack', 'attack3', 'attack4'].map((a) => art(a)), [
    '0013_attack1_4.png', '0013_attack2_5.png', '0013_extra_attack_7.png', '0013_attack3_5.png', '0013_attack4_11.png',
  ]);
  assert.deepEqual(['attack1', 'attack2'].map((a) => art(a, true)), ['0013_midair_attack1_4.png', '0013_midair_attack2_3.png']);
  for (const a of ['attack1', 'attack2', 'extra_attack', 'attack3', 'attack4']) {
    assert.ok(existsSync(`${ROOT}${mobileAbility(DEF, a).sprite.url.slice(2)}`), a);
  }
  for (const move of Object.keys(DEF.abilityDescriptions)) {
    assert.equal(typeof STRINGS.fr[`ability.0013.${move}.description`], 'string', `${move}: described in French`);
  }
});

test('its recommended controller layout: its palms on Square, its kicks on Triangle, its dome on Circle (on the ground only), the lions on R2, the Sixty-Four Palms on L2, the dive on the right stick down', () => {
  assert.deepEqual(DEF.controller.layout, {
    'ground:attack1': pad('west'),
    'ground:attack2': pad('north'),
    'ground:extra_attack': pad('east'),
    'ground:attack3': pad('r2'),
    'ground:attack4': pad('l2'),
    'air:attack1': pad('west'),
    'air:attack2': flick('down'),
  });
  assert.equal(DEF.attacks.midair_attack2.motion.type, 'slam', 'the stick down for the move that plunges');
  assert.equal(DEF.controller.previous, undefined, 'new: no layout of before');
});

// ---- Art --------------------------------------------------------------------------

test('its folder holds exactly the frames its clips and its lions play: every file named <id>_<codename>_<frame>.png, none a copy', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 95);
  for (const [key, want] of Object.entries(CLIPS)) assert.deepEqual(DEF.animations[key].frames.map(file), want, key);
  assert.deepEqual(Object.keys(DEF.animations).sort(), Object.keys(CLIPS).sort());
  for (const [key, want] of Object.entries(PROJECTILES)) assert.deepEqual(DEF.projectileAnimations[key].frames.map(file), want, key);
  // A drawing the sheet repeats (its stance, its guard's raise and lower,
  // its spin's turned back) is one file, played again, never a copy: no two
  // files anywhere in the folder are the same picture.
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
      assert.ok(!(a && r === 0 && g === 128 && b === 128), `${name}: none of the sheet's background`);
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
  // Its lions are drawn at the same art-pixel size, centred where they are,
  // turned with the way they fly, their jaws working for as long as they fly.
  for (const f of REAL.projectiles.attack3_object.frames) {
    assert.ok(near(f.unit, 1) && near(f.anchorArtX, f.artW / 2) && near(f.anchorArtY, f.artH / 2));
  }
  assert.deepEqual(Object.keys(REAL.projectiles), ['attack3_object']);
  assert.deepEqual(Object.keys(REAL.effects), []);
  assert.equal(REAL.projectiles.attack3_object.sourceFacing, 1, 'the lions turn with their flight');
  assert.equal(REAL.projectiles.attack3_object.loop, true);
});

test('anchors keep the body in place: between its feet where both are planted, on its jacket elsewhere, on the dome\'s middle while the dome is round it', () => {
  const ax = (key) => REAL.animations[key].frames.map((f) => f.anchorArtX);
  const ay = (key) => REAL.animations[key].frames.map((f) => f.anchorArtY);
  const auto = (key) => withFakeCanvas(() => REAL.animations[key].frames.map((f) => f.anchorX));
  // Its palms thrust out and their chakra would pull the automatic anchor
  // forward off its body, its Deflect's arc the same, its dive's streak too.
  for (const i of [0, 1, 3, 4]) assert.ok(auto('attack1')[i] - ax('attack1')[i] > 8, `attack1 frame ${i}`);
  assert.ok(auto('deflect')[1] - ax('deflect')[1] > 4);
  assert.ok(auto('midair_attack2')[2] - ax('midair_attack2')[2] > 4);
  // Its dome, drawn 82 pixels wide round it: on its middle.
  assert.deepEqual(ax('extra_attack').slice(5, 9), [41, 41, 41, 41]);
  // The wisps swept under it as the dome breaks would lift it off the
  // ground.
  assert.equal(ay('extra_attack')[9], 77);
  assert.ok(ay('extra_attack')[9] < REAL.animations.extra_attack.frames[9].artH);
  // Its field of divination spread round it: on its body, not the ring.
  assert.deepEqual(ax('attack4_cast').slice(3, 6), [29.5, 34.5, 38.5]);
  // Its stance between its planted feet.
  assert.deepEqual(ax('idle'), [12.5, 11.5, 12.5, 13.5]);
  for (const key of ['idle', 'run', 'jump', 'fall', 'land', 'shielding', 'attack1', 'attack3_release', 'attack4_release']) {
    for (const f of REAL.animations[key].frames) assert.equal(f.anchorArtY, f.artH, `${key}: stands on the bottom of its art`);
  }
});

test('the roster portrait is its head', () => {
  const portrait = withFakeCanvas(() => REAL.makePortrait());
  assert.ok(portrait, 'a portrait canvas');
  assert.equal(portrait.width, Math.round(49 * DEF.visual.portrait.size), 'from its first stance frame, 49 pixels tall');
});

// ---- Its palms -----------------------------------------------------------------------

test('the Gentle Fist: three palms (1, 1, then a heavy 5 at Base Launch 1), each cutting 5 off its target\'s Energy', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack1'));
  after(d, 0.6);
  const hits = mine(d, 'attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.drained]), [['hit', 1, 5], ['hit', 1, 5], ['hit', 5, 5]]);
  assert.deepEqual([hits[0].launchSpeed, hits[1].launchSpeed], [0, 0], 'held for the next');
  assert.deepEqual([hits[2].baseLaunch, hits[2].directionalLaunch], [1, 'horizontal']);
  assert.ok(d.target.combat.energy < MAX_ENERGY, 'its Energy cut');
  const atk = createAttackDefinition({ id: 'attack1', ...DEF.attacks.attack1 });
  assert.ok(near(atk.startup, 0.1) && near(atk.total, 0.5), 'its first palm at 0.1 s, half a second in all');
  assert.equal(atk.stepIn, 'universal', 'it steps in by the shared Step-in');
  const far = versus({ gap: 130 });
  far.tick(P('attack1'));
  after(far, 0.6);
  assert.deepEqual(mine(far, 'attack1'), [], 'out of its palms\' reach, nothing');
});

test('a raised Shield blocks the Gentle Fist: no Energy drained, only the block\'s own price', () => {
  const d = versus({ gap: 40 });
  d.tick({}, P('shield'));
  after(d, 0.3, {}, { shield: true });
  const before = d.target.combat.energy;
  d.tick(P('attack1'), { shield: true });
  after(d, 0.6, {}, { shield: true });
  const blocks = mine(d, 'attack1');
  assert.deepEqual(blocks.map((e) => [e.type, e.drained]), [['block', 0]], 'a blocked palm stops the string');
  assert.ok(d.target.combat.energy >= before - 15 - 1e-9);
});

test('the Air Palm: two palms in the air (1, then 3 at Base Launch 2), each cutting 5 off its target\'s Energy', () => {
  const d = versus({ gap: 44 });
  hold(d.attacker, 40);
  hold(d.target, 40);
  d.tick(P('attack1'));
  after(d, 0.4);
  const hits = mine(d, 'midair_attack1');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.drained]), [['hit', 1, 5], ['hit', 3, 5]]);
  assert.deepEqual([hits[1].baseLaunch, hits[1].directionalLaunch], [2, 'horizontal']);
});

// ---- Its kicks and its dive ------------------------------------------------------------

test('the Sweep Kick: a low sweep (1) that holds, then a high kick launching straight up (3 at Base Launch 2)', () => {
  const d = versus({ gap: 40 });
  d.tick(P('attack2'));
  after(d, 0.6);
  const hits = mine(d, 'attack2');
  assert.deepEqual(hits.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 1, 0, null], ['hit', 3, 2, 'vertical']]);
  const atk = createAttackDefinition({ id: 'attack2', ...DEF.attacks.attack2 });
  assert.ok(near(atk.startup, 0.2) && near(atk.total, 7 / 15));
  assert.equal(atk.stepIn, 'universal');
  // The sweep runs along the ground: a target in the air above its knees
  // is passed under.
  const air = versus({ gap: 40 });
  hold(air.target, 45);
  air.tick(P('attack2'));
  after(air, 0.6);
  assert.equal(mine(air, 'attack2').some((e) => e.damage === 1), false, 'the sweep passes under it');
});

test('the Falling Palm: a dive palm-first that spikes whoever it meets, then bursts where it lands, draining 15; once per airtime', () => {
  const atk = createAttackDefinition({ id: 'midair_attack2', ...DEF.attacks.midair_attack2 });
  assert.equal(atk.motion.type, 'slam');
  assert.equal(atk.motion.impact.hit.drain, 15);
  // From high over a standing target: the landing's burst catches it.
  const d = versus({ gap: 30 });
  hold(d.attacker, 160);
  d.attacker.body.gravityScale = 1;
  d.tick(P('attack2'));
  assert.equal(d.attacker.combat.attack?.def.id, 'midair_attack2');
  d.until(() => d.attacker.body.grounded, 120);
  after(d, 0.3);
  const hits = mine(d, 'midair_attack2');
  assert.ok(hits.length >= 1, 'it lands on its target');
  assert.ok(hits.some((e) => e.drained === 15 && e.directionalLaunch === 'vertical'), 'the burst where its palm meets the ground');
  // Once per airtime.
  const { fighter, step } = solo();
  airborne(step, 4);
  step(P('attack2'));
  assert.equal(fighter.combat.attack?.def.id, 'midair_attack2');
  assert.equal(fighter.airUsesLeft?.('midair_attack2') ?? 0, 0);
});

// ---- The Protective Palms and the Deflect ----------------------------------------------

test('the Protective Palms: a dome all round it strikes either side (1, 1, then 3 at Base Launch 2 sideways), each draining 5', () => {
  for (const gap of [50, -50]) {
    const d = versus({ gap, targetFacing: gap > 0 ? -1 : 1 });
    d.attacker.facing = 1;
    d.tick(P('extra_attack'));
    after(d, 0.8);
    const hits = mine(d, 'extra_attack');
    assert.deepEqual(hits.map((e) => [e.type, e.damage, e.drained]), [['hit', 1, 5], ['hit', 1, 5], ['hit', 3, 5]], `gap ${gap}`);
    assert.deepEqual([hits[2].baseLaunch, hits[2].directionalLaunch], [2, 'horizontal']);
  }
  const atk = createAttackDefinition({ id: 'extra_attack', ...DEF.attacks.extra_attack });
  assert.ok(near(atk.total, 0.75), 'three quarters of a second');
  assert.equal(atk.offense.defense, true, 'a defense as well as an attack');
  assert.equal(atk.freeCancel, true, 'so it gives way to any valid request');
  assert.equal(atk.stepIn, 'exempt', 'spun where it stands');
});

test('the Protective Palms turn a shot back at its thrower, from either side, and give way to any move', () => {
  for (const [dx, dir] of [[-90, 1], [90, -1]]) {
    const d = duel({ attackerCharacter: DEF_0007, targetCharacter: DEF, targetSprites: SPRITES, gap: 400, targetFacing: -1 });
    d.tick({}, P('extra_attack'));
    assert.equal(d.target.combat.attack?.def.id, 'extra_attack');
    after(d, 0.2);
    shotAt(d, d.attacker, d.target, dx, dir);
    after(d, 0.3);
    assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0013');
    assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.deflections.length, 'turned back');
  }
  const { fighter, step } = solo();
  step(P('extra_attack'));
  for (let i = 0; i < 6; i++) step({});
  step(P('attack1'));
  assert.equal(fighter.combat.attack?.def.id, 'attack1', 'cut short for the Gentle Fist');
});

test('its Deflect: a palm swept up through an arc of chakra, in the air, that turns projectiles back', () => {
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
  assert.deepEqual(d.events.filter((e) => e.target === d.target), [], 'it never struck #0013');
  assert.ok(d.projectiles.some((p) => p.redirected && p.owner === d.target) || d.deflections.length, 'turned back');
});

// ---- The Twin Lion Fists -----------------------------------------------------------------

test('the Twin Lion Fists: two fifths of a second gathering, then its lions surge out ahead (5 at Base Launch 2, 50 Energy drained); 15 Energy', () => {
  const t = DEF.techniques.attack3;
  assert.ok(near(SPRITES.duration(t.castAnimation), 0.4) && near(SPRITES.duration(t.releaseAnimation), 0.4));
  assert.deepEqual(t.projectile, { id: 'attack3_object', offset: { x: 40, y: -50 } });
  const d = versus({ gap: 150 });
  d.tick(P('attack3'));
  assert.equal(activeSpecialAbility(d.attacker), 'attack3', 'under the Special mark');
  assert.equal(d.attacker.combat.energy, 85, 'its 15 as it starts');
  after(d, 0.35);
  assert.equal(d.projectiles.length, 0, 'nothing yet: still gathering');
  assert.deepEqual(mine(d, 'attack3'), []);
  let lions = null;
  for (let i = 0; i < steps(0.4); i++) {
    d.tick();
    lions ??= d.projectiles.find((p) => p.owner === d.attacker) ?? null;
  }
  assert.ok(lions, 'its lions let go');
  assert.equal(lions.def.animation, 'attack3_object');
  assert.equal(lions.direction, 1, 'the way it faces');
  assert.deepEqual(mine(d, 'attack3').map((e) => [e.type, e.source, e.damage, e.baseLaunch, e.directionalLaunch, e.drained]),
    [['hit', 'projectile', 5, 2, 'horizontal', 50]]);
  assert.ok(d.target.combat.energy < 60, 'half its bar bitten off');
  // Out of reach (about 230 units ahead), and behind it, nothing.
  for (const gap of [400, -60]) {
    const miss = versus({ gap, targetFacing: gap > 0 ? -1 : 1 });
    miss.attacker.facing = 1;
    miss.tick(P('attack3'));
    after(miss, 1.2);
    assert.deepEqual(mine(miss, 'attack3'), [], `gap ${gap}`);
  }
  // A raised Shield blocks the lions: nothing drained.
  const guarded = versus({ gap: 150 });
  guarded.tick(P('attack3'), P('shield'));
  after(guarded, 1, {}, { shield: true });
  assert.deepEqual(mine(guarded, 'attack3').map((e) => [e.type, e.drained]), [['block', 0]]);
});

test('the Twin Lion Fists is broken by a hit before its lions bite: nothing released', () => {
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  d.tick({}, P('attack3'));
  assert.ok(d.target.technique, 'gathering');
  d.tick(P('attack1'));
  after(d, 0.6);
  assert.equal(d.target.technique, null, 'broken');
  assert.deepEqual(d.events.filter((e) => e.attacker === d.target), []);
});

// ---- The Sixty-Four Palms -----------------------------------------------------------------

test('the Sixty-Four Palms: its eyes and its field, then the flurry: 10 at Base Launch 3 and its whole bar drained, its target exhausted; every 5 s', () => {
  const t = DEF.techniques.attack4;
  assert.ok(near(SPRITES.duration(t.castAnimation), 8 / 12) && near(SPRITES.duration(t.releaseAnimation), 0.4));
  for (const gap of [70, -35]) {
    const d = versus({ gap, targetFacing: gap > 0 ? -1 : 1 });
    d.attacker.facing = 1;
    d.tick(P('attack4'));
    assert.equal(activeSpecialAbility(d.attacker), 'attack4', 'under the Special mark');
    after(d, 0.6);
    assert.deepEqual(mine(d, 'attack4'), [], 'nothing yet: still spreading its field');
    after(d, 0.2);
    const hits = mine(d, 'attack4');
    assert.deepEqual(hits.map((e) => [e.type, e.damage, e.baseLaunch, e.directionalLaunch]), [['hit', 10, 3, 'horizontal']], `gap ${gap}`);
    assert.ok(hits[0].drained > 90, 'all it had');
    assert.equal(d.target.combat.energyExhausted, true, 'its chakra sealed');
    assert.ok(d.attacker.combat.abilityCooldowns.active('attack4'), 'its 5 s from the release');
    assert.equal(d.attacker.combat.energy, 100, 'no Energy');
  }
  // Sealed, it has no Shield until its bar is full again.
  const sealed = versus({ gap: 70 });
  sealed.tick(P('attack4'));
  after(sealed, 1.5);
  sealed.tick({}, P('shield'));
  assert.equal(sealed.target.combat.shielding, false, 'no Shield while sealed');
  // Out of its field, nothing.
  const far = versus({ gap: 180 });
  far.tick(P('attack4'));
  after(far, 1);
  assert.deepEqual(mine(far, 'attack4'), []);
  // A raised Shield blocks it like any hit: nothing drained.
  const guarded = versus({ gap: 70 });
  guarded.tick(P('attack4'), P('shield'));
  after(guarded, 1, {}, { shield: true });
  assert.deepEqual(mine(guarded, 'attack4').map((e) => [e.type, e.drained]), [['block', 0]]);
});

test('the Sixty-Four Palms is broken by a hit before its palms strike: no flurry, no cooldown', () => {
  const d = duel({ attackerCharacter: DEF_0001, targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  d.tick({}, P('attack4'));
  assert.ok(d.target.technique, 'casting');
  d.tick(P('attack1'));
  after(d, 0.6);
  assert.equal(d.target.technique, null, 'broken');
  assert.equal(d.target.combat.abilityCooldowns.active('attack4'), false, 'nothing released, no cooldown');
  assert.deepEqual(d.events.filter((e) => e.attacker === d.target), []);
});

// ---- The CPU ---------------------------------------------------------------------------

test('the CPU plays its whole kit: its palms, its kicks, its dive, its dome, its lions and the Sixty-Four Palms', () => {
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
    'attack1:ground', 'attack1:air', 'attack2:ground', 'attack2:air', 'extra_attack:ground', 'attack3:ground', 'attack4:ground',
  ]) {
    assert.ok(used.get(move) > 0, `it uses ${move}`);
  }
});

// ---- Its source -----------------------------------------------------------------------

// The character behind #0013, never named: not in the game, the code, the
// data, the file names, the tests or the documentation. (Only the owner's
// own direction, character_rule, which is protected, says who it is.) Its
// names and its family's are put together here so this file never spells
// them.
const UNNAMED = new RegExp([
  ['h', 'i', 'n', 'a', 't', 'a'].join(''),
  ['h', 'y', 'u', 'u', '?', 'g', 'a'].join(''),
  ['h', 'y', 'ū', 'g', 'a'].join(''),
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

test('the character behind #0013 is never named anywhere in the repository', () => {
  const paths = repositoryPaths().filter((p) => p !== 'character_rule');
  assert.ok(paths.includes('js/data/characters/0013.js') && paths.includes('UPDATES.md'), 'the walk sees the repository');
  for (const path of paths) assert.doesNotMatch(path, UNNAMED, `${path}: its name`);
  for (const path of paths.filter((p) => !p.endsWith('/') && !BINARY.test(p))) {
    const lines = readFileSync(`${ROOT}${path}`, 'utf8').split('\n');
    const hit = lines.findIndex((line) => UNNAMED.test(line));
    assert.equal(hit, -1, `${path}:${hit + 1}`);
  }
  assert.doesNotMatch(JSON.stringify(DEF), UNNAMED);
});
