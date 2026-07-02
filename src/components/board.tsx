"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { AssignmentContext, TaskStatus, TaskTrack } from "@/lib/db/types";
import { Avatar, RiskBadge, TrackChip, timeAgo } from "./ui";

const TRACK_TABS: { key: TaskTrack | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "product", label: "Product" },
  { key: "sales", label: "Sales" },
  { key: "gtm", label: "GTM" },
  { key: "dev", label: "Dev" },
];

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "in_review", label: "In review" },
  { key: "done", label: "Done" },
];

// Each status gets its own colour: the whole column is tinted, the header dot +
// count take the colour, and every card carries a matching left edge.
const STATUS_STYLE: Record<
  TaskStatus,
  { dot: string; colBg: string; text: string; edge: string }
> = {
  todo: { dot: "bg-idle", colBg: "bg-idleSoft", text: "text-idle", edge: "border-l-idle" },
  in_progress: { dot: "bg-info", colBg: "bg-infoSoft", text: "text-info", edge: "border-l-info" },
  blocked: { dot: "bg-block", colBg: "bg-blockSoft", text: "text-block", edge: "border-l-block" },
  in_review: { dot: "bg-slip", colBg: "bg-slipSoft", text: "text-slip", edge: "border-l-slip" },
  done: { dot: "bg-track", colBg: "bg-trackSoft", text: "text-track", edge: "border-l-track" },
  cancelled: { dot: "bg-idle", colBg: "bg-idleSoft", text: "text-idle", edge: "border-l-idle" },
};
const COLUMN_KEYS = COLUMNS.map((c) => c.key);

function priorityMeta(p: number) {
  if (p === 1) return { label: "High", cls: "bg-blockSoft text-block" };
  if (p === 3) return { label: "Low", cls: "bg-idleSoft text-idle" };
  return { label: "Medium", cls: "bg-slipSoft text-slip" };
}

function DueChip({ iso }: { iso: string }) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  const label = new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const cls =
    days < 0 ? "bg-blockSoft text-block" : days <= 1 ? "bg-slipSoft text-slip" : "bg-idleSoft text-idle";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {days < 0 ? "Overdue" : label}
    </span>
  );
}

