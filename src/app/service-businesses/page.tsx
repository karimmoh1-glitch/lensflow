import type { Metadata } from "next";
import { VerticalPage, type Vertical } from "@/app/verticals/VerticalPage";

export const metadata: Metadata = {
  title: "Daythread for service businesses — every customer message, one inbox",
  description: "Cleaners, trainers, stylists, contractors, consultants: customers write on WhatsApp, text, email and Instagram to ask for a time. Daythread puts every request on one thread, shows who is waiting, and books the appointment from the conversation.",
  alternates: { canonical: "/service-businesses" },
  openGraph: { title: "Daythread for service businesses", description: "Every customer message on one thread, with the appointment booked from it." },
};

const SERVICE: Vertical = {
  slug: "service-businesses",
  eyebrow: "For appointment-based businesses",
  title: "Every customer message. One inbox. The appointment booked from it.",
  lede: "A regular texts to move Tuesday. A new customer asks on WhatsApp if you do Saturdays. Someone from the website form wants a quote. The work is fine; the messages are the job you didn't sign up for. Daythread does that part.",
  channels: ["whatsapp", "sms", "gmail", "instagram", "website"],
  problems: [
    { title: "Requests come from every direction", body: "WhatsApp, texts, email, Instagram, the website. Each one is a tab, and each tab is a place a customer can wait too long." },
    { title: "Rescheduling by hand", body: "\"Can we do Thursday instead?\" means checking a calendar, replying, changing the appointment, and telling whoever else needs to know." },
    { title: "The quiet ones", body: "You sent a price. Nothing came back. Without a reminder to follow up, the ones who were nearly ready go somewhere else." },
    { title: "Reminders that don't get sent", body: "No-shows cost a slot you could have filled. The reminder that would have prevented it was one more thing to remember." },
  ],
  steps: [
    { title: "One inbox for every channel", body: "Connect WhatsApp, a text number, Gmail and Instagram. Every request lands in one place, sorted so the longest wait is at the top." },
    { title: "The request, understood", body: "The service, the day they asked for, the location and any budget they mentioned are pulled out beside the conversation." },
    { title: "Book from the conversation", body: "Set your services and hours once. From any thread, pick a time; your Google or Apple Calendar busy time already counts against it." },
    { title: "Confirmations and reminders on their own", body: "An automation sends the confirmation when the booking is made and a reminder before it, in your words, on the channel they used." },
    { title: "Who needs you today", body: "Today opens with the people waiting for a reply, follow-ups due, and appointments that aren't confirmed — each with the reason." },
    { title: "Your team on the same thread", body: "With Pro, up to five people share the inbox and any conversation can be assigned to the person who should answer it." },
  ],
  faq: [
    { q: "Can customers book themselves?", a: "Yes. Every workspace has a public booking page with your services and available times, and a contact form you can put on your site. Both land in the same inbox." },
    { q: "Does it handle a customer who rebooks every few weeks?", a: "Yes. Every person keeps their conversations and bookings on one profile, whichever channel they use, so a repeat customer's history is one click away." },
    { q: "Do I need to change my phone number?", a: "No. Texting uses a dedicated business number with Pro; WhatsApp Business and your existing email connect as they are." },
    { q: "Does Daythread take payments from my customers?", a: "No. Daythread never collects money from your customers; it bills only its own subscription." },
    { q: "What does it cost?", a: "Free is $0 with two connected channels, the inbox, calendar, bookings and three automations. Pro is $20 a month; Business is $50. Cancel from Settings any time." },
  ],
  standing: "Daythread is early and honest about it: no customer logos, no invented numbers. It is being built alongside its first businesses, and support@daythread.org reaches the people building it.",
};

export default function ServiceBusinessesPage() {
  return <VerticalPage v={SERVICE} />;
}
