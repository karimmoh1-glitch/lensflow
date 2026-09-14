import { z } from "zod";

/**
 * The personalization engine. Pure and client-safe: the same rules run in the browser (to
 * show the recommendation before an account exists), on the server (to store it), and in
 * tests. Nothing here guesses — every derived value traces to an answer the person gave,
 * and every plan recommendation comes with the sentence that explains it.
 */
export const USER_TYPES = [
  ["freelancer", "Freelancer"],
  ["business_owner", "Business owner"],
  ["agency", "Agency"],
  ["consultant", "Consultant"],
  ["creator", "Creator"],
  ["service_provider", "Service provider"],
  ["team_member", "Team member"],
  ["other", "Other"],
] as const;
export const WORK_CATEGORIES = [
  ["photography", "Photography"],
  ["consulting", "Consulting"],
  ["home_services", "Home services"],
  ["marketing", "Marketing"],
  ["design", "Design"],
  ["coaching", "Coaching"],
  ["beauty_wellness", "Beauty / wellness"],
  ["real_estate", "Real estate"],
  ["professional_services", "Professional services"],
  ["ecommerce", "E-commerce"],
  ["other", "Other"],
] as const;
export const BUSINESS_STATUSES = [
  ["business", "Yes, I run a business"],
  ["team", "Yes, I work with a team"],
  ["solo", "I'm a freelancer / solo operator"],
  ["personal", "I'm exploring it for personal organization"],
  ["other", "Other"],
] as const;
export const TEAM_SIZES = [
  ["just_me", "Just me"],
  ["2_5", "2–5"],
  ["6_10", "6–10"],
  ["11_plus", "11+"],
] as const;
export const CHANNELS = [
  ["email", "Email"],
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["sms", "SMS"],
  ["website", "Website"],
  ["other", "Other"],
] as const;
export const PAIN_POINTS = [
  ["messages", "Keeping up with messages"],
  ["follow_ups", "Missing follow-ups"],
  ["scheduling", "Scheduling"],
  ["bookings", "Managing bookings"],
  ["repetitive", "Repetitive tasks"],
  ["customer_info", "Organizing customer information"],
  ["team", "Managing my team"],
  ["one_place", "Keeping everything in one place"],
  ["delivery", "Getting finished work to customers"],
  ["other", "Other"],
] as const;
export const FEATURES = [
  ["inbox", "Unified inbox"],
  ["calendar", "Calendar"],
  ["bookings", "Bookings"],
  ["automations", "Automations"],
  ["agent", "AI Business Agent"],
  ["team", "Team"],
  ["people", "Customer / people management"],
  ["files", "Files and delivery"],
] as const;
export const TOOLS = [
  ["gmail", "Gmail"],
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["google_calendar", "Google Calendar"],
  ["spreadsheets", "Spreadsheets"],
  ["crm", "Another CRM"],
  ["google_drive", "Google Drive"],
  ["dropbox", "Dropbox"],
  ["nothing", "Nothing"],
  ["multiple", "Multiple tools"],
] as const;
export const BOOKINGS_ANSWERS = [
  ["yes", "Yes"],
  ["no", "No"],
  ["sometimes", "Sometimes"],
] as const;
export const TEAM_USAGE = [
  ["no", "No, just me"],
  ["occasionally", "Yes, occasionally"],
  ["regularly", "Yes, regularly"],
] as const;

type Keys<T extends readonly (readonly [string, string])[]> = T[number][0];
export type UserType = Keys<typeof USER_TYPES>;
export type WorkCategory = Keys<typeof WORK_CATEGORIES>;
export type BusinessStatus = Keys<typeof BUSINESS_STATUSES>;
export type TeamSize = Keys<typeof TEAM_SIZES>;
export type Channel = Keys<typeof CHANNELS>;
export type PainPoint = Keys<typeof PAIN_POINTS>;
export type Feature = Keys<typeof FEATURES>;
export type Tool = Keys<typeof TOOLS>;
export type BookingsAnswer = Keys<typeof BOOKINGS_ANSWERS>;
export type TeamUsage = Keys<typeof TEAM_USAGE>;
export type PlanKey = "FREE" | "PRO" | "BUSINESS";

const keys = <T extends readonly (readonly [string, string])[]>(t: T) => t.map((o) => o[0]) as [Keys<T>, ...Keys<T>[]];
export const labelOf = <T extends readonly (readonly [string, string])[]>(t: T, key: string) => t.find((o) => o[0] === key)?.[1] ?? key;

