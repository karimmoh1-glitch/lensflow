/**
 * The things Karim has built. Status lines are only set where they were verified publicly
 * (the live site and, for InternOps, the GitHub releases); no usage numbers of any kind.
 */

export type ProjectSlug = "daythread" | "rushd" | "internops";

export type Project = {
  slug: ProjectSlug;
  name: string;
  /** Only the role Karim stated. */
  role: string;
  /** A few words: what it is (share image). */
  tagline: string;
  /** One line: what it is. */
  summary: string;
  /** Meta description. */
  description: string;
  whatItIs: string[];
  problem: string;
  quote: { label: string; text: string } | null;
  list: { label: string; items: string[] } | null;
  notes: string[];
  site: { label: string; url: string };
  repository: { label: string; url: string };
  /** Verified status, or null when nothing is verified. */
  status: string | null;
  applicationCategory: "BusinessApplication" | "EducationalApplication";
};

export const projects: readonly Project[] = [
  {
    slug: "daythread",
    name: "Daythread",
    role: "Founder and builder",
    tagline: "Business software for service businesses",
    summary: "Business software for service businesses: conversations, bookings, workflows and connected tools in one place.",
    description:
      "Daythread is business software for service businesses, founded and built by Karim Mohamed. Customer conversations, bookings, calendars, workflows and connected tools in one workspace.",
    whatItIs: [
      "Daythread helps service businesses manage customer conversations, bookings, workflows and connected business tools in one place.",
      "It brings conversations, bookings, calendars, workflows and connected tools into one workspace, with AI that helps a business understand each conversation and work out what should happen next.",
    ],
    problem:
      "A conversation with a customer should lead naturally to what happens next. That is much easier when the conversation, the booking, the calendar and the workflow sit in the same place.",
    quote: { label: "The idea", text: "Business conversations should naturally lead to business actions." },
    list: {
      label: "What I've worked on",
      items: ["Architecture", "Interface", "Security", "Integrations", "Automation systems", "Onboarding", "Infrastructure", "Testing"],
    },
    notes: ["Built in public on GitHub. The repository began in 2026 as LensFlow and was renamed Daythread in its first days."],
    site: { label: "daythread.org", url: "https://daythread.org" },
    repository: { label: "karimmoh1-glitch/lensflow", url: "https://github.com/karimmoh1-glitch/lensflow" },
    status: "Live at daythread.org",
    applicationCategory: "BusinessApplication",
  },
  {
    slug: "rushd",
    name: "Rushd",
    role: "Creator",
    tagline: "Academic planning for high-school students",
    summary: "Academic planning for high-school students: a prioritized plan, so they know what to work on next.",
    description:
      "Rushd, created by Karim Mohamed, is academic planning for high-school students. It turns assignments, exams, deadlines and available study time into a prioritized plan.",
    whatItIs: [
      "Rushd is an academic planning tool for high-school students.",
      "It takes scattered assignments, exams, deadlines and the study time a student actually has, and turns them into a prioritized plan.",
    ],
    problem: "With work scattered across classes and deadlines, the hard part is knowing what to work on next. Rushd answers that question.",
    quote: {
      label: "The approach",
      text: "Start with a problem you understand deeply, then build a tool that actually makes the problem easier.",
    },
    list: null,
    notes: [],
    site: { label: "therushd.com", url: "https://therushd.com" },
    repository: { label: "karimmoh1-glitch/Rushd", url: "https://github.com/karimmoh1-glitch/Rushd" },
    status: "Live at therushd.com",
    applicationCategory: "EducationalApplication",
  },
  {
    slug: "internops",
    name: "InternOps",
    role: "Builder",
    tagline: "Internship management for organizations",
    summary: "An internship-management platform for organizations that run intern programs.",
    description:
      "InternOps, built by Karim Mohamed, is an internship-management platform that helps organizations manage interns, assignments, work sessions, proposals, alumni, certificates and communication.",
    whatItIs: [
      "InternOps is an internship-management platform. It helps organizations run their intern programs from one place.",
      "It has a web app and an Electron desktop companion.",
    ],
    problem: "An internship program has many moving parts to keep track of. InternOps keeps them together.",
    quote: null,
    list: {
      label: "What it manages",
      items: ["Interns", "Assignments", "Work sessions", "Proposals", "Alumni", "Certificates", "Communication"],
    },
    notes: [],
    site: { label: "internops-refined-1.onrender.com", url: "https://internops-refined-1.onrender.com" },
    repository: { label: "karimmoh1-glitch/internops-refined", url: "https://github.com/karimmoh1-glitch/internops-refined" },
    status: "Live, with releases v1.0.0 to v1.3.0",
    applicationCategory: "BusinessApplication",
  },
];

/** The params for /karim-mohamed/projects/[slug]; the page exports these as generateStaticParams. */
export function projectStaticParams(): { slug: ProjectSlug }[] {
  return projects.map((p) => ({ slug: p.slug }));
}

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}
