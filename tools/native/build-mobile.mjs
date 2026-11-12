// Prepare Capacitor's local web bundle from the same validated game export.
// The native shell loads all game code and assets locally; only Alva's
// optional online multiplayer needs a network connection.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(npm, ['run', 'build:itch']);
const source = resolve(root, 'dist/itch');
const target = resolve(root, 'dist/mobile');
if (!existsSync(resolve(source, 'index.html'))) throw new Error('The validated game export is missing.');
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log('\nAlva mobile web bundle copied to dist/mobile.');
