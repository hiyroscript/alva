// Makes every icon the native apps need from the game's own
// (assets/icons/), with each platform's official tool: `npm run app:icons`.
// Run it again only when the game's icons change; what it writes is
// committed (src-tauri/icons/, android/app/src/main/res/).
//
//   - The desktop apps (src-tauri/icons/): `tauri icon` from alva-512.png,
//     the rounded icon: Windows' .ico, macOS's .icns, Linux's PNGs. It also
//     makes Android and iOS icons for Tauri's own mobile apps, which Alva
//     does not use (Android is Capacitor's, iPhone is out of scope): they
//     are removed.
//   - The Android app (android/app/src/main/res/): Capacitor's
//     `capacitor-assets`, twice. First from the maskable icon alone, as a
//     logo on Alva's own dark (#050506): the launch screens, light and
//     dark. Then the launcher icons: alva-512.png for the legacy ones, and
//     the adaptive icon (Android 8 and later, which crops it to the
//     phone's own shape) from the maskable icon over that same dark, its
//     artwork already inside the safe zone a mask may keep.
//
// Nothing of the game changes; the tools only read assets/icons/.

import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { ROOT, DIST } from '../itch/release.mjs';
import { crc32 } from '../itch/zip.mjs';

const ICON = `${ROOT}assets/icons/alva-512.png`;
const MASKABLE = `${ROOT}assets/icons/alva-maskable-512.png`;
// Alva's background (manifest.webmanifest's background_color), the
// maskable icon's own.
const DARK = '#050506';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

// A PNG of `size` × `size` pixels, all `hex` (#rrggbb).
function solidPng(size, hex) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A folder of `files` (name -> source path or Buffer) for capacitor-assets,
// which reads them from inside the project: under dist/ (ignored by Git),
// its path relative to the repository.
function sources(name, files) {
  const dir = `${DIST}/icon-sources/${name}`;
  rmSync(`${ROOT}${dir}`, { recursive: true, force: true });
  mkdirSync(`${ROOT}${dir}`, { recursive: true });
  for (const [file, from] of Object.entries(files)) {
    if (Buffer.isBuffer(from)) writeFileSync(`${ROOT}${dir}/${file}`, from);
    else copyFileSync(from, `${ROOT}${dir}/${file}`);
  }
  return dir;
}

// The desktop apps.
run('npx', ['tauri', 'icon', ICON, '-o', 'src-tauri/icons']);
for (const unused of ['android', 'ios']) rmSync(`${ROOT}src-tauri/icons/${unused}`, { recursive: true, force: true });

// The Android app: the launch screens, then the launcher icons.
const splash = sources('splash', { 'logo.png': MASKABLE });
const icons = sources('icons', { 'icon-only.png': ICON, 'icon-foreground.png': MASKABLE, 'icon-background.png': solidPng(512, DARK) });
try {
  run('npx', ['capacitor-assets', 'generate', '--android', '--assetPath', splash,
    '--iconBackgroundColor', DARK, '--iconBackgroundColorDark', DARK, '--splashBackgroundColor', DARK, '--splashBackgroundColorDark', DARK]);
  run('npx', ['capacitor-assets', 'generate', '--android', '--assetPath', icons]);
} finally {
  rmSync(`${ROOT}${DIST}/icon-sources`, { recursive: true, force: true });
}
