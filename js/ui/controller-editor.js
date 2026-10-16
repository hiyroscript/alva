// CONTROLLER CONTROLS: Settings › Controls › Customize controller
// controls. Three layers over the Settings dialog, each modal with its own
// navigation scope, stacked by the navigator's dialog stack (each above the
// one that opened it, the layers beneath inert), Esc / Circle / B stepping back
// one layer and focus returning to what opened it:
//
//   the roster   the shared fighter roster (js/ui/fighter-roster.js), all
//                48 slots: a playable fighter opens its editor; a locked
//                slot never does. Choosing here is only whose controls to
//                customize: Quick Battle's and Practice Ground's fighters
//                are untouched.
//   the editor   one fighter's whole controller layout: its portrait and
//                name, the controller family the buttons are named for
//                (Player 1's controller's, or the player's pick with none
//                connected), and every action it has by category
//                (Movement, Defense, Ground attacks, Aerial attacks,
//                Special abilities, Other), each with its real name, a line
//                on what it does, its input and how it activates (every
//                move with its own artwork beside its name: the frame its
//                touch button shows, see rowArt), and a diagram lighting
//                the input of the action in focus.
//                Conflicts are checked live (js/data/controller-
//                profiles.js profileConflicts): an error keeps Save off, a
//                warning only informs. Save stores the layout for this
//                fighter alone (by its id); Cancel discards unsaved changes
//                (asking first); Restore defaults asks, then puts this
//                fighter alone back on its recommended layout.
//   the binding  one action's input: it listens to Player 1's controller
//                (the combination pressed, a modifier held first, the stick
//                pointing first) and shows what it heard; every part can
//                also be chosen in text (button, held modifier, stick
//                direction, activation) with the D-pad, arrows or a click,
//                so no controller and no diagram is needed. Retry listens
//                again, Cancel leaves the binding as it was, Confirm takes
//                it into the editor. While it listens, the controller only
//                listens: no menu behind it and no gameplay moves.

import { el } from '../core/utils.js';
import { t, tx, tattr, iconLabel, setText } from '../localization/i18n.js';
import { CHARACTERS, isPlayable, getPlayableCharacter } from '../data/characters.js';
import {
  CATEGORIES, DIRECTIONS, MOVEMENT_SOURCES, PAD_BUTTONS, resolveProfile, recommendedProfile, profileConflicts,
  hasBlockingConflict, normalizeBinding, sameBinding, hasAuthoredLayout,
} from '../data/controller-profiles.js';
import { stickDirection, movementVector, RUN_THRESHOLD } from '../core/controller-resolver.js';
import { FighterRoster } from './fighter-roster.js';
import { paintPortrait } from './sprite-art.js';
import { ICONS } from './icons.js';
import { mobileAbility } from './mobile-abilities.js';
import {
  FAMILY_NAMES, displayFamily, buttonName, bindingText, activationText, actionName, actionDescription,
  diagramSVG, highlight, sourceName, directionName,
} from './controller-glyphs.js';

// Keeps Tab and Shift+Tab inside `root` while it is the navigator's scope.
function trapTab(root, app) {
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || app.nav.scopeEl !== root) return;
    const items = app.nav.candidates(root);
    const index = items.indexOf(document.activeElement);
    if (index < 0 || (event.shiftKey ? index === 0 : index === items.length - 1)) {
      event.preventDefault();
      (event.shiftKey ? items.at(-1) : items[0])?.focus();
    }
  });
}

// ---- The roster -----------------------------------------------------------------------

// The shared roster, its Confirm reading "Customize controls".
class ControllerFighterRoster extends FighterRoster {
  updateConfirm() {
    const def = getPlayableCharacter(this.selectedId);
    this.confirmBtn.disabled = !def;
    setText(this.confirmBtn, def ? 'controllerRoster.customize' : this.slotFor(null) ? 'roster.none' : 'common.noFighters');
  }
}

