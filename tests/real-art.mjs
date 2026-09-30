// Shared helpers for the tests that read a fighter's real art (imported by
// fighter-0002.test.mjs and fighter-0003.test.mjs; not a test file
// itself): the repository's files, its PNGs decoded without dependencies,
// and SpriteSet built from them on just enough canvas, so the normalizer's
// real crop, grid, scale and anchors can be checked. Paint still needs
// real-browser verification.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { SpriteSet } from '../js/game/sprite-normalizer.js';

// The repository root, as a path.
export const ROOT = new URL('../', import.meta.url).pathname;

export const sha256 = (path) => createHash('sha256').update(readFileSync(`${ROOT}${path}`)).digest('hex');

// Every file under `dir` (relative to the repository root), .git aside.
export function walk(dir = '') {
  return readdirSync(`${ROOT}${dir}`, { withFileTypes: true }).flatMap((e) => {
    if (e.name === '.git') return [];
    const path = `${dir}${e.name}`;
    return e.isDirectory() ? walk(`${path}/`) : [path];
  });
}

// A decoded PNG (8-bit RGBA, not interlaced, as every #0002 and #0003 file
// is) in the shape the normalizer reads: naturalWidth / naturalHeight and
// pixels.
export function decodePng(path) {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.deepEqual([data[8], data[9], data[12]], [8, 6, 0], `${path}: 8-bit RGBA, not interlaced`);
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = new Uint8ClampedArray(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * stride + x - 4] : 0;
      let v = raw[y * (stride + 1) + 1 + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { naturalWidth: width, naturalHeight: height, pixels: px };
}

// Just enough canvas for the normalizer, keeping the resampled crop it puts
// (canvas.image) so the test can read it back.
export function withFakeCanvas(fn) {
  const saved = globalThis.document;
  globalThis.document = {
    createElement: () => {
      let drawn = null;
      const canvas = {
        width: 0,
        height: 0,
        image: null,
        getContext: () => ({
          drawImage: (img) => { drawn = img; },
          getImageData: () => ({ data: new Uint8ClampedArray(drawn.pixels) }),
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: (image) => { canvas.image = image; },
        }),
      };
      return canvas;
    },
  };
  try {
    return fn();
  } finally {
    globalThis.document = saved;
  }
}

// A fighter's SpriteSet built from its real PNGs at `urls` (./-relative
// paths, as the definitions give them).
export const buildReal = (def, urls) => {
  const images = new Map(urls.map((url) => [url, decodePng(ROOT + url.slice(2))]));
  return withFakeCanvas(() => SpriteSet.build(def, (url) => images.get(url)));
};

// Whether art pixel (x, y) of normalized frame `f` is drawn.
export const opaque = (f, x, y) => x >= 0 && y >= 0 && x < f.w && y < f.h && f.canvas.image.data[(y * f.w + x) * 4 + 3] > 16;
// First drawn run of row `y` ([from, to] columns), or null.
export function firstRun(f, y) {
  let x = 0;
  while (x < f.w && !opaque(f, x, y)) x++;
  if (x === f.w) return null;
  const from = x;
  while (x + 1 < f.w && opaque(f, x + 1, y)) x++;
  return [from, x];
}
// Leftmost / rightmost drawn column of row `y`, or null.
export function rowSpan(f, y) {
  let lo = null;
  let hi = null;
  for (let x = 0; x < f.w; x++) {
    if (!opaque(f, x, y)) continue;
    lo ??= x;
    hi = x;
  }
  return lo === null ? null : [lo, hi];
}
