import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTaskWithAssignments,
  getThreadForAssignment,
  listUsers,
} from "@/lib/db/queries";
import { Message } from "@/lib/db/types";
import { RiskBadge, StatusPill } from "@/components/ui";
import { Thread } from "@/components/task-thread";
import { AssignmentControls } from "@/components/assignment-controls";
import { AddAssignees } from "@/components/add-assignees";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const task = await getTaskWithAssignments(id);
  if (!task) notFound();

  const [threads, users] = await Promise.all([
    Promise.all(
      task.assignments.map((a) =>
        getThreadForAssignment(a.id).then(
          (msgs) => [a.id, msgs] as [string, Message[]]
        )
      )
    ),
    listUsers(),
  ]);
  const threadById = Object.fromEntries(threads);
  const assignedIds = new Set(task.assignments.map((a) => a.user_id));
  const candidates = users.filter((u) => !assignedIds.has(u.id) && u.active);

  return (
    <div>
      <Link
        href="/dashboard"
        className="eyebrow mb-4 inline-block hover:text-muted"
      >
        ← Back
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{task.title}</h1>
        {task.description && (
          <p className="mt-2 max-w-2xl text-sm text-muted">{task.description}</p>
        )}
        {task.due_at && (
          <p className="mt-2 font-mono text-[11px] text-faint">
            Due {new Date(task.due_at).toLocaleString()}
          </p>
        )}
      </header>

      <div className="mb-4 flex items-center justify-between">
        <p className="eyebrow">
          Assignees ({task.assignments.length})
        </p>
        <AddAssignees taskId={task.id} candidates={candidates} />
      </div>

      {task.assignments.length === 0 && (
        <p className="rounded-xl border border-dashed border-hair bg-surface px-4 py-8 text-center text-sm text-muted">
          No one is assigned. Add someone to start tracking.
        </p>
      )}

      <div className="flex flex-col gap-5">
        {task.assignments.map((a) => (
          <section
            key={a.id}
            className="rounded-xl border border-hair bg-surface p-4"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{a.user.name}</span>
              {a.user.role && (
                <span className="font-mono text-[11px] text-faint">
                  {a.user.role}
                </span>
              )}
              <StatusPill status={a.status} />
              <RiskBadge risk={a.ai_risk} />
              {a.needs_attention && (
                <span className="rounded-full bg-blockSoft px-2.5 py-0.5 font-mono text-[11px] font-medium text-block">
                  Needs you
                </span>
              )}
            </div>

            <div className="mb-3 rounded-lg border border-hair bg-paper p-3">
              <p className="eyebrow mb-1">Where it stands</p>
              <p className="text-sm text-ink">
                {a.ai_summary ?? "No update captured yet."}
              </p>
            </div>

            <div className="mb-3">
              <Thread
                messages={threadById[a.id] ?? []}
                assigneeName={a.user.name}
              />
            </div>

            <AssignmentControls assignment={a} />
          </section>
        ))}
      </div>
    </div>
  );
}
