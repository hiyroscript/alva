// Global overlays: loading screen, confirmation dialog and choice dialog.
// Their own labels are translation keys (js/localization/i18n.js); a caller's
// loading label, error message and confirmation copy arrive already
// translated, a choice dialog's copy as translation keys.

import { el } from '../core/utils.js';
import { t, tx, tattr, setText } from '../localization/i18n.js';
import { logoSVG } from './logo.js';
import { ICONS } from './icons.js';

export class LoadingOverlay {
  constructor(root) {
    this.root = root;
    this.label = el('p', { class: 'loading-label', ...tx('common.loading') });
    this.fill = el('div', { class: 'loading-fill' });
    this.bar = el('div', {
      class: 'loading-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
    }, [this.fill]);
    this.error = el('div', { class: 'loading-error', hidden: true });
    root.replaceChildren(
      el('div', { class: 'loading-inner' }, [
        el('div', { class: 'loading-logo', html: logoSVG({ className: 'logo logo--small' }) }),
        this.label,
        this.bar,
        this.error,
      ]),
    );
    this.showTimer = null;
    this.scope = null;
  }

  // Shown after a short delay so instant loads don't flash an overlay.
  // `label` is already translated (the generic Loading by default).
  show(label = t('common.loading'), { delay = 120 } = {}) {
    this.label.textContent = label;
    this.label.setAttribute('data-i18n', '');
    this.error.hidden = true;
    this.bar.hidden = false;
    this.setProgress(0, 1);
    clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => {
      this.root.hidden = false;
      this.root.classList.add('is-visible');
    }, delay);
  }

  setProgress(done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    this.fill.style.transform = `scaleX(${pct / 100})`;
    this.bar.setAttribute('aria-valuenow', String(pct));
  }

  // An error in place of the progress bar: `message` (already translated)
  // under the heading `title` (a translation key), with Retry and Back, or
  // Back alone when there is nothing to retry (no `onRetry`).
  showError(message, { onRetry, onBack, nav, title = 'common.assetsUnavailable' }) {
    clearTimeout(this.showTimer);
    this.root.hidden = false;
    this.root.classList.add('is-visible');
    setText(this.label, title);
    this.bar.hidden = true;
    const retry = onRetry
      ? el('button', { class: 'btn btn--primary', 'data-nav': true, 'data-nav-default': true, type: 'button', ...tx('common.retry') })
      : null;
    const back = el('button', {
      class: retry ? 'btn' : 'btn btn--primary', 'data-nav': true, 'data-nav-default': !retry, type: 'button', ...tx('common.back'),
    });
    const done = (fn) => () => {
      this.hide();
      if (this.scope) nav.popScope(this.scope);
      this.scope = null;
      fn?.();
    };
    retry?.addEventListener('click', done(onRetry));
    back.addEventListener('click', done(onBack));
    this.error.replaceChildren(
      el('p', { class: 'loading-message', text: message }),
      el('div', { class: 'loading-actions' }, [retry, back]),
    );
    this.error.hidden = false;
    this.scope = { el: this.root, onBack: done(onBack) };
    nav.pushScope(this.scope);
    (retry ?? back).focus();
  }

  hide() {
    clearTimeout(this.showTimer);
    this.root.classList.remove('is-visible');
    this.root.hidden = true;
  }
}

export class ConfirmDialog {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.title = el('h2', { class: 'dialog-title', id: 'dialog-title' });
    this.message = el('p', { class: 'dialog-message', id: 'dialog-message' });
    this.cancelBtn = el('button', { class: 'btn', type: 'button', 'data-nav': true, 'data-nav-default': true });
    this.okBtn = el('button', { class: 'btn btn--primary', type: 'button', 'data-nav': true });
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'dialog-title');
    root.setAttribute('aria-describedby', 'dialog-message');
    root.replaceChildren(
      el('div', { class: 'dialog-panel glass glass--panel' }, [
        this.title,
        this.message,
        el('div', { class: 'dialog-actions' }, [this.cancelBtn, this.okBtn]),
      ]),
    );
    this.resolve = null;
    this.cancelBtn.addEventListener('click', () => this.close(false));
    this.okBtn.addEventListener('click', () => this.close(true));
  }

  // `title`, `message` and the labels arrive translated. cancelOutlineOnly
  // keeps the cancel button's background transparent through hover/press.
  // Set per call, so no later dialog inherits it.
  open({ title, message, confirmLabel = t('common.confirm'), cancelLabel = t('common.cancel'), cancelOutlineOnly = false }) {
    if (this.resolve) this.close(false);
    this.title.textContent = title;
    this.message.textContent = message;
    this.okBtn.textContent = confirmLabel;
    this.cancelBtn.textContent = cancelLabel;
    this.cancelBtn.classList.toggle('is-outline-only', cancelOutlineOnly);
    this.returnFocus = document.activeElement;
    this.root.hidden = false;
    this.scope = { el: this.root, onBack: () => this.close(false) };
    this.app.nav.pushScope(this.scope);
    this.cancelBtn.focus();
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  close(result) {
    if (!this.resolve) return;
    this.root.hidden = true;
    this.app.nav.popScope(this.scope);
    const resolve = this.resolve;
    this.resolve = null;
    if (!result) this.returnFocus?.focus?.({ preventScroll: true });
    resolve(result);
  }
}

