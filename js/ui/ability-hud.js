// The ability HUD (DOM): the player's moves in the bottom-right corner,
// each a small tile of the move's own art over the input that performs it,
// for keyboard and controller play. Quick Battle and Practice Ground show it
// for Player 1; Watch Mode, menus, loading and results never do, and the
// touch controls keep their own buttons (it is hidden on a touch screen:
// html.is-touch, see css/ability-hud.css). A Local Play battle shows two,
// one for each player (setPlayer): Player 1's in the bottom-left corner and
// Player 2's in the bottom-right, each with its player's tag, each following
// its own fighter and showing its own controller's buttons, on a touch
// screen too (the touch controls play no fighter there).
//
//   ┌────────┐┌────────┐┌────────┐     the current place's moves, full size
//   │  art   ││  art   ││  art   │
//   ├────────┤├────────┤├────────┤     a 1px divider
//   │   U    ││ R2 + □ ││   O    │     its input
//   └────────┘└────────┘└────────┘
//      ┌─────┐┌─────┐┌─────┐          the other place's, smaller and dimmed
//
// Two rows, ground moves and air moves, on a small wheel: the top position
// is always where the fighter is now (Fighter.grounded), the bottom one the
// other place, a preview of what it can do after landing or leaving the
// ground. The rows swap through two fixed positions with CSS transforms and
// opacity alone (the wheel's data-place), so a fighter that jumps and lands
// again mid-swap simply turns back from where it is: nothing is queued, and
// no tile is rebuilt. Reduced motion swaps at once (the stylesheet).
//
// Everything shown comes from what already decides play, never a table of
// its own:
//   - the moves: the fighter's loadout (abilityGroups,
//     js/game/combat/move-status.js), in control order;
//   - the art: each button's authored preview (previewFrame,
//     js/data/ability-preview.js), its air artwork for a distinct air move;
//     a neutral glyph (mobileAbility's) where it has none or it fails;
//   - the input: CONFIG.bindings for a keyboard, and for a controller the
//     fighter's resolved profile (InputManager.profileFor: the player's
//     saved layout, else the fighter's recommended one) in the family of
//     Player 1's pad, whichever the player last used (InputManager.
//     lastDevice: a pad that is only connected never counts); for a Local
//     Play player, always their own controller's family and model (never
//     the last device used: both players play at once);
//   - the cooldowns and other restrictions: the fighter's combat state,
//     read through abilityStatus (js/game/combat/move-status.js). The HUD
//     keeps no timer: a cooldown (only the policy's special lengths, 3 s or
//     5 s, exist: js/data/cooldowns.js; an ordinary move has none) shows its
//     sweep and its seconds (formatCooldown) from the moment its move is
//     released, and a move spent for this airtime, unpaid for while the
//     fighter is exhausted (or missing its art) a muted look with no
//     countdown.
//
// It is information, not a control: nothing in it takes focus or the
// pointer, and the DOM changes only when a shown value does. Every word is
// translated (js/localization/i18n.js).

import { el } from '../core/utils.js';
import { t, onLanguageChange, setAttr } from '../localization/i18n.js';
import { playerChip, playerNumber } from './local-play.js';
import { DEFAULT_FAMILY, buttonGlyph } from '../core/gamepad-devices.js';
import { activationText, bindingText, displayFamily, stickGlyph } from './controller-glyphs.js';
import { mobileAbility } from './mobile-abilities.js';
import { previewFrame } from '../data/ability-preview.js';
import { abilityGroups, abilityStatus } from '../game/combat/move-status.js';
import { formatCooldown } from '../game/rendering/fighter-status.js';

const PLACES = Object.freeze(['ground', 'air']);

// Keys by KeyboardEvent.code as a keycap shows them: letters and digits
// bare, punctuation as itself (the comma for Attack 5), arrows as arrows.
const KEY_SYMBOLS = Object.freeze({
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Space: '␣',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: '⇧', ShiftRight: '⇧', Enter: '↵', Tab: '⇥',
});

