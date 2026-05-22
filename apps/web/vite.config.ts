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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@xterm")) return "xterm";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("react-markdown") || id.includes("remark-gfm")) {
            return "markdown";
          }
          if (id.includes("lexical") || id.includes("@lexical")) {
            return "lexical";
          }
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("lucide-react")
          ) {
            return "react-vendor";
          }
          if (
            id.includes("@base-ui") ||
            id.includes("class-variance-authority") ||
            id.includes("tailwind-merge")
          ) {
            return "ui-vendor";
          }
          return "vendor-misc";
        },
      },
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
