import { Reveal } from "./Reveal";

/**
 * The questions people actually ask before connecting a channel. Short, honest answers —
 * nothing here claims more than the product does. Native <details> so it works without
 * JavaScript, is keyboard-accessible, and reads correctly to a screen reader. The same
 * questions and answers feed the FAQPage structured data on the home page.
 */
export const FAQ: Array<{ q: string; a: string }> = [
  { q: "What is Daythread?", a: "One inbox for every customer conversation — Instagram, Gmail, WhatsApp, texts and your contact form — with the calendar, bookings, automations and an assistant built around it." },
  { q: "Who is Daythread for?", a: "People whose day is customer conversations that turn into appointments: photographers, consultants, coaches, trainers, planners, small studios. If a message usually ends with a date on the calendar, it was built for that message." },
  { q: "How is this different from HoneyBook or Dubsado?", a: "Those are built around projects, proposals and getting paid, and they do that well. Daythread is built around the conversation: every channel in one inbox, and the calendar, bookings, automations and an assistant attached to the thread. Daythread never collects your customers' payments — if you need invoicing, keep the tool you use for it." },
  { q: "How is this different from Front or a shared inbox?", a: "A shared inbox is a place to answer. Daythread is a place to act: the thread knows who the person is, what they asked for and what's open on your calendar, so a message becomes a booking, a follow-up or an assignment without leaving it. It's sized for one person or a small team, not a support department." },
  { q: "Why not just Gmail, Instagram, WhatsApp and a calendar?", a: "Because none of them know what the message is. Daythread reads that \"are you free Friday?\" is a booking request, checks your availability, books it from the thread, sends the confirmation on the same channel and remembers it all next time they write." },
  { q: "Do I need to change my email address or phone number?", a: "No. You connect the Gmail, Instagram and WhatsApp accounts you already have, and replies go out from them. SMS is the one addition: Pro gives you a dedicated text number inside Daythread, alongside your own." },
  { q: "Which channels can I connect?", a: "Gmail, Instagram DMs, WhatsApp, SMS (a text number), and a contact form you can embed on your website. Google Calendar and Apple Calendar connect too, so busy time counts against your availability." },
  { q: "Does Daythread replace my existing inboxes?", a: "No. Your Gmail, Instagram and WhatsApp keep working exactly as before. Daythread reads new messages from them and sends your replies back through the same channel, so the person sees a normal reply from you." },
  { q: "How does the unified inbox work?", a: "Each connected channel delivers new messages to Daythread. They land in one list, sorted by who is waiting on you, with the sender, the channel, what they asked for and your history with them beside the thread." },
  { q: "Can I connect Gmail?", a: "Yes. You sign in with Google and grant Gmail access; Daythread reads new mail and sends replies from your address. Newsletters, receipts and automated mail are kept out of the way." },
  { q: "Can I connect Instagram, WhatsApp and SMS?", a: "Yes. Instagram uses a professional account, WhatsApp uses a WhatsApp Business number, and SMS gives you a text number inside Daythread. Each is connected from Settings → Channels." },
  { q: "Does Daythread include a calendar?", a: "Yes — a day, week and month calendar with your bookings, your working hours and busy time from Google or Apple Calendar. Bookings can be made straight from a conversation." },
  { q: "Can Daythread automate repetitive work?", a: "Yes. Automations send booking confirmations, reminders, thank-yous and follow-ups on the channel the person wrote from. Each one is a sentence you can read: when this happens, if this, then do that." },
  { q: "What does the assistant do?", a: "It reads what is happening — who is waiting, what isn't confirmed, who went quiet — and proposes the next action with the message already written. You can also ask it questions about your own inbox, calendar and customers." },
  { q: "Does AI send messages automatically?", a: "No. The assistant proposes; you approve. Only automations you switched on send anything on their own, and every send is recorded in the thread." },
  { q: "What happens to my data?", a: "Your messages, contacts and bookings belong to you and are used only to run your inbox. Channel credentials are stored encrypted. Daythread never sells data, and AI features only see the conversation they are helping with." },
  { q: "What happens if I disconnect a channel?", a: "Daythread stops reading and sending on it immediately and revokes its access at the provider. The conversations you already have stay in your inbox unless you delete them." },
  { q: "What is the difference between Free, Pro and Business?", a: "Free: you can manage your inbox — two connected channels, one person. Pro ($20/month): Daythread helps you manage your work — every channel, a text number, AI summaries and drafts, the assistant, unlimited automations, and up to five people on the same inbox. Business ($50/month): Daythread helps run the business — the view across everyone's work every morning, an assistant with three times the capacity, up to ten people with roles and internal notes, and priority support." },
  { q: "Can I use Daythread with my team?", a: "Yes, on Pro and Business. Everyone works from the same inbox, any conversation can be assigned to the person who should answer it, and partners can be handed bookings. Pro seats up to five people; Business up to ten, with roles and internal notes." },
  { q: "When am I charged?", a: "Free: never. Pro trial: a card is taken at the start, nothing is charged for 7 days, and the first charge and its date are shown before you confirm. After that, monthly or yearly on the same day of the period, with the next date always visible under Settings → Subscription." },
  { q: "What happens if I downgrade?", a: "You keep the higher plan until the end of the period you paid for. Then the workspace moves to the lower plan: everything stays, and anything past the new limits — extra channels, automations beyond three, extra people — is paused, never deleted, until you trim it or upgrade again." },
  { q: "How does the subscription work?", a: "You start free with no card. Pro comes with a 7-day trial — a card is required, nothing is charged for 7 days, and the first charge date is shown before you confirm. Billing is monthly or yearly (two months free) through Stripe; change or cancel any time from Settings → Subscription and you keep the plan until the period ends. Daythread never collects payments from your customers." },
  { q: "What happens when my trial ends?", a: "If you keep Pro, the first charge lands on the date shown when you started — no surprise. If you cancel before then, nothing is charged and your workspace goes back to Free: everything stays, and anything past Free's limits is paused, never deleted." },
  { q: "What happens if I cancel?", a: "You keep your plan until the end of the period you paid for, then the workspace goes back to Free. Your conversations, contacts, bookings and automations stay; anything past Free's limits pauses until you upgrade again or trim it." },
  { q: "Can I delete my account?", a: "Yes. Settings → Profile deletes the whole workspace — people, conversations, messages, bookings, automations, connected-account credentials — and revokes every channel connection at the provider." },
  { q: "Does the AI read everything?", a: "AI features only see the conversation they are helping with, plus your services and hours for a draft. Nothing is used to train anything, and customer text is treated as untrusted: it can never instruct the assistant to do something." },
  { q: "Can I use Daythread without AI?", a: "Yes. The inbox, calendar, bookings, automations and team work without AI. On Free, summaries and next steps come from rules, not a model; the assistant's proposals are part of Pro, and every one of them still needs your approval." },
];

export function Faq() {
  return (
    <div className="max-w-[880px] mx-auto px-6">
      <Reveal className="mb-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/65 mb-4">Questions</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.2rem,4.4vw,3.6rem)] leading-[0.94] tracking-[-0.045em] text-ink">Before you connect anything.</h2>
      </Reveal>
      <div className="divide-y divide-border border-y border-border">
        {FAQ.map((item) => (
          <details key={item.q} className="group py-1">
            <summary className="flex items-center justify-between gap-6 cursor-pointer list-none py-4 text-[15px] md:text-base font-semibold text-ink rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 [&::-webkit-details-marker]:hidden">
              <span>{item.q}</span>
              <span aria-hidden className="relative w-5 h-5 shrink-0 text-ink/65">
                <span className="absolute inset-x-0 top-1/2 h-[1.5px] -translate-y-1/2 bg-current" />
                <span className="absolute inset-y-0 left-1/2 w-[1.5px] -translate-x-1/2 bg-current transition-transform duration-200 group-open:scale-y-0" />
              </span>
            </summary>
            <p className="pb-5 pr-10 text-[15px] leading-relaxed text-ink/70">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
