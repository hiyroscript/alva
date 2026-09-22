// Battle HUD (DOM). Only touches the DOM when a displayed value changes.

import { el } from '../core/utils.js';

function sidePanel(side) {
  const fill = el('div', { class: 'hud-bar-fill' });
  const ghost = el('div', { class: 'hud-bar-ghost' });
  const name = el('span', { class: 'hud-name' });
  const tag = el('span', { class: 'hud-slot' });
  const sub = el('div', { class: 'hud-sub' });
  const bar = el('div', {
    class: 'hud-bar',
    role: 'meter',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '100',
  }, [ghost, fill]);
  const root = el('div', { class: `hud-side hud-${side}` }, [
    el('div', { class: 'hud-tag' }, [tag, name]),
    bar,
    sub,
  ]);
  return { root, fill, ghost, name, tag, sub, bar, value: -1 };
}

export class HUD {
  constructor(root) {
    this.root = root;
    this.left = sidePanel('p1');
    this.right = sidePanel('p2');
    this.timer = el('div', { class: 'hud-timer', 'aria-label': 'Round timer' });
    this.roundLabel = el('div', { class: 'hud-round' });
    const center = el('div', { class: 'hud-center' }, [this.roundLabel, this.timer]);
    root.replaceChildren(this.left.root, center, this.right.root);
    this.shownTime = null;
    this.shownRound = null;
  }

  bind(p1, p2) {
    this.left.tag.textContent = 'P1';
    this.left.name.textContent = p1.def.displayName;
    this.left.sub.textContent = 'PLAYER 1';
    this.right.tag.textContent = 'CPU';
    this.right.name.textContent = p2.def.displayName;
    this.right.sub.textContent = 'TRAINING OPPONENT';
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
    }
    if (battle.round !== this.shownRound) {
      this.shownRound = battle.round;
      this.roundLabel.textContent = `ROUND ${battle.round}`;
    }
  }
}
