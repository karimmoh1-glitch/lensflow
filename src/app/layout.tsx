import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// One type family, deliberately. Inter is the most generic SaaS body font there is, and
// Playfair Display as the wordmark read as a wedding-photography studio — exactly the
// vertical the product is NOT limited to. Manrope is geometric but warm, and carries
// weights 500–800 well enough to do both the body and the display job; both CSS
// variables point at it so every existing font-display/font-sans site moves together.
const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Manrope({ subsets: ["latin"], variable: "--font-display", display: "swap" });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://daythread.org";
const TITLE = "Daythread — Every message. One inbox.";
const DESCRIPTION = "Instagram, Gmail, WhatsApp and texts in one inbox, sorted so the people waiting on you come first. Free to start.";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: TITLE, template: "%s · Daythread" },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Daythread",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
