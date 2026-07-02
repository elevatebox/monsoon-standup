import { ReplyButton } from "@/lib/transport/types";

// The buttons attached to every question. Values are parsed back in inbound.ts.
// Keep the value format stable: "<action>:<taskId>[:<arg>]".
export function buttonsForTask(taskId: string): ReplyButton[][] {
  return [
    [
      { label: "▶️ Working on it", value: `progress:${taskId}` },
      { label: "✅ Done", value: `done:${taskId}` },
    ],
    [
      { label: "⛔ Blocked", value: `blocked:${taskId}` },
      { label: "😴 Snooze 2h", value: `snooze:${taskId}:120` },
    ],
  ];
}

export type ButtonAction =
  | { action: "progress"; taskId: string }
  | { action: "done"; taskId: string }
  | { action: "blocked"; taskId: string }
  | { action: "snooze"; taskId: string; minutes: number };

export function parseButtonValue(value: string): ButtonAction | null {
  const [action, taskId, arg] = value.split(":");
  if (!action || !taskId) return null;

  if (action === "progress") return { action: "progress", taskId };
  if (action === "done") return { action: "done", taskId };
  if (action === "blocked") return { action: "blocked", taskId };
  if (action === "snooze") {
    let minutes = 120;
    if (arg === "tomorrow") {
      minutes = minutesUntilTomorrow9am();
    } else if (arg) {
      minutes = parseInt(arg, 10) || 120;
    }
    return { action: "snooze", taskId, minutes };
  }
  return null;
}

function minutesUntilTomorrow9am(): number {
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return Math.max(60, Math.round((next.getTime() - now.getTime()) / 60000));
}