class RosterLayer {
  constructor(root, app, { onChoose, onBack }) {
    this.root = root;
    this.app = app;
    this.isOpen = false;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'controller-roster-title');
    this.back = el('button', {
      class: 'btn-back', type: 'button', 'data-nav': true,
      ...tattr('aria-label', 'controllerRoster.back'), ...iconLabel('common.back', ICONS.back, { iconFirst: true }),
    });
    this.back.addEventListener('click', () => onBack());
    this.dialog = el('div', { class: 'practice-roster-dialog controller-roster-dialog glass glass--panel' });
    this.roster = new ControllerFighterRoster(app, { host: this.dialog, previewId: 'controller-preview-name', onConfirm: onChoose });
    this.dialog.replaceChildren(
      el('header', { class: 'screen-header practice-roster-head' }, [
        el('div', { class: 'practice-roster-actions' }, [this.back]),
        el('div', { class: 'screen-heading' }, [
          el('span', { class: 'kicker', ...tx('settings.title') }),
          el('h2', { class: 'screen-title', id: 'controller-roster-title', ...tx('controllerRoster.title') }),
        ]),
      ]),
      el('p', { class: 'controller-roster-note', ...tx('controllerRoster.note') }),
      el('div', { class: 'screen-body char-layout practice-roster-body' }, [this.roster.rosterPanel, this.roster.previewPanel]),
    );
    root.replaceChildren(this.dialog);
    this.scope = { el: root, onBack: () => onBack() };
    trapTab(root, app);
  }

  open(id) {
    this.isOpen = true;
    this.root.hidden = false;
    this.roster.show(id);
    this.app.nav.pushScope(this.scope);
    if (!this.roster.focusSelected()) this.back.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    this.app.nav.popScope(this.scope);
  }
}

// ---- Cyclers ------------------------------------------------------------------------------

// A labelled value the D-pad / arrows (left, right) or a click steps
// through: one focus stop, never a native select (which a controller
// cannot drive).
class Cycler {
  constructor({ id, labelKey, onChange }) {
    this.values = [];
    this.index = 0;
    this.onChange = onChange;
    this.label = el('span', { class: 'cycler-label', id: `${id}-label`, ...tx(labelKey) });
    this.value = el('span', { class: 'cycler-value', id: `${id}-value` });
    this.button = el('button', {
      class: 'cycler', type: 'button', 'data-nav': true, 'data-cycler': id,
      'aria-labelledby': `${id}-label ${id}-value`, 'aria-describedby': 'binding-cycler-hint',
    }, [
      el('span', { class: 'cycler-arrow', 'aria-hidden': 'true', html: ICONS.left }),
      this.value,
      el('span', { class: 'cycler-arrow', 'aria-hidden': 'true', html: ICONS.right }),
    ]);
    this.button._cycler = this;
    this.button.addEventListener('click', () => this.step(1));
    this.row = el('div', { class: 'cycler-row' }, [this.label, this.button]);
  }

  // `values`: [{ value, text }]; `current` selected.
  set(values, current) {
    this.values = values;
    const i = values.findIndex((v) => v.value === current);
    this.index = i < 0 ? 0 : i;
    this.render();
  }

  get current() {
    return this.values[this.index]?.value ?? null;
  }

  step(by) {
    if (this.values.length < 2) return;
    this.index = (this.index + by + this.values.length) % this.values.length;
    this.render();
    this.onChange(this.current);
  }

  render() {
    this.value.textContent = this.values[this.index]?.text ?? '';
    this.button.disabled = this.values.length < 2;
  }
}

// ---- The binding dialog --------------------------------------------------------------

