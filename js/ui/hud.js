// Battle HUD (DOM). Only touches the DOM when a displayed value changes.
// The merged timer + pause control reports presses through `onPause`; the
// battle screen owns what pausing means. Practice Ground's HUD (PracticeHUD,
// below) reuses the same fighter card with a More button instead.
//
// Each fighter has one compact, semi-transparent glass card, close in on
// either side of the centre control, with its score dots beneath:
//
//   [portrait] | P1 #0001     [ timer ]     #0001 CPU | [portrait]
//              | 37           [ pause ]            12 |
//        ● ○ ○                                    ○ ○ ○
//
// the character's own portrait crop (visual.portrait), turned to face the
// centre whichever way its art was drawn, one thin divider, then its slot
// tag and name over its Launch Point (a plain number: no bar, maximum or
// % sign; named for screen readers). The tag is the fighter's own label:
// P1 and CPU in Quick Battle, CPU 1 and CPU 2 in Watch Mode, P1 and P2 in
// Local Play (where each card carries its player's colour: the battle
// screen's is-local, css/battle.css). Under it, in a
// Battle only, one dot per point the match is played to
// (CONFIG.battle.pointsToWin), filled for each point the fighter has scored.
// The right-hand card mirrors the left-hand one. In a Battle each card and
// its dots are one group named for its team (Team I, Team II). Energy and the summon and
// technique cooldowns are drawn over the fighter itself
// (js/game/rendering/fighter-status.js); the card only describes Energy to screen
// readers.
//
// Every label and spoken description is translated (js/localization/i18n.js): the
// slot tags too (P1 reads J1 in French), while the tag the fighter carries
// stays the same internally.
//
// The Launch Point number also shows how it is changing (the launch &
// energy update), paint only, the same for every card (P1, P2, a CPU, Local
// Play, Watch Mode, Online Play, Practice Ground):
//
//   - it glows green for a moment (is-healing, css/battle.css) every time it
//     really comes down while its fighter stays in play: a recovery tick, a
//     perfect Shield, a heal, a charm or a fear's feed. Its fighter's
//     CombatState counts those (launchPointHeals); a respawn, a restart, a
//     rematch or a Practice Ground reset or swap gives the fighter a fresh
//     state, which the card only syncs with, so a reset never glows.
//   - it burns (is-burning, then is-inferno) while it is high enough that
//     the next solid hit can launch the fighter hard: LAUNCH_POINT_FIRE and
//     LAUNCH_POINT_INFERNO, each with its own lower threshold to go out
//     (hysteresis), so it never flickers around one. It goes out at once on
//     a fresh state.

import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { t, tattr, plural, slotLabel, setAttr, setPlainAttr } from '../localization/i18n.js';
import { ICONS } from './icons.js';
import { paintPortrait, portraitSourceFacing } from './sprite-art.js';
import { PLAYER_NAMES } from './local-play.js';

// Spoken names of the slot tags, for the score dots' labels: Player 1 and
// Player 2 in full, the others as shown.
const SPOKEN = Object.freeze({ P1: 'hud.player1', P2: 'hud.player2' });
const spokenSlot = (tag) => (SPOKEN[tag] ? t(SPOKEN[tag]) : slotLabel(tag));

// The Launch Point on show: whole numbers, with no % sign.
export function formatLaunchPoint(value) {
  return String(Math.round(value));
}

// The Launch Point at which the number catches fire, and the one below which
// it goes out again. Derived by simulation (tests/benchmarks/
// launch-thresholds.mjs, re-run it whenever the stages, the Void or
// launches change) against the Void update's geometry: every main stage
// 1400 long, the Void 468 past each ledge, 1040 above and 400 below
// (regular time: overtime's closing Void is deadlier than the fire says),
// launches at LAUNCH_UNIT_SPEED 7. Each case is one solid 3-damage hit on
// a fighter in the air at a jump's height that does nothing to get back,
// lethal when it is in the Void before it could act again (the game's own
// lethal launch: launchIsLethal), for every playable fighter on every
// stage. From 70 a Base Launch 3 hit ends a life from a third of the stage
// in (the highest over the roster on every stage with ledges: 62 to 70), a
// Base Launch 2 one from about 120 to 280 in from the ledge (180 on Yerma,
// its outcrops in the way): the next solid hit is a real danger. Below 65
// it is out. (Against the Void before the update, side 360 and top 800,
// the same simulation gives 65; the HUD had 60.)
export const LAUNCH_POINT_FIRE = 70;
export const LAUNCH_POINT_FIRE_OUT = 65;
// The stronger tier: from 110 a Base Launch 3 hit ends a life from
// anywhere on the stage, straight up included (straight up, the farther top
// line, is what decides it: 104 to 106 over the roster; sideways from the
// middle 75 to 97), on every stage. Below 105 it is back to the first
// tier. (Before the update: 95; the HUD had 100.)
export const LAUNCH_POINT_INFERNO = 110;
export const LAUNCH_POINT_INFERNO_OUT = 105;

