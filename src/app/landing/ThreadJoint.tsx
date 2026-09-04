/**
 * The page's invisible backbone, made briefly visible: a short vertical run of the thread
 * between two sections, with one node in the color of what comes next. Used sparingly.
 */
export function ThreadJoint({ tone = "signal", dark }: { tone?: "signal" | "accent" | "success"; dark?: boolean }) {
  const dot = tone === "accent" ? "bg-accent" : tone === "success" ? "bg-success" : "bg-signal";
  return (
    <div aria-hidden className={`flex flex-col items-center ${dark ? "bg-midnight" : ""}`}>
      <span className={`w-px h-10 md:h-14 ${dark ? "bg-paper/15" : "bg-ink/10"}`} />
      <span className={`w-[11px] h-[11px] rounded-full ${dot} ${dark ? "ring-[3px] ring-midnight" : "ring-[3px] ring-paper"}`} />
      <span className={`w-px h-10 md:h-14 ${dark ? "bg-paper/15" : "bg-ink/10"}`} />
    </div>
  );
}