// A modal choice between a few options, none of them a cancel: role
// "dialog" (not the confirm dialog's alertdialog), its own navigation scope,
// focus on the default choice as it opens. Choosing resolves with the
// choice's value; Escape, gamepad Back, the close button or a press on the
// dim around the panel dismiss it, resolving with null, and focus returns to
// what had it (the control that opened it). The screen beneath is inert
// while it is open.
export class ChoiceDialog {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.resolve = null;
    this.kicker = el('span', { class: 'kicker' });
    this.title = el('h2', { class: 'dialog-title', id: 'choice-dialog-title' });
    this.closeButton = el('button', {
      class: 'dialog-close', type: 'button', 'data-nav': true, ...tattr('aria-label', 'common.close'), html: ICONS.close,
    });
    this.options = el('div', { class: 'choice-options' });
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'choice-dialog-title');
    root.replaceChildren(
      el('div', { class: 'dialog-panel choice-panel glass glass--panel' }, [
        el('div', { class: 'choice-header' }, [
          el('div', { class: 'choice-heading' }, [this.kicker, this.title]),
          this.closeButton,
        ]),
        this.options,
      ]),
    );
    this.closeButton.addEventListener('click', () => this.dismiss());
    root.addEventListener('click', (e) => {
      if (e.target === root) this.dismiss();
    });
    this.scope = { el: root, onBack: () => this.dismiss() };
  }

  get isOpen() {
    return !!this.resolve;
  }

  // `kicker` and `title` are translation keys; each of `choices` is
  // { value, label, description } (its label and line translation keys).
  // The choice whose value is `defaultValue` is the primary one and takes
  // focus (else the first). Resolves with the value chosen, or null.
  open({ kicker = null, title, choices, defaultValue = choices[0]?.value }) {
    if (this.resolve) this.close(null);
    if (kicker) setText(this.kicker, kicker);
    this.kicker.hidden = !kicker;
    setText(this.title, title);
    this.buttons = choices.map(({ value, label, description }) => {
      const descId = `choice-dialog-desc-${value}`;
      const primary = value === defaultValue;
      const button = el('button', {
        class: `btn choice-btn${primary ? ' btn--primary' : ''}`, type: 'button', 'data-nav': true,
        'data-nav-default': primary || null, 'data-choice': value, 'aria-describedby': description ? descId : null,
        ...tx(label),
      });
      button.addEventListener('click', () => this.close(value));
      return { value, button, option: el('div', { class: 'choice-option' }, [
        button,
        description ? el('p', { class: 'choice-desc', id: descId, ...tx(description) }) : null,
      ]) };
    });
    this.options.replaceChildren(...this.buttons.map((b) => b.option));
    this.returnFocus = document.activeElement;
    this.background = this.app.screens.current;
    if (this.background) this.background.el.inert = true;
    this.root.hidden = false;
    this.app.nav.pushScope(this.scope);
    const first = this.buttons.find((b) => b.value === defaultValue) ?? this.buttons[0];
    first?.button.focus({ preventScroll: true });
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  // The button for `value`, while open.
  buttonFor(value) {
    return this.buttons?.find((b) => b.value === value)?.button ?? null;
  }

  dismiss() {
    this.close(null);
  }

  close(value) {
    if (!this.resolve) return;
    this.root.hidden = true;
    this.app.nav.popScope(this.scope);
    if (this.background) this.background.el.inert = false;
    this.background = null;
    const resolve = this.resolve;
    this.resolve = null;
    if (value === null) this.returnFocus?.focus?.({ preventScroll: true });
    resolve(value);
  }
}
