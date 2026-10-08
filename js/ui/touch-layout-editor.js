// TOUCH LAYOUT EDITOR: the second layer of Settings, opened by Settings ›
// Controls › Customize touch controls. Over a stand-in of the battle screen
// it shows the scheme in use (Joystick or Classic Buttons) with its real
// touch controls, drawn exactly as in battle and placed by the same code
// (a TouchControls instance that is never enabled, so nothing it does
// reaches gameplay), and lets the player move and resize every one of them:
//
//   drag      a control moves it, kept whole on the screen;
//   select    a control (tap, click, or Enter / A on it) shows it selected;
//             Smaller / Larger and the size slider then resize it (70% to
//             180%), its hit area with it;
//   keys      Enter / A on a focused control starts moving it: the arrows
//             or D-pad nudge it in small steps until Enter / A or Esc /
//             Back again; ← / → on the focused slider resize;
//   Reset to defaults puts this scheme back exactly on Alva's layout;
//   Done (or Esc / Back) returns to Settings.
//
// Every change is saved at once, as it lands (a drag when it ends, each
// nudge, each size step, a reset), as that scheme's own custom layout in
// app.settings (js/core/settings.js); the other scheme's layout is never
// touched. Positions are stored as fractions of the touch-control area and
// sizes as scales (js/core/touch-layout.js), never raw pixels, so a layout
// follows the screen it is played on.

import { el } from '../core/utils.js';
import { t, tx, tattr, iconLabel, setText, localizeTree } from '../localization/i18n.js';
import { resolveSetting } from '../core/settings.js';
import {
  TOUCH_CONTROL_IDS, TOUCH_SCALE, TOUCH_NUDGE, clampScale, normalizePoint, placeControl,
} from '../core/touch-layout.js';
import { TouchControls } from './touch-controls.js';
import { getPlayableCharacter } from '../data/characters.js';
import { ICONS } from './icons.js';

// Arrow command -> unit step.
const STEP = Object.freeze({ left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] });
// How far (px) a press travels before it is a drag rather than a tap.
const DRAG_SLOP = 4;
const percent = (scale) => Math.round(scale * 100);