// The keycap label for `code`.
export function keyCapLabel(code) {
  if (typeof code !== 'string' || !code) return '?';
  if (KEY_SYMBOLS[code]) return KEY_SYMBOLS[code];
  const m = code.match(/^(?:Key|Digit)(.)$/) ?? code.match(/^Numpad(\d)$/);
  if (m) return m[1];
  return code;
}

// What a tile shows for its input: { device, parts, hold, text }. `parts`
// are the chips in order, each { kind ('key', 'dir', 'mod', 'btn',
// 'stick'), glyph }: a direction always with its stick's mark (R↑ the right
// stick up, L↓ the left stick down), never a bare arrow, as the condition
// of a button ('dir') or as the input itself ('stick'); `hold` whether it
// activates on a hold; `text` the input in words (its accessible name).
// Keyboard: the button's first key in `bindings` (CONFIG.bindings).
// Controller: `binding` (the profile's, for the move's place) on a
// `family` pad, 'forward' and 'back' drawn as the side they are for a
// fighter facing `facing` (1 right, -1 left; » and « without one).
export function abilityInput({ device, action, bindings, binding, family = DEFAULT_FAMILY, model = null, facing = null }) {
  if (device !== 'gamepad') {
    const code = bindings?.[action]?.[0];
    const glyph = keyCapLabel(code);
    return { device: 'keyboard', parts: [{ kind: 'key', glyph }], hold: false, text: code ? glyph : t('pad.notBound') };
  }
  const f = displayFamily(family);
  if (!binding || 'source' in binding) {
    return { device: 'gamepad', parts: [], hold: false, text: t('pad.notBound') };
  }
  const parts = [];
  const stick = () => ({ glyph: stickGlyph(binding.stick, binding.direction, facing), stick: binding.stick });
  if (binding.button && binding.direction) parts.push({ kind: 'dir', ...stick() });
  if (binding.modifier) parts.push({ kind: 'mod', glyph: buttonGlyph(f, binding.modifier, model) });
  if (binding.button) parts.push({ kind: 'btn', glyph: buttonGlyph(f, binding.button, model), button: binding.button });
  else if (binding.direction) parts.push({ kind: 'stick', ...stick() });
  const words = bindingText(binding, f, model);
  const hold = binding.activation === 'hold';
  return { device: 'gamepad', parts, hold, text: hold ? `${words} (${activationText(binding, { kind: 'attack' })})` : words };
}

// Failed art, by URL, across every tile: never tried again.
const failedArt = new Set();

export class AbilityHUD {
  // `root` is the HUD's element (the screen places it); `input` the
  // InputManager (lastDevice, bindings, profileFor, controllers);
  // `settings` the player's settings (a saved controller layout changing
  // redraws the inputs); `player` a Local Play player ('p1' or 'p2', see
  // setPlayer), or null.
  constructor(root, { input = null, settings = null, player = null } = {}) {
    this.root = root;
    this.input = input;
    root.classList.add('ability-hud');
    root.setAttribute('role', 'group');
    root.hidden = true;
    this.wheel = el('div', { class: 'ah-wheel', 'data-place': 'ground' });
    this.player = null;
    this.tag = null;
    this.labelled = false;
    this.rows = {};
    for (const place of PLACES) {
      const row = el('div', { class: `ah-row ah-row--${place}`, role: 'list', 'data-place': place });
      this.rows[place] = { place, el: row, tiles: [] };
      this.wheel.append(row);
    }
    root.replaceChildren(this.wheel);
    this.setPlayer(player);
    this.fighter = null;
    this.def = null;
    this.place = 'ground';
    this.visible = false;
    // What the inputs were last drawn for, and a counter bumped whenever
    // the language or a saved layout changes (both redraw every input).
    this.inputKey = null;
    this.revision = 0;
    this.profile = null;
    this.facingInputs = false;
    this.unsubscribe = [
      onLanguageChange(() => this.invalidate()),
      settings?.onChange?.((name) => {
        if (name === 'controllerProfiles') this.invalidate();
      }),
    ].filter(Boolean);
  }

