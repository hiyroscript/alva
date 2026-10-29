# The itch.io release

The repository is the site: `index.html`, its stylesheet parts in `css/`
and its modules in `js/` run as they are, with no build, on GitHub Pages or
any static server ([running and deploying](setup.md)). Served that way the
game is 1,059 files, and itch.io accepts at most 1,000 in an HTML5 game's
ZIP. The **release** is an optional, generated copy of the same game in
901 files: the 145 modules bundled into one `game.js`, the 15 stylesheet
parts joined into one `game.css`, and everything else copied unchanged. It
is never edited by hand and never the source of truth: change the
repository, then rebuild.

```sh
npm install              # once: esbuild, the export's one development dependency
npm run build:itch       # dist/itch/ and dist/alva-itch.zip, validated, with a report
npm run verify:itch      # the bundle against the source, match by match, step by step
node tools/itch/validate.mjs   # validate an existing dist/ again
```

Node 22 or later, as for the tests. `dist/` and `node_modules/` are
ignored by Git; the game itself still installs nothing.

## What the build does

[`tools/itch/build.mjs`](../../tools/itch/build.mjs), with what it shares
with the checks in [`tools/itch/release.mjs`](../../tools/itch/release.mjs):

1. Empties `dist/itch/`.
2. Reads `index.html`: its stylesheet links in order and its module entry
   (`./js/main.js`). The release joins exactly what the page loads, so a
   part or module added to the page is in the next release without
   touching the tools.
3. Bundles the entry and everything it imports into `game.js` with esbuild
   (below).
4. Joins the stylesheet parts in the page's cascade order into `game.css`,
   each part as written under a comment naming it.
5. Writes `index.html` with one `<link>` to `./game.css` in place of the
   parts and `./game.js` in place of `./js/main.js`; nothing else on the
   page changes.
6. Copies `manifest.webmanifest`, `alvafav.PNG`, `controller.PNG`, `hs.jpg`
   and `assets/` byte for byte.
7. Validates the folder; only a valid release gets its archive,
   `dist/alva-itch.zip` (index.html at its root, no enclosing folder), which
   is validated against the folder in turn. Any problem fails the build
   (exit code 1) and leaves no archive.
8. Prints the report: what was bundled, joined and copied, files by
   folder, the totals against the limits, the archive.

The same repository always makes the same files, and with the same zlib
the same archive (fixed entry order and timestamps,
[`tools/itch/zip.mjs`](../../tools/itch/zip.mjs)).

```
dist/
  alva-itch.zip            the upload: everything below, index.html at its root
  itch/
    index.html             the page, loading the two files below
    game.js                the 145 modules of js/, bundled (about 1.6 MB)
    game.css               the 15 parts of css/, joined (about 170 KB)
    manifest.webmanifest   unchanged
    alvafav.PNG            unchanged (favicon, splash)
    controller.PNG         unchanged (Home's controller picture)
    hs.jpg                 unchanged (splash)
    assets/
      favicon.svg
      icons/               5 install icons
      characters/<id>/     every fighter's frames, 888 PNGs
```

## What is bundled, and how it stays the same game

- **JavaScript.** `BUNDLE_OPTIONS` in `release.mjs`: one ES module (the page
  still loads it with `type="module"`, so it stays strict, deferred and
  module-scoped and runs on the same `DOMContentLoaded` path), `esnext`
  (no syntax lowered), no minification, no tree shaking (nothing dropped
  for looking unused: the registries are read through their exports), no
  source map. esbuild places the modules in their ES evaluation order (the
  graph has no import cycles, so that order is plain depth-first) and
  renames a top-level name where two modules share one (`isObject2`).
  Nothing in the game reads a function's or class's `name`, `eval`s code,
  imports dynamically or uses `import.meta`, so neither changes anything;
  top-level `const` and `class` become module-scoped `var`, which differs
  only for code that would already throw. Every asset path is relative to
  the page (`./assets/...`), never to a module, so paths resolve as before.
  `window.alva` is there as before.