export class TouchLayoutEditor {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.opened = false;
    this.scheme = null;
    this.layout = {};
    this.selected = null;
    this.moving = null;
    this.drag = null;
    this.returnFocus = null;
    this.onClose = null;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'touch-editor-title');
    root.setAttribute('aria-describedby', 'touch-editor-hint');

    // The real controls on a still, representative battle screen. Their
    // input goes nowhere and they are never enabled.
    this.touchRoot = el('div', { class: 'touch-controls is-editing' });
    // Every control stays on show, one the fighter lacks included (in its
    // neutral look): the layout is every fighter's.
    this.touch = new TouchControls(this.touchRoot, { setTouch() {}, queueTouchMouvement() {} }, { showAbsent: true });
    this.stage = el('div', { class: 'touch-editor-stage', role: 'group', ...tattr('aria-label', 'editor.surface') }, [
      el('div', { class: 'touch-editor-scene', 'aria-hidden': 'true' }, [
        el('i', { class: 'touch-editor-sun' }),
        el('i', { class: 'touch-editor-ground' }),
        el('i', { class: 'touch-editor-hud' }),
      ]),
      this.touchRoot,
    ]);
    // A press on the screen away from every control clears the selection.
    this.stage.addEventListener('pointerdown', (e) => {
      if (!this.opened || e.target?.closest?.('[data-control]')) return;
      this.stopMoving({ announce: false });
      this.select(null);
    });
    const editable = new Set();
    for (const scheme of Object.keys(TOUCH_CONTROL_IDS)) {
      for (const [id, node] of this.touch.getControlElements(scheme)) {
        if (editable.has(node)) continue;
        editable.add(node);
        this.makeEditable(id, node);
      }
    }

    // ---- Toolbar ---------------------------------------------------------------
    this.schemeLabel = el('span', { class: 'kicker touch-editor-scheme' });
    this.hint = el('p', { class: 'touch-editor-hint', id: 'touch-editor-hint', ...tx('editor.hint') });
    this.nameEl = el('span', { class: 'touch-editor-name', id: 'touch-editor-name' });
    this.smaller = el('button', {
      class: 'touch-editor-step', type: 'button', 'data-nav': true, 'data-size-step': '-1',
      ...tattr('aria-label', 'editor.smaller'), html: ICONS.minus,
    });
    this.larger = el('button', {
      class: 'touch-editor-step', type: 'button', 'data-nav': true, 'data-size-step': '1',
      ...tattr('aria-label', 'editor.larger'), html: ICONS.plus,
    });
    this.slider = el('input', {
      class: 'touch-editor-slider', type: 'range', 'data-nav': true,
      min: String(percent(TOUCH_SCALE.min)), max: String(percent(TOUCH_SCALE.max)), step: String(percent(TOUCH_SCALE.step)),
      value: '100', 'aria-labelledby': 'touch-editor-size-label touch-editor-name',
    });
    this.sizeValue = el('output', { class: 'touch-editor-size-value', 'aria-hidden': 'true' });
    this.resetButton = el('button', {
      class: 'btn touch-editor-reset', type: 'button', 'data-nav': true,
      ...iconLabel('editor.reset', ICONS.reset, { iconFirst: true }),
    });
    this.doneButton = el('button', {
      class: 'btn btn--primary touch-editor-done', type: 'button', 'data-nav': true,
      ...iconLabel('editor.done', ICONS.check, { iconFirst: true }),
    });
    this.smaller.addEventListener('click', () => this.stepScale(-1));
    this.larger.addEventListener('click', () => this.stepScale(1));
    this.slider.addEventListener('input', () => this.setScale(Number(this.slider.value) / 100));
    this.resetButton.addEventListener('click', () => this.reset());
    this.doneButton.addEventListener('click', () => this.close());

    this.toolbar = el('div', { class: 'touch-editor-bar glass glass--panel' }, [
      el('div', { class: 'touch-editor-head' }, [
        el('div', { class: 'touch-editor-heading' }, [
          this.schemeLabel,
          el('h2', { class: 'touch-editor-title', id: 'touch-editor-title', ...tx('settings.customize') }),
        ]),
        this.hint,
      ]),
      el('div', { class: 'touch-editor-size', role: 'group', 'aria-labelledby': 'touch-editor-size-label' }, [
        el('span', { class: 'touch-editor-size-label', id: 'touch-editor-size-label', ...tx('editor.size') }),
        this.nameEl,
        el('span', { class: 'touch-editor-size-controls' }, [this.smaller, this.slider, this.larger, this.sizeValue]),
      ]),
      el('div', { class: 'touch-editor-actions' }, [this.resetButton, this.doneButton]),
    ]);
    this.live = el('p', { class: 'touch-editor-live', 'aria-live': 'polite' });
    root.replaceChildren(this.stage, this.toolbar, this.live);

    this.scope = { el: root, onBack: () => this.back(), onDirection: (dir) => this.direction(dir) };
    this.onResize = () => {
      if (this.opened) this.refresh();
    };
    this.syncSelection();
  }

  get isOpen() {
    return this.opened;
  }

  // Makes control `id`'s element editable: reachable by keyboard and gamepad
  // (only here: in battle the controls are never focusable), dragged by a
  // pointer, and selected or moved by activation.
  makeEditable(id, node) {
    node.setAttribute('data-control', id);
    node.setAttribute('data-nav', '');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-describedby', 'touch-editor-hint');
    // The joystick is a plain element in battle; here it is pressed like a button.
    if (node.tagName !== 'BUTTON') {
      node.setAttribute('role', 'button');
      node.addEventListener('keydown', (e) => {
        if (e.code !== 'Enter' && e.code !== 'Space') return;
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) this.activate(id);
      });
    }
    node.addEventListener('pointerdown', (e) => this.onPointerDown(e, id, node));
    node.addEventListener('pointermove', (e) => this.onPointerMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      node.addEventListener(type, (e) => this.onPointerEnd(e));
    }
    node.addEventListener('click', (e) => {
      // A pointer press has already selected (and maybe dragged) it; Enter,
      // Space or gamepad A (a click with no pointer) starts or ends moving.
      if (e.detail === 0) this.activate(id);
    });
    node.addEventListener('blur', () => {
      if (this.moving === id) this.stopMoving();
    });
  }

  // ---- Open / close ------------------------------------------------------------

  // Opens on `scheme`'s saved layout, over everything, with focus on its
  // first control. `onClose` runs as it closes, before focus goes back to
  // `returnFocus`.
  open({ scheme, returnFocus = document.activeElement, onClose = null } = {}) {
    if (this.opened) return;
    this.opened = true;
    this.scheme = resolveSetting('mobileControls', scheme);
    this.returnFocus = returnFocus;
    this.onClose = onClose;
    this.layout = this.app.settings.touchLayout(this.scheme);
    this.root.hidden = false;
    // The fighter the player last picked, so the combat buttons look as they
    // will; the neutral look while none is playable.
    this.touch.setCharacter(getPlayableCharacter(this.app.selection?.characterId));
    this.touch.setScheme(this.scheme);
    // The other scheme's controls were detached during a language switch.
    // Translate them once mounted, before using their names in the toolbar.
    localizeTree(this.touchRoot);
    this.touch.setLayout(this.layout);
    setText(this.schemeLabel, 'editor.layout', { scheme: { t: `settings.scheme.${this.scheme}` } });
    this.select(null);
    this.app.nav.pushScope(this.scope);
    globalThis.addEventListener?.('resize', this.onResize);
    this.touch.controlElement(TOUCH_CONTROL_IDS[this.scheme][0])?.focus({ preventScroll: true });
  }

  // Closes back to Settings. Everything is already saved. `silent` leaves
  // focus alone (Settings is closing too).
  close({ silent = false } = {}) {
    if (!this.opened) return;
    if (this.drag) this.endDrag();
    this.stopMoving({ announce: false });
    this.opened = false;
    this.root.hidden = true;
    this.app.nav.popScope(this.scope);
    globalThis.removeEventListener?.('resize', this.onResize);
    this.select(null);
    const onClose = this.onClose;
    this.onClose = null;
    onClose?.();
    const target = this.returnFocus;
    this.returnFocus = null;
    if (!silent) target?.focus?.({ preventScroll: true });
    if (this.root.contains(document.activeElement)) document.activeElement.blur?.();
  }

  // Esc / Back: stop moving the control being moved, else close.
  back() {
    if (this.moving) this.stopMoving();
    else this.close();
  }

  // Arrows / D-pad: nudge the control being moved, or resize from the
  // focused slider; anything else is the navigator's usual move.
  direction(dir) {
    if (this.moving) {
      this.nudge(this.moving, dir);
      return true;
    }
    if (document.activeElement === this.slider && (dir === 'left' || dir === 'right')) {
      this.stepScale(dir === 'right' ? 1 : -1);
      return true;
    }
    return false;
  }

  // Re-places everything for a new window size or orientation.
  refresh() {
    this.touch.applyLayout();
    this.syncSelection();
  }

  // ---- Selecting and moving ------------------------------------------------------

  controlNode(id) {
    return id ? this.touch.controlElement(id, this.scheme) : null;
  }

  // Shows control `id` (null: none) as the one the size controls work on.
  select(id) {
    const previous = this.controlNode(this.selected);
    previous?.classList.remove('is-editor-selected');
    this.selected = id && TOUCH_CONTROL_IDS[this.scheme]?.includes(id) ? id : null;
    this.controlNode(this.selected)?.classList.add('is-editor-selected');
    this.syncSelection();
  }

  // Enter / A on control `id`: select it and start moving it, or stop.
  activate(id) {
    if (!this.opened) return;
    if (this.moving === id) this.stopMoving();
    else this.startMoving(id);
  }

  startMoving(id) {
    this.stopMoving({ announce: false });
    this.select(id);
    if (!this.selected) return;
    this.moving = id;
    this.root.classList.add('is-moving');
    this.controlNode(id)?.classList.add('is-moving');
    this.announce(t('editor.moving', { name: this.nameOf(id) }));
  }

  stopMoving({ announce = true } = {}) {
    const id = this.moving;
    if (!id) return;
    this.moving = null;
    this.root.classList.remove('is-moving');
    this.controlNode(id)?.classList.remove('is-moving');
    if (announce) this.announce(t('editor.placed', { name: this.nameOf(id) }));
  }

  // One small step `dir` ('left', 'right', 'up', 'down') for control `id`.
  nudge(id, dir) {
    const place = this.touch.placements.get(id);
    const area = this.touch.area;
    const [dx, dy] = STEP[dir] ?? [0, 0];
    if (!place || !area) return;
    this.placeAt(id, { x: place.center.x + dx * TOUCH_NUDGE * area.width, y: place.center.y + dy * TOUCH_NUDGE * area.height });
    this.commit();
  }

  // ---- Dragging --------------------------------------------------------------------

  onPointerDown(e, id, node) {
    if (!this.opened || (e.button ?? 0) !== 0 || this.drag) return;
    e.preventDefault();
    if (this.moving && this.moving !== id) this.stopMoving({ announce: false });
    this.select(id);
    const place = this.touch.placements.get(id);
    if (!place) return;
    this.drag = { pointerId: e.pointerId, id, node, x: e.clientX, y: e.clientY, center: { ...place.center }, moved: false };
    // Follow the pointer off the control too; a pointer the browser no
    // longer tracks cannot be captured, and the drag still works without.
    try {
      node.setPointerCapture?.(e.pointerId);
    } catch {
      // Not captured.
    }
  }

  onPointerMove(e) {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      drag.moved = true;
      this.root.classList.add('is-dragging');
      drag.node.classList.add('is-dragging');
    }
    this.placeAt(drag.id, { x: drag.center.x + dx, y: drag.center.y + dy });
  }

  onPointerEnd(e) {
    if (this.drag && e.pointerId === this.drag.pointerId) this.endDrag();
  }

  // Ends the drag in progress; a real move is saved.
  endDrag() {
    const drag = this.drag;
    this.drag = null;
    this.root.classList.remove('is-dragging');
    drag.node.classList.remove('is-dragging');
    if (drag.node.hasPointerCapture?.(drag.pointerId)) drag.node.releasePointerCapture?.(drag.pointerId);
    if (drag.moved) this.commit();
  }

  // ---- Size --------------------------------------------------------------------------

  scaleOf(id) {
    return this.layout[id]?.scale ?? 1;
  }

  // Gives the selected control scale `value` (held to the limits), keeping
  // its centre where it can, and saves.
  setScale(value) {
    const id = this.selected;
    const place = id && this.touch.placements.get(id);
    if (!place) return;
    this.placeAt(id, place.center, clampScale(value));
    this.commit();
  }

  // One size step smaller (-1) or larger (1).
  stepScale(direction) {
    if (!this.selected) return;
    this.setScale(this.scaleOf(this.selected) + direction * TOUCH_SCALE.step);
  }

  // ---- Layout ----------------------------------------------------------------------

  // Puts control `id`'s centre as near screen point `point` as keeps it
  // whole in the area, at `scale` (its current one by default), and shows it.
  placeAt(id, point, scale = this.scaleOf(id)) {
    const place = this.touch.placements.get(id);
    const area = this.touch.area;
    if (!place || !(area?.width > 0 && area?.height > 0)) return;
    const center = placeControl(area, { ...normalizePoint(area, point), scale }, place.size);
    this.layout = { ...this.layout, [id]: { ...normalizePoint(area, center), scale } };
    this.touch.setLayout(this.layout);
    this.syncSelection();
  }

  // Saves the layout as it is now, as this scheme's own.
  commit() {
    this.app.settings.setTouchLayout(this.scheme, this.layout);
  }

  // Reset to defaults: this scheme back on Alva's own layout, saved.
  reset() {
    this.stopMoving({ announce: false });
    this.layout = {};
    this.touch.setLayout(this.layout);
    this.app.settings.resetTouchLayout(this.scheme);
    this.syncSelection();
    this.announce(t('editor.resetDone'));
  }

  // ---- Toolbar -----------------------------------------------------------------------

  nameOf(id) {
    return this.controlNode(id)?.getAttribute('aria-label') ?? '';
  }

  // The selected control's name and size, and the size controls enabled
  // only while a control is selected (at a limit they simply hold, so focus
  // never falls off a button that just ran out of room).
  syncSelection() {
    const id = this.selected;
    if (id) {
      this.nameEl.textContent = this.nameOf(id);
      this.nameEl.setAttribute('data-i18n', '');
    } else {
      setText(this.nameEl, 'editor.none');
    }
    const scale = id ? this.scaleOf(id) : 1;
    const value = t('editor.sizeValue', { percent: percent(scale) });
    this.slider.value = String(percent(scale));
    this.slider.setAttribute('aria-valuetext', value);
    this.sizeValue.textContent = value;
    this.slider.disabled = !id;
    this.smaller.disabled = !id;
    this.larger.disabled = !id;
  }

  announce(message) {
    this.live.textContent = message;
  }
}
