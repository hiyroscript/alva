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
// % sign; named for screen readers). Under it, in Quick Battle only, one dot per point the
// match is played to (CONFIG.battle.pointsToWin), filled for each point the
// fighter has scored. The CPU's card mirrors the player's. Stamina and the
// CAB cooldowns are drawn over the fighter itself (js/game/fighter-status.js);
// the card only describes stamina to screen readers.

import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { paintPortrait, portraitSourceFacing } from '../ui/sprite-art.js';

// Spoken names of the slot tags, for the score dots' labels.
const SLOT_NAMES = { P1: 'Player 1', CPU: 'CPU' };

// The Launch Point on show: whole numbers, with no % sign.
export function formatLaunchPoint(value) {
  return String(Math.round(value));
}

// Stamina for screen readers, in steps of 5: "Stamina 75 of 100", or while
// exhausted "Stamina exhausted, refilling: 40 of 100".
export function describeStamina(combat) {
  const max = Math.round(combat.maxStamina);
  const value = Math.min(max, Math.round(combat.stamina / 5) * 5);
  return combat.staminaExhausted
    ? `Stamina exhausted, refilling: ${value} of ${max}`
    : `Stamina ${value} of ${max}`;
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
  const launchPoint = el('div', { class: 'hud-launch-point', role: 'group', 'aria-label': 'Launch Point' }, [launchPointValue]);
  const stamina = el('span', { class: 'hud-sr' });
  const info = el('div', { class: 'hud-info' }, [el('div', { class: 'hud-tag' }, [tag, name]), launchPoint]);
  const root = el('div', { class: `hud-side hud-${side} glass` }, [portrait, divider, info, stamina]);
  const dots = Array.from({ length: points }, () => el('span', { class: 'hud-dot', 'aria-hidden': 'true' }));
  const score = points ? el('div', { class: 'hud-score', role: 'img' }, dots) : null;
  const wrap = el('div', { class: `hud-fighter hud-fighter--${side}` }, [root, score]);
  return {
    wrap, root, portrait, divider, tag, name, info, launchPoint, launchPointValue, stamina, score, dots, inward,
    shownLaunchPoint: null, shownStamina: null, shownScore: null, sprites: null,
  };
}

// Shows `fighter` in `panel` under `tag`: its portrait (facing the centre),
// name and Launch Point, and forgets the cached values so the next update
// redraws everything.
function bindPanel(panel, tag, fighter) {
  panel.tag.textContent = tag;
  panel.name.textContent = fighter.def.displayName;
  if (fighter.sprites !== panel.sprites) {
    panel.sprites = fighter.sprites;
    panel.root.classList.toggle('has-portrait', paintPortrait(panel.portrait, fighter.sprites));
  }
  // Mirrored only when the art faces away from the centre.
  panel.portrait.classList.toggle('is-mirrored', portraitSourceFacing(fighter.def) !== panel.inward);
  panel.portrait.dataset.facing = panel.inward > 0 ? 'right' : 'left';
  panel.shownLaunchPoint = null;
  panel.shownStamina = null;
  panel.shownScore = null;
}

function updatePanel(panel, fighter) {
  const { combat } = fighter;
  const text = formatLaunchPoint(combat.launchPoint);
  if (text !== panel.shownLaunchPoint) {
    panel.shownLaunchPoint = text;
    panel.launchPointValue.textContent = text;
  }
  const stamina = describeStamina(combat);
  if (stamina !== panel.shownStamina) {
    panel.shownStamina = stamina;
    panel.stamina.textContent = stamina;
  }
}

// Fills the first `points` dots, in order.
function setScore(panel, points) {
  if (!panel.score || points === panel.shownScore) return;
  panel.shownScore = points;
  panel.dots.forEach((dot, i) => dot.classList.toggle('is-filled', i < points));
  const who = SLOT_NAMES[panel.tag.textContent] ?? panel.tag.textContent;
  panel.score.setAttribute('aria-label', `${who}: ${points} of ${panel.dots.length} points`);
}

function timeLabel(t) {
  if (t === '∞') return 'Pause game, no time limit';
  return `Pause game, ${t} ${t === 1 ? 'second' : 'seconds'} remaining`;
}

export class HUD {
  constructor(root, { onPause, pointsToWin = CONFIG.battle.pointsToWin } = {}) {
    this.root = root;
    this.left = sidePanel('p1', { inward: 1, points: pointsToWin });
    this.right = sidePanel('p2', { inward: -1, points: pointsToWin });
    this.roundLabel = el('span', { class: 'hud-round' });
    this.timer = el('span', { class: 'hud-timer' });
    // Timer and pause are two halves of one glass control; either pauses.
    this.timeButton = el('button', { class: 'hud-time', type: 'button', 'aria-label': 'Pause game' }, [this.roundLabel, this.timer]);
    this.pauseButton = el('button', { class: 'hud-pause', type: 'button', 'aria-label': 'Pause', html: ICONS.pause });
    if (onPause) {
      this.timeButton.addEventListener('click', onPause);
      this.pauseButton.addEventListener('click', onPause);
    }
    const center = el('div', { class: 'hud-center glass' }, [this.timeButton, this.pauseButton]);
    root.replaceChildren(this.left.wrap, center, this.right.wrap);
    this.shownTime = null;
    this.shownRound = null;
  }

  bind(p1, p2) {
    bindPanel(this.left, 'P1', p1);
    bindPanel(this.right, 'CPU', p2);
    this.shownTime = null;
    this.shownRound = null;
  }

  // The match's points fill the dots the moment they are scored (a fighter
  // out of play keeps its card and its Launch Point until it respawns).
  update(battle) {
    const { p1, p2 } = battle;
    updatePanel(this.left, p1);
    updatePanel(this.right, p2);
    setScore(this.left, battle.score?.p1 ?? 0);
    setScore(this.right, battle.score?.p2 ?? 0);
    const t = Number.isFinite(battle.timeLeft) ? Math.ceil(battle.timeLeft) : '∞';
    if (t !== this.shownTime) {
      this.shownTime = t;
      this.timer.textContent = String(t);
      this.timer.classList.toggle('is-urgent', Number.isFinite(battle.timeLeft) && battle.timeLeft <= 10);
      this.timeButton.setAttribute('aria-label', timeLabel(t));
    }
    if (battle.round !== this.shownRound) {
      this.shownRound = battle.round;
      this.roundLabel.textContent = `ROUND ${battle.round}`;
    }
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
      'aria-label': 'Practice menu', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
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
