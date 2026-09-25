// PRACTICE GROUND screen: a training room. It starts at once with #0001 and
// a training-dummy CPU (#0001 too) on the training stage, with no intro,
// timer, points or result, and runs until the player returns Home. The
// three-dots More button (top centre, or Esc / P / Start) freezes it under a
// light Practice menu: Change Fighter opens the full roster in a large glass
// dialog over the paused stage and swaps the fighter in place; Change CPU
// (Enable CPU once it has been disabled) opens a second roster dialog that
// replaces the CPU or puts one back, and whose Disable CPU takes it away;
// Return goes Home.
//
// Practice keeps its own fighter and CPU choices, and every fresh visit
// starts over (default fighter, default CPU): a disabled CPU is never
// remembered, and it never reads or writes Quick Battle's app.selection.

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

// Every fresh visit from Home starts with this fighter, and a practice CPU
// of the same fighter, sharing its one loaded sprite set.
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
    this.buildCpuRoster();

    this.el.replaceChildren(
      this.canvas, this.hudRoot, this.touchRoot, this.menuOverlay, this.rosterOverlay, this.cpuRosterOverlay,
    );

    this.session = null;
    this.characterId = PRACTICE_DEFAULT_FIGHTER;
    this.menuOpen = false;
    // Change Fighter's dialog and the CPU dialog each have their own open and
    // loading state; at most one of them is open at a time.
    this.rosterOpen = false;
    this.swapping = false;
    this.cpuRosterOpen = false;
    this.cpuSwapping = false;
    this.needsResize = true;
    // Observed only while Practice Ground is showing (see enter / exit).
    this.resizeObserver = new ResizeObserver(() => { this.needsResize = true; });

    this.onVisibility = () => {
      if (document.hidden && this.isRunning) this.openMenu();
    };
  }

  // ---- DOM builders ---------------------------------------------------------

  // The light Practice menu: exactly Change Fighter, Change CPU (Enable CPU
  // while there is none) and Return. Esc / Back, Start, the More button or a
  // press on the dim around it close it again.
  buildMenu() {
    this.changeBtn = menuButton('Change Fighter', { primary: true });
    this.cpuBtn = menuButton('Change CPU');
    this.returnBtn = menuButton('Return', { outlineOnly: true });
    this.changeBtn.addEventListener('click', () => this.openRoster());
    this.cpuBtn.addEventListener('click', () => this.openCpuRoster());
    this.returnBtn.addEventListener('click', () => this.leave());

    this.menuOverlay = el('div', {
      class: 'overlay practice-menu-overlay', hidden: true,
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'practice-menu-title',
    }, [el('div', { class: 'pause-panel practice-menu-panel glass glass--panel' }, [
      el('h2', { class: 'kicker practice-menu-title', id: 'practice-menu-title', text: 'Practice Ground' }),
      el('div', { class: 'pause-menu' }, [this.changeBtn, this.cpuBtn, this.returnBtn]),
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

  // A roster dialog: its own instance of the shared fighter roster as one
  // large glass panel over the paused stage, under a header with Back (plus
  // any `actions` right beside it) and a Practice Ground heading. Ids come
  // from `titleId` and `previewId`, so both dialogs share the page.
  buildRosterDialog({ titleId, title, previewId, onConfirm, onBack, actions = [] }) {
    const back = el('button', {
      class: 'btn-back', type: 'button', 'data-nav': true,
      'aria-label': 'Back to practice menu', html: `${ICONS.back}<span>Back</span>`,
    });
    back.addEventListener('click', onBack);

    const dialog = el('div', { class: 'practice-roster-dialog glass' });
    const roster = new FighterRoster(this.app, { host: dialog, previewId, onConfirm });
    const heading = el('h2', { class: 'screen-title', id: titleId, text: title });
    dialog.replaceChildren(
      el('header', { class: 'screen-header practice-roster-head' }, [
        el('div', { class: 'practice-roster-actions' }, [back, ...actions]),
        el('div', { class: 'screen-heading' }, [
          el('span', { class: 'kicker', text: 'Practice Ground' }),
          heading,
        ]),
      ]),
      el('div', { class: 'screen-body char-layout practice-roster-body' }, [roster.rosterPanel, roster.previewPanel]),
    );

    const overlay = el('div', {
      class: 'overlay practice-roster-overlay', hidden: true,
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId,
    }, [dialog]);
    return { overlay, dialog, roster, back, heading, scope: { el: overlay, onBack } };
  }

  // Change Fighter: the shared fighter roster in a large glass dialog. Back
  // (the header button, Esc / Back) returns to the Practice menu.
  buildRoster() {
    const dialog = this.buildRosterDialog({
      titleId: 'practice-roster-title',
      title: 'Change Fighter',
      previewId: 'practice-preview-name',
      onConfirm: (def) => this.changeFighter(def),
      onBack: () => this.closeRoster(),
    });
    this.rosterOverlay = dialog.overlay;
    this.rosterDialog = dialog.dialog;
    this.roster = dialog.roster;
    this.rosterScope = dialog.scope;
  }

  // The CPU dialog: a second instance of the same roster and dialog, titled
  // Select CPU (Change CPU while there is one). Back (the header button,
  // Esc / Back) returns to the Practice menu; Disable CPU, beside Back and
  // only while there is a CPU, removes it.
  buildCpuRoster() {
    this.disableCpuBtn = el('button', {
      class: 'btn-back practice-cpu-disable', type: 'button', 'data-nav': true,
      text: 'Disable CPU', hidden: true, disabled: true,
    });
    this.disableCpuBtn.addEventListener('click', () => this.disableCpu());
    const dialog = this.buildRosterDialog({
      titleId: 'practice-cpu-roster-title',
      title: 'Select CPU',
      previewId: 'practice-cpu-preview-name',
      onConfirm: (def) => this.selectCpu(def),
      onBack: () => this.closeCpuRoster(),
      actions: [this.disableCpuBtn],
    });
    this.cpuRosterOverlay = dialog.overlay;
    this.cpuRosterOverlay.classList.add('practice-cpu-roster-overlay');
    this.cpuRosterDialog = dialog.dialog;
    this.cpuRoster = dialog.roster;
    this.cpuRosterBack = dialog.back;
    this.cpuRosterTitle = dialog.heading;
    this.cpuRosterScope = dialog.scope;
  }

  // ---- Lifecycle --------------------------------------------------------------

  async enter() {
    const app = this.app;
    // A fresh visit always starts from the default fighter and the default
    // CPU, whatever Quick Battle or an earlier visit used (a CPU disabled
    // then included).
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
    // The CPU is on from the start: the same fighter and the same sprite
    // set (one load for both), at the CPU spawn facing Player 1, paired
    // with it and framed with it.
    this.session.setCPU(def, sprites);
    this.hud.bind(this.session.player, this.session.cpu);
    this.hud.update(this.session);
    this.syncMenu();
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
    this.cpuSwapping = false;
    this.unsubKey?.();
    this.unsubKey = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.resizeObserver.disconnect();
    this.closeRoster({ silent: true });
    this.closeCpuRoster({ silent: true });
    this.hideMenu();
    this.app.input.setGameplayActive(false);
    this.touch.setEnabled(false);
    this.app.loading.hide();
    this.session?.destroy();
    this.session = null;
  }

  // Running: a session exists and neither the menu nor a fighter load holds it.
  get isRunning() {
    return !!this.session && !this.menuOpen && !this.loadingFighter;
  }

  // Either roster dialog (Change Fighter or CPU) is open over the menu.
  get dialogOpen() {
    return this.rosterOpen || this.cpuRosterOpen;
  }

  // Either dialog is loading the fighter it was given.
  get loadingFighter() {
    return this.swapping || this.cpuSwapping;
  }

  update(dt) {
    const session = this.session;
    if (!session) return;
    if (this.needsResize) {
      this.needsResize = false;
      if (session.resize() && !this.isRunning) session.render();
    }
    if (this.rosterOpen) this.roster.update(dt);
    if (this.cpuRosterOpen) this.cpuRoster.update(dt);
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
    } else if (this.menuOpen && !this.dialogOpen && e.code === 'KeyP') {
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
    if (this.dialogOpen || this.loadingFighter) return;
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

  // Back to practising, from the menu (never past a roster dialog).
  resume() {
    if (!this.menuOpen || this.dialogOpen || this.loadingFighter) return;
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

  // The menu's stateful label, from the session: Enable CPU / Change CPU.
  syncMenu() {
    this.cpuBtn.textContent = this.session?.cpu ? 'Change CPU' : 'Enable CPU';
  }

  // ---- Change Fighter ---------------------------------------------------------

  // Opens the roster over the frozen stage with the current fighter
  // selected and focused. The menu stays open, inert, beneath it.
  openRoster() {
    if (!this.menuOpen || this.dialogOpen) return;
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
  // on the spawn (0 Launch Point, no cooldowns; a CPU stays as it is),
  // rebinds the HUD, then closes the dialog and the menu and resumes. A
  // failed load keeps the current fighter and the dialog open.
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
    this.hud.bind(this.session.player, this.session.cpu);
    this.hud.update(this.session);
    this.closeRoster({ silent: true });
    this.resume();
  }

  // ---- Practice CPU -----------------------------------------------------------

  // Enable CPU / Change CPU: opens the CPU dialog over the frozen stage, the
  // current CPU (else the player's fighter) selected and focused, titled
  // Select CPU or Change CPU. Disable CPU shows only while there is a CPU.
  // The menu stays open, inert, beneath it.
  openCpuRoster() {
    if (!this.menuOpen || this.dialogOpen || !this.session) return;
    const cpu = this.session.cpu;
    this.cpuRosterOpen = true;
    this.cpuRosterTitle.textContent = cpu ? 'Change CPU' : 'Select CPU';
    this.disableCpuBtn.hidden = !cpu;
    this.disableCpuBtn.disabled = !cpu;
    this.el.classList.add('is-cpu-roster-open');
    this.menuOverlay.inert = true;
    this.hudRoot.inert = true;
    this.cpuRosterOverlay.hidden = false;
    this.cpuRoster.show(cpu?.def.id ?? this.characterId);
    this.app.nav.pushScope(this.cpuRosterScope);
    this.cpuRoster.focusSelected();
  }

  // Closes only the CPU dialog, back to the menu with focus on the CPU
  // button. `silent` leaves focus alone.
  closeCpuRoster({ silent = false } = {}) {
    if (!this.cpuRosterOpen) return;
    this.cpuRosterOpen = false;
    this.cpuRosterOverlay.hidden = true;
    this.el.classList.remove('is-cpu-roster-open');
    this.menuOverlay.inert = false;
    this.hudRoot.inert = false;
    this.app.nav.popScope(this.cpuRosterScope);
    if (!silent) this.cpuBtn.focus({ preventScroll: true });
  }

  // Puts `def` on the stage as the practice CPU (replacing any current one):
  // loads it like Change Fighter does, adds it at the CPU spawn, then closes
  // the dialog and the menu and resumes. The player's fighter is untouched.
  // A failed load keeps the current CPU (or none) and the dialog open.
  async selectCpu(def) {
    if (this.cpuSwapping || !this.session) return;
    const app = this.app;
    const token = this.token;
    this.cpuSwapping = true;
    app.loading.show(`Loading ${def.displayName}`);
    const sprites = await app.loadCharacter(def.id, (done, total) => app.loading.setProgress(done, total));
    if (token !== this.token || !this.session) return; // left Practice Ground meanwhile
    this.cpuSwapping = false;

    if (!sprites?.usable) {
      app.loading.showError(`${def.displayName}'s sprite frames could not be loaded. Check your connection and that the files in assets/characters/${def.id}/ exist.`, {
        nav: app.nav,
        onRetry: () => {
          app.resetCharacter(def.id);
          this.selectCpu(def);
        },
        onBack: () => this.cpuRoster.focusSelected(),
      });
      return;
    }
    app.loading.hide();

    this.session.setCPU(def, sprites);
    this.hud.bind(this.session.player, this.session.cpu);
    this.hud.update(this.session);
    this.syncMenu();
    this.closeCpuRoster({ silent: true });
    this.resume();
  }

  // Disable CPU: removes the CPU and everything aimed at it (and its HUD
  // card), closes the dialog and leaves practice frozen under the menu,
  // focus on Enable CPU. The still stage is redrawn without it.
  disableCpu() {
    if (!this.cpuRosterOpen || this.cpuSwapping || !this.session?.cpu) return;
    this.session.removeCPU();
    this.hud.bindCpu(null);
    this.syncMenu();
    this.closeCpuRoster();
    this.session.render();
  }
}
