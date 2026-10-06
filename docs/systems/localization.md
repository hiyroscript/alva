# Localization

The whole interface is in English or French, switched at runtime with no
reload. The product rules are [`ALVA_SPEC.md`](../../ALVA_SPEC.md) §6.11.

| Module | Owns |
| --- | --- |
| [`js/localization/i18n.js`](../../js/localization/i18n.js) | The translator: the active language (`getLanguage`, `setLanguage`, `onLanguageChange`, `followSettings`), lookups (`t`, `plural`, `joinList`, `bilingual`, `slotLabel`), marked strings (`tx`, `tattr`, `iconLabel`, `setText`, `setAttr`, `setPlainAttr`) and `localizeTree`; `STRINGS` and `LANGUAGE_NAMES`. |
| [`js/localization/strings/en.js`](../../js/localization/strings/en.js) | Every English string by key, including the English copy of game data, read from the registries that own it (`registryStrings`). English is the fallback. |
| [`js/localization/strings/fr.js`](../../js/localization/strings/fr.js) | Every French string, by the same keys. |
| [`js/localization/format.js`](../../js/localization/format.js) | `formatList` ("A, B and C"), shared by the translator and the tables. |
| [`js/core/settings.js`](../../js/core/settings.js) | The saved language (`LANGUAGES`, `DEFAULT_LANGUAGE`). |
| [`js/ui/language-dialog.js`](../../js/ui/language-dialog.js) | The first-launch chooser (the only place that looks at the browser's language, and only to focus a choice). |

## How it works

- **Keys, not text.** Every player-facing and spoken string is looked up
  by a stable key (`t('home.play')`) that names what it is for. Internal
  identifiers (control and move codenames, character, map and scheme ids,
  CSS classes, data keys) are never translated, and proper names (ALVA,
  #0001, the credited sources) stay as they are.
- **Registry-owned copy.** The English names and descriptions of game data
  (control names, each fighter's button and ability names, universal movement, Launch,
  difficulty levels, stages) are not written in the table: `registryStrings`
  reads them from the registries, so they cannot drift. French translates
  every key, those included.
- **Fallback.** A key missing from French shows the English string; a key
  no language has is logged once and shown as itself.
- **Switching.** `App` applies the saved language at start and after every
  change. A change sets `<html lang>` and re-reads every marked string on
  the page (`localizeTree`), plus the few a screen composes itself.
- **Placeholders and plurals.** `{name}` placeholders, a placeholder that
  is itself a key (`{ t: key }`), and `plural(key, n)` by each language's
  rules.

## Adding a string or a fighter's names

Add the key to `strings/en.js` and its translation to `strings/fr.js`; a
test fails if either language lacks a key the other has. A fighter's
button names come from its `mobileAbilities` labels and its ability names
from `abilityNames` (English, read from the definition), and are
translated in `strings/fr.js` as `ability.<id>.<button>` /
`ability.<id>.<move>`.

## Tests

[`tests/interface/i18n.test.mjs`](../../tests/interface/i18n.test.mjs):
both languages have exactly the same keys, no module scatters language
checks, placeholders and plurals, `<html lang>`, and a runtime switch
re-reading every marked string; [`tests/interface/settings.test.mjs`](../../tests/interface/settings.test.mjs):
the saved language and the chooser.
