// Multi-touch landscape controls using the existing Pointer Events input.
// Joystick (the default): a horizontal stick with the small Left movement
// / Right movement Dash buttons (double arrows) above it and a small Down
// button at its far left, level with its middle. Classic: one row along
// the bottom-left edge, Run left, Down and Run right, with sliding pointer
// capture between the Run arrows, and the same Dash buttons just above the
// Run arrows. Down held is Down (the fast fall in the air;
// pressed on a one-way platform, a drop through it). In the Joystick
// scheme pushing the stick down is that same Down too (the launch & energy
// update): stick down + Jump a Super Jump, stick down in the air a fast
// fall, a quick flick down and back on a droppable platform a drop through
// it, exactly as the Down button, which stays and keeps working. Only a
// push that is mostly downward counts (joystickVertical), so a run with the
// thumb drifting low never holds Down; pushing up does nothing (Jump is its
// button).
// Both share the same action buttons. Jump always uses the upward arrow;
// Defence its shield glyph, named Deflect while the fighter is in the
// air (where the same button is its Deflect, for one that has one);
// attacks use the fighter's authored ground/air previews and translated
// move names. Ground-only abilities stay visible but marked unavailable in
// the air. Presentation never changes the input codename or pointer owner.
//
// The lower-right cluster sits flush in the bottom-right corner. The bottom
// row is the fighter's two Mash Combo buttons (the two close-range strikes
// of its pair, js/data/mash-combo.js: whichever buttons they are, attack1
// and extra_attack for one fighter, attack1 and attack2 for another) and
// Jump in the corner, and nothing else ever: a pair with only one button
// (its other move mash_attack, which has none) puts that one next to Jump
// and leaves the outer place empty. Shield sits
// directly above Jump. Every other move of the fighter (TouchControls
// role 'move') stands a little higher than those, a little smaller, in two
// columns growing up side by side: the first left of Shield, raised a
// little above it, the second straight above Shield, one move to each in
// turn, with no gap for a button the fighter does not have:
//
//                    [M4] [M3]
//                    [M2] [M1]
//                         [SHIELD]
//            [MASH A] [MASH B] [JUMP]
//
// Neither column ever rises past the top HUD (setCeiling): when one is
// full the other takes the rest, then a third column above Mash A (see
// placeStack). In the touch layout editor, which shows no fighter, the
// Mash Combo places hold attack1 and attack2.
//
// The numbered buttons on show also take slots (attackSlots, data-slot):
// attack1 always slot 1 and attack2 slot 2, then the others in order. A
// slot numbers them; where a button stands is its role's.
//
// Every control's default size is its default scale (TOUCH_DEFAULT_SCALE:
// 1.3, the fighter's other moves 1.1), written as its `scale` by
// applyLayout like a custom layout's; the stylesheet lays the clusters out
// at those scaled sizes.
//
// Whatever kind of move a numbered button is (an ordinary attack, a summon,
// a technique), it is pressed the same way. Only the art and accessible
// names are player-facing: the input codenames never change with them, so
// Unlimited Void is attack4 and Hollow Purple is attack5, and nothing a
// button shows decides what it does.
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
// sizes it (`scale`, which grows its hit area with it, in place of its
// default scale), so the default layout is the stylesheet's own at the
// default scales, and holding, sliding and
// multi-touch work exactly as before. Classic Buttons' Left / Right
// still slide into one another wherever they are: their cluster captures the
// pointer and hit-tests the buttons where they are drawn.
//
// Accessible names are translation keys (js/localization/i18n.js), marked so they
// follow the interface language.
//
// Live move state (showStatus): once a frame the screens hand it Player 1's
// fighter, and each combat button shows what the ability HUD shows on a
// keyboard or a controller, read the same way (abilityStatus,
// js/game/combat/move-status.js): a 3 s or 5 s cooldown's sweep over its
// art, with its seconds, from the moment its move is released (an ordinary
// move has no cooldown), and a move spent for this airtime or unpaid for
// while exhausted muted. Paint only: it never changes what a button does,
// and it writes only what changed.