export function Board({
  initial,
  disableOpen,
}: {
  initial: AssignmentContext[];
  disableOpen?: boolean;
}) {
  const router = useRouter();
  const [cards, setCards] = useState<AssignmentContext[]>(
    initial.filter((a) => COLUMN_KEYS.includes(a.status))
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [track, setTrack] = useState<TaskTrack | "all">("all");
  const [detail, setDetail] = useState<AssignmentContext | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    setCards(initial.filter((a) => COLUMN_KEYS.includes(a.status)));
  }, [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function onDragStart(e: DragStartEvent) {
    draggedRef.current = true;
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const overId = e.over?.id ? (String(e.over.id) as TaskStatus) : null;
    if (!overId || !COLUMN_KEYS.includes(overId)) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.status === overId) return;

    const prev = card.status;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status: overId } : c)));
    const res = await fetch(`/api/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: overId }),
    });
    if (!res.ok) {
      setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status: prev } : c)));
    } else {
      router.refresh();
    }
  }

  function openCard(a: AssignmentContext) {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (disableOpen) {
      setDetail(a);
      return;
    }
    router.push(`/tasks/${a.task_id}`);
  }

  const active = cards.find((c) => c.id === activeId) ?? null;

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hair bg-surface px-6 py-12 text-center">
        <p className="font-medium text-ink">No tasks on the board yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Create a task and assign it. Each person becomes a card you can drag
          across the columns.
        </p>
      </div>
    );
  }

  const shown =
    track === "all" ? cards : cards.filter((c) => (c.task.track ?? "product") === track);

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TRACK_TABS.map((t) => {
          const n =
            t.key === "all"
              ? cards.length
              : cards.filter((c) => (c.task.track ?? "product") === t.key).length;
          const isActive = track === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTrack(t.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? "border-accent bg-accentSoft text-ink"
                  : "border-hair bg-surface text-muted hover:text-ink"
              }`}
            >
              {t.label} <span className="text-faint">{n}</span>
            </button>
          );
        })}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* Horizontal-scroll on small screens (swipe columns), 5-across on lg. */}
        <div className="flex snap-x gap-3 overflow-x-auto pb-2 lg:snap-none">
          {COLUMNS.map((col) => (
            <Column
              key={col.key}
              status={col.key}
              label={col.label}
              cards={shown.filter((c) => c.status === col.key)}
              onOpen={openCard}
            />
          ))}
        </div>
        <DragOverlay>{active ? <Card a={active} overlay /> : null}</DragOverlay>
      </DndContext>

      {detail && <DetailModal a={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function Column({
  status,
  label,
  cards,
  onOpen,
}: {
  status: TaskStatus;
  label: string;
  cards: AssignmentContext[];
  onOpen: (a: AssignmentContext) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const s = STATUS_STYLE[status];
  return (
    <div
      ref={setNodeRef}
      className={`flex h-[74vh] w-[82vw] max-w-[330px] shrink-0 snap-start flex-col rounded-2xl p-2.5 transition lg:w-auto lg:max-w-none lg:flex-1 ${s.colBg} ${
        isOver ? "ring-2 ring-accent" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
          <span className={`text-xs font-semibold uppercase tracking-wide ${s.text}`}>
            {label}
          </span>
        </span>
        <span
          className={`rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold ${s.text}`}
        >
          {cards.length}
        </span>
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto pr-0.5">
        {cards.map((a) => (
          <DraggableCard key={a.id} a={a} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({
  a,
  onOpen,
}: {
  a: AssignmentContext;
  onOpen: (a: AssignmentContext) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: a.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(a)}
      className={`cursor-grab touch-none active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <Card a={a} />
    </div>
  );
}

function Card({ a, overlay }: { a: AssignmentContext; overlay?: boolean }) {
  const snoozed = a.snoozed_until && new Date(a.snoozed_until) > new Date();
  return (
    <div
      className={`rounded-xl border border-l-[3px] bg-surface p-3.5 shadow-sm ${
        STATUS_STYLE[a.status].edge
      } ${overlay ? "rotate-2 shadow-lg" : "border-hair transition hover:shadow-md"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
          {a.task.title}
        </p>
        {a.needs_attention && (
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-block"
            title="Needs attention"
          />
        )}
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
        {a.ai_summary ?? a.task.description ?? "No update yet."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <TrackChip track={a.task.track} />
        {a.task.due_at && <DueChip iso={a.task.due_at} />}
        {!a.agent_enabled && (
          <span className="text-[10px] text-faint">agent off</span>
        )}
        {snoozed && <span className="text-[10px] text-faint">snoozed</span>}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-hair/70 pt-2.5">
        <span className="flex items-center gap-1.5">
          <Avatar name={a.user.name} />
          <span className="text-[11px] font-medium text-ink">{a.user.name}</span>
        </span>
        <RiskBadge risk={a.ai_risk} />
      </div>
    </div>
  );
}

// Format a task description: lines like "GOAL: ..." get a coloured label.
function renderSpec(desc: string) {
  return desc
    .split("\n")
    .map((line, i) => {
      const m = line.match(/^([A-Z][A-Z0-9 ]{1,24}):\s?(.*)$/);
      if (m) {
        return (
          <p key={i} className="mb-2 leading-relaxed">
            <span className="font-semibold text-accent">{m[1]}</span>
            <span className="text-ink"> {m[2]}</span>
          </p>
        );
      }
      return line.trim() ? (
        <p key={i} className="mb-2 leading-relaxed text-ink">
          {line}
        </p>
      ) : null;
    })
    .filter(Boolean);
}

function DetailModal({ a, onClose }: { a: AssignmentContext; onClose: () => void }) {
  const s = STATUS_STYLE[a.status];
  const pm = priorityMeta(a.task.priority);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colored header */}
        <div className={`rounded-t-2xl px-5 py-4 ${s.colBg}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <TrackChip track={a.task.track} />
              <span className={`rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold ${s.text}`}>
                {COLUMNS.find((c) => c.key === a.status)?.label ?? a.status}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pm.cls}`}>
                {pm.label}
              </span>
              {a.task.due_at && <DueChip iso={a.task.due_at} />}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg bg-surface/70 px-2 py-1 text-sm text-muted hover:text-ink"
            >
              ✕
            </button>
          </div>
          <h3 className="mt-2 font-serif text-xl font-semibold text-ink">
            {a.task.title}
          </h3>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <Avatar name={a.user.name} />
            <span className="font-medium text-ink">{a.user.name}</span>
            <span>· assigned by {a.task.created_by ?? "Charan"}</span>
            <span>· {timeAgo(a.created_at)}</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <div className="rounded-xl bg-paper p-4 text-sm">
            {a.task.description ? (
              renderSpec(a.task.description)
            ) : (
              <p className="text-muted">No description yet.</p>
            )}
          </div>
          {a.ai_summary && (
            <div className="mt-3">
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-faint">
                Latest update
              </p>
              <p className="text-sm text-ink">{a.ai_summary}</p>
            </div>
          )}
          <button
            onClick={onClose}
            className="mt-4 rounded-lg border border-hair px-4 py-2 text-sm text-muted hover:text-ink"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
