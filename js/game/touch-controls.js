// Multi-touch landscape controls built on Pointer Events, in one of two
// layouts ("schemes", the Mobile Controls setting; see js/core/settings.js):
//
// Joystick (the default):
//   lower-left : a circular joystick for runLeft / runRight (a plain base
//                and knob, no arrows in it), with two small Dash buttons,
//                Left mouvement and Right mouvement (mouvementLeft /
//                mouvementRight), just above its top-left and top-right,
//                and Charge (a down arrow) to its left:
//                      [◀]     [▶]
//                  [▼] (   ●   )
//   lower-right:                [SHURIKEN]
//                     [TRANSFORM] [SHIELD]
//                    [PUNCH] [KICK] [JUMP]
//
// Classic Buttons (the original layout):
//   lower-left : [LEFT] [C] [RIGHT]  — thumb can slide between them
//   lower-right: the same six buttons
//
// Both schemes drive the same internal inputs. The joystick holds `runLeft`
// or `runRight` exactly as the Left / Right buttons do (a digital hold: how
// far it is pushed never changes the speed), and C or the down arrow is the
// same held `charge`. The mouvement buttons are the only thing new: a single
// tap asks InputManager for one Dash (queueTouchMouvement), which
// Fighter.tryDash accepts or refuses under the usual rules. They hold
// nothing.
//
// C is Charge (the `charge` input, held for as long as the pointer stays on
// it). The large top slot is the `uniqueba` input, the middle row's first
// button `transform` and the lower row's first two `ba1` and `ba2`: their
// look is the fighter's own (#0001's Shuriken, Punch and Kick; see
// setCharacter and js/ui/mobile-abilities.js), Transform shows as reserved
// (dashed) while the fighter presents none, and a button for an ability the
// fighter does not have at all (left out of its `actions`) is hidden, its
// place left empty. Shield is the universal `shield` input, held for
// as long as the pointer stays on it.
// Only the icons and accessible names are player-facing: the input
// codenames never change with them, so Charge + Punch is Charge + ba1 (cba1,
// the Clone Attack), and Charge + Kick is Charge + ba2 (cba2, the Sphere
// Rush).
//
// Every pointer is tracked by pointerId, so the joystick (or Left / Right)
// and Jump, or any other combination, work simultaneously. State is pushed
// into InputManager.setTouch().
//
// Custom layouts (the Mobile Controls setting's editor; see
// js/core/touch-layout.js): each scheme may carry a layout that moves and
// resizes any of its controls by stable control id. A control keeps its own
// element, handlers and codename wherever it sits; applyLayout only shifts
// it (the CSS `translate` property, from where the stylesheet puts it) and
// sizes it (`scale`, which grows its hit area with it), so the default
// layout is the stylesheet's own, untouched, and holding, sliding and
// multi-touch work exactly as before. Classic Buttons' Left / C / Right
// still slide into one another wherever they are: their cluster captures the
// pointer and hit-tests the buttons where they are drawn.
//
// Accessible names are translation keys (js/core/i18n.js), marked so they
// follow the interface language.

import { el } from '../core/utils.js';
import { tattr, setAttr, setPlainAttr } from '../core/i18n.js';
import { ICONS } from '../ui/icons.js';
import { ABILITY_ACTIONS, abilityPresence, mobileAbility, mobileAbilityLabelKey } from '../ui/mobile-abilities.js';
import { DEFAULT_MOBILE_CONTROLS, resolveSetting } from '../core/settings.js';
import {
  TOUCH_CONTROL_IDS, sanitizeTouchLayout, sanitizeTouchLayouts, layoutArea, placeControl,
} from '../core/touch-layout.js';

// Classic Buttons' lower-left cluster, in on-screen order. `label` is the
// accessible name's translation key.
const DPAD = [
  { action: 'runLeft', label: 'control.runLeft', icon: ICONS.left },
  { action: 'charge', label: 'control.charge', text: 'C' },
  { action: 'runRight', label: 'control.runRight', icon: ICONS.right },
];

