// What the itch.io release export (tools/itch/build.mjs) shares with its
// validation (validate.mjs) and its equivalence check (equivalence.mjs):
// where things are, the platform's limits, how the JavaScript is bundled and
// how the page's parts are read from index.html.
//
// The repository stays the site: index.html, its css/ parts and its js/
// modules run as they are, with no build (docs/development/setup.md). The
// release is an optional, generated copy of the same game in fewer files,
// for hosts that cap the number of files (itch.io: 1,000). Nothing here
// edits the source, and the release is never edited by hand: it is rebuilt.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

// The release, and its archive beside it (never inside it). Both are
// generated and ignored by Git (.gitignore).
export const DIST = 'dist';
export const OUT_DIR = `${DIST}/itch`;
export const ZIP_PATH = `${DIST}/alva-itch.zip`;

// The release's own files: the page, the bundled modules, the joined
// stylesheet and the packed fighter frames. Everything else is copied
// unchanged from the repository.
export const BUNDLE_JS = 'game.js';
export const BUNDLE_CSS = 'game.css';
export const ASSET_PACK = 'game-assets.js';

// What the game loads besides its modules and stylesheet, copied as they
// are: the manifest, the favicon and splash images, Home's controller
// picture, and every asset but the packed ones (the icons), byte for byte.
export const COPIED_FILES = ['manifest.webmanifest', 'alvafav.PNG', 'controller.PNG', 'hs.jpg'];
export const COPIED_DIRS = ['assets'];

// The folders whose files are packed into ASSET_PACK instead of copied one
// by one: every fighter's frames (over a thousand PNGs, more than itch.io
// accepts in a whole game). Each keeps its exact bytes, under its own path:
// the game loads it from a data: URL of those bytes (assetSource in
// js/core/asset-loader.js), so it decodes to the very same image.
export const PACKED_DIRS = ['assets/characters'];
export const isPacked = (path) => PACKED_DIRS.some((d) => path.replace(/^\.\//, '').startsWith(`${d}/`));

// The global the pack sets, read by assetSource.
export const PACK_GLOBAL = 'ALVA_PACKED_ASSETS';
const PACK_HEAD = '// Alva\'s fighter frames, packed for release by tools/itch/build.mjs: every file of\n' +
  `// ${PACKED_DIRS.map((d) => `${d}/`).join(', ')}, byte for byte (base64), under its own path, for\n` +
  '// assetSource (js/core/asset-loader.js). Generated: never edit it; change the files and rebuild.\n' +
  `globalThis.${PACK_GLOBAL} = Object.freeze({\n`;
const PACK_TAIL = '});\n';

// The pack's script for `files` ([{ path, data }], path relative to the
// repository root, data a Buffer): one line per file, in path order, so the
// same files always make the same pack.
export function writePack(files) {
  const lines = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(({ path, data }) => `  ${JSON.stringify(path)}: ${JSON.stringify(Buffer.from(data).toString('base64'))},\n`);
  return `${PACK_HEAD}${lines.join('')}${PACK_TAIL}`;
}

// The files a pack's script holds, path -> Buffer of their bytes; throws
// on anything but a pack writePack made.
export function readPack(text) {
  if (!text.startsWith(PACK_HEAD) || !text.endsWith(PACK_TAIL)) throw new Error('not a pack made by writePack');
  const body = text.slice(PACK_HEAD.length, text.length - PACK_TAIL.length).replace(/,\n$/, '');
  const entries = JSON.parse(`{${body}}`);
  return new Map(Object.entries(entries).map(([path, b64]) => [path, Buffer.from(b64, 'base64')]));
}

// What is development-only and never part of the release, wherever it
// sits: the tests, documentation, tools, the room server (server/, a
// Cloudflare Worker deployed on its own: docs/development/online-server.md),
// the native apps' shells (src-tauri/, android/ and capacitor.config.json,
// which wrap this release: docs/development/native-apps.md), npm, Git and
// editor files, source maps, Markdown and the repository's own rule files.
// The build copies none of it, and the validation fails a release holding
// any.
export const DEVELOPMENT_ONLY = Object.freeze([
  /(^|\/)(tests?|docs|tools|server|src-tauri|android|node_modules|dist|\.git|\.github|\.claude|\.wrangler)(\/|$)/,
  /\.(map|mjs|md|log|zip|toml)$/i,
  /(^|\/)(package(-lock)?\.json|capacitor\.config\.json|\.nojekyll|\.gitignore|codename_rule|character_rule|max)$/,
  /\.test\./,
]);
export const isDevelopmentOnly = (path) => DEVELOPMENT_ONLY.some((re) => re.test(path));

// itch.io's limits for an HTML5 game's ZIP (as extracted), and the margin
// the release keeps below the file limit.
export const LIMITS = Object.freeze({
  files: 1000,
  comfortableFiles: 950,
  totalBytes: 500 * 1024 * 1024,
  fileBytes: 200 * 1024 * 1024,
  pathLength: 240,
});

export const read = (path) => readFileSync(`${ROOT}${path}`, 'utf8');

// The release's version: package.json's `version`, the one place it is
// written (docs/development/native-apps.md). Every build reads it from
// there: the bundle (releaseDefine below), the desktop apps
// (src-tauri/tauri.conf.json), the Android app (android/app/build.gradle)
// and the room server's CURRENT_VERSION (server/wrangler.toml, held to it
// by a test). Three whole numbers, MAJOR.MINOR.PATCH, MINOR and PATCH
// under 100, so the Android versionCode made from it always grows with it.
export const VERSION_PATTERN = /^(0|[1-9]\d*)\.([1-9]?\d)\.([1-9]?\d)$/;

export function releaseVersion(pkg = JSON.parse(read('package.json'))) {
  const version = pkg?.version;
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
    throw new Error(`package.json's version should be MAJOR.MINOR.PATCH (MINOR and PATCH under 100), not ${JSON.stringify(version)}`);
  }
  return version;
}

// Android's versionCode for `version` (android/app/build.gradle makes the
// same): MAJOR × 10000 + MINOR × 100 + PATCH, so 1.0.0 is 10000 and 1.2.3
// is 10203. A newer version always has a higher code, which Android needs
// to install an update over the app.
export function versionCode(version) {
  const [, major, minor, patch] = String(version).match(VERSION_PATTERN) ?? [];
  if (major === undefined) throw new Error(`not a release version: ${version}`);
  return Number(major) * 10000 + Number(minor) * 100 + Number(patch);
}

// What the bundle has in place of the version global: CONFIG.version
// (js/config.js) reads globalThis.ALVA_RELEASE_VERSION, which nothing
// sets, so the modules as they are play as 'dev'; bundled, it is this
// release's version, written in as a plain string. Nothing else changes.
export const RELEASE_GLOBAL = 'globalThis.ALVA_RELEASE_VERSION';
export const releaseDefine = (version = releaseVersion()) => Object.freeze({ [RELEASE_GLOBAL]: JSON.stringify(version) });

// How js/ is bundled. Every option keeps the code as written: one ES
// module (the page still loads it with type="module", so it is strict,
// deferred and module-scoped as before), no syntax lowered (esnext), no
// minification, no tree shaking (nothing dropped for looking unused: the
// registries are read through their exports), no source map. esbuild only
// joins the modules in their ES evaluation order, renames a top-level name
// where two modules share it and writes the release's version in
// (releaseDefine); no code reads a function's or class's name, so a
// rename changes nothing (docs/development/itch-release.md).
export const BUNDLE_OPTIONS = Object.freeze({
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  minify: false,
  treeShaking: false,
  sourcemap: false,
  charset: 'utf8',
  legalComments: 'inline',
  logLevel: 'silent',
  write: false,
  define: releaseDefine(),
});

// The stylesheet parts index.html links, in its (cascade) order, and its
// module entry: the release joins exactly what the page loads, so a part
// or module added to the page is in the next release without editing this.
const STYLESHEET = /^[ \t]*<link rel="stylesheet" href="\.\/(css\/[^"]+\.css)">[ \t]*\n/gm;
const MODULE_SCRIPT = /^[ \t]*<script type="module" src="\.\/(js\/[^"]+\.js)"><\/script>[ \t]*\n/gm;

