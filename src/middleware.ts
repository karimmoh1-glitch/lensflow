import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || "dev-only-insecure-secret");

async function hasValidSession(req: NextRequest) {
  const token = req.cookies.get("lf_session")?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/portal", "/partner", "/workspaces"];

// The mobile API is authenticated by bearer token, not cookies, so cross-origin requests
// carry no ambient credential a browser needs to guard — CORS restrictions here would only
// ever block a legitimate client (the Expo web preview, a future PWA), never protect
// anything. Native fetch (iOS/Android) ignores CORS entirely; this only matters for the
// web target.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/mobile")) {
    if (req.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: corsHeaders });
    }
    const res = NextResponse.next();
    for (const [key, value] of Object.entries(corsHeaders)) res.headers.set(key, value);
    return res;
  }

  const authed = await hasValidSession(req);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");

  if (isProtected && !authed) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  // /login always renders the real form, even for an already-authenticated visitor —
  // no silent bounce into whatever session happens to be active (the demo account,
  // a stale test login, etc). Submitting it re-authenticates and routes normally.
  // /signup still redirects an authed visitor straight to their dashboard, since
  // "create a business" while already in one is never the intent.
  if (pathname === "/signup" && authed) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/portal/:path*",
    "/partner/:path*",
    "/workspaces/:path*",
    "/login",
    "/signup",
    "/api/mobile/:path*",
  ],
};
