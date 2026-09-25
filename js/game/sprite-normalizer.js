// Sprite normalization.
//
// Source frames for a character can come in wildly different sizes (the #0001
// idle frames are ~16x upscaled pixel art, the run frames ~4x). Drawing them at
// raw scale would make the fighter grow/shrink between animations, so each
// frame is analysed ONCE when loaded:
//
//   1. read the alpha channel and find the visible bounding box
//   2. detect the pixel-art grid (GCD of every colour transition)
//   3. resample to 1 canvas pixel per art pixel (exact, block-centre sampling)
//   4. compute a stable horizontal anchor (upper-body opaque centroid)
//
// The result is cached; nothing touches pixel data per render frame.
// Every normalized frame is drawn bottom-centre anchored at a shared
// world-units-per-art-pixel scale, so idle and run match exactly.
// Projectile and effect art (a character's `projectileAnimations` and
// `effectAnimations`) goes through the same analysis but keeps its own size
// and a centre anchor: it shares the fighter's art-pixel scale, never the
// fighter's height.

const ALPHA_MIN = 16;

let warnedTaint = false;

function readPixels(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data, width: canvas.width, height: canvas.height };
}

function findBounds(px, width, height) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if ((px[row + x] >>> 24) > ALPHA_MIN) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const gcd = (a, b) => {
  while (b) [a, b] = [b, a % b];
  return a;
};

// Transparent pixels compare equal regardless of their RGB garbage.
const norm = (v) => ((v >>> 24) > ALPHA_MIN ? v : 0);

function detectPixelSize(px, width, box) {
  let g = gcd(box.w, box.h);
  if (g < 2) return 1;
  const { x: bx, y: by, w: bw, h: bh } = box;
  // Rows
  for (let y = by; y < by + bh; y++) {
    const row = y * width;
    let prev = norm(px[row + bx]);
    for (let x = bx + 1; x < bx + bw; x++) {
      const cur = norm(px[row + x]);
      if (cur !== prev) {
        g = gcd(g, x - bx);
        if (g < 2) return 1;
        prev = cur;
      }
    }
  }
  // Columns
  for (let x = bx; x < bx + bw; x++) {
    let prev = norm(px[by * width + x]);
    for (let y = by + 1; y < by + bh; y++) {
      const cur = norm(px[y * width + x]);
      if (cur !== prev) {
        g = gcd(g, y - by);
        if (g < 2) return 1;
        prev = cur;
      }
    }
  }
  return g;
}

// Returns a canvas containing the visible region resampled by `step`
// (step = 1 keeps the crop unchanged).
function extract(px, width, box, step) {
  const outW = Math.round(box.w / step);
  const outH = Math.round(box.h / step);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(outW, outH);
  const out32 = new Uint32Array(out.data.buffer);
  const half = Math.floor(step / 2);
  for (let j = 0; j < outH; j++) {
    const sy = Math.min(box.y + j * step + half, box.y + box.h - 1);
    for (let i = 0; i < outW; i++) {
      const sx = Math.min(box.x + i * step + half, box.x + box.w - 1);
      out32[j * outW + i] = norm(px[sy * width + sx]);
    }
  }
  ctx.putImageData(out, 0, 0);
  return { canvas, pixels: out32, w: outW, h: outH };
}

// Opaque-pixel centroid of the rows between fromFrac and toFrac of the height.
function centroidX(pixels, w, h, fromFrac, toFrac) {
  const y0 = Math.floor(h * fromFrac);
  const y1 = Math.max(y0 + 1, Math.floor(h * toFrac));
  let sum = 0, count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[y * w + x] !== 0) {
        sum += x + 0.5;
        count++;
      }
    }
  }
  return count ? sum / count : w / 2;
}

