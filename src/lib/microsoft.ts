import type { Integration } from "@prisma/client";
import { tokenRequest, validAccessToken, bearerJson, appUrl, OAuthError, type OAuthTokens } from "@/lib/integrations/oauth";

/**
 * Microsoft identity platform + Microsoft Graph, for Outlook mail and Outlook calendar.
 * One Entra app registration ("common" tenant: work, school and personal accounts), two
 * purposes with their own scopes. Tokens are short-lived and refresh tokens rotate, so
 * every call goes through validAccessToken. Nothing here logs a token or a message body.
 */
const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";

const MAIL_SCOPES = ["openid", "email", "offline_access", "User.Read", "Mail.Read", "Mail.Send"];
const CALENDAR_SCOPES = ["openid", "email", "offline_access", "User.Read", "Calendars.ReadWrite"];
export const MICROSOFT_SCOPES = { mail: MAIL_SCOPES.join(" "), calendar: CALENDAR_SCOPES.join(" ") } as const;

const clientId = () => process.env.MICROSOFT_CLIENT_ID;
const clientSecret = () => process.env.MICROSOFT_CLIENT_SECRET;
export const microsoftRedirectUri = () => `${appUrl()}/api/auth/microsoft/callback`;

export function microsoftConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

export function microsoftAuthUrl(state: string, purpose: "mail" | "calendar", codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId()!,
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
    scope: MICROSOFT_SCOPES[purpose],
    state,
    prompt: "select_account",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

export function exchangeMicrosoftCode(code: string, purpose: "mail" | "calendar", codeVerifier: string): Promise<OAuthTokens> {
  return tokenRequest(`${AUTHORITY}/token`, { client_id: clientId()!, client_secret: clientSecret()!, grant_type: "authorization_code", code, redirect_uri: microsoftRedirectUri(), code_verifier: codeVerifier, scope: MICROSOFT_SCOPES[purpose] });
}

export function refreshMicrosoftToken(refreshToken: string, purpose: "mail" | "calendar"): Promise<OAuthTokens> {
  return tokenRequest(`${AUTHORITY}/token`, { client_id: clientId()!, client_secret: clientSecret()!, grant_type: "refresh_token", refresh_token: refreshToken, scope: MICROSOFT_SCOPES[purpose] });
}

export type MicrosoftProfile = { id: string; mail: string | null; userPrincipalName: string; displayName: string | null };

export async function microsoftProfile(accessToken: string): Promise<MicrosoftProfile> {
  const me = await bearerJson<{ id: string; mail?: string | null; userPrincipalName: string; displayName?: string | null }>(`${GRAPH}/me?$select=id,mail,userPrincipalName,displayName`, accessToken);
  return { id: me.id, mail: me.mail ?? null, userPrincipalName: me.userPrincipalName, displayName: me.displayName ?? null };
}

/** The address a person would recognise: the mailbox, falling back to the sign-in name. */
export const microsoftAddress = (p: MicrosoftProfile) => (p.mail && p.mail.includes("@") ? p.mail : p.userPrincipalName).toLowerCase();

export function microsoftToken(integration: Integration): Promise<string> {
  const purpose = integration.provider === "MICROSOFT_CALENDAR" ? "calendar" : "mail";
  return validAccessToken(integration, (rt) => refreshMicrosoftToken(rt, purpose), { label: purpose === "calendar" ? "Microsoft Calendar" : "Microsoft Outlook" });
}

/* ------------------------------------------------------------------ mail */

export type GraphMessage = {
  id: string;
  internetMessageId?: string | null;
  conversationId?: string | null;
  subject?: string | null;
  receivedDateTime: string;
  isDraft?: boolean;
  from?: { emailAddress?: { name?: string | null; address?: string | null } } | null;
  replyTo?: Array<{ emailAddress?: { address?: string | null } }>;
  body?: { contentType?: string; content?: string } | null;
  bodyPreview?: string | null;
  "@removed"?: { reason?: string };
};

type DeltaPage = { value: GraphMessage[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };

const MESSAGE_SELECT = "id,internetMessageId,conversationId,subject,receivedDateTime,isDraft,from,replyTo,body,bodyPreview";

/**
 * Inbox changes since a delta link, or everything received since `since` when there is no
 * link yet. Follows every nextLink; returns the new deltaLink to store as the cursor. A
 * stale link (Graph answers 410 / SyncStateNotFound) is reported so the caller can start over.
 */
export async function listInboxDelta(accessToken: string, opts: { deltaLink?: string | null; since?: Date | null; max?: number }): Promise<{ messages: GraphMessage[]; deltaLink: string | null }> {
  const max = opts.max ?? 200;
  let url = opts.deltaLink ?? `${GRAPH}/me/mailFolders/inbox/messages/delta?$select=${MESSAGE_SELECT}&$top=50${opts.since ? `&$filter=${encodeURIComponent(`receivedDateTime ge ${opts.since.toISOString()}`)}` : ""}`;
  const messages: GraphMessage[] = [];
  let deltaLink: string | null = null;
  for (let i = 0; i < 40; i++) {
    const page: DeltaPage = await bearerJson<DeltaPage>(url, accessToken, { headers: { Prefer: 'outlook.body-content-type="text"' } });
    for (const m of page.value ?? []) if (messages.length < max) messages.push(m);
    if (page["@odata.deltaLink"]) { deltaLink = page["@odata.deltaLink"]; break; }
    if (!page["@odata.nextLink"]) break;
    url = page["@odata.nextLink"];
  }
  return { messages, deltaLink };
}

export const isStaleDelta = (err: unknown) => err instanceof OAuthError && (err.status === 410 || /SyncStateNotFound|syncStateInvalid/i.test(`${err.code ?? ""} ${err.message}`));

export async function findMessageByInternetId(accessToken: string, internetMessageId: string): Promise<string | null> {
  const q = `${GRAPH}/me/messages?$filter=${encodeURIComponent(`internetMessageId eq '${internetMessageId.replace(/'/g, "''")}'`)}&$select=id&$top=1`;
  const r = await bearerJson<{ value: Array<{ id: string }> }>(q, accessToken);
  return r.value?.[0]?.id ?? null;
}

