// Multi-touch landscape controls built on Pointer Events.
//
// Layout (matches the reference ergonomics):
//   lower-left : [LEFT] [C] [RIGHT]  — thumb can slide between them
//   lower-right:                [SHURIKEN]
//                       [SPECIAL] [SHIELD]
//                    [PUNCH] [KICK] [JUMP]
//
// C is Charge (the `charge` input, held for as long as the pointer stays on
// it). The large top slot is the `primary` input, the lower row's first two
// buttons `action1` and `action2`: their look is the fighter's own (#0001's
// Shuriken, Punch and Kick; see setCharacter and js/ui/mobile-abilities.js).
// Shield is the universal `defense` input, held for as long as the pointer
// stays on it. Only the icons and accessible names are player-facing: the
// internal input names are unchanged, so Charge + Punch is still Charge +
// action1 (the Clone Attack), and Charge + Kick is Charge + action2 (the
// Sphere Rush).
//
// Every pointer is tracked by pointerId, so Right + Jump (or any combination)
// works simultaneously. State is pushed into InputManager.setTouch().

import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { ABILITY_ACTIONS, mobileAbility } from '../ui/mobile-abilities.js';

// Lower-left cluster, in on-screen order.
const DPAD = [
  { action: 'left', label: 'Move left', icon: ICONS.left },
  { action: 'charge', label: 'Charge', text: 'C' },
  { action: 'right', label: 'Move right', icon: ICONS.right },
];

// Lower-right cluster, in on-screen order. `pending` marks reserved actions
// that wait on future attack animations. `ability` marks the combat ability
// glyphs (drawn a little larger); the fighter-specific ones (primary,
// action1, action2) carry no icon or label here: setCharacter fills them in.
const ACTION_BUTTONS = [
  { action: 'primary', pos: 'throw', ability: true },
  { action: 'special', label: 'Special', icon: ICONS.special, pos: 'special', pending: true },
  { action: 'defense', label: 'Shield', icon: ICONS.shield, pos: 'defense', ability: true },
  { action: 'action1', pos: 'a1', ability: true },
  { action: 'action2', pos: 'a2', ability: true },
  { action: 'jump', label: 'Jump', icon: ICONS.jump, pos: 'jump' },
];

function makeButton(spec, cls) {
  const content = spec.icon || (spec.text && el('span', { class: 'tc-text', text: spec.text }));
  const btn = el('button', {
    type: 'button',
    class: `tc-btn ${cls}${spec.ability ? ' tc-ability' : ''}${spec.pending ? ' is-pending' : ''}`,
    'aria-label': spec.label,
    'data-action': spec.action,
    tabindex: '-1',
  });
  if (typeof content === 'string') btn.innerHTML = content;
  else if (content) btn.append(content);
  return btn;
}

export class TouchControls {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    this.enabled = false;
    this.buttons = new Map(); // action -> element
    this.pointers = new Map(); // pointerId -> action
    this.counts = new Map(); // action -> number of pointers holding it
    this.build();
  }

  build() {
    const dpad = el('div', { class: 'tc-cluster tc-dpad', role: 'group', 'aria-label': 'Movement and Charge' });
    for (const spec of DPAD) {
      const b = makeButton(spec, `tc-pad tc-${spec.action}`);
      this.buttons.set(spec.action, b);
      dpad.append(b);
    }
    const actions = el('div', { class: 'tc-cluster tc-actions', role: 'group', 'aria-label': 'Actions' });
    for (const spec of ACTION_BUTTONS) {
      const b = makeButton(spec, `tc-act tc-${spec.pos}`);
      this.buttons.set(spec.action, b);
      actions.append(b);
    }
    this.dpad = dpad;
    this.actions = actions;
    this.root.replaceChildren(dpad, actions);
    // Neutral until a screen names the fighter.
    this.setCharacter(null);

    // Lower-left cluster: it captures the pointer so a thumb can slide between
    // LEFT / C / RIGHT without lifting.
    dpad.addEventListener('pointerdown', (e) => this.onDpadDown(e));
    dpad.addEventListener('pointermove', (e) => this.onDpadMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      dpad.addEventListener(type, (e) => this.onPointerEnd(e));
    }

    // Action buttons: each button owns its pointers.
    for (const spec of ACTION_BUTTONS) {
      const b = this.buttons.get(spec.action);
      b.addEventListener('pointerdown', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        this.assign(e.pointerId, spec.action);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        b.addEventListener(type, (e) => this.onPointerEnd(e));
      }
    }

    // Assistive-technology activation (click without a pointer) = short tap.
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('.tc-btn');
      if (!b || e.detail !== 0 || !this.enabled) return;
      const action = b.dataset.action;
      this.input.setTouch(action, true);
      setTimeout(() => this.input.setTouch(action, (this.counts.get(action) || 0) > 0), 120);
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  hitDpad(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const spec of DPAD) {
      const r = this.buttons.get(spec.action).getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD && d < r.width * 0.75) {
        bestD = d;
        best = spec.action;
      }
    }
    return best;
  }

  onDpadDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const action = this.hitDpad(e.clientX, e.clientY);
    if (!action) return;
    this.dpad.setPointerCapture?.(e.pointerId);
    this.assign(e.pointerId, action);
  }

  onDpadMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const current = this.pointers.get(e.pointerId);
    if (!DPAD.some((d) => d.action === current)) return;
    const next = this.hitDpad(e.clientX, e.clientY);
    if (next && next !== current) this.assign(e.pointerId, next);
  }

  onPointerEnd(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.assign(e.pointerId, null);
  }

  assign(pointerId, action) {
    const prev = this.pointers.get(pointerId);
    if (prev === action) return;
    if (prev) {
      this.pointers.delete(pointerId);
      this.bump(prev, -1);
    }
    if (action) {
      this.pointers.set(pointerId, action);
      this.bump(action, 1);
    }
  }

  bump(action, delta) {
    const n = Math.max(0, (this.counts.get(action) || 0) + delta);
    this.counts.set(action, n);
    const held = n > 0;
    this.buttons.get(action)?.classList.toggle('is-pressed', held);
    this.input.setTouch(action, held);
  }

  releaseAll() {
    for (const id of [...this.pointers.keys()]) this.assign(id, null);
    this.counts.clear();
    for (const b of this.buttons.values()) b.classList.remove('is-pressed');
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  // Shows `def`'s own abilities (its mobileAbilities) on the fighter-specific
  // buttons: each one's icon and accessible name, nothing else. The buttons
  // stay the same elements with the same data-action and pointer handling,
  // so input, held state and multi-touch carry on untouched. Null (or a
  // fighter that authors none) gives the neutral fallback.
  setCharacter(def) {
    for (const action of ABILITY_ACTIONS) {
      const { label, icon } = mobileAbility(def, action);
      const b = this.buttons.get(action);
      b.setAttribute('aria-label', label);
      b.innerHTML = icon;
    }
  }
}
