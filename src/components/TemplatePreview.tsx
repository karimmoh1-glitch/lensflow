/**
 * A message template as the client will read it: the business name filled in, and every other
 * variable shown as a quiet chip naming what it becomes. Unknown variables are shown as written.
 */
const VARIABLE_LABEL: Record<string, string> = { name: "client's name", service: "service", date: "date", time: "time" };

export function TemplatePreview({ text, businessName }: { text: string; businessName: string }) {
  const parts = text.split(/(\{\{\s*[a-z]+\s*\}\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\{\{\s*([a-z]+)\s*\}\}$/);
        if (!m) return <span key={i}>{part}</span>;
        if (m[1] === "business") return <span key={i}>{businessName}</span>;
        return <span key={i} className="rounded-sm bg-ink/[0.06] px-1 text-ink/80">{VARIABLE_LABEL[m[1]] ?? m[1]}</span>;
      })}
    </>
  );
}
