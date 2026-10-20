// SELECT STAGE: a large live preview of the highlighted stage with its
// details, beside the stage roster: CONFIG.stageRoster.totalSlots (24)
// slots laid out six by four on a large display, the playable stages
// (MAPS, in order: Yerma, Sol-Noir, Asperitas, Adamaris, Jökull) in the first slots and every
// other slot a reserved, unavailable placeholder (see stageSlots in
// js/data/maps.js), plus Random Stage. Confirming starts Quick Battle's
// Battle. It is Custom Play's last step, after Select CPU; Regular Play
// draws its stage instead, and reaches this screen only by Change Stage
// after a match, as the step after Select Fighter (its steps say so).
//
// A stage tile previews its stage when it is highlighted (focus, which
// mouse hover and the controller cursor give it too); a pointer press
// selects it and a second confirms, a keyboard or controller press selects
// and confirms at once (as on Select Fighter). Placeholders are plain,
// non-interactive slots: never focused, selected or started. Random Stage
// is an action, not a slot: it selects one of the playable stages at
// random (randomStage, every one equally likely), highlights its tile and
// previews it, and leaves the player here to confirm or roll again.
//
// Watch Mode's Select Stage is another instance (js/screens/watch-screens.js):
// the options below name its screen, its setup and step, where its choice is
// kept and its start button's label (a translation key); it also says what
// starting hands the Battle screen (battleParams). Left out, they are Quick
// Battle's. Each keeps its own `mapId`, so neither changes the other's.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { t, tx, tattr, iconLabel, setAttr, setText, plural } from '../localization/i18n.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader, refreshSteps, currentSetup, quickBattleSetup } from '../ui/components.js';
import { quickBattleParams, randomStage } from './quick-battle-setup.js';
import { MAPS, getMap, stageSlots, traitId } from '../data/maps.js';
import { StagePreview } from '../ui/stage-preview.js';

export class MapSelectScreen extends Screen {
  constructor(app, {
    id = 'map',
    setup = () => quickBattleSetup(app.selection, { stage: true }),
    step = () => quickBattleSetup(app.selection, { stage: true }).steps.length - 1,
    selection = () => app.selection, startLabel = 'map.start',
    // Random Stage's randomness (returns [0, 1), as Math.random does).
    random = Math.random,
  } = {}) {
    super(app, id);
    // The object holding this setup's `mapId`, read on every use.
    this.selection = selection;
    this.random = random;
    const reduced = app.device.reducedMotion;
    this.heroCanvas = el('canvas', { class: 'map-hero-canvas', 'aria-hidden': 'true' });
    this.hero = new StagePreview(this.heroCanvas, { animated: true, pan: true, reducedMotion: reduced });
    this.heroEl = el('div', { class: 'map-hero', role: 'img' }, [this.heroCanvas]);

    // ---- The highlighted stage's details --------------------------------
    this.infoName = el('h2', { class: 'map-info-name', id: `${id}-stage-name` });
    this.infoBadge = el('span', { class: 'map-info-badge', hidden: true, ...iconLabel('common.selected', ICONS.check, { iconFirst: true }) });
    this.infoTag = el('p', { class: 'map-info-tag' });
    this.traits = el('dl', { class: 'map-traits' });
    this.info = el('section', { class: 'map-info', 'aria-live': 'polite', 'aria-labelledby': `${id}-stage-name` }, [
      el('div', { class: 'map-info-head' }, [this.infoName, this.infoBadge]),
      this.infoTag,
      this.traits,
    ]);

    // ---- The roster ---------------------------------------------------------
    this.slots = stageSlots().map((slot) => this.buildTile(slot));
    this.tiles = this.slots.filter((tile) => tile._map);
    this.grid = el('div', { class: 'stage-grid', role: 'list', ...tattr('aria-label', 'map.roster') },
      this.slots.map((tile) => el('div', { class: 'stage-cell', role: 'listitem' }, [tile])));
    this.scroller = el('div', { class: 'stage-scroll' }, [this.grid]);

    this.randomBtn = el('button', {
      class: 'btn btn--random', type: 'button', 'data-nav': true,
      ...iconLabel('map.random', ICONS.shuffle, { iconFirst: true }),
    });
    this.randomBtn.addEventListener('click', () => this.pickRandom());
    this.randomBtn.addEventListener('focus', () => this.showHero(this.selectedMap));

    this.startBtn = el('button', {
      class: 'btn btn--primary btn--start', type: 'button', 'data-nav': true,
      ...iconLabel(startLabel, ICONS.arrow),
    });
    this.startBtn.addEventListener('click', () => this.start());
    this.startBtn.addEventListener('focus', () => this.showHero(this.selectedMap));
    this.countEl = el('span', { class: 'panel-meta map-count' });

    this.el.replaceChildren(
      screenHeader({ title: 'map.title', kicker: currentSetup(setup).name, setup, step, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body map-layout' }, [
        this.heroEl,
        el('section', { class: 'map-roster', ...tattr('aria-label', 'map.stages') }, [
          el('div', { class: 'panel-head map-roster-head' }, [
            el('span', { class: 'panel-title', ...tx('map.stages') }),
            this.countEl,
            this.randomBtn,
          ]),
          this.scroller,
          this.info,
          this.startBtn,
        ]),
      ]),
    );
    this.heroMap = null;
    this.localize();
  }

