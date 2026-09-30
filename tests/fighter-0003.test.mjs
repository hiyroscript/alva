// Run with node --test tests/fighter-0003.test.mjs (no dependencies).
// #0003, the third fighter: registered from CHARACTERS alone in roster slot
// 03, its fifteen clips (idle, run, Dash, jump, fall, land, hurt, mid-air
// hurt, the three Charge clips and five attacks) cut from one sprite sheet
// into its own folder and read from the real PNGs (tightly cropped, 1x, one
// art-pixel scale, anchored on the sheet's own origin), each attack hitting
// with its own data, the CPU going by the same data, and fights against
// #0001, #0002 and itself that run. Its touch buttons are checked in
// controls-ui.test.mjs, the credits in settings.test.mjs and the screens
// that load it in the practice-ground and watch-mode tests. Layout and
// paint still need real-browser verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import {
  DT, cpuFight, duel, fakeSpritesOf, frameName, makeFighter, recordAttack, sequence, stepUntil, steps,
} from './fighter-harness.mjs';
import { ROOT, buildReal, decodePng, opaque, rowSpan, sha256, walk } from './real-art.mjs';
import { CONFIG, MOVES } from '../js/config.js';
import { CHARACTERS, TEMPORARY_BASELINE, characterFramePaths, getCharacter } from '../js/data/characters.js';
import { abilityName } from '../js/data/abilities.js';
import { readMoveset } from '../js/game/combat-ai.js';
import { cbaIndicators } from '../js/game/fighter-status.js';
import { Arena, computeWorldScale } from '../js/game/arena.js';
import { getMap } from '../js/data/maps.js';

const DIR = 'assets/characters/0003/';
const BASE = `./${DIR}0003_`;
const DEF = getCharacter('0003');
const DEF_0001 = getCharacter('0001');
const DEF_0002 = getCharacter('0002');
const SPRITES = fakeSpritesOf(DEF);
const P = (k) => ({ [k]: true, [`${k}Pressed`]: true });
const file = (url) => url.split('/').pop();
const files = (anim) => anim.frames.map(file);
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const numbered = (name, n) => range(n).map((i) => `0003_${name}${i}.png`);

// Every clip and the files it plays, in order.
const CLIPS = {
  idle: numbered('idle', 4),
  run: numbered('run', 4),
  dash: numbered('dash', 2),
  jump: ['0003_jump.png'],
  fall: numbered('fall', 2),
  land: numbered('land', 2),
  hurt: ['0003_hurt.png'],
  midairHurt: ['0003_midairhurt.png'],
  chargeStart: numbered('charge', 4),
  chargeLoop: ['0003_chargea.png', '0003_chargeb.png'],
  chargeRelease: ['0003_charge4.png'],
  ba1: numbered('1ba', 5),
  maba1: numbered('midair1ba', 5),
  ba2: numbered('2ba', 6),
  maba2: numbered('midair2ba', 5),
  uniqueba: numbered('palm', 7),
};
// Its folder: every file once (the release reuses the startup's last frame).
const FILES = [...new Set(Object.values(CLIPS).flat())].sort();

// The tallest frame of each clip, in art pixels (one per file pixel).
const HEIGHTS = {
  idle: 49, run: 39, dash: 38, jump: 57, fall: 62, land: 41, hurt: 51, midairHurt: 45,
  chargeStart: 48, chargeLoop: 46, chargeRelease: 48, ba1: 50, maba1: 67, ba2: 57, maba2: 58, uniqueba: 52,
};

const REAL = buildReal(DEF, characterFramePaths(DEF));
// #0001's reference clip alone (its idle), for its art-pixel size.
const REAL_0001_IDLE = buildReal(
  { ...DEF_0001, animations: { idle: DEF_0001.animations.idle }, projectileAnimations: {}, effectAnimations: {} },
  DEF_0001.animations.idle.frames,
);

// ---- Registration ---------------------------------------------------------------

