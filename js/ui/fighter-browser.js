// Fighter browser: Discover's Fighters page. The shared fighter roster
// (js/ui/fighter-roster.js), read-only: the same grid, locked slots and
// animated preview, in the same order, but nothing to confirm, no match to
// start. Activating a fighter only selects and previews it; a locked slot
// stays a non-interactive placeholder, so nothing becomes playable here.

import { el } from '../core/utils.js';
import { tx, setAttr, setPlainAttr } from '../localization/i18n.js';
import { isPlayable } from '../data/characters.js';
import { getFighterProfile, DIFFICULTY_MAX } from '../data/fighter-profiles.js';
import { FighterRoster } from './fighter-roster.js';

export class FighterBrowser extends FighterRoster {
  constructor(app, { host, previewId = 'discover-preview-name' } = {}) {
    super(app, { host, previewId, onConfirm: null });
    // Each playable slot is named for what this page is about: the fighter
    // and its rating, never "available".
    for (const slot of this.slots) {
      if (isPlayable(slot._def)) this.labelSlot(slot);
    }
    // With no playable fighter at all, a line says so under the preview.
    this.empty = el('p', { class: 'fighter-browser-empty', hidden: true, ...tx('discover.noFighters') });
    this.previewPanel.querySelector('.preview-info').append(this.empty);
  }

  // No Confirm: this roster starts nothing.
  buildConfirm() {
    return null;
  }

  // In Confirm's place: the empty-roster line, shown only while nothing is
  // playable.
  updateConfirm() {
    if (this.empty) this.empty.hidden = !!this.slotFor(null);
  }

  confirm() {}

  // Selects and previews a playable fighter, by keyboard, gamepad, mouse or
  // touch alike, and does nothing more.
  activate(slot) {
    if (!isPlayable(slot._def)) return;
    this.select(slot);
    if (this.focusedSlot !== slot) this.preview(slot);
  }

  labelSlot(slot) {
    const def = slot._def;
    const profile = getFighterProfile(def.id);
    if (profile) setAttr(slot, 'aria-label', 'discover.fighterSlot', { name: def.displayName, rating: profile.difficulty, max: DIFFICULTY_MAX });
    else setPlainAttr(slot, 'aria-label', def.displayName);
  }
}
