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
  primary: svg('<path d="M12 2.8l2 5.6 5.8-1.6-3.1 5.1 4.6 3.7-5.9.6.3 5.9-3.7-4.6-3.7 4.6.3-5.9-5.9-.6 4.6-3.7-3.1-5.1 5.8 1.6z"/>', { fill: true }),
  special: svg('<path d="M12 2.5l2.3 7.2 7.2 2.3-7.2 2.3-2.3 7.2-2.3-7.2-7.2-2.3 7.2-2.3z"/>', { fill: true }),
  pause: svg('<path d="M9 5.5v13M15 5.5v13"/>'),
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
