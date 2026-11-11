// ADVENTURE: SELECT LEVEL (screen id `adventure-levels`): Adventure's
// second step, between Select Mode and Select Fighter (the Adventure
// update). Thirty square cells, 01 to 30, one per level, in the progress
// saved on this device (app.adventure, js/core/adventure-progress.js):
//
//   locked   above the next level: dimmed, a faint border, disabled (out
//            of every pointer, Tab and arrow) and named "Level 07, locked"
//   cleared  below it: a green tint, green figures and a small check,
//            "Level 03, cleared"; replaying one is allowed
//   next     the highest level open: off-white with charcoal figures, the
//            screen's default focus, "Level 08, next"
//
// Levels 5, 10, 15, 20, 25 and 30 carry a small card mark in a corner
// where a Perquisite is offered: hollow until that milestone's Perquisite
// is picked, filled after. Under the grid a wide row, information only
// (never focused): Venture at the level focused (how much smarter and
// stronger than at Level 1) and the Perquisites the player owns, or a dash.
// At the bottom, Reset progress: a first press arms it ("Confirm reset")
// for 3.2 s, after which it disarms; a second press within that time
// clears the progress (every level back to 1, every Perquisite and
// milestone) and focus goes to Level 01. Click, Enter / J and gamepad A
// alike, never hover; disabled while there is nothing to reset.
//
// Choosing an open level makes it app.selection.adventureLevel and opens
// Adventure's Select Fighter. Back returns to Select Mode, its Adventure
// card focused.

import { Screen } from '../core/screen-manager.js';
import { el } from '../core/utils.js';
import { tx, tattr, setText, setAttr, iconLabel } from '../localization/i18n.js';
import { ICONS } from '../ui/icons.js';
import { screenHeader, refreshSteps, adventureSetup } from '../ui/components.js';
import {
  ADVENTURE_LEVELS, ROMAN, isMilestone, levelLabel, ventureNumbers,
} from '../data/adventure.js';

// How long a first press keeps Reset progress armed (seconds).
export const RESET_ARM_SECONDS = 3.2;

export class AdventureLevelScreen extends Screen {
  constructor(app) {
    super(app, 'adventure-levels');
    // The level whose Venture the wide row shows: the one focused.
    this.shownLevel = 1;
    this.armedTimer = null;
    this.armed = false;

    this.cells = Array.from({ length: ADVENTURE_LEVELS }, (_, i) => {
      const level = i + 1;
      const milestone = isMilestone(level);
      const cell = el('button', {
        class: `adventure-cell${milestone ? ' is-milestone' : ''}`, type: 'button', 'data-nav': true, 'data-level': String(level),
      }, [
        el('span', { class: 'adventure-cell-num', 'aria-hidden': 'true', text: levelLabel(level) }),
        el('span', { class: 'adventure-cell-check', 'aria-hidden': 'true', html: ICONS.check }),
        milestone ? el('span', { class: 'adventure-cell-card', 'aria-hidden': 'true', html: ICONS.perquisiteCard }) : null,
      ]);
      cell._level = level;
      cell.addEventListener('click', () => this.choose(level));
      cell.addEventListener('focus', () => this.showLevel(level));
      return cell;
    });
    this.grid = el('div', { class: 'adventure-grid', role: 'group', ...tattr('aria-label', 'adventure.levels.grid') }, this.cells);

    // The wide row: Venture at the level focused, and the Perquisites owned.
    this.ventureTitle = el('span', { class: 'adventure-wide-title' });
    this.ventureLine = el('span', { class: 'adventure-wide-line' });
    this.perquisiteList = el('ul', { class: 'adventure-chips', ...tattr('aria-label', 'adventure.levels.perquisites') });
    this.wide = el('div', { class: 'adventure-wide', 'aria-live': 'polite' }, [
      el('div', { class: 'adventure-wide-venture' }, [this.ventureTitle, this.ventureLine]),
      el('div', { class: 'adventure-wide-perquisites' }, [
        el('span', { class: 'adventure-wide-label', ...tx('adventure.levels.perquisites') }),
        this.perquisiteList,
      ]),
    ]);

    this.progressMeta = el('span', { class: 'panel-meta' });
    this.resetButton = el('button', { class: 'btn adventure-reset', type: 'button', 'data-nav': true, ...iconLabel('adventure.reset', ICONS.reset, { iconFirst: true }) });
    this.resetButton.addEventListener('click', () => this.pressReset());

    this.el.replaceChildren(
      screenHeader({ title: 'adventure.levels.title', kicker: 'setup.adventure', setup: adventureSetup, step: 1, onBack: () => this.onBack() }),
      el('div', { class: 'screen-body adventure-layout' }, [
        el('div', { class: 'adventure-panel' }, [
          el('div', { class: 'panel-head adventure-panel-head' }, [
            el('h2', { class: 'panel-title', ...tx('adventure.levels.heading') }),
            this.progressMeta,
          ]),
          el('div', { class: 'adventure-grid-wrap' }, [this.grid]),
          this.wide,
        ]),
        el('div', { class: 'adventure-footer' }, [this.resetButton]),
      ]),
    );
  }