test('#0003 is a real CHARACTERS entry: available, in roster slot 2 (the third), after #0001 and #0002', () => {
  assert.ok(DEF, 'getCharacter("0003")');
  assert.equal(CHARACTERS.find((c) => c.id === '0003'), DEF, 'the definition itself, not a copy');
  assert.equal(DEF.displayName, '#0003');
  assert.equal(DEF.available, true);
  assert.equal(DEF.rosterSlot, 2);
  assert.deepEqual([DEF_0001.rosterSlot, DEF_0002.rosterSlot], [0, 1]);
  const available = CHARACTERS.filter((c) => c.available).sort((a, b) => a.rosterSlot - b.rosterSlot);
  assert.deepEqual(available.map((c) => c.id), ['0001', '0002', '0003']);
  assert.equal(new Set(CHARACTERS.map((c) => c.rosterSlot)).size, CHARACTERS.length, 'one fighter per slot');
  assert.ok(CHARACTERS.every((c) => c.rosterSlot < CONFIG.roster.totalSlots));
  assert.equal(getCharacter('0004'), null);
});

// ---- Assets -----------------------------------------------------------------------

test('its folder holds exactly the files its clips play, and none is anywhere else', () => {
  assert.deepEqual(readdirSync(`${ROOT}${DIR}`).sort(), FILES);
  assert.equal(FILES.length, 51);
  assert.deepEqual(readdirSync(ROOT).filter((n) => /\.png$/i.test(n) && /^000\d/.test(n)), [], 'no fighter art at the root');
  assert.deepEqual(walk().filter((p) => /(^|\/)0003_/.test(p) && !p.startsWith(DIR)), [], 'no 0003 file outside its folder');
  // Idle's third frame is the same drawing as its first: the breath's middle.
  assert.equal(sha256(`${DIR}0003_idle3.png`), sha256(`${DIR}0003_idle1.png`));
});

test('every frame is cut clean: the sheet\'s background gone, fully opaque or fully clear, cropped tight to the art', () => {
  for (const name of FILES) {
    const png = decodePng(`${ROOT}${DIR}${name}`);
    const { naturalWidth: w, naturalHeight: h, pixels } = png;
    const alpha = (x, y) => pixels[(y * w + x) * 4 + 3];
    let background = 0;
    for (let i = 0; i < w * h; i++) {
      const [r, g, b, a] = pixels.subarray(i * 4, i * 4 + 4);
      assert.ok(a === 0 || a === 255, `${name}: no half-transparent edge`);
      if (a && r === 128 && g === 128 && b === 255) background++;
    }
    assert.equal(background, 0, `${name}: none of the sheet's lavender background left`);
    // Something drawn on every edge: no transparent margin, nothing cut off.
    const row = (y) => range(w).some((x) => alpha(x - 1, y));
    const col = (x) => range(h).some((y) => alpha(x, y - 1));
    assert.ok(row(0) && row(h - 1) && col(0) && col(w - 1), `${name}: cropped tight`);
  }
});

test('exactly its sixteen clips, each on its own art in order; idle, run and the Charge loop loop', () => {
  const A = DEF.animations;
  assert.deepEqual(Object.keys(A).sort(), Object.keys(CLIPS).sort(), 'exactly these clips');
  for (const [key, names] of Object.entries(CLIPS)) {
    assert.deepEqual(files(A[key]), names, key);
    for (const url of A[key].frames) assert.ok(url.startsWith(BASE), `${url}: relative, in #0003's folder`);
    assert.equal(A[key].anchorX.length, names.length, `${key}: an anchor for every frame`);
  }
  assert.deepEqual(Object.keys(A).filter((k) => A[k].loop).sort(), ['chargeLoop', 'idle', 'run']);
  assert.ok(A.run.minSpeedScale > 0 && A.run.minSpeedScale < 1, 'the run follows its speed');
  assert.ok(A.land.frames.length / A.land.fps <= 1 / 6, 'a touchdown lasts no more than 1/6 s');
  assert.equal(A.dash.frames.length / A.dash.fps, 0.2, 'a Dash lasts 0.2 s');
});

test('characterFramePaths loads each of its files once, every one on disk; none of #0001\'s or #0002\'s', () => {
  const paths = characterFramePaths(DEF);
  assert.equal(new Set(paths).size, paths.length, 'each file once');
  assert.deepEqual(paths.map(file).sort(), FILES);
  for (const url of paths) {
    assert.ok(url.startsWith(BASE), url);
    assert.ok(existsSync(ROOT + url.slice(2)), `${url} exists`);
  }
  for (const other of [DEF_0001, DEF_0002]) {
    assert.equal(characterFramePaths(other).filter((u) => paths.includes(u)).length, 0, `nothing shared with #${other.id}`);
  }
});

