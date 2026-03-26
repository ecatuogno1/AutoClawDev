import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { resolve } from "node:path";

const apiTarget = process.env.VITE_API_URL || "http://localhost:4100";

export default defineConfig({
  plugins: [TanStackRouterVite({ quoteStyle: "double" }), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/ws": {
        target: apiTarget.replace(/^http/, "ws"),
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
