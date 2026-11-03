// ONLINE BATTLE: an online match, the Battle screen (js/screens/battle-
// screen.js) with Online Play's rules on top. It is the normal Quick Battle
// match: the same clock, overtime, points, Void, HUD, announcement, toast
// and Match Results. What differs:
//
//   - Both browsers run the same Battle (mode 'online'), stepped by the
//     lockstep (js/online/lockstep.js) over the peer link the room set up,
//     from the start the room sent (js/online/match-setup.js: the seed, the
//     stage drawn from it, both fighters, each player's name and Automatic
//     turn-around). The local player plays with their usual devices
//     (keyboard, touch controls or any controller) on their own side: the
//     host is p1 (left, red), the guest p2 (right, blue), each shown on
//     their own side by name. The drawn stage shows over the intro.
//   - There is no pause. Options / Menu, Esc, P and the HUD's pause open a
//     small menu with only Leave match, and the world goes on beneath it
//     (the player's own fighter plays nothing meanwhile). Leaving is a
//     forfeit: the other player sees "Your opponent left." Once the match
//     is over the same controls open the Match Results, as offline.
//   - An opponent who stops answering: "Waiting for opponent…" for up to
//     CONFIG.online.disconnectGraceMs, then "Connection lost". A desync:
//     "Connection problem (desync)". Either way both go back to the room
//     (or the lobby, if the room is gone).
//   - The Match Results offer Rematch (both must accept: the host's browser
//     then starts the next match on a new random stage) and Leave room.
//   - A hidden page or a phone held upright never stops the world: the
//     other player's match would wait on it (the rotate prompt still
//     covers the screen).

import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { t, tx, setText, setAttr } from '../localization/i18n.js';
import { menuButton, dialogControls } from '../ui/components.js';
import { Battle } from '../game/battle.js';
import { BattleScreen } from './battle-screen.js';
import { LockstepSession, otherSlot } from '../online/lockstep.js';
import { readStart } from '../online/match-setup.js';
import { showNotice } from './online-screens.js';

const SLOTS = ['p1', 'p2'];

export class OnlineBattleScreen extends BattleScreen {
  constructor(app) {
    super(app, 'online-battle');
    this.mode = 'online';
    this.lockstep = null;
    this.setup = null;
    this.localSlot = 'p1';
    this.menuOpen = false;
    this.ending = false;
    this.unsubLockstep = null;
    // The lockstep's clock for its waits (milliseconds; the page's own by
    // default, a test's fake one).
    this.lockstepClock = null;
    this.buildMenu();
    this.buildOnlineChrome();
    this.buildOnlineResults();
  }

  get session() {
    return this.app.online;
  }

  // ---- DOM ----------------------------------------------------------------------------

  // The match menu: Leave match and nothing else; the world runs on.
  buildMenu() {
    const leave = menuButton('online.menu.leave', { primary: true });
    leave.addEventListener('click', () => this.leaveMatch());
    this.menuControls = dialogControls({ onClose: () => this.closeMenu(), closeLabel: 'common.close' });
    this.menuOverlay = el('div', {
      class: 'overlay pause-overlay online-menu-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true',
      'aria-labelledby': this.domId('menu-title'), 'aria-describedby': this.domId('menu-note'),
    }, [el('div', { class: 'pause-panel glass glass--panel' }, [
      el('div', { class: 'pause-view' }, [
        el('header', { class: 'pause-header' }, [
          el('div', { class: 'pause-heading' }, [
            el('span', { class: 'kicker', ...tx('setup.onlineQuickBattle') }),
            el('h2', { class: 'pause-title', id: this.domId('menu-title'), ...tx('online.menu.title') }),
          ]),
          this.menuControls.root,
        ]),
        el('p', { class: 'connection-message online-menu-note', id: this.domId('menu-note'), ...tx('online.menu.note') }),
        el('div', { class: 'pause-menu' }, [leave]),
      ]),
    ])]);
    this.menuScope = { el: this.menuOverlay, onBack: () => this.closeMenu(), onStart: () => this.closeMenu() };
    this.el.append(this.menuOverlay);
  }

  // "Waiting for opponent…", and the drawn stage over the intro.
  buildOnlineChrome() {
    this.waitingNote = el('div', { class: 'online-waiting glass', role: 'status', 'aria-live': 'polite', hidden: true, ...tx('online.waiting') });
    this.revealName = el('span', { class: 'online-reveal-name' });
    this.reveal = el('div', { class: 'online-reveal glass', hidden: true, 'aria-live': 'polite' }, [
      el('span', { class: 'kicker', ...tx('online.stageReveal') }),
      this.revealName,
    ]);
    this.el.append(this.waitingNote, this.reveal);
  }

