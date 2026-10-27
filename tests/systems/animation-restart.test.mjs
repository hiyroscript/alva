// Run with node --test tests/systems/animation-restart.test.mjs (no dependencies).
// Animations never stick on one frame: a new activation of a move restarts
// its clip from frame one, even under the same key (the stuck-frame bug:
// the same attack started on the very step its last activation ended used
// to play out on that activation's last frame, since SpriteAnimator.play
// skipped a key it already had), once per activation, never every step;
// changing moves without passing through idle, a Mash Combo's twelve rapid
// turns, a hitstop, an interruption and a respawn all show the right
// frames, on an ordinary fighter (SpriteAnimator) and an ensemble
// (EnsembleAnimator). Legitimate holds hold: a single-frame pose, the
// Shield held, an impact freeze, a non-looping clip's last frame until its
// move ends. Every attack's clip fits inside its attack, and a clip without
// a usable rate holds its first frame instead of looping on nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCharacter, playableCharacters } from '../../js/data/characters.js';
import { createAttackDefinition } from '../../js/game/combat/attacks.js';
import { clipFor } from '../../js/data/ensemble.js';
import { SpriteAnimator } from '../../js/game/rendering/sprite-animator.js';
import { MASH_COMBO, mashTriggers } from '../../js/data/mash-combo.js';
import { DT, frameName, probeHit } from '../helpers/fighter-harness.mjs';
import { playerRig, press } from '../helpers/player-rig.mjs';

const FIGHTERS = playableCharacters();
const frameNo = (f) => Number(frameName(f)?.match(/_(\d+)\.png$/)?.[1]);

// The frames (file numbers) each activation of an attack shows, in order,
// for as long as it plays: [{ rec, frames }].
function watch(r, steps, input = () => ({})) {
  const runs = [];
  for (let i = 0; i < steps; i++) {
    r.tick(input(i));
    const a = r.player.combat.attack;
    if (!a || r.player.state !== 'attack') continue;
    if (runs.at(-1)?.rec !== a) runs.push({ rec: a, frames: [] });
    runs.at(-1).frames.push(r.player.animator.frame?.url ?? null);
  }
  return runs;
}

// The clip `c`'s attack `id` plays, its first file.
const firstFile = (c, id) => {
  const spec = c.attacks[id];
  const clip = c.ensemble ? clipFor(c, spec.animation, spec.members) : c.animations[spec.animation];
  return clip.frames[0];
};

test('the bug: the same attack pressed on the very step its last activation ends restarts from frame one, for every fighter', () => {
  for (const c of FIGHTERS) {
    const r = playerRig({ character: c, gap: 900 });
    r.tick(press('attack1'));
    const first = r.player.combat.attack;
    r.until(() => r.player.combat.attack !== first);
    // A fresh press this very step (the one the activation ended on) or
    // the next: either way the new activation starts on its first frame.
    const second = r.player.combat.attack ?? (r.tick(press('attack1')), r.player.combat.attack);
    assert.ok(second && second !== first, `#${c.id}: a new activation`);
    assert.equal(r.player.animator.frame?.url ?? r.player.animator.lead?.animator.frame.url, firstFile(c, 'attack1'), `#${c.id}: frame one`);
  }
  // Exactly on the end step, through the whole activation: it advances.
  for (const c of FIGHTERS) {
    const r = playerRig({ character: c, gap: 900 });
    r.tick(press('attack1'));
    const first = r.player.combat.attack;
    const total = Math.round(first.def.total / DT);
    for (let i = 1; i < total; i++) r.tick();
    r.tick(press('attack1'));
    const second = r.player.combat.attack;
    assert.ok(second && second !== first, `#${c.id}: started on the step the first ended`);
    const seen = new Set();
    while (r.player.combat.attack === second) {
      seen.add(r.player.animator.frame?.url);
      r.tick();
    }
    const clip = c.ensemble ? clipFor(c, c.attacks.attack1.animation, c.attacks.attack1.members) : c.animations.attack1;
    assert.ok(seen.has(clip.frames[0]), `#${c.id}: its first frame shown`);
    assert.ok(seen.size >= Math.min(2, new Set(clip.frames).size), `#${c.id}: it advanced (${seen.size} frames)`);
  }
});

