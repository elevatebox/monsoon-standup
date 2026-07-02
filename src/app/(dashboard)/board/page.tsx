import Link from "next/link";
import { listAssignments } from "@/lib/db/queries";
import { Board } from "@/components/board";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const assignments = await listAssignments();
  const attention = assignments.filter(
    (a) => a.needs_attention && a.status !== "done" && a.status !== "cancelled"
  ).length;

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-1">Live board</p>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Board</h1>
          {attention > 0 && (
            <p className="mt-1 text-sm text-block">
              {attention} need{attention === 1 ? "s" : ""} your attention
            </p>
          )}
        </div>
        <Link
          href="/tasks/new"
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          New task
        </Link>
      </header>

      <Board initial={assignments} />
    </div>
  );
}
