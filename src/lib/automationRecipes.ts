import type { AutomationInput } from "@/app/actions/automations";

/** The starting points both the web editor and the app offer. */
export const AUTOMATION_RECIPES: Array<{ key: string; label: string; input: AutomationInput }> = [
  { key: "confirm", label: "Confirm every booking", input: { name: "Booking confirmation", trigger: "BOOKING_CREATED", action: "SEND_CONFIRMATION", offsetHours: 0, messageTemplate: "Hi {{name}} — you're booked for {{service}} on {{date}} at {{time}} with {{business}}. Reply here if anything changes. See you then!" } },
  { key: "remind", label: "Remind the day before", input: { name: "Day-before reminder", trigger: "DAYS_BEFORE_SHOOT", action: "SEND_REMINDER", offsetHours: 24, messageTemplate: "Hi {{name}} — a reminder that your {{service}} is tomorrow, {{date}} at {{time}}. Reply here with any questions." } },
  { key: "thanks", label: "Thank them afterwards", input: { name: "Thank-you", trigger: "SHOOT_COMPLETED", action: "SEND_THANK_YOU", offsetHours: 24, messageTemplate: "Thank you, {{name}} — it was a pleasure. I'll be in touch as soon as everything is ready. — {{business}}" } },
  { key: "quiet", label: "Follow up when a lead goes quiet", input: { name: "Quiet-lead follow-up", trigger: "LEAD_INACTIVE", action: "SEND_FOLLOW_UP", offsetHours: 72, messageTemplate: "Hi {{name}} — just checking in from {{business}}. Happy to hold a date or answer anything. Is this still on your mind?" } },
];

export const AUTOMATION_VARIABLES = ["name", "service", "date", "time", "business"];
