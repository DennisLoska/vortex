import { defineConfig } from "vite";

import { assetpackPlugin } from "./scripts/assetpack-vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [assetpackPlugin()],
  server: {
    port: 8080,
    open: true,
    proxy: {
      "/api": {
        target: process.env.VITE_VORTEX_SERVER_URL || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});
