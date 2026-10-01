// Run with node --test tests/i18n.test.mjs (no dependencies).
// Localization: one source of strings for English and French (every key in
// both, English game copy read from the registries that own it), stable
// keys (never a translated string as an identifier, no scattered language
// checks), placeholders and plural rules, <html lang> following the active
// language, and a runtime switch re-reading every marked string (menus,
// headings, setup steps, difficulty cards, Discover, the HUD, touch-control
// names, index.html's own labels) without a reload. On a minimal fake DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const noop = () => {};

class Node {
  parentNode = null;
}
class Text extends Node {
  constructor(text) { super(); this.textContent = text; }
}
const BOOLEAN_ATTRS = ['hidden', 'disabled', 'inert'];
class Element extends Node {
  children = [];
  attrs = new Map();
  listeners = new Map();
  style = { setProperty(name, value) { this[name] = value; } };
  dataset = {};
  hidden = false;
  disabled = false;
  inert = false;
  html = '';
  scrollTop = 0;
  rect = { left: 0, top: 0, width: 40, height: 40 };
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    const names = new Set();
    this.classNames = names;
    this.classList = {
      add: (...n) => n.forEach((c) => names.add(c)),
      remove: (...n) => n.forEach((c) => names.delete(c)),
      contains: (c) => names.has(c),
      toggle: (c, on = !names.has(c)) => { on ? names.add(c) : names.delete(c); return on; },
    };
  }
  set className(v) { this.classNames.clear(); v.split(/\s+/).filter(Boolean).forEach((c) => this.classNames.add(c)); }
  get className() { return [...this.classNames].join(' '); }
  setAttribute(name, value) {
    if (BOOLEAN_ATTRS.includes(name)) this[name] = true;
    else this.attrs.set(name, String(value));
  }
  getAttribute(name) {
    if (BOOLEAN_ATTRS.includes(name)) return this[name] ? '' : null;
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) {
    if (BOOLEAN_ATTRS.includes(name)) this[name] = false;
    else this.attrs.delete(name);
  }
  set textContent(v) { this.replaceChildren(new Text(String(v))); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.replaceChildren(); this.html = v; }
  get innerHTML() { return this.html; }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener() {}
  focus() { document.activeElement = this; }
  matches(selector) {
    return selector.split(',').map((s) => s.trim()).some((s) => {
      if (s.startsWith('.')) return this.classNames.has(s.slice(1));
      const attr = s.match(/^\[([\w-]+)\]$/);
      if (attr) return this.hasAttribute(attr[1]);
      return this.tagName === s.toUpperCase();
    });
  }
  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (n.matches?.(selector)) return n;
    return null;
  }
  contains(el) {
    for (let n = el; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (n) => n.children.forEach((c) => {
      if (!(c instanceof Element)) return;
      if (c.matches(selector)) out.push(c);
      walk(c);
    });
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return this.rect; }
  getContext() { return { drawImage: noop, clearRect: noop }; }
  scrollIntoView() {}
  setPointerCapture() {}
}

const sections = new Map();
globalThis.Node = Node;
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false, addEventListener: noop }) };
const body = new Element('body');
globalThis.document = {
  body,
  activeElement: body,
  documentElement: new Element('html'),
  createElement: (tag) => new Element(tag),
  createTextNode: (text) => new Text(text),
  querySelector: (selector) => {
    const id = selector.match(/data-screen="([\w-]+)"/)?.[1];
    if (!sections.has(id)) sections.set(id, new Element('section'));
    return sections.get(id);
  },
  addEventListener: noop,
  removeEventListener: noop,
};

