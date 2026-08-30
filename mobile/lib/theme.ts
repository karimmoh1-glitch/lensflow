// Mirrors the web app's design tokens (tailwind.config.ts) so the mobile app reads as the
// same product, not a different one wearing the same name.
export const colors = {
  ink: "#101114",
  inkSoft: "rgba(16,17,20,0.55)",
  inkFaint: "rgba(16,17,20,0.35)",
  paper: "#FAFAF9",
  white: "#FFFFFF",
  border: "rgba(16,17,20,0.08)",
  borderStrong: "rgba(16,17,20,0.14)",
  accent: "#C75A32",
  accentText: "#A8481F",
  accentSoft: "#F7E7DE",
  success: "#1E8E5A",
  successSoft: "#E3F5EC",
  successText: "#166B44",
  warning: "#B0740B",
  warningSoft: "#FBF0DA",
  warningText: "#8A5B08",
  danger: "#C22E2E",
  dangerSoft: "#FBE7E7",
  dangerText: "#9E2424",
  info: "#3B5FBD",
  infoSoft: "#E7ECFA",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 } as const;

export const type = {
  title: { fontSize: 28, fontWeight: "700" as const, letterSpacing: -0.4 },
  section: { fontSize: 17, fontWeight: "600" as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "400" as const },
  bodyMedium: { fontSize: 15, fontWeight: "500" as const },
  small: { fontSize: 13, fontWeight: "400" as const },
  micro: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.4 },
};
