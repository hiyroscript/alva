// PRACTICE GROUND — Alva's minimalist combat laboratory: a pale, cool-gray
// simulation room built from one square grid. A gridded back wall and one
// compact training block in one-point perspective give it depth; the block
// has open edges, with nothing past them but the back wall and, a short way
// below, the Void. No scenery, particles, hazards or moving parts. Original Canvas
// artwork.
//
// The room is seen head-on through the shared projection
// (js/stages/perspective.js): the fighters stand on the plane f = 1, the back
// wall is at FAR and the block's front face at NEAR. The block's top runs
// from the back wall to its front edge between the main stage's edges
// (map.mainStage), so what the fighters stand on is exactly what is drawn;
// below its top it is a solid block whose front face carries a ruler and
// whose outer side faces show past either ledge. Wall, top and sides share
// the grid's lines (CELL world units apart at f = 1), so they meet at the
// seams.
//
// Only the camera moves the room, so everything static is computed once: the
// top's row depths here, and each gradient only when its span moves. The
// grid itself is a few dozen straight lines a frame, snapped to whole device
// pixels so it stays crisp.

import { StageTheme } from './stage-theme.js';

const CELL = 80;      // grid cell at the fighters' plane, world units
const MAJOR = 5;      // a stronger line every MAJOR cells
const FAR = 0.55;     // parallax of the back wall
const NEAR = 1.1;     // parallax of the block's front face (in front of the fighters)
const RISE = 240;     // camera height over the block's top at refY, world units
const ROWS = 10;      // top rows from the front edge to the back wall, even in depth

