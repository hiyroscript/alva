// BATTLE screen: hosts the canvas, HUD, touch controls, pause + result
// overlays, and drives the Battle simulation from the app loop.
//
// It runs both kinds of Battle: Quick Battle (Player 1 against the CPU, one
// fighter for both) and Watch Mode (params.mode 'watch': CPU 1 against
// CPU 2, a fighter each, one difficulty for both). Watch Mode is for
// watching only: no gameplay input and no touch controls, while pause,
// restart, rematch and Return to Home work as in Quick Battle.
//
// Every string is a translation key (js/localization/i18n.js); the touch controls
// use the player's saved scheme and custom layout (Home › Settings ›
// Controls), read afresh as each battle is entered, as is the player's
// Combat Assist (Home › Settings › Combat), which only Player 1's
// controller is given: Watch Mode has no player, so no fighter has it.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { t, tx, tattr, setText, joinList } from '../localization/i18n.js';
import { menuButton } from '../ui/components.js';
import { getPlayableCharacter } from '../data/characters.js';
import { getMap } from '../data/maps.js';
import { Battle } from '../game/battle.js';
import { HUD } from '../ui/hud.js';
import { TouchControls } from '../ui/touch-controls.js';

// Banner lines by state, as translation keys (with params).
const BANNERS = {
  round: { sub: ['banner.ready'], main: ['banner.round', { n: 1 }] },
  fight: { sub: null, main: ['banner.fight'] },
  time: { sub: ['banner.timeOver'], main: ['banner.time'] },
  ko: { sub: ['banner.void'], main: ['banner.ko'] },
  overtime: { sub: ['banner.pointsLevel'], main: ['banner.overtime'] },
};

// How long the OVERTIME banner shows once overtime starts (seconds of
// overtime's clock), then it gets out of the way of the fight.
const OVERTIME_BANNER_SECONDS = 1.4;

// Result dialog kicker and line keys for each way a match ends
// (Battle.result): the winning point from a fall, or on time by points, then
// by Launch Point, when the normal clock ran out or when Quick Battle's
// overtime did. The K.O. line names who fell ({loser}).
const RESULT_TEXT = {
  void: { kicker: 'result.kickerKo', sub: 'result.void' },
  points: { kicker: 'result.kickerTime', sub: 'result.points' },
  time: { kicker: 'result.kickerTime', sub: 'result.time' },
  overtimePoints: { kicker: 'result.kickerOvertime', sub: 'result.overtimePoints' },
  overtimeLaunchPoint: { kicker: 'result.kickerOvertime', sub: 'result.overtimeLaunchPoint' },
};

// How each mode names the two sides (side.<mode>.<p1|p2>.wins, the result
// title when a side wins, and .name, the side as it starts a sentence), and
// the pause dialog's kicker.
const MODE_TEXT = {
  'quick-battle': { kicker: 'setup.quickBattle', sides: 'side.quickBattle' },
  watch: { kicker: 'setup.watch', sides: 'side.watch' },
};

// One fighter's name, or two joined ("A and B"), in the interface language.
const fighterNames = (defs) => joinList(defs.map((d) => d.displayName));

export class BattleScreen extends Screen {
  constructor(app) {
    super(app, 'battle');
    this.navigable = false;

    this.canvas = el('canvas', { class: 'battle-canvas', ...tattr('aria-label', 'battle.canvas'), role: 'img' });
    this.hudRoot = el('div', { class: 'hud' });
    this.hud = new HUD(this.hudRoot, { onPause: () => this.pause() });
    this.touchRoot = el('div', { class: 'touch-controls' });
    this.touch = new TouchControls(this.touchRoot, app.input);

    this.bannerSub = el('span', { class: 'banner-sub' });
    this.bannerMain = el('span', { class: 'banner-main' });
    this.banner = el('div', { class: 'battle-banner', 'aria-live': 'assertive' }, [this.bannerSub, this.bannerMain]);
    this.bannerState = null;

    this.buildPause();
    this.buildResult();

    this.el.replaceChildren(
      this.canvas, this.hudRoot, this.touchRoot, this.banner,
      this.pauseOverlay, this.resultOverlay,
    );

    this.battle = null;
    // 'quick-battle' or 'watch', set as each battle is entered.
    this.mode = 'quick-battle';
    this.paused = false;
    this.needsResize = true;
    this.resizeObserver = new ResizeObserver(() => { this.needsResize = true; });
    this.resizeObserver.observe(this.el);

    this.onVisibility = () => {
      if (document.hidden && this.isRunning) this.pause();
    };
  }

  // ---- DOM builders ---------------------------------------------------------

