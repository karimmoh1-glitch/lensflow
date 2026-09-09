import { useColorScheme } from "react-native";

/**
 * The web app's tokens (tailwind.config.ts), in both appearances. `useTheme()` is the only
 * way screens read colors, so light and dark stay complete: nothing has a color only in one.
 */
export type Palette = {
  ink: string; inkSoft: string; inkFaint: string; paper: string; card: string; border: string; borderStrong: string;
  accent: string; accentText: string; accentSoft: string; success: string; successSoft: string; successText: string;
  warning: string; warningSoft: string; warningText: string; danger: string; dangerSoft: string; dangerText: string;
  info: string; infoSoft: string; signal: string; signalSoft: string; signalText: string; white: string; bubbleIn: string; bubbleOut: string;
};

export const light: Palette = {
  ink: "#101114", inkSoft: "rgba(16,17,20,0.62)", inkFaint: "rgba(16,17,20,0.42)", paper: "#FAFAF9", card: "#FFFFFF",
  border: "rgba(16,17,20,0.09)", borderStrong: "rgba(16,17,20,0.16)",
  accent: "#C75A32", accentText: "#A8481F", accentSoft: "#F7E7DE",
  success: "#1E8E5A", successSoft: "#E3F5EC", successText: "#166B44",
  warning: "#B0740B", warningSoft: "#FBF0DA", warningText: "#8A5B08",
  danger: "#C22E2E", dangerSoft: "#FBE7E7", dangerText: "#9E2424",
  info: "#3B5FBD", infoSoft: "#E7ECFA", signal: "#3B5FBD", signalSoft: "#E7ECFA", signalText: "#2F4C9A",
  white: "#FFFFFF", bubbleIn: "#FFFFFF", bubbleOut: "#101114",
};

export const dark: Palette = {
  ink: "#F3F2EF", inkSoft: "rgba(243,242,239,0.66)", inkFaint: "rgba(243,242,239,0.45)", paper: "#111214", card: "#1A1B1F",
  border: "rgba(243,242,239,0.10)", borderStrong: "rgba(243,242,239,0.18)",
  accent: "#E0764C", accentText: "#F0A07E", accentSoft: "#3A241A",
  success: "#3FB57C", successSoft: "#153224", successText: "#7ED8A8",
  warning: "#D69A2E", warningSoft: "#3A2C12", warningText: "#F0C46E",
  danger: "#E05252", dangerSoft: "#3A1A1A", dangerText: "#F09A9A",
  info: "#7B95E8", infoSoft: "#1C2440", signal: "#7B95E8", signalSoft: "#1C2440", signalText: "#A9BAF2",
  white: "#FFFFFF", bubbleIn: "#1A1B1F", bubbleOut: "#2C4EAD",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 } as const;
export const type = {
  title: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.6 },
  heading: { fontSize: 20, fontWeight: "700" as const, letterSpacing: -0.3 },
  section: { fontSize: 17, fontWeight: "600" as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "400" as const },
  bodyMedium: { fontSize: 15, fontWeight: "500" as const },
  small: { fontSize: 13, fontWeight: "400" as const },
  micro: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.6 },
};

export function useTheme(): { c: Palette; dark: boolean } {
  const scheme = useColorScheme();
  return scheme === "dark" ? { c: dark, dark: true } : { c: light, dark: false };
}

/** Kept for the booking screens written against the first palette. */
export const colors = light;
