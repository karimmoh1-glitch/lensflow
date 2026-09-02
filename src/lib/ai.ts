import OpenAI from "openai";

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export const aiEnabled = Boolean(client);

// ─────────────────────────────────────────────────────────────────────────
// Lead extraction — pulls structured fields out of a raw inbound message.
// Unknown fields stay null. Never invented, whether AI or rule-based.
// ─────────────────────────────────────────────────────────────────────────

export type ExtractedLead = {
  name: string | null;
  serviceHint: string | null;
  dateText: string | null;
  location: string | null;
  budgetCents: number | null;
  intent: "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH";
};

const EXTRACTION_SYSTEM_PROMPT = `You extract structured lead information from a service business's inbound client message.
Return ONLY fields you can directly infer from the text. If a field is not mentioned, use null — never guess or invent.
"intent" reflects how ready-to-book the sender sounds: HIGH (asking to book / confirm a date), MEDIUM (asking pricing/availability), LOW (browsing / vague), UNKNOWN (can't tell).`;

export async function extractLeadInfo(messageText: string): Promise<ExtractedLead> {
  if (client) {
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Message: """${messageText}"""\n\nRespond as JSON: {"name": string|null, "serviceHint": string|null, "dateText": string|null, "location": string|null, "budgetCents": number|null, "intent": "UNKNOWN"|"LOW"|"MEDIUM"|"HIGH"}`,
          },
        ],
      });
      const raw = completion.choices[0]?.message?.content;
      if (raw) return { ...emptyExtraction(), ...JSON.parse(raw) };
    } catch (err) {
      console.error("[ai] extraction failed, falling back to rules", err);
    }
  }
  return ruleBasedExtraction(messageText);
}

function emptyExtraction(): ExtractedLead {
  return { name: null, serviceHint: null, dateText: null, location: null, budgetCents: null, intent: "UNKNOWN" };
}

const SERVICE_KEYWORDS: Record<string, string[]> = {
  graduation: ["graduation", "grad photos", "cap and gown"],
  wedding: ["wedding", "engagement", "bride", "groom"],
  family: ["family session", "family photos", "family shoot"],
  portrait: ["portrait", "headshot"],
  newborn: ["newborn", "maternity", "baby photos"],
  event: ["event", "party", "corporate"],
};

const DATE_PATTERN =
  /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|next\s+(?:week|month|weekend)|this\s+weekend|tomorrow)\b/i;

const HIGH_INTENT = /\b(book|reserve|hold the date|sign me up|let'?s do it|confirm|deposit)\b/i;
const MEDIUM_INTENT = /\b(how much|price|pricing|cost|available|availability|rates?)\b/i;

function ruleBasedExtraction(text: string): ExtractedLead {
  const lower = text.toLowerCase();

  const nameMatch = text.match(/\b(?:i'?m|this is|my name is)\s+([A-Z][a-z]+)/);
  const name = nameMatch ? nameMatch[1] : null;

  let serviceHint: string | null = null;
  for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      serviceHint = service;
      break;
    }
  }

  const dateMatch = text.match(DATE_PATTERN);
  const dateText = dateMatch ? dateMatch[0] : null;

  const budgetMatch = text.match(/\$\s?(\d{2,5})/);
  const budgetCents = budgetMatch ? parseInt(budgetMatch[1], 10) * 100 : null;

  const locationMatch = text.match(/\b(?:at|in)\s+([A-Z][a-zA-Z\s]{2,25}?)(?:[.,!?]|$)/);
  const location = locationMatch ? locationMatch[1].trim() : null;

  let intent: ExtractedLead["intent"] = "UNKNOWN";
  if (HIGH_INTENT.test(lower)) intent = "HIGH";
  else if (MEDIUM_INTENT.test(lower)) intent = "MEDIUM";
  else if (dateText || serviceHint) intent = "LOW";

  return { name, serviceHint, dateText, location, budgetCents, intent };
}

// ─────────────────────────────────────────────────────────────────────────
// Reply drafting — grounded in the business's actual services/pricing/policies.
// ─────────────────────────────────────────────────────────────────────────

export type ReplyContext = {
  businessName: string;
  services: { name: string; priceCents: number; durationMins: number }[];
  customerMessage: string;
  customerName?: string | null;
  depositPercent: number;
};

export async function draftReply(ctx: ReplyContext): Promise<string> {
  if (client) {
    try {
      const servicesList = ctx.services
        .map((s) => `- ${s.name}: $${(s.priceCents / 100).toFixed(0)} (${s.durationMins} min)`)
        .join("\n");
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: `You are drafting a short, warm, professional reply on behalf of ${ctx.businessName}, an independent service business. Keep it under 80 words. Only quote prices/services from the list given. Sign off naturally, no placeholders like [Your Name]. A deposit of ${ctx.depositPercent}% is required to hold a date if relevant.\n\nServices:\n${servicesList}`,
          },
          { role: "user", content: `Customer${ctx.customerName ? ` (${ctx.customerName})` : ""} wrote: """${ctx.customerMessage}"""` },
        ],
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (text) return text;
    } catch (err) {
      console.error("[ai] reply drafting failed, falling back to template", err);
    }
  }
  return ruleBasedReply(ctx);
}

function ruleBasedReply(ctx: ReplyContext): string {
  const greeting = ctx.customerName ? `Hi ${ctx.customerName}!` : "Hi there!";
  const lower = ctx.customerMessage.toLowerCase();
  const mentioned = ctx.services.find((s) => lower.includes(s.name.toLowerCase().split(" ")[0]));
  if (mentioned) {
    return `${greeting} Thanks for reaching out. Our ${mentioned.name} is $${(mentioned.priceCents / 100).toFixed(0)} and runs about ${mentioned.durationMins} minutes. I'd love to get you on the calendar — a ${ctx.depositPercent}% deposit holds your date. What day were you thinking?`;
  }
  const list = ctx.services.slice(0, 3).map((s) => `${s.name} ($${(s.priceCents / 100).toFixed(0)})`).join(", ");
  return `${greeting} Thanks for reaching out! We offer ${list}. Let me know which one you're interested in and what date works for you, and I'll get you set up.`;
}

// ─────────────────────────────────────────────────────────────────────────
// Business copilot — answers questions grounded in the business's own data.
// The caller (server action) is responsible for fetching the actual facts;
// this just turns structured facts into a natural-language answer.
// ─────────────────────────────────────────────────────────────────────────

export async function summarizeCopilotAnswer(question: string, facts: string): Promise<string> {
  if (client) {
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are an independent business's copilot. Answer the owner's question using ONLY the facts provided. Be concise and direct — a few sentences or a short list. Never invent numbers or names not present in the facts.",
          },
          { role: "user", content: `Question: ${question}\n\nFacts:\n${facts}` },
        ],
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (text) return text;
    } catch (err) {
      console.error("[ai] copilot summarization failed, falling back to raw facts", err);
    }
  }
  return facts;
}
