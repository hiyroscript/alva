// SELECT MODE: one large Quick Battle card with a details panel. The layout
// is a card rail so future modes slot in beside it.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader, hintBar, MENU_HINTS } from '../ui/components.js';
import { tintFrame, fitCanvas, drawFrameAt } from '../ui/sprite-art.js';

const MODES = [
  {
    id: 'quick-battle',
    index: '01',
    name: 'QUICK BATTLE',
    description: 'Choose a fighter and stage, then enter battle.',
    details: [
      ['Format', '1 vs CPU'],
      ['Rounds', '1'],
      ['Timer', CONFIG.battle.roundSeconds > 0 ? `${CONFIG.battle.roundSeconds} seconds` : 'Unlimited'],
      ['Opponent', 'Training CPU'],
    ],
  },
];

export class ModeSelectScreen extends Screen {
  constructor(app) {
    super(app, 'mode');
    const mode = MODES[0];
    this.art = el('canvas', { class: 'mode-art-canvas', 'aria-hidden': 'true' });
    const card = el('button', {
      class: 'mode-card', type: 'button', 'data-nav': true, 'data-nav-default': true,
      'aria-describedby': 'mode-desc',
    }, [
      el('div', { class: 'mode-card-art', 'aria-hidden': 'true' }, [
        el('div', { class: 'mode-art-sun' }),
        el('div', { class: 'mode-art-band' }),
        this.art,
      ]),
      el('div', { class: 'mode-card-body' }, [
        el('span', { class: 'mode-index', text: `MODE ${mode.index}` }),
        el('span', { class: 'mode-name', text: mode.name }),
        el('span', { class: 'mode-desc', id: 'mode-desc', text: mode.description }),
        el('span', { class: 'mode-cta', html: `SELECT ${ICONS.right}` }),
      ]),
    ]);
    card.addEventListener('click', () => {
      app.selection.mode = mode.id;
      app.screens.go('character');
    });

    const info = el('aside', { class: 'mode-info', 'aria-label': 'Mode details' }, [
      el('h2', { class: 'panel-title', text: 'MODE DETAILS' }),
      el('dl', { class: 'detail-list' }, mode.details.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
      el('ol', { class: 'flow-list', 'aria-label': 'How Quick Battle works' }, [
        ['Choose a fighter', 'Pick from the roster.'],
        ['Choose a stage', 'Desert or City.'],
        ['Battle', 'One round against the CPU.'],
      ].map(([t, d], i) => el('li', {}, [
        el('span', { class: 'flow-num', text: String(i + 1).padStart(2, '0') }),
        el('span', { class: 'flow-text' }, [el('b', { text: t }), el('span', { text: d })]),
      ]))),
      el('p', { class: 'panel-note', text: 'Quick Battle is the first mode in Maxy. The rail is built to hold more modes as they are added.' }),
      el('div', { class: 'mode-count' }, [el('span', { class: 'mode-count-num', text: '01' }), el('span', { text: ' / 01 MODES' })]),
    ]);

    this.el.replaceChildren(
      screenHeader({ title: 'SELECT MODE', kicker: 'PLAY', step: 0, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body mode-layout' }, [el('div', { class: 'mode-rail' }, [card]), info]),
      hintBar(MENU_HINTS),
    );
    this.silhouettes = null;
  }

  enter() {
    this.app.loadCharacter(this.app.selection.characterId).then((set) => {
      if (!set?.usable) return;
      const f = set.animations.idle.frames[0];
      this.silhouettes = { f, p1: tintFrame(f, '#0c0c0c'), rim: tintFrame(f, '#ff7a00'), p2: tintFrame(f, '#0c0c0c'), rim2: tintFrame(f, '#8a8a8a') };
      this.draw();
    });
  }

  update() {
    if (this.silhouettes && fitCanvas(this.art).changed) this.draw(true);
  }

  draw(sized = false) {
    const s = this.silhouettes;
    if (!s) return;
    const { w, h } = sized ? { w: this.art.width, h: this.art.height } : fitCanvas(this.art);
    const ctx = this.art.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    const n = Math.max(1, Math.floor((h * 0.62) / s.f.artH));
    const y = Math.round(h * 0.93);
    const off = Math.max(2, Math.round(n * 0.7));
    const pair = (img, dx, flip) => drawFrameAt(ctx, { ...s.f, canvas: img }, w * 0.5 + dx, y, n, flip);
    pair(s.rim, -w * 0.17 - off, false);
    pair(s.p1, -w * 0.17, false);
    pair(s.rim2, w * 0.17 + off, true);
    pair(s.p2, w * 0.17, true);
  }
}
