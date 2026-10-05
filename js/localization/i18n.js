// Interface localization: the one source of every player-facing string, in
// English and French, looked up by stable key.
//
//   t('home.play')                    'Play' / 'Jouer'
//   t('roster.slot', { num: '07' })   'Slot 07' / 'Emplacement 07'
//   plural('unit.second', 3)          '3 seconds' / '3 secondes'
//
// Keys name what a string is for, never what it says, and internal
// identifiers (control and move codenames, character, map and scheme ids,
// CSS classes, data keys) are never translated. The English copy of game
// data (Powers, Launch, difficulty levels, stages, control names and each
// fighter's own touch-button names) is read from the registries that own it,
// so it cannot drift from them; STRINGS.fr translates every key, and a key
// missing from a language falls back to English.
//
// The string tables live beside this module, one per language
// (js/localization/strings/en.js and fr.js); this module is the translator
// that looks them up, fills them and keeps the page in the active language.
//
// App owns the active language: it applies the player's saved choice
// (js/core/settings.js) at start and after every change. Changing it sets
// <html lang> and tells every onLanguageChange listener; App then re-reads
// every marked string on the page (localizeTree), so the whole interface
// follows without a reload. Strings are marked as they are made: tx() for
// an element's text, tattr() for an attribute (e.g. its aria-label),
// iconLabel() for a label beside an inline SVG icon, and setText() /
// setAttr() when code changes one later.

import { LANGUAGES, DEFAULT_LANGUAGE } from '../core/settings.js';
import { EN } from './strings/en.js';
import { FR } from './strings/fr.js';
import { formatList } from './format.js';

export { LANGUAGES, DEFAULT_LANGUAGE };

// Each language by its own name, so a player can find theirs whatever
// language the game is in. Never translated.
export const LANGUAGE_NAMES = Object.freeze({ en: 'English', fr: 'Français' });

export const STRINGS = Object.freeze({ en: Object.freeze(EN), fr: Object.freeze(FR) });

// ---- Active language --------------------------------------------------------------

let active = DEFAULT_LANGUAGE;
const listeners = new Set();
const warned = new Set();

export function getLanguage() {
  return active;
}

// Makes `language` ('en' or 'fr'; anything else is English) the interface
// language: <html lang> follows at once, and listeners hear about a real
// change. Returns whether it changed.
export function setLanguage(language) {
  const next = LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  const root = globalThis.document?.documentElement;
  if (root) root.lang = next;
  if (next === active) return false;
  active = next;
  for (const fn of [...listeners]) fn(next);
  return true;
}

// Calls `fn(language)` after every change; returns an unsubscribe.
export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Keeps the interface language on `settings`' language setting
// (js/core/settings.js): now (English until the player picks one) and after
// every change of it. Returns an unsubscribe.
export function followSettings(settings) {
  setLanguage(settings.language);
  return settings.onChange((name, value) => {
    if (name === 'language') setLanguage(value);
  });
}

// Whether `key` has a string (in English, which every key has).
export function hasTranslation(key) {
  return Object.hasOwn(STRINGS[DEFAULT_LANGUAGE], key);
}

const fill = (text, params) => text.replace(/\{(\w+)\}/g, (whole, name) => (params && name in params ? String(params[name]) : whole));

// `params` with every { t: key } value read as that key's string, so a
// placeholder can hold another translated string ("{name} setup" with the
// setup's own name) and still follow the language.
function resolveParams(params, language) {
  if (!params) return params;
  const out = {};
  for (const [name, value] of Object.entries(params)) {
    out[name] = value && typeof value === 'object' && typeof value.t === 'string' ? t(value.t, undefined, language) : value;
  }
  return out;
}

