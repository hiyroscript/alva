// SETTINGS: a translucent glass dialog over Home, opened by Home's gear
// (top right). Exactly three sections:
//
//   Language  English / Français, a single choice (radio buttons). Picking
//             one saves it and the whole interface switches at once, this
//             dialog included; it stays open.
//   Controls  Mobile Controls, the touch layout Quick Battle and Practice
//             Ground use: Joystick (the default) or Classic Buttons, as two
//             cards, and Customize touch controls, which opens the touch
//             layout editor (js/ui/touch-layout-editor.js) for the scheme in
//             use. Keyboard and gamepad controls never change.
//   Combat    Combat Assist, On (the default) or Off, a single choice
//             (radio buttons, in the Language section's style) with the
//             line that says what it does: the player's melee attacks close
//             a short gap first, for Energy, never a ranged one (see
//             Fighter.tryCombatAssist). Read as each Quick Battle or
//             Practice Ground session starts; no CPU ever has it.
//
// Every choice saves on this device at once through app.settings
// (js/core/settings.js). The dialog is modal: role="dialog" with
// aria-modal, its own navigation scope (arrows, D-pad, Enter, A), Home made
// inert beneath it, Esc / gamepad Back, the close button or a press on the
// dim around the panel close it, and focus returns to what opened it (the
// gear). The panel scrolls on its own on short landscape screens; Home never
// does.

import { el } from '../core/utils.js';
import { tx, tattr, iconLabel, setText, LANGUAGES, LANGUAGE_NAMES } from '../localization/i18n.js';
import { MOBILE_CONTROLS, DEFAULT_MOBILE_CONTROLS, DEFAULT_COMBAT_ASSIST } from '../core/settings.js';
import { ICONS } from './icons.js';

// A small picture of each layout's lower-left corner, for sighted players
// only (the card's name and line say the same).
const PREVIEW = Object.freeze({
  joystick: () => el('span', { class: 'settings-preview settings-preview--joystick', 'aria-hidden': 'true' }, [
    el('i', { class: 'sp-dash sp-dash--left' }),
    el('i', { class: 'sp-stick' }, [el('i', { class: 'sp-knob' })]),
    el('i', { class: 'sp-dash sp-dash--right' }),
  ]),
  classic: () => el('span', { class: 'settings-preview settings-preview--classic', 'aria-hidden': 'true' }, [
    el('i', { class: 'sp-pad', html: ICONS.left }),
    el('i', { class: 'sp-pad', html: ICONS.right }),
  ]),
});

// Each scheme's name key.
const schemeName = (scheme) => `settings.scheme.${scheme}`;

// A section: its heading (and note) above its content.
function section(id, titleKey, noteKey, content) {
  return el('section', { class: 'settings-section', 'data-settings-section': id, 'aria-labelledby': `settings-${id}-title` }, [
    el('div', { class: 'settings-group-head' }, [
      el('h3', { class: 'settings-group-title', id: `settings-${id}-title`, ...tx(titleKey) }),
      noteKey ? el('p', { class: 'settings-group-note', ...tx(noteKey) }) : null,
    ]),
    ...content,
  ]);
}

