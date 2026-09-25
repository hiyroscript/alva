// One-point perspective shared by the stage renderers: the projection
// Practice Ground's room introduced (js/stages/practice-theme.js), used for
// every stage's playable geometry so Desert, City and Practice Ground stand
// in the same pseudo-3D world. Canvas 2D only.
//
// Depth is a parallax factor f (1 / depth): the fighters stand on the plane
// f = 1, smaller f is further back and larger f nearer the camera. A world
// point (x, y) at depth f draws at
//   screen x = (view.w / 2 + (x - camera centre x) * f) * scale
//   screen y = (G + rise * (f - 1) + (y - G) * f - (refY + (view.y - refY) * f)) * scale
// where G is the main stage's top and `rise` is how far the camera sits above
// that ground when it is at refY. This is an exact perspective of a camera
// that pans without turning: the horizon stays put on screen, a horizontal
// plane tilts toward the viewer while the camera is above it and flattens to
// a line (then shows its underside) as the camera sinks to its level. At
// f = 1 it is exactly the fighters' own world transform, so drawn surfaces
// line up with collision.

export class Perspective {
  constructor({ groundY, refY, rise }) {
    this.groundY = groundY;
    this.refY = refY;
    this.rise = rise;
  }

  // Screen x (device pixels) of world x at depth f.
  x(view, x, f) {
    return (view.w / 2 + (x - view.x - view.w / 2) * f) * view.scale;
  }

  // Screen y (device pixels) of world height y at depth f.
  y(view, y, f) {
    const G = this.groundY;
    return (G + this.rise * (f - 1) + (y - G) * f - (this.refY + (view.y - this.refY) * f)) * view.scale;
  }

  // Sets `ctx` to draw flat art authored in world units on the vertical
  // plane at depth f: every point (x, y) lands where this projection puts
  // it, so art standing on the ground (y = G) stands on the stage's top at
  // that depth. For a fixed f the projection is just a scale and an offset,
  // so cached Path2D art and world-space gradients work unchanged.
  plane(ctx, view, f) {
    const s = view.scale;
    const G = this.groundY;
    ctx.setTransform(
      f * s, 0, 0, f * s,
      (view.w / 2 - (view.x + view.w / 2) * f) * s,
      (G + this.rise * (f - 1) - G * f - this.refY - (view.y - this.refY) * f) * s,
    );
  }

  // Screen point of (x, y) at depth f, written into `out`.
  point(view, x, y, f, out = [0, 0]) {
    out[0] = this.x(view, x, f);
    out[1] = this.y(view, y, f);
    return out;
  }

  // The faces of a box in depth: x from x0 to x1 and y from top to bottom
  // (world units, as at the fighters' plane), from depth `back` to `front`.
  // Each face is a screen-space quad [x, y, x, y, x, y, x, y], or null when
  // it faces away from the camera: the top only while the camera is above
  // it, the left side only while the view's centre line is left of x0, the
  // right side only while it is right of x1. The front always shows. Paint
  // them top, sides, front: nearer faces then cover the rest.
  box(view, { x0, x1, top, bottom, back, front }, out = {}) {
    const cx = view.x + view.w / 2;
    const xb0 = this.x(view, x0, back);
    const xb1 = this.x(view, x1, back);
    const xf0 = this.x(view, x0, front);
    const xf1 = this.x(view, x1, front);
    const ytb = this.y(view, top, back);
    const ytf = this.y(view, top, front);
    const ybb = this.y(view, bottom, back);
    const ybf = this.y(view, bottom, front);
    out.front = [xf0, ytf, xf1, ytf, xf1, ybf, xf0, ybf];
    out.top = ytb < ytf ? [xb0, ytb, xb1, ytb, xf1, ytf, xf0, ytf] : null;
    out.left = cx < x0 ? [xb0, ytb, xf0, ytf, xf0, ybf, xb0, ybb] : null;
    out.right = cx > x1 ? [xb1, ytb, xf1, ytf, xf1, ybf, xb1, ybb] : null;
    return out;
  }
}

// Paints a prism in depth: the convex outline `pts` ([x, y, x, y, ...],
// world units as at the fighters' plane, in the order that runs clockwise
// on screen) extruded from depth `back` to `front`. Each side face that
// turns toward the camera is filled with `sideStyle(nx, ny)`, from its
// outward normal in the outline's plane (ny < 0 faces up); then the front
// cap with `frontStyle`. Faces turned away are hidden behind these, so none
// is drawn.
export function prism(ctx, persp, view, pts, back, front, sideStyle, frontStyle) {
  const n = pts.length / 2;
  const fx = [];
  const fy = [];
  const bx = [];
  const by = [];
  for (let i = 0; i < n; i++) {
    fx.push(persp.x(view, pts[i * 2], front));
    fy.push(persp.y(view, pts[i * 2 + 1], front));
    bx.push(persp.x(view, pts[i * 2], back));
    by.push(persp.y(view, pts[i * 2 + 1], back));
  }
  let cap = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cap += fx[i] * fy[j] - fx[j] * fy[i];
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const qx = [fx[i], fx[j], bx[j], bx[i]];
    const qy = [fy[i], fy[j], by[j], by[i]];
    let area = 0;
    for (let k = 0; k < 4; k++) area += qx[k] * qy[(k + 1) % 4] - qx[(k + 1) % 4] * qy[k];
    if (area * cap >= 0) continue;
    const dx = pts[j * 2] - pts[i * 2];
    const dy = pts[j * 2 + 1] - pts[i * 2 + 1];
    const len = Math.hypot(dx, dy) || 1;
    ctx.beginPath();
    ctx.moveTo(qx[0], qy[0]);
    for (let k = 1; k < 4; k++) ctx.lineTo(qx[k], qy[k]);
    ctx.closePath();
    ctx.fillStyle = sideStyle(dy / len, -dx / len);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(fx[0], fy[0]);
  for (let i = 1; i < n; i++) ctx.lineTo(fx[i], fy[i]);
  ctx.closePath();
  ctx.fillStyle = frontStyle;
  ctx.fill();
}

// Restricts drawing to the screen above the main stage's front rim (world
// height `top` at depth `front`): everything standing on the stage sits
// behind that rim, so while the camera is below the stage's top the stage's
// own front face hides whatever of it would show beneath. Never clips
// anything while the camera is above. Pair with ctx.restore().
export function clipAboveRim(ctx, persp, view, top, front) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, view.pxW, Math.max(0, persp.y(view, top, front)));
  ctx.clip();
}

// Adds a screen-space quad (see Perspective.box) to the current path.
export function quad(ctx, q) {
  ctx.moveTo(q[0], q[1]);
  ctx.lineTo(q[2], q[3]);
  ctx.lineTo(q[4], q[5]);
  ctx.lineTo(q[6], q[7]);
  ctx.closePath();
}

// Fills one quad, if it shows.
export function fillQuad(ctx, q, style) {
  if (!q) return;
  ctx.beginPath();
  quad(ctx, q);
  ctx.fillStyle = style;
  ctx.fill();
}

// A vertical gradient over a quad's own screen span (top edge to bottom
// edge), for shading a face by height.
export function quadGradient(ctx, q, stops) {
  const y0 = Math.min(q[1], q[3], q[5], q[7]);
  const y1 = Math.max(q[1], q[3], q[5], q[7]);
  const g = ctx.createLinearGradient(0, y0, 0, Math.max(y0 + 1, y1));
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}
