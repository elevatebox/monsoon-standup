import { AssignmentContext, TaskStatus, TaskTrack, TASK_TRACKS, User } from "@/lib/db/types";
import { Avatar, TrackChip, TRACK_META, timeAgo } from "@/components/ui";
import { DevActivity } from "@/lib/dev/github";

// Soft tint per track for the summary cards.
const TRACK_SOFT: Record<TaskTrack, { bg: string; text: string }> = {
  product: { bg: "bg-infoSoft", text: "text-info" },
  sales: { bg: "bg-trackSoft", text: "text-track" },
  gtm: { bg: "bg-slipSoft", text: "text-slip" },
  dev: { bg: "bg-plumSoft", text: "text-plum" },
};

const STATUS_META: Record<TaskStatus, { label: string; hex: string; pill: string }> = {
  todo: { label: "To do", hex: "#8C8B87", pill: "bg-idleSoft text-idle" },
  in_progress: { label: "In progress", hex: "#3B82F6", pill: "bg-infoSoft text-info" },
  blocked: { label: "Blocked", hex: "#CF5A54", pill: "bg-blockSoft text-block" },
  in_review: { label: "In review", hex: "#C68A3C", pill: "bg-slipSoft text-slip" },
  done: { label: "Done", hex: "#3E9E76", pill: "bg-trackSoft text-track" },
  cancelled: { label: "Cancelled", hex: "#8C8B87", pill: "bg-idleSoft text-idle" },
};

