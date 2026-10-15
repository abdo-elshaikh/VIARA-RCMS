import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Open Graph requires absolute URLs, which cannot be known at authoring time.
// __VIARA_SITE_URL__ is replaced at build/dev time with the configured origin
// (empty string when unset, so meta tags stay root-relative but harmless).
// Note: a %VAR% token is avoided on purpose because Vite's built-in HTML env
// replacement would warn about it when the variable is not defined.
const siteUrlHtmlPlugin = (siteUrl: string): Plugin => ({
  name: "vite:inject-site-url",
  transformIndexHtml(html) {
    const origin = siteUrl.trim().replace(/\/+$/, "");
    return html.replace(/__VIARA_SITE_URL__/g, origin);
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
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
          target: env.API_PROXY_TARGET || "http://localhost:3000",
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
    plugins: [react(), siteUrlHtmlPlugin(env.VITE_SITE_URL || "")],
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
  };
});
