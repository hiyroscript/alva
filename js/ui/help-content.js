// Help + credits content, shared by the Help & Credits screen, the pause
// menu and the Home credits roll. Key bindings are rendered straight from
// CONFIG.bindings.

import { CONFIG, ACTION_LABELS, keyLabel } from '../config.js';
import { el } from '../core/utils.js';
import { getCharacter } from '../data/characters.js';
import { ICONS } from './icons.js';
import { mobileAbility } from './mobile-abilities.js';

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

// The mobile layout as #0001 plays it: its own Shuriken, Punch and Kick
// come from its mobileAbilities, exactly as the real touch controls show
// them, beside the universal Shield, Special and Jump.
function mobileDiagram() {
  const dot = (cls, icon, label) =>
    el('span', { class: `md-btn ${cls}`, title: label }, [el('span', { class: 'md-icon', html: icon })]);
  const own = (cls, action) => {
    const { icon, label } = mobileAbility(getCharacter('0001'), action);
    return dot(cls, icon, label);
  };
  return el('div', { class: 'mobile-diagram', role: 'img', 'aria-label': 'Landscape phone layout for #0001: Left, Charge and Right controls at the lower left; Shuriken, Special, Shield, Punch, Kick and Jump staggered at the lower right; the timer and Pause at the top centre. Shuriken throws #0001’s shuriken. Hold Shield to keep #0001’s Shield up. Punch and Kick are Basic Attacks 1 and 2.' }, [
    el('div', { class: 'md-screen' }, [
      dot('md-pause', ICONS.pause, 'Pause'),
      dot('md-left', ICONS.left, 'Left'),
      dot('md-charge', '<b>C</b>', 'Charge'),
      dot('md-right', ICONS.right, 'Right'),
      own('md-throw', 'primary'),
      dot('md-special', ICONS.special, 'Special'),
      dot('md-defense', ICONS.shield, 'Shield'),
      own('md-a1', 'action1'),
      own('md-a2', 'action2'),
      dot('md-jump', ICONS.jump, 'Jump'),
    ]),
    el('dl', { class: 'detail-list md-legend' }, [
      el('dt', { text: 'Lower left' }), el('dd', { text: 'Left · Charge · Right' }),
      el('dt', { text: 'Lower right' }), el('dd', { text: 'Shuriken, Special, Shield, Punch, Kick and Jump' }),
      el('dt', { text: 'Shuriken' }), el('dd', { text: 'Throws #0001’s shuriken.' }),
      el('dt', { text: 'Shield' }), el('dd', { text: 'Hold it to keep #0001’s Shield up; let go to lower it.' }),
      el('dt', { text: 'Punch · Kick' }), el('dd', { text: 'Basic Attacks 1 and 2, on the ground and in the air. Hold Charge first for the Clone Attack or the Sphere Rush.' }),
      el('dt', { text: 'Top centre' }), el('dd', { text: 'Timer · Pause' }),
    ]),
  ]);
}

