"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AssignmentContext, TaskStatus, User } from "@/lib/db/types";
import { Board } from "./board";
import { NewTaskForm } from "./new-task-form";
import { AddMemberForm } from "./add-member-form";

// Member view (e.g. Manikanta): sees only their own tasks. Can create tasks,
// assign to anyone, and add new teammates.
export function TeammateView({
  user,
  assignments,
  users,
  seesAll,
  appUrl,
  botUsername,
}: {
  user: User;
  assignments: AssignmentContext[];
  users: User[];
  seesAll: boolean;
  appUrl: string;
  botUsername: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"none" | "task" | "member">("none");
  const first = user.name.split(/\s+/)[0];

  const count = (s: TaskStatus) => assignments.filter((a) => a.status === s).length;
  const stats: { label: string; n: number }[] = [
    { label: "To do", n: count("todo") },
    { label: "In progress", n: count("in_progress") },
    { label: "Blocked", n: count("blocked") },
    { label: "Done", n: count("done") },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">{seesAll ? "Team board" : "Your tasks"}</p>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">
            Hi {first}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {seesAll
              ? "Everything the team is working on. Drag a card to update its status; create a task and assign to anyone."
              : "Your tasks. Drag a card to update its status; create a task and assign it to anyone on the team."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setPanel((p) => (p === "member" ? "none" : "member"))}
            className="rounded-xl border border-hair bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-faint"
          >
            Add teammate
          </button>
          <button
            onClick={() => setPanel((p) => (p === "task" ? "none" : "task"))}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            New task
          </button>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-4 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-hair bg-surface px-4 py-3"
          >
            <p className="text-xs text-muted">{s.label}</p>
            <p className="text-2xl font-semibold text-ink">{s.n}</p>
          </div>
        ))}
      </div>

      {panel === "task" && (
        <div className="mb-5 rounded-xl border border-hair bg-surface p-5">
          <NewTaskForm
            users={users}
            creatorName={user.name}
            onCreated={() => {
              setPanel("none");
              router.refresh();
            }}
          />
        </div>
      )}

      {panel === "member" && (
        <div className="mb-5 rounded-xl border border-hair bg-surface p-5">
          <AddMemberForm
            appUrl={appUrl}
            botUsername={botUsername}
            onAdded={() => router.refresh()}
          />
        </div>
      )}

      <Board initial={assignments} disableOpen />
    </div>
  );
}
