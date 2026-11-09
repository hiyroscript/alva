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
//   { version: 11,
//     language: 'en' | 'fr' | null,
//     mobileControls: 'screenpad' | 'joystick' | 'classic',
//     mobileControlsChosen: true | false,
//     touchLayouts: { screenpad: { ... }, joystick: { ... }, classic: { ... } },
//     screenPadHintSeen: true | false,
//     automaticTurnAround: true | false,
//     controllerProfiles: { '<fighter id>': { '<action id>': binding, ... }, ... },
//     onlineName: '<name>' | null }
//
// `language` stays null until the player picks one: the game then speaks
// English, but the first-launch chooser still asks (languageChosen), so a
// default is never mistaken for a choice. Mobile Controls follows the same
// rule: `mobileControlsChosen` says whether the stored scheme is one the
// player picked (in Settings) or kept from before (a migration); while it is
// false the scheme read is always today's default, whatever was written
// with it, so a later change of the default reaches everyone who never
// chose. `screenPadHintSeen` is whether the one-time Screen Pad hint
// (js/ui/screen-pad-hint.js) has been shown and dismissed. Each scheme
// keeps its own custom
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
// `onlineName` is the last name the player chose for Online Play
// (js/online/rules.js: 2 to 16 letters, digits, spaces, _ - . '), offered
// again on the name screen next time; null until they choose one. It is
// only ever shown to the players of a room they join, and the name screen
// asks every time. A stored name the rules refuse is dropped (null).
//
// Older objects are migrated: version 1 ({ version: 1, mobileControls })
// keeps its Mobile Controls choice, with no language chosen yet and no
// custom layout; versions 2 and 3 keep their language, Mobile Controls and
// both custom layouts; version 4 keeps all of that and its controller
// profiles; versions 5 to 9 keep everything. Versions 1 to 3 get no
// controller profile. A controller profile saved under version 4 or 5
// predates the named sticks and today's recommended layouts: it is upgraded
// for its fighter (upgradeStoredProfiles, js/data/controller-profiles.js):
// every binding plays as it did, the player's own choices are kept, and the
// bindings that were only the old recommended ones give way to today's
// wherever that conflicts with nothing, so a fighter the player never
// really changed plays with today's layout. No older version had Automatic
// turn-around: every one starts with it on, and the Combat Assist and Combo
// Assist choices versions 3 to 7 stored (both since removed from the game)
// are dropped, never read into anything. No version before 9 had an online
// name: every one starts with none. Mobile Controls' default became
// Joystick in version 10 (it was Classic Buttons): a stored object cannot
// tell a player's own choice from the old default (every save writes every
// setting), so every older version keeps the scheme it played with, its
// stored one, or Classic Buttons where it held none valid (the old
// default); only new or empty storage started on Joystick. Screen Pad became
// the default in version 11 (the Screen Pad update), with
// `mobileControlsChosen` so that the next change of default can tell a
// choice from a default. A version 10 object still cannot (every save wrote
// Joystick, chosen or not), so its stored scheme is kept, never taken away,
// and counted as chosen from now on; it starts on Screen Pad only where it
// held no valid scheme at all. Every older object keeps its scheme as
// before (Classic Buttons where it held none valid), also counted as
// chosen. No version before 11 had the Screen Pad hint: not seen yet.
// Missing, blocked or unreadable
// storage, a stored object of any other version, and every value that is
// not one of its setting's choices fall back to the defaults, value by
// value, so the game always starts with a valid set.

import { TOUCH_CONTROL_IDS, sanitizeTouchLayout, sanitizeTouchLayouts } from './touch-layout.js';
import { sanitizeStoredProfile, sanitizeStoredProfiles, upgradeStoredProfiles } from '../data/controller-profiles.js';
import { getCharacter } from '../data/characters.js';
import { checkName } from '../online/rules.js';

// The interface languages (see js/localization/i18n.js). English is the language in
// use until the player picks one.
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const DEFAULT_LANGUAGE = 'en';

