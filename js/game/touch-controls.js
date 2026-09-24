// Multi-touch landscape controls built on Pointer Events.
//
// Layout (matches the reference ergonomics):
//   lower-left : [LEFT] [C] [RIGHT]  — thumb can slide between them
//   lower-right:              [T]
//                       [SPECIAL] [D]
//                    [BA1] [BA2] [JUMP]
//
// C is Charge (the `charge` input, held for as long as the pointer stays on
// it). T is Throw, the `primary` input, in the large top slot. D is Defense
// (the `defense` input), labelled Defense; it reads D because #0001's
// Defense is a Dodge. BA1 (Basic Attack 1) is the `action1` input, BA2
// (Basic Attack 2) the `action2` input.
//
// Every pointer is tracked by pointerId, so Right + Jump (or any combination)
// works simultaneously. State is pushed into InputManager.setTouch().

import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';

// Lower-left cluster, in on-screen order.
const DPAD = [
  { action: 'left', label: 'Move left', icon: ICONS.left },
  { action: 'charge', label: 'Charge', text: 'C' },
  { action: 'right', label: 'Move right', icon: ICONS.right },
];

// `pending` marks reserved actions that wait on future attack animations.
const ACTION_BUTTONS = [
  { action: 'primary', label: 'Throw', text: 'T', pos: 'throw' },
  { action: 'special', label: 'Special', icon: ICONS.special, pos: 'special', pending: true },
  { action: 'defense', label: 'Defense', text: 'D', pos: 'defense' },
  { action: 'action1', label: 'Basic Attack 1', text: 'BA1', pos: 'a1' },
  { action: 'action2', label: 'Basic Attack 2', text: 'BA2', pos: 'a2' },
  { action: 'jump', label: 'Jump', icon: ICONS.jump, pos: 'jump' },
];

function makeButton(spec, cls) {
  const content = spec.icon || el('span', { class: 'tc-text', text: spec.text });
  const btn = el('button', {
    type: 'button',
    class: `tc-btn ${cls}${spec.pending ? ' is-pending' : ''}`,
    'aria-label': spec.label,
    'data-action': spec.action,
    tabindex: '-1',
  });
  if (typeof content === 'string') btn.innerHTML = content;
  else btn.append(content);
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
}