  // One roster slot: a stage's tile (its thumbnail, number and name, and a
  // check while it is the selected stage), or a reserved placeholder (its
  // number and a lock, nothing to press).
  buildTile({ index, num, map }) {
    if (!map) {
      // Plain element without data-nav: never focused, hovered into or tabbed to.
      const tile = el('div', { class: 'stage-tile is-locked', role: 'img', ...tattr('aria-label', 'map.locked', { num }) }, [
        el('span', { class: 'stage-tile-art' }, [el('span', { class: 'stage-tile-lock', html: ICONS.lock })]),
        el('span', { class: 'stage-tile-num', text: num }),
        el('span', { class: 'stage-tile-name', 'aria-hidden': 'true' }),
      ]);
      tile._index = index;
      tile._map = null;
      return tile;
    }
    const thumb = el('canvas', { class: 'stage-tile-thumb', 'aria-hidden': 'true' });
    const tile = el('button', {
      class: 'stage-tile is-available', type: 'button', 'data-nav': true, 'data-map': map.id,
      'aria-pressed': 'false',
      ...tattr('aria-label', 'map.card', { name: { t: `map.${map.id}.name` }, tagline: { t: `map.${map.id}.tagline` } }),
    }, [
      el('span', { class: 'stage-tile-art' }, [thumb]),
      el('span', { class: 'stage-tile-num', text: num }),
      el('span', { class: 'stage-tile-check', html: ICONS.check }),
      el('span', { class: 'stage-tile-name', ...tx(`map.${map.id}.name`) }),
    ]);
    tile._index = index;
    tile._map = map;
    // A still thumbnail: the stage as the map lays it out, no hazard
    // running in it (the hero preview is the animated one).
    tile._preview = new StagePreview(thumb, { animated: false, pan: false, reducedMotion: true });
    tile.addEventListener('focus', () => this.showHero(map));
    tile.addEventListener('click', (e) => this.activate(tile, e));
    return tile;
  }

  // The stage counter follows the language's plural rules, so it is re-read
  // here on every language change (App calls localize() on each screen),
  // and so are the highlighted stage's details.
  localize() {
    this.countEl.textContent = t('map.counter', {
      available: plural('map.available', this.tiles.length),
      slots: plural('map.slotTotal', this.slots.length),
    });
    if (this.heroMap) this.describe(this.heroMap);
  }

  // The stage `mapId` names now, or the first playable one.
  get selectedMap() {
    return getMap(this.selection().mapId) || MAPS[0];
  }

  tileFor(map) {
    return this.tiles.find((tile) => tile._map === map) ?? null;
  }

  focusDefault() {
    const tile = this.tileFor(this.selectedMap) || this.tiles[0];
    tile.focus({ preventScroll: true });
    tile.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  enter() {
    refreshSteps(this.el);
    this.select(this.selectedMap);
    this.heroMap = null;
    this.showHero(this.selectedMap);
    this.scroller.scrollTop = 0;
    this.renderThumbs();
  }

  renderThumbs() {
    // Thumbnails need layout; wait a frame so sizes are known.
    requestAnimationFrame(() => {
      for (const tile of this.tiles) tile._preview.setMap(tile._map, null);
    });
  }

  // `map` becomes this setup's stage: its tile checked, every other not.
  select(map) {
    if (!map) return;
    this.selection().mapId = map.id;
    for (const tile of this.tiles) {
      const on = tile._map === map;
      tile.classList.toggle('is-selected', on);
      tile.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (this.heroMap) this.describe(this.heroMap);
  }

  // The large preview and the details show `map` (the highlighted stage).
  showHero(map) {
    if (!map || this.heroMap === map) return;
    this.heroMap = map;
    setAttr(this.heroEl, 'aria-label', 'map.preview', { name: { t: `map.${map.id}.name` } });
    this.el.dataset.map = map.id;
    this.describe(map);
    // Stage only: no fighters in the hero preview.
    requestAnimationFrame(() => this.hero.setMap(map, null));
  }

  // The details of `map`: its name, tagline and traits (its hazards among
  // them, called hazards), and whether it is the selected stage.
  describe(map) {
    setText(this.infoName, `map.${map.id}.name`);
    setText(this.infoTag, `map.${map.id}.tagline`);
    this.infoBadge.hidden = this.selection().mapId !== map.id;
    this.traits.replaceChildren(...(map.traits ?? []).map(([label]) => {
      const id = traitId(label);
      const hazard = id === 'hazards' ? ' is-hazard' : '';
      return el('div', { class: hazard.trim() || null, 'data-trait': id }, [
        el('dt', { class: `map-trait-label${hazard}`, ...tx(`map.trait.${id}`) }),
        el('dd', { class: `map-trait-value${hazard}`, ...tx(`map.${map.id}.trait.${id}`) }),
      ]);
    }));
  }

  activate(tile, e) {
    if (!tile._map) return;
    const wasSelected = this.selection().mapId === tile._map.id;
    this.select(tile._map);
    this.showHero(tile._map);
    if (e.detail === 0 || wasSelected) this.start();
  }

  // Random Stage: one of the playable stages, every one equally likely
  // (never a placeholder, never Practice Ground), selected, highlighted and
  // previewed. It never starts the battle: the player confirms, or rolls
  // again (focus stays on Random Stage).
  pickRandom() {
    const map = randomStage(this.random);
    if (!map) return null;
    this.select(map);
    this.showHero(map);
    this.tileFor(map)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return map;
  }

  start() {
    if (!getMap(this.selection().mapId)) return;
    this.app.screens.go('battle', this.battleParams());
  }

  // Quick Battle: its stage, Player 1's fighter, the CPU's fighter and the
  // CPU's level.
  battleParams() {
    return quickBattleParams(this.selection());
  }

  update(dt) {
    this.hero.render(dt);
    for (const tile of this.tiles) {
      const canvas = tile._preview.canvas;
      if (canvas.width !== Math.round(canvas.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 2))) {
        tile._preview.render(0, true);
      }
    }
  }
}