// ---- The real art: scale, anchors, body ------------------------------------------------

test('the real art: every frame found, 1x, one art-pixel scale, the 49-pixel idle as reference', () => {
  assert.deepEqual(REAL.missing, []);
  assert.equal(REAL.usable, true);
  assert.equal(REAL.refArtHeight, 49);
  for (const [key, anim] of Object.entries(REAL.animations)) {
    for (const f of anim.frames) {
      // No pixel grid to find: one file pixel is one art pixel...
      assert.equal(f.detected, 1, `${f.url}: 1x`);
      // ...which heightRatio (the clip's tallest frame over idle's 49) keeps.
      assert.ok(Math.abs(f.unit - 1) < 1e-9, `${f.url}: ${f.unit}`);
    }
    assert.equal(Math.round(anim.maxArtH), HEIGHTS[key], key);
    assert.ok(Math.abs(DEF.animations[key].heightRatio - HEIGHTS[key] / 49) < 1e-12, key);
  }
});

test('drawn at #0001\'s size per art pixel: about 83 units tall, its pixels the same size on screen', () => {
  assert.ok(Math.abs(REAL.worldPerArt - REAL_0001_IDLE.worldPerArt) < 1e-12);
  assert.ok(Math.abs(DEF.visual.height - 49 * 88 / 52) < 1e-9);
  for (const map of [getMap('desert'), getMap('city')]) {
    for (const [w, h] of [[1280, 720], [1920, 1080], [1688, 780], [800, 600]]) {
      assert.ok(Math.abs(computeWorldScale(w, h, REAL_0001_IDLE, map) - computeWorldScale(w, h, REAL, map)) < 1e-9, `${map.id} ${w}x${h}`);
    }
  }
  const arena = { view: { scale: 2 }, worldPerArt: REAL_0001_IDLE.worldPerArt };
  assert.ok(Math.abs(Arena.prototype.pxPerArtOf.call(arena, REAL) - Arena.prototype.pxPerArtOf.call(arena, REAL_0001_IDLE)) < 1e-12);
});

test('anchored on the sheet\'s origin: the idle stands still, the feet stay under it, nothing is pulled towards a trail', () => {
  const idle = REAL.animations.idle.frames;
  // Where the feet are: the drawn span of the bottom four rows.
  const feet = (f) => {
    const spans = range(4).map((n) => rowSpan(f, f.h - n)).filter(Boolean);
    return [Math.min(...spans.map((sp) => sp[0])), Math.max(...spans.map((sp) => sp[1]))];
  };
  // The feet, from the anchor, never move through the breath.
  const planted = (f) => feet(f).map((x) => x - f.anchorArtX);
  assert.deepEqual(idle.map(planted), idle.map(() => planted(idle[0])));
  // Standing, crouching or square-on, the anchor lies between the feet.
  const standing = [
    ...idle, ...REAL.animations.land.frames, ...REAL.animations.hurt.frames,
    ...REAL.animations.chargeStart.frames, ...REAL.animations.chargeLoop.frames,
  ];
  for (const f of standing) {
    const [lo, hi] = feet(f);
    assert.ok(lo < f.anchorArtX && f.anchorArtX < hi, `${f.url}: ${lo} < ${f.anchorArtX} < ${hi}`);
  }
  // Every anchor is inside its frame, and every one is authored: none left
  // to the torso centroid, which the punch's arm, the Dash's flame and the
  // kicks' swooshes would drag forward or back.
  for (const anim of Object.values(REAL.animations)) {
    for (const f of anim.frames) {
      assert.equal(f.anchorArtX, f.authoredAnchor, f.url);
      assert.ok(f.anchorArtX > 0 && f.anchorArtX < f.artW, f.url);
    }
  }
  const punch = REAL.animations.ba1.frames[1];
  assert.ok(punch.anchorX / punch.unit - punch.anchorArtX > 10, 'the torso anchor would slide the punch back by over 10 art pixels');
  // The square-on Charge stance stands centred on it, as in the sheet.
  for (const f of REAL.animations.chargeLoop.frames) {
    const [lo, hi] = feet(f);
    assert.ok(Math.abs((lo + hi + 1) / 2 - f.anchorArtX) <= 1.5, f.url);
  }
});