const {
  STRINGS, LANGUAGES, LANGUAGE_NAMES, t, plural, joinList, bilingual, hasTranslation, setLanguage, getLanguage, onLanguageChange,
  localizeTree, tx, tattr, iconLabel, setText, setAttr, followSettings, slotLabel, i18n,
} = await import('../js/core/i18n.js');
const { Settings } = await import('../js/core/settings.js');
const { CONFIG, ACTION_LABELS } = await import('../js/config.js');
const { POWERS } = await import('../js/data/powers.js');
const { DIFFICULTIES } = await import('../js/data/difficulty.js');
const { MAPS } = await import('../js/data/maps.js');
const launch = await import('../js/data/launch.js');
const { CHARACTERS, getCharacter } = await import('../js/data/characters.js');
const { MenuNavigator } = await import('../js/core/menu-navigator.js');
const { ModeSelectScreen } = await import('../js/screens/mode-select-screen.js');
const { DifficultySelectScreen } = await import('../js/screens/difficulty-select-screen.js');
const { DiscoverScreen } = await import('../js/screens/discover-screen.js');
const { HUD, describeEnergy } = await import('../js/game/hud.js');
const { TouchControls } = await import('../js/game/touch-controls.js');
const { hintBar, MENU_HINTS } = await import('../js/ui/components.js');

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
function sourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`);
      else if (entry.name.endsWith('.js')) files.push(`${dir}${entry.name}`);
    }
  };
  walk('js/');
  return files;
}

// Runs `fn` in French, then puts English back.
function inFrench(fn) {
  setLanguage('fr');
  try {
    return fn();
  } finally {
    setLanguage('en');
  }
}

// ---- One source of strings -------------------------------------------------------

test('English and French have exactly the same keys, every one a real string', () => {
  assert.deepEqual([...LANGUAGES], ['en', 'fr']);
  assert.deepEqual({ ...LANGUAGE_NAMES }, { en: 'English', fr: 'Français' }, 'each language by its own name');
  assert.deepEqual(Object.keys(STRINGS), ['en', 'fr']);
  const en = Object.keys(STRINGS.en).sort();
  const fr = Object.keys(STRINGS.fr).sort();
  assert.deepEqual(en.filter((k) => !fr.includes(k)), [], 'every English key is translated');
  assert.deepEqual(fr.filter((k) => !en.includes(k)), [], 'no French key without English');
  for (const language of LANGUAGES) {
    for (const [key, value] of Object.entries(STRINGS[language])) {
      assert.ok(typeof value === 'function' || (typeof value === 'string' && value.trim() === value && value), `${language} ${key}`);
      assert.match(key, /^[a-z][\w]*(\.[\w]+)+$/, `${key}: a dotted key, not a sentence`);
    }
  }
  assert.ok(Object.isFrozen(STRINGS.en) && Object.isFrozen(STRINGS.fr));
});

test('French is really French: only proper names, codes and shared words read the same in both', () => {
  const same = Object.keys(STRINGS.en)
    .filter((k) => typeof STRINGS.en[k] === 'string' && STRINGS.en[k] === STRINGS.fr[k])
    .sort();
  assert.deepEqual(same, [
    'ability.0001.extra_attack', // Shuriken
    'brand.title', // ALVA
    'control.pause', // Pause
    'credits.sprites.site', // The Spriters Resource
    'difficulty.brutal.name', // Brutal
    'hud.pause', // Pause
    'hud.round', // ROUND n
    'map.card', // {name}. {tagline}
    'mode.index', // Mode 01
    'settings.scheme.joystick', // Joystick
    'slot.cpu', 'slot.cpu1', 'slot.cpu2', // CPU
    'banner.round', // ROUND n
    'step.cpu', // CPU n
    'step.mode', // Mode
    'touch.actions', // Actions
    'unit.minute.one', 'unit.minute.other', // minute(s)
  ].sort());
});

test('English game copy is the registries\' own, never retyped', () => {
  for (const [action, label] of Object.entries(ACTION_LABELS)) assert.equal(STRINGS.en[`control.${action}`], label, action);
  for (const power of POWERS) {
    assert.equal(STRINGS.en[`power.${power.id}.name`], power.name);
    assert.equal(STRINGS.en[`power.${power.id}.summary`], power.summary);
    for (const tier of power.tiers) {
      assert.equal(STRINGS.en[`power.${power.id}.tier.${tier.tier}.name`], tier.name);
      assert.equal(STRINGS.en[`power.${power.id}.tier.${tier.tier}.description`], tier.description);
    }
  }
  for (const d of DIFFICULTIES) {
    assert.equal(STRINGS.en[`difficulty.${d.id}.name`], d.name);
    assert.equal(STRINGS.en[`difficulty.${d.id}.description`], d.description);
  }
  for (const map of MAPS) {
    assert.equal(STRINGS.en[`map.${map.id}.name`], map.name);
    assert.equal(STRINGS.en[`map.${map.id}.tagline`], map.tagline);
  }
  assert.equal(STRINGS.en['launch.pointSummary'], launch.LAUNCH_POINT_SUMMARY);
  assert.equal(STRINGS.en['launch.formula'], launch.LAUNCH_FORMULA);
  for (const d of launch.DIRECTIONAL_LAUNCHES) assert.equal(STRINGS.en[`launch.direction.${d.id ?? 'none'}.name`], d.name);
  for (const def of CHARACTERS) {
    // A name of its own has its key, and so has a name of its own for the
    // ground or the air (#0002's mid-air moves); a button with only art has
    // none. Jump is no fighter's button: it keeps the universal name.
    for (const [action, own] of Object.entries(def.mobileAbilities ?? {})) {
      assert.equal(STRINGS.en[`ability.${def.id}.${action}`], own.label, `${def.id} ${action}`);
      for (const state of ['ground', 'air']) {
        assert.equal(STRINGS.en[`ability.${def.id}.${action}.${state}`], own.previews?.[state]?.label, `${def.id} ${action} ${state}`);
      }
    }
    assert.equal(def.mobileAbilities.jump, undefined, `#${def.id}: Jump keeps its name and arrow`);
    assert.equal(STRINGS.en[`ability.${def.id}.jump`], undefined);
  }
  assert.deepEqual(['attack1', 'attack2', 'attack3'].map((a) => STRINGS.en[`ability.0002.${a}.air`]), ['Homing Attack', 'Bounce Attack', 'Blue Tornado']);
  // The game data itself stays in English: its tests and gameplay are untouched.
  assert.equal(POWERS[0].name, 'Jump Power');
  assert.equal(DIFFICULTIES[0].name, 'Easy');
});

