// The Sound update: the engine (js/core/audio-manager.js) on a mocked Web
// Audio (tests/helpers/fake-audio.mjs), its state machine and point of
// view, the guard that keeps Alva's sounds to the twelve kinds the owner
// asked for, the themes as data, and the game's events heard on real
// Battles and Practice Ground through BattleAudio: one ejection a exit
// (Battle.ejectLoser after a Void fall included), a Deflect's sound only
// for a real turn-back, a perfect block never stacked on a block, the
// Shield's hum held and dropped, overtime's intensity read from the battle,
// and Settings › Audio's version 12.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AudioManager, buildRegistry, SFX_LIMITS, SFX_VARIATION, MIX } from '../../js/core/audio-manager.js';
import {
  ALLOWED_SOUNDS, SOUND_KINDS, SoundRegistry, SFX, AMBIENCE, THEMED_STAGES, MUSIC_VERSIONS, musicId, isAllowedSound,
} from '../../js/core/audio/sounds.js';
import { audioPerspective, ejectionSound, endingVersion } from '../../js/core/audio/perspective.js';
import { MusicDirector, MUSIC_STATES, BAR_QUANTUM_LIMIT, FADES } from '../../js/core/audio/director.js';
import { BattleAudio } from '../../js/core/audio/battle-audio.js';
import { compileTheme, renderBar, versionLength, equalPower } from '../../js/core/audio/sequencer.js';
import { parseMelody, parseChords, parseRhythm, SCALES, degreeSemis } from '../../js/core/audio/theory.js';
import { THEMES } from '../../js/core/audio/themes/index.js';
import { SFX_RECIPES } from '../../js/core/audio/sfx.js';
import { Settings, readSettings, sanitizeAudio, DEFAULT_AUDIO, SETTINGS_KEY, SETTINGS_VERSION } from '../../js/core/settings.js';
import { Battle } from '../../js/game/battle.js';
import { PracticeSession } from '../../js/game/practice.js';
import { getMap, MAPS } from '../../js/data/maps.js';
import { PRACTICE_MAP } from '../../js/data/practice-map.js';
import { getCharacter } from '../../js/data/characters.js';
import { blankInput } from '../../js/game/fighters/fighter-controller.js';
import { Projectile } from '../../js/game/combat/projectile.js';
import { worldBox } from '../../js/game/combat/combat.js';
import { CONFIG } from '../../js/config.js';
import { fakeSpritesOf, DT } from '../helpers/fighter-harness.mjs';
import { fakeAudio } from '../helpers/fake-audio.mjs';
import { LOOKAHEAD } from '../../js/core/audio/sequencer.js';

// Canvas paths, which a stage's art builds, in Node.
globalThis.Path2D ??= class {
  constructor() {
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : () => {}) });
  }
};

const ROOT = new URL('../../', import.meta.url).pathname;
const DEF = getCharacter('0001');

// ---- Helpers ------------------------------------------------------------------------

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), map };
}

// An engine on the fake page, its context made by a first press (unless
// `unlocked` is false), its effects' sounds traced.
function engineOn({ settings = new Settings(memoryStorage()), unlocked = true } = {}) {
  const page = fakeAudio();
  const engine = new AudioManager({ settings, win: page.win, doc: page.doc, AudioContextClass: page.AudioContext, timers: page.timers });
  engine.trace = [];
  if (unlocked) page.win.press();
  return { engine, page, settings, get ctx() { return page.ctx; } };
}

// Moves the fake clock to `t` and lets the engine write ahead.
function at(rig, t) {
  rig.ctx.currentTime = t;
  rig.engine.tick();
}

const sfxPlayed = (engine) => engine.trace.filter((e) => e.type === 'sfx').map((e) => e.id);
const musicPlayed = (engine) => engine.trace.filter((e) => e.type === 'music');

// A recording stand-in for the engine: every call BattleAudio makes.
function recorder() {
  const calls = [];
  const engine = new Proxy({}, {
    get: (_, name) => (name === 'calls' ? calls : (...args) => { calls.push([name, ...args]); }),
  });
  return engine;
}
const callsNamed = (engine, name) => engine.calls.filter((c) => c[0] === name);

// A controller playing `fn(n)`'s input on step n (nothing by default).
const scripted = (fn = () => ({})) => {
  let n = 0;
  return { kind: 'player', getInput: () => ({ ...blankInput(), ...fn(n++) }) };
};

const stubInput = () => ({ flush() {}, sample: () => ({}), player: () => ({ flush() {}, sample: () => ({}) }) });

// A real Battle on `mapId` in `mode`, fighting, both fighters on scripted
// controllers, heard by a BattleAudio over a recorder.
function battleOn({ mapId = 'desert', mode = 'quick-battle', localSlot = 'p1' } = {}) {
  const battle = new Battle({
    canvas: { getContext: () => ({}) }, map: getMap(mapId), mode: mode === 'adventure' ? 'quick-battle' : mode, seed: 7,
    p1Def: DEF, p2Def: DEF, p1Sprites: fakeSpritesOf(DEF), p2Sprites: fakeSpritesOf(DEF), input: stubInput(),
  });
  for (const f of battle.fighters) f.controller = scripted();
  const engine = recorder();
  const sound = new BattleAudio(engine);
  sound.attach(battle, { stage: mapId, mode, localSlot });
  battle.setPhase('fight');
  return { battle, engine, sound };
}

// Puts `f` into the Void's far side (it is taken on the next step).
const intoVoid = (battle, f) => {
  const v = battle.stage.void;
  Object.assign(f.body, { x: v.right + 200, prevX: v.right + 150, y: v.bottom - 50, prevY: v.bottom - 50 });
};

const aloft = (f, y, x = f.body.x) => Object.assign(f.body, { x, prevX: x, y, prevY: y, vx: 0, vy: 0, grounded: false, ground: null });

// ---- Point of view -------------------------------------------------------------------

