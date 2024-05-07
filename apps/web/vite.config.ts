import react from "@vitejs/plugin-react";
import { defineConfig, splitVendorChunkPlugin } from "vite";

import config from "./src/config";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: config.host.port,
  },
  plugins: [react(), splitVendorChunkPlugin()],
});
