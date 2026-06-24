/**
 * theme.js — light/dark theme engine (Ocean Teal).
 *
 * Dark mode re-enabled 2026-06-24. The no-FOUC inline script in index.html sets
 * data-theme before first paint (saved 'teivaka-theme' choice → else OS preference);
 * these helpers flip it at runtime, persist the choice, keep the theme-color meta in
 * sync, and follow the OS only while the user hasn't made an explicit choice.
 * Dark CSS tokens live in index.css + styles/prototype.css.
 */
const KEY = "teivaka-theme"; // 'light' | 'dark' (absent = follow OS)
const COLORS = { light: "#0BAF9A", dark: "#0B1F33" };

function systemPrefersDark() {
  try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
  catch { return false; }
}

export function getTheme() {
  try { return localStorage.getItem(KEY) || (systemPrefersDark() ? "dark" : "light"); }
  catch { return "light"; }
}

export function applyTheme(t = getTheme()) {
  const mode = t === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", mode);
  try {
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "theme-color"); document.head.appendChild(m); }
    m.setAttribute("content", COLORS[mode]);
  } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("tfos-theme-changed", { detail: { mode } })); } catch { /* ignore */ }
  return mode;
}

export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  return applyTheme(t);
}

export function toggleTheme() {
  return setTheme(getTheme() === "dark" ? "light" : "dark");
}

export function initTheme() {
  applyTheme();
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", () => { if (!localStorage.getItem(KEY)) applyTheme(); });
  } catch { /* ignore */ }
}
