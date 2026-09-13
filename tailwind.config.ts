import type { Config } from "tailwindcss";

/**
 * Daythread design tokens (system v2). The rules behind them are in docs/design/SYSTEM.md;
 * this file is the only place a color, radius, shadow or type size is defined.
 *
 * Color has jobs, not moods:
 *   ink / paper / border  the neutral foundation — almost every pixel
 *   accent (coral)        the brand: the logo, the one conversion button, "waiting on you"
 *   signal (indigo)       Daythread's understanding: intent, a suggested next step
 *   booking (teal)        a booked session: calendar blocks, booking status
 *   success/warning/danger/info  state, never decoration
 * Provider colors (Instagram, WhatsApp…) live only inside the small provider marks.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16171A",
        paper: "#F6F6F4",
        canvas: "#FFFFFF",
        midnight: "#111214", // the one dark surface: the auth panel and the closing marketing band
        border: "rgba(22, 23, 26, 0.09)",
        "border-strong": "rgba(22, 23, 26, 0.16)",
        accent: {
          DEFAULT: "#E8504A",
          text: "#B8342F", // AA on white
          strong: "#C93E39", // carries white text at 4.5:1
          soft: "#FBEAE9",
          deep: "#9F2A26",
        },
        signal: {
          DEFAULT: "#4F57D6",
          soft: "#EEEFFC",
          text: "#3C43B0",
          line: "rgba(79, 87, 214, 0.28)",
        },
        booking: {
          DEFAULT: "#138576",
          soft: "#E3F3F0",
          text: "#0D6B5F",
        },
        success: { DEFAULT: "#1F8A58", soft: "#E4F4EB", text: "#17693F" },
        warning: { DEFAULT: "#B26F0C", soft: "#FBF1DE", text: "#8A5608" },
        danger: { DEFAULT: "#C63232", soft: "#FBE9E9", text: "#A02727" },
        info: { DEFAULT: "#3D63C4", soft: "#E8EEFA", text: "#2F4D99" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      // App type scale: page-title 22 · section-title 14 · body 14 (text-sm) · 13 (text-13) for
      // dense rows and controls · 12 (text-xs) for meta · 11 (text-2xs) only for counts and
      // tags. Marketing and editorial sizes are the `display-*` steps, set in the serif.
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.005em" }],
        "13": ["0.8125rem", { lineHeight: "1.25rem" }],
        sm: ["0.875rem", { lineHeight: "1.375rem" }],
        "page-title": ["1.375rem", { lineHeight: "1.75rem", letterSpacing: "-0.015em" }],
        "section-title": ["0.875rem", { lineHeight: "1.375rem", letterSpacing: "-0.003em" }],
        "display-sm": ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        "display-md": ["2.5rem", { lineHeight: "1.08", letterSpacing: "-0.015em" }],
        "display-lg": ["3.5rem", { lineHeight: "1.02", letterSpacing: "-0.02em" }],
        "display-xl": ["4.5rem", { lineHeight: "0.98", letterSpacing: "-0.025em" }],
      },
      // Flat by default. A hairline separates; a shadow means "this floats above the page".
      boxShadow: {
        xs: "0 1px 2px rgba(22,23,26,0.05)",
        surface: "0 1px 2px rgba(22,23,26,0.04)",
        card: "0 1px 2px rgba(22,23,26,0.04)",
        "elev-1": "0 1px 2px rgba(22,23,26,0.04)",
        "elev-2": "0 1px 2px rgba(22,23,26,0.04), 0 8px 24px -16px rgba(22,23,26,0.25)",
        "elev-3": "0 20px 48px -24px rgba(22,23,26,0.35), 0 2px 6px rgba(22,23,26,0.06)",
        popover: "0 6px 20px -4px rgba(22,23,26,0.14), 0 0 0 1px rgba(22,23,26,0.06)",
        overlay: "0 24px 56px -16px rgba(22,23,26,0.28), 0 0 0 1px rgba(22,23,26,0.06)",
      },
      // Small, consistent corners. Tags 4 · controls 6 · menus and panels 8 · dialogs 12.
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
        "3xl": "12px",
        "4xl": "12px",
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
