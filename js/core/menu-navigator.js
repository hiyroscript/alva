// Keyboard / gamepad menu navigation with spatial focus movement.
// Works on the active screen, or on the top-most overlay scope (pause menu,
// dialogs) when one is open.
//
// A game controller navigates through the same commands: its D-pad moves
// focus, Cross / A confirms, Circle / B goes back, Options / Menu is Start
// (js/core/input-manager.js). Its left stick drives the circular controller
// cursor (js/ui/controller-cursor.js), which belongs to this navigator: it
// hovers and focuses items of the same scope, and confirm activates what it
// is on. Keyboard, mouse and touch hide it and keep working as ever.
//
// In Local Play each controller is a player's: a command says whose
// controller sent it, and while it runs `commandSource` names that player
// ('p1' or 'p2'; null for the keyboard, the mouse and touch), so a Local
// Play setup screen can take a choice from its own player's controller
// alone (js/screens/local-play-screens.js).
//
// The navigator also keeps the input modality (js/core/input-modality.js),
// so focus rings show only for keyboard and controller navigation, and owns
// the dialog stack: its scopes are the open dialogs, oldest first. Each
// scope opened over another sits above it (a top-level overlay's z-index
// follows its place in the stack), everything beneath the top one is inert
// (the screen too, once a dialog outside it is open), commands reach the top
// one alone, and when a dialog closes focus goes back into the one beneath
// if nothing else took it (docs/systems/input.md, "Dialog layers").

import { CONFIG } from '../config.js';
import { ControllerCursor } from '../ui/controller-cursor.js';
import { setInputModality, initialModality, pointerModality, isNavigationKey, inputModality } from './input-modality.js';

const DIRS = ['up', 'down', 'left', 'right'];

