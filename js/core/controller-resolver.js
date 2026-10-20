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
//   2. One owner per press. Every press of a button (or push of a stick
//      in a direction) goes to at most one action, and that action owns it
//      until it is let go: a held action (Jump, the Shield, a held Fast
//      fall) is held only while its own press is, so a button a
//      combination used never raises the Shield, even after the modifier
//      is let go. Release and press again.
//   3. Modifier first. A button pressed (or a stick pushed) while a
//      modifier is held (R2 before Square, or both in the same sample) is
//      that combination and nothing else: R2 + Square is never Square
//      alone, and where the combination means nothing in this place the
//      press does nothing. A combination is never read back into an
//      earlier press: Square then R2 is Square. Plain presses never wait
//      for a possible modifier, so no ordinary action is delayed.
//   4. Direction. A binding's direction is read on its own stick (the left
//      stick, the right stick, the D-pad, or the left stick or D-pad),
//      never on whatever moves the fighter. Among the bindings of a press,
//      a stick direction (Down + Square) beats left-or-right, which beats
//      anywhere. Directions are read with a dominant-axis rule: a stick
//      past DIRECTION_DEADZONE points down when it is at least as far down
//      as it is sideways. 'forward' and 'back' are read against the
//      fighter's facing at that step. A directional press never doubles as
//      a held stick input on its own step.
//   5. Stick inputs. A stick direction can be an input of its own. Pushed
//      past DIRECTION_DEADZONE it is one press, in the one direction its
//      dominant axis gives, and stays that press, whatever wobble, until
//      the stick comes back under STICK_RELEASE: nothing repeats while it
//      is held, a stick drifting near the middle never presses, and
//      each stick is read apart, so both can be pushed at once. A
//      continuous stick input (a Fast fall on the stick) is held while its
//      axis is past RUN_THRESHOLD, exactly as running reads it.
//   6. Activation. 'press' acts as the input goes down, 'hold' once it has
//      been held HOLD_THRESHOLD (a tap does nothing), 'continuous' holds
//      its control while the input stays held. Nothing repeats while held.
//
// A press from before the resolver was reset (a menu closed, the fighter
// changed, Player 1's controller changed) is stale: ignored until let go,
// so the button that closed a menu never jumps or attacks. A stick pushed
// then still moves the fighter, but its stick inputs wait for it to be let
// go too.

import {
  HOLD_THRESHOLD, directionRank, directionsMeet, stickAtoms, STICKS, UNIVERSAL_DEFAULTS,
} from '../data/controller-profiles.js';

// A stick component this far out holds a direction (running, and a
// continuous stick input such as the Fast fall on the stick).
export const RUN_THRESHOLD = 0.45;
// How far out a stick must be for a binding's direction to count, and for
// a stick input to press.
export const DIRECTION_DEADZONE = 0.5;
// How far back toward the middle a pushed stick must come for its stick
// input to be let go (below DIRECTION_DEADZONE, so a stick resting near the
// edge of it never flickers).
export const STICK_RELEASE = 0.35;
// A Dash goes the way the stick leans this far, else the way the fighter
// faces.
export const DASH_AIM_THRESHOLD = 0.3;

const STALE = Object.freeze({ entry: null, modified: true, stale: true });
const PAUSED = Object.freeze({ entry: null, modified: true, stale: false });

