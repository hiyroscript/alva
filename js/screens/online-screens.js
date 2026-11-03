// ONLINE PLAY: rooms players create and join, then a match between two
// browsers. No accounts and no matchmaking: a player picks a name, then
// creates a room or joins one, by its code or from the public list.
//
//   Home → Online name → Online lobby → (Create room | Join with code | a public room) → Room → Battle
//
// Online name (`online-name`): "Choose a name other players will see.",
// every time, the last one offered again (the settings remember it), with
// Suggest a name for a player on a controller who would rather not type.
// Continue checks the name (js/online/rules.js) and asks the room server
// whether it is there: if not ("Online play is unavailable right now"), back
// to Home.
//
// Online lobby (`online-lobby`): Create room (its dialog: the room's name,
// "{name}'s room" to start with, Public or Private, the mode, Quick Battle
// the one for now, from CONFIG.online.modes), Join with code (5 characters,
// any case), and the public rooms, read again every
// CONFIG.online.listRefreshMs while the lobby shows (never a socket held
// open for it), each with its name, host, mode, players and Join (a full
// room, one in a match or one of another version shown but not
// joinable). "Servers are full" and "Online play is unavailable" are two
// different messages; the lobby stays either way.
//
// Room (`online-room`): its name, code (Copy code, or the code selected
// where the clipboard is blocked, as in itch.io's frame) and both seats (the
// host marked, the player's own "You"), each player's fighter (Choose
// fighter: the shared roster, `online-character`) and Ready. The stage is
// drawn at random when the match starts. While both players are there their
// browsers connect to each other (js/online/online-session.js); Ready opens
// once that link is up, and once both are ready the host's browser starts
// the match. The drawn stage shows a moment, then the Battle
// (js/screens/online-battle-screen.js). The host leaving closes the room:
// "The host closed the room."
//
// Every screen is a menu screen like Local Play's and Quick Battle's setup
// (the screen manager, menu navigation, the same header and panels), for
// the keyboard, touch and controllers. Going offline anywhere here ends
// Online Play: "Connection lost", then Home (App).

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { t, tx, tattr, setText, setAttr } from '../localization/i18n.js';
import { screenHeader } from '../ui/components.js';
import { ModalDialog } from '../ui/overlays.js';
import { ICONS } from '../ui/icons.js';
import { CharacterSelectScreen } from './character-select-screen.js';
import { getPlayableCharacter } from '../data/characters.js';
import { checkName, checkRoomName, fitName, normalizeCode, isValidCode, NAME_LIMITS, ROOM_NAME_LIMITS } from '../online/rules.js';
import { readStart } from '../online/match-setup.js';

// Online Play's setup, as the shared header names it (it has no steps:
// rooms are not a sequence of choices).
export const ONLINE_SETUP = Object.freeze({ name: 'setup.onlineQuickBattle', steps: Object.freeze([]) });

// How long the drawn stage shows before the Battle (milliseconds).
export const STAGE_REVEAL_MS = 1200;

// Each reason Online Play has to tell the player something, by the server's
// error codes and the session's own: its title and message keys.
const NOTICES = Object.freeze({
  full: ['online.full.title', 'online.full.message'],
  unavailable: ['online.unavailable.title', 'online.unavailable.message'],
  rate_limited: ['online.rateLimited.title', 'online.rateLimited.message'],
  room_not_found: ['online.notFound.title', 'online.notFound.message'],
  room_full: ['online.roomFull.title', 'online.roomFull.message'],
  version_mismatch: ['online.versionMismatch.title', 'online.versionMismatch.message'],
  invalid_name: ['online.invalid.title', 'online.invalid.message'],
  invalid_room_name: ['online.invalid.title', 'online.invalid.message'],
  host_left: ['online.hostClosed.title', 'online.hostClosed.message'],
  expired: ['online.hostClosed.title', 'online.expired.message'],
  lost: ['online.lost.title', 'online.lost.message'],
  offline: ['online.lost.title', 'online.offline.message'],
  left: ['online.opponentLeft.title', 'online.opponentLeft.message'],
  timeout: ['online.lost.title', 'online.timeout.message'],
  desync: ['online.desync.title', 'online.desync.message'],
  peer: ['online.peerFailed.title', 'online.peerFailed.message'],
  fighter: ['common.fighterUnavailable', 'online.fighterUnavailable.message'],
  error: ['online.unavailable.title', 'online.error.message'],
});

