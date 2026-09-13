import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Two faces from one family. Instrument Sans does all the work in the product: neutral,
// compact, legible at 12–14px, with a real medium weight. Instrument Serif is the editorial
// voice for the few places that should read like a publication, not an app — landing
// headlines, the founder page, a Today greeting. It has one weight on purpose: it is never
// bolded, so it can never turn into a shouting headline.
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://daythread.org";
const TITLE = "Daythread — The inbox that books your clients";
const DESCRIPTION = "Instagram DMs, texts, WhatsApp and email in one place, sorted by who is waiting, with booking in the conversation. Free to start.";

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
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
