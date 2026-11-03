// Loads images once, de-duplicates requests and reports progress.
// Failed images resolve to null (logged) so one bad file never crashes the app.
//
// Where an asset's bytes come from (assetSource). On the site (the
// repository served as it is: GitHub Pages, any static server) every asset
// is a file of its own, loaded from its path. A release that packs files
// together (the itch.io release, tools/itch/build.mjs, to stay under the
// host's file limit) runs a script before the game that sets
// `globalThis.ALVA_PACKED_ASSETS`: each packed file's exact bytes, in
// base64, under its own path. Such a file is then loaded from a data: URL
// of those very bytes, so it decodes to exactly the same image. Everything
// else in the game keeps naming the asset by its path (its frames, its
// keys, its checks): only the source the browser reads changes.

// The packed release's files, path (without "./") -> base64, or null on
// the site.
const packedAssets = () => globalThis.ALVA_PACKED_ASSETS ?? null;

// Media types of what may be packed, by extension.
const MEDIA_TYPES = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' });

// Each packed file's data: URL, built once for the pack it came from.
const packedSources = new Map();
let sourcesOf = null;

// What the browser should load for asset `url` (a page-relative path such
// as ./assets/characters/0001/0001_idle_1.png): `url` itself, unless the
// release packed that file, then a data: URL of its exact bytes.
export function assetSource(url) {
  const pack = packedAssets();
  if (!pack || typeof url !== 'string') return url;
  const path = url.replace(/^\.\//, '');
  if (!Object.hasOwn(pack, path)) return url;
  if (sourcesOf !== pack) {
    packedSources.clear();
    sourcesOf = pack;
  }
  let source = packedSources.get(path);
  if (!source) {
    const type = MEDIA_TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';
    source = `data:${type};base64,${pack[path]}`;
    packedSources.set(path, source);
  }
  return source;
}

export class AssetLoader {
  constructor() {
    this.images = new Map();   // url -> HTMLImageElement
    this.pending = new Map();  // url -> Promise
    this.failed = new Set();
  }

  loadImage(url) {
    if (this.images.has(url)) return Promise.resolve(this.images.get(url));
    if (this.pending.has(url)) return this.pending.get(url);

    const promise = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = async () => {
        try {
          if (img.decode) await img.decode();
        } catch {
          /* decode() can reject for already-decoded images; onload is enough */
        }
        this.images.set(url, img);
        this.failed.delete(url);
        this.pending.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        console.error(`[Alva] Failed to load image asset: ${url}`);
        this.failed.add(url);
        this.pending.delete(url);
        resolve(null);
      };
      // Still keyed, reported and retried by its path, whatever it is
      // read from (see assetSource).
      img.src = assetSource(url);
    });

    this.pending.set(url, promise);
    return promise;
  }

  // Loads a list of urls, calling onProgress(loaded, total) as each settles.
  async loadAll(urls, onProgress) {
    const unique = [...new Set(urls)];
    let done = 0;
    onProgress?.(0, unique.length);
    const results = await Promise.all(
      unique.map((url) =>
        this.loadImage(url).then((img) => {
          done += 1;
          onProgress?.(done, unique.length);
          return [url, img];
        }),
      ),
    );
    const failed = results.filter(([, img]) => !img).map(([url]) => url);
    return { images: new Map(results), failed };
  }

  get(url) {
    return this.images.get(url) || null;
  }

  // Allow a retry after a failed attempt.
  forget(url) {
    this.failed.delete(url);
    this.images.delete(url);
  }
}
