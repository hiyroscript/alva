// The controller binding resolver: Player 1's physical controller input
// turned into Alva's own control codenames, for the fighter being played.
//
// It never performs a move. It only says which control codenames this
// step's snapshot carries (runLeft, jump, shield, attack2Pressed, a Dash
// request...), exactly as a keyboard or the touch controls would, and the
// Fighter decides, as ever, what each one does.
//
// The rules, in order (docs/systems/input.md has them in full):
//
//   1. Context. Each sample is resolved for the fighter as it is at that
//      step: on the ground or in the air, and its facing. A ground action
//      is never chosen in the air, nor an air action on the ground.
//   2. One owner per press. Every press of a button goes to at most one
//      action, and that action owns the button until it is let go: a held
//      action (Jump, the Shield, a held Fast fall) is held only while its
//      own press is, so a button a combination used never raises the
//      Shield, even after the modifier is let go. Release and press again.
//   3. Modifier first. A button pressed while a modifier is held (R2
//      before Square, or both in the same sample) is that combination and
//      nothing else: R2 + Square is Red, never the Jab, and where the
//      combination means nothing (R2 + Square in the air) the press does
//      nothing. A combination is never read back into an earlier press:
//      Square then R2 is the Jab. Plain presses never wait for a possible
//      modifier, so no ordinary action is delayed.
//   4. Direction. Among the bindings of a press, a stick direction (Down +
//      Square) beats left-or-right, which beats anywhere. Directions are
//      read with a dominant-axis rule: the stick past DIRECTION_DEADZONE
//      points down when it is at least as far down as it is sideways.
//      A directional press never doubles as the Fast fall on its own step.
//   5. Activation. 'press' acts as the button goes down, 'hold' once it has
//      been held HOLD_THRESHOLD (a tap does nothing), 'continuous' holds
//      its control while the button stays held. Nothing repeats while held.
//
// A press from before the resolver was reset (a menu closed, the fighter
// changed, Player 1's controller changed) is stale: ignored until let go,
// so the button that closed a menu never jumps or attacks.

import { HOLD_THRESHOLD, directionRank, UNIVERSAL_DEFAULTS } from '../data/controller-profiles.js';

// A stick component this far out holds a direction (running, and a Fast
// fall on the stick).
export const RUN_THRESHOLD = 0.45;
// How far out the stick must be for a binding's direction to count.
export const DIRECTION_DEADZONE = 0.5;
// A Dash goes the way the stick leans this far, else the way the fighter
// faces.
export const DASH_AIM_THRESHOLD = 0.3;

const STALE = Object.freeze({ entry: null, modified: true, stale: true });
const PAUSED = Object.freeze({ entry: null, modified: true, stale: false });

// The movement source's direction vector [x, y] (x right, y down) for the
// buttons `held` and the stick `axes`.
export function movementVector(source, held, axes) {
  const pad = () => [
    (held.has('dpadRight') ? 1 : 0) - (held.has('dpadLeft') ? 1 : 0),
    (held.has('dpadDown') ? 1 : 0) - (held.has('dpadUp') ? 1 : 0),
  ];
  if (source === 'dpad') return pad();
  if (source === 'rightStick') return [axes[2] ?? 0, axes[3] ?? 0];
  if (source === 'leftStickDpad') {
    const [x, y] = pad();
    if (x || y) return [x, y];
  }
  return [axes[0] ?? 0, axes[1] ?? 0];
}

// The one direction the stick points ('left', 'right', 'up', 'down'), or
// null inside the deadzone. Dominant axis; exactly diagonal reads vertical.
export function stickDirection(x, y) {
  if (Math.hypot(x, y) < DIRECTION_DEADZONE) return null;
  if (Math.abs(y) >= Math.abs(x)) return y > 0 ? 'down' : 'up';
  return x > 0 ? 'right' : 'left';
}

// Whether a binding's `direction` is met by the stick at [x, y].
export function directionMet(direction, x, y) {
  if (direction === null) return true;
  const d = stickDirection(x, y);
  if (direction === 'horizontal') return d === 'left' || d === 'right';
  return d === direction;
}

// Whether a direction-only binding's `direction` is held (a component past
// RUN_THRESHOLD, the same as running).
export function directionHeld(direction, x, y) {
  switch (direction) {
    case 'down': return y > RUN_THRESHOLD;
    case 'up': return y < -RUN_THRESHOLD;
    case 'left': return x < -RUN_THRESHOLD;
    case 'right': return x > RUN_THRESHOLD;
    case 'horizontal': return Math.abs(x) > RUN_THRESHOLD;
    default: return false;
  }
}

const placeOk = (entry, place) => entry.place === 'both' || entry.place === place;

