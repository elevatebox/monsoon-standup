"use client";

import { useRef, useState } from "react";

const CHIPS: { key: string; label: string; cls: string; on: string; hint: string }[] = [
  {
    key: "on_track",
    label: "On track",
    cls: "border-track text-track",
    on: "border-track bg-trackSoft text-track",
    hint: "What are you working on, and what's done so far?",
  },
  {
    key: "slipping",
    label: "Slipping",
    cls: "border-slip text-slip",
    on: "border-slip bg-slipSoft text-slip",
    hint: "What's slowing it down? When do you now expect it?",
  },
  {
    key: "blocked",
    label: "Blocked",
    cls: "border-block text-block",
    on: "border-block bg-blockSoft text-block",
    hint: "What's blocking you, and who can unblock it?",
  },
  {
    key: "done",
    label: "Done",
    cls: "border-accent text-accent",
    on: "border-accent bg-accentSoft text-accent",
    hint: "Anything to note, or a link to the work?",
  },
];

export function ReplyForm({ token }: { token: string }) {
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chip, setChip] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const selected = CHIPS.find((c) => c.key === chip);
  const placeholder = selected
    ? selected.hint
    : "What's the status? What are you working on? Anything blocking you?";

  async function submit() {
    if (!chip && !text.trim() && !dueAt) {
      setError("Pick a status or write a quick remark first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          chip: chip ?? undefined,
          text: text.trim() || undefined,
          due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save that. Try again.");
        return;
      }
      setDone(
        data.summary
          ? `Got it. The task now reads: ${data.summary}`
          : "Got it, thanks. Your update is logged."
      );
    } catch {
      setError("Network hiccup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType });
        await transcribe(blob, rec.mimeType);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Could not access the mic. Type your remark instead.");
    }
  }

  function stopRecording() {
    recRef.current?.stop();
    setRecording(false);
  }

  async function transcribe(blob: Blob, mime: string) {
    setTranscribing(true);
    setError("");
    try {
      const data = await blobToBase64(blob);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, audio: { data, mime } }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Could not transcribe. Type instead.");
        return;
      }
      setText((t) => (t ? `${t} ${j.text}` : j.text));
    } catch {
      setError("Could not transcribe. Type instead.");
    } finally {
      setTranscribing(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-track bg-trackSoft p-4 text-center">
        <p className="text-2xl">✓</p>
        <p className="mt-1 text-sm text-ink">{done}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-faint">
          Status (optional)
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              onClick={() => setChip((cur) => (cur === c.key ? null : c.key))}
              disabled={busy}
              className={`rounded-xl border-2 bg-surface px-3 py-2.5 text-sm font-medium disabled:opacity-50 ${
                chip === c.key ? c.on : c.cls
              }`}
            >
              {chip === c.key ? "✓ " : ""}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-faint">
          Your remark
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className="w-full rounded-xl border border-hair bg-surface px-3.5 py-2.5 text-ink outline-none focus:border-accent"
        />
        <div className="mt-2 flex items-center gap-2">
          {!recording ? (
            <button
              onClick={startRecording}
              disabled={busy || transcribing}
              className="rounded-xl border border-hair px-3 py-2 text-sm text-muted hover:text-ink disabled:opacity-50"
            >
              {transcribing ? "Transcribing…" : "🎙 Voice note"}
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="rounded-xl border-2 border-block bg-blockSoft px-3 py-2 text-sm font-medium text-block"
            >
              ◼ Stop recording
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-faint">
          ETA (optional)
        </p>
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="w-full rounded-xl border border-hair bg-surface px-3.5 py-2.5 text-ink"
        />
      </div>

      {error && <p className="text-sm text-block">{error}</p>}

      <button
        onClick={submit}
        disabled={busy || transcribing}
        className="rounded-xl bg-accent px-5 py-3 font-medium text-white disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send update"}
      </button>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