  // The Local Play player this HUD is for ('p1' / 'p2': their tag on it,
  // their own controller's buttons in its tiles, whatever device was last
  // used), or null (Player 1 on any device: the last one used).
  setPlayer(player) {
    const next = player === 'p1' || player === 'p2' ? player : null;
    if (next === this.player && this.labelled) return;
    this.labelled = true;
    this.player = next;
    this.inputKey = null;
    this.tag = next ? playerChip(next) : null;
    if (this.tag) {
      this.tag.classList.add('ah-player');
      this.root.replaceChildren(this.tag, this.wheel);
    } else {
      this.root.replaceChildren(this.wheel);
    }
    if (next) this.root.dataset.player = next;
    else delete this.root.dataset.player;
    if (next) setAttr(this.root, 'aria-label', 'abilityHud.playerLabel', { n: playerNumber(next) });
    else setAttr(this.root, 'aria-label', 'abilityHud.label');
  }

  // Shows (or hides) the HUD: a screen shows it only while a player
  // controls a fighter in play, never paused under a menu or at a result.
  setVisible(on) {
    const next = !!on && !!this.fighter;
    if (next === this.visible) return;
    this.visible = next;
    this.root.hidden = !next;
  }

  // On show for `fighter` (bound first if it is a new one), up to date at
  // once; null hides it.
  show(fighter) {
    if (fighter !== this.fighter) this.bind(fighter);
    this.setVisible(!!fighter);
    this.update(fighter);
  }

  // Whether the HUD is on show (the touch layout aside, which the stylesheet
  // hides it under).
  get showing() {
    return this.visible;
  }

  // Labels and saved layouts are read again on the next update.
  invalidate() {
    this.revision++;
    this.profile = null;
  }

  // Shows `fighter`'s moves (null: none, and the HUD hides): both rows
  // built once from its loadout, its art and its names. The wheel takes the
  // fighter's place at once, without a swap.
  bind(fighter) {
    this.fighter = fighter ?? null;
    this.def = fighter?.def ?? null;
    this.profile = null;
    this.inputKey = null;
    const groups = this.def ? abilityGroups(this.def) : { ground: [], air: [] };
    for (const place of PLACES) {
      const row = this.rows[place];
      row.tiles = groups[place].map((entry) => this.buildTile(entry, place));
      row.el.replaceChildren(...row.tiles.map((tile) => tile.el));
      row.el.dataset.count = String(row.tiles.length);
      row.el.hidden = !row.tiles.length;
    }
    this.root.style.setProperty('--ah-count', String(Math.max(1, groups.ground.length, groups.air.length)));
    this.place = fighter && !fighter.grounded ? 'air' : 'ground';
    this.wheel.classList.add('is-instant');
    this.wheel.dataset.place = this.place;
    this.labelRows();
    // Settle without a swap, then let later changes animate.
    void this.wheel.offsetWidth;
    this.wheel.classList.remove('is-instant');
    if (!fighter) this.setVisible(false);
  }

  // One tile: the art (the move's preview frame, else a neutral glyph),
  // the cooldown layer over it, the divider and the input.
  buildTile(entry, place) {
    const airborne = place === 'air';
    const ability = mobileAbility(this.def, entry.action, airborne);
    const sprite = previewFrame(this.def, entry.action, airborne);
    const art = el('div', { class: 'ah-art' });
    const sweep = el('div', { class: 'ah-cd', 'aria-hidden': 'true' });
    const seconds = el('span', { class: 'ah-cd-text', 'aria-hidden': 'true' });
    const input = el('div', { class: 'ah-input', 'aria-hidden': 'true' });
    const node = el('div', { class: 'ah-tile', role: 'listitem', 'data-action': entry.action, 'data-move': entry.move }, [
      art, sweep, seconds, el('span', { class: 'ah-divider', 'aria-hidden': 'true' }), input,
    ]);
    const tile = {
      entry, place, el: node, art, sweep, seconds, input,
      name: ability?.label ?? entry.move, glyph: ability?.icon ?? '',
      shown: { state: null, progress: null, text: null, label: null },
      inputText: '',
    };
    this.showArt(tile, sprite);
    return tile;
  }