test('no module scatters language checks or reads a language by hand: every string goes through a key', () => {
  for (const file of sourceFiles()) {
    if (file === 'js/core/i18n.js') continue;
    const code = read(file).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /===?\s*['"](en|fr)['"]|['"](en|fr)['"]\s*===?/, `${file}: no language === 'fr' checks`);
    assert.doesNotMatch(code, /navigator\.language/, file === 'js/ui/language-dialog.js' ? `${file}` : file);
  }
  // Only the chooser looks at the browser's language, and only to focus a
  // choice, never to make one.
  const chooser = read('js/ui/language-dialog.js');
  assert.match(chooser, /globalThis\.navigator\?\.language/);
});

// ---- The translator ------------------------------------------------------------------

test('t fills placeholders, reads nested keys, falls back to English, and shows a missing key as itself', () => {
  assert.equal(getLanguage(), 'en');
  assert.equal(t('home.play'), 'Play');
  assert.equal(t('roster.slot', { num: '07' }), 'Slot 07');
  assert.equal(t('setup.steps', { name: { t: 'setup.watch' } }), 'Watch Mode setup', 'a placeholder holding a key');
  assert.equal(t('home.play', undefined, 'fr'), 'Jouer', 'any language on request');
  assert.equal(t('home.play', undefined, 'de'), 'Play', 'an unknown language: English');
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    assert.equal(t('no.such.key'), 'no.such.key');
    assert.equal(t('no.such.key'), 'no.such.key');
  } finally {
    console.warn = warn;
  }
  assert.equal(warnings.length, 1, 'logged once');
  assert.equal(hasTranslation('home.play'), true);
  assert.equal(hasTranslation('ability.9999.attack1'), false);
  inFrench(() => {
    assert.equal(t('home.play'), 'Jouer');
    assert.equal(t('setup.steps', { name: { t: 'setup.watch' } }), 'Étapes : Mode Spectateur');
    assert.equal(t('common.loadingName', { name: joinList(['#0001', '#9999']) }), 'Chargement de #0001 et #9999');
    assert.equal(t('common.spritesFailed', { names: ['#0001'], where: 'assets/characters/0001/' }),
      'Les sprites de #0001 n’ont pas pu être chargés. Vérifiez votre connexion et la présence des fichiers dans assets/characters/0001/.');
  });
  // English keeps its exact wording.
  assert.equal(t('common.spritesFailed', { names: ['#9999', '#0001'], where: joinList(['a/', 'b/']) }),
    '#9999\'s and #0001\'s sprite frames could not be loaded. Check your connection and that the files in a/ and b/ exist.');
});

