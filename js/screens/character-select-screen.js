// SELECT FIGHTER: the shared fighter roster (js/ui/fighter-roster.js) as a
// full screen: a large 48-slot grid beside an animated preview panel.
// Confirming a fighter makes it Player 1's in Quick Battle, then Custom Play
// moves on to Select CPU and Regular Play draws the CPU's fighter and the
// stage and starts the Battle (js/screens/quick-battle-setup.js).
//
// Quick Battle's Select CPU (js/screens/quick-cpu-screen.js) and Watch Mode's
// Select CPU 1 and Select CPU 2 (js/screens/watch-screens.js) are more
// instances, each with its own roster: the options below name the screen and
// its title, its setup and step, where its choice is kept
// (`selection()[key]`), what follows (a screen id, or a function that
// continues) and the roster's preview id, so the rosters never share an
// element id. Left out, they are Quick Battle's Select Fighter, whose steps
// follow the play type. The title is a translation key, or [key, params].

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { screenHeader, refreshSteps, currentSetup, quickBattleSetup } from '../ui/components.js';
import { continueAfterFighter } from './quick-battle-setup.js';
import { FighterRoster } from '../ui/fighter-roster.js';
import { isPlayable } from '../data/characters.js';

export class CharacterSelectScreen extends Screen {
  constructor(app, {
    id = 'character', title = 'character.title', setup = () => quickBattleSetup(app.selection), step = 2,
    selection = () => app.selection, key = 'characterId', next = () => continueAfterFighter(app), previewId = 'preview-name',
  } = {}) {
    super(app, id);
    this.selection = selection;
    this.key = key;
    this.next = next;
    this.roster = new FighterRoster(app, {
      host: this.el,
      previewId,
      onConfirm: (def) => this.confirm(def),
    });

    this.el.replaceChildren(
      screenHeader({ title, kicker: currentSetup(setup).name, setup, step, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body char-layout' }, [this.roster.rosterPanel, this.roster.previewPanel]),
    );
  }

  // The fighter this screen last confirmed (unknown, stale or disabled: the
  // roster falls back to the first playable one, else selects nothing).
  get chosenId() {
    return this.selection()[this.key];
  }

  // Null while no fighter is playable.
  get defaultSlot() {
    return this.roster.slotFor(this.chosenId);
  }

  // The chosen fighter's slot, else (no playable fighter) the header's Back.
  focusDefault() {
    const slot = this.defaultSlot;
    if (slot) slot.focus({ preventScroll: true });
    else super.focusDefault();
  }

  enter() {
    refreshSteps(this.el);
    this.roster.show(this.chosenId);
  }

  confirm(def) {
    if (!isPlayable(def)) return;
    this.selection()[this.key] = def.id;
    if (typeof this.next === 'function') this.next();
    else this.app.screens.go(this.next);
  }

  update(dt) {
    this.roster.update(dt);
  }
}
