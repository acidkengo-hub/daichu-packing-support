// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      // /ws のみプロキシ（Vite自身のHMR用WebSocketと衝突しないよう厳密にマッチ）
      "^/ws$": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
});