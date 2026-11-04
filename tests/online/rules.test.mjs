// Run with node --test tests/online/rules.test.mjs (no dependencies). What a
// player types for Online Play (js/online/rules.js): their name (2 to 16
// letters of any language, digits, spaces, _ - . ', cleaned), a room's name
// (the same rules, up to 24, "{name}'s room" / "Salle de {name}" to start
// with, fitted), and a room code (5 characters of an alphabet with no 0 / O
// or 1 / I / L, read in any case); the remembered name in the settings
// (schema 9).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkName, checkRoomName, cleanName, fitName, normalizeCode, isValidCode, CODE_ALPHABET, CODE_LENGTH, NAME_LIMITS, ROOM_NAME_LIMITS,
  isOnlineMode, sessionId,
} from '../../js/online/rules.js';
import { CONFIG } from '../../js/config.js';
import { setLanguage, t } from '../../js/localization/i18n.js';

test('names: 2 to 16 characters, any language\'s letters, digits, spaces and _ - . \'', () => {
  assert.deepEqual({ ...NAME_LIMITS }, { min: 2, max: 16 });
  for (const ok of ['Jules', 'Zoë', 'Łukasz', 'Ана', 'さくら', '김민준', 'محمد', 'राम', 'Ngô Bảo', "O'Neil", 'mr.x', 'a_b-c', '42', 'Jo']) {
    assert.deepEqual(checkName(ok), { ok: true, value: ok }, ok);
  }
  assert.equal(checkName('x'.repeat(16)).ok, true);
  assert.equal(checkName('x'.repeat(17)).error, 'long');
  assert.equal(checkName('A').error, 'short');
  assert.equal(checkName('').error, 'empty');
  assert.equal(checkName('    ').error, 'empty');
  assert.equal(checkName(null).error, 'empty');
  for (const bad of ['<script>', 'a&b', 'Neo😎', '1️⃣2', 'bell\u0007x', 'zero​width', 'emoji️', '--', "''", 'a/b', 'a@b', 'a+b']) {
    assert.equal(checkName(bad).ok, false, JSON.stringify(bad));
    assert.equal(checkName(bad).error, 'chars', JSON.stringify(bad));
  }
});

test('names are cleaned: composed, one space at a time, trimmed, a typographic apostrophe read as \'', () => {
  assert.equal(cleanName('  Jules   the   Great  '), 'Jules the Great');
  assert.equal(cleanName('tab\there\nand there'), 'tab here and there');
  assert.equal(cleanName('d’Arc'), "d'Arc");
  assert.equal(cleanName('José'), 'José', 'composed (NFC)');
  assert.equal(checkName('José').value.length, 4);
  // Lengths count characters, not UTF-16 units or bytes.
  assert.equal(checkName('𝒜𝒷').ok, true);
  assert.equal(checkName('ア'.repeat(16)).ok, true);
});

test('a room\'s name: the same rules up to 24 characters, starting from "{name}\'s room" (English) or "Salle de {name}" (French), fitted', () => {
  assert.deepEqual({ ...ROOM_NAME_LIMITS }, { min: 2, max: 24 });
  assert.equal(checkRoomName('r'.repeat(24)).ok, true);
  assert.equal(checkRoomName('r'.repeat(25)).error, 'long');
  setLanguage('en');
  assert.equal(t('online.roomDefault', { name: 'Jules' }), "Jules's room", 'a name ending in s reads fine');
  assert.equal(t('online.roomDefault', { name: 'Sam' }), "Sam's room");
  setLanguage('fr');
  try {
    assert.equal(t('online.roomDefault', { name: 'Jules' }), 'Salle de Jules');
    // The longest name (16) makes 25 characters in French: fitted to 24.
    const long = 'Abcdefghijklmnop';
    assert.equal(fitName(t('online.roomDefault', { name: long })), 'Salle de Abcdefghijklmno');
    assert.equal(checkRoomName(fitName(t('online.roomDefault', { name: long }))).ok, true);
  } finally {
    setLanguage('en');
  }
  // Every default is itself a valid room name.
  for (const name of ['Jo', 'Jules', "O'Neil", 'x'.repeat(16), 'さくら']) {
    assert.equal(checkRoomName(fitName(t('online.roomDefault', { name }))).ok, true, name);
  }
});

