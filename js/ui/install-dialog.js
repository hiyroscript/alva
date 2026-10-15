// The install dialog: what Home's Download button opens. It explains that
// Alva can be added to the player's home screen and launched like an app,
// and then does what the browser allows (js/core/web-app-install.js):
//
//   prompt     the browser offered its own installation: Not Now, or Add to
//              Home Screen, which asks the browser to show its own
//              confirmation (from that very press; the browser installs,
//              and the dialog says so only once it has)
//   manual     no programmable installation here: the same explanation and
//              how to do it by hand on this platform and browser (Safari's
//              Share › Add to Home Screen on an iPhone or iPad, the browser
//              menu elsewhere), with Got It
//   waiting    the browser's prompt is up, or the player accepted it and the
//              browser is installing: a status line, never a false success
//   installed  Alva is running as an installed app, or the browser just
//              installed it: a friendly word instead of another prompt
//
// A role="dialog" over Home on the shared modal plumbing (ModalDialog,
// js/ui/overlays.js): its own navigation scope (keyboard, controller D-pad
// and Cross / A; Escape, controller Back, the close button or a press on
// the dim around it close it), Home inert beneath, Tab kept inside, focus
// on its primary button as it opens and back on the Download button as it
// closes. Every word is a translation key (js/localization/i18n.js), so it
// follows the language, even while open.

import { el } from '../core/utils.js';
import { tx, tattr, setText } from '../localization/i18n.js';
import { ModalDialog } from './overlays.js';
import { ICONS } from './icons.js';

// The intro's paragraphs, in order.
export const INSTALL_INTRO = Object.freeze(['install.intro1', 'install.intro2', 'install.intro3', 'install.intro4']);

// How to install by hand, by platform (installPlatform in
// js/core/web-app-install.js): a heading and numbered steps, or a heading
// and one line.
export const INSTALL_INSTRUCTIONS = Object.freeze({
  ios: Object.freeze({ heading: 'install.ios.heading', steps: ['install.ios.step1', 'install.ios.step2', 'install.ios.step3', 'install.ios.step4'] }),
  android: Object.freeze({ heading: 'install.howTo', text: 'install.android' }),
  'android-samsung': Object.freeze({ heading: 'install.howTo', text: 'install.androidSamsung' }),
  'android-firefox': Object.freeze({ heading: 'install.howTo', text: 'install.androidFirefox' }),
  'desktop-edge': Object.freeze({ heading: 'install.howTo', text: 'install.edge' }),
  'desktop-chromium': Object.freeze({ heading: 'install.howTo', text: 'install.chromium' }),
  'desktop-safari': Object.freeze({ heading: 'install.howTo', text: 'install.safariMac' }),
  'desktop-firefox': Object.freeze({ heading: 'install.howTo', text: 'install.unavailable' }),
  other: Object.freeze({ heading: 'install.howTo', text: 'install.other' }),
});

// The status line for an installation attempt's status, if any.
const STATUS_TEXT = Object.freeze({
  prompting: 'install.status.prompting',
  accepted: 'install.status.installing',
  dismissed: 'install.status.dismissed',
  failed: 'install.status.failed',
});

