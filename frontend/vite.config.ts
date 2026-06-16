import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Served from the backend at any base path in production; proxied to the Bun
// server in dev. `base: "./"` keeps asset URLs relative so the SPA works no
// matter where the backend mounts it.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5317,
    fs: {
      // Allow importing from ../shared (outside the frontend root).
      allow: [".."],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4317",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