/**
 * Send a new mail from the connected mailbox. Graph only allows custom headers that start
 * with "x-", so threading a reply is done with createReply (below), not with In-Reply-To.
 */
export async function sendGraphMail(accessToken: string, params: { to: string; subject: string; body: string; fromName?: string }): Promise<void> {
  await bearerJson(`${GRAPH}/me/sendMail`, accessToken, {
    method: "POST",
    body: { message: { subject: params.subject, body: { contentType: "Text", content: params.body }, toRecipients: [{ emailAddress: { address: params.to } }] }, saveToSentItems: true },
  });
}

/** Reply inside the customer's thread: Graph builds the reply (threading headers included),
 * we set the text and send it. Returns the draft's id. */
export async function replyToGraphMessage(accessToken: string, messageId: string, body: string): Promise<string> {
  const draft = await bearerJson<{ id: string }>(`${GRAPH}/me/messages/${encodeURIComponent(messageId)}/createReply`, accessToken, { method: "POST", body: {} });
  await bearerJson(`${GRAPH}/me/messages/${encodeURIComponent(draft.id)}`, accessToken, { method: "PATCH", body: { body: { contentType: "Text", content: body } } });
  await bearerJson(`${GRAPH}/me/messages/${encodeURIComponent(draft.id)}/send`, accessToken, { method: "POST" });
  return draft.id;
}

/* -------------------------------------------------------------- calendar */

export type GraphCalendar = { id: string; name: string; isDefaultCalendar?: boolean; canEdit?: boolean; owner?: { address?: string } };
export type GraphEvent = {
  id: string;
  subject?: string | null;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
  "@odata.etag"?: string;
  "@removed"?: { reason?: string };
};

export async function listGraphCalendars(accessToken: string): Promise<GraphCalendar[]> {
  const r = await bearerJson<{ value: GraphCalendar[] }>(`${GRAPH}/me/calendars?$select=id,name,isDefaultCalendar,canEdit,owner&$top=50`, accessToken);
  return r.value ?? [];
}

/** Events in a window, incrementally: a delta link continues, otherwise a fresh window
 * (a week back, six months ahead) starts a new delta chain. Times come back in UTC. */
export async function listGraphEventsDelta(accessToken: string, calendarId: string, deltaLink: string | null): Promise<{ events: GraphEvent[]; deltaLink: string | null }> {
  const now = Date.now();
  const start = new Date(now - 7 * 86_400_000).toISOString();
  const end = new Date(now + 183 * 86_400_000).toISOString();
  let url = deltaLink ?? `${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/calendarView/delta?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}`;
  const events: GraphEvent[] = [];
  let next: string | null = null;
  for (let i = 0; i < 40; i++) {
    const page = await bearerJson<{ value: GraphEvent[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string }>(url, accessToken, { headers: { Prefer: 'outlook.timezone="UTC"', "odata.maxpagesize": "50" } });
    events.push(...(page.value ?? []));
    if (page["@odata.deltaLink"]) { next = page["@odata.deltaLink"]; break; }
    if (!page["@odata.nextLink"]) break;
    url = page["@odata.nextLink"];
  }
  return { events, deltaLink: next };
}

/** Graph returns "2026-09-10T14:00:00.0000000" in the preferred zone (UTC here). */
export function graphInstant(v: { dateTime: string; timeZone?: string } | undefined): Date | null {
  if (!v?.dateTime) return null;
  const s = v.dateTime.replace(/(\.\d{3})\d+$/, "$1");
  const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type GraphEventInput = { summary: string; description: string; location?: string | null; start: Date; end: Date; bookingId: string };

const eventBody = (input: GraphEventInput) => ({
  subject: input.summary,
  body: { contentType: "Text", content: input.description },
  start: { dateTime: input.start.toISOString(), timeZone: "UTC" },
  end: { dateTime: input.end.toISOString(), timeZone: "UTC" },
  ...(input.location ? { location: { displayName: input.location } } : {}),
});

export async function createGraphEvent(accessToken: string, calendarId: string, input: GraphEventInput): Promise<{ id: string; etag: string | null }> {
  // transactionId makes a retried create idempotent on Graph's side.
  const attempt = (withTransaction: boolean) => bearerJson<{ id: string; "@odata.etag"?: string }>(`${GRAPH}/me/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, { method: "POST", body: { ...eventBody(input), ...(withTransaction ? { transactionId: `daythread-${input.bookingId}` } : {}) } });
  let e;
  try { e = await attempt(true); } catch (err) {
    if (err instanceof OAuthError && err.status === 400) e = await attempt(false);
    else throw err;
  }
  return { id: e.id, etag: e["@odata.etag"] ?? null };
}

export async function updateGraphEvent(accessToken: string, eventId: string, input: GraphEventInput): Promise<{ id: string; etag: string | null }> {
  const e = await bearerJson<{ id: string; "@odata.etag"?: string }>(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, accessToken, { method: "PATCH", body: eventBody(input) });
  return { id: e.id, etag: e["@odata.etag"] ?? null };
}

export async function deleteGraphEvent(accessToken: string, eventId: string): Promise<void> {
  try { await bearerJson(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, accessToken, { method: "DELETE" }); } catch (err) {
    if (err instanceof OAuthError && (err.status === 404 || err.status === 410)) return;
    throw err;
  }
}

export { OAuthError as GraphError };
