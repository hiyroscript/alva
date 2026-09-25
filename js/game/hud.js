// Battle HUD (DOM). Only touches the DOM when a displayed value changes.
// The merged timer + pause control reports presses through `onPause`; the
// battle screen owns what pausing means. Practice Ground's HUD (PracticeHUD,
// below) reuses the same fighter panel with a More button instead.
//
// Each fighter panel is one compact, semi-transparent glass card:
//
//   [portrait] | P1 #0001      (4.3)  ( )
//              | 37             BA1   BA2
//
// the character's own portrait crop (visual.portrait), one thin divider,
// then its slot tag and name over its accumulated Knockback (a plain number:
// no bar, maximum or % sign), then one small ring per charged action (from
// the character's `chargedActions`) showing that ability's cooldown: the
// seconds left inside a ring that fills as it recovers, complete and empty
// of numbers once it is ready. The CPU's card mirrors the player's.

import { el } from '../core/utils.js';
import { ICONS } from '../ui/icons.js';
import { paintPortrait } from '../ui/sprite-art.js';

// Short names of the buttons a charged action is charged from, for the
// cooldown captions ("BA1") and their accessible labels ("Charged BA1 ...").
const CHARGED_NAMES = { primary: 'Throw', special: 'Special', action1: 'BA1', action2: 'BA2' };

// The Knockback on show: whole numbers, with no % sign.
export function formatKnockback(value) {
  return String(Math.round(value));
}

// Seconds left on a cooldown as shown in its ring, one decimal, rounded up
// so it never reads 0.0 while still cooling ("4.3", "0.1").
export function formatCooldown(seconds) {
  return (Math.ceil(seconds * 10 - 1e-6) / 10).toFixed(1);
}

// Portrait, divider, tag + name over the Knockback number, and the cooldown
// row (filled per fighter by bindPanel).
function sidePanel(side) {
  const portrait = el('canvas', { class: 'hud-portrait', width: 1, height: 1, 'aria-hidden': 'true' });
  const divider = el('span', { class: 'hud-divider', 'aria-hidden': 'true' });
  const tag = el('span', { class: 'hud-slot' });
  const name = el('span', { class: 'hud-name' });
  const knockbackValue = el('span', { class: 'hud-knockback-value', text: '0' });
  const knockback = el('div', { class: 'hud-knockback', role: 'group', 'aria-label': 'Knockback' }, [knockbackValue]);
  const cooldownRow = el('div', { class: 'hud-cooldowns' });
  const info = el('div', { class: 'hud-info' }, [el('div', { class: 'hud-tag' }, [tag, name]), knockback]);
  const root = el('div', { class: `hud-side hud-${side} glass` }, [portrait, divider, info, cooldownRow]);
  return {
    root, portrait, divider, tag, name, info, knockback, knockbackValue, cooldownRow,
    cooldowns: [], shownKnockback: null, sprites: null,
  };
}

// One charged action's cooldown: a small ring with the seconds left inside
// it and the button's short name beneath.
function cooldownIndicator(id, action) {
  const label = CHARGED_NAMES[action] ?? action;
  const value = el('span', { class: 'hud-cd-value' });
  const ring = el('span', { class: 'hud-cd-ring', 'aria-hidden': 'true' }, [value]);
  const root = el('div', { class: 'hud-cd is-ready', role: 'img', 'aria-label': `Charged ${label} ready` }, [
    ring,
    el('span', { class: 'hud-cd-name', 'aria-hidden': 'true', text: label }),
  ]);
  return { id, label, root, ring, value, shownText: null, shownProgress: null };
}

// Shows `fighter` in `panel` under `tag`: its portrait, name and one
// cooldown ring per charged action, and forgets the cached values so the
// next update redraws everything.
function bindPanel(panel, tag, fighter) {
  panel.tag.textContent = tag;
  panel.name.textContent = fighter.def.displayName;
  if (fighter.sprites !== panel.sprites) {
    panel.sprites = fighter.sprites;
    panel.root.classList.toggle('has-portrait', paintPortrait(panel.portrait, fighter.sprites));
  }
  panel.cooldowns = Object.entries(fighter.def.chargedActions ?? {}).map(([action, charged]) => cooldownIndicator(charged.id, action));
  panel.cooldownRow.replaceChildren(...panel.cooldowns.map((c) => c.root));
  panel.cooldownRow.hidden = !panel.cooldowns.length;
  panel.shownKnockback = null;
}

function setPanelKnockback(panel, value) {
  const text = formatKnockback(value);
  if (text === panel.shownKnockback) return;
  panel.shownKnockback = text;
  panel.knockbackValue.textContent = text;
}

// The ring completes as the ability recovers: progress = 1 - remaining /
// duration, read straight from the fighter's cooldown state, so a Charge
// that speeds recovery speeds the ring too. Ready: complete, no number.
function setCooldown(indicator, cooldowns) {
  const remaining = cooldowns.remaining(indicator.id);
  const ready = remaining <= 0;
  const text = ready ? '' : formatCooldown(remaining);
  const progress = ready ? 1 : Math.round(cooldowns.progress(indicator.id) * 200) / 200;
  if (text === indicator.shownText && progress === indicator.shownProgress) return;
  indicator.shownProgress = progress;
  indicator.ring.style.setProperty('--cd-progress', String(progress));
  if (text === indicator.shownText) return;
  indicator.shownText = text;
  indicator.value.textContent = text;
  indicator.root.classList.toggle('is-ready', ready);
  indicator.root.setAttribute('aria-label', ready
    ? `Charged ${indicator.label} ready`
    : `Charged ${indicator.label} cooldown, ${text} seconds remaining`);
}

function updatePanel(panel, fighter) {
  const { combat } = fighter;
  setPanelKnockback(panel, combat.knockback);
  for (const c of panel.cooldowns) setCooldown(c, combat.chargedCooldowns);
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

// Practice Ground HUD: Player 1's panel (the same card as Quick Battle's:
// portrait, name, Knockback and cooldown rings) and a compact three-dots
// More button, top centre where Quick Battle's timer sits, nothing else: no
// panel for the practice CPU, round, timer or pause control. Presses on More
// are reported through `onMore`; the Practice Ground screen owns the menu it
// opens.
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
