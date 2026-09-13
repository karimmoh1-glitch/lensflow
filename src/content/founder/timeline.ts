/**
 * The order Karim described. Undated except where verified: Daythread's repository began in
 * 2026. Do not add dates that aren't established.
 */

export type TimelineEntry = {
  /** "Before and alongside", a verified year, "Next"… or null for no label. */
  when: string | null;
  title: string;
  detail: string;
  href: string | null;
};

export const timeline: readonly TimelineEntry[] = [
  {
    when: "Before and alongside",
    title: "InternOps",
    detail: "An internship-management platform for organizations.",
    href: "/karim-mohamed/projects/internops",
  },
  {
    when: "Before and alongside",
    title: "EdAI hackathon",
    detail: "My team placed second.",
    href: null,
  },
  {
    when: null,
    title: "Rushd",
    detail: "Academic planning for high-school students.",
    href: "/karim-mohamed/projects/rushd",
  },
  {
    when: "2026 – now",
    title: "Daythread",
    detail: "Business software for service businesses. My main focus.",
    href: "/karim-mohamed/projects/daythread",
  },
  {
    when: "Next",
    title: "Computer engineering and robotics",
    detail: "Deeper work where software meets hardware.",
    href: null,
  },
];
