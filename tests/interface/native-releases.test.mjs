// Run with node --test tests/interface/native-releases.test.mjs (no
// dependencies: it builds nothing). The automatic releases
// (docs/development/native-apps.md, Releases): which push releases (a new
// UPDATES.md entry, and only that), which version (the next patch, or the
// one an entry or a person names, never lower, never one released, always
// within the Android versionCode's range), the notes (the entry, its links
// made absolute), the version files a release sets, the files it attaches
// and their checksums, and the workflow's order: nothing published before
// everything is built, the room server deployed last, held without its
// secrets, two releases never at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { entries, newEntries, namedVersion, chooseVersion, compareVersions, releaseNotes, bump, expectedAssets, checkAssets, CHECKSUMS } =
  await import('../../tools/native/release.mjs');

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

const UPDATES = `# Named updates

Intro.

## Movement update

Text with a [link](./docs/systems/movement.md) and an [anchor](#bounce-update).

### Second pass

More.

## Bounce update

Rebounds.
`;

test('a release is a new UPDATES.md entry: added sections only, never an edit, a reworded heading or a subsection', () => {
  assert.deepEqual(entries(UPDATES).map((e) => e.heading), ['Movement update', 'Bounce update']);
  assert.match(entries(UPDATES)[0].text, /^## Movement update\n[\s\S]*### Second pass\n\nMore\.\n$/);
  const added = `${UPDATES}\n## Native apps\n\nThe apps.\n`;
  assert.deepEqual(newEntries(UPDATES, added).map((e) => e.heading), ['Native apps']);
  assert.deepEqual(newEntries(UPDATES, UPDATES.replace('Rebounds.', 'Softer rebounds.')), [], 'an edit');
  assert.deepEqual(newEntries(UPDATES, UPDATES.replace('## Bounce update', '## The bounce update')), [], 'a reworded heading');
  assert.deepEqual(newEntries(UPDATES, `${UPDATES}\n### Later: more\n\nText.\n`), [], 'a subsection of an entry');
  const two = `${added}\n## #0019, the next fighter\n\nNew.\n`;
  assert.deepEqual(newEntries(UPDATES, two).map((e) => e.heading), ['Native apps', '#0019, the next fighter']);
  assert.deepEqual(newEntries(added, UPDATES), [], 'an entry removed');
});

test('the version: the next patch, or the one named (an entry\'s heading vX.Y.Z, or the person\'s), never lower or already released', () => {
  assert.deepEqual(chooseVersion({ current: '1.0.3' }), { version: '1.0.4', bump: true });
  assert.deepEqual(chooseVersion({ current: '1.0.0', tags: [] }), { version: '1.0.1', bump: true });
  assert.deepEqual(chooseVersion({ current: '1.0.3', named: '1.1.0' }), { version: '1.1.0', bump: true });
  assert.deepEqual(chooseVersion({ current: '1.0.3', named: 'v2.0.0' }), { version: '2.0.0', bump: true });
  assert.deepEqual(chooseVersion({ current: '1.0.0', named: '1.0.0', tags: [] }), { version: '1.0.0', bump: false }, 'the current version, not yet released');
  assert.throws(() => chooseVersion({ current: '1.0.0', named: '1.0.0', tags: ['v1.0.0'] }), /already released/);
  assert.throws(() => chooseVersion({ current: '1.0.3', tags: ['v1.0.4'] }), /already released/);
  assert.throws(() => chooseVersion({ current: '1.2.0', named: '1.1.9' }), /lower than the current version/);
  for (const bad of ['1.0', '1.0.100', '1.100.0', 'one', '1.0.0-beta']) assert.throws(() => chooseVersion({ current: '1.0.0', named: bad }), /MAJOR\.MINOR\.PATCH/, bad);
  assert.throws(() => chooseVersion({ current: '1.2.99' }), /name the version, e\.g\. 1\.3\.0/);
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0 && compareVersions('2.0.0', '10.0.0') < 0 && compareVersions('1.0.0', '1.0.0') === 0);
  assert.equal(namedVersion(entries('## The bounce update (v1.1.0)\n\nText.\n')), '1.1.0');
  assert.equal(namedVersion(entries('## Settings version 12\n\nNo release version here.\n')), null);
  assert.throws(() => namedVersion(entries('## A (v1.1.0)\n\n## B (v1.2.0)\n')), /more than one version/);
});