export const noticeKeys = (code) => NOTICES[code] ?? NOTICES.error;

// Tells the player about `code` in the app's dialog, one button to
// acknowledge; resolves once they have.
export function showNotice(app, code) {
  const [title, message] = noticeKeys(code);
  return app.dialog.open({ title: t(title), message: t(message), confirmLabel: t('online.notice.ok'), notice: true });
}

// The room name a new room starts with: "{name}'s room" in the language in
// use, fitted to a room name's length.
export function defaultRoomName(name) {
  return fitName(t('online.roomDefault', { name }), ROOM_NAME_LIMITS.max);
}

// A text field with its label, hint and error line: { root, input, error }.
function textField({ id, label, hint = null, maxlength, autocomplete = 'off', inputmode = null, autocapitalize = 'off' }) {
  const input = el('input', {
    class: 'online-input', id, type: 'text', 'data-nav': true, maxlength: String(maxlength), autocomplete, spellcheck: 'false',
    autocapitalize, inputmode, enterkeyhint: 'go',
    'aria-describedby': [hint ? `${id}-hint` : null, `${id}-error`].filter(Boolean).join(' '),
  });
  const error = el('p', { class: 'online-error', id: `${id}-error`, role: 'alert' });
  const root = el('div', { class: 'online-field' }, [
    el('label', { class: 'online-label', for: id, ...tx(label) }),
    input,
    hint ? el('p', { class: 'online-hint', id: `${id}-hint`, ...tx(hint) }) : null,
    error,
  ]);
  return { root, input, error };
}

// Enter in `input` calls `fn` (the field's own submit).
function onEnter(input, fn) {
  input.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' && e.key !== 'Enter') return;
    e.preventDefault?.();
    fn();
  });
}

// ---- Online name -------------------------------------------------------------------

export class OnlineNameScreen extends Screen {
  constructor(app) {
    super(app, 'online-name');
    this.field = textField({
      id: 'online-name-input', label: 'online.name.label', hint: 'online.name.rules', maxlength: 32,
      autocomplete: 'nickname', autocapitalize: 'words',
    });
    this.suggestButton = el('button', { class: 'btn', type: 'button', 'data-nav': true, ...tx('online.name.suggest') });
    this.continueButton = el('button', { class: 'btn btn--primary', type: 'button', 'data-nav': true, ...tx('online.continue') });
    this.status = el('p', { class: 'online-status', role: 'status', 'aria-live': 'polite' });
    this.suggestButton.addEventListener('click', () => this.suggest());
    this.continueButton.addEventListener('click', () => this.submit());
    this.field.input.addEventListener('input', () => this.clearError());
    onEnter(this.field.input, () => this.submit());
    this.el.replaceChildren(
      screenHeader({ title: 'online.name.title', kicker: 'setup.online', onBack: () => this.onBack() }),
      el('div', { class: 'screen-body online-layout online-layout--single' }, [
        el('section', { class: 'online-panel online-name-panel' }, [
          el('p', { class: 'online-lede', ...tx('online.name.lede') }),
          this.field.root,
          el('div', { class: 'online-actions' }, [this.suggestButton, this.continueButton]),
          this.status,
        ]),
      ]),
    );
    this.busy = false;
  }

  get session() {
    return this.app.online;
  }

  clearError() {
    this.field.error.textContent = '';
    this.field.error.removeAttribute('data-i18n');
    this.field.input.removeAttribute('aria-invalid');
  }

  enter() {
    this.busy = false;
    this.continueButton.disabled = false;
    this.status.textContent = '';
    this.clearError();
    this.field.input.value = this.session?.name ?? this.app.settings?.onlineName ?? '';
  }

  // A remembered name: Continue, one press away (a controller never has to
  // type); none yet: the field.
  focusDefault() {
    const target = checkName(this.field.input.value).ok ? this.continueButton : this.field.input;
    target.focus({ preventScroll: true });
  }

  onBack() {
    this.app.screens.go('home', {}, { reset: true });
  }

  // A name to start from: Player and four digits.
  suggest() {
    this.field.input.value = t('online.name.suggested', { n: 1000 + Math.floor(Math.random() * 9000) });
    this.clearError();
    this.continueButton.focus({ preventScroll: true });
  }