class BindingLayer {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.isOpen = false;
    this.stopCapture = null;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'binding-title');
    root.setAttribute('aria-describedby', 'binding-listen');

    this.kicker = el('span', { class: 'kicker' });
    this.description = el('p', { class: 'binding-desc' });
    this.listen = el('div', { class: 'binding-listen', id: 'binding-listen', role: 'status', 'aria-live': 'polite' }, [
      el('span', { class: 'binding-pulse', 'aria-hidden': 'true' }),
      el('span', { class: 'binding-listen-text' }),
    ]);
    this.listenText = this.listen.lastChild;
    this.detected = el('p', { class: 'binding-detected' });
    this.diagram = el('div', { class: 'binding-diagram' });

    const update = () => this.fromFields();
    this.fields = {
      source: new Cycler({ id: 'binding-source', labelKey: 'binding.source', onChange: update }),
      button: new Cycler({ id: 'binding-button', labelKey: 'binding.button', onChange: update }),
      modifier: new Cycler({ id: 'binding-modifier', labelKey: 'binding.modifier', onChange: update }),
      direction: new Cycler({ id: 'binding-direction', labelKey: 'binding.direction', onChange: update }),
      activation: new Cycler({ id: 'binding-activation', labelKey: 'binding.activation', onChange: update }),
    };
    this.dashNote = el('p', { class: 'binding-note', hidden: true, ...tx('binding.dashDirection') });
    this.conflicts = el('ul', { class: 'binding-conflicts' });

    this.retryButton = el('button', { class: 'btn', type: 'button', 'data-nav': true, ...iconLabel('binding.retry', ICONS.refresh, { iconFirst: true }) });
    this.cancelButton = el('button', { class: 'btn is-outline-only', type: 'button', 'data-nav': true, ...tx('common.cancel') });
    this.confirmButton = el('button', { class: 'btn btn--primary', type: 'button', 'data-nav': true, ...tx('common.confirm') });
    this.retryButton.addEventListener('click', () => this.startListening());
    this.cancelButton.addEventListener('click', () => this.close(null));
    this.confirmButton.addEventListener('click', () => this.close(this.binding));

    root.replaceChildren(el('div', { class: 'dialog-panel binding-panel glass glass--panel' }, [
      el('div', { class: 'choice-heading' }, [
        this.kicker,
        el('h2', { class: 'dialog-title', id: 'binding-title', ...tx('binding.title') }),
      ]),
      this.description,
      el('div', { class: 'binding-layout' }, [
        el('div', { class: 'binding-main' }, [
          this.listen,
          this.detected,
          el('div', { class: 'binding-fields', role: 'group', ...tattr('aria-label', 'binding.fields') },
            Object.values(this.fields).map((f) => f.row)),
          el('p', { class: 'binding-hint', id: 'binding-cycler-hint', ...tx('binding.cyclerHint') }),
          this.dashNote,
          this.conflicts,
        ]),
        this.diagram,
      ]),
      el('div', { class: 'dialog-actions binding-actions' }, [this.retryButton, this.cancelButton, this.confirmButton]),
    ]));
    this.scope = {
      el: root,
      onBack: () => this.close(null),
      onDirection: (dir) => this.onDirection(dir),
    };
    trapTab(root, app);
    app.controllers?.onChange(() => {
      if (this.isOpen) this.renderListen();
    });
  }

  // Left / right (D-pad or arrow keys) on a cycler steps it; everything
  // else moves focus.
  onDirection(dir) {
    const cycler = document.activeElement?._cycler;
    if (cycler && (dir === 'left' || dir === 'right')) {
      cycler.step(dir === 'right' ? 1 : -1);
      this.app.audio.play('move');
      return true;
    }
    return false;
  }

  // Opens for `action` of `def`, its binding `binding`, the other bindings
  // of the layout `draft` (for conflicts), buttons named for `family`.
  // Resolves with the confirmed binding, or null.
  open({ def, action, binding, draft, actions, family, onClose }) {
    this.def = def;
    this.action = action;
    this.draft = draft;
    this.actions = actions;
    this.family = family;
    this.original = binding;
    this.binding = binding;
    this.onClose = onClose;
    this.isOpen = true;
    this.kicker.textContent = actionName(def, action);
    this.kicker.setAttribute('data-i18n', '');
    const description = actionDescription(def, action);
    this.description.textContent = description ?? '';
    this.description.hidden = !description;
    this.diagram.innerHTML = diagramSVG(family);
    this.root.hidden = false;
    this.app.nav.pushScope(this.scope);
    this.setFields();
    this.render();
    if (!this.app.controllers?.player1) {
      this.renderListen();
      (this.fields[action.kind === 'move' ? 'source' : 'button'].button).focus({ preventScroll: true });
    } else {
      this.startListening();
      this.cancelButton.focus({ preventScroll: true });
    }
  }

  close(result) {
    if (!this.isOpen) return;
    this.stopListening();
    this.isOpen = false;
    this.root.hidden = true;
    this.app.nav.popScope(this.scope);
    const done = this.onClose;
    this.onClose = null;
    done?.(result && !sameBinding(result, this.original) ? result : null);
  }

  get source() {
    return this.draft.move?.source ?? 'leftStick';
  }

  // The fields' choices for this action, set to the binding.
  setFields() {
    const a = this.action;
    const b = this.binding;
    const f = this.fields;
    const isMove = a.kind === 'move';
    f.source.row.hidden = !isMove;
    for (const name of ['button', 'modifier', 'direction', 'activation']) f[name].row.hidden = isMove;
    this.dashNote.hidden = a.kind !== 'dash';
    if (isMove) {
      f.source.set(MOVEMENT_SOURCES.map((s) => ({ value: s, text: sourceName(s) })), b.source);
      return;
    }
    const name = (button) => buttonName(this.family, button);
    const buttons = PAD_BUTTONS.map((p) => ({ value: p, text: name(p) }));
    f.button.set(a.directionOnly ? [{ value: null, text: t('binding.stickOnly') }, ...buttons] : buttons, b.button);
    f.modifier.set([{ value: null, text: t('binding.none') }, ...PAD_BUTTONS.filter((p) => p !== b.button).map((p) => ({ value: p, text: name(p) }))], b.modifier);
    if (b.button === null) f.modifier.set([{ value: null, text: t('binding.none') }], null);
    f.direction.set(a.directional
      ? [{ value: null, text: t('binding.anyDirection') }, ...DIRECTIONS.map((d) => ({ value: d, text: directionName(d, this.source) }))]
      : [{ value: null, text: t('binding.ownDirection') }], b.direction);
    f.activation.set(a.activations.map((v) => ({ value: v, text: activationText({ activation: v, modifier: null }, a) })), b.activation);
  }

  // The fields read back into a binding (normalized; an impossible mix
  // keeps the last valid one).
  fromFields() {
    const f = this.fields;
    let next;
    if (this.action.kind === 'move') {
      next = { source: f.source.current };
    } else {
      const button = f.button.current;
      next = normalizeBinding(this.action, {
        button,
        modifier: button === null || f.modifier.current === button ? null : f.modifier.current,
        direction: f.direction.current,
        activation: f.activation.current,
      });
      // A direction alone needs a direction.
      if (!next && button === null) next = normalizeBinding(this.action, { button: null, modifier: null, direction: 'down', activation: f.activation.current });
    }
    if (next) this.binding = next;
    this.setFields();
    this.render();
  }

  // Shows the binding: its phrase, the diagram, its conflicts.
  render() {
    const b = this.binding;
    setText(this.detected, 'binding.current', { input: bindingText(b, this.family, this.source), activation: activationText(b, this.action) || '—' });
    highlight(this.diagram.firstElementChild, b, this.action.kind === 'move' ? b.source : this.source);
    const draft = { ...this.draft, [this.action.id]: b };
    const mine = profileConflicts(this.actions, draft).filter((c) => c.actions.includes(this.action.id));
    this.conflicts.replaceChildren(...mine.map((c) => el('li', {
      class: `binding-conflict is-${c.severity}`, text: conflictText(c, this.def, this.actions, this.family, this.source),
    })));
    this.confirmButton.disabled = hasBlockingConflict(mine);
  }

  renderListen() {
    const listening = !!this.stopCapture;
    this.listen.classList.toggle('is-listening', listening);
    const noPad = !this.app.controllers?.player1;
    if (this.action.kind === 'move') setText(this.listenText, noPad ? 'binding.chooseSource' : 'binding.listenSource');
    else if (noPad) setText(this.listenText, 'binding.noController');
    else setText(this.listenText, listening ? 'binding.listen' : 'binding.heard');
    this.retryButton.disabled = noPad;
  }

  // Listens to Player 1's controller until a press (or combination) is let
  // go: the last button pressed is the button, a button held before it the
  // modifier, the stick's direction as it went down the direction. A stick
  // pushed out and back alone is a direction-only binding where the action
  // takes one (Fast fall); for Movement, the stick or pad used is the
  // source.
  startListening() {
    this.stopListening();
    if (!this.app.controllers?.player1) {
      this.renderListen();
      return;
    }
    const capture = { last: null, modifier: null, direction: null, stick: null, held: new Set() };
    this.stopCapture = this.app.input.startCapture((state) => this.listenStep(capture, state));
    this.renderListen();
  }

  stopListening() {
    this.stopCapture?.();
    this.stopCapture = null;
    if (this.isOpen) this.renderListen();
  }

  listenStep(capture, state) {
    const { held, pressed, axes } = state;
    const a = this.action;
    if (a.kind === 'move') {
      const used = Math.abs(axes[0]) > 0.6 || Math.abs(axes[1]) > 0.6 ? 'leftStick'
        : Math.abs(axes[2]) > 0.6 || Math.abs(axes[3]) > 0.6 ? 'rightStick'
          : ['dpadLeft', 'dpadRight', 'dpadUp', 'dpadDown'].some((b) => held.has(b)) ? 'dpad' : null;
      if (used) {
        this.binding = { source: used };
        this.stopListening();
        this.setFields();
        this.render();
      }
      return;
    }
    const [x, y] = movementVector(this.source, held, axes);
    for (const button of pressed) {
      const others = [...capture.held].filter((b) => b !== button);
      capture.last = button;
      capture.modifier = others.at(-1) ?? null;
      capture.direction = stickDirection(x, y);
    }
    for (const button of pressed) capture.held.add(button);
    for (const button of [...capture.held]) if (!held.has(button)) capture.held.delete(button);
    if (!capture.last && a.directionOnly) {
      const out = Math.abs(x) > RUN_THRESHOLD || Math.abs(y) > RUN_THRESHOLD;
      if (out) capture.stick = stickDirection(x, y) ?? capture.stick;
      else if (capture.stick) {
        this.finish({ button: null, modifier: null, direction: capture.stick });
        return;
      }
    }
    if (capture.last && held.size === 0) {
      this.finish({ button: capture.last, modifier: capture.modifier, direction: a.directional ? capture.direction : null });
    }
  }

  // A capture heard: kept with the binding's activation (or the action's
  // first, where that one does not fit).
  finish(input) {
    const a = this.action;
    const keep = this.binding.activation;
    const next = normalizeBinding(a, { ...input, activation: keep }) ??
      normalizeBinding(a, { ...input, activation: a.activations[0] }) ??
      normalizeBinding(a, { ...input, direction: null, activation: a.activations[0] });
    if (next) this.binding = next;
    this.stopListening();
    this.setFields();
    this.render();
    this.confirmButton.focus({ preventScroll: true });
  }
}

