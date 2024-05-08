import nodeResolve from "@rollup/plugin-node-resolve";
import { type RollupOptions } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import { defineConfig } from "vite";

const isDev = (process.env.NODE_ENV || "development") === "development";

export default defineConfig({
  plugins: [
    nodeResolve({
      extensions: [".ts"],
      resolveOnly: [/^@repo/],
    }),
  ],
  build: {
    rollupOptions: {
      input: "src/index.ts",
      output: {
        dir: "dist",
        format: "cjs",
      },
    },
  },
});
