// Original inline SVG icons (simple geometric shapes, stroked in currentColor).

const svg = (body, { fill = false, vb = 24 } = {}) =>
  `<svg viewBox="0 0 ${vb} ${vb}" aria-hidden="true" focusable="false" class="icon${fill ? ' icon--fill' : ''}">${body}</svg>`;

export const ICONS = {
  left: svg('<path d="M15 4.5 7.5 12 15 19.5"/>'),
  right: svg('<path d="M9 4.5 16.5 12 9 19.5"/>'),
  arrow: svg('<path d="M4.5 12h15"/><path d="M13.5 6l6 6-6 6"/>'),
  down: svg('<path d="M4.5 9 12 16.5 19.5 9"/>'),
  up: svg('<path d="M4.5 15 12 7.5 19.5 15"/>'),
  jump: svg('<path d="M12 17.5V5.5"/><path d="M6.5 11 12 5.5l5.5 5.5"/><path d="M5 20.5h14"/>'),
  special: svg('<path d="M12 2.5l2.3 7.2 7.2 2.3-7.2 2.3-2.3 7.2-2.3-7.2-7.2-2.3 7.2-2.3z"/>', { fill: true }),
  // Ability glyphs for the touch combat buttons (see js/ui/mobile-abilities.js).
  // Shield is the universal defensive button's; shuriken, punch and kick are
  // #0001's own, picked by its mobileAbilities.
  shield: svg('<path d="M12 3C10 4.4 7.6 5.2 5.2 5.5Q4.4 5.6 4.4 6.4V10C4.4 15.2 7.6 18.8 12 21C16.4 18.8 19.6 15.2 19.6 10V6.4Q19.6 5.6 18.8 5.5C16.4 5.2 14 4.4 12 3Z"/>'),
  // Four hooked blades around a hole: one blade turned four times.
  shuriken: svg(
    '<path fill-rule="evenodd" d="M10.2 9.4C11.6 7.6 11.7 5 11 2C13.2 3 15.6 5.6 15.9 8.4L14.6 10.2C16.4 11.6 19 11.7 22 11' +
      'C21 13.2 18.4 15.6 15.6 15.9L13.8 14.6C12.4 16.4 12.3 19 13 22C10.8 21 8.4 18.4 8.1 15.6L9.4 13.8C7.6 12.4 5 12.3 2 13' +
      'C3 10.8 5.6 8.4 8.4 8.1ZM13.6 12a1.6 1.6 0 1 0-3.2 0 1.6 1.6 0 1 0 3.2 0Z"/>',
    { fill: true },
  ),
  // A fist driven up and to the right, wrist at the lower left.
  punch: svg(
    '<path d="M4.2 18.5C1.6 15.2 1.6 14.9 4 13.1C5.1 12.2 6.3 11 6.6 10.4C7.4 8.9 10.1 6 10.7 6C11 6 12.1 5.5 13.1 5' +
      'C14.9 3.9 14.9 3.9 15.8 4.8C16.4 5.3 17 5.5 17.4 5.4C19.2 5 22.6 10.3 21.7 12.1C21.3 12.8 21.2 12.8 20.5 10.9' +
      'C20.1 9.8 19.7 9 19.6 9.1C19.6 9.2 19.8 9.9 20.1 10.6C20.7 12.2 20.4 13.2 19.1 13.9C18.1 14.4 17.4 14 18 13.3' +
      'C18.5 12.7 18.2 10.3 17.4 9C17.1 8.5 16.9 8.3 17 8.7C18 12.1 18.1 12.5 17.3 13.2C16.4 14.1 14.6 13.5 14.9 12.4' +
      'C15.1 11.7 13.6 7.7 13.2 8C13.2 8.1 13.4 9 13.9 10.1C14.8 12.5 14.7 12.7 12.5 12.6C10.8 12.5 10.7 12.4 10.1 11' +
      'C9.6 9.9 9.4 9.8 9.4 10.4C9.3 12.3 10 13.1 11.6 13.1C14.1 13.1 16.2 14.2 16.1 15.3C16 16 15.7 16.4 15.1 16.4' +
      'C14.3 16.6 14.2 16.4 14.4 15.7C14.7 14.8 14.7 14.8 14 15.6C12.8 17 8.6 17.1 7.1 15.9C5.7 14.7 5.7 15.1 7.1 16.5' +
      'L8.2 17.5L6.8 18.7L5.3 19.9L4.2 18.5Z"/>',
    { fill: true },
  ),
  // A leg swung up to the upper right, foot pointed at the lower left.
  kick: svg(
    '<path d="M9.1 21.6C8.8 21.5 8.1 21 7.5 20.5C7 20 5.7 19.3 4.7 19C2.6 18.3 2.5 18.2 3.7 16.3C4.4 15.2 4.7 14.9 5.8 14.9' +
      'C7.3 14.9 8.1 14.4 11.5 11.3C12.7 10.2 14.6 8.5 15.7 7.5C16.9 6.5 18.1 5.1 18.6 4.2C19.5 2.3 19.7 2.1 20.3 2.4' +
      'C21.2 3 21.6 4.3 21.1 5.7C20.8 6.5 20.7 7.5 20.7 8C20.9 9.4 19.9 11.1 18.4 12C16.4 13.3 14.3 15.8 13.5 18.1' +
      'C12.4 21.1 10.9 22.3 9.1 21.6Z"/>',
    { fill: true },
  ),
  // Neutral stand-ins for a fighter that authors no mobileAbilities: a ring
  // for the large top button, one and two pips for the two basic attacks.
  ring: svg('<circle cx="12" cy="12" r="6.5"/>'),
  pip1: svg('<circle cx="12" cy="12" r="3.6"/>', { fill: true }),
  pip2: svg('<circle cx="7.4" cy="12" r="3.3"/><circle cx="16.6" cy="12" r="3.3"/>', { fill: true }),
  pause: svg('<path d="M9 5.5v13M15 5.5v13"/>'),
  // Three dots: Practice Ground's More button.
  more: svg('<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>', { fill: true }),
  back: svg('<path d="M14.5 5 7.5 12l7 7"/>'),
  lock: svg('<rect x="5.5" y="10.5" width="13" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  check: svg('<path d="M5 12.5 10 17.5 19 7"/>'),
  rotate: svg(
    '<rect x="16" y="10" width="18" height="30" rx="3"/><path d="M22 36h6"/>' +
      '<path d="M8 22a18 18 0 0 1 10-14"/><path d="M13 6.5 18 8l-1.8 4.8"/>' +
      '<rect x="10" y="30" width="30" height="16" rx="3" opacity=".45"/>',
    { vb: 48 },
  ),
  silhouette: svg(
    '<circle cx="24" cy="15" r="7"/><path d="M11 46c0-10 5.5-18 13-18s13 8 13 18z"/>',
    { fill: true, vb: 48 },
  ),
};
