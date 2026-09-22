// ALVA wordmark: original geometric letterforms drawn as SVG paths, so the
// brand needs no font download and renders the same everywhere. Glyphs sit in
// a 100-unit cap-height box, counters are cut with the even-odd rule and the
// mark inherits `currentColor`.

import { CONFIG } from '../config.js';

const CAP = 100;
const STEM = 17;    // horizontal width of every stem and diagonal
const BAR = 15;     // A crossbar and L foot (slightly lighter than stems)
const SPREAD = 86;  // outer width of A and V
const APEX = 17;    // flat top of A / flat base of V
const L_WIDTH = 56;

const RUN = (SPREAD - APEX) / 2; // horizontal travel of each diagonal
const SLOPE = RUN / CAP;

const num = (v) => String(Math.round(v * 100) / 100);
const poly = (pts) => `M${pts.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}Z`;

function glyphA(x) {
  const innerL = (y) => x + RUN - SLOPE * y + STEM;
  const innerR = (y) => x + RUN + APEX + SLOPE * y - STEM;
  const barTop = 63;
  const barBottom = barTop + BAR;
  const peak = (2 * STEM - APEX) / (2 * SLOPE); // where the inner edges meet
  const outline = poly([
    [x, CAP], [x + RUN, 0], [x + RUN + APEX, 0], [x + SPREAD, CAP], [x + SPREAD - STEM, CAP],
    [innerR(barBottom), barBottom], [innerL(barBottom), barBottom], [x + STEM, CAP],
  ]);
  const counter = poly([[x + SPREAD / 2, peak], [innerR(barTop), barTop], [innerL(barTop), barTop]]);
  return outline + counter;
}

function glyphL(x) {
  return poly([[x, 0], [x + STEM, 0], [x + STEM, CAP - BAR], [x + L_WIDTH, CAP - BAR], [x + L_WIDTH, CAP], [x, CAP]]);
}

function glyphV(x) {
  const vertex = (SPREAD - 2 * STEM) / (2 * SLOPE);
  return poly([
    [x, 0], [x + STEM, 0], [x + SPREAD / 2, vertex], [x + SPREAD - STEM, 0], [x + SPREAD, 0],
    [x + RUN + APEX, CAP], [x + RUN, CAP],
  ]);
}

// Optical spacing: L sits close to A's foot (the open top-right of A adds
// air), V overhangs L's foot, and the parallel diagonals of V and A keep an
// even gap.
const GAP = 20;
const A1 = 0;
const L = A1 + SPREAD + GAP - 4;
const V = L + L_WIDTH - 14;
const A2 = V + SPREAD - RUN + GAP * Math.hypot(1, SLOPE);
const WIDTH = Math.ceil(A2 + SPREAD);
const PATH = glyphA(A1) + glyphL(L) + glyphV(V) + glyphA(A2);

// `decorative` hides a repeated mark (e.g. a header next to an ALVA heading)
// from assistive technology.
export function logoSVG({ className = 'logo', title = CONFIG.title, decorative = false } = {}) {
  const a11y = decorative
    ? 'aria-hidden="true" focusable="false"'
    : `role="img" aria-label="${title}"`;
  return `<svg class="${className}" viewBox="0 0 ${WIDTH} ${CAP}" ${a11y}>${decorative ? '' : `<title>${title}</title>`}<path fill="currentColor" fill-rule="evenodd" d="${PATH}"/></svg>`;
}