- **CSS.** The parts are joined, never rewritten, minified or reordered: the
  cascade is the page's order, and the parts have no `@import`, `@charset`
  or `url()` whose meaning depends on their own file (the validation
  checks, and that each part's braces balance).
- **Kept as they are.** The PNG frames: the sprite normalizer reads their
  pixels, so no atlas, repacking or conversion, and the release is under
  the limit without one. The 58 byte-identical frames stay too: each is a
  frame of its own clip, some repeated on purpose as holds, and each is
  loaded once by URL anyway. `assets/favicon.svg` is referenced by nothing
  (the favicon is `alvafav.PNG`) but stays a copy of `assets/` like the
  rest.
- **Left out.** Everything development-only: `tests/`, `docs/`, `tools/`,
  the specification and Markdown, `codename_rule`, `character_rule`, `max`,
  `package.json`, `node_modules/`, `.nojekyll` (GitHub Pages only) and Git.
  The repository keeps all of it.

## The validation

[`tools/itch/validate.mjs`](../../tools/itch/validate.mjs), run by the
build and on its own:

- itch.io's limits: fewer than 1,000 files (a warning above 950), at most
  500 MB in all and 200 MB a file, paths of at most 240 characters, no two
  names differing only in case, plain characters only.
- Nothing development-only: only the release's own files at its root, no
  tests, documentation, tools, source maps, Markdown or npm files anywhere.
- Current: `index.html` is the page the repository makes now, `game.css`
  the parts joined in order, `game.js` every module of the page's graph,
  once each, in ES evaluation order (read from the source's own imports),
  every copied file identical to the repository's and nothing extra.
- Complete, under exact names: every local URL of the page, every image the
  code names (`./hs.jpg`, `./alvafav.PNG`, `controller.PNG`), every frame of
  every registered fighter (from the registry itself), every manifest icon.
- No other host: the only addresses are the credits' links to the sprite
  sources (opened by the player, never loaded); no script, style or image
  from elsewhere.
- The archive: every entry intact (CRC-32), exactly the folder's files and
  bytes, `index.html` at its root, no unsafe paths.

## The equivalence check

`npm run verify:itch` ([`tools/itch/equivalence.mjs`](../../tools/itch/equivalence.mjs))
bundles [`tools/itch/sim-probe.mjs`](../../tools/itch/sim-probe.mjs) with
the release's own options and runs it beside the unbundled probe, each in
its own process, with frozen clocks and seeded randomness: Watch Mode for
every fighter on each side, every stage and every CPU level, two mirror
matches, two matches sent to overtime (the closing Void, the Launch Point
tiebreak), a Quick Battle for every fighter with a scripted player (runs,
jumps and Super Jumps, Down, the Shield and the Deflect, Dashes, every
attack button, bursts of five presses for the Mash Combo), two Local Play
matches with two scripted players, and Practice Ground for every fighter
with a fighter swap and the dummy removed and brought back. Every step's
fighters, projectiles, events, score and clock, and every second the whole
world (fighters, controllers and CPU minds, combat, stage, hazards), must
match; a difference names the scenario and the second. `-- --quick` runs
a short version. A nudge of 1e-9 to gravity, or the CPUs' random seed off
by one, planted in the bundle, fails it.

## Testing the release locally

```sh
python3 -m http.server 8000 --directory dist/itch
# then open http://localhost:8000
```

Check it as a player would ([testing](testing.md#what-the-tests-cannot-check)):
the splash and Home, Quick Battle (Regular and Custom Play), Watch Mode,
Local Play with two controllers, Practice Ground, Discover, Settings, both
languages, the touch controls on a phone in landscape. To see it the way
itch.io shows it, load it in an `<iframe>` from another origin, for
example a page on `http://127.0.0.1:8001/` with
`<iframe src="http://localhost:8000/" width="1280" height="720" allow="fullscreen; gamepad"></iframe>`.

## Publishing on itch.io

itch.io's own rules for HTML5 games are at
<https://itch.io/docs/creators/html5>; check them before uploading, since
they can change.

1. Build and validate: `npm run build:itch` must end with `OK`.
2. On itch.io, **Create new project** (or **Edit game** for an existing
   one). **Kind of project: HTML**.
3. **Uploads**: upload `dist/alva-itch.zip` and tick **This file will be
   played in the browser**.
4. **Embed options**:
   - **Viewport dimensions**: a 16:9 size such as 1280 × 720 (or 960 ×
     540); the game fits any size.
   - **Mobile friendly**: on, **Orientation**: landscape (the game shows
     its rotate prompt in portrait).
   - **Fullscreen button**: on.
   - **Automatically start on page load** or **Click to launch in
     fullscreen**: either works. A click to start gives the game the
     keyboard focus at once.
   - **Enable scrollbars**: off. **SharedArrayBuffer support**: off (not
     needed).
5. Save, then open the page while it is still a draft or restricted.
6. Verify it: the splash plays, Home appears, a battle starts and plays,
   the keyboard works after a click into the game, a controller works,
   fullscreen works, the browser console shows no errors, and on a phone in
   landscape the touch controls appear.
7. Publish when it is right. Uploading or publishing is the owner's call:
   nothing in the repository does it.

### Updating it

Change the repository as usual (the tests, `node --test`, must pass), then
`npm run build:itch` (and `npm run verify:itch` after a change to the
simulation), and on itch.io upload the new `dist/alva-itch.zip`, mark it as
played in the browser and delete the old upload.

### What is different inside itch.io's page

itch.io shows the game in an `<iframe>` on its own domain. The game is the
same; the page around it decides a few things:

- **Keyboard.** Keys reach the game once it has the focus: a click into
  it (or itch.io's click-to-launch) gives it.
- **Controllers.** The Gamepad API in an iframe needs the page's
  permission (`allow="gamepad"`); itch.io's embed is expected to grant it,
  but if a browser withholds it, fullscreen or the game's own page
  (itch.io's launch-in-new-window) works.
- **Saved settings.** Kept in the game's `localStorage` as on GitHub Pages,
  under the same key and schema (`alva.settings`), but storage belongs to
  the site: settings saved on GitHub Pages do not carry over to itch.io,
  and a browser that blocks or clears third-party storage keeps them for
  the visit only (the game already handles that).
- **Installing Alva.** Browsers do not offer to install a page shown in an
  iframe, so Home's Download dialog shows its manual steps there.
  Installing is for the game's own site.
