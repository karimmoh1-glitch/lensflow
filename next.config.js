const isDev = process.env.NODE_ENV === "development";

// Static (non-nonce) CSP: nonce-based CSP would force every page in the app into dynamic
// rendering (no static optimization, no CDN caching) for a security gain that doesn't
// matter much here — there are no third-party scripts or user-supplied HTML rendered
// anywhere in the app. 'unsafe-inline' on script/style still blocks the actual threat
// that matters (an attacker loading a remote script from an attacker-controlled origin).
// Inline event-handler attributes are refused outright (script-src-attr 'none': React never
// emits them), and nothing may be framed, run as a worker or loaded as media from elsewhere.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self' data:;
  connect-src 'self';
  media-src 'self';
  worker-src 'self';
  manifest-src 'self';
  frame-src 'none';
  object-src 'none';
  script-src-attr 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // No framework fingerprint in responses.
  poweredByHeader: false,
  // Nothing uses next/image. Leaving the optimizer unconfigured-but-reachable only adds
  // attack surface (several Next.js 14 advisories live in it), so it is switched off.
  images: { unoptimized: true },
  // The founder profile lives at /founder. Its first home, /karim-mohamed (and the project and
  // writing pages under it), now point there permanently.
  async redirects() {
    return [
      { source: "/karim-mohamed", destination: "/founder", permanent: true },
      { source: "/karim-mohamed/:path*", destination: "/founder", permanent: true },
    ];
  },
  // founder.daythread.org serves the same profile once that domain is attached to this project.
  // Host-scoped: requests to any other host never match.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", has: [{ type: "host", value: "founder.daythread.org" }], destination: "/founder" }],
    };
  },
  async headers() {
    // The embeddable lead form (/embed/:handle) is meant to live inside a customer's own
    // website, so it alone may be framed; everything else refuses framing entirely.
    const embedCsp = cspHeader.replace("frame-ancestors 'none'", "frame-ancestors *");
    return [
      // Only /embed/… is exempt: the old pattern also left any path merely starting with "embed" bare.
      { source: "/:path((?!embed/).*)", headers: securityHeaders },
      { source: "/embed/:path*", headers: securityHeaders.filter((h) => h.key !== "X-Frame-Options" && h.key !== "Content-Security-Policy").concat([{ key: "Content-Security-Policy", value: embedCsp }]) },
    ];
  },
};
export default nextConfig;