import { el } from '../core/utils.js';
import { assetSource } from '../core/asset-loader.js';
import { tattr, setAttr, setPlainAttr } from '../localization/i18n.js';
import { ICONS } from './icons.js';
import { COMBAT_BUTTONS, NUMBERED_ATTACKS } from '../config.js';
import { mashRow } from '../data/mash-combo.js';
import { ABILITY_ACTIONS, abilityPresence, abilityAvailable, jumpArt, mobileAbility, mobileAbilityLabelKey } from './mobile-abilities.js';
import { DEFAULT_MOBILE_CONTROLS, resolveSetting } from '../core/settings.js';
import { abilityGroups, abilityStatus } from '../game/combat/move-status.js';
import { formatCooldown } from '../game/rendering/fighter-status.js';
import {
  TOUCH_CONTROL_IDS, TOUCH_DEFAULT_SCALE, sanitizeTouchLayout, sanitizeTouchLayouts, layoutArea, placeControl, defaultTouchScale,
} from '../core/touch-layout.js';

// Classic Buttons' lower-left cluster, in on-screen order. `label` is the
// accessible name's translation key.
const DPAD = [
  { action: 'runLeft', label: 'control.runLeft', icon: ICONS.left },
  { action: 'runRight', label: 'control.runRight', icon: ICONS.right },
];

// Lower-right cluster, in on-screen order. `ability` marks the combat
// buttons (their glyphs drawn a little larger); the fighter-specific ones
// (extra_attack, attack1 to attack5) carry no icon or label here:
// setCharacter fills them in, and marks a reserved one. Jump always
// shows its universal arrow and name. `pos` is the
// button's place in the cluster (its tc-<pos> class); a numbered attack
// button (`attack`) is also placed by the slot setCharacter gives it
// (data-slot, see above).
const ACTION_BUTTONS = [
  { action: 'extra_attack', pos: 'extra_attack', ability: true },
  { action: 'shield', label: 'control.shield', icon: ICONS.shield, pos: 'shield', ability: true },
  ...NUMBERED_ATTACKS.map((action) => ({ action, pos: action, attack: true, ability: true })),
  { action: 'jump', label: 'control.jump', icon: ICONS.jump, pos: 'jump' },
];

// The columns the fighter's other moves stand in (see placeStack), in the
// order they take them: left of Shield, above Shield, then above Mash A.
const STACK_COLUMNS = Object.freeze([1, 0, 2]);

// The two places beside Jump, [Mash A, Mash B]: the fighter's Mash Combo
// row (mashRow, js/data/mash-combo.js; a strict rule, see
// js/data/touch-comfort.js).
export const mashButtons = mashRow;

// A top-HUD ceiling for setCeiling: the lowest bottom edge of the HUD's
// parts (the children of `hud`) that span any of [left, right], or -Infinity
// where none does. Read live, so a HUD that changes size is followed.
export function hudCeiling(hud) {
  return (left, right) => {
    let y = -Infinity;
    for (const part of hud?.children ?? []) {
      if (part.hidden) continue;
      const r = part.getBoundingClientRect?.();
      if (!r || !(r.width > 0 && r.height > 0)) continue;
      if (r.right > left && r.left < right) y = Math.max(y, r.bottom);
    }
    return y;
  };
}

// The slot of each numbered attack button a fighter shows (see above):
// attack1 and attack2 keep slots 1 and 2 whatever else is shown (a hidden
// one keeps its place empty), and the fighter's other numbered buttons fill
// slots 3 to 5 in order. `shown(action)` says whether a button is on show.
export function attackSlots(shown) {
  const slots = new Map([['attack1', 1], ['attack2', 2]]);
  let next = 3;
  for (const action of NUMBERED_ATTACKS.slice(2)) if (shown(action)) slots.set(action, next++);
  return slots;
}

// Both schemes' shared Down button: held for as long as a pointer stays on
// it, exactly as S / ↓ or the left stick held down (the `down` control).
const DOWN_BUTTON = { action: 'down', label: 'control.down', icon: ICONS.down };

// Both schemes' shared single-tap Dash buttons, mouvementLeft and
// mouvementRight. Keep those internal codenames; their display names are
// localized independently (Left movement / Right movement in English).
const MOUVEMENT_BUTTONS = [
  { control: 'mouvementLeft', direction: -1, side: 'left', label: 'touch.mouvementLeft', icon: ICONS.mouvementLeft },
  { control: 'mouvementRight', direction: 1, side: 'right', label: 'touch.mouvementRight', icon: ICONS.mouvementRight },
];

