// HOME: editorial wordmark and navigation beside a looping credits roll.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { logoSVG } from '../ui/logo.js';
import { ICONS } from '../ui/icons.js';
import { CREDITS } from '../ui/help-content.js';

const ROLL_SPEED = 22; // credits roll, CSS px per second

// One pass of the credits. The roll shows it twice; the copy is hidden from
// assistive technology so the credits are announced once.
function creditsSequence({ copy = false } = {}) {
  return el('div', { class: 'home-credits-seq', 'aria-hidden': copy ? 'true' : null }, CREDITS.map((group) =>
    el('section', { class: 'home-credit' }, [
      el('h2', { class: 'home-credit-title', text: group.title }),
      group.lead ? el('p', { class: 'home-credit-lead', text: group.lead }) : null,
      group.text ? el('p', { class: 'home-credit-text', text: group.text }) : null,
      group.facts ? el('dl', { class: 'home-credit-facts' }, group.facts.flatMap(([dt, dd]) => [
        el('dt', { text: dt }), el('dd', { text: dd }),
      ])) : null,
    ]),
  ));
}

export class HomeScreen extends Screen {
  constructor(app) {
    super(app, 'home');

    const play = el('button', {
      class: 'home-action home-action--primary', type: 'button', 'data-nav': true, 'data-nav-default': true,
      html: `<span>Play</span>${ICONS.arrow}`,
    });
    // Help & Credits is disabled for now. Disabled buttons ignore clicks and
    // the menu navigator skips them; drop `disabled` to bring the entry back.
    const help = el('button', {
      class: 'home-action', type: 'button', 'data-nav': true, disabled: true,
      html: `<span>Help &amp; Credits</span>${ICONS.right}`,
    });
    play.addEventListener('click', () => app.screens.go('mode'));
    help.addEventListener('click', () => app.screens.go('help'));

    this.rollTrack = el('div', { class: 'home-credits-track' }, [creditsSequence(), creditsSequence({ copy: true })]);
    this.rollOffset = 0;

    this.el.replaceChildren(
      el('div', { class: 'home-main' }, [
        el('div', { class: 'home-intro' }, [
          el('h1', { class: 'home-title', id: 'home-title', html: logoSVG({ className: 'logo logo--display' }) }),
          el('p', { class: 'home-lede', text: 'Fan project. Big heart.' }),
          el('nav', { class: 'home-actions', 'aria-label': 'Main menu' }, [play, help]),
        ]),
      ]),
      el('footer', { class: 'home-footer' }, [
        el('span', { text: `by ${CONFIG.developer}` }),
      ]),
      el('aside', { class: 'home-credits', 'aria-label': 'Credits' }, [
        el('div', { class: 'home-credits-viewport' }, [this.rollTrack]),
      ]),
    );
    this.el.setAttribute('aria-labelledby', 'home-title');
  }

  // Runs on the app's frame loop, so re-entering Home never stacks timers.
  // The copy follows the first pass, so wrapping the offset at one pass
  // height restarts the credits without a visible seam.
  update(dt) {
    if (this.app.device.reducedMotion) {
      if (this.rollOffset) {
        this.rollOffset = 0;
        this.rollTrack.style.transform = '';
      }
      return;
    }
    const period = this.rollTrack.firstChild.getBoundingClientRect().height;
    if (!period) return;
    this.rollOffset = (this.rollOffset + ROLL_SPEED * dt) % period;
    this.rollTrack.style.transform = `translate3d(0, ${-this.rollOffset}px, 0)`;
  }
}
