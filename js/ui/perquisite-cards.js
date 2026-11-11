// The Perquisite cards (the Adventure update): before the battle of a
// milestone level (5, 10, 15, 20, 25, 30) the first time it is started,
// two cards over the dimmed screen, and the player picks one.
//
// A modal role="dialog" like the choice dialog (js/ui/overlays.js
// ModalDialog: its own navigation scope, the screen beneath inert), its
// kicker "Level NN" and title "Choose a Perquisite", then exactly two
// cards side by side (stacked on a narrow portrait screen) that pop in
// (a short scale and fade; a fade alone with reduced motion). Each card is
// a button: the Perquisite's own icon (PERQUISITE_ICONS), its name, the
// level it would be (I to V, "NEW" at I), its effect at that level in
// plain numbers and, for an upgrade, a muted line with what it was.
//
// The player must pick: there is no close button, and Esc, Back or a
// press on the dim do nothing. Arrows / D-pad move between the cards;
// click, Enter / J or gamepad A picks. Hovering only previews (it never
// moves keyboard or gamepad focus). Picking resolves with the Perquisite's
// id; the caller saves it at once (js/core/adventure-progress.js pick).

import { el } from '../core/utils.js';
import { tx, setText } from '../localization/i18n.js';
import { ModalDialog } from './overlays.js';
import { PERQUISITE_ICONS } from './icons.js';
import { ROMAN, levelLabel, offerLevel, perquisiteNumbers } from '../data/adventure.js';

export class PerquisiteCards extends ModalDialog {
  constructor(root, app) {
    super(root, app, 'perquisite-dialog-title');
    this.resolve = null;
    this.kicker = el('span', { class: 'kicker' });
    this.title = el('h2', { class: 'dialog-title', id: 'perquisite-dialog-title', ...tx('perquisite.title') });
    this.options = el('div', { class: 'perquisite-options', role: 'group' });
    root.replaceChildren(
      el('div', { class: 'dialog-panel perquisite-panel glass glass--panel' }, [
        el('div', { class: 'choice-heading perquisite-heading' }, [this.kicker, this.title]),
        this.options,
      ]),
    );
    this.cards = [];
  }

  get isOpen() {
    return !!this.resolve;
  }

  // Milestone `level`'s two cards, `offer` (two Perquisite ids), for a
  // player owning `levels` ({ id: 0..5 }). Resolves with the id picked.
  open({ level, offer, levels = {} }) {
    if (this.resolve) this.close(null);
    setText(this.kicker, 'perquisite.kicker', { level: levelLabel(level) });
    this.cards = offer.map((id, i) => this.card(id, offerLevel(levels, id), i));
    this.options.replaceChildren(...this.cards);
    this.show(this.cards[0]);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  // One card: Perquisite `id` at level `n`, the `i`th to pop in.
  card(id, n, i) {
    const now = perquisiteNumbers(id, n);
    const was = n > 1 ? perquisiteNumbers(id, n - 1) : null;
    const effectId = `perquisite-effect-${id}`;
    const button = el('button', {
      class: 'perquisite-card', type: 'button', 'data-nav': true, 'data-nav-no-hover-focus': true, 'data-nav-default': i === 0 || null,
      'data-perquisite': id, 'data-level': String(n), 'aria-describedby': effectId,
      style: `--i: ${i}`,
    }, [
      el('span', { class: 'perquisite-card-icon', 'aria-hidden': 'true', html: PERQUISITE_ICONS[id] }),
      el('span', { class: 'perquisite-card-badges' }, [
        el('span', { class: 'perquisite-card-level', ...tx('perquisite.level', { roman: ROMAN[n] }) }),
        n === 1 ? el('span', { class: 'perquisite-card-new', ...tx('perquisite.new') }) : null,
      ]),
      el('span', { class: 'perquisite-card-name', ...tx(`perquisite.${id}.name`) }),
      el('span', { class: 'perquisite-card-effect', id: effectId, ...tx(`perquisite.${id}.effect`, now) }),
      was ? el('span', { class: 'perquisite-card-was', ...tx(`perquisite.${id}.was`, was) }) : null,
    ]);
    button._perquisite = id;
    button.addEventListener('click', () => this.close(id));
    return button;
  }

  // The card for `id`, while open.
  cardFor(id) {
    return this.cards.find((c) => c._perquisite === id) ?? null;
  }

  // Esc, Back and a press on the dim: nothing. A Perquisite must be picked.
  dismiss() {}

  close(id) {
    if (!this.resolve) return;
    this.hide(false);
    const resolve = this.resolve;
    this.resolve = null;
    resolve(id);
  }
}
