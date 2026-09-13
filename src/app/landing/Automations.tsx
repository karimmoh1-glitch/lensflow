import type { CSSProperties } from "react";
import { AUTOMATION_RECIPES } from "@/lib/automationRecipes";
import { TemplatePreview } from "@/components/TemplatePreview";
import { ScrollScene } from "./Scroll";
import { Reveal } from "./Reveal";

/**
 * What runs by itself once a client is booked, drawn from the product's own recipes — the
 * real templates, the real timing. Scrolling draws the line through a booking's life and
 * lights each message as it would go out. The one honest boundary is stated: only an
 * automation you switched on sends by itself; replies and drafts wait for you.
 */
const STEPS: Array<{ key: string; when: string; note: string }> = [
  { key: "confirm", when: "The moment you book them", note: "Sent on the channel they wrote from." },
  { key: "remind", when: "The day before", note: "Fewer no-shows, no calendar reminder for you to set." },
  { key: "thanks", when: "A day after the session", note: "While it's still fresh." },
  { key: "quiet", when: "If a lead goes quiet for 3 days", note: "The follow-up you'd forget on a busy week." },
];

export function Automations() {
  const business = "Alex Rivera Photography";
  return (
    <div className="max-w-[1200px] mx-auto px-6">
      <Reveal className="max-w-2xl">
        <h2 className="font-serif font-normal text-[clamp(2.4rem,4.8vw,3.9rem)] leading-[1.02] tracking-[-0.012em] text-ink text-balance">Switched on once. Runs every time.</h2>
        <p className="mt-4 text-[1.0625rem] text-ink/60 leading-relaxed">You book the client. Daythread sends the messages every booking needs, each one written into the thread.</p>
      </Reveal>

      <ScrollScene span="enter" settle={0.25} className="relative mt-12 md:mt-16">
        {/* The line through a booking's life: drawn by the scroll, top to bottom on a phone, left to right on a wide screen. */}
        <span aria-hidden className="dt-draw-y lg:hidden absolute left-[11px] top-3 bottom-3 w-px bg-ink/20" />
        <span aria-hidden className="dt-draw-x hidden lg:block absolute left-[12.5%] right-[12.5%] top-[11px] h-px bg-ink/20" />
        <ol className="grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-6">
          {STEPS.map((s, i) => {
            const recipe = AUTOMATION_RECIPES.find((r) => r.key === s.key)!;
            const a = 0.12 + i * 0.18;
            return (
              <li key={s.key} className="dt-step relative pl-9 lg:pl-0" style={{ "--a": a, "--b": a + 0.14, "--dy": "18px" } as CSSProperties}>
                <span aria-hidden className="absolute left-0 top-0 lg:static w-[23px] h-[23px] rounded-full bg-paper border border-ink/15 flex items-center justify-center lg:mx-auto">
                  <span className={i === 0 ? "w-2 h-2 rounded-full bg-accent" : "w-2 h-2 rounded-full bg-ink"} />
                </span>
                <div className="lg:mt-5 lg:text-center">
                  <p className="text-[15px] font-semibold text-ink tracking-[-0.01em]">{s.when}</p>
                  <p className="mt-0.5 text-13 text-ink/60">{s.note}</p>
                </div>
                <div className="mt-4 rounded-xl border border-border bg-white shadow-elev-2 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-13 font-semibold text-ink">{recipe.label}</p>
                    <span aria-hidden className="w-8 h-[18px] rounded-full bg-ink relative shrink-0">
                      <span className="absolute right-0.5 top-0.5 w-[14px] h-[14px] rounded-full bg-white" />
                    </span>
                  </div>
                  <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-13 text-ink/75 leading-relaxed">
                    <TemplatePreview text={recipe.input.messageTemplate} businessName={business} />
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </ScrollScene>

      <p className="mt-8 text-13 text-ink/60 max-w-2xl">Only an automation you switch on sends by itself. Replies and drafts wait for your approval, and the wording of every message is yours to change.</p>
    </div>
  );
}
