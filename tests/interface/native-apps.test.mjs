// Run with node --test tests/interface/native-apps.test.mjs (no
// dependencies: it builds nothing). The native apps
// (docs/development/native-apps.md): where the game runs
// (js/core/native-shell.js: a Tauri desktop app, the Capacitor Android
// app or a browser), what a native app does differently and nothing more
// (no offer to install, the installed app's screen, links opened in the
// player's own browser, F11 for fullscreen on a computer), and the shells'
// configuration held to the game's: one identifier, package.json's version
// everywhere, the release as their page, the room server's address alone
// in the desktop app's CSP, the opener allowed only the game's own links,
// the Android app landscape with the network its only permission, and the
// apps' fixed origins on the room server's list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot } from '../helpers/online-app.mjs';

const { CONFIG } = await import('../../js/config.js');
const { nativeShell, isNativeApp, openExternal, NativeShell, RELEASES_URL } = await import('../../js/core/native-shell.js');
const { runningInstalled, WebAppInstall } = await import('../../js/core/web-app-install.js');
const { ScreenGuard, screenLimits } = await import('../../js/core/screen-guard.js');
const { serverOrigins, EXTERNAL_URL } = await import('../../tools/itch/hosts.mjs');
const { VERSION_PATTERN, versionCode, releaseVersion, releaseDefine, RELEASE_GLOBAL, isDevelopmentOnly } = await import('../../tools/itch/release.mjs');

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const json = (path) => JSON.parse(read(path));
const noop = () => {};

// A page's window: a browser's, or with what a shell puts on it.
function page(extra = {}) {
  const listeners = new Map();
  return {
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    navigator: { userAgent: 'Mozilla/5.0', maxTouchPoints: 0 },
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener: noop,
    listeners,
    ...extra,
  };
}
const desktop = (extra = {}) => page({ __TAURI_INTERNALS__: { invoke: async () => {} }, ...extra });
const android = (extra = {}) => page({ Capacitor: { isNativePlatform: () => true, Plugins: {} }, ...extra });

test('where the game runs: the desktop apps (Tauri), the Android app (Capacitor) or a browser', () => {
  assert.equal(nativeShell(desktop()), 'tauri');
  assert.equal(nativeShell(page({ __TAURI__: {} })), 'tauri');
  assert.equal(nativeShell(android()), 'capacitor');
  assert.equal(nativeShell(page({ Capacitor: { isNativePlatform: () => false } })), null, 'Capacitor\'s script on a web page is not the app');
  assert.equal(nativeShell(page()), null);
  assert.equal(nativeShell(undefined), null);
  const odd = page();
  Object.defineProperty(odd, '__TAURI_INTERNALS__', { get() { throw new Error('no'); } });
  assert.equal(nativeShell(odd), null, 'anything odd is a browser');
  assert.equal(isNativeApp(desktop()), true);
  assert.equal(isNativeApp(page()), false);
});

test('a native app is an installed app: nothing to install, the installed screen minimum, the lock without fullscreen', () => {
  for (const win of [desktop(), android()]) {
    assert.equal(runningInstalled(win), true);
    const install = new WebAppInstall(win);
    assert.equal(install.mode, 'installed');
    assert.equal(install.canPrompt, false);
  }
  assert.equal(runningInstalled(page()), false, 'a browser tab is as before');
  assert.equal(new WebAppInstall(page()).mode, 'manual');
  assert.deepEqual(screenLimits(runningInstalled(desktop())), CONFIG.screen.installed);
});

