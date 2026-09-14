/**
 * Every visible sentence on Karim Mohamed's profile lives here, written in the third person.
 *
 * The page is about identity and trajectory, not credentials: no coursework, scores, clubs,
 * activity lists, skills lists or awards section. Sources: the biography Karim supplied,
 * docs/karim-founder-biography-brief.md, and public evidence (github.com/karimmoh1-glitch,
 * therushd.com, daythread.org, and this repository's own history, counted 13 September 2026).
 *
 * `founder.test.ts` enforces the rules. Add a fact only when it has a source above.
 */

export type Link = { label: string; href: string };

export const person = {
  name: "Karim Mohamed",
  givenName: "Karim",
  familyName: "Mohamed",
  location: "Seattle area, Washington",
  path: "/founder",
  jobTitle: "Founder, Daythread",
  github: "https://github.com/karimmoh1-glitch",
  description:
    "Karim Mohamed is a young entrepreneur and software builder from the Seattle area who likes turning ideas into working systems. He founded Daythread, and his work is moving toward computer engineering, hardware, artificial intelligence and robotics.",
  knowsAbout: ["Software engineering", "Product design", "Automation", "Artificial intelligence", "Computer engineering", "Robotics"],
} as const;

export const hero = {
  kicker: "A profile",
  line: ["A builder,", "moving toward engineering."],
  lede: "Karim Mohamed is a young entrepreneur and software builder from the Seattle area who likes turning ideas into working systems.",
  paragraphs: [
    "Most of his work so far has happened in software: building products, experimenting with AI, untangling operational problems and learning by shipping. The deeper pull has always been underneath the interface — how computation works, how software reaches the physical world, and how a machine might perceive, decide and act.",
    "That curiosity is steering him toward computer engineering, hardware, artificial intelligence and robotics.",
  ],
};

export const origin = {
  index: "01",
  label: "Beginnings",
  title: "It starts with wanting the idea to exist.",
  paragraphs: [
    "Karim has always been drawn to building things. The appeal was never a particular language or framework. It is the moment an idea that existed only in his head becomes something that runs, responds, and can be handed to someone else.",
    "Software was the first place that could happen quickly. A problem noticed in the afternoon could be sketched by evening and running, imperfectly, the next day. Some of those experiments became products he still works on. All of them changed the way he approaches a problem.",
  ],
};

export const method = {
  index: "02",
  label: "Method",
  title: "The way he builds.",
  paragraphs: [
    "Karim learns by making. He runs into a problem, gets curious about why it exists, and starts building before every answer is known.",
    "The first version is never right. He tests it, something breaks, and the fix exposes a better question. The product changes, then the architecture underneath it. The idea only becomes clear in the act of implementing it.",
  ],
  close: "That loop is not the cost of the work. For Karim, it is most of the attraction.",
  loop: ["Notice a problem", "Get curious", "Build a first version", "Test it", "Watch it break", "Fix and rethink", "Ship", "Learn what was wrong"],
};

export const daythread = {
  index: "03",
  label: "Daythread",
  role: "Founder",
  url: "https://daythread.org",
  repository: "https://github.com/karimmoh1-glitch/lensflow",
  title: "Turning conversations into action.",
  lede: "Karim founded Daythread to rethink how freelancers and small businesses manage the conversations — and all the operational work — that surround their customers.",
  paragraphs: [
    "For a photographer, a coach or a small studio, the business runs through messages: a question on Instagram, a text about rescheduling, an email asking about a date. Around those messages sit calendars, bookings, follow-ups and a scattering of disconnected tools. Daythread brings them into one workspace.",
    "Take a client who writes, “Are you free Saturday afternoon?” Displaying that message is the easy part. The interesting problem is understanding what is being asked, connecting it to the calendar and the business’s workflows, and helping turn the conversation into an action — while the owner still decides what happens.",
  ],
  flow: {
    caption: "The idea at the center of Daythread. Illustrative example.",
    message: "Are you free Saturday afternoon?",
    steps: [
      { label: "Conversation", note: "A client asks about availability" },
      { label: "Understanding", note: "The intent, the day, the calendar, the service" },
      { label: "Action", note: "A reply with open times, prepared for the owner to approve" },
    ],
  },
  principle: ["AI proposes.", "The owner decides."],
  building: [
    "Building Daythread has meant working across the whole system at once. Karim shaped the product architecture and the interface, wrote the frontend and the backend, and connected the integrations and automation that let messages from different channels land in one place.",
    "Much of the work is the part nobody sees: authentication and security, testing, infrastructure and deployment. The product strategy moves with the code; each version clarifies what Daythread should become, and what it should refuse to do.",
  ],
  evidence: "Developed in public: more than 280 commits and more than 890 automated tests since the first commit on 30 August 2026.",
  screenshot: {
    src: "/founder/daythread-inbox.jpg",
    width: 1600,
    height: 1000,
    alt: "Daythread’s inbox on a demo workspace: client conversations from email, Instagram and text messages on the left, one conversation open in the middle, and on the right the intent Daythread read in the message and the action it suggests.",
    caption: "Daythread’s inbox on a demo workspace with sample clients. On the right: what the software read in the message, and what it suggests doing next.",
  },
};

