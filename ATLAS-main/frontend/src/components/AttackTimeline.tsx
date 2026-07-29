import type { Incident } from "../hooks/useAtlas";

const SEV: Record<string, string> = {
  low: "border-low text-low",
  medium: "border-medium text-medium",
  high: "border-high text-high",
  critical: "border-critical text-critical",
};

export default function AttackTimeline({ incidents }: { incidents: Incident[] }) {
  const sorted = [...incidents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-border">
        <span className="section-label">ATTACK TIMELINE</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {sorted.length === 0 && <div className="text-muted text-[10px]">No incidents recorded.</div>}
        <div className="relative border-l border-border ml-1">
          {sorted.map((inc) => (
            <div key={inc.id} className="ml-3.5 mb-3 relative">
              <div className="absolute -left-[18px] top-1 w-1.5 h-1.5 neo-inset" />
              <div className={`text-[9px] border-l pl-2 ${SEV[inc.severity] ?? "border-muted text-muted"}`}>
                <div className="font-bold tracking-wide">{inc.title}</div>
                <div className="text-muted mt-0.5 tabular-nums">
                  {new Date(inc.created_at).toLocaleTimeString()} — {inc.status.toUpperCase()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
