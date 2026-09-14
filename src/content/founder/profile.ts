/**
 * Every visible sentence on the founder profile lives here, written in the third person.
 *
 * Sources, in order of authority:
 *  1. The biography Karim supplied (identity, projects, EdAI, activities, coursework).
 *  2. docs/karim-founder-biography-brief.md in this repository.
 *  3. Public, checkable evidence: github.com/karimmoh1-glitch, therushd.com, daythread.org,
 *     and this repository itself (commit and test counts, dated below).
 *
 * `founder.test.ts` enforces the rules: no first-person words in prose, no status adjectives,
 * no email addresses, GitHub as the only sameAs. Add a fact only when it has a source above.
 */

export type Link = { label: string; href: string };

/** A chapter diagram node: a label, and an optional short note under it. */
export type Node = { label: string; note?: string };

export const person = {
  name: "Karim Mohamed",
  givenName: "Karim",
  familyName: "Mohamed",
  location: "Seattle area, Washington",
  path: "/founder",
  jobTitle: "Founder, Daythread",
  github: "https://github.com/karimmoh1-glitch",
  description:
    "Karim Mohamed is a young entrepreneur and software builder from the Seattle area. He founded Daythread, created Rushd and built InternOps, and his work is moving toward computer engineering, robotics and intelligent machines.",
  knowsAbout: [
    "Software engineering",
    "Artificial intelligence",
    "Automation",
    "Computer engineering",
    "Embedded systems",
    "Computer architecture",
    "Computer vision",
    "Robotics",
  ],
} as const;

export const hero = {
  kicker: "A profile",
  line: ["From software", "to machines."],
  lede: "Karim Mohamed is a young entrepreneur and software builder from the Seattle area. He founded Daythread, created Rushd and built InternOps: working systems for small businesses, high-school students and internship programs.",
  follow: "His direction runs deeper than the products. It points toward computer engineering, robotics and machines that act on what they understand.",
  /** The trajectory rail. `state` is what the evidence supports, not what sounds best. */
  trajectory: [
    { label: "Software", state: "built", note: "Three systems deployed" },
    { label: "Computing", state: "studying", note: "Foundations in progress" },
    { label: "Hardware", state: "next", note: "Direction" },
    { label: "AI", state: "applied", note: "Applied inside products" },
    { label: "Robotics", state: "next", note: "Direction" },
    { label: "Intelligent machines", state: "next", note: "Long-term aim" },
  ] as Array<{ label: string; state: "built" | "studying" | "applied" | "next"; note: string }>,
};

export const who = {
  index: "01",
  label: "The builder",
  lede: "Karim turns messy, everyday problems into working systems.",
  paragraphs: [
    "He started with software because it was the fastest way to turn an idea into something real. That choice has already produced a business platform, an academic planner and an internship-management system, each with its own data, workflows and failure modes to reason about.",
    "Karim is still early in his career, and the work does not hide that. What stands out is the direction of travel: each project has pulled him further from individual features and toward whole systems — how information arrives, how it is understood, and what should happen next.",
  ],
  /** What the three systems cover between them, by project. Scope, not seniority. */
  ledger: [
    { area: "Product architecture", in: ["Daythread"] },
    { area: "Frontend and backend engineering", in: ["Daythread"] },
    { area: "Authentication and authorization", in: ["Daythread"] },
    { area: "Database-backed workflows", in: ["Daythread"] },
    { area: "Integrations and automation", in: ["Daythread"] },
    { area: "Security and testing", in: ["Daythread"] },
    { area: "Infrastructure and deployment", in: ["Daythread", "Rushd", "InternOps"] },
    { area: "Planning and prioritization", in: ["Rushd"] },
    { area: "Program operations and administration", in: ["InternOps"] },
  ],
};

