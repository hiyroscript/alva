// The controller cursor: a small circular pointer the left stick moves
// through the menus, part of MenuNavigator (js/core/menu-navigator.js),
// never a second navigation engine.
//
// It shows only while a controller is navigating a menu (a screen or an
// open dialog: the navigator's scope) and hides for play, for the mouse,
// the keyboard or touch. Over an enabled item of the active scope it
// focuses it, as a mouse hover does (items marked
// data-nav-no-hover-focus only highlight), so focus, the cursor and
// activation stay one selection: Cross / A then activates what the cursor
// is on, never anything outside the scope (a dialog stops everything
// beneath it). The item under it wears .is-cursor-target, the cursor's
// hover look, only while the cursor is over it: it goes as the cursor moves
// off, hides, or a dialog opens or closes (retarget). With the D-pad, focus moves item to item and the cursor
// glides after it. The right stick scrolls whatever scrolls under the
// cursor (or around the focused item).
//
// Movement is resolution independent: its top speed is a share of the
// viewport per second, eased in from a radial deadzone, with a quick,
// predictable stop and the viewport for bounds.

const DEADZONE = 0.18;
// Top speed: this share of the viewport's shorter side per second.
const SPEED = 1.15;
const MIN_SPEED = 520;
const MAX_SPEED = 1500;
// How fast the speed follows the stick (per second), speeding up and
// stopping.
const ACCELERATION = 12;
const STOPPING = 30;
// Pixels a second the right stick scrolls at full tilt.
const SCROLL_SPEED = 1100;
const SCROLL_DEADZONE = 0.22;
// Seconds the cursor takes to glide onto an item focused with the D-pad.
const GLIDE = 0.14;

// What the cursor can activate: menu items first, then any button or link.
const INTERACTIVE = '[data-nav], button, a[href]';

const scrollable = (el) => {
  if (!el || el.scrollHeight === undefined || el.scrollHeight <= el.clientHeight + 1) return false;
  const overflow = globalThis.getComputedStyle?.(el)?.overflowY;
  return overflow === 'auto' || overflow === 'scroll';
};

export class ControllerCursor {
  // `nav` is the MenuNavigator (its scope, visibility and focus rules).
  constructor(nav) {
    this.nav = nav;
    this.el = null;
    this.visible = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.target = null;
    this.glide = null;
    this.pressTimer = null;
  }

  // The cursor's element, made the first time it shows.
  element() {
    if (this.el) return this.el;
    const doc = globalThis.document;
    if (!doc?.createElement || !doc.body?.append) return null;
    const el = doc.createElement('div');
    el.className = 'controller-cursor';
    el.setAttribute('aria-hidden', 'true');
    const ring = doc.createElement('span');
    ring.className = 'controller-cursor-ring';
    const dot = doc.createElement('span');
    dot.className = 'controller-cursor-dot';
    el.append(ring, dot);
    doc.body.append(el);
    this.el = el;
    return el;
  }

  get viewport() {
    return { w: globalThis.innerWidth || 1280, h: globalThis.innerHeight || 720 };
  }

