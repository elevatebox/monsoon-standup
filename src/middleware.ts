import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "sa_auth";
const USER_TOKEN_COOKIE = "sa_user_token";

// Compute SHA-256 hex using Web Crypto so this works in the edge runtime.
// Must match expectedToken() in src/lib/auth.ts (node:crypto), which it does:
// both are plain SHA-256 hex of the password string.
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// A teammate's personal-link token is a full login. Validate it against the
// users table via Supabase REST (edge runtime, so plain fetch, not the SDK).
// One small DB read per page view — fine at this team size.
async function isValidUserToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const res = await fetch(
    `${url}/rest/v1/users?onboarding_token=eq.${encodeURIComponent(
      token
    )}&active=eq.true&select=id`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return false;
  return ((await res.json()) as unknown[]).length > 0;
}

// Gate the dashboard pages. API routes do their own check via requireDashboardAuth.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/r/") || // public, token-gated reply page for assignees
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // A teammate's personal link, /u/<token>: their login and their own
  // dashboard. Drop the token into the sa_user_token cookie so the shared
  // pages (/board, /team, /tasks/new) and the APIs accept them; the page
  // itself renders their personal view (an invalid token gets a dead end).
  if (pathname.startsWith("/u/")) {
    const token = pathname.split("/")[2] ?? "";
    const res = NextResponse.next();
    if (token) {
      res.cookies.set(USER_TOKEN_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  }

  // Founder password cookie.
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  const expected = await sha256Hex(process.env.DASHBOARD_PASSWORD ?? "");
  if (cookie && cookie === expected) {
    return NextResponse.next();
  }

  // Teammate token cookie (set by visiting their personal link).
  if (await isValidUserToken(req.cookies.get(USER_TOKEN_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
