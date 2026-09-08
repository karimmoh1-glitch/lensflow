/**
 * What a draft is for. Each mode is one instruction added to the same grounded prompt —
 * the same services, the same owner-written notes, the same rule that nothing is promised
 * or invented. Client-safe so the composer can offer them and the action can validate.
 */
export const DRAFT_MODES = [
  ["reply", "Reply", "Answer what they asked."],
  ["follow_up", "Follow up", "A short, friendly nudge on a thread that went quiet."],
  ["ask_missing", "Ask what's missing", "Ask for the date, place, headcount or budget the message left out."],
  ["send_pricing", "Send pricing", "Answer with the relevant services and prices from the list."],
  ["confirm_booking", "Confirm booking", "Confirm what was agreed and say what happens next."],
  ["handle_objection", "Handle a concern", "Address a hesitation about price, timing or fit, honestly."],
  ["close", "Wrap up", "Close the conversation politely when there is nothing further to do."],
] as const;

export type DraftMode = (typeof DRAFT_MODES)[number][0];

export function isDraftMode(v: unknown): v is DraftMode {
  return typeof v === "string" && DRAFT_MODES.some(([k]) => k === v);
}

export const DRAFT_MODE_INSTRUCTION: Record<DraftMode, string> = {
  reply: "Answer what the person actually asked.",
  follow_up: "This is a follow-up on a conversation that went quiet after the business replied. Be brief and friendly, refer to what they originally asked, and make it easy to answer with a yes or a date. Do not apologize excessively.",
  ask_missing: "The message is missing details needed to quote or book. Ask for exactly the missing ones — date, location, how many people, or budget — in one short message. Do not invent any of them.",
  send_pricing: "They asked about cost. Quote only from the services list given; if it is empty, say the owner will send pricing shortly. Never invent a price.",
  confirm_booking: "Confirm the booking details that appear in the conversation — service, date, time, place — and say what happens next. Do not state anything as confirmed that the conversation does not show.",
  handle_objection: "They have a hesitation about price, timing or fit. Acknowledge it plainly, give one honest reason to proceed grounded in the business notes, and offer a next step. Never discount or promise what the notes do not say.",
  close: "Wrap the conversation up warmly in one or two sentences, leaving the door open to write again.",
};