  // The middle of `el` on screen, or null.
  centre(el) {
    const r = el?.getBoundingClientRect?.();
    if (!r || !(r.width > 0) || !(r.height > 0)) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  show() {
    if (this.visible) return;
    const el = this.element();
    if (!el) return;
    // Appears on the focused item (if it is in the scope), else mid-screen.
    const active = globalThis.document?.activeElement;
    const at = (active && this.nav.inScope(active) && this.centre(active)) || { x: this.viewport.w / 2, y: this.viewport.h / 2 };
    this.x = at.x;
    this.y = at.y;
    this.vx = 0;
    this.vy = 0;
    this.visible = true;
    el.classList.add('is-visible');
    this.render();
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.vx = 0;
    this.vy = 0;
    this.glide = null;
    this.setTarget(null);
    this.el?.classList.remove('is-visible', 'is-hover', 'is-pressed');
  }

  render() {
    if (this.el) this.el.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(this.y)}px, 0)`;
  }

  // One frame of the stick (`stick` { x, y, scroll }; null as play starts
  // or the controller goes) over `dt` seconds.
  move(stick, dt) {
    // Play started, the controller is gone or nothing is navigable.
    if (!stick || !this.nav.scopeEl) {
      this.hide();
      return;
    }
    const mag = Math.hypot(stick.x, stick.y);
    if (mag > DEADZONE && !this.visible) this.show();
    if (!this.visible) {
      this.scroll(stick.scroll, dt);
      return;
    }
    const { w, h } = this.viewport;
    const top = Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.min(w, h) * SPEED));
    let tx = 0;
    let ty = 0;
    if (mag > DEADZONE) {
      // Rescaled past the deadzone and eased in: fine control near the
      // middle, full speed at the rim.
      const amount = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE));
      const speed = top * amount * amount;
      tx = (stick.x / mag) * speed;
      ty = (stick.y / mag) * speed;
      this.glide = null;
    }
    const rate = mag > DEADZONE ? ACCELERATION : STOPPING;
    const k = 1 - Math.exp(-rate * dt);
    this.vx += (tx - this.vx) * k;
    this.vy += (ty - this.vy) * k;
    if (Math.abs(this.vx) < 2 && Math.abs(this.vy) < 2 && mag <= DEADZONE) {
      this.vx = 0;
      this.vy = 0;
    }
    if (this.glide) {
      const g = this.glide;
      g.t = Math.min(1, g.t + dt / GLIDE);
      const e = 1 - (1 - g.t) ** 3;
      this.x = g.fromX + (g.toX - g.fromX) * e;
      this.y = g.fromY + (g.toY - g.fromY) * e;
      if (g.t >= 1) this.glide = null;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    this.x = Math.max(0, Math.min(w - 1, this.x));
    this.y = Math.max(0, Math.min(h - 1, this.y));
    this.render();
    if (!this.glide) this.hover();
    this.scroll(stick.scroll, dt);
  }

  // The enabled item of the active scope under the cursor, or null.
  itemAt(x, y) {
    const doc = globalThis.document;
    const hit = doc?.elementFromPoint?.(x, y);
    const item = hit?.closest?.(INTERACTIVE);
    if (!item || item.disabled || item.getAttribute?.('aria-disabled') === 'true') return null;
    if (!this.nav.inScope(item) || item.closest?.('[hidden], [inert]')) return null;
    return item;
  }

  // Marks the item under the cursor, focusing it as a mouse hover does.
  hover() {
    const item = this.itemAt(this.x, this.y);
    this.setTarget(item);
    if (!item || !item.matches?.('[data-nav]') || item.hasAttribute('data-nav-no-hover-focus')) return;
    if (globalThis.document?.activeElement !== item) item.focus({ preventScroll: true });
  }

  // The stack changed (a dialog opened or closed, the screen changed): the
  // hover look follows what the cursor is on now, so nothing beneath a new
  // dialog, and nothing hidden, keeps it.
  retarget() {
    if (!this.visible) {
      this.setTarget(null);
      return;
    }
    this.setTarget(this.itemAt(this.x, this.y));
  }

  // .is-cursor-target is the cursor's hover look (the same as a mouse
  // hover's, see css/components.css), on the item under it only.
  setTarget(item) {
    if (item === this.target) return;
    this.target?.classList?.remove('is-cursor-target');
    this.target = item;
    item?.classList?.add('is-cursor-target');
    this.el?.classList.toggle('is-hover', !!item);
  }

  // Cross / A: activates the item under the cursor. False (nothing done)
  // when the cursor is hidden or on nothing, for the navigator's own
  // confirm.
  confirm() {
    if (!this.visible) return false;
    const item = this.itemAt(this.x, this.y);
    if (!item) return false;
    this.el?.classList.add('is-pressed');
    clearTimeout(this.pressTimer);
    this.pressTimer = setTimeout(() => this.el?.classList.remove('is-pressed'), 140);
    if (item.matches?.('[data-nav]') && !item.hasAttribute('data-nav-no-hover-focus')) item.focus({ preventScroll: true });
    item.click();
    return true;
  }

  // After D-pad navigation: glide onto the newly focused item.
  followFocus() {
    if (!this.visible) return;
    const active = globalThis.document?.activeElement;
    const to = active && this.nav.inScope(active) ? this.centre(active) : null;
    if (!to) return;
    this.glide = { t: 0, fromX: this.x, fromY: this.y, toX: to.x, toY: to.y };
    this.setTarget(active);
  }

  // The right stick: scrolls the scrollable box under the cursor (or the
  // focused item's), inside the active scope.
  scroll(amount, dt) {
    if (!(Math.abs(amount) > SCROLL_DEADZONE)) return;
    const doc = globalThis.document;
    const from = (this.visible && doc?.elementFromPoint?.(this.x, this.y)) || doc?.activeElement;
    const scope = this.nav.scopeEl;
    const delta = amount * SCROLL_SPEED * dt;
    for (let el = from; el && scope?.contains(el); el = el.parentElement) {
      // A box with a scroll of its own (Home's credits roll) takes a wheel.
      const wheel = typeof globalThis.WheelEvent === 'function'
        ? new globalThis.WheelEvent('wheel', { deltaY: delta, bubbles: false, cancelable: true }) : null;
      if (wheel && el.dispatchEvent && !el.dispatchEvent(wheel)) return;
      if (scrollable(el)) {
        el.scrollTop += delta;
        return;
      }
      if (el === scope) return;
    }
  }
}
