// MAXY wordmark: original geometric letterforms as SVG polygons.

const LETTERS = [
  { x: 0, pts: [0, 100, 0, 0, 26, 0, 55, 46, 84, 0, 110, 0, 110, 100, 84, 100, 84, 50, 62, 86, 48, 86, 26, 50, 26, 100] },
  { x: 126, pts: [0, 100, 30, 0, 70, 0, 100, 100, 74, 100, 67, 78, 33, 78, 26, 100], hole: [39, 56, 61, 56, 54, 28, 46, 28] },
  { x: 242, pts: [0, 0, 28, 0, 50, 32, 72, 0, 100, 0, 64, 50, 100, 100, 72, 100, 50, 68, 28, 100, 0, 100, 36, 50], accent: true },
  { x: 358, pts: [0, 0, 28, 0, 48, 34, 68, 0, 96, 0, 61, 56, 61, 100, 35, 100, 35, 56] },
];

function toPath(pts, dx) {
  let d = '';
  for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i] + dx} ${pts[i + 1]}`;
  return `${d}Z`;
}

function letterPath(l) {
  return toPath(l.pts, l.x) + (l.hole ? toPath(l.hole, l.x) : '');
}

export function logoSVG({ className = 'logo', title = 'MAXY' } = {}) {
  const shadow = LETTERS.map((l) => `<path d="${letterPath(l)}"/>`).join('');
  const main = LETTERS.map(
    (l) => `<path class="${l.accent ? 'logo-accent' : 'logo-letter'}" d="${letterPath(l)}"/>`,
  ).join('');
  return `<svg class="${className}" viewBox="0 0 484 112" role="img" aria-label="${title}">
  <title>${title}</title>
  <g transform="translate(24 4) skewX(-12)" fill-rule="evenodd">
    <g class="logo-shadow" transform="translate(5 6)">${shadow}</g>
    ${main}
  </g>
</svg>`;
}