export const answersSchema = z.object({
  userType: z.enum(keys(USER_TYPES)),
  workCategory: z.enum(keys(WORK_CATEGORIES)),
  workDetail: z.string().trim().max(80).optional(),
  businessStatus: z.enum(keys(BUSINESS_STATUSES)),
  teamSize: z.enum(keys(TEAM_SIZES)).optional(),
  channels: z.array(z.enum(keys(CHANNELS))).max(CHANNELS.length),
  painPoints: z.array(z.enum(keys(PAIN_POINTS))).max(PAIN_POINTS.length),
  desiredFeatures: z.array(z.enum(keys(FEATURES))).max(FEATURES.length),
  currentTools: z.array(z.enum(keys(TOOLS))).max(TOOLS.length),
  bookings: z.enum(keys(BOOKINGS_ANSWERS)),
  teamUsage: z.enum(keys(TEAM_USAGE)),
});
export type OnboardingAnswers = z.infer<typeof answersSchema>;

/** A partial draft, as the browser holds it between questions. */
export type AnswersDraft = Partial<OnboardingAnswers> & { displayName?: string };

export const planSchema = z.enum(["FREE", "PRO", "BUSINESS"]);

/** Whether the team-size question applies: only when someone else is involved at all. */
export function asksTeamSize(a: Pick<AnswersDraft, "businessStatus" | "teamUsage">): boolean {
  if (a.teamUsage === "occasionally" || a.teamUsage === "regularly") return true;
  return a.businessStatus === "business" || a.businessStatus === "team";
}

export type Provider = "EMAIL" | "INSTAGRAM" | "WHATSAPP" | "SMS" | "GOOGLE_CALENDAR" | "GOOGLE_DRIVE" | "DROPBOX";
export const PROVIDER_LABEL: Record<Provider, string> = { EMAIL: "Gmail", INSTAGRAM: "Instagram", WHATSAPP: "WhatsApp", SMS: "SMS", GOOGLE_CALENDAR: "Google Calendar", GOOGLE_DRIVE: "Google Drive", DROPBOX: "Dropbox" };

export type Personalization = {
  answers: OnboardingAnswers;
  /** Business-oriented path: they run, work in, or freelance as a business. */
  isBusiness: boolean;
  teamSize: TeamSize;
  /** Seats the answers imply: 1, 5 (2–5), 10 (6–10), 11 (more than ten). */
  seatsNeeded: number;
  usesBookings: boolean;
  usesTeam: boolean;
  wantsAI: boolean;
  wantsAutomations: boolean;
  wantsSms: boolean;
  /** Places customers reach them (every channel they ticked, "other" included). */
  channelCount: number;
  /** Connections Daythread would make for those channels — what Free's two-connection limit is measured against. */
  connectProviders: Provider[];
  recommendedPlan: PlanKey;
  /** Why, as sentences that only mention what they said. */
  reasons: string[];
  /** Two to four features, most important first. */
  priorities: Feature[];
};

const CHANNEL_PROVIDER: Partial<Record<Channel, Provider>> = { email: "EMAIL", instagram: "INSTAGRAM", whatsapp: "WHATSAPP", sms: "SMS" };
const TOOL_PROVIDER: Partial<Record<Tool, Provider>> = { gmail: "EMAIL", instagram: "INSTAGRAM", whatsapp: "WHATSAPP", google_calendar: "GOOGLE_CALENDAR", google_drive: "GOOGLE_DRIVE", dropbox: "DROPBOX" };

