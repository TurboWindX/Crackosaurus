import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import { type RollupOptions } from "rollup";
import esbuild from "rollup-plugin-esbuild";

import { loadBackendConfig } from "../../packages/app-config/server";

const config = loadBackendConfig();

const isDev = (process.env.NODE_ENV || "development") === "development";

const bundle: RollupOptions = {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "cjs",
  },
  plugins: [
    replace({
      preventAssignment: true,
      PACKAGE_SERVER_CONFIG: JSON.stringify(config),
    }),
    nodeResolve({
      extensions: [".ts"],
      resolveOnly: [/^@repo/],
    }),
    esbuild({
      platform: "node",
      target: "node12",
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
