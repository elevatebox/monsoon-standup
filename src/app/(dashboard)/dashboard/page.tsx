import Link from "next/link";
import { listAssignments, listUsers } from "@/lib/db/queries";
import { getDevActivity } from "@/lib/dev/github";
import { DashboardView } from "@/components/dashboard-view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [assignments, users, dev] = await Promise.all([
    listAssignments(),
    listUsers(),
    getDevActivity(14),
  ]);

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">
            Team Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted">
            Everything everyone is working on, in one place.
          </p>
        </div>
        <Link
          href="/board"
          className="rounded-xl border border-hair bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-faint"
        >
          Open board
        </Link>
      </header>

      <DashboardView assignments={assignments} users={users} dev={dev} />
    </div>
  );
}