  // The Match Results' actions online: Rematch and Leave room, and a line
  // saying where a rematch stands.
  buildOnlineResults() {
    this.rematchButton = menuButton('result.rematch', { primary: true });
    this.leaveRoomButton = menuButton('online.room.leave');
    this.rematchButton.addEventListener('click', () => this.askRematch());
    this.leaveRoomButton.addEventListener('click', () => this.leaveRoom());
    this.rematchStatus = el('p', { class: 'online-rematch-status', role: 'status', 'aria-live': 'polite' });
    this.resultsOverlay.querySelector('.results-actions').replaceChildren(this.rematchButton, this.leaveRoomButton);
    this.resultsOverlay.querySelector('.results-body').append(this.rematchStatus);
    this.resultsActions = [this.rematchButton, this.leaveRoomButton];
  }

  // ---- What differs from the Battle screen --------------------------------------------

  get playerFighter() {
    return this.battle?.[this.localSlot] ?? null;
  }

  // Never held: the other player's match would wait.
  get holdsForPortrait() {
    return false;
  }

  // There is no pause online (a hidden page, a blocked portrait, a lost
  // focus: the world runs on).
  pause() {}

  resume() {}

  restart() {}

  // Options / Menu, Esc, P, the HUD's pause: the match menu during the
  // match, the Match Results once it is over.
  pauseCommand() {
    const battle = this.battle;
    if (!battle) return;
    if (battle.matchOver) {
      if (this.menuOpen) this.closeMenu();
      if (this.resultsOpen) this.closeResults();
      else this.openResults();
      return;
    }
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }

  get coveredByDialog() {
    return !!this.app.dialog?.resolve;
  }

  // The player's own controls (and their touch controls) follow play; while
  // they are off (the menu, the Match Results) their frames are neutral.
  setPlayActive(on) {
    this.app.input.setGameplayActive(on);
    this.touch.setEnabled(on);
    if (this.lockstep) this.lockstep.muted = !on;
  }

  // The player's own move HUD only, on their own fighter.
  syncAbilityHud() {
    const battle = this.battle;
    const own = this.playerFighter;
    const playing = !!battle && !!own && !this.resultsOpen && !this.menuOpen;
    if (playing) this.abilityHud.show(own);
    else this.abilityHud.setVisible(false);
    this.abilityHud2.setVisible(false);
    if (battle) battle.hudCooldownsFor = this.abilityHud.showing && !this.app.device.touchUI ? own : null;
  }

  // The announcement from this player's side: VICTORY! or DEFEAT., GAME. for
  // a draw.
  finalBanner(final) {
    if (!final?.winner) return 'game';
    return final.winner === this.localSlot ? 'victory' : 'defeat';
  }

  showFinal() {
    super.showFinal();
    const final = this.battle.final;
    const labels = this.setup?.labels ?? {};
    if (!final.winner) setText(this.toastText, 'toast.draw');
    else if (final.winner === this.localSlot) setText(this.toastText, 'online.toast.win');
    else setText(this.toastText, 'online.toast.lose', { name: labels[final.winner] ?? '' });
    this.syncRematch();
  }

  // Each side is its player, by name.
  fillResults(final) {
    super.fillResults(final);
    const labels = this.setup?.labels ?? {};
    const winner = final.winner;
    for (const slot of SLOTS) {
      for (const node of [this.resultsTeams[slot].name, this.statHeads[slot]]) {
        node.textContent = labels[slot] ?? '';
        node.setAttribute('data-i18n', '');
      }
    }
    const line = winner
      ? [['results.line.online.winner', labels[winner], 'is-winner'], ['results.line.online.defeated', labels[otherSlot(winner)], 'is-defeated']]
      : [['results.line.draw', null, 'is-draw']];
    this.resultsLine.replaceChildren(...line.map(([key, name, cls]) => el('span', {
      class: `results-line-part ${cls}`, ...tx(key, name === null ? undefined : { name }),
    })));
  }

  openResults() {
    super.openResults();
    this.syncRematch();
  }

  // ---- The match --------------------------------------------------------------------

