"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TaskAssignment, TaskStatus } from "@/lib/db/types";

const STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
];

export function AssignmentControls({
  assignment,
}: {
  assignment: TaskAssignment & { user: { name: string } };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    await fetch(`/api/assignments/${assignment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove ${assignment.user.name} from this task?`)) return;
    setSaving(true);
    await fetch(`/api/assignments/${assignment.id}`, { method: "DELETE" });
    setSaving(false);
    router.refresh();
  }

  const snoozed =
    assignment.snoozed_until && new Date(assignment.snoozed_until) > new Date();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={assignment.status}
        onChange={(e) => patch({ status: e.target.value })}
        disabled={saving}
        className="rounded-lg border border-hair bg-paper px-2.5 py-1.5 text-sm"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ")}
          </option>
        ))}
      </select>

      <button
        onClick={() => patch({ agent_enabled: !assignment.agent_enabled })}
        disabled={saving}
        className={`rounded-lg border px-2.5 py-1.5 text-sm ${
          assignment.agent_enabled
            ? "border-accent text-accent"
            : "border-hair text-faint"
        }`}
      >
        {assignment.agent_enabled ? "Check-ins on" : "Check-ins off"}
      </button>

      {snoozed ? (
        <button
          onClick={() => patch({ snoozed_until: null })}
          disabled={saving}
          className="rounded-lg border border-hair px-2.5 py-1.5 text-sm text-muted hover:text-ink"
        >
          Resume now
        </button>
      ) : (
        <button
          onClick={() =>
            patch({
              snoozed_until: new Date(
                Date.now() + 2 * 60 * 60 * 1000
              ).toISOString(),
            })
          }
          disabled={saving}
          className="rounded-lg border border-hair px-2.5 py-1.5 text-sm text-muted hover:text-ink"
        >
          Snooze 2h
        </button>
      )}

      <button
        onClick={remove}
        disabled={saving}
        className="ml-auto rounded-lg px-2.5 py-1.5 text-sm text-faint hover:text-block"
      >
        Remove
      </button>
    </div>
  );
}
