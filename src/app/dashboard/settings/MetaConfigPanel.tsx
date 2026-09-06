import { Check, X, AlertTriangle, Copy } from "lucide-react";
import { metaConfigReport, type SettingReport } from "@/lib/meta/config";
import { CopyField } from "./CopyField";

/**
 * What an operator needs to see to finish the Meta setup — and nothing more.
 *
 * Every row is a *state*, never a value: "Configured", "Missing", "Invalid". No secret is
 * read into the markup, so nothing sensitive can reach the browser, appear in view-source,
 * or end up in a screenshot. The URLs shown are public by definition — they are exactly
 * what has to be pasted into the Meta App Dashboard.
 *
 * Rendered on the server, for owners only.
 */
const STATE: Record<SettingReport["state"], { label: string; className: string; icon: typeof Check }> = {
  configured: { label: "Configured", className: "text-success-text bg-success-soft", icon: Check },
  missing: { label: "Missing", className: "text-ink/55 bg-black/[0.05]", icon: X },
  invalid: { label: "Invalid", className: "text-warning-text bg-warning-soft", icon: AlertTriangle },
};

function Row({ setting }: { setting: SettingReport }) {
  const s = STATE[setting.state];
  const Icon = s.icon;
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
      <span className={`inline-flex items-center gap-1 shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] rounded-md px-1.5 py-0.5 ${s.className}`}>
        <Icon className="w-3 h-3" strokeWidth={3} aria-hidden />
        {s.label}
      </span>
      <span className="min-w-0 flex-1">
        <code className="text-[11px] font-mono text-ink/80 break-all">{setting.key}</code>
        {setting.secret && <span className="ml-1.5 text-[10px] text-ink/40">secret — never shown</span>}
        <span className="block text-[11px] text-ink/55 leading-snug">{setting.label}</span>
        {setting.note && (
          <span className="block text-[11px] text-warning-text leading-snug mt-0.5">
            {setting.note}
            {setting.state === "invalid" && !setting.blocking ? " Connecting is still offered — Meta will refuse it if it really is wrong." : ""}
          </span>
        )}
      </span>
    </li>
  );
}

export function MetaConfigPanel() {
  const report = metaConfigReport();

  return (
    <details className="rounded-[22px] border border-border bg-white overflow-hidden group">
      <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-5 py-4 flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Meta configuration</span>
          <span className="block text-[11px] text-ink/55 mt-0.5">
            {report.products.map((p) => `${p.name}: ${p.ready ? "ready" : "not configured"}`).join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-ink/45 group-open:hidden">Show</span>
        <span className="shrink-0 text-[11px] font-semibold text-ink/45 hidden group-open:inline">Hide</span>
      </summary>

      <div className="border-t border-border px-5 py-4 space-y-5 text-sm">
        <p className="text-[12px] text-ink/60 leading-relaxed">
          Set on the deployment, never in the app. Daythread reports whether each value is present and well-formed — it never displays one, logs one, or sends one to a browser.
        </p>

        {report.products.map((product) => (
          <section key={product.product}>
            <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink/50">
              {product.name}
              <span className={`text-[10px] rounded-md px-1.5 py-0.5 ${product.ready ? "bg-success-soft text-success-text" : "bg-black/[0.05] text-ink/55"}`}>{product.ready ? "Ready to connect" : "Configuration required"}</span>
            </h4>
            <ul className="mt-1 divide-y divide-border">
              {product.settings.map((s) => (
                <Row key={`${product.product}-${s.key}`} setting={s} />
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-ink/50 leading-relaxed">
              <span className="font-semibold text-ink/70">Still required from Meta:</span> {product.approval}
            </p>
          </section>
        ))}

        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/50">Paste these into the Meta App Dashboard</h4>
          <div className="mt-2 space-y-2">
            <CopyField label="Webhook callback URL (Instagram + WhatsApp)" value={report.webhookUrl} />
            <CopyField label="Instagram OAuth redirect URI" value={report.redirectUris.instagram} />
            <CopyField label="WhatsApp / Facebook Login redirect URI" value={report.redirectUris.whatsapp} />
          </div>
          <p className="mt-2 text-[11px] text-ink/50 leading-relaxed">
            The verify token is whatever you set in <code className="font-mono">META_WEBHOOK_VERIFY_TOKEN</code>; Daythread compares it in constant time and never displays it.
            {report.appUrl.state !== "configured" && <span className="block mt-1 text-warning-text">These URLs are built from NEXT_PUBLIC_APP_URL, which is {report.appUrl.state}. Fix it first or Meta will be given the wrong callback.</span>}
          </p>
        </section>

        <p className="text-[11px] text-ink/45 flex items-start gap-1.5">
          <Copy className="w-3 h-3 mt-0.5 shrink-0" strokeWidth={2} aria-hidden />
          Full setup and review checklist: <code className="font-mono">docs/integrations/meta.md</code> in the repository.
        </p>
      </div>
    </details>
  );
}
