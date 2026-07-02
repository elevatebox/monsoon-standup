import { verifyAction } from "@/lib/standup/sign";
import { getAssignment, getThreadForAssignment } from "@/lib/db/queries";
import { ReplyForm } from "@/components/reply-form";

export const dynamic = "force-dynamic";

export default async function ReplyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyAction(decodeURIComponent(token));
  const assignmentId =
    verified && verified.value.startsWith("reply:")
      ? verified.value.slice("reply:".length)
      : null;

  const a = assignmentId ? await getAssignment(assignmentId) : null;
  if (!verified || !a || a.user_id !== verified.userId) {
    return <Shell>This link is invalid or has expired. Ask for a fresh one.</Shell>;
  }

  const thread = await getThreadForAssignment(a.id);
  const lastQuestion = [...thread]
    .reverse()
    .find((m) => m.direction === "outbound")?.body;

  return (
    <Shell>
      <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
        Update for {a.user.name}
      </p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">
        {a.task.title}
      </h1>
      {lastQuestion && (
        <p className="mt-3 rounded-lg border border-hair bg-paper p-3 text-sm text-muted">
          {lastQuestion}
        </p>
      )}
      <div className="mt-5">
        <ReplyForm token={decodeURIComponent(token)} />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-8">
      <div className="rounded-2xl border border-hair bg-surface p-5">
        {children}
      </div>
      <p className="mt-4 text-center font-mono text-[11px] text-faint">
        Monsoon
      </p>
    </main>
  );
}
