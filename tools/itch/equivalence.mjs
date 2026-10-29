// The itch.io release's equivalence check: `npm run verify:itch`
// (`-- --quick` for a short smoke run).
//
// Bundling must change nothing a match does. This bundles the simulation
// probe (sim-probe.mjs: seeded Watch Mode matches for every fighter, stage
// and CPU level, mirror matches, Quick Battles and Local Play with scripted
// players, Practice Ground with its swaps) with the release's own esbuild
// options, runs it beside the same probe on the modules in js/ as they are,
// each in a process of its own, and compares them: every step's fighters,
// projectiles, events, score and clock, and every second the whole world
// (fighters, controllers and CPU minds, combat, stage, hazards). A
// difference names the scenario and the second it appeared.

import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { ROOT, DIST, BUNDLE_OPTIONS } from './release.mjs';

const quick = process.argv.includes('--quick');
const PROBE = 'tools/itch/sim-probe.mjs';
// Inside dist/ (ignored by Git, never part of the release), so the bundle
// resolves Node's own modules from the repository like the probe does.
const BUNDLED = `${DIST}/sim-probe.bundle.mjs`;

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...(quick ? ['--quick'] : [])], { cwd: ROOT });
    const out = [];
    const err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('close', (code) => {
      if (code) reject(new Error(`${file} exited with ${code}\n${Buffer.concat(err)}`));
      else resolve(JSON.parse(Buffer.concat(out).toString('utf8')));
    });
  });
}

const started = Date.now();
const result = await build({
  ...BUNDLE_OPTIONS,
  // The probe runs in Node (node:crypto, the tests' fake sprites); the game's
  // modules inside it are transformed exactly as for the browser.
  platform: 'node',
  absWorkingDir: ROOT,
  entryPoints: [PROBE],
});
mkdirSync(`${ROOT}${DIST}`, { recursive: true });
writeFileSync(`${ROOT}${BUNDLED}`, result.outputFiles[0].contents);

let source;
let bundled;
try {
  [source, bundled] = await Promise.all([run(PROBE), run(BUNDLED)]);
} finally {
  rmSync(`${ROOT}${BUNDLED}`, { force: true });
}

let differences = 0;
let steps = 0;
let checkpoints = 0;
for (const [i, a] of source.entries()) {
  const b = bundled[i];
  steps += a.steps;
  checkpoints += a.checkpoints.length;
  const at = a.checkpoints.findIndex((c, k) => c !== b?.checkpoints[k]);
  const same = b && a.name === b.name && a.steps === b.steps && at < 0 &&
    a.checkpoints.length === b.checkpoints.length && JSON.stringify(a.result) === JSON.stringify(b.result);
  if (!same) differences++;
  const r = a.result;
  const outcome = r ? `  [${r.score}, ${r.outcome}${r.reason ? ` (${r.reason})` : ''}${r.overtime ? ', overtime' : ''}]` : '';
  console.log(`${same ? 'same' : 'DIFFERENT'}  ${a.name}: ${a.steps} steps${outcome}` +
    (same ? '' : at >= 0 ? ` — first difference in second ${at + 1}` : ' — the runs end differently'));
}
console.log(`\n${source.length} scenarios, ${steps} fixed steps, ${checkpoints} whole-world checkpoints, ` +
  `${((Date.now() - started) / 1000).toFixed(1)} s`);
console.log(differences
  ? `FAILED: the bundle differs from the source in ${differences} scenario(s).`
  : 'The bundle plays every scenario exactly as the source does.');
process.exitCode = differences ? 1 : 0;
