// Adventure's saved progress (the Adventure update), kept on this device
// between visits, apart from the settings.
//
// One small versioned object under its own key in the browser's storage
// (reached through js/core/settings.js browserStorage), read once at
// start and written whole on every change, exactly as the settings are
// (js/core/settings.js): nothing else in the game touches it, and no other
// mode reads it. Stored as
//
//   { version: 1,
//     unlocked: 1..31,              // the highest level open (31: all cleared)
//     cleared: [levels],            // every level won, 1..30
//     perquisites: { braveSoldier: 0..5, nearlyImmortal: 0..5, ... },
//     milestones: { "5": { offer: ["idA", "idB"], picked: "idA" | null }, ... },
//     seed }                        // the run's, for the milestones' draws
//
// A level below `unlocked` is cleared, `unlocked` itself is the next one
// and every level above it is locked. Winning the next level unlocks the
// one after it (recordWin); replaying a cleared one changes nothing but
// the record. A milestone's offer is saved as it is first drawn, so a
// reload in the middle of the choice shows the same two cards; picking one
// raises that Perquisite a level and claims the milestone at once
// (pick), whatever then happens in the battle. Only the level selector's
// reset (reset) clears it all.
//
// Every field is checked on reading: a level outside 1..31 is clamped, a
// cleared level that is not below `unlocked` is dropped and every level
// below it counted as cleared, a Perquisite level is a whole number 0..5,
// a milestone holds two different known Perquisites and a pick of one of
// them or none, and a seed is a 32-bit whole number (else a new one).
// Unknown fields and Perquisites are dropped. A stored object of an
// unknown version, or anything unreadable, is fresh progress. A storage
// that refuses or is missing keeps progress for this visit only and never
// throws.

import { browserStorage } from './settings.js';
import {
  ADVENTURE_LEVELS, PERQUISITE_IDS, PERQUISITE_MAX_LEVEL, PERQUISITE_MILESTONES, isMilestone, isPerquisite,
  perquisiteOffer, adventureModifiers,
} from '../data/adventure.js';

export const ADVENTURE_KEY = 'alva.adventure';
export const ADVENTURE_VERSION = 1;

// The value of `unlocked` once every level is cleared.
export const ALL_CLEARED = ADVENTURE_LEVELS + 1;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A fresh 32-bit seed for a new run.
export function newSeed(random = Math.random) {
  return Math.floor(random() * 0x100000000) >>> 0;
}

// Fresh progress: Level 1 next, nothing cleared, owned or claimed.
export function freshProgress(seed = newSeed()) {
  return {
    unlocked: 1,
    cleared: [],
    perquisites: Object.fromEntries(PERQUISITE_IDS.map((id) => [id, 0])),
    milestones: {},
    seed: seed >>> 0,
  };
}

// The progress a stored object of the current version holds, every field
// checked.
function readCurrent(stored) {
  const out = freshProgress(Number.isInteger(stored.seed) && stored.seed >= 0 && stored.seed <= 0xffffffff ? stored.seed : newSeed());
  out.unlocked = clamp((Number(stored.unlocked) | 0) || 1, 1, ALL_CLEARED);
  const cleared = new Set();
  if (Array.isArray(stored.cleared)) {
    for (const level of stored.cleared) if (Number.isInteger(level) && level >= 1 && level < out.unlocked) cleared.add(level);
  }
  for (let level = 1; level < out.unlocked; level++) cleared.add(level);
  out.cleared = [...cleared].sort((a, b) => a - b);
  const perquisites = stored.perquisites && typeof stored.perquisites === 'object' ? stored.perquisites : {};
  for (const id of PERQUISITE_IDS) {
    const n = perquisites[id];
    out.perquisites[id] = Number.isInteger(n) ? clamp(n, 0, PERQUISITE_MAX_LEVEL) : 0;
  }
  const milestones = stored.milestones && typeof stored.milestones === 'object' && !Array.isArray(stored.milestones) ? stored.milestones : {};
  for (const [key, m] of Object.entries(milestones)) {
    const level = Number(key);
    if (String(level) !== key || !isMilestone(level) || !m || typeof m !== 'object') continue;
    const offer = Array.isArray(m.offer) ? m.offer : [];
    if (offer.length !== 2 || !offer.every(isPerquisite) || offer[0] === offer[1]) continue;
    const picked = offer.includes(m.picked) ? m.picked : null;
    out.milestones[key] = { offer: [...offer], picked };
  }
  return out;
}

// Older versions, each read into the current progress. None yet: version 1
// is the first.
const MIGRATIONS = Object.freeze({});

// The progress a stored value holds: checked if it is the current version,
// migrated if it is an older one, fresh otherwise.
export function readProgress(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return freshProgress();
  if (stored.version === ADVENTURE_VERSION) return readCurrent(stored);
  if (Number.isInteger(stored.version) && Object.hasOwn(MIGRATIONS, stored.version)) return MIGRATIONS[stored.version](stored);
  return freshProgress();
}

