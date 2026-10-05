// Language-aware formatting that needs no translation table: shared by the
// translator (js/localization/i18n.js) and the string tables that build a
// phrase from a list (js/localization/strings/*.js), without either
// importing the other.

// `items` as one phrase in `language`: "A", "A and B", "A, B and C".
export function formatList(items, language) {
  try {
    return new Intl.ListFormat(language, { type: 'conjunction' }).format(items);
  } catch {
    return items.join(language === 'fr' ? ' et ' : ' and ');
  }
}
