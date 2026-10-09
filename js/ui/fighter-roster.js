// Fighter roster: the large roster grid (CONFIG.roster.totalSlots slots) and
// its animated preview panel, shared by the Select Fighter screen and
// Practice Ground's Change Fighter and CPU dialogs. Playable (available)
// fighters are selectable buttons; every other slot, a disabled fighter's
// included, is a non-interactive locked placeholder that stays out of
// hover, Tab and spatial navigation and never loads a preview. With no
// playable fighter nothing is selected and Confirm stays disabled.
//
// The host places `rosterPanel` and `previewPanel`, calls show() when they
// appear, drives update(dt) while they are visible and decides what
// confirming a fighter means (`onConfirm(def)`). Preview element ids come
// from `previewId`, so several rosters can share the page.
//
// Discover's Fighters page browses the same roster read-only
// (js/ui/fighter-browser.js, a subclass): it overrides the hooks marked
// below (confirmation and what activating a slot does) and has no Confirm.
// Every roster shares the previewed fighter's difficulty and play-style
// action, with Locked / Not rated fallbacks; selection rosters keep Confirm.

import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { tx, tattr, setText, setAttr } from '../localization/i18n.js';
import { ICONS } from './icons.js';
import { CHARACTERS, isPlayable, getPlayableCharacter } from '../data/characters.js';
import { getFighterProfile, DIFFICULTY_MAX } from '../data/fighter-profiles.js';
import { fitCanvas, drawFrameAt, paintPortrait } from './sprite-art.js';

const STAR_FILLED = '★';
const STAR_EMPTY = '☆';

export class FighterRoster {
  // `host` carries the is-locked-preview state while a locked slot is shown.
  constructor(app, { host, previewId = 'preview-name', onConfirm }) {
    this.app = app;
    this.host = host;
    this.onConfirm = onConfirm;
    this.slots = [];
    this.focusedSlot = null;
    this.previewIndex = 0;
    this.previewTime = 0;
    this.previewSprites = null;
    this.selectedId = null;

    // ---- Roster ---------------------------------------------------------
    const total = Math.max(CONFIG.roster.totalSlots, CHARACTERS.length);
    const bySlot = new Map(CHARACTERS.map((c) => [c.rosterSlot, c]));
    this.grid = el('div', { class: 'roster-grid', role: 'list', ...tattr('aria-label', 'roster.grid') });
    for (let i = 0; i < total; i++) {
      const def = bySlot.get(i) || null;
      const num = String(i + 1).padStart(2, '0');
      let slot;
      if (isPlayable(def)) {
        const portrait = el('canvas', { class: 'slot-portrait', width: 1, height: 1, 'aria-hidden': 'true' });
        slot = el('button', {
          class: 'slot is-available', type: 'button', 'data-nav': true, 'data-char': def.id,
          ...tattr('aria-label', 'roster.available', { name: def.displayName }),
        }, [
          el('span', { class: 'slot-num', text: num }),
          el('span', { class: 'slot-art' }, [portrait]),
          el('span', { class: 'slot-name', text: def.displayName }),
          el('span', { class: 'slot-check', html: ICONS.check }),
        ]);
        slot._portrait = portrait;
        slot.addEventListener('focus', () => this.preview(slot));
        slot.addEventListener('click', (e) => this.activate(slot, e));
      } else {
        // Plain element without data-nav: never focused, hovered into or tabbed to.
        slot = el('div', { class: 'slot is-locked', role: 'img', ...tattr('aria-label', 'roster.locked', { num }) }, [
          el('span', { class: 'slot-num', text: num }),
          el('span', { class: 'slot-art', html: ICONS.silhouette }),
          el('span', { class: 'slot-lock', html: ICONS.lock }),
        ]);
      }
      slot._index = i;
      slot._def = def;
      this.slots.push(slot);
      this.grid.append(el('div', { class: 'slot-cell', role: 'listitem' }, [slot]));
    }
    this.scroller = el('div', { class: 'roster-scroll' }, [this.grid]);
    this.rosterPanel = el('section', { class: 'roster-panel', ...tattr('aria-label', 'roster.panel') }, [
      el('div', { class: 'panel-head' }, [
        el('span', { class: 'panel-title', ...tx('roster.panel') }),
      ]),
      this.scroller,
    ]);

    // ---- Preview panel ----------------------------------------------------
    this.previewCanvas = el('canvas', { class: 'preview-canvas', 'aria-hidden': 'true' });
    this.status = el('span', { class: 'status-badge' });
    this.name = el('h2', { class: 'preview-name', id: previewId });
    this.confirmBtn = this.buildConfirm();

    this.previewPanel = el('aside', { class: 'char-preview', 'aria-labelledby': previewId, 'aria-live': 'polite' }, [
      el('div', { class: 'preview-stage' }, [this.previewCanvas]),
      el('div', { class: `preview-info${this.confirmBtn ? '' : ' preview-info--no-confirm'}` }, [this.buildPreviewHead(previewId), this.describeBtn, this.confirmBtn]),
    ]);
  }

