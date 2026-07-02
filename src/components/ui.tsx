import { TaskRisk, TaskStatus, TaskTrack } from "@/lib/db/types";

// The function of the company a task belongs to.
export const TRACK_META: Record<
  TaskTrack,
  { label: string; chip: string; hex: string }
> = {
  product: { label: "Product", chip: "bg-infoSoft text-info", hex: "#3B82F6" },
  sales: { label: "Sales", chip: "bg-trackSoft text-track", hex: "#4E8E6E" },
  gtm: { label: "GTM", chip: "bg-slipSoft text-slip", hex: "#C68A3C" },
  dev: { label: "Dev", chip: "bg-plumSoft text-plum", hex: "#7C5CBF" },
};

export function TrackChip({ track }: { track: TaskTrack }) {
  const m = TRACK_META[track] ?? TRACK_META.product;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${m.chip}`}
    >
      {m.label}
    </span>
  );
}

// Risk badge: the colored read of how a task is going.
export function RiskBadge({ risk }: { risk: TaskRisk }) {
  const map: Record<TaskRisk, { label: string; cls: string }> = {
    on_track: { label: "On track", cls: "bg-trackSoft text-track" },
    slipping: { label: "Slipping", cls: "bg-slipSoft text-slip" },
    blocked: { label: "Blocked", cls: "bg-blockSoft text-block" },
    unknown: { label: "No signal", cls: "bg-idleSoft text-idle" },
  };
  const { label, cls } = map[risk];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

// Status pill: where the task is in the workflow.
export function StatusPill({ status }: { status: TaskStatus }) {
  const label: Record<TaskStatus, string> = {
    todo: "To do",
    in_progress: "In progress",
    blocked: "Blocked",
    in_review: "In review",
    done: "Done",
    cancelled: "Cancelled",
  };
  return (
    <span className="inline-flex items-center rounded-md border border-hair bg-paper px-2 py-0.5 font-mono text-[11px] text-muted">
      {label[status]}
    </span>
  );
}

// The colored left edge that gives every task row a risk spine.
export function riskEdge(risk: TaskRisk): string {
  return {
    on_track: "border-l-track",
    slipping: "border-l-slip",
    blocked: "border-l-block",
    unknown: "border-l-hair",
  }[risk];
}

// A small colored initials avatar, consistent across the board and dashboard.
const AVATAR_COLORS = ["#3E9E76", "#3B82F6", "#C68A3C", "#7C5CBF", "#CF5A54", "#4E8E6E"];
export function avatarColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
export function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}
export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-6 w-6 text-[10px]" : "h-5 w-5 text-[9px]";
  return (
    <span
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full font-bold text-white`}
      style={{ background: avatarColor(name) }}
    >
      {initials(name)}
    </span>
  );
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
