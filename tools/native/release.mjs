// What the release workflow (.github/workflows/release.yml) decides and
// checks, kept here so the tests can hold it (docs/development/native-apps.md,
// Releases):
//
//   node tools/native/release.mjs plan     whether this push releases, which version, the notes
//   node tools/native/release.mjs bump X   package.json, its lockfile and the room server's
//                                          CURRENT_VERSION set to X
//   node tools/native/release.mjs assets DIR X [--test]
//                                          every installer of X in DIR, named as it should be,
//                                          and SHA256SUMS.txt written beside them
//
// A release is a new entry in UPDATES.md: a push to main that adds a `## `
// section releases, one that does not never does. Its version is the patch
// after package.json's (1.0.3 → 1.0.4), unless the entry's heading names one
// (`## The bounce update (v1.1.0)`) or the person running it by hand does;
// a version is never lower than the current one, never one already
// released, and always MAJOR.MINOR.PATCH with MINOR and PATCH under 100 (the
// Android versionCode, tools/itch/release.mjs). The current version itself
// may be released only while it has no release yet. The notes are the new
// entry, its links made absolute (a release page is not the repository).

import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT, DIST, VERSION_PATTERN, releaseVersion } from '../itch/release.mjs';

export const NOTES_PATH = `${DIST}/release-notes.md`;
export const CHECKSUMS = 'SHA256SUMS.txt';
const NAMED = /\bv(\d+\.\d+\.\d+)\b/;

// The `## ` sections of UPDATES.md, in order: { heading, text } (text from
// the heading to the next one, the heading included).
export function entries(markdown) {
  const lines = String(markdown ?? '').split('\n');
  const out = [];
  for (const line of lines) {
    if (/^## /.test(line)) out.push({ heading: line.slice(3).trim(), lines: [line] });
    else out.at(-1)?.lines.push(line);
  }
  return out.map(({ heading, lines: body }) => ({ heading, text: body.join('\n').replace(/\n+$/, '\n') }));
}

// The entries `after` adds to `before`: as many as the count grew by, the
// last of those whose heading is new (a heading only reworded adds none).
export function newEntries(before, after) {
  const was = entries(before);
  const now = entries(after);
  const grew = now.length - was.length;
  if (grew <= 0) return [];
  const known = new Set(was.map((e) => e.heading));
  return now.filter((e) => !known.has(e.heading)).slice(-grew);
}

// A version a list of entries names in a heading (vX.Y.Z), or null.
export function namedVersion(list) {
  const named = [...new Set(list.map((e) => e.heading.match(NAMED)?.[1]).filter(Boolean))];
  if (named.length > 1) throw new Error(`The new entries name more than one version: ${named.join(', ')}`);
  return named[0] ?? null;
}

const parts = (v) => v.split('.').map(Number);
export function compareVersions(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// The release's version: `named` (an entry's heading or the person's), or
// the patch after `current`. `tags` are the releases already made (vX.Y.Z).
// Throws, saying why, for a version that cannot be released.
export function chooseVersion({ current, named = null, tags = [] }) {
  const released = new Set(tags.map((t) => String(t).replace(/^v/, '')));
  let version = named ? String(named).trim().replace(/^v/, '') : null;
  if (!version) {
    const [major, minor, patch] = parts(current);
    if (patch + 1 > 99) throw new Error(`${current} has no next patch (PATCH stays under 100): name the version, e.g. ${major}.${minor + 1}.0`);
    version = `${major}.${minor}.${patch + 1}`;
  }
  if (!VERSION_PATTERN.test(version)) throw new Error(`${version} is not MAJOR.MINOR.PATCH with MINOR and PATCH under 100`);
  if (released.has(version)) throw new Error(`v${version} is already released`);
  const order = compareVersions(version, current);
  if (order < 0) throw new Error(`${version} is lower than the current version, ${current}`);
  return { version, bump: order > 0 };
}

// The release's notes: the entries, with their links to the repository
// (./path, #anchor) made absolute at the release's tag.
export function releaseNotes(list, { version, repository }) {
  const base = `https://github.com/${repository}/blob/v${version}`;
  const body = list.map((e) => e.text.trim()).join('\n\n')
    .replace(/\]\(\.\/([^)\s]+)\)/g, `](${base}/$1)`)
    .replace(/\]\(#([^)\s]+)\)/g, `](${base}/UPDATES.md#$1)`);
  return `${body}\n\n---\n\n**Downloads:** pick the file for your device below (how to install each: ` +
    `[the install guide](${base}/docs/development/native-apps.md#how-to-install)). ` +
    `Online play works only between players on this version.\n`;
}

// package.json, its lockfile and the room server's CURRENT_VERSION set to
// `version` (each file otherwise as it was).
export function bump(version, root = ROOT) {
  const pkgPath = `${root}package.json`;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const lockPath = `${root}package-lock.json`;
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
  const tomlPath = `${root}server/wrangler.toml`;
  const toml = readFileSync(tomlPath, 'utf8');
  if (!/^CURRENT_VERSION = "[^"]*"$/m.test(toml)) throw new Error('server/wrangler.toml has no CURRENT_VERSION line');
  writeFileSync(tomlPath, toml.replace(/^CURRENT_VERSION = "[^"]*"$/m, `CURRENT_VERSION = "${version}"`));
}

// The files a release of `version` attaches, besides SHA256SUMS.txt: the
// installers tools/native/collect.mjs names, and the itch.io ZIP. A test
// release (no release key needed) has the Android app's debug build and
// unsigned bundle in place of the signed ones.
export function expectedAssets(version, { test = false } = {}) {
  return [
    `Alva-${version}-windows-x64-setup.exe`,
    `Alva-${version}-windows-x64.msi`,
    `Alva-${version}-macos-universal.dmg`,
    `Alva-${version}-linux-x86_64.AppImage`,
    `Alva-${version}-linux-amd64.deb`,
    ...(test ? [`Alva-${version}-android-debug.apk`, `Alva-${version}-android-unsigned.aab`]
      : [`Alva-${version}-android.apk`, `Alva-${version}-android.aab`]),
    'alva-itch.zip',
  ];
}

const sha256 = (path) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(path).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});