// The string for `key` in `language` (the active one by default), with each
// {name} filled from `params`. A key no language has is logged once and
// shown as itself, so a gap is visible rather than blank.
export function t(key, params, language = active) {
  const text = STRINGS[language]?.[key] ?? STRINGS[DEFAULT_LANGUAGE][key];
  if (text === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[Alva] No string for "${key}".`);
    }
    return key;
  }
  const values = resolveParams(params, language);
  return typeof text === 'function' ? text(values ?? {}) : fill(text, values);
}

// `key`.one or `key`.other by the active language's plural rules for `n`
// (French counts 0 and 1 as one), with {n} filled.
export function plural(key, n, params = {}) {
  let category = n === 1 ? 'one' : 'other';
  try {
    category = new Intl.PluralRules(active).select(n) === 'one' ? 'one' : 'other';
  } catch {
    // Keep the English rule.
  }
  return t(`${key}.${category}`, { n, ...params });
}

// `items` as one phrase in `language`: "A", "A and B", "A, B and C".
export function joinList(items, language = active) {
  return formatList(items, language);
}

// `key` in every language, for the first-launch chooser, which must make
// sense before any language is chosen: "Language · Langue".
export function bilingual(key) {
  return LANGUAGES.map((language) => t(key, undefined, language)).join(' · ');
}

// The spoken or shown name of a fighter's slot tag ('P1', 'CPU', 'CPU 1',
// 'CPU 2'); any other tag is shown as it is.
const SLOT_KEYS = Object.freeze({ P1: 'slot.p1', CPU: 'slot.cpu', 'CPU 1': 'slot.cpu1', 'CPU 2': 'slot.cpu2' });
export function slotLabel(tag) {
  return SLOT_KEYS[tag] ? t(SLOT_KEYS[tag]) : tag;
}

// ---- Marked strings -----------------------------------------------------------------

// The attributes a marked string can fill.
const ATTRS = Object.freeze(['aria-label', 'aria-description', 'aria-valuetext', 'alt', 'title']);

const encode = (params) => (params ? JSON.stringify(params) : '');
function decode(raw) {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// el() attributes for text that follows the language: the string itself and
// its mark (key and params).
export function tx(key, params) {
  return { text: t(key, params), 'data-i18n': key, 'data-i18n-params': params ? encode(params) : null };
}

// el() attributes for attribute `name` (e.g. 'aria-label') following the
// language, likewise.
export function tattr(name, key, params) {
  return {
    [name]: t(key, params),
    [`data-i18n-${name}`]: key,
    [`data-i18n-${name}-params`]: params ? encode(params) : null,
  };
}

// el() attributes for a label in a <span> beside an inline SVG icon (set
// through innerHTML): the label follows the language, the icon stays.
export function iconLabel(key, icon, { iconFirst = false, params } = {}) {
  const span = `<span>${escapeHtml(t(key, params))}</span>`;
  return {
    html: iconFirst ? `${icon}${span}` : `${span}${icon}`,
    'data-i18n-span': key,
    'data-i18n-params': params ? encode(params) : null,
  };
}

// Sets `node`'s text to `key` (with `params`) and marks it, so it follows
// the language from now on.
export function setText(node, key, params) {
  node.textContent = t(key, params);
  node.setAttribute('data-i18n', key);
  node.setAttribute('data-i18n-params', encode(params));
}

// Sets `node`'s attribute `name` to `key` (with `params`) and marks it.
export function setAttr(node, name, key, params) {
  node.setAttribute(name, t(key, params));
  node.setAttribute(`data-i18n-${name}`, key);
  node.setAttribute(`data-i18n-${name}-params`, encode(params));
}

// Sets attribute `name` to text no translation owns (a fighter's own name
// for a button), dropping any mark it had.
export function setPlainAttr(node, name, value) {
  node.setAttribute(name, value);
  node.setAttribute(`data-i18n-${name}`, '');
}

// Re-reads every marked string in `root` and below in the active language.
export function localizeTree(root) {
  if (!root?.getAttribute) return;
  const key = root.getAttribute('data-i18n');
  if (key) root.textContent = t(key, decode(root.getAttribute('data-i18n-params')));
  const spanKey = root.getAttribute('data-i18n-span');
  if (spanKey) {
    const span = root.querySelector?.('span');
    if (span) span.textContent = t(spanKey, decode(root.getAttribute('data-i18n-params')));
  }
  for (const name of ATTRS) {
    const attrKey = root.getAttribute(`data-i18n-${name}`);
    if (attrKey) root.setAttribute(name, t(attrKey, decode(root.getAttribute(`data-i18n-${name}-params`))));
  }
  for (const child of [...(root.children ?? [])]) localizeTree(child);
}

// The translator App owns (app.i18n).
export const i18n = Object.freeze({
  t, plural, joinList, bilingual, setLanguage, onLanguageChange, followSettings, localizeTree,
  get language() { return active; },
});
