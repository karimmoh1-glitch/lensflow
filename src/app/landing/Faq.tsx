import { Reveal } from "./Reveal";

/**
 * The questions people actually ask before connecting a channel. Short, honest answers —
 * nothing here claims more than the product does. Native <details> so it works without
 * JavaScript, is keyboard-accessible, and reads correctly to a screen reader. The same
 * questions and answers feed the FAQPage structured data on the home page.
 */
export const FAQ: Array<{ q: string; a: string }> = [
  { q: "What is Daythread?", a: "One inbox for every customer conversation — Instagram, Gmail, WhatsApp, texts and your contact form — with the calendar, bookings, automations and an assistant built around it." },
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
  { q: "What is the difference between Free, Pro and Business?", a: "Free is the inbox for one person with two connected channels or calendars. Pro ($20/month) adds every channel, AI summaries and drafts, unlimited automations and the assistant. Business ($50/month) adds a shared inbox for up to ten people, assignment and higher limits." },
  { q: "Can I use Daythread with my team?", a: "On Business, yes: everyone works from the same inbox, any conversation can be assigned to the person who should answer it, and partners can be handed bookings." },
  { q: "How does the subscription work?", a: "You start free with no card. Upgrading is a monthly subscription billed through Stripe; you can change or cancel it any time from Settings → Subscription. Daythread never collects payments from your customers." },
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
