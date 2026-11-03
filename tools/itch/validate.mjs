// Validates the itch.io release (dist/itch) and its archive
// (dist/alva-itch.zip) before either counts as done: run by the build, or
// on its own (`node tools/itch/validate.mjs`) to check an existing release.
//
// It checks the platform's limits (files, total and per-file size, path
// length), that nothing development-only was packaged (tests, docs, tools,
// source maps, Git, npm), that the release is current (its page, joined
// stylesheet and assets exactly what the repository's would make now, its
// bundle every module in ES evaluation order), that everything the game
// loads is in it under its exact, case-sensitive name (every fighter's
// frames, in the pack byte for byte, the icons, the images the code
// names), that nothing loads from
// another host, and that the archive extracts to exactly the folder, with
// index.html at its root.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';
import {
  ROOT, OUT_DIR, ZIP_PATH, BUNDLE_JS, BUNDLE_CSS, ASSET_PACK, COPIED_FILES, COPIED_DIRS, PACKED_DIRS, LIMITS,
  read, pageParts, joinStylesheets, releasePage, moduleOrder, isPacked, readPack,
} from './release.mjs';
import { readZip } from './zip.mjs';

// Every file under `dir`, as relative paths with their names' real case.
export function listFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = `${prefix}${e.name}`;
    return e.isDirectory() ? listFiles(`${dir}/${e.name}`, `${path}/`) : [path];
  }).sort();
}

