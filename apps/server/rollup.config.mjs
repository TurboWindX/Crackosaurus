import nodeResolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";
import json from "@rollup/plugin-json";

export default {
    input: "src/index.ts",
    output: {
        dir: "dist",
        format: "cjs"
    },
    plugins: [
        json(),
        nodeResolve({
            extensions: [".ts"],
            resolveOnly: [/^@repo/]
        }),
        esbuild({
            platform: "node",
            target: "node12",
            include: [/.ts/],
            minify: true
        })
    ]
}
