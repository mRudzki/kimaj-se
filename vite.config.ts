import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: "web",
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  server: {
    fs: { allow: [resolve(__dirname)] },
    proxy: { "/api": "http://localhost:3001" },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