export const daythread = {
  index: "02",
  label: "Daythread",
  role: "Founder and builder",
  url: "https://daythread.org",
  repository: "https://github.com/karimmoh1-glitch/lensflow",
  title: "Communication becomes action.",
  lede: "Daythread is a business operating system for freelancers and small businesses. It begins where their work actually begins: in conversations with clients.",
  paragraphs: [
    "A client writes, “Are you free Saturday afternoon?” Normally the owner reads the message, opens a calendar, checks for conflicts, writes back, and later creates the booking by hand. Daythread is designed so the software understands the intent, gathers the context and prepares the next step.",
    "The owner stays in control. Nothing is sent or booked on a guess; the prepared action waits for a person to approve it.",
  ],
  example: {
    caption: "How a message moves through Daythread. Illustrative example.",
    message: "Are you free Saturday afternoon?",
    steps: [
      { label: "Intent", note: "A request for availability" },
      { label: "Context", note: "Saturday afternoon on the calendar" },
      { label: "Decision", note: "Offer the times that are open" },
      { label: "Action", note: "A reply, prepared and waiting for approval" },
    ] as Node[],
  },
  principle: "AI proposes. The human approves.",
  principleNote: "The rule the product is built around.",
  workflowCaption: "The client journey Daythread is organized around",
  workflow: ["Lead", "Contact", "Booking", "Payment", "Project", "Files", "Delivery", "Follow-up"],
  scopeIntro: "Karim’s work on Daythread spans the whole stack of a production application:",
  scope: [
    "Product architecture",
    "Frontend engineering",
    "Backend engineering",
    "Authentication",
    "Authorization",
    "Database-backed workflows",
    "Integrations",
    "Automation",
    "Interface design",
    "Security",
    "Testing",
    "Infrastructure and deployment",
    "Product strategy",
  ],
  /** Counted from the Daythread repository on 13 September 2026 (280 commits, 894 tests). */
  evidence: [
    { figure: "280+", label: "commits since the first one on 30 August 2026" },
    { figure: "890+", label: "automated tests in the suite" },
  ],
  evidenceNote: "Counted from the public repository, September 2026.",
  screenshot: {
    src: "/founder/daythread-inbox.jpg",
    width: 1600,
    height: 1000,
    alt: "Daythread’s inbox on a demo workspace: client conversations from email, Instagram and text messages on the left, one conversation open in the middle, and on the right the intent Daythread read in the message and the next action it suggests.",
    caption: "Daythread’s inbox on a demo workspace with sample clients. The right-hand panel shows what the software read in the latest message and the action it suggests.",
  },
};

export const rushd = {
  index: "03",
  label: "Rushd",
  role: "Creator and builder",
  url: "https://therushd.com",
  title: "Academics are fragmented.",
  lede: "Rushd is an academic planning platform for high-school students.",
  paragraphs: [
    "A student’s week is scattered across classes, assignments, exams, deadlines and whatever time is actually free. Rushd takes those pieces and turns them into a prioritized plan — one that can adapt when the week changes.",
    "It reflects a habit that runs through Karim’s work: begin with a problem he understands closely, then build the system that makes it easier.",
  ],
  inputs: ["Classes", "Assignments", "Exams", "Deadlines", "Available time"],
  output: { label: "A prioritized plan", note: "What to work on next, re-ordered as things change" },
};

export const internops = {
  index: "04",
  label: "InternOps",
  role: "Builder",
  repository: "https://github.com/karimmoh1-glitch/internops-refined",
  title: "Operations are a system too.",
  lede: "InternOps is an internship-management platform Karim built for programs associated with EdAI.",
  paragraphs: [
    "An internship program has more moving parts than it first appears: who the interns are, what they are assigned, when they worked, what they proposed, how they are reached, and what they leave with. InternOps brings those parts into one administered system.",
    "The platform has been deployed, and Karim is preparing it for broader public use by organizations that run structured internship programs.",
  ],
  modules: ["Interns", "Task assignment", "Work sessions", "Proposals", "Communication", "Admin dashboards", "Progress tracking", "Alumni", "Certificates"],
  output: "An operating system for an internship program",
};

export const edai = {
  index: "05",
  label: "EdAI",
  result: "2nd",
  resultLabel: "Place, EdAI hackathon",
  prize: "$1,000",
  prizeLabel: "Group prize, shared by the team",
  paragraphs: [
    "Karim’s work in AI and education runs through EdAI, including an internship spent on software and AI projects as part of a team.",
    "At an EdAI hackathon, his team placed second and received a $1,000 group prize.",
  ],
};

export const bigIdea = {
  label: "Direction",
  lines: [
    "Software was the beginning.",
    "Computing is the foundation.",
    "Hardware changes the boundary.",
    "Intelligence changes what machines can do.",
    "Robotics brings it into the physical world.",
  ],
  note: "A statement of direction, not a list of accomplishments.",
};