export class AdventureProgress {
  // `storage` is anything with getItem / setItem (the browser's by
  // default); null keeps the progress for this visit only.
  constructor(storage = browserStorage()) {
    this.storage = storage;
    this.values = this.load();
  }

  load() {
    let stored = null;
    try {
      const raw = this.storage?.getItem(ADVENTURE_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }
    return readProgress(stored);
  }

  // Writes the whole progress at once; a storage that refuses (full,
  // blocked) only loses it for later visits.
  save() {
    try {
      this.storage?.setItem(ADVENTURE_KEY, JSON.stringify({ version: ADVENTURE_VERSION, ...this.values }));
    } catch {
      // Kept for this visit only.
    }
  }

  // The highest level open (31 once all thirty are cleared).
  get unlocked() {
    return this.values.unlocked;
  }

  // Whether all thirty levels are cleared.
  get complete() {
    return this.values.unlocked >= ALL_CLEARED;
  }

  get seed() {
    return this.values.seed;
  }

  // 'locked', 'cleared' or 'next' (the highest open level).
  state(level) {
    if (level < this.values.unlocked) return 'cleared';
    if (level === this.values.unlocked) return 'next';
    return 'locked';
  }

  // Whether `level` may be played: any level up to the next one.
  isOpen(level) {
    return Number.isInteger(level) && level >= 1 && level <= ADVENTURE_LEVELS && level <= this.values.unlocked;
  }

  // The level the selector focuses: the next one, or Level 30 once every
  // level is cleared.
  get nextLevel() {
    return Math.min(ADVENTURE_LEVELS, this.values.unlocked);
  }

  // Each Perquisite's level, 0 to 5 (a copy).
  get perquisites() {
    return { ...this.values.perquisites };
  }

  perquisiteLevel(id) {
    return this.values.perquisites[id] ?? 0;
  }

  // The Perquisites owned, in the table's order: [{ id, level }].
  get owned() {
    return PERQUISITE_IDS.filter((id) => this.values.perquisites[id] > 0).map((id) => ({ id, level: this.values.perquisites[id] }));
  }

  // Whether milestone `level`'s Perquisite has been picked.
  claimed(level) {
    return !!this.values.milestones[String(level)]?.picked;
  }

  // Whether starting `level` first shows the Perquisite cards: a milestone
  // not picked yet.
  needsPick(level) {
    return isMilestone(level) && !this.claimed(level);
  }

  // The two Perquisites milestone `level` offers: the pair already drawn
  // and saved for it, else a fresh draw from the run's seed, saved at once
  // so a reload shows the same two cards.
  offer(level) {
    const key = String(level);
    const saved = this.values.milestones[key];
    if (saved) return [...saved.offer];
    const offer = perquisiteOffer(this.values.perquisites, this.values.seed, level);
    if (offer.length === 2) {
      this.values.milestones[key] = { offer: [...offer], picked: null };
      this.save();
    }
    return offer;
  }

  // The player picks `id` of milestone `level`'s offer: that Perquisite a
  // level up and the milestone claimed, saved at once. False (nothing
  // changes) for a milestone already claimed or a Perquisite not offered.
  pick(level, id) {
    if (!isMilestone(level) || this.claimed(level)) return false;
    const offer = this.offer(level);
    if (!offer.includes(id)) return false;
    this.values.perquisites[id] = Math.min(PERQUISITE_MAX_LEVEL, (this.values.perquisites[id] ?? 0) + 1);
    this.values.milestones[String(level)] = { offer, picked: id };
    this.save();
    return true;
  }

  // A win on `level`: cleared, and if it was the next level the one after
  // it is unlocked; saved at once. { unlocked: whether a level opened,
  // complete: whether this cleared the last level for the first time }.
  recordWin(level) {
    if (!this.isOpen(level)) return { unlocked: false, complete: false };
    const v = this.values;
    if (!v.cleared.includes(level)) v.cleared = [...v.cleared, level].sort((a, b) => a - b);
    let unlocked = false;
    let complete = false;
    if (level === v.unlocked) {
      v.unlocked = Math.min(ALL_CLEARED, level + 1);
      unlocked = v.unlocked <= ADVENTURE_LEVELS;
      complete = v.unlocked === ALL_CLEARED;
    }
    this.save();
    return { unlocked, complete };
  }

  // Whether there is anything for the reset to clear.
  get hasProgress() {
    const v = this.values;
    return v.unlocked > 1 || v.cleared.length > 0 || Object.values(v.perquisites).some((n) => n > 0) || Object.keys(v.milestones).length > 0;
  }

  // Back to fresh progress (a new run, a new seed), saved at once.
  reset() {
    this.values = freshProgress();
    this.save();
  }

  // The modifiers an Adventure battle hands its sides, at any level: the
  // player's from their Perquisites, the CPU's the identity's (Venture
  // never scales a hit: js/data/adventure.js).
  modifiersFor() {
    return adventureModifiers(this.values.perquisites);
  }

  // Every milestone, in order, with whether it is claimed (the selector's
  // card marks).
  get milestones() {
    return PERQUISITE_MILESTONES.map((level) => ({ level, claimed: this.claimed(level) }));
  }
}
