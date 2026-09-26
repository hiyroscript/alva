// SELECT MODE: a compact Quick Battle card beside a Mode details panel. The
// card sits in a rail so future modes slot in beside it. Hovering a card is a
// preview only; click or confirm selects the mode and continues.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader } from '../ui/components.js';

const MODES = [
  {
    id: 'quick-battle',
    index: '01',
    name: 'Quick Battle',
    description: 'Choose a difficulty, a fighter and a stage, then enter battle.',
  },
];

export class ModeSelectScreen extends Screen {
  constructor(app) {
    super(app, 'mode');
    const mode = MODES[0];
    // Keyboard/gamepad still focus the card; mouse hover must not.
    const card = el('button', {
      class: 'mode-card', type: 'button', 'data-nav': true, 'data-nav-default': true,
      'data-nav-no-hover-focus': true, 'aria-describedby': 'mode-desc',
    }, [
      el('span', { class: 'mode-index', text: `Mode ${mode.index}` }),
      el('span', { class: 'mode-name', text: mode.name }),
      el('span', { class: 'mode-desc', id: 'mode-desc', text: mode.description }),
      el('span', { class: 'mode-cta', html: `Select ${ICONS.arrow}` }),
    ]);
    card.addEventListener('click', () => {
      app.selection.mode = mode.id;
      app.screens.go('difficulty');
    });

    const info = el('aside', { class: 'mode-info', 'aria-label': 'Mode details' }, [
      el('h2', { class: 'panel-title', text: 'Mode details' }),
    ]);

    this.el.replaceChildren(
      screenHeader({ title: 'Select Mode', kicker: 'Play', step: 0, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body mode-layout' }, [el('div', { class: 'mode-rail' }, [card]), info]),
    );
  }
}
