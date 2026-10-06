// Real fighter art for the tests (imported by the *.test.mjs files; not a
// test file itself): a PNG decoder for the 8-bit RGBA files the fighters'
// frames are, and just enough canvas for the SpriteSet normalizer to read
// their pixels, so a test can check what the game makes of the real files
// (sizes, anchors, portraits). Paint and layout still need a real browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { characterFramePaths } from '../../js/data/characters.js';
import { SpriteSet } from '../../js/game/rendering/sprite-normalizer.js';

export const ROOT = new URL('../../', import.meta.url).pathname;

// The pixels of the PNG at `path`: { naturalWidth, naturalHeight, pixels }
// (RGBA, row by row), as an image the normalizer can draw.
export function decodePng(path) {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  let header = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      header = [data[8], data[9], data[12]];
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  assert.deepEqual(header, [8, 6, 0], `${path}: 8-bit RGBA, not interlaced`);
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

// Runs `fn` with a stand-in document whose canvases hand back the pixels of
// the image last drawn on them: what the normalizer needs to measure art.
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

// `character`'s every frame decoded (url -> image), and the SpriteSet the
// game builds from them.
export function realArt(character) {
  const images = new Map(characterFramePaths(character).map((url) => [url, decodePng(ROOT + url.slice(2))]));
  const sprites = withFakeCanvas(() => SpriteSet.build(character, (url) => images.get(url)));
  return { images, sprites };
}