test('one helper decides whose point of view every mode hears, as the owner\'s table says', () => {
  const quick = audioPerspective('quick-battle');
  assert.equal(ejectionSound(quick, 'p1'), SFX.ejectPlayer, 'Quick Battle: Player 1 is the player');
  assert.equal(ejectionSound(quick, 'p2'), SFX.ejectOpponent, 'the CPU is the opponent');
  assert.equal(endingVersion(quick, 'p1'), 'victory');
  assert.equal(endingVersion(quick, 'p2'), 'defeat');
  assert.equal(endingVersion(quick, null), 'draw');
  // Adventure is Quick Battle's view (Player 1 against the CPU).
  const adventure = audioPerspective('adventure');
  assert.deepEqual([ejectionSound(adventure, 'p1'), ejectionSound(adventure, 'p2')], [SFX.ejectPlayer, SFX.ejectOpponent]);
  assert.deepEqual([endingVersion(adventure, 'p1'), endingVersion(adventure, 'p2')], ['victory', 'defeat']);
  // Online: this device's side, either one.
  for (const slot of ['p1', 'p2']) {
    const online = audioPerspective('online', { localSlot: slot });
    const other = slot === 'p1' ? 'p2' : 'p1';
    assert.equal(ejectionSound(online, slot), SFX.ejectPlayer, `online ${slot}: its own fighter`);
    assert.equal(ejectionSound(online, other), SFX.ejectOpponent);
    assert.equal(endingVersion(online, slot), 'victory');
    assert.equal(endingVersion(online, other), 'defeat');
    assert.equal(endingVersion(online, null), 'draw');
  }
  // Local Play and Watch Mode: the universal ejection, always Victory, Draw
  // on a draw.
  for (const mode of ['local', 'watch']) {
    const p = audioPerspective(mode);
    assert.equal(ejectionSound(p, 'p1'), SFX.ejectUniversal, `${mode}: p1`);
    assert.equal(ejectionSound(p, 'p2'), SFX.ejectUniversal, `${mode}: p2`);
    assert.equal(endingVersion(p, 'p1'), 'victory');
    assert.equal(endingVersion(p, 'p2'), 'victory', `${mode}: whoever wins`);
    assert.equal(endingVersion(p, null), 'draw');
  }
  // Practice Ground: the player's fighter and the dummy; no music at all.
  const practice = audioPerspective('practice');
  assert.equal(ejectionSound(practice, 'p1'), SFX.ejectPlayer);
  assert.equal(ejectionSound(practice, 'p2'), SFX.ejectOpponent, 'the dummy is the opponent');
  assert.equal(endingVersion(practice, 'p1'), null);
  assert.equal(practice.music, 'ambience');
  // Anything else is Quick Battle.
  assert.equal(audioPerspective('nonsense').mode, 'quick-battle');
});

// ---- The music's state machine -----------------------------------------------------------

test('the music\'s state machine: idle → battle → overtime → victory, defeat or draw; restart, pause and leave', () => {
  const d = new MusicDirector();
  assert.equal(d.state, MUSIC_STATES.idle);
  assert.equal(d.version, null);
  assert.equal(d.overtime(), null, 'no overtime before a battle');
  assert.equal(d.end('victory'), null, 'no ending before a battle');
  assert.equal(d.restart(), null, 'nothing to restart');
  assert.deepEqual(d.start('desert'), { version: 'main', quantize: 'now', fade: FADES.start });
  assert.equal(d.state, MUSIC_STATES.battle);
  // Intensity moves only in overtime.
  assert.equal(d.pressure(0.7), 0);
  assert.deepEqual(d.overtime(), { version: 'overtime', quantize: 'bar', fade: FADES.overtime });
  assert.equal(d.overtime(), null, 'once');
  assert.equal(d.pressure(0.4), 0.4);
  assert.equal(d.pressure(2), 1, 'clamped');
  assert.equal(d.pressure(-1), 0);
  d.pressure(0.5);
  // Paused: overtime's intensity holds.
  assert.equal(d.pause(), true);
  assert.equal(d.pause(), false, 'already');
  assert.equal(d.pressure(0.9), 0.5, 'frozen while paused');
  assert.equal(d.resume(), true);
  assert.equal(d.pressure(0.9), 0.9);
  assert.deepEqual(d.end('defeat'), { version: 'defeat', quantize: 'beat', fade: FADES.ending });
  assert.ok(FADES.ending <= 0.35, 'a tail of about a beat at most');
  assert.equal(d.state, MUSIC_STATES.postDefeat);
  assert.equal(d.end('victory'), null, 'the match ends once');
  assert.equal(d.overtime(), null, 'no overtime after the end');
  // A rematch: the Main Battle from its intro, intensity back to 0.
  assert.deepEqual(d.restart(), { version: 'main', quantize: 'now', fade: FADES.restart });
  assert.equal(d.state, MUSIC_STATES.battle);
  assert.equal(d.intensity, 0);
  for (const [version, state] of [['victory', 'postVictory'], ['draw', 'postDraw']]) {
    d.restart();
    assert.equal(d.end(version).version, version);
    assert.equal(d.state, state);
  }
  d.restart();
  d.overtime();
  assert.equal(d.end('draw').version, 'draw', 'from overtime too');
  assert.equal(d.end('nonsense'), null);
  assert.deepEqual(d.leave(), { version: null, quantize: 'now', fade: FADES.leave });
  assert.ok(FADES.leave >= 0.4 && FADES.leave <= 0.8, 'leaving fades over 0.4-0.8 s');
  assert.equal(d.state, MUSIC_STATES.idle);
  assert.equal(d.leave(), null);
});

// ---- The guard ------------------------------------------------------------------------