test('plural rules follow the language: French counts 0 and 1 as one', () => {
  assert.equal(plural('unit.second', 0), '0 seconds');
  assert.equal(plural('unit.second', 1), '1 second');
  assert.equal(plural('unit.second', 2), '2 seconds');
  inFrench(() => {
    assert.equal(plural('unit.second', 0), '0 seconde');
    assert.equal(plural('unit.second', 1), '1 seconde');
    assert.equal(plural('unit.second', 2), '2 secondes');
    assert.equal(plural('map.available', 2), '2 disponibles');
  });
});

test('the first-launch prompt reads in both languages at once', () => {
  assert.equal(bilingual('firstRun.title'), 'Language · Langue');
  assert.equal(bilingual('firstRun.prompt'), 'Choose your language · Choisissez votre langue');
  inFrench(() => assert.equal(bilingual('firstRun.title'), 'Language · Langue', 'whatever the language in use'));
});

test('<html lang> always names the active language, and listeners hear real changes only', () => {
  const heard = [];
  const off = onLanguageChange((language) => heard.push(language));
  assert.equal(setLanguage('fr'), true);
  assert.equal(document.documentElement.lang, 'fr');
  assert.equal(getLanguage(), 'fr');
  assert.equal(i18n.language, 'fr');
  assert.equal(setLanguage('fr'), false, 'no change');
  assert.equal(setLanguage('de'), true, 'anything else is English');
  assert.equal(document.documentElement.lang, 'en');
  assert.deepEqual(heard, ['fr', 'en']);
  off();
  setLanguage('fr');
  assert.deepEqual(heard, ['fr', 'en'], 'unsubscribed');
  setLanguage('en');
  // Following the settings: the saved language now and after every change.
  const settings = new Settings(null);
  const stop = followSettings(settings);
  assert.equal(getLanguage(), 'en', 'no language chosen: English');
  settings.set('language', 'fr');
  assert.equal(getLanguage(), 'fr');
  assert.equal(document.documentElement.lang, 'fr');
  settings.set('mobileControls', 'classic');
  assert.equal(getLanguage(), 'fr', 'other settings leave it alone');
  settings.set('language', 'en');
  assert.equal(document.documentElement.lang, 'en');
  stop();
  // A saved French choice is applied at start.
  const french = new Settings(null);
  french.set('language', 'fr');
  followSettings(french)();
  assert.equal(document.documentElement.lang, 'fr');
  setLanguage('en');
  assert.match(read('js/core/app.js'), /followSettings\(this\.settings\);\n\s*onLanguageChange\(\(\) => this\.localize\(\)\);/);
});

