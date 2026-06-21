/**
 * i18n.js — the single seam for user-facing UI strings.
 *
 * Foundation Audit (2026-06-20): UI text is hardcoded English across the app and
 * the backend shared.naming_dictionary is unused on the client (localization
 * scored 1/10). That is the debt that turns global launch into a multi-file
 * rewrite. Every user-facing string should pass through t() instead.
 *
 * Pattern (i18next-style "default-at-call-site"): t(key, englishDefault, vars).
 *   - Today the locale is "en" with an empty catalog, so t() returns the English
 *     default verbatim — ZERO behavior change.
 *   - Phase 3 adds CATALOG.fj / CATALOG.hi keyed by `key` and wires getLocale()
 *     to the user's preferred_language; only this file + the catalogs change.
 *
 * RULE FOR NEW CODE: never put a raw user-facing string literal in JSX — wrap it
 * in t("area.key", "English text"). Use {placeholder} + a vars object for
 * interpolation, and plural() for count-dependent words.
 */

let _locale = "en";

/** Current UI locale. Phase 3: derive from the user's preferred_language. */
export function getLocale() {
  return _locale;
}

/** Set the active UI locale (e.g. on login, from user.preferred_language). */
export function setLocale(locale) {
  _locale = locale || "en";
}

// Translations for non-English locales, keyed by t() key. English is supplied at
// the call site (the default arg), so `en` stays empty. Populate fj/hi in Phase 3.
const CATALOG = {
  en: {},
};

/**
 * Translate a key, falling back to the English default supplied at the call site.
 * @param {string} key            Stable identifier, e.g. "offline.saved".
 * @param {string} [defaultText]  English text (the source of truth today).
 * @param {Object<string,*>} [vars]  Values for {placeholder} interpolation.
 * @returns {string}
 */
export function t(key, defaultText, vars) {
  const table = CATALOG[getLocale()] || CATALOG.en;
  let s = table && table[key] != null ? table[key] : (defaultText != null ? defaultText : key);
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars && vars[k] != null ? String(vars[k]) : m));
  }
  return s;
}

/** English-default plural selector. Phase 3 locales can override via CLDR rules. */
export function plural(n, one, many) {
  return n === 1 ? one : many;
}
