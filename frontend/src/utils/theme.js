/**
 * theme.js — Light / Dark / System theme engine.
 *
 * The design tokens + a full dark palette already live in styles/prototype.css
 * (:root and :root[data-theme="dark"]). This just flips the data-theme attribute
 * on <html>, persists the choice, follows the OS when set to "system", and keeps
 * the browser theme-color meta in sync. A tiny inline script in index.html
 * applies the saved theme before first paint (no flash).
 */
const KEY = "tfos_theme"; // 'system' | 'light' | 'dark'
const COLORS = { light: "var(--cream)", dark: "#16130E" };

export function getThemePref() {
  try { return localStorage.getItem(KEY) || "system"; } catch { return "system"; }
}

function systemPrefersDark() {
  try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

export function resolvedMode(_pref = getThemePref()) {
  // Dark/System mode retired — Teivaka renders the single light theme only,
  // regardless of any saved preference or the device's OS dark setting. Keeps the
  // UI exactly as designed (the prototype's light .tfp theme) on every device.
  // The dark CSS tokens remain in the stylesheets but are never matched because
  // data-theme is always "light".
  return "light";
}

export function applyTheme(pref = getThemePref()) {
  const mode = resolvedMode(pref);
  document.documentElement.setAttribute("data-theme", mode);
  try {
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "theme-color"); document.head.appendChild(m); }
    m.setAttribute("content", COLORS[mode] || COLORS.light);
  } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("tfos-theme-changed", { detail: { pref, mode } })); } catch { /* ignore */ }
  return mode;
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
  return applyTheme(pref);
}

export function initTheme() {
  applyTheme();
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", () => { if (getThemePref() === "system") applyTheme("system"); });
  } catch { /* ignore */ }
}