// The touch layouts Quick Battle, Practice Ground and Online Play can use
// (see js/ui/touch-controls.js), in the order Settings lists them. Screen
// Pad is the default for a player who has never chosen, and the fallback
// for an unknown or missing scheme, here and everywhere that reads one; a
// stored choice of any is kept, and so is what a player stored before
// version 11 (see SETTINGS_BEFORE_10_SCHEME and the migrations below).
export const MOBILE_CONTROLS = Object.freeze(['screenpad', 'joystick', 'classic']);
export const DEFAULT_MOBILE_CONTROLS = 'screenpad';
// The default before version 10: what a stored object from before then
// played with where it held no valid scheme of its own.
export const SETTINGS_BEFORE_10_SCHEME = 'classic';

// Automatic turn-around (Home › Settings › Combat) is on for every player
// who has not turned it off, a player whose settings predate it included.
export const DEFAULT_AUTOMATIC_TURN_AROUND = true;

export const SETTINGS_KEY = 'alva.settings';
export const SETTINGS_VERSION = 11;

export const DEFAULT_SETTINGS = Object.freeze({
  language: null,
  mobileControls: DEFAULT_MOBILE_CONTROLS,
  mobileControlsChosen: false,
  touchLayouts: Object.freeze(Object.fromEntries(MOBILE_CONTROLS.map((scheme) => [scheme, Object.freeze({})]))),
  automaticTurnAround: DEFAULT_AUTOMATIC_TURN_AROUND,
  controllerProfiles: Object.freeze({}),
  onlineName: null,
  screenPadHintSeen: false,
});

// The settings that are one choice from a list, and their allowed values.
const CHOICES = Object.freeze({ language: LANGUAGES, mobileControls: MOBILE_CONTROLS });
// The settings that are on or off: a real boolean, nothing else.
// (`mobileControlsChosen` is not one: only choosing a scheme sets it.)
const TOGGLES = Object.freeze(['automaticTurnAround', 'screenPadHintSeen']);

// A stored online name, cleaned, or null when there is none or the rules
// refuse it.
export function readOnlineName(value) {
  if (typeof value !== 'string') return null;
  const checked = checkName(value);
  return checked.ok ? checked.value : null;
}

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

// The Mobile Controls of a stored object of the current version: its
// scheme only if the player chose it (mobileControlsChosen), else today's
// default, as { mobileControls, mobileControlsChosen }.
function readScheme(stored) {
  const chosen = stored.mobileControlsChosen === true && allowed('mobileControls', stored.mobileControls);
  return { mobileControls: chosen ? stored.mobileControls : DEFAULT_MOBILE_CONTROLS, mobileControlsChosen: chosen };
}

// The Mobile Controls of an older version's object, which cannot tell a
// choice from its default: its stored scheme kept (counted as chosen from
// now on, so no later default takes it away), else `fallback` (the scheme it
// played with) counted as chosen too, or, with no fallback, today's default,
// not chosen.
function keptScheme(stored, fallback = null) {
  if (allowed('mobileControls', stored.mobileControls)) return { mobileControls: stored.mobileControls, mobileControlsChosen: true };
  if (fallback) return { mobileControls: fallback, mobileControlsChosen: true };
  return { mobileControls: DEFAULT_MOBILE_CONTROLS, mobileControlsChosen: false };
}

// Every setting from a stored object of the current version, each checked.
// `profiles` reads its controller profiles (an older version's are
// upgraded first); `scheme` reads its Mobile Controls (readScheme; an older
// version's, keptScheme).
function readCurrent(stored, profiles = sanitizeStoredProfiles, scheme = readScheme) {
  return {
    language: resolveSetting('language', stored.language),
    ...scheme(stored),
    touchLayouts: sanitizeTouchLayouts(stored.touchLayouts),
    automaticTurnAround: resolveSetting('automaticTurnAround', stored.automaticTurnAround),
    controllerProfiles: profiles(stored.controllerProfiles),
    onlineName: readOnlineName(stored.onlineName),
    screenPadHintSeen: resolveSetting('screenPadHintSeen', stored.screenPadHintSeen),
  };
}

