import type { Incident } from "../hooks/useAtlas";

const SEV_BADGE: Record<string, string> = {
  critical: "badge-critical",
  high:     "badge-high",
  medium:   "badge-medium",
  low:      "badge-low",
};

// Left border color
const SEV_BORDER: Record<string, string> = {
  critical: "border-l-critical",
  high:     "border-l-high",
  medium:   "border-l-medium",
  low:      "border-l-low",
};

// Subtle tinted background per severity
const SEV_BG: Record<string, string> = {
  critical: "bg-critical/[0.04]",
  high:     "bg-high/[0.04]",
  medium:   "bg-medium/[0.03]",
  low:      "",
};

interface Props {
  incidents: Incident[];
  onApprove: (id: string) => void;
  onResolve: (id: string) => void;
}

export default function IncidentPanel({ incidents, onApprove, onResolve }: Props) {
  const open = incidents.filter(i => i.status === "open" || i.status === "approved");
  const critCount = open.filter(i => i.severity === "critical").length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="section-label">ACTIVE INCIDENTS</span>
        {open.length > 0 && (
          <span className={`text-[9px] px-1.5 py-0.5 tabular-nums ${critCount > 0 ? "badge-critical" : "badge-high"}`}>
            {open.length}
          </span>
        )}
        {critCount > 0 && (
          <span className="ml-auto text-[9px] text-critical animate-pulse tracking-wider">
            {critCount} CRITICAL
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {open.length === 0 && (
          <div className="flex items-center gap-2 text-low text-[10px] px-1 py-3">
            <div className="dot-live" />
            All clear — no active incidents.
          </div>
        )}

        {open.map(inc => {
          const isApproved = inc.status === "approved";
          return (
            <div
              key={inc.id}
              className={`border-l-2 ${SEV_BORDER[inc.severity] ?? "border-l-border"} ${SEV_BG[inc.severity] ?? ""} px-2.5 py-2 animate-fade-in`}
              style={{ background: isApproved ? "rgba(79,195,161,0.04)" : undefined,
                       boxShadow: "inset 2px 2px 5px #0e1014, inset -1px -1px 3px #262a33" }}
            >
              {/* Top row: badge + status + time */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[9px] px-1.5 py-0.5 ${SEV_BADGE[inc.severity] ?? ""}`}>
                  {inc.severity.toUpperCase()}
                </span>
                {isApproved && (
                  <span className="text-[9px] px-1.5 py-0.5 badge-low">APPROVED</span>
                )}
                <span className="ml-auto text-muted text-[9px] tabular-nums">
                  {new Date(inc.created_at).toLocaleTimeString()}
                </span>
              </div>

              {/* Title */}
              <div className="text-[10px] text-text/85 mb-2 leading-relaxed line-clamp-2">
                {inc.title}
              </div>

              {/* Actions */}
              <div className="flex gap-1.5">
                {inc.status === "open" && (
                  <button
                    onClick={() => onApprove(inc.id)}
                    className="neo-btn-accent text-[9px] px-2.5 py-1 tracking-wider"
                  >
                    ✓ APPROVE
                  </button>
                )}
                <button
                  onClick={() => onResolve(inc.id)}
                  className="neo-btn text-[9px] px-2.5 py-1 text-muted tracking-wider"
                >
                  ✕ RESOLVE
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
