# Running and deploying

Alva is static files: there is nothing to install or build to run it.

## Run locally

The game uses ES modules and reads sprite pixels, so it has to be served
over HTTP; opening `index.html` straight from disk (`file://`) won't work.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, `npx http-server`, …). No
`npm install`: the game has no dependencies. (`package.json` holds only the
optional itch.io export's development dependency, below.)

Useful while developing:

- `` ` `` in battle toggles the debug overlay (colliders, hurtboxes, live
  hitboxes, projectile and clone hitboxes, technique objects, solids and
  the Void's kill line).
- `window.alva` is the running `App` in the browser console.
- Device emulation in the browser's developer tools shows the touch
  controls (they appear on touch-first devices only).

## Run the tests

```sh
node --test
```

A current Node (the suite runs on Node 22), nothing else. See [testing](testing.md).

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**, choose **Deploy from a branch**, select the
   branch and `/ (root)`.
3. Open `https://<user>.github.io/alva/`.

`index.html` is the entry point and stays at the repository root. Every
asset, module and stylesheet path is relative (`./assets/...`, `./js/...`,
`./css/...`), so the game works under any sub-path, including `/alva/`.
`.nojekyll` stops Jekyll from processing the site. Nothing in the code
depends on the repository's name.

## Publish on itch.io

itch.io takes at most 1,000 files in an HTML5 game, and the repository
serves 1,059. The release export makes the same game in 901 files:

```sh
npm install           # once: esbuild, a development dependency of the export only
npm run build:itch    # dist/itch/ and dist/alva-itch.zip, validated
npm run verify:itch   # the bundle against the source, step for step
```

Upload `dist/alva-itch.zip` as an HTML game. How it is made, what it
checks, the embed settings and updating it: [the itch.io
release](itch-release.md).
