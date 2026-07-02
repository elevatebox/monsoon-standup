"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User } from "@/lib/db/types";

export function NewTaskForm({
  users,
  onCreated,
  creatorName,
}: {
  users: User[];
  // When provided (teammate view), called after a successful create instead of
  // navigating to the admin-gated task page.
  onCreated?: () => void;
  // Whose name to show as the creator.
  creatorName?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [priority, setPriority] = useState(2);
  const [track, setTrack] = useState("product");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState(false);
  const [error, setError] = useState("");

  // Ask Claude to expand the rough title/notes into a detailed, buildable spec
  // (grounded in the real product codebase for dev tasks).
  async function improve() {
    if (!title.trim() && !description.trim()) {
      setError("Add a title or a note first, then Improve with AI.");
      return;
    }
    setImproving(true);
    setError("");
    const res = await fetch("/api/tasks/improve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, track }),
    });
    setImproving(false);
    if (res.ok) {
      const { description: d } = await res.json();
      if (d) setDescription(d);
    } else {
      setError("The AI could not rewrite this. Try again.");
    }
  }

  function toggle(id: string) {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function create() {
    if (!title.trim()) {
      setError("Give the task a title.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        assignee_ids: assigneeIds,
        priority,
        track,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const { task } = await res.json();
      if (onCreated) {
        onCreated();
      } else {
        router.push(`/tasks/${task.id}`);
      }
    } else {
      setError("Could not create the task. Check the fields and try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {creatorName && (
        <p className="text-xs text-muted">
          Creating as <span className="font-medium text-ink">{creatorName}</span>
        </p>
      )}
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ship the Razorpay webhook handler"
          className="w-full rounded-xl border border-hair bg-surface px-3.5 py-2.5 text-ink outline-none focus:border-accent"
        />
      </Field>

      <Field
        label="Description"
        hint="Jot a rough note, then let AI expand it into a detailed, buildable spec. The sharper this is, the sharper the check-ins."
      >
        <div className="mb-1.5 flex justify-end">
          <button
            type="button"
            onClick={improve}
            disabled={improving}
            className="rounded-lg border border-accent/40 bg-accentSoft px-2.5 py-1 text-xs font-medium text-accent disabled:opacity-50"
          >
            {improving ? "Writing spec..." : "✨ Improve with AI"}
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Rough note is fine: 'push invoices into Zoho'. Then hit Improve with AI."
          className="w-full rounded-xl border border-hair bg-surface px-3.5 py-2.5 text-ink outline-none focus:border-accent"
        />
      </Field>

      <Field
        label={`Assignees${assigneeIds.length ? ` (${assigneeIds.length})` : ""}`}
        hint="Pick one or more. Each person gets their own check-ins and is tracked separately."
      >
        {users.length === 0 ? (
          <p className="text-sm text-muted">
            No teammates yet. Add some on the Team page first.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {users.map((u) => {
              const reachable = u.telegram_chat_id || u.email;
              const checked = assigneeIds.includes(u.id);
              return (
                <label
                  key={u.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                    checked
                      ? "border-accent bg-accentSoft"
                      : "border-hair bg-surface hover:border-faint"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(u.id)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="text-ink">{u.name}</span>
                  {u.role && (
                    <span className="font-mono text-[11px] text-faint">
                      {u.role}
                    </span>
                  )}
                  {!reachable && (
                    <span className="ml-auto font-mono text-[11px] text-faint">
                      not reachable yet
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="Track" hint="Which side of the company this task belongs to.">
        <select
          value={track}
          onChange={(e) => setTrack(e.target.value)}
          className="w-full rounded-xl border border-hair bg-surface px-3 py-2.5 text-ink"
        >
          <option value="product">Product</option>
          <option value="sales">Sales</option>
          <option value="gtm">GTM</option>
          <option value="dev">Dev</option>
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Priority">
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-full rounded-xl border border-hair bg-surface px-3 py-2.5 text-ink"
          >
            <option value={1}>High</option>
            <option value={2}>Normal</option>
            <option value={3}>Low</option>
          </select>
        </Field>

        <Field label="Due (optional)">
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="w-full rounded-xl border border-hair bg-surface px-3.5 py-2.5 text-ink"
          />
        </Field>
      </div>

      {error && <p className="text-sm text-block">{error}</p>}

      <button
        onClick={create}
        disabled={saving}
        className="self-start rounded-xl bg-accent px-5 py-2.5 font-medium text-white disabled:opacity-50"
      >
        {saving ? "Creating..." : "Create task"}
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-faint">
        {label}
      </span>
      {hint && <span className="mb-1.5 block text-xs text-muted">{hint}</span>}
      {children}
    </label>
  );
}