// Checks `dir` holds exactly the release's files, none empty, and writes
// SHA256SUMS.txt (`sha256sum -c` reads it). Returns the problems.
export async function checkAssets(dir, version, { test = false } = {}) {
  const wanted = expectedAssets(version, { test });
  const present = readdirSync(dir).filter((f) => f !== CHECKSUMS).sort();
  const problems = [
    ...wanted.filter((f) => !present.includes(f)).map((f) => `missing: ${f}`),
    ...present.filter((f) => !wanted.includes(f)).map((f) => `not part of the release: ${f}`),
  ];
  for (const f of wanted.filter((w) => present.includes(w))) {
    if (readFileSync(`${dir}/${f}`).length === 0) problems.push(`empty: ${f}`);
  }
  if (!problems.length) {
    const lines = [];
    for (const f of wanted) lines.push(`${await sha256(`${dir}/${f}`)}  ${f}`);
    writeFileSync(`${dir}/${CHECKSUMS}`, `${lines.join('\n')}\n`);
  }
  return problems;
}

// ---- The command line (the workflow's) --------------------------------------------

function output(values) {
  for (const [k, v] of Object.entries(values)) {
    console.log(`${k}=${v}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
  }
}

// plan, from the environment: EVENT (push or workflow_dispatch),
// BEFORE_FILE (UPDATES.md as it was before the push), INPUT_VERSION (the
// person's), TAGS (the releases made, one a line), REPOSITORY.
function plan() {
  const env = process.env;
  const after = readFileSync(`${ROOT}UPDATES.md`, 'utf8');
  const list = env.EVENT === 'push'
    ? newEntries(env.BEFORE_FILE && existsSync(env.BEFORE_FILE) ? readFileSync(env.BEFORE_FILE, 'utf8') : after, after)
    : entries(after).slice(-1);
  if (!list.length) {
    console.log('No new entry in UPDATES.md: nothing to release.');
    output({ release: 'false' });
    return;
  }
  const current = releaseVersion();
  const named = (env.INPUT_VERSION ?? '').trim() || namedVersion(list);
  const tags = (env.TAGS ?? '').split('\n').map((t) => t.trim()).filter(Boolean);
  const { version, bump: needsBump } = chooseVersion({ current, named, tags });
  mkdirSync(`${ROOT}${DIST}`, { recursive: true });
  writeFileSync(`${ROOT}${NOTES_PATH}`, releaseNotes(list, { version, repository: env.REPOSITORY || 'hiyroscript/alva' }));
  console.log(`Releasing ${version} (from ${current}) for: ${list.map((e) => e.heading).join('; ')}`);
  output({ release: 'true', version, bump: String(needsBump), title: `Alva ${version}` });
}

async function main([command, ...args]) {
  switch (command) {
    case 'plan':
      return plan();
    case 'bump':
      bump(args[0]);
      console.log(`package.json, package-lock.json and server/wrangler.toml at ${args[0]}`);
      return undefined;
    case 'assets': {
      const [dir, version] = args;
      const problems = await checkAssets(dir, version, { test: args.includes('--test') });
      for (const p of problems) console.error(p);
      if (problems.length) process.exitCode = 1;
      else console.log(readFileSync(`${dir}/${CHECKSUMS}`, 'utf8'));
      return undefined;
    }
    default:
      throw new Error('Use: plan | bump <version> | assets <dir> <version> [--test]');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
