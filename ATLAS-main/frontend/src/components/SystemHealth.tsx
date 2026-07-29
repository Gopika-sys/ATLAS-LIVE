import type { Stats } from "../hooks/useAtlas";

const SEV_COLORS: Record<string, string> = {
  critical: "text-critical", high: "text-high", medium: "text-medium", low: "text-low",
};

function StatRow({ label, value, valueClass = "text-text" }: {
  label: string; value: React.ReactNode; valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/30 last:border-0">
      <span className="text-muted text-[9px] tracking-wider">{label}</span>
      <span className={`text-[10px] font-medium tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

export default function SystemHealth({ stats, connected }: { stats: Stats; connected: boolean }) {
  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-border">
        <span className="section-label">SYSTEM HEALTH</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <StatRow
          label="WS CONNECTION"
          value={connected ? "● LIVE" : "○ OFFLINE"}
          valueClass={connected ? "text-low" : "text-critical"}
        />
        <StatRow label="AGENTS ACTIVE" value={stats.agents_active} valueClass="text-accent" />
        <StatRow label="TOTAL EVENTS"  value={stats.total_events} />
        <StatRow
          label="OPEN INCIDENTS"
          value={stats.open_incidents}
          valueClass={stats.open_incidents > 0 ? "text-high" : "text-low"}
        />
        <div className="neo-divider my-1.5" />
        {(["critical", "high", "medium", "low"] as const).map(s => (
          <StatRow
            key={s}
            label={s.toUpperCase()}
            value={stats.severity_counts?.[s] ?? 0}
            valueClass={SEV_COLORS[s]}
          />
        ))}
      </div>
    </div>
  );
}
