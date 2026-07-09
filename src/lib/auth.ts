import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getUserByOnboardingToken } from "@/lib/db/queries";
import { User } from "@/lib/db/types";

// Simple single-user gate. This is a founder-only internal tool, so a shared
// password behind an httpOnly cookie is enough. The cookie holds the SHA-256 of
// the password, never the password itself. If you ever add real team logins,
// swap this for Supabase Auth.
export const AUTH_COOKIE = "sa_auth";

// A teammate opens their personal /u/<token> link; middleware drops that token
// into this cookie so their later API calls can be attributed to them without a
// login. The token is their (unguessable, random) onboarding_token.
export const USER_TOKEN_COOKIE = "sa_user_token";

export function expectedToken(): string {
  return createHash("sha256").update(env.DASHBOARD_PASSWORD).digest("hex");
}

export function isAuthed(req: NextRequest): boolean {
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  return !!cookie && cookie === expectedToken();
}

// For API route handlers: returns a 401 NextResponse if not authed, else null.
// Every teammate has the same access as the founder, so any resolved actor
// (password cookie or valid personal-link token) passes.
export async function requireDashboardAuth(
  req: NextRequest
): Promise<NextResponse | null> {
  if (await resolveActor(req)) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

// Who is making this request: the founder (dashboard password) or a specific
// teammate (their per-person link token). Null if neither checks out.
export type Actor = { kind: "admin" } | { kind: "user"; user: User };

export async function resolveActor(req: NextRequest): Promise<Actor | null> {
  if (isAuthed(req)) return { kind: "admin" };
  const token = req.cookies.get(USER_TOKEN_COOKIE)?.value;
  if (token) {
    const user = await getUserByOnboardingToken(token);
    if (user && user.active !== false) return { kind: "user", user };
  }
  return null;
}

// For mutating routes teammates are allowed to use (create/assign/update tasks):
// returns the Actor, or a 401 NextResponse to return directly. Callers do:
//   const actor = await requireActor(req);
//   if (actor instanceof NextResponse) return actor;
export async function requireActor(
  req: NextRequest
): Promise<Actor | NextResponse> {
  const actor = await resolveActor(req);
  if (!actor) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return actor;
}