test('marked strings re-read themselves: text, attributes, a label beside an icon, and later changes', () => {
  const root = new Element('div');
  const title = document.createElement('h2');
  Object.entries(tx('settings.title')).forEach(([k, v]) => (k === 'text' ? (title.textContent = v) : v != null && title.setAttribute(k, v)));
  const button = document.createElement('button');
  Object.entries(tattr('aria-label', 'roster.slot', { num: '03' })).forEach(([k, v]) => v != null && button.setAttribute(k, v));
  const icon = document.createElement('button');
  const attrs = iconLabel('home.play', '<svg></svg>');
  assert.equal(attrs.html, '<span>Play</span><svg></svg>');
  icon.setAttribute('data-i18n-span', attrs['data-i18n-span']);
  const span = document.createElement('span');
  span.textContent = 'Play';
  icon.append(span); // what innerHTML makes in a browser
  const later = document.createElement('p');
  setText(later, 'practice.enableCpu');
  const labelled = document.createElement('div');
  setAttr(labelled, 'aria-label', 'map.preview', { name: { t: 'map.city.name' } });
  root.append(title, button, icon, later, labelled);
  assert.equal(title.textContent, 'Settings');
  assert.equal(button.getAttribute('aria-label'), 'Slot 03');
  assert.equal(labelled.getAttribute('aria-label'), 'City stage preview');
  inFrench(() => {
    localizeTree(root);
    assert.equal(title.textContent, 'Paramètres');
    assert.equal(button.getAttribute('aria-label'), 'Emplacement 03');
    assert.equal(span.textContent, 'Jouer');
    assert.equal(later.textContent, 'Activer le CPU');
    assert.equal(labelled.getAttribute('aria-label'), 'Aperçu de l’arène Ville');
  });
  localizeTree(root);
  assert.equal(title.textContent, 'Settings');
  assert.equal(span.textContent, 'Play');
});

// ---- The interface, switched at runtime -----------------------------------------------------

function fakeApp() {
  const app = {
    input: { onKey: () => noop, onPadMenu: noop },
    audio: { play: noop },
    device: { reducedMotion: true },
    selection: { difficulty: 'medium' },
    screens: { current: null, go: noop, back: noop },
  };
  app.nav = new MenuNavigator(app);
  return app;
}

