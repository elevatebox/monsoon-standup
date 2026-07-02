"use client";

import { useState } from "react";
import { ChannelPref, User } from "@/lib/db/types";

export function TeamManager({
  initialUsers,
  botUsername,
  appUrl,
}: {
  initialUsers: User[];
  botUsername: string;
  appUrl: string;
}) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");

  async function addUser() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, email }),
    });
    setSaving(false);
    if (res.ok) {
      const { user } = await res.json();
      setUsers((u) => [...u, user]);
      setName("");
      setRole("");
      setEmail("");
    }
  }

  async function patchUser(id: string, patch: Partial<User>) {
    const res = await fetch(`/api/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const { user } = await res.json();
      setUsers((list) => list.map((u) => (u.id === id ? user : u)));
    }
  }

  function resolvedChannel(u: User): "telegram" | "email" | "none" {
    if (u.preferred_channel === "telegram")
      return u.telegram_chat_id ? "telegram" : "none";
    if (u.preferred_channel === "email") return u.email ? "email" : "none";
    if (u.telegram_chat_id) return "telegram";
    if (u.email) return "email";
    return "none";
  }

  function connectLink(u: User): string {
    if (!botUsername) return "(set TELEGRAM_BOT_USERNAME to generate links)";
    return `https://t.me/${botUsername}?start=${u.onboarding_token}`;
  }

  // The teammate's personal, no-login dashboard link. They can create/assign
  // tasks and update statuses from here.
  function dashboardLink(u: User): string {
    return `${appUrl}/u/${u.onboarding_token}`;
  }

  async function copy(link: string, id: string) {
    await navigator.clipboard.writeText(link);
    setCopied(id);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div>
      <div className="mb-6 rounded-xl border border-hair bg-surface p-4">
        <p className="eyebrow mb-3">Add a teammate</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-lg border border-hair bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role (e.g. Backend)"
            className="rounded-lg border border-hair bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (for the email channel)"
            className="rounded-lg border border-hair bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={addUser}
          disabled={saving || !name.trim()}
          className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add"}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {users.length === 0 && (
          <p className="text-sm text-muted">No teammates yet.</p>
        )}
        {users.map((u) => {
          const channel = resolvedChannel(u);
          const link = connectLink(u);
          const needsTelegramLink =
            (u.preferred_channel === "telegram" ||
              (u.preferred_channel === "auto" && !u.email)) &&
            !u.telegram_chat_id;

          return (
            <div
              key={u.id}
              className="rounded-xl border border-hair bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{u.name}</p>
                  <p className="font-mono text-[11px] text-faint">
                    {u.role ?? "no role"} · {u.email ?? "no email"}
                  </p>
                </div>
                <ChannelBadge channel={channel} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
                    Reach via
                  </span>
                  <select
                    value={u.preferred_channel}
                    onChange={(e) =>
                      patchUser(u.id, {
                        preferred_channel: e.target.value as ChannelPref,
                      })
                    }
                    className="rounded-lg border border-hair bg-paper px-2 py-1.5 text-sm"
                  >
                    <option value="auto">Auto</option>
                    <option value="telegram">Telegram</option>
                    <option value="email">Email</option>
                  </select>
                </label>

                {!u.email && (
                  <InlineEmail onSave={(v) => patchUser(u.id, { email: v })} />
                )}
              </div>

              {needsTelegramLink && (
                <div className="mt-3">
                  <p className="mb-1 font-mono text-[11px] text-faint">
                    Send this connect link, they tap Start in Telegram:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg bg-paper px-3 py-2 font-mono text-[11px] text-muted">
                      {link}
                    </code>
                    <button
                      onClick={() => copy(link, u.id)}
                      disabled={!botUsername}
                      className="shrink-0 rounded-lg border border-hair px-3 py-2 text-xs text-muted hover:text-ink disabled:opacity-50"
                    >
                      {copied === u.id ? "Copied" : "Copy link"}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-3">
                <p className="mb-1 font-mono text-[11px] text-faint">
                  Personal dashboard link (no login, they can add and update
                  tasks):
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg bg-paper px-3 py-2 font-mono text-[11px] text-muted">
                    {dashboardLink(u)}
                  </code>
                  <button
                    onClick={() => copy(dashboardLink(u), `${u.id}-dash`)}
                    className="shrink-0 rounded-lg border border-hair px-3 py-2 text-xs text-muted hover:text-ink"
                  >
                    {copied === `${u.id}-dash` ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChannelBadge({
  channel,
}: {
  channel: "telegram" | "email" | "none";
}) {
  const map = {
    telegram: { label: "Telegram ready", cls: "bg-trackSoft text-track" },
    email: { label: "Email ready", cls: "bg-trackSoft text-track" },
    none: { label: "Not reachable", cls: "bg-slipSoft text-slip" },
  }[channel];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px] ${map.cls}`}
    >
      {map.label}
    </span>
  );
}

function InlineEmail({ onSave }: { onSave: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add email"
        className="rounded-lg border border-hair bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
      />
      <button
        onClick={() => value.includes("@") && onSave(value)}
        disabled={!value.includes("@")}
        className="rounded-lg border border-hair px-3 py-1.5 text-xs text-muted hover:text-ink disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}
