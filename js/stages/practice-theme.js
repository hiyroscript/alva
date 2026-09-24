// PRACTICE GROUND — Alva's minimalist combat laboratory: a pale, cool-gray
// simulation room built from one square grid. A gridded back wall, a floor in
// one-point perspective and two side walls at the stage bounds give it depth;
// nothing else is in the room: no scenery, particles, hazards or moving parts.
// Original Canvas artwork.
//
// The room is a box seen head-on. Depth is a parallax factor f (1 / depth):
// the fighters stand on the plane f = 1, the back wall is at FAR and the
// floor's front edge at NEAR. A floor point at world x X and parallax f draws
// at
//   screen x = (view.w / 2 + (X - camera centre x) * f) * scale
//   screen y = (floorY(f) - (refY + (view.y - refY) * f)) * scale
// With floorY linear in f this is an exact perspective of a flat floor under
// the camera's pans, and at f = 1 it is the fighters' own world transform.
// Walls and floor share the grid's lines (CELL world units apart at f = 1),
// so they meet at the seams.
//
// Only the camera moves the room, so everything static is computed once: the
// floor's row depths here, and each gradient only when its span moves. The
// grid itself is a few dozen straight lines a frame, snapped to whole device
// pixels so it stays crisp.

import { StageTheme } from './stage-theme.js';

const CELL = 80;      // grid cell at the fighters' plane, world units
const MAJOR = 5;      // a stronger line every MAJOR cells
const FAR = 0.55;     // parallax of the back wall
const NEAR = 1.1;     // parallax of the floor's front edge (in front of the fighters)
const RISE = 240;     // floor's screen rise per unit of parallax, world units
const ROWS = 10;      // floor rows from the front edge to the back wall, even in depth

const C = {
  wall: [[0, '#f4f6f8'], [1, '#e2e6eb']],   // back wall, top -> seam
  occlusion: [[0, 'rgba(46, 56, 70, 0)'], [1, 'rgba(46, 56, 70, 0.07)']],
  side: '#e7eaee',                           // side walls' inner faces
  floor: [[0, '#cfd5dc'], [1, '#dde1e6']],   // floor, back -> front edge
  face: [[0, '#b3bbc5'], [1, '#98a1ac']],    // floor's front face, top -> bottom
  bulkhead: '#c2c8d0',                       // side walls' front faces
  bulkheadEdge: '#a3abb6',
  minor: 'rgba(66, 78, 94, 0.13)',
  major: 'rgba(66, 78, 94, 0.3)',
  axis: 'rgba(48, 58, 72, 0.5)',
  seam: 'rgba(48, 58, 72, 0.36)',
  edge: 'rgba(255, 255, 255, 0.9)',          // lit front edges
  tick: 'rgba(38, 46, 58, 0.42)',
};

// Line kinds, drawn in this order so stronger lines sit on top.
const MINOR = 0;
const MAJOR_LINE = 1;
const AXIS = 2;
const KINDS = [MINOR, MAJOR_LINE, AXIS];

// Grid index -> line kind (`axis` marks the room's centre line).
const kindOf = (i, axis = false) => (axis ? AXIS : i % MAJOR === 0 ? MAJOR_LINE : MINOR);

// Crisp 1-device-pixel alignment for a horizontal or vertical line.
const snap = (v, width) => (width % 2 ? Math.floor(v) + 0.5 : Math.round(v));

export class PracticeTheme extends StageTheme {
  constructor(map, opts) {
    super(map, opts);
    // Soft overhead light: a short round shadow straight under the fighter.
    this.shadow = { alpha: 0.2, skew: 0, stretch: 1 };
    // Parallax of each floor row, front edge (k = 0) to back wall (k = ROWS):
    // even steps in depth, so rows crowd together toward the wall. With
    // these constants the fighters' plane is row 1.
    const zNear = 1 / NEAR;
    const dz = (1 / FAR - zNear) / ROWS;
    this.rows = Array.from({ length: ROWS + 1 }, (_, k) => 1 / (zNear + k * dz));
    this.axisX = map.worldWidth / 2;
    this.gradients = {};
  }

  // ---- Projection (see the header) ----------------------------------------

  sx(view, x, f) {
    return (view.w / 2 + (x - view.x - view.w / 2) * f) * view.scale;
  }

  sy(view, f) {
    const floorY = this.map.groundLevel + RISE * (f - 1);
    return (floorY - (this.refY + (view.y - this.refY) * f)) * view.scale;
  }

