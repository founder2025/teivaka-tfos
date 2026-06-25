import React from "react";

/**
 * Global crash guard. Without this, any render-time throw unmounts the whole app
 * to a white screen. Instead we:
 *   - auto-reload ONCE on a stale-chunk error (the usual "blank after deploy"),
 *   - otherwise show the real error + a Reload and a Clear-cache-&-reload button,
 *     so a crash is visible and recoverable instead of a silent blank.
 */
function isChunkError(err) {
  const m = String((err && err.message) || err || "");
  return /dynamically imported module|Loading (CSS )?chunk|ChunkLoadError|Importing a module script failed|Failed to fetch dynamically/i.test(m);
}

async function clearAndReload() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs || []).map((r) => r.unregister()));
  } catch { /* noop */ }
  try {
    const keys = await caches?.keys?.();
    await Promise.all((keys || []).map((k) => caches.delete(k)));
  } catch { /* noop */ }
  window.location.reload();
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // A stale service-worker after a deploy serves mismatched chunks — refresh
    // once (guarded so it can never loop) to pull the new bundle.
    if (isChunkError(error) && !sessionStorage.getItem("tfos_chunk_reloaded")) {
      try { sessionStorage.setItem("tfos_chunk_reloaded", "1"); } catch { /* noop */ }
      window.location.reload();
      return;
    }
    // eslint-disable-next-line no-console
    console.error("App crash:", error, info && info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const msg = String((error && error.message) || error || "Unknown error");
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#F8FAFC", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 480, width: "100%", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "#1F2937", margin: "0 0 6px" }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 14px" }}>This screen hit an error and stopped. Reload to continue — if it keeps happening, clear the cache.</p>
          <pre style={{ textAlign: "left", fontSize: 11.5, color: "#b91c1c", background: "#FEF2F2", border: "1px solid #FEE2E2", borderRadius: 8, padding: "8px 10px", overflow: "auto", maxHeight: 160, whiteSpace: "pre-wrap", margin: "0 0 14px" }}>{msg}</pre>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => window.location.reload()} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #0A7D6F", background: "#0A7D6F", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Reload</button>
            <button onClick={clearAndReload} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#1F2937", fontWeight: 600, cursor: "pointer" }}>Clear cache &amp; reload</button>
          </div>
        </div>
      </div>
    );
  }
}