  async enter(params) {
    const app = this.app;
    const session = this.session;
    const start = params?.start ?? session?.start;
    const setup = readStart(start);
    const transport = session?.peer?.transport;
    this.ending = false;
    if (!session?.inRoom || !setup || !transport?.open) {
      this.token = null;
      await this.endOnline(!setup ? 'fighter' : 'peer');
      return;
    }
    this.teardownMatch();
    this.setup = setup;
    this.localSlot = session.localSlot;
    this.def = setup.p1Def;
    this.p2Def = setup.p2Def;
    this.map = setup.map;
    const own = this.localSlot === 'p2' ? setup.p2Def : setup.p1Def;
    setAttr(this.canvas, 'aria-label', 'battle.onlineCanvas', { p1: setup.labels.p1, p2: setup.labels.p2 });
    this.touch.setScheme(app.settings.mobileControls);
    this.touch.setLayout(app.settings.touchLayout(this.touch.scheme));
    this.touch.setCharacter(own);
    this.touchRoot.hidden = false;
    this.el.classList.toggle('is-watch', false);
    this.el.classList.toggle('is-local', false);
    this.el.classList.add('is-online');
    this.el.dataset.map = setup.map.id;
    this.el.dataset.player = this.localSlot;
    this.hud.setNames(setup.labels);
    this.abilityHud.setPlayer(null);
    app.input.setMenuOwner?.('p1');
    this.abilityHud.clear();
    this.abilityHud2.clear();
    this.hideConnection();
    this.hideFinal();
    this.closeMenu();
    this.showWaiting(false);
    this.revealName.textContent = t(`map.${setup.map.id}.name`);
    this.reveal.hidden = false;
    this.token = {};
    const token = this.token;

    const defs = [...new Map([setup.p1Def, setup.p2Def].map((d) => [d.id, d])).values()];
    app.loading.show(t('common.loadingName', { name: defs.map((d) => d.displayName).join(' · ') }));
    const sprites = await this.loadFighters(defs);
    if (token !== this.token) return;
    app.loading.hide();
    if (defs.some((d) => !sprites.get(d.id)?.usable)) {
      await this.endOnline('fighter');
      return;
    }

    this.lockstep = new LockstepSession({
      transport,
      localSlot: this.localSlot,
      match: setup.match,
      // The delay the host's browser chose for this match, the same on both.
      delay: setup.delay,
      sampleLocal: (context) => app.input.sample(context),
      flushLocal: () => app.input.flush(),
      // Through the room server: packets spaced to stay in its free plan.
      sendIntervalMs: CONFIG.online.sendIntervalMs,
      debug: !!app.config?.debug?.online,
      ...(this.lockstepClock ? { clock: this.lockstepClock } : {}),
    });
    this.battle = new Battle({
      canvas: this.canvas,
      map: setup.map,
      mode: 'online',
      p1Def: setup.p1Def,
      p2Def: setup.p2Def,
      p1Sprites: sprites.get(setup.p1Def.id),
      p2Sprites: sprites.get(setup.p2Def.id),
      input: this.lockstep.input,
      reducedMotion: app.device.reducedMotion,
      seed: setup.seed,
      automaticTurnAround: setup.automaticTurnAround,
      labels: setup.labels,
    });
    this.lockstep.attach(this.battle);
    this.unsubLockstep = this.lockstep.on((type, detail) => this.onLockstep(type, detail));
    this.hud.bind(this.battle.p1, this.battle.p2);
    this.abilityHud.bind(this.playerFighter);
    this.abilityHud2.bind(null);
    this.needsResize = true;
    this.paused = false;
    this.hidePause();
    this.setBanner(null);
    this.unsubKey?.();
    this.unsubKey = app.input.onKey((e) => this.onKey(e));
    globalThis.document?.activeElement?.blur?.();
    this.setPlayActive(true);
    this.syncAbilityHud();
    this.el.classList.add('is-live');
  }

  update(dt) {
    super.update(dt);
    // The drawn stage shows through the intro.
    if (!this.reveal.hidden && this.battle && this.battle.phase !== 'intro') this.reveal.hidden = true;
  }

  // The lockstep's news.
  onLockstep(type, detail) {
    if (type === 'waiting') this.showWaiting(true);
    else if (type === 'resumed') this.showWaiting(false);
    else if (type === 'end') {
      this.showWaiting(false);
      const reason = detail?.reason;
      if (reason === 'left') {
        this.battle?.forfeit(otherSlot(this.localSlot));
        this.endOnline('left');
      } else if (reason === 'timeout' || reason === 'desync') this.endOnline(reason);
    }
  }

