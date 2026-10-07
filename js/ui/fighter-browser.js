// Fighter browser: Discover's Fighters page. The shared fighter roster
// (js/ui/fighter-roster.js), read-only: the same grid, locked slots and
// animated preview, in the same order, but nothing to confirm, no match to
// start. Activating a fighter only selects and previews it; a locked slot
// stays a non-interactive placeholder, so nothing becomes playable here.
//
// Where a roster shows Available, the browser shows the fighter's one
// difficulty rating (js/data/fighter-profiles.js) as five stars, filled up
// to the rating, under one accessible name ("Difficulty: 3 out of 5
// stars"); the stars themselves are hidden from assistive technology and
// take no focus. At the far right of that row a text button, Play style
// description, asks the host to show the fighter's play-style description
// (`onDescribe(def, profile, button)`; Discover opens it in a modal that
// hands focus back to the button). A fighter without a
// profile (a test-only one, say) shows Not rated and no button; a locked
// slot keeps the roster's Locked status.
//
// Every string is a translation key, and every fighter-specific value comes
// from the fighter's definition and profile: nothing here names a fighter.

import { el } from '../core/utils.js';
import { tx, setText, setAttr, setPlainAttr } from '../localization/i18n.js';
import { isPlayable } from '../data/characters.js';
import { getFighterProfile, DIFFICULTY_MAX } from '../data/fighter-profiles.js';
import { FighterRoster } from './fighter-roster.js';

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

export class FighterBrowser extends FighterRoster {
  constructor(app, { host, previewId = 'discover-preview-name', onDescribe } = {}) {
    super(app, { host, previewId, onConfirm: null });
    this.onDescribe = onDescribe;
    // Each playable slot is named for what this page is about: the fighter
    // and its rating, never "available".
    for (const slot of this.slots) {
      if (isPlayable(slot._def)) this.labelSlot(slot);
    }
    // With no playable fighter at all, a line says so under the preview.
    this.empty = el('p', { class: 'fighter-browser-empty', hidden: true, ...tx('discover.noFighters') });
    this.previewPanel.querySelector('.preview-info').append(this.empty);
  }

  // The preview's head: the rating (or the Locked / Not rated status) at
  // the left of its top row, the play-style button at the far right, the
  // fighter's name under them.
  buildPreviewHead(previewId) {
    this.stars = el('span', { class: 'difficulty-stars', 'aria-hidden': 'true' });
    this.rating = el('span', { class: 'difficulty-rating', role: 'img', hidden: true }, [
      el('span', { class: 'difficulty-rating-label', 'aria-hidden': 'true', ...tx('discover.difficulty') }),
      this.stars,
    ]);
    this.describeBtn = el('button', {
      class: 'text-action play-style-action', type: 'button', 'data-nav': true, hidden: true,
      'aria-haspopup': 'dialog', 'aria-describedby': previewId, ...tx('discover.playStyle'),
    });
    this.describeBtn.addEventListener('click', () => this.describe());
    return el('div', { class: 'preview-head' }, [
      el('div', { class: 'preview-status-row' }, [this.status, this.rating, this.describeBtn]),
      this.name,
    ]);
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

  showStatus(def) {
    const profile = def ? getFighterProfile(def.id) : null;
    this.described = def && profile ? def : null;
    this.describeBtn.hidden = !this.described;
    this.rating.hidden = !this.described;
    this.status.hidden = !!this.described;
    if (this.described) {
      this.renderRating(profile.difficulty);
      return;
    }
    if (def) {
      setText(this.status, 'discover.unrated');
      this.status.className = 'status-badge is-unrated';
    } else {
      super.showStatus(null);
    }
  }

  // Five stars, the first `rating` filled, under one accessible name.
  renderRating(rating) {
    this.rating.dataset.rating = String(rating);
    setAttr(this.rating, 'aria-label', 'discover.difficultyRating', { rating, max: DIFFICULTY_MAX });
    this.stars.replaceChildren(...Array.from({ length: DIFFICULTY_MAX }, (_, i) => {
      const filled = i < rating;
      return el('span', { class: `difficulty-star${filled ? ' is-filled' : ''}`, text: filled ? STAR_FILLED : STAR_EMPTY });
    }));
  }

  labelSlot(slot) {
    const def = slot._def;
    const profile = getFighterProfile(def.id);
    if (profile) setAttr(slot, 'aria-label', 'discover.fighterSlot', { name: def.displayName, rating: profile.difficulty, max: DIFFICULTY_MAX });
    else setPlainAttr(slot, 'aria-label', def.displayName);
  }

  // The previewed fighter, while it has a profile to describe.
  get describedFighter() {
    return this.described ?? null;
  }

  describe() {
    const def = this.describedFighter;
    if (def) this.onDescribe?.(def, getFighterProfile(def.id), this.describeBtn);
  }
}

// The play-style dialog for fighter `def` with `profile`, opened from
// `opener`, as InfoDialog (js/ui/overlays.js) takes it.
export function playStyleDialog(def, profile, opener) {
  return { kicker: 'discover.playStyleTitle', title: def.displayName, body: profile.descriptionKey, opener };
}
