/**
 * money.js — the single seam for currency formatting.
 *
 * Foundation Audit (2026-06-20): "FJD " was hardcoded across ~20 files with ~10
 * near-duplicate local `fjd()` helpers. That is the localization debt that turns
 * global expansion into a multi-file rewrite. Every money display should format
 * through formatMoney() instead. Today it defaults to FJD, so output is
 * unchanged — but when multi-currency lands (Phase 3) this is the ONE place to
 * read the user's pref_currency and switch, instead of editing dozens of files.
 *
 * RULE FOR NEW CODE: never write `FJD ${n}` (or any currency literal) directly —
 * call formatMoney(amount, { decimals, fallback }). Migrate legacy `fjd()`
 * helpers to delegate here opportunistically.
 */
export const DEFAULT_CURRENCY = "FJD";

/**
 * Format a monetary amount.
 * @param {number|string|null|undefined} amount
 * @param {object} [opts]
 * @param {string} [opts.currency="FJD"]  ISO-ish currency code prefix.
 * @param {number} [opts.decimals=2]      Fraction digits.
 * @param {*}      [opts.fallback=null]   Returned for null/NaN input.
 * @param {string} [opts.locale]          Intl locale (default: runtime locale).
 * @returns {string|*} e.g. "FJD 1,234.56", or `fallback` for bad input.
 */
export function formatMoney(amount, opts = {}) {
  const { currency = DEFAULT_CURRENCY, decimals = 2, fallback = null, locale } = opts;
  if (amount == null) return fallback;
  const n = Number(amount);
  if (Number.isNaN(n)) return fallback;
  return `${currency} ${n.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
