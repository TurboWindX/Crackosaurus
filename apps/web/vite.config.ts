import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { loadWebConfig } from "../../packages/app-config/web";

const config = loadWebConfig();

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: config.host.port,
  },
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