export const systems = {
  index: "06",
  label: "Systems",
  from: "How do you build an app?",
  to: "How do you build a system that understands, decides and acts?",
  paragraphs: [
    "Daythread already works on a small version of that question. A message comes in, the software reads it, and an action is prepared.",
    "Karim’s interest is in what happens when the same loop leaves the screen: when the input comes from sensors instead of a conversation, and the action moves something in the physical world.",
  ],
  stages: ["Input", "Computation", "Perception", "Decision", "Action"],
  rows: [
    { label: "On a screen", state: "built", cells: ["A client message", "Software", "Reading intent", "Choosing a reply", "A prepared reply"] },
    { label: "In the world", state: "direction", cells: ["Sensors", "Embedded hardware", "Vision and models", "Planning", "Motion"] },
  ] as Array<{ label: string; state: "built" | "direction"; cells: string[] }>,
  rowNotes: { built: "Built, in Daythread", direction: "Direction" },
};

export const foundation = {
  index: "07",
  label: "Foundation",
  title: "Building the foundation.",
  subjects: ["Mathematics", "Physics", "Chemistry", "Computer science", "Economics", "Writing"],
  paragraph:
    "Karim is a high-school student on a deliberately technical path, taking college courses at Bellevue College alongside advanced high-school coursework. The mathematics, science and computing underneath engineering are being built on purpose, not in passing.",
  current: [
    { course: "AP Calculus AB", where: "" },
    { course: "Intro to Physics 1", where: "Bellevue College" },
    { course: "AP Chemistry", where: "" },
    { course: "AP Microeconomics and Macroeconomics", where: "" },
    { course: "AP U.S. History", where: "" },
    { course: "English 101", where: "Bellevue College" },
    { course: "AP Computer Science A", where: "Independent study" },
  ],
  results: [
    { exam: "AP Computer Science Principles", score: "5" },
    { exam: "AP World History", score: "5" },
  ],
};

export const next = {
  index: "08",
  label: "Next",
  title: "The next system.",
  paragraph:
    "The products Karim has built are a foundation rather than a destination. His next chapter is aimed at the layers beneath software and beyond the screen.",
  fields: [
    "Computer engineering",
    "Electrical and computer engineering",
    "Computer architecture",
    "Embedded systems",
    "Artificial intelligence",
    "Computer vision",
    "Autonomous systems",
    "Robotic manipulation",
    "Human–robot interaction",
  ],
  close: "Robotics is where those fields meet, and it is the direction Karim is now pursuing.",
};

export const background = {
  index: "09",
  label: "Background",
  entries: [
    { name: "Daythread", role: "Founder and builder", detail: "Business operating system for freelancers and small businesses." },
    { name: "Rushd", role: "Creator and builder", detail: "Academic planning for high-school students." },
    { name: "InternOps", role: "Builder", detail: "Internship-management platform, deployed." },
    { name: "EdAI", role: "Internship and hackathon", detail: "Hackathon team placed second; $1,000 group prize." },
    { name: "Research exploration", role: "Through PathIvy", detail: "Exploring computer vision, graphics, interaction and robotics." },
    { name: "Robotics", role: "Emerging direction", detail: "Pursuing hands-on robotics involvement." },
    { name: "Soccer referee", role: "Officiating", detail: "Real-time decisions that have to be made clearly and explained calmly." },
    { name: "School", role: "Selected activities", detail: "Chemistry Club, the Technology Student Association, Yearbook and community service." },
  ],
};

export const contact = {
  index: "10",
  label: "Contact",
  focus: ["Software", "AI", "Computer engineering", "Robotics"],
  links: [
    { label: "GitHub", href: "https://github.com/karimmoh1-glitch" },
    { label: "Daythread", href: "https://daythread.org" },
    { label: "Rushd", href: "https://therushd.com" },
  ] as Link[],
};

export const nav: Link[] = [
  { label: "Work", href: "#work" },
  { label: "Direction", href: "#direction" },
  { label: "Background", href: "#background" },
  { label: "Contact", href: "#contact" },
];

/** Every string above that a visitor reads as prose. Used by the tests. */
export function allProse(): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  [person.description, hero, who, daythread, rushd, internops, edai, bigIdea, systems, foundation, next, background, contact].forEach(walk);
  return out;
}