// Lower-right cluster, in on-screen order. `ability` marks the combat
// ability glyphs (drawn a little larger); the fighter-specific ones
// (uniqueba, transform, ba1, ba2) carry no icon or label here: setCharacter
// fills them in, and marks a reserved one. `pos` is the button's slot in the
// cluster (its tc-<pos> class).
const ACTION_BUTTONS = [
  { action: 'uniqueba', pos: 'uniqueba', ability: true },
  { action: 'transform', pos: 'transform' },
  { action: 'shield', label: 'control.shield', icon: ICONS.shield, pos: 'shield', ability: true },
  { action: 'ba1', pos: 'ba1', ability: true },
  { action: 'ba2', pos: 'ba2', ability: true },
  { action: 'jump', label: 'control.jump', icon: ICONS.jump, pos: 'jump' },
];

// The Joystick scheme's Charge: the same held `charge`, as a down arrow in
// the lower-left cluster, to the left of the stick.
const CHARGE_DOWN = { action: 'charge', label: 'control.charge', icon: ICONS.down, pos: 'charge-down' };

// The Joystick scheme's single-tap Dash buttons, mouvementLeft and
// mouvementRight. Their codenames and English names are exactly these,
// spelling included (Left mouvement, Right mouvement).
const MOUVEMENT_BUTTONS = [
  { control: 'mouvementLeft', direction: -1, side: 'left', label: 'touch.mouvementLeft', icon: ICONS.left },
  { control: 'mouvementRight', direction: 1, side: 'right', label: 'touch.mouvementRight', icon: ICONS.right },
];

// The joystick, in fractions of its radius. Pushed sideways past `engage` it
// holds runLeft or runRight; back inside `deadzone` it lets go. The gap between
// the two keeps a thumb resting near the edge from flickering the direction
// (every flicker would be a fresh press, and two quick presses a Dash). Only
// the sideways part counts: pushing up or down moves the knob, never Jump or
// Charge. The knob follows the thumb and stops `travel` from the centre, so
// it stays inside the base.
export const JOYSTICK = Object.freeze({ deadzone: 0.24, engage: 0.34, travel: 0.56 });

// The direction a joystick at sideways offset `x` (a fraction of its radius,
// + right) holds, given the one it holds now: 'runLeft', 'runRight' or null.
export function joystickDirection(x, current = null) {
  if (x >= JOYSTICK.engage) return 'runRight';
  if (x <= -JOYSTICK.engage) return 'runLeft';
  if (current === 'runRight' && x > JOYSTICK.deadzone) return 'runRight';
  if (current === 'runLeft' && x < -JOYSTICK.deadzone) return 'runLeft';
  return null;
}

const END_EVENTS = ['pointerup', 'pointercancel', 'lostpointercapture'];

function makeButton(spec, cls) {
  const content = spec.icon || (spec.text && el('span', { class: 'tc-text', text: spec.text }));
  const btn = el('button', {
    type: 'button',
    class: `tc-btn ${cls}${spec.ability ? ' tc-ability' : ''}`,
    ...(spec.label ? tattr('aria-label', spec.label) : {}),
    'data-action': spec.action,
    tabindex: '-1',
  });
  if (typeof content === 'string') btn.innerHTML = content;
  else if (content) btn.append(content);
  return btn;
}

