import nodeResolve from "@rollup/plugin-node-resolve";
import { type RollupOptions } from "rollup";
import esbuild from "rollup-plugin-esbuild";

const isDev = (process.env.NODE_ENV || "development") === "development";

const bundle: RollupOptions = {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "cjs",
  },
  external: ["aws-sdk"], // Don't bundle aws-sdk, it will be installed on EC2
  plugins: [
    nodeResolve({
      extensions: [".ts"],
    }),
    esbuild({
      platform: "node",
      target: "node12",
      include: [/.ts/],
      legalComments: isDev ? undefined : "none",
      sourceMap: isDev,
      minify: !isDev,
    }),
  ],
  watch: {
    clearScreen: false,
  },
};

export default bundle;
