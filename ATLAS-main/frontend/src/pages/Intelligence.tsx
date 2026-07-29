import { useAtlas } from "../hooks/useAtlas";

const SEV_COLOR: Record<string, string> = {
  low: "var(--success)", medium: "var(--warning)", high: "#e8722c", critical: "var(--danger)",
};

const TYPE_COLORS: Record<string, string> = {
  brute_force: "#7c5cf0", port_scan: "#12b3c4", ddos: "#dd3e46",
  sql_injection: "#e5636a", phishing: "#f0973a", malware: "#b13138",
  insider_threat: "#c94b8c", weak_password: "#b8862e", normal: "#1e9e71",
  security_posture: "#3d63e6", privilege_escalation: "#dd3e46",
  data_exfiltration: "#e5636a", reverse_shell: "#b13138", xss: "#f0973a",
};

function pad(n: number) { return n < 10 ? "0" + n : n; }
function timeStr(ts?: string) {
  const d = ts ? new Date(ts) : new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function Intelligence() {
  const { state, liveEvents, memoryStats, searchQuery } = useAtlas();

  const allEvents = [
    ...liveEvents,
    ...state.events.map(e => ({ id: e.id, ts: e.ts ?? "", type: e.type, severity: e.severity, source: e.source ?? "" })),
  ].filter((e, i, arr) => arr.findIndex(x => x.id === e.id && e.id) === i).slice(0, 60);

  // Apply search filter to event stream
  const filteredEvents = searchQuery
    ? allEvents.filter(e =>
        e.type.includes(searchQuery.toLowerCase()) ||
        e.source.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allEvents;

  const typeCounts = state.stats.event_type_counts ?? {};
  const total = Object.values(typeCounts).reduce((s, v) => s + v, 0) || 1;
  const sevCounts = state.stats.severity_counts ?? {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Threat Intelligence</div>
        <h1 style={{ fontFamily: "var(--f-display)", fontSize: 24, margin: "0 0 4px" }}>Intelligence</h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Attack type distribution, blocked IPs, and live event telemetry.
        </p>
      </div>

      {/* Top row: stats + blocked IPs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

        {/* Attack distribution */}
        <div className="neo" style={{ padding: 20 }}>
          <div className="panel-title" style={{ marginBottom: 16 }}>Attack Type Distribution</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(typeCounts).length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 12 }}>No events yet.</div>
            )}
            {Object.entries(typeCounts).map(([type, count]) => {
              const pct = Math.round((count / total) * 100);
              return (
                <div key={type}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                    <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>
                      {type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="neo-inset" style={{ height: 8, borderRadius: 6, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${pct}%`,
                      background: TYPE_COLORS[type] ?? "var(--accent)",
                      borderRadius: 6, transition: "width .4s ease",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Severity breakdown + blocked IPs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="neo" style={{ padding: 20 }}>
            <div className="panel-title" style={{ marginBottom: 14 }}>Severity Breakdown</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {["critical", "high", "medium", "low"].map(sev => (
                <div key={sev} className="neo-inset" style={{ padding: "12px 14px", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--faint)",
                                textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>{sev}</div>
                  <div style={{ fontFamily: "var(--f-display)", fontSize: 24, fontWeight: 700,
                                color: SEV_COLOR[sev] }}>{sevCounts[sev] ?? 0}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="neo" style={{ padding: 20, flex: 1 }}>
            <div className="panel-title" style={{ marginBottom: 14 }}>Blocked IPs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 160, overflowY: "auto" }}>
              {state.blocked_ips.length === 0 && (
                <div style={{ color: "var(--muted)", fontSize: 12 }}>No IPs blocked yet.</div>
              )}
              {(state.blocked_ips as any[]).slice(0, 10).map((entry: any, i: number) => (
                <div key={i} className="neo-inset" style={{
                  padding: "8px 12px", display: "flex", alignItems: "center", gap: 10,
                  fontFamily: "var(--f-mono)", fontSize: 11.5,
                }}>
                  <span style={{ color: "var(--danger)", fontWeight: 700 }}>DENY</span>
                  <span style={{ color: "var(--ink-2)" }}>{entry.params?.target ?? entry.params?.target_ip ?? entry.params?.ip ?? entry.agent_name ?? "—"}</span>
                  <span style={{ marginLeft: "auto", color: "var(--faint)", fontSize: 10 }}>ALL PORTS</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Memory Stats — what ATLAS has learned */}
      {memoryStats && (memoryStats.total_memories > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

          {/* Recurring threats */}
          <div className="neo" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div className="panel-title" style={{ margin: 0 }}>ATLAS Memory</div>
              <span style={{
                fontSize: 10, fontFamily: "var(--f-mono)", padding: "2px 8px",
                borderRadius: 20, background: "var(--success-soft)", color: "var(--success)",
              }}>{memoryStats.total_memories} records</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.keys(memoryStats.by_type).length === 0 && (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>No memory yet.</div>
              )}
              {Object.entries(memoryStats.by_type).map(([type, count]) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: count >= 3 ? "var(--danger)" : "var(--warning)",
                  }} />
                  <span style={{ flex: 1, color: "var(--ink-2)" }}>
                    {type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <span style={{ fontFamily: "var(--f-mono)", color: count >= 3 ? "var(--danger)" : "var(--muted)" }}>
                    {count}x {count >= 3 ? "⚠ recurring" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top offender IPs */}
          <div className="neo" style={{ padding: 20 }}>
            <div className="panel-title" style={{ marginBottom: 14 }}>Top Offender IPs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {memoryStats.top_offender_ips.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>No repeat offenders yet.</div>
              )}
              {memoryStats.top_offender_ips.map((entry, i) => (
                <div key={i} className="neo-inset" style={{
                  padding: "8px 12px", display: "flex", alignItems: "center", gap: 10,
                  fontFamily: "var(--f-mono)", fontSize: 11.5,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                    background: entry.count >= 3 ? "var(--danger-soft)" : "var(--warning-soft)",
                    color: entry.count >= 3 ? "var(--danger)" : "var(--warning)",
                  }}>{entry.count >= 3 ? "AUTO-BLOCK" : "WATCH"}</span>
                  <span style={{ flex: 1, color: "var(--ink-2)" }}>{entry.ip}</span>
                  <span style={{ color: "var(--faint)", fontSize: 10 }}>{entry.count} hits</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Live event stream */}
      <div className="neo" style={{ overflow: "hidden" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "13px 16px", borderBottom: "1px solid var(--line)",
        }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#e5484d", display: "inline-block" }} />
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#de8b2c", display: "inline-block" }} />
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1e9e71", display: "inline-block" }} />
          <span style={{ marginLeft: 10, fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
            threat-intel-stream.log
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--faint)", fontFamily: "var(--f-mono)" }}>
            {filteredEvents.length} events{searchQuery ? ` (filtered)` : ""}
          </span>
        </div>
        <div style={{
          fontFamily: "var(--f-mono)", fontSize: 11.5, lineHeight: 1.9,
          padding: "12px 16px", height: 280, overflowY: "auto",
        }}>
          {filteredEvents.length === 0 && (
            <div style={{ color: "var(--faint)" }}>
              {searchQuery ? `No events matching "${searchQuery}"` : "Waiting for threat intelligence…"}
            </div>
          )}
          {filteredEvents.map((e, i) => {
            const tag = e.severity === "critical" ? "t-crit" : e.severity === "high" ? "t-warn" : e.severity === "medium" ? "t-warn" : "t-info";
            return (
              <div key={e.id ?? i} className="log-line">
                <span className="log-time">{timeStr(e.ts)}</span>
                <span className={`log-tag ${tag}`}>●</span>
                <span className="log-msg">[{e.type.replace(/_/g, " ").toUpperCase()}] {e.source}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
