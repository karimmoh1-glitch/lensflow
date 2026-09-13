import { prisma } from "@/lib/db";
import { getPersonalization } from "@/server/personalization";
import { PROVIDER_LABEL, list } from "@/lib/personalization";

const ACTIVE = ["CONNECTED", "NEEDS_ATTENTION", "SYNC_ERROR"] as const;
const CHANNELS = ["EMAIL", "MICROSOFT_OUTLOOK", "INSTAGRAM", "WHATSAPP", "SMS", "ZOOM"] as const;
const CALENDARS = ["GOOGLE_CALENDAR", "APPLE_CALENDAR", "MICROSOFT_CALENDAR"] as const;

export type SetupStep = { key: string; title: string; detail: string; cta: string; href: string; done: boolean };

/**
 * What stands between this workspace and booking a client from a conversation, in the order
 * it matters: somewhere for messages to arrive, something to book, a calendar to check
 * against, the confirmation that goes out by itself, and — when they said they work with
 * others — the team. Every "done" is read from the database; nothing is ticked for them.
 */
export async function setupSteps(businessId: string): Promise<SetupStep[]> {
  const [p, integrations, services, hours, confirmations, seats] = await Promise.all([
    getPersonalization(businessId),
    prisma.integration.findMany({ where: { businessId }, select: { provider: true, status: true } }),
    prisma.service.count({ where: { businessId, active: true } }),
    prisma.availability.count({ where: { businessId } }),
    prisma.automation.count({ where: { businessId, action: "SEND_CONFIRMATION", enabled: true } }),
    prisma.orgMembership.count({ where: { businessId, status: "ACTIVE", role: { not: "CLIENT" } } }),
  ]);
  const connected = new Set(integrations.filter((r) => (ACTIVE as readonly string[]).includes(r.status)).map((r) => r.provider as string));
  const channelOn = CHANNELS.some((c) => connected.has(c));
  const wanted = (p?.connectProviders ?? []).filter((x) => (CHANNELS as readonly string[]).includes(x) && !connected.has(x));

  const steps: SetupStep[] = [
    {
      key: "channel",
      title: channelOn ? "Messages are coming in" : wanted.length ? `Connect ${list(wanted.map((x) => PROVIDER_LABEL[x]))}` : "Connect where clients message you",
      detail: "Every conversation in one inbox, answered from the account it came to.",
      cta: "Connect",
      href: "/dashboard/settings?tab=channels",
      done: channelOn,
    },
    {
      key: "services",
      title: services === 0 ? "Add your services and hours" : hours === 0 ? "Add your working hours" : "Services and hours are set",
      detail: "Open times come from your hours, so a booking takes one click from the conversation.",
      cta: services === 0 ? "Add services" : "Set hours",
      href: "/dashboard/settings?tab=business",
      done: services > 0 && hours > 0,
    },
    {
      key: "calendar",
      title: CALENDARS.some((c) => connected.has(c)) ? "Your calendar is connected" : "Connect your calendar",
      detail: "Open times skip anything already on it, so nobody is offered a taken slot.",
      cta: "Connect",
      href: "/dashboard/settings?tab=channels",
      done: CALENDARS.some((c) => connected.has(c)),
    },
    {
      key: "confirm",
      title: confirmations > 0 ? "Bookings are confirmed automatically" : "Turn on booking confirmations",
      detail: "Each booking is confirmed on the channel the client wrote from.",
      cta: "Set up",
      href: "/dashboard/automations",
      done: confirmations > 0,
    },
  ];
  if (p?.usesTeam) {
    steps.push({ key: "team", title: seats > 1 ? `${seats} people share this inbox` : "Invite the people you work with", detail: "Everyone answers from one inbox, with each conversation assigned.", cta: "Invite", href: "/dashboard/settings?tab=team", done: seats > 1 });
  }
  return steps;
}