export class SettingsDialog {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.open_ = false;
    this.returnFocus = null;
    this.background = null;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'settings-title');

    // ---- Language ----------------------------------------------------------
    this.languageOptions = LANGUAGES.map((language) => {
      const option = el('button', {
        class: 'settings-language', type: 'button', role: 'radio', 'aria-checked': 'false',
        'data-nav': true, 'data-language': language, lang: language,
      }, [
        el('span', { class: 'settings-language-name', text: LANGUAGE_NAMES[language] }),
        el('span', { class: 'settings-language-check', 'aria-hidden': 'true', html: ICONS.check }),
      ]);
      option.addEventListener('click', () => this.chooseLanguage(language));
      return option;
    });
    const languageGroup = el('div', {
      class: 'settings-languages', role: 'radiogroup', 'aria-labelledby': 'settings-language-title',
    }, this.languageOptions);

    // ---- Controls ------------------------------------------------------------
    this.schemeOptions = MOBILE_CONTROLS.map((scheme) => {
      const descId = `settings-mobile-${scheme}-desc`;
      const option = el('button', {
        class: 'settings-option', type: 'button', role: 'radio', 'aria-checked': 'false',
        'data-nav': true, 'data-nav-no-hover-focus': true, 'data-mobile-controls': scheme,
        'aria-describedby': descId,
      }, [
        el('span', { class: 'settings-option-top' }, [
          PREVIEW[scheme](),
          el('span', { class: 'settings-option-current', 'aria-hidden': 'true', ...iconLabel('common.selected', ICONS.check, { iconFirst: true }) }),
        ]),
        el('span', { class: 'settings-option-text' }, [
          el('span', { class: 'settings-option-name' }, [
            el('span', tx(schemeName(scheme))),
            scheme === DEFAULT_MOBILE_CONTROLS ? el('span', { class: 'settings-option-tag', ...tx('common.default') }) : null,
          ]),
          el('span', { class: 'settings-option-desc', id: descId, ...tx(`settings.scheme.${scheme}Desc`) }),
        ]),
      ]);
      option.addEventListener('click', () => this.chooseScheme(scheme));
      return option;
    });
    const schemeGroup = el('div', { class: 'settings-subgroup' }, [
      el('h4', { class: 'settings-subtitle', id: 'settings-mobile-title', ...tx('settings.mobileControls') }),
      el('div', { class: 'settings-options', role: 'radiogroup', 'aria-labelledby': 'settings-mobile-title' }, this.schemeOptions),
    ]);

    this.customizeNote = el('span', { class: 'settings-customize-note', id: 'settings-customize-note' });
    this.customTag = el('span', { class: 'settings-option-tag settings-custom-tag', hidden: true, ...tx('settings.customized') });
    this.customizeButton = el('button', {
      class: 'btn settings-customize', type: 'button', 'data-nav': true, 'aria-haspopup': 'dialog',
      'aria-describedby': 'settings-customize-note', ...iconLabel('settings.customize', ICONS.right),
    });
    this.customizeButton.addEventListener('click', () => this.openEditor());
    const customize = el('div', { class: 'settings-customize-row' }, [
      this.customizeButton,
      el('p', { class: 'settings-customize-text' }, [this.customizeNote, this.customTag]),
    ]);

    // ---- Combat --------------------------------------------------------------
    // Combat Assist's two choices, On first, each named and ticked when it
    // is the saved one; the default says so, as Joystick's card does.
    this.assistOptions = [true, false].map((on) => {
      const option = el('button', {
        class: 'settings-choice', type: 'button', role: 'radio', 'aria-checked': 'false',
        'data-nav': true, 'data-combat-assist': on ? 'on' : 'off',
      }, [
        el('span', { class: 'settings-choice-name' }, [
          el('span', tx(on ? 'settings.combatAssistOn' : 'settings.combatAssistOff')),
          on === DEFAULT_COMBAT_ASSIST ? el('span', { class: 'settings-option-tag', ...tx('common.default') }) : null,
        ]),
        el('span', { class: 'settings-language-check', 'aria-hidden': 'true', html: ICONS.check }),
      ]);
      option.addEventListener('click', () => this.chooseCombatAssist(on));
      return option;
    });
    const assistGroup = el('div', { class: 'settings-subgroup' }, [
      el('h4', { class: 'settings-subtitle', id: 'settings-assist-title', ...tx('settings.combatAssist') }),
      el('p', { class: 'settings-group-note', id: 'settings-assist-desc', ...tx('settings.combatAssistDesc') }),
      el('div', {
        class: 'settings-choices', role: 'radiogroup',
        'aria-labelledby': 'settings-assist-title', 'aria-describedby': 'settings-assist-desc',
      }, this.assistOptions),
    ]);

    // ---- Panel ---------------------------------------------------------------
    this.closeButton = el('button', {
      class: 'settings-close', type: 'button', 'data-nav': true, ...tattr('aria-label', 'settings.close'), html: ICONS.close,
    });
    this.closeButton.addEventListener('click', () => this.close());

    this.sections = {
      language: section('language', 'settings.language', 'settings.languageNote', [languageGroup]),
      controls: section('controls', 'settings.controls', 'settings.controlsNote', [schemeGroup, customize]),
      combat: section('combat', 'settings.combat', null, [assistGroup]),
    };
    this.body = el('div', { class: 'settings-body' }, Object.values(this.sections));
    this.panel = el('div', { class: 'settings-panel glass glass--panel' }, [
      el('header', { class: 'settings-header' }, [
        el('div', { class: 'settings-heading' }, [
          el('span', { class: 'kicker', ...tx('brand.title') }),
          el('h2', { class: 'settings-title', id: 'settings-title', ...tx('settings.title') }),
        ]),
        this.closeButton,
      ]),
      this.body,
    ]);
    root.replaceChildren(this.panel);
    // A press on the dim around the panel closes it; one inside never does.
    root.addEventListener('click', (e) => {
      if (e.target === root) this.close();
    });

    this.scope = { el: root, onBack: () => this.close() };
    app.settings.onChange(() => {
      if (this.open_) this.markCurrent();
    });
    this.markCurrent();
  }

  get isOpen() {
    return this.open_;
  }

  languageFor(language) {
    return this.languageOptions.find((o) => o.getAttribute('data-language') === language);
  }

  schemeFor(scheme) {
    return this.schemeOptions.find((o) => o.getAttribute('data-mobile-controls') === scheme);
  }

  assistFor(on) {
    return this.assistOptions.find((o) => o.getAttribute('data-combat-assist') === (on ? 'on' : 'off'));
  }

  // Opens over the current screen (Home), which goes inert beneath it, and
  // focuses the language in use. `returnFocus` gets focus back on close.
  open({ returnFocus = document.activeElement } = {}) {
    if (this.open_) return;
    this.open_ = true;
    this.returnFocus = returnFocus;
    this.background = this.app.screens.current?.el ?? null;
    if (this.background) this.background.inert = true;
    this.markCurrent();
    this.root.hidden = false;
    this.body.scrollTop = 0;
    this.app.nav.pushScope(this.scope);
    this.languageFor(this.app.settings.language)?.focus({ preventScroll: true });
  }

  // Closes (the editor first, if it is open) and hands focus back.
  close() {
    if (!this.open_) return;
    this.app.touchEditor?.close({ silent: true });
    this.open_ = false;
    this.root.hidden = true;
    this.root.inert = false;
    this.app.nav.popScope(this.scope);
    if (this.background && this.background === this.app.screens.current?.el) this.background.inert = false;
    this.background = null;
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected !== false) target?.focus?.({ preventScroll: true });
    if (this.root.contains(document.activeElement)) document.activeElement.blur?.();
  }

  // Shows the saved choices checked, and the Customize line for the scheme
  // in use (with a Custom layout tag once that scheme has one).
  markCurrent() {
    const { language, mobileControls, combatAssist } = this.app.settings;
    for (const option of this.languageOptions) {
      const on = option.getAttribute('data-language') === language;
      option.classList.toggle('is-current', on);
      option.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    for (const option of this.schemeOptions) {
      const on = option.getAttribute('data-mobile-controls') === mobileControls;
      option.classList.toggle('is-current', on);
      option.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    for (const option of this.assistOptions) {
      const on = option === this.assistFor(combatAssist);
      option.classList.toggle('is-current', on);
      option.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    setText(this.customizeNote, 'settings.customizeNote', { scheme: { t: schemeName(mobileControls) } });
    this.customTag.hidden = Object.keys(this.app.settings.touchLayout(mobileControls)).length === 0;
  }

  // Saves `language`; the interface follows at once and the dialog stays.
  chooseLanguage(language) {
    this.app.settings.set('language', language);
    this.markCurrent();
  }

  // Saves `scheme` as the Mobile Controls layout; the dialog stays.
  chooseScheme(scheme) {
    this.app.settings.set('mobileControls', scheme);
    this.markCurrent();
  }

  // Saves Combat Assist on (`on` true) or off; the dialog stays. The next
  // Quick Battle or Practice Ground session uses it.
  chooseCombatAssist(on) {
    this.app.settings.set('combatAssist', on);
    this.markCurrent();
  }

  // The touch layout editor, over this dialog, for the scheme in use.
  openEditor() {
    if (!this.open_ || !this.app.touchEditor) return;
    this.root.inert = true;
    this.app.touchEditor.open({
      scheme: this.app.settings.mobileControls,
      returnFocus: this.customizeButton,
      onClose: () => {
        this.root.inert = false;
        this.markCurrent();
      },
    });
  }
}