// The fire a Launch Point shows (0 none, 1 burning, 2 inferno), from the
// fire it showed (`current`): each tier lights at its threshold and only
// goes out below its lower one.
export function launchPointFire(lp, current = 0) {
  let tier = current;
  if (lp >= LAUNCH_POINT_INFERNO) tier = 2;
  else if (tier === 2 && lp < LAUNCH_POINT_INFERNO_OUT) tier = 1;
  if (tier === 0 && lp >= LAUNCH_POINT_FIRE) tier = 1;
  if (tier >= 1 && lp < LAUNCH_POINT_FIRE_OUT) tier = 0;
  return tier;
}

// Energy for screen readers, in steps of 5: "Energy 75 of 100", or while
// exhausted "Energy exhausted, refilling: 40 of 100".
export function describeEnergy(combat) {
  const max = Math.round(combat.maxEnergy);
  const value = Math.min(max, Math.round(combat.energy / 5) * 5);
  return t(combat.energyExhausted ? 'hud.energyExhausted' : 'hud.energy', { value, max });
}

// One fighter's card and, with `points`, its row of score dots under it.
// `inward` is the way the centre lies from this card (1 right, -1 left):
// its portrait always faces that way.
function sidePanel(side, { inward, points = 0 }) {
  const portrait = el('canvas', { class: 'hud-portrait', width: 1, height: 1, 'aria-hidden': 'true' });
  const divider = el('span', { class: 'hud-divider', 'aria-hidden': 'true' });
  const tag = el('span', { class: 'hud-slot' });
  const name = el('span', { class: 'hud-name' });
  const launchPointValue = el('span', { class: 'hud-launch-point-value', text: '0' });
  // The heal glow plays once (the fire's flicker never ends: not it).
  launchPointValue.addEventListener?.('animationend', (e) => {
    if (String(e?.animationName ?? '').startsWith('hud-heal')) launchPointValue.classList.remove('is-healing');
  });
  const launchPoint = el('div', { class: 'hud-launch-point', role: 'group', ...tattr('aria-label', 'hud.launchPoint') }, [launchPointValue]);
  const energy = el('span', { class: 'hud-sr' });
  const info = el('div', { class: 'hud-info' }, [el('div', { class: 'hud-tag' }, [tag, name]), launchPoint]);
  const root = el('div', { class: `hud-side hud-${side} glass` }, [portrait, divider, info, energy]);
  const dots = Array.from({ length: points }, () => el('span', { class: 'hud-dot', 'aria-hidden': 'true' }));
  const score = points ? el('div', { class: 'hud-score', role: 'img' }, dots) : null;
  const wrap = el('div', { class: `hud-fighter hud-fighter--${side}` }, [root, score]);
  return {
    wrap, root, portrait, divider, tag, name, info, launchPoint, launchPointValue, energy, score, dots, inward,
    shownLaunchPoint: null, shownEnergy: null, shownScore: null, sprites: null,
    shownCombat: null, shownHeals: 0, shownFire: 0,
  };
}

// Shows `fighter` in `panel` under `tag`: its portrait (facing the centre),
// name and Launch Point, and forgets the cached values so the next update
// redraws everything.
function bindPanel(panel, tag, fighter) {
  panel.slot = tag;
  panel.tag.textContent = slotLabel(tag);
  panel.name.textContent = fighter.def.displayName;
  if (fighter.sprites !== panel.sprites) {
    panel.sprites = fighter.sprites;
    panel.root.classList.toggle('has-portrait', paintPortrait(panel.portrait, fighter.sprites));
  }
  // Mirrored only when the art faces away from the centre.
  panel.portrait.classList.toggle('is-mirrored', portraitSourceFacing(fighter.def) !== panel.inward);
  panel.portrait.dataset.facing = panel.inward > 0 ? 'right' : 'left';
  panel.shownLaunchPoint = null;
  panel.shownEnergy = null;
  panel.shownScore = null;
  // A fighter bound afresh (a swap, a rematch) is synced with, never
  // glowing, and its fire is worked out anew.
  panel.shownCombat = null;
  panel.launchPointValue.classList.remove('is-healing');
}