  showError(error) {
    setText(this.field.error, `online.name.error.${error}`, { max: NAME_LIMITS.max });
    this.field.input.setAttribute('aria-invalid', 'true');
  }

  async submit() {
    if (this.busy || this.app.screens.current !== this) return;
    const checked = checkName(this.field.input.value);
    if (!checked.ok) {
      this.showError(checked.error);
      this.field.input.focus({ preventScroll: true });
      return;
    }
    this.field.input.value = checked.value;
    this.app.settings?.setOnlineName?.(checked.value);
    this.session.name = checked.value;
    this.busy = true;
    this.continueButton.disabled = true;
    setText(this.status, 'online.connecting');
    try {
      await this.session.probe();
      if (this.app.screens.current !== this) return;
      this.app.screens.go('online-lobby');
    } catch (err) {
      if (this.app.screens.current !== this) return;
      const code = err?.code ?? 'unavailable';
      await showNotice(this.app, code);
      // No server at all: Online Play ends here, back Home.
      if (code === 'unavailable' && this.app.screens.current === this) this.app.screens.go('home', {}, { reset: true });
    } finally {
      this.busy = false;
      this.continueButton.disabled = false;
      this.status.textContent = '';
    }
  }
}

// ---- Create room ---------------------------------------------------------------------

// The Create room form, a dialog over the lobby: the room's name, its
// visibility (Public, listed in the lobby; Private, joinable only with its
// code) and its mode (CONFIG.online.modes, Quick Battle alone for now,
// shown as a choice of one so more fit in later). Resolves with { name,
// visibility, mode } or null (Cancel, Esc, Back, the X).
export class CreateRoomDialog extends ModalDialog {
  constructor(root, app) {
    super(root, app, 'online-create-title');
    this.resolve = null;
    this.field = textField({ id: 'online-room-name', label: 'online.createRoom.name', maxlength: 40, autocapitalize: 'sentences' });
    onEnter(this.field.input, () => this.submit());
    this.field.input.addEventListener('input', () => {
      this.field.error.textContent = '';
      this.field.input.removeAttribute('aria-invalid');
    });
    this.closeButton = el('button', {
      class: 'dialog-close', type: 'button', 'data-nav': true, ...tattr('aria-label', 'common.close'), html: ICONS.close,
    });
    this.closeButton.addEventListener('click', () => this.close(null));
    this.visibility = 'public';
    this.visibilityButtons = ['public', 'private'].map((value) => {
      const button = el('button', {
        class: 'online-choice', type: 'button', role: 'radio', 'data-nav': true, 'data-visibility': value,
        'aria-describedby': `online-visibility-${value}`,
      }, [
        el('span', { class: 'online-choice-name', ...tx(`online.visibility.${value}`) }),
        el('span', { class: 'online-choice-desc', id: `online-visibility-${value}`, ...tx(`online.visibility.${value}.description`) }),
      ]);
      button.addEventListener('click', () => this.setVisibility(value));
      return button;
    });
    this.mode = CONFIG.online.modes[0];
    this.modeButtons = CONFIG.online.modes.map((mode) => {
      const button = el('button', {
        class: 'online-choice online-choice--mode', type: 'button', role: 'radio', 'data-nav': true, 'data-mode': mode,
      }, [el('span', { class: 'online-choice-name', ...tx(modeName(mode)) })]);
      button.addEventListener('click', () => this.setMode(mode));
      return button;
    });
    this.cancelButton = el('button', { class: 'btn', type: 'button', 'data-nav': true, ...tx('common.cancel') });
    this.createButton = el('button', { class: 'btn btn--primary', type: 'button', 'data-nav': true, ...tx('online.createRoom.confirm') });
    this.cancelButton.addEventListener('click', () => this.close(null));
    this.createButton.addEventListener('click', () => this.submit());
    root.replaceChildren(
      el('div', { class: 'dialog-panel online-dialog glass glass--panel' }, [
        el('div', { class: 'choice-header' }, [
          el('div', { class: 'choice-heading' }, [
            el('span', { class: 'kicker', ...tx('setup.online') }),
            el('h2', { class: 'dialog-title', id: 'online-create-title', ...tx('online.createRoom.title') }),
          ]),
          this.closeButton,
        ]),
        this.field.root,
        el('fieldset', { class: 'online-choices', role: 'radiogroup', 'aria-labelledby': 'online-visibility-legend' }, [
          el('legend', { class: 'online-label', id: 'online-visibility-legend', ...tx('online.visibility') }),
          el('div', { class: 'online-choice-row' }, this.visibilityButtons),
        ]),
        el('fieldset', { class: 'online-choices', role: 'radiogroup', 'aria-labelledby': 'online-mode-legend' }, [
          el('legend', { class: 'online-label', id: 'online-mode-legend', ...tx('online.mode') }),
          el('div', { class: 'online-choice-row' }, this.modeButtons),
        ]),
        el('div', { class: 'dialog-actions' }, [this.cancelButton, this.createButton]),
      ]),
    );
  }

