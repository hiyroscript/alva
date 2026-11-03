// One player's input for one simulation step, as Online Play sends it: a
// whole number whose bits are the fields of the input snapshot a
// PlayerController hands its Fighter (js/game/fighters/fighter-
// controller.js blankInput, less the training CPU's own dropPressed, as
// InputManager.sample makes it).
//
// That snapshot is all a fighter reads from its player each step: every
// held control and its one-step `…Pressed` edge, the two one-step Dash
// requests, and where a game controller's combat presses were made for
// (pressedOnGround / pressedInAir). It holds no analog value: the sticks
// are already resolved into control codenames (a direction held, a right
// stick push as a press) by the controller resolver before the snapshot is
// made, so the frame carries everything a step of play depends on, and the
// remote fighter plays from exactly what the local one did. 26 bits today;
// the frame refuses to be built past 31 (one JavaScript integer).

import { HELD_CONTROLS } from '../game/fighters/fighter-controller.js';

// The frame's fields, bit 0 first: each held control, each one's press
// edge, the Dash requests, and where the presses were made for.
export const FRAME_FIELDS = Object.freeze([
  ...HELD_CONTROLS,
  ...HELD_CONTROLS.map((control) => `${control}Pressed`),
  'mouvementLeftPressed', 'mouvementRightPressed',
  'pressedOnGround', 'pressedInAir',
]);
if (FRAME_FIELDS.length > 31) throw new Error(`[Alva] An online input frame has ${FRAME_FIELDS.length} fields; at most 31 fit.`);

const BIT = Object.freeze(Object.fromEntries(FRAME_FIELDS.map((field, i) => [field, 1 << i])));

// The bits that are only held state: what a flush keeps (see
// LockstepSession.flushSlot). Every press, Dash request and the presses'
// place go.
export const HELD_MASK = HELD_CONTROLS.reduce((bits, control) => bits | BIT[control], 0);

// A neutral frame object with every field false, in the shape a player's
// sample has.
export function blankFrame() {
  return Object.fromEntries(FRAME_FIELDS.map((field) => [field, false]));
}

// `input` (a snapshot) as a frame's bits.
export function encodeFrame(input) {
  let bits = 0;
  if (!input) return 0;
  for (const field of FRAME_FIELDS) if (input[field]) bits |= BIT[field];
  return bits >>> 0;
}

// Frame `bits` into `out` (a snapshot object, reused: the simulation loop
// allocates nothing), every field set.
export function decodeFrame(bits, out = blankFrame()) {
  for (const field of FRAME_FIELDS) out[field] = (bits & BIT[field]) !== 0;
  return out;
}

// Whether `bits` is a frame this build could have made.
export function isFrame(bits) {
  return Number.isInteger(bits) && bits >= 0 && bits < 2 ** FRAME_FIELDS.length;
}