export function buildHelp() {
  return el('div', { class: 'info-grid' }, [
    card('Desktop controls', [
      controlsTable(),
      el('p', { class: 'info-note', text: 'Keys can be held together — run and jump at the same time. Gamepads with a standard layout also work (D-pad / left stick left and right to move, twice in a row to Dash, down to Charge, A to jump, X / Square for Throw, B for Basic Attack 1, LB for Basic Attack 2, RB / RT for Defense, Start to pause; Y / Triangle is reserved for Special). In menus, S / ↓ and D-pad / stick down still move down.' }),
    ], 'info-card--wide'),
    card('Mobile controls', [
      mobileDiagram(),
      el('p', { class: 'info-note', text: 'Play in landscape. Hold a direction and press Jump with your other thumb; you can slide between Left, C and Right without lifting, and tap Left or Right twice to Dash. C is Charge: hold it to charge. Shuriken throws; hold Shield to keep it up. Punch (the fist) and Kick (the leg) are Basic Attacks 1 and 2: hold C first to turn them into the Clone Attack and the Sphere Rush. Only the dashed Special button is reserved.' }),
    ]),
    card('Movement', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Left / Right accelerate into a run. Release to slow to a stop.' }),
        el('li', { text: 'Jump from the ground; your run carries into the jump, and you can steer while airborne. Tap Jump for a short hop, hold it for a full jump, and press it again in the air for one more jump. Landing, or being hit, gives that air jump back.' }),
        el('li', { text: 'Hold Charge (S / ↓, D-pad or stick down, or C on touch) in the air while falling to fast-fall back to the ground.' }),
        el('li', { text: 'Attacks keep some of your momentum. Press your next attack a little early and it comes out the moment it can. Land a hit and you can go straight into another attack or a jump: Punch → Kick, or Kick → Jump → Punch in the air. The higher the opponent’s Launch Point, the further each hit sends them, and the sooner a combo runs out.' }),
        el('li', { text: 'A hard hit sends a fighter tumbling and keeps it helpless a little longer: chase it. When you are hit, hold a direction to bend your launch a little that way, toward the stage to survive or away from a follow-up.' }),
        el('li', { text: 'Press the same direction twice quickly (Right, Right or Left, Left) on the ground to Dash: a short, fast burst that way. It only moves you: it never hits, and a ledge or a wall ends it.' }),
        el('li', { text: 'The bright purple bar above your fighter is Energy; it shows only while it is not full. A Dash costs 15 of its 100, and every hit your Shield blocks costs 25; it refills by itself, faster while you hold Charge. You can still Dash or Shield with less left than that, but it empties the bar. If Energy reaches zero, it turns gray and must fully refill before Shield and Dash become available again. Running, jumping and attacking never cost Energy.' }),
        el('li', { text: 'Your fighter faces the way it last moved or dashed, and keeps that facing when it stops: it never turns toward the opponent by itself.' }),
      ]),
    ]),
    card('Charge & cooldowns', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Hold Charge (S / ↓, or C on touch) while grounded to enter #0001’s charging stance. Charge must be held: release it to stop charging. Held in the air it is the fast fall instead; after landing, let go and hold it again to charge.' }),
        el('li', { text: 'Charge plays its two-frame startup once, then loops its sustained pose for as long as you hold it. Each new Charge starts again from the startup.' }),
        el('li', { text: 'You stay in place while charging. Let go and #0001 shows its first Charge pose for a moment before returning to normal. Jump and Throw take over from Charge at once, holding Defense raises the Shield instead, and a hit interrupts it. Letting go of Charge as you press BA1 gives a normal BA1, and the same goes for BA2.' }),
        el('li', { text: 'While already charging: Charge + BA1 (Punch on touch) = Clone Attack; Charge + BA2 (Kick on touch) = Sphere Rush. Pressing Charge and the button together from a standstill gives the normal attack.' }),
        el('li', { text: 'Hold Charge first, then press BA1 to summon a clone behind the opponent (the Clone Attack). The clone appears in a cloud of smoke, performs BA1 and disappears, while #0001 keeps charging for as long as you hold Charge. With no ground behind the opponent (a platform edge, or in the air), it appears above the opponent and performs Mid-air BA2 instead.' }),
        el('li', { text: 'Hold Charge first, then press BA2 for the Sphere Rush: #0001 forms a blue sphere in his hand, and only once it is complete does he dash forward with it. The rush must connect: a miss stops him and he lets the sphere go, with no explosion. A hit traps the opponent in the spinning sphere, adding 1 Launch Point at once and 1 more every half second, with no launch, while it grows bigger and bigger until, about two seconds later, it explodes for 15 more and launches sideways at Base Launch 3: three times the opponent’s new Launch Point. You can let go of Charge once it starts. A Shield blocks the sphere: no trap, no explosion.' }),
        el('li', { text: 'The Sphere Rush needs ground under #0001 from start to finish: losing it (running off an edge mid-rush, for instance) cancels the technique, frees the opponent and #0001 falls. A hit on #0001 cancels it too.' }),
        el('li', { text: 'Each charged move has its own 5-second cooldown, shown while it counts down as a white ring under your fighter: CAB1 for Charged BA1, CAB2 for Charged BA2. It starts the moment the move is used, hit or miss. While it is cooling down, the charged press does nothing. Charging makes both cooldowns recover twice as fast, and refills your Energy faster too.' }),
      ]),
    ]),
    card('Throw', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Throw (J, X / Square, or the Shuriken button on touch) makes #0001 throw one shuriken per press. Holding it does not throw again; press again for another.' }),
        el('li', { text: 'The shuriken leaves #0001’s hand as the arm whips forward and flies straight the way #0001 was facing, spinning. It hits once, then disappears, whether it strikes or a Shield blocks it.' }),
        el('li', { text: 'Throw works on the ground only: there is no mid-air Throw yet.' }),
      ]),
    ]),
    card('Defense', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Defense (L, RB / RT, or the Shield button on touch) is the shared defensive button. Each fighter defends in its own way: #0001 shields.' }),
        el('li', { text: 'Defense — Hold to Shield. Blocking a hit costs 25 Energy.' }),
        el('li', { text: 'Raise the Shield just before a hit lands for a perfect Shield: it costs nothing and you can strike back at once. Tapping Defense over and over does not count.' }),
        el('li', { text: 'The Shield is a circle all round #0001, on the ground and in the air. While it is up, any attack that reaches him is blocked, from either side: no Launch Point and no launch. Holding it costs nothing, and neither does an attack that misses.' }),
        el('li', { text: 'Shielding holds #0001 in place on the ground: no walking, Dash or jump. In the air he keeps falling. Let go of Defense to attack, throw, Dash or jump.' }),
        el('li', { text: 'Blocking with less than 25 Energy left still works, but empties the bar. If Energy reaches zero, it turns gray and must fully refill before Shield and Dash become available again.' }),
      ]),
    ]),
    card('Stages & platforms', [
      el('ul', { class: 'info-list' }, [
        el('li', { text: 'Stages are compact and open: there are no walls at their edges. Run, jump or get knocked off a ledge and you fall, so drift back toward the stage while you still can.' }),
        el('li', { text: 'The Void, the black region with a wavering edge a short way past each stage, is the kill boundary. Fall into it and you are out for 2 seconds, then back at your spawn with 0 Launch Point. In Quick Battle each fall is a point for your opponent (the dots under each card), and the first to 3 points wins; Practice Ground keeps no score.' }),
        el('li', { text: 'Desert is a sandstone mesa with two rock outcrops you can hop onto.' }),
        el('li', { text: 'City stacks one-way platforms over a rooftop. Jump up through them from below, and walk off an edge to come back down.' }),
        el('li', { text: 'The camera follows the action from far enough out to show the whole stage.' }),
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
      el('p', { class: 'info-text', text: '#0001 has idle, run, jump, fall and land animations, ground and mid-air hurt poses, a held Charge stance, Basic Attack 1 (BA1) and Basic Attack 2 (BA2), each on the ground and in the air, and a ground Throw. BA1 (action1) is a punch on the ground and a kunai slash in the air; BA2 (action2) is a spinning high kick on the ground and a kick in the air. Throw (the primary action) throws an animated shuriken. Only Special is still reserved: it is wired into the input and combat systems but waits for matching attack sprites. Defense is a held Shield for #0001, on the ground and in the air. Holding Charge turns BA1 into the Clone Attack and BA2 into the Sphere Rush, each on its own cooldown (CAB1, CAB2). A double tap of Left or Right is a Dash; a Dash and every hit the Shield blocks spend Energy. Every hit’s damage adds to the target’s Launch Point, which starts at 0. Then the hit launches with its Base Launch (0, 1, 2 or 3) times that new Launch Point, sideways, upward or downward by its Directional Launch: BA1 pushes sideways at 1, BA2 and mid-air BA1 launch upward at 2, mid-air BA2 drives downward at 2, and the shuriken never launches. Practice Ground’s training CPU never attacks; Quick Battle’s CPU fights at the difficulty you choose (Easy, Medium, Hard or Brutal), which changes how well it plays, never its fighter.' }),
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