  get isOpen() {
    return !!this.resolve;
  }

  setVisibility(value) {
    this.visibility = value;
    for (const b of this.visibilityButtons) b.setAttribute('aria-checked', String(b.getAttribute('data-visibility') === value));
  }

  setMode(mode) {
    this.mode = mode;
    for (const b of this.modeButtons) b.setAttribute('aria-checked', String(b.getAttribute('data-mode') === mode));
  }

  // Opens with the room's name to start from (`name`).
  open({ name, opener = null }) {
    if (this.resolve) this.close(null);
    this.field.input.value = name;
    this.field.error.textContent = '';
    this.field.input.removeAttribute('aria-invalid');
    this.setVisibility('public');
    this.setMode(CONFIG.online.modes[0]);
    this.show(this.createButton, opener);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  submit() {
    if (!this.resolve) return;
    const checked = checkRoomName(this.field.input.value);
    if (!checked.ok) {
      setText(this.field.error, `online.name.error.${checked.error}`, { max: ROOM_NAME_LIMITS.max });
      this.field.input.setAttribute('aria-invalid', 'true');
      this.field.input.focus({ preventScroll: true });
      return;
    }
    this.close({ name: checked.value, visibility: this.visibility, mode: this.mode });
  }

  dismiss() {
    this.close(null);
  }

  close(value) {
    if (!this.resolve) return;
    this.hide(value === null);
    const resolve = this.resolve;
    this.resolve = null;
    resolve(value);
  }
}

// A mode's name key (Quick Battle's is the setup's own).
const modeName = (mode) => (mode === CONFIG.online.modes[0] ? 'setup.quickBattle' : `online.mode.${mode}`);

// ---- Online lobby --------------------------------------------------------------------

export class OnlineLobbyScreen extends Screen {
  constructor(app) {
    super(app, 'online-lobby');
    this.playingAs = el('p', { class: 'online-playing-as' });
    const changeName = el('button', { class: 'btn online-change-name', type: 'button', 'data-nav': true, ...tx('online.lobby.changeName') });
    changeName.addEventListener('click', () => this.app.screens.back());
    this.createButton = el('button', { class: 'btn btn--primary online-create', type: 'button', 'data-nav': true, 'data-nav-default': true, 'aria-haspopup': 'dialog', ...tx('online.create') });
    this.createButton.addEventListener('click', () => this.create());
    this.code = textField({ id: 'online-join-code', label: 'online.join.label', maxlength: 7, autocapitalize: 'characters' });
    this.code.input.classList.add('online-input--code');
    this.code.input.addEventListener('input', () => {
      const normalized = normalizeCode(this.code.input.value);
      if (normalized !== this.code.input.value) this.code.input.value = normalized;
      this.code.error.textContent = '';
      this.code.input.removeAttribute('aria-invalid');
    });
    this.joinButton = el('button', { class: 'btn', type: 'button', 'data-nav': true, ...tx('online.join.action') });
    this.joinButton.addEventListener('click', () => this.joinCode());
    onEnter(this.code.input, () => this.joinCode());
    this.listStatus = el('p', { class: 'online-list-status', role: 'status', 'aria-live': 'polite' });
    this.list = el('ul', { class: 'online-room-list', ...tattr('aria-label', 'online.rooms.title') });
    this.el.replaceChildren(
      screenHeader({ title: 'online.lobby.title', kicker: 'setup.online', onBack: () => this.onBack() }),
      el('div', { class: 'screen-body online-layout' }, [
        el('section', { class: 'online-panel online-lobby-actions' }, [
          el('div', { class: 'online-identity' }, [this.playingAs, changeName]),
          this.createButton,
          el('div', { class: 'online-join' }, [
            el('h2', { class: 'panel-title', ...tx('online.join.title') }),
            el('div', { class: 'online-join-row' }, [this.code.root, this.joinButton]),
          ]),
        ]),
        el('section', { class: 'online-panel online-rooms', ...tattr('aria-label', 'online.rooms.title') }, [
          el('h2', { class: 'panel-title', ...tx('online.rooms.title') }),
          this.listStatus,
          this.list,
        ]),
      ]),
    );
    this.rooms = [];
    this.timer = null;
    this.busy = false;
    this.createDialog = app.createRoomDialog ?? null;
  }