// The joystick, in fractions of its radius. Pushed sideways past `engage` it
// holds runLeft or runRight; back inside `deadzone` it lets go. The gap between
// the two keeps a thumb resting near the edge from flickering the direction
// and changing Run unexpectedly. Pushed down past `downEngage`, within
// `downAngle` degrees of straight down, it also holds Down (the `down`
// control, as the Down button does), and lets go back inside
// `downDeadzone` or past `downReleaseAngle`: the same hysteresis. The angle
// is what keeps a sideways run with the thumb drifting low from ever
// holding Down (an accidental fast fall or drop would be worse than the
// Down button it saves), and a diagonal push holds both a run and Down.
// Pushed up it holds nothing: Jump stays on its button. The knob follows
// the thumb and stops `travel` from the centre, so it stays inside the base.
export const JOYSTICK = Object.freeze({
  deadzone: 0.24, engage: 0.34, travel: 0.56,
  downEngage: 0.5, downDeadzone: 0.38, downAngle: 50, downReleaseAngle: 60,
});

// The direction a joystick at sideways offset `x` (a fraction of its radius,
// + right) holds, given the one it holds now: 'runLeft', 'runRight' or null.
export function joystickDirection(x, current = null) {
  if (x >= JOYSTICK.engage) return 'runRight';
  if (x <= -JOYSTICK.engage) return 'runLeft';
  if (current === 'runRight' && x > JOYSTICK.deadzone) return 'runRight';
  if (current === 'runLeft' && x < -JOYSTICK.deadzone) return 'runLeft';
  return null;
}

// Whether a joystick at offset (`x`, `y`) (fractions of its radius, + right
// and + down, as the screen's y grows downward) holds Down, given whether it
// holds it now (`current`): engaged only by a push mostly downward and far
// enough, released only once it is back near the centre or turned well
// toward the side (see JOYSTICK). Never for a push up.
export function joystickVertical(x, y, current = false) {
  if (!(y > 0)) return false;
  const angle = (Math.atan2(Math.abs(x), y) * 180) / Math.PI; // 0: straight down
  if (current) return y > JOYSTICK.downDeadzone && angle <= JOYSTICK.downReleaseAngle;
  return y >= JOYSTICK.downEngage && angle <= JOYSTICK.downAngle;
}

// The stick's second hold, apart from its pointer's run direction: its Down,
// counted with the Down button's pointers like any shared action (see
// assign), so either alone holds `down` and letting go of one keeps it held
// while the other still does.
const STICK_DOWN = Symbol('joystick down');

const END_EVENTS = ['pointerup', 'pointercancel', 'lostpointercapture'];

// A click this soon (ms) after a pointer lifted off the controls is that
// pointer's own click, whatever its `detail` (a browser may report a touch's
// as 0, like an assistive activation's): its press was taken on pointerdown
// and is never taken a second time (see the assistive click in build).
const POINTER_CLICK_MS = 600;