  // Lowest and highest grid index of the lines at parallax `f` that can be
  // on screen, kept inside [x0, x1].
  cellRange(view, f, x0, x1) {
    const cx = view.x + view.w / 2;
    const half = view.w / 2 / f;
    return [
      Math.ceil(Math.max(cx - half, x0) / CELL),
      Math.floor(Math.min(cx + half, x1) / CELL),
    ];
  }

  // Vertical gradient from y0 to y1, rebuilt only when its span moves.
  gradient(ctx, name, y0, y1, stops) {
    const a = Math.round(y0);
    const b = Math.max(a + 1, Math.round(y1));
    const cached = this.gradients[name];
    if (cached && cached.a === a && cached.b === b) return cached.value;
    const value = ctx.createLinearGradient(0, a, 0, b);
    for (const [at, color] of stops) value.addColorStop(at, color);
    this.gradients[name] = { a, b, value };
    return value;
  }

  // Line widths in device pixels: majors and the axis always read stronger.
  lineWidths(view) {
    const minor = Math.max(1, Math.round(view.scale * 0.55));
    const major = Math.max(minor + 1, Math.round(view.scale * 1.05));
    return [minor, major, major];
  }

  stroke(ctx, kind, widths) {
    ctx.strokeStyle = kind === AXIS ? C.axis : kind === MAJOR_LINE ? C.major : C.minor;
    ctx.lineWidth = widths[kind];
    ctx.stroke();
  }

  // ---- Layers -------------------------------------------------------------

