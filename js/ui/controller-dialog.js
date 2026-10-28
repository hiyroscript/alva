// CONTROLLER CONNECTIONS: the dialog Home's controller button opens, in the
// translucent glass of every other dialog.
//
// It shows what the connection manager (js/core/controller-manager.js)
// knows, live while open: how many supported controllers are connected
// (out of four), the status the Home button's indicator shows, each
// detected controller with its family, its status and whether it is
// Player 1's (or available, or inactive past the four-controller limit),
// any unsupported device with the reason, and a warning past four. The
// player picks which active controller is Player 1's ("Use for Player 1").
//
// Reconnect queries the browser's controllers again for real (new ones
// found, lost ones removed, the count, assignments and indicator brought
// up to date) and says what it found; it never reloads the game or touches
// a setting. A browser only exposes a controller after a button press on
// it, so the dialog says so; it never pretends to connect hardware.
//
// Modal like the other dialogs (js/ui/overlays.js ModalDialog): its own
// navigation scope, Home inert beneath it, Esc / Circle / B, Close or a
// press on the dim close it, and focus returns to the controller button.

import { el } from '../core/utils.js';
import { CONFIG } from '../config.js';
import { tx, tattr, iconLabel, setText, plural, t } from '../localization/i18n.js';
import { MAX_CONTROLLERS } from '../core/controller-manager.js';
import { ModalDialog } from './overlays.js';
import { ICONS } from './icons.js';
import { FAMILY_NAMES } from './controller-glyphs.js';

// The indicator's mark for each status.
export const STATUS_ICONS = Object.freeze({
  connected: ICONS.statusCheck,
  disconnected: ICONS.statusCross,
  tooMany: ICONS.statusAlert,
});

// A device's name: its product's, else the generic one for its family,
// else the browser's, else "Unnamed controller".
export function deviceName(device) {
  if (device.name) return device.name;
  if (device.family) return t(`controller.genericName.${device.family}`);
  return t('controller.unknownName');
}

export class ControllerDialog extends ModalDialog {
  constructor(root, app) {
    super(root, app, 'controller-dialog-title');
    this.isOpen = false;
    this.unsubscribe = null;

    this.closeButton = el('button', {
      class: 'dialog-close', type: 'button', 'data-nav': true, ...tattr('aria-label', 'controller.close'), html: ICONS.close,
    });
    this.closeButton.addEventListener('click', () => this.close());

    this.statusMark = el('span', { class: 'controller-status-mark', 'aria-hidden': 'true' });
    this.statusText = el('span', { class: 'controller-status-text' });
    this.countText = el('p', { class: 'controller-count' });
    this.limitText = el('p', { class: 'controller-limit', ...tx('controller.limit', { max: MAX_CONTROLLERS }) });
    this.warning = el('div', { class: 'controller-warning', role: 'alert', hidden: true }, [
      el('span', { class: 'controller-warning-mark', 'aria-hidden': 'true', html: ICONS.statusAlert }),
      el('div', {}, [
        el('p', { class: 'controller-warning-title', ...tx('controller.tooMany.title') }),
        el('p', { class: 'controller-warning-text', ...tx('controller.tooMany.text', { game: CONFIG.title }) }),
      ]),
    ]);
    this.apiNote = el('p', { class: 'controller-note controller-api-note', role: 'status', hidden: true });
    this.list = el('ul', { class: 'controller-list', ...tattr('aria-label', 'controller.listLabel') });
    this.unsupportedHead = el('h3', { class: 'controller-subtitle', hidden: true, ...tx('controller.unsupported.title') });
    this.unsupportedList = el('ul', { class: 'controller-list controller-list--unsupported', hidden: true });
    this.hint = el('p', { class: 'controller-note', ...tx('controller.hint') });
    this.reconnectButton = el('button', {
      class: 'btn controller-reconnect', type: 'button', 'data-nav': true,
      ...iconLabel('controller.reconnect', ICONS.refresh, { iconFirst: true }),
    });
    this.reconnectButton.addEventListener('click', () => this.reconnect());
    this.announcer = el('p', { class: 'controller-sr controller-announcer', role: 'status', 'aria-live': 'polite' });

    root.replaceChildren(
      el('div', { class: 'dialog-panel controller-panel glass glass--panel' }, [
        el('div', { class: 'choice-header' }, [
          el('div', { class: 'choice-heading' }, [
            el('span', { class: 'kicker', ...tx('brand.title') }),
            el('h2', { class: 'dialog-title', id: 'controller-dialog-title', ...tx('controller.title') }),
          ]),
          this.closeButton,
        ]),
        el('div', { class: 'controller-body' }, [
          el('div', { class: 'controller-summary' }, [
            el('p', { class: 'controller-status' }, [this.statusMark, this.statusText]),
            this.countText,
            this.limitText,
          ]),
          this.warning,
          this.apiNote,
          this.list,
          this.unsupportedHead,
          this.unsupportedList,
          el('p', { class: 'controller-note', ...tx('controller.supportNote') }),
          this.hint,
        ]),
        el('div', { class: 'dialog-actions controller-actions' }, [this.reconnectButton]),
        this.announcer,
      ]),
    );
    root.setAttribute('aria-describedby', 'controller-dialog-title');
  }