function priorityMeta(p: number) {
  if (p === 1) return { label: "High", hex: "#CF5A54" };
  if (p === 3) return { label: "Low", hex: "#8C8B87" };
  return { label: "Medium", hex: "#C68A3C" };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dueLabel(iso: string, now: number): { text: string; cls: string } {
  const days = Math.ceil((new Date(iso).getTime() - now) / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: "Overdue", cls: "text-block" };
  if (days === 0) return { text: "Today", cls: "text-slip" };
  if (days === 1) return { text: "1 day left", cls: "text-slip" };
  return { text: `${days} days left`, cls: "text-muted" };
}

// The full stat dashboard, rendered from already-fetched data so it can be used
// by the admin page and by a founder's /u view alike.
export function DashboardView({
  assignments,
  users,
  dev,
}: {
  assignments: AssignmentContext[];
  users: User[];
  dev: DevActivity;
}) {
  const now = Date.now();
  const total = assignments.length;
  const count = (s: TaskStatus) => assignments.filter((a) => a.status === s).length;
  const done = count("done");
  const inProgress = count("in_progress");
  const isOverdue = (iso: string | null, s: TaskStatus) =>
    !!iso && new Date(iso).getTime() < now && s !== "done" && s !== "cancelled";
  const overdue = assignments.filter((a) => isOverdue(a.task.due_at, a.status)).length;
  const attention = assignments.filter(
    (a) => a.needs_attention && a.status !== "done" && a.status !== "cancelled"
  ).length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const boardStatuses: TaskStatus[] = ["todo", "in_progress", "blocked", "in_review", "done"];
  const statusCounts = boardStatuses.map((s) => ({ s, n: count(s) }));
  let acc = 0;
  const segments = statusCounts
    .map(({ s, n }) => {
      const start = total ? (acc / total) * 100 : 0;
      acc += n;
      const end = total ? (acc / total) * 100 : 0;
      return `${STATUS_META[s].hex} ${start}% ${end}%`;
    })
    .join(", ");
  const donut = total ? `conic-gradient(${segments})` : "conic-gradient(#ECECEA 0% 100%)";

  const prio = [1, 2, 3].map((p) => ({
    p,
    n: assignments.filter((a) => (a.task.priority ?? 2) === p).length,
  }));
  const maxPrio = Math.max(1, ...prio.map((x) => x.n));

  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const doneThisWeek = assignments.filter(
    (a) => a.status === "done" && new Date(a.updated_at).getTime() > weekAgo
  ).length;

  const trackCounts = Object.fromEntries(
    TASK_TRACKS.map((t) => [
      t,
      assignments.filter((a) => (a.task.track ?? "product") === t).length,
    ])
  ) as Record<TaskTrack, number>;

  const rows = [...assignments].sort((a, b) => {
    const score = (x: (typeof assignments)[number]) =>
      (x.needs_attention ? 2 : 0) + (isOverdue(x.task.due_at, x.status) ? 1 : 0);
    return score(b) - score(a);
  });

  const upcoming = assignments
    .filter((a) => a.task.due_at && a.status !== "done" && a.status !== "cancelled")
    .sort(
      (x, y) =>
        new Date(x.task.due_at as string).getTime() -
        new Date(y.task.due_at as string).getTime()
    )
    .slice(0, 6);

  // Per-person workload — who is carrying what (and their performance).
  const byPerson = users
    .map((u) => {
      const mine = assignments.filter((a) => a.user_id === u.id);
      return {
        name: u.name,
        total: mine.length,
        open: mine.filter((a) => a.status !== "done" && a.status !== "cancelled").length,
        done: mine.filter((a) => a.status === "done").length,
      };
    })
    .filter((p) => p.total > 0)
    .sort((a, b) => b.open - a.open);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total tasks" value={total} sub="Across the team" tone="neutral" />
        <StatCard label="Completed" value={done} sub={`${pct(done)}% of all tasks`} tone="green" />
        <StatCard label="In progress" value={inProgress} sub="Currently active" tone="blue" />
        <StatCard label="Overdue" value={overdue} sub="Past their due date" tone="red" />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {TASK_TRACKS.map((t) => (
          <div
            key={t}
            className={`flex items-center justify-between rounded-xl px-4 py-3 ${TRACK_SOFT[t].bg}`}
          >
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TRACK_META[t].hex }} />
              <span className="text-sm font-medium text-ink/70">{TRACK_META[t].label}</span>
            </span>
            <span className={`text-lg font-bold ${TRACK_SOFT[t].text}`}>{trackCounts[t]}</span>
          </div>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Tasks by status">
          <div className="flex items-center gap-5">
            <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: donut }}>
              <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-surface">
                <span className="text-xl font-semibold text-ink">{total}</span>
                <span className="text-[10px] uppercase tracking-wide text-faint">Total</span>
              </div>
            </div>
            <div className="flex-1 space-y-1.5">
              {statusCounts.map(({ s, n }) => (
                <div key={s} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_META[s].hex }} />
                  <span className="text-muted">{STATUS_META[s].label}</span>
                  <span className="ml-auto font-medium text-ink">{n}</span>
                  <span className="w-9 text-right text-xs text-faint">{pct(n)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Tasks by priority">
          <div className="space-y-3.5 pt-1">
            {prio.map(({ p, n }) => {
              const m = priorityMeta(p);
              return (
                <div key={p}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted">{m.label}</span>
                    <span className="font-medium text-ink">{n}</span>
                  </div>
                  <div className="h-2 rounded-full bg-idleSoft">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${Math.round((n / maxPrio) * 100)}%`, background: m.hex }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Team overview">
          <ul className="space-y-2.5 pt-1 text-sm">
            <Row label="Total members" value={users.length} />
            <Row label="Open tasks" value={total - done} />
            <Row label="Needs attention" value={attention} tone="text-block" />
            <Row label="Done this week" value={doneThisWeek} tone="text-track" />
          </ul>
        </Panel>
      </div>

      <div className="mb-4">
        <Panel title="Dev activity · from GitHub">
          {!dev.connected ? (
            <p className="text-sm text-muted">GitHub not connected yet.</p>
          ) : dev.authors.length === 0 ? (
            <p className="text-sm text-muted">
              No commits in {dev.repo} in the last {dev.days} days.
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted">
                {dev.total} commit{dev.total === 1 ? "" : "s"} in the last {dev.days} days · {dev.repo}
              </p>
              <ul className="space-y-3">
                {dev.authors.map((a) => (
                  <li key={a.name} className="border-b border-hair/60 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <TrackChip track="dev" />
                        <span className="font-medium text-ink">{a.name}</span>
                      </span>
                      <span className="shrink-0 text-sm text-muted">
                        {a.commits} commit{a.commits === 1 ? "" : "s"} · {timeAgo(a.lastAt)}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {a.recent.map((r, i) => (
                        <li key={i} className="truncate text-xs text-muted">
                          • {r.message}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="All tasks">
            <div className="max-h-[460px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-hair text-left text-[11px] uppercase tracking-wide text-faint">
                    <th className="py-2 pr-3 font-medium">Task</th>
                    <th className="pr-3 font-medium">Assigned by</th>
                    <th className="pr-3 font-medium">Assigned to</th>
                    <th className="pr-3 font-medium">Track</th>
                    <th className="pr-3 font-medium">Due</th>
                    <th className="pr-3 font-medium">Status</th>
                    <th className="font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted">
                        No tasks yet.
                      </td>
                    </tr>
                  )}
                  {rows.map((a) => {
                    const sm = STATUS_META[a.status];
                    const pm = priorityMeta(a.task.priority ?? 2);
                    const od = isOverdue(a.task.due_at, a.status);
                    return (
                      <tr key={a.id} className="border-b border-hair/60">
                        <td className="py-2.5 pr-3 font-medium text-ink">
                          {a.needs_attention && (
                            <span className="mr-1 text-block" title="Needs attention">●</span>
                          )}
                          {a.task.title}
                        </td>
                        <td className="pr-3 text-muted">{a.task.created_by ?? "Charan"}</td>
                        <td className="pr-3">
                          <span className="flex items-center gap-1.5">
                            <Avatar name={a.user.name} />
                            <span className="text-ink">{a.user.name}</span>
                          </span>
                        </td>
                        <td className="pr-3">
                          <TrackChip track={a.task.track ?? "product"} />
                        </td>
                        <td className={`pr-3 ${od ? "font-medium text-block" : "text-muted"}`}>
                          {a.task.due_at ? fmtDate(a.task.due_at) : "—"}
                        </td>
                        <td className="pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sm.pill}`}>
                            {sm.label}
                          </span>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                            <span className="h-2 w-2 rounded-full" style={{ background: pm.hex }} />
                            {pm.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="space-y-3 lg:col-span-1">
          <Panel title="Upcoming deadlines">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">
                No due dates yet. Add a due date when creating a task and it will show up here.
              </p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((a) => {
                  const dl = dueLabel(a.task.due_at as string, now);
                  return (
                    <li key={a.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{a.task.title}</p>
                        <p className="text-xs text-muted">{a.user.name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm text-ink">{fmtDate(a.task.due_at as string)}</p>
                        <p className={`text-xs font-medium ${dl.cls}`}>{dl.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Workload by person">
            {byPerson.length === 0 ? (
              <p className="text-sm text-muted">No one is assigned yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {byPerson.map((p) => (
                  <li key={p.name} className="flex items-center gap-2.5 text-sm">
                    <Avatar name={p.name} />
                    <span className="text-ink">{p.name}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <span className="font-medium text-ink">{p.open} open</span>
                      {p.done > 0 && <span className="text-track">{p.done} done</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: "neutral" | "green" | "blue" | "red";
}) {
  const map = {
    neutral: { bg: "bg-plumSoft", text: "text-plum" },
    green: { bg: "bg-trackSoft", text: "text-track" },
    blue: { bg: "bg-infoSoft", text: "text-info" },
    red: { bg: "bg-blockSoft", text: "text-block" },
  }[tone];
  return (
    <div className={`rounded-xl p-4 ${map.bg}`}>
      <p className="text-sm font-medium text-ink/70">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${map.text}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink/50">{sub}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-hair bg-surface p-4">
      <h2 className="mb-3 font-serif text-lg font-semibold text-ink">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <li className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={`font-semibold ${tone ?? "text-ink"}`}>{value}</span>
    </li>
  );
}