// `profile` (js/data/controller-profiles.js resolveProfile) ready to
// resolve: its bindings by button, the combinations it uses anywhere, its
// direction-only bindings and its Pause.
export function compileProfile(profile) {
  const entries = [];
  for (const action of profile?.actions ?? []) {
    const b = profile.bindings?.[action.id];
    if (!b || action.kind === 'move') continue;
    entries.push({
      id: action.id, kind: action.kind, control: action.control ?? null, place: action.place,
      button: b.button, modifier: b.modifier, direction: b.direction, activation: b.activation,
      rank: directionRank(b.direction),
    });
  }
  const byButton = new Map();
  for (const e of entries) {
    if (e.button === null) continue;
    if (!byButton.has(e.button)) byButton.set(e.button, []);
    byButton.get(e.button).push(e);
  }
  return {
    character: profile?.character ?? null,
    source: profile?.bindings?.move?.source ?? UNIVERSAL_DEFAULTS.move.source,
    entries,
    byButton,
    pairs: new Set(entries.filter((e) => e.modifier).map((e) => `${e.modifier}+${e.button}`)),
    directionOnly: entries.filter((e) => e.button === null),
    pause: entries.find((e) => e.kind === 'pause') ?? null,
  };
}

// The universal Pause, before any profile is known.
const DEFAULT_PAUSE = Object.freeze({ ...UNIVERSAL_DEFAULTS.pause });

export class ControllerResolver {
  constructor() {
    this.compiled = null;
    this.held = new Set();
    this.axes = [0, 0, 0, 0];
    this.now = 0;
    // Presses since the last resolve, oldest first: { button, held, axes }.
    this.queue = [];
    // Held button -> { entry, modified, stale }: the action its press went
    // to (null for none), whether it was a combination, or stale.
    this.owners = new Map();
    // 'hold' bindings waiting for their threshold: { entry, button, at, place }.
    this.holds = [];
    // When each button was last pressed (for the most recent modifier).
    this.pressAt = new Map();
    this.lastPlace = null;
    this.prev = { runLeft: false, runRight: false, down: false };
    this.frame = { held: {}, pressed: {}, dash: 0, place: null };
  }

  // Uses `compiled` (compileProfile) from now on. A profile for another
  // fighter starts from a reset: nothing of the last fighter's input
  // carries over.
  setProfile(compiled) {
    if (compiled === this.compiled) return;
    const other = (this.compiled?.character ?? null) !== (compiled?.character ?? null) || !this.compiled;
    this.compiled = compiled;
    if (other) this.reset();
  }

  // Forgets every pending press and marks every button held now as stale
  // (ignored until let go): the button that closed a menu (or a press made
  // for the last fighter) never jumps, Dashes or attacks. A stick held now
  // still moves: movement stays as responsive as the stick is.
  reset() {
    this.queue.length = 0;
    this.holds.length = 0;
    this.owners = new Map([...this.held].map((b) => [b, STALE]));
    this.lastPlace = null;
    this.prev = { runLeft: false, runRight: false, down: false };
  }

  // Drops every press not resolved yet (and every hold not reached yet),
  // keeping what is held as it is.
  flush() {
    this.queue.length = 0;
    this.holds.length = 0;
  }

  // The controller is gone: every button let go, every stick centred,
  // nothing pending. Nothing stays held (no endless run, no stuck Shield).
  release() {
    this.held = new Set();
    this.axes = [0, 0, 0, 0];
    this.queue.length = 0;
    this.holds.length = 0;
    this.owners.clear();
    this.prev = { runLeft: false, runRight: false, down: false };
  }

  // Takes one poll of Player 1's controller ({ held, pressed, axes }, at
  // `now` seconds): presses queue for the next resolve, released buttons
  // lose their owner. With `gameplay`, a press of the Pause binding is
  // taken here, never queued: returns { pause } when one was.
  record(state, now, { gameplay = true } = {}) {
    this.now = now;
    for (const b of [...this.owners.keys()]) if (!state.held.has(b)) this.owners.delete(b);
    this.holds = this.holds.filter((h) => state.held.has(h.button));
    let pause = false;
    const p = this.compiled?.pause ?? DEFAULT_PAUSE;
    for (const button of state.pressed) {
      this.pressAt.set(button, now);
      if (gameplay && button === p.button && (!p.modifier || state.held.has(p.modifier))) {
        pause = true;
        this.owners.set(button, PAUSED);
        continue;
      }
      this.queue.push({ button, held: new Set(state.held), axes: [...state.axes] });
    }
    this.held = state.held;
    this.axes = state.axes;
    return { pause };
  }

  // The binding a press goes to in `place`: { entry, modified } (entry
  // null for none). See rules 3 and 4.
  winner(press, place) {
    const c = this.compiled;
    const mods = [...press.held]
      .filter((b) => b !== press.button && c.pairs.has(`${b}+${press.button}`))
      .sort((a, b) => (this.pressAt.get(b) ?? 0) - (this.pressAt.get(a) ?? 0));
    const modifier = mods[0] ?? null;
    const [x, y] = movementVector(c.source, press.held, press.axes);
    let best = null;
    for (const entry of c.byButton.get(press.button) ?? []) {
      if (entry.modifier !== modifier || !placeOk(entry, place) || !directionMet(entry.direction, x, y)) continue;
      if (!best || entry.rank > best.rank) best = entry;
    }
    return { entry: best, modified: modifier !== null };
  }

