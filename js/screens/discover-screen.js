// DISCOVER: the in-game reference. An index rail of sections (Power,
// Conditions) beside one scrollable page; on narrow windows the rail runs
// across the top instead. The Power page is built from the Power registry
// the game plays by (POWERS in js/data/powers.js: names, descriptions and
// tier numbers, never the tuning values), so the reference cannot drift from
// gameplay. It explains mechanics only: it never says which fighter or
// attack uses which Power or tier, so it stays the same as the roster grows.
//
// The rail is a tablist with automatic activation: keyboard or gamepad focus
// on a section shows it, a click or tap selects it, and mouse hover is only a
// preview. The open page is itself a stop in menu navigation so a gamepad can
// scroll it: ↑ / ↓ scroll it, and leave it once it can scroll no further.

import { Screen } from '../core/screen-manager.js';
import { findNeighbor } from '../core/menu-navigator.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { screenHeader } from '../ui/components.js';
import { POWERS } from '../data/powers.js';

// Where the rail turns horizontal: narrow windows, but never short landscape
// ones. Keep in step with the matching rule in styles.css (Discover, narrow).
const NARROW_QUERY = '(max-width: 600px) and (min-height: 441px), (max-aspect-ratio: 1/1) and (min-height: 600px)';

const DIRECTIONS = ['up', 'down', 'left', 'right'];

// Tier i of n as n rising bars, the first i filled. Decorative: the tier's
// name carries its number.
function tierMeter(tier, count) {
  return el('span', { class: 'discover-meter', 'aria-hidden': 'true' },
    Array.from({ length: count }, (_, i) => el('i', {
      class: i < tier ? 'is-on' : null,
      style: `height: ${Math.round(((i + 1) / count) * 100)}%`,
    })),
  );
}

// One Power: what it does, beside its tiers. Names and descriptions only.
function powerEntry(power) {
  const titleId = `discover-power-${power.id}`;
  const count = power.tiers.length;
  return el('article', { class: 'discover-entry', 'aria-labelledby': titleId }, [
    el('div', { class: 'discover-entry-about' }, [
      el('h3', { class: 'discover-entry-title', id: titleId, text: power.name }),
      el('p', { class: 'discover-entry-text', text: power.summary }),
    ]),
    el('ol', { class: 'discover-tiers', 'aria-label': `${power.name} tiers` }, power.tiers.map((tier) =>
      el('li', { class: 'discover-tier', dataset: { tier: String(tier.tier) } }, [
        tierMeter(tier.tier, count),
        el('div', { class: 'discover-tier-copy' }, [
          el('span', { class: 'discover-tier-name', text: tier.name }),
          el('span', { class: 'discover-tier-desc', text: tier.description }),
        ]),
      ]))),
  ]);
}

function buildPowerPage() {
  return el('div', { class: 'discover-page' }, [
    el('h2', { class: 'discover-page-title', text: 'Power' }),
    ...POWERS.map(powerEntry),
  ]);
}

// Conditions has no content yet, on purpose: the section is scaffolding for
// a future Conditions system, so its page stays empty rather than faked.
const SECTIONS = [
  { id: 'power', label: 'Power', build: buildPowerPage },
  { id: 'conditions', label: 'Conditions', build: () => null },
];

export class DiscoverScreen extends Screen {
  constructor(app) {
    super(app, 'discover');
    this.sections = SECTIONS.map((section) => {
      const tab = el('button', {
        class: 'discover-tab', type: 'button', role: 'tab', id: `discover-tab-${section.id}`,
        'aria-controls': `discover-panel-${section.id}`, 'aria-selected': 'false', tabindex: '-1',
        'data-nav': true, 'data-nav-no-hover-focus': true, text: section.label,
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
      class: 'discover-rail', role: 'tablist', 'aria-label': 'Discover sections', 'aria-orientation': 'vertical',
    }, this.tabs);
    this.narrowQuery = window.matchMedia?.(NARROW_QUERY) ?? null;
    this.narrowQuery?.addEventListener?.('change', () => this.updateOrientation());

    this.el.replaceChildren(
      screenHeader({ title: 'Discover', kicker: CONFIG.title, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body discover-layout' }, [
        this.rail,
        el('div', { class: 'discover-panels' }, this.sections.map((s) => s.panel)),
      ]),
    );
    this.active = null;
  }

  // Every visit opens on Power, the first section.
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