  // Shared profile head; the action occupies its own row above Confirm.
  buildPreviewHead(previewId) {
    this.stars = el('span', { class: 'difficulty-stars', 'aria-hidden': 'true' });
    this.rating = el('span', { class: 'difficulty-rating', role: 'img', hidden: true }, [
      this.stars,
    ]);
    this.describeBtn = el('button', {
      class: 'text-action play-style-action', type: 'button', 'data-nav': true, hidden: true,
      'aria-haspopup': 'dialog', 'aria-describedby': previewId, ...tx('discover.playStyle'),
    });
    this.describeBtn.addEventListener('click', () => this.describe());
    return el('div', { class: 'preview-head' }, [
      el('div', { class: 'preview-status-row' }, [this.status, this.rating]),
      this.name,
    ]);
  }

  // Hook: the Confirm button under the preview (null for none).
  buildConfirm() {
    const button = el('button', { class: 'btn btn--primary btn--confirm', type: 'button', 'data-nav': true });
    button.addEventListener('click', () => this.confirm());
    return button;
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
    this.stars.replaceChildren();
    delete this.rating.dataset.rating;
    this.rating.removeAttribute('aria-label');
    this.rating.removeAttribute('data-i18n-aria-label');
    this.rating.removeAttribute('data-i18n-aria-label-params');
    if (def) {
      setText(this.status, 'discover.unrated');
      this.status.className = 'status-badge is-unrated';
    } else {
      setText(this.status, 'roster.statusLocked');
      this.status.className = 'status-badge is-locked';
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

  // Describe the preview, independently of the selected fighter.
  get describedFighter() {
    return this.described ?? null;
  }

  describe() {
    const def = this.describedFighter;
    const profile = isPlayable(def) ? getFighterProfile(def.id) : null;
    if (profile) this.app.infoDialog?.open({
      kicker: 'discover.playStyleTitle', title: def.displayName,
      body: profile.descriptionKey, opener: this.describeBtn,
    });
  }

  // The slot of playable fighter `id`, else the first playable one's, else
  // null: a locked slot (a disabled fighter's too) is never chosen.
  slotFor(id) {
    return this.slots.find((s) => isPlayable(s._def) && s._def.id === id) ||
      this.slots.find((s) => isPlayable(s._def)) || null;
  }

  // Selects and previews `id`'s slot (see slotFor), scrolls the roster back
  // to the top and draws the playable fighters' portraits as they load.
  // Returns that slot, for the host to focus, or null when no fighter is
  // playable: then nothing is selected and the first slot's locked preview
  // shows.
  show(id) {
    const slot = this.slotFor(id);
    if (slot) this.select(slot);
    else this.clearSelection();
    this.preview(slot ?? this.slots[0]);
    this.scroller.scrollTop = 0;
    for (const s of this.slots) {
      if (!isPlayable(s._def)) continue;
      this.app.loadCharacter(s._def.id).then((set) => {
        if (!set?.usable) return;
        this.drawPortrait(s, set);
        if (this.focusedSlot === s) this.preview(s);
      });
    }
    return slot;
  }

  // Focuses the selected fighter's slot (e.g. when returning to the roster).
  // False when there is no playable slot to focus: the host focuses its own
  // control instead.
  focusSelected() {
    const slot = this.slotFor(this.selectedId);
    if (!slot) return false;
    slot.focus({ preventScroll: true });
    slot.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return true;
  }

  drawPortrait(slot, set) {
    paintPortrait(slot._portrait, set);
  }

  select(slot) {
    if (!isPlayable(slot?._def)) return;
    this.selectedId = slot._def.id;
    for (const s of this.slots) {
      const on = s === slot;
      s.classList.toggle('is-selected', on);
      if (isPlayable(s._def)) s.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // No fighter selected: nothing marked, Confirm disabled.
  clearSelection() {
    this.selectedId = null;
    for (const s of this.slots) {
      s.classList.toggle('is-selected', false);
      if (isPlayable(s._def)) s.setAttribute('aria-pressed', 'false');
    }
    this.updateConfirm();
  }

  // Hook: a slot pressed, clicked or confirmed.
  activate(slot, e) {
    if (!isPlayable(slot._def)) return;
    // Keyboard/gamepad activation confirms immediately; pointer selects first
    // and confirms on a second press.
    const wasSelected = this.selectedId === slot._def.id;
    this.select(slot);
    if (e.detail === 0 || wasSelected) this.confirm();
    else this.confirmBtn.focus({ preventScroll: true });
  }

  preview(slot) {
    this.focusedSlot = slot;
    const def = slot._def;
    const num = String(slot._index + 1).padStart(2, '0');
    if (!isPlayable(def)) {
      this.host?.classList.add('is-locked-preview');
      this.showStatus(null);
      setText(this.name, 'roster.slot', { num });
      this.previewSprites = null;
      this.clearPreview();
      this.updateConfirm();
      return;
    }
    this.host?.classList.remove('is-locked-preview');
    this.showStatus(def);
    this.name.textContent = def.displayName;
    this.name.setAttribute('data-i18n', '');
    const set = this.app.getSprites(def.id);
    this.previewSprites = set?.usable ? set : null;
    this.previewIndex = 0;
    this.previewTime = 0;
    this.updateConfirm();
    if (!this.previewSprites) this.clearPreview();
  }

  // Confirm is enabled only for a playable selection; with no playable
  // fighter at all it says so.
  updateConfirm() {
    const def = getPlayableCharacter(this.selectedId);
    this.confirmBtn.disabled = !def;
    setText(this.confirmBtn, def ? 'roster.confirm' : this.slotFor(null) ? 'roster.none' : 'common.noFighters');
  }

  confirm() {
    const def = getPlayableCharacter(this.selectedId);
    if (!def) return;
    this.onConfirm(def);
  }

  clearPreview() {
    const { w, h } = fitCanvas(this.previewCanvas);
    this.previewCanvas.getContext('2d').clearRect(0, 0, w, h);
  }

  // Advances and draws the idle preview of the previewed fighter.
  update(dt) {
    const set = this.previewSprites;
    if (!set) return;
    const anim = set.animations.idle;
    this.previewTime += dt;
    const step = 1 / anim.fps;
    while (this.previewTime >= step) {
      this.previewTime -= step;
      this.previewIndex = (this.previewIndex + 1) % anim.frames.length;
    }
    const frame = anim.frames[this.previewIndex % anim.frames.length];
    const { w, h } = fitCanvas(this.previewCanvas);
    const ctx = this.previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    // Integer scale from the reference height keeps normalized frames consistent.
    const n = Math.max(1, Math.floor((h * 0.84) / set.refArtHeight));
    drawFrameAt(ctx, frame, w / 2, Math.round(h * 0.94), n, false);
  }
}