test('its body matches its art: the hurtboxes cover the drawn idle, the collider its height', () => {
  const k = REAL.worldPerArt;
  const idle = REAL.animations.idle.frames;
  const inBox = (f, box, x, y) => {
    const wx = (x + 0.5 - f.anchorArtX) * k;
    const wy = (y + 0.5 - f.h) * k;
    return wx >= box.x && wx <= box.x + box.w && wy >= box.y && wy <= box.y + box.h;
  };
  for (const f of idle) {
    let drawn = 0;
    let covered = 0;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (!opaque(f, x, y)) continue;
        drawn++;
        if (DEF.hurtboxes.some((hb) => inBox(f, hb, x, y))) covered++;
      }
    }
    assert.ok(covered / drawn >= 0.85, `${f.url}: ${(covered / drawn).toFixed(3)} of the art is hittable`);
  }
  // Head and torso over the legs, meeting, down to the feet, inside the art.
  const [upper, lower] = DEF.hurtboxes;
  assert.equal(upper.y + upper.h, lower.y);
  assert.equal(lower.y + lower.h, 0);
  const [left, right] = [-idle[0].anchorArtX * k, (idle[0].w - idle[0].anchorArtX) * k];
  for (const hb of DEF.hurtboxes) assert.ok(hb.x >= left && hb.x + hb.w <= right, JSON.stringify(hb));
  // The collider reaches the top of the head (the hair spikes over it left
  // out) and is narrower than the stance; the pushbox a little wider.
  assert.equal(DEF.collider.height, -upper.y);
  assert.ok(DEF.collider.height < idle[0].h * k && DEF.collider.height > 0.85 * idle[0].h * k);
  assert.ok(DEF.collider.width < lower.w && DEF.pushbox.width > DEF.collider.width);
});

test('the roster portrait is the face under the hair, clear of the roster card\'s name bar', () => {
  const cfg = DEF.visual.portrait;
  const f = REAL.animations[cfg.animation].frames[cfg.frame];
  const size = Math.round(f.artH * cfg.size);
  const top = f.artH * cfg.centerY - size / 2;
  // The head is the top 20 rows, the hair's tips to the chin. The crop
  // starts in the hair, and its top 70% (what a roster card shows above its
  // name bar) reaches the chin.
  assert.ok(top >= 0 && top <= 4, `from the hair (${top})`);
  assert.ok(top + 0.7 * size >= 19, 'down to the chin');
  // Across, nearly all of the head: only a few hair tips stick out.
  const left = f.headArtX - size / 2;
  let drawn = 0;
  let inside = 0;
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < f.w; x++) {
      if (!opaque(f, x, y)) continue;
      drawn++;
      if (x >= left && x < left + size) inside++;
    }
  }
  assert.ok(inside / drawn >= 0.85, `${(inside / drawn).toFixed(3)} of the head`);
});

// ---- Its moves: what it has, and what it does not ---------------------------------------

test('its moves: Palm Strike, BA1 / mid-air BA1, BA2 / mid-air BA2; no Transform, Shield or charged action', () => {
  assert.deepEqual(DEF.actions, {
    uniqueba: 'uniqueba',
    ba1: { ground: 'ba1', air: 'maba1' },
    ba2: { ground: 'ba2', air: 'maba2' },
  });
  assert.equal(Object.hasOwn(DEF.actions, 'transform'), false, 'Transform left out: no button, no move');
  assert.deepEqual(Object.keys(DEF.attacks).sort(), ['ba1', 'ba2', 'maba1', 'maba2', 'uniqueba']);
  for (const key of ['defense', 'chargedActions', 'chargedTechniques', 'summons', 'projectiles', 'projectileAnimations', 'effectAnimations']) {
    assert.equal(DEF[key], undefined, key);
  }
  assert.equal(DEF.animations.shield, undefined);
  assert.equal(DEF.animations.transform, undefined);
  // Its own names, the mid-air moves keeping their neutral ones.
  assert.equal(abilityName(DEF, 'uniqueba'), 'Palm Strike');
  assert.equal(abilityName(DEF, 'ba1'), 'Punch');
  assert.equal(abilityName(DEF, 'maba1'), MOVES.maba1.label);
  // Its own values, not borrowed: nothing of #0001's is shared.
  assert.notEqual(DEF.movement, DEF_0001.movement);
  assert.notEqual(DEF.movement, TEMPORARY_BASELINE.movement);
  assert.notDeepEqual(DEF.collider, DEF_0001.collider);
  assert.doesNotMatch(JSON.stringify(DEF), /0001|0002|rasen|shuriken|clone/i);
});

