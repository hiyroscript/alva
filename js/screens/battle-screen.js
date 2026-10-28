// BATTLE screen: hosts the canvas, HUD, touch controls, the pause menu,
// the match's final announcement, its result toast and its Match Results
// dialog, and drives the Battle simulation from the app loop.
//
// It runs both kinds of Battle: Quick Battle (Player 1 against the CPU, a
// fighter each: characterId and cpuCharacterId, which may be the same one)
// and Watch Mode (params.mode 'watch': CPU 1 against CPU 2, a fighter each,
// one difficulty for both). Watch Mode is for watching only: no gameplay
// input and no touch controls, while pause, restart, rematch and Return to
// Home work as in Quick Battle.
//
// The end of a match stops nothing (see the lifecycle in js/game/battle.js).
// As the Battle decides it, the screen announces it once (VICTORY! or
// DEFEAT. for the player, VICTORY! for Watch Mode's winning team, GAME. for
// a draw), the world plays on behind it, and a toast at the bottom centre
// says who won (Team I, Team II, or nobody) with View match results beside
// it, for as long as the screen stays. The Match Results dialog it opens
// shows both teams, their fighters, the outcome and each side's match
// statistics, with Rematch, Change fighters, Change stage and Return to home
// screen; it does not pause the world. Three kinds of overlay are kept
// apart: the pause menu (and anything opened over it) freezes the world and
// has Settings and an X; the Match Results dialog leaves it running and has
// an X; the toast is never modal. Once the match is over, the pause controls
// (Esc, P, gamepad Start, the HUD's timer) open the Match Results instead.
//
// Every string is a translation key (js/localization/i18n.js); the touch controls
// use the player's saved scheme and custom layout (Home › Settings ›
// Controls), read afresh as each battle is entered, as is the player's
// Automatic turn-around (Home › Settings › Combat), which only Player 1's
// controller is given: Watch Mode has no player, so no fighter has it.

import { Screen } from '../core/screen-manager.js';
import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { t, tx, tattr, setText, joinList, slotLabel } from '../localization/i18n.js';
import { menuButton, dialogControls } from '../ui/components.js';
import { getPlayableCharacter } from '../data/characters.js';
import { getMap } from '../data/maps.js';
import { Battle } from '../game/battle.js';
import { STAT_KEYS } from '../game/match-stats.js';
import { HUD } from '../ui/hud.js';
import { AbilityHUD } from '../ui/ability-hud.js';
import { TouchControls } from '../ui/touch-controls.js';
import { paintPortrait, portraitSourceFacing } from '../ui/sprite-art.js';

// Banner lines by state, as translation keys (with params). The final ones
// announce the result: the player's VICTORY! or DEFEAT., a draw's GAME., and
// Watch Mode's VICTORY! over the winning team's name.
const BANNERS = {
  round: { sub: ['banner.ready'], main: ['banner.round', { n: 1 }] },
  fight: { sub: null, main: ['banner.fight'] },
  overtime: { sub: ['banner.pointsLevel'], main: ['banner.overtime'] },
  victory: { sub: null, main: ['banner.victory'], final: true },
  defeat: { sub: null, main: ['banner.defeat'], final: true },
  game: { sub: null, main: ['banner.game'], final: true },
  'victory.p1': { sub: ['banner.team.p1'], main: ['banner.victory'], final: true },
  'victory.p2': { sub: ['banner.team.p2'], main: ['banner.victory'], final: true },
};

// How long the OVERTIME banner shows once overtime starts (seconds of
// overtime's clock), then it gets out of the way of the fight.
const OVERTIME_BANNER_SECONDS = 1.4;

// How long the final announcement shows once the match is decided (seconds
// of the celebration's clock).
export const FINAL_BANNER_SECONDS = 2.4;

// The toast's line for each outcome.
const TOAST_TEXT = { p1: 'toast.p1Wins', p2: 'toast.p2Wins', draw: 'toast.draw' };

// The Match Results' line under its outcome for each way a match ends
// (Battle.result's reason), a draw's by when it ended.
const REASON_TEXT = {
  void: 'results.reason.void',
  points: 'results.reason.points',
  time: 'results.reason.time',
  overtimePoints: 'results.reason.overtimePoints',
  overtimeLaunchPoint: 'results.reason.overtimeLaunchPoint',
};
const DRAW_REASON_TEXT = { time: 'results.reason.drawTime', overtimeLaunchPoint: 'results.reason.drawOvertime' };

