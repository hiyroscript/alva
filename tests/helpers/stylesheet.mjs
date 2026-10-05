// The stylesheet as the browser applies it (imported by the *.test.mjs
// files; not a test file itself): every <link rel="stylesheet"> in
// index.html, read in the order the page loads them and joined, so a test
// sees exactly the cascade the game ships.
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);

// The stylesheet paths index.html links, in order (repository-relative).
export function stylesheetFiles() {
  const html = readFileSync(new URL('index.html', ROOT), 'utf8');
  return [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)">/g)].map((m) => m[1]);
}

// Every linked stylesheet's text, in order, as one string.
export function stylesheet() {
  return stylesheetFiles().map((file) => readFileSync(new URL(file, ROOT), 'utf8')).join('\n');
}
