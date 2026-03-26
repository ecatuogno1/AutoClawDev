import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [TanStackRouterVite({ quoteStyle: "double" }), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4100",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:4100",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