  get session() {
    return this.app.online;
  }

  enter() {
    this.busy = false;
    setText(this.playingAs, 'online.lobby.playingAs', { name: this.session?.name ?? '' });
    setText(this.listStatus, 'online.rooms.loading');
    this.list.replaceChildren();
    this.rooms = [];
    this.refresh();
  }

  exit() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  onBack() {
    this.app.online?.leaveRoom?.();
    this.app.screens.go('home', {}, { reset: true });
  }

  // The public rooms, now, then again every CONFIG.online.listRefreshMs
  // while the lobby shows (a hidden page skips its turn).
  async refresh() {
    clearTimeout(this.timer);
    const again = () => {
      if (this.app.screens.current !== this) return;
      this.timer = setTimeout(() => this.refresh(), CONFIG.online.listRefreshMs);
      this.timer?.unref?.();
    };
    if (globalThis.document?.hidden) {
      again();
      return;
    }
    try {
      const rooms = await this.session.listRooms();
      if (this.app.screens.current !== this) return;
      this.render(rooms);
    } catch {
      if (this.app.screens.current !== this) return;
      setText(this.listStatus, 'online.rooms.unavailable');
      this.listStatus.hidden = false;
    }
    again();
  }

  render(rooms) {
    this.rooms = rooms;
    const focused = globalThis.document?.activeElement;
    const focusedId = this.list.contains?.(focused) ? focused.getAttribute('data-room') : null;
    if (!rooms.length) {
      setText(this.listStatus, 'online.rooms.empty');
      this.listStatus.hidden = false;
    } else {
      this.listStatus.hidden = true;
      this.listStatus.textContent = '';
    }
    this.list.replaceChildren(...rooms.map((room) => this.row(room)));
    // Focus stays on the room it was on (the list is drawn afresh).
    if (focusedId) [...this.list.querySelectorAll('[data-room]')].find((b) => b.getAttribute('data-room') === focusedId && !b.disabled)?.focus({ preventScroll: true });
  }

  // One public room: its name, host, mode and players, and Join (or why
  // not).
  row(room) {
    const sameVersion = !room.version || room.version === CONFIG.version;
    const joinable = !!room.joinable && sameVersion;
    const why = !sameVersion ? 'online.rooms.otherVersion' : room.status === 'playing' ? 'online.rooms.playing' : 'online.rooms.full';
    const name = el('span', { class: 'online-room-name' });
    name.textContent = room.name;
    const host = el('span', { class: 'online-room-host', ...tx('online.rooms.host', { name: room.host }) });
    const join = el('button', {
      class: `btn online-room-join${joinable ? ' btn--primary' : ''}`, type: 'button', 'data-nav': true, 'data-room': room.id,
      ...tx(joinable ? 'online.join.action' : why),
    });
    if (joinable) setAttr(join, 'aria-label', 'online.rooms.joinNamed', { name: room.name });
    join.disabled = !joinable;
    join.addEventListener('click', () => this.joinId(room.id));
    return el('li', { class: `online-room${joinable ? '' : ' is-unjoinable'}` }, [
      el('div', { class: 'online-room-text' }, [
        name,
        el('span', { class: 'online-room-meta' }, [
          host,
          el('span', { class: 'online-room-mode', ...tx(modeName(room.mode)) }),
          el('span', { class: 'online-room-players', ...tx('online.rooms.players', { n: room.players }) }),
        ]),
      ]),
      join,
    ]);
  }

  async create() {
    if (this.busy) return;
    const dialog = this.createDialog ?? this.app.createRoomDialog;
    const choice = await dialog.open({ name: defaultRoomName(this.session.name), opener: this.createButton });
    if (!choice || this.app.screens.current !== this) return;
    await this.enterRoom(() => this.session.createRoom(choice));
  }

