/**
 * api.js — shared authenticated fetch with token auto-refresh + TRUTHFUL errors.
 *
 * The old per-file helpers threw bare "401"/"500" strings, so every failure was
 * blamed on "your connection". This wrapper:
 *  - attaches the Bearer token;
 *  - on 401, silently exchanges the refresh token at /auth/refresh (deduped so
 *    parallel calls trigger ONE refresh) and retries the request once;
 *  - only redirects to /login when refresh itself fails (session truly over);
 *  - classifies failures: err.kind = "network" | "server" | "client", with a
 *    farmer-readable err.userMessage — so UIs can say what actually happened.
 */

const ACCESS_KEY = "tfos_access_token";
const REFRESH_KEY = "tfos_refresh_token";

export class ApiError extends Error {
  constructor(message, { kind, status, userMessage } = {}) {
    super(message);
    this.kind = kind || "client";
    this.status = status;
    this.userMessage = userMessage || message;
  }
}

let refreshing = null; // in-flight refresh promise — dedupes parallel 401s

async function refreshAccessToken() {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = localStorage.getItem(REFRESH_KEY);
      if (!rt) return false;
      try {
        const r = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: rt }),
        });
        if (!r.ok) return false;
        const d = await r.json();
        if (!d?.access_token) return false;
        localStorage.setItem(ACCESS_KEY, d.access_token);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

function logoutToLogin() {
  try { localStorage.removeItem(ACCESS_KEY); localStorage.removeItem(REFRESH_KEY); } catch { /* noop */ }
  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign("/login");
  }
}

export async function apiFetch(url, opts = {}) {
  const run = () => {
    const t = localStorage.getItem(ACCESS_KEY);
    const headers = { ...(opts.headers || {}) };
    if (t) headers.Authorization = `Bearer ${t}`;
    if (opts.body && typeof opts.body === "string" && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    return fetch(url, { ...opts, headers });
  };

  let res;
  try {
    res = await run();
  } catch {
    throw new ApiError("network failure", { kind: "network", userMessage: "No connection — check your internet and try again." });
  }

  if (res.status === 401 && !url.includes("/auth/")) {
    const ok = await refreshAccessToken();
    if (!ok) { logoutToLogin(); throw new ApiError("session expired", { kind: "client", status: 401, userMessage: "Your session ended — please sign in again." }); }
    try { res = await run(); } catch {
      throw new ApiError("network failure", { kind: "network", userMessage: "No connection — check your internet and try again." });
    }
  }
  return res;
}

// Strip internal codes/ids so a leaked backend message never reaches a farmer:
// drop a leading "ERROR_CODE: " prefix and any "xxx_id=VALUE" tokens. Returns a
// clean human string, or null if nothing human-readable remains.
function humanizeError(detail) {
  let msg = null;
  if (typeof detail === "string") msg = detail;
  else if (detail && typeof detail === "object") msg = detail.error?.message || detail.message || (typeof detail.detail === "string" ? detail.detail : null);
  if (!msg || typeof msg !== "string") return null;
  msg = msg.replace(/^[A-Z][A-Z0-9_]{2,}:\s*/, "");      // leading CODE:
  msg = msg.replace(/\b[a-z][a-z0-9_]*_id\s*=\s*\S+\s*/gi, "");  // pu_id=… / cycle_id=…
  msg = msg.trim();
  // If what's left is itself just a bare CODE (no spaces), it's not human → drop.
  if (!msg || /^[A-Z][A-Z0-9_]{2,}$/.test(msg)) return null;
  return msg;
}

async function parseErr(res) {
  const detail = (await res.json().catch(() => ({})))?.detail;
  const kind = res.status >= 500 ? "server" : "client";
  const human = humanizeError(detail);
  const userMessage = human || (res.status >= 500
    ? "Server problem — please try again in a moment."
    : "Something went wrong — please try again.");
  return new ApiError(human || String(res.status), { kind, status: res.status, userMessage });
}

export async function getJSON(url) {
  const r = await apiFetch(url);
  if (!r.ok) throw await parseErr(r);
  return r.json();
}

export async function send(method, url, body) {
  const r = await apiFetch(url, { method, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw await parseErr(r);
  return r.json().catch(() => ({}));
}
