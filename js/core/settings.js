// Player settings, kept on this device between visits.
//
// One small versioned object under one localStorage key, read once at start
// and written whole on every change, so nothing else in the game touches
// storage. Presentation, input configuration and the human player's own
// Automatic turn-around only: no setting changes a fighter, a stage, a CPU
// or the rules of a fight.
//
// Stored as
//
//   { version: 8,
//     language: 'en' | 'fr' | null,
//     mobileControls: 'joystick' | 'classic',
//     touchLayouts: { joystick: { ... }, classic: { ... } },
//     automaticTurnAround: true | false,
//     controllerProfiles: { '<fighter id>': { '<action id>': binding, ... }, ... } }
//
// `language` stays null until the player picks one: the game then speaks
// English, but the first-launch chooser still asks (languageChosen), so a
// default is never mistaken for a choice. Each scheme keeps its own custom
// touch layout (see js/core/touch-layout.js); an empty one is Alva's
// original layout. `automaticTurnAround` is whether the human player's
// fighter faces the closest enemy by itself (see Fighter.turnAroundFacing
// in js/game/fighters/fighter.js): on unless the player turns it off, and
// then its facing follows its own movement, as it always used to.
//
// `controllerProfiles` holds the player's own controller layout for each
// fighter they customized (Settings › Controls › Controller controls), keyed
// by the fighter's stable id, never a roster slot or a name: every action's
// binding by action id (js/data/controller-profiles.js), each directional
// one naming its stick. A fighter with none plays with its recommended
// layout, and an action a profile has no binding for plays with its
// recommended one. Each is checked entry by entry: a malformed binding is
// dropped (that action falls back to its recommended binding), never the
// profile or the rest of the settings.
//
// Older objects are migrated: version 1 ({ version: 1, mobileControls })
// keeps its Mobile Controls choice, with no language chosen yet and no
// custom layout; versions 2 and 3 keep their language, Mobile Controls and
// both custom layouts; version 4 keeps all of that and its controller
// profiles; versions 5 to 7 keep everything. Versions 1 to 3 get no
// controller profile. A controller profile saved under version 4 or 5
// predates the named sticks and today's recommended layouts: it is upgraded
// for its fighter (upgradeStoredProfiles, js/data/controller-profiles.js):
// every binding plays as it did, the player's own choices are kept, and the
// bindings that were only the old recommended ones give way to today's
// wherever that conflicts with nothing, so a fighter the player never
// really changed plays with today's layout. No older version had Automatic
// turn-around: every one starts with it on, and the Combat Assist and Combo
// Assist choices versions 3 to 7 stored (both since removed from the game)
// are dropped, never read into anything. Missing, blocked or unreadable
// storage, a stored object of any other version, and every value that is
// not one of its setting's choices fall back to the defaults, value by
// value, so the game always starts with a valid set.

import { TOUCH_CONTROL_IDS, sanitizeTouchLayout, sanitizeTouchLayouts } from './touch-layout.js';
import { sanitizeStoredProfile, sanitizeStoredProfiles, upgradeStoredProfiles } from '../data/controller-profiles.js';
import { getCharacter } from '../data/characters.js';

// The interface languages (see js/localization/i18n.js). English is the language in
// use until the player picks one.
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const DEFAULT_LANGUAGE = 'en';

// The touch layouts Quick Battle and Practice Ground can use (see
// js/ui/touch-controls.js). Joystick is the default for a player who has
// never chosen; Classic Buttons is the original Left / C / Right layout.
export const MOBILE_CONTROLS = Object.freeze(['joystick', 'classic']);
export const DEFAULT_MOBILE_CONTROLS = 'joystick';

// Automatic turn-around (Home › Settings › Combat) is on for every player
// who has not turned it off, a player whose settings predate it included.
export const DEFAULT_AUTOMATIC_TURN_AROUND = true;

export const SETTINGS_KEY = 'alva.settings';
export const SETTINGS_VERSION = 8;

export const DEFAULT_SETTINGS = Object.freeze({
  language: null,
  mobileControls: DEFAULT_MOBILE_CONTROLS,
  touchLayouts: Object.freeze(Object.fromEntries(MOBILE_CONTROLS.map((scheme) => [scheme, Object.freeze({})]))),
  automaticTurnAround: DEFAULT_AUTOMATIC_TURN_AROUND,
  controllerProfiles: Object.freeze({}),
});