// A conflict in words.
export function conflictText(conflict, def, actions, family, source) {
  const byId = new Map(actions.map((a) => [a.id, a]));
  const name = (id) => actionName(def, byId.get(id));
  const input = conflict.button ? buttonName(family, conflict.button) : directionName('down', source);
  const [a, b] = conflict.actions;
  return t(`controllerEditor.conflict.${conflict.type}`, { a: name(a), b: b ? name(b) : '', input });
}

// ---- The editor ------------------------------------------------------------------------

class EditorLayer {
  constructor(root, app, host) {
    this.root = root;
    this.app = app;
    this.host = host;
    this.isOpen = false;
    this.def = null;
    this.familyChoice = null;
    // Move art files that failed to load: shown as their glyph from then
    // on, never tried again (see rowArt).
    this.failedArt = new Set();
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'controller-editor-title');

    this.closeButton = el('button', {
      class: 'dialog-close', type: 'button', 'data-nav': true, ...tattr('aria-label', 'controllerEditor.close'), html: ICONS.close,
    });
    this.closeButton.addEventListener('click', () => this.cancel());
    this.portrait = el('canvas', { class: 'controller-editor-portrait', width: 1, height: 1, 'aria-hidden': 'true' });
    this.name = el('h2', { class: 'dialog-title', id: 'controller-editor-title' });
    this.familyLine = el('p', { class: 'controller-editor-family' });
    this.familyButton = el('button', { class: 'text-action controller-family-toggle', type: 'button', 'data-nav': true });
    this.familyButton.addEventListener('click', () => this.toggleFamily());
    this.layoutTag = el('span', { class: 'settings-option-tag controller-layout-tag' });
    this.provisional = el('p', { class: 'controller-editor-provisional', hidden: true, ...tx('controllerEditor.provisional') });
    this.list = el('div', { class: 'controller-actions-list' });
    this.diagram = el('div', { class: 'controller-editor-diagram' });
    this.detailName = el('p', { class: 'controller-detail-name' });
    this.detailBinding = el('p', { class: 'controller-detail-binding' });
    this.conflicts = el('div', { class: 'controller-conflicts', role: 'status', 'aria-live': 'polite' });
    this.restoreButton = el('button', { class: 'btn is-outline-only', type: 'button', 'data-nav': true, ...iconLabel('controllerEditor.restore', ICONS.reset, { iconFirst: true }) });
    this.cancelButton = el('button', { class: 'btn', type: 'button', 'data-nav': true, ...tx('common.cancel') });
    this.saveButton = el('button', { class: 'btn btn--primary', type: 'button', 'data-nav': true, ...tx('controllerEditor.save') });
    this.restoreButton.addEventListener('click', () => this.restore());
    this.cancelButton.addEventListener('click', () => this.cancel());
    this.saveButton.addEventListener('click', () => this.save());
    this.announcer = el('p', { class: 'controller-sr', role: 'status', 'aria-live': 'polite' });

