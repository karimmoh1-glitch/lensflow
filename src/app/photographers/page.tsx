import type { Metadata } from "next";
import { VerticalPage, type Vertical } from "@/app/verticals/VerticalPage";

export const metadata: Metadata = {
  title: "Daythread for photographers — stop losing leads in your inbox",
  description: "Wedding, portrait and event inquiries arrive on Instagram, Gmail, WhatsApp and your contact form. Daythread puts them on one thread, tells you who is waiting, and turns the reply into a booking on your calendar.",
  alternates: { canonical: "/photographers" },
  openGraph: { title: "Daythread for photographers", description: "Stop losing photography leads in your inbox. Every inquiry on one thread, with the reply, the follow-up and the booking ready." },
};

const PHOTOGRAPHERS: Vertical = {
  slug: "photographers",
  eyebrow: "For photographers and videographers",
  title: "Stop losing photography leads in your inbox.",
  lede: "A couple asks about a June wedding on Instagram. A brand emails about a shoot. Someone texts for a family session. By Thursday two of them have gone quiet and you're not sure which. Daythread was built with a working photographer around exactly that week.",
  channels: ["instagram", "gmail", "whatsapp", "sms", "website"],
  problems: [
    { title: "Inquiries arrive everywhere", body: "Instagram DMs, email, WhatsApp, texts, the form on your site. Five places to check, and the one you forgot is the one that mattered." },
    { title: "The details are buried", body: "The date, the venue, the package they asked about, the budget they mentioned — all in a message you'd have to scroll back to find." },
    { title: "Follow-ups slip", body: "You replied with a quote. They didn't answer. A week later it's awkward to write again, so you don't, and they book someone else." },
    { title: "Bookings live somewhere else", body: "The conversation is in one app, availability in another, the booking in a third. Confirmations are typed by hand — or forgotten." },
  ],
  steps: [
    { title: "Every inquiry, one thread", body: "Connect Instagram, Gmail, WhatsApp or a text number. Every message lands in one inbox, sorted so the person waiting longest is at the top. Newsletters and notifications are kept out of the way." },
    { title: "What they asked, pulled out", body: "The date, the location, the service and the budget from the message sit beside the thread — read from what they wrote, never guessed." },
    { title: "Who needs you, and why", body: "Today opens with the people waiting for a reply, the follow-ups that are due, and the bookings that aren't confirmed yet. Each line says the rule it rests on." },
    { title: "Follow up without the awkwardness", body: "Set a follow-up on anyone. When the day comes they're back on Today. If they write first, the reminder clears itself." },
    { title: "Book them from the thread", body: "Your services and hours are in Settings once. From any conversation, put a time on the calendar; Google and Apple Calendar busy time counts against your availability." },
    { title: "Confirmations and reminders, sent for you", body: "Automations send the confirmation when a booking is made and the reminder the day before, in your words. With Pro, an assistant drafts replies from the real thread for you to approve." },
  ],
  faq: [
    { q: "Does it work for weddings and events, not just sessions?", a: "Yes. A booking is a service with a duration and a price — a 30-minute mini session or an eight-hour wedding. Your availability and buffer times apply to both." },
    { q: "I get most inquiries on Instagram. Is that really supported?", a: "Instagram DMs to a professional account connect through Meta's own sign-in, and replies go back out from Daythread. On this deployment, each channel is switched on as its provider credentials are configured — the Status page shows what's live." },
    { q: "Do I have to move my calendar?", a: "No. Connect Google or Apple Calendar and existing events count as busy time. Bookings made in Daythread show up on your calendar too." },
    { q: "Can my second shooter or editor use it?", a: "Pro puts up to five people on the same inbox with assignment; Business seats ten and adds internal notes and roles." },
    { q: "Is there a contract or a card to start?", a: "No. Free is free and stays free. Pro is $20 a month, cancel any time from Settings; when a 7-day trial is offered, the first charge date is shown before you start." },
    { q: "Do you take a cut of my bookings?", a: "Never. Daythread doesn't collect payments from your clients at all. The only thing it bills is its own subscription." },
  ],
  standing: "Daythread is early. It's being built with a working photographer who lost six leads in a month to exactly this problem; there is no customer list to show you yet, and we won't invent one. If that's your problem too, start free and tell us what's wrong — support@daythread.org reaches the people building it.",
};

export default function PhotographersPage() {
  return <VerticalPage v={PHOTOGRAPHERS} />;
}
