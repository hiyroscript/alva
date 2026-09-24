// PRACTICE GROUND screen: a solo training room. It starts at once with
// #0001 on the training stage, with no CPU, intro, timer or result, and runs
// until the player returns Home. The three-dots More button (or Esc / P /
// Start) freezes it under a light Practice menu: Change Fighter opens the
// full roster in a large glass dialog over the paused stage and swaps the
// fighter in place; Return goes Home.
//
// Practice keeps its own fighter choice: it never reads or writes Quick
// Battle's app.selection.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { menuButton } from '../ui/components.js';
import { FighterRoster } from '../ui/fighter-roster.js';
import { getCharacter } from '../data/characters.js';
import { PRACTICE_MAP } from '../data/practice-map.js';
import { PracticeSession } from '../game/practice.js';
import { PracticeHUD } from '../game/hud.js';
import { TouchControls } from '../game/touch-controls.js';

// Every fresh visit from Home starts with this fighter.
export const PRACTICE_DEFAULT_FIGHTER = '0001';

export class PracticeGroundScreen extends Screen {
  constructor(app) {
    super(app, 'practice');
    this.navigable = false;

    this.canvas = el('canvas', { class: 'battle-canvas', 'aria-label': 'Practice Ground', role: 'img' });
    this.hudRoot = el('div', { class: 'hud practice-hud' });
    this.hud = new PracticeHUD(this.hudRoot, { onMore: () => this.toggleMenu() });
    this.touchRoot = el('div', { class: 'touch-controls' });
    this.touch = new TouchControls(this.touchRoot, app.input);

    this.buildMenu();
    this.buildRoster();

    this.el.replaceChildren(this.canvas, this.hudRoot, this.touchRoot, this.menuOverlay, this.rosterOverlay);

    this.session = null;
    this.characterId = PRACTICE_DEFAULT_FIGHTER;
    this.menuOpen = false;
    this.rosterOpen = false;
    this.swapping = false;
    this.needsResize = true;
    // Observed only while Practice Ground is showing (see enter / exit).
    this.resizeObserver = new ResizeObserver(() => { this.needsResize = true; });

    this.onVisibility = () => {
      if (document.hidden && this.isRunning) this.openMenu();
    };
  }

  // ---- DOM builders ---------------------------------------------------------

  // The light Practice menu: exactly Change Fighter and Return. Esc / Back,
  // Start, the More button or a press on the dim around it close it again.
  buildMenu() {
    this.changeBtn = menuButton('Change Fighter', { primary: true });
    this.returnBtn = menuButton('Return', { outlineOnly: true });
    this.changeBtn.addEventListener('click', () => this.openRoster());
    this.returnBtn.addEventListener('click', () => this.leave());

    this.menuOverlay = el('div', {
      class: 'overlay practice-menu-overlay', hidden: true,
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'practice-menu-title',
    }, [el('div', { class: 'pause-panel practice-menu-panel glass glass--panel' }, [
      el('h2', { class: 'kicker practice-menu-title', id: 'practice-menu-title', text: 'Practice Ground' }),
      el('div', { class: 'pause-menu' }, [this.changeBtn, this.returnBtn]),
    ])]);
    this.menuOverlay.addEventListener('click', (e) => {
      if (e.target === this.menuOverlay) this.resume();
    });

    this.menuScope = {
      el: this.menuOverlay,
      onBack: () => this.resume(),
      onStart: () => this.resume(),
    };
  }

  // Change Fighter: the shared fighter roster in a large glass dialog. Back
  // (the header button, Esc / Back) returns to the Practice menu.
  buildRoster() {
    const back = el('button', {
      class: 'btn-back', type: 'button', 'data-nav': true,
      'aria-label': 'Back to practice menu', html: `${ICONS.back}<span>Back</span>`,
    });
    back.addEventListener('click', () => this.closeRoster());

    this.rosterDialog = el('div', { class: 'practice-roster-dialog glass' });
    this.roster = new FighterRoster(this.app, {
      host: this.rosterDialog,
      previewId: 'practice-preview-name',
      onConfirm: (def) => this.changeFighter(def),
    });
    this.rosterDialog.replaceChildren(
      el('header', { class: 'screen-header practice-roster-head' }, [
        back,
        el('div', { class: 'screen-heading' }, [
          el('span', { class: 'kicker', text: 'Practice Ground' }),
          el('h2', { class: 'screen-title', id: 'practice-roster-title', text: 'Change Fighter' }),
        ]),
      ]),
      el('div', { class: 'screen-body char-layout practice-roster-body' }, [this.roster.rosterPanel, this.roster.previewPanel]),
    );

    this.rosterOverlay = el('div', {
      class: 'overlay practice-roster-overlay', hidden: true,
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'practice-roster-title',
    }, [this.rosterDialog]);

    this.rosterScope = {
      el: this.rosterOverlay,
      onBack: () => this.closeRoster(),
    };
  }