// Analyse + normalize a single frame image.
export function normalizeFrame(img, url, { forcedPixelSize = null, anchor = 'torso' } = {}) {
  let src;
  try {
    src = readPixels(img);
  } catch (err) {
    // Canvas tainted (e.g. opened via file://). Fall back to raw drawing.
    if (!warnedTaint) {
      console.warn('[Alva] Could not read sprite pixels; serve the game over http(s) for sprite normalization.', err);
      warnedTaint = true;
    }
    return {
      url,
      canvas: img,
      w: img.naturalWidth,
      h: img.naturalHeight,
      detected: 0,
      unit: forcedPixelSize || null,
      gridOk: false,
      anchorX: img.naturalWidth / 2,
      headX: img.naturalWidth / 2,
    };
  }

  const px = new Uint32Array(src.data.data.buffer);
  const box = findBounds(px, src.width, src.height) || { x: 0, y: 0, w: src.width, h: src.height };
  const detected = forcedPixelSize || detectPixelSize(px, src.width, box);
  const gridOk = detected >= 2;
  const step = gridOk ? detected : 1;
  const cut = extract(px, src.width, box, step);

  const anchorX =
    anchor === 'center' ? cut.w / 2 : centroidX(cut.pixels, cut.w, cut.h, 0, 0.6);

  return {
    url,
    canvas: cut.canvas,
    w: cut.w,
    h: cut.h,
    detected,
    gridOk,
    // canvas pixels per art pixel; 1 after grid resampling, resolved later otherwise
    unit: gridOk ? 1 : null,
    anchorX,
    headX: centroidX(cut.pixels, cut.w, cut.h, 0, 0.35),
    sourceBox: box,
  };
}

// A fully normalized, render-ready sprite set for one character.
export class SpriteSet {
  constructor(def) {
    this.def = def;
    this.animations = {};
    this.projectiles = {}; // projectile animations, keyed like projectileAnimations
    this.effects = {}; // effect animations (e.g. the clone cloud), keyed like effectAnimations
    this.worldPerArt = 1;
    this.refArtHeight = 1;
    this.missing = [];
    this.usable = false;
  }

  static build(def, getImage) {
    const set = new SpriteSet(def);
    const forced = typeof def.visual.pixelSize === 'number' ? def.visual.pixelSize : null;

    for (const [key, anim] of Object.entries(def.animations)) {
      const frames = [];
      for (const url of anim.frames) {
        const img = getImage(url);
        if (!img) {
          set.missing.push(url);
          continue;
        }
        frames.push(normalizeFrame(img, url, { forcedPixelSize: forced, anchor: def.visual.anchor }));
      }
      if (!frames.length) continue;

      // Frames whose grid could not be detected inherit the animation's
      // typical pixel size (they are still drawn from the raw crop).
      const sizes = frames.filter((f) => f.gridOk).map((f) => f.detected).sort((a, b) => a - b);
      if (sizes.length) {
        const typical = sizes[Math.floor(sizes.length / 2)];
        for (const f of frames) if (!f.gridOk) f.unit = typical;
      }
      set.animations[key] = {
        key,
        frames,
        fps: anim.fps,
        loop: anim.loop !== false,
        heightRatio: anim.heightRatio ?? 1,
        minSpeedScale: anim.minSpeedScale ?? 1,
        // The way this clip's own artwork faces (see Fighter.spriteFlip).
        sourceFacing: anim.sourceFacing ?? def.sourceFacing ?? 1,
        resolved: frames.every((f) => f.unit),
      };
    }

    // Projectiles and effects: same grid detection, centre anchor, no
    // height fitting.
    const buildCentred = (anims, into) => {
      for (const [key, anim] of Object.entries(anims || {})) {
        const frames = [];
        for (const url of anim.frames) {
          const img = getImage(url);
          if (!img) {
            set.missing.push(url);
            continue;
          }
          frames.push(normalizeFrame(img, url, { forcedPixelSize: forced, anchor: 'center' }));
        }
        if (!frames.length) continue;
        into[key] = {
          key,
          frames,
          fps: anim.fps,
          loop: anim.loop !== false,
          // 0: direction-neutral art, never mirrored (see Projectile.flip).
          sourceFacing: anim.sourceFacing ?? 0,
        };
      }
    };
    buildCentred(def.projectileAnimations, set.projectiles);
    buildCentred(def.effectAnimations, set.effects);

    const names = Object.keys(set.animations);
    if (!names.length) return set;

    const refKey = set.animations[def.visual.referenceAnimation]
      ? def.visual.referenceAnimation
      : names[0];
    const ref = set.animations[refKey];
    if (!ref.resolved) for (const f of ref.frames) f.unit = f.unit || 1;
    set.refArtHeight = Math.max(...ref.frames.map((f) => f.h / f.unit));

    // Animations without a detectable grid fall back to height normalization.
    for (const anim of Object.values(set.animations)) {
      if (anim.resolved || anim === ref) continue;
      const maxH = Math.max(...anim.frames.map((f) => f.h));
      const unit = maxH / (set.refArtHeight * anim.heightRatio);
      for (const f of anim.frames) f.unit = unit;
    }

    for (const anim of Object.values(set.animations)) {
      for (const f of anim.frames) {
        f.artW = f.w / f.unit;
        f.artH = f.h / f.unit;
        f.anchorArtX = f.anchorX / f.unit;
        f.headArtX = f.headX / f.unit;
      }
      anim.maxArtH = Math.max(...anim.frames.map((f) => f.artH));
    }

    // One projectile or effect art pixel is one fighter art pixel. A frame
    // whose grid could not be detected borrows the reference clip's pixel size.
    for (const anim of [...Object.values(set.projectiles), ...Object.values(set.effects)]) {
      for (const f of anim.frames) {
        f.unit = f.unit || ref.frames[0].unit;
        f.artW = f.w / f.unit;
        f.artH = f.h / f.unit;
        f.anchorArtX = f.anchorX / f.unit;
        f.anchorArtY = f.artH / 2;
      }
    }

    set.worldPerArt = def.visual.height / set.refArtHeight;
    set.usable = true;
    return set;
  }

