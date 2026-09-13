/**
 * Karim Mohamed's profile, condensed from the bio he wrote himself. This file is the only
 * source of copy for the founder page: add a fact here only when Karim has stated it or it can
 * be verified publicly. `founder.test.ts` guards the invariants (no banned words, no email
 * addresses, GitHub as the only sameAs, no portrait until a real photo exists).
 */

/** A real photograph, stored in /public/karim-mohamed/. Never generated, never stock. */
export type Portrait = {
  src: `/karim-mohamed/${string}`;
  alt: string;
  width: number;
  height: number;
};

export type LinkRef = { label: string; href: string };

export type Profile = {
  name: string;
  givenName: string;
  familyName: string;
  path: "/karim-mohamed";
  location: string;
  jobTitle: string;
  /** One line under the name. */
  positioning: string;
  /** Meta description and Person.description. */
  description: string;
  metaLine: string[];
  portrait: Portrait | null;
  heroLinks: LinkRef[];
  /** Verified public profiles only. */
  sameAs: string[];
  github: { profile: string; daythreadRepository: string };
  builder: {
    paragraphs: string[];
    loop: string[];
    loopNote: string;
    wholeSystem: string[];
  };
  daythread: {
    paragraphs: string[];
    idea: string;
    areasIntro: string;
    areas: string[];
    focus: string;
  };
  buildingInPublic: string[];
  interests: {
    ambition: string[];
    computerEngineering: string[];
    robotics: { intro: string; steps: string[]; note: string };
    longTerm: string[];
  };
  currently: string[];
  contact: string;
};

export const profile = {
  name: "Karim Mohamed",
  givenName: "Karim",
  familyName: "Mohamed",
  path: "/karim-mohamed",
  location: "Seattle area",
  jobTitle: "Founder",
  positioning: "Software builder and aspiring computer engineer, working toward technology that connects intelligent software with the physical world.",
  description:
    "Karim Mohamed is a software builder and aspiring computer engineer from the Seattle area. He is the founder of Daythread and the creator of Rushd, and is interested in where software, AI, robotics and entrepreneurship meet.",
  metaLine: ["Seattle area", "Founder of Daythread", "Creator of Rushd"],
  // Stays null until a real photograph is added to /public/karim-mohamed/.
  portrait: null,
  heroLinks: [
    { label: "Daythread", href: "https://daythread.org" },
    { label: "Rushd", href: "https://therushd.com" },
    { label: "GitHub", href: "https://github.com/karimmoh1-glitch" },
  ],
  sameAs: ["https://github.com/karimmoh1-glitch"],
  github: {
    profile: "https://github.com/karimmoh1-glitch",
    daythreadRepository: "https://github.com/karimmoh1-glitch/lensflow",
  },
  builder: {
    paragraphs: [
      "I'm interested in where software, AI, robotics and entrepreneurship meet, and I learn by building.",
      "I believe great technology should feel simple, even when the system underneath it is complex.",
    ],
    loop: ["Find a real problem", "Build", "Test", "Learn", "Improve", "Repeat"],
    loopNote: "Then back to the start.",
    wholeSystem: ["Software", "Hardware", "AI", "Product", "Users", "Business"],
  },
  daythread: {
    paragraphs: [
      "Daythread is business software for service businesses. It brings customer conversations, bookings, calendars, workflows and connected business tools into one workspace.",
      "AI helps a business understand each conversation and work out what should happen next.",
    ],
    idea: "Business conversations should naturally lead to business actions.",
    areasIntro: "I've worked across the whole product:",
    areas: ["Architecture", "Interface", "Security", "Integrations", "Automation systems", "Onboarding", "Infrastructure", "Testing"],
    focus: "It's where most of my attention goes right now.",
  },
  buildingInPublic: [
    "Daythread is built in public on GitHub. The repository began in 2026 under the name LensFlow and became Daythread in its first days.",
    "Rushd and InternOps live on GitHub too.",
  ],
  interests: {
    ambition: [
      "I want to become a world-class computer engineer, entrepreneur and technology builder, working where software and hardware meet.",
      "The aim underneath it: build technology that solves problems people actually have.",
    ],
    computerEngineering: [
      "Artificial intelligence",
      "Embedded systems",
      "Robotics",
      "Computer architecture",
      "Automation",
      "Sensors and perception",
      "Software engineering",
      "Human-computer interaction",
      "Intelligent machines",
    ],
    robotics: {
      intro: "In robotics, I'm drawn to the software side: the systems that let a machine",
      steps: ["Perceive", "Decide", "Communicate with other systems", "Act"],
      note: "I'm exploring robotics alongside my software work, and I want to gain deeper experience in it.",
    },
    longTerm: ["Robotic manipulation", "Autonomous systems", "Computer vision", "Embedded computing", "AI robotics", "Human-robot interaction"],
  },
  currently: ["Focused on Daythread", "Exploring robotics"],
  contact:
    "There's no personal email address here. For anything about Daythread, use the Daythread support page. For everything else, find me on GitHub.",
} satisfies Profile as Profile;
