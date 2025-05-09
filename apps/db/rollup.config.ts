import nodeResolve from "@rollup/plugin-node-resolve";
import { type RollupOptions } from "rollup";
import esbuild from "rollup-plugin-esbuild";

const isDev = (process.env.NODE_ENV || "development") === "development";

const bundle: RollupOptions = {
  input: {
    deploy: "src/deploy.ts",
    format: "src/format.ts",
    generate: "src/generate.ts",
    migrate: "src/migrate.ts",
    schema: "src/schema.ts",
  },
  output: {
    dir: "dist",
    format: "cjs",
  },
  plugins: [
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
};

export default bundle;
