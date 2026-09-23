// SELECT FIGHTER: large roster grid (48 slots) + animated preview panel.
// Only #0001 is selectable; other slots are restrained locked placeholders.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader } from '../ui/components.js';
import { CHARACTERS, getCharacter } from '../data/characters.js';
import { fitCanvas, drawFrameAt } from '../ui/sprite-art.js';

export class CharacterSelectScreen extends Screen {
  constructor(app) {
    super(app, 'character');
    this.slots = [];
    this.focusedSlot = null;
    this.previewIndex = 0;
    this.previewTime = 0;
    this.previewSprites = null;
    this.selectedId = null;

    // ---- Roster ---------------------------------------------------------
    const total = Math.max(CONFIG.roster.totalSlots, CHARACTERS.length);
    const bySlot = new Map(CHARACTERS.map((c) => [c.rosterSlot, c]));
    this.grid = el('div', { class: 'roster-grid', role: 'list', 'aria-label': 'Fighter roster' });
    for (let i = 0; i < total; i++) {
      const def = bySlot.get(i) || null;
      const num = String(i + 1).padStart(2, '0');
      let slot;
      if (def && def.available) {
        const portrait = el('canvas', { class: 'slot-portrait', width: 1, height: 1, 'aria-hidden': 'true' });
        slot = el('button', {
          class: 'slot is-available', type: 'button', 'data-nav': true, 'data-char': def.id,
          'aria-label': `${def.displayName}, available`,
        }, [
          el('span', { class: 'slot-num', text: num }),
          el('span', { class: 'slot-art' }, [portrait]),
          el('span', { class: 'slot-name', text: def.displayName }),
          el('span', { class: 'slot-check', html: ICONS.check }),
        ]);
        slot._portrait = portrait;
      } else {
        slot = el('button', {
          class: 'slot is-locked', type: 'button', 'data-nav': true, 'aria-disabled': 'true',
          'aria-label': `Slot ${num}, locked`,
        }, [
          el('span', { class: 'slot-num', text: num }),
          el('span', { class: 'slot-art', html: ICONS.silhouette }),
          el('span', { class: 'slot-lock', html: ICONS.lock }),
        ]);
      }
      slot._index = i;
      slot._def = def;
      this.slots.push(slot);
      this.grid.append(el('div', { class: 'slot-cell', role: 'listitem' }, [slot]));
      slot.addEventListener('focus', () => this.preview(slot));
      slot.addEventListener('click', (e) => this.activate(slot, e));
    }

    // ---- Preview panel ----------------------------------------------------
    this.previewCanvas = el('canvas', { class: 'preview-canvas', 'aria-hidden': 'true' });
    this.status = el('span', { class: 'status-badge' });
    this.name = el('h2', { class: 'preview-name', id: 'preview-name' });
    this.confirmBtn = el('button', { class: 'btn btn--primary btn--confirm', type: 'button', 'data-nav': true });
    this.confirmBtn.addEventListener('click', () => this.confirm());

    const previewPanel = el('aside', { class: 'char-preview', 'aria-labelledby': 'preview-name', 'aria-live': 'polite' }, [
      el('div', { class: 'preview-stage' }, [this.previewCanvas]),
      el('div', { class: 'preview-info' }, [
        el('div', { class: 'preview-head' }, [this.status, this.name]),
        this.confirmBtn,
      ]),
    ]);

    this.el.replaceChildren(
      screenHeader({ title: 'Select Fighter', kicker: 'Quick Battle', step: 1, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body char-layout' }, [
        el('section', { class: 'roster-panel', 'aria-label': 'Roster' }, [
          el('div', { class: 'panel-head' }, [
            el('span', { class: 'panel-title', text: 'Roster' }),
          ]),
          el('div', { class: 'roster-scroll' }, [this.grid]),
        ]),
        previewPanel,
      ]),
    );
  }

  get defaultSlot() {
    const id = this.app.selection.characterId;
    return this.slots.find((s) => s._def?.id === id) || this.slots.find((s) => s._def?.available) || this.slots[0];
  }

  focusDefault() {
    this.defaultSlot.focus({ preventScroll: true });
  }

  enter() {
    this.select(this.defaultSlot);
    this.preview(this.defaultSlot);
    this.grid.parentElement.scrollTop = 0;
    for (const slot of this.slots) {
      if (!slot._def?.available) continue;
      this.app.loadCharacter(slot._def.id).then((set) => {
        if (!set?.usable) return;
        this.drawPortrait(slot, set);
        if (this.focusedSlot === slot) this.preview(slot);
      });
    }
  }

  drawPortrait(slot, set) {
    const img = set.makePortrait();
    if (!img) return;
    const c = slot._portrait;
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
  }

  select(slot) {
    if (!slot._def?.available) return;
    this.selectedId = slot._def.id;
    for (const s of this.slots) {
      const on = s === slot;
      s.classList.toggle('is-selected', on);
      if (s._def?.available) s.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  activate(slot, e) {
    if (!slot._def?.available) {
      slot.classList.remove('is-denied');
      void slot.offsetWidth;
      slot.classList.add('is-denied');
      return;
    }
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
    if (!def || !def.available) {
      this.el.classList.add('is-locked-preview');
      this.status.textContent = 'Locked';
      this.status.className = 'status-badge is-locked';
      this.name.textContent = `Slot ${num}`;
      this.previewSprites = null;
      this.clearPreview();
      this.updateConfirm();
      return;
    }
    this.el.classList.remove('is-locked-preview');
    this.status.textContent = 'Available';
    this.status.className = 'status-badge is-available';
    this.name.textContent = def.displayName;
    const set = this.app.getSprites(def.id);
    this.previewSprites = set?.usable ? set : null;
    this.previewIndex = 0;
    this.previewTime = 0;
    this.updateConfirm();
    if (!this.previewSprites) this.clearPreview();
  }

  updateConfirm() {
    const def = getCharacter(this.selectedId);
    this.confirmBtn.disabled = !def;
    this.confirmBtn.textContent = def ? `Confirm ${def.displayName}` : 'Select a fighter';
  }

  confirm() {
    const def = getCharacter(this.selectedId);
    if (!def?.available) return;
    this.app.selection.characterId = def.id;
    this.app.screens.go('map');
  }

  clearPreview() {
    const { w, h } = fitCanvas(this.previewCanvas);
    this.previewCanvas.getContext('2d').clearRect(0, 0, w, h);
  }

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
