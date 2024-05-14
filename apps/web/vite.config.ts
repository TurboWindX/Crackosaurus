import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { loadWebConfig } from "../../packages/app-config/web";

const config = loadWebConfig();

export default defineConfig({
  clearScreen: false,
  server: {
    port: config.host.port,
  },
  plugins: [react()],
  define: {
    PACKAGE_WEB_CONFIG: config,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("node_modules") ? "vendor" : undefined,
      },
    },
  },
});
