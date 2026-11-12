# Running and deploying

Alva's browser version is static files: there is nothing to install or build to run it. Native desktop/mobile packages are optional builds from the same source.

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
It includes the room server's tests (`server/tests/`), which need no
Cloudflare account either.

## Online Play's room server

Online Play needs one small server, a Cloudflare Worker in `server/`
(deployed on its own, never part of the game's files). Run it locally with
`npx wrangler dev` from `server/` (no account needed) and point
`CONFIG.online.serverUrl` at it for a two-tab test. Putting it online
needs only a web browser: Cloudflare deploys it from this repository on
GitHub (or `npx wrangler deploy` from a terminal). Everything, step by step,
in [the room server](online-server.md).

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
serves 2,059. The release export makes the same game in 14 files (the
modules bundled, the stylesheets joined, the fighters' frames packed byte
for byte):

```sh
npm install           # once: esbuild, a development dependency of the export only
npm run build:itch    # dist/itch/ and dist/alva-itch.zip, validated
npm run verify:itch   # the bundle against the source, step for step
```

Upload `dist/alva-itch.zip` by hand as an HTML game; every merge to `main`
also leaves one, built and checked, on its GitHub Actions run
(`.github/workflows/itch-release.yml`). How it is made, what it checks and
the embed settings: [the itch.io release](itch-release.md).


## Native desktop and mobile apps

The browser site and itch.io release remain independent of native packaging.
The native applications reuse the validated itch export, so their HTML,
JavaScript, stylesheets and game assets are local to the installed app.
Single-player and local play therefore work offline; Online Play still
needs an internet connection and the Alva room server.

### Windows, macOS and Linux

Install the optional native build tools (these are not required to run or
test the browser game):

\`\`\`sh
npm install --no-save --package-lock=false electron@latest electron-builder@latest
npm run build:desktop
npx electron-builder --win nsis --x64
\`\`\`

The Windows installer is written to \`dist/installers/\`. On Windows, the
short form is \`npm run package:desktop:win\`. The same desktop bundle can
be packaged on macOS (\`npx electron-builder --mac dmg\`) and Linux
(\`npx electron-builder --linux AppImage deb\`). Builds are unsigned by
default; Windows SmartScreen and macOS Gatekeeper may warn until the
publisher signs the installers.

### Android

Install Capacitor's optional tools:

\`\`\`sh
npm install --no-save --package-lock=false @capacitor/core@latest @capacitor/cli@latest @capacitor/android@latest
npm run build:mobile
npx cap add android       # once per checkout
npx cap sync android
node tools/native/prepare-platforms.mjs
npx cap open android
\`\`\`

Build a debug APK in Android Studio, or from the command line:

\`\`\`sh
cd android && ./gradlew assembleDebug
\`\`\`

The APK is at \`android/app/build/outputs/apk/debug/app-debug.apk\`.
A Play Store release needs a separately signed Android App Bundle (AAB).

### iPhone and iPad

On a Mac with Xcode, install \`@capacitor/ios\` alongside Capacitor core
and CLI, then:

\`\`\`sh
npm run build:mobile
npx cap add ios            # once per checkout
npx cap sync ios
node tools/native/prepare-platforms.mjs
npx cap open ios
\`\`\`

A Simulator build can be made without signing. Installing on physical
devices or publishing through the App Store requires the owner's Apple
Developer signing certificate and provisioning profile.

### Automated builds

GitHub Actions workflows \`native-desktop.yml\` and \`native-mobile.yml\`
build Windows/macOS/Linux packages, an Android debug APK and an iOS
Simulator app. Their artifacts are downloadable from each workflow run.
The iOS Simulator artifact is for testing, not an installable App Store
release. The existing \`itch-release.yml\` remains unchanged.
