import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

// Copy generated 3D realistic medical device images into public directory
try {
  const brainDir = "/67028a5c-557e-4dda-a6e7-c38d348d4bd4";
  const targetDir = path.resolve(__dirname, "./public/images/scans");
  const mapping: Record<string, string> = {
    "mri_device_3d_1785595149199.png": "mri_device_3d.png",
    "ct_device_3d_1785595161284.png": "ct_device_3d.png",
    "ultrasound_device_3d_1785595172598.png": "ultrasound_device_3d.png",
    "mammography_device_3d_1785595183852.png": "mammography_device_3d.png",
    "xray_device_3d_1785595194625.png": "xray_device_3d.png",
    "petct_device_3d_1785595205523.png": "petct_device_3d.png",
  };

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  for (const [srcFile, dstName] of Object.entries(mapping)) {
    const srcPath = path.join(brainDir, srcFile);
    const dstPath = path.join(targetDir, dstName);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
} catch (e) {
  // Ignore copy error if paths are unavailable
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react-redux", "react-router-dom", "@reduxjs/toolkit"],
  },
  server: {
    port: 5174,
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
});

