// SELECT FIGHTER: the shared fighter roster (js/ui/fighter-roster.js) as a
// full screen: a large 48-slot grid beside an animated preview panel.
// Confirming a fighter makes it Quick Battle's selection and moves on to
// Select Stage.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { screenHeader } from '../ui/components.js';
import { FighterRoster } from '../ui/fighter-roster.js';

export class CharacterSelectScreen extends Screen {
  constructor(app) {
    super(app, 'character');
    this.roster = new FighterRoster(app, {
      host: this.el,
      onConfirm: (def) => this.confirm(def),
    });

    this.el.replaceChildren(
      screenHeader({ title: 'Select Fighter', kicker: 'Quick Battle', step: 2, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body char-layout' }, [this.roster.rosterPanel, this.roster.previewPanel]),
    );
  }

  get defaultSlot() {
    return this.roster.slotFor(this.app.selection.characterId);
  }

  focusDefault() {
    this.defaultSlot.focus({ preventScroll: true });
  }

  enter() {
    this.roster.show(this.app.selection.characterId);
  }

  confirm(def) {
    this.app.selection.characterId = def.id;
    this.app.screens.go('map');
  }

  update(dt) {
    this.roster.update(dt);
  }
}
