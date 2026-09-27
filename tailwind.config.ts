import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        anthracite: {
          DEFAULT: "#15151a",
          soft: "#1d1d24",
          line: "#2a2a33",
        },
        ecarlate: {
          DEFAULT: "#c8102e",
          soft: "#7a0f22",
          glow: "#ff4f6d",
        },
        or: {
          DEFAULT: "#c9a24b",
          soft: "#8a7136",
          glow: "#f0d089",
        },
      },
      fontFamily: {
        data: ["var(--font-data)", "system-ui", "sans-serif"],
        brand: ["var(--font-brand)", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
