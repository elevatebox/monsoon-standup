import { NextRequest } from "next/server";
import { verifyAction } from "@/lib/standup/sign";
import { parseButtonValue } from "@/lib/standup/buttons";
import { applyButtonAction } from "@/lib/standup/actions";

// People click these links from their email. GET so a click just works. The
// token is signed and time limited, so links cannot be forged or replayed.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const verified = verifyAction(token);
  if (!verified) {
    return page("This link is invalid or has expired.", false);
  }

  const action = parseButtonValue(verified.value);
  if (!action) return page("This link is not valid.", false);

  try {
    const outcome = await applyButtonAction(action, verified.userId);
    return page(outcome.message, outcome.ok);
  } catch {
    return page("Something went wrong applying that. Try again later.", false);
  }
}

// A tiny self-contained confirmation page.
function page(message: string, ok: boolean): Response {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monsoon</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f6f8;color:#16181d;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">
  <div style="background:#fff;border:1px solid #e5e8ec;border-radius:14px;padding:28px 32px;max-width:420px;text-align:center;">
    <div style="font-size:22px;margin-bottom:8px;">${ok ? "Done" : "Hmm"}</div>
    <p style="color:#5b6472;font-size:15px;line-height:1.5;margin:0;">${escapeHtml(
      message
    )}</p>
  </div>
</body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
