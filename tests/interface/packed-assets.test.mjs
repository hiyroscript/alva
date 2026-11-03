// Run with node --test tests/interface/packed-assets.test.mjs (no dependencies).
// Packed assets: where the game reads an asset's bytes from (assetSource
// in js/core/asset-loader.js), and the pack the itch.io release ships its
// fighters' frames in (tools/itch/release.mjs). On the site every asset is
// a file of its own and assetSource changes nothing; a release that packs
// files sets `globalThis.ALVA_PACKED_ASSETS` before the game starts, and a
// packed file is then read from a data: URL of its exact bytes, so it
// decodes to the very same image. The frames' paths, keys and checks stay
// the same everywhere. The release itself (its build, validation and the
// bundle played against the source) is checked by `npm run build:itch` and
// `npm run verify:itch` (docs/development/itch-release.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { AssetLoader, assetSource } from '../../js/core/asset-loader.js';
import { CHARACTERS, characterFramePaths } from '../../js/data/characters.js';
import {
  ASSET_PACK, BUNDLE_JS, PACKED_DIRS, PACK_GLOBAL, isPacked, readPack, releasePage, writePack,
} from '../../tools/itch/release.mjs';

const ROOT = new URL('../../', import.meta.url);
const bytesOf = (url) => readFileSync(new URL(url.replace(/^\.\//, ''), ROOT));
const FRAME = './assets/characters/0001/0001_idle_1.png';

// Runs `fn` with `pack` set as the release's packed assets, and takes it
// away again whatever happens.
function withPack(pack, fn) {
  globalThis.ALVA_PACKED_ASSETS = pack;
  try {
    return fn();
  } finally {
    delete globalThis.ALVA_PACKED_ASSETS;
  }
}

// Every frame of every registered fighter, by its path.
const FRAMES = [...new Set(CHARACTERS.flatMap((c) => characterFramePaths(c)))].sort();

// ---- assetSource ----------------------------------------------------------------

test('on the site every asset is read from its own file: assetSource changes nothing', () => {
  assert.equal(globalThis.ALVA_PACKED_ASSETS, undefined);
  for (const url of [FRAME, './hs.jpg', 'controller.PNG', './alvafav.PNG', '', null, undefined]) assert.equal(assetSource(url), url);
});

test('in a release that packs it, a file is read from a data: URL of its exact bytes; anything else from its own file', () => {
  const b64 = bytesOf(FRAME).toString('base64');
  withPack({ 'assets/characters/0001/0001_idle_1.png': b64 }, () => {
    const source = assetSource(FRAME);
    assert.equal(source, `data:image/png;base64,${b64}`);
    assert.equal(assetSource(FRAME.slice(2)), source, 'with or without ./');
    assert.ok(Buffer.from(source.split(',')[1], 'base64').equals(bytesOf(FRAME)), 'the very bytes of the file');
    assert.equal(assetSource('./assets/characters/0001/0001_idle_2.png'), './assets/characters/0001/0001_idle_2.png', 'not packed');
    assert.equal(assetSource('./hs.jpg'), './hs.jpg');
  });
  // A pack of its own: never another pack's bytes.
  withPack({ 'assets/characters/0001/0001_idle_1.png': 'AAAA' }, () => {
    assert.equal(assetSource(FRAME), 'data:image/png;base64,AAAA');
  });
  assert.equal(assetSource(FRAME), FRAME, 'gone with the pack');
});

test('the loader reads a packed file from its bytes, and still knows, keys and reports it by its path', async () => {
  const made = [];
  const saved = globalThis.Image;
  globalThis.Image = class {
    constructor() {
      made.push(this);
    }

    set src(value) {
      this._src = value;
      queueMicrotask(() => (value.startsWith('data:') || value === './hs.jpg' ? this.onload() : this.onerror()));
    }

    get src() {
      return this._src;
    }
  };
  try {
    const b64 = bytesOf(FRAME).toString('base64');
    await withPack({ 'assets/characters/0001/0001_idle_1.png': b64 }, async () => {
      const assets = new AssetLoader();
      const img = await assets.loadImage(FRAME);
      assert.equal(img.src, `data:image/png;base64,${b64}`);
      assert.equal(assets.get(FRAME), img, 'kept under its path');
      assert.equal(await assets.loadImage('./hs.jpg'), made[1], 'an unpacked file from its own path');
      assert.equal(made[1].src, './hs.jpg');
    });
  } finally {
    globalThis.Image = saved;
  }
});

// ---- The release's pack -------------------------------------------------------------------

test('the release packs every fighter frame: exactly the files of its packed folders, read back byte for byte', () => {
  assert.deepEqual(PACKED_DIRS, ['assets/characters']);
  assert.ok(FRAMES.length > 1000, `${FRAMES.length} frames: more than itch.io accepts as files`);
  for (const url of FRAMES) assert.ok(isPacked(url), url);
  for (const path of ['assets/icons/alva-192.png', 'assets/favicon.svg', 'hs.jpg', 'alvafav.PNG']) assert.equal(isPacked(path), false, path);
  const files = FRAMES.map((url) => ({ path: url.slice(2), data: bytesOf(url) }));
  const text = writePack(files);
  assert.equal(writePack([...files].reverse()), text, 'the same files make the same pack');
  const back = readPack(text);
  assert.equal(back.size, FRAMES.length);
  for (const { path, data } of files) assert.ok(back.get(path).equals(data), path);
  assert.throws(() => readPack(`${text}// edited`), /not a pack/);
  // Run as the page runs it, the script sets exactly what assetSource
  // reads: every frame then decodes from the very bytes of its file.
  const sandbox = {};
  sandbox.globalThis = sandbox;
  runInNewContext(text, sandbox);
  assert.equal(PACK_GLOBAL, 'ALVA_PACKED_ASSETS');
  assert.ok(Object.isFrozen(sandbox[PACK_GLOBAL]), 'never changed once set');
  withPack(sandbox[PACK_GLOBAL], () => {
    for (const url of FRAMES) {
      const source = assetSource(url);
      assert.ok(source.startsWith('data:image/png;base64,'), url);
      assert.ok(Buffer.from(source.slice(source.indexOf(',') + 1), 'base64').equals(bytesOf(url)), url);
    }
  });
});

test('the release page runs the pack before the game: a deferred script just before the bundle', () => {
  const page = releasePage();
  const pack = page.indexOf(`<script defer src="./${ASSET_PACK}"></script>`);
  const bundle = page.indexOf(`<script type="module" src="./${BUNDLE_JS}"></script>`);
  assert.ok(pack > 0 && bundle > pack, 'deferred scripts and modules run in document order');
  assert.equal(page.match(/<script\b/g).length, 2, 'nothing else added');
  assert.doesNotMatch(page, /\.\/js\//, 'no source module');
});