export const pattern = {
  index: "04",
  label: "Rushd and InternOps",
  title: "A pattern, not a coincidence.",
  projects: [
    {
      name: "Rushd",
      what: "Academic planning for high-school students",
      link: { label: "therushd.com", href: "https://therushd.com" },
      text: "Rushd started from a problem close to home. A student’s week is scattered across classes, assignments, exams, deadlines and whatever time is actually free. Rushd gathers those pieces and turns them into a prioritized plan: take something messy, build a system around it, make it easier to act on.",
    },
    {
      name: "InternOps",
      what: "Internship management, associated with EdAI",
      link: { label: "GitHub", href: "https://github.com/karimmoh1-glitch/internops-refined" },
      text: "InternOps applies the same instinct to a whole program. It coordinates interns, task assignments, work sessions, proposals, communication, alumni and certificates, with the administrative workflows that hold them together.",
    },
  ],
  close:
    "Looked at together, the projects share a shape. Again and again, Karim has ended up building software that coordinates people, information and work — and each time, the valuable part is less the screen than the system behind it.",
  edai: "His time with EdAI also included a hackathon, where his team placed second and received $1,000 in group prize earnings.",
};

export const whySoftware = {
  index: "05",
  label: "Why software",
  title: "Why software came first.",
  ladder: ["A thought", "an interface", "a system", "a product", "something another person can use."],
  paragraphs: [
    "Software was the fastest route from an idea to something real. That immediacy is what drew Karim in.",
    "But building kept exposing the layers underneath: how data moves through a system, why something slows down, what the processor is actually doing, where the software ends and the machine begins. The more he built, the more those layers became the interesting part.",
  ],
};

export const trajectory = {
  index: "06",
  label: "Direction",
  title: "From software to computer engineering.",
  paragraphs: [
    "Software was the entry point. Computing became the deeper question: not only what a program does, but how computation happens at all.",
    "From there, hardware became interesting — computer architecture, embedded systems, the physical constraints software usually hides. Artificial intelligence added perception and decision-making. Robotics connects all of it to the physical world.",
    "These are directions of curiosity, not claims of expertise. His long-term direction is computer engineering, with interests reaching into computer vision, autonomous systems and intelligent machines.",
  ],
  path: [
    { label: "Idea", note: "Where every project starts", state: "now" },
    { label: "Software", note: "What he builds with today", state: "now" },
    { label: "Computation", note: "The deeper question", state: "exploring" },
    { label: "Intelligence", note: "Applied in products, still being explored", state: "exploring" },
    { label: "Perception", note: "Direction", state: "next" },
    { label: "Action", note: "Direction", state: "next" },
    { label: "Machines", note: "Where the curiosity leads", state: "next" },
  ] as Array<{ label: string; note: string; state: "now" | "exploring" | "next" }>,
  legend: [
    { state: "now", label: "Building today" },
    { state: "exploring", label: "Exploring" },
    { state: "next", label: "Direction" },
  ] as Array<{ state: "now" | "exploring" | "next"; label: string }>,
};

export const physical = {
  label: "The physical world",
  statement: ["Software was the beginning.", "The physical world is next."],
  capabilities: [
    { subject: "A software system", verb: "can process information." },
    { subject: "A machine", verb: "can perceive its environment." },
    { subject: "An intelligent system", verb: "can make decisions." },
    { subject: "A robot", verb: "can turn those decisions into physical action." },
  ],
  close: "The intersection of computation, perception, intelligence and physical systems is where Karim ultimately wants to go deeper.",
};

export const thread = {
  index: "07",
  label: "The thread",
  question: "How do ideas become systems that actually work?",
  intro: "One question runs through everything so far, and through what comes next.",
  rows: [
    { name: "Daythread", system: "Business systems", state: "built" },
    { name: "Rushd", system: "Planning systems", state: "built" },
    { name: "InternOps", system: "Operational systems", state: "built" },
    { name: "Computer engineering", system: "Computational systems", state: "next" },
    { name: "Artificial intelligence", system: "Intelligent systems", state: "next" },
    { name: "Robotics", system: "Physical systems", state: "next" },
  ] as Array<{ name: string; system: string; state: "built" | "next" }>,
  stateLabel: { built: "Built", next: "Next" },
};

export const current = {
  index: "08",
  label: "Now",
  title: ["The work is still early.", "The direction is becoming clearer."],
  paragraphs: [
    "Karim is at the beginning of this path, and being early is part of the story.",
    "Software remains the medium he builds with today — Daythread first, and whatever problem turns up next. Computer engineering, hardware, artificial intelligence and robotics are the deeper systems he wants to understand, and eventually to build.",
  ],
};

export const contact = {
  index: "09",
  label: "Contact",
  focus: ["Software", "Computer engineering", "AI", "Robotics"],
  links: [
    { label: "GitHub", href: "https://github.com/karimmoh1-glitch" },
    { label: "Daythread", href: "https://daythread.org" },
    { label: "Rushd", href: "https://therushd.com" },
  ] as Link[],
};

export const nav: Link[] = [
  { label: "Story", href: "#beginnings" },
  { label: "Work", href: "#daythread" },
  { label: "Direction", href: "#direction" },
  { label: "Contact", href: "#contact" },
];

/** Every string above that a visitor reads. Used by the tests. */
export function allProse(): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  [person.description, hero, origin, method, daythread, pattern, whySoftware, trajectory, physical, thread, current, contact].forEach(walk);
  return out;
}