test('a restart happens once, as the activation begins, never on every step', () => {
  for (const c of FIGHTERS) {
    const r = playerRig({ character: c, gap: 900 });
    r.tick(press('attack1'));
    const anim = r.player.animator;
    const indices = [];
    const lead = () => (anim.members ? anim.lead.animator : anim);
    const rec = r.player.combat.attack;
    while (r.player.combat.attack === rec) {
      indices.push(lead().index);
      r.tick();
    }
    assert.ok(indices.every((n, i) => i === 0 || n >= indices[i - 1]), `#${c.id}: never back to frame one mid-activation (${indices})`);
  }
});

test('changing moves without idle in between (a hit-confirmed cancel into another attack) starts the new clip from its first frame', () => {
  for (const c of FIGHTERS) {
    const r = playerRig({ character: c, gap: 40 });
    r.tick(press('attack1'));
    const first = r.player.combat.attack;
    let next = null;
    for (let i = 0; i < 60 && !next; i++) {
      r.tick(i % 2 ? press('attack2') : {});
      if (r.player.combat.attack && r.player.combat.attack !== first) next = r.player.combat.attack;
    }
    if (!next) continue;
    const anim = r.player.animator;
    const idx = anim.members ? anim.lead.animator.index : anim.index;
    assert.ok(idx <= 1, `#${c.id}: ${next.def.id} from its start (${idx})`);
  }
});

test('a Mash Combo\'s twelve rapid turns each start their clip from frame one and run through it at the turn\'s pace, on every fighter (the ensemble\'s sisters too)', () => {
  for (const c of FIGHTERS) {
    const [button] = mashTriggers(c).keys();
    const r = playerRig({ character: c, gap: 40 });
    for (let i = 0; i < MASH_COMBO.presses; i++) {
      r.tick(press(button));
      r.tick();
    }
    const runs = [];
    for (let i = 0; i < 600 && (r.player.mash.engaged || !runs.length); i++) {
      r.tick();
      const a = r.player.combat.attack;
      if (!a?.mash || r.player.state !== 'attack') continue;
      const anim = r.player.animator;
      const lead = anim.members ? anim.lead.animator : anim;
      if (runs.at(-1)?.rec !== a) runs.push({ rec: a, index: [], speed: lead.speed });
      runs.at(-1).index.push(lead.index);
    }
    assert.equal(runs.length, MASH_COMBO.turns, `#${c.id}`);
    for (const run of runs) {
      assert.ok(run.index[0] <= 1, `#${c.id} turn ${run.rec.mash.turn}: from its start (${run.index})`);
      assert.ok(run.index.every((n, i) => i === 0 || n >= run.index[i - 1]), `#${c.id}: forward only`);
      assert.equal(run.speed, MASH_COMBO.rate, `#${c.id}: at the turn's pace`);
    }
    // Back to normal speed after it.
    for (let i = 0; i < 30; i++) r.tick();
    const anim = r.player.animator;
    const lead = anim.members ? anim.lead.animator : anim;
    assert.equal(lead.speed, 1, `#${c.id}: normal playback after`);
  }
});

test('#0006: the sister at the front changes with each turn, each restarting her own clip; the others stay aside', () => {
  const c = getCharacter('0006');
  const r = playerRig({ character: c, gap: 40 });
  for (let i = 0; i < MASH_COMBO.presses; i++) {
    r.tick(press('attack1'));
    r.tick();
  }
  let last = null;
  let checked = 0;
  for (let i = 0; i < 600 && (r.player.mash.engaged || !checked); i++) {
    r.tick();
    const a = r.player.combat.attack;
    if (!a?.mash || a === last || r.player.state !== 'attack') continue;
    last = a;
    const members = r.player.animator.members;
    const performing = members.filter((m) => m.performing);
    assert.deepEqual(performing.map((m) => m.id), a.def.members, `turn ${a.mash.turn}`);
    for (const m of performing) assert.ok(m.animator.index <= 1, `${m.id}: from her clip's start`);
    for (const m of members.filter((x) => !x.performing)) assert.equal(m.animator.stateKey, 'idle', `${m.id}: aside`);
    checked++;
  }
  assert.equal(checked, MASH_COMBO.turns);
});

