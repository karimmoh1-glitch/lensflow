import bcrypt from "bcryptjs";
import { addDays, addHours, subDays, subHours } from "date-fns";
import { generateInvitationToken, invitationExpiry } from "@/lib/invitations";
import type { Db } from "@/lib/db";

const PASSWORD = "demo1234";

/**
 * Resets and recreates the "Alex Rivera Photography" demo workspace — the shared seed
 * logic behind both `npm run db:seed` (local/CI) and the protected /api/admin/seed route
 * (for seeding a deployed environment where a direct DB connection isn't available to run
 * the script locally). Same data either way — one seed story, two entry points.
 */
export async function seedDemoWorkspace(prisma: Db) {
  await prisma.business.deleteMany({ where: { handle: { in: ["alex-photo", "wedding-collective"] } } });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          "alex@demo.lensflow.app",
          "sarah.kim@demo.lensflow.app",
          "morgan.blake@demo.lensflow.app",
          "jordan.lee@demo.lensflow.app",
          "priya.p@example.com",
        ],
      },
    },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const business = await prisma.business.create({
    data: {
      name: "Alex Rivera Photography",
      handle: "alex-photo",
      specialties: ["Portrait", "Graduation", "Family", "Wedding"],
      bio: "Natural-light portrait and lifestyle photography based in Austin, TX. Booking graduation season now!",
      timezone: "America/Chicago",
      depositPercent: 30,
      bufferMinutes: 30,
      bookingLeadHours: 24,
      paymentMethods: ["card", "zelle", "bank_transfer"],
      zelleHandle: "alex@alexriveraphoto.com",
      bankInstructions: "Chase Bank — Account: Alex Rivera Photography LLC — Routing: 111000025 — Account #: 000123456789",
      onboardingComplete: true,
      onboardingStep: 8,
    },
  });

  const owner = await prisma.user.create({ data: { name: "Alex Rivera", email: "alex@demo.lensflow.app", passwordHash } });
  await prisma.orgMembership.create({ data: { userId: owner.id, businessId: business.id, role: "OWNER" } });

  const photographer = await prisma.user.create({ data: { name: "Sarah Kim", email: "sarah.kim@demo.lensflow.app", passwordHash } });
  await prisma.orgMembership.create({ data: { userId: photographer.id, businessId: business.id, role: "PHOTOGRAPHER" } });

  const partnerUser = await prisma.user.create({ data: { name: "Jordan Lee", email: "jordan.lee@demo.lensflow.app", passwordHash } });
  const partnerMembership = await prisma.orgMembership.create({ data: { userId: partnerUser.id, businessId: business.id, role: "PARTNER" } });

  // Org-level ADMIN — same permission tier as OWNER within this business (can manage
  // team/settings/invitations), just not the org's original creator. This is NOT a
  // cross-organization platform superadmin — Daythread has no such role or panel.
  const adminUser = await prisma.user.create({ data: { name: "Morgan Blake", email: "morgan.blake@demo.lensflow.app", passwordHash } });
  await prisma.orgMembership.create({ data: { userId: adminUser.id, businessId: business.id, role: "ADMIN" } });

  const otherBusiness = await prisma.business.create({
    data: { name: "Wedding Collective", handle: "wedding-collective", onboardingComplete: true, timezone: "America/Chicago" },
  });
  await prisma.orgMembership.create({ data: { userId: owner.id, businessId: otherBusiness.id, role: "OWNER" } });
  const otherClient = await prisma.client.create({ data: { businessId: otherBusiness.id, name: "Confidential Client (Wedding Collective)" } });

  const [portrait, graduation, family, wedding] = await Promise.all([
    prisma.service.create({ data: { businessId: business.id, name: "Portrait Session", priceCents: 25000, durationMins: 60, sortOrder: 0 } }),
    prisma.service.create({ data: { businessId: business.id, name: "Graduation Session", priceCents: 35000, durationMins: 60, sortOrder: 1 } }),
    prisma.service.create({ data: { businessId: business.id, name: "Family Session", priceCents: 40000, durationMins: 75, sortOrder: 2 } }),
    prisma.service.create({ data: { businessId: business.id, name: "Wedding", priceCents: 250000, durationMins: 480, sortOrder: 3 } }),
  ]);

  await prisma.availability.createMany({
    data: [1, 2, 3, 4, 5].map((weekday) => ({ businessId: business.id, weekday, startMin: 9 * 60, endMin: 17 * 60 })),
  });
  await prisma.availability.create({ data: { businessId: business.id, weekday: 6, startMin: 10 * 60, endMin: 14 * 60 } });

  for (const provider of ["INSTAGRAM", "EMAIL", "SMS", "CALENDAR", "STRIPE"] as const) {
    await prisma.integration.create({ data: { businessId: business.id, provider, status: "DEMO", lastSyncedAt: new Date() } });
  }
  await prisma.integration.create({ data: { businessId: business.id, provider: "WHATSAPP", status: "NOT_CONNECTED" } });

  await prisma.automation.createMany({
    data: [
      {
        businessId: business.id,
        name: "Booking confirmation",
        trigger: "BOOKING_CREATED",
        offsetHours: 0,
        action: "SEND_CONFIRMATION",
        messageTemplate: "Thanks for booking with {{business}}! We can't wait for your {{service}} session on {{date}}.",
      },
      {
        businessId: business.id,
        name: "Shoot reminder",
        trigger: "DAYS_BEFORE_SHOOT",
        offsetHours: 24,
        action: "SEND_REMINDER",
        messageTemplate: "Quick reminder: your {{service}} session is tomorrow at {{time}}. See you then!",
      },
      {
        businessId: business.id,
        name: "Payment reminder",
        trigger: "PAYMENT_DUE_SOON",
        offsetHours: 72,
        action: "SEND_PAYMENT_REMINDER",
        messageTemplate: "Friendly reminder — your remaining balance of {{amount}} is due soon.",
      },
      {
        businessId: business.id,
        name: "Thank-you follow-up",
        trigger: "SHOOT_COMPLETED",
        offsetHours: 24,
        action: "SEND_THANK_YOU",
        messageTemplate: "It was a pleasure photographing you! Your gallery will be ready soon — thank you for booking with {{business}}.",
      },
    ],
  });

  const now = new Date();

  const sarahJ = await prisma.client.create({ data: { businessId: business.id, name: "Sarah Johnson", instagram: "@sarah.jhnsn" } });
  const sarahConvo = await prisma.conversation.create({
    data: { businessId: business.id, clientId: sarahJ.id, channel: "INSTAGRAM", externalHandle: "@sarah.jhnsn", lastMessageAt: subHours(now, 3) },
  });
  await prisma.message.create({
    data: { conversationId: sarahConvo.id, direction: "INBOUND", body: "Hi! Are you available for graduation pictures June 14? I'd love to book if so!", createdAt: subHours(now, 3) },
  });
  await prisma.lead.create({
    data: {
      businessId: business.id,
      clientId: sarahJ.id,
      conversationId: sarahConvo.id,
      extractedName: "Sarah",
      serviceId: graduation.id,
      requestedDateText: "June 14",
      intent: "HIGH",
      score: 92,
      scoreReasons: ["Ready to book (+35)", "Gave a specific date (+15)", "Mid-value service (+12)", "Inquiry has 3/5 key details (+9)"],
      estimatedValueCents: graduation.priceCents,
      lastInboundAt: subHours(now, 3),
      status: "NEW",
    },
  });

  const mike = await prisma.client.create({ data: { businessId: business.id, name: "Mike Smith", email: "mike.smith@example.com" } });
  const mikeConvo = await prisma.conversation.create({
    data: { businessId: business.id, clientId: mike.id, channel: "EMAIL", externalHandle: "mike.smith@example.com", lastMessageAt: subHours(now, 20) },
  });
  await prisma.message.create({
    data: { conversationId: mikeConvo.id, direction: "INBOUND", body: "How much do you charge for a family photo session? We have 2 kids.", createdAt: subHours(now, 20) },
  });
  await prisma.lead.create({
    data: {
      businessId: business.id,
      clientId: mike.id,
      conversationId: mikeConvo.id,
      extractedName: "Mike",
      serviceId: family.id,
      intent: "MEDIUM",
      score: 47,
      scoreReasons: ["Asking about pricing/availability (+20)", "Mid-value service (+12)", "Inquiry has 2/5 key details (+6)"],
      estimatedValueCents: family.priceCents,
      lastInboundAt: subHours(now, 20),
      status: "CONTACTED",
      respondedAt: subHours(now, 19),
    },
  });
  await prisma.message.create({
    data: {
      conversationId: mikeConvo.id,
      direction: "OUTBOUND",
      body: "Hi Mike! Our Family Session is $400 and runs about 75 minutes. I'd love to get you on the calendar — a 30% deposit holds your date. What day were you thinking?",
      aiDrafted: true,
      sentByUserId: owner.id,
      createdAt: subHours(now, 19),
    },
  });

  const jessica = await prisma.client.create({ data: { businessId: business.id, name: "Jessica Nguyen", phone: "+1 512 555 0142" } });
  const jessicaConvo = await prisma.conversation.create({
    data: { businessId: business.id, clientId: jessica.id, channel: "SMS", externalHandle: "+1 512 555 0142", lastMessageAt: subDays(now, 6) },
  });
  await prisma.message.create({
    data: { conversationId: jessicaConvo.id, direction: "INBOUND", body: "Hey! Do you shoot weddings? Looking at a September date next year.", createdAt: subDays(now, 6) },
  });
  await prisma.lead.create({
    data: {
      businessId: business.id,
      clientId: jessica.id,
      conversationId: jessicaConvo.id,
      extractedName: "Jessica",
      serviceId: wedding.id,
      requestedDateText: "September (next year)",
      intent: "LOW",
      score: 28,
      scoreReasons: ["Early-stage interest (+8)", "Gave a specific date (+15)", "High-value service (+20)", "No response sent yet (-10)", "Gone quiet for 5+ days (-15)"],
      estimatedValueCents: wedding.priceCents,
      lastInboundAt: subDays(now, 6),
      status: "NEW",
      createdAt: subDays(now, 6),
    },
  });

  const taylor = await prisma.client.create({ data: { businessId: business.id, name: "Taylor Brooks", email: "taylor.brooks@example.com" } });
  const taylorConvo = await prisma.conversation.create({
    data: { businessId: business.id, clientId: taylor.id, channel: "EMAIL", externalHandle: "taylor.brooks@example.com", lastMessageAt: subHours(now, 1) },
  });
  await prisma.message.create({
    data: { conversationId: taylorConvo.id, direction: "INBOUND", body: "Hi! I saw your portrait work on Instagram — do you have anything open this month?", createdAt: subHours(now, 1) },
  });
  await prisma.lead.create({
    data: {
      businessId: business.id,
      clientId: taylor.id,
      conversationId: taylorConvo.id,
      extractedName: "Taylor",
      serviceId: portrait.id,
      intent: "MEDIUM",
      score: 58,
      scoreReasons: ["Asking about pricing/availability (+20)", "Mid-value service (+12)", "Inquiry has 2/5 key details (+6)"],
      estimatedValueCents: portrait.priceCents,
      lastInboundAt: subHours(now, 1),
      status: "NEW",
    },
  });

  const james = await prisma.client.create({ data: { businessId: business.id, name: "James Park", email: "james.park@example.com", phone: "+1 512 555 0199" } });
  const jamesConvo = await prisma.conversation.create({
    data: { businessId: business.id, clientId: james.id, channel: "WEBSITE", lastMessageAt: subDays(now, 2) },
  });
  await prisma.message.create({
    data: { conversationId: jamesConvo.id, direction: "INBOUND", body: "Booked a graduation session through the website.", createdAt: subDays(now, 2) },
  });
  const jamesBooking = await prisma.booking.create({
    data: {
      businessId: business.id,
      clientId: james.id,
      conversationId: jamesConvo.id,
      serviceId: graduation.id,
      startAt: addDays(now, 2),
      endAt: addHours(addDays(now, 2), 1),
      location: "Zilker Park",
      status: "BOOKED",
      totalCents: graduation.priceCents,
      depositCents: Math.round(graduation.priceCents * 0.3),
    },
  });
  await prisma.payment.create({
    data: {
      businessId: business.id,
      bookingId: jamesBooking.id,
      clientId: james.id,
      method: "ZELLE",
      purpose: "DEPOSIT",
      amountCents: Math.round(graduation.priceCents * 0.3),
      status: "AWAITING_CONFIRMATION",
      reference: `LF-${jamesBooking.id.slice(-6).toUpperCase()}`,
    },
  });

  const priyaUser = await prisma.user.create({ data: { name: "Priya Patel", email: "priya.p@example.com", passwordHash } });
  const priya = await prisma.client.create({
    data: { businessId: business.id, name: "Priya Patel", email: "priya.p@example.com", userId: priyaUser.id },
  });
  await prisma.orgMembership.create({ data: { userId: priyaUser.id, businessId: business.id, role: "CLIENT" } });
  const priyaBooking = await prisma.booking.create({
    data: {
      businessId: business.id,
      clientId: priya.id,
      serviceId: portrait.id,
      startAt: new Date(new Date().setHours(10, 0, 0, 0)),
      endAt: new Date(new Date().setHours(11, 0, 0, 0)),
      location: "Studio",
      status: "CONFIRMED",
      totalCents: portrait.priceCents,
      depositCents: Math.round(portrait.priceCents * 0.3),
      confirmedAt: subDays(now, 1),
    },
  });
  await prisma.payment.create({
    data: { businessId: business.id, bookingId: priyaBooking.id, clientId: priya.id, method: "CARD", purpose: "DEPOSIT", amountCents: Math.round(portrait.priceCents * 0.3), status: "PAID", confirmedAt: subDays(now, 1) },
  });
  await prisma.payment.create({
    data: {
      businessId: business.id,
      bookingId: priyaBooking.id,
      clientId: priya.id,
      method: "CARD",
      purpose: "BALANCE",
      amountCents: portrait.priceCents - Math.round(portrait.priceCents * 0.3),
      status: "AWAITING_CONFIRMATION",
    },
  });
  const priyaConvo = await prisma.conversation.create({
    data: { businessId: business.id, clientId: priya.id, channel: "EMAIL", externalHandle: priya.email!, lastMessageAt: subHours(now, 5) },
  });
  await prisma.message.create({
    data: { conversationId: priyaConvo.id, direction: "OUTBOUND", body: "Looking forward to your session today! Please arrive 10 minutes early.", sentByUserId: owner.id, createdAt: subHours(now, 5) },
  });

  const diego = await prisma.client.create({ data: { businessId: business.id, name: "Diego Ramirez", email: "diego.r@example.com" } });
  await prisma.booking.create({
    data: {
      businessId: business.id,
      clientId: diego.id,
      serviceId: family.id,
      startAt: addHours(new Date(new Date().setHours(14, 0, 0, 0)), 24),
      endAt: addHours(new Date(new Date().setHours(15, 15, 0, 0)), 24),
      location: "Zilker Park",
      status: "BOOKED",
      totalCents: family.priceCents,
      depositCents: Math.round(family.priceCents * 0.3),
      assignedMembershipId: partnerMembership.id,
    },
  });

  const emma = await prisma.client.create({ data: { businessId: business.id, name: "Emma Walsh", email: "emma.w@example.com" } });
  const emmaBooking = await prisma.booking.create({
    data: {
      businessId: business.id,
      clientId: emma.id,
      serviceId: portrait.id,
      startAt: subDays(now, 3),
      endAt: addHours(subDays(now, 3), 1),
      status: "COMPLETED",
      totalCents: portrait.priceCents,
      depositCents: Math.round(portrait.priceCents * 0.3),
      completedAt: subDays(now, 3),
    },
  });
  await prisma.payment.create({
    data: { businessId: business.id, bookingId: emmaBooking.id, clientId: emma.id, method: "CARD", purpose: "DEPOSIT", amountCents: Math.round(portrait.priceCents * 0.3), status: "PAID", confirmedAt: subDays(now, 10) },
  });

  const lily = await prisma.client.create({ data: { businessId: business.id, name: "Lily Chen", email: "lily.chen@example.com" } });
  const plan = await prisma.membershipPlan.create({
    data: {
      businessId: business.id,
      name: "Monthly Portrait Membership",
      priceCents: 14900,
      intervalMonths: 1,
      sessionsPerInterval: 1,
      perks: ["1 session/month", "10 edited photos", "Priority scheduling", "Discounted prints"],
    },
  });
  await prisma.subscription.create({
    data: { clientId: lily.id, planId: plan.id, status: "ACTIVE", sessionsRemaining: 1, currentPeriodEnd: addDays(now, 14) },
  });
  await prisma.clientNote.create({ data: { clientId: lily.id, authorId: owner.id, body: "Prefers golden-hour outdoor sessions. Allergic to dogs — no pet shoots." } });

  // The people with bookings are customers; everyone else stays a potential client.
  await prisma.client.updateMany({ where: { businessId: business.id, bookings: { some: {} } }, data: { relationship: "CUSTOMER" } });

  // The mail a real business inbox actually gets. Stored, classified, kept out of
  // Priority and out of the CRM — no client record for any of these.
  const noise: { handle: string; subject: string; body: string; category: "AUTOMATED" | "PROMOTIONAL" | "INTERNAL"; reason: string; hoursAgo: number }[] = [
    { handle: "no-reply@doordash.com", subject: "Your order has been confirmed", body: "Your DoorDash order from Thai Basil is confirmed and on its way. Estimated arrival 7:40 PM.", category: "AUTOMATED", reason: "A notification from doordash.com.", hoursAgo: 2 },
    { handle: "shipment-tracking@amazon.com", subject: "Shipped: your Amazon.com order", body: "Your package with 1 item will arrive Thursday.", category: "AUTOMATED", reason: "A notification from amazon.com.", hoursAgo: 9 },
    { handle: "receipts@stripe.com", subject: "Your Stripe payout of $312.00", body: "A payout was sent to your bank account ending in 4411.", category: "INTERNAL", reason: "From stripe.com, a platform you use.", hoursAgo: 26 },
    { handle: "no-reply@accounts.google.com", subject: "Security alert", body: "A new sign-in on Mac. If this was you, you can ignore this.", category: "INTERNAL", reason: "From accounts.google.com, a platform you use.", hoursAgo: 30 },
    { handle: "news@lensmag.example", subject: "Weekly digest: 5 lighting setups under $100", body: "Plus a 20% off code for members. Unsubscribe any time.", category: "PROMOTIONAL", reason: "A mailing list or newsletter.", hoursAgo: 48 },
  ];
  for (const n of noise) {
    const conv = await prisma.conversation.create({
      data: { businessId: business.id, channel: "EMAIL", externalHandle: n.handle, subject: n.subject, lastMessageAt: subHours(now, n.hoursAgo), category: n.category, categoryReason: n.reason, categorySource: "rules" },
    });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "INBOUND", body: n.body, createdAt: subHours(now, n.hoursAgo) } });
  }

  const invitedClient = await prisma.client.create({ data: { businessId: business.id, name: "Jamie Chen", email: "demo-client@example.com" } });
  await prisma.invitation.create({
    data: {
      businessId: business.id,
      email: "demo-client@example.com",
      role: "CLIENT",
      token: generateInvitationToken(),
      clientId: invitedClient.id,
      invitedByUserId: owner.id,
      expiresAt: invitationExpiry(),
    },
  });
  await prisma.invitation.create({
    data: {
      businessId: business.id,
      email: "demo-partner@example.com",
      role: "PARTNER",
      token: generateInvitationToken(),
      invitedByUserId: owner.id,
      expiresAt: invitationExpiry(),
    },
  });

  return {
    owner: { email: owner.email, password: PASSWORD },
    photographer: { email: photographer.email, password: PASSWORD },
    admin: { email: adminUser.email, password: PASSWORD },
    partner: { email: partnerUser.email, password: PASSWORD },
    client: { email: priyaUser.email, password: PASSWORD },
    bookingPage: `/book/${business.handle}`,
    otherOrg: { name: otherBusiness.name, handle: otherBusiness.handle, confidentialClient: otherClient.name },
  };
}
