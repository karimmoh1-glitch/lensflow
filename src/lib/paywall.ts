/**
 * Contextual upgrade moments. Each entry is the copy for the exact thing someone reached
 * for: what it does, what they unlock, which plan has it. Client-safe (no server imports)
 * so the paywall dialog and the analytics both key on the same feature ids.
 */
export type PaywallFeature = "channels" | "sms" | "ai_draft" | "ai_summary" | "assistant" | "automations" | "team" | "intelligence";

export const PAYWALLS: Record<PaywallFeature, { plan: "PRO" | "BUSINESS"; eyebrow: string; title: string; lede: string; bullets: string[] }> = {
  channels: {
    plan: "PRO",
    eyebrow: "Your inbox is ready for more",
    title: "Connect everything.",
    lede: "Free includes two connected channels or calendars. Pro connects every place your customers write from — and both calendars.",
    bullets: ["Gmail, Instagram, WhatsApp and SMS on one thread", "Google and Apple Calendar busy time in your availability", "A dedicated text number", "AI summaries and reply drafts on every thread"],
  },
  sms: {
    plan: "PRO",
    eyebrow: "Text from your own number",
    title: "Give your inbox a phone number.",
    lede: "Pro gives your business a dedicated text number. Texts land in the same thread as everything else, and replies go out from it.",
    bullets: ["Your own number, inside Daythread", "Confirmations and reminders by text", "Delivery states on every message", "The same thread as email, Instagram and WhatsApp"],
  },
  ai_draft: {
    plan: "PRO",
    eyebrow: "Let Daythread handle the thinking",
    title: "A reply, written from the thread.",
    lede: "Pro drafts replies from the actual conversation and your real services and prices. You edit, you send.",
    bullets: ["Drafts in your voice, from the real thread", "Understand long conversations instantly", "Surface what needs attention first", "Spend the time on the reply, not the typing"],
  },
  ai_summary: {
    plan: "PRO",
    eyebrow: "Read less, know more",
    title: "Every thread, in one sentence.",
    lede: "Pro summarizes what a conversation is about, what they asked for and where it stands — before you open it.",
    bullets: ["One sentence per thread, kept current", "The details pulled out: dates, budgets, locations", "The suggested next step", "Reply drafts to match"],
  },
  assistant: {
    plan: "PRO",
    eyebrow: "Your business has an assistant",
    title: "It proposes. You approve.",
    lede: "Pro's assistant reads who's waiting, what isn't confirmed and who went quiet, then puts the next action in front of you with the message written.",
    bullets: ["Replies, confirmations and follow-ups, ready to send", "Nothing goes out without your approval", "Ask it anything about your own inbox and calendar", "Every action recorded in the thread"],
  },
  automations: {
    plan: "PRO",
    eyebrow: "More running on its own",
    title: "Unlimited automations.",
    lede: "Free runs three automations at once. Pro runs as many as you write — confirmations, reminders, thank-yous and follow-ups on every channel.",
    bullets: ["Unlimited automations, switched on together", "Every send recorded in the thread", "Never the same message twice", "Edit the words any time"],
  },
  team: {
    plan: "PRO",
    eyebrow: "Work together without leaving the inbox",
    title: "Bring your team in.",
    lede: "Pro puts up to five people on the same inbox. Everyone sees the same conversations; any thread can be assigned to the person who should answer it.",
    bullets: ["Up to 5 people on one shared inbox", "Assign conversations", "Hand bookings to a partner", "Business: up to 10 people, roles and internal notes"],
  },
  intelligence: {
    plan: "BUSINESS",
    eyebrow: "Daythread runs the business with you",
    title: "See the whole business every morning.",
    lede: "Business adds the view across everyone's work — what's at risk, who owns what, what to do first — and an assistant with three times the capacity.",
    bullets: ["Business-wide view on the Today page", "Up to 10 people, roles and internal notes", "60 approved assistant actions an hour", "Priority support"],
  },
};
