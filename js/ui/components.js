// Shared UI building blocks for menu screens.

import { el } from '../core/utils.js';
import { ICONS } from './icons.js';

const STEPS = ['Mode', 'Fighter', 'Stage'];

export function screenHeader({ title, kicker, step = null, onBack }) {
  const back = el('button', {
    class: 'btn-back',
    type: 'button',
    'data-nav': true,
    'aria-label': 'Back',
    html: `${ICONS.back}<span>Back</span>`,
  });
  back.addEventListener('click', onBack);

  let steps = null;
  if (step !== null) {
    steps = el('ol', { class: 'steps', 'aria-label': 'Quick Battle setup' },
      STEPS.map((name, i) =>
        el('li', {
          class: i < step ? 'is-done' : i === step ? 'is-current' : '',
          'aria-current': i === step ? 'step' : null,
        }, [
          // Completed steps show a check, so progress doesn't rely on tone alone.
          el('span', i < step ? { class: 'step-num', html: ICONS.check } : { class: 'step-num', text: String(i + 1) }),
          el('span', { class: 'step-name', text: name }),
        ]),
      ),
    );
  }

  return el('header', { class: 'screen-header' }, [
    back,
    el('div', { class: 'screen-heading' }, [
      kicker ? el('span', { class: 'kicker', text: kicker }) : null,
      el('h1', { class: 'screen-title', text: title }),
    ]),
    steps,
  ]);
}

// Keyboard hint bar (hidden on touch-first devices via CSS).
export function hintBar(items) {
  return el('footer', { class: 'hint-bar', 'aria-hidden': 'true' },
    items.map(([keys, label]) =>
      el('span', { class: 'hint' }, [
        ...keys.map((k) => el('kbd', { text: k })),
        el('span', { class: 'hint-label', text: label }),
      ]),
    ),
  );
}

// A full-width action in a glass menu panel (pause, result, Practice menu).
// opts.primary: green fill, and the panel's default focus. opts.outlineOnly:
// background stays transparent through hover/press; the focus ring is
// unchanged.
export function menuButton(label, opts = {}) {
  return el('button', {
    class: `pause-btn-item${opts.primary ? ' is-primary' : ''}${opts.outlineOnly ? ' is-outline-only' : ''}`,
    type: 'button', 'data-nav': true,
    'data-nav-default': opts.primary || null,
    disabled: opts.disabled || null,
    text: label,
  });
}

export const MENU_HINTS = [
  [['↑', '↓', '←', '→'], 'Navigate'],
  [['Enter'], 'Select'],
  [['Esc'], 'Back'],
];