  get manager() {
    return this.app.controllers;
  }

  // Opens over Home and focuses Close (Reconnect is one step down).
  // `opener` gets focus back on close.
  open({ opener = null } = {}) {
    if (this.isOpen) return;
    this.isOpen = true;
    this.manager?.refresh();
    this.render();
    this.unsubscribe = this.manager?.onChange(() => this.render()) ?? null;
    this.show(this.closeButton, opener);
  }

  dismiss() {
    this.close();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.hide(true);
  }

  // Reconnect: asks the browser for its controllers again and says what
  // was found.
  reconnect() {
    const manager = this.manager;
    if (!manager) return;
    manager.refresh({ force: true });
    this.render();
    const n = manager.supportedCount;
    this.announcer.textContent = n ? plural('controller.refreshed', n) : t('controller.refreshedNone');
    this.reconnectButton.classList.remove('is-spinning');
    void this.reconnectButton.offsetWidth;
    this.reconnectButton.classList.add('is-spinning');
  }

  // Draws the manager's state.
  render() {
    const m = this.manager;
    const status = m?.status ?? 'disconnected';
    this.root.dataset.status = status;
    this.statusMark.className = `controller-status-mark controller-status-mark--${status}`;
    this.statusMark.innerHTML = STATUS_ICONS[status];
    setText(this.statusText, 'controller.statusLine', { status: { t: `controller.status.${status}` } });
    const n = m?.supportedCount ?? 0;
    if (n) {
      this.countText.textContent = plural('controller.count', n);
      this.countText.setAttribute('data-i18n', '');
    } else {
      setText(this.countText, 'controller.none');
    }
    this.warning.hidden = status !== 'tooMany';
    const api = m?.api ?? 'unavailable';
    this.apiNote.hidden = api === 'available';
    if (api !== 'available') setText(this.apiNote, `controller.api.${api}`);

    const focusedKey = this.root.contains(document.activeElement) ? document.activeElement?.getAttribute?.('data-device') : null;
    const supported = m?.supported ?? [];
    this.list.replaceChildren(...supported.map((d, i) => this.deviceItem(d, i + 1)));
    this.list.hidden = supported.length === 0;
    const unsupported = m?.unsupported ?? [];
    this.unsupportedHead.hidden = unsupported.length === 0;
    this.unsupportedList.hidden = unsupported.length === 0;
    this.unsupportedList.replaceChildren(...unsupported.map((d) => el('li', { class: 'controller-device is-unsupported' }, [
      el('p', { class: 'controller-device-name', text: deviceName(d) }),
      el('p', { class: 'controller-device-meta', ...tx(`controller.unsupported.${d.reason ?? 'unidentified'}`) }),
    ])));
    // A re-drawn list keeps focus on the same controller's button, or
    // somewhere in the dialog if that button went.
    const same = focusedKey ? this.list.querySelector(`[data-device="${focusedKey}"]`) : null;
    if (same) same.focus({ preventScroll: true });
    else if (this.isOpen && !this.root.hidden && !this.root.contains(document.activeElement)) {
      (this.list.querySelector('.controller-use') ?? this.reconnectButton).focus({ preventScroll: true });
    }
  }

  // One supported controller: "Controller n — name", its family, status
  // and assignment (Player 1's, the one Player 2 plays Local Play with,
  // available or inactive), and Use for Player 1 when it is not Player 1's.
  deviceItem(d, n) {
    const assignment = d.player1 ? 'player1' : d.player2 ? 'player2' : d.active ? 'available' : 'inactive';
    const item = el('li', { class: `controller-device is-${assignment}` }, [
      el('div', { class: 'controller-device-head' }, [
        el('p', { class: 'controller-device-name' }, [
          el('span', { class: 'controller-device-num', ...tx('controller.item', { n }) }),
          el('span', { class: 'controller-device-sep', 'aria-hidden': 'true', text: ' — ' }),
          el('span', { text: deviceName(d) }),
        ]),
        el('span', { class: 'controller-family', text: FAMILY_NAMES[d.family] ?? '' }),
      ]),
      el('dl', { class: 'controller-device-meta' }, [
        el('div', {}, [el('dt', tx('controller.statusLabel')), el('dd', tx(d.active ? 'controller.status.connected' : 'controller.deviceInactive'))]),
        el('div', {}, [el('dt', tx('controller.assignLabel')), el('dd', { class: 'controller-assignment', ...tx(`controller.assignment.${assignment}`) })]),
      ]),
    ]);
    if (assignment === 'available' || assignment === 'player2') {
      const use = el('button', {
        class: 'btn controller-use', type: 'button', 'data-nav': true, 'data-device': d.key,
        ...tx('controller.useForP1'), ...tattr('aria-label', 'controller.useForP1Label', { n }),
      });
      use.addEventListener('click', () => {
        this.manager.assignPlayer1(d.key);
        this.render();
        this.announcer.textContent = t('controller.assigned', { n });
      });
      item.append(use);
    }
    return item;
  }
}