  // The frame `sprite` on `tile` (its image kept, only its source
  // changing), or its glyph without one or once its file fails to load.
  showArt(tile, sprite) {
    if (!sprite || failedArt.has(sprite.url)) {
      tile.art.innerHTML = tile.glyph;
      tile.el.classList.remove('has-sprite');
      return;
    }
    const img = el('img', { class: 'ah-sprite', alt: '', draggable: 'false', decoding: 'async', 'aria-hidden': 'true' });
    img.addEventListener('error', () => {
      failedArt.add(sprite.url);
      if (img.isConnected) this.showArt(tile, null);
    }, { once: true });
    img.classList.toggle('is-mirrored', !!sprite.mirrored);
    img.setAttribute('src', sprite.url);
    tile.art.replaceChildren(img);
    tile.el.classList.add('has-sprite');
  }

  // Each row's accessible name: which place it is, and whether it is the
  // current one.
  labelRows() {
    for (const place of PLACES) {
      const current = place === this.place;
      this.rows[place].el.setAttribute('aria-label', t(`abilityHud.${place}${current ? 'Current' : 'Next'}`));
      this.rows[place].el.classList.toggle('is-current', current);
    }
  }

  // The device whose inputs the tiles show, with what it needs: the
  // keyboard, or Player 1's pad (its family and model) and the fighter's
  // profile. A Local Play player's HUD: that player's own pad, always.
  inputContext() {
    const input = this.input;
    if (this.player) {
      const pad = input?.controllers?.playerDevice?.(this.player) ?? null;
      return { device: 'gamepad', family: displayFamily(pad?.family ?? null), model: pad?.model ?? null };
    }
    const device = input?.lastDevice === 'gamepad' ? 'gamepad' : 'keyboard';
    const pad = input?.controllers?.player1 ?? null;
    const family = displayFamily(pad?.family ?? null);
    const model = pad?.model ?? null;
    return { device, family, model };
  }

  // The fighter's controller profile (read once until a saved layout
  // changes), and whether any of its moves' inputs point 'forward' or
  // 'back' (their arrows then follow the fighter's facing).
  controllerProfile() {
    if (!this.profile) {
      this.profile = this.input?.profileFor?.(this.def) ?? null;
      this.facingInputs = Object.values(this.profile?.bindings ?? {}).some((b) => b?.direction === 'forward' || b?.direction === 'back');
    }
    return this.profile;
  }

  // Every tile's input, drawn again (the device, the pad's family, a saved
  // layout, the language or, for an input pointing forward or back, the
  // fighter's facing changed).
  drawInputs(ctx) {
    const profile = ctx.device === 'gamepad' ? this.controllerProfile() : null;
    for (const place of PLACES) {
      for (const tile of this.rows[place].tiles) {
        const binding = profile?.bindings?.[`${place}:${tile.entry.action}`] ?? null;
        const shown = abilityInput({
          device: ctx.device, action: tile.entry.action, bindings: this.input?.bindings, binding,
          family: ctx.family, model: ctx.model, facing: ctx.facing,
        });
        tile.inputText = shown.text;
        tile.input.dataset.device = shown.device;
        tile.input.dataset.family = ctx.family;
        tile.input.replaceChildren(...this.inputChips(shown));
        tile.el.classList.toggle('is-long-input', shown.parts.length > 1 || shown.hold);
        tile.shown.label = null;
      }
    }
  }