  buildPause() {
    const resume = menuButton('pause.resume', { primary: true });
    const restart = menuButton('pause.restart', { outlineOnly: true });
    const home = menuButton('pause.home', { outlineOnly: true });
    resume.addEventListener('click', () => this.resume());
    restart.addEventListener('click', () => this.restart());
    home.addEventListener('click', () => this.confirmHome());

    this.pauseKicker = el('span', { class: 'kicker', ...tx(MODE_TEXT['quick-battle'].kicker) });
    this.pauseMenuView = el('div', { class: 'pause-view' }, [
      this.pauseKicker,
      el('h2', { class: 'pause-title', id: 'pause-title', ...tx('pause.title') }),
      el('div', { class: 'pause-menu' }, [resume, restart, home]),
    ]);

    this.pauseOverlay = el('div', {
      class: 'overlay pause-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title',
    }, [el('div', { class: 'pause-panel glass glass--panel' }, [this.pauseMenuView])]);

    this.pauseScope = {
      el: this.pauseOverlay,
      onBack: () => this.resume(),
      onStart: () => this.resume(),
    };
  }

  buildResult() {
    this.resultKicker = el('span', { class: 'kicker', ...tx('result.kickerTime') });
    this.resultTitle = el('h2', { class: 'result-title', id: 'result-title' });
    this.resultSub = el('p', { class: 'result-sub' });
    const rematch = menuButton('result.rematch', { primary: true });
    const stage = menuButton('result.changeStage');
    const home = menuButton('pause.home');
    rematch.addEventListener('click', () => this.rematch());
    stage.addEventListener('click', () => this.leave(() => this.app.screens.back()));
    home.addEventListener('click', () => this.leave(() => this.app.screens.go('home', {}, { reset: true })));
    this.resultOverlay = el('div', {
      class: 'overlay result-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'result-title',
    }, [el('div', { class: 'pause-panel result-panel glass glass--panel' }, [
      this.resultKicker, this.resultTitle, this.resultSub,
      el('div', { class: 'pause-menu' }, [rematch, stage, home]),
    ])]);
    this.resultScope = {
      el: this.resultOverlay,
      onBack: () => {},
      onStart: () => this.rematch(),
    };
  }

  // ---- Lifecycle --------------------------------------------------------------

  async enter(params) {
    const app = this.app;
    // Watch Mode reads its own selection (app.selection.watch), Quick Battle
    // the main one; params from the stage screen come first.
    const mode = params?.mode === 'watch' ? 'watch' : 'quick-battle';
    const watch = mode === 'watch';
    const selection = watch ? app.selection.watch : app.selection;
    const pick = (key) => params?.[key] || selection[key];
    // Only a playable fighter can take a side: a missing, unknown, deleted
    // or disabled id (from a stale selection or a direct route) is null.
    const p1Def = getPlayableCharacter(pick(watch ? 'cpu1CharacterId' : 'characterId'));
    // Quick Battle's CPU plays Player 1's fighter.
    const p2Def = watch ? getPlayableCharacter(pick('cpu2CharacterId')) : p1Def;
    if (!p1Def || !p2Def) {
      this.refuse();
      return;
    }
    const map = getMap(pick('mapId'));
    // The CPUs' level: the setup's selection, checked by Battle (an unknown
    // value is Medium).
    const difficulty = params?.difficulty ?? selection.difficulty;
    this.mode = mode;
    this.def = p1Def;
    this.p2Def = p2Def;
    this.map = map;
    this.difficulty = difficulty;
    setText(this.pauseKicker, MODE_TEXT[mode].kicker);
    this.canvas.setAttribute('aria-label', watch
      ? t('battle.watchCanvas', { p1: p1Def.displayName, p2: p2Def.displayName })
      : t('battle.canvas'));
    this.canvas.setAttribute('data-i18n-aria-label', '');
    // The touch layout the player chose (Home › Settings › Controls), its
    // custom placement and sizes, and Player 1's fighter for the buttons'
    // art and names, never the CPU's. A spectator has no touch controls at
    // all.
    this.touch.setScheme(app.settings.mobileControls);
    this.touch.setLayout(app.settings.touchLayout(this.touch.scheme));
    this.touch.setCharacter(watch ? null : p1Def);
    this.touchRoot.hidden = watch;
    this.el.classList.toggle('is-watch', watch);
    this.el.dataset.map = map.id;
    this.token = {};
    const token = this.token;

    // Each fighter once: a mirror match loads, and shares, one sprite set.
    const defs = [...new Map([p1Def, p2Def].map((d) => [d.id, d])).values()];
    app.loading.show(t('common.loadingName', { name: fighterNames(defs) }));
    const sprites = await this.loadFighters(defs);
    if (token !== this.token) return; // left the screen while loading

    const failed = defs.filter((d) => !sprites.get(d.id)?.usable);
    if (failed.length) {
      const names = failed.map((d) => d.displayName);
      const where = joinList(failed.map((d) => `assets/characters/${d.id}/`));
      app.loading.showError(t('common.spritesFailed', { names, where }), {
        nav: app.nav,
        onRetry: () => {
          for (const d of failed) app.resetCharacter(d.id);
          this.enter(params);
        },
        onBack: () => app.screens.back(),
      });
      return;
    }
    app.loading.hide();

    this.battle = new Battle({
      canvas: this.canvas,
      map,
      mode,
      p1Def,
      p2Def,
      p1Sprites: sprites.get(p1Def.id),
      p2Sprites: sprites.get(p2Def.id),
      input: app.input,
      reducedMotion: app.device.reducedMotion,
      difficulty,
      combatAssist: app.settings.combatAssist,
    });
    this.hud.bind(this.battle.p1, this.battle.p2);
    this.needsResize = true;
    this.paused = false;
    this.hidePause();
    this.hideResult();
    this.setBanner(null);

    this.unsubKey = app.input.onKey((e) => this.onKey(e));
    document.addEventListener('visibilitychange', this.onVisibility);
    document.activeElement?.blur?.();
    this.setPlayActive(true);
    this.el.classList.add('is-live');

    if (app.device.blockedPortrait) this.pause();
  }

