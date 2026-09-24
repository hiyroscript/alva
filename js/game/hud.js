// Battle HUD (DOM). Only touches the DOM when a displayed value changes.
// The merged timer + pause control reports presses through `onPause`; the
// battle screen owns what pausing means. Practice Ground's HUD (PracticeHUD,
// below) reuses the same fighter panel with a More button instead.

import { clamp, el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';

// Tag + name, the green health bar, and the blue energy bar directly beneath.
function sidePanel(side) {
  const fill = el('div', { class: 'hud-bar-fill' });
  const ghost = el('div', { class: 'hud-bar-ghost' });
  const name = el('span', { class: 'hud-name' });
  const tag = el('span', { class: 'hud-slot' });
  const bar = el('div', {
    class: 'hud-bar',
    role: 'meter',
    'aria-label': 'Health',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '100',
  }, [ghost, fill]);
  const energyFill = el('div', { class: 'hud-energy-fill' });
  const energy = el('div', {
    class: 'hud-energy',
    role: 'meter',
    'aria-label': 'Energy',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '100',
  }, [energyFill]);
  const root = el('div', { class: `hud-side hud-${side} glass` }, [
    el('div', { class: 'hud-tag' }, [tag, name]),
    bar,
    energy,
  ]);
  return { root, fill, ghost, name, tag, bar, value: -1, energy, energyFill, energyValue: -1, energyMax: -1 };
}

// Shows `fighter` in `panel` under `tag`, and forgets the cached values so
// the next update redraws both meters.
function bindPanel(panel, tag, fighter) {
  panel.tag.textContent = tag;
  panel.name.textContent = fighter.def.displayName;
  panel.value = -1;
  panel.energyValue = -1;
  panel.energyMax = -1;
}

function setPanelHealth(panel, ratio) {
  const pct = Math.round(ratio * 1000) / 10;
  if (pct === panel.value) return;
  panel.value = pct;
  panel.fill.style.transform = `scaleX(${ratio})`;
  panel.ghost.style.transform = `scaleX(${ratio})`;
  panel.bar.setAttribute('aria-valuenow', String(Math.round(pct)));
  panel.root.classList.toggle('is-low', ratio <= 0.25);
}

// Energy reports real values against the fighter's own maximum.
function setPanelEnergy(panel, energy, max) {
  const ratio = max > 0 ? clamp(energy / max, 0, 1) : 0;
  const pct = Math.round(ratio * 1000) / 10;
  if (pct === panel.energyValue && max === panel.energyMax) return;
  panel.energyValue = pct;
  panel.energyMax = max;
  panel.energyFill.style.transform = `scaleX(${ratio})`;
  panel.energy.setAttribute('aria-valuemax', String(max));
  panel.energy.setAttribute('aria-valuenow', String(Math.round(ratio * max)));
}

function updatePanel(panel, fighter) {
  const { combat } = fighter;
  setPanelHealth(panel, combat.health / combat.maxHealth);
  setPanelEnergy(panel, combat.energy, combat.maxEnergy);
}

function timeLabel(t) {
  if (t === '∞') return 'Pause game, no time limit';
  return `Pause game, ${t} ${t === 1 ? 'second' : 'seconds'} remaining`;
}

export class HUD {
  constructor(root, { onPause } = {}) {
    this.root = root;
    this.left = sidePanel('p1');
    this.right = sidePanel('p2');
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
    root.replaceChildren(this.left.root, center, this.right.root);
    this.shownTime = null;
    this.shownRound = null;
  }

  bind(p1, p2) {
    bindPanel(this.left, 'P1', p1);
    bindPanel(this.right, 'CPU', p2);
    this.shownTime = null;
    this.shownRound = null;
  }

  update(battle) {
    const { p1, p2 } = battle;
    updatePanel(this.left, p1);
    updatePanel(this.right, p2);
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

// Practice Ground HUD: Player 1's panel (tag, name, health and Energy) and a
// compact three-dots More button, nothing else: no opponent panel, round,
// timer or pause control. Presses on More are reported through `onMore`; the
// Practice Ground screen owns the menu it opens.
export class PracticeHUD {
  constructor(root, { onMore } = {}) {
    this.root = root;
    this.panel = sidePanel('p1');
    this.moreButton = el('button', {
      class: 'practice-more glass', type: 'button',
      'aria-label': 'Practice menu', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
      html: ICONS.more,
    });
    if (onMore) this.moreButton.addEventListener('click', onMore);
    root.replaceChildren(this.panel.root, this.moreButton);
  }

  // Shows `fighter`, e.g. after the practice fighter is swapped.
  bind(fighter) {
    bindPanel(this.panel, 'P1', fighter);
  }

  update(session) {
    updatePanel(this.panel, session.player);
  }

  // Whether the Practice menu the More button controls is open.
  setMenuOpen(open) {
    this.moreButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}
