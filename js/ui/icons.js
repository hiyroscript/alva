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
  transform: svg('<path d="M12 2.5l2.3 7.2 7.2 2.3-7.2 2.3-2.3 7.2-2.3-7.2-7.2-2.3 7.2-2.3z"/>', { fill: true }),
  // The universal Shield button's glyph (see js/game/touch-controls.js). A
  // fighter's own combat buttons show frames of its own art instead (see
  // js/ui/mobile-abilities.js).
  shield: svg('<path d="M12 3C10 4.4 7.6 5.2 5.2 5.5Q4.4 5.6 4.4 6.4V10C4.4 15.2 7.6 18.8 12 21C16.4 18.8 19.6 15.2 19.6 10V6.4Q19.6 5.6 18.8 5.5C16.4 5.2 14 4.4 12 3Z"/>'),
  // Neutral stand-ins for a combat button with no frame of a fighter's art
  // to show (no fighter named yet, a button the layout editor shows for a
  // fighter that lacks it, a frame that fails to load): a ring for the large
  // extra_attack button, and one to five pips for the numbered attack
  // buttons, attack1 to attack5.
  ring: svg('<circle cx="12" cy="12" r="6.5"/>'),
  pip1: svg('<circle cx="12" cy="12" r="3.6"/>', { fill: true }),
  pip2: svg('<circle cx="7.4" cy="12" r="3.3"/><circle cx="16.6" cy="12" r="3.3"/>', { fill: true }),
  pip3: svg('<circle cx="12" cy="6.8" r="3"/><circle cx="7" cy="15.4" r="3"/><circle cx="17" cy="15.4" r="3"/>', { fill: true }),
  pip4: svg('<circle cx="7.4" cy="7.4" r="2.9"/><circle cx="16.6" cy="7.4" r="2.9"/><circle cx="7.4" cy="16.6" r="2.9"/><circle cx="16.6" cy="16.6" r="2.9"/>', { fill: true }),
  pip5: svg('<circle cx="6.4" cy="6.4" r="2.6"/><circle cx="17.6" cy="6.4" r="2.6"/><circle cx="12" cy="12" r="2.6"/><circle cx="6.4" cy="17.6" r="2.6"/><circle cx="17.6" cy="17.6" r="2.6"/>', { fill: true }),
  pause: svg('<path d="M9 5.5v13M15 5.5v13"/>'),
  // Three dots: Practice Ground's More button.
  more: svg('<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>', { fill: true }),
  back: svg('<path d="M14.5 5 7.5 12l7 7"/>'),
  // Home's Settings button: an eight-toothed gear round a hub.
  settings: svg(
    '<path d="M10.34 5.1L10.66 2.49L13.34 2.49L13.66 5.1A7.1 7.1 0 0 1 15.71 5.95L17.78 4.33L19.67 6.22L18.05 8.29' +
      'A7.1 7.1 0 0 1 18.9 10.34L21.51 10.66L21.51 13.34L18.9 13.66A7.1 7.1 0 0 1 18.05 15.71L19.67 17.78L17.78 19.67' +
      'L15.71 18.05A7.1 7.1 0 0 1 13.66 18.9L13.34 21.51L10.66 21.51L10.34 18.9A7.1 7.1 0 0 1 8.29 18.05L6.22 19.67' +
      'L4.33 17.78L5.95 15.71A7.1 7.1 0 0 1 5.1 13.66L2.49 13.34L2.49 10.66L5.1 10.34A7.1 7.1 0 0 1 5.95 8.29L4.33 6.22' +
      'L6.22 4.33L8.29 5.95A7.1 7.1 0 0 1 10.34 5.1Z"/><circle cx="12" cy="12" r="3.2"/>',
  ),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  // Reset to defaults: an arrow turning back on itself.
  reset: svg('<path d="M5.5 12a6.5 6.5 0 1 0 1.9-4.6"/><path d="M5 4.5v4h4"/>'),
  minus: svg('<path d="M6 12h12"/>'),
  plus: svg('<path d="M6 12h12M12 6v12"/>'),
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