export function pageParts(html = read('index.html')) {
  const stylesheets = [...html.matchAll(STYLESHEET)].map((m) => m[1]);
  const scripts = [...html.matchAll(MODULE_SCRIPT)].map((m) => m[1]);
  if (!stylesheets.length) throw new Error('index.html links no stylesheet part (./css/*.css)');
  if (scripts.length !== 1) throw new Error(`index.html should load one module entry (./js/*.js), found ${scripts.length}`);
  return { stylesheets, entry: scripts[0] };
}

// The stylesheet parts joined in that order, each as written, under a
// comment naming it. Comments and line breaks between rules change nothing
// in the cascade; the parts have no @import, @charset or url() (whose
// paths would resolve from css/), which the validation checks.
export function joinStylesheets(parts) {
  return parts.map((part) => `/* ${part} */\n${read(part).replace(/\n*$/, '\n')}`).join('\n');
}

// index.html for the release: the parts' links become one link to the
// joined stylesheet, the module entry the bundle, preceded by the pack's
// deferred script (deferred scripts and module scripts run in document
// order, so the pack is set before the first module runs, and both are
// fetched in parallel without holding up the page). Nothing else changes.
export function releasePage(html = read('index.html')) {
  const { stylesheets } = pageParts(html);
  let first = true;
  const page = html
    .replace('<!-- Stylesheet parts, in cascade order: later parts may override earlier ones. -->',
      `<!-- The stylesheet parts (css/), joined in cascade order: generated by tools/itch/build.mjs. -->`)
    .replace(STYLESHEET, (line) => {
      if (!first) return '';
      first = false;
      return line.replace(/href="[^"]+"/, `href="./${BUNDLE_CSS}"`);
    })
    .replace(MODULE_SCRIPT, (line) => {
      const indent = line.match(/^[ \t]*/)[0];
      return `${indent}<script defer src="./${ASSET_PACK}"></script>\n${line.replace(/src="[^"]+"/, `src="./${BUNDLE_JS}"`)}`;
    });
  if (stylesheets.length && !page.includes(`href="./${BUNDLE_CSS}"`)) throw new Error('the release page lost its stylesheet');
  return page;
}

// The ES module evaluation order of the graph from `entry`, read from the
// import statements themselves (not from the bundler): each module after
// everything it imports, depth first in source order. Bundled, the modules
// must run in exactly this order.
const IMPORT = /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*['"](\.[^'"]+)['"]|^[ \t]*import\s*['"](\.[^'"]+)['"]/gm;

export function moduleOrder(entry) {
  const order = [];
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const m of read(path).matchAll(IMPORT)) {
      const url = new URL(m[1] ?? m[2], `file:///${path}`);
      visit(url.pathname.slice(1));
    }
    order.push(path);
  };
  visit(entry);
  return order;
}
