// Menu-side helpers for drawing normalized sprite frames.

// Solid-colour silhouette of a frame (same size as the normalized canvas).
export function tintFrame(frame, color, alpha = 1) {
  const c = document.createElement('canvas');
  c.width = frame.w;
  c.height = frame.h;
  const ctx = c.getContext('2d');
  ctx.drawImage(frame.canvas, 0, 0, frame.w, frame.h);
  ctx.globalCompositeOperation = 'source-in';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// Paints `sprites`' portrait (the character's own visual.portrait crop, see
// SpriteSet.makePortrait) into `canvas` at 1 px per art pixel; CSS scales it
// up crisply (image-rendering: pixelated). False, leaving the canvas as it
// is, when there is no portrait to paint.
export function paintPortrait(canvas, sprites) {
  const img = sprites?.makePortrait?.();
  if (!img) return false;
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return true;
}

// Resize a canvas backing store to its CSS box (capped DPR). Returns
// { w, h, dpr, changed }.
export function fitCanvas(canvas, dprCap = 2) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  const changed = canvas.width !== w || canvas.height !== h;
  if (changed) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr, changed, cssW: r.width, cssH: r.height };
}

// Draw a frame bottom-centre anchored at (x, y) with an integer scale.
export function drawFrameAt(ctx, frame, x, y, scale, flip = false) {
  const w = frame.artW * scale;
  const h = frame.artH * scale;
  const ax = Math.round(frame.anchorArtX * scale);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(frame.canvas, -ax, -Math.round(h), Math.round(w), Math.round(h));
  ctx.restore();
}