  async joinCode() {
    const code = normalizeCode(this.code.input.value);
    this.code.input.value = code;
    if (!isValidCode(code)) {
      setText(this.code.error, 'online.join.error.code');
      this.code.input.setAttribute('aria-invalid', 'true');
      this.code.input.focus({ preventScroll: true });
      return;
    }
    await this.enterRoom(() => this.session.joinRoom({ code }));
  }

  joinId(id) {
    return this.enterRoom(() => this.session.joinRoom({ id }));
  }

  // Into the room `attempt` gets a seat in, or the reason it could not.
  async enterRoom(attempt) {
    if (this.busy) return;
    this.busy = true;
    try {
      await attempt();
      if (this.app.screens.current === this) this.app.screens.go('online-room');
    } catch (err) {
      if (this.app.screens.current !== this) return;
      await showNotice(this.app, err?.code ?? 'unavailable');
      if (this.app.screens.current === this) this.refresh();
    } finally {
      this.busy = false;
    }
  }
}

// ---- Room ----------------------------------------------------------------------------

const SEATS = Object.freeze(['host', 'guest']);

export class OnlineRoomScreen extends Screen {
  constructor(app) {
    super(app, 'online-room');
    const header = screenHeader({ title: 'online.room.kicker', kicker: 'online.room.kicker', onBack: () => this.onBack() });
    this.title = header.querySelector('.screen-title');
    this.codeValue = el('input', {
      class: 'online-code', type: 'text', readonly: true, 'data-nav': true, tabindex: '0', id: 'online-room-code',
      'aria-labelledby': 'online-room-code-label', spellcheck: 'false',
    });
    this.copyButton = el('button', { class: 'btn online-copy', type: 'button', 'data-nav': true, ...tx('online.room.copy') });
    this.copyButton.addEventListener('click', () => this.copyCode());
    this.copyStatus = el('p', { class: 'online-hint online-copy-status', role: 'status', 'aria-live': 'polite' });
    this.visibilityChip = el('span', { class: 'online-chip' });
    this.modeChip = el('span', { class: 'online-chip' });
    this.stageLine = el('p', { class: 'online-stage', role: 'status', 'aria-live': 'polite' });
    this.seats = Object.fromEntries(SEATS.map((seat) => [seat, seatCard(seat)]));
    this.statusLine = el('p', { class: 'online-status', role: 'status', 'aria-live': 'polite' });
    this.fighterButton = el('button', { class: 'btn', type: 'button', 'data-nav': true, ...tx('online.room.chooseFighter') });
    this.readyButton = el('button', { class: 'btn btn--primary online-ready', type: 'button', 'data-nav': true, 'aria-pressed': 'false', ...tx('online.room.readyButton') });
    this.retryButton = el('button', { class: 'btn', type: 'button', 'data-nav': true, hidden: true, ...tx('online.room.peer.retry') });
    this.leaveButton = el('button', { class: 'btn online-leave', type: 'button', 'data-nav': true, ...tx('online.room.leave') });
    this.fighterButton.addEventListener('click', () => this.app.screens.go('online-character'));
    this.readyButton.addEventListener('click', () => this.toggleReady());
    this.retryButton.addEventListener('click', () => this.session.retryPeer());
    this.leaveButton.addEventListener('click', () => this.onBack());
    this.el.replaceChildren(
      header,
      el('div', { class: 'screen-body online-layout' }, [
        el('section', { class: 'online-panel online-room-info' }, [
          el('h2', { class: 'panel-title', id: 'online-room-code-label', ...tx('online.room.code') }),
          el('div', { class: 'online-code-row' }, [this.codeValue, this.copyButton]),
          this.copyStatus,
          el('p', { class: 'online-hint', ...tx('online.room.share') }),
          el('div', { class: 'online-chips' }, [this.visibilityChip, this.modeChip]),
          this.stageLine,
        ]),
        el('section', { class: 'online-panel online-room-seats' }, [
          el('ul', { class: 'online-seats' }, SEATS.map((seat) => this.seats[seat].root)),
          this.statusLine,
          el('div', { class: 'online-actions' }, [this.fighterButton, this.readyButton, this.retryButton, this.leaveButton]),
        ]),
      ]),
    );
    this.unsubscribe = null;
    this.revealTimer = null;
    // How long the drawn stage shows before the Battle.
    this.revealMs = STAGE_REVEAL_MS;
    this.drawn = null;
    this.peerNoticeShown = null;
  }

