// HOME: editorial wordmark and navigation beside a decorative CSS road.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { logoSVG } from '../ui/logo.js';
import { ICONS } from '../ui/icons.js';
import { hintBar } from '../ui/components.js';

export class HomeScreen extends Screen {
  constructor(app) {
    super(app, 'home');

    const play = el('button', {
      class: 'home-action home-action--primary', type: 'button', 'data-nav': true, 'data-nav-default': true,
      html: `<span>Play</span>${ICONS.arrow}`,
    });
    const help = el('button', {
      class: 'home-action', type: 'button', 'data-nav': true,
      html: `<span>Help &amp; Credits</span>${ICONS.right}`,
    });
    play.addEventListener('click', () => app.screens.go('mode'));
    help.addEventListener('click', () => app.screens.go('help'));

    this.el.replaceChildren(
      el('div', { class: 'home-road-scene', 'aria-hidden': 'true' }, [
        el('div', { class: 'home-road' }, [
          el('span', { class: 'home-road-lane' }),
          el('span', { class: 'home-road-lane' }),
        ]),
      ]),
      el('header', { class: 'home-header' }, [
        el('span', { html: logoSVG({ className: 'logo logo--mark', decorative: true }) }),
        el('span', { class: 'home-build', text: `Build ${CONFIG.version}` }),
      ]),
      el('div', { class: 'home-main' }, [
        el('div', { class: 'home-intro' }, [
          el('p', { class: 'home-eyebrow', text: '2D sprite fighting game' }),
          el('h1', { class: 'home-title', id: 'home-title', html: logoSVG({ className: 'logo logo--display' }) }),
          el('p', { class: 'home-lede', text: 'Fast, responsive fighting in your browser.' }),
          el('nav', { class: 'home-actions', 'aria-label': 'Main menu' }, [play, help]),
        ]),
      ]),
      el('footer', { class: 'home-footer' }, [
        el('span', { text: `by ${CONFIG.developer}` }),
        hintBar([[['↑', '↓'], 'Navigate'], [['Enter'], 'Select']]),
      ]),
    );
    this.el.setAttribute('aria-labelledby', 'home-title');
  }
}