const RELEASE_ROOT = new Set(['index.html', BUNDLE_JS, BUNDLE_CSS, ASSET_PACK, ...COPIED_FILES, ...COPIED_DIRS]);
const DEVELOPMENT_ONLY = [
  /(^|\/)(tests?|docs|tools|node_modules|dist|\.git|\.github|\.claude)(\/|$)/,
  /\.(map|mjs|md|log|zip)$/i,
  /(^|\/)(package(-lock)?\.json|\.nojekyll|\.gitignore|codename_rule|character_rule|max)$/,
  /\.test\./,
];
const SAFE_PATH = /^[A-Za-z0-9._\-/]+$/;
const ASSET_PATH = /(["'`])((?:\.\/)?[A-Za-z0-9_\-./]+\.(?:png|jpe?g|gif|svg|webp|ico|ogg|mp3|wav|m4a|json|webmanifest|css|js|mjs|html))\1/gi;
const EXTERNAL_URL = /https?:\/\/[^'"`\s)<>]+/g;
const MODULE_MARKER = /^\/\/ (js\/\S+\.js)$/gm;

// The braces of one stylesheet part balance outside its comments and
// strings: a part left open would swallow the next one once joined.
function bracesBalance(css) {
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) return false;
      i = end + 1;
    } else if (c === '"' || c === "'") {
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === '\\') i++;
    } else if (c === '{') depth++;
    else if (c === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

const sameBytes = (a, b) => a.length === b.length && a.equals(b);

export async function validateRelease({ dir = OUT_DIR, zip = ZIP_PATH, checkZip = true } = {}) {
  const problems = [];
  const warnings = [];
  const fail = (message) => problems.push(message);
  const base = `${ROOT}${dir}`;
  if (!existsSync(`${base}/index.html`)) {
    fail(`${dir}/index.html is missing: build the release first (npm run build:itch)`);
    return { problems, warnings, stats: null };
  }
  const files = listFiles(base);
  const fileSet = new Set(files);
  const bytes = new Map(files.map((f) => [f, readFileSync(`${base}/${f}`)]));
  // The packed files (the fighters' frames), path -> bytes, read back from
  // the pack exactly as the game reads them.
  let pack = new Map();
  try {
    pack = readPack(bytes.get(ASSET_PACK)?.toString('utf8') ?? '');
  } catch (err) {
    fail(`${ASSET_PACK}: ${err.message}`);
  }
  // A path the game loads is in the release as a file or, for a packed
  // folder, in the pack.
  const has = (path) => {
    const p = path.replace(/^\.\//, '');
    return isPacked(p) ? pack.has(p) : fileSet.has(p);
  };

  // The platform's limits, with a margin below the file count.
  const totalBytes = [...bytes.values()].reduce((n, b) => n + b.length, 0);
  if (files.length >= LIMITS.files) fail(`${files.length} files: itch.io accepts at most ${LIMITS.files}`);
  else if (files.length > LIMITS.comfortableFiles) warnings.push(`${files.length} files: above the ${LIMITS.comfortableFiles} margin`);
  if (totalBytes > LIMITS.totalBytes) fail(`${totalBytes} bytes in all: over ${LIMITS.totalBytes}`);
  const lower = new Map();
  for (const f of files) {
    if (bytes.get(f).length > LIMITS.fileBytes) fail(`${f}: over ${LIMITS.fileBytes} bytes`);
    if (f.length > LIMITS.pathLength) fail(`${f}: path longer than ${LIMITS.pathLength} characters`);
    if (!SAFE_PATH.test(f)) fail(`${f}: a character outside A-Z a-z 0-9 . _ - /`);
    const key = f.toLowerCase();
    if (lower.has(key)) fail(`${f} and ${lower.get(key)} differ only in case`);
    lower.set(key, f);
    // Nothing development-only, and nothing at the root but the release's own.
    if (!RELEASE_ROOT.has(f.split('/')[0])) fail(`${f}: not part of the release`);
    if (DEVELOPMENT_ONLY.some((re) => re.test(f))) fail(`${f}: development-only`);
  }

  // The page: the repository's, with the joined stylesheet and the bundle
  // in place of the parts and modules, every local URL a file of the
  // release under its exact name, none of them on another host.
  const html = bytes.get('index.html').toString('utf8');
  if (html !== releasePage()) fail('index.html is not the current page: rebuild the release');
  for (const [, url] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    if (/^[a-z]+:|^\/\//i.test(url)) fail(`index.html loads ${url} from another host`);
    else if (url.startsWith('/')) fail(`index.html: ${url} is root-relative (every URL must be relative)`);
    else if (!has(url)) fail(`index.html references ${url}, which is not in the release`);
  }
  for (const needed of [ASSET_PACK, BUNDLE_JS, BUNDLE_CSS]) {
    if (!html.includes(`"./${needed}"`)) fail(`index.html does not load ./${needed}`);
  }
  if (/["'](?:\.\/)?(?:js|css)\//.test(html)) fail('index.html still references a source module or stylesheet part');

  // The stylesheet: the page's parts, joined in their cascade order, each
  // whole, with nothing whose meaning depends on its own file.
  const { stylesheets, entry } = pageParts();
  for (const part of stylesheets) {
    const css = read(part);
    if (!bracesBalance(css)) fail(`${part}: unbalanced braces (it would swallow the next part)`);
    if (/@import|@charset|url\(/i.test(css)) fail(`${part}: @import, @charset or url() would change meaning once joined`);
  }
  if (bytes.get(BUNDLE_CSS)?.toString('utf8') !== joinStylesheets(stylesheets)) {
    fail(`${BUNDLE_CSS} is not the page's ${stylesheets.length} stylesheet parts joined in order: rebuild the release`);
  }

  // The bundle: every module of the page's graph, once, in ES evaluation
  // order, with no source map and no path back to a source module.
  const js = bytes.get(BUNDLE_JS)?.toString('utf8') ?? '';
  const expected = moduleOrder(entry);
  const bundled = [...js.matchAll(MODULE_MARKER)].map((m) => m[1]);
  if (bundled.join('\n') !== expected.join('\n')) {
    const at = expected.findIndex((m, i) => bundled[i] !== m);
    fail(`${BUNDLE_JS}: modules not in ES evaluation order (first difference at #${at + 1}: ` +
      `${bundled[at] ?? 'nothing'} where ${expected[at] ?? 'nothing'} runs)`);
  }
  if (/sourceMappingURL/.test(js)) fail(`${BUNDLE_JS} points to a source map`);
  const code = (await transform(js, { minifyWhitespace: true, format: 'esm', charset: 'utf8', legalComments: 'none' })).code;
  const named = new Set([...code.matchAll(ASSET_PATH)].map((m) => m[2]));
  for (const path of named) {
    if (/^(?:\.\/)?(?:js|css)\//.test(path)) fail(`${BUNDLE_JS} references the source file ${path}`);
    else if (!has(path)) fail(`${BUNDLE_JS} names ${path}, which is not in the release (names are case-sensitive)`);
  }

  // Everything the game loads by building its path: every registered
  // fighter's frames, read from the registry itself.
  const { CHARACTERS, characterFramePaths } = await import(pathToFileURL(`${ROOT}js/data/characters.js`).href);
  let frames = 0;
  for (const c of CHARACTERS) {
    for (const url of characterFramePaths(c)) {
      frames++;
      if (!has(url)) fail(`#${c.id}: ${url} is not in the release`);
    }
  }
  const manifest = JSON.parse(bytes.get('manifest.webmanifest')?.toString('utf8') ?? '{}');
  for (const icon of manifest.icons ?? []) if (!has(icon.src)) fail(`manifest icon ${icon.src} is not in the release`);

  // No other host: the only addresses in the release are the credits' links
  // to the sprite sources (opened by the player, never loaded).
  const approved = new Set(read('js/ui/credits.js').match(EXTERNAL_URL) ?? []);
  for (const f of files.filter((p) => /\.(html|css|js|webmanifest)$/.test(p))) {
    for (const url of bytes.get(f).toString('utf8').match(EXTERNAL_URL) ?? []) {
      if (!approved.has(url)) fail(`${f}: ${url} is another host, not a credits link`);
    }
  }

  // Copies, byte for byte: the root files and every asset, nothing more;
  // a packed asset in the pack (and never also a file of its own), the
  // pack holding exactly the repository's packed folders.
  for (const f of COPIED_FILES) {
    if (!fileSet.has(f)) fail(`${f} is missing`);
    else if (!sameBytes(bytes.get(f), readFileSync(`${ROOT}${f}`))) fail(`${f} differs from the repository's`);
  }
  const packedSource = new Set();
  for (const d of COPIED_DIRS) {
    const source = listFiles(`${ROOT}${d}`).map((f) => `${d}/${f}`);
    const copied = files.filter((f) => f.startsWith(`${d}/`));
    for (const f of source) {
      const where = isPacked(f) ? ASSET_PACK : dir;
      const got = isPacked(f) ? pack.get(f) : bytes.get(f);
      if (isPacked(f)) packedSource.add(f);
      if (!got) fail(`${f} is missing from ${where}`);
      else if (!sameBytes(got, readFileSync(`${ROOT}${f}`))) fail(`${f} in ${where} differs from the repository's`);
    }
    const sourceSet = new Set(source);
    for (const f of copied) {
      if (!sourceSet.has(f)) fail(`${f} is not in the repository's ${d}/`);
      else if (isPacked(f)) fail(`${f}: packed, so it is never also a file of its own`);
    }
  }
  for (const f of pack.keys()) if (!packedSource.has(f)) fail(`${ASSET_PACK} holds ${f}, which is not in the repository's ${PACKED_DIRS.join(', ')}`);

  // The archive: exactly the folder, index.html at its root.
  let zipBytes = 0;
  if (checkZip) {
    if (!existsSync(`${ROOT}${zip}`)) fail(`${zip} is missing`);
    else {
      zipBytes = statSync(`${ROOT}${zip}`).size;
      try {
        const entries = readZip(readFileSync(`${ROOT}${zip}`));
        const names = entries.map((e) => e.name);
        if (!names.includes('index.html')) fail(`${zip}: no index.html at its root`);
        if (new Set(names).size !== names.length) fail(`${zip}: duplicate entries`);
        for (const e of entries) {
          if (e.name.startsWith('/') || e.name.split('/').includes('..')) fail(`${zip}: unsafe entry ${e.name}`);
          else if (!fileSet.has(e.name)) fail(`${zip}: ${e.name} is not in ${dir}`);
          else if (!sameBytes(e.data, bytes.get(e.name))) fail(`${zip}: ${e.name} differs from ${dir}`);
        }
        const inZip = new Set(names);
        for (const f of files) if (!inZip.has(f)) fail(`${zip}: ${f} is missing`);
      } catch (err) {
        fail(`${zip}: ${err.message}`);
      }
    }
  }

  const stats = {
    files: files.length,
    totalBytes,
    zipBytes,
    largest: files.reduce((a, f) => (bytes.get(f).length > bytes.get(a).length ? f : a), files[0]),
    longestPath: files.reduce((a, f) => (f.length > a.length ? f : a), files[0]),
    modules: bundled.length,
    stylesheets: stylesheets.length,
    frames,
    packed: pack.size,
    byFolder: files.reduce((m, f) => {
      const folder = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.';
      m[folder] = (m[folder] ?? 0) + 1;
      return m;
    }, {}),
  };
  return { problems, warnings, stats };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { problems, warnings, stats } = await validateRelease();
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const p of problems) console.error(`problem: ${p}`);
  if (stats) console.log(`${stats.files} files, ${stats.totalBytes} bytes; archive ${stats.zipBytes} bytes`);
  console.log(problems.length ? `The release is NOT valid (${problems.length} problem(s)).` : 'The release is valid.');
  process.exitCode = problems.length ? 1 : 0;
}