// What every version before 10 played with where it held no valid scheme.
const before10 = (stored) => keptScheme(stored, SETTINGS_BEFORE_10_SCHEME);

// Controller profiles saved under version 4 or 5, upgraded for the fighter
// each belongs to.
const upgradeProfiles = (raw) => upgradeStoredProfiles(raw, getCharacter);

// An older version's `kept` values read into the current settings, each
// checked (`profiles` reads its controller profiles), with Automatic
// turn-around on: no version before 8 had it, whatever the object may hold
// under that name. Nothing else it held (Combat Assist, Combo Assist) is
// read, and no version before 9 had an online name. Its Mobile Controls are
// kept, Classic Buttons where it held none valid (the default before
// version 10). No version before 11 had the Screen Pad hint.
const migrate = (kept, profiles) => readCurrent({
  ...kept, automaticTurnAround: DEFAULT_AUTOMATIC_TURN_AROUND, onlineName: null, screenPadHintSeen: false,
}, profiles, before10);
// Version 8: everything it had is kept as it is, Automatic turn-around
// included; only the online name is new.
const keep = (stored) => readCurrent({ ...stored, onlineName: null, screenPadHintSeen: false }, undefined, before10);
// Version 9: everything kept as it is. Mobile Controls' default changed
// to Joystick in version 10, and a version 9 object cannot tell the
// player's own Classic Buttons from the old default (every save wrote it),
// so its stored scheme is kept as it is, Classic Buttons where it held none
// valid: nobody who played version 9 finds their controls changed.
const keepScheme = (stored) => readCurrent({ ...stored, screenPadHintSeen: false }, undefined, before10);
// Version 10: everything kept as it is. Screen Pad became the default in
// version 11, and a version 10 object cannot tell the player's own
// Joystick from the default it then was (every save wrote it), so its
// stored scheme is kept, Joystick or Classic Buttons, never taken away;
// only one that held no valid scheme (it never chose) starts on Screen Pad.
const keep10 = (stored) => readCurrent({ ...stored, screenPadHintSeen: false }, undefined, (value) => keptScheme(value));

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
  // Versions 6 and 7 had everything that is kept as it is now but
  // Automatic turn-around: all of it kept. Version 8 had that too.
  6: (stored) => migrate(stored),
  7: (stored) => migrate(stored),
  8: keep,
  9: keepScheme,
  10: keep10,
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
  // (automaticTurnAround, screenPadHintSeen) to `value` and saves; an
  // unknown setting or value is refused (false). Listeners hear about real
  // changes only. Setting Mobile Controls is the player's choice, even of
  // the scheme already in use (mobileControlsChosen; saved, not announced).
  set(name, value) {
    if (!allowed(name, value)) return false;
    if (name === 'mobileControls' && !this.values.mobileControlsChosen) {
      this.values.mobileControlsChosen = true;
      if (this.values[name] === value) {
        this.save();
        return true;
      }
    }
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

  // 'screenpad', 'joystick' or 'classic'.
  get mobileControls() {
    return this.values.mobileControls;
  }

  set mobileControls(value) {
    this.set('mobileControls', value);
  }

  // Whether the player picked their Mobile Controls (or kept them from
  // before version 11), rather than playing with the default.
  get mobileControlsChosen() {
    return this.values.mobileControlsChosen;
  }

  // Whether the one-time Screen Pad hint has been dismissed.
  get screenPadHintSeen() {
    return this.values.screenPadHintSeen;
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

  // The last name chosen for Online Play, or null.
  get onlineName() {
    return this.values.onlineName;
  }

  // Remembers `name` (checked and cleaned by the online name rules) and
  // saves; a name the rules refuse is refused (false). Listeners hear
  // ('onlineName', name) on a real change.
  setOnlineName(name) {
    const value = readOnlineName(name);
    if (value === null) return false;
    if (value === this.values.onlineName) return true;
    this.values.onlineName = value;
    this.save();
    this.emit('onlineName', value);
    return true;
  }
}