export class InstallDialog extends ModalDialog {
  constructor(root, app) {
    super(root, app, 'install-dialog-title');
    this.install = app.install ?? null;
    this.isOpen = false;
    this.title = el('h2', { class: 'dialog-title', id: 'install-dialog-title', ...tx('install.title') });
    this.closeButton = el('button', {
      class: 'dialog-close', type: 'button', 'data-nav': true, ...tattr('aria-label', 'common.close'), html: ICONS.close,
    });
    this.intro = el('div', { class: 'install-intro' }, INSTALL_INTRO.map((key, i) =>
      el('p', { class: i === 0 ? 'install-lead' : null, ...tx(key) })));
    this.message = el('p', { class: 'install-message', hidden: true });
    this.stepsHeading = el('h3', { class: 'install-steps-title' });
    this.stepsBody = el('div', { class: 'install-steps-body' });
    this.steps = el('section', { class: 'install-steps', hidden: true }, [this.stepsHeading, this.stepsBody]);
    this.body = el('div', { class: 'dialog-message install-body', id: 'install-dialog-body' }, [this.intro, this.message, this.steps]);
    this.status = el('p', { class: 'install-status', role: 'status', 'aria-live': 'polite', hidden: true });
    this.notNowButton = el('button', { class: 'btn', type: 'button', 'data-nav': true, ...tx('install.notNow') });
    this.addButton = el('button', { class: 'btn btn--primary install-add', type: 'button', 'data-nav': true, ...tx('install.add') });
    this.gotItButton = el('button', { class: 'btn btn--primary', type: 'button', 'data-nav': true, ...tx('install.gotIt') });
    root.setAttribute('aria-describedby', 'install-dialog-body');
    this.panel = el('div', { class: 'dialog-panel install-panel glass glass--panel' }, [
      el('div', { class: 'choice-header' }, [
        el('div', { class: 'choice-heading' }, [this.title]),
        this.closeButton,
      ]),
      this.body,
      this.status,
      el('div', { class: 'dialog-actions install-actions' }, [this.notNowButton, this.addButton, this.gotItButton]),
    ]);
    root.replaceChildren(this.panel);
    this.closeButton.addEventListener('click', () => this.close());
    this.notNowButton.addEventListener('click', () => this.close());
    this.gotItButton.addEventListener('click', () => this.close());
    this.addButton.addEventListener('click', () => this.requestInstall());
    // The browser's offer can come or go, and an installation finish, while
    // the dialog is open: it follows.
    this.install?.onChange(() => {
      if (this.isOpen) this.render();
    });
    // Up and down scroll a body taller than the panel (a landscape phone)
    // before they move focus; left and right move between the buttons.
    this.scope.onDirection = (direction) => {
      if (direction !== 'up' && direction !== 'down') return false;
      const room = this.body.scrollHeight - this.body.clientHeight;
      if (!(room > 1)) return false;
      if (direction === 'down' ? this.body.scrollTop >= room - 1 : this.body.scrollTop <= 0) return false;
      this.body.scrollBy?.({ top: direction === 'up' ? -48 : 48, behavior: 'auto' });
      return true;
    };
    // Tab and Shift+Tab cycle through the dialog's own controls only.
    root.addEventListener('keydown', (e) => {
      if (!this.isOpen || e.code !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
      const stops = this.focusStops();
      if (!stops.length) return;
      e.preventDefault();
      const i = stops.indexOf(document.activeElement);
      const next = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length;
      stops[next].focus({ preventScroll: true });
    });
  }

  // What the dialog shows now (see the top).
  get view() {
    const install = this.install;
    if (!install || install.mode === 'installed') return install ? 'installed' : 'manual';
    if (install.status === 'prompting' || install.status === 'accepted') return 'waiting';
    return install.mode;
  }

  // The controls Tab cycles through, in order: the close button, then the
  // buttons shown.
  focusStops() {
    return [this.closeButton, this.notNowButton, this.addButton, this.gotItButton].filter((b) => !b.hidden && !b.disabled);
  }

  // The button that takes focus: Add to Home Screen when the browser can
  // prompt, else Got It.
  get primaryButton() {
    return this.addButton.hidden ? this.gotItButton : this.addButton;
  }

  // Opens it over Home. `opener` is the control focus returns to (the
  // Download button).
  open({ opener = null } = {}) {
    if (this.isOpen) this.close();
    this.isOpen = true;
    this.render();
    this.show(this.primaryButton, opener);
    this.body.scrollTop = 0;
  }

  dismiss() {
    this.close();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.hide(true);
  }

  // From a real press of Add to Home Screen: asks the browser for its own
  // prompt (see WebAppInstall.install), then shows what came of it. With no
  // offer left (spent, or never made), it shows how to install by hand.
  async requestInstall() {
    const install = this.install;
    if (!install?.canPrompt) {
      this.render();
      return 'unavailable';
    }
    const pending = install.install();
    this.render();
    const outcome = await pending;
    if (this.isOpen) this.render();
    return outcome;
  }

  // Shows the current view, keeping focus on a control that still shows.
  render() {
    const view = this.view;
    const install = this.install;
    const installed = view === 'installed';
    const fresh = installed && install?.justInstalled && !install?.standalone;
    setText(this.title, installed ? (fresh ? 'install.successTitle' : 'install.installedTitle') : 'install.title');
    this.intro.hidden = installed;
    this.message.hidden = !installed;
    if (installed) setText(this.message, fresh ? 'install.successMessage' : 'install.installedMessage');
    // How to install by hand, for this platform.
    this.steps.hidden = view !== 'manual';
    if (view === 'manual') {
      const how = INSTALL_INSTRUCTIONS[install?.platform] ?? INSTALL_INSTRUCTIONS.other;
      setText(this.stepsHeading, how.heading);
      this.stepsBody.replaceChildren(how.steps
        ? el('ol', { class: 'install-step-list' }, how.steps.map((key) => el('li', tx(key))))
        : el('p', tx(how.text)));
    }
    const statusKey = installed ? null : STATUS_TEXT[install?.status];
    this.status.hidden = !statusKey;
    if (statusKey) setText(this.status, statusKey);
    else this.status.replaceChildren();
    this.notNowButton.hidden = view !== 'prompt';
    this.addButton.hidden = view !== 'prompt';
    this.gotItButton.hidden = view === 'prompt';
    this.addButton.setAttribute('data-nav-default', '');
    if (this.addButton.hidden) this.addButton.removeAttribute('data-nav-default');
    if (this.gotItButton.hidden) this.gotItButton.removeAttribute('data-nav-default');
    else this.gotItButton.setAttribute('data-nav-default', '');
    const active = document.activeElement;
    if (this.isOpen && this.root.contains(active) && active?.hidden) this.primaryButton.focus({ preventScroll: true });
  }
}