  get session() {
    return this.app.online;
  }

  enter() {
    this.unsubscribe?.();
    if (!this.session?.inRoom) {
      this.app.screens.go('online-lobby', {}, { replace: true });
      return;
    }
    this.unsubscribe = this.session.on((type, detail) => this.onSessionEvent(type, detail));
    this.drawn = null;
    this.copyStatus.textContent = '';
    this.render();
  }

  exit() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    clearTimeout(this.revealTimer);
    this.revealTimer = null;
  }

  focusDefault() {
    const me = this.session?.me;
    const target = !me?.fighterId ? this.fighterButton : !this.readyButton.disabled ? this.readyButton : this.fighterButton;
    target.focus({ preventScroll: true });
  }

  // The session's events while the room shows (the router passes 'closed'
  // and 'start' here: see routeOnlineEvents).
  onSessionEvent(type, detail) {
    if (type === 'room' || type === 'peer') this.render();
    if (type === 'peer' && detail?.status === 'failed' && this.peerNoticeShown !== detail) {
      this.peerNoticeShown = detail;
      if (this.app.screens.current === this) showNotice(this.app, 'peer');
    }
  }

  render() {
    const s = this.session;
    if (!s?.room) return;
    this.title.textContent = s.room.name ?? '';
    this.title.setAttribute('data-i18n', '');
    this.codeValue.value = s.room.code ?? '';
    setText(this.visibilityChip, `online.visibility.${s.room.visibility === 'private' ? 'private' : 'public'}`);
    setText(this.modeChip, modeName(s.room.mode));
    if (this.drawn) setText(this.stageLine, 'online.room.stageDrawn', { name: { t: `map.${this.drawn.id}.name` } });
    else setText(this.stageLine, 'online.room.stage');
    for (const seat of SEATS) this.seats[seat].render(s.players[seat], { you: s.seat === seat });
    const me = s.me;
    const opponent = s.opponent;
    const peer = s.peer.status;
    this.fighterButton.disabled = !!me?.ready || !!this.drawn;
    this.readyButton.disabled = !!this.drawn || (!me?.ready && !s.canReady);
    this.readyButton.setAttribute('aria-pressed', String(!!me?.ready));
    setText(this.readyButton, me?.ready ? 'online.room.unready' : 'online.room.readyButton');
    this.readyButton.classList.toggle('is-on', !!me?.ready);
    this.retryButton.hidden = peer !== 'failed' || !opponent?.connected;
    setText(this.statusLine, this.statusKey());
  }

  // What the room tells the player now, the first that applies.
  statusKey() {
    const s = this.session;
    const me = s.me;
    const opponent = s.opponent;
    if (this.drawn) return 'online.room.status.starting';
    if (!opponent) return 'online.room.status.alone';
    if (!opponent.connected) return 'online.room.away';
    if (s.peer.status === 'connecting' || s.peer.status === 'idle') return 'online.room.peer.connecting';
    if (s.peer.status === 'failed') return 'online.room.peer.failed';
    if (!me?.fighterId) return 'online.room.status.pickFighter';
    if (!me.ready) return 'online.room.status.pressReady';
    if (!opponent.ready) return 'online.room.status.waitOpponent';
    return 'online.room.status.starting';
  }

  toggleReady() {
    const me = this.session.me;
    if (!me) return;
    if (!me.ready && !this.session.canReady) return;
    this.session.setReady(!me.ready);
  }

