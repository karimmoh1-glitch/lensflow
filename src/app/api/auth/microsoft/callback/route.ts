import { prisma } from "@/lib/db";
import { completeOAuthConnect } from "@/server/oauthConnect";
import { exchangeMicrosoftCode, microsoftProfile, microsoftAddress } from "@/lib/microsoft";
import { syncOutlookForBusiness } from "@/server/outlookSync";
import { discoverCalendars, readCalendarSettings, syncCalendarIn } from "@/server/calendarSync";

/**
 * Where Microsoft sends the owner back, for Outlook mail and Outlook calendar (the state
 * says which). Same guarantees as every callback: verified state, tenant binding, PKCE,
 * encrypted storage, plan gate, audit line.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return completeOAuthConnect(req, {
    oauthProvider: "microsoft",
    purposes: ["mail", "calendar"],
    providerFor: (purpose) => (purpose === "calendar" ? "MICROSOFT_CALENDAR" : "MICROSOFT_OUTLOOK"),
    pkce: true,
    requireRefreshToken: true,
    exclusive: true,
    exchange: (code, verifier, flow) => exchangeMicrosoftCode(code, flow.purpose === "calendar" ? "calendar" : "mail", verifier!),
    identity: async (tokens, flow) => {
      const scope = tokens.scope ?? "";
      const needed = flow.purpose === "calendar" ? /Calendars\.ReadWrite/i : /Mail\.Read/i;
      if (!needed.test(scope)) throw Object.assign(new Error("scopes"), { code: "scopes" });
      const me = await microsoftProfile(tokens.accessToken);
      const address = microsoftAddress(me);
      return { externalId: me.id, externalAccount: address, scopes: scope, settings: { displayName: me.displayName, address } };
    },
    afterActivate: async (row, _tokens, _identity, previous, flow) => {
      if (flow.purpose === "mail") {
        await syncOutlookForBusiness(row.businessId);
        return;
      }
      const available = await discoverCalendars(row).catch(() => []);
      const prior = readCalendarSettings(previous ?? { settings: null });
      const primary = available.find((c) => c.primary) ?? available[0];
      const selected = prior.selected.filter((id) => available.some((c) => c.id === id));
      const chosen = selected.length ? selected : primary ? [primary.id] : [];
      await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...(row.settings as object), available, selected: chosen, bookingCalendar: prior.bookingCalendar && chosen.includes(prior.bookingCalendar) ? prior.bookingCalendar : (chosen[0] ?? null), cursors: {} } } });
      const fresh = await prisma.integration.findUnique({ where: { id: row.id } });
      if (fresh) await syncCalendarIn(fresh);
      return { redirect: { setup: "MICROSOFT_CALENDAR" } };
    },
  });
}