    root.replaceChildren(el('div', { class: 'controller-editor-panel glass glass--panel' }, [
      el('header', { class: 'controller-editor-head' }, [
        el('div', { class: 'controller-editor-portrait-frame' }, [this.portrait]),
        el('div', { class: 'controller-editor-heading' }, [
          el('span', { class: 'kicker', ...tx('controllerEditor.kicker') }),
          el('div', { class: 'controller-editor-title-row' }, [this.name, this.layoutTag]),
          el('div', { class: 'controller-editor-family-row' }, [this.familyLine, this.familyButton]),
        ]),
        this.closeButton,
      ]),
      el('div', { class: 'controller-editor-body' }, [
        el('div', { class: 'controller-editor-list-col' }, [this.provisional, this.list]),
        el('aside', { class: 'controller-editor-side' }, [
          this.diagram,
          el('div', { class: 'controller-detail' }, [this.detailName, this.detailBinding]),
          this.conflicts,
        ]),
      ]),
      el('footer', { class: 'controller-editor-foot' }, [
        this.restoreButton,
        el('div', { class: 'controller-editor-foot-actions' }, [this.cancelButton, this.saveButton]),
      ]),
      this.announcer,
    ]));
    this.scope = { el: root, onBack: () => this.cancel() };
    trapTab(root, app);
    app.controllers?.onChange(() => {
      if (this.isOpen) this.refreshFamily();
    });
  }

  // The family the buttons are named for: Player 1's controller's, else
  // the player's pick, else the default.
  get family() {
    return displayFamily(this.app.controllers?.family ?? this.familyChoice);
  }

  get source() {
    return this.draft?.move?.source ?? 'leftStick';
  }

  open(def, { onClose } = {}) {
    this.def = def;
    this.onClose = onClose;
    const stored = this.app.settings.controllerProfile?.(def.id) ?? null;
    const profile = resolveProfile(def, stored);
    this.actions = profile.actions;
    this.saved = { ...profile.bindings };
    this.draft = { ...profile.bindings };
    this.focusedAction = null;
    this.isOpen = true;
    this.name.textContent = def.displayName;
    this.name.setAttribute('data-i18n', '');
    this.provisional.hidden = hasAuthoredLayout(def);
    this.portrait.width = 1;
    this.portrait.height = 1;
    this.app.loadCharacter?.(def.id)?.then((set) => {
      if (this.def === def && set?.usable) paintPortrait(this.portrait, set);
    });
    this.root.hidden = false;
    this.app.nav.pushScope(this.scope);
    this.refreshFamily();
    this.renderList();
    this.list.querySelector('[data-action]')?.focus({ preventScroll: true });
    this.list.scrollTop = 0;
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    this.app.nav.popScope(this.scope);
    const done = this.onClose;
    this.onClose = null;
    done?.(this.def);
  }

  get dirty() {
    return this.actions.some((a) => !sameBinding(this.draft[a.id], this.saved[a.id]));
  }

  refreshFamily() {
    const p1 = this.app.controllers?.player1;
    const family = this.family;
    if (p1) setText(this.familyLine, 'controllerEditor.familyConnected', { family: FAMILY_NAMES[family] });
    else setText(this.familyLine, 'controllerEditor.familyNone', { family: FAMILY_NAMES[family] });
    this.familyButton.hidden = !!p1;
    const other = family === 'xbox' ? 'playstation' : 'xbox';
    setText(this.familyButton, 'controllerEditor.showFamily', { family: FAMILY_NAMES[other] });
    this.diagram.innerHTML = diagramSVG(family);
    if (this.isOpen) {
      this.renderList();
      this.renderDetail();
    }
  }

  toggleFamily() {
    this.familyChoice = this.family === 'xbox' ? 'playstation' : 'xbox';
    this.refreshFamily();
    this.familyButton.focus({ preventScroll: true });
  }

  // The actions by category, each one row: a single focus stop whose name
  // is "Change binding: <name>", showing its name, line, input and
  // activation; rows in a conflict are marked.
  renderList() {
    const focusedId = document.activeElement?.getAttribute?.('data-action');
    const conflicts = profileConflicts(this.actions, this.draft);
    const marked = new Map();
    for (const c of conflicts) for (const id of c.actions) if (marked.get(id) !== 'error') marked.set(id, c.severity);
    const groups = CATEGORIES.map((category) => {
      const actions = this.actions.filter((a) => a.category === category);
      if (!actions.length) return null;
      return el('section', { class: 'controller-category', 'aria-labelledby': `controller-cat-${category}` }, [
        el('h3', { class: 'controller-category-title', id: `controller-cat-${category}`, ...tx(`controllerEditor.category.${category}`) }),
        el('ul', { class: 'controller-rows' }, actions.map((a) => el('li', {}, [this.row(a, marked.get(a.id))]))),
      ]);
    });
    this.list.replaceChildren(...groups.filter(Boolean));
    if (focusedId) this.list.querySelector(`[data-action="${focusedId}"]`)?.focus({ preventScroll: true });
    this.renderConflicts(conflicts);
    this.layoutTag.replaceChildren(document.createTextNode(t(this.customized ? 'settings.customized' : 'controllerEditor.recommended')));
    this.saveButton.disabled = hasBlockingConflict(conflicts) || !this.dirty;
  }

  // Whether the draft differs from the recommended layout.
  get customized() {
    const { bindings } = recommendedProfile(this.def);
    return this.actions.some((a) => !sameBinding(this.draft[a.id], bindings[a.id]));
  }

  row(action, conflict) {
    const b = this.draft[action.id];
    const name = actionName(this.def, action);
    const description = actionDescription(this.def, action);
    const descId = `controller-row-desc-${action.id.replace(':', '-')}`;
    const input = bindingText(b, this.family, this.source);
    const activation = activationText(b, action);
    const placeTag = action.kind === 'attack' && action.category === 'abilities'
      ? el('span', { class: 'controller-place', ...tx(`controllerEditor.place.${action.place}`) }) : null;
    const art = action.kind === 'attack' ? this.rowArt(action) : null;
    const row = el('button', {
      class: `controller-row${conflict ? ` is-${conflict}` : ''}`, type: 'button', 'data-nav': true, 'data-action': action.id,
      'aria-describedby': description ? descId : null,
      ...tattr('aria-label', 'controllerEditor.rowLabel', { name, input, activation: activation || '—' }),
    }, [
      el('span', { class: `controller-row-text${art ? ' has-art' : ''}` }, [
        art,
        el('span', { class: 'controller-row-name' }, [el('span', { text: name }), placeTag]),
        description ? el('span', { class: 'controller-row-desc', id: descId, text: description }) : null,
      ]),
      el('span', { class: 'controller-row-binding' }, [
        el('span', { class: 'controller-chip', text: input }),
        activation ? el('span', { class: 'controller-row-activation', text: activation }) : null,
      ]),
      el('span', { class: 'controller-row-change', 'aria-hidden': 'true', ...tx('controllerEditor.change') }),
    ]);
    row.addEventListener('focus', () => {
      this.focusedAction = action;
      this.renderDetail();
    });
    row.addEventListener('click', () => this.change(action));
    return row;
  }

  // Move `action`'s artwork beside its name: the very frame its touch
  // button shows (mobileAbility in js/ui/mobile-abilities.js: the
  // fighter's own `mobileAbilities` preview for that move, the ground or
  // the mid-air one as the row is, a projectile's, summon's or technique's
  // where authored), facing right (mirrored where its clip's art faces
  // left), transparent and crisp. Decorative: hidden from assistive
  // technology, the row's own name says what it is. Where the move has no
  // frame, or once its file fails to load, its glyph (the same fallback
  // the touch button shows). Null for a move with no presentation at all.
  rowArt(action) {
    const art = mobileAbility(this.def, action.control, action.place === 'air');
    if (!art) return null;
    const frame = el('span', { class: 'controller-row-art', 'aria-hidden': 'true' });
    const glyph = () => {
      frame.classList.add('is-glyph');
      frame.innerHTML = art.icon ?? '';
    };
    const sprite = art.sprite;
    if (!sprite || this.failedArt.has(sprite.url)) {
      glyph();
      return frame;
    }
    const img = el('img', {
      class: `controller-row-sprite${sprite.mirrored ? ' is-mirrored' : ''}`, src: sprite.url, alt: '',
      draggable: 'false', decoding: 'async',
    });
    img.addEventListener('error', () => {
      if (!this.failedArt.has(sprite.url)) {
        this.failedArt.add(sprite.url);
        console.warn(`[Alva] Controller editor art "${sprite.url}" failed to load; showing its glyph.`);
      }
      if (frame.contains(img)) glyph();
    });
    frame.replaceChildren(img);
    return frame;
  }

  renderDetail() {
    const a = this.focusedAction ?? this.actions[0];
    if (!a) return;
    const b = this.draft[a.id];
    this.detailName.textContent = actionName(this.def, a);
    const activation = activationText(b, a);
    this.detailBinding.textContent = activation ? `${bindingText(b, this.family, this.source)} · ${activation}` : bindingText(b, this.family, this.source);
    highlight(this.diagram.firstElementChild, b, a.kind === 'move' ? b.source : this.source);
  }

  renderConflicts(conflicts) {
    if (!conflicts.length) {
      this.conflicts.replaceChildren(el('p', { class: 'controller-conflict-ok', ...tx('controllerEditor.noConflicts') }));
      return;
    }
    this.conflicts.replaceChildren(
      el('p', { class: 'controller-conflicts-title', ...tx('controllerEditor.conflicts') }),
      el('ul', {}, conflicts.map((c) => el('li', {
        class: `controller-conflict is-${c.severity}`, text: conflictText(c, this.def, this.actions, this.family, this.source),
      }))),
      hasBlockingConflict(conflicts) ? el('p', { class: 'controller-conflict-block', ...tx('controllerEditor.blocked') }) : null,
    );
  }

  // Opens the binding dialog for `action`; a confirmed binding goes into
  // the draft.
  change(action) {
    this.host.binding.open({
      def: this.def, action, binding: this.draft[action.id], draft: this.draft, actions: this.actions, family: this.family,
      onClose: (binding) => {
        if (binding) {
          this.draft = { ...this.draft, [action.id]: binding };
          this.renderList();
          this.renderDetail();
        }
        this.list.querySelector(`[data-action="${action.id}"]`)?.focus({ preventScroll: true });
      },
    });
  }

  // Saves the draft as this fighter's layout (or, when it is the
  // recommended one, forgets the saved one), then closes.
  save() {
    const conflicts = profileConflicts(this.actions, this.draft);
    if (hasBlockingConflict(conflicts)) return;
    if (this.customized) this.app.settings.setControllerProfile(this.def.id, this.draft);
    else this.app.settings.resetControllerProfile(this.def.id);
    this.saved = { ...this.draft };
    this.close();
  }

  // Asks before losing unsaved changes, then closes.
  async cancel() {
    if (this.confirming) return;
    if (this.dirty) {
      const ok = await this.confirm({
        title: t('controllerEditor.discardTitle'),
        message: t('controllerEditor.discardMessage', { name: this.def.displayName }),
        confirmLabel: t('controllerEditor.discard'),
        cancelLabel: t('controllerEditor.keepEditing'),
      });
      if (!ok) return;
    }
    this.close();
  }

  // Asks, then puts this fighter alone back on its recommended layout,
  // saved at once.
  async restore() {
    if (this.confirming) return;
    const ok = await this.confirm({
      title: t('controllerEditor.restoreTitle'),
      message: t('controllerEditor.restoreMessage', { name: this.def.displayName }),
      confirmLabel: t('controllerEditor.restoreConfirm'),
      cancelLabel: t('controllerEditor.restoreKeep'),
    });
    if (!ok) {
      this.restoreButton.focus({ preventScroll: true });
      return;
    }
    this.app.settings.resetControllerProfile(this.def.id);
    const { bindings } = recommendedProfile(this.def);
    this.draft = { ...bindings };
    this.saved = { ...bindings };
    this.renderList();
    this.renderDetail();
    this.announcer.textContent = t('controllerEditor.restored', { name: this.def.displayName });
    this.restoreButton.focus({ preventScroll: true });
  }

  // The shared confirmation dialog: opened last, so the dialog stack puts
  // it above this layer and keeps this layer inert beneath it.
  async confirm(options) {
    const dialog = this.app.dialog;
    if (!dialog) return true;
    this.confirming = true;
    try {
      return await dialog.open({ ...options, cancelOutlineOnly: true });
    } finally {
      this.confirming = false;
    }
  }
}