// The settings that are one choice from a list, and their allowed values.
const CHOICES = Object.freeze({ language: LANGUAGES, mobileControls: MOBILE_CONTROLS });
// The settings that are on or off: a real boolean, nothing else.
const TOGGLES = Object.freeze(['automaticTurnAround']);

// Whether `value` is one `name` may take: one of a choice's values, or a
// boolean for a toggle.
function allowed(name, value) {
  if (TOGGLES.includes(name)) return typeof value === 'boolean';
  return !!CHOICES[name]?.includes(value);
}

// `value` if `name` may take it, else that setting's default.
export function resolveSetting(name, value) {
  return allowed(name, value) ? value : DEFAULT_SETTINGS[name];
}

// Every setting from a stored object of the current version, each checked.
// `profiles` reads its controller profiles (an older version's are
// upgraded first).
function readCurrent(stored, profiles = sanitizeStoredProfiles) {
  return {
    language: resolveSetting('language', stored.language),
    mobileControls: resolveSetting('mobileControls', stored.mobileControls),
    touchLayouts: sanitizeTouchLayouts(stored.touchLayouts),
    automaticTurnAround: resolveSetting('automaticTurnAround', stored.automaticTurnAround),
    controllerProfiles: profiles(stored.controllerProfiles),
  };
}

// Controller profiles saved under version 4 or 5, upgraded for the fighter
// each belongs to.
const upgradeProfiles = (raw) => upgradeStoredProfiles(raw, getCharacter);

// An older version's `kept` values read into the current settings, each
// checked (`profiles` reads its controller profiles), with Automatic
// turn-around on: no older version had it, whatever the object may hold
// under that name. Nothing else it held (Combat Assist, Combo Assist) is
// read.
const migrate = (kept, profiles) => readCurrent({ ...kept, automaticTurnAround: DEFAULT_AUTOMATIC_TURN_AROUND }, profiles);

// Older versions, each read into the current settings.
const MIGRATIONS = Object.freeze({
  // Version 1 held Mobile Controls only: kept, and the language still to be
  // chosen, so the chooser shows once after the update.
  1: (stored) => migrate({ mobileControls: stored.mobileControls }),
  // Version 2 had the language, Mobile Controls and both custom layouts,
  // and version 3 Combat Assist besides: those three kept, no fighter
  // customized yet.
  2: (stored) => migrate({ language: stored.language, mobileControls: stored.mobileControls, touchLayouts: stored.touchLayouts }),
  3: (stored) => migrate({ language: stored.language, mobileControls: stored.mobileControls, touchLayouts: stored.touchLayouts }),
  // Version 4 also had controller profiles: kept too, every fighter's
  // layout upgraded.
  4: (stored) => migrate({
    language: stored.language, mobileControls: stored.mobileControls, touchLayouts: stored.touchLayouts,
    controllerProfiles: stored.controllerProfiles,
  }, upgradeProfiles),
  // Version 5 had everything that is kept, its controller profiles in the
  // shape they had before the sticks were named: all of it kept, every
  // fighter's layout upgraded.
  5: (stored) => migrate(stored, upgradeProfiles),
  // Versions 6 and 7 had everything that is kept as it is now: all of it
  // kept.
  6: (stored) => migrate(stored),
  7: (stored) => migrate(stored),
});

// The settings a stored value holds: checked if it is the current version,
// migrated if it is an older one, the defaults otherwise.
export function readSettings(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return readCurrent({});
  if (stored.version === SETTINGS_VERSION) return readCurrent(stored);
  // A real version number only: '3' is no version at all.
  if (Number.isInteger(stored.version) && Object.hasOwn(MIGRATIONS, stored.version)) return MIGRATIONS[stored.version](stored);
  return readCurrent({});
}

