import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "sa_auth";

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

  // A teammate's personal link, /u/<token>. Public: drop the token into the
  // sa_user_token cookie so their later API calls are attributed to them. The
  // API routes verify the token against the DB, so an invalid one just 401s.
  if (pathname.startsWith("/u/")) {
    const token = pathname.split("/")[2] ?? "";
    const res = NextResponse.next();
    if (token) {
      res.cookies.set("sa_user_token", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  const expected = await sha256Hex(process.env.DASHBOARD_PASSWORD ?? "");
  if (cookie && cookie === expected) {
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
