// SELECT FIGHTER: the shared fighter roster (js/ui/fighter-roster.js) as a
// full screen: a large 48-slot grid beside an animated preview panel.
// Confirming a fighter makes it Quick Battle's selection and moves on to
// Select Stage.
//
// Watch Mode's Select CPU 1 and Select CPU 2 are two more instances
// (js/screens/watch-screens.js), each with its own roster: the options below
// name the screen and its title, its setup and step, where its choice is kept
// (`selection()[key]`), the screen that follows and the roster's preview id,
// so the rosters never share an element id. Left out, they are Quick Battle's.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { screenHeader, QUICK_BATTLE_SETUP } from '../ui/components.js';
import { FighterRoster } from '../ui/fighter-roster.js';

export class CharacterSelectScreen extends Screen {
  constructor(app, {
    id = 'character', title = 'Select Fighter', setup = QUICK_BATTLE_SETUP, step = 2,
    selection = () => app.selection, key = 'characterId', next = 'map', previewId = 'preview-name',
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
      screenHeader({ title, kicker: setup.name, setup, step, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body char-layout' }, [this.roster.rosterPanel, this.roster.previewPanel]),
    );
  }

  // The fighter this screen last confirmed (unknown or stale: the roster
  // falls back to the first available one).
  get chosenId() {
    return this.selection()[this.key];
  }

  get defaultSlot() {
    return this.roster.slotFor(this.chosenId);
  }

  focusDefault() {
    this.defaultSlot.focus({ preventScroll: true });
  }

  enter() {
    this.roster.show(this.chosenId);
  }

  confirm(def) {
    this.selection()[this.key] = def.id;
    this.app.screens.go(this.next);
  }

  update(dt) {
    this.roster.update(dt);
  }
}
