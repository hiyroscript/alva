// SELECT MODE: a compact Quick Battle card beside a Mode details panel. The
// card sits in a rail so future modes slot in beside it. Hovering a card is a
// preview only; click or confirm opens Quick Battle's play-type choice
// (app.choiceDialog): Custom Play or Regular Play, the default. Either one
// becomes app.selection.playType and continues to Select Difficulty;
// dismissing it stays here, focus back on the card. Coming Back here and
// selecting Quick Battle again asks again.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { tx, tattr, iconLabel } from '../localization/i18n.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader, refreshSteps, quickBattleSetup, resolvePlayType } from '../ui/components.js';

// Quick Battle's play types as the choice dialog offers them, in order:
// labels and lines are translation keys.
const PLAY_CHOICES = [
  { value: 'custom', label: 'quickPlay.custom.name', description: 'quickPlay.custom.description' },
  { value: 'regular', label: 'quickPlay.regular.name', description: 'quickPlay.regular.description' },
];

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
    card.addEventListener('click', () => this.choosePlayType(mode));

    const info = el('aside', { class: 'mode-info', ...tattr('aria-label', 'mode.details') }, [
      el('h2', { class: 'panel-title', ...tx('mode.details') }),
    ]);

    this.el.replaceChildren(
      screenHeader({
        title: 'mode.title', kicker: 'mode.kicker', setup: () => quickBattleSetup(app.selection), step: 0, onBack: () => this.onBack(),
      }),
      el('div', { class: 'screen-body mode-layout' }, [el('div', { class: 'mode-rail' }, [card]), info]),
    );
  }

  enter() {
    refreshSteps(this.el);
  }

  // Asks Custom Play or Regular Play; a choice continues, a dismissal stays.
  async choosePlayType(mode) {
    const app = this.app;
    const type = await app.choiceDialog.open({
      kicker: mode.name, title: 'quickPlay.title', choices: PLAY_CHOICES, defaultValue: 'regular',
    });
    if (!type || app.screens.current !== this) return;
    app.selection.mode = mode.id;
    app.selection.playType = resolvePlayType(type);
    app.screens.go('difficulty');
  }
}