// ---- The three together ---------------------------------------------------------------

export class ControllerControls {
  constructor(app, { roster, editor, binding }) {
    this.app = app;
    this.returnFocus = null;
    this.onClose = null;
    this.binding = new BindingLayer(binding, app);
    this.editor = new EditorLayer(editor, app, this);
    this.roster = new RosterLayer(roster, app, {
      onChoose: (def) => this.edit(def),
      onBack: () => this.close(),
    });
    this.lastId = null;
  }

  get isOpen() {
    return this.roster.isOpen || this.editor.isOpen;
  }

  // Opens the roster (over Settings). `returnFocus` gets focus back when it
  // closes; `onClose` hears it closed.
  open({ returnFocus = document.activeElement, onClose = null } = {}) {
    if (this.isOpen) return;
    this.returnFocus = returnFocus;
    this.onClose = onClose;
    const first = CHARACTERS.find((d) => isPlayable(d))?.id ?? null;
    this.roster.open(this.lastId ?? first);
  }

  // The editor for `def`, over the roster; back on the roster after.
  edit(def) {
    if (!isPlayable(def) || this.editor.isOpen) return;
    this.lastId = def.id;
    this.editor.open(def, {
      onClose: () => {
        if (this.roster.isOpen) this.roster.roster.focusSelected();
      },
    });
  }

  // Closes everything (`silent` leaves focus alone).
  close({ silent = false } = {}) {
    this.binding.close(null);
    if (this.editor.isOpen) {
      this.editor.onClose = null;
      this.editor.close();
    }
    if (!this.roster.isOpen) return;
    this.roster.close();
    const done = this.onClose;
    this.onClose = null;
    done?.();
    const target = this.returnFocus;
    this.returnFocus = null;
    if (!silent && target?.isConnected !== false) target?.focus?.({ preventScroll: true });
  }

  // Keeps the roster's live preview moving while it shows.
  update(dt) {
    if (this.roster.isOpen && !this.editor.isOpen) this.roster.roster.update(dt);
  }
}