  // A battle whose fighters are not all playable never starts: nothing is
  // loaded or built, and the loading overlay says so with a way Home.
  refuse() {
    const app = this.app;
    this.token = null;
    app.loading.showError(t('common.fighterUnavailableMessage'), {
      nav: app.nav,
      title: 'common.fighterUnavailable',
      onBack: () => app.screens.go('home', {}, { reset: true }),
    });
  }

  // Loads each of `defs` through the app's cache, reporting their combined
  // progress. Resolves to a Map of fighter id → SpriteSet.
  async loadFighters(defs) {
    const app = this.app;
    const progress = new Map();
    const report = () => {
      let done = 0;
      let total = 0;
      for (const [d, t] of progress.values()) {
        done += d;
        total += t;
      }
      app.loading.setProgress(done, total);
    };
    const sets = await Promise.all(defs.map((d) => app.loadCharacter(d.id, (done, total) => {
      progress.set(d.id, [done, total]);
      report();
    })));
    return new Map(defs.map((d, i) => [d.id, sets[i]]));
  }

  // Gameplay input and the touch controls follow play (on while it runs,
  // off while paused, over or gone), and only while someone plays: in Watch
  // Mode nobody controls a fighter, so they stay off throughout. Pause keys,
  // gamepad Start and the menus never depend on them.
  setPlayActive(on) {
    const playing = on && this.mode !== 'watch';
    this.app.input.setGameplayActive(playing);
    this.touch.setEnabled(playing);
  }

  exit() {
    this.token = null;
    this.unsubKey?.();
    this.unsubKey = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.setPlayActive(false);
    this.hidePause();
    this.hideResult();
    this.app.loading.hide();
    this.battle?.destroy();
    this.battle = null;
    this.el.classList.remove('is-live');
  }

  get isRunning() {
    return !!this.battle && !this.paused && this.battle.phase !== 'result';
  }

  update(dt) {
    const battle = this.battle;
    if (!battle) return;
    if (this.needsResize) {
      this.needsResize = false;
      // A new size or orientation moves the touch controls with the screen.
      this.touch.applyLayout();
      if (battle.resize() && !this.isRunning) battle.render();
    }
    if (!this.isRunning || this.app.device.blockedPortrait) return;
    battle.frame(dt);
    this.touch.setAirborne(!!battle.primary && !battle.primary.grounded);
    this.hud.update(battle);
    // Handled after the frame rather than from inside the simulation step, so
    // a draw can restart the battle safely.
    if (battle.phase === 'result') {
      this.finishBattle();
      return;
    }
    this.updateBanner();
  }

  onDeviceChange() {
    this.needsResize = true;
    if (this.app.device.blockedPortrait && this.isRunning) this.pause();
  }

  onKey(e) {
    if (e.menuHandled || !this.battle || this.app.dialog.resolve) return;
    if (e.code === CONFIG.debug.overlayKey && !e.repeat) {
      this.battle.debug = !this.battle.debug;
      if (!this.isRunning) this.battle.render();
      return;
    }
    if (!CONFIG.bindings.pause.includes(e.code) || e.repeat) return;
    if (this.isRunning) {
      e.preventDefault();
      this.pause();
    } else if (this.paused && e.code === 'KeyP') {
      e.preventDefault();
      this.resume();
    }
    if (this.app.input.lastDevice === 'keyboard') this.app.device.noteKeyboard?.();
  }

