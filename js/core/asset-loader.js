// Loads images once, de-duplicates requests and reports progress.
// Failed images resolve to null (logged) so one bad file never crashes the app.

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
      img.src = url;
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
