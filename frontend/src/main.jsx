import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./utils/theme";

initTheme(); // keep theme-color + 'system' OS-changes in sync (boot script set the attribute pre-paint)

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register the service worker for app-shell offline load (cold open with no
// signal) + Web Push. Navigation is network-first in the SW, so deploys are
// never served stale; offline falls back to the cached shell.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* non-blocking */ });
  });
}