  // Copy code: the clipboard where the page may write to it, else the code
  // selected for the player to copy (itch.io's frame may block the
  // clipboard).
  async copyCode() {
    const code = this.codeValue.value;
    const select = () => {
      this.codeValue.focus({ preventScroll: true });
      this.codeValue.select?.();
      setText(this.copyStatus, 'online.room.copyManual');
    };
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error('no clipboard');
      await globalThis.navigator.clipboard.writeText(code);
      setText(this.copyStatus, 'online.room.copied');
    } catch {
      select();
    }
  }

  async onBack() {
    const host = this.session?.isHost;
    const ok = await this.app.dialog.open({
      title: t('online.room.leaveConfirm.title'),
      message: t(host ? 'online.room.leaveConfirm.host' : 'online.room.leaveConfirm.guest'),
      confirmLabel: t('online.room.leave'),
      cancelLabel: t('online.room.stay'),
      cancelOutlineOnly: true,
    });
    if (!ok || this.app.screens.current !== this) return;
    this.session.leaveRoom();
    this.app.screens.backTo('online-lobby');
  }

  // A match starts: the drawn stage shows a moment, then the Battle. A
  // start this build cannot play ends Online Play's room here.
  startMatch(start) {
    const setup = readStart(start);
    if (!setup) {
      this.session.leaveRoom();
      showNotice(this.app, 'fighter').then(() => this.app.screens.backTo('online-lobby'));
      return;
    }
    if (this.app.screens.current !== this) {
      this.app.screens.go('online-battle', { start });
      return;
    }
    this.drawn = setup.map;
    this.render();
    clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => {
      this.revealTimer = null;
      if (this.app.screens.current === this) this.app.screens.go('online-battle', { start });
    }, this.revealMs);
  }
}

// One seat of the room: its player's name, the Host and You marks, their
// fighter and whether they are ready (or the seat waiting for someone).
function seatCard(seat) {
  const name = el('span', { class: 'online-seat-name' });
  const hostMark = el('span', { class: 'online-mark', ...tx('online.room.host') });
  const youMark = el('span', { class: 'online-mark online-mark--you', ...tx('online.room.you') });
  const fighter = el('span', { class: 'online-seat-fighter' });
  const state = el('span', { class: 'online-seat-state' });
  const root = el('li', { class: `online-seat online-seat--${seat}`, 'data-player': seat === 'host' ? 'p1' : 'p2', 'data-seat': seat }, [
    el('div', { class: 'online-seat-head' }, [name, hostMark, youMark]),
    el('div', { class: 'online-seat-body' }, [fighter, state]),
  ]);
  hostMark.hidden = seat !== 'host';
  return {
    root,
    render(player, { you }) {
      youMark.hidden = !you || !player;
      root.classList.toggle('is-empty', !player);
      root.classList.toggle('is-ready', !!player?.ready);
      root.classList.toggle('is-away', !!player && !player.connected);
      if (!player) {
        setText(name, 'online.room.waiting');
        fighter.textContent = '';
        state.textContent = '';
        return;
      }
      name.textContent = player.name;
      name.setAttribute('data-i18n', '');
      const def = player.fighterId ? getPlayableCharacter(player.fighterId) : null;
      if (def) {
        fighter.textContent = def.displayName;
        fighter.setAttribute('data-i18n', '');
      } else setText(fighter, 'online.room.choosing');
      setText(state, !player.connected ? 'online.room.away' : player.ready ? 'online.room.ready' : 'online.room.notReady');
    },
  };
}

// ---- The fighter ---------------------------------------------------------------------

// The player's fighter for the room: the shared roster (every fighter, the
// comfort and loadout rules as everywhere), its choice kept in
// app.selection.online; confirming tells the room and goes back to it.
export class OnlineFighterScreen extends CharacterSelectScreen {
  constructor(app) {
    super(app, {
      id: 'online-character',
      title: 'online.fighter.title',
      setup: ONLINE_SETUP,
      step: null,
      selection: () => app.selection.online,
      key: 'characterId',
      next: () => {
        app.online?.pickFighter?.(app.selection.online.characterId);
        app.screens.back();
      },
      previewId: 'online-character-preview-name',
    });
  }

  enter(params) {
    if (!this.app.online?.inRoom) {
      this.app.screens.backTo('online-lobby');
      return;
    }
    super.enter(params);
  }
}

// ---- Events between screens ------------------------------------------------------------

// Online Play's events the screen on show does not handle itself
// (onOnline): the room closing ("The host closed the room.", back to the
// lobby) and a match starting (the room's stage reveal, then the Battle).
export function routeOnlineEvents(app) {
  return app.online.on((type, detail) => {
    const current = app.screens.current;
    if (current?.onOnline?.(type, detail)) return;
    if (type === 'closed') {
      if (!current?.id?.startsWith('online-')) return;
      showNotice(app, detail?.reason ?? 'lost').then(() => {
        if (app.screens.current?.id?.startsWith('online-')) app.screens.backTo('online-lobby');
      });
    } else if (type === 'start') {
      app.screens.get('online-room')?.startMatch(detail);
    }
  });
}
