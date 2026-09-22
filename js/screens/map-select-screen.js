// SELECT MAP: large live preview of the highlighted stage + selectable cards.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader, hintBar, MENU_HINTS } from '../ui/components.js';
import { MAPS, getMap } from '../data/maps.js';
import { StagePreview } from '../ui/stage-preview.js';

const REF_VIEW_W = 960;

export class MapSelectScreen extends Screen {
  constructor(app) {
    super(app, 'map');
    const reduced = app.device.reducedMotion;
    this.heroCanvas = el('canvas', { class: 'map-hero-canvas', 'aria-hidden': 'true' });
    this.hero = new StagePreview(this.heroCanvas, { animated: true, pan: true, reducedMotion: reduced });

    this.heroIndex = el('span', { class: 'kicker' });
    this.heroName = el('h2', { class: 'map-hero-name', id: 'map-hero-name' });
    this.heroTagline = el('p', { class: 'map-hero-tagline' });
    this.heroDesc = el('p', { class: 'map-hero-desc' });
    this.heroTraits = el('dl', { class: 'map-traits' });

    this.cards = MAPS.map((map, i) => {
      const thumb = el('canvas', { class: 'map-thumb', 'aria-hidden': 'true' });
      const card = el('button', {
        class: 'map-card', type: 'button', role: 'radio', 'data-nav': true, 'data-map': map.id,
        'aria-checked': 'false', 'aria-label': `${map.name}. ${map.tagline}`,
      }, [
        el('span', { class: 'map-thumb-wrap' }, [thumb]),
        el('span', { class: 'map-card-body' }, [
          el('span', { class: 'map-card-index', text: `Stage ${String(i + 1).padStart(2, '0')}` }),
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
      html: `<span>Start Battle</span>${ICONS.arrow}`,
    });
    this.startBtn.addEventListener('click', () => this.start());

    this.el.replaceChildren(
      screenHeader({ title: 'Select Map', kicker: 'Quick Battle', step: 2, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body map-layout' }, [
        el('section', { class: 'map-hero', 'aria-labelledby': 'map-hero-name' }, [
          this.heroCanvas,
          el('div', { class: 'map-hero-info' }, [this.heroIndex, this.heroName, this.heroTagline, this.heroDesc, this.heroTraits]),
        ]),
        el('div', { class: 'map-side' }, [
          el('div', { class: 'panel-head' }, [
            el('span', { class: 'panel-title', text: 'Stages' }),
            el('span', { class: 'panel-meta', text: `${MAPS.length} available` }),
          ]),
          el('div', { class: 'map-cards', role: 'radiogroup', 'aria-label': 'Stages' }, this.cards),
          this.startBtn,
        ]),
      ]),
      hintBar(MENU_HINTS),
    );
    this.heroMap = null;
  }

  focusDefault() {
    const card = this.cards.find((c) => c._map.id === this.app.selection.mapId) || this.cards[0];
    card.focus({ preventScroll: true });
  }

  enter() {
    this.select(getMap(this.app.selection.mapId) || MAPS[0]);
    this.showHero(getMap(this.app.selection.mapId) || MAPS[0]);
    this.app.loadCharacter(this.app.selection.characterId).then((set) => {
      this.sprites = set?.usable ? set : null;
      this.hero.sprites = this.sprites;
      this.renderThumbs();
    });
    this.renderThumbs();
  }

  renderThumbs() {
    // Thumbnails need layout; wait a frame so sizes are known.
    requestAnimationFrame(() => {
      for (const c of this.cards) c._preview.setMap(c._map, null);
    });
  }

  select(map) {
    this.app.selection.mapId = map.id;
    for (const c of this.cards) {
      const on = c._map.id === map.id;
      c.classList.toggle('is-selected', on);
      c.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    this.startBtn.querySelector('span').textContent = `Start Battle · ${map.name}`;
  }

  showHero(map) {
    if (this.heroMap === map) return;
    this.heroMap = map;
    const i = MAPS.indexOf(map);
    this.heroIndex.textContent = `Stage ${String(i + 1).padStart(2, '0')}`;
    this.heroName.textContent = map.name;
    this.heroTagline.textContent = map.tagline;
    this.heroDesc.textContent = map.description;
    const width = `${(map.worldWidth / REF_VIEW_W).toFixed(1)} screens wide`;
    // Each term/value pair is grouped so a pair never wraps apart.
    this.heroTraits.replaceChildren(
      ...[['Size', width], ...map.traits].map(([k, v]) => el('div', { class: 'map-trait' }, [el('dt', { text: k }), el('dd', { text: v })])),
    );
    this.el.dataset.map = map.id;
    requestAnimationFrame(() => this.hero.setMap(map, this.sprites));
  }

  activate(card, e) {
    const wasSelected = this.app.selection.mapId === card._map.id;
    this.select(card._map);
    this.showHero(card._map);
    if (e.detail === 0 || wasSelected) this.start();
  }

  start() {
    this.app.screens.go('battle', { mapId: this.app.selection.mapId, characterId: this.app.selection.characterId });
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
