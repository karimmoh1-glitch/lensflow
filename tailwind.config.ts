import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101114",
        paper: "#FAFAF9",
        border: "rgba(16, 17, 20, 0.08)",
        accent: {
          DEFAULT: "#C75A32", // brand — used sparingly (primary actions, active states)
          text: "#A8481F", // AA-safe on white for links/emphasis text
          soft: "#F7E7DE", // tinted backgrounds
          deep: "#8A3D1F", // marketing-only: dark-section accents, gradient anchor
        },
        gold: { DEFAULT: "#E8A33D", soft: "#FCEFDA" }, // marketing-only: pairs with accent for gradients
        midnight: "#15130F", // marketing-only: warm near-black for dark sections
        success: { DEFAULT: "#1E8E5A", soft: "#E3F5EC", text: "#166B44" },
        warning: { DEFAULT: "#B0740B", soft: "#FBF0DA", text: "#8A5B08" },
        danger: { DEFAULT: "#C22E2E", soft: "#FBE7E7", text: "#9E2424" },
        info: { DEFAULT: "#3B5FBD", soft: "#E7ECFA", text: "#2E4A94" },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
      },
      fontSize: {
        // page title / section title / body / small / micro — the only sizes used in the app
        "page-title": ["1.75rem", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        "section-title": ["1.0625rem", { lineHeight: "1.3" }],
      },
      boxShadow: {
        xs: "0 1px 2px rgba(16,17,20,0.05)",
        card: "0 1px 2px rgba(16,17,20,0.04), 0 1px 1px rgba(16,17,20,0.03)",
        popover: "0 4px 16px rgba(16,17,20,0.10), 0 1px 2px rgba(16,17,20,0.06)",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        md: "8px",
        lg: "10px",
        xl: "12px",
      },
    },
  },
  plugins: [],
};
export default config;
