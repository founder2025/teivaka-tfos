import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// One id per build — written to dist/version.json and baked into the app so a
// long-open tab can detect a newer deploy and prompt a refresh (no service worker).
const BUILD_ID = String(Date.now());

function emitVersion() {
  let outDir = "dist";
  return {
    name: "tfos-version",
    apply: "build",
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      try {
        writeFileSync(resolve(outDir, "version.json"), JSON.stringify({ build: BUILD_ID }));
      } catch (e) {
        this.warn?.(`version.json not written: ${e}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), emitVersion()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
});
