"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { syncCalendarIn, discoverCalendars, readCalendarSettings, type CalendarChoice } from "@/server/calendarSync";
import { track } from "@/lib/analytics";
import type { IntegrationProvider } from "@prisma/client";

const ADMIN = ["OWNER", "ADMIN"] as const;
const ProviderSchema = z.enum(["GOOGLE_CALENDAR", "APPLE_CALENDAR"]);
const SelectionSchema = z.object({
  provider: ProviderSchema,
  selected: z.array(z.string().min(1).max(500)).max(50),
  bookingCalendar: z.string().min(1).max(500).nullable(),
});

export type CalendarState = {
  connected: boolean;
  account: string | null;
  available: CalendarChoice[];
  selected: string[];
  bookingCalendar: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
  status: string | null;
  busyBlocks: number;
  error?: string;
};

/** Everything the manage panel needs for one calendar integration, tenant-scoped. */
export async function getCalendarState(provider: "GOOGLE_CALENDAR" | "APPLE_CALENDAR", opts: { refresh?: boolean } = {}, session?: SessionPayload | null): Promise<CalendarState> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider } } });
  if (!row || row.status === "NOT_CONNECTED") return { connected: false, account: null, available: [], selected: [], bookingCalendar: null, lastSyncedAt: null, lastSyncStatus: null, lastError: null, status: row?.status ?? null, busyBlocks: 0 };
  let settings = readCalendarSettings(row);
  let error: string | undefined;
  if (opts.refresh || settings.available.length === 0) {
    try {
      const available = await discoverCalendars(row);
      settings = { ...settings, available };
      await prisma.integration.update({ where: { id: row.id }, data: { settings } });
    } catch {
      error = row.status === "NEEDS_ATTENTION" ? "Your connection needs to be renewed." : "Couldn't list calendars right now.";
    }
  }
  const busyBlocks = await prisma.externalEvent.count({ where: { integrationId: row.id, bookingId: null, endAt: { gt: new Date() } } });
  return { connected: true, account: row.externalAccount, available: settings.available, selected: settings.selected, bookingCalendar: settings.bookingCalendar, lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null, lastSyncStatus: row.lastSyncStatus, lastError: row.lastError, status: row.status, busyBlocks, error };
}

/** Save which calendars block availability and which one receives bookings; then sync. */
export async function saveCalendarSelection(input: { provider: IntegrationProvider; selected: string[]; bookingCalendar: string | null }, session?: SessionPayload | null): Promise<{ error?: string; synced?: number }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  const parsed = SelectionSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose at least one calendar from the list." };
  const { provider, selected, bookingCalendar } = parsed.data;
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider } } });
  if (!row || row.status === "NOT_CONNECTED") return { error: "That calendar isn't connected." };
  const settings = readCalendarSettings(row);
  const known = new Set(settings.available.map((c) => c.id));
  // Only calendars the account actually exposes; the booking calendar must be selected and writable.
  const chosen = selected.filter((id) => known.has(id));
  if (chosen.length === 0) return { error: "Choose at least one calendar." };
  const writable = new Set(settings.available.filter((c) => !c.readOnly).map((c) => c.id));
  const booking = bookingCalendar && chosen.includes(bookingCalendar) && writable.has(bookingCalendar) ? bookingCalendar : (chosen.find((id) => writable.has(id)) ?? null);
  // Calendars no longer selected lose their sync position; busy blocks are pruned by the sync.
  const cursors = Object.fromEntries(Object.entries(settings.cursors).filter(([id]) => chosen.includes(id)));
  await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...settings, selected: chosen, bookingCalendar: booking, cursors } } });
  const fresh = await prisma.integration.findUnique({ where: { id: row.id } });
  const result = fresh ? await syncCalendarIn(fresh) : null;
  await track("calendar_selection_saved", { businessId: ctx.business.id, properties: { provider, count: chosen.length } });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/calendar");
  return result?.ok ? { synced: result.upserted } : { error: result?.error ?? "Saved, but the first sync failed. Daythread will retry automatically." };
}

export async function syncCalendarNow(provider: IntegrationProvider, session?: SessionPayload | null): Promise<{ ok: boolean; error?: string; upserted?: number }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  const p = ProviderSchema.safeParse(provider);
  if (!p.success) return { ok: false, error: "Not a calendar." };
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: p.data } } });
  if (!row || row.status === "NOT_CONNECTED") return { ok: false, error: "That calendar isn't connected." };
  const r = await syncCalendarIn(row);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/calendar");
  return r.ok ? { ok: true, upserted: r.upserted } : { ok: false, error: r.error };
}
