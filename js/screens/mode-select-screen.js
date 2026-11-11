// SELECT MODE: a rail of mode cards beside a Mode details panel, two modes
// in order: 01 Adventure (the default card and the first focus) and 02
// Quick Battle. Hovering a card is a preview only; click or confirm selects
// it.
//
// Adventure (js/data/adventure.js) needs no further choice here: it becomes
// app.selection.mode and opens its level selector (adventure-levels) at
// once. Quick Battle opens its play-type choice (app.choiceDialog): Custom
// Play or Regular Play, the default. Either one becomes
// app.selection.playType and continues to Select Difficulty; dismissing it
// stays here, focus back on the card. Coming Back here and selecting Quick
// Battle again asks again.
//
// The setup steps in the header follow the mode focused (or, coming Back,
// the one selected): Adventure's Mode · Level · Fighter, Quick Battle's
// those of its play type. The details panel describes both modes, Adventure
// first; on a short window its text scrolls, and once it does the arrows
// reach it from the cards (up and down then scroll it).

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { tx, tattr, iconLabel } from '../localization/i18n.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader, refreshSteps, quickBattleSetup, adventureSetup, resolvePlayType } from '../ui/components.js';

// Quick Battle's play types as the choice dialog offers them, in order:
// labels and lines are translation keys.
const PLAY_CHOICES = [
  { value: 'custom', label: 'quickPlay.custom.name', description: 'quickPlay.custom.description' },
  { value: 'regular', label: 'quickPlay.regular.name', description: 'quickPlay.regular.description' },
];

// Each mode, in the rail's order: its id (app.selection.mode), its index,
// and its name, line and details as translation keys.
export const MODES = Object.freeze([
  Object.freeze({
    id: 'adventure',
    index: '01',
    name: 'setup.adventure',
    description: 'mode.adventure.description',
    details: Object.freeze(['mode.adventure.overview', 'mode.adventure.rules.description']),
  }),
  Object.freeze({
    id: 'quick-battle',
    index: '02',
    name: 'setup.quickBattle',
    description: 'mode.quickBattle.description',
    details: Object.freeze(['mode.quickBattle.overview', 'mode.quickBattle.rules.description']),
  }),
]);

// The card focused on a fresh visit.
export const DEFAULT_MODE = 'adventure';

// How far one press of up or down scrolls the details.
const DETAILS_STEP = 48;

export class ModeSelectScreen extends Screen {
  constructor(app) {
    super(app, 'mode');
    // The mode whose steps the header shows (see stepsSetup).
    this.focusedMode = DEFAULT_MODE;
    this.cards = MODES.map((mode) => {
      const descId = `mode-desc-${mode.id}`;
      // Keyboard/gamepad still focus a card; mouse hover must not.
      const card = el('button', {
        class: 'mode-card', type: 'button', 'data-nav': true, 'data-nav-default': mode.id === DEFAULT_MODE || null,
        'data-nav-no-hover-focus': true, 'data-mode': mode.id, 'aria-describedby': descId,
      }, [
        el('span', { class: 'mode-index', ...tx('mode.index', { index: mode.index }) }),
        el('span', { class: 'mode-name', ...tx(mode.name) }),
        el('span', { class: 'mode-desc', id: descId, ...tx(mode.description) }),
        el('span', { class: 'mode-cta', ...iconLabel('mode.select', ICONS.arrow) }),
      ]);
      card._mode = mode;
      card.addEventListener('click', () => this.select(mode));
      card.addEventListener('focus', () => this.follow(mode.id));
      return card;
    });

    // The details: every mode's, in the rail's order. Focusable (and in
    // the arrows' reach) only while its text overflows (syncDetails).
    this.details = el('div', { class: 'mode-info-content' },
      MODES.map((mode) => el('section', { class: 'mode-info-section', 'data-mode': mode.id }, [
        el('h3', { class: 'mode-info-heading', ...tx(mode.name) }),
        ...mode.details.map((key) => el('p', { class: 'mode-info-description', ...tx(key) })),
      ])));
    const info = el('aside', { class: 'mode-info', ...tattr('aria-label', 'mode.details') }, [
      el('h2', { class: 'panel-title', ...tx('mode.details') }),
      this.details,
    ]);

    this.el.replaceChildren(
      screenHeader({
        title: 'mode.title', kicker: 'mode.kicker', setup: () => this.stepsSetup(), step: 0, onBack: () => this.onBack(),
      }),
      el('div', { class: 'screen-body mode-layout' }, [el('div', { class: 'mode-rail', role: 'group', ...tattr('aria-label', 'mode.group') }, this.cards), info]),
    );
    this.resizeObserver = globalThis.ResizeObserver ? new ResizeObserver(() => this.syncDetails()) : null;
    this.resizeObserver?.observe?.(this.details);
  }

  // Mode `id`'s card.
  cardFor(id) {
    return this.cards.find((c) => c._mode.id === id) ?? null;
  }

  // The setup the header shows: the focused mode's.
  stepsSetup() {
    return this.focusedMode === 'adventure' ? adventureSetup() : quickBattleSetup(this.app.selection);
  }

  // A card took focus: the steps follow it.
  follow(id) {
    if (this.focusedMode === id) return;
    this.focusedMode = id;
    refreshSteps(this.el);
  }

  // A fresh visit lands on Adventure; coming Back (from a mode's first
  // step) on the mode selected, so its steps show the path chosen.
  enter(params) {
    const selected = MODES.some((m) => m.id === this.app.selection.mode) ? this.app.selection.mode : DEFAULT_MODE;
    this.landing = params?.fromBack ? selected : DEFAULT_MODE;
    this.focusedMode = this.landing;
    refreshSteps(this.el);
    this.syncDetails();
  }

  focusDefault() {
    const card = this.cardFor(this.landing ?? DEFAULT_MODE);
    if (card) card.focus({ preventScroll: true });
    else super.focusDefault();
  }

  // The details join the arrows' reach only while they scroll.
  syncDetails() {
    const d = this.details;
    const scrolls = (d.scrollHeight ?? 0) > (d.clientHeight ?? 0) + 1;
    if (scrolls) {
      d.setAttribute('data-nav', '');
      d.setAttribute('tabindex', '0');
    } else {
      d.removeAttribute('data-nav');
      d.removeAttribute('tabindex');
    }
  }

  // Up and down scroll the details while they have focus, until their
  // top: up from there goes back to the cards.
  onCommand(cmd) {
    if (document.activeElement !== this.details || (cmd !== 'up' && cmd !== 'down')) return false;
    if (cmd === 'up' && !(this.details.scrollTop > 0)) return false;
    this.details.scrollBy?.({ top: cmd === 'up' ? -DETAILS_STEP : DETAILS_STEP, behavior: 'auto' });
    return true;
  }

  select(mode) {
    if (mode.id === 'adventure') {
      this.app.selection.mode = 'adventure';
      this.app.screens.go('adventure-levels');
      return;
    }
    this.choosePlayType(mode);
  }

  // Asks Custom Play or Regular Play; a choice continues, a dismissal stays,
  // focus back on the card (focused first, whatever pressed it, so its
  // steps show and the dialog hands focus back to it).
  async choosePlayType(mode) {
    const app = this.app;
    this.cardFor(mode.id)?.focus({ preventScroll: true });
    const type = await app.choiceDialog.open({
      kicker: mode.name, title: 'quickPlay.title', choices: PLAY_CHOICES, defaultValue: 'regular',
    });
    if (!type || app.screens.current !== this) return;
    app.selection.mode = mode.id;
    app.selection.playType = resolvePlayType(type);
    app.screens.go('difficulty');
  }
}
