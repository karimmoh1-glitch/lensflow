import { RevealOnScroll } from "../RevealOnScroll";

/**
 * Before / after, in type. No illustration needed: the left column is the list every
 * independent business already keeps in their head; the right is what they actually want
 * to know. The contrast is the argument.
 */
export function Outcome() {
  return (
    <div className="max-w-6xl mx-auto px-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-start">
        <RevealOnScroll>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink/40 mb-6">Before</p>
          <p className="font-sans font-extrabold text-[clamp(2rem,4.4vw,3.6rem)] leading-[1.02] tracking-[-0.04em] text-ink/30">
            Instagram.<br />Gmail.<br />Texts.<br />Calendar.<br />Venmo.<br />A notes app.<br />Your head.
          </p>
        </RevealOnScroll>
        <RevealOnScroll delay={140}>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-signal-text mb-6">After</p>
          <p className="font-sans font-extrabold text-[clamp(2rem,4.4vw,3.6rem)] leading-[1.02] tracking-[-0.04em] text-ink">
            Who needs you.<br />What&rsquo;s happening.<br />What to do.<br />What&rsquo;s making money.
          </p>
        </RevealOnScroll>
      </div>
    </div>
  );
}
