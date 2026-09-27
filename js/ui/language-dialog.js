// FIRST-LAUNCH LANGUAGE CHOOSER: the one-time dialog that asks a new player
// for their language before the intro starts (App.start: no language chosen
// yet → this dialog over the black start screen → splash → Home). It offers
// exactly English and Français, each named in its own language and marked
// with its own lang, under a title and prompt given in both languages, so it
// makes sense before any language is chosen.
//
// Choosing saves the language through the Settings store (never storage
// directly; blocked storage keeps it for this visit) and App switches the
// interface to it. A returning player who has chosen never sees this again;
// Settings › Language changes it later. It is a real modal: role="dialog",
// its own navigation scope (arrows, D-pad, Enter, A), and a choice is the
// only way on, so Back does nothing here.

import { el } from '../core/utils.js';
import { LANGUAGES, LANGUAGE_NAMES, bilingual } from '../core/i18n.js';

// The language the browser prefers, if it is one of ours, else English:
// the option focused first, never chosen for the player.
function browserLanguage() {
  const preferred = [globalThis.navigator?.language, ...(globalThis.navigator?.languages ?? [])];
  for (const tag of preferred) {
    const base = typeof tag === 'string' ? tag.slice(0, 2).toLowerCase() : null;
    if (LANGUAGES.includes(base)) return base;
  }
  return LANGUAGES[0];
}

export class LanguageDialog {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.resolve = null;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'language-dialog-title');
    root.setAttribute('aria-describedby', 'language-dialog-prompt');

    this.options = LANGUAGES.map((language) => {
      const option = el('button', {
        class: 'language-option', type: 'button', 'data-nav': true, 'data-language': language, lang: language,
        text: LANGUAGE_NAMES[language],
      });
      option.addEventListener('click', () => this.choose(language));
      return option;
    });

    root.replaceChildren(
      el('div', { class: 'language-panel glass glass--panel' }, [
        el('h2', { class: 'language-title', id: 'language-dialog-title', text: bilingual('firstRun.title') }),
        el('p', { class: 'language-prompt', id: 'language-dialog-prompt', text: bilingual('firstRun.prompt') }),
        el('div', { class: 'language-options' }, this.options),
        el('p', { class: 'language-note', text: bilingual('firstRun.note') }),
      ]),
    );
    // Back has nowhere to go: the game waits for a language.
    this.scope = { el: root, onBack: () => {} };
  }

  get isOpen() {
    return !!this.resolve;
  }

  optionFor(language) {
    return this.options.find((o) => o.getAttribute('data-language') === language);
  }

  // Resolves once the player has a language: at once, with no dialog, for
  // one who has already chosen; after their choice for a new player.
  ensureChosen() {
    if (this.app.settings.languageChosen) return Promise.resolve(this.app.settings.language);
    return this.open();
  }

  // Shows the chooser and resolves with the language picked.
  open() {
    if (this.resolve) return this.promise;
    this.root.hidden = false;
    this.app.nav.pushScope(this.scope);
    this.optionFor(browserLanguage())?.focus({ preventScroll: true });
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
    return this.promise;
  }

  // Saves `language` as the player's choice and closes.
  choose(language) {
    if (!this.resolve || !LANGUAGES.includes(language)) return;
    this.app.settings.set('language', language);
    this.root.hidden = true;
    this.app.nav.popScope(this.scope);
    const resolve = this.resolve;
    this.resolve = null;
    document.activeElement?.blur?.();
    resolve(language);
  }
}
