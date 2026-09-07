import { Reveal } from "./Reveal";
import { ChannelIcon } from "./ChannelIcon";

/**
 * Who Daythread is for, and where real customer proof goes. Nothing on this page is
 * invented: PROOF is empty until a real business has agreed to be quoted, and the section
 * says so plainly. When entries exist they render as quote · name · business · one real
 * metric, in this order, with nothing else added.
 */
export const PROOF: Array<{ quote: string; name: string; business: string; metric?: string }> = [];

const FOR = [
  { title: "Solo operators", body: "Photographers, consultants, coaches, trainers — anyone whose day is conversations that turn into bookings." },
  { title: "Small studios", body: "Two to ten people answering from one place, with the right person on each thread." },
  { title: "Businesses that book", body: "If a message usually ends with a date on the calendar, Daythread was built for that message." },
];

export function Proof() {
  return (
    <div className="max-w-[1200px] mx-auto px-6">
      <Reveal className="max-w-2xl mb-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink/60 mb-4">Who it&rsquo;s for</p>
        <h2 className="font-sans font-extrabold text-[clamp(2.2rem,4.4vw,3.6rem)] leading-[0.94] tracking-[-0.045em] text-ink">Built for businesses that live in their inbox.</h2>
      </Reveal>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FOR.map((f) => (
          <div key={f.title} className="rounded-[20px] border border-border bg-white px-5 py-5">
            <div className="text-base font-extrabold text-ink">{f.title}</div>
            <p className="mt-1.5 text-sm text-ink/70 leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>

      {PROOF.length > 0 ? (
        <ul className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="From customers">
          {PROOF.map((p) => (
            <li key={p.name + p.business} className="rounded-[20px] border border-border bg-paper px-5 py-5">
              <blockquote className="text-[15px] leading-relaxed text-ink">“{p.quote}”</blockquote>
              <div className="mt-3 text-sm font-semibold text-ink">{p.name}</div>
              <div className="text-xs text-ink/65">{p.business}{p.metric ? ` · ${p.metric}` : ""}</div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-[20px] border border-dashed border-border bg-paper/60 px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex -space-x-1.5 shrink-0" aria-hidden>
            {(["instagram", "gmail", "whatsapp", "sms"] as const).map((k) => <span key={k} className="ring-2 ring-paper rounded-lg"><ChannelIcon k={k} size={26} /></span>)}
          </div>
          <p className="text-sm text-ink/70 leading-relaxed">
            <span className="font-semibold text-ink">Early access.</span> Daythread is onboarding its first businesses now. Customer stories will appear here once real customers agree to share them — nothing on this page is invented.
          </p>
        </div>
      )}
    </div>
  );
}
