// Help + credits content, shared by the Help & Credits screen, the pause
// menu and the Home credits roll. Key bindings are rendered straight from
// CONFIG.bindings.

import { CONFIG, ACTION_LABELS, keyLabel } from '../config.js';
import { el } from '../core/utils.js';
import { ICONS } from './icons.js';

// Wired into input and combat but reserved until it has attack artwork.
const PENDING = new Set(['special']);

function keys(codes) {
  return el('span', { class: 'keys' }, codes.map((c) => el('kbd', { text: keyLabel(c) })));
}

function card(title, children, cls = '') {
  return el('section', { class: `info-card ${cls}` }, [el('h3', { class: 'info-title', text: title }), ...children]);
}

function controlsTable() {
  const order = ['left', 'right', 'charge', 'jump', 'primary', 'special', 'defense', 'action1', 'action2', 'pause'];
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
  return el('div', { class: 'mobile-diagram', role: 'img', 'aria-label': 'Landscape phone layout: Left, Charge and Right controls at the lower left; Throw (T), Special, Defense (D), Basic Attack 1 (BA1), Basic Attack 2 (BA2) and Jump staggered at the lower right; the timer and Pause at the top centre. Throw makes #0001 throw a shuriken. #0001 uses Dodge as its Defense.' }, [
    el('div', { class: 'md-screen' }, [
      dot('md-pause', ICONS.pause, 'Pause'),
      dot('md-left', ICONS.left, 'Left'),
      dot('md-charge', '<b>C</b>', 'Charge'),
      dot('md-right', ICONS.right, 'Right'),
      dot('md-throw', '<b>T</b>', 'Throw'),
      dot('md-special', ICONS.special, 'Special'),
      dot('md-defense', '<b>D</b>', 'Defense'),
      dot('md-a1', '<b>BA1</b>', 'Basic Attack 1'),
      dot('md-a2', '<b>BA2</b>', 'Basic Attack 2'),
      dot('md-jump', ICONS.jump, 'Jump'),
    ]),
    el('dl', { class: 'detail-list md-legend' }, [
      el('dt', { text: 'Lower left' }), el('dd', { text: 'Left · Charge · Right' }),
      el('dt', { text: 'Lower right' }), el('dd', { text: 'T, Special · D, BA1 · BA2 · Jump' }),
      el('dt', { text: 'T' }), el('dd', { text: 'Throw; #0001 throws a shuriken.' }),
      el('dt', { text: 'D' }), el('dd', { text: 'Defense; #0001 uses Dodge as its Defense.' }),
      el('dt', { text: 'Top centre' }), el('dd', { text: 'Timer · Pause' }),
    ]),
  ]);
}

export function buildHelp() {
  return el('div', { class: 'info-grid' }, [
    card('Desktop controls', [
      controlsTable(),
      el('p', { class: 'info-note', text: 'Keys can be held together — run and jump at the same time. Gamepads with a standard layout also work (D-pad / left stick left and right to move, down to Charge, A to jump, X / Square for Throw, B for Basic Attack 1, LB for Basic Attack 2, RB / RT for Defense, Start to pause; Y / Triangle is reserved for Special). In menus, S / ↓ and D-pad / stick down still move down.' }),
    ], 'info-card--wide'),
    card('Mobile controls', [
      mobileDiagram(),
      el('p', { class: 'info-note', text: 'Play in landscape. Hold a direction and press Jump with your other thumb; you can slide between Left, C and Right without lifting. C is Charge: hold it to charge. T is Throw. D is Defense, which #0001 uses to Dodge. BA1 and BA2 are Basic Attacks 1 and 2; only the dashed Special button is reserved.' }),
    ]),
    card('Movement', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Left / Right accelerate into a run. Release to slow to a stop.' }),
        el('li', { text: 'Jump from the ground; you can steer while airborne.' }),
        el('li', { text: 'Standing still, your fighter turns to face the opponent.' }),
      ]),
    ]),
    card('Charge & Energy', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Hold Charge (S / ↓, or C on touch) while grounded to enter #0001’s charging stance. Charge must be held: release it to stop charging.' }),
        el('li', { text: 'Charge plays its two-frame startup once, then loops its sustained pose for as long as you hold it. Each new Charge starts again from the startup.' }),
        el('li', { text: 'You stay in place while charging. Let go and #0001 shows its first Charge pose for a moment before returning to normal. Jump, BA1, BA2, Throw and Defense (Dodge) take over from Charge at once, and a hit interrupts it.' }),
        el('li', { text: 'The blue Energy meter under each health bar begins full. It is reserved for the Energy system: nothing spends or restores Energy yet.' }),
      ]),
    ]),
    card('Throw', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Throw (J, X / Square, or T on touch) makes #0001 throw one shuriken per press. Holding it does not throw again; press again for another.' }),
        el('li', { text: 'The shuriken leaves #0001’s hand as the arm whips forward and flies straight the way #0001 was facing, spinning. It hits once, then disappears; a Dodge lets it pass through.' }),
        el('li', { text: 'Throw works on the ground only: there is no mid-air Throw yet.' }),
      ]),
    ]),
    card('Defense', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Defense (L, RB / RT, or D on touch) is the shared defensive button. Each fighter defends in its own way: #0001 dodges.' }),
        el('li', { text: 'One press, one Dodge: a sidestep on the ground, an afterimage dodge in the air. Holding Defense does not repeat it; press again for another.' }),
        el('li', { text: 'Attacks pass through #0001 during the Dodge’s evasive frames and hit normally just before and after them. A Dodge never takes chip damage.' }),
      ]),
    ]),
    card('Stages & platforms', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Desert is wide and open, with two rock outcrops you can hop onto.' }),
        el('li', { text: 'City stacks one-way platforms over the rooftop. Jump up through them from below, and walk off an edge to come back down.' }),
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
      el('p', { class: 'info-text', text: '#0001 has idle, run, jump, fall and land animations, ground and mid-air hurt poses, a held Charge stance, Basic Attack 1 (BA1) and Basic Attack 2 (BA2), each on the ground and in the air, and a ground Throw. BA1 (action1) is a punch on the ground and a kick in the air; BA2 (action2) is a spinning high kick on the ground and a kunai slash in the air. Throw (the primary action) throws an animated shuriken. Only Special is still reserved: it is wired into the input and combat systems but waits for matching attack sprites. Defense is a ground and mid-air Dodge for #0001. Energy starts full for both fighters. The training CPU never attacks.' }),
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
