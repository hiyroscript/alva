// Gamepad devices: which physical controllers Alva supports, how it tells
// them apart, and the one normalized name it gives each physical button.
//
// Alva supports PlayStation (DualShock 4, DualSense) and Xbox (Xbox One,
// Xbox Series, and the older Xbox 360 pads that share their layout)
// controllers, read through the browser's Gamepad API in its "standard"
// mapping. Nothing else gets gameplay or menu support: a Nintendo pad, a
// generic pad, or a supported pad the browser exposes without the standard
// mapping is reported as unsupported (with its reason) rather than given a
// layout that might be wrong.
//
// Identification is conservative. A device's id string differs by browser,
// operating system, connection and driver:
//
//   Chrome / Edge   "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"
//                   "Xbox 360 Controller (XInput STANDARD GAMEPAD)"  (every XInput pad on Windows)
//   Firefox         "54c-ce6-DualSense Wireless Controller"  (hex, leading zeroes dropped)
//   Safari          "DualSense Wireless Controller"
//
// The USB vendor id decides first (Sony 054c is PlayStation, Microsoft
// 045e is Xbox), then a known product name in the text, then XInput (the
// Xbox controller protocol itself). A name like "Wireless Controller" with
// no vendor is not enough to call a pad PlayStation, so it stays
// unidentified.
//
// Buttons go by position, never by a family's own name, so one layout works
// on both families: south is Cross on a PlayStation pad and A on an Xbox
// pad. buttonLabel() gives the family's own name for display.

// The standard mapping's buttons, by index, as normalized ids.
export const PAD_BUTTONS = Object.freeze([
  'south', 'east', 'west', 'north',
  'l1', 'r1', 'l2', 'r2',
  'select', 'start', 'l3', 'r3',
  'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
]);

// The analog triggers (read with a threshold, not their digital bit).
export const TRIGGERS = Object.freeze(['l2', 'r2']);

// The D-pad's buttons.
export const DPAD_BUTTONS = Object.freeze(['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight']);

// The supported families.
export const FAMILIES = Object.freeze(['playstation', 'xbox']);

// The family shown when no supported controller is connected.
export const DEFAULT_FAMILY = 'playstation';

const SONY = 0x054c;
const MICROSOFT = 0x045e;
const NINTENDO = 0x057e;

// Known products: [family, model] by USB product id.
const PRODUCTS = Object.freeze({
  [SONY]: Object.freeze({
    0x05c4: 'dualshock4',
    0x09cc: 'dualshock4',
    0x0ba0: 'dualshock4',
    0x0ce6: 'dualsense',
    0x0df2: 'dualsenseEdge',
  }),
  [MICROSOFT]: Object.freeze({
    0x028e: 'xbox360',
    0x0719: 'xbox360',
    0x02d1: 'xboxOne',
    0x02dd: 'xboxOne',
    0x02ea: 'xboxOne',
    0x02fd: 'xboxOne',
    0x0b20: 'xboxOne',
    0x02e3: 'xboxElite',
    0x0b00: 'xboxElite',
    0x0b05: 'xboxElite',
    0x0b22: 'xboxElite',
    0x0b12: 'xboxSeries',
    0x0b13: 'xboxSeries',
    0x0b0a: 'xboxAdaptive',
    0x0b21: 'xboxAdaptive',
  }),
});

// Each model's family, and its own product name (a proper name, never
// translated). The generic models have no name of their own: they are
// shown as "PlayStation controller" / "Xbox controller" in the interface
// language.
export const MODELS = Object.freeze({
  dualshock4: Object.freeze({ family: 'playstation', name: 'DualShock 4 Wireless Controller' }),
  dualsense: Object.freeze({ family: 'playstation', name: 'DualSense Wireless Controller' }),
  dualsenseEdge: Object.freeze({ family: 'playstation', name: 'DualSense Edge Wireless Controller' }),
  playstation: Object.freeze({ family: 'playstation', name: null }),
  xbox360: Object.freeze({ family: 'xbox', name: 'Xbox 360 Controller' }),
  xboxOne: Object.freeze({ family: 'xbox', name: 'Xbox One Controller' }),
  xboxElite: Object.freeze({ family: 'xbox', name: 'Xbox Elite Wireless Controller' }),
  xboxSeries: Object.freeze({ family: 'xbox', name: 'Xbox Wireless Controller' }),
  xboxAdaptive: Object.freeze({ family: 'xbox', name: 'Xbox Adaptive Controller' }),
  xbox: Object.freeze({ family: 'xbox', name: null }),
});

// Why a device gets no support: a Nintendo pad, a pad nothing identifies,
// or a supported family exposed without the standard mapping (its button
// numbers could mean anything).
export const UNSUPPORTED_REASONS = Object.freeze(['nintendo', 'unidentified', 'layout']);

