// SELECT STAGE: large live preview of the highlighted stage + selectable cards.
// Confirming starts Quick Battle's Battle.
//
// Watch Mode's Select Stage is another instance (js/screens/watch-screens.js):
// the options below name its screen, its setup and step, where its choice is
// kept and its start button's label; it also says what starting hands the
// Battle screen (battleParams). Left out, they are Quick Battle's.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader, QUICK_BATTLE_SETUP } from '../ui/components.js';
import { MAPS, getMap } from '../data/maps.js';
import { StagePreview } from '../ui/stage-preview.js';

export class MapSelectScreen extends Screen {
  constructor(app, {
    id = 'map', setup = QUICK_BATTLE_SETUP, step = 3, selection = () => app.selection, startLabel = 'Confirm and start battle',
  } = {}) {
    super(app, id);
    // The object holding this setup's `mapId`, read on every use.
    this.selection = selection;
    const reduced = app.device.reducedMotion;
    this.heroCanvas = el('canvas', { class: 'map-hero-canvas', 'aria-hidden': 'true' });
    this.hero = new StagePreview(this.heroCanvas, { animated: true, pan: true, reducedMotion: reduced });
    this.heroEl = el('div', { class: 'map-hero', role: 'img' }, [this.heroCanvas]);

    this.cards = MAPS.map((map) => {
      const thumb = el('canvas', { class: 'map-thumb', 'aria-hidden': 'true' });
      const card = el('button', {
        class: 'map-card', type: 'button', role: 'radio', 'data-nav': true, 'data-map': map.id,
        'aria-checked': 'false', 'aria-label': `${map.name}. ${map.tagline}`,
      }, [
        el('span', { class: 'map-thumb-wrap' }, [thumb]),
        el('span', { class: 'map-card-body' }, [
          el('span', { class: 'map-card-name', text: map.name }),
          el('span', { class: 'map-card-tag', text: map.tagline }),
        ]),
        el('span', { class: 'map-card-selected', html: `${ICONS.check}<span>Selected</span>` }),
      ]);
      card._map = map;
      card._preview = new StagePreview(thumb, { animated: false, pan: false, reducedMotion: true });
      card.addEventListener('focus', () => this.showHero(map));
      card.addEventListener('click', (e) => this.activate(card, e));
      return card;
    });

    this.startBtn = el('button', {
      class: 'btn btn--primary btn--start', type: 'button', 'data-nav': true,
      html: `<span>${startLabel}</span>${ICONS.arrow}`,
    });
    this.startBtn.addEventListener('click', () => this.start());

    this.el.replaceChildren(
      screenHeader({ title: 'Select Stage', kicker: setup.name, setup, step, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body map-layout' }, [
        this.heroEl,
        el('div', { class: 'map-side' }, [
          el('div', { class: 'panel-head' }, [
            el('span', { class: 'panel-title', text: 'Stages' }),
            el('span', { class: 'panel-meta', text: `${MAPS.length} available` }),
          ]),
          el('div', { class: 'map-cards', role: 'radiogroup', 'aria-label': 'Stages' }, this.cards),
          this.startBtn,
        ]),
      ]),
    );
    this.heroMap = null;
  }

  focusDefault() {
    const card = this.cards.find((c) => c._map.id === this.selection().mapId) || this.cards[0];
    card.focus({ preventScroll: true });
  }

  enter() {
    this.select(getMap(this.selection().mapId) || MAPS[0]);
    this.showHero(getMap(this.selection().mapId) || MAPS[0]);
    this.renderThumbs();
  }

  renderThumbs() {
    // Thumbnails need layout; wait a frame so sizes are known.
    requestAnimationFrame(() => {
      for (const c of this.cards) c._preview.setMap(c._map, null);
    });
  }

  select(map) {
    this.selection().mapId = map.id;
    for (const c of this.cards) {
      const on = c._map.id === map.id;
      c.classList.toggle('is-selected', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  showHero(map) {
    if (this.heroMap === map) return;
    this.heroMap = map;
    this.heroEl.setAttribute('aria-label', `${map.name} stage preview`);
    this.el.dataset.map = map.id;
    // Stage only: no fighters in the hero preview.
    requestAnimationFrame(() => this.hero.setMap(map, null));
  }

  activate(card, e) {
    const wasSelected = this.selection().mapId === card._map.id;
    this.select(card._map);
    this.showHero(card._map);
    if (e.detail === 0 || wasSelected) this.start();
  }

  start() {
    this.app.screens.go('battle', this.battleParams());
  }

  // Quick Battle: its stage, Player 1's fighter (the CPU plays the same one)
  // and the CPU's level.
  battleParams() {
    const { mapId, characterId, difficulty } = this.selection();
    return { mapId, characterId, difficulty };
  }

  update(dt) {
    this.hero.render(dt);
    for (const c of this.cards) {
      if (c._preview.canvas.width !== Math.round(c._preview.canvas.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 2))) {
        c._preview.render(0, true);
      }
    }
  }
}