  showWaiting(on) {
    this.waitingNote.hidden = !on;
  }

  // The room's news, while this screen shows (see routeOnlineEvents).
  onOnline(type, detail) {
    if (type === 'closed') {
      this.lockstep?.leave();
      this.endOnline(detail?.reason ?? 'lost', { toLobby: true });
      return true;
    }
    if (type === 'start') {
      if (detail?.match !== this.setup?.match) this.enter({ start: detail });
      return true;
    }
    if (type === 'room') {
      // The other player left the room: the match is over for both.
      if (this.battle && !this.ending && !this.session.opponent) {
        this.lockstep?.end('left');
        this.battle.forfeit(otherSlot(this.localSlot));
        this.endOnline('left');
      } else this.syncRematch();
      return true;
    }
    return type === 'rematch' || type === 'peer';
  }

  // Where a rematch stands, under the Match Results.
  syncRematch() {
    const me = this.session?.me;
    const opponent = this.session?.opponent;
    const asked = !!me?.rematch;
    this.rematchButton.disabled = asked;
    if (asked) setText(this.rematchStatus, 'online.rematch.waiting');
    else if (opponent?.rematch) setText(this.rematchStatus, 'online.rematch.asked');
    else this.rematchStatus.textContent = '';
  }

  askRematch() {
    if (!this.battle?.matchOver) return;
    if (this.session?.me) this.session.me.rematch = true;
    this.session.requestRematch();
    this.syncRematch();
  }

  // ---- Leaving ------------------------------------------------------------------------

  openMenu() {
    if (this.menuOpen || !this.battle) return;
    this.menuOpen = true;
    this.menuOverlay.hidden = false;
    this.setPlayActive(false);
    this.syncAbilityHud();
    this.app.nav.pushScope(this.menuScope);
    this.menuOverlay.querySelector('[data-nav-default]')?.focus({ preventScroll: true });
  }

  closeMenu() {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.menuOverlay.hidden = true;
    this.app.nav.popScope(this.menuScope);
    if (this.battle && !this.resultsOpen) this.setPlayActive(true);
    this.syncAbilityHud();
    globalThis.document?.activeElement?.blur?.();
  }

  // Leave match: a forfeit. The other player is told, the room is a room
  // again, and this player goes back to it.
  leaveMatch() {
    if (!this.battle || this.ending) return;
    this.ending = true;
    this.lockstep?.leave();
    this.battle.forfeit(this.localSlot);
    this.closeMenu();
    this.session?.endMatch();
    this.backToRoom();
  }

  // Leave room (the Match Results): the room is left for the lobby.
  leaveRoom() {
    this.ending = true;
    this.lockstep?.leave();
    this.session?.leaveRoom();
    this.leave(() => this.app.screens.backTo('online-lobby'));
  }

  // The match ends here for `code` (the other player left, a lost
  // connection, a desync, a fighter this build cannot play): the player is
  // told, then back to the room, or the lobby once the room is gone.
  async endOnline(code, { toLobby = false } = {}) {
    if (this.ending && code !== 'fighter' && code !== 'peer') return;
    this.ending = true;
    this.closeMenu();
    this.setPlayActive(false);
    if (!toLobby) this.session?.endMatch();
    await showNotice(this.app, code);
    if (this.app.screens.current !== this) return;
    if (toLobby || !this.session?.inRoom) this.leave(() => this.app.screens.backTo('online-lobby'));
    else this.backToRoom();
  }

  backToRoom() {
    this.leave(() => {
      if (this.session?.inRoom) this.app.screens.backTo('online-room');
      else this.app.screens.backTo('online-lobby');
    });
  }

  // The match's own pieces, let go (the peer link stays: the room owns it).
  teardownMatch() {
    this.unsubLockstep?.();
    this.unsubLockstep = null;
    this.lockstep?.dispose();
    this.lockstep = null;
    this.battle?.destroy?.();
    this.battle = null;
    this.hideFinal();
  }

  exit() {
    // Leaving the screen any other way (Home, going offline) is leaving
    // the match.
    if (this.lockstep?.running) this.lockstep.leave();
    this.closeMenu();
    this.showWaiting(false);
    this.reveal.hidden = true;
    this.unsubLockstep?.();
    this.unsubLockstep = null;
    this.lockstep?.dispose();
    this.lockstep = null;
    super.exit();
    this.el.classList.remove('is-online');
  }
}

