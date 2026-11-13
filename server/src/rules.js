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

// The version rule: Online play is for the current release only. Its
// version is CURRENT_VERSION (wrangler.toml: package.json's, set by each
// release), and a game of any other version is refused as `outdated` ("A
// new version of Alva is out"), wherever it runs (itch.io's page and the
// native apps alike). The game's modules run from the repository play as
// DEV_VERSION, let in only from a computer's own address (LOCAL_ORIGIN:
// http://localhost or http://127.0.0.1, any port), so testing on one's own
// computer still plays while no real site can claim it. With no
// CURRENT_VERSION at all, only 'dev' from there plays.
export const DEV_VERSION = 'dev';
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/i;
export const localOrigin = (origin) => typeof origin === 'string' && LOCAL_ORIGIN.test(origin);
export const currentVersion = (env) => validVersion(String(env?.CURRENT_VERSION ?? '').trim());

// Whether a game of `version`, from `origin` (its page's Origin), may play.
export function versionAllowed(version, env, origin) {
  if (version === DEV_VERSION) return localOrigin(origin);
  const current = currentVersion(env);
  return !!current && version === current;
}

// Whether a room of `version` (its host's) still plays: the current
// version's, or 'dev' (made only from a computer's own address). A room of
// an older version closes as `outdated` when a player connects or asks for
// the relay, as a release replaces it.
export const roomVersionCurrent = (version, env) => version === DEV_VERSION || (!!currentVersion(env) && version === currentVersion(env));

// A match's input delay, in steps, as the host's browser chose it
// (js/online/delay.js; the game's CONFIG.online.inputDelayRange, again).
export const DELAY_RANGE = Object.freeze({ min: 3, max: 12 });
export const validDelay = (raw) => (Number.isInteger(raw) && raw >= DELAY_RANGE.min && raw <= DELAY_RANGE.max ? raw : null);

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
