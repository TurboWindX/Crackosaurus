import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    //   https: {
    //     key: fs.readFileSync("dev.key"),
    //     cert: fs.readFileSync("dev.crt")
    //   }
  },
  plugins: [react()],
});
