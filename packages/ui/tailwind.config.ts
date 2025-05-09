import type { Config } from "tailwindcss";

import sharedConfig from "@repo/tailwind-config";

const config: Pick<Config, "prefix" | "presets" | "content" | "corePlugins"> = {
  content: ["./src/**/*.tsx"],
  presets: [sharedConfig],
  prefix: "ui-",
  corePlugins: {
    preflight: false,
  },
};

export default config;
