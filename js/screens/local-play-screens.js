// LOCAL PLAY: two people on one device, each on their own controller.
//
//   Home → Select local mode → Player 1's fighter → Player 2's fighter → Stage → Battle
//
// Home's Local play opens only while two supported controllers are active
// (js/core/controller-manager.js localReady) and starts a Local Play session
// (App.startLocalPlay): each player keeps their own controller until Home.
// Select local mode is Select Mode's own design (the mode card in its rail
// beside Mode details) with Local Play's modes, Quick Battle alone for now.
// Its three setup steps are Quick Battle's own screens configured for Local
// Play (the same fighter roster and stage selector), under the kicker "Local
// quick battle" with the Local Play steps. Their choices live in
// app.selection.local (each player's fighter and the stage), apart from
// Quick Battle's and Watch Mode's, so no setup ever changes another's; both
// players may pick the same fighter.
//
// Each step belongs to one player's controller (its menuOwner: Player 1's on
// Select local mode, its own fighter and the stage; Player 2's on its own
// fighter): only that controller moves, chooses, confirms and goes Back
// there, and a choice is taken from it alone (accepts: the keyboard, the
// pointer and the other player's controller never choose a fighter or a
// stage; Back stays open to them). While either controller is lost the
// setup waits (onHold): nothing is chosen or started, the choices made so
// far stay, and the turn note says which controller to reconnect; it goes
// on as soon as that controller is back. Starting hands the Battle screen
// `mode: 'local'`: a real Battle where both fighters are players.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { tx, tattr, iconLabel, setText } from '../localization/i18n.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader, refreshSteps, LOCAL_SETUP } from '../ui/components.js';
import { CharacterSelectScreen } from './character-select-screen.js';
import { MapSelectScreen } from './map-select-screen.js';
import { deviceName } from '../ui/controller-dialog.js';
import { playerChip, TurnNote, LOCAL_SLOTS } from '../ui/local-play.js';

// Local Play's modes, in order (only Quick Battle for now): each one's name
// and lines are translation keys, `first` the screen its setup starts on.
export const LOCAL_MODES = Object.freeze([
  Object.freeze({
    id: 'quick-battle',
    index: '01',
    name: 'setup.quickBattle',
    description: 'localMode.quickBattle.description',
    overview: 'localMode.quickBattle.overview',
    rules: 'localMode.quickBattle.rules.description',
    first: 'local-character-p1',
  }),
]);

// Whether a Local Play setup can go on: a session with both players'
// controllers connected (App.startLocalPlay starts one when there is none).
export function localPlayReady(app) {
  if (!app.controllers?.inLocal && !app.startLocalPlay?.()) return false;
  return !!app.controllers?.localReady;
}

// The behaviour every Local Play setup step shares, for a step owned by
// `owner`'s controller: its turn note, kept up to date with the
// controllers while the step shows, and the checks on whose input chooses.
class LocalStep {
  constructor(screen, owner, note = new TurnNote(owner)) {
    this.screen = screen;
    this.app = screen.app;
    this.owner = owner;
    this.note = note;
    this.unsubscribe = null;
  }

  enter() {
    this.unsubscribe?.();
    this.unsubscribe = this.app.controllers?.onChange(() => this.render()) ?? null;
    this.render();
  }

  exit() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // The note, and the step's own controls, after any change of controller.
  render() {
    this.note.render(this.app.controllers);
    this.screen.refreshHold?.();
  }

  // A controller is lost: nothing is chosen until it is back.
  get onHold() {
    return (this.app.controllers?.missingPlayers?.().length ?? 0) > 0;
  }

  // The command being handled came from this step's player's controller.
  get accepts() {
    return this.app.nav?.commandSource === this.owner;
  }
}

