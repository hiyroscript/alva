// Screen state machine for the DOM layer. Screens are <section> elements that
// are swapped with short CSS transitions (no page reloads). Inactive screens
// are hidden + inert so focus and assistive tech stay on the active one.

export class Screen {
  constructor(app, id) {
    this.app = app;
    this.id = id;
    this.el = document.querySelector(`[data-screen="${id}"]`);
    // Whether arrow keys / Enter / Esc drive menu navigation on this screen.
    this.navigable = true;
    // How long the screen stays mounted under the next one when leaving.
    this.leaveMs = null;
  }

  // Lifecycle hooks (override as needed)
  enter() {}
  exit() {}
  update() {}
  onBack() {
    this.app.screens.back();
  }
  // Menu command from keyboard/gamepad not handled by the navigator.
  onCommand() {
    return false;
  }
  focusDefault() {
    const target = this.el.querySelector('[data-nav-default]') || this.el.querySelector('[data-nav]');
    target?.focus({ preventScroll: true });
  }
}

export class ScreenManager {
  constructor(app) {
    this.app = app;
    this.screens = new Map();
    this.stack = [];
    this.current = null;
    this.transitionMs = 280;
  }

  register(screen) {
    this.screens.set(screen.id, screen);
    screen.el.hidden = true;
    screen.el.inert = true;
  }

  get(id) {
    return this.screens.get(id);
  }

  // Navigate to a screen. `replace` doesn't push the current screen onto the
  // back stack; `reset` clears the stack (e.g. returning Home).
  go(id, params = {}, { replace = false, reset = false } = {}) {
    const next = this.screens.get(id);
    if (!next) throw new Error(`[Alva] Unknown screen "${id}"`);
    const prev = this.current;
    if (reset) this.stack = [];
    else if (prev && !replace && prev !== next) this.stack.push(prev.id);
    this.swap(prev, next, params, 'forward');
  }

  back() {
    const id = this.stack.pop();
    if (!id) return false;
    this.swap(this.current, this.screens.get(id), { fromBack: true }, 'back');
    return true;
  }

  swap(prev, next, params, direction) {
    const reduced = this.app.device.reducedMotion;
    if (prev && prev !== next) {
      prev.exit();
      const el = prev.el;
      el.inert = true;
      el.classList.remove('is-active', 'is-entering', 'is-back');
      if (reduced) {
        el.hidden = true;
      } else {
        el.classList.add('is-leaving');
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => {
          el.classList.remove('is-leaving');
          if (this.current !== prev) el.hidden = true;
        }, prev.leaveMs ?? this.transitionMs);
      }
    }
    this.current = next;
    const el = next.el;
    clearTimeout(el._hideTimer);
    el.classList.remove('is-leaving');
    el.hidden = false;
    el.inert = false;
    el.classList.toggle('is-back', direction === 'back');
    el.classList.add('is-active');
    if (!reduced) {
      el.classList.remove('is-entering');
      void el.offsetWidth; // restart the enter animation
      el.classList.add('is-entering');
    }
    document.documentElement.dataset.screen = next.id;
    next.enter(params);
    if (next.navigable) next.focusDefault();
  }
}