// The vendor and product a device's id string carries, as numbers, or null.
export function parseVendorProduct(id) {
  const text = String(id ?? '');
  const chrome = text.match(/Vendor:\s*([0-9a-f]{1,4})\s+Product:\s*([0-9a-f]{1,4})/i);
  if (chrome) return { vendor: parseInt(chrome[1], 16), product: parseInt(chrome[2], 16) };
  const firefox = text.match(/^\s*([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i);
  if (firefox) return { vendor: parseInt(firefox[1], 16), product: parseInt(firefox[2], 16) };
  return null;
}

// The device's own name with the browser's decoration removed: no
// "(STANDARD GAMEPAD Vendor: ...)" suffix, no Firefox "54c-ce6-" prefix.
export function cleanDeviceName(id) {
  return String(id ?? '')
    .replace(/^\s*[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, '')
    .replace(/\s*\((?:[^()]*(?:STANDARD GAMEPAD|Vendor:|XInput)[^()]*)\)\s*$/i, '')
    .trim();
}

// The model a device's text names, or null.
function modelFromText(text) {
  if (/dualsense\s*edge/i.test(text)) return 'dualsenseEdge';
  if (/dualsense/i.test(text)) return 'dualsense';
  if (/dualshock\s*4/i.test(text)) return 'dualshock4';
  if (/\b(dualshock|playstation|ps[345])\b/i.test(text)) return 'playstation';
  if (/xbox\s*series/i.test(text)) return 'xboxSeries';
  if (/xbox\s*one/i.test(text)) return 'xboxOne';
  if (/xbox\s*elite/i.test(text)) return 'xboxElite';
  if (/xbox\s*adaptive/i.test(text)) return 'xboxAdaptive';
  // XInput is the Xbox controller protocol: Chrome names every XInput pad
  // "Xbox 360 Controller", so only the family is certain.
  if (/xinput/i.test(text)) return 'xbox';
  if (/xbox\s*360/i.test(text)) return 'xbox360';
  if (/\b(xbox|microsoft)\b/i.test(text)) return 'xbox';
  return null;
}

const NINTENDO_TEXT = /nintendo|joy-?con|pro controller|switch/i;

// What `pad` (a Gamepad, or anything with `id`, `mapping` and `buttons`)
// is: { supported, family, model, reason }. `family` is 'playstation' or
// 'xbox' only when certain; `reason` says why an unsupported one is not
// supported (UNSUPPORTED_REASONS).
export function identifyController(pad) {
  const id = String(pad?.id ?? '');
  const ids = parseVendorProduct(id);
  let model = null;
  if (ids?.vendor === NINTENDO || (!ids && NINTENDO_TEXT.test(id))) {
    return { supported: false, family: null, model: null, reason: 'nintendo' };
  }
  if (ids && (ids.vendor === SONY || ids.vendor === MICROSOFT)) {
    model = PRODUCTS[ids.vendor][ids.product] ?? modelFromText(id) ?? (ids.vendor === SONY ? 'playstation' : 'xbox');
    // A text naming the other family never overrides the vendor.
    if (MODELS[model].family !== (ids.vendor === SONY ? 'playstation' : 'xbox')) model = ids.vendor === SONY ? 'playstation' : 'xbox';
  } else if (!ids) {
    model = modelFromText(id);
  }
  if (!model) return { supported: false, family: null, model: null, reason: 'unidentified' };
  const { family } = MODELS[model];
  // A supported family is only usable through the standard mapping, which
  // fixes what each button index is.
  const standard = pad?.mapping === 'standard' && (pad?.buttons?.length ?? 0) >= PAD_BUTTONS.length;
  if (!standard) return { supported: false, family, model, reason: 'layout' };
  return { supported: true, family, model, reason: null };
}

// ---- Button names ------------------------------------------------------------------

// Each family's names for its buttons that are codes, the same in every
// language (the rest are translated: see buttonLabelKey).
const CODES = Object.freeze({
  playstation: Object.freeze({
    l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', l3: 'L3', r3: 'R3', start: 'Options', select: 'Create',
  }),
  xbox: Object.freeze({
    south: 'A', east: 'B', west: 'X', north: 'Y',
    l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT', l3: 'LS', r3: 'RS', start: 'Menu',
  }),
});

// Model-specific codes: the DualShock 4 says Share where the DualSense says
// Create; the Xbox 360 pad Back and Start where later ones say View and Menu.
const MODEL_CODES = Object.freeze({
  dualshock4: Object.freeze({ select: 'Share' }),
  xbox360: Object.freeze({ select: 'Back', start: 'Start' }),
});

// The family's code for `button` (a name that is never translated, like
// "R2" or "A"), or null when the name is a word (see buttonLabelKey).
export function buttonCode(family, button, model = null) {
  return MODEL_CODES[model]?.[button] ?? CODES[family]?.[button] ?? null;
}

// The translation key for `button`'s name in `family` when it is a word
// (Cross, Circle, Square, Triangle, View, the D-pad), else null.
export function buttonLabelKey(family, button, model = null) {
  if (buttonCode(family, button, model)) return null;
  if (DPAD_BUTTONS.includes(button)) return `pad.${button}`;
  return `pad.${family}.${button}`;
}

// The short glyph drawn for a button on the controller diagram and in
// binding chips: PlayStation's face symbols, Xbox's letters, the codes.
const FACE_GLYPHS = Object.freeze({
  playstation: Object.freeze({ south: '✕', east: '○', west: '□', north: '△' }),
});
const DPAD_GLYPHS = Object.freeze({ dpadUp: '↑', dpadDown: '↓', dpadLeft: '←', dpadRight: '→' });

export function buttonGlyph(family, button, model = null) {
  return FACE_GLYPHS[family]?.[button] ?? DPAD_GLYPHS[button] ?? buttonCode(family, button, model) ?? '';
}
