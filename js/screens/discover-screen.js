// DISCOVER: the in-game reference. An index rail of sections (Movement,
// Launch, Passives) beside one scrollable page; on narrow windows the rail
// runs across the top instead. Each page is built from the registry the game
// plays by, never the tuning values, so the reference cannot drift from
// gameplay: Movement from MOVEMENT_GUIDE in js/data/movement.js (the
// universal run, jumps and Dash every fighter shares), Launch from
// js/data/launch.js (Launch Point, the Base Launch values and the formula
// they follow, and every Directional Launch). It explains mechanics only:
// it never says which fighter or attack uses which Base Launch or
// direction, so it stays the same as the roster grows.
//
// The rail is a tablist with automatic activation: keyboard or gamepad focus
// on a section shows it, a click or tap selects it, and mouse hover is only a
// preview. The open page is itself a stop in menu navigation so a gamepad can
// scroll it: ↑ / ↓ scroll it, and leave it once it can scroll no further.
//
// The copy is read through the translations (js/localization/i18n.js), keyed by the
// registries' own ids: English is the registries' copy itself, French its
// translation, and the pages follow the interface language.

import { Screen } from '../core/screen-manager.js';
import { findNeighbor } from '../core/menu-navigator.js';
import { el } from '../core/utils.js';
import { tx, tattr } from '../localization/i18n.js';
import { screenHeader } from '../ui/components.js';
import { MOVEMENT_GUIDE } from '../data/movement.js';
import { BASE_LAUNCH_VALUES, DIRECTIONAL_LAUNCHES } from '../data/launch.js';

// Where the rail turns horizontal: narrow windows, but never short landscape
// ones. Keep in step with the matching rule in css/discover.css (narrow windows).
const NARROW_QUERY = '(max-width: 600px) and (min-height: 441px), (max-aspect-ratio: 1/1) and (min-height: 600px)';

const DIRECTIONS = ['up', 'down', 'left', 'right'];

// An arrow pointing right, turned by CSS to show a Directional Launch, and
// a dash for none. Decorative: the direction's name says which it is.
const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h11M9 4l4 4-4 4"/></svg>';
const DASH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h8"/></svg>';

// A string given as a translation key, or [key, params].
const label = (spec) => (Array.isArray(spec) ? spec : [spec]);

// One reference entry: a title and what it explains (and any `extra` under
// it, such as a formula), beside its rows, if it has any. `title` and `text`
// are translation keys.
function entry(id, title, text, list = null, extra = null) {
  const titleId = `discover-${id}`;
  return el('article', { class: 'discover-entry', 'aria-labelledby': titleId }, [
    el('div', { class: 'discover-entry-about' }, [
      el('h3', { class: 'discover-entry-title', id: titleId, ...tx(title) }),
      el('p', { class: 'discover-entry-text', ...tx(text) }),
      extra,
    ]),
    list,
  ]);
}

// One row: a decorative marker beside a name and its description (keys, or
// [key, params]).
function row(dataset, marker, name, description) {
  return el('li', { class: 'discover-tier', dataset }, [
    marker,
    el('div', { class: 'discover-tier-copy' }, [
      el('span', { class: 'discover-tier-name', ...tx(...label(name)) }),
      el('span', { class: 'discover-tier-desc', ...tx(...label(description)) }),
    ]),
  ]);
}

// Movement: the one entry every fighter shares (it says so), beside the
// universal run, jumps and Dash, each marked with a plain bullet. Names
// and descriptions only: no tuning numbers.
function buildMovementPage() {
  return el('div', { class: 'discover-page' }, [
    el('h2', { class: 'discover-page-title', ...tx('discover.movement') }),
    entry('movement', 'discover.movementTitle', 'movement.summary',
      el('ul', { class: 'discover-tiers', ...tattr('aria-label', 'discover.movementList') }, MOVEMENT_GUIDE.map((move) =>
        row({ move: move.id }, el('span', { class: 'discover-mark', 'aria-hidden': 'true' }),
          `movement.${move.id}.name`, `movement.${move.id}.description`)))),
  ]);
}

// Launch: Launch Point, then every Base Launch value (each marked with the
// number itself, not a meter: they are literal multipliers) and the formula
// they follow, then every Directional Launch. Generic mechanics only.
function buildLaunchPage() {
  return el('div', { class: 'discover-page' }, [
    el('h2', { class: 'discover-page-title', ...tx('discover.launch') }),
    entry('launch-point', 'discover.launchPointTitle', 'launch.pointSummary'),
    entry('base-launch', 'discover.baseLaunchTitle', 'launch.baseSummary',
      el('ol', { class: 'discover-tiers', ...tattr('aria-label', 'discover.baseLaunchValues') }, BASE_LAUNCH_VALUES.map((value) =>
        row({ value: String(value) },
          el('span', { class: 'discover-value', 'aria-hidden': 'true', text: String(value) }),
          ['discover.baseLaunchValue', { value }], `launch.base.${value}`))),
      el('p', { class: 'discover-formula', ...tx('launch.formula') })),
    entry('directional-launch', 'discover.directionalLaunchTitle', 'launch.directionalSummary',
      el('ul', { class: 'discover-tiers', ...tattr('aria-label', 'discover.directions') }, DIRECTIONAL_LAUNCHES.map((direction) => {
        const key = `launch.direction.${direction.id ?? 'none'}`;
        return row({ direction: direction.id ?? 'none' },
          el('span', { class: 'discover-direction', 'aria-hidden': 'true', html: direction.id ? ARROW : DASH }),
          `${key}.name`, `${key}.description`);
      }))),
  ]);
}