// Plays the heal glow on `value` from its start, restarting it when one is
// already playing (the class taken off, a reflow, and put back).
function glow(value) {
  value.classList.remove('is-healing');
  void value.offsetWidth;
  value.classList.add('is-healing');
}

function updatePanel(panel, fighter) {
  const { combat } = fighter;
  const text = formatLaunchPoint(combat.launchPoint);
  if (text !== panel.shownLaunchPoint) {
    panel.shownLaunchPoint = text;
    panel.launchPointValue.textContent = text;
  }
  // The heal glow: only when the same state came down again. A new state
  // (a respawn, a restart, a reset, a fresh bind) is only synced with.
  const heals = combat.launchPointHeals ?? 0;
  const same = combat === panel.shownCombat;
  if (same && heals !== panel.shownHeals) glow(panel.launchPointValue);
  const fire = launchPointFire(combat.launchPoint, same ? panel.shownFire : 0);
  if (!same || fire !== panel.shownFire) {
    panel.launchPointValue.classList.toggle('is-burning', fire >= 1);
    panel.launchPointValue.classList.toggle('is-inferno', fire >= 2);
  }
  panel.shownCombat = combat;
  panel.shownHeals = heals;
  panel.shownFire = fire;
  const energy = describeEnergy(combat);
  if (energy !== panel.shownEnergy) {
    panel.shownEnergy = energy;
    panel.energy.textContent = energy;
  }
}

// Fills the first `points` dots, in order.
function setScore(panel, points) {
  if (!panel.score || points === panel.shownScore) return;
  panel.shownScore = points;
  panel.dots.forEach((dot, i) => dot.classList.toggle('is-filled', i < points));
  panel.score.setAttribute('aria-label', plural('hud.score', points, { who: spokenSlot(panel.slot), points, total: panel.dots.length }));
}

// Whole seconds left as the clock shows them: 300 -> "5:00", 87 -> "1:27".
function clockText(time) {
  if (time === '∞') return time;
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
}

// The timer half's spoken label: the time left, saying so when it is
// overtime's.
function timeLabel(time, overtime = false) {
  if (time === '∞') return t('hud.pauseNoLimit');
  const m = Math.floor(time / 60), s = time % 60;
  const left = [m && plural('unit.minute', m), (s || !m) && plural('unit.second', s)].filter(Boolean).join(' ');
  return t(overtime ? 'hud.pauseOvertime' : 'hud.pauseTime', { left });
}

export class HUD {
  constructor(root, { onPause, pointsToWin = CONFIG.battle.pointsToWin } = {}) {
    this.root = root;
    this.left = sidePanel('p1', { inward: 1, points: pointsToWin });
    this.right = sidePanel('p2', { inward: -1, points: pointsToWin });
    // Each side is its team for screen readers: Team I on the left, Team II
    // on the right, in every mode (the card's tag still says who plays it).
    for (const [panel, slot] of [[this.left, 'p1'], [this.right, 'p2']]) {
      panel.wrap.setAttribute('role', 'group');
      panel.wrap.dataset.team = slot;
      setAttr(panel.wrap, 'aria-label', `team.${slot}`);
    }
    this.roundLabel = el('span', { class: 'hud-round' });
    this.timer = el('span', { class: 'hud-timer' });
    // Timer and pause are two halves of one glass control; either pauses.
    this.timeButton = el('button', { class: 'hud-time', type: 'button', ...tattr('aria-label', 'hud.pauseGame') }, [this.roundLabel, this.timer]);
    this.pauseButton = el('button', { class: 'hud-pause', type: 'button', ...tattr('aria-label', 'hud.pause'), html: ICONS.pause });
    if (onPause) {
      this.timeButton.addEventListener('click', onPause);
      this.pauseButton.addEventListener('click', onPause);
    }
    const center = el('div', { class: 'hud-center glass' }, [this.timeButton, this.pauseButton]);
    root.replaceChildren(this.left.wrap, center, this.right.wrap);
    this.shownTime = null;
    this.shownRound = null;
    this.shownOvertime = null;
  }

  // Local Play names each side for its player (Player 1, Player 2) rather
  // than its team, for screen readers too.
  setLocal(on) {
    for (const [panel, slot] of [[this.left, 'p1'], [this.right, 'p2']]) {
      setAttr(panel.wrap, 'aria-label', on ? PLAYER_NAMES[slot] : `team.${slot}`);
    }
  }