test('room codes: 5 characters, nothing ambiguous, read whatever the case, spaces and dashes ignored', () => {
  assert.equal(CODE_LENGTH, 5);
  for (const c of '0O1IL') assert.ok(!CODE_ALPHABET.includes(c), c);
  assert.equal(normalizeCode('k7m2q'), 'K7M2Q');
  assert.equal(normalizeCode(' k7-m2 q '), 'K7M2Q');
  assert.equal(isValidCode(normalizeCode('k7m2q')), true);
  for (const bad of ['K7M2', 'K7M2QQ', 'K7M2O', 'K7M21', 'K7M2I', 'K7M2L', 'K7M2o', '', 'ÀBCDE']) {
    assert.equal(isValidCode(normalizeCode(bad)), false, bad);
  }
  // Letters outside the alphabet keep their case (so they fail, never
  // read as something else).
  assert.equal(normalizeCode('abcdo'), 'ABCDo');
});

test('the online modes and a visit\'s session id', () => {
  assert.deepEqual([...CONFIG.online.modes], ['quick-battle']);
  assert.equal(isOnlineMode('quick-battle'), true);
  assert.equal(isOnlineMode('watch'), false);
  const a = sessionId();
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.notEqual(sessionId(), a);
});

test('CONFIG.online: the deployed server (one https origin, nothing more), the delay for a match through the relay, no server of its own for a link, the waits and the colours; frozen', () => {
  const o = CONFIG.online;
  const url = new URL(o.serverUrl);
  assert.equal(url.protocol, 'https:', 'a secure address: itch.io serves the game over https');
  assert.equal(url.origin, o.serverUrl, 'scheme and host only: no path, query or trailing slash');
  // The pages.dev gateway (server/gateway/), which passes everything to the
  // Worker: the Worker has no public address of its own.
  assert.match(url.hostname, /\.pages\.dev$/, 'the room server\'s pages.dev address');
  // The match goes through a TURN relay, every frame sent at once, with a
  // delay chosen for each match from the trip (3 to 12 steps), 7 (about
  // 117 ms) when it could not be measured.
  assert.equal(o.inputDelay, 7);
  assert.deepEqual({ ...o.inputDelayRange }, { min: 3, max: 12 });
  assert.equal(o.sendIntervalMs, undefined, 'no packet waits to be sent');
  assert.equal(o.delayMarginMs, 15);
  assert.equal(o.pingIntervalMs, 200);
  assert.equal(o.pingRefreshMs, 5000);
  // No STUN or other server for a direct link between the two browsers.
  assert.equal(o.iceServers, undefined);
  assert.equal(o.connectTimeoutMs, 10000);
  assert.equal(o.disconnectGraceMs, 10000);
  assert.deepEqual({ ...o.colors }, { ...CONFIG.localPlay.colors });
  assert.ok(Object.isFrozen(o) && Object.isFrozen(o.modes));
});

test('the settings remember the online name (schema 9): checked, cleaned, saved, and an older schema migrates with none', async () => {
  const { Settings, SETTINGS_KEY, readSettings } = await import('../../js/core/settings.js');
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const settings = new Settings(storage);
  assert.equal(settings.onlineName, null);
  const heard = [];
  settings.onChange((name, value) => heard.push([name, value]));
  assert.equal(settings.setOnlineName('  Zoë   d’Arc '), true);
  assert.equal(settings.onlineName, "Zoë d'Arc");
  assert.deepEqual(heard, [['onlineName', "Zoë d'Arc"]]);
  assert.equal(JSON.parse(store.get(SETTINGS_KEY)).onlineName, "Zoë d'Arc");
  assert.equal(new Settings(storage).onlineName, "Zoë d'Arc", 'kept for the next visit');
  for (const bad of ['', 'x', '<b>', 'Neo😎', 42, null]) assert.equal(settings.setOnlineName(bad), false, String(bad));
  assert.equal(settings.onlineName, "Zoë d'Arc");
  // A stored name the rules refuse is none at all.
  assert.equal(readSettings({ version: 9, onlineName: '<script>' }).onlineName, null);
  // Version 8 keeps everything it had, Automatic turn-around off included,
  // and has no name yet.
  const v8 = readSettings({ version: 8, language: 'fr', mobileControls: 'classic', automaticTurnAround: false, onlineName: 'Sneaky' });
  assert.equal(v8.language, 'fr');
  assert.equal(v8.automaticTurnAround, false);
  assert.equal(v8.onlineName, null);
});