test('the game\'s own links open in the player\'s browser: Tauri\'s opener, Android\'s system, a browser\'s new tab', async () => {
  const opened = [];
  assert.equal(await openExternal(RELEASES_URL, desktop({ __TAURI__: { opener: { openUrl: async (url) => opened.push(['opener', url]) } } })), true);
  const invoked = [];
  await openExternal(RELEASES_URL, desktop({ __TAURI_INTERNALS__: { invoke: async (cmd, args) => invoked.push([cmd, args]) } }));
  assert.deepEqual(invoked, [['plugin:opener|open_url', { url: RELEASES_URL }]], 'without the global API, the plugin\'s own command');
  const launcher = android();
  launcher.Capacitor.Plugins.AppLauncher = { openUrl: async ({ url }) => { opened.push(['launcher', url]); return { completed: true }; } };
  assert.equal(await openExternal(RELEASES_URL, launcher), true);
  const tab = page({ open: (url, target, features) => { opened.push(['tab', url, target, features]); return {}; } });
  assert.equal(await openExternal(RELEASES_URL, tab), true);
  assert.deepEqual(opened, [['opener', RELEASES_URL], ['launcher', RELEASES_URL], ['tab', RELEASES_URL, '_blank', 'noopener,noreferrer']]);
  // A refusal never throws.
  const warn = console.warn;
  console.warn = noop;
  try {
    assert.equal(await openExternal(RELEASES_URL, desktop({ __TAURI__: { opener: { openUrl: async () => { throw new Error('not allowed'); } } } })), false);
  } finally {
    console.warn = warn;
  }
  assert.equal(RELEASES_URL, 'https://github.com/hiyroscript/alva/releases/latest');
});

test('what a native app adds to the page: links to other sites opened outside it, F11 for fullscreen on a computer; a browser gets nothing', async () => {
  const doc = () => {
    const listeners = new Map();
    return { listeners, addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]); } };
  };
  const browserDoc = doc();
  const browser = page();
  new NativeShell(browser, browserDoc).start();
  assert.equal(browserDoc.listeners.size + browser.listeners.size, 0, 'a browser: nothing added');

  const opened = [];
  let fullscreen = false;
  const win = desktop({
    __TAURI__: {
      opener: { openUrl: async (url) => opened.push(url) },
      window: { getCurrentWindow: () => ({ isFullscreen: async () => fullscreen, setFullscreen: async (on) => { fullscreen = on; } }) },
    },
  });
  const appDoc = doc();
  const shell = new NativeShell(win, appDoc).start();
  assert.equal(shell.native, true);
  const click = (href) => {
    let prevented = false;
    const link = { getAttribute: (name) => (name === 'href' ? href : null) };
    const event = { target: { closest: () => link }, preventDefault: () => { prevented = true; } };
    for (const fn of appDoc.listeners.get('click')) fn(event);
    return prevented;
  };
  const credit = read('js/ui/credits.js').match(EXTERNAL_URL)[0];
  assert.equal(click(credit), true, 'a credits link: not followed inside the app');
  assert.equal(click('./index.html'), false, 'the app\'s own pages: as they are');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(opened, [credit]);
  const key = (code, repeat = false) => {
    let prevented = false;
    for (const fn of win.listeners.get('keydown')) fn({ code, key: code, repeat, preventDefault: () => { prevented = true; } });
    return prevented;
  };
  assert.equal(key('F11'), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fullscreen, true);
  key('F11', true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fullscreen, true, 'a held key toggles once');
  key('F11');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fullscreen, false);
  assert.equal(key('KeyF'), false, 'every other key is the game\'s');
  // The Android app: links, but no F11 (no window to make fullscreen).
  const phone = android();
  new NativeShell(phone, doc()).start();
  assert.equal(phone.listeners.has('keydown'), false);
});

test('Home: no Download inside a native app; in a browser, as before', () => {
  const inBrowser = boot();
  assert.equal(inBrowser.screens.home.downloadButton.hidden, false);
  globalThis.window.__TAURI_INTERNALS__ = {};
  try {
    const inApp = boot();
    assert.equal(inApp.screens.home.downloadButton.hidden, true);
  } finally {
    delete globalThis.window.__TAURI_INTERNALS__;
  }
  const css = read('css/home.css');
  assert.match(css, /\.home-download\[hidden\] \{ display: none; \}/, 'hidden despite its own display');
});

test('the small-screen block in a native app: no Download Alva, its panel holds the focus', () => {
  const win = android({ innerWidth: 1280, innerHeight: 720 });
  const guard = new ScreenGuard({ win, doc: globalThis.document });
  assert.equal(guard.native, true);
  assert.equal(guard.download.hidden, true);
  assert.equal(guard.panel.getAttribute('tabindex'), '-1');
  assert.equal(guard.installed, true, 'the installed app\'s minimum');
  const inBrowser = new ScreenGuard({ win: page({ innerWidth: 1280, innerHeight: 720 }), doc: globalThis.document });
  assert.equal(inBrowser.download.hidden, false);
  assert.match(read('css/overlays.css'), /\.screen-block-download\[hidden\] \{ display: none; \}/);
});

