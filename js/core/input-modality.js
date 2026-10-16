// Input modality: what the player last drove the interface with, kept on
// <html> so the stylesheet can tell a real mouse hover from navigation focus
// (docs/systems/input.md, "Interaction states"):
//
//   mouse     a mouse or pen moved or pressed. html.is-pointer-input: focus
//             rings stay hidden. Focus may still follow the pointer (the
//             navigator moves it on hover), invisibly, so the keys pick up
//             where the pointer was.
//   touch     a finger pressed. html.is-pointer-input and html.is-touch-input:
//             no focus rings and no hover look at all, so a tap never leaves
//             a sticky highlight.
//   keyboard  a key was pressed, and
//   gamepad   a controller drove a menu: neither class, so the focused
//             control shows the focus ring. The controller cursor's own
//             hover look is .is-cursor-target (js/ui/controller-cursor.js).
//
// html[data-input] names the modality. A page starts in mouse modality (touch
// on a device whose primary pointer cannot hover), so nothing shows a ring
// until a key or a controller is used.

export const MODALITIES = Object.freeze(['mouse', 'touch', 'keyboard', 'gamepad']);

// Keys that never navigate by themselves: holding one changes nothing.
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);

let current = null;

function root() {
  return globalThis.document?.documentElement ?? null;
}

// Sets the modality (one of MODALITIES); an unknown value is ignored.
export function setInputModality(kind) {
  if (!MODALITIES.includes(kind)) return;
  current = kind;
  const html = root();
  if (!html?.classList) return;
  html.classList.toggle('is-pointer-input', kind === 'mouse' || kind === 'touch');
  html.classList.toggle('is-touch-input', kind === 'touch');
  if (html.dataset) html.dataset.input = kind;
}

export function inputModality() {
  return current;
}

// The modality a page starts in: touch where the primary pointer cannot
// hover (a phone or tablet), else mouse.
export function initialModality() {
  const coarse = globalThis.window?.matchMedia?.('(hover: none)')?.matches;
  return coarse ? 'touch' : 'mouse';
}

// The modality a pointer event stands for.
export function pointerModality(event) {
  return event?.pointerType === 'touch' ? 'touch' : 'mouse';
}

// Whether a keydown is a navigation key press (modifier keys alone are not).
export function isNavigationKey(event) {
  return !MODIFIER_KEYS.has(event?.key);
}
