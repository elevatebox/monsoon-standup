import { Message } from "@/lib/db/types";

// The conversation log: agent questions, assignee replies, system events.
export function Thread({
  messages,
  assigneeName,
}: {
  messages: Message[];
  assigneeName: string;
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hair bg-surface px-4 py-8 text-center text-sm text-muted">
        Nothing yet. The agent will ask its first question on the next hourly run.
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {messages.map((m) => (
        <li key={m.id}>
          <Bubble message={m} assigneeName={assigneeName} />
        </li>
      ))}
    </ol>
  );
}

function Bubble({
  message,
  assigneeName,
}: {
  message: Message;
  assigneeName: string;
}) {
  const when = new Date(message.created_at).toLocaleString();

  if (message.direction === "system") {
    return (
      <div className="text-center">
        <span className="font-mono text-[11px] text-faint">
          {message.body} · {when}
        </span>
      </div>
    );
  }

  const outbound = message.direction === "outbound";
  return (
    <div className={`flex ${outbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-xl px-3.5 py-2.5 ${
          outbound
            ? "border border-hair bg-surface"
            : "bg-accentSoft text-ink"
        }`}
      >
        <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-faint">
          {outbound ? "Agent" : assigneeName} · {when}
        </p>
        <p className="whitespace-pre-wrap text-sm text-ink">{message.body}</p>
        {message.attachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {message.attachments.map((a, i) => (
              <span key={i} className="font-mono text-[11px] text-accent">
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="underline">
                    {a.url}
                  </a>
                ) : (
                  `[${a.kind}] ${a.name ?? a.file_id ?? ""}`
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
