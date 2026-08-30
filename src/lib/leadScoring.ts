import type { LeadIntent } from "@prisma/client";

export type ScoringInput = {
  intent: LeadIntent;
  hasRequestedDate: boolean;
  requestedDate: Date | null;
  serviceValueCents: number;
  hoursSinceLastInbound: number;
  hasRespondedYet: boolean;
  fieldsKnownCount: number; // how many of {name, service, date, location, budget} are known
};

export type ScoreResult = { score: number; reasons: string[] };

/** Every point is explainable — no opaque model. */
export function scoreLead(input: ScoringInput): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  const intentPoints: Record<LeadIntent, number> = { HIGH: 35, MEDIUM: 20, LOW: 8, UNKNOWN: 0 };
  if (intentPoints[input.intent] > 0) {
    score += intentPoints[input.intent];
    reasons.push(`${input.intent === "HIGH" ? "Ready to book" : input.intent === "MEDIUM" ? "Asking about pricing/availability" : "Early-stage interest"} (+${intentPoints[input.intent]})`);
  }

  if (input.hasRequestedDate) {
    score += 15;
    reasons.push("Gave a specific date (+15)");
    if (input.requestedDate) {
      const daysOut = (input.requestedDate.getTime() - Date.now()) / 86_400_000;
      if (daysOut >= 0 && daysOut <= 45) {
        score += 10;
        reasons.push("Date is coming up soon (+10)");
      }
    }
  }

  if (input.serviceValueCents >= 100_000) {
    score += 20;
    reasons.push("High-value service (+20)");
  } else if (input.serviceValueCents >= 30_000) {
    score += 12;
    reasons.push("Mid-value service (+12)");
  } else if (input.serviceValueCents > 0) {
    score += 6;
    reasons.push("Standard service (+6)");
  }

  const completeness = Math.min(input.fieldsKnownCount, 5);
  if (completeness > 0) {
    score += completeness * 3;
    reasons.push(`Inquiry has ${completeness}/5 key details (+${completeness * 3})`);
  }

  if (!input.hasRespondedYet && input.hoursSinceLastInbound > 4) {
    score -= 10;
    reasons.push("No response sent yet (-10)");
  }

  if (input.hoursSinceLastInbound > 24 * 5) {
    score -= 15;
    reasons.push("Gone quiet for 5+ days (-15)");
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function scoreLabel(score: number): "HOT" | "WARM" | "COOL" {
  if (score >= 70) return "HOT";
  if (score >= 40) return "WARM";
  return "COOL";
}
