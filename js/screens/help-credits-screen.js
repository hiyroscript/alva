// HELP AND CREDITS: two tabs sharing one scrollable panel.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { screenHeader, hintBar } from '../ui/components.js';
import { buildHelp, buildCredits } from '../ui/help-content.js';

export class HelpCreditsScreen extends Screen {
  constructor(app) {
    super(app, 'help');
    this.tabs = [
      { id: 'help', label: 'HELP', build: buildHelp },
      { id: 'credits', label: 'CREDITS', build: buildCredits },
    ].map((t) => {
      const btn = el('button', {
        class: 'tab', type: 'button', role: 'tab', id: `tab-${t.id}`,
        'aria-controls': `panel-${t.id}`, 'aria-selected': 'false', 'data-nav': true,
        text: t.label,
      });
      const panel = el('div', {
        class: 'tab-panel', role: 'tabpanel', id: `panel-${t.id}`, 'aria-labelledby': `tab-${t.id}`,
        tabindex: '0', hidden: true,
      }, [t.build()]);
      btn.addEventListener('click', () => this.show(t.id));
      btn.addEventListener('focus', () => this.show(t.id));
      return { ...t, btn, panel };
    });
    this.tabs[0].btn.setAttribute('data-nav-default', '');

    this.el.replaceChildren(
      screenHeader({ title: 'HELP AND CREDITS', kicker: 'MAXY', onBack: () => this.onBack() }),
      el('div', { class: 'screen-body help-layout' }, [
        el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Help and credits' }, this.tabs.map((t) => t.btn)),
        el('div', { class: 'tab-panels' }, this.tabs.map((t) => t.panel)),
      ]),
      hintBar([[['←', '→'], 'Switch tab'], [['↑', '↓'], 'Scroll'], [['Esc'], 'Back']]),
    );
    this.active = null;
  }

  enter(params) {
    this.show(params?.tab || 'help');
  }

  focusDefault() {
    this.tabs.find((t) => t.id === this.active)?.btn.focus({ preventScroll: true });
  }

  show(id) {
    if (this.active === id) return;
    this.active = id;
    for (const t of this.tabs) {
      const on = t.id === id;
      t.btn.setAttribute('aria-selected', on ? 'true' : 'false');
      t.btn.classList.toggle('is-active', on);
      t.panel.hidden = !on;
      if (on) t.panel.scrollTop = 0;
    }
  }

  // Up/Down scroll the active panel so long help text is reachable by keyboard.
  onCommand(cmd) {
    if (cmd !== 'up' && cmd !== 'down') return false;
    const panel = this.tabs.find((t) => t.id === this.active)?.panel;
    if (!panel) return false;
    panel.scrollBy({ top: (cmd === 'down' ? 1 : -1) * panel.clientHeight * 0.4, behavior: this.app.device.reducedMotion ? 'auto' : 'smooth' });
    return true;
  }
}
