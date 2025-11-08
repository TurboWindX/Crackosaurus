import nodeResolve from "@rollup/plugin-node-resolve";
import { type RollupOptions } from "rollup";
import esbuild from "rollup-plugin-esbuild";

const isDev = (process.env.NODE_ENV || "development") === "development";

const bundle: RollupOptions = {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es",
  },
  plugins: [
    nodeResolve({
      extensions: [".ts"],
      resolveOnly: [/^@repo/],
    }),
    esbuild({
      platform: "node",
      target: "node18",
      include: [/.ts/],
      sourceMap: isDev,
      minify: !isDev,
    }),
  ],
  watch: {
    clearScreen: false,
  },
};

export default bundle;