test('each attack is timed to whole frames of its own clip, and plays exactly one pass of it', () => {
  for (const [id, atk] of Object.entries(DEF.attacks)) {
    const clip = DEF.animations[atk.animation];
    assert.equal(atk.animation, id, `${id}: its own clip`);
    const frames = [atk.startup, atk.active, atk.recovery].map((t) => t * clip.fps);
    for (const n of frames) assert.ok(Math.abs(n - Math.round(n)) < 1e-9, `${id}: whole frames`);
    assert.equal(Math.round(frames[0] + frames[1] + frames[2]), clip.frames.length, `${id}: the whole clip`);
    assert.ok(frames[1] >= 1, `${id}: live for at least a frame`);
    assert.equal(clip.loop, false);
  }
});

test('each hitbox lies on its strike: over the art drawn on its active frames, reaching no further', () => {
  const k = REAL.worldPerArt;
  for (const [id, atk] of Object.entries(DEF.attacks)) {
    const anim = REAL.animations[atk.animation];
    const fps = DEF.animations[atk.animation].fps;
    const first = Math.round(atk.startup * fps);
    const live = anim.frames.slice(first, first + Math.round(atk.active * fps));
    const hb = atk.hitbox;
    let reach = -Infinity;
    for (const f of live) {
      let inside = 0;
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) {
          if (!opaque(f, x, y)) continue;
          const wx = (x + 0.5 - f.anchorArtX) * k;
          const wy = (y + 0.5 - f.h) * k;
          reach = Math.max(reach, wx);
          if (wx >= hb.x && wx <= hb.x + hb.w && wy >= hb.y && wy <= hb.y + hb.h) inside++;
        }
      }
      assert.ok(inside >= 60, `${id}: ${f.url} draws its strike in the hitbox (${inside} art pixels)`);
    }
    assert.ok(hb.x > 0, `${id}: in front`);
    assert.ok(hb.x + hb.w <= reach + k, `${id}: reaches ${hb.x + hb.w}, the art ${reach.toFixed(1)}`);
  }
});

// ---- Animation at runtime --------------------------------------------------------------

// The order frames were shown in over `n` steps, consecutive repeats dropped.
function shown(step, n, held) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const name = frameName(step(held));
    if (name !== out.at(-1)) out.push(name);
  }
  return out;
}

test('idle cycles through its four frames in order, looping', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step();
  assert.equal(fighter.state, 'idle');
  assert.equal(frameName(fighter), '0003_idle1.png');
  const seen = shown(step, Math.round(2 / DT));
  assert.deepEqual(seen.slice(0, 8), [...CLIPS.idle, ...CLIPS.idle]);
});

test('run cycles through its four frames in order', () => {
  const { step } = makeFighter({ character: DEF, sprites: SPRITES });
  stepUntil(step, (f) => f.state === 'run', { runRight: true });
  const seen = shown(step, 90, { runRight: true });
  const start = CLIPS.run.indexOf(seen[0]);
  assert.deepEqual(seen.slice(0, 8), range(8).map((n) => CLIPS.run[(start + n - 1) % 4]));
});