  // ---- Lifecycle --------------------------------------------------------------

  async enter() {
    const app = this.app;
    // A fresh visit always starts from the default fighter, whatever Quick
    // Battle or an earlier visit used.
    this.characterId = PRACTICE_DEFAULT_FIGHTER;
    const def = getCharacter(this.characterId);
    this.token = {};
    const token = this.token;

    app.loading.show(`Loading ${def.displayName}`);
    const sprites = await app.loadCharacter(def.id, (done, total) => app.loading.setProgress(done, total));
    if (token !== this.token) return; // left the screen while loading

    if (!sprites?.usable) {
      app.loading.showError(`${def.displayName}'s sprite frames could not be loaded. Check your connection and that the files in assets/characters/${def.id}/ exist.`, {
        nav: app.nav,
        onRetry: () => {
          app.resetCharacter(def.id);
          this.enter();
        },
        onBack: () => app.screens.go('home', {}, { reset: true }),
      });
      return;
    }
    app.loading.hide();

    this.session = new PracticeSession({
      canvas: this.canvas,
      map: PRACTICE_MAP,
      def,
      sprites,
      input: app.input,
      reducedMotion: app.device.reducedMotion,
    });
    this.hud.bind(this.session.player);
    this.hud.update(this.session);
    this.needsResize = true;
    this.resizeObserver.observe(this.el);
    this.unsubKey = app.input.onKey((e) => this.onKey(e));
    document.addEventListener('visibilitychange', this.onVisibility);

    this.play();
    if (app.device.blockedPortrait) this.openMenu();
  }

  exit() {
    this.token = null;
    this.swapping = false;
    this.unsubKey?.();
    this.unsubKey = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver.disconnect();
    this.closeRoster({ silent: true });
    this.hideMenu();
    this.app.input.setGameplayActive(false);
    this.touch.setEnabled(false);
    this.app.loading.hide();
    this.session?.destroy();
    this.session = null;
  }

  // Running: a session exists and neither the menu nor a fighter swap holds it.
  get isRunning() {
    return !!this.session && !this.menuOpen && !this.swapping;
  }

  update(dt) {
    const session = this.session;
    if (!session) return;
    if (this.needsResize) {
      this.needsResize = false;
      if (session.resize() && !this.isRunning) session.render();
    }
    if (this.rosterOpen) this.roster.update(dt);
    if (!this.isRunning || this.app.device.blockedPortrait) return;
    session.frame(dt);
    this.hud.update(session);
  }

  onDeviceChange() {
    this.needsResize = true;
    if (this.app.device.blockedPortrait && this.isRunning) this.openMenu();
  }

  onKey(e) {
    if (e.menuHandled || !this.session || this.app.dialog.resolve) return;
    if (e.code === CONFIG.debug.overlayKey && !e.repeat) {
      this.session.debug = !this.session.debug;
      if (!this.isRunning) this.session.render();
      return;
    }
    if (!CONFIG.bindings.pause.includes(e.code) || e.repeat) return;
    if (this.isRunning) {
      e.preventDefault();
      this.openMenu();
    } else if (this.menuOpen && !this.rosterOpen && e.code === 'KeyP') {
      e.preventDefault();
      this.resume();
    }
    if (this.app.input.lastDevice === 'keyboard') this.app.device.noteKeyboard?.();
  }

  // Gamepad Start while practising opens the menu (inside it, the menu's
  // scope handles Start).
  onCommand(cmd) {
    if (cmd === 'start' && this.isRunning) {
      this.openMenu();
      return true;
    }
    return false;
  }