// The browser's localStorage, or null where there is none or reading it
// throws (some privacy modes block it outright).
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class Settings {
  // `storage` is anything with getItem / setItem (localStorage by default);
  // null keeps the settings for this visit only.
  constructor(storage = browserStorage()) {
    this.storage = storage;
    this.listeners = new Set();
    this.values = this.load();
  }

  // The stored settings, every one checked (and an older version migrated).
  load() {
    let stored = null;
    try {
      const raw = this.storage?.getItem(SETTINGS_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }
    return readSettings(stored);
  }

  // Writes every setting at once; a storage that refuses (full, blocked)
  // only loses the choice for later visits.
  save() {
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...this.values }));
    } catch {
      // Kept for this visit only.
    }
  }

  // Tells every listener about a real change, then nothing else.
  emit(name, value) {
    for (const fn of [...this.listeners]) fn(name, value);
  }

  get(name) {
    return this.values[name];
  }

  // Sets choice `name` (language or mobileControls) or toggle
  // (automaticTurnAround) to `value` and saves; an unknown setting or value
  // is refused (false). Listeners hear about real changes only.
  set(name, value) {
    if (!allowed(name, value)) return false;
    if (this.values[name] === value) return true;
    this.values[name] = value;
    this.save();
    this.emit(name, value);
    return true;
  }

  // Calls `fn(name, value)` after every change; returns an unsubscribe.
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // 'en' or 'fr': the player's language, English until one is chosen.
  get language() {
    return this.values.language ?? DEFAULT_LANGUAGE;
  }

  set language(value) {
    this.set('language', value);
  }

  // Whether the player has picked a language yet (the first-launch chooser
  // asks until they have).
  get languageChosen() {
    return this.values.language !== null;
  }

  // 'joystick' or 'classic'.
  get mobileControls() {
    return this.values.mobileControls;
  }

  set mobileControls(value) {
    this.set('mobileControls', value);
  }

  // Whether the human player's Automatic turn-around is on (see the top of
  // this file). Only a boolean is taken.
  get automaticTurnAround() {
    return this.values.automaticTurnAround;
  }

  set automaticTurnAround(value) {
    this.set('automaticTurnAround', value);
  }

  // A copy of `scheme`'s custom touch layout ({} for the original one).
  touchLayout(scheme) {
    return sanitizeTouchLayout(scheme, this.values.touchLayouts[scheme]);
  }

  // Replaces `scheme`'s custom layout with `layout` (checked first) and
  // saves; the other scheme's is untouched. An unknown scheme is refused
  // (false). Listeners hear ('touchLayouts', { scheme, layout }) on a real
  // change.
  setTouchLayout(scheme, layout) {
    if (!Object.hasOwn(TOUCH_CONTROL_IDS, scheme)) return false;
    const next = sanitizeTouchLayout(scheme, layout);
    if (JSON.stringify(next) === JSON.stringify(this.values.touchLayouts[scheme])) return true;
    this.values.touchLayouts = { ...this.values.touchLayouts, [scheme]: next };
    this.save();
    this.emit('touchLayouts', { scheme, layout: sanitizeTouchLayout(scheme, next) });
    return true;
  }

  // Puts `scheme` back on Alva's original layout.
  resetTouchLayout(scheme) {
    return this.setTouchLayout(scheme, {});
  }

  // A copy of fighter `id`'s saved controller layout (every action's
  // binding by action id), or null when it plays with its recommended one.
  controllerProfile(id) {
    const profile = this.values.controllerProfiles[id];
    return profile ? sanitizeStoredProfile(profile) : null;
  }

  // Saves `profile` (bindings by action id, checked first) as fighter
  // `id`'s controller layout; every other fighter's is untouched. An empty
  // profile (or null) is the recommended layout again. A malformed id is
  // refused (false). Listeners hear ('controllerProfiles', { id, profile })
  // on a real change.
  setControllerProfile(id, profile) {
    if (typeof id !== 'string' || !/^[\w-]{1,32}$/.test(id)) return false;
    const next = sanitizeStoredProfile(profile);
    const empty = Object.keys(next).length === 0;
    const current = this.values.controllerProfiles[id] ?? null;
    if (empty ? current === null : JSON.stringify(next) === JSON.stringify(current)) return true;
    const profiles = { ...this.values.controllerProfiles };
    if (empty) delete profiles[id];
    else profiles[id] = next;
    this.values.controllerProfiles = profiles;
    this.save();
    this.emit('controllerProfiles', { id, profile: empty ? null : sanitizeStoredProfile(next) });
    return true;
  }

  // Puts fighter `id` back on its recommended controller layout.
  resetControllerProfile(id) {
    return this.setControllerProfile(id, null);
  }
}