test('jump art while rising, the fall frames while descending, the two land frames on touchdown, then idle', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step();
  step(P('jump'));
  assert.equal(fighter.state, 'jump');
  for (;;) {
    assert.equal(frameName(fighter), '0003_jump.png', 'rising');
    step({ jump: true });
    if (fighter.body.vy >= 0) break;
  }
  const falling = [];
  while (!fighter.grounded) {
    assert.equal(fighter.state, 'fall');
    falling.push(frameName(fighter));
    step();
  }
  assert.deepEqual(sequence(falling.map((frame) => ({ frame }))), CLIPS.fall, 'the tuck, then the legs reach down');
  const landing = [];
  while (fighter.state === 'land') {
    landing.push(frameName(fighter));
    step();
  }
  assert.deepEqual(sequence(landing.map((frame) => ({ frame }))), CLIPS.land);
  assert.equal(landing.length, steps(2 / 12), 'one pass of the land clip');
  assert.equal(fighter.state, 'idle');
  // The air jump plays the jump frame again.
  step(P('jump'));
  stepUntil(step, (f) => f.body.vy > 0);
  step(P('jump'));
  assert.equal(fighter.airJumped, true);
  assert.equal(frameName(fighter), '0003_jump.png');
});

test('hit on the ground it shows its hurt art; hit in the air, its mid-air hurt art', () => {
  const ground = duel({ targetCharacter: DEF, targetSprites: SPRITES, gap: 40 });
  ground.tick(P('ba1'));
  ground.until(() => ground.events.length > 0);
  ground.tick();
  assert.equal(ground.target.state, 'hitstun');
  assert.equal(ground.target.grounded, true);
  assert.equal(frameName(ground.target), '0003_hurt.png');
  const air = duel({ targetCharacter: DEF, targetSprites: SPRITES, gap: 30 });
  air.tick(P('jump'), P('jump'));
  for (let i = 0; i < 6; i++) air.tick({ jump: true }, { jump: true });
  air.tick({ jump: true, ...P('ba1') }, { jump: true });
  air.until(() => air.events.length > 0);
  air.tick();
  assert.equal(air.target.state, 'hitstun');
  assert.equal(air.target.grounded, false);
  assert.equal(frameName(air.target), '0003_midairhurt.png');
});

test('Charge: the crouch and turn once, the power-up looped while held, the release pose, then idle', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  const held = [];
  for (let i = 0; i < steps(1); i++) held.push(frameName(step({ charge: true })));
  assert.equal(fighter.state, 'charge');
  const seen = sequence(held.map((frame) => ({ frame })));
  assert.deepEqual(seen.slice(0, 4), CLIPS.chargeStart);
  assert.deepEqual(seen.slice(4, 8), [...CLIPS.chargeLoop, ...CLIPS.chargeLoop]);
  step();
  assert.equal(fighter.state, 'chargeRelease');
  assert.equal(frameName(fighter), '0003_charge4.png');
  stepUntil(step, (f) => f.state === 'idle', {}, steps(0.2));
  // A combat button pressed in the stance does its normal attack: nothing
  // to charge.
  for (let i = 0; i < 10; i++) step({ charge: true });
  step({ charge: true, ...P('ba1') });
  assert.equal(fighter.combat.attack?.def.id, 'ba1');
  assert.equal(fighter.combat.chargedCooldowns.size, 0);
  assert.deepEqual(cbaIndicators(fighter), [], 'no CBA ring');
});

test('the Dash (a double tap): its two frames, 0.2 s at its dash speed, 15 Energy', () => {
  const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
  step(P('runRight'));
  step();
  step(P('runRight'));
  assert.ok(fighter.dash, 'dashing');
  assert.equal(fighter.combat.energy, 100 - 15);
  const log = [frameName(fighter)];
  let n = 1;
  while (fighter.dash) {
    assert.equal(fighter.body.vx, DEF.movement.dashSpeed);
    log.push(frameName(step()));
    n++;
  }
  assert.equal(n - 1, steps(0.2));
  assert.deepEqual(sequence(log.slice(0, -1).map((frame) => ({ frame }))), CLIPS.dash);
});

test('Shield and Transform do nothing for it, without a warning', () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
    step(P('shield'));
    for (let i = 0; i < 10; i++) step({ shield: true });
    assert.equal(fighter.combat.shielding, false);
    assert.equal(fighter.shieldAllowed(), false);
    assert.equal(fighter.attackFor('transform'), null);
    step(P('transform'));
    assert.equal(fighter.combat.attack, null);
    assert.equal(fighter.state, 'idle');
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = warn;
  }
});

