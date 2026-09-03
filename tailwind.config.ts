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
          DEFAULT: "#F0524D", // brand — bold coral-red, used everywhere: buttons, badges, emphasis
          text: "#C13530", // AA-safe on white for links/emphasis text
          soft: "#FCE6E5", // tinted backgrounds
          deep: "#A32925", // marketing-only: dark-section accents
        },
        spark: "#13CC78", // marketing-only: second energetic accent (feature highlights, stats)
        midnight: "#0E0D0B", // marketing-only: true near-black canvas for dark sections
        graphite: {
          DEFAULT: "#1C1A17", // marketing-only: card/panel surface on midnight
          border: "rgba(250,250,249,0.08)", // marketing-only: hairline border on dark surfaces
        },
        // Daythread's second signature color — reserved for "the system is working" moments:
        // data entering the product, AI, connection/motion energy. Terracotta stays the warm,
        // human, primary-action color; violet is the intelligence/motion color. Two colors,
        // used with intent, is what makes a brand recognizable — not a bigger palette.
        signal: {
          DEFAULT: "#6D5AE6",
          soft: "#EEEBFC",
          text: "#5642C9",
        },
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
