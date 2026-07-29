const TYPE_COLOR: Record<string, string> = {
  malware:              "bg-critical",
  reverse_shell:        "bg-critical",
  privilege_escalation: "bg-critical",
  brute_force:          "bg-high",
  insider_threat:       "bg-high",
  data_exfiltration:    "bg-high",
  phishing:             "bg-high",
  ddos:                 "bg-medium",
  sql_injection:        "bg-medium",
  port_scan:            "bg-medium",
  xss:                  "bg-medium",
  weak_password:        "bg-low",
};

const TYPE_TEXT: Record<string, string> = {
  malware:              "text-critical",
  reverse_shell:        "text-critical",
  privilege_escalation: "text-critical",
  brute_force:          "text-high",
  insider_threat:       "text-high",
  data_exfiltration:    "text-high",
  phishing:             "text-high",
  ddos:                 "text-medium",
  sql_injection:        "text-medium",
  port_scan:            "text-medium",
  xss:                  "text-medium",
  weak_password:        "text-low",
};

export default function ThreatStats({ eventTypeCounts }: { eventTypeCounts: Record<string, number> }) {
  const entries = Object.entries(eventTypeCounts)
    .filter(([k]) => k !== "normal")
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  const max = entries[0]?.[1] ?? 1;
  const total = entries.reduce((s, [, c]) => s + c, 0);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="section-label">THREAT STATISTICS</span>
        {total > 0 && (
          <span className="ml-auto text-muted text-[9px] tabular-nums">{total} total</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {entries.length === 0 && (
          <div className="text-muted text-[10px]">No threat data yet.</div>
        )}
        {entries.map(([type, count], i) => {
          const pct = Math.round((count / max) * 100);
          return (
            <div key={type}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted text-[8px] tabular-nums w-3">{i + 1}</span>
                  <span className={`text-[9px] tracking-wide ${TYPE_TEXT[type] ?? "text-text"}`}>
                    {type.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted text-[9px] tabular-nums">{count}</span>
                  <span className="text-muted text-[8px] tabular-nums w-7 text-right">{pct}%</span>
                </div>
              </div>
              {/* Inset track + filled bar */}
              <div className="h-1 w-full rounded-none"
                   style={{ boxShadow: "inset 1px 1px 3px #0e1014, inset -1px -1px 2px #262a33", background: "#15171c" }}>
                <div
                  className={`h-1 ${TYPE_COLOR[type] ?? "bg-accent"} transition-all duration-500`}
                  style={{ width: `${pct}%`, opacity: 0.85 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