  // Gamepad Start while running.
  onCommand(cmd) {
    if (cmd === 'start' && this.isRunning) {
      this.pause();
      return true;
    }
    return false;
  }

  // ---- Banner -------------------------------------------------------------------

  updateBanner() {
    const b = this.battle;
    let state = null;
    if (b.phase === 'intro') state = b.phaseTime < CONFIG.battle.introSeconds * 0.58 ? 'round' : 'fight';
    else if (b.phase === 'fight' && b.overtime && b.overtimeSeconds - b.timeLeft < OVERTIME_BANNER_SECONDS) state = 'overtime';
    else if (b.phase === 'fight' && b.phaseTime < 0.65 && b.timeLeft > 0) state = 'fight';
    else if (b.phase === 'timeup') state = 'time';
    else if (b.phase === 'ko') state = 'ko';
    this.setBanner(state);
  }

  setBanner(state) {
    if (state === this.bannerState) return;
    this.bannerState = state;
    const cfg = BANNERS[state];
    this.banner.classList.remove('is-shown');
    if (!cfg) return;
    this.bannerSub.textContent = cfg.sub ? t(...cfg.sub) : '';
    this.bannerMain.textContent = t(...cfg.main);
    this.banner.dataset.state = state;
    void this.banner.offsetWidth;
    this.banner.classList.add('is-shown');
  }

  // ---- Pause ------------------------------------------------------------------

  pause() {
    if (!this.battle || this.paused || this.battle.phase === 'result') return;
    this.paused = true;
    this.setPlayActive(false);
    this.el.classList.add('is-paused');
    this.pauseOverlay.hidden = false;
    this.app.nav.pushScope(this.pauseScope);
    this.pauseMenuView.querySelector('[data-nav-default]').focus({ preventScroll: true });
  }

  resume() {
    if (!this.paused) return;
    if (this.app.device.blockedPortrait) return; // stay paused until landscape
    this.hidePause();
    this.paused = false;
    this.setPlayActive(true);
    document.activeElement?.blur?.();
  }

  hidePause() {
    this.pauseOverlay.hidden = true;
    this.el.classList.remove('is-paused');
    this.app.nav.popScope(this.pauseScope);
  }

  restart() {
    if (!this.battle) return;
    this.battle.restart();
    this.touch.setAirborne(!!this.battle.primary && !this.battle.primary.grounded);
    this.hud.update(this.battle);
    this.setBanner(null);
    this.hideResult();
    this.paused = true; // resume() clears it
    this.resume();
  }

  async confirmHome() {
    const ok = await this.app.dialog.open({
      title: t('confirmHome.title'),
      message: t('confirmHome.message'),
      confirmLabel: t('confirmHome.confirm'),
      cancelLabel: t('confirmHome.cancel'),
      cancelOutlineOnly: true,
    });
    if (ok) this.leave(() => this.app.screens.go('home', {}, { reset: true }));
  }

  leave(go) {
    this.hidePause();
    this.hideResult();
    go();
  }

  // ---- Result -----------------------------------------------------------------

  // A draw opens no result dialog: once TIME (or K.O.) has played out, a
  // fresh battle starts through the usual restart path. A winner gets the
  // result menu.
  finishBattle() {
    if (this.battle.result.outcome === 'draw') this.restart();
    else this.showResult();
  }

  showResult() {
    const { outcome, reason = 'time' } = this.battle.result;
    const text = RESULT_TEXT[reason] ?? RESULT_TEXT.time;
    const sides = MODE_TEXT[this.mode].sides;
    const loser = outcome === 'p1' ? 'p2' : 'p1';
    setText(this.resultKicker, text.kicker);
    setText(this.resultTitle, `${sides}.${outcome}.wins`);
    setText(this.resultSub, text.sub, { loser: { t: `${sides}.${loser}.name` } });
    this.setBanner(null);
    this.setPlayActive(false);
    this.resultOverlay.hidden = false;
    this.app.nav.pushScope(this.resultScope);
    this.resultOverlay.querySelector('[data-nav-default]').focus({ preventScroll: true });
  }

  hideResult() {
    this.resultOverlay.hidden = true;
    this.app.nav.popScope(this.resultScope);
  }

  rematch() {
    this.hideResult();
    this.battle.restart();
    this.touch.setAirborne(!!this.battle.primary && !this.battle.primary.grounded);
    this.hud.update(this.battle);
    this.paused = false;
    this.setPlayActive(true);
    document.activeElement?.blur?.();
  }
}