const C = {
  wall: [[0, '#f4f6f8'], [1, '#e2e6eb']],   // back wall, top -> seam
  pit: [[0, '#e2e6eb'], [1, '#c3cad2']],    // back wall below the seam, seam -> bottom
  occlusion: [[0, 'rgba(46, 56, 70, 0)'], [1, 'rgba(46, 56, 70, 0.07)']],
  floor: [[0, '#cfd5dc'], [1, '#dde1e6']],   // block top, back -> front edge
  face: [[0, '#b3bbc5'], [1, '#98a1ac']],    // block front face, top -> bottom
  side: [[0, '#a4acb6'], [1, '#858e99']],    // block side faces, top -> bottom
  minor: 'rgba(66, 78, 94, 0.13)',
  major: 'rgba(66, 78, 94, 0.3)',
  axis: 'rgba(48, 58, 72, 0.5)',
  seam: 'rgba(48, 58, 72, 0.36)',
  joint: 'rgba(48, 58, 72, 0.18)',
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
    this.persp = this.perspective(RISE);
    // Parallax of each top row, front edge (k = 0) to back wall (k = ROWS):
    // even steps in depth, so rows crowd together toward the wall. With
    // these constants the fighters' plane is row 1.
    const zNear = 1 / NEAR;
    const dz = (1 / FAR - zNear) / ROWS;
    this.rows = Array.from({ length: ROWS + 1 }, (_, k) => 1 / (zNear + k * dz));
    const { left, right } = map.mainStage;
    this.axisX = (left + right) / 2;
    this.gradients = {};
  }

  // ---- Projection (see js/stages/perspective.js) ---------------------------

  sx(view, x, f) {
    return this.persp.x(view, x, f);
  }

  // Screen y of the block's top (the ground) at parallax `f`.
  sy(view, f) {
    return this.persp.y(view, this.groundY, f);
  }

  // Lowest and highest grid index of the lines at parallax `f` that can be
  // on screen, kept inside [x0, x1].
  cellRange(view, f, x0 = -Infinity, x1 = Infinity) {
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

  // The back wall: a flat grid of square cells at FAR across the whole view,
  // above the block's top and on down past it, where the open edges look out
  // over the drop.
  drawBackground(ctx, view) {
    const s = view.scale;
    const seam = Math.round(this.sy(view, FAR));
    const widths = this.lineWidths(view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.gradient(ctx, 'wall', 0, seam, C.wall);
    ctx.fillRect(0, 0, view.pxW, seam);
    if (seam < view.pxH) {
      ctx.fillStyle = this.gradient(ctx, 'pit', seam, view.pxH, C.pit);
      ctx.fillRect(0, seam, view.pxW, view.pxH - seam);
    }

    const [i0, i1] = this.cellRange(view, FAR);
    const step = CELL * FAR * s;
    for (const kind of KINDS) {
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        if (kindOf(i, i * CELL === this.axisX) !== kind) continue;
        const x = snap(this.sx(view, i * CELL, FAR), widths[kind]);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, view.pxH);
      }
      if (kind !== AXIS) {
        // Rows up from the seam, and on down below it.
        for (let j = Math.floor((seam - view.pxH) / step); seam - j * step > 0; j++) {
          if (j === 0 || kindOf(Math.abs(j)) !== kind) continue;
          const y = snap(seam - j * step, widths[kind]);
          ctx.moveTo(0, y);
          ctx.lineTo(view.pxW, y);
        }
      }
      this.stroke(ctx, kind, widths);
    }
  }

  // The training block: its top in perspective, the outer side face past
  // whichever ledge the view looks beyond, and its front face with a ruler
  // along the edge. Painted in that order, nearer faces covering the rest.
  drawTerrain(ctx, view) {
    const { left, right } = this.map.mainStage;
    const yFar = this.sy(view, FAR);
    const yNear = this.sy(view, NEAR);
    const widths = this.lineWidths(view);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Top surface and its grid: rows of constant depth, and lines of
    // constant x receding toward the back wall's verticals. A camera sunk
    // below the top sees no top at all.
    if (yFar < yNear) {
      ctx.beginPath();
      ctx.moveTo(this.sx(view, left, FAR), yFar);
      ctx.lineTo(this.sx(view, right, FAR), yFar);
      ctx.lineTo(this.sx(view, right, NEAR), yNear);
      ctx.lineTo(this.sx(view, left, NEAR), yNear);
      ctx.closePath();
      ctx.fillStyle = this.gradient(ctx, 'floor', yFar, yNear, C.floor);
      ctx.fill();
      // Restrained contact shadow where the top meets the wall.
      const band = CELL * FAR * view.scale;
      const x0 = this.sx(view, left, FAR);
      const x1 = this.sx(view, right, FAR);
      ctx.fillStyle = this.gradient(ctx, 'occlusion', yFar - band, yFar, C.occlusion);
      ctx.fillRect(x0, yFar - band, x1 - x0, band);

      const [i0, i1] = this.cellRange(view, FAR, left, right);
      for (const kind of KINDS) {
        ctx.beginPath();
        if (kind !== AXIS) {
          for (let k = 1; k < ROWS; k++) {
            if (kindOf(k) !== kind) continue;
            const f = this.rows[k];
            const y = snap(this.sy(view, f), widths[kind]);
            ctx.moveTo(this.sx(view, left, f), y);
            ctx.lineTo(this.sx(view, right, f), y);
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
      ctx.moveTo(x0, seam);
      ctx.lineTo(x1, seam);
      ctx.strokeStyle = C.seam;
      ctx.lineWidth = widths[MAJOR_LINE];
      ctx.stroke();
    }

    this.drawSide(ctx, view, left, -1, widths);
    this.drawSide(ctx, view, right, 1, widths);
    this.drawFront(ctx, view, left, right, widths);
  }

  // The block's outer side face at world x `x` (`side` -1 is the left edge,
  // 1 the right), from the back wall to the front face and on down: it shows
  // only while the view's centre line is past that edge. Gridded to carry
  // the top's rows down it and the front face's heights back along it.
  drawSide(ctx, view, x, side, widths) {
    const cx = view.x + view.w / 2;
    if ((cx - x) * side <= 0) return;
    const { top, bottom } = this.map.mainStage;
    const p = this.persp;
    const xFar = this.sx(view, x, FAR);
    const xNear = this.sx(view, x, NEAR);
    const yFar = p.y(view, top, FAR);
    const yNear = p.y(view, top, NEAR);
    ctx.beginPath();
    ctx.moveTo(xFar, yFar);
    ctx.lineTo(xNear, yNear);
    ctx.lineTo(xNear, p.y(view, bottom, NEAR));
    ctx.lineTo(xFar, p.y(view, bottom, FAR));
    ctx.closePath();
    ctx.fillStyle = this.gradient(ctx, 'side', yFar, view.pxH, C.side);
    ctx.fill();

    for (const kind of [MINOR, MAJOR_LINE]) {
      ctx.beginPath();
      // Constant depth: one vertical per top row.
      for (let k = 1; k < ROWS; k++) {
        if (kindOf(k) !== kind) continue;
        const f = this.rows[k];
        const lx = snap(this.sx(view, x, f), widths[kind]);
        ctx.moveTo(lx, p.y(view, top, f));
        ctx.lineTo(lx, Math.min(view.pxH, p.y(view, bottom, f)));
      }
      // Constant height: a row every cell below the top.
      for (let j = 1; top + j * CELL < bottom; j++) {
        if (kindOf(j) !== kind) continue;
        const yj = top + j * CELL;
        const yb = p.y(view, yj, FAR);
        if (yb > view.pxH) break;
        ctx.moveTo(xFar, yb);
        ctx.lineTo(xNear, p.y(view, yj, NEAR));
      }
      this.stroke(ctx, kind, widths);
    }
    // The ledge: the top's edge, lit.
    ctx.beginPath();
    ctx.moveTo(xFar, yFar);
    ctx.lineTo(xNear, yNear);
    ctx.strokeStyle = C.edge;
    ctx.lineWidth = widths[MAJOR_LINE];
    ctx.stroke();
  }

  // The front face below the edge, between the ledges and down past the
  // view: a ruler of ticks along its top (every half cell, longer every cell
  // and every major line, longest on the axis), faint panel joints every
  // major line down it, and lit edges.
  drawFront(ctx, view, left, right, widths) {
    const top = Math.round(this.sy(view, NEAR));
    const x0 = Math.round(this.sx(view, left, NEAR));
    const x1 = Math.round(this.sx(view, right, NEAR));
    if (top >= view.pxH || x1 <= 0 || x0 >= view.pxW) return;
    ctx.fillStyle = this.gradient(ctx, 'face', top, view.pxH, C.face);
    ctx.fillRect(x0, top, x1 - x0, view.pxH - top);

    const unit = NEAR * view.scale;
    ctx.beginPath();
    const joint = CELL * MAJOR * unit;
    for (let y = top + joint; y < view.pxH; y += joint) {
      const jy = snap(y, widths[MINOR]);
      ctx.moveTo(x0, jy);
      ctx.lineTo(x1, jy);
    }
    ctx.strokeStyle = C.joint;
    ctx.lineWidth = widths[MINOR];
    ctx.stroke();

    const [t0, t1] = this.cellRange(view, NEAR, left, right);
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
    const w = widths[MAJOR_LINE];
    ctx.fillStyle = C.edge;
    ctx.fillRect(x0, top, x1 - x0, w);
    // The front's vertical corners, lit on the side that faces the light.
    ctx.fillRect(x0, top, w, view.pxH - top);
    ctx.fillStyle = C.seam;
    ctx.fillRect(x1 - w, top, w, view.pxH - top);
  }
}
