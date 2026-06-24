import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./utils/theme";
import { installNativeNetworkShim, bootNative, isNative } from "./native/bridge";

// Native shell only: route relative /api,/tis,/ws calls to the production origin.
// No-op on the web. Must run before render so the first request is absolutized.
installNativeNetworkShim();

initTheme(); // keep theme-color + 'system' OS-changes in sync (boot script set the attribute pre-paint)

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Native shell only: hide splash after first paint, theme the status bar, wire
// the Android hardware back button. No-op on the web.
bootNative();

// Register the service worker for app-shell offline load (cold open with no
// signal) + Web Push. Navigation is network-first in the SW, so deploys are
// never served stale; offline falls back to the cached shell. Skipped in the
// native shell — Capacitor serves the bundled assets and the SW's network-first
// nav fetch can fight the native WebView's local scheme.
if ("serviceWorker" in navigator && !isNative()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* non-blocking */ });
  });
}
