// Local Play's shared identity: who each player is, everywhere it shows.
//
// Player 1 is red and Player 2 blue, from the setup screens to the HUD, the
// markers over the fighters, the move HUDs and the Match Results. The tones
// are the stylesheet's --player-1 / --player-2 (css/base.css) and, for the
// canvas, CONFIG.localPlay.colors: the same two values. Colour is never
// alone: every indicator carries the player's tag (P1 / P2, J1 / J2 in
// French) or name as well.
//
// The turn note tells the players whose controller a setup step listens to
// and, while either controller is lost, which one to reconnect.

import { CONFIG } from '../config.js';
import { el } from '../core/utils.js';
import { tx, setText } from '../localization/i18n.js';

// The two players' tones, for what the canvas draws (CONFIG.localPlay;
// css/base.css has the same two as --player-1 and --player-2): a legible
// red and blue on the dark interface and over bright stage art alike.
export const LOCAL_PLAYER_COLORS = CONFIG.localPlay.colors;

// The players in order, their tags (as the HUD shows them: slot.p1 /
// slot.p2) and their names (Player 1 / Player 2).
export const LOCAL_SLOTS = Object.freeze(['p1', 'p2']);
export const PLAYER_TAGS = Object.freeze({ p1: 'P1', p2: 'P2' });
export const PLAYER_NAMES = Object.freeze({ p1: 'hud.player1', p2: 'hud.player2' });

// A player's number: 1 or 2.
export const playerNumber = (slot) => (slot === 'p2' ? 2 : 1);

// A compact player badge: a tinted pill with the player's tag ("P1") and,
// with `name`, the player's name beside it ("P1 Player 1").
export function playerChip(slot, { name = false } = {}) {
  return el('span', { class: `player-chip player-chip--${slot}`, 'data-player': slot }, [
    el('span', { class: 'player-chip-tag', ...tx(`slot.${slot}`) }),
    name ? el('span', { class: 'player-chip-name', ...tx(PLAYER_NAMES[slot]) }) : null,
  ]);
}

// What a Local Play setup step tells its players now, for `owner` (the
// player whose controller it listens to): { key, params, warning }. A lost
// controller comes first: the setup waits for it (both are needed to
// play).
export function turnStatus(controllers, owner) {
  const missing = controllers?.missingPlayers?.() ?? [];
  if (missing.length > 1) return { key: 'local.missing.both', params: undefined, warning: true };
  if (missing.length === 1) return { key: 'local.missing.one', params: { n: playerNumber(missing[0]) }, warning: true };
  return { key: 'local.turn', params: { n: playerNumber(owner) }, warning: false };
}

// The turn note: one line under a setup step's choice, in the owner's tone
// (a warning while a controller is lost). render() brings it up to date.
export class TurnNote {
  constructor(owner) {
    this.owner = owner;
    this.el = el('p', { class: `local-turn local-turn--${owner}`, role: 'status', 'aria-live': 'polite' });
  }

  // Shows the status for `controllers` now; returns whether the setup is
  // on hold (a controller lost).
  render(controllers) {
    const status = turnStatus(controllers, this.owner);
    setText(this.el, status.key, status.params);
    this.el.classList.toggle('is-warning', status.warning);
    return status.warning;
  }
}