  // Gameplay input and touch controls on, nothing focused (so Space and
  // Enter stay gameplay keys).
  play() {
    this.app.input.setGameplayActive(true);
    this.touch.setEnabled(true);
    document.activeElement?.blur?.();
  }

  // ---- Practice menu ----------------------------------------------------------

  // The More button: opens the menu while practising, closes it again.
  toggleMenu() {
    if (this.rosterOpen || this.swapping) return;
    if (this.menuOpen) this.resume();
    else this.openMenu();
  }

  // Freezes practice under the menu: the simulation stops, gameplay input
  // and touch controls go off, and focus lands on Change Fighter.
  openMenu() {
    if (!this.session || this.menuOpen) return;
    this.menuOpen = true;
    this.app.input.setGameplayActive(false);
    this.touch.setEnabled(false);
    this.el.classList.add('is-menu-open');
    this.hud.setMenuOpen(true);
    this.menuOverlay.hidden = false;
    this.app.nav.pushScope(this.menuScope);
    this.changeBtn.focus({ preventScroll: true });
  }

  // Back to practising, from the menu (never past the fighter dialog).
  resume() {
    if (!this.menuOpen || this.rosterOpen || this.swapping) return;
    if (this.app.device.blockedPortrait) return; // stay frozen until landscape
    this.hideMenu();
    // Keys pressed in the menu (J confirms, K goes back) are not attacks.
    this.app.input.flush();
    this.play();
  }

  hideMenu() {
    this.menuOpen = false;
    this.menuOverlay.hidden = true;
    this.el.classList.remove('is-menu-open');
    this.hud.setMenuOpen(false);
    this.app.nav.popScope(this.menuScope);
  }

  leave() {
    this.app.screens.go('home', {}, { reset: true });
  }

  // ---- Change Fighter ---------------------------------------------------------

  // Opens the roster over the frozen stage with the current fighter
  // selected and focused. The menu stays open, inert, beneath it.
  openRoster() {
    if (!this.menuOpen || this.rosterOpen) return;
    this.rosterOpen = true;
    this.el.classList.add('is-roster-open');
    this.menuOverlay.inert = true;
    this.hudRoot.inert = true;
    this.rosterOverlay.hidden = false;
    this.roster.show(this.characterId);
    this.app.nav.pushScope(this.rosterScope);
    this.roster.focusSelected();
  }

  // Closes only the dialog: the fighter is unchanged and focus returns to
  // Change Fighter in the menu. `silent` leaves focus alone.
  closeRoster({ silent = false } = {}) {
    if (!this.rosterOpen) return;
    this.rosterOpen = false;
    this.rosterOverlay.hidden = true;
    this.el.classList.remove('is-roster-open');
    this.menuOverlay.inert = false;
    this.hudRoot.inert = false;
    this.app.nav.popScope(this.rosterScope);
    if (!silent) this.changeBtn.focus({ preventScroll: true });
  }

  // Swaps the practice fighter in place: loads `def`, puts a fresh fighter
  // on the spawn, rebinds the HUD, then closes the dialog and the menu and
  // resumes. A failed load keeps the current fighter and the dialog open.
  async changeFighter(def) {
    if (this.swapping || !this.session) return;
    const app = this.app;
    const token = this.token;
    this.swapping = true;
    app.loading.show(`Loading ${def.displayName}`);
    const sprites = await app.loadCharacter(def.id, (done, total) => app.loading.setProgress(done, total));
    if (token !== this.token || !this.session) return; // left Practice Ground meanwhile
    this.swapping = false;

    if (!sprites?.usable) {
      app.loading.showError(`${def.displayName}'s sprite frames could not be loaded. Check your connection and that the files in assets/characters/${def.id}/ exist.`, {
        nav: app.nav,
        onRetry: () => {
          app.resetCharacter(def.id);
          this.changeFighter(def);
        },
        onBack: () => this.roster.focusSelected(),
      });
      return;
    }
    app.loading.hide();

    this.characterId = def.id;
    this.session.setFighter(def, sprites);
    this.hud.bind(this.session.player);
    this.hud.update(this.session);
    this.closeRoster({ silent: true });
    this.resume();
  }
}
