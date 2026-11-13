// Gathers the installers a native build made into dist/installers/, each
// under a name that says what it is (docs/development/native-apps.md):
//
//   node tools/native/collect.mjs windows   Alva-1.0.0-windows-x64-setup.exe, Alva-1.0.0-windows-x64.msi
//   node tools/native/collect.mjs macos     Alva-1.0.0-macos-universal.dmg
//   node tools/native/collect.mjs linux     Alva-1.0.0-linux-x86_64.AppImage, Alva-1.0.0-linux-amd64.deb
//   node tools/native/collect.mjs android   Alva-1.0.0-android.apk and .aab (signed with the release
//                                           key), or Alva-1.0.0-android-debug.apk (installable, Android's
//                                           debug key) and Alva-1.0.0-android-unsigned.aab without it
//   node tools/native/collect.mjs android --release
//                                           the signed ones, or nothing: a release is never unsigned
//
// The version is package.json's. Each file found is printed with its size;
// one missing fails (exit code 1), so a build that made less than it should
// never passes for a complete one. The workflows upload what it gathers.

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { ROOT, DIST, releaseVersion } from '../itch/release.mjs';

export const INSTALLERS_DIR = `${DIST}/installers`;

const version = releaseVersion();
const platform = process.argv[2];
const release = process.argv.includes('--release');
const TAURI = 'src-tauri/target';
const GRADLE = 'android/app/build/outputs';

// Every file under `dir` (relative to the repository) whose path matches
// `pattern`.
function find(dir, pattern) {
  if (!existsSync(`${ROOT}${dir}`)) return [];
  return readdirSync(`${ROOT}${dir}`, { withFileTypes: true }).flatMap((e) => {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) return find(path, pattern);
    return pattern.test(path) ? [path] : [];
  });
}

// What each platform's build makes, and the name each gets:
// [where, which file, its name].
const WANTED = {
  windows: [
    [TAURI, /\/bundle\/nsis\/[^/]+-setup\.exe$/, `Alva-${version}-windows-x64-setup.exe`],
    [TAURI, /\/bundle\/msi\/[^/]+\.msi$/, `Alva-${version}-windows-x64.msi`],
  ],
  macos: [
    [TAURI, /\/universal-apple-darwin\/release\/bundle\/dmg\/[^/]+\.dmg$/, `Alva-${version}-macos-universal.dmg`],
  ],
  linux: [
    [TAURI, /\/bundle\/appimage\/[^/]+\.AppImage$/, `Alva-${version}-linux-x86_64.AppImage`],
    [TAURI, /\/bundle\/deb\/[^/]+\.deb$/, `Alva-${version}-linux-amd64.deb`],
  ],
  android: release || existsSync(`${ROOT}${GRADLE}/apk/release/app-release.apk`)
    ? [
      [GRADLE, /\/apk\/release\/app-release\.apk$/, `Alva-${version}-android.apk`],
      [GRADLE, /\/bundle\/release\/app-release\.aab$/, `Alva-${version}-android.aab`],
    ]
    : [
      [GRADLE, /\/apk\/debug\/app-debug\.apk$/, `Alva-${version}-android-debug.apk`],
      [GRADLE, /\/bundle\/release\/app-release\.aab$/, `Alva-${version}-android-unsigned.aab`],
    ],
};

if (!WANTED[platform]) {
  console.error(`Which platform? One of ${Object.keys(WANTED).join(', ')}.`);
  process.exit(1);
}

rmSync(`${ROOT}${INSTALLERS_DIR}`, { recursive: true, force: true });
mkdirSync(`${ROOT}${INSTALLERS_DIR}`, { recursive: true });
let missing = 0;
for (const [dir, pattern, name] of WANTED[platform]) {
  const [found, ...more] = find(dir, pattern);
  if (!found || more.length) {
    console.error(found ? `More than one file for ${name}: ${[found, ...more].join(', ')}` : `Missing: ${name} (no ${pattern} under ${dir}/)`);
    missing += 1;
    continue;
  }
  copyFileSync(`${ROOT}${found}`, `${ROOT}${INSTALLERS_DIR}/${name}`);
  console.log(`${name}  ${(statSync(`${ROOT}${found}`).size / 1024 / 1024).toFixed(1)} MB  (from ${found})`);
}
process.exitCode = missing ? 1 : 0;