test('its art faces right: mirrored when it faces left, never otherwise', () => {
  for (const facing of [1, -1]) {
    const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES, facing });
    step();
    assert.equal(fighter.spriteFlip, facing === -1, `idle facing ${facing}`);
    step(P('ba1'));
    assert.equal(fighter.spriteFlip, facing === -1, `ba1 facing ${facing}`);
  }
});

test('no state it can be in resolves to anyone else\'s art', () => {
  const keys = new Set([
    ...Object.keys(DEF.animations), ...Object.keys(DEF_0001.animations),
    'shield', 'midairShield', 'transform', 'cba1', 'cba2',
  ]);
  for (const key of keys) {
    const { anim } = SPRITES.resolve(key);
    for (const f of anim.frames) assert.ok(f.url.startsWith(BASE), `${key}: ${f.url}`);
  }
});

// ---- Its attacks, played and landed ----------------------------------------------------------

// Jumps, then presses `button` a few steps into the rise: the mid-air attack.
function airAttack(d, button) {
  d.tick(P('jump'), P('jump'));
  for (let i = 0; i < 4; i++) d.tick({ jump: true }, { jump: true });
  d.tick({ jump: true, ...P(button) }, { jump: true });
}

// Runs the attacker's attack to its end. The first hit, if any, with the
// attacker's frame and the target's velocity and footing on that step.
function strike(d) {
  let at = { hit: null };
  while (d.attacker.combat.attack) {
    const before = d.events.length;
    d.tick();
    if (!at.hit && d.events.length > before) {
      const { vx, vy } = d.target.body;
      at = { hit: d.events.at(-1), frame: frameName(d.attacker), vx, vy, grounded: d.target.grounded };
    }
  }
  return at;
}

test('on the ground each attack plays its whole clip once, in order, then returns to idle', () => {
  for (const [button, id] of [['ba1', 'ba1'], ['ba2', 'ba2'], ['uniqueba', 'uniqueba']]) {
    const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
    step();
    const log = recordAttack(step, P(button));
    assert.ok(log.every((s) => s.id === id && s.anim === id), id);
    assert.deepEqual(sequence(log), CLIPS[id], id);
    assert.equal(log.length, steps(CLIPS[id].length / DEF.animations[id].fps), `${id}: one pass`);
    assert.equal(fighter.state, 'idle');
  }
});

test('in the air BA1 is the somersault kick and BA2 the dive, each its whole clip', () => {
  for (const [button, id] of [['ba1', 'maba1'], ['ba2', 'maba2']]) {
    const { fighter, step } = makeFighter({ character: DEF, sprites: SPRITES });
    step(P('jump'));
    for (let i = 0; i < 4; i++) step({ jump: true });
    const log = recordAttack(step, { jump: true, ...P(button) });
    assert.equal(log[0].grounded, false);
    assert.ok(log.every((s) => s.id === id), id);
    assert.deepEqual(sequence(log), CLIPS[id], id);
    assert.equal(fighter.combat.attack, null);
  }
});

test('BA1 punches a target in front sideways, on the locked-out arm', () => {
  const d = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, gap: 60 });
  d.tick(P('ba1'));
  const { hit, frame, vx, vy } = strike(d);
  assert.ok(hit, 'it hits');
  assert.equal(hit.damage, 3);
  assert.ok(['0003_1ba2.png', '0003_1ba3.png'].includes(frame), frame);
  assert.equal(d.target.combat.launchPoint, 3);
  assert.ok(vx > 0 && vy === 0, 'pushed away along the floor');
});

test('BA2 launches a target in front upward, on the kick', () => {
  const d = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, gap: 50 });
  d.tick(P('ba2'));
  const { hit, frame, vx, vy, grounded } = strike(d);
  assert.ok(hit, 'it hits');
  assert.equal(hit.damage, 5);
  assert.ok(['0003_2ba4.png', '0003_2ba5.png'].includes(frame), frame);
  assert.ok(vy < 0 && Math.abs(vx) < 1e-9, 'launched straight up');
  assert.equal(grounded, false);
});