test('an impact freeze holds the frame; interrupted, the hurt clip shows; respawned, idle', () => {
  for (const c of FIGHTERS) {
    const r = playerRig({ character: c, gap: 40 });
    r.tick(press('attack1'));
    r.until(() => r.player.combat.hitstop > 0 || !r.player.combat.attack);
    if (r.player.combat.hitstop > 0) {
      const at = r.player.animator.frame;
      r.tick();
      if (r.player.combat.hitstop > 0) assert.equal(r.player.animator.frame, at, `#${c.id}: held through the freeze`);
    }
    r.system.applyHit(r.foe, r.player, probeHit({ id: 'probe', damage: 1, hitstun: 0.3 }));
    r.tick();
    assert.equal(r.player.state, 'hitstun');
    assert.match(r.player.animator.anim?.key ?? '', /hurt/, `#${c.id}: hurt`);
    r.player.respawn(r.player.stage);
    assert.equal(r.player.animator.stateKey ?? r.player.animator.lead.animator.stateKey, 'idle', `#${c.id}: idle`);
  }
});

test('legitimate holds still hold: the Shield held, a single-frame pose, a non-looping clip\'s last frame until its move ends', () => {
  for (const c of FIGHTERS) {
    const r = playerRig({ character: c, gap: 900 });
    for (let i = 0; i < 30; i++) r.tick({ shield: true });
    if (r.player.combat.shielding) {
      const held = r.player.animator.frame;
      for (let i = 0; i < 30; i++) {
        r.tick({ shield: true });
        assert.equal(r.player.animator.frame, held, `#${c.id}: the Shield's held pose`);
      }
    }
  }
  // A clip shorter than its attack holds its last frame to the end.
  const two = getCharacter('0002');
  const r = playerRig({ character: two, gap: 900 });
  r.tick(press('attack1'));
  const rec = r.player.combat.attack;
  const files = [];
  while (r.player.combat.attack === rec) {
    files.push(frameName(r.player));
    r.tick();
  }
  const last = two.animations.attack1.frames.at(-1).split('/').pop();
  assert.equal(files.at(-1), last);
  assert.ok(files.filter((f) => f === last).length > 1, 'its last frame held to the move\'s end, on purpose');
  // play() with no activation and the same key never restarts.
  const anim = new SpriteAnimator({ usable: true, resolve: () => ({ anim: { key: 'k', fps: 10, loop: false, frames: [{}, {}, {}] }, hold: null }) });
  anim.play('k');
  anim.update(0.25);
  const at = anim.index;
  anim.play('k');
  assert.equal(anim.index, at);
  anim.play('k', { activation: null });
  assert.equal(anim.index, at, 'no activation: no restart');
  const rec1 = {};
  anim.play('k', { activation: rec1 });
  assert.equal(anim.index, 0, 'a new activation: from the start');
  anim.update(0.25);
  anim.play('k', { activation: rec1 });
  assert.notEqual(anim.index, 0, 'the same activation: no restart');
});

test('every attack\'s clip fits inside its attack (it never cuts the clip short), and a clip with no usable rate holds its first frame', () => {
  for (const c of FIGHTERS) {
    for (const [id, spec] of Object.entries(c.attacks)) {
      const clip = c.ensemble ? clipFor(c, spec.animation, spec.members) : c.animations[spec.animation];
      assert.ok(clip?.frames.length, `#${c.id} ${id}: its clip`);
      assert.ok(clip.fps > 0, `#${c.id} ${id}: a usable rate`);
      const pass = clip.frames.length / clip.fps;
      const atk = createAttackDefinition({ id, ...spec }, { clipDuration: pass, projectiles: c.projectiles });
      assert.ok(pass <= atk.total + 1e-6, `#${c.id} ${id}: its clip (${pass}) fits its attack (${atk.total})`);
    }
  }
  const warn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(msg);
  try {
    const anim = new SpriteAnimator({ usable: true, resolve: () => ({ anim: { key: 'broken', fps: 0, loop: true, frames: [{}, {}] }, hold: null }) });
    anim.play('broken');
    for (let i = 0; i < 10; i++) anim.update(DT);
    assert.equal(anim.index, 0);
    assert.equal(warnings.length, 1, 'reported once');
  } finally {
    console.warn = warn;
  }
});
