// Shared UI building blocks for menu screens. Every label is a translation
// key (js/localization/i18n.js), marked so it follows the language.

import { el } from '../core/utils.js';
import { tx, tattr, setAttr, iconLabel } from '../localization/i18n.js';
import { ICONS } from './icons.js';

// The setups that end in a Battle, each with its steps in order, as
// translation keys (a step with params is [key, params]). Quick Battle has
// one per play type (chosen in Select Mode, app.selection.playType): Custom
// Play visits every step; Regular Play only Mode, Difficulty and Fighter,
// the CPU's fighter and the stage being drawn at random. Its stage selector
// is reached only by Change Stage after a match, as the step after Fighter.
// A setup screen passes its setup (Quick Battle's Custom Play unless it says
// otherwise) and its own index in it, either of them a function when it
// depends on the play type (see screenHeader).
const QUICK_STEPS = Object.freeze({
  mode: 'step.mode', difficulty: 'step.difficulty', fighter: 'step.fighter', cpu: 'step.opponent', stage: 'step.stage',
});
export const QUICK_BATTLE_CUSTOM_SETUP = Object.freeze({
  name: 'setup.quickBattle',
  steps: Object.freeze([QUICK_STEPS.mode, QUICK_STEPS.difficulty, QUICK_STEPS.fighter, QUICK_STEPS.cpu, QUICK_STEPS.stage]),
});
export const QUICK_BATTLE_REGULAR_SETUP = Object.freeze({
  name: 'setup.quickBattle',
  steps: Object.freeze([QUICK_STEPS.mode, QUICK_STEPS.difficulty, QUICK_STEPS.fighter]),
});
export const QUICK_BATTLE_REGULAR_STAGE_SETUP = Object.freeze({
  name: 'setup.quickBattle',
  steps: Object.freeze([QUICK_STEPS.mode, QUICK_STEPS.difficulty, QUICK_STEPS.fighter, QUICK_STEPS.stage]),
});
export const WATCH_SETUP = Object.freeze({
  name: 'setup.watch',
  steps: Object.freeze(['step.difficulty', ['step.cpu', { n: 1 }], ['step.cpu', { n: 2 }], 'step.stage']),
});

// Quick Battle's play types; anything else (a fresh or stale value) is
// Regular Play, the default.
export const PLAY_TYPES = Object.freeze(['regular', 'custom']);
export const resolvePlayType = (type) => (PLAY_TYPES.includes(type) ? type : PLAY_TYPES[0]);

// The Quick Battle setup the player is on, from `selection`'s play type.
// `stage`: the setup as seen from Select Stage, where Regular Play shows the
// stage as its own last step.
export function quickBattleSetup(selection, { stage = false } = {}) {
  if (resolvePlayType(selection?.playType) === 'custom') return QUICK_BATTLE_CUSTOM_SETUP;
  return stage ? QUICK_BATTLE_REGULAR_STAGE_SETUP : QUICK_BATTLE_REGULAR_SETUP;
}

// A label given as a key, or as [key, params].
const label = (spec) => (Array.isArray(spec) ? spec : [spec]);
const read = (value) => (typeof value === 'function' ? value() : value);

// The setup a screen was given, read now if it is a function.
export const currentSetup = (setup) => read(setup);

// `title` and `kicker` are translation keys, or [key, params]. `setup` and
// `step` are a setup and an index in it, or functions returning them, read
// again by refreshSteps() (on a screen's enter()) so the steps follow the
// path the player is on.
export function screenHeader({ title, kicker, step = null, setup = QUICK_BATTLE_CUSTOM_SETUP, onBack }) {
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
    steps = el('ol', { class: 'steps' });
    steps._refresh = () => markSteps(steps, read(setup), read(step));
    steps._refresh();
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

// Re-reads the setup steps in `root`'s header (a screen's own element).
export function refreshSteps(root) {
  root.querySelector('.steps')?._refresh?.();
}

// Fills `list` with `setup`'s steps, `step` the current one.
function markSteps(list, setup, step) {
  setAttr(list, 'aria-label', 'setup.steps', { name: { t: setup.name } });
  list.replaceChildren(...setup.steps.map((name, i) =>
    el('li', {
      class: i < step ? 'is-done' : i === step ? 'is-current' : '',
      'aria-current': i === step ? 'step' : null,
    }, [
      // Completed steps show a check, so progress doesn't rely on tone alone.
      el('span', i < step ? { class: 'step-num', html: ICONS.check } : { class: 'step-num', text: String(i + 1) }),
      el('span', { class: 'step-name', ...tx(...label(name)) }),
    ]),
  ));
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
