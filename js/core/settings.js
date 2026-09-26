// Player settings, kept on this device between visits.
//
// One small versioned object under one localStorage key, read once at start
// and written whole on every change, so nothing else in the game touches
// storage. Presentation and input configuration only: no setting changes a
// fighter, a stage or the rules of a fight.
//
// Stored as { version: 1, mobileControls: 'joystick' | 'classic' }. Missing,
// blocked or unreadable storage, a stored object of another version, or a
// value that is not one of a setting's choices all fall back to the
// defaults, so the game always starts with a valid set.

// The touch layouts Quick Battle and Practice Ground can use (see
// js/game/touch-controls.js). Joystick is the default for a player who has
// never chosen; Classic Buttons is the original Left / C / Right layout.
export const MOBILE_CONTROLS = Object.freeze(['joystick', 'classic']);
export const MOBILE_CONTROLS_LABELS = Object.freeze({ joystick: 'Joystick', classic: 'Classic Buttons' });
export const DEFAULT_MOBILE_CONTROLS = 'joystick';

export const SETTINGS_KEY = 'alva.settings';
export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({ mobileControls: DEFAULT_MOBILE_CONTROLS });

// Each setting's allowed values.
const CHOICES = Object.freeze({ mobileControls: MOBILE_CONTROLS });

// `value` if it is one of `name`'s choices, else that setting's default.
export function resolveSetting(name, value) {
  return CHOICES[name]?.includes(value) ? value : DEFAULT_SETTINGS[name];
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

  // The stored settings, every one checked against its choices.
  load() {
    let stored = null;
    try {
      const raw = this.storage?.getItem(SETTINGS_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }
    const current = stored && typeof stored === 'object' && stored.version === SETTINGS_VERSION ? stored : {};
    return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((name) => [name, resolveSetting(name, current[name])]));
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

  get(name) {
    return this.values[name];
  }

  // Sets `name` to `value` (an unknown value is refused: false) and saves.
  // Listeners hear about real changes only.
  set(name, value) {
    if (!(name in DEFAULT_SETTINGS) || !CHOICES[name].includes(value)) return false;
    if (this.values[name] === value) return true;
    this.values[name] = value;
    this.save();
    for (const fn of this.listeners) fn(name, value);
    return true;
  }

  // Calls `fn(name, value)` after every change; returns an unsubscribe.
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // 'joystick' or 'classic'.
  get mobileControls() {
    return this.values.mobileControls;
  }

  set mobileControls(value) {
    this.set('mobileControls', value);
  }
}