// The rows of the statistics table: every match statistic, then each
// side's Launch Point as the match ended.
const STAT_ROWS = Object.freeze([...STAT_KEYS, 'finalLaunchPoint']);

// Each mode's own Select Stage, where Change Stage goes, and its first
// fighter selection, where Change fighters goes.
const STAGE_SCREEN = { 'quick-battle': 'map', watch: 'watch-map' };
const FIGHTER_SCREEN = { 'quick-battle': 'character', watch: 'watch-cpu1' };

// The pause dialog's kicker, by mode.
const MODE_TEXT = {
  'quick-battle': { kicker: 'setup.quickBattle' },
  watch: { kicker: 'setup.watch' },
};

const SLOTS = ['p1', 'p2'];

// One fighter's name, or two joined ("A and B"), in the interface language.
const fighterNames = (defs) => joinList(defs.map((d) => d.displayName));

// A statistic as shown: a whole number.
export const formatStat = (value) => String(Math.round(Number(value) || 0));

// A match's length as m:ss.
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class BattleScreen extends Screen {
  constructor(app) {
    super(app, 'battle');
    this.navigable = false;

    this.canvas = el('canvas', { class: 'battle-canvas', ...tattr('aria-label', 'battle.canvas'), role: 'img' });
    this.hudRoot = el('div', { class: 'hud' });
    this.hud = new HUD(this.hudRoot, { onPause: () => this.pauseCommand() });
    this.touchRoot = el('div', { class: 'touch-controls' });
    this.touch = new TouchControls(this.touchRoot, app.input);
    // Player 1's moves in the corner, for keyboard and controller play
    // (never Watch Mode's: nobody plays there).
    this.abilityRoot = el('div');
    this.abilityHud = new AbilityHUD(this.abilityRoot, { input: app.input, settings: app.settings });

    this.bannerSub = el('span', { class: 'banner-sub' });
    this.bannerMain = el('span', { class: 'banner-main' });
    this.banner = el('div', { class: 'battle-banner', 'aria-live': 'assertive' }, [this.bannerSub, this.bannerMain]);
    this.bannerState = null;

    this.buildPause();
    this.buildToast();
    this.buildResults();

    this.el.replaceChildren(
      this.canvas, this.hudRoot, this.abilityRoot, this.touchRoot, this.banner, this.toast,
      this.pauseOverlay, this.resultsOverlay,
    );

    this.battle = null;
    // 'quick-battle' or 'watch', set as each battle is entered.
    this.mode = 'quick-battle';
    this.paused = false;
    // The match's end as this screen has shown it: the result it filled the
    // toast and the Match Results with (once per match), and whether the
    // Match Results are open.
    this.shownFinal = null;
    this.resultsOpen = false;
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

    // Settings and the X at the top right: the X resumes, like Resume.
    this.pauseControls = dialogControls({
      onSettings: () => this.openSettings(this.pauseControls.settings),
      onClose: () => this.resume(),
      closeLabel: 'dialog.closeResume',
    });
    this.pauseKicker = el('span', { class: 'kicker', ...tx(MODE_TEXT['quick-battle'].kicker) });
    this.pauseMenuView = el('div', { class: 'pause-view' }, [
      el('header', { class: 'pause-header' }, [
        el('div', { class: 'pause-heading' }, [
          this.pauseKicker,
          el('h2', { class: 'pause-title', id: 'pause-title', ...tx('pause.title') }),
        ]),
        this.pauseControls.root,
      ]),
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

  // The result toast: the outcome on the left, View match results (green)
  // on the right. A status message, never a dialog: only its own panel
  // takes a press, and it never takes focus by itself.
  buildToast() {
    this.toastText = el('p', { class: 'match-toast-text', id: 'match-toast-text' });
    this.toastButton = el('button', {
      class: 'btn btn--primary match-toast-action', type: 'button', 'aria-haspopup': 'dialog', ...tx('toast.view'),
    });
    this.toastButton.addEventListener('click', () => this.openResults());
    this.toast = el('div', { class: 'match-toast', role: 'status', 'aria-live': 'polite', hidden: true }, [
      el('div', { class: 'match-toast-panel glass' }, [this.toastText, this.toastButton]),
    ]);
  }

  // The Match Results dialog: its heading and X, the outcome line, both
  // teams (portrait, team, tag and fighter, Winner / Defeated / Draw), how
  // the match ended, the statistics table (Team I and Team II side by side,
  // the winner's column brought forward), then Rematch, Change fighters,
  // Change stage and Return to home screen.
  buildResults() {
    this.resultsControls = dialogControls({ onClose: () => this.closeResults(), closeLabel: 'results.close' });
    this.resultsLine = el('p', { class: 'results-line', id: 'results-line' });
    this.resultsMeta = el('ul', { class: 'results-meta' });
    this.resultsTeams = Object.fromEntries(SLOTS.map((slot) => [slot, teamCard(slot)]));

    this.statCells = {};
    const rows = STAT_ROWS.map((key) => {
      const cells = Object.fromEntries(SLOTS.map((slot) => [slot, el('td', { class: `results-cell results-col--${slot}` })]));
      this.statCells[key] = cells;
      return el('tr', { 'data-stat': key }, [el('th', { scope: 'row', class: 'results-stat', ...tx(`stats.${key}`) }), cells.p1, cells.p2]);
    });
    this.statHeads = Object.fromEntries(SLOTS.map((slot) => [slot, el('th', {
      scope: 'col', class: `results-cell results-col--${slot}`, ...tx(`team.${slot}`),
    })]));
    this.statsTable = el('table', { class: 'results-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', class: 'results-stat', ...tx('results.statistic') }), this.statHeads.p1, this.statHeads.p2])]),
      el('tbody', {}, rows),
    ]);

    const rematch = menuButton('result.rematch', { primary: true });
    const fighters = menuButton('results.changeFighters');
    const stage = menuButton('result.changeStage');
    const home = menuButton('results.home');
    rematch.addEventListener('click', () => this.rematch());
    fighters.addEventListener('click', () => this.leave(() => this.changeFighters()));
    stage.addEventListener('click', () => this.leave(() => this.changeStage()));
    home.addEventListener('click', () => this.leave(() => this.app.screens.go('home', {}, { reset: true })));
    this.resultsActions = [rematch, fighters, stage, home];

    this.resultsOverlay = el('div', {
      class: 'overlay results-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true',
      'aria-labelledby': 'results-title', 'aria-describedby': 'results-line',
    }, [el('div', { class: 'results-panel glass glass--panel' }, [
      el('header', { class: 'results-header' }, [
        el('h2', { class: 'results-title', id: 'results-title', ...tx('results.title') }),
        this.resultsControls.root,
      ]),
      el('div', { class: 'results-body' }, [
        this.resultsLine,
        el('div', { class: 'results-teams' }, [this.resultsTeams.p1.root, this.resultsTeams.p2.root]),
        this.resultsMeta,
        el('div', { class: 'results-table-wrap' }, [this.statsTable]),
      ]),
      el('div', { class: 'results-actions' }, this.resultsActions),
    ])]);
    // Back closes it; so does Start, which never starts anything here.
    this.resultsScope = {
      el: this.resultsOverlay,
      onBack: () => this.closeResults(),
      onStart: () => this.closeResults(),
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
    // Each side is checked on its own: neither ever stands in for the other.
    const p1Def = getPlayableCharacter(pick(watch ? 'cpu1CharacterId' : 'characterId'));
    const p2Def = getPlayableCharacter(pick(watch ? 'cpu2CharacterId' : 'cpuCharacterId'));
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
    // Nothing of an earlier battle shows while this one loads.
    this.abilityHud.clear();
    this.hideFinal();
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
      automaticTurnAround: app.settings.automaticTurnAround,
    });
    this.hud.bind(this.battle.p1, this.battle.p2);
    this.abilityHud.bind(watch ? null : this.battle.p1);
    this.needsResize = true;
    this.paused = false;
    this.hidePause();
    this.hideFinal();
    this.setBanner(null);

    this.unsubKey = app.input.onKey((e) => this.onKey(e));
    document.addEventListener('visibilitychange', this.onVisibility);
    document.activeElement?.blur?.();
    this.setPlayActive(true);
    this.syncAbilityHud();
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
  // the celebration after the match included; off while paused, while the
  // Match Results are open, or gone), and only while someone plays: in
  // Watch Mode nobody controls a fighter, so they stay off throughout.
  // Pause keys, gamepad Start and the menus never depend on them.
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
    this.hideFinal();
    this.app.loading.hide();
    this.abilityHud.clear();
    this.battle?.destroy();
    this.battle = null;
    this.el.classList.remove('is-live');
  }

  // The ability HUD follows Player 1 while a player plays (the celebration
  // after the match included; never in Watch Mode, never under the Match
  // Results); while it is on show (not on a touch screen, whose touch
  // controls are the interface) it, not the rings over the fighter, carries
  // Player 1's cooldowns.
  syncAbilityHud() {
    const battle = this.battle;
    const playing = !!battle && this.mode !== 'watch' && !this.resultsOpen;
    if (playing) this.abilityHud.show(battle.p1);
    else this.abilityHud.setVisible(false);
    if (battle) battle.hudCooldownsFor = this.abilityHud.showing && !this.app.device.touchUI ? battle.p1 : null;
  }

  // The world runs unless the player paused it: through the match and
  // through the celebration after it, the Match Results open or not.
  get isRunning() {
    return !!this.battle && !this.paused;
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
    this.touch.showStatus(battle.primary);
    this.hud.update(battle);
    // Handled after the frame rather than from inside the simulation step:
    // the match's end is shown once, on a settled step.
    if (battle.matchOver && this.shownFinal !== battle.final) this.showFinal();
    this.updateBanner();
  }

  onDeviceChange() {
    this.needsResize = true;
    if (this.app.device.blockedPortrait && this.isRunning) this.pause();
  }

  // Whether a dialog that is not this screen's own (Settings, a
  // confirmation) is open over it: then no key here pauses, resumes or
  // opens anything.
  get coveredByDialog() {
    return !!this.app.dialog?.resolve || !!this.app.settingsDialog?.isOpen;
  }

  onKey(e) {
    if (e.menuHandled || !this.battle || this.coveredByDialog) return;
    if (e.code === CONFIG.debug.overlayKey && !e.repeat) {
      this.battle.debug = !this.battle.debug;
      if (!this.isRunning) this.battle.render();
      return;
    }
    if (!CONFIG.bindings.pause.includes(e.code) || e.repeat) return;
    if (this.isRunning) {
      e.preventDefault();
      this.pauseCommand();
    } else if (this.paused && e.code === 'KeyP') {
      e.preventDefault();
      this.resume();
    }
    if (this.app.input.lastDevice === 'keyboard') this.app.device.noteKeyboard?.();
  }

  // Gamepad Start while running.
  onCommand(cmd) {
    if (cmd === 'start' && this.isRunning) {
      this.pauseCommand();
      return true;
    }
    return false;
  }

  // The player asked to pause (a pause key, gamepad Start, the HUD's
  // timer): during the match the pause menu; once it is over, the Match
  // Results (closing them again when they are open).
  pauseCommand() {
    const battle = this.battle;
    if (!battle) return;
    if (battle.matchOver && !this.paused) {
      if (this.resultsOpen) this.closeResults();
      else this.openResults();
      return;
    }
    this.pause();
  }

  // ---- Banner -------------------------------------------------------------------

  updateBanner() {
    const b = this.battle;
    let state = null;
    if (b.phase === 'intro') state = b.phaseTime < CONFIG.battle.introSeconds * 0.58 ? 'round' : 'fight';
    else if (b.matchOver) state = b.phaseTime < FINAL_BANNER_SECONDS ? this.finalBanner(b.final) : null;
    else if (b.phase === 'fight' && b.overtime && b.overtimeSeconds - b.timeLeft < OVERTIME_BANNER_SECONDS) state = 'overtime';
    else if (b.phase === 'fight' && b.phaseTime < 0.65 && b.timeLeft > 0) state = 'fight';
    this.setBanner(state);
  }

  // The final announcement for `final`: a draw is GAME.; in Quick Battle
  // the player's own VICTORY! or DEFEAT.; in Watch Mode, with no player,
  // VICTORY! for the winning team.
  finalBanner(final) {
    if (!final?.winner) return 'game';
    if (this.mode === 'watch') return `victory.${final.winner}`;
    return final.winner === 'p1' ? 'victory' : 'defeat';
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
    this.banner.classList.toggle('is-final', !!cfg.final);
    void this.banner.offsetWidth;
    this.banner.classList.add('is-shown');
  }

  // ---- Pause ------------------------------------------------------------------

  pause() {
    if (!this.battle || this.paused) return;
    this.paused = true;
    this.setPlayActive(false);
    this.el.classList.add('is-paused');
    this.pauseOverlay.hidden = false;
    this.app.nav.pushScope(this.pauseScope);
    this.pauseMenuView.querySelector('[data-nav-default]').focus({ preventScroll: true });
  }

  resume() {
    if (!this.paused || this.coveredByDialog) return;
    if (this.app.device.blockedPortrait) return; // stay paused until landscape
    this.hidePause();
    this.paused = false;
    // The Match Results, when they were open beneath the pause menu, keep
    // the player's controls off.
    this.setPlayActive(!this.resultsOpen);
    if (!this.resultsOpen) document.activeElement?.blur?.();
  }

  hidePause() {
    this.pauseOverlay.hidden = true;
    this.el.classList.remove('is-paused');
    this.app.nav.popScope(this.pauseScope);
  }

  // The app's one Settings dialog over the paused battle, which stays
  // paused beneath it: closing it comes back to the pause menu, focus on
  // `opener`.
  openSettings(opener) {
    this.app.settingsDialog?.open({ returnFocus: opener });
  }

  restart() {
    if (!this.battle) return;
    this.battle.restart();
    this.touch.setAirborne(!!this.battle.primary && !this.battle.primary.grounded);
    this.touch.showStatus(this.battle.primary);
    this.hud.update(this.battle);
    this.setBanner(null);
    this.hideFinal();
    this.syncAbilityHud();
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
      onSettings: (opener) => this.openSettings(opener),
    });
    if (ok) this.leave(() => this.app.screens.go('home', {}, { reset: true }));
  }

  // Leaves the battle for `go`'s screen: every overlay of this one closed
  // first (the screen's exit then ends the Battle itself).
  leave(go) {
    this.hidePause();
    this.hideFinal();
    go();
  }

  // ---- The match's end -----------------------------------------------------------

  // Once per match, as the Battle decides it: the toast and the Match
  // Results filled from its final result, and the toast shown (the
  // announcement is the banner's, see updateBanner).
  showFinal() {
    const final = this.battle.final;
    this.shownFinal = final;
    this.fillResults(final);
    setText(this.toastText, TOAST_TEXT[final.winner ?? 'draw']);
    this.toast.hidden = this.resultsOpen;
  }

  // Everything of a match's end goes: the toast, the Match Results, the
  // final announcement (a new match, or leaving the screen).
  hideFinal() {
    this.hideResults();
    this.shownFinal = null;
    this.toast.hidden = true;
    if (this.banner.classList.contains('is-final')) this.setBanner(null);
  }

  // Opens the Match Results over the running world (nothing pauses), the
  // toast making way for it; the player's controls go off while it is
  // open, so no key or touch meant for it moves the fighter.
  openResults() {
    if (!this.battle?.matchOver || this.resultsOpen || this.paused) return;
    if (this.shownFinal !== this.battle.final) this.showFinal();
    this.resultsOpen = true;
    this.toast.hidden = true;
    this.setPlayActive(false);
    this.syncAbilityHud();
    this.resultsOverlay.hidden = false;
    this.app.nav.pushScope(this.resultsScope);
    this.resultsOverlay.querySelector('[data-nav-default]').focus({ preventScroll: true });
  }

  // Closes the Match Results back to the celebration: the toast again, the
  // player's controls back, focus off every control (a key that closed it
  // is never a move, and no later key presses a button).
  closeResults() {
    if (!this.resultsOpen) return;
    this.hideResults();
    this.toast.hidden = !this.shownFinal;
    this.setPlayActive(!this.paused);
    this.syncAbilityHud();
    document.activeElement?.blur?.();
  }

  hideResults() {
    this.resultsOpen = false;
    this.resultsOverlay.hidden = true;
    this.app.nav.popScope(this.resultsScope);
  }

  // The Match Results for `final`: its outcome line (Team I — Winner and
  // Team II — Defeated, or Draw — No winner), each team's card, how the
  // match ended, and the statistics, each side's column, the winner's
  // brought forward.
  fillResults(final) {
    const battle = this.battle;
    const winner = final.winner;
    const lines = winner
      ? [[`results.line.${winner}.winner`, 'is-winner'], [`results.line.${other(winner)}.defeated`, 'is-defeated']]
      : [['results.line.draw', 'is-draw']];
    this.resultsLine.replaceChildren(...lines.map(([key, cls]) => el('span', { class: `results-line-part ${cls}`, ...tx(key) })));
    this.resultsOverlay.dataset.outcome = winner ?? 'draw';
    for (const slot of SLOTS) {
      const fighter = battle[slot];
      const card = this.resultsTeams[slot];
      const status = !winner ? 'draw' : winner === slot ? 'winner' : 'defeated';
      card.root.dataset.status = status;
      card.root.classList.toggle('is-winner', winner === slot);
      card.fighter.textContent = fighter.def.displayName;
      card.tag.textContent = slotLabel(fighter.label);
      setText(card.status, `results.${status}`);
      card.portrait.classList.toggle('is-mirrored', portraitSourceFacing(fighter.def) !== (slot === 'p1' ? 1 : -1));
      card.root.classList.toggle('has-portrait', paintPortrait(card.portrait, fighter.sprites));
      this.statHeads[slot].classList.toggle('is-winner', winner === slot);
    }
    const stats = final.stats;
    for (const key of STAT_ROWS) {
      for (const slot of SLOTS) {
        const value = key === 'finalLaunchPoint' ? final.launchPoints[slot] : stats?.[slot]?.[key];
        const cell = this.statCells[key][slot];
        cell.textContent = formatStat(value);
        cell.classList.toggle('is-winner', winner === slot);
      }
    }
    const reason = winner ? REASON_TEXT[final.reason] : DRAW_REASON_TEXT[final.reason];
    const meta = [
      el('li', { ...tx(reason ?? 'results.reason.time') }),
      el('li', { ...tx('results.length', { time: formatDuration(final.seconds) }) }),
      final.overtime ? el('li', { ...tx('results.overtimePlayed') }) : null,
    ];
    this.resultsMeta.replaceChildren(...meta.filter(Boolean));
  }

  // Change Stage: the mode's own Select Stage, every other choice kept. It
  // is the screen just behind the Battle when the match was started there
  // (Custom Play, Watch Mode); Regular Play starts from Select Fighter, so
  // its Select Stage takes the Battle's place, Back from it returning to
  // Select Fighter.
  changeStage() {
    const screens = this.app.screens;
    const target = STAGE_SCREEN[this.mode];
    if (screens.stack.at(-1) === target) screens.back();
    else screens.go(target, {}, { replace: true });
  }

  // Change fighters: back to the mode's first fighter selection, the setup
  // going on from there as it does (Quick Battle's Select Fighter, then its
  // Regular Play draw or Custom Play's Select CPU and Select Stage; Watch
  // Mode's Select CPU 1, then CPU 2 and its stage), the mode and difficulty
  // kept.
  changeFighters() {
    this.app.screens.backTo(FIGHTER_SCREEN[this.mode]);
  }

  // A fresh match on the same settings: the Battle starts over (its intro
  // first), and everything of the last match's end goes.
  rematch() {
    if (!this.battle) return;
    this.hideFinal();
    this.battle.restart();
    this.touch.setAirborne(!!this.battle.primary && !this.battle.primary.grounded);
    this.touch.showStatus(this.battle.primary);
    this.hud.update(this.battle);
    this.setBanner(null);
    this.syncAbilityHud();
    this.paused = false;
    this.setPlayActive(true);
    document.activeElement?.blur?.();
  }
}

const other = (slot) => (slot === 'p1' ? 'p2' : 'p1');

// A team's card in the Match Results: its fighter's portrait (facing the
// middle), the team's name, the side's tag (P1, CPU, CPU 1, CPU 2) and its
// fighter's name, and its status (Winner, Defeated, Draw).
function teamCard(slot) {
  const portrait = el('canvas', { class: 'results-portrait', width: 1, height: 1, 'aria-hidden': 'true' });
  const tag = el('span', { class: 'results-team-tag' });
  const fighter = el('span', { class: 'results-team-fighter' });
  const status = el('span', { class: 'results-team-status' });
  const root = el('div', { class: `results-team results-team--${slot}`, 'data-team': slot }, [
    portrait,
    el('div', { class: 'results-team-text' }, [
      el('span', { class: 'results-team-name', ...tx(`team.${slot}`) }),
      el('span', { class: 'results-team-who' }, [tag, fighter]),
      status,
    ]),
  ]);
  return { root, portrait, tag, fighter, status };
}
