// What the room server accepts from a player, checked here whatever the game
// says: names, room names, room codes, modes and visibility. These are the
// same rules as the game's own (js/online/rules.js), written out again so the
// server needs nothing outside this folder; server/test/rules.test.mjs holds
// both copies to the same answers.
//
// A name is 2 to 16 characters once cleaned (a room's name up to 24):
// letters of any language and their marks, digits, spaces and _ - . ' only,
// at least one a letter or a digit; cleaning composes the text (NFC), reads
// a typographic apostrophe as ', collapses white space and trims. A room
// code is 5 characters of CODE_ALPHABET (no 0 / O, 1 / I / L), read in any
// case.

export const NAME_LIMITS = Object.freeze({ min: 2, max: 16 });
export const ROOM_NAME_LIMITS = Object.freeze({ min: 2, max: 24 });
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
export const VISIBILITIES = Object.freeze(['public', 'private']);
// The modes a room may be created for: the game's CONFIG.online.modes.
export const MODES = Object.freeze(['quick-battle']);

const ALLOWED = /^(?:(?![︀-️\u{E0100}-\u{E01EF}])[\p{L}\p{Mn}\p{Mc}\p{Nd} _.'-])+$/u;
const MEANINGFUL = /[\p{L}\p{Nd}]/u;

export function cleanName(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/’/g, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

// `raw` as a name within `limits`: the cleaned name, or null.
export function validName(raw, limits = NAME_LIMITS) {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  const value = cleanName(raw);
  const length = [...value].length;
  if (length < limits.min || length > limits.max) return null;
  if (!ALLOWED.test(value) || !MEANINGFUL.test(value)) return null;
  return value;
}

export const validRoomName = (raw) => validName(raw, ROOM_NAME_LIMITS);

const CODE_CHARS = new Map([...CODE_ALPHABET].flatMap((c) => [[c, c], [c.toLowerCase(), c]]));

// `raw` as a room code in capitals, or null.
export function validCode(raw) {
  if (typeof raw !== 'string' || raw.length > 20) return null;
  const code = [...raw.replace(/[\s-]+/g, '')].map((c) => CODE_CHARS.get(c) ?? c).join('');
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

export const validMode = (mode) => (MODES.includes(mode) ? mode : null);
export const validVisibility = (v) => (VISIBILITIES.includes(v) ? v : null);

// A room id (the server's own: 20 lowercase hex characters) or null.
export const validRoomId = (raw) => (typeof raw === 'string' && /^[0-9a-f]{20}$/.test(raw) ? raw : null);

// A client's session id (hex, made per visit by the game) or null.
export const validSession = (raw) => (typeof raw === 'string' && /^[0-9a-f]{8,64}$/.test(raw) ? raw : null);

// A fighter id as the game names them, or null (the game checks that it is
// a playable fighter; the server only that it is an id).
export const validFighterId = (raw) => (typeof raw === 'string' && /^[\w-]{1,32}$/.test(raw) ? raw : null);

// The game's version string, or null.
export const validVersion = (raw) => (typeof raw === 'string' && /^[\w.+-]{1,32}$/.test(raw) ? raw : null);

// `n` random bytes as hex, from `random` (crypto by default).
export function randomHex(n, random = globalThis.crypto) {
  const bytes = new Uint8Array(n);
  random.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A random room code (unbiased: bytes past the last whole multiple of the
// alphabet's size are drawn again).
export function randomCode(random = globalThis.crypto) {
  const size = CODE_ALPHABET.length;
  const limit = 256 - (256 % size);
  let code = '';
  const byte = new Uint8Array(1);
  while (code.length < CODE_LENGTH) {
    random.getRandomValues(byte);
    if (byte[0] < limit) code += CODE_ALPHABET[byte[0] % size];
  }
  return code;
}
