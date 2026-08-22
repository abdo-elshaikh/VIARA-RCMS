import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react-redux", "react-router-dom", "@reduxjs/toolkit"],
  },
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3000",
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          proxy.on("error", (err: any) => {
            if (err && (err.code === "ECONNRESET" || err.code === "ECONNREFUSED")) return;
            console.warn("[vite proxy error]", err?.message || err);
          });
        },
      },
    },
  },
  plugins: [
    react(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          state: ["@reduxjs/toolkit", "react-redux"],
          forms: ["react-hook-form", "zod"],
          motion: ["framer-motion"],
          documents: ["docx"],
        },
      },
    },
  },
});

