# The native apps

Alva installs as a real app on Windows, macOS, Linux and Android, from
installers shared on itch.io, MediaFire and GitHub's Releases page (no app
store). Each app is the [itch.io release](itch-release.md) (`dist/itch`,
built by `npm run build:itch`), wrapped: the very files the itch.io page
plays, nothing of the game forked or copied by hand. The desktop apps are
[Tauri](https://tauri.app) v2 windows, the Android app a
[Capacitor](https://capacitorjs.com) WebView. iPhone is out of scope.

| Where | What |
| --- | --- |
| [`src-tauri/`](../../src-tauri/) | The desktop apps: `tauri.conf.json` (the app, its window, its CSP, its installers), `capabilities/default.json` (all the page may ask of the app), `src/lib.rs` (the window, the opener plugin, WebRTC on Linux), `icons/`. |
| [`capacitor.config.json`](../../capacitor.config.json), [`android/`](../../android/) | The Android app: Capacitor's configuration, and the Android Studio project `npx cap add android` made, adjusted (`app/build.gradle`: the version and signing; `AndroidManifest.xml`: landscape, the one permission; `MainActivity.java`: full screen, Back). |
| [`js/core/native-shell.js`](../../js/core/native-shell.js) | The game's one question about where it runs (`nativeShell`: `'tauri'`, `'capacitor'` or a browser), and what an app does differently. |
| [`tools/native/`](../../tools/native/) | `android.mjs` (the Android builds, on any computer), `collect.mjs` (the installers, named), `icons.mjs` (every icon from `assets/icons/`), `release.mjs` (a release's version, notes, files and checksums). |
| [`.github/workflows/native-apps.yml`](../../.github/workflows/native-apps.yml) | Every pull request: the tests, then every installer, kept on the run. |
| [`.github/workflows/release.yml`](../../.github/workflows/release.yml) | Every new `UPDATES.md` entry on `main`: a release, published everywhere, the room server last ([releases](#releases)). |

All of it is development-only: the game never imports it, and the itch.io
release never contains it (`DEVELOPMENT_ONLY` in
[`tools/itch/release.mjs`](../../tools/itch/release.mjs)).

## How they work

### In the game

The game asks [`js/core/native-shell.js`](../../js/core/native-shell.js)
whether it runs in an app, by what the shell puts on the page before the
game starts (Tauri's `__TAURI_INTERNALS__`, Capacitor's
`Capacitor.isNativePlatform()`), and nothing else does. Inside an app:

- **Nothing offers to install Alva.** Home's Download and the small-screen
  block's Download Alva are hidden (it is installed already), and
  `WebAppInstall.mode` is `'installed'`. There is no service worker in any
  copy of the game, so there is none to skip.
- **It counts as an installed app** (`runningInstalled`): the installed
  app's screen minimum (`CONFIG.screen.installed`), and the landscape lock
  asked for at once, never through fullscreen.
- **Links to other sites open in the player's browser**, never in a window
  of the app: the credits' links and the Releases page (`openExternal`:
  Tauri's opener plugin on a computer, Android's own `ACTION_VIEW` through
  Capacitor's AppLauncher plugin on a phone).
- **F11** turns fullscreen on and off on a computer (the window's own, as a
  browser's F11 does; on a Mac the green button works too).
- **Online play** offers **Get the update** when the server plays a newer
  version ([the version rule](#the-version-rule)).

Everything else is identical, and a browser behaves exactly as before.

### The desktop apps (Tauri)

- **The page** is `dist/itch`, bundled into the app (`frontendDist`), built
  first by `beforeBuildCommand` (`npm run build:itch`). It is served from
  Tauri's own scheme: `tauri://localhost` on macOS and Linux,
  `http://tauri.localhost` on Windows.
- **The window**: "Alva", 1280 × 720 to start, never smaller than 640 × 360
  (the installed app's screen minimum, so the small-screen block never
  shows), resizable, centred, Alva's dark behind it while it loads. No menu
  bar on Windows and Linux; macOS keeps its standard application menu
  (Quit, Hide, the edit commands).
- **Permissions** (`capabilities/default.json`), the smallest set that
  works: the window in and out of fullscreen (`is_fullscreen`,
  `set_fullscreen`), and the opener allowed to open exactly the Releases
  page and the credits' links, each by its full address. Nothing else: no
  file system, no shell, no other window call. A new credits link goes in
  that list too (a test names it when it is missing).
- **The CSP**: the page's own files (`'self'`), `data:` images (the packed
  fighter frames), the inline styles the game sets, and for connections
  only the room server, `https://alva-online.pages.dev` and
  `wss://alva-online.pages.dev` (`CONFIG.online.serverUrl`), with Tauri's
  own IPC. No other host, no `eval`. Tauri adds hashes for its own scripts;
  `dangerousDisableAssetCspModification: ["style-src"]` keeps the style
  directive as written so its `'unsafe-inline'` holds.
- **WebRTC on Linux.** Online Play's matches go over a WebRTC data channel.
  Windows' WebView2 and macOS's WKWebView have it; WebKitGTK, Linux's,
  keeps it switched off, and `src/lib.rs` switches it on. But Ubuntu and
  Debian (and so the AppImage, built on Ubuntu) build WebKitGTK without
  WebRTC at all (checked on 2026-11-13 with Ubuntu 24.04's 2.52.6:
  `RTCPeerConnection` does not exist). The Linux app then says, after the
  name, "Online play needs a connection this copy of Alva can't make. Play
  online in a web browser instead." Everything else plays.
- **Unsigned** (free: no certificate). Windows SmartScreen and macOS
  Gatekeeper warn before the first launch. The Mac app has an ad-hoc
  signature (`signingIdentity: "-"`), without which Apple silicon would not
  open it at all.

### The Android app (Capacitor)

- **The page** is `dist/itch`, copied into the app by `npx cap sync android`
  (`webDir`), served by Capacitor from inside the app at a fixed address of
  its own, **`https://alva.app`** (`server.androidScheme` and
  `server.hostname`; the address never leaves the phone and is no website).
  A fixed origin keeps the saves in one place and lets the room server
  allow it.
- **Landscape** (`sensorLandscape`: either way round), full screen (the
  status and navigation bars hidden while it plays, a swipe from an edge
  shows them a moment), drawn into a camera cutout's side, Alva's dark
  behind it. It declares itself a game (`appCategory`), so Android 16 keeps
  it landscape on tablets and foldables too.
- **Back** is the game's own Back (Escape: a menu's Back, a match's pause),
  so a stray swipe never closes it mid-match. Home or the app switcher
  leaves it.
- **Permissions:** `INTERNET` and nothing else (the one AndroidX would add
  for itself is removed; the workflow checks the built APK).
- **minSdk 24** (Android 7, every phone of the last nine years with a
  current WebView), **targetSdk 36** and compileSdk 36 (Android 16).

### Saves between launches

Settings and Adventure progress live in the page's `localStorage`
(`js/core/settings.js`, `js/core/adventure-progress.js`), as on itch.io.
Each app's webview keeps it in a folder named after the app's identifier,
`io.github.hiyroscript.alva`, the same at every launch and every update:

| Platform | Where |
| --- | --- |
| Windows | `%LOCALAPPDATA%\io.github.hiyroscript.alva\EBWebView` (WebView2's data) |
| macOS | `~/Library/WebKit/io.github.hiyroscript.alva` |
| Linux | `~/.local/share/io.github.hiyroscript.alva` (`localstorage/tauri_localhost_0.localstorage`) |
| Android | The app's own data, under the origin `https://alva.app` |

Checked on Linux on 2026-11-13: a language chosen at the first launch was
there at the next, with no language prompt. Uninstalling the app (on
Android, or by deleting that folder) deletes them; an update keeps them.
Saves never carry over between the apps and the itch.io page: storage
belongs to each address.

## The version rule

One version, written in one place: **`version` in `package.json`**
(MAJOR.MINOR.PATCH, MINOR and PATCH under 100). Every build reads it:

| Build | How |
| --- | --- |
| The game (the itch.io ZIP, so every app too) | esbuild writes it over `globalThis.ALVA_RELEASE_VERSION` (`releaseDefine` in `tools/itch/release.mjs`); `CONFIG.version` reads it. The modules run as they are, from the repository, are `dev`. The release's validation fails a bundle without it. |
| The desktop apps | `"version": "../package.json"` in `tauri.conf.json` (the installers' names and metadata). The Rust crate's own version, `0.0.0`, is never shown. |
| The Android app | `android/app/build.gradle` reads `package.json`: versionName is the version, versionCode is MAJOR × 10000 + MINOR × 100 + PATCH (1.0.0 is 10000, 1.2.3 is 10203), so it only grows, as Android needs to install an update over the app. |
| The room server | `CURRENT_VERSION` in `server/wrangler.toml`, equal to it (a test checks). |

**Online play only works between players on the current version**, on
every platform, the itch.io page included. The game sends its version with
the reachability check (`/health?version=`), the list (`/rooms?version=`),
creating and joining (the body's `version`); the server refuses any but
`CURRENT_VERSION` as `outdated`, and a room keeps its host's version, so
two versions never meet (`version_mismatch`). A room left from an older
release closes as `outdated` when a player reconnects or asks for the relay
(a deploy drops every room's connection). `dev` is let in only from
`http://localhost` and `http://127.0.0.1`, so testing on one's own computer
still plays and no real site can claim it.

The player is told "A new version of Alva is out. Update to play online.",
then Home: in an app with **Get the update**, which opens
<https://github.com/hiyroscript/alva/releases/latest>; in a browser with
"Refresh this page to get it (or download Alva again if you play a
downloaded copy)." Local play, Adventure, Practice Ground, Watch Mode and
everything offline play on any version.

## Origins

The room server allows only the addresses its game runs from
(`ALLOWED_ORIGINS` in `server/wrangler.toml`, [the room
server](online-server.md)). The apps' are fixed:

| Copy | Origin |
| --- | --- |
| itch.io's page | `https://html-classic.itch.zone`, `https://html.itch.zone`, any `https://*.itch.zone` |
| The desktop apps on macOS and Linux | `tauri://localhost` |
| The desktop app on Windows | `http://tauri.localhost` (and `https://tauri.localhost`, should an app ever be built on the https scheme) |
| The Android app | `https://alva.app` |
| A copy served from a computer, for testing | `http://localhost:*`, `http://127.0.0.1:*` |

`parseOrigins` reads `tauri://localhost` like any other exact origin (only
`*` is special), and a test holds every one of these to exactly that
address: no other port, host or scheme. The game's reachability check
reports `location.origin`, the app's own, as the server saw it.

## Building them on your computer

**Everyone:** Node.js 22 or later, then `npm ci` in the repository (the
tools: esbuild, the Tauri command line, Capacitor).

**The desktop apps** need [Rust](https://rustup.rs) (stable) and the
platform's own tools:

- **Windows:** Microsoft's C++ Build Tools ("Desktop development with C++")
  and WebView2 (built into Windows 10 and 11).
- **macOS:** Xcode's command-line tools (`xcode-select --install`).
- **Linux (Debian, Ubuntu):** `sudo apt install libwebkit2gtk-4.1-dev
  build-essential file libxdo-dev libssl-dev libayatana-appindicator3-dev
  librsvg2-dev patchelf`.

```sh
npm run app:dev          # the game in the desktop window, from a fresh dist/itch
npm run build:desktop    # this computer's installers
```

`build:desktop` writes them under `src-tauri/target/release/bundle/`
(`nsis/` and `msi/` on Windows, `dmg/` and `macos/` on a Mac, `appimage/`
and `deb/` on Linux). A universal Mac build is
`npx tauri build --target universal-apple-darwin` (after
`rustup target add aarch64-apple-darwin x86_64-apple-darwin`).

**The Android app** needs JDK 21 and the Android SDK: install
[Android Studio](https://developer.android.com/studio), which brings both,
and set `ANDROID_HOME` to its SDK folder (or let Android Studio write
`android/local.properties`, ignored by Git).

```sh
npm run cap:sync               # dist/itch built and copied into android/
npm run build:android          # a debug APK, to install and try
npm run build:android:release  # the release APK and AAB
```

They land in `android/app/build/outputs/` (`apk/debug/app-debug.apk`,
`apk/release/app-release.apk` or `app-release-unsigned.apk`,
`bundle/release/app-release.aab`). To open the project in Android Studio:
`npx cap open android`. To try a debug APK on a phone with USB debugging
on: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

**The icons** of both come from `assets/icons/` (`alva-512.png`, and for
Android's adaptive icon `alva-maskable-512.png` over Alva's dark):
`npm run app:icons` makes them again with each platform's official tool
(`tauri icon`, `capacitor-assets`), only when the game's icons change.

`node tools/native/collect.mjs <windows|macos|linux|android>` copies a
build's installers into `dist/installers/` under the names the workflow
uses.

## Signing

**Android** apps must be signed to install, and every update must be signed
with the same key, or it will not install over the app already there. The
release key is the owner's alone: made once, kept out of the repository,
backed up. Gradle reads it from four environment variables (or Gradle
properties of the same names):

| Variable | What |
| --- | --- |
| `ANDROID_KEYSTORE_PATH` | The keystore file (`.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | Its password |
| `ANDROID_KEY_ALIAS` | The key's alias inside it |
| `ANDROID_KEY_PASSWORD` | The key's password |

With all four, the release build is signed with it; without them it is
left unsigned and never fails, and the debug build keeps Android's own
debug key (installable for testing, but a different key: uninstall it
before installing a release). Making the key:

```sh
keytool -genkeypair -v -keystore alva-release.jks -alias alva -keyalg RSA -keysize 4096 -validity 36500
```

In GitHub, the workflow takes it from the repository's secrets
`ANDROID_KEYSTORE_BASE64` (the file, in base64), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, writes the file to the
job's temporary folder only, and checks the signature with `apksigner`.
`*.jks`, `*.keystore` and `*.p12` are ignored by Git.

**The desktop apps are not signed**: a code-signing certificate costs money
every year, and Alva stays free. Players see a warning the first time:

- **Windows** (SmartScreen, "Windows protected your PC"): **More info**, then
  **Run anyway**.
- **macOS** (Gatekeeper, "Apple could not verify…"): open it once, then
  **System Settings › Privacy & Security › Open Anyway**, or right-click the
  app › **Open**.
- **Linux:** none (an AppImage needs **Allow executing file as program**,
  or `chmod +x`).

Paid signing removes the warnings and is never required.

## Continuous integration

[`.github/workflows/native-apps.yml`](../../.github/workflows/native-apps.yml),
on every pull request and by hand (**Actions › Native apps › Run
workflow**):

| Job | Runner | Makes |
| --- | --- | --- |
| Desktop (Windows) | `windows-latest` | `Alva-<version>-windows-x64-setup.exe`, `Alva-<version>-windows-x64.msi` |
| Desktop (macOS) | `macos-latest` | `Alva-<version>-macos-universal.dmg` (Apple silicon and Intel) |
| Desktop (Linux) | `ubuntu-22.04` | `Alva-<version>-linux-x86_64.AppImage`, `Alva-<version>-linux-amd64.deb`, and the itch.io ZIP (`Alva-<version>-itch-html`) |
| Android | `ubuntu-latest`, JDK 21, the Android SDK | `Alva-<version>-android.apk` and `.aab`, signed, with the four secrets; without them `Alva-<version>-android-debug.apk` and `Alva-<version>-android-unsigned.aab` |

Each job first runs the tests (`node --test`, the room server's included)
and `npm run verify:itch`; the Android job also checks the APKs ask for
`INTERNET` alone. npm, Cargo and Gradle are cached. Every installer is an
artifact of its own on the run's page (**Artifacts**, 90 days; GitHub
hands each over in a ZIP of its own). Nothing is published. The release
workflow builds through this same one ([releases](#releases)), from its
release commit and with `release` on: the Android app signed, or no build.

## Releases

**A release is an entry in `UPDATES.md`.** Push to `main` a change that
adds a new `## ` section to `UPDATES.md` (merging a pull request that adds
one is the usual way), and about 20 minutes later the new version is on
the Releases page, on itch.io and on the room server, with nothing else to
do. A push that adds no entry (an edit, a `### ` subsection, a reworded
heading) never releases.
[`.github/workflows/release.yml`](../../.github/workflows/release.yml),
its rules in [`tools/native/release.mjs`](../../tools/native/release.mjs):

1. **Plan.** The version is the patch after `package.json`'s (1.0.3 →
   1.0.4), unless the new entry's heading names one (`## The bounce update
   (v1.1.0)`) or the person running it by hand does. It is never lower than
   the current one, never one already released, and MINOR and PATCH stay
   under 100 (past x.y.99, name x.(y+1).0). `package.json`, its lockfile and
   `CURRENT_VERSION` in `server/wrangler.toml` are set to it in one commit,
   "Release vX.Y.Z", by `github-actions[bot]`, kept on a branch of its own
   (`release/vX.Y.Z`) until the release is published.
2. **Build.** From that very commit,
   [`native-apps.yml`](../../.github/workflows/native-apps.yml) (called by
   the release): the tests and `verify:itch` on every runner, then every
   installer and the itch.io ZIP. The Android app is signed with the release
   key, or there is no release.
3. **Publish.** Every file checked (none missing, extra or empty) and its
   SHA-256 written to `SHA256SUMS.txt`; all of them attached to a draft
   release; `main` brought up to the release commit (straight on, or merged
   in when `main` moved meanwhile); then the release published as **vX.Y.Z**
   (the tag made at the release commit), marked the latest and checked to be:
   <https://github.com/hiyroscript/alva/releases/latest> always opens the
   newest. Its notes are the new entry, its links made absolute, with a link
   to [how to install](#how-to-install).
4. **itch.io.** With the secret `BUTLER_API_KEY` and the variable
   `ITCH_PROJECT` (`user/game`, e.g. `hiyroscript/alva`: **Settings ›
   Secrets and variables › Actions › Variables**), each build is pushed with
   butler to its own channel, so itch.io offers one download a system:
   `windows` (the `.exe`), `mac` (the `.dmg`), `linux` (the `.AppImage`),
   `android` (the `.apk`) and `html` (the ZIP). Without either, it is skipped
   and the release goes on. The first time, on the game's itch.io page, tick
   **This file will be played in the browser** on the `html` upload and
   delete the older hand-made one.
5. **The room server, last**, only once all of the above succeeded:
   `wrangler deploy` with the new `CURRENT_VERSION` (the secrets
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`), then its `/health`
   checked to say so. From that moment older copies are told a new version
   is out ([the version rule](#the-version-rule)); not before, because the
   new one can already be downloaded.

**What it needs**, as the repository's secrets (**Settings › Secrets and
variables › Actions**): the four `ANDROID_…` ones ([signing](#signing)),
`CLOUDFLARE_API_TOKEN` (a token from Cloudflare's "Edit Cloudflare Workers"
template) and `CLOUDFLARE_ACCOUNT_ID`. With any of the six missing, a
release is **held**: the run stops at once, red, saying which, before
anything is built, committed or published; add them and run it again. The
room server must be deployed by this workflow alone: Cloudflare's own
deploy from GitHub (Workers Builds) is disconnected, or it would put a new
`CURRENT_VERSION` live before the downloads exist.

**Never half published.** A failure while planning or building leaves
nothing (the branch and any draft are removed by the run's last job). A
failure after publishing (itch.io, the deploy) leaves the release up and
the server on the older version: **Re-run failed jobs** on the run's page
picks up from there. Two releases never run at once (the second waits).
The release commit starts no other workflow (it is pushed with the
workflow's own token, and adds no entry).

**By hand:** **Actions › Release › Run workflow** on `main`, with a version
(empty: the next patch). Its notes are the newest entry. Ticking **test**
(or running it on any other branch) makes a **test release**: everything
built and attached to a draft, checked, then removed, with the server's
deploy only a dry run; nothing is pushed to `main`, published, uploaded or
deployed. A pull request that changes the release itself
(`release.yml`, `tools/native/release.mjs`) makes one too, so the whole
release is tried before the change is merged.

## How to install

For the download pages (the Releases page, itch.io, MediaFire); the files
are on <https://github.com/hiyroscript/alva/releases/latest>. Alva is free
and not code-signed (that costs money every year), so each system warns
once before the first launch. That is expected.

**Windows**
1. Download `Alva-…-windows-x64-setup.exe` and open it.
2. If Windows says "Windows protected your PC", click **More info**, then
   **Run anyway**.
3. Follow the installer. Alva is in the Start menu. Updates install over it
   the same way, keeping your progress.

**Mac** (Apple silicon and Intel)
1. Download `Alva-…-macos-universal.dmg`, open it, and drag **Alva** into
   **Applications**.
2. Open Alva from Applications. If macOS says it "can't be opened" or
   "could not verify" it, click **Done**, open **System Settings › Privacy &
   Security**, scroll down to the message about Alva, click **Open Anyway**,
   and confirm with your password. You only do this once.

**Linux**
- **AppImage** (any distribution): download `Alva-…-linux-x86_64.AppImage`,
  right-click it › **Properties** › **Permissions** › **Allow executing file
  as program** (or `chmod +x Alva-*.AppImage`), then double-click it.
- **Debian, Ubuntu and their family:** download `Alva-…-linux-amd64.deb`
  and open it with your software installer, or
  `sudo apt install ./Alva-*.deb`.
- Online play needs a web browser on Linux (the itch.io page): the Linux
  app plays everything else.

**Android** (Android 7 or later)
1. On the phone, download `Alva-….apk` and open it (from the browser's
   downloads or the Files app).
2. When Android asks, allow your browser (or Files app) to **install
   unknown apps** (**Settings**, then back), and tap **Install**. If Play
   Protect warns, tap **More details › Install anyway**.
3. Updates install over it the same way, keeping your progress. Never
   uninstall to update: that deletes your progress.

**In the browser:** play on the itch.io page, nothing to install. Online
play works between every copy (the apps and the browser) on the same
version: when a new version is out, the game says so and how to update.

## Tests

[`tests/interface/native-releases.test.mjs`](../../tests/interface/native-releases.test.mjs)
(which push releases, the version rules, the notes, the version files, the
files attached and their checksums, the release workflow's order),
[`tests/interface/native-apps.test.mjs`](../../tests/interface/native-apps.test.mjs)
(where the game runs, what an app does differently and a browser does not,
Home and the small-screen block in an app, the version everywhere and the
versionCode, one identity, the desktop apps' window, CSP and capability,
the Android app's origin, orientation, permission and signing, the apps'
origins on the server's list),
[`tests/online/online-play.test.mjs`](../../tests/online/online-play.test.mjs)
(an outdated copy in a browser and in an app, the version sent with every
call, `dev` from a computer's own address only, a room closed by a release,
a copy with no WebRTC), and the server's
[`worker.test.mjs`](../../server/tests/worker.test.mjs) and
[`safeguards.test.mjs`](../../server/tests/safeguards.test.mjs) (the
native origins, the version rule, `CURRENT_VERSION` equal to
`package.json`'s). What only real devices can show: the
[checklist](testing.md#what-the-tests-cannot-check), on each app.