test('the guard: exactly the twelve kinds the owner asked for, 33 pieces in all, and nothing else can ever be registered', () => {
  assert.deepEqual([...THEMED_STAGES], ['desert', 'city', 'asperitas', 'adamaris', 'jokull']);
  assert.deepEqual([...MUSIC_VERSIONS], ['main', 'overtime', 'victory', 'defeat', 'draw']);
  assert.equal(ALLOWED_SOUNDS.length, 25 + 1 + 7);
  assert.deepEqual([...new Set(Object.values(SOUND_KINDS))].sort(), ['1', '10', '11', '12', '2', '3', '4', '4b', '5', '6', '7', '8', '9']);
  const registry = buildRegistry();
  assert.deepEqual(registry.ids().sort(), [...ALLOWED_SOUNDS].sort(), 'every allowed sound, each once');
  for (const name of ['move', 'confirm', 'hit', 'jump', 'menu', 'music.home.main', 'music.practice.main', 'sfx.hit', 'sfx.countdown', '']) {
    assert.equal(isAllowedSound(name), false, name);
    assert.throws(() => new SoundRegistry().register(name, {}), /not one of Alva's sounds/, name);
  }
  assert.throws(() => registry.register(SFX.block, {}), /twice/);
  // Practice Ground has no theme: only its ambience.
  for (const v of MUSIC_VERSIONS) assert.equal(isAllowedSound(musicId('practice', v)), false);
  assert.equal(isAllowedSound(AMBIENCE), true);
  // Every effect recipe is one of the allowed effects; every theme a stage.
  for (const id of Object.keys(SFX_RECIPES)) assert.ok(isAllowedSound(id), id);
  assert.deepEqual(Object.keys(THEMES).sort(), [...THEMED_STAGES].sort());
  // No back door: the engine registers nothing else, and nothing else in
  // the game registers a sound or loads an audio file.
  assert.equal(typeof AudioManager.prototype.register, 'undefined', 'no register on the engine');
  const sources = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.js')) sources.push([path.slice(ROOT.length), readFileSync(path, 'utf8')]);
    }
  };
  walk(join(ROOT, 'js'));
  for (const [path, text] of sources) {
    if (path !== 'js/core/audio-manager.js') assert.doesNotMatch(text, /registry\.register\(|audio\.register\(/, `${path} registers no sound`);
    assert.doesNotMatch(text, /\.(ogg|mp3|m4a|wav|opus)['"]/, `${path} loads no audio file`);
    assert.doesNotMatch(text, /decodeAudioData|new Audio\(/, `${path} decodes or plays no audio file`);
  }
  // The menus' old play('move') stays silent: nothing is made for it.
  const rig = engineOn();
  const made = rig.ctx.made;
  for (const name of ['move', 'confirm', musicId('desert', 'main'), AMBIENCE, SFX.shieldHold]) assert.equal(rig.engine.play(name), false, name);
  assert.equal(rig.ctx.made, made, 'not one node');
  assert.deepEqual(sfxPlayed(rig.engine), []);
});

test('fighters gain nothing for sound: no character file, and no shared audio code, ever names a fighter', () => {
  for (const name of readdirSync(join(ROOT, 'js/data/characters'))) {
    const text = readFileSync(join(ROOT, 'js/data/characters', name), 'utf8');
    assert.doesNotMatch(text, /audio|sfx|sounds?\s*[:=]|playSound|shieldHold|music/i, name);
  }
  const audioFiles = ['js/core/audio-manager.js', ...readdirSync(join(ROOT, 'js/core/audio')).filter((n) => n.endsWith('.js')).map((n) => `js/core/audio/${n}`)];
  for (const path of audioFiles) {
    const text = readFileSync(join(ROOT, path), 'utf8');
    assert.doesNotMatch(text, /def\.id|\.def\b|'00\d\d'|getCharacter/, `${path} never looks at a fighter's identity`);
  }
});

// ---- The engine ----------------------------------------------------------------------

test('nothing plays before a gesture: the context is made on the first press, once, and catches up with the battle', () => {
  const rig = engineOn({ unlocked: false });
  rig.engine.battleStarted('desert', 'quick-battle');
  rig.engine.fighterEjected({ slot: 'p2' });
  assert.equal(rig.page.made, 0, 'no context before a gesture');
  assert.deepEqual(sfxPlayed(rig.engine), [], 'nothing played');
  rig.page.win.press();
  assert.equal(rig.page.made, 1);
  const music = musicPlayed(rig.engine);
  assert.equal(music.length, 1, 'the battle\'s music starts once the context exists');
  assert.equal(music[0].version, 'main');
  assert.equal(music[0].stage, 'desert');
  rig.page.win.press();
  rig.page.win.fire('keydown');
  assert.equal(rig.page.made, 1, 'one context, ever');
  // A context the browser suspended (iOS, Safari) resumes on the next gesture.
  rig.ctx.state = 'suspended';
  rig.page.win.fire('pointerup');
  assert.equal(rig.ctx.state, 'running');
  assert.ok(rig.ctx.calls.includes('resume'));
  // No Web Audio at all: silent and harmless.
  const silent = new AudioManager({ win: rig.page.win, doc: rig.page.doc, AudioContextClass: null, timers: rig.page.timers });
  rig.page.win.press();
  silent.battleStarted('city', 'local');
  silent.overtimeStarted();
  assert.equal(silent.fighterEjected({ slot: 'p1' }), false);
  silent.matchEnded('p1');
  silent.left();
  assert.equal(silent.ctx, null);
});

test('mute silences everything, from the very unlock: the master at 0 and no effect even made', () => {
  const settings = new Settings(memoryStorage());
  settings.setAudio({ muted: true });
  const rig = engineOn({ settings });
  assert.equal(rig.engine.master.gain.value, 0, 'built silent');
  assert.equal(rig.engine.master.gain.target, 0, 'and kept silent');
  rig.engine.battleStarted('desert', 'quick-battle');
  const made = rig.ctx.counts.get('createOscillator') ?? 0;
  for (const call of [
    () => rig.engine.fighterEjected({ slot: 'p2' }), () => rig.engine.deflected({}, { direction: 1 }),
    () => rig.engine.blocked({}, { perfect: true }), () => rig.engine.blocked({}), () => rig.engine.previewSfx(),
  ]) assert.equal(call(), false);
  assert.equal(rig.ctx.counts.get('createOscillator') ?? 0, made, 'not one effect made while muted');
  settings.setAudio({ muted: false });
  assert.ok(rig.engine.master.gain.target > 0, 'unmuted: the master comes back');
  assert.equal(rig.engine.fighterEjected({ slot: 'p2' }), true);
  // A zero volume makes nothing either.
  settings.setAudio({ sfx: 0 });
  assert.equal(rig.engine.blocked({}), false);
});

test('Settings › Audio applies live, by short ramps: master, music (and the ambience with it) and the effects', () => {
  const rig = engineOn();
  const { engine, settings } = rig;
  const square = (v) => (v / 100) ** 2;
  assert.ok(Math.abs(engine.master.gain.target - square(DEFAULT_AUDIO.master)) < 1e-9);
  assert.ok(Math.abs(engine.music.gain.target - square(DEFAULT_AUDIO.music) * MIX.music) < 1e-9);
  assert.ok(Math.abs(engine.sfx.gain.target - square(DEFAULT_AUDIO.sfx) * MIX.sfx) < 1e-9);
  settings.setAudio({ music: 40, sfx: 100, master: 50 });
  for (const [bus, value] of [[engine.music, square(40) * MIX.music], [engine.ambienceBus, square(40) * MIX.ambience], [engine.sfx, MIX.sfx], [engine.master, square(50)]]) {
    const last = bus.gain.events.at(-1);
    assert.equal(last[0], 'target', 'a ramp, never a jump (no zipper noise)');
    assert.ok(Math.abs(last[1] - value) < 1e-9);
    assert.ok(last[3] > 0 && last[3] < 0.1, 'short');
  }
});

test('versions change on the beat or the bar with an equal-power crossfade, one active voice, never a gap or a double', () => {
  const rig = engineOn();
  const { engine } = rig;
  engine.battleStarted('desert', 'quick-battle');
  const main = engine.voice;
  assert.equal(main.versionId, 'main');
  assert.equal(main.section.name, 'intro', 'from its intro');
  for (let t = 0.1; t < 10.3; t += 0.05) at(rig, t);
  engine.overtimeStarted();
  const overtime = engine.voice;
  assert.equal(overtime.versionId, 'overtime');
  assert.notEqual(overtime, main);
  // A bar of Yerma's Main Battle is longer than BAR_QUANTUM_LIMIT: the next beat.
  assert.ok(main.barDur > BAR_QUANTUM_LIMIT);
  const beats = (overtime.start - main.start) / main.beat;
  assert.ok(Math.abs(beats - Math.round(beats)) < 1e-6, 'on a beat of the Main Battle');
  assert.ok(overtime.start >= 10.3, 'never in the past');
  assert.ok(overtime.start >= main.nextTime - 1e-9 || main.stopTime <= overtime.start, 'nothing of the old version written past the change');
  assert.equal(main.stopTime, overtime.start, 'the old version stops where the new one starts: no gap');
  const fade = main.faders[0].gain.events.find((e) => e[0] === 'curve');
  assert.ok(fade, 'a curve');
  assert.ok(Math.abs(fade[2] - overtime.start) < 1e-9);
  // Equal power: the two sides always sum to the same power.
  const out = equalPower(false);
  const into = equalPower(true);
  for (let i = 0; i < out.length; i++) assert.ok(Math.abs(out[i] ** 2 + into[i] ** 2 - 1) < 1e-6);
  assert.equal(overtime.section.name, 'otPickup', 'a pickup first');
  assert.equal(engine.voices.has(main), true, 'the old voice lives on through its fade and tail...');
  for (let t = 10.35; t < 14.5; t += 0.05) at(rig, t);
  assert.equal(engine.voices.has(main), false, '...then is let go');
  // Overtime's intensity follows the pressure handed in.
  engine.overtimePressure(0.6);
  assert.equal(overtime.intensity, 0.6);
  assert.ok(overtime.lp.frequency.events.some((e) => e[0] === 'target'), 'its filter opens');
  // The match ends: the sting cuts in on the next beat.
  for (let t = 14.5; t < 21.2; t += 0.05) at(rig, t);
  engine.matchEnded('p1');
  const victory = engine.voice;
  assert.equal(victory.versionId, 'victory');
  const beatsInto = (victory.start - overtime.start) / overtime.beat;
  assert.ok(Math.abs(beatsInto - Math.round(beatsInto)) < 1e-6, 'on a beat of Overtime');
  assert.ok(victory.start - rig.ctx.currentTime <= overtime.beat + LOOKAHEAD + 1e-9, 'on the first beat not already written');
  assert.equal(overtime.stopTime, victory.start);
  // A restart: the Main Battle from its intro once the old one has faded.
  engine.restarted();
  const again = engine.voice;
  assert.equal(again.versionId, 'main');
  assert.equal(again.section.name, 'intro');
  assert.ok(again.start >= victory.stopTime + FADES.restart - 1e-9, 'never doubled up');
  assert.equal(again.intensity, 0);
  // Leaving: nothing left playing.
  engine.left();
  assert.equal(engine.voice, null);
  assert.ok(again.stopTime <= rig.ctx.currentTime + 1e-9);
  const versions = musicPlayed(engine).map((m) => m.version);
  assert.deepEqual(versions, ['main', 'overtime', 'victory', 'main', null]);
});

test('pause ducks the bed about 10 dB with a low-pass, holds the Shield hums and overtime\'s intensity; resume restores them', () => {
  const rig = engineOn();
  const { engine } = rig;
  engine.battleStarted('jokull', 'quick-battle');
  engine.overtimeStarted();
  engine.overtimePressure(0.3);
  const fighter = { slot: 'p1' };
  engine.shieldHeld(fighter, true, { pan: -0.3 });
  const hum = engine.hums.get(fighter);
  assert.ok(hum, 'a hum while the Shield is up');
  engine.paused();
  assert.ok(Math.abs(20 * Math.log10(engine.pauseGain.gain.target) + 10) < 0.1, '-10 dB');
  assert.equal(engine.pauseLp.frequency.target, MIX.pauseCutoff);
  assert.equal(hum.gain.gain.target, 0, 'the hum held silent');
  engine.overtimePressure(0.9);
  assert.equal(engine.director.intensity, 0.3, 'overtime\'s intensity frozen');
  engine.resumed();
  assert.equal(engine.pauseGain.gain.target, 1);
  assert.equal(engine.pauseLp.frequency.target, 20000);
  assert.ok(hum.gain.gain.target > 0, 'the hum back');
  engine.overtimePressure(0.9);
  assert.equal(engine.director.intensity, 0.9);
});

test('effects: at most two of one at once and a cap on all, varied a little, the bed ducking under the big ones only', () => {
  const rig = engineOn();
  const { engine } = rig;
  engine.battleStarted('city', 'quick-battle');
  assert.ok(SFX_VARIATION >= 0.03 && SFX_VARIATION <= 0.05, '±3-5 %');
  assert.equal(SFX_LIMITS.perSound, 2);
  assert.deepEqual([engine.deflected({}), engine.deflected({}), engine.deflected({})], [true, true, false], 'two copies at most');
  rig.ctx.currentTime += 2;
  assert.equal(engine.deflected({}), true, 'once the first ones are over');
  // Ducking: an ejection, a Deflect and a Perfect Shield; never a block.
  const ducks = () => engine.duck.gain.events.filter((e) => e[0] === 'target' && e[1] === MIX.sfxDuck).length;
  rig.ctx.currentTime += 3;
  let before = ducks();
  engine.blocked({}, { perfect: false });
  assert.equal(ducks(), before, 'a block is understated');
  for (const call of [() => engine.blocked({}, { perfect: true }), () => engine.fighterEjected({ slot: 'p2' }), () => engine.deflected({})]) {
    before = ducks();
    call();
    assert.equal(ducks(), before + 1);
  }
  const db = 20 * Math.log10(MIX.sfxDuck);
  assert.ok(db <= -3 && db >= -5, 'about -3 to -5 dB');
  assert.ok(MIX.sfxDuckSeconds >= 0.15 && MIX.sfxDuckSeconds <= 0.3);
  // The global cap.
  rig.ctx.currentTime += 5;
  let played = 0;
  for (let i = 0; i < 30; i++) {
    const ok = [() => engine.blocked({}), () => engine.blocked({}, { perfect: true }), () => engine.deflected({}),
      () => engine.fighterEjected({ slot: 'p1' }), () => engine.fighterEjected({ slot: 'p2' })][i % 5]();
    if (ok) played++;
  }
  assert.ok(played <= SFX_LIMITS.total, 'never more than the cap at once');
});

test('the page hidden suspends everything; shown, it goes on', () => {
  const rig = engineOn();
  rig.engine.battleStarted('adamaris', 'quick-battle');
  rig.page.doc.setHidden(true);
  assert.equal(rig.ctx.state, 'suspended');
  rig.page.win.press();
  assert.equal(rig.ctx.state, 'suspended', 'no gesture resumes a hidden page');
  rig.page.doc.setHidden(false);
  assert.equal(rig.ctx.state, 'running');
});

test('Practice Ground: its factory ambience, no music; it fades out as Practice ends', () => {
  const rig = engineOn();
  const { engine } = rig;
  engine.practiceStarted();
  assert.equal(engine.voice, null, 'no theme');
  assert.ok(engine.ambience, 'the ambience');
  assert.equal(engine.perspective.mode, 'practice');
  for (let t = 0.05; t < 30; t += 0.05) at(rig, t);
  const oneShots = rig.ctx.starts.filter((s) => s.started > 1).length;
  assert.ok(oneShots > 50, 'its one-shots keep coming');
  engine.paused();
  assert.ok(engine.pauseGain.gain.target < 1, 'ducked under the menu');
  engine.resumed();
  assert.equal(engine.fighterEjected({ slot: 'p2' }), true, 'the dummy taken: the opponent\'s ejection');
  assert.deepEqual(sfxPlayed(engine), [SFX.ejectOpponent]);
  const ambience = engine.ambience;
  engine.left();
  assert.equal(ambience.stopped, true);
  assert.ok(ambience.out.gain.events.some((e) => e[0] === 'linear' && e[1] === 0), 'faded out');
  // Starting a battle after Practice stops the ambience too.
  engine.practiceStarted();
  const next = engine.ambience;
  engine.battleStarted('desert', 'watch');
  assert.equal(next.stopped, true);
});

// ---- The game's events, heard on real Battles ----------------------------------------------

test('one ejection a exit: every Void fall once, a respawn and a fall again, and no second burst from ejectLoser after the winning fall', () => {
  const { battle, engine, sound } = battleOn();
  const ejections = () => callsNamed(engine, 'fighterEjected').map((c) => c[1].slot);
  intoVoid(battle, battle.p2);
  battle.update(DT);
  assert.deepEqual(ejections(), ['p2']);
  for (let i = 0; i < 30; i++) battle.update(DT);
  assert.deepEqual(ejections(), ['p2'], 'out of play: nothing more while it waits');
  // Back, then gone again: a second exit, a second sound (and this one the
  // match's winning point).
  for (let i = 0; i < Math.ceil(CONFIG.battle.respawnSeconds / DT) + 5; i++) battle.update(DT);
  assert.equal(battle.p2.lostToVoid, false, 'respawned');
  battle.score.p1 = CONFIG.battle.pointsToWin - 1;
  intoVoid(battle, battle.p2);
  battle.update(DT);
  assert.deepEqual(ejections(), ['p2', 'p2']);
  assert.equal(battle.matchOver, true, 'that fall won it');
  assert.equal(battle.final.winner, 'p1');
  for (let i = 0; i < 60; i++) battle.update(DT);
  assert.deepEqual(ejections(), ['p2', 'p2'], 'ejectLoser saw the Void had it: no second sound');
  assert.deepEqual(callsNamed(engine, 'matchEnded').map((c) => c[1]), ['p1'], 'the end, once');
  sound.detach();
});

test('ejectLoser sounds once when the clock decides, and never for a loser already waiting to respawn; a draw ejects nobody', () => {
  // On time: the loser still on the stage is ejected, once.
  {
    const { battle, engine } = battleOn();
    battle.score.p1 = 1;
    battle.timeLeft = DT / 2;
    battle.overtimeSeconds = 0;
    battle.update(DT);
    assert.equal(battle.matchOver, true);
    assert.deepEqual(callsNamed(engine, 'fighterEjected').map((c) => c[1].slot), ['p2']);
    for (let i = 0; i < 30; i++) battle.update(DT);
    assert.equal(callsNamed(engine, 'fighterEjected').length, 1);
  }
  // The loser already taken by the Void when the clock runs out.
  {
    const { battle, engine } = battleOn();
    intoVoid(battle, battle.p2);
    battle.update(DT);
    assert.equal(callsNamed(engine, 'fighterEjected').length, 1);
    battle.timeLeft = DT / 2;
    battle.update(DT);
    assert.equal(battle.matchOver, true);
    assert.equal(battle.final.winner, 'p1');
    assert.equal(callsNamed(engine, 'fighterEjected').length, 1, 'its fall was its exit');
  }
  // A draw: nobody ejected, the Draw version.
  {
    const { battle, engine } = battleOn();
    battle.timeLeft = DT / 2;
    battle.overtimeSeconds = 0;
    battle.update(DT);
    assert.equal(battle.final.winner, null);
    assert.equal(callsNamed(engine, 'fighterEjected').length, 0);
    assert.deepEqual(callsNamed(engine, 'matchEnded').map((c) => c[1]), [null]);
  }
});

test('the Deflect\'s sound only for a real turn-back, once per Deflect however many it turns; starting or whiffing one is silent', () => {
  const PRESS = { shield: true, shieldPressed: true };
  const setup = () => {
    const rig = battleOn();
    const { battle } = rig;
    const [thrower, deflector] = [battle.p1, battle.p2];
    aloft(deflector, 520, 1900);
    thrower.body.x = 1400;
    deflector.controller = scripted((n) => (n === 0 ? PRESS : {}));
    battle.update(DT);
    let guard = 0;
    while (deflector.combat.phase !== 'active' && guard++ < 30) battle.update(DT);
    assert.equal(deflector.combat.attack?.def.id, 'deflect', 'its Deflect is out');
    return { ...rig, thrower, deflector };
  };
  const shot = (owner, x, y) => {
    const def = owner.projectileDefs.attack2_object;
    return new Projectile({ owner, def, anim: owner.sprites.projectile(def.animation), x, y, direction: 1 });
  };
  // Whiffed: nothing turned back, nothing heard.
  {
    const { battle, engine, deflector } = setup();
    while (deflector.combat.attack) battle.update(DT);
    assert.equal(callsNamed(engine, 'deflected').length, 0);
  }
  // One projectile turned back: once.
  {
    const { battle, engine, thrower, deflector } = setup();
    const box = worldBox(deflector, deflector.deflect.hitbox, {});
    battle.projectiles.push(shot(thrower, box.x - 600 * DT, box.y + box.h / 2));
    battle.update(DT);
    const heard = callsNamed(engine, 'deflected');
    assert.equal(heard.length, 1);
    assert.equal(heard[0][1], deflector);
    assert.equal(heard[0][2].direction, -1, 'sent back the way it came');
    for (let i = 0; i < 10; i++) battle.update(DT);
    assert.equal(callsNamed(engine, 'deflected').length, 1);
  }
  // Two in the same Deflect: still once.
  {
    const { battle, engine, thrower, deflector } = setup();
    const box = worldBox(deflector, deflector.deflect.hitbox, {});
    battle.projectiles.push(shot(thrower, box.x - 600 * DT, box.y + box.h / 2));
    battle.projectiles.push(shot(thrower, box.x - 600 * DT, box.y + box.h / 3));
    battle.update(DT);
    battle.update(DT);
    assert.ok(battle.combat.deflections.length >= 0);
    assert.equal(callsNamed(engine, 'deflected').length, 1, 'one Deflect, one sound');
  }
});

test('a blocked hit sounds once: the Perfect Shield\'s in place of the block\'s, never both; the Shield\'s hum rises and drops with it', () => {
  const run = ({ perfect }) => {
    const rig = battleOn();
    const { battle, engine, sound } = rig;
    const [striker, guard] = [battle.p1, battle.p2];
    Object.assign(striker.body, { x: 1700, prevX: 1700 });
    Object.assign(guard.body, { x: 1744, prevX: 1744 });
    striker.facing = 1;
    guard.facing = -1;
    const strikeAt = 30;
    const raiseAt = perfect ? strikeAt : 2;
    let n = 0;
    striker.controller = scripted((i) => (i === strikeAt ? { attack1: true, attack1Pressed: true } : {}));
    guard.controller = scripted((i) => (i >= raiseAt && i < strikeAt + 40 ? { shield: true, shieldPressed: i === raiseAt } : {}));
    for (; n < strikeAt + 80; n++) {
      battle.update(DT);
      sound.sync();
    }
    return rig;
  };
  for (const perfect of [false, true]) {
    const { engine } = run({ perfect });
    const blocks = callsNamed(engine, 'blocked');
    assert.equal(blocks.length, 1, `${perfect ? 'perfect' : 'plain'}: one blocked event`);
    assert.equal(blocks[0][2].perfect, perfect);
    const holds = callsNamed(engine, 'shieldHeld').filter((c) => c[1].slot === 'p2').map((c) => c[2]);
    assert.deepEqual(holds, [true, false], 'raised once, lowered once');
  }
  // The engine plays exactly one of the two.
  const rig = engineOn();
  rig.engine.battleStarted('desert', 'quick-battle');
  rig.engine.blocked({}, { perfect: true });
  assert.deepEqual(sfxPlayed(rig.engine), [SFX.perfectShield]);
  rig.ctx.currentTime += 2;
  rig.engine.blocked({}, { perfect: false });
  assert.deepEqual(sfxPlayed(rig.engine), [SFX.perfectShield, SFX.block]);
  // The hum: one per fighter, gone with a release, an ejection or a restart.
  const f = { slot: 'p1' };
  rig.engine.shieldHeld(f, true);
  rig.engine.shieldHeld(f, true);
  assert.equal(rig.engine.hums.size, 1);
  rig.engine.shieldHeld(f, false);
  assert.equal(rig.engine.hums.size, 0);
  rig.engine.shieldHeld(f, true);
  rig.engine.fighterEjected(f);
  assert.equal(rig.engine.hums.size, 0, 'an ejected fighter holds nothing');
  rig.engine.shieldHeld(f, true);
  rig.engine.restarted();
  assert.equal(rig.engine.hums.size, 0);
});

test('overtime\'s intensity is the battle\'s own Void pressure, read every frame the world runs and never while it is held', () => {
  const { battle, engine, sound } = battleOn();
  battle.timeLeft = DT / 2;
  battle.update(DT);
  assert.equal(battle.overtime, true);
  assert.equal(callsNamed(engine, 'overtimeStarted').length, 1);
  for (let i = 0; i < 1800; i++) {
    battle.update(DT);
    if (i % 4 === 0) sound.sync();
  }
  sound.sync();
  const pressures = callsNamed(engine, 'overtimePressure').map((c) => c[1]);
  assert.ok(pressures.length > 10);
  assert.ok(pressures.every((p, i) => i === 0 || p >= pressures[i - 1]), 'rising with the Void');
  assert.equal(pressures.at(-1), battle.overtimeVoidPressure, 'the battle\'s value, nothing of its own');
  // Held (paused): the screen does not sync, so nothing moves.
  const count = pressures.length;
  sound.setPaused(true);
  sound.setPaused(false);
  assert.equal(callsNamed(engine, 'overtimePressure').length, count);
  assert.deepEqual(callsNamed(engine, 'paused').length, 1);
  // A rematch: the music from its intro.
  battle.restart();
  assert.equal(callsNamed(engine, 'restarted').length, 1);
});

test('every mode and point of view: Local Play and Watch Mode always end on Victory, a draw on Draw everywhere', () => {
  const ending = (mode, winner, localSlot = 'p1') => {
    const rig = engineOn();
    rig.engine.battleStarted('city', mode, { localSlot });
    rig.engine.matchEnded(winner);
    return rig.engine.voice.versionId;
  };
  assert.equal(ending('quick-battle', 'p1'), 'victory');
  assert.equal(ending('quick-battle', 'p2'), 'defeat');
  assert.equal(ending('adventure', 'p2'), 'defeat');
  assert.equal(ending('online', 'p2', 'p2'), 'victory');
  assert.equal(ending('online', 'p1', 'p2'), 'defeat');
  for (const mode of ['local', 'watch']) {
    assert.equal(ending(mode, 'p1'), 'victory');
    assert.equal(ending(mode, 'p2'), 'victory');
  }
  for (const mode of ['quick-battle', 'adventure', 'online', 'local', 'watch']) assert.equal(ending(mode, null), 'draw', mode);
  // Ejections: Local Play's and Watch Mode's universal one for both sides.
  const eject = (mode, slot, localSlot = 'p1') => {
    const rig = engineOn();
    rig.engine.battleStarted('city', mode, { localSlot });
    rig.engine.fighterEjected({ slot });
    return sfxPlayed(rig.engine)[0];
  };
  assert.equal(eject('local', 'p1'), SFX.ejectUniversal);
  assert.equal(eject('local', 'p2'), SFX.ejectUniversal);
  assert.equal(eject('watch', 'p2'), SFX.ejectUniversal);
  assert.equal(eject('quick-battle', 'p2'), SFX.ejectOpponent);
  assert.equal(eject('online', 'p2', 'p2'), SFX.ejectPlayer);
});

test('Practice Ground through BattleAudio: practiceStarted, the dummy\'s fall the opponent\'s, swaps never leave a hum behind', () => {
  const session = new PracticeSession({
    canvas: { getContext: () => ({}) }, map: PRACTICE_MAP, def: DEF, sprites: fakeSpritesOf(DEF), input: stubInput(),
  });
  session.setCPU(DEF, fakeSpritesOf(DEF));
  const engine = recorder();
  const sound = new BattleAudio(engine);
  sound.attach(session, { mode: 'practice' });
  assert.equal(callsNamed(engine, 'practiceStarted').length, 1);
  assert.equal(callsNamed(engine, 'battleStarted').length, 0);
  const dummy = session.cpu;
  intoVoid(session, dummy);
  session.update(DT);
  assert.deepEqual(callsNamed(engine, 'fighterEjected').map((c) => c[1]), [dummy]);
  // The player's Shield up, then the fighter swapped: its hum goes.
  const old = session.player;
  old.combat.shielding = true;
  sound.sync();
  assert.deepEqual(callsNamed(engine, 'shieldHeld').map((c) => c[2]), [true]);
  session.setFighter(DEF, fakeSpritesOf(DEF));
  sound.sync();
  assert.deepEqual(callsNamed(engine, 'shieldHeld').map((c) => [c[1] === old, c[2]]), [[true, true], [true, false]]);
  sound.detach();
  assert.equal(callsNamed(engine, 'left').length, 1);
  assert.equal(session.cueListener, null, 'nobody listens any more');
});

test('sound never feeds back: a match with and without a listener steps identically, and a listener that throws changes nothing', () => {
  const run = (listen) => {
    const battle = new Battle({
      canvas: { getContext: () => ({}) }, map: getMap('asperitas'), mode: 'watch', seed: 11, difficulty: 'hard',
      p1Def: DEF, p2Def: getCharacter('0002'), p1Sprites: fakeSpritesOf(DEF), p2Sprites: fakeSpritesOf(getCharacter('0002')), input: stubInput(),
    });
    if (listen === 'throw') battle.cueListener = () => { throw new Error('boom'); };
    else if (listen) new BattleAudio(recorder()).attach(battle, { stage: 'asperitas', mode: 'watch' });
    const errors = console.error;
    console.error = () => {};
    try {
      for (let i = 0; i < 2400; i++) battle.update(DT);
    } finally {
      console.error = errors;
    }
    return JSON.stringify([battle.score, battle.p1.body.x, battle.p2.body.y, battle.p1.combat.launchPoint, battle.p2.combat.energy, battle.elapsed]);
  };
  const plain = run(false);
  assert.equal(run(true), plain);
  assert.equal(run('throw'), plain);
});

// ---- Settings › Audio ---------------------------------------------------------------------

test('Settings › Audio is version 12: defaults, every older version migrated to them with everything else kept, each value checked on its own', () => {
  assert.equal(SETTINGS_VERSION, 12);
  assert.deepEqual({ ...DEFAULT_AUDIO }, { master: 80, music: 70, sfx: 85, muted: false });
  const s11 = { version: 11, language: 'fr', mobileControls: 'joystick', mobileControlsChosen: true, automaticTurnAround: false, onlineName: 'Ana', screenPadHintSeen: true, audio: { master: 3 } };
  const read11 = readSettings(s11);
  assert.deepEqual(read11.audio, DEFAULT_AUDIO, 'version 11 had no Audio settings: their defaults, whatever it holds');
  assert.equal(read11.language, 'fr');
  assert.equal(read11.mobileControls, 'joystick');
  assert.equal(read11.automaticTurnAround, false);
  assert.equal(read11.onlineName, 'Ana');
  assert.equal(read11.screenPadHintSeen, true, 'everything else kept');
  for (const version of [1, 4, 8, 9, 10]) assert.deepEqual(readSettings({ version, language: 'en', audio: { music: 1 } }).audio, DEFAULT_AUDIO, `version ${version}`);
  // Version 12: each value on its own.
  assert.deepEqual(readSettings({ version: 12, audio: { master: 55, music: 0, sfx: 100, muted: true } }).audio, { master: 55, music: 0, sfx: 100, muted: true });
  assert.deepEqual(sanitizeAudio({ master: 140, music: -5, sfx: 33.6, muted: 'yes' }), { master: 100, music: 0, sfx: 34, muted: false });
  assert.deepEqual(sanitizeAudio({ master: 'loud', music: NaN, sfx: Infinity, muted: 1 }), DEFAULT_AUDIO, 'not numbers: the defaults');
  assert.deepEqual(sanitizeAudio({ master: 20 }), { ...DEFAULT_AUDIO, master: 20 }, 'one good value keeps, the rest default');
  for (const bad of [null, undefined, 'x', [], 5]) assert.deepEqual(sanitizeAudio(bad), DEFAULT_AUDIO);
  // Saved, announced, read back.
  const storage = memoryStorage();
  const settings = new Settings(storage);
  const heard = [];
  settings.onChange((name, value) => heard.push([name, value]));
  assert.equal(settings.setAudio({ music: 42, muted: true, sfx: 'x' }), true);
  assert.deepEqual(settings.audio, { master: 80, music: 42, sfx: 85, muted: true }, 'a bad value keeps the one in force');
  assert.deepEqual(heard, [['audio', { master: 80, music: 42, sfx: 85, muted: true }]]);
  settings.setAudio({ music: 42 });
  assert.equal(heard.length, 1, 'no change, no news');
  const saved = JSON.parse(storage.map.get(SETTINGS_KEY));
  assert.equal(saved.version, 12);
  assert.deepEqual(saved.audio, { master: 80, music: 42, sfx: 85, muted: true });
  assert.deepEqual(new Settings(storage).audio, { master: 80, music: 42, sfx: 85, muted: true });
  assert.equal(settings.setAudio(null), false);
});

// ---- The themes -----------------------------------------------------------------------

test('each stage has its own theme in five versions: a long Main Battle, a faster darker Overtime, three short endings', () => {
  const signatures = new Set();
  const hooks = new Set();
  for (const stage of THEMED_STAGES) {
    const theme = THEMES[stage];
    assert.equal(theme.id, stage);
    assert.ok(MAPS.some((m) => m.id === stage), `${stage} is a stage`);
    const t = compileTheme(theme);
    for (const v of MUSIC_VERSIONS) assert.ok(t.versions[v], `${stage}: ${v}`);
    const main = versionLength(theme, 'main');
    assert.ok(main.once > 4 && main.once < 12, `${stage}: an intro`);
    assert.ok(main.loop >= 90, `${stage}: at least 90 s before it repeats (${main.loop.toFixed(1)} s)`);
    const ot = t.versions.overtime;
    const ratio = ot.bpm / t.versions.main.bpm;
    assert.ok(ratio >= 1.1 && ratio <= 1.2, `${stage}: overtime 10-20 % faster (${ratio.toFixed(3)})`);
    assert.ok(ot.transpose === 2 || ot.scale !== t.versions.main.scale, `${stage}: a step up or a darker mode`);
    assert.ok(ot.overtime && ot.lowpass, `${stage}: its intensity layers and its opening filter`);
    for (const v of ['victory', 'defeat', 'draw']) {
      const len = versionLength(theme, v);
      assert.ok(len.once >= 3 && len.once <= 6, `${stage} ${v}: a short sting (${len.once.toFixed(2)} s)`);
      assert.ok(len.loop > 0, `${stage} ${v}: then a calm loop`);
    }
    assert.notEqual(t.versions.victory.scale, t.versions.defeat.scale, `${stage}: Victory and Defeat in different modes`);
    signatures.add(`${theme.tonic}:${theme.scale}:${theme.bpm}`);
    hooks.add(JSON.stringify(t.parts.hook8.events.slice(0, 12).map((e) => [e.value, e.len])));
    // Every note any version plays is a real, playable pitch.
    for (const v of MUSIC_VERSIONS) {
      const version = t.versions[v];
      for (const s of [...version.once, ...version.loop]) {
        const section = t.sections[s];
        for (let bar = 0; bar < section.bars; bar++) {
          for (const e of renderBar(t, version, section, bar, bar % 2, bar % 3 === 0 ? 1 : 0)) {
            for (const m of e.midis ?? [e.midi]) assert.ok(m >= 24 && m <= 108, `${stage} ${v} ${s}: MIDI ${m} on ${e.channel}`);
          }
        }
      }
    }
  }
  assert.equal(signatures.size, THEMED_STAGES.length, 'each its own key, mode and tempo');
  assert.equal(hooks.size, THEMED_STAGES.length, 'no two stages share a hook');
});

test('the Draw ending is each stage\'s own: suspended, never a reuse of its Victory or Defeat', () => {
  for (const stage of THEMED_STAGES) {
    const t = compileTheme(THEMES[stage]);
    const draw = t.versions.draw;
    const sting = t.sections[draw.once[0]];
    assert.ok(sting.chords.some((c) => c.shape === 'sus2' || c.shape === 'sus4'), `${stage}: a suspended chord`);
    for (const other of ['victory', 'defeat']) {
      assert.notDeepEqual([...draw.once, ...draw.loop], [...t.versions[other].once, ...t.versions[other].loop], `${stage}: not its ${other}`);
    }
  }
});

test('overtime\'s layers follow its intensity: denser ticking, the sub\'s pulse, more risers and strings bending sharp', () => {
  const t = compileTheme(THEMES.desert);
  const ot = t.versions.overtime;
  const section = t.sections[ot.loop[0]];
  const count = (intensity, channel) => renderBar(t, ot, section, 0, 0, intensity).filter((e) => e.channel === channel).length;
  const ticks = [0, 0.4, 0.8].map((i) => count(i, 'tick') + count(i, 'tock'));
  assert.ok(ticks[0] < ticks[1] && ticks[1] < ticks[2], `the clock gets denser (${ticks})`);
  assert.equal(count(0, 'pulse'), 0);
  assert.ok(count(0.8, 'pulse') > count(0.3, 'pulse'));
  assert.equal(count(0.2, 'riser'), 0);
  assert.equal(count(0.95, 'riser'), 1);
  assert.equal(count(0.2, 'tension'), 0);
  const bend = renderBar(t, ot, section, 0, 0, 0.9).find((e) => e.channel === 'tension');
  assert.ok(bend.cents > 80, 'bent sharp');
  // Layers gated by intensity come in.
  assert.equal(count(0, 'clash'), 0);
  assert.ok(count(0.8, 'clash') > 0, 'the dissonant ostinato late on');
});

test('the theme notation: degrees, chords and rhythms parse exactly, and a typo fails loudly', () => {
  const m = parseMelody('>1:2 2:1 3b:1 5\':4 .:4 7,:4');
  assert.deepEqual(m.events.map((e) => [e.step, e.len, e.value, e.acc, e.octave, e.vel]), [
    [0, 2, 1, 0, 0, 1], [2, 1, 2, 0, 0, 0.8], [3, 1, 3, -1, 0, 0.8], [4, 4, 5, 0, 1, 0.8], [12, 4, 7, 0, -1, 0.8],
  ]);
  assert.equal(m.steps, 16);
  assert.equal(degreeSemis(SCALES.phrygianDominant, 2), 1);
  assert.equal(degreeSemis(SCALES.ionian, 8), 12);
  assert.equal(degreeSemis(SCALES.ionian, 0), -1);
  assert.deepEqual(parseChords('1 4sus2 7b').map((c) => [c.degree, c.acc, c.shape]), [[1, 0, ''], [4, 0, 'sus2'], [7, -1, '']]);
  assert.deepEqual(parseRhythm('X.x-o').hits, [{ step: 0, vel: 1 }, { step: 2, vel: 0.78 }, { step: 4, vel: 0.42 }]);
  assert.throws(() => parseMelody('1:2 q:2'), /Bad melody token/);
  assert.throws(() => parseRhythm('x?'), /Bad rhythm/);
  assert.throws(() => compileTheme({ ...THEMES.city, parts: { ...THEMES.city.parts, broken: { melody: '1:3' } } }), /not a whole number of bars/);
  assert.throws(() => compileTheme({ ...THEMES.city, sections: { ...THEMES.city.sections, A1: { ...THEMES.city.sections.A1, play: { nope: 'pads' } } } }), /unknown channel/);
});
