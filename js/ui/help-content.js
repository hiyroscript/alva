// Help + credits content, shared by the Help & Credits screen and the pause
// menu. Key bindings are rendered straight from CONFIG.bindings.

import { CONFIG, ACTION_LABELS, keyLabel } from '../config.js';
import { el } from '../core/utils.js';
import { ICONS } from './icons.js';

const PENDING = new Set(['primary', 'special', 'action1', 'action2']);

function keys(codes) {
  return el('span', { class: 'keys' }, codes.map((c) => el('kbd', { text: keyLabel(c) })));
}

function card(title, children, cls = '') {
  return el('section', { class: `info-card ${cls}` }, [el('h3', { class: 'info-title', text: title }), ...children]);
}

function controlsTable() {
  const order = ['left', 'right', 'down', 'jump', 'primary', 'special', 'block', 'action1', 'action2', 'pause'];
  const rows = order.map((action) =>
    el('tr', {}, [
      el('th', { scope: 'row' }, [
        ACTION_LABELS[action],
        PENDING.has(action) ? el('span', { class: 'tag', text: 'RESERVED' }) : null,
      ]),
      el('td', {}, [keys(CONFIG.bindings[action])]),
    ]),
  );
  return el('table', { class: 'controls-table' }, [
    el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: 'Action' }), el('th', { scope: 'col', text: 'Keys' })])]),
    el('tbody', {}, rows),
  ]);
}

function mobileDiagram() {
  const dot = (cls, icon, label) =>
    el('span', { class: `md-btn ${cls}`, title: label }, [el('span', { class: 'md-icon', html: icon })]);
  return el('div', { class: 'mobile-diagram', role: 'img', 'aria-label': 'Landscape phone layout: movement buttons Left, Down, Right at the lower left; Primary, Special, Block, Action 1, Action 2 and Jump staggered at the lower right; Pause at the upper right.' }, [
    el('div', { class: 'md-screen' }, [
      dot('md-pause', ICONS.pause, 'Pause'),
      dot('md-left', ICONS.left, 'Left'),
      dot('md-down', ICONS.down, 'Down'),
      dot('md-right', ICONS.right, 'Right'),
      dot('md-primary', ICONS.primary, 'Primary'),
      dot('md-special', ICONS.special, 'Special'),
      dot('md-block', ICONS.block, 'Block'),
      dot('md-a1', '<b>A1</b>', 'Action 1'),
      dot('md-a2', '<b>A2</b>', 'Action 2'),
      dot('md-jump', ICONS.jump, 'Jump'),
    ]),
    el('dl', { class: 'detail-list md-legend' }, [
      el('dt', { text: 'Lower left' }), el('dd', { text: 'Left · Down · Right' }),
      el('dt', { text: 'Lower right' }), el('dd', { text: 'Primary, Special · Block, Action 1 · Action 2 · Jump' }),
      el('dt', { text: 'Top right' }), el('dd', { text: 'Pause' }),
    ]),
  ]);
}

export function buildHelp() {
  return el('div', { class: 'info-grid' }, [
    card('DESKTOP CONTROLS', [
      controlsTable(),
      el('p', { class: 'info-note', text: 'Keys can be held together — run and jump at the same time. Gamepads with a standard layout also work (D-pad / stick to move, A to jump, Start to pause).' }),
    ], 'info-card--wide'),
    card('MOBILE CONTROLS', [
      mobileDiagram(),
      el('p', { class: 'info-note', text: 'Play in landscape. Hold a direction and press Jump with your other thumb; you can slide between the movement buttons without lifting.' }),
    ]),
    card('MOVEMENT', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Left / Right accelerate into a run. Release to slow to a stop.' }),
        el('li', { text: 'Jump from the ground; you can steer while airborne.' }),
        el('li', { text: 'Standing still, your fighter turns to face the opponent.' }),
        el('li', { text: 'Hold Down on solid ground to crouch in place.' }),
      ]),
    ]),
    card('STAGES & PLATFORMS', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'DESERT is wide and open, with two rock outcrops you can hop onto.' }),
        el('li', { text: 'CITY stacks one-way platforms over the rooftop. Jump up through them from below.' }),
        el('li', { text: 'Press Down while standing on a platform to drop through it. The water-tower deck is solid footing.' }),
        el('li', { text: 'The camera follows the action; stage edges are walled off.' }),
      ]),
    ]),
    card('PAUSE', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Press Esc or P, or tap the pause button in the top-right corner.' }),
        el('li', { text: 'Resume, restart the battle, read this help, or return to Home.' }),
        el('li', { text: 'The game pauses automatically when you switch tabs or rotate to portrait.' }),
      ]),
    ]),
    card('THIS BUILD', [
      el('p', { class: 'info-text', text: '#0001 currently has idle and run animations. Primary, Special, Action 1 and Action 2 are wired into the input and combat systems but stay inactive until matching attack sprites are added. Block sets a guard state that uses the idle pose.' }),
    ]),
  ]);
}

export function buildCredits() {
  return el('div', { class: 'info-grid info-grid--credits' }, [
    card('MAXY', [
      el('p', { class: 'credit-lead', text: `Created by ${CONFIG.developer}` }),
      el('p', { class: 'info-text', text: 'Game design, code, user interface and the Desert and City stage art are original work for Maxy.' }),
    ]),
    card('#0001 SPRITE SOURCE', [
      el('p', { class: 'info-text', text: 'Source attribution for the original sprite material used for #0001:' }),
      el('dl', { class: 'detail-list credit-list' }, [
        el('dt', { text: 'Character' }), el('dd', { text: 'Naruto Uzumaki' }),
        el('dt', { text: 'Game' }), el('dd', { text: 'Jump Ultimate Stars' }),
        el('dt', { text: 'Platform' }), el('dd', { text: 'Nintendo DS / DSi' }),
        el('dt', { text: 'Source' }), el('dd', { text: 'The Spriters Resource' }),
        el('dt', { text: 'Source sheet' }), el('dd', { text: 'Uploaded by Dazz' }),
        el('dt', { text: 'Contributor' }), el('dd', { text: 'FRET' }),
      ]),
      el('p', { class: 'info-text', text: `${CONFIG.developer} did not create the original Naruto artwork and does not own the Naruto or Jump Ultimate Stars intellectual property.` }),
    ], 'info-card--wide'),
    card('RIGHTS', [
      el('p', { class: 'info-text', text: 'Original characters, games, and related properties belong to their respective rights holders.' }),
    ]),
  ]);
}
