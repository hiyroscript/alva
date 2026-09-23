// Battle HUD (DOM). Only touches the DOM when a displayed value changes.
// The merged timer + pause control reports presses through `onPause`; the
// battle screen owns what pausing means.

import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';

function sidePanel(side) {
  const fill = el('div', { class: 'hud-bar-fill' });
  const ghost = el('div', { class: 'hud-bar-ghost' });
  const name = el('span', { class: 'hud-name' });
  const tag = el('span', { class: 'hud-slot' });
  const bar = el('div', {
    class: 'hud-bar',
    role: 'meter',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '100',
  }, [ghost, fill]);
  const root = el('div', { class: `hud-side hud-${side} glass` }, [
    el('div', { class: 'hud-tag' }, [tag, name]),
    bar,
  ]);
  return { root, fill, ghost, name, tag, bar, value: -1 };
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
    this.left.tag.textContent = 'P1';
    this.left.name.textContent = p1.def.displayName;
    this.right.tag.textContent = 'CPU';
    this.right.name.textContent = p2.def.displayName;
    this.left.value = -1;
    this.right.value = -1;
    this.shownTime = null;
    this.shownRound = null;
  }

  setHealth(panel, ratio) {
    const pct = Math.round(ratio * 1000) / 10;
    if (pct === panel.value) return;
    panel.value = pct;
    panel.fill.style.transform = `scaleX(${ratio})`;
    panel.ghost.style.transform = `scaleX(${ratio})`;
    panel.bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    panel.root.classList.toggle('is-low', ratio <= 0.25);
  }

  update(battle) {
    const { p1, p2 } = battle;
    this.setHealth(this.left, p1.combat.health / p1.combat.maxHealth);
    this.setHealth(this.right, p2.combat.health / p2.combat.maxHealth);
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