// SELECT LOCAL MODE.
export class LocalModeSelectScreen extends Screen {
  constructor(app) {
    super(app, 'local-mode');
    this.step = new LocalStep(this, 'p1');
    const mode = LOCAL_MODES[0];
    this.mode = mode;
    // Keyboard/gamepad still focus the card; mouse hover must not.
    const card = el('button', {
      class: 'mode-card', type: 'button', 'data-nav': true, 'data-nav-default': true,
      'data-nav-no-hover-focus': true, 'data-mode': mode.id, 'aria-describedby': 'local-mode-desc',
    }, [
      el('span', { class: 'mode-index', ...tx('mode.index', { index: mode.index }) }),
      el('span', { class: 'mode-name', ...tx(mode.name) }),
      el('span', { class: 'mode-desc', id: 'local-mode-desc', ...tx(mode.description) }),
      el('span', { class: 'mode-cta', ...iconLabel('mode.select', ICONS.arrow) }),
    ]);
    card.addEventListener('click', () => this.choose(mode));
    this.card = card;

    // Mode details: the mode, then which controller each player has.
    this.devices = Object.fromEntries(LOCAL_SLOTS.map((slot) => [slot, el('span', { class: 'local-device-name' })]));
    const info = el('aside', { class: 'mode-info', ...tattr('aria-label', 'mode.details') }, [
      el('h2', { class: 'panel-title', ...tx('mode.details') }),
      el('div', { class: 'mode-info-content' }, [
        el('section', { class: 'mode-info-section' }, [
          el('h3', { class: 'mode-info-heading', ...tx('setup.localQuickBattle') }),
          el('p', { class: 'mode-info-description', ...tx(mode.overview) }),
          el('p', { class: 'mode-info-description', ...tx(mode.rules) }),
        ]),
        el('section', { class: 'mode-info-section local-devices' }, [
          el('h3', { class: 'mode-info-heading', ...tx('localMode.controllers') }),
          el('ul', { class: 'local-device-list' }, LOCAL_SLOTS.map((slot) =>
            el('li', { class: `local-device local-device--${slot}` }, [playerChip(slot, { name: true }), this.devices[slot]]))),
        ]),
      ]),
    ]);

    this.el.replaceChildren(
      screenHeader({ title: 'localMode.title', kicker: 'localMode.kicker', setup: LOCAL_SETUP, step: -1, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body mode-layout' }, [el('div', { class: 'mode-rail local-mode-rail' }, [card, this.step.note.el]), info]),
    );
  }

  enter() {
    refreshSteps(this.el);
    localPlayReady(this.app);
    this.step.enter();
  }

  exit() {
    this.step.exit();
  }

  // Each player's controller by name, or that it is disconnected.
  refreshHold() {
    for (const slot of LOCAL_SLOTS) {
      const device = this.app.controllers?.playerDevice?.(slot) ?? null;
      const node = this.devices[slot];
      if (device) {
        node.textContent = deviceName(device);
        node.setAttribute('data-i18n', '');
        node.classList.remove('is-missing');
      } else {
        setText(node, 'localMode.controllerMissing');
        node.classList.add('is-missing');
      }
    }
  }

  localize() {
    this.refreshHold();
  }

  // The mode's setup, once both controllers are there (checked again now:
  // they may have gone since Home).
  choose(mode) {
    if (this.app.screens.current !== this) return;
    if (!localPlayReady(this.app)) {
      this.step.render();
      return;
    }
    this.app.selection.local.mode = mode.id;
    this.app.screens.go(mode.first);
  }
}

// SELECT FIGHTER for Player `n` (1 or 2): its own screen and roster, so the
// back stack holds both and their preview ids differ. Owned by that
// player's controller.
export class LocalFighterScreen extends CharacterSelectScreen {
  constructor(app, n) {
    const slot = `p${n}`;
    const id = `local-character-${slot}`;
    const note = new TurnNote(slot);
    super(app, {
      id,
      title: ['local.fighterTitle', { n }],
      setup: LOCAL_SETUP,
      step: n - 1,
      selection: () => app.selection.local,
      key: `${slot}CharacterId`,
      next: n === 1 ? 'local-character-p2' : 'local-map',
      previewId: `${id}-preview-name`,
      badge: playerChip(slot),
      note: note.el,
    });
    this.slot = slot;
    this.menuOwner = slot;
    this.el.dataset.player = slot;
    this.step = new LocalStep(this, slot, note);
    // Whose fighter the preview shows.
    this.roster.previewPanel.querySelector('.preview-stage')?.append(playerChip(slot, { name: true }));
  }

  enter() {
    super.enter();
    this.step.enter();
  }

  exit() {
    this.step.exit();
  }

  accepts() {
    return this.step.accepts;
  }

  onHold() {
    return this.step.onHold;
  }

  // Confirm follows whether the setup waits.
  refreshHold() {
    this.roster.updateConfirm();
  }
}

// SELECT STAGE, owned by Player 1's controller. Its start button begins the
// Local Play battle with both players' fighters.
export class LocalMapScreen extends MapSelectScreen {
  constructor(app) {
    const note = new TurnNote('p1');
    super(app, {
      id: 'local-map', setup: LOCAL_SETUP, step: 2, selection: () => app.selection.local,
      badge: playerChip('p1'), note: note.el,
    });
    this.menuOwner = 'p1';
    this.el.dataset.player = 'p1';
    this.step = new LocalStep(this, 'p1', note);
  }

  enter() {
    super.enter();
    this.step.enter();
  }

  exit() {
    this.step.exit();
  }

  accepts() {
    return this.step.accepts;
  }

  onHold() {
    return this.step.onHold;
  }

  // Random Stage and the start button wait with the setup.
  refreshHold() {
    const hold = this.onHold();
    this.startBtn.disabled = hold;
    this.randomBtn.disabled = hold;
  }

  battleParams() {
    const { mapId, p1CharacterId, p2CharacterId } = this.selection();
    return { mode: 'local', mapId, p1CharacterId, p2CharacterId };
  }
}
