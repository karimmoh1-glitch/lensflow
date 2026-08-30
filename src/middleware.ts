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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = await hasValidSession(req);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");

  if (isProtected && !authed) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  // Role-aware redirect (client vs partner vs photographer) happens server-side in
  // dashboard/layout.tsx — the edge runtime here can't reach the database.
  if ((pathname === "/login" || pathname === "/signup") && authed) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/portal/:path*", "/partner/:path*", "/workspaces/:path*", "/login", "/signup"],
};
