import type { MetadataRoute } from "next";

/** Installable on a phone: Add to Home Screen opens straight into the dashboard, full
 * screen, in the product's own colors. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daythread",
    short_name: "Daythread",
    description: "Every message from every channel, in one inbox.",
    start_url: "/dashboard/inbox",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAFAF9",
    theme_color: "#FFFFFF",
    icons: [
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/pwa-icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