export function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function derivePersonalization(answers: OnboardingAnswers): Personalization {
  const a = answers;
  const has = <T,>(arr: T[], k: T) => arr.includes(k);
  const isBusiness = a.businessStatus === "business" || a.businessStatus === "team" || a.businessStatus === "solo" || (a.businessStatus === "other" && (a.userType === "business_owner" || a.userType === "agency" || a.userType === "service_provider"));
  const usesTeam = a.teamUsage === "occasionally" || a.teamUsage === "regularly";
  const teamSize: TeamSize = asksTeamSize(a) && a.teamSize ? a.teamSize : "just_me";
  const seatsNeeded = teamSize === "11_plus" ? 11 : teamSize === "6_10" ? 10 : teamSize === "2_5" ? 5 : 1;
  const usesBookings = a.bookings === "yes" || a.bookings === "sometimes";
  const wantsAI = has(a.desiredFeatures, "agent");
  const wantsAutomations = has(a.desiredFeatures, "automations") || has(a.painPoints, "repetitive");
  const wantsSms = has(a.channels, "sms");

  const providers: Provider[] = [];
  for (const c of a.channels) { const p = CHANNEL_PROVIDER[c]; if (p && !providers.includes(p)) providers.push(p); }
  for (const t of a.currentTools) { const p = TOOL_PROVIDER[t]; if (p && !providers.includes(p)) providers.push(p); }
  const channelCount = a.channels.length;
  const channelNames = a.channels.filter((c) => c !== "other").map((c) => labelOf(CHANNELS, c));

  // Plan. Business when Pro's five seats are not enough; Pro when they asked for something
  // only Pro has; Free otherwise — and always Free for personal use.
  const reasons: string[] = [];
  let recommendedPlan: PlanKey = "FREE";
  if (a.businessStatus === "personal") {
    reasons.push("You're exploring Daythread for yourself. Free has the inbox, calendar and bookings for one person.");
  } else if (seatsNeeded > 5) {
    recommendedPlan = "BUSINESS";
    reasons.push(teamSize === "11_plus" ? "More than ten people are involved. Pro seats five; Business seats ten, with roles and internal notes." : "Six to ten people are involved. Pro seats five; Business seats ten, with roles and internal notes.");
    reasons.push("Business adds the view across everyone's work — what's at risk and who owns what — every morning.");
  } else {
    if (providers.length > 2) reasons.push(`You reach customers on ${list(channelNames.length ? channelNames : providers.map((p) => PROVIDER_LABEL[p]))}. Free connects two of them; Pro connects all of them.`);
    if (wantsSms) reasons.push("Texting customers from your own number is part of Pro.");
    if (wantsAI) reasons.push("You'd like AI help with replies and follow-ups — drafts, summaries and the assistant are Pro.");
    if (usesTeam) reasons.push(a.teamUsage === "regularly" ? "You work with other people regularly. Pro puts up to five people on one inbox, with assignment." : "You sometimes work with other people. Pro lets up to five people share the inbox.");
    if (reasons.length > 0) {
      recommendedPlan = "PRO";
      if (wantsAutomations && (has(a.painPoints, "follow_ups") || has(a.painPoints, "repetitive"))) reasons.push("Unlimited automations for the follow-ups and repetitive messages you mentioned.");
    } else {
      reasons.push(`Free covers what you described: one inbox${channelNames.length ? ` for ${list(channelNames)}` : ""}, the calendar, bookings and three automations.`);
    }
  }

  // Priorities. Scores from the answers; the inbox is the product, so it always places.
  const score: Record<Feature, number> = { inbox: 6, calendar: 0, bookings: 0, automations: 0, agent: 0, team: 0, people: 0, files: 0 };
  score.inbox += Math.min(channelCount, 4) * 2 + (has(a.painPoints, "messages") ? 3 : 0) + (has(a.painPoints, "one_place") ? 3 : 0) + (has(a.desiredFeatures, "inbox") ? 3 : 0);
  score.bookings += (a.bookings === "yes" ? 7 : a.bookings === "sometimes" ? 4 : 0) + (has(a.desiredFeatures, "bookings") ? 3 : 0) + (has(a.painPoints, "bookings") ? 3 : 0);
  score.calendar += (has(a.painPoints, "scheduling") ? 4 : 0) + (has(a.desiredFeatures, "calendar") ? 3 : 0) + (a.bookings === "yes" ? 2 : 0) + (has(a.currentTools, "google_calendar") ? 2 : 0);
  score.automations += (has(a.desiredFeatures, "automations") ? 4 : 0) + (has(a.painPoints, "repetitive") ? 4 : 0) + (has(a.painPoints, "follow_ups") ? 3 : 0);
  score.agent += (wantsAI ? 5 : 0) + (has(a.painPoints, "messages") ? 1 : 0) + (has(a.painPoints, "follow_ups") ? 1 : 0);
  score.team += (a.teamUsage === "regularly" ? 5 : a.teamUsage === "occasionally" ? 3 : 0) + (has(a.desiredFeatures, "team") ? 3 : 0) + (has(a.painPoints, "team") ? 3 : 0);
  score.people += (has(a.desiredFeatures, "people") ? 4 : 0) + (has(a.painPoints, "customer_info") ? 4 : 0) + (has(a.currentTools, "spreadsheets") || has(a.currentTools, "crm") ? 2 : 0);
  // Sending finished work is the end of most of these businesses' jobs — photos, a report,
  // a design, a set of documents — so it ranks on what they said they do, not on a vertical.
  score.files += (has(a.desiredFeatures, "files") ? 4 : 0) + (has(a.painPoints, "delivery") ? 4 : 0) + (has(a.currentTools, "google_drive") || has(a.currentTools, "dropbox") ? 3 : 0);
  const order = FEATURES.map((f) => f[0]);
  const ranked = order.filter((f) => score[f] > 0).sort((x, y) => score[y] - score[x] || order.indexOf(x) - order.indexOf(y));
  const priorities = ranked.slice(0, 4);
  if (priorities.length < 2) priorities.push("calendar");

  return { answers, isBusiness, teamSize, seatsNeeded, usesBookings, usesTeam, wantsAI, wantsAutomations, wantsSms, channelCount, connectProviders: providers, recommendedPlan, reasons, priorities };
}

