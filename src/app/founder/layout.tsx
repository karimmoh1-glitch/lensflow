import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import { person, hero } from "@/content/founder/profile";
import "./founder.css";

// Three faces, each with one job, scoped to this profile so the rest of Daythread keeps its own
// type: Instrument Serif for display (one weight, never bolded), Instrument Sans for reading,
// IBM Plex Mono for indices and metadata.
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--fp-serif", display: "swap" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--fp-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--fp-mono", display: "swap" });

const title = `${person.name} — ${hero.line.join(" ")}`;

export const metadata: Metadata = {
  title: { absolute: title },
  description: person.description,
  alternates: { canonical: person.path },
  authors: [{ name: person.name }],
  openGraph: {
    type: "profile",
    firstName: person.givenName,
    lastName: person.familyName,
    title,
    description: person.description,
    url: person.path,
    siteName: "Daythread",
  },
  twitter: { card: "summary_large_image", title, description: person.description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#F2F0EB" };

export default function FounderLayout({ children }: { children: React.ReactNode }) {
  return <div className={`fp ${serif.variable} ${sans.variable} ${mono.variable}`}>{children}</div>;
}
