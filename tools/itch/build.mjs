// Builds the itch.io release: `npm run build:itch` (after `npm install`).
//
// 1. Empties dist/itch.
// 2. Bundles the page's module entry (js/main.js) and everything it imports
//    into game.js (release.mjs: BUNDLE_OPTIONS, nothing rewritten).
// 3. Joins the page's stylesheet parts, in their cascade order, into game.css.
// 4. Copies index.html with those two in place of the parts and modules,
//    and the pack's script before the bundle.
// 5. Packs every fighter's frames (assets/characters/) into game-assets.js,
//    each file's exact bytes under its own path (release.mjs: writePack),
//    and copies the manifest, the root images and the rest of assets/
//    unchanged.
// 6. Validates the folder (validate.mjs) and, if it is valid, writes
//    dist/alva-itch.zip with index.html at its root, then validates the
//    archive against the folder.
// 7. Prints the report. A problem fails the build (exit code 1) and leaves
//    no archive behind.
//
// Deterministic: the same repository makes the same files (and, with the
// same zlib, the same archive). The source is never written to.

import { mkdirSync, rmSync, writeFileSync, copyFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { build } from 'esbuild';
import {
  ROOT, OUT_DIR, ZIP_PATH, BUNDLE_JS, BUNDLE_CSS, ASSET_PACK, COPIED_FILES, COPIED_DIRS, PACKED_DIRS, LIMITS, BUNDLE_OPTIONS,
  read, pageParts, joinStylesheets, releasePage, isPacked, writePack, isDevelopmentOnly,
} from './release.mjs';
import { listFiles, validateRelease } from './validate.mjs';
import { writeZip } from './zip.mjs';

const BANNER = '// Alva, bundled for release by tools/itch/build.mjs from the modules in js/.\n' +
  '// Generated: never edit it; change the modules and rebuild (npm run build:itch).';

const out = (path) => `${ROOT}${OUT_DIR}/${path}`;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

function write(path, data) {
  mkdirSync(dirname(out(path)), { recursive: true });
  writeFileSync(out(path), data);
}

async function main() {
  const started = Date.now();
  const html = read('index.html');
  const { stylesheets, entry } = pageParts(html);

  // Nothing development-only is ever copied (the room server in server/
  // included): the release is only what the page loads.
  for (const f of [...COPIED_FILES, ...COPIED_DIRS]) {
    if (isDevelopmentOnly(f)) throw new Error(`${f} is development-only and is never copied into the release`);
  }

  rmSync(`${ROOT}${OUT_DIR}`, { recursive: true, force: true });
  rmSync(`${ROOT}${ZIP_PATH}`, { force: true });
  mkdirSync(`${ROOT}${OUT_DIR}`, { recursive: true });

  const result = await build({
    ...BUNDLE_OPTIONS,
    absWorkingDir: ROOT,
    entryPoints: [entry],
    outfile: `${OUT_DIR}/${BUNDLE_JS}`,
    banner: { js: BANNER },
  });
  for (const w of result.warnings) console.warn(`esbuild: ${w.text}`);
  write(BUNDLE_JS, result.outputFiles[0].contents);
  write(BUNDLE_CSS, joinStylesheets(stylesheets));
  write('index.html', releasePage(html));
  for (const f of COPIED_FILES) write(f, readFileSync(`${ROOT}${f}`));
  const packed = [];
  for (const d of COPIED_DIRS) {
    for (const f of listFiles(`${ROOT}${d}`)) {
      const path = `${d}/${f}`;
      if (isPacked(path)) {
        packed.push({ path, data: readFileSync(`${ROOT}${path}`) });
        continue;
      }
      mkdirSync(dirname(out(path)), { recursive: true });
      copyFileSync(`${ROOT}${path}`, out(path));
    }
  }
  write(ASSET_PACK, writePack(packed));

  // The folder first: an invalid release makes no archive.
  let report = await validateRelease({ checkZip: false });
  if (!report.problems.length) {
    const files = listFiles(`${ROOT}${OUT_DIR}`);
    writeFileSync(`${ROOT}${ZIP_PATH}`, writeZip(files.map((name) => ({ name, data: readFileSync(out(name)) }))));
    report = await validateRelease();
    if (report.problems.length && existsSync(`${ROOT}${ZIP_PATH}`)) rmSync(`${ROOT}${ZIP_PATH}`);
  }

  const { problems, warnings, stats } = report;
  const source = sourceCounts(stylesheets, stats?.modules ?? 0);
  console.log('\nAlva: itch.io release');
  console.log('─'.repeat(60));
  console.log(`page            ${OUT_DIR}/index.html (from index.html)`);
  console.log(`modules         ${stats?.modules} → ${OUT_DIR}/${BUNDLE_JS} (${kb(readFileSync(out(BUNDLE_JS)).length)})`);
  console.log(`stylesheets     ${stylesheets.length} → ${OUT_DIR}/${BUNDLE_CSS} (${kb(readFileSync(out(BUNDLE_CSS)).length)})`);
  console.log(`copied          ${COPIED_FILES.join(', ')}, ${COPIED_DIRS.map((d) => `${d}/`).join(', ')} but what is packed (unchanged)`);
  console.log(`packed          ${packed.length} files of ${PACKED_DIRS.map((d) => `${d}/`).join(', ')} → ${OUT_DIR}/${ASSET_PACK} (${kb(readFileSync(out(ASSET_PACK)).length)}), byte for byte`);
  console.log(`fighter frames  ${stats?.frames} referenced, every one present`);
  if (stats) {
    console.log('\nfiles by folder');
    for (const [folder, n] of Object.entries(stats.byFolder)) console.log(`  ${String(n).padStart(4)}  ${folder}`);
    console.log(`\nfiles           ${stats.files} (the page as served from the repository: ${source}; limit ${LIMITS.files})`);
    console.log(`size            ${mb(stats.totalBytes)} extracted (limit ${mb(LIMITS.totalBytes)})`);
    console.log(`largest file    ${stats.largest}, ${mb(readFileSync(out(stats.largest)).length)} (limit ${mb(LIMITS.fileBytes)} each)`);
    console.log(`longest path    ${stats.longestPath.length} characters (limit ${LIMITS.pathLength})`);
    if (stats.zipBytes) console.log(`archive         ${ZIP_PATH} (${mb(stats.zipBytes)}), index.html at its root`);
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const p of problems) console.error(`problem: ${p}`);
  console.log('─'.repeat(60));
  console.log(problems.length
    ? `FAILED: ${problems.length} problem(s); no archive was written.`
    : `OK in ${((Date.now() - started) / 1000).toFixed(1)} s. Upload ${ZIP_PATH} to itch.io as an HTML game.`);
  process.exitCode = problems.length ? 1 : 0;
}

// What the same page loads from the repository: the page, its parts, its
// modules and the same copied files and assets.
function sourceCounts(stylesheets, modules) {
  const assets = COPIED_DIRS.reduce((n, d) => n + listFiles(`${ROOT}${d}`).length, 0);
  return `${1 + stylesheets.length + modules + COPIED_FILES.length + assets} files`;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