  // The Dash direction for a stick at `axes` (and these buttons held):
  // where it leans, else the fighter's facing.
  aim(held, axes, facing) {
    const [x] = movementVector(this.compiled.source, held, axes);
    if (Math.abs(x) > DASH_AIM_THRESHOLD) return Math.sign(x);
    return facing < 0 ? -1 : 1;
  }

  // `entry` acts now (its press, or its hold reaching the threshold).
  fire(entry, place, held, axes, facing) {
    const f = this.frame;
    switch (entry.kind) {
      case 'jump': f.pressed.jump = true; break;
      case 'shield': f.pressed.shield = true; break;
      case 'fastFall': f.pressed.down = true; break;
      case 'deflect': if (place === 'air') f.pressed.shield = true; break;
      case 'dash': f.dash = this.aim(held, axes, facing); break;
      case 'attack':
        f.pressed[entry.control] = true;
        f.place = place;
        break;
      default: break;
    }
  }

  // A held button nobody, or a finished press, owns is offered to the new
  // place's held actions as the fighter lands or leaves the ground (a
  // Deflect's button still held on landing raises the Shield, as a held
  // Shield key does). A combination's button never is.
  reoffer(place, x, y) {
    for (const [button, owner] of this.owners) {
      if (owner.modified || owner.stale) continue;
      if (owner.entry && owner.entry.activation === 'continuous') continue;
      const entry = (this.compiled.byButton.get(button) ?? []).find((e) =>
        !e.modifier && e.activation === 'continuous' && placeOk(e, place) && directionMet(e.direction, x, y));
      if (entry) this.owners.set(button, { entry, modified: false, stale: false });
    }
  }

  // This step's controller input for a fighter `context` ({ grounded,
  // facing }): { held, pressed, dash, place }, `held` and `pressed` keyed by
  // control codename (a control missing or false is not held / pressed),
  // `dash` -1 / 0 / 1, `place` where its combat presses were resolved
  // ('ground' / 'air', or null for none). The same objects every call: no
  // allocation in the simulation loop for them.
  resolve(context = {}) {
    const f = this.frame;
    for (const k in f.held) f.held[k] = false;
    for (const k in f.pressed) f.pressed[k] = false;
    f.dash = 0;
    f.place = null;
    const c = this.compiled;
    if (!c) {
      this.queue.length = 0;
      return f;
    }
    const place = context.grounded === false ? 'air' : 'ground';
    const facing = context.facing ?? 1;
    const [x, y] = movementVector(c.source, this.held, this.axes);
    if (this.lastPlace && this.lastPlace !== place) this.reoffer(place, x, y);
    this.lastPlace = place;

    let suppressDown = false;
    for (const press of this.queue) {
      const { entry, modified } = this.winner(press, place);
      if (this.held.has(press.button) && !this.owners.get(press.button)?.stale) {
        this.owners.set(press.button, { entry, modified, stale: false });
      }
      if (!entry) continue;
      if (entry.activation === 'hold') {
        this.holds.push({ entry, button: press.button, at: this.now, place });
        continue;
      }
      this.fire(entry, place, press.held, press.axes, facing);
      if (entry.direction === 'down' && entry.kind !== 'fastFall') suppressDown = true;
    }
    this.queue.length = 0;

    // Hold-to-activate: once, at the threshold, still in the place it was
    // pressed in and with its modifier still held.
    if (this.holds.length) this.holds = this.holds.filter((h) => {
      if (h.place !== place && h.entry.place !== 'both') return false;
      if (h.entry.modifier && !this.held.has(h.entry.modifier)) return false;
      if (this.now - h.at < HOLD_THRESHOLD - 1e-6) return true;
      this.fire(h.entry, place, this.held, this.axes, facing);
      return false;
    });

    // Held actions: only while their own press is held (and its modifier).
    for (const owner of this.owners.values()) {
      const e = owner.entry;
      if (!e || (e.modifier && !this.held.has(e.modifier))) continue;
      if (e.kind === 'jump') f.held.jump = true;
      else if (e.kind === 'shield') f.held.shield = true;
      else if (e.kind === 'fastFall') f.held.down = true;
      else if (e.kind === 'attack' && e.place === place) f.held[e.control] = true;
    }

    f.held.runLeft = x < -RUN_THRESHOLD;
    f.held.runRight = x > RUN_THRESHOLD;
    for (const e of c.directionOnly) {
      if (e.kind === 'fastFall' && !(suppressDown && e.direction === 'down') && directionHeld(e.direction, x, y)) f.held.down = true;
    }
    for (const k of ['runLeft', 'runRight', 'down']) {
      const on = !!f.held[k];
      if (on && !this.prev[k]) f.pressed[k] = true;
      this.prev[k] = on;
    }
    return f;
  }
}