  get progress() {
    return this.app.adventure;
  }

  // The cell for `level`.
  cellFor(level) {
    return this.cells[level - 1] ?? null;
  }

  enter() {
    refreshSteps(this.el);
    this.disarm();
    this.paint();
    this.showLevel(this.progress.nextLevel);
  }

  exit() {
    this.disarm();
  }

  // The next level (Level 30 once every level is cleared).
  focusDefault() {
    this.cellFor(this.progress.nextLevel)?.focus({ preventScroll: true });
  }

  // Every cell's state and name, the progress meta, the chips and the reset
  // button, from the saved progress.
  paint() {
    const p = this.progress;
    for (const cell of this.cells) {
      const level = cell._level;
      const state = p.state(level);
      cell.dataset.state = state;
      cell.classList.toggle('is-locked', state === 'locked');
      cell.classList.toggle('is-cleared', state === 'cleared');
      cell.classList.toggle('is-next', state === 'next');
      cell.disabled = state === 'locked';
      if (state === 'locked') cell.setAttribute('aria-disabled', 'true');
      else cell.removeAttribute('aria-disabled');
      setAttr(cell, 'aria-label', `adventure.cell.${state}`, { level: levelLabel(level) });
      if (isMilestone(level)) {
        const claimed = p.claimed(level);
        cell.classList.toggle('is-claimed', claimed);
        setAttr(cell, 'aria-description', claimed ? 'adventure.cell.claimed' : 'adventure.cell.milestone');
      }
    }
    const cleared = Math.min(ADVENTURE_LEVELS, p.unlocked - 1);
    setText(this.progressMeta, 'adventure.levels.progress', { cleared, total: ADVENTURE_LEVELS });
    this.paintPerquisites();
    this.resetButton.disabled = !p.hasProgress;
  }

  // The owned Perquisites as compact chips ("Brave Soldier II"), or a dash.
  paintPerquisites() {
    const owned = this.progress.owned;
    if (!owned.length) {
      this.perquisiteList.replaceChildren(el('li', { class: 'adventure-chip is-empty', ...tx('adventure.levels.none') }));
      return;
    }
    this.perquisiteList.replaceChildren(...owned.map(({ id, level }) => el('li', { class: 'adventure-chip', 'data-perquisite': id }, [
      el('span', { class: 'adventure-chip-name', ...tx(`perquisite.${id}.name`) }),
      el('span', { class: 'adventure-chip-level', text: ROMAN[level] }),
    ])));
  }

  // The wide row follows the cell focused: Venture at that level.
  showLevel(level) {
    this.shownLevel = level;
    const { smarts, strength } = ventureNumbers(level);
    setText(this.ventureTitle, 'adventure.venture.title', { level: levelLabel(level) });
    setText(this.ventureLine, 'adventure.venture.line', { smarts, strength });
  }

  // An open level: it becomes the one played, on to Select Fighter. A
  // locked one does nothing (it is disabled anyway).
  choose(level) {
    if (!this.progress.isOpen(level)) return;
    this.disarm();
    this.app.selection.adventureLevel = level;
    this.app.screens.go('adventure-character');
  }

  // ---- Reset progress ----------------------------------------------------------

  // A first press arms it for RESET_ARM_SECONDS; a second within that time
  // resets.
  pressReset() {
    if (!this.progress.hasProgress) return;
    if (!this.armed) {
      this.arm();
      return;
    }
    this.disarm();
    this.progress.reset();
    this.paint();
    this.showLevel(1);
    this.cellFor(1).focus({ preventScroll: true });
  }

  arm() {
    this.armed = true;
    this.resetButton.classList.add('is-armed');
    this.setResetLabel('adventure.resetConfirm');
    clearTimeout(this.armedTimer);
    this.armedTimer = setTimeout(() => this.disarm(), RESET_ARM_SECONDS * 1000);
  }

  disarm() {
    clearTimeout(this.armedTimer);
    this.armedTimer = null;
    this.armed = false;
    this.resetButton.classList.remove('is-armed');
    this.setResetLabel('adventure.reset');
  }

  // The button's label (beside its icon), following the language.
  setResetLabel(key) {
    const { html, ...marks } = iconLabel(key, ICONS.reset, { iconFirst: true });
    this.resetButton.innerHTML = html;
    for (const [name, value] of Object.entries(marks)) {
      if (value == null) this.resetButton.removeAttribute(name);
      else this.resetButton.setAttribute(name, value);
    }
  }
}
