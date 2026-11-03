// Run with node --test server/tests/rules.test.mjs (no dependencies). The
// server's copy of the naming rules (server/src/rules.js) gives the game's
// (js/online/rules.js) answers, name for name and code for code, so a name
// the game accepts is never refused and one it refuses never gets in; and
// the modes and alphabet are the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as server from '../src/rules.js';
import * as game from '../../js/online/rules.js';
import { CONFIG } from '../../js/config.js';

const NAMES = [
  'Chris', 'Zoë', 'Łukasz', 'Ана', 'さくら', '김민준', 'محمد', 'राम', 'Ngô Bảo', "O'Neil", 'mr.x', 'a_b-c', '  spaced   out  ',
  'd’Arc', 'A', 'AB', 'x'.repeat(16), 'x'.repeat(17), '<script>', 'a&b', 'Neo😎', '1️⃣2', 'tab\there', 'line\nbreak', 'bell\u0007',
  'zero​width', '--', '..', "''", '42', '', '   ', 'José', 'José', 'ﬁne', 'Ⅻ', '²²', 'emoji️',
];

test('names: the server cleans and accepts exactly what the game does', () => {
  for (const raw of NAMES) {
    const g = game.checkName(raw);
    const s = server.validName(raw);
    assert.equal(s, g.ok ? g.value : null, JSON.stringify(raw));
  }
  for (const raw of [...NAMES, "Chris's room", 'Salle de Chris', 'r'.repeat(24), 'r'.repeat(25)]) {
    const g = game.checkRoomName(raw);
    assert.equal(server.validRoomName(raw), g.ok ? g.value : null, JSON.stringify(raw));
  }
});

test('codes, the alphabet, the modes and the visibility are the same on both sides', () => {
  assert.equal(server.CODE_ALPHABET, game.CODE_ALPHABET);
  assert.equal(server.CODE_LENGTH, game.CODE_LENGTH);
  assert.deepEqual([...server.MODES], [...CONFIG.online.modes]);
  assert.deepEqual([...server.VISIBILITIES], [...game.VISIBILITIES]);
  assert.deepEqual({ ...server.NAME_LIMITS }, { ...game.NAME_LIMITS });
  assert.deepEqual({ ...server.ROOM_NAME_LIMITS }, { ...game.ROOM_NAME_LIMITS });
  for (const raw of ['ABCDE', 'abcde', 'ab cd e', 'AB-CDE', 'ABCD', 'ABCDEF', 'ABCD0', 'ABCDO', 'ABCD1', 'ABCDI', 'ABCDL', 'ÀBCDE', 'K7M2Q']) {
    const g = game.normalizeCode(raw);
    assert.equal(server.validCode(raw), game.isValidCode(g) ? g : null, raw);
  }
  // The alphabet has nothing that reads like something else.
  for (const c of '0O1IL') assert.ok(!server.CODE_ALPHABET.includes(c), c);
  for (let i = 0; i < 200; i++) assert.ok(game.isValidCode(server.randomCode()));
});