test('package.json\'s version is the release\'s, everywhere: the bundle, the desktop apps, the Android app, the room server', () => {
  const version = json('package.json').version;
  assert.match(version, VERSION_PATTERN);
  assert.equal(releaseVersion(), version);
  assert.deepEqual(releaseDefine(), { [RELEASE_GLOBAL]: JSON.stringify(version) });
  assert.equal(CONFIG.version, 'dev', 'the modules as they are play as dev');
  assert.match(read('js/config.js'), /globalThis\.ALVA_RELEASE_VERSION/, 'the global the bundle writes the version over');
  assert.equal(json('src-tauri/tauri.conf.json').version, '../package.json');
  assert.equal(read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)[1], '0.0.0', 'the crate\'s own is never the app\'s');
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /rootProject\.file\('\.\.\/package\.json'\)\)\.version/);
  assert.match(gradle, /versionCode appVersionCode/);
  assert.match(gradle, /versionName appVersion/);
  assert.equal(read('server/wrangler.toml').match(/^CURRENT_VERSION = "([^"]+)"/m)[1], version);
  // The Android versionCode always grows with the version.
  assert.equal(versionCode('1.0.0'), 10000);
  assert.equal(versionCode('1.2.3'), 10203);
  const order = ['0.9.9', '1.0.0', '1.0.1', '1.0.99', '1.1.0', '1.99.99', '2.0.0', '10.0.0'];
  for (let i = 1; i < order.length; i++) assert.ok(versionCode(order[i]) > versionCode(order[i - 1]), order[i]);
  for (const bad of ['1.0', '1.0.100', '1.100.0', '01.0.0', '1.0.0-beta', 'dev', '']) {
    assert.doesNotMatch(bad, VERSION_PATTERN, bad);
    assert.throws(() => releaseVersion({ version: bad }));
  }
});

test('one identity: the same name and identifier for the desktop apps and the Android app', () => {
  const tauri = json('src-tauri/tauri.conf.json');
  const capacitor = json('capacitor.config.json');
  assert.equal(tauri.identifier, 'io.github.hiyroscript.alva');
  assert.equal(capacitor.appId, tauri.identifier);
  assert.equal(tauri.productName, 'Alva');
  assert.equal(capacitor.appName, 'Alva');
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /namespace = "io\.github\.hiyroscript\.alva"/);
  assert.match(gradle, /applicationId "io\.github\.hiyroscript\.alva"/);
  assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="app_name">Alva<\/string>/);
});

