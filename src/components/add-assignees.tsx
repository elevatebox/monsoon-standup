"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User } from "@/lib/db/types";

// Adds more people to an existing task. Each new person gets the immediate
// assignment notice and their own tracking.
export function AddAssignees({
  taskId,
  candidates,
}: {
  taskId: string;
  candidates: User[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (candidates.length === 0) return null;

  async function add(userId: string) {
    setSaving(true);
    await fetch(`/api/tasks/${taskId}/assignees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_ids: [userId] }),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-hair px-3 py-2 text-sm text-muted hover:border-faint hover:text-ink"
      >
        + Add assignee
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hair bg-surface p-2">
      <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
        Add
      </span>
      {candidates.map((u) => (
        <button
          key={u.id}
          onClick={() => add(u.id)}
          disabled={saving}
          className="rounded-lg border border-hair px-2.5 py-1.5 text-sm hover:border-accent hover:text-accent"
        >
          {u.name}
        </button>
      ))}
      <button
        onClick={() => setOpen(false)}
        className="ml-auto text-sm text-faint hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );
}