function makeButton(spec, cls) {
  const btn = el('button', {
    type: 'button',
    class: `tc-btn ${cls}${spec.ability ? ' tc-ability' : ''}${spec.attack ? ' tc-attack' : ''}`,
    ...(spec.label ? tattr('aria-label', spec.label) : {}),
    'data-action': spec.action,
    tabindex: '-1',
  });
  if (spec.icon) btn.innerHTML = spec.icon;
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
    // Whether the stick, pushed down, holds Down (see joystickVertical).
    this.stickDown = false;
    this.mouvementPointers = new Map(); // pointerId -> mouvement button
    // When a pointer last lifted off the controls (its event's timeStamp),
    // to tell its own trailing click from an assistive activation.
    this.lastPointerEnd = -Infinity;
    // Each scheme's custom layout (empty: the stylesheet's own), and where
    // the last applyLayout put every control of the scheme on show.
    this.layouts = sanitizeTouchLayouts(null);
    this.placements = new Map();
    this.area = null;
    // Sprite files that failed to load: their buttons show glyphs instead.
    this.failedArt = new Set();
    // How high the stack above Shield may rise (setCeiling), and whether
    // the last placement had to go past it.
    this.ceiling = null;
    this.stackOverflow = false;
    // The default scales, for the stylesheet's geometry.
    root.style?.setProperty?.('--tc-k', String(TOUCH_DEFAULT_SCALE.control));
    root.style?.setProperty?.('--tc-ks', String(TOUCH_DEFAULT_SCALE.move));
    // The fighter's Mash Combo buttons (setCharacter): the two beside Jump.
    this.mash = mashButtons(null);
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

    // The Joystick scheme's lower-left cluster: the stick between its two
    // mouvement buttons. The stick is a plain base
    // and knob: no arrows in it.
    this.knob = el('div', { class: 'tc-stick-knob' });
    this.stick = el('div', { class: 'tc-stick', role: 'group', ...tattr('aria-label', 'touch.joystick') }, [this.knob]);
    this.mouvementButtons = new Map(); // 'mouvementLeft' / 'mouvementRight' -> button
    for (const spec of MOUVEMENT_BUTTONS) {
      const b = el('button', {
        type: 'button', class: `tc-btn tc-dash tc-dash-${spec.side}`,
        ...tattr('aria-label', spec.label), 'data-mouvement': spec.control, tabindex: '-1', html: spec.icon,
      });
      b._direction = spec.direction;
      this.mouvementButtons.set(spec.control, b);
    }
    // Down, shared by both schemes' lower-left cluster (see setScheme).
    this.downButton = makeButton(DOWN_BUTTON, 'tc-down');
    const joystick = el('div', { class: 'tc-cluster tc-joystick' }, [
      this.downButton, this.mouvementButtons.get('mouvementLeft'), this.stick, this.mouvementButtons.get('mouvementRight'),
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
    this.allButtons = [
      ...this.padButtons.values(), ...this.actionButtons.values(), ...this.mouvementButtons.values(), this.downButton,
    ];
    // Neutral until a screen names the fighter.
    this.setCharacter(null);

    // Classic lower-left cluster: it captures the pointer so a thumb can
    // slide between LEFT / RIGHT without lifting.
    dpad.addEventListener('pointerdown', (e) => this.onDpadDown(e));
    dpad.addEventListener('pointermove', (e) => this.onDpadMove(e));
    for (const type of END_EVENTS) dpad.addEventListener(type, (e) => this.onPointerEnd(e));

    // The joystick captures its one pointer and follows it until it lifts.
    this.stick.addEventListener('pointerdown', (e) => this.onStickDown(e));
    this.stick.addEventListener('pointermove', (e) => this.onStickMove(e));
    for (const type of END_EVENTS) {
      this.stick.addEventListener(type, (e) => {
        this.notePointerEnd(e);
        if (e.pointerId === this.stickPointer) this.releaseStick();
      });
    }

    // Held buttons (the lower-right actions, and Down):
    // each button owns its pointers. Classic's Run container must never
    // capture Down's pointer (it would read it as a Run arrow).
    for (const b of [...this.actionButtons.values(), this.downButton]) {
      const action = b.getAttribute('data-action');
      b.addEventListener('pointerdown', (e) => {
        // A hidden button (an ability the fighter does not have) takes nothing.
        if (!this.enabled || b.hidden) return;
        e.preventDefault();
        if (b === this.downButton) e.stopPropagation?.();
        b.setPointerCapture?.(e.pointerId);
        this.assign(e.pointerId, action);
      });
      for (const type of END_EVENTS) b.addEventListener(type, (e) => this.onPointerEnd(e));
    }

    // Mouvement buttons: a press asks for one Dash and shows the button
    // pressed until the pointer lifts; it never holds a direction.
    for (const b of this.mouvementButtons.values()) {
      b.addEventListener('pointerdown', (e) => {
        if (!this.enabled || this.mouvementPointers.has(e.pointerId)) return;
        e.preventDefault();
        // Classic's Run container must never capture a Mouvement pointer.
        e.stopPropagation?.();
        b.setPointerCapture?.(e.pointerId);
        this.mouvementPointers.set(e.pointerId, b);
        b.classList.add('is-pressed');
        this.input.queueTouchMouvement(b._direction);
      });
      for (const type of END_EVENTS) b.addEventListener(type, (e) => this.onMouvementEnd(e));
    }

    // Assistive-technology activation (click without a pointer) = short tap.
    // A pointer's own click is never one, even with no `detail`: it comes
    // right after that pointer lifted (POINTER_CLICK_MS), and the press it
    // ends was taken on pointerdown.
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('.tc-btn');
      if (!b || b.hidden || e.detail !== 0 || !this.enabled) return;
      if (e.timeStamp - this.lastPointerEnd < POINTER_CLICK_MS) return;
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
  // default, DEFAULT_MOBILE_CONTROLS: Joystick), with that scheme's own
  // custom layout. Everything held
  // is let go first, so a switch never leaves a direction or any other
  // button down. The fighter's own art and names are untouched: the
  // combat buttons and Jump are the same elements in both.
  setScheme(scheme) {
    const next = resolveSetting('mobileControls', scheme);
    this.releaseAll();
    if (next === this.scheme) return;
    this.scheme = next;
    const joystick = next === 'joystick';
    this.buttons = new Map([
      ['down', this.downButton],
      ...(joystick ? [] : this.padButtons),
      ...this.actionButtons,
    ]);
    // Reuse the same Down and Mouvement elements and handlers in either
    // cluster.
    this.dpad.replaceChildren(...this.padButtons.values());
    this.joystick.replaceChildren(this.stick);
    if (joystick) this.joystick.replaceChildren(
      this.downButton, this.mouvementButtons.get('mouvementLeft'), this.stick, this.mouvementButtons.get('mouvementRight'),
    );
    else this.dpad.append(this.downButton, ...this.mouvementButtons.values());
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
    if (id === 'down') return this.downButton;
    if (scheme === 'classic' && this.padButtons.has(id)) return this.padButtons.get(id);
    if (this.mouvementButtons.has(id)) return this.mouvementButtons.get(id);
    if (scheme === 'joystick' && id === 'stick') return this.stick;
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
  // (the safe-area insets and margin, see .touch-controls in css/touch-controls.css).
  measureArea() {
    const rect = this.root.getBoundingClientRect();
    const style = globalThis.getComputedStyle?.(this.root);
    const px = (value) => Number.parseFloat(value) || 0;
    return layoutArea(rect, style ? {
      top: px(style.paddingTop), right: px(style.paddingRight), bottom: px(style.paddingBottom), left: px(style.paddingLeft),
    } : {});
  }

  // How high the stack above Shield may rise: `ceiling(left, right)` is the
  // lowest screen y a stacked button spanning [left, right] may reach (its
  // top edge), such as hudCeiling(the screen's HUD); null for the touch
  // area's own top. Applied at once.
  setCeiling(ceiling) {
    this.ceiling = typeof ceiling === 'function' ? ceiling : null;
    this.applyLayout();
  }

  // Puts every control of the scheme on show where its layout says, kept
  // whole inside the area, at its size. Controls the layout leaves out stay
  // exactly where the stylesheet puts them, at their default scale. Called
  // on every scheme or layout change, and by the screens after a resize or
  // orientation change; while the controls are hidden there is nothing to
  // measure, so it tries again next time. Records each control's place
  // (placements): its stylesheet centre (home), its centre now, unscaled
  // size and scale.
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
    // At its default scale first, so the stack and every home are measured
    // as the default layout draws them.
    for (const [id, node] of controls) node.style.scale = String(this.defaultScaleOf(id));
    this.placements = new Map();
    const area = this.measureArea();
    this.area = area;
    if (!(area.width > 0 && area.height > 0)) return false;
    this.placeStack(area);
    // Measure everything first, then move: one layout pass.
    const measured = controls.map(([id, node]) => {
      const r = node.getBoundingClientRect();
      // Its own unscaled box (offsetWidth ignores `scale`); the drawn box
      // centre is its home either way.
      return {
        id, node,
        home: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        size: { width: node.offsetWidth || r.width, height: node.offsetHeight || r.height },
      };
    });
    for (const { id, node, home, size } of measured) {
      const entry = layout[id];
      const center = entry ? placeControl(area, entry, size) : home;
      const scale = entry ? entry.scale : this.defaultScaleOf(id);
      if (entry) node.style.translate = `${(center.x - home.x).toFixed(1)}px ${(center.y - home.y).toFixed(1)}px`;
      node.style.scale = String(scale);
      this.placements.set(id, { home, center, size, scale });
    }
    return true;
  }

  // Control `id`'s role: 'mash' for one of the fighter's two Mash Combo
  // buttons, 'move' for any other of its combat buttons, 'control' for the
  // universal ones (Shield, Jump, the movement controls).
  roleOf(id) {
    if (this.mash.includes(id)) return 'mash';
    return COMBAT_BUTTONS.includes(id) ? 'move' : 'control';
  }

  // Control `id`'s default scale, by its role (TOUCH_DEFAULT_SCALE).
  defaultScaleOf(id) {
    return defaultTouchScale(this.roleOf(id));
  }

  // Gives the fighter's other moves on show (role 'move', in button order)
  // their places (data-stack-col, data-stack-row; drawn by the stylesheet):
  // one to each of the two columns in turn, column 1 (left of Shield,
  // raised a little) first, then column 0 (above Shield), each move on the
  // next row of its column as long as its top stays at or below the ceiling
  // (setCeiling; the area's top by default). A full column passes its turn
  // to the other; with both full, column 2 (above Mash A) takes the rest,
  // and whatever still cannot fit goes on up it, `stackOverflow` saying so.
  // The Mash Combo buttons take their places beside Jump (data-mash, 1 and
  // 2 in the pair's order); a button with neither has no place.
  placeStack(area) {
    const moves = [];
    for (const action of COMBAT_BUTTONS) {
      const b = this.actionButtons.get(action);
      const mash = this.mash.indexOf(action);
      if (mash >= 0) b.setAttribute('data-mash', String(mash + 1));
      else b.removeAttribute('data-mash');
      if (!b.hidden && mash < 0) moves.push(b);
      else {
        b.removeAttribute('data-stack-col');
        b.removeAttribute('data-stack-row');
      }
    }
    const limit = (r) => Math.max(area.top, this.ceiling?.(r.left, r.right) ?? -Infinity);
    const rows = new Map(STACK_COLUMNS.map((col) => [col, 0]));
    const full = new Set();
    const [first, second, last] = STACK_COLUMNS;
    let turn = 0;
    let over = false;
    const tryAt = (b, col) => {
      b.setAttribute('data-stack-col', String(col));
      b.setAttribute('data-stack-row', String(rows.get(col)));
      const r = b.getBoundingClientRect();
      return r.top >= limit(r) - 0.5;
    };
    for (const b of moves) {
      let placed = false;
      // The two side by side, in turn.
      for (let i = 0; i < 2 && !placed; i++) {
        const col = [first, second][(turn + i) % 2];
        if (full.has(col)) continue;
        if (tryAt(b, col)) {
          rows.set(col, rows.get(col) + 1);
          turn = ([first, second].indexOf(col) + 1) % 2;
          placed = true;
        } else full.add(col);
      }
      if (placed) continue;
      // Both full: the last column, past the ceiling if it must.
      if (!tryAt(b, last)) over = true;
      rows.set(last, rows.get(last) + 1);
    }
    this.stackOverflow = over;
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
    if (!this.enabled || this.mouvementPointers.has(e.pointerId) || e.target?.closest?.('[data-mouvement], .tc-down')) return;
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
    this.notePointerEnd(e);
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
  // that offset means (see joystickDirection) and, pushed down, Down too
  // (see joystickVertical).
  steer(x, y) {
    const { x: cx, y: cy, radius } = this.stickFrame;
    const dx = x - cx;
    const dy = y - cy;
    const fx = radius > 0 ? dx / radius : 0;
    const fy = radius > 0 ? dy / radius : 0;
    const held = joystickDirection(fx, this.pointers.get(this.stickPointer) ?? null);
    const max = radius * JOYSTICK.travel;
    const len = Math.hypot(dx, dy);
    const k = len > max ? max / len : 1;
    this.setKnob(dx * k, dy * k);
    this.assign(this.stickPointer, held);
    this.setStickDown(joystickVertical(fx, fy, this.stickDown));
    this.stick.classList.toggle('is-left', held === 'runLeft');
    this.stick.classList.toggle('is-right', held === 'runRight');
  }

  // The stick holds Down (`on`) or lets go of it, through the same held
  // path as the Down button (assign, so the press is a real `downPressed`
  // edge and the count is shared with the button).
  setStickDown(on) {
    if (on === this.stickDown) return;
    this.stickDown = on;
    this.assign(STICK_DOWN, on ? 'down' : null);
    this.stick.classList.toggle('is-down', on);
  }

  // Lets go of the joystick: no direction or Down held, the knob back in
  // the middle.
  releaseStick() {
    if (this.stickPointer !== null) this.assign(this.stickPointer, null);
    this.setStickDown(false);
    this.stickPointer = null;
    this.stickFrame = null;
    this.stick.classList.remove('is-active', 'is-left', 'is-right', 'is-down');
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
    this.notePointerEnd(e);
    const b = this.mouvementPointers.get(e.pointerId);
    if (!b) return;
    this.mouvementPointers.delete(e.pointerId);
    if (![...this.mouvementPointers.values()].includes(b)) b.classList.remove('is-pressed');
  }

  // A pointer lifted off a control: its trailing click, if any, is its own
  // (see POINTER_CLICK_MS).
  notePointerEnd(e) {
    if (Number.isFinite(e.timeStamp)) this.lastPointerEnd = e.timeStamp;
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
    this.input.clearTouchMouvement?.();
    for (const b of this.allButtons) b.classList.remove('is-pressed');
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  // Shows `def`'s own abilities (its mobileAbilities) on the fighter-specific
  // buttons: each one's art (a frame of the fighter's own animation, or a
  // neutral glyph) and accessible name, and whether it shows as reserved or
  // unavailable. Jump keeps its arrow. The buttons stay the
  // same elements with the same data-action and pointer handling, so input,
  // held state and multi-touch carry on untouched: only what they show is
  // swapped, in place (see showArt). Null (or a fighter that authors none)
  // gives the neutral glyphs. A translated name is marked to follow the
  // language.
  //
  // A button whose ability the fighter does not have at all (see
  // abilityPresence: left out of its `actions`) is hidden: not drawn, not
  // named, never focused and never pressed, and whatever held it is let go.
  // The next fighter that has the ability shows the very same element
  // again. `showAbsent` keeps such a button on show in its neutral look
  // instead (the touch layout editor, whose layout every fighter shares).
  //
  // The numbered attack buttons on show then take their slots (see
  // attackSlots): as many as the fighter has numbered attacks, so #0002
  // shows three and #0001 (attack1 to attack5) five. attack1's and
  // attack2's places stay empty when hidden, so no other button moves for
  // them.
  setCharacter(def) {
    this.character = def;
    // The fighter's own Mash Combo pair beside Jump; the editor, whose
    // controls are neutral, keeps attack1 and attack2 there.
    const mash = mashButtons(this.showAbsent ? null : def);
    const regrouped = mash.join() !== this.mash.join();
    this.mash = mash;
    this.airborne = false;
    // Each place's moves by button, for showStatus.
    const groups = def ? abilityGroups(def) : { ground: [], air: [] };
    this.entries = {
      ground: new Map(groups.ground.map((e) => [e.action, e])),
      air: new Map(groups.air.map((e) => [e.action, e])),
    };
    this.refreshAbilities();
    // Another pair beside Jump: every move stands somewhere new.
    if (regrouped) this.applyLayout();
    this.showStatus(null);
  }

  // Shows `fighter`'s live move state on its combat buttons (called after
  // simulation, with Player 1's fighter; null, or a fighter that is not the
  // one these buttons show, clears it): each button's move for the place
  // it is in (setAirborne), read through abilityStatus as the ability HUD
  // reads it. A button with no move there (a ground-only one in the air)
  // keeps the look refreshAbilities gave it.
  showStatus(fighter) {
    const place = this.airborne ? 'air' : 'ground';
    const own = !!fighter && !!this.character && fighter.def === this.character;
    for (const action of ABILITY_ACTIONS) {
      const b = this.actionButtons.get(action);
      const entry = own && !b.hidden ? this.entries[place].get(action) : null;
      this.paintStatus(b, entry ? abilityStatus(fighter, entry, place) : null);
    }
  }

  // Button `b`'s state from `status` (abilityStatus, or null for none):
  // is-cooling (a 3 s or 5 s cooldown: the sweep, --tc-progress, and its
  // seconds, data-seconds) or is-spent (spent for this airtime, free fall,
  // no Energy while exhausted, or missing art). Only what changed is
  // written.
  paintStatus(b, status) {
    const cd = status?.cooldown;
    const state = !status ? 'ready' : status.restriction ? 'spent' : cd.cooling ? 'cooling' : 'ready';
    // A button starts neutral (the stylesheet's own look), so one with
    // nothing to show is never written to.
    const shown = b._status ??= { state: 'ready', progress: 1, text: '' };
    if (state !== shown.state) {
      shown.state = state;
      b.classList.toggle('is-cooling', state === 'cooling');
      b.classList.toggle('is-spent', state === 'spent');
    }
    const progress = cd?.cooling ? Math.round(cd.progress * 200) / 200 : 1;
    if (progress !== shown.progress) {
      shown.progress = progress;
      b.style.setProperty('--tc-progress', String(progress));
    }
    const text = state === 'cooling' ? formatCooldown(cd.remaining) : '';
    if (text !== shown.text) {
      shown.text = text;
      if (text) b.setAttribute('data-seconds', text);
      else b.removeAttribute('data-seconds');
    }
  }

  // Called after simulation. No work at all while the context is unchanged;
  // buttons, images, pointer captures and held input survive transitions.
  setAirborne(airborne) {
    const next = !!airborne;
    if (next === this.airborne) return;
    this.airborne = next;
    this.refreshAbilities();
  }

  refreshAbilities() {
    const def = this.character;
    let shown = false;
    for (const action of ABILITY_ACTIONS) {
      const b = this.actionButtons.get(action);
      // An ability the fighter lacks, kept on show: in its neutral look.
      const from = this.showAbsent && abilityPresence(def, action) === 'absent' ? null : def;
      const ability = mobileAbility(from, action, this.airborne);
      const absent = !ability;
      const inactive = !absent && !this.showAbsent && !abilityAvailable(from, action, this.airborne);
      b.classList.toggle('is-unavailable', inactive);
      if (inactive) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
      if (b.hidden && !absent) shown = true;
      b.hidden = absent;
      if (absent) {
        this.releaseAction(action);
        b.removeAttribute('aria-label');
        b.removeAttribute('data-i18n-aria-label');
        b.removeAttribute('data-i18n-aria-label-params');
        this.showArt(b, { sprite: null, icon: '' });
        b.classList.remove('is-pending');
        continue;
      }
      const key = mobileAbilityLabelKey(from, action, this.airborne);
      if (key) setAttr(b, 'aria-label', key);
      else setPlainAttr(b, 'aria-label', ability.label);
      this.showArt(b, ability);
      b.classList.toggle('is-pending', ability.pending);
    }
    // Jump is always the same universal arrow. The Shield button is
    // always drawn as a shield, and its accessible name says what it does: Shield
    // on the ground, its Deflect in the air (for a fighter that has one; see
    // Fighter.tryDeflect). Its input is `shield` either way.
    this.showArt(this.actionButtons.get('jump'), jumpArt());
    const shield = this.actionButtons.get('shield');
    const deflecting = this.airborne && !!def?.deflect;
    setAttr(shield, 'aria-label', deflecting ? 'touch.deflect' : 'control.shield');
    this.showArt(shield, { sprite: null, icon: ICONS.shield });
    const slots = attackSlots((action) => !this.actionButtons.get(action).hidden);
    let moved = false;
    for (const action of NUMBERED_ATTACKS) {
      const b = this.actionButtons.get(action);
      const slot = slots.has(action) ? String(slots.get(action)) : null;
      if ((b.getAttribute('data-slot') ?? null) === slot) continue;
      moved = true;
      if (slot) b.setAttribute('data-slot', slot);
      else b.removeAttribute('data-slot');
    }
    // A button back on show, or one in a new slot: place them again, as the
    // layout says.
    if (shown || moved) this.applyLayout();
  }

  // Lets go of every pointer holding `action`'s button.
  releaseAction(action) {
    for (const [id, held] of [...this.pointers]) if (held === action) this.assign(id, null);
  }

  // Draws `art` ({ sprite, icon }, see js/ui/mobile-abilities.js) on button
  // `b`, in place. A sprite is the button's one decorative image element
  // (empty alt, hidden from assistive technology: the button's own
  // aria-label names it), in the art's own colours and transparency, fitted
  // whole inside the button (.tc-sprite-icon in css/touch-controls.css); the same
  // element is kept and only its source changes from fighter to fighter.
  // Without a sprite, or once its file has failed to load, the button shows
  // `icon`, the glyph. Never the button itself, its name, classes or
  // handlers.
  showArt(b, { sprite, icon }) {
    if (!sprite || this.failedArt.has(sprite.url)) {
      if (b.classList.contains('has-sprite') || b._glyph !== icon) b.innerHTML = icon;
      b._glyph = icon;
      b.classList.remove('has-sprite');
      b._fallback = null;
      return;
    }
    let img = b._sprite;
    if (!img) {
      img = el('img', { class: 'tc-sprite-icon', alt: '', 'aria-hidden': 'true', draggable: 'false', decoding: 'async' });
      img.addEventListener('error', () => this.spriteFailed(b, img));
      b._sprite = img;
    }
    // Its source is the frame's file, or its packed bytes in a release that
    // packs them (assetSource); the frame is still known by its path.
    const src = assetSource(sprite.url);
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    img._asset = sprite.url;
    img.classList.toggle('is-mirrored', sprite.mirrored);
    b._fallback = icon;
    if (!b.classList.contains('has-sprite')) {
      b.replaceChildren(img);
      b.classList.add('has-sprite');
    }
  }

  // Button `b`'s sprite `img` failed to load (a missing or broken frame):
  // it shows its glyph instead, keeping its name and input, and that file is
  // not tried again. Reported once per file. An error from a source already
  // replaced (the new one still loading) is not this one's.
  spriteFailed(b, img) {
    const url = img._asset ?? img.getAttribute('src');
    if (b._sprite !== img || !b.classList.contains('has-sprite') || !url || img.complete === false) return;
    if (!this.failedArt.has(url)) {
      this.failedArt.add(url);
      console.warn(`[Alva] Touch button art "${url}" failed to load; showing its glyph.`);
    }
    b.innerHTML = b._fallback ?? '';
    b.classList.remove('has-sprite');
  }
}
