import { useRef } from "react";

type Severity = "low" | "medium" | "high" | "critical";

export type DashboardEvent = {
  id?: string;
  ts?: string;
  type: string;
  severity: Severity;
  source?: string;
};

const SEV_TEXT: Record<Severity, string> = {
  low:      "text-low",
  medium:   "text-medium",
  high:     "text-high",
  critical: "text-critical",
};

const SEV_DOT: Record<Severity, string> = {
  low:      "bg-low",
  medium:   "bg-medium",
  high:     "bg-high",
  critical: "bg-critical",
};

const SEV_ROW: Record<Severity, string> = {
  low:      "",
  medium:   "",
  high:     "bg-high/[0.03]",
  critical: "bg-critical/[0.05]",
};

export default function EventStream({ events }: { events: DashboardEvent[] }) {
  const prevTopId = useRef<string | undefined>(undefined);
  const topId = events[0]?.id;
  const isNew = topId !== prevTopId.current;
  if (isNew) prevTopId.current = topId;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-base">
        <span className="section-label">LIVE EVENT STREAM</span>
        <div className="dot-live" />
        <span className="ml-auto text-muted text-[9px] tabular-nums">{events.length} events</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 && (
          <div className="px-3 py-4 text-muted text-[10px]">Waiting for events...</div>
        )}
        {events.map((e, i) => (
          <div
            key={e.id ?? i}
            className={`flex items-center gap-3 px-3 py-1.5 border-b border-border/20 text-[10px] ${SEV_ROW[e.severity]} ${i === 0 && isNew ? "animate-row-flash" : ""}`}
          >
            <div className={`shrink-0 w-1.5 h-1.5 rounded-full ${SEV_DOT[e.severity]}`} />
            <span className="text-muted shrink-0 w-16 tabular-nums">
              {e.ts
                ? e.ts.includes("T")
                  ? new Date(e.ts).toLocaleTimeString()
                  : e.ts
                : "—"}
            </span>
            <span className={`shrink-0 w-28 font-medium ${SEV_TEXT[e.severity]}`}>
              {e.type.replace(/_/g, " ")}
            </span>
            <span className="text-muted truncate">{e.source ?? ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
