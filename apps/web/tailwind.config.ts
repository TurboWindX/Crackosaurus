import type { Config } from "tailwindcss";

import sharedConfig from "@repo/tailwind-config";

const config: Pick<Config, "content" | "presets" | "theme"> = {
  content: ["./src/**/*.tsx"],
  presets: [sharedConfig],
  theme: {
    extend: {
      keyframes: {
        // Lower jaw hinges open then snaps shut — the "chomp".
        chomp: {
          "0%, 100%": { transform: "rotate(3deg)" },
          "50%": { transform: "rotate(20deg)" },
        },
        // Seamless conveyor of hashes flowing into the mouth. The track holds
        // two identical copies, so translating by -50% loops without a seam.
        "hash-flow": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        // A cracked plaintext pops up over the dino, holds, then floats away.
        "crack-pop": {
          "0%, 55%": { opacity: "0", transform: "translateY(10px) scale(0.8)" },
          "65%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "85%": { opacity: "1", transform: "translateY(-2px) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(-12px) scale(0.9)" },
        },
        // Gentle idle bob for the whole head.
        "float-y": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
      animation: {
        chomp: "chomp 1.1s ease-in-out infinite",
        "hash-flow": "hash-flow 14s linear infinite",
        "crack-pop": "crack-pop 4.2s ease-in-out infinite",
        "float-y": "float-y 3.5s ease-in-out infinite",
      },
    },
  },
};

export default config;
