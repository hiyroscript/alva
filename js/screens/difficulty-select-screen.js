// SELECT DIFFICULTY: Quick Battle's second step, between Select Mode and
// Select Fighter. Four levels in ascending order, each a large card with its
// index, a four-bar scale (one bar lit for Easy up to all four for Brutal),
// its name and a short line. Choosing one makes it Quick Battle's difficulty
// (app.selection.difficulty) and moves on to Select Fighter; the level only
// changes how the CPU thinks (js/data/difficulty.js), never its fighter.
//
// Watch Mode's first step is another instance (js/screens/watch-screens.js):
// the options below name its screen, its setup and step, where its choice is
// kept and the screen that follows. Left out, they are Quick Battle's.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader, QUICK_BATTLE_SETUP } from '../ui/components.js';
import { DIFFICULTIES, resolveDifficulty } from '../data/difficulty.js';

const LEVELS = DIFFICULTIES.length;

export class DifficultySelectScreen extends Screen {
  constructor(app, {
    id = 'difficulty', setup = QUICK_BATTLE_SETUP, step = 1, selection = () => app.selection, next = 'character',
  } = {}) {
    super(app, id);
    // The object holding this setup's `difficulty`, read on every use.
    this.selection = selection;
    this.next = next;
    this.cards = DIFFICULTIES.map((d) => {
      const descId = `${id}-desc-${d.id}`;
      // The scale is a shape as well as a tone: lit bars are solid, the rest
      // hollow, so the level never relies on colour alone.
      const bars = Array.from({ length: LEVELS }, (_, i) => el('i', { class: i < d.level ? 'is-on' : null }));
      // Like the Mode card, hovering is a preview only: keyboard and gamepad
      // focus stays on the current level until moved.
      const card = el('button', {
        class: 'difficulty-card', type: 'button', 'data-nav': true, 'data-nav-no-hover-focus': true, 'data-difficulty': d.id,
        'data-level': String(d.level),
        'aria-label': `${d.name}, level ${d.level} of ${LEVELS}`, 'aria-describedby': descId,
      }, [
        el('span', { class: 'difficulty-top' }, [
          el('span', { class: 'difficulty-index', 'aria-hidden': 'true', text: d.index }),
          el('span', { class: 'difficulty-current', 'aria-hidden': 'true', html: `${ICONS.check}<span>Current</span>` }),
        ]),
        el('span', { class: 'difficulty-bars', 'aria-hidden': 'true' }, bars),
        el('span', { class: 'difficulty-text' }, [
          el('span', { class: 'difficulty-name', text: d.name }),
          el('span', { class: 'difficulty-desc', id: descId, text: d.description }),
        ]),
      ]);
      card._difficulty = d;
      card.addEventListener('click', () => this.choose(d.id));
      return card;
    });

    this.el.replaceChildren(
      screenHeader({ title: 'Select Difficulty', kicker: setup.name, setup, step, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body difficulty-layout' }, [
        el('div', { class: 'difficulty-scale', role: 'group', 'aria-label': 'Difficulty' }, this.cards),
      ]),
    );
  }

  get current() {
    return resolveDifficulty(this.selection().difficulty);
  }

  cardFor(id) {
    return this.cards.find((c) => c._difficulty.id === id);
  }

  // Returning here (Back from Select Fighter) lands on the level already
  // chosen; a fresh setup lands on Medium, the default.
  focusDefault() {
    this.cardFor(this.current).focus({ preventScroll: true });
  }

  enter() {
    this.markCurrent();
  }

  markCurrent() {
    const current = this.current;
    for (const card of this.cards) {
      const on = card._difficulty.id === current;
      card.classList.toggle('is-current', on);
      card.setAttribute('aria-current', on ? 'true' : 'false');
    }
  }

  choose(id) {
    this.selection().difficulty = resolveDifficulty(id);
    this.markCurrent();
    this.app.screens.go(this.next);
  }
}
