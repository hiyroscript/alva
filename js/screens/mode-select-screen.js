// SELECT MODE: a compact Quick Battle card beside a Mode details panel. The
// card sits in a rail so future modes slot in beside it. Hovering a card is a
// preview only; click or confirm selects the mode and continues.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { tx, tattr, iconLabel } from '../core/i18n.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader } from '../ui/components.js';

// Each mode's name and line are translation keys.
const MODES = [
  {
    id: 'quick-battle',
    index: '01',
    name: 'setup.quickBattle',
    description: 'mode.quickBattle.description',
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
      el('span', { class: 'mode-index', ...tx('mode.index', { index: mode.index }) }),
      el('span', { class: 'mode-name', ...tx(mode.name) }),
      el('span', { class: 'mode-desc', id: 'mode-desc', ...tx(mode.description) }),
      el('span', { class: 'mode-cta', ...iconLabel('mode.select', ICONS.arrow) }),
    ]);
    card.addEventListener('click', () => {
      app.selection.mode = mode.id;
      app.screens.go('difficulty');
    });

    const info = el('aside', { class: 'mode-info', ...tattr('aria-label', 'mode.details') }, [
      el('h2', { class: 'panel-title', ...tx('mode.details') }),
    ]);

    this.el.replaceChildren(
      screenHeader({ title: 'mode.title', kicker: 'mode.kicker', step: 0, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body mode-layout' }, [el('div', { class: 'mode-rail' }, [card]), info]),
    );
  }
}
