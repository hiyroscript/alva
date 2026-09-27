// SETTINGS: reached from Home. Holds the Mobile Controls setting, the touch
// layout Quick Battle and Practice Ground use, as a choice of two cards:
// Joystick (the default) and Classic Buttons (the original layout). Picking
// one saves it on this device at once (app.settings, js/core/settings.js);
// the next battle or practice uses it. Keyboard and gamepad controls never
// change.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader, hintBar, MENU_HINTS } from '../ui/components.js';
import { MOBILE_CONTROLS, MOBILE_CONTROLS_LABELS, DEFAULT_MOBILE_CONTROLS } from '../core/settings.js';

// What each layout gives the player, in a line.
const MOBILE_CONTROLS_TEXT = Object.freeze({
  joystick: 'A round joystick to move, with Charge just above it. Push the stick the same way twice to Dash.',
  classic: 'The original Left, C and Right buttons. Tap a direction twice to Dash; hold C to Charge.',
});

// A small picture of each layout's lower-left corner, for sighted players
// only (the card's name and line say the same).
const PREVIEW = Object.freeze({
  joystick: () => el('span', { class: 'settings-preview settings-preview--joystick', 'aria-hidden': 'true' }, [
    el('i', { class: 'sp-charge', html: ICONS.down }),
    el('i', { class: 'sp-stick' }, [el('i', { class: 'sp-knob' })]),
  ]),
  classic: () => el('span', { class: 'settings-preview settings-preview--classic', 'aria-hidden': 'true' }, [
    el('i', { class: 'sp-pad', html: ICONS.left }),
    el('i', { class: 'sp-pad', html: '<b>C</b>' }),
    el('i', { class: 'sp-pad', html: ICONS.right }),
  ]),
});

export class SettingsScreen extends Screen {
  constructor(app) {
    super(app, 'settings');

    const headingId = 'settings-mobile-controls';
    this.options = MOBILE_CONTROLS.map((scheme) => {
      const descId = `settings-mobile-${scheme}-desc`;
      const option = el('button', {
        class: 'settings-option', type: 'button', role: 'radio', 'aria-checked': 'false',
        'data-nav': true, 'data-nav-no-hover-focus': true, 'data-mobile-controls': scheme,
        'aria-describedby': descId,
      }, [
        el('span', { class: 'settings-option-top' }, [
          PREVIEW[scheme](),
          el('span', { class: 'settings-option-current', 'aria-hidden': 'true', html: `${ICONS.check}<span>Selected</span>` }),
        ]),
        el('span', { class: 'settings-option-text' }, [
          el('span', { class: 'settings-option-name' }, [
            MOBILE_CONTROLS_LABELS[scheme],
            scheme === DEFAULT_MOBILE_CONTROLS ? el('span', { class: 'settings-option-tag', text: 'Default' }) : null,
          ]),
          el('span', { class: 'settings-option-desc', id: descId, text: MOBILE_CONTROLS_TEXT[scheme] }),
        ]),
      ]);
      option._scheme = scheme;
      option.addEventListener('click', () => this.choose(scheme));
      return option;
    });

    this.el.replaceChildren(
      screenHeader({ title: 'Settings', kicker: CONFIG.title, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body settings-layout' }, [
        el('section', { class: 'settings-group' }, [
          el('div', { class: 'settings-group-head' }, [
            el('h2', { class: 'settings-group-title', id: headingId, text: 'Mobile Controls' }),
            el('p', { class: 'settings-group-note', text: 'The touch layout for Quick Battle and Practice Ground. Keyboard and gamepad controls stay the same.' }),
          ]),
          el('div', { class: 'settings-options', role: 'radiogroup', 'aria-labelledby': headingId }, this.options),
        ]),
      ]),
      hintBar(MENU_HINTS),
    );
  }

  get current() {
    return this.app.settings.mobileControls;
  }

  optionFor(scheme) {
    return this.options.find((o) => o._scheme === scheme);
  }

  enter() {
    this.markCurrent();
  }

  // Lands on the layout in use.
  focusDefault() {
    this.optionFor(this.current)?.focus({ preventScroll: true });
  }

  markCurrent() {
    const current = this.current;
    for (const option of this.options) {
      const on = option._scheme === current;
      option.classList.toggle('is-current', on);
      option.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  // Saves `scheme` and shows it selected; the screen stays open.
  choose(scheme) {
    this.app.settings.set('mobileControls', scheme);
    this.markCurrent();
  }
}