export const PRIORITY_COPY: Record<Feature, { title: string; blurb: string; href: string }> = {
  inbox: { title: "Inbox", blurb: "Bring your customer conversations together.", href: "/dashboard/inbox" },
  calendar: { title: "Calendar", blurb: "See your week and busy time in one place.", href: "/dashboard/calendar" },
  bookings: { title: "Bookings", blurb: "Keep appointments organized.", href: "/dashboard/bookings" },
  automations: { title: "Automations", blurb: "Reduce repetitive follow-ups.", href: "/dashboard/automations" },
  agent: { title: "Business Agent", blurb: "Get help handling business work.", href: "/dashboard/agent" },
  team: { title: "Team", blurb: "Share the inbox with the people you work with.", href: "/dashboard/settings?tab=team" },
  people: { title: "People", blurb: "Everyone's details and history in one place.", href: "/dashboard/clients" },
  files: { title: "Files", blurb: "Send finished work from the folder it already lives in.", href: "/dashboard/clients" },
};

/**
 * What "Building your Daythread" shows — one line per thing the server actually writes
 * when the profile is saved (see src/server/personalization.ts). Nothing decorative.
 */
export function buildSteps(p: Personalization): string[] {
  const steps = ["Saving how you work"];
  steps.push(`Ordering your workspace: ${list(p.priorities.map((f) => PRIORITY_COPY[f].title))}`);
  if (p.connectProviders.length) steps.push(`Marking ${list(p.connectProviders.map((x) => PROVIDER_LABEL[x]))} to connect`);
  steps.push(`Noting the plan that fits: ${p.recommendedPlan === "PRO" ? "Pro" : p.recommendedPlan === "BUSINESS" ? "Business" : "Free"}`);
  return steps;
}

/**
 * The paywall, made specific. Returns copy only when the person actually asked for the
 * thing behind this feature; otherwise the default feature copy stands.
 */
export function personalPaywallCopy(p: Personalization, plan: "PRO" | "BUSINESS"): { title: string; lede: string } | null {
  const a = p.answers;
  if (plan === "BUSINESS") {
    if (p.recommendedPlan !== "BUSINESS") return null;
    return { title: "Business fits your team.", lede: `${p.teamSize === "11_plus" ? "More than ten" : "Six to ten"} people are involved in your work. Business gives everyone a seat, roles and internal notes, and the view across all of their work.` };
  }
  const wants: string[] = [];
  const channelNames = a.channels.filter((c) => c !== "other").map((c) => labelOf(CHANNELS, c));
  if (p.wantsAI) wants.push("AI-assisted replies");
  if (p.wantsAutomations) wants.push("automations");
  if (p.usesTeam) wants.push("your team on one inbox");
  if (p.wantsSms) wants.push("texting from your own number");
  if (channelNames.length < 2 && wants.length === 0) return null;
  const managing = channelNames.length >= 2 ? `You're managing customers across ${list(channelNames)}` : null;
  const wanting = wants.length ? `you want ${list(wants)}` : null;
  const lede = `${[managing, wanting].filter(Boolean).join(managing && wanting ? " and " : "").replace(/^you/, "You")}. Pro unlocks the tools you selected during setup.`;
  return { title: "Pro fits the way you work.", lede };
}
