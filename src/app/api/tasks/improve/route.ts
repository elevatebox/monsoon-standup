import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { askText } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";

// A compact map of the Monsoon product repo so the AI writes dev specs that name
// the real files a developer would actually touch.
const REPO_CONTEXT = `Repo elevatebox/heymonsoon — SvelteKit + TypeScript + Drizzle ORM (LibSQL/Turso), on Fly.io. Money is stored in paise (integers); dates in IST. Layering: services orchestrate, repositories do DB access, helpers are pure. pnpm check must pass.
- DB schema: src/lib/server/db/schema/*.ts (documents.ts = invoices/purchases; quotations.ts; users.ts; import-batches.ts). Add columns here plus a Drizzle migration.
- Services: src/lib/server/services/*.service.ts (invoice, quotation, product, inventory, payment, purchase, import, notify, pdf, document, contact).
- Tax/GST helpers: src/lib/server/helpers/tax.ts (buildGstSummary, calculateDocumentTax, decideGstMode), hsn-tax-resolver.ts, gstin-validator.ts.
- Zoho inbound mapper (invert for outbound): src/lib/server/services/import-mappers/zoho.mapper.ts.
- Cron: src/routes/api/cron/<name>/+server.ts guarded by verifyCronAuth (src/lib/server/helpers/cron-auth.ts); GitHub Actions in .github/workflows/cron-*.yml.
- Audio transcription: src/lib/server/helpers/audio-transcribe.ts. Repositories: src/lib/server/repositories/*.repository.ts.`;

export async function POST(req: NextRequest) {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const rough = String(body.description ?? "").trim();
  const track = String(body.track ?? "product");
  if (!title && !rough) {
    return NextResponse.json({ error: "need a title or a note" }, { status: 400 });
  }

  const system =
    track === "dev"
      ? `You are a senior engineer writing a crisp, buildable task spec for the Monsoon product codebase. Turn the rough task into a spec a developer can pick up with no other context. Use short labelled lines exactly in this shape:
GOAL: one line, the outcome.
WHERE: the exact files/dirs to touch, from the real repo layout below.
DO: the concrete steps.
DONE: the acceptance criteria.
Keep it under ~130 words. Reference real files only; do not invent paths. Output only the spec, no preamble, no code fences. Do not use em dashes.

REPO LAYOUT:
${REPO_CONTEXT}`
      : `You are a sharp founder-operator writing a crisp, actionable task spec for a ${track} task at Monsoon (an AI GST-accounting product for Indian cement dealers). Turn the rough task into a clear spec with short labelled lines:
GOAL: the outcome.
DO: the concrete steps.
DONE: what done looks like, measurable.
Keep it under ~110 words. Output only the spec, no preamble. Do not use em dashes.`;

  const user = `Rough task:
Title: ${title || "(none)"}
Notes: ${rough || "(none)"}
Track: ${track}`;

  try {
    const description = await askText({ system, user, maxTokens: 500 });
    return NextResponse.json({ description: description.trim() });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "AI could not rewrite this" },
      { status: 500 }
    );
  }
}
