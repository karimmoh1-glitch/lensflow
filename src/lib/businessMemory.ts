import { z } from "zod";

/**
 * "How Daythread should understand your business." Owner-written, never model-written:
 * these lines are handed to a draft as facts it may quote and must not contradict. The
 * model is told they are the only business facts it knows, so anything it needs and does
 * not find here it must ask for rather than invent.
 */
export const businessMemorySchema = z.object({
  tone: z.enum(["warm", "professional", "casual"]).default("warm"),
  about: z.string().trim().max(600).default(""),
  locations: z.string().trim().max(300).default(""),
  booking: z.string().trim().max(600).default(""),
  policies: z.string().trim().max(800).default(""),
  faqs: z.string().trim().max(1500).default(""),
});
export type BusinessMemory = z.infer<typeof businessMemorySchema>;

export const EMPTY_MEMORY: BusinessMemory = { tone: "warm", about: "", locations: "", booking: "", policies: "", faqs: "" };

export const TONE_LABEL: Record<BusinessMemory["tone"], string> = { warm: "Warm and friendly", professional: "Professional", casual: "Casual" };

/** Parses what is stored; anything malformed reads as empty rather than throwing at draft time. */
export function readBusinessMemory(raw: unknown): BusinessMemory {
  const parsed = businessMemorySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : EMPTY_MEMORY;
}

/** True when the owner has written anything at all. */
export function hasMemory(m: BusinessMemory): boolean {
  return Boolean(m.about || m.locations || m.booking || m.policies || m.faqs);
}

/**
 * The lines a prompt receives, labelled as the owner's own words. Bounded: each field is
 * already capped by the schema, and the whole block stays well under the input limit.
 */
export function memoryPromptLines(m: BusinessMemory): string[] {
  const lines: string[] = [];
  if (m.about) lines.push(`About the business (owner's words): ${m.about}`);
  if (m.locations) lines.push(`Areas served: ${m.locations}`);
  if (m.booking) lines.push(`How booking works: ${m.booking}`);
  if (m.policies) lines.push(`Policies: ${m.policies}`);
  if (m.faqs) lines.push(`Common questions and the owner's answers: ${m.faqs}`);
  return lines;
}