test('the Palm Strike launches a target in front sideways, after its wind-up', () => {
  const d = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, gap: 50 });
  d.tick(P('uniqueba'));
  const { hit, frame, vx, vy } = strike(d);
  assert.ok(hit, 'it hits');
  assert.equal(hit.damage, 6);
  assert.ok(['0003_palm4.png', '0003_palm5.png'].includes(frame), frame);
  assert.ok(vx > 0 && vy === 0, 'sent sideways');
});

test('mid-air BA1 launches an airborne target upward; mid-air BA2 drives it downward', () => {
  const up = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, gap: 40 });
  airAttack(up, 'ba1');
  assert.equal(up.attacker.combat.attack.def.id, 'maba1');
  const kick = strike(up);
  assert.ok(kick.hit, 'the somersault kick hits');
  assert.equal(kick.hit.damage, 3);
  assert.ok(['0003_midair1ba2.png', '0003_midair1ba3.png'].includes(kick.frame), kick.frame);
  assert.equal(kick.grounded, false);
  assert.ok(kick.vy < 0, 'launched upward');
  const down = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, gap: 40 });
  airAttack(down, 'ba2');
  assert.equal(down.attacker.combat.attack.def.id, 'maba2');
  const dive = strike(down);
  assert.ok(dive.hit, 'the dive hits');
  assert.equal(dive.hit.damage, 5);
  assert.ok(['0003_midair2ba3.png', '0003_midair2ba4.png'].includes(dive.frame), dive.frame);
  assert.ok(dive.vy > 0, 'driven downward');
});

test('its attacks miss a target out of reach or behind it', () => {
  for (const button of ['ba1', 'ba2', 'uniqueba']) {
    for (const gap of [140, -50]) {
      const d = duel({ attackerCharacter: DEF, attackerSprites: SPRITES, gap, targetFacing: -1 });
      d.tick(P(button));
      assert.equal(strike(d).hit, null, `${button} at ${gap}`);
    }
  }
});

// ---- The CPU and whole fights ----------------------------------------------------------------

test('the CPU reads its moveset from its data: five melee attacks and the Dash; no ranged, charged move or Shield', () => {
  const { fighter } = makeFighter({ character: DEF, sprites: SPRITES });
  const ms = readMoveset(fighter);
  assert.deepEqual(ms.melee.map((m) => [m.action, m.id, m.air]), [
    ['uniqueba', 'uniqueba', false],
    ['ba1', 'ba1', false], ['ba1', 'maba1', true],
    ['ba2', 'ba2', false], ['ba2', 'maba2', true],
  ]);
  assert.deepEqual([ms.ranged, ms.charged], [[], []]);
  assert.equal(ms.shield, false);
  assert.deepEqual(ms.dash, { distance: DEF.movement.dashSpeed * 0.2, cost: 15 });
});

test('#0003 against #0001, #0002 and itself: CPU fights run, it lands its own attacks and shows its hurt art', () => {
  for (const [defA, defB] of [[DEF_0001, DEF], [DEF, DEF_0001], [DEF_0002, DEF], [DEF, DEF]]) {
    const { a, b, log, events } = cpuFight(defA, defB);
    const label = `${defA.id} vs ${defB.id}`;
    for (const f of [a, b]) {
      assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), `${label}: ${f.def.id} stays in the world`);
      if (f.def !== DEF) continue;
      const stepsOf = log.get(f);
      assert.ok(stepsOf.every((s) => s.frame.startsWith('0003_')), `${label}: only its own art`);
      assert.ok(stepsOf.every((s) => s.attack === null || Object.hasOwn(DEF.attacks, s.attack)), `${label}: only its own attacks`);
      assert.ok(stepsOf.every((s) => !s.shielding), `${label}: never shields`);
      assert.ok(events.some((e) => e.type === 'hit' && e.attacker === f), `${label}: its hits land`);
      assert.equal(f.combat.chargedCooldowns.size, 0);
      // Its hurt art whenever it is hit (#0002 has nothing to hit it with).
      const other = f === a ? b : a;
      const stunned = stepsOf.filter((s) => s.state === 'hitstun');
      if (Object.keys(other.def.attacks).length) assert.ok(stunned.length > 0, `${label}: it is hit`);
      for (const s of stunned) assert.equal(s.frame, s.grounded ? '0003_hurt.png' : '0003_midairhurt.png');
    }
  }
});