// Passives has no content yet, on purpose: the section is scaffolding for a
// future passives registry, so its page stays empty rather than faked.
// `label` is the tab's translation key.
const SECTIONS = [
  { id: 'movement', label: 'discover.movement', build: buildMovementPage },
  { id: 'launch', label: 'discover.launch', build: buildLaunchPage },
  { id: 'passives', label: 'discover.passives', build: () => null },
];

export class DiscoverScreen extends Screen {
  constructor(app) {
    super(app, 'discover');
    this.sections = SECTIONS.map((section) => {
      const tab = el('button', {
        class: 'discover-tab', type: 'button', role: 'tab', id: `discover-tab-${section.id}`,
        'aria-controls': `discover-panel-${section.id}`, 'aria-selected': 'false', tabindex: '-1',
        'data-nav': true, 'data-nav-no-hover-focus': true, ...tx(section.label),
      });
      const panel = el('div', {
        class: 'discover-panel', role: 'tabpanel', id: `discover-panel-${section.id}`,
        'aria-labelledby': `discover-tab-${section.id}`, tabindex: '0', hidden: true,
        'data-nav': true, 'data-nav-no-hover-focus': true,
      }, [section.build()]);
      tab.addEventListener('click', () => this.show(section.id));
      tab.addEventListener('focus', () => this.show(section.id));
      return { ...section, tab, panel };
    });
    this.tabs = this.sections.map((s) => s.tab);

    this.rail = el('div', {
      class: 'discover-rail', role: 'tablist', ...tattr('aria-label', 'discover.sections'), 'aria-orientation': 'vertical',
    }, this.tabs);
    this.narrowQuery = window.matchMedia?.(NARROW_QUERY) ?? null;
    this.narrowQuery?.addEventListener?.('change', () => this.updateOrientation());

    this.el.replaceChildren(
      screenHeader({ title: 'discover.title', kicker: 'brand.title', onBack: () => this.onBack() }),
      el('div', { class: 'screen-body discover-layout' }, [
        this.rail,
        el('div', { class: 'discover-panels' }, this.sections.map((s) => s.panel)),
      ]),
    );
    this.active = null;
  }

  // Every visit opens on Movement, the first section.
  enter() {
    this.active = null;
    this.show(SECTIONS[0].id);
    this.updateOrientation();
  }

  focusDefault() {
    this.current?.tab.focus({ preventScroll: true });
  }

  get current() {
    return this.sections.find((s) => s.id === this.active) || null;
  }

  show(id) {
    if (this.active === id) return;
    this.active = id;
    for (const s of this.sections) {
      const on = s.id === id;
      s.tab.setAttribute('aria-selected', on ? 'true' : 'false');
      // Roving tabindex: Tab reaches the selected section only; arrows,
      // D-pad and stick move between sections.
      s.tab.setAttribute('tabindex', on ? '0' : '-1');
      s.tab.classList.toggle('is-active', on);
      s.panel.hidden = !on;
      if (on) s.panel.scrollTop = 0;
    }
  }

  updateOrientation() {
    this.rail.setAttribute('aria-orientation', this.narrowQuery?.matches ? 'horizontal' : 'vertical');
  }

  // Directions while the open page has focus: ↑ / ↓ scroll it while it can
  // still scroll that way. Leaving it toward the rail lands on the open
  // section's tab, never on another one (which would switch pages). Anything
  // else is the navigator's usual spatial move.
  onCommand(cmd) {
    const section = this.current;
    if (!DIRECTIONS.includes(cmd) || !section || document.activeElement !== section.panel) return false;
    if ((cmd === 'up' || cmd === 'down') && this.scrollPage(section.panel, cmd === 'down' ? 1 : -1)) return true;
    const next = findNeighbor(section.panel, this.app.nav.candidates(this.el), cmd);
    if (!next || !this.tabs.includes(next)) return false;
    section.tab.focus({ preventScroll: true });
    this.app.audio.play('move');
    return true;
  }

  scrollPage(panel, dir) {
    const max = panel.scrollHeight - panel.clientHeight;
    if (dir < 0 ? panel.scrollTop <= 0 : panel.scrollTop >= max - 1) return false;
    panel.scrollBy({ top: dir * panel.clientHeight * 0.4, behavior: this.app.device.reducedMotion ? 'auto' : 'smooth' });
    return true;
  }
}
