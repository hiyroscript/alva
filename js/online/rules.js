// Online Play's rules for what players type: their online name, a room's
// name and a room code. The client checks them to help the player; the room
// server checks them again, by its own copy of the same rules
// (server/src/rules.js), and never trusts the client. A test holds the two
// copies to the same answers (server/tests/rules.test.mjs).
//
// A name is 2 to 16 characters once cleaned (a room's name up to 24):
// letters of any language (with their accents and marks), digits, spaces
// and _ - . ' only, at least one of them a letter or a digit. Cleaning
// puts the text in its composed Unicode form, reads a typographic
// apostrophe as ', turns every run of white space into one space and trims
// the ends. Nothing else is taken: no control characters, no emoji or
// symbols, no markup (< > & are not allowed characters). Lengths count
// characters (code points), not bytes.
//
// A room code is 5 characters from an alphabet with nothing that reads like
// something else (no 0 / O, 1 / I / L), shown in capitals and read whatever
// case it is typed in. This module reads nothing but the config and touches
// no storage or DOM.

import { CONFIG } from '../config.js';

export const NAME_LIMITS = Object.freeze({ min: 2, max: 16 });
export const ROOM_NAME_LIMITS = Object.freeze({ min: 2, max: 24 });

// The room code alphabet: capitals and digits, without 0, O, 1, I and L.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

// The visibility a room is created with: listed in the lobby, or joinable
// only with its code.
export const VISIBILITIES = Object.freeze(['public', 'private']);

// Letters, their combining marks (never an enclosing mark or a variation
// selector, which turn a digit or a letter into an emoji), digits, and the
// four punctuation marks.
const ALLOWED = /^(?:(?![︀-️\u{E0100}-\u{E01EF}])[\p{L}\p{Mn}\p{Mc}\p{Nd} _.'-])+$/u;
const MEANINGFUL = /[\p{L}\p{Nd}]/u;

// The text a player typed, cleaned (see the top): what is checked, shown
// and sent.
export function cleanName(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/’/g, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

// How many characters `text` is (code points).
export const nameLength = (text) => [...text].length;

// `raw` checked as a name with `limits` (a player's by default):
// { ok: true, value } with the cleaned name, or { ok: false, value, error }
// where error is 'empty', 'short', 'long' or 'chars'.
export function checkName(raw, limits = NAME_LIMITS) {
  const value = cleanName(raw);
  const length = nameLength(value);
  if (!length) return { ok: false, value, error: 'empty' };
  if (!ALLOWED.test(value) || !MEANINGFUL.test(value)) return { ok: false, value, error: 'chars' };
  if (length < limits.min) return { ok: false, value, error: 'short' };
  if (length > limits.max) return { ok: false, value, error: 'long' };
  return { ok: true, value };
}

// `raw` checked as a room's name.
export const checkRoomName = (raw) => checkName(raw, ROOM_NAME_LIMITS);

// The longest start of `text` that fits `max` characters, trimmed: a
// default room name built round a long player name still fits.
export function fitName(text, max = ROOM_NAME_LIMITS.max) {
  return [...text].slice(0, max).join('').trim();
}

// Each code character by its lowercase form, so a code reads whatever case
// it is typed in (no case conversion of the text itself: the alphabet says
// what each letter is).
const CODE_CHARS = new Map([...CODE_ALPHABET].flatMap((c) => [[c, c], [c.toLowerCase(), c]]));

// `raw` as a code: spaces and dashes dropped, every letter of the alphabet
// in capitals, anything else kept as it is (so it fails isValidCode).
export function normalizeCode(raw) {
  return [...String(raw ?? '').replace(/[\s-]+/g, '')].map((c) => CODE_CHARS.get(c) ?? c).join('');
}

// Whether `code` (already normalized) is a well-formed room code.
export function isValidCode(code) {
  return typeof code === 'string' && code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

// Whether `mode` is one a room can be created for (CONFIG.online.modes).
export const isOnlineMode = (mode) => CONFIG.online.modes.includes(mode);

// A random session id for this visit (hex), so the room server can tell a
// reconnecting player from a new one. Kept in memory only: never stored.
export function sessionId(random = globalThis.crypto) {
  const bytes = new Uint8Array(12);
  if (random?.getRandomValues) random.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