export class TouchControls {
  // `showAbsent` keeps on show the buttons of abilities a fighter does not
  // have (see setCharacter): only the touch layout editor wants them.
  constructor(root, input, { scheme = DEFAULT_MOBILE_CONTROLS, showAbsent = false } = {}) {
    this.root = root;
    this.input = input;
    this.enabled = false;
    this.showAbsent = showAbsent;
    this.scheme = null;
    this.buttons = new Map(); // action -> the element holding it in this scheme
    this.pointers = new Map(); // pointerId -> action
    this.counts = new Map(); // action -> number of pointers holding it
    // The joystick's pointer (only one steers it) and the base's centre and
    // radius, measured as it goes down; null while nothing holds it.
    this.stickPointer = null;
    this.stickFrame = null;
    this.knobOffset = { x: 0, y: 0 };
    this.mouvementPointers = new Map(); // pointerId -> mouvement button
    // Each scheme's custom layout (empty: the stylesheet's own), and where
    // the last applyLayout put every control of the scheme on show.
    this.layouts = sanitizeTouchLayouts(null);
    this.placements = new Map();
    this.area = null;
    this.build();
    this.setScheme(scheme);
  }

  build() {
    // Classic Buttons' lower-left cluster.
    this.padButtons = new Map();
    const dpad = el('div', { class: 'tc-cluster tc-dpad', role: 'group', ...tattr('aria-label', 'touch.dpad') });
    for (const spec of DPAD) {
      const b = makeButton(spec, `tc-pad tc-${spec.action}`);
      this.padButtons.set(spec.action, b);
      dpad.append(b);
    }

    // The Joystick scheme's lower-left cluster: Charge (the down arrow),
    // then the stick between its two mouvement buttons. The stick is a
    // plain base and knob: no arrows in it.
    this.knob = el('div', { class: 'tc-stick-knob' });
    this.stick = el('div', { class: 'tc-stick', role: 'group', ...tattr('aria-label', 'touch.joystick') }, [this.knob]);
    this.chargeDown = makeButton(CHARGE_DOWN, `tc-${CHARGE_DOWN.pos}`);
    this.mouvementButtons = new Map(); // 'mouvementLeft' / 'mouvementRight' -> button
    for (const spec of MOUVEMENT_BUTTONS) {
      const b = el('button', {
        type: 'button', class: `tc-btn tc-dash tc-dash-${spec.side}`,
        ...tattr('aria-label', spec.label), 'data-mouvement': spec.control, tabindex: '-1', html: spec.icon,
      });
      b._direction = spec.direction;
      this.mouvementButtons.set(spec.control, b);
    }
    const joystick = el('div', { class: 'tc-cluster tc-joystick' }, [
      this.chargeDown, this.mouvementButtons.get('mouvementLeft'), this.stick, this.mouvementButtons.get('mouvementRight'),
    ]);

    // Lower-right cluster, shared by both schemes.
    this.actionButtons = new Map();
    const actions = el('div', { class: 'tc-cluster tc-actions', role: 'group', ...tattr('aria-label', 'touch.actions') });
    for (const spec of ACTION_BUTTONS) {
      const b = makeButton(spec, `tc-act tc-${spec.pos}`);
      this.actionButtons.set(spec.action, b);
      actions.append(b);
    }

    this.dpad = dpad;
    this.joystick = joystick;
    this.actions = actions;
    // Every button either scheme shows, for clearing their pressed looks.
    this.allButtons = [...this.padButtons.values(), ...this.actionButtons.values(), this.chargeDown, ...this.mouvementButtons.values()];
    // Neutral until a screen names the fighter.
    this.setCharacter(null);

    // Classic lower-left cluster: it captures the pointer so a thumb can
    // slide between LEFT / C / RIGHT without lifting.
    dpad.addEventListener('pointerdown', (e) => this.onDpadDown(e));
    dpad.addEventListener('pointermove', (e) => this.onDpadMove(e));
    for (const type of END_EVENTS) dpad.addEventListener(type, (e) => this.onPointerEnd(e));

    // The joystick captures its one pointer and follows it until it lifts.
    this.stick.addEventListener('pointerdown', (e) => this.onStickDown(e));
    this.stick.addEventListener('pointermove', (e) => this.onStickMove(e));
    for (const type of END_EVENTS) {
      this.stick.addEventListener(type, (e) => {
        if (e.pointerId === this.stickPointer) this.releaseStick();
      });
    }

    // Held buttons (the six actions and the down-arrow Charge): each button
    // owns its pointers.
    for (const b of [...this.actionButtons.values(), this.chargeDown]) {
      const action = b.getAttribute('data-action');
      b.addEventListener('pointerdown', (e) => {
        // A hidden button (an ability the fighter does not have) takes nothing.
        if (!this.enabled || b.hidden) return;
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        this.assign(e.pointerId, action);
      });
      for (const type of END_EVENTS) b.addEventListener(type, (e) => this.onPointerEnd(e));
    }

    // Mouvement buttons: a press asks for one Dash and shows the button
    // pressed until the pointer lifts; it never holds a direction.
    for (const b of this.mouvementButtons.values()) {
      b.addEventListener('pointerdown', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        this.mouvementPointers.set(e.pointerId, b);
        b.classList.add('is-pressed');
        this.input.queueTouchMouvement(b._direction);
      });
      for (const type of END_EVENTS) b.addEventListener(type, (e) => this.onMouvementEnd(e));
    }