  // The back wall: a flat grid of square cells at FAR, from the top of the
  // view down to its seam with the floor.
  drawBackground(ctx, view) {
    const s = view.scale;
    const { left, right } = this.map.bounds;
    const seam = Math.round(this.sy(view, FAR));
    const widths = this.lineWidths(view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.gradient(ctx, 'wall', 0, seam, C.wall);
    ctx.fillRect(0, 0, view.pxW, seam);
    // Restrained contact shadow where the wall meets the floor.
    const band = CELL * FAR * s;
    ctx.fillStyle = this.gradient(ctx, 'occlusion', seam - band, seam, C.occlusion);
    ctx.fillRect(0, seam - band, view.pxW, band);

    const [i0, i1] = this.cellRange(view, FAR, left, right);
    const step = CELL * FAR * s;
    for (const kind of KINDS) {
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        if (kindOf(i, i * CELL === this.axisX) !== kind) continue;
        const x = snap(this.sx(view, i * CELL, FAR), widths[kind]);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, seam);
      }
      if (kind !== AXIS) {
        for (let j = 1; seam - j * step > 0; j++) {
          if (kindOf(j) !== kind) continue;
          const y = snap(seam - j * step, widths[kind]);
          ctx.moveTo(0, y);
          ctx.lineTo(view.pxW, y);
        }
      }
      this.stroke(ctx, kind, widths);
    }
  }

  // The floor in perspective, the side walls at the stage bounds, and the
  // floor's front face with a ruler along its edge.
  drawTerrain(ctx, view) {
    const { left, right } = this.map.bounds;
    const yFar = this.sy(view, FAR);
    const yNear = this.sy(view, NEAR);
    const widths = this.lineWidths(view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Floor surface and its grid: rows of constant depth, and lines of
    // constant x receding toward the back wall's verticals.
    ctx.fillStyle = this.gradient(ctx, 'floor', yFar, yNear, C.floor);
    ctx.fillRect(0, yFar, view.pxW, yNear - yFar);
    const [i0, i1] = this.cellRange(view, NEAR, left, right);
    for (const kind of KINDS) {
      ctx.beginPath();
      if (kind !== AXIS) {
        for (let k = 1; k < ROWS; k++) {
          if (kindOf(k) !== kind) continue;
          const y = snap(this.sy(view, this.rows[k]), widths[kind]);
          ctx.moveTo(0, y);
          ctx.lineTo(view.pxW, y);
        }
      }
      for (let i = i0; i <= i1; i++) {
        const x = i * CELL;
        if (kindOf(i, x === this.axisX) !== kind) continue;
        ctx.moveTo(this.sx(view, x, NEAR), yNear);
        ctx.lineTo(this.sx(view, x, FAR), yFar);
      }
      this.stroke(ctx, kind, widths);
    }
    ctx.beginPath();
    const seam = snap(yFar, widths[MAJOR_LINE]);
    ctx.moveTo(0, seam);
    ctx.lineTo(view.pxW, seam);
    ctx.strokeStyle = C.seam;
    ctx.lineWidth = widths[MAJOR_LINE];
    ctx.stroke();

    this.drawSideWall(ctx, view, left, -1, widths);
    this.drawSideWall(ctx, view, right, 1, widths);

    // Front face below the edge, and a ruler of ticks along it: every half
    // cell, longer every cell and every major line, longest on the axis.
    const top = Math.round(yNear);
    ctx.fillStyle = this.gradient(ctx, 'face', top, view.pxH, C.face);
    ctx.fillRect(0, top, view.pxW, view.pxH - top);
    const [t0, t1] = this.cellRange(view, NEAR, left, right);
    const unit = NEAR * view.scale;
    ctx.beginPath();
    for (let i = t0 * 2 - 1; i <= t1 * 2 + 1; i++) {
      const x = (i * CELL) / 2;
      if (x < left || x > right) continue;
      const len = x === this.axisX ? 30 : i % (MAJOR * 2) === 0 ? 20 : i % 2 === 0 ? 11 : 6;
      const sx = snap(this.sx(view, x, NEAR), widths[MINOR]);
      ctx.moveTo(sx, top);
      ctx.lineTo(sx, top + len * unit);
    }
    ctx.strokeStyle = C.tick;
    ctx.lineWidth = widths[MINOR];
    ctx.stroke();
    ctx.fillStyle = C.edge;
    ctx.fillRect(0, top, view.pxW, widths[MAJOR_LINE]);

    this.drawBulkhead(ctx, view, left, -1, widths);
    this.drawBulkhead(ctx, view, right, 1, widths);
  }

  // A side wall's inner face at world x `x` (`side` -1 is the left wall, 1
  // the right), from its back corner to the floor's front edge, gridded to
  // continue the floor rows and the back wall's heights. It shows only
  // while the camera centre is inside the room.
  drawSideWall(ctx, view, x, side, widths) {
    const cx = view.x + view.w / 2;
    if ((x - cx) * side <= 0) return;
    const s = view.scale;
    const xFar = this.sx(view, x, FAR);
    const xNear = this.sx(view, x, NEAR);
    const yFar = this.sy(view, FAR);
    const yNear = this.sy(view, NEAR);
    ctx.beginPath();
    ctx.moveTo(xNear, 0);
    ctx.lineTo(xFar, 0);
    ctx.lineTo(xFar, yFar);
    ctx.lineTo(xNear, yNear);
    ctx.closePath();
    ctx.fillStyle = C.side;
    ctx.fill();

    for (const kind of [MINOR, MAJOR_LINE]) {
      ctx.beginPath();
      // Constant depth: one vertical per floor row.
      for (let k = 1; k < ROWS; k++) {
        if (kindOf(k) !== kind) continue;
        const f = this.rows[k];
        const lx = snap(this.sx(view, x, f), widths[kind]);
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, this.sy(view, f));
      }
      // Constant height: the back wall's rows, carried to the front edge.
      for (let j = 1; yFar - j * CELL * FAR * s > 0; j++) {
        if (kindOf(j) !== kind) continue;
        ctx.moveTo(xFar, yFar - j * CELL * FAR * s);
        ctx.lineTo(xNear, yNear - j * CELL * NEAR * s);
      }
      this.stroke(ctx, kind, widths);
    }
    // The corner with the back wall and the seam with the floor.
    ctx.beginPath();
    const corner = snap(xFar, widths[MAJOR_LINE]);
    ctx.moveTo(corner, 0);
    ctx.lineTo(corner, yFar);
    ctx.moveTo(xFar, yFar);
    ctx.lineTo(xNear, yNear);
    ctx.strokeStyle = C.seam;
    ctx.lineWidth = widths[MAJOR_LINE];
    ctx.stroke();
  }

  // A side wall's front face: everything beyond its front edge at NEAR, the
  // floor's front face included, with a lit edge facing the room and panel
  // joints every major line.
  drawBulkhead(ctx, view, x, side, widths) {
    const edge = Math.round(this.sx(view, x, NEAR));
    const x0 = side < 0 ? 0 : edge;
    const x1 = side < 0 ? edge : view.pxW;
    if (x1 <= x0) return;
    ctx.fillStyle = C.bulkhead;
    ctx.fillRect(x0, 0, x1 - x0, view.pxH);
    const yNear = this.sy(view, NEAR);
    const joint = CELL * MAJOR * NEAR * view.scale;
    ctx.beginPath();
    for (let y = yNear; y > 0; y -= joint) {
      const jy = snap(y, widths[MINOR]);
      ctx.moveTo(x0, jy);
      ctx.lineTo(x1, jy);
    }
    ctx.strokeStyle = C.bulkheadEdge;
    ctx.lineWidth = widths[MINOR];
    ctx.stroke();
    const w = widths[MAJOR_LINE];
    ctx.fillStyle = C.edge;
    ctx.fillRect(side < 0 ? edge - w : edge, 0, w, view.pxH);
  }
}
