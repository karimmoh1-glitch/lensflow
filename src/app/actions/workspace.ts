"use server";

import { assertIds } from "@/lib/ids";

import { redirect } from "next/navigation";
import { getSession, setActiveBusiness, homeRouteFor } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function switchWorkspace(businessId: string) {
  assertIds(businessId);
  // setActiveBusiness is the guard: it refuses anything but an active membership, so the
  // reads below only ever run for a workspace this person really belongs to.
  await setActiveBusiness(businessId);
  const session = await getSession();
  const [business, membership] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId } }),
    prisma.orgMembership.findUniqueOrThrow({ where: { userId_businessId: { userId: session!.userId, businessId } } }),
  ]);
  redirect(homeRouteFor(membership.role, business));
}
