// Run with node --test tests/interface/stylesheets.test.mjs (no dependencies).
// The stylesheet's parts (css/*.css): index.html links every one, once, by a
// relative path (so the site works under any GitHub Pages sub-path), in
// cascade order with the base first and the responsive overrides last, and
// links nothing else. Layout and paint still need real-browser checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { stylesheetFiles } from '../helpers/stylesheet.mjs';

const ROOT = new URL('../../', import.meta.url);

test('index.html links every stylesheet part once, relatively, base first and responsive last', () => {
  const linked = stylesheetFiles();
  const parts = readdirSync(new URL('css/', ROOT)).filter((f) => f.endsWith('.css')).map((f) => `css/${f}`);
  assert.deepEqual([...linked].sort(), [...parts].sort(), 'every part, and only the parts');
  assert.equal(new Set(linked).size, linked.length, 'each once');
  assert.equal(linked[0], 'css/base.css', 'tokens and reset first');
  assert.equal(linked.at(-1), 'css/responsive.css', 'responsive overrides last');
  for (const file of linked) assert.ok(existsSync(new URL(file, ROOT)), file);
  const html = readFileSync(new URL('index.html', ROOT), 'utf8');
  assert.doesNotMatch(html, /href="\/|styles\.css/, 'relative paths only, and no single stylesheet left behind');
  assert.equal(existsSync(new URL('styles.css', ROOT)), false);
});

test('the design tokens are defined once, in the first part, before anything uses them', () => {
  const base = readFileSync(new URL('css/base.css', ROOT), 'utf8');
  assert.match(base, /:root \{/);
  for (const file of stylesheetFiles().slice(1)) {
    assert.doesNotMatch(readFileSync(new URL(file, ROOT), 'utf8'), /:root \{/, `${file} defines no tokens`);
  }
});