    // Assistive-technology activation (click without a pointer) = short tap.
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('.tc-btn');
      if (!b || b.hidden || e.detail !== 0 || !this.enabled) return;
      if (b._direction) {
        this.input.queueTouchMouvement(b._direction);
        return;
      }
      const action = b.getAttribute('data-action');
      this.input.setTouch(action, true);
      setTimeout(() => this.input.setTouch(action, (this.counts.get(action) || 0) > 0), 120);
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Shows the 'joystick' or 'classic' layout (anything else is the
  // default, Joystick), with that scheme's own custom layout. Everything held
  // is let go first, so a switch never leaves a direction, Charge or any
  // other button down. The fighter's own icons are untouched: the combat
  // buttons are the same elements in both.
  setScheme(scheme) {
    const next = resolveSetting('mobileControls', scheme);
    this.releaseAll();
    if (next === this.scheme) return;
    this.scheme = next;
    const joystick = next === 'joystick';
    this.buttons = new Map([
      ...(joystick ? [] : this.padButtons),
      ...this.actionButtons,
      ...(joystick ? [['charge', this.chargeDown]] : []),
    ]);
    this.root.replaceChildren(joystick ? this.joystick : this.dpad, this.actions);
    this.root.classList.toggle('is-joystick', joystick);
    this.root.classList.toggle('is-classic', !joystick);
    this.root.dataset.scheme = next;
    this.applyLayout();
  }

  // ---- Custom layout ----------------------------------------------------------

  // The element of control `id` in `scheme` (the one on show by default),
  // or null for an id the scheme does not have.
  controlElement(id, scheme = this.scheme) {
    if (!TOUCH_CONTROL_IDS[scheme]?.includes(id)) return null;
    if (scheme === 'classic' && this.padButtons.has(id)) return this.padButtons.get(id);
    if (scheme === 'joystick') {
      if (id === 'stick') return this.stick;
      if (id === 'charge') return this.chargeDown;
      if (this.mouvementButtons.has(id)) return this.mouvementButtons.get(id);
    }
    return this.actionButtons.get(id) ?? null;
  }

  // Every control of `scheme` as a Map of control id -> element, in the
  // scheme's order.
  getControlElements(scheme = this.scheme) {
    return new Map((TOUCH_CONTROL_IDS[scheme] ?? []).map((id) => [id, this.controlElement(id, scheme)]));
  }

  // A copy of `scheme`'s custom layout.
  getLayout(scheme = this.scheme) {
    return sanitizeTouchLayout(scheme, this.layouts[scheme]);
  }

  // Gives `scheme` (the one on show by default) the custom `layout`
  // (checked; {} is the original layout), applied at once if it is on show.
  setLayout(layout, scheme = this.scheme) {
    if (!Object.hasOwn(TOUCH_CONTROL_IDS, scheme)) return;
    this.layouts[scheme] = sanitizeTouchLayout(scheme, layout);
    if (scheme === this.scheme) this.applyLayout();
  }

  // The touch-control area in screen px: the root's box inside its padding
  // (the safe-area insets and margin, see .touch-controls in styles.css).
  measureArea() {
    const rect = this.root.getBoundingClientRect();
    const style = globalThis.getComputedStyle?.(this.root);
    const px = (value) => Number.parseFloat(value) || 0;
    return layoutArea(rect, style ? {
      top: px(style.paddingTop), right: px(style.paddingRight), bottom: px(style.paddingBottom), left: px(style.paddingLeft),
    } : {});
  }

  // Puts every control of the scheme on show where its layout says, kept
  // whole inside the area, at its size. Controls the layout leaves out stay
  // exactly where the stylesheet puts them. Called on every scheme or
  // layout change, and by the screens after a resize or orientation change;
  // while the controls are hidden there is nothing to measure, so it tries
  // again next time. Records each control's place (placements): its
  // stylesheet centre (home), its centre now, unscaled size and scale.
  applyLayout() {
    const layout = this.layouts[this.scheme] ?? {};
    const controls = [...this.getControlElements()];
    // Every control of both schemes starts from the stylesheet's place, so
    // none keeps a stale one from the scheme shown before.
    for (const scheme of Object.keys(TOUCH_CONTROL_IDS)) {
      for (const node of this.getControlElements(scheme).values()) {
        node.style.translate = '';
        node.style.scale = '';
      }
    }
    this.placements = new Map();
    const area = this.measureArea();
    this.area = area;
    if (!(area.width > 0 && area.height > 0)) return false;
    // Measure everything first, then move: one layout pass.
    const measured = controls.map(([id, node]) => {
      const r = node.getBoundingClientRect();
      return {
        id, node,
        home: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        size: { width: node.offsetWidth || r.width, height: node.offsetHeight || r.height },
      };
    });
    for (const { id, node, home, size } of measured) {
      const entry = layout[id];
      const center = entry ? placeControl(area, entry, size) : home;
      const scale = entry ? entry.scale : 1;
      if (entry) {
        node.style.translate = `${(center.x - home.x).toFixed(1)}px ${(center.y - home.y).toFixed(1)}px`;
        if (scale !== 1) node.style.scale = String(scale);
      }
      this.placements.set(id, { home, center, size, scale });
    }
    return true;
  }

  hitDpad(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const spec of DPAD) {
      const r = this.padButtons.get(spec.action).getBoundingClientRect();
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

  // ---- Joystick -------------------------------------------------------------

  onStickDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    // One thumb steers; another landing on the base is ignored.
    if (this.stickPointer !== null) return;
    const r = this.stick.getBoundingClientRect();
    this.stickPointer = e.pointerId;
    // `scale` is how much a custom layout grew or shrank the stick: the
    // knob moves in the stick's own, unscaled pixels.
    this.stickFrame = {
      x: r.left + r.width / 2, y: r.top + r.height / 2, radius: r.width / 2,
      scale: r.width / (this.stick.offsetWidth || r.width) || 1,
    };
    this.stick.setPointerCapture?.(e.pointerId);
    this.stick.classList.add('is-active');
    this.steer(e.clientX, e.clientY);
  }

  onStickMove(e) {
    if (e.pointerId !== this.stickPointer) return;
    this.steer(e.clientX, e.clientY);
  }

  // Moves the knob toward the thumb at (x, y), and holds whatever direction
  // that offset means (see joystickDirection).
  steer(x, y) {
    const { x: cx, y: cy, radius } = this.stickFrame;
    const dx = x - cx;
    const dy = y - cy;
    const held = joystickDirection(radius > 0 ? dx / radius : 0, this.pointers.get(this.stickPointer) ?? null);
    const max = radius * JOYSTICK.travel;
    const len = Math.hypot(dx, dy);
    const k = len > max ? max / len : 1;
    this.setKnob(dx * k, dy * k);
    this.assign(this.stickPointer, held);
    this.stick.classList.toggle('is-left', held === 'runLeft');
    this.stick.classList.toggle('is-right', held === 'runRight');
  }

  // Lets go of the joystick: no direction held, the knob back in the middle.
  releaseStick() {
    if (this.stickPointer !== null) this.assign(this.stickPointer, null);
    this.stickPointer = null;
    this.stickFrame = null;
    this.stick.classList.remove('is-active', 'is-left', 'is-right');
    this.setKnob(0, 0);
  }

  // Offsets are screen px; the knob is drawn in the stick's own px.
  setKnob(x, y) {
    this.knobOffset = { x, y };
    const k = this.stickFrame?.scale || 1;
    this.knob.style.transform = x || y ? `translate(${(x / k).toFixed(1)}px, ${(y / k).toFixed(1)}px)` : '';
  }

  // ---- Mouvement buttons ------------------------------------------------------

  onMouvementEnd(e) {
    const b = this.mouvementPointers.get(e.pointerId);
    if (!b) return;
    this.mouvementPointers.delete(e.pointerId);
    if (![...this.mouvementPointers.values()].includes(b)) b.classList.remove('is-pressed');
  }

  // ---- Held actions -------------------------------------------------------------

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

  // Lets go of everything: every held action, the joystick (recentred) and
  // the mouvement buttons' pressed look.
  releaseAll() {
    this.releaseStick();
    for (const id of [...this.pointers.keys()]) this.assign(id, null);
    this.counts.clear();
    this.mouvementPointers.clear();
    for (const b of this.allButtons) b.classList.remove('is-pressed');
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  // Shows `def`'s own abilities (its mobileAbilities) on the fighter-specific
  // buttons: each one's icon and accessible name, and whether it shows as
  // reserved, nothing else. The buttons stay the same elements with the same
  // data-action and pointer handling, so input, held state and multi-touch
  // carry on untouched. Null (or a fighter that authors none) gives the
  // neutral fallback, with Transform reserved. A translated name is marked
  // to follow the language.
  //
  // A button whose ability the fighter does not have at all (see
  // abilityPresence: left out of its `actions`) is hidden: not drawn, not
  // named, never focused and never pressed, and whatever held it is let go. Its place stays empty, so no
  // other button moves. The next fighter that has the ability shows the
  // very same element again. `showAbsent` keeps such a button on show in
  // its neutral look instead (the touch layout editor, whose layout every
  // fighter shares).
  setCharacter(def) {
    let shown = false;
    for (const action of ABILITY_ACTIONS) {
      const b = this.actionButtons.get(action);
      // An ability the fighter lacks, kept on show: in its neutral look.
      const from = this.showAbsent && abilityPresence(def, action) === 'absent' ? null : def;
      const ability = mobileAbility(from, action);
      const absent = !ability;
      if (b.hidden && !absent) shown = true;
      b.hidden = absent;
      if (absent) {
        this.releaseAction(action);
        b.removeAttribute('aria-label');
        b.removeAttribute('data-i18n-aria-label');
        b.removeAttribute('data-i18n-aria-label-params');
        b.innerHTML = '';
        b.classList.remove('is-pending');
        continue;
      }
      const key = mobileAbilityLabelKey(from, action);
      if (key) setAttr(b, 'aria-label', key);
      else setPlainAttr(b, 'aria-label', ability.label);
      b.innerHTML = ability.icon;
      b.classList.toggle('is-pending', ability.pending);
    }
    // A button back on show: place it again, as its layout says.
    if (shown) this.applyLayout();
  }

  // Lets go of every pointer holding `action`'s button.
  releaseAction(action) {
    for (const [id, held] of [...this.pointers]) if (held === action) this.assign(id, null);
  }
}
