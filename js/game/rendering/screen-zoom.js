// The screen-space zoom: a pure 2D magnification of a picture already
// drawn in perspective (the match entrance's camera, js/game/entrance.js).
//
// Every stage is drawn in one-point perspective (js/stages/perspective.js):
// the projection reads the view's place (Perspective.y against refY, the
// parallax layers against view.x), so moving or resizing the view tilts the
// stage's planes, shifts the horizon and slides the layers against each
// other. A zoom must change none of that: the frame at zoom k toward a
// point must be exactly the unzoomed frame scaled by k about that point on
// screen. So the view (the lens: its x, y, w, h and scale) stays exactly
// as it is, every perspective and parallax computation reads it unchanged,
// and the zoom is one affine applied after projection, in device pixels:
//
//   { k, ox, oy }: the unzoomed frame's pixel (x, y) lands at
//                  (ox + k x, oy + k y)
//
// equivalently a scale k about the fixed point F = (ox, oy) / (1 - k), so
// a point P of the unzoomed frame lands at F + k (P - F); a pan is a moving
// F, never a moving lens. Every draw path on the canvas sets an absolute
// transform (ctx.setTransform(1, 0, 0, 1, 0, 0) for screen space,
// Perspective.plane, a theme's layer), so a single outer ctx.scale would
// be undone by the first of them: installScreenZoom puts this one affine
// in front of every setTransform on the context instead, the one place the
// zoom is composed. The stage's background, terrain, foreground and Void,
// clipAboveRim, the sprites, the shadows, the hit effects (the spawn burst
// among them), the markers: all of it is drawn through it, unchanged, and
// lands zoomed. Line widths and text scale with it, as in any picture
// scaled up; a shadow's blur, which no transform reaches, does not.
//
// The framed region is kept inside the unzoomed frame (framedZoom), so the
// zoom never shows anything the unzoomed frame did not draw.

// No zoom.
export const IDENTITY_ZOOM = Object.freeze({ k: 1, ox: 0, oy: 0 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The zoom by `k` (at least 1) of a `w` x `h` device-pixel frame that puts
// its point (cx, cy) at the screen's centre, then held so the framed region
// stays inside the frame (no blank edges): { k, ox, oy }.
export function framedZoom(w, h, k, cx, cy) {
  const z = Math.max(1, Number(k) || 1);
  return {
    k: z,
    ox: clamp(w / 2 - z * cx, w * (1 - z), 0),
    oy: clamp(h / 2 - z * cy, h * (1 - z), 0),
  };
}

// `zoom` nudged by (dx, dy) device pixels (a shake), only as far as the
// framed region can go while staying inside the `w` x `h` frame.
export function nudgedZoom(zoom, w, h, dx, dy) {
  return {
    k: zoom.k,
    ox: clamp(zoom.ox + dx, w * (1 - zoom.k), 0),
    oy: clamp(zoom.oy + dy, h * (1 - zoom.k), 0),
  };
}

// Whether `zoom` changes nothing.
export const isIdentityZoom = (zoom) => !zoom || (zoom.k === 1 && zoom.ox === 0 && zoom.oy === 0);

// The point the zoom scales about (see the top), or null with no scale.
export function zoomFocus(zoom) {
  if (!zoom || Math.abs(zoom.k - 1) < 1e-12) return null;
  return [zoom.ox / (1 - zoom.k), zoom.oy / (1 - zoom.k)];
}

// Where the unzoomed frame's device pixel (x, y) lands, into `out`.
export function zoomPoint(zoom, x, y, out = [0, 0]) {
  out[0] = zoom.ox + zoom.k * x;
  out[1] = zoom.oy + zoom.k * y;
  return out;
}

// The transform (a, b, c, d, e, f) asked for, with the zoom in front of it.
export function composeTransform(zoom, a, b, c, d, e, f) {
  const { k, ox, oy } = zoom;
  return [k * a, k * b, k * c, k * d, k * e + ox, k * f + oy];
}

// Each context the zoom is installed on, with what it had before.
const INSTALLED = new WeakMap();

// Puts `zoom` in front of every transform set on `ctx` from now on (its
// setTransform, either form, and resetTransform), and sets the zoomed
// identity at once. Calling it again only changes the zoom. Undone by
// removeScreenZoom, which gives the context back exactly as it was.
export function installScreenZoom(ctx, zoom) {
  let state = INSTALLED.get(ctx);
  if (!state) {
    const own = (name) => (Object.hasOwn(ctx, name) ? { value: ctx[name] } : null);
    state = { zoom, set: ctx.setTransform, reset: ctx.resetTransform, own: { set: own('setTransform'), reset: own('resetTransform') } };
    INSTALLED.set(ctx, state);
    ctx.setTransform = function setZoomedTransform(a, b, c, d, e, f) {
      if (a && typeof a === 'object') ({ a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = a);
      else if (a === undefined) [a, b, c, d, e, f] = [1, 0, 0, 1, 0, 0];
      return state.set.apply(this, composeTransform(state.zoom, a, b, c, d, e, f));
    };
    ctx.resetTransform = function resetZoomedTransform() {
      return ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
  }
  state.zoom = zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx;
}

// The context as it was before installScreenZoom, at the plain identity.
export function removeScreenZoom(ctx) {
  const state = ctx ? INSTALLED.get(ctx) : null;
  if (!state) return ctx;
  for (const [name, key] of [['setTransform', 'set'], ['resetTransform', 'reset']]) {
    if (state.own[key]) ctx[name] = state.own[key].value;
    else delete ctx[name];
  }
  INSTALLED.delete(ctx);
  ctx.setTransform?.(1, 0, 0, 1, 0, 0);
  return ctx;
}

// Runs `draw()` with `zoom` in front of every transform on `ctx` (nothing
// when it is the identity), then gives the context back as it was.
export function withScreenZoom(ctx, zoom, draw) {
  if (isIdentityZoom(zoom)) return draw();
  installScreenZoom(ctx, zoom);
  try {
    return draw();
  } finally {
    removeScreenZoom(ctx);
  }
}