test('the notes: the new entry, its links absolute at the release\'s tag, and where the downloads and the install guide are', () => {
  const notes = releaseNotes(entries(UPDATES).slice(0, 1), { version: '1.0.4', repository: 'hiyroscript/alva' });
  assert.match(notes, /^## Movement update\n/);
  assert.match(notes, /\[link\]\(https:\/\/github\.com\/hiyroscript\/alva\/blob\/v1\.0\.4\/docs\/systems\/movement\.md\)/);
  assert.match(notes, /\[anchor\]\(https:\/\/github\.com\/hiyroscript\/alva\/blob\/v1\.0\.4\/UPDATES\.md#bounce-update\)/);
  assert.match(notes, /native-apps\.md#how-to-install/);
  assert.match(notes, /Online play works only between players on this version\./);
  assert.doesNotMatch(notes, /\]\(\.\//);
});

test('a release sets package.json, its lockfile and the room server\'s CURRENT_VERSION to its version, and nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'alva-release-'));
  try {
    mkdirSync(join(dir, 'server'));
    for (const file of ['package.json', 'package-lock.json', 'server/wrangler.toml']) writeFileSync(join(dir, file), read(file));
    bump('1.2.3', `${dir}/`);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    assert.equal(pkg.version, '1.2.3');
    assert.equal(lock.version, '1.2.3');
    assert.equal(lock.packages[''].version, '1.2.3');
    const toml = readFileSync(join(dir, 'server/wrangler.toml'), 'utf8');
    assert.match(toml, /^CURRENT_VERSION = "1\.2\.3"$/m);
    // Nothing else moved: the same files with only the version in them told apart.
    const current = JSON.parse(read('package.json')).version;
    assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), read('package.json').replace(`"version": "${current}"`, '"version": "1.2.3"'));
    assert.equal(toml, read('server/wrangler.toml').replace(`CURRENT_VERSION = "${current}"`, 'CURRENT_VERSION = "1.2.3"'));
    assert.equal(lock.packages['node_modules/esbuild'].version, JSON.parse(read('package-lock.json')).packages['node_modules/esbuild'].version);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the files a release attaches: every installer under its name, the itch.io ZIP, none missing, extra or empty, and their SHA-256', async () => {
  assert.deepEqual(expectedAssets('1.2.3'), [
    'Alva-1.2.3-windows-x64-setup.exe', 'Alva-1.2.3-windows-x64.msi', 'Alva-1.2.3-macos-universal.dmg',
    'Alva-1.2.3-linux-x86_64.AppImage', 'Alva-1.2.3-linux-amd64.deb', 'Alva-1.2.3-android.apk', 'Alva-1.2.3-android.aab', 'alva-itch.zip',
  ]);
  assert.ok(expectedAssets('1.2.3', { test: true }).includes('Alva-1.2.3-android-debug.apk'), 'a test release is unsigned');
  const dir = mkdtempSync(join(tmpdir(), 'alva-assets-'));
  try {
    for (const f of expectedAssets('1.2.3')) writeFileSync(join(dir, f), `bytes of ${f}`);
    assert.deepEqual(await checkAssets(dir, '1.2.3'), []);
    const sums = readFileSync(join(dir, CHECKSUMS), 'utf8').trim().split('\n');
    assert.equal(sums.length, 8);
    const apk = 'Alva-1.2.3-android.apk';
    assert.ok(sums.includes(`${createHash('sha256').update(`bytes of ${apk}`).digest('hex')}  ${apk}`), 'sha256sum -c reads it');
    // A debug APK never stands in for the signed one; an empty file never passes.
    rmSync(join(dir, apk));
    writeFileSync(join(dir, 'Alva-1.2.3-android-debug.apk'), 'debug');
    writeFileSync(join(dir, 'alva-itch.zip'), '');
    assert.deepEqual((await checkAssets(dir, '1.2.3')).sort(), [
      `missing: ${apk}`, 'empty: alva-itch.zip', 'not part of the release: Alva-1.2.3-android-debug.apk',
    ].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the release workflow: a new entry or a person starts it, one at a time, built before anything is published, the server deployed last', () => {
  const yml = read('.github/workflows/release.yml');
  assert.match(yml, /on:\n  push:\n    branches: \[main\]\n    paths: \[UPDATES\.md\]\n  workflow_dispatch:\n    inputs:\n      version:/);
  assert.match(yml, /concurrency:\n  group: release\n  cancel-in-progress: false/);
  // A test release for a pull request that changes the release; a real one
  // only on main.
  assert.match(yml, /  pull_request:\n    paths: \[\.github\/workflows\/release\.yml, tools\/native\/release\.mjs\]/);
  assert.match(yml, /if \[ "\$\{\{ github\.ref \}\}" = "refs\/heads\/main" \] && \[ "\$\{\{ inputs\.test \}\}" != "true" \]; then test=false; else test=true; fi/);
  // Held without any of the six secrets, before anything is built.
  for (const name of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    assert.match(yml, new RegExp(`for name in [^\\n]*\\b${name}\\b`), name);
  }
  assert.match(yml, /Release held: the repository's secrets are missing/);
  // The order: plan → build (every app, from the release commit, signed) →
  // publish (draft, main, then published as the latest) → itch.io → server.
  // A job's lines, from its name to the next job's.
  const job = (name) => yml.split(`\n  ${name}:\n`)[1].split(/\n  [a-z]+:\n/)[0];
  assert.match(job('apps'), /needs: plan\n[\s\S]*uses: \.\/\.github\/workflows\/native-apps\.yml\n[\s\S]*ref: \$\{\{ needs\.plan\.outputs\.sha \}\}\n\s*release: \$\{\{ needs\.plan\.outputs\.test != 'true' \}\}/);
  const publish = job('publish');
  assert.match(publish, /needs: \[plan, apps\]/);
  const draft = publish.indexOf('--draft');
  const main = publish.indexOf('git push origin main');
  const published = publish.indexOf('--draft=false --latest');
  assert.ok(draft > 0 && main > draft && published > main, 'a draft first, main next, published last');
  assert.match(publish, /releases\/latest/, 'checked to be the latest');
  assert.match(job('itch'), /needs: \[plan, publish\]/);
  for (const channel of ['windows', 'mac', 'linux', 'android', 'html']) assert.match(job('itch'), new RegExp(`"\\$ITCH_PROJECT:\\$2"[\\s\\S]*\\b${channel}\\n`), channel);
  const deploy = job('deploy');
  assert.match(deploy, /needs: \[plan, publish, itch\]/);
  assert.match(deploy, /needs\.publish\.result == 'success'/);
  assert.match(deploy, /npx wrangler deploy\n/);
  assert.match(deploy, /currentVersion/, 'the server checked to play the new version');
  assert.match(job('cleanup'), /needs\.publish\.outputs\.pushed != 'true'/, 'never undoes a release once main has it');
  // The builds: the same workflow pull requests run, the Android app signed
  // or nothing.
  const apps = read('.github/workflows/native-apps.yml');
  assert.match(apps, /workflow_call:\n    inputs:\n      ref:[\s\S]*release:/);
  assert.match(apps, /A release needs the release key/);
  assert.match(apps, /collect\.mjs android \$\{\{ inputs\.release && '--release' \|\| '' \}\}/);
});

test('a change to the room server on main deploys it, at the released version only, never during a release, never without its key', () => {
  const yml = read('.github/workflows/room-server.yml');
  assert.match(yml, /on:\n  push:\n    branches: \[main\]\n    paths: \['server\/\*\*'\]/);
  assert.match(yml, /concurrency:\n  group: release\n  cancel-in-progress: false/, 'the release\'s queue');
  assert.match(yml, /is not a released version/);
  assert.match(yml, /npm ci && npm test/, 'the server\'s tests first');
  assert.match(yml, /Not deployed: the secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not set/);
  const deploy = yml.indexOf('npx wrangler deploy');
  assert.ok(deploy > yml.indexOf('Only the released version') && deploy > yml.indexOf('npm test'));
});
