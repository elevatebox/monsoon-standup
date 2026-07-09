"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AssignmentContext, User } from "@/lib/db/types";
import { DevActivity } from "@/lib/dev/github";
import { DashboardView } from "./dashboard-view";
import { NewTaskForm } from "./new-task-form";
import { AddMemberForm } from "./add-member-form";

// Founder view (Charan, Abhishek): the full stat dashboard over the whole team,
// plus create-task and add-teammate.
export function FounderView({
  user,
  assignments,
  users,
  dev,
  appUrl,
  botUsername,
}: {
  user: User;
  assignments: AssignmentContext[];
  users: User[];
  dev: DevActivity;
  appUrl: string;
  botUsername: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"none" | "task" | "member">("none");
  const first = user.name.split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Team dashboard</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">
            Hi {first}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Everything the team is working on, in one place.
          </p>
          <nav className="mt-2 flex gap-3 text-sm">
            <Link href="/board" className="text-accent hover:underline">
              Board
            </Link>
            <Link href="/team" className="text-accent hover:underline">
              Team
            </Link>
          </nav>
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

      <DashboardView assignments={assignments} users={users} dev={dev} />
    </div>
  );
}
