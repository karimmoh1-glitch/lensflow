import { appUrl } from "@/lib/integrations/oauth";

/**
 * The emails Daythread sends on its own behalf: an invitation, a password reset, a note
 * that a customer's files are ready.
 *
 * These used to be one-line strings assembled at each call site, with the link built by
 * reading an environment variable inline. Two problems came from that. A missing variable
 * produced `undefined/invite/…` and posted a dead link to a real person, and every message
 * looked like a debugging aid rather than something a business would put its name on.
 *
 * One template, then, and one way to build a link. Both a plain-text and an HTML part go
 * out: text for the clients that prefer it and for anything that strips markup, HTML for
 * everyone else. The HTML is deliberately plain — a table-free single column, inline
 * styles, nothing wider than 600px — because that is what survives in mail clients.
 */

/** An absolute URL into this deployment. Never a relative path, never `undefined/…`. */
export function linkTo(pathname: string): string {
  const base = appUrl().replace(/\/+$/, "");
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export type EmailContent = { subject: string; text: string; html: string };

type Template = {
  subject: string;
  /** The one line that has to land even in a notification preview. */
  preview: string;
  heading: string;
  /** Paragraphs, in order. Plain sentences; no markup. */
  body: string[];
  action?: { label: string; url: string };
  /** Who this is from, in words — the business's name, or Daythread. */
  from: string;
  /** A last line in small print. Never a legal wall. */
  footer?: string;
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Renders one message. The palette is intentionally neutral: these go out under a
 * business's name, not Daythread's, so the design stays out of the way.
 */
export function renderEmail(t: Template): EmailContent {
  const text = [
    t.heading,
    "",
    ...t.body,
    ...(t.action ? ["", `${t.action.label}: ${t.action.url}`] : []),
    "",
    "—",
    t.from,
    ...(t.footer ? [t.footer] : []),
  ].join("\n");

  const paragraphs = t.body
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#15191f;">${escapeHtml(p)}</p>`)
    .join("");

  const button = t.action
    ? `<p style="margin:0 0 20px;"><a href="${escapeHtml(t.action.url)}" style="display:inline-block;background:#15191f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;">${escapeHtml(t.action.label)}</a></p>
       <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#6b7280;">Or paste this into your browser:<br><span style="word-break:break-all;">${escapeHtml(t.action.url)}</span></p>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(t.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(t.preview)}</div>
<div style="padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e3e6ea;border-radius:12px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#15191f;font-weight:700;">${escapeHtml(t.heading)}</h1>
    ${paragraphs}
    ${button}
    <hr style="border:none;border-top:1px solid #e3e6ea;margin:24px 0 16px;">
    <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">${escapeHtml(t.from)}${t.footer ? `<br>${escapeHtml(t.footer)}` : ""}</p>
  </div>
</div>
</body></html>`;

  return { subject: t.subject, text, html };
}

/** Somebody is invited to a workspace, as a customer or as a teammate. */
export function invitationEmail(opts: { businessName: string; recipientName: string; token: string; role: "client" | "teammate" | "partner"; reminder?: boolean }): EmailContent {
  const url = linkTo(`/invite/${opts.token}`);
  const what =
    opts.role === "client"
      ? `${opts.businessName} has set up a page where you can see your bookings, messages and any files they send you.`
      : opts.role === "partner"
        ? `${opts.businessName} would like you to work with them on Daythread. You will see the bookings assigned to you and the people they involve.`
        : `${opts.businessName} would like you on their team in Daythread. You will share their inbox, bookings and customers.`;
  return renderEmail({
    subject: opts.reminder ? `Reminder: join ${opts.businessName}` : opts.role === "client" ? `${opts.businessName} invited you` : `${opts.businessName} invited you to their team`,
    preview: `Your invitation to ${opts.businessName}.`,
    heading: opts.reminder ? `Your invitation is still open` : `${opts.recipientName}, you have been invited`,
    body: [what, "Opening the link below sets up your access. It expires in a week."],
    action: { label: "Accept your invitation", url },
    from: opts.businessName,
    footer: "If you were not expecting this, you can ignore it and nothing happens.",
  });
}

/** Somebody asked to reset their Daythread password. */
export function passwordResetEmail(opts: { name: string; token: string }): EmailContent {
  return renderEmail({
    subject: "Reset your Daythread password",
    preview: "The link is good for one hour.",
    heading: "Reset your password",
    body: [`Hi ${opts.name}, use the link below to choose a new password. It works once, and it expires in an hour.`],
    action: { label: "Choose a new password", url: linkTo(`/reset-password/${opts.token}`) },
    from: "Daythread",
    footer: "If you did not ask for this, nothing has changed and you can ignore it.",
  });
}

/** A business is sending a customer the work they paid for. */
export function fileDeliveryEmail(opts: { businessName: string; recipientName: string; url: string; message?: string | null }): EmailContent {
  const note = (opts.message ?? "").trim();
  return renderEmail({
    subject: `Your files from ${opts.businessName}`,
    preview: `${opts.businessName} has sent you your files.`,
    heading: "Your files are ready",
    body: [note || `Hi ${opts.recipientName}, your files from ${opts.businessName} are ready.`],
    action: { label: "Open your files", url: opts.url },
    from: opts.businessName,
  });
}
