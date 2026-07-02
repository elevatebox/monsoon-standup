"use client";

import { useState } from "react";
import { User } from "@/lib/db/types";

// Add a new person to the team, then show their two personal links to share.
export function AddMemberForm({
  appUrl,
  botUsername,
  onAdded,
}: {
  appUrl: string;
  botUsername: string;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<User | null>(null);
  const [copied, setCopied] = useState("");

  async function add() {
    if (!name.trim()) {
      setError("Give them a name.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, email }),
    });
    setSaving(false);
    if (res.ok) {
      const { user } = await res.json();
      setAdded(user);
      onAdded();
    } else {
      setError("Could not add them. Try again.");
    }
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  }

  if (added) {
    const board = `${appUrl}/u/${added.onboarding_token}`;
    const tg = botUsername
      ? `https://t.me/${botUsername}?start=${added.onboarding_token}`
      : "";
    return (
      <div>
        <p className="text-sm text-ink">
          Added <span className="font-medium">{added.name}</span>. Send them
          these two links:
        </p>
        <LinkRow
          label="Board (no login)"
          value={board}
          copied={copied === "board"}
          onCopy={() => copy(board, "board")}
        />
        {tg && (
          <LinkRow
            label="Telegram (tap, then Start)"
            value={tg}
            copied={copied === "tg"}
            onCopy={() => copy(tg, "tg")}
          />
        )}
        <button
          onClick={() => {
            setAdded(null);
            setName("");
            setRole("");
            setEmail("");
          }}
          className="mt-3 rounded-lg border border-hair px-3 py-1.5 text-sm text-muted hover:text-ink"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
        Add a teammate
      </p>
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
          placeholder="Role (optional)"
          className="rounded-lg border border-hair bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional)"
          className="rounded-lg border border-hair bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      {error && <p className="text-sm text-block">{error}</p>}
      <button
        onClick={add}
        disabled={saving || !name.trim()}
        className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Adding..." : "Add teammate"}
      </button>
    </div>
  );
}

function LinkRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mt-2">
      <p className="mb-1 font-mono text-[11px] text-faint">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg bg-paper px-3 py-2 font-mono text-[11px] text-muted">
          {value}
        </code>
        <button
          onClick={onCopy}
          className="shrink-0 rounded-lg border border-hair px-3 py-2 text-xs text-muted hover:text-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
