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

// `value` as `language` writes a number: up to `digits` decimals (0.44 in
// English, 0,44 in French), `fixed` keeping exactly that many (11.39).
export function formatNumber(value, language, { digits = 2, fixed = false } = {}) {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat(language, { minimumFractionDigits: fixed ? digits : 0, maximumFractionDigits: digits }).format(n);
  } catch {
    const text = fixed ? n.toFixed(digits) : String(Number(n.toFixed(digits)));
    return language === 'fr' ? text.replace('.', ',') : text;
  }
}
