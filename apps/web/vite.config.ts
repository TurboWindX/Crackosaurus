import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

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
