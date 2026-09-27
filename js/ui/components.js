// Shared UI building blocks for menu screens. Every label is a translation
// key (js/core/i18n.js), marked so it follows the language.

import { el } from '../core/utils.js';
import { tx, tattr, iconLabel } from '../core/i18n.js';
import { ICONS } from './icons.js';

// The setups that end in a Battle, each with its steps in order, as
// translation keys (a step with params is [key, params]). A setup screen
// passes its setup (Quick Battle unless it says otherwise) and its own index
// in it.
export const QUICK_BATTLE_SETUP = Object.freeze({
  name: 'setup.quickBattle',
  steps: Object.freeze(['step.mode', 'step.difficulty', 'step.fighter', 'step.stage']),
});
export const WATCH_SETUP = Object.freeze({
  name: 'setup.watch',
  steps: Object.freeze(['step.difficulty', ['step.cpu', { n: 1 }], ['step.cpu', { n: 2 }], 'step.stage']),
});

// A label given as a key, or as [key, params].
const label = (spec) => (Array.isArray(spec) ? spec : [spec]);

// `title` and `kicker` are translation keys, or [key, params].
export function screenHeader({ title, kicker, step = null, setup = QUICK_BATTLE_SETUP, onBack }) {
  const back = el('button', {
    class: 'btn-back',
    type: 'button',
    'data-nav': true,
    ...tattr('aria-label', 'common.back'),
    ...iconLabel('common.back', ICONS.back, { iconFirst: true }),
  });
  back.addEventListener('click', onBack);

  let steps = null;
  if (step !== null) {
    steps = el('ol', { class: 'steps', ...tattr('aria-label', 'setup.steps', { name: { t: setup.name } }) },
      setup.steps.map((name, i) =>
        el('li', {
          class: i < step ? 'is-done' : i === step ? 'is-current' : '',
          'aria-current': i === step ? 'step' : null,
        }, [
          // Completed steps show a check, so progress doesn't rely on tone alone.
          el('span', i < step ? { class: 'step-num', html: ICONS.check } : { class: 'step-num', text: String(i + 1) }),
          el('span', { class: 'step-name', ...tx(...label(name)) }),
        ]),
      ),
    );
  }

  return el('header', { class: 'screen-header' }, [
    back,
    el('div', { class: 'screen-heading' }, [
      kicker ? el('span', { class: 'kicker', ...tx(...label(kicker)) }) : null,
      el('h1', { class: 'screen-title', ...tx(...label(title)) }),
    ]),
    steps,
  ]);
}

// Keyboard hint bar (hidden on touch-first devices via CSS). Each item is
// [keycaps, label key]; a keycap is a literal symbol or a translation key.
export function hintBar(items) {
  return el('footer', { class: 'hint-bar', 'aria-hidden': 'true' },
    items.map(([keys, key]) =>
      el('span', { class: 'hint' }, [
        ...keys.map((k) => el('kbd', k.startsWith('key.') ? tx(k) : { text: k })),
        el('span', { class: 'hint-label', ...tx(key) }),
      ]),
    ),
  );
}

// A full-width action in a glass menu panel (pause, result, Practice menu),
// labelled by translation key `key`. opts.primary: green fill, and the
// panel's default focus. opts.outlineOnly: background stays transparent
// through hover/press; the focus ring is unchanged.
export function menuButton(key, opts = {}) {
  return el('button', {
    class: `pause-btn-item${opts.primary ? ' is-primary' : ''}${opts.outlineOnly ? ' is-outline-only' : ''}`,
    type: 'button', 'data-nav': true,
    'data-nav-default': opts.primary || null,
    disabled: opts.disabled || null,
    ...tx(key),
  });
}

export const MENU_HINTS = [
  [['↑', '↓', '←', '→'], 'hint.navigate'],
  [['key.enter'], 'hint.select'],
  [['key.esc'], 'hint.back'],
];
