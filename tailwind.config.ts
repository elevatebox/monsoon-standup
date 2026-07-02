import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light, minimal: airy near-white paper, soft ink, one calm blue accent.
        paper: "#FBFBFA",
        surface: "#FFFFFF",
        ink: "#2F2E2B",
        muted: "#6F6E6A",
        faint: "#A6A5A0",
        hair: "#ECECEA",
        accent: "#3E9E76", // soft green, for primary actions
        accentSoft: "#E7F4EE",
        // Status colors kept gentle but still readable at a glance.
        track: "#4E8E6E",
        trackSoft: "#EEF5F1",
        slip: "#C68A3C",
        slipSoft: "#FAF3E8",
        block: "#CF5A54",
        blockSoft: "#FBEEED",
        idle: "#8C8B87",
        idleSoft: "#F3F3F1",
        info: "#3B82F6", // blue, for the "in progress" status
        infoSoft: "#E8F1FE",
        plum: "#7C5CBF", // violet, for the Dev track
        plumSoft: "#EFEAF8",
      },
      fontFamily: {
        // Poppins for UI text, EB Garamond for display headings (font-serif),
        // mono for the small data labels.
        sans: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-garamond)", "Georgia", "Cambria", "serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      borderRadius: {
        xl: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
