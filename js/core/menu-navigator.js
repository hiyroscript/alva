// Keyboard / gamepad menu navigation with spatial focus movement.
// Works on the active screen, or on the top-most overlay scope (pause menu,
// dialogs) when one is open.

import { CONFIG } from '../config.js';

const DIRS = ['up', 'down', 'left', 'right'];

function buildCodeMap() {
  const map = new Map();
  for (const [cmd, codes] of Object.entries(CONFIG.menuBindings)) {
    for (const code of codes) if (!map.has(code)) map.set(code, cmd);
  }
  return map;
}

function visible(el) {
  // aria-disabled items (e.g. locked roster slots) stay focusable on purpose.
  if (el.disabled) return false;
  if (el.closest('[hidden], [inert]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function findNeighbor(current, candidates, dir) {
  const r0 = current.getBoundingClientRect();
  const c0x = r0.left + r0.width / 2;
  const c0y = r0.top + r0.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of candidates) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = cx - c0x;
    const dy = cy - c0y;
    const primary = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    if (primary <= 4) continue;
    const secondary = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 2.4;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

export class MenuNavigator {
  constructor(app) {
    this.app = app;
    this.codeMap = buildCodeMap();
    this.scopes = []; // overlay scopes: { el, onBack, onStart }
    app.input.onKey((e) => this.onKey(e));
    app.input.onPadMenu((cmd) => this.command(cmd, null));

    // Mouse hover selects, so keyboard and mouse share one highlight.
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const item = e.target.closest?.('[data-nav]');
      if (item && this.inScope(item) && visible(item) && document.activeElement !== item) {
        item.focus({ preventScroll: true });
      }
    });
  }

  pushScope(scope) {
    this.scopes.push(scope);
  }

  popScope(scope) {
    const i = this.scopes.lastIndexOf(scope);
    if (i >= 0) this.scopes.splice(i, 1);
  }

  get scopeEl() {
    const top = this.scopes[this.scopes.length - 1];
    if (top) return top.el;
    const screen = this.app.screens.current;
    return screen && screen.navigable ? screen.el : null;
  }

  inScope(el) {
    const scope = this.scopeEl;
    return !!scope && scope.contains(el);
  }

  onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const cmd = this.codeMap.get(e.code);
    if (!cmd) return;
    if (!this.scopeEl) return;
    // Native buttons already activate on Enter/Space.
    const active = document.activeElement;
    const nativeConfirm = (e.code === 'Enter' || e.code === 'Space') && active?.matches?.('button, a, [role="button"]') && this.inScope(active);
    if (cmd === 'confirm' && nativeConfirm) return;
    if (e.repeat && (cmd === 'confirm' || cmd === 'back')) {
      e.preventDefault();
      return;
    }
    if (this.command(cmd, e)) {
      e.preventDefault();
      // Lets later key listeners (e.g. battle pause toggle) skip this event.
      e.menuHandled = true;
    }
  }

  // Returns true when the command was handled.
  command(cmd, event) {
    const scopeEl = this.scopeEl;
    const top = this.scopes[this.scopes.length - 1];
    const screen = this.app.screens.current;

    if (cmd === 'start') {
      if (top?.onStart) {
        top.onStart();
        return true;
      }
      if (screen?.onCommand('start')) return true;
      cmd = 'confirm';
    }
    if (!scopeEl) {
      return screen?.onCommand(cmd, event) || false;
    }

    if (DIRS.includes(cmd)) {
      if (top?.onDirection?.(cmd)) return true;
      if (!top && screen?.onCommand(cmd, event)) return true;
      this.move(cmd, scopeEl);
      return true;
    }
    if (cmd === 'confirm') {
      const active = document.activeElement;
      if (active && this.inScope(active) && active.matches('[data-nav]')) {
        active.click();
      } else {
        this.focusFirst(scopeEl);
      }
      return true;
    }
    if (cmd === 'back') {
      if (top) {
        top.onBack?.();
        return true;
      }
      screen?.onBack();
      return true;
    }
    return false;
  }

  candidates(scopeEl) {
    return Array.from(scopeEl.querySelectorAll('[data-nav]')).filter(visible);
  }

  focusFirst(scopeEl) {
    const def = scopeEl.querySelector('[data-nav-default]');
    const target = def && visible(def) ? def : this.candidates(scopeEl)[0];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  move(dir, scopeEl) {
    const active = document.activeElement;
    const items = this.candidates(scopeEl);
    if (!active || !scopeEl.contains(active) || !items.includes(active)) {
      this.focusFirst(scopeEl);
      return;
    }
    const next = findNeighbor(active, items, dir);
    if (next) {
      next.focus({ preventScroll: true });
      next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      this.app.audio.play('move');
    }
  }
}
