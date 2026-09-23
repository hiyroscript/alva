// Help + credits content, shared by the Help & Credits screen, the pause
// menu and the Home credits roll. Key bindings are rendered straight from
// CONFIG.bindings.

import { CONFIG, ACTION_LABELS, keyLabel } from '../config.js';
import { el } from '../core/utils.js';
import { ICONS } from './icons.js';

// Wired into input and combat but reserved until they have attack artwork.
const PENDING = new Set(['primary', 'special', 'action2']);

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
        PENDING.has(action) ? el('span', { class: 'tag', text: 'Reserved' }) : null,
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
  return el('div', { class: 'mobile-diagram', role: 'img', 'aria-label': 'Landscape phone layout: movement buttons Left, Down, Right at the lower left; Primary, Special, Block, Basic Attack 1 (BA1), Action 2 and Jump staggered at the lower right; the timer and Pause at the top centre.' }, [
    el('div', { class: 'md-screen' }, [
      dot('md-pause', ICONS.pause, 'Pause'),
      dot('md-left', ICONS.left, 'Left'),
      dot('md-down', ICONS.down, 'Down'),
      dot('md-right', ICONS.right, 'Right'),
      dot('md-primary', ICONS.primary, 'Primary'),
      dot('md-special', ICONS.special, 'Special'),
      dot('md-block', ICONS.block, 'Block'),
      dot('md-a1', '<b>BA1</b>', 'Basic Attack 1'),
      dot('md-a2', '<b>A2</b>', 'Action 2'),
      dot('md-jump', ICONS.jump, 'Jump'),
    ]),
    el('dl', { class: 'detail-list md-legend' }, [
      el('dt', { text: 'Lower left' }), el('dd', { text: 'Left · Down · Right' }),
      el('dt', { text: 'Lower right' }), el('dd', { text: 'Primary, Special · Block, BA1 · Action 2 · Jump' }),
      el('dt', { text: 'Top centre' }), el('dd', { text: 'Timer · Pause' }),
    ]),
  ]);
}

export function buildHelp() {
  return el('div', { class: 'info-grid' }, [
    card('Desktop controls', [
      controlsTable(),
      el('p', { class: 'info-note', text: 'Keys can be held together — run and jump at the same time. Gamepads with a standard layout also work (D-pad / stick to move, A to jump, B for Basic Attack 1, Start to pause).' }),
    ], 'info-card--wide'),
    card('Mobile controls', [
      mobileDiagram(),
      el('p', { class: 'info-note', text: 'Play in landscape. Hold a direction and press Jump with your other thumb; you can slide between the movement buttons without lifting. BA1 is Basic Attack 1; the dashed Primary, Special and Action 2 buttons are reserved.' }),
    ]),
    card('Movement', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Left / Right accelerate into a run. Release to slow to a stop.' }),
        el('li', { text: 'Jump from the ground; you can steer while airborne.' }),
        el('li', { text: 'Standing still, your fighter turns to face the opponent.' }),
        el('li', { text: 'Hold Down on solid ground to crouch in place.' }),
      ]),
    ]),
    card('Stages & platforms', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Desert is wide and open, with two rock outcrops you can hop onto.' }),
        el('li', { text: 'City stacks one-way platforms over the rooftop. Jump up through them from below.' }),
        el('li', { text: 'Press Down while standing on a platform to drop through it. The water-tower deck is solid footing.' }),
        el('li', { text: 'The camera follows the action; stage edges are walled off.' }),
      ]),
    ]),
    card('Pause', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Press Esc or P, or tap the timer or the pause button under it at the top centre.' }),
        el('li', { text: 'Resume, restart the battle, read this help, or return to Home.' }),
        el('li', { text: 'The game pauses automatically when you switch tabs or rotate to portrait.' }),
      ]),
    ]),
    card('This build', [
      el('p', { class: 'info-text', text: '#0001 has idle, run, jump, fall and land animations, ground and mid-air hurt poses, and Basic Attack 1 (BA1): a punch on the ground and a kick in the air. Primary, Special and Action 2 are wired into the input and combat systems but stay reserved until matching attack sprites are added. Block sets a guard state that uses the idle pose. The training CPU never attacks.' }),
    ]),
  ]);
}

// Credits live here once so the Home credits roll and the Credits tab can't
// drift apart. Each group is a title, an optional lead line and plain lines.
export const CREDITS = [
  { title: CONFIG.title, lead: `Created by ${CONFIG.developer}` },
  {
    title: 'Original work',
    lines: [`Game design, code, interface, ${CONFIG.title} wordmark, and Desert / City stage artwork by ${CONFIG.developer}.`],
  },
  {
    title: '#0001 sprite source',
    lines: [
      'Original sprite material from Jump Ultimate Stars',
      'The Spriters Resource',
      'Source sheet uploaded by Dazz',
      'Contributor: FRET',
    ],
  },
  {
    title: 'Rights',
    lines: [
      `${CONFIG.developer} did not create or claim ownership of the original third-party character/game artwork.`,
      'Original characters, games, and related properties belong to their respective rights holders.',
    ],
  },
  { title: 'Project', lines: ['Unofficial fan project.', 'No affiliation or endorsement is implied.'] },
];

export function buildCredits() {
  return el('div', { class: 'info-grid info-grid--credits' }, CREDITS.map((group) =>
    card(group.title, [
      group.lead ? el('p', { class: 'credit-lead', text: group.lead }) : null,
      group.lines ? el('p', { class: 'info-text' }, group.lines.flatMap((line, i) => (i ? [el('br'), line] : [line]))) : null,
    ]),
  ));
}