  // Online Play names each side for its player's online name (text no
  // translation owns), for screen readers too.
  setNames(names) {
    for (const [panel, slot] of [[this.left, 'p1'], [this.right, 'p2']]) {
      setPlainAttr(panel.wrap, 'aria-label', String(names?.[slot] ?? ''));
    }
  }

  // Each card is tagged with its fighter's label (Quick Battle's P1 and CPU
  // for a fighter that has none).
  bind(p1, p2) {
    bindPanel(this.left, p1.label ?? 'P1', p1);
    bindPanel(this.right, p2.label ?? 'CPU', p2);
    this.shownTime = null;
    this.shownRound = null;
    this.shownOvertime = null;
  }

  // The match's points fill the dots the moment they are scored (a fighter
  // out of play keeps its card and its Launch Point until it respawns).
  // Through overtime (the Battle's own `overtime`, never kept here) the
  // timer shows overtime's clock, the label over it reads OVERTIME instead
  // of the round, and the spoken label says it is overtime's time.
  update(battle) {
    const { p1, p2 } = battle;
    updatePanel(this.left, p1);
    updatePanel(this.right, p2);
    setScore(this.left, battle.score?.p1 ?? 0);
    setScore(this.right, battle.score?.p2 ?? 0);
    const overtime = !!battle.overtime;
    const time = Number.isFinite(battle.timeLeft) ? Math.ceil(battle.timeLeft) : '∞';
    if (time !== this.shownTime || overtime !== this.shownOvertime) {
      this.shownTime = time;
      this.timer.textContent = clockText(time);
      this.timer.classList.toggle('is-urgent', Number.isFinite(battle.timeLeft) && battle.timeLeft <= 10);
      this.timeButton.setAttribute('aria-label', timeLabel(time, overtime));
      this.timeButton.setAttribute('data-i18n-aria-label', '');
    }
    if (battle.round !== this.shownRound || overtime !== this.shownOvertime) {
      this.shownRound = battle.round;
      this.roundLabel.textContent = overtime ? t('hud.overtime') : t('hud.round', { n: battle.round });
      this.roundLabel.classList.toggle('is-overtime', overtime);
    }
    this.shownOvertime = overtime;
  }
}

// Practice Ground HUD: Player 1's card, a compact three-dots More button in
// the centre where Quick Battle's timer sits, and the practice CPU's card,
// the same cards as Quick Battle's, facing the centre, but with no score
// dots (practice has no points) and no round, timer or pause control. The
// CPU's card shows only while there is a CPU. Presses on More are reported
// through `onMore`; the Practice Ground screen owns the menu it opens.
export class PracticeHUD {
  constructor(root, { onMore } = {}) {
    this.root = root;
    this.panel = sidePanel('p1', { inward: 1 });
    this.cpuPanel = sidePanel('p2', { inward: -1 });
    this.cpuPanel.wrap.hidden = true;
    this.player = null;
    this.cpu = null;
    this.moreButton = el('button', {
      class: 'practice-more glass', type: 'button',
      ...tattr('aria-label', 'hud.practiceMenu'), 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
      html: ICONS.more,
    });
    if (onMore) this.moreButton.addEventListener('click', onMore);
    root.replaceChildren(this.panel.wrap, this.moreButton, this.cpuPanel.wrap);
  }

  // Shows the practice fighter and the CPU (null: its card goes), e.g.
  // after either is swapped, added or removed.
  bind(player, cpu = null) {
    this.player = player;
    bindPanel(this.panel, 'P1', player);
    this.bindCpu(cpu);
  }

  bindCpu(cpu) {
    this.cpu = cpu;
    this.cpuPanel.wrap.hidden = !cpu;
    if (cpu) bindPanel(this.cpuPanel, 'CPU', cpu);
  }

  // Follows the session: a fighter or CPU swapped since the last bind is
  // bound at once, and a removed CPU's card goes.
  update(session) {
    if (session.player !== this.player) this.bind(session.player, session.cpu);
    else if (session.cpu !== this.cpu) this.bindCpu(session.cpu);
    updatePanel(this.panel, session.player);
    if (session.cpu) updatePanel(this.cpuPanel, session.cpu);
  }

  // Whether the Practice menu the More button controls is open.
  setMenuOpen(open) {
    this.moreButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}