test('the desktop apps: the release as their page, one window, the smallest permissions, a CSP with the room server alone', () => {
  const tauri = json('src-tauri/tauri.conf.json');
  assert.equal(tauri.build.frontendDist, '../dist/itch');
  assert.equal(tauri.build.beforeBuildCommand, 'npm run build:itch');
  const [window, ...others] = tauri.app.windows;
  assert.equal(others.length, 0);
  assert.equal(window.label, 'main');
  assert.equal(window.title, 'Alva');
  assert.equal(window.resizable, true);
  assert.equal(window.fullscreen, false);
  assert.deepEqual({ width: window.minWidth, height: window.minHeight },
    { width: CONFIG.screen.installed.minWidth, height: CONFIG.screen.installed.minHeight }, 'never smaller than the game plays in');
  assert.ok(window.width >= window.minWidth && window.height >= window.minHeight);
  // The CSP: the page's own files and data: images (the packed frames),
  // and for connections only the room server's https and wss, and Tauri's
  // own IPC.
  const csp = tauri.app.security.csp;
  assert.equal(csp['default-src'], "'self'");
  assert.equal(csp['script-src'], "'self'");
  assert.equal(csp['img-src'], "'self' data:");
  assert.equal(csp['object-src'], "'none'");
  const network = csp['connect-src'].split(/\s+/).filter((s) => /^(https?|wss?):\/\//.test(s) && s !== 'http://ipc.localhost');
  assert.deepEqual(network, serverOrigins(CONFIG.online.serverUrl));
  assert.deepEqual(network, ['https://alva-online.pages.dev', 'wss://alva-online.pages.dev']);
  for (const value of Object.values(csp)) assert.doesNotMatch(value, /\*|https?:(?!\/\/)|'unsafe-eval'/, value);
  // Tauri adds hashes to the directives it reads the page for; style-src is
  // left as written, so its 'unsafe-inline' (the style attributes the game
  // sets) keeps working.
  assert.deepEqual(tauri.app.security.dangerousDisableAssetCspModification, ['style-src']);
  assert.equal(tauri.app.withGlobalTauri, true, 'the opener and window calls js/core/native-shell.js makes');
});

test('the desktop apps\' capability: fullscreen, and the opener allowed exactly the game\'s own links', () => {
  const capability = json('src-tauri/capabilities/default.json');
  assert.deepEqual(capability.windows, ['main']);
  const [fullscreenRead, fullscreenSet, opener, ...more] = capability.permissions;
  assert.deepEqual([fullscreenRead, fullscreenSet], ['core:window:allow-is-fullscreen', 'core:window:allow-set-fullscreen']);
  assert.equal(more.length, 0, 'nothing else: no core:default, no file system, no shell');
  assert.equal(opener.identifier, 'opener:allow-open-url');
  const credits = [...new Set(read('js/ui/credits.js').match(EXTERNAL_URL))].sort();
  assert.deepEqual(opener.allow.map((a) => a.url), [RELEASES_URL, ...credits],
    'the Releases page and every credits link, exactly (a new credits link goes in src-tauri/capabilities/default.json too)');
  assert.match(read('src-tauri/src/lib.rs'), /\.plugin\(tauri_plugin_opener::init\(\)\)/);
  assert.doesNotMatch(read('src-tauri/src/lib.rs'), /\.menu\(/, 'no menu bar set: none on Windows and Linux');
});

test('the Android app: its page at the fixed https://alva.app, landscape, the network its only permission', () => {
  const capacitor = json('capacitor.config.json');
  assert.equal(capacitor.webDir, 'dist/itch');
  assert.deepEqual(capacitor.server, { androidScheme: 'https', hostname: 'alva.app' });
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const permissions = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"([^>]*)\/>/g)];
  assert.deepEqual(permissions.filter(([, , rest]) => !/tools:node="remove"/.test(rest)).map(([, name]) => name), ['android.permission.INTERNET']);
  assert.match(manifest, /android:screenOrientation="sensorLandscape"/);
  assert.match(manifest, /android:appCategory="game"/, 'kept in landscape on large screens too');
  const sdk = read('android/variables.gradle');
  assert.ok(Number(sdk.match(/minSdkVersion = (\d+)/)[1]) >= 24);
  assert.ok(Number(sdk.match(/targetSdkVersion = (\d+)/)[1]) >= 35);
  // Release signing only from the environment (or Gradle properties): no
  // key, no password, in the repository.
  const gradle = read('android/app/build.gradle');
  for (const name of ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) assert.match(gradle, new RegExp(`signingValue\\('${name}'\\)`));
  assert.match(gradle, /if \(releaseSigning\) signingConfig signingConfigs\.release/);
  for (const ignored of ['*.jks', '*.keystore', 'android/local.properties', 'src-tauri/target/']) assert.ok(read('.gitignore').split('\n').includes(ignored), ignored);
});

test('the apps\' origins are on the room server\'s list, and the apps themselves never in the release', () => {
  const origins = read('server/wrangler.toml').match(/^ALLOWED_ORIGINS = "([^"]+)"/m)[1].split(',');
  const { hostname, androidScheme } = json('capacitor.config.json').server;
  for (const origin of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', `${androidScheme}://${hostname}`]) {
    assert.ok(origins.includes(origin), origin);
  }
  for (const path of ['src-tauri/tauri.conf.json', 'src-tauri/src/lib.rs', 'android/app/build.gradle', 'capacitor.config.json', 'android/app/src/main/AndroidManifest.xml']) {
    assert.ok(isDevelopmentOnly(path), path);
  }
});