test('changing the language re-reads the whole interface at once: menus, setup steps, cards, Discover, HUD, touch names', () => {
  const app = fakeApp();
  const mode = new ModeSelectScreen(app);
  const difficulty = new DifficultySelectScreen(app);
  const discover = new DiscoverScreen(app);
  const hudRoot = new Element('div');
  const hud = new HUD(hudRoot);
  const touchRoot = new Element('div');
  const touch = new TouchControls(touchRoot, { setTouch: noop, queueTouchMouvement: noop }, { scheme: 'classic' });
  touch.setCharacter(getCharacter('0001'));
  const hints = hintBar(MENU_HINTS);
  body.replaceChildren(mode.el, difficulty.el, discover.el, hudRoot, touchRoot, hints);
  const names = (screen) => screen.el.querySelectorAll('.step-name').map((s) => s.textContent);
  const english = {
    title: mode.el.querySelector('.screen-title').textContent,
    steps: names(mode),
    stepsLabel: mode.el.querySelector('.steps').getAttribute('aria-label'),
  };
  assert.deepEqual(english, { title: 'Select Mode', steps: ['Mode', 'Difficulty', 'Fighter', 'Stage'], stepsLabel: 'Quick Battle setup' });

  const off = onLanguageChange(() => localizeTree(body));
  setLanguage('fr');
  try {
    assert.equal(document.documentElement.lang, 'fr');
    // Select Mode.
    assert.equal(mode.el.querySelector('.screen-title').textContent, 'Choisir le mode');
    assert.equal(mode.el.querySelector('.kicker').textContent, 'Jouer');
    assert.deepEqual(names(mode), ['Mode', 'Difficulté', 'Combattant', 'Arène']);
    assert.equal(mode.el.querySelector('.steps').getAttribute('aria-label'), 'Étapes : Combat rapide');
    assert.equal(mode.el.querySelector('.mode-name').textContent, 'Combat rapide');
    assert.equal(mode.el.querySelector('.btn-back').getAttribute('aria-label'), 'Retour');
    // Difficulty cards: names, lines and spoken labels.
    assert.deepEqual(difficulty.cards.map((c) => c.querySelector('.difficulty-name').textContent), ['Facile', 'Moyen', 'Difficile', 'Brutal']);
    assert.equal(difficulty.cards[0].getAttribute('aria-label'), 'Facile, niveau 1 sur 4');
    assert.equal(difficulty.cards[2].querySelector('.difficulty-desc').textContent, 'Réactions rapides. Se défend et punit.');
    // Discover: tabs and the pages built from the registries.
    assert.deepEqual(discover.tabs.map((tab) => tab.textContent), ['Puissance', 'Éjection', 'Passifs']);
    assert.equal(discover.el.querySelector('.screen-title').textContent, 'Découvrir');
    const tierNames = discover.el.querySelectorAll('.discover-tier-name').map((n) => n.textContent);
    assert.ok(tierNames.includes('Puissance de saut 1'));
    assert.ok(tierNames.includes('Éjection de base 2'));
    assert.ok(discover.el.querySelectorAll('.discover-formula')[0].textContent.startsWith('Force d’éjection'));
    // The HUD's spoken labels.
    assert.equal(hud.pauseButton.getAttribute('aria-label'), 'Pause');
    assert.equal(hud.timeButton.getAttribute('aria-label'), 'Mettre en pause');
    assert.equal(hudRoot.querySelector('.hud-launch-point').getAttribute('aria-label'), 'Point d’éjection');
    // Touch-control names, the fighter's own included; the codenames never.
    assert.deepEqual(touch.dpad.children.map((b) => b.getAttribute('aria-label')), ['Aller à gauche', 'Aller à droite']);
    assert.equal(touch.dpad.getAttribute('aria-label'), 'Déplacement');
    assert.equal(touch.buttons.get('attack2').getAttribute('aria-label'), 'Coup de pied');
    assert.equal(touch.buttons.get('attack3').getAttribute('aria-label'), 'Attaque du clone');
    assert.equal(touch.buttons.get('attack4').getAttribute('aria-label'), 'Ruée sphérique');
    assert.equal(touch.buttons.get('shield').getAttribute('aria-label'), 'Bouclier');
    assert.deepEqual(touch.dpad.children.map((b) => b.getAttribute('data-action')), ['runLeft', 'runRight']);
    // Keyboard hints, keycaps too.
    assert.deepEqual(hints.querySelectorAll('.hint-label').map((l) => l.textContent), ['Naviguer', 'Sélectionner', 'Retour']);
    assert.deepEqual(hints.querySelectorAll('kbd').slice(-2).map((k) => k.textContent), ['Entrée', 'Échap']);
    // Spoken HUD text made on the fly.
    assert.equal(describeEnergy({ maxEnergy: 100, energy: 75, energyExhausted: false }), 'Énergie 75 sur 100');
    assert.equal(slotLabel('P1'), 'J1');
    assert.equal(slotLabel('CPU 2'), 'CPU 2');
  } finally {
    setLanguage('en');
    off();
  }
  // And back.
  localizeTree(body);
  assert.equal(mode.el.querySelector('.screen-title').textContent, 'Select Mode');
  assert.equal(touch.buttons.get('attack2').getAttribute('aria-label'), 'Kick');
  assert.equal(touch.buttons.get('attack3').getAttribute('aria-label'), 'Clone Attack');
  assert.equal(touch.buttons.get('attack4').getAttribute('aria-label'), 'Sphere Rush');
  assert.equal(describeEnergy({ maxEnergy: 100, energy: 75, energyExhausted: false }), 'Energy 75 of 100');
});