// Top-level dialog overlays stack from this z-index up, one step a layer,
// never reaching the rotate prompt (100) or the controller cursor (1000).
export const LAYER_BASE = 60;
export const LAYER_MAX = 99;

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
    this.scopes = []; // overlay scopes, oldest first: { el, onBack, onStart, onDirection }
    // Elements the dialog stack made inert (and so may make live again), and
    // which of them were the current screen when it did.
    this.inerted = new Set();
    this.inertedScreens = new Set();
    this.cursor = new ControllerCursor(this);
    // The player whose controller sent the command being carried out, or
    // null (see the top).
    this.commandSource = null;
    setInputModality(initialModality());
    app.input.onKey((e) => {
      if (isNavigationKey(e)) setInputModality('keyboard');
      this.cursor.hide();
      this.onKey(e);
    });
    app.input.onPadMenu((cmd, source) => {
      setInputModality('gamepad');
      this.padCommand(cmd, source);
    });
    app.input.onPadCursor?.((stick, dt) => {
      this.cursor.move(stick, dt);
      if (this.cursor.visible && inputModality() !== 'gamepad') setInputModality('gamepad');
    });

    // Mouse hover selects, so keyboard and mouse share one highlight. Items
    // marked data-nav-no-hover-focus treat hover as a preview and keep focus.
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const item = e.target.closest?.('[data-nav]');
      if (item?.hasAttribute('data-nav-no-hover-focus')) return;
      if (item && this.inScope(item) && visible(item) && document.activeElement !== item) {
        item.focus({ preventScroll: true });
      }
    });
    document.addEventListener('pointerdown', (e) => {
      setInputModality(pointerModality(e));
      this.cursor.hide();
    }, { capture: true, passive: true });
    // The mouse taking over hides the controller cursor and the focus ring.
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !(e.movementX || e.movementY)) return;
      this.cursor.hide();
      if (inputModality() !== 'mouse') setInputModality('mouse');
    }, { passive: true });
  }

  // A controller's menu command (from `source`'s controller, Player 1's
  // unless said): confirm activates what the cursor is on when it shows
  // one, else the focused item; directions move focus and the cursor
  // follows.
  padCommand(cmd, source = 'p1') {
    const outer = this.commandSource;
    this.commandSource = source ?? 'p1';
    try {
      if (cmd === 'confirm' && this.scopeEl && this.cursor.confirm()) return true;
      const handled = this.command(cmd, null);
      if (DIRS.includes(cmd)) this.cursor.followFocus();
      return handled;
    } finally {
      this.commandSource = outer;
    }
  }

  // Pointer (mouse or touch) modality on or off: kept for callers that only
  // know a pointer was or was not used (see js/core/input-modality.js).
  setPointerInput(on) {
    setInputModality(on ? 'mouse' : 'keyboard');
  }

  // ---- The dialog stack ---------------------------------------------------------

  // Opens `scope` (its el already shown) above every open one. The control
  // that had focus is remembered as its opener; the dialog beneath keeps
  // the control it had, for when focus comes back to it.
  pushScope(scope) {
    const i = this.scopes.indexOf(scope);
    if (i >= 0) this.scopes.splice(i, 1);
    const active = globalThis.document?.activeElement ?? null;
    const below = this.scopes.at(-1);
    if (below && active && below.el.contains?.(active)) below.lastFocus = active;
    scope.opener = active;
    this.scopes.push(scope);
    this.syncLayers();
  }

  // Closes `scope`: its stacking style goes, the dialog beneath becomes the
  // live one again and, unless the closing code put focus somewhere live,
  // gets focus back (see restoreFocus).
  popScope(scope) {
    const i = this.scopes.lastIndexOf(scope);
    if (i < 0) return;
    this.scopes.splice(i, 1);
    this.releaseLayer(scope.el);
    this.syncLayers();
    const restore = () => this.restoreFocus(scope);
    if (typeof queueMicrotask === 'function') queueMicrotask(restore);
    else restore();
  }

  // The live scope: the newest whose element still shows. A dialog
  // hidden without closing its scope never keeps the navigation.
  get top() {
    this.prune();
    return this.scopes[this.scopes.length - 1] ?? null;
  }

  prune() {
    for (let i = this.scopes.length - 1; i >= 0; i -= 1) {
      const scope = this.scopes[i];
      if (scope.el?.hidden !== true) continue;
      this.scopes.splice(i, 1);
      this.releaseLayer(scope.el);
      if (i === this.scopes.length) this.syncLayers();
    }
  }

  get screenEl() {
    return this.app.screens?.current?.el ?? null;
  }

  // Applies the stack: each top-level overlay (one outside the screen) one
  // layer above the scope opened before it, everything beneath the top
  // scope inert (the screen too, when the top dialog is not part of it),
  // and the controller cursor's hover re-read.
  syncLayers() {
    const screen = this.screenEl;
    const scopes = this.scopes;
    scopes.forEach((scope, i) => {
      const el = scope.el;
      if (!el?.style || screen?.contains?.(el)) return;
      el.style.zIndex = String(Math.min(LAYER_MAX, LAYER_BASE + i));
    });
    const top = scopes.at(-1);
    const required = new Set();
    if (top) {
      for (const scope of scopes.slice(0, -1)) {
        if (scope.el && !scope.el.contains?.(top.el)) required.add(scope.el);
      }
      if (screen && !screen.contains?.(top.el)) required.add(screen);
    }
    for (const el of [...this.inerted]) {
      if (required.has(el)) continue;
      this.inerted.delete(el);
      const wasScreen = this.inertedScreens.delete(el);
      // A screen that is no longer the current one stays as the screen
      // manager left it: inactive.
      if (wasScreen && el !== screen) continue;
      el.inert = false;
    }
    for (const el of required) {
      if (el.inert) continue;
      el.inert = true;
      this.inerted.add(el);
      if (el === screen) this.inertedScreens.add(el);
    }
    this.cursor.retarget?.();
  }

  releaseLayer(el) {
    if (el?.style?.zIndex !== undefined) el.style.zIndex = '';
  }

  // After `closed` closed: when focus is lost (on nothing, or on a hidden or
  // inert control), it goes back into the dialog now on top (to the control
  // it had, else its default), or, with no dialog left, to the control that
  // opened `closed` on a navigable screen. Gameplay screens leave focus off.
  restoreFocus(closed) {
    const doc = globalThis.document;
    const active = doc?.activeElement;
    const live = (el) => !!el && el !== doc?.body && el.isConnected !== false && !el.closest?.('[hidden], [inert]');
    const top = this.top;
    if (top) {
      if (live(active) && top.el.contains(active)) return;
      const back = top.lastFocus;
      if (live(back) && top.el.contains(back)) back.focus({ preventScroll: true });
      else this.focusFirst(top.el);
      return;
    }
    if (live(active)) return;
    const screen = this.app.screens?.current;
    if (!screen?.navigable) return;
    const opener = closed?.opener;
    if (live(opener) && screen.el.contains(opener)) opener.focus({ preventScroll: true });
  }

  get scopeEl() {
    const top = this.top;
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
    const top = this.top;
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
