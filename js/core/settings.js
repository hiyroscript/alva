// Player settings, kept on this device between visits.
//
// One small versioned object under one localStorage key, read once at start
// and written whole on every change, so nothing else in the game touches
// storage. Presentation and input configuration only: no setting changes a
// fighter, a stage or the rules of a fight.
//
// Stored as
//
//   { version: 2,
//     language: 'en' | 'fr' | null,
//     mobileControls: 'joystick' | 'classic',
//     touchLayouts: { joystick: { ... }, classic: { ... } } }
//
// `language` stays null until the player picks one: the game then speaks
// English, but the first-launch chooser still asks (languageChosen), so a
// default is never mistaken for a choice. Each scheme keeps its own custom
// touch layout (see js/core/touch-layout.js); an empty one is Alva's
// original layout.
//
// A version 1 object ({ version: 1, mobileControls }) is migrated: its
// Mobile Controls choice is kept, with no language chosen yet and no custom
// layout. Missing, blocked or unreadable storage, a stored object of any
// other version, and every value that is not one of its setting's choices
// fall back to the defaults, value by value, so the game always starts with
// a valid set.

import { TOUCH_CONTROL_IDS, sanitizeTouchLayout, sanitizeTouchLayouts } from './touch-layout.js';

// The interface languages (see js/localization/i18n.js). English is the language in
// use until the player picks one.
export const LANGUAGES = Object.freeze(['en', 'fr']);
export const DEFAULT_LANGUAGE = 'en';

// The touch layouts Quick Battle and Practice Ground can use (see
// js/ui/touch-controls.js). Joystick is the default for a player who has
// never chosen; Classic Buttons is the original Left / C / Right layout.
export const MOBILE_CONTROLS = Object.freeze(['joystick', 'classic']);
export const DEFAULT_MOBILE_CONTROLS = 'joystick';

export const SETTINGS_KEY = 'alva.settings';
export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS = Object.freeze({
  language: null,
  mobileControls: DEFAULT_MOBILE_CONTROLS,
  touchLayouts: Object.freeze(Object.fromEntries(MOBILE_CONTROLS.map((scheme) => [scheme, Object.freeze({})]))),
});

// The settings that are one choice from a list, and their allowed values.
const CHOICES = Object.freeze({ language: LANGUAGES, mobileControls: MOBILE_CONTROLS });

// `value` if it is one of `name`'s choices, else that setting's default.
export function resolveSetting(name, value) {
  return CHOICES[name]?.includes(value) ? value : DEFAULT_SETTINGS[name];
}

// Every setting from a stored object of the current version, each checked.
function readCurrent(stored) {
  return {
    language: resolveSetting('language', stored.language),
    mobileControls: resolveSetting('mobileControls', stored.mobileControls),
    touchLayouts: sanitizeTouchLayouts(stored.touchLayouts),
  };
}

// Older versions, each read into the current settings.
const MIGRATIONS = Object.freeze({
  // Version 1 held Mobile Controls only: kept, and the language still to be
  // chosen, so the chooser shows once after the update.
  1: (stored) => readCurrent({ mobileControls: stored.mobileControls }),
});

// The settings a stored value holds: checked if it is the current version,
// migrated if it is an older one, the defaults otherwise.
export function readSettings(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return readCurrent({});
  if (stored.version === SETTINGS_VERSION) return readCurrent(stored);
  if (Object.hasOwn(MIGRATIONS, stored.version)) return MIGRATIONS[stored.version](stored);
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

  // Sets choice `name` (language or mobileControls) to `value` and saves; an
  // unknown setting or value is refused (false). Listeners hear about real
  // changes only.
  set(name, value) {
    if (!Object.hasOwn(CHOICES, name) || !CHOICES[name].includes(value)) return false;
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
}