// The direction vector [x, y] (x right, y down) of `source` (a stick or
// the D-pad, STICKS) for the buttons `held` and the stick `axes`. The left
// stick or D-pad reads each axis from the D-pad while it is pressed that
// way, else from the stick, so the D-pad's up never stops a run on the
// stick.
export function movementVector(source, held, axes) {
  const pad = () => [
    (held.has('dpadRight') ? 1 : 0) - (held.has('dpadLeft') ? 1 : 0),
    (held.has('dpadDown') ? 1 : 0) - (held.has('dpadUp') ? 1 : 0),
  ];
  if (source === 'dpad') return pad();
  if (source === 'rightStick') return [axes[2] ?? 0, axes[3] ?? 0];
  if (source === 'leftStickDpad') {
    const [x, y] = pad();
    return [x || (axes[0] ?? 0), y || (axes[1] ?? 0)];
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

// `direction` as a side of the stick for a fighter facing `facing` (1
// right, -1 left): 'forward' is the side it faces, 'back' the other.
export function sideOf(direction, facing = 1) {
  if (direction === 'forward') return facing < 0 ? 'left' : 'right';
  if (direction === 'back') return facing < 0 ? 'right' : 'left';
  return direction;
}

// Whether a binding's `direction` is met by a stick pointing `side` (one
// of stickDirection's, or null), for a fighter facing `facing`.
export function sideMeets(direction, side, facing = 1) {
  if (direction === null) return true;
  if (side === null) return false;
  if (direction === 'horizontal') return side === 'left' || side === 'right';
  return sideOf(direction, facing) === side;
}

// Whether a binding's `direction` is met by the stick at [x, y].
export function directionMet(direction, x, y, facing = 1) {
  return sideMeets(direction, stickDirection(x, y), facing);
}

// Whether a continuous stick input's `direction` is held (a component past
// RUN_THRESHOLD, the same as running).
export function directionHeld(direction, x, y, facing = 1) {
  switch (sideOf(direction, facing)) {
    case 'down': return y > RUN_THRESHOLD;
    case 'up': return y < -RUN_THRESHOLD;
    case 'left': return x < -RUN_THRESHOLD;
    case 'right': return x > RUN_THRESHOLD;
    case 'horizontal': return Math.abs(x) > RUN_THRESHOLD;
    default: return false;
  }
}

const placeOk = (entry, place) => entry.place === 'both' || entry.place === place;

// The key a stick input's press goes by while the stick points `side`.
const stickKey = (stick, side) => `@${stick}:${side}`;
const isStickKey = (key) => key.charCodeAt(0) === 64; // '@'

// `profile` (js/data/controller-profiles.js resolveProfile) ready to
// resolve: its button bindings by button, its stick inputs by stick (those
// that press) and in a list (those held), the combinations its buttons
// use, and its Pause.
export function compileProfile(profile) {
  const entries = [];
  for (const action of profile?.actions ?? []) {
    const b = profile.bindings?.[action.id];
    if (!b || action.kind === 'move') continue;
    entries.push({
      id: action.id, kind: action.kind, control: action.control ?? null, place: action.place,
      button: b.button, modifier: b.modifier, stick: b.stick ?? null, direction: b.direction, activation: b.activation,
      rank: directionRank(b.direction),
    });
  }
  const byButton = new Map();
  const byStick = new Map();
  for (const e of entries) {
    if (e.button !== null) {
      if (!byButton.has(e.button)) byButton.set(e.button, []);
      byButton.get(e.button).push(e);
    } else if (e.activation !== 'continuous') {
      if (!byStick.has(e.stick)) byStick.set(e.stick, []);
      byStick.get(e.stick).push(e);
    }
  }
  return {
    character: profile?.character ?? null,
    source: profile?.bindings?.move?.source ?? UNIVERSAL_DEFAULTS.move.source,
    entries,
    byButton,
    byStick,
    pairs: new Set(entries.filter((e) => e.modifier && e.button !== null).map((e) => `${e.modifier}+${e.button}`)),
    heldSticks: entries.filter((e) => e.button === null && e.activation === 'continuous'),
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
    // Each stick's (and the D-pad's) pushed side, held until it comes back
    // under STICK_RELEASE, or null; and the stick-input keys held now.
    this.zones = new Map(STICKS.map((s) => [s, null]));
    this.down = new Set();
    // Presses since the last resolve, oldest first: { button (a button, or
    // a stick input's key), held, axes, stick, side }.
    this.queue = [];
    // Held button (or stick key) -> { entry, modified, stale }: the action
    // its press went to (null for none), whether it was a combination, or
    // stale.
    this.owners = new Map();
    // 'hold' bindings waiting for their threshold: { entry, button, at, place, side }.
    this.holds = [];
    // When each button was last pressed (for the most recent modifier).
    this.pressAt = new Map();
    // Continuous stick inputs held on the last step, and those held as the
    // resolver was reset (ignored until let go).
    this.sticksOn = new Set();
    this.sticksStale = new Set();
    this.lastPlace = null;
    this.lastFacing = 1;
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

  // Whether a button, or a stick input's key, is held now.
  isDown(key) {
    return isStickKey(key) ? this.down.has(key) : this.held.has(key);
  }

  // Forgets every pending press and marks every button and stick held now
  // as stale (ignored until let go): the button that closed a menu (or a
  // press made for the last fighter) never jumps, Dashes or attacks. A
  // stick held now still moves: movement stays as responsive as the stick
  // is.
  reset() {
    this.queue.length = 0;
    this.holds.length = 0;
    this.owners = new Map([...this.held, ...this.down].map((b) => [b, STALE]));
    this.sticksOn = new Set();
    this.sticksStale = new Set((this.compiled?.heldSticks ?? []).filter((e) => this.stickHeld(e, this.lastFacing)).map((e) => e.id));
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
    this.zones = new Map(STICKS.map((s) => [s, null]));
    this.down = new Set();
    this.queue.length = 0;
    this.holds.length = 0;
    this.owners.clear();
    this.sticksOn = new Set();
    this.sticksStale = new Set();
    this.prev = { runLeft: false, runRight: false, down: false };
  }

  // Takes one poll of Player 1's controller ({ held, pressed, axes }, at
  // `now` seconds): presses queue for the next resolve (a stick's too, in
  // play), released buttons and sticks lose their owner. With `gameplay`,
  // a press of the Pause binding is taken here, never queued: returns
  // { pause } when one was.
  record(state, now, { gameplay = true } = {}) {
    this.now = now;
    const pushed = [];
    const down = new Set();
    for (const s of STICKS) {
      const [x, y] = movementVector(s, state.held, state.axes);
      const was = this.zones.get(s);
      let zone = was;
      if (was === null) {
        if (Math.hypot(x, y) >= DIRECTION_DEADZONE) zone = stickDirection(x, y);
      } else if (Math.hypot(x, y) < STICK_RELEASE) {
        zone = null;
      }
      this.zones.set(s, zone);
      if (zone === null) continue;
      down.add(stickKey(s, zone));
      if (zone !== was) pushed.push([s, zone]);
    }
    this.down = down;
    const isDown = (key) => (isStickKey(key) ? down.has(key) : state.held.has(key));
    for (const b of [...this.owners.keys()]) if (!isDown(b)) this.owners.delete(b);
    this.holds = this.holds.filter((h) => isDown(h.button));
    let pause = false;
    const p = this.compiled?.pause ?? DEFAULT_PAUSE;
    for (const button of state.pressed) {
      this.pressAt.set(button, now);
      if (gameplay && button === p.button && (!p.modifier || state.held.has(p.modifier))) {
        pause = true;
        this.owners.set(button, PAUSED);
        continue;
      }
      this.queue.push({ button, held: new Set(state.held), axes: [...state.axes], stick: null, side: null });
    }
    if (gameplay) {
      for (const [stick, side] of pushed) {
        this.queue.push({ button: stickKey(stick, side), held: new Set(state.held), axes: [...state.axes], stick, side });
      }
    }
    this.held = state.held;
    this.axes = state.axes;
    return { pause };
  }

  // The most recently pressed of `held`'s buttons that `isModifier`
  // accepts, or null.
  latestModifier(held, isModifier, except = null) {
    let best = null;
    for (const b of held) {
      if (b === except || !isModifier(b)) continue;
      if (best === null || (this.pressAt.get(b) ?? 0) > (this.pressAt.get(best) ?? 0)) best = b;
    }
    return best;
  }

  // The binding a press goes to in `place`, for a fighter facing `facing`:
  // { entry, modified } (entry null for none). See rules 3 to 5.
  winner(press, place, facing) {
    const c = this.compiled;
    let candidates;
    let modifier;
    if (press.stick) {
      // A stick input: the bindings of that stick that this side meets;
      // a held button that one of them takes as its modifier makes it
      // that combination.
      candidates = (c.byStick.get(press.stick) ?? []).filter((e) => sideMeets(e.direction, press.side, facing));
      const mods = new Set(candidates.map((e) => e.modifier).filter(Boolean));
      modifier = this.latestModifier(press.held, (b) => mods.has(b));
    } else {
      candidates = c.byButton.get(press.button) ?? [];
      modifier = this.latestModifier(press.held, (b) => c.pairs.has(`${b}+${press.button}`), press.button);
    }
    let best = null;
    for (const entry of candidates) {
      if (entry.modifier !== modifier || !placeOk(entry, place)) continue;
      if (press.button !== null && !press.stick && entry.direction !== null) {
        const [x, y] = movementVector(entry.stick, press.held, press.axes);
        if (!directionMet(entry.direction, x, y, facing)) continue;
      }
      if (!best || entry.rank > best.rank) best = entry;
    }
    return { entry: best, modified: modifier !== null };
  }

  // The Dash direction for an input made with these buttons `held` and
  // sticks `axes` (`side` the side a stick input was pushed, if it was
  // one): a stick input's own left or right, else where the Movement
  // source leans, else the fighter's facing.
  aim(held, axes, facing, side = null) {
    if (side === 'left' || side === 'right') return side === 'left' ? -1 : 1;
    const [x] = movementVector(this.compiled.source, held, axes);
    if (Math.abs(x) > DASH_AIM_THRESHOLD) return Math.sign(x);
    return facing < 0 ? -1 : 1;
  }

  // `entry` acts now (its press, its hold reaching the threshold, or its
  // stick input starting to be held).
  fire(entry, place, input, facing) {
    const f = this.frame;
    switch (entry.kind) {
      case 'jump': f.pressed.jump = true; break;
      case 'shield': f.pressed.shield = true; break;
      case 'fastFall': f.pressed.down = true; break;
      case 'deflect': if (place === 'air') f.pressed.shield = true; break;
      case 'dash': f.dash = this.aim(input.held, input.axes, facing, input.side ?? null); break;
      case 'attack':
        f.pressed[entry.control] = true;
        f.place = place;
        break;
      default: break;
    }
  }

  // Whether continuous stick input `e`'s direction is held now.
  stickHeld(e, facing) {
    const [x, y] = movementVector(e.stick, this.held, this.axes);
    return directionHeld(e.direction, x, y, facing);
  }

  // A held button nobody, or a finished press, owns is offered to the new
  // place's held actions as the fighter lands or leaves the ground (a
  // Deflect's button still held on landing raises the Shield, as a held
  // Shield key does). A combination's button never is.
  reoffer(place, facing) {
    for (const [button, owner] of this.owners) {
      if (owner.modified || owner.stale || isStickKey(button)) continue;
      if (owner.entry && owner.entry.activation === 'continuous') continue;
      const entry = (this.compiled.byButton.get(button) ?? []).find((e) => {
        if (e.modifier || e.activation !== 'continuous' || !placeOk(e, place)) return false;
        if (e.direction === null) return true;
        const [x, y] = movementVector(e.stick, this.held, this.axes);
        return directionMet(e.direction, x, y, facing);
      });
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
    this.lastFacing = facing;
    if (this.lastPlace && this.lastPlace !== place) this.reoffer(place, facing);
    this.lastPlace = place;

    // The directions directional presses asked for on this step: a held
    // stick input on the same side of the same stick waits a step.
    const directed = [];
    for (const press of this.queue) {
      const { entry, modified } = this.winner(press, place, facing);
      if (this.isDown(press.button) && !this.owners.get(press.button)?.stale) {
        this.owners.set(press.button, { entry, modified, stale: false });
      }
      if (!entry) continue;
      if (entry.activation === 'hold') {
        this.holds.push({ entry, button: press.button, at: this.now, place, side: press.side });
        continue;
      }
      this.fire(entry, place, press, facing);
      if (entry.button !== null && entry.direction !== null) directed.push(entry);
    }
    this.queue.length = 0;

    // Hold-to-activate: once, at the threshold, still in the place it was
    // pressed in and with its modifier still held.
    if (this.holds.length) this.holds = this.holds.filter((h) => {
      if (h.place !== place && h.entry.place !== 'both') return false;
      if (h.entry.modifier && !this.held.has(h.entry.modifier)) return false;
      if (this.now - h.at < HOLD_THRESHOLD - 1e-6) return true;
      this.fire(h.entry, place, { held: this.held, axes: this.axes, side: h.side }, facing);
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

    const [x] = movementVector(c.source, this.held, this.axes);
    f.held.runLeft = x < -RUN_THRESHOLD;
    f.held.runRight = x > RUN_THRESHOLD;

    // Continuous stick inputs: held while their stick is (past the run
    // threshold on their axis), in their place, with their modifier; a
    // combination on that same stick direction beats the plain one. Their
    // first held step is their press.
    if (c.heldSticks.length || this.sticksOn.size) {
      for (const id of [...this.sticksStale]) {
        const e = c.heldSticks.find((x2) => x2.id === id);
        if (!e || !this.stickHeld(e, facing)) this.sticksStale.delete(id);
      }
      const met = c.heldSticks.filter((e) =>
        placeOk(e, place) && (!e.modifier || this.held.has(e.modifier)) && this.stickHeld(e, facing));
      const on = new Set();
      for (const e of met) {
        if (!e.modifier && met.some((o) => o.modifier && o.stick === e.stick && o.direction === e.direction)) continue;
        if (this.sticksStale.has(e.id)) continue;
        if (directed.some((d) => directionsMeet(d.direction, e.direction) &&
          stickAtoms(d.stick, d.direction).some((a) => stickAtoms(e.stick, e.direction).includes(a)))) continue;
        on.add(e.id);
        if (e.kind === 'jump') f.held.jump = true;
        else if (e.kind === 'shield' && place === 'ground') f.held.shield = true;
        else if (e.kind === 'fastFall') f.held.down = true;
        if (!this.sticksOn.has(e.id)) this.fire(e, place, { held: this.held, axes: this.axes, side: null }, facing);
      }
      this.sticksOn = on;
    }

    for (const k of ['runLeft', 'runRight', 'down']) {
      const on = !!f.held[k];
      if (on && !this.prev[k]) f.pressed[k] = true;
      this.prev[k] = on;
    }
    return f;
  }
}