test('index.html\'s own labels are marked with the keys that translate them', () => {
  const html = read('index.html');
  const sectionsWithLabel = html.match(/<section[^>]*aria-label="[^"]*"[^>]*>/g);
  assert.ok(sectionsWithLabel.length >= 12);
  for (const tag of sectionsWithLabel) {
    const key = tag.match(/data-i18n-aria-label="([^"]+)"/)?.[1];
    assert.ok(key, `${tag} is marked`);
    assert.equal(STRINGS.en[key], tag.match(/ aria-label="([^"]+)"/)[1], `${key}: the English matches`);
  }
  for (const key of ['rotate.title', 'rotate.text']) {
    const text = html.match(new RegExp(`data-i18n="${key.replace('.', '\\.')}">([^<]+)<`))?.[1];
    assert.equal(text, STRINGS.en[key], key);
  }
  // Before any script runs, the fallback messages carry both languages.
  assert.match(html, /<p lang="en">Alva could not start\./);
  assert.match(html, /<p lang="fr">Alva n’a pas pu démarrer\./);
  assert.match(html, /<html lang="en">/, 'the page starts in English; App sets the player\'s language');
});

test('internal identifiers never change with the language', () => {
  inFrench(() => {
    const touch = new TouchControls(new Element('div'), { setTouch: noop, queueTouchMouvement: noop });
    assert.deepEqual([...touch.buttons.keys()].sort(), ['attack1', 'attack2', 'attack3', 'attack4', 'attack5', 'extra_attack', 'jump', 'shield', 'transform']);
    assert.deepEqual([...touch.mouvementButtons.keys()], ['mouvementLeft', 'mouvementRight']);
    assert.equal(touch.scheme, 'joystick');
    const app = fakeApp();
    const difficulty = new DifficultySelectScreen(app);
    assert.deepEqual(difficulty.cards.map((c) => c.getAttribute('data-difficulty')), ['easy', 'medium', 'hard', 'brutal']);
    assert.equal(CONFIG.bindings.attack1[0], 'KeyU', 'bindings untouched');
  });
});

test('every fighter-specific string belongs to a fighter that exists, in either language: none is left for a removed one', () => {
  const ids = new Set(CHARACTERS.map((c) => c.id));
  const names = new Set(CHARACTERS.map((c) => c.displayName));
  for (const language of ['en', 'fr']) {
    const table = STRINGS[language];
    for (const key of Object.keys(table)) {
      const owner = key.match(/^ability\.([^.]+)\./)?.[1];
      if (owner) assert.ok(ids.has(owner), `${language}: ${key} names no fighter that exists`);
      // A sprite credit group is #0001's (credits.sprites) or another
      // existing fighter's (credits.sprites<id>), never a removed one's.
      const credited = key.match(/^credits\.sprites(\d{4})\./)?.[1];
      if (credited) assert.ok(ids.has(credited), `${language}: ${key} credits no fighter that exists`);
      assert.doesNotMatch(key, /^credits\.\d/, `${language}: ${key}`);
    }
    const text = Object.values(table).filter((v) => typeof v === 'string').join('\n');
    for (const name of text.match(/#\d{4}\b/g) ?? []) assert.ok(names.has(name), `${language}: ${name} is no fighter`);
    assert.doesNotMatch(text, /slender|Knudsen|Victor Surge|XmayGrrr|renatoooferreiraaa/i, `${language}: nothing of an older fighter`);
  }
  // #0001's own strings stay: its ability names and its sprite credits; and
  // #0002's are there.
  assert.equal(STRINGS.fr['ability.0001.attack1'], 'Coup de poing');
  assert.equal(STRINGS.en['credits.sprites.title'], '#0001 sprite source');
  assert.equal(STRINGS.en['credits.sprites0002.title'], '#0002 sprite source');
  assert.equal(STRINGS.fr['ability.0002.extra_attack'], 'Tourbillon');
});

test('the empty-roster strings read in both languages', () => {
  assert.equal(STRINGS.en['common.noFighters'], 'No fighters available');
  assert.equal(STRINGS.fr['common.noFighters'], 'Aucun combattant disponible');
  assert.equal(STRINGS.en['common.fighterUnavailable'], 'Fighter unavailable');
  assert.equal(STRINGS.fr['common.fighterUnavailable'], 'Combattant indisponible');
  assert.match(STRINGS.en['common.fighterUnavailableMessage'], /cannot start/);
  assert.match(STRINGS.fr['common.fighterUnavailableMessage'], /ne peut pas commencer/);
});
