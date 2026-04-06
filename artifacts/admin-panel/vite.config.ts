import "dotenv/config";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Default the dev port and base path so the local dev server can start
// even when environment variables are not provided.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      "react": path.resolve(import.meta.dirname, "../../node_modules/react"),
      "react-dom": path.resolve(import.meta.dirname, "../../node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      // Proxy API requests to the backend server.
      "/api": {
        target: process.env.VITE_API_BASE_URL || "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/api"),
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
