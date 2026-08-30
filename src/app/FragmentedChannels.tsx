import { MessageSquare, Mail, Phone, MessageCircle } from "lucide-react";

function CameraGlyph({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

const CHIPS = [
  { icon: CameraGlyph, bg: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5]", rotate: "-rotate-6", y: "translate-y-2" },
  { icon: MessageSquare, bg: "bg-[#3B82F6]", rotate: "rotate-3", y: "-translate-y-3" },
  { icon: Mail, bg: "bg-[#4F46E5]", rotate: "-rotate-2", y: "translate-y-4" },
  { icon: MessageCircle, bg: "bg-[#25D366]", rotate: "rotate-6", y: "-translate-y-1" },
  { icon: Phone, bg: "bg-[#0D9488]", rotate: "-rotate-3", y: "translate-y-1" },
];

export function FragmentedChannels() {
  return (
    <div className="flex items-center justify-center gap-3 md:gap-5">
      {CHIPS.map((c, i) => (
        <div key={i} className={`w-11 h-11 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-white shadow-[0_6px_16px_-4px_rgba(16,17,20,0.25)] ${c.bg} ${c.rotate} ${c.y}`}>
          <c.icon className="w-5 h-5 md:w-6 md:h-6" strokeWidth={1.9} />
        </div>
      ))}
    </div>
  );
}