  inputChips(shown) {
    const chips = [];
    shown.parts.forEach((part, i) => {
      if (i > 0) chips.push(el('span', { class: 'ah-plus', text: '+' }));
      chips.push(el('span', { class: `ah-chip ah-chip--${part.kind}`, 'data-button': part.button ?? null, text: part.glyph }));
    });
    if (shown.hold) chips.push(el('span', { class: 'ah-hold', text: t('abilityHud.holdShort') }));
    if (!chips.length) chips.push(el('span', { class: 'ah-chip ah-chip--none', text: '–' }));
    return chips;
  }

  // Follows `fighter` (Player 1's) once a frame, after the simulation: a
  // fighter changed is bound at once; its place turns the wheel; each
  // tile's cooldown and restriction are read from its combat state. Only
  // what changed is written.
  update(fighter) {
    if (fighter !== this.fighter) this.bind(fighter);
    if (!this.visible || !fighter) return;
    const place = fighter.grounded ? 'ground' : 'air';
    if (place !== this.place) {
      this.place = place;
      this.wheel.dataset.place = place;
      this.labelRows();
    }
    const ctx = this.inputContext();
    ctx.facing = fighter.facing < 0 ? -1 : 1;
    if (ctx.device === 'gamepad') this.controllerProfile();
    const facingKey = ctx.device === 'gamepad' && this.facingInputs ? ctx.facing : '';
    const key = `${ctx.device}|${ctx.family}|${ctx.model}|${this.revision}|${facingKey}`;
    if (key !== this.inputKey) {
      this.inputKey = key;
      this.drawInputs(ctx);
    }
    for (const p of PLACES) {
      for (const tile of this.rows[p].tiles) this.paint(tile, abilityStatus(fighter, tile.entry, p));
    }
  }

  // One tile's state: 'ready', 'cooling' (a 3 s or 5 s cooldown: sweep and
  // seconds) or 'restricted' (spent for this airtime, no Energy while
  // exhausted, or missing its art: muted, no countdown).
  paint(tile, status) {
    const cd = status.cooldown;
    const state = status.restriction ? 'restricted' : cd.cooling ? 'cooling' : 'ready';
    const shown = tile.shown;
    if (state !== shown.state) {
      // A long cooldown just over: a brief, quiet highlight.
      if (state === 'ready' && shown.state === 'cooling') this.flash(tile);
      tile.el.dataset.state = state;
      tile.el.dataset.restriction = status.restriction ?? '';
      shown.state = state;
      shown.label = null;
    }
    const progress = cd.cooling ? Math.round(cd.progress * 200) / 200 : 1;
    if (progress !== shown.progress) {
      shown.progress = progress;
      tile.el.style.setProperty('--ah-progress', String(progress));
    }
    const text = state === 'cooling' ? formatCooldown(cd.remaining) : '';
    if (text !== shown.text) {
      shown.text = text;
      tile.seconds.textContent = text;
    }
    if (shown.label === null) {
      const condition = status.restriction ? t(`abilityHud.${status.restriction}`) : state === 'cooling' ? t('abilityHud.cooling') : t('abilityHud.ready');
      shown.label = t('abilityHud.tile', { name: tile.name, input: tile.inputText, state: condition });
      tile.el.setAttribute('aria-label', shown.label);
    }
  }

  flash(tile) {
    const node = tile.el;
    node.classList.remove('is-recovered');
    void node.offsetWidth;
    node.classList.add('is-recovered');
    node.addEventListener('animationend', () => node.classList.remove('is-recovered'), { once: true });
  }

  // Lets go of the fighter and its tiles (leaving the screen).
  clear() {
    this.bind(null);
  }

  // Stops listening for language and layout changes.
  destroy() {
    for (const off of this.unsubscribe) off?.();
    this.unsubscribe = [];
    this.clear();
  }
}