  has(key) {
    return !!this.animations[key];
  }

  // Normalized projectile animation, or null without its own art.
  projectile(key) {
    return this.projectiles[key] || null;
  }

  // Normalized effect animation, or null without its own art.
  effect(key) {
    return this.effects[key] || null;
  }

  // Seconds one pass of a dedicated animation takes (0 without its own art).
  duration(key) {
    const anim = this.animations[key];
    return anim ? anim.frames.length / anim.fps : 0;
  }

  // Resolve a logical state (e.g. 'jump') to a playable animation + optional
  // held frame using the character's fallback table.
  resolve(stateKey) {
    if (this.animations[stateKey]) return { anim: this.animations[stateKey], hold: null };
    const fb = this.def.animationFallbacks?.[stateKey];
    if (fb && this.animations[fb.animation]) {
      return { anim: this.animations[fb.animation], hold: fb.frame ?? null };
    }
    const first = this.animations.idle || Object.values(this.animations)[0];
    return { anim: first, hold: null };
  }

  // Square portrait canvas cropped around the head (1 px per art pixel), or
  // null without a decoded frame to crop.
  makePortrait() {
    const cfg = this.def.visual.portrait || {};
    const anim = this.animations[cfg.animation] || this.animations.idle || Object.values(this.animations)[0];
    if (!anim) return null;
    const f = anim.frames[Math.min(cfg.frame || 0, anim.frames.length - 1)];
    if (!f?.canvas) return null;
    const size = Math.round(f.artH * (cfg.size ?? 0.5));
    const cx = f.headArtX;
    const cy = f.artH * (cfg.centerY ?? 0.25);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const sx = (cx - size / 2) * f.unit;
    const sy = (cy - size / 2) * f.unit;
    ctx.drawImage(f.canvas, sx, sy, size * f.unit, size * f.unit, 0, 0, size, size);
    return canvas;
  }
}

// Draws a normalized frame with its anchor (bottom-centre) at device pixel
// position (x, y). `pxPerArt` is device pixels per art pixel.
export function drawFrame(ctx, frame, x, y, pxPerArt, flip) {
  const w = frame.artW * pxPerArt;
  const h = frame.artH * pxPerArt;
  const ax = Math.round(frame.anchorArtX * pxPerArt);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(frame.canvas, -ax, -Math.round(h), Math.round(w), Math.round(h));
  ctx.restore();
}

// Draws a normalized projectile or effect frame centred on device pixel
// position (x, y), at the same `pxPerArt` as the fighters.
export function drawCenteredFrame(ctx, frame, x, y, pxPerArt, flip) {
  const w = frame.artW * pxPerArt;
  const h = frame.artH * pxPerArt;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(
    frame.canvas,
    -Math.round(frame.anchorArtX * pxPerArt), -Math.round(frame.anchorArtY * pxPerArt),
    Math.round(w), Math.round(h),
  );
  ctx.restore();
}
