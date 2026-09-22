// Global overlays: loading screen and confirmation dialog.

import { el } from '../core/utils.js';
import { logoSVG } from './logo.js';

export class LoadingOverlay {
  constructor(root) {
    this.root = root;
    this.label = el('p', { class: 'loading-label', text: 'Loading' });
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
  show(label = 'Loading', { delay = 120 } = {}) {
    this.label.textContent = label;
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

  showError(message, { onRetry, onBack, nav }) {
    clearTimeout(this.showTimer);
    this.root.hidden = false;
    this.root.classList.add('is-visible');
    this.label.textContent = 'Assets unavailable';
    this.bar.hidden = true;
    const retry = el('button', { class: 'btn btn--primary', 'data-nav': true, 'data-nav-default': true, type: 'button', text: 'Retry' });
    const back = el('button', { class: 'btn', 'data-nav': true, type: 'button', text: 'Back' });
    const done = (fn) => () => {
      this.hide();
      if (this.scope) nav.popScope(this.scope);
      this.scope = null;
      fn?.();
    };
    retry.addEventListener('click', done(onRetry));
    back.addEventListener('click', done(onBack));
    this.error.replaceChildren(
      el('p', { class: 'loading-message', text: message }),
      el('div', { class: 'loading-actions' }, [retry, back]),
    );
    this.error.hidden = false;
    this.scope = { el: this.root, onBack: done(onBack) };
    nav.pushScope(this.scope);
    retry.focus();
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
      el('div', { class: 'dialog-panel' }, [
        this.title,
        this.message,
        el('div', { class: 'dialog-actions' }, [this.cancelBtn, this.okBtn]),
      ]),
    );
    this.resolve = null;
    this.cancelBtn.addEventListener('click', () => this.close(false));
    this.okBtn.addEventListener('click', () => this.close(true));
  }

  open({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) {
    if (this.resolve) this.close(false);
    this.title.textContent = title;
    this.message.textContent = message;
    this.okBtn.textContent = confirmLabel;
    this.cancelBtn.textContent = cancelLabel;
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
