import { useAtlas } from "../hooks/useAtlas";

const SEV_COLOR: Record<string, string> = {
  low: "var(--success)", medium: "var(--warning)", high: "#e8722c", critical: "var(--danger)",
};

function StatCard({ label, value, trend, trendDir, icon, iconBg, iconColor }: {
  label: string; value: string | number;
  trend?: string; trendDir?: "up" | "down" | "flat";
  icon: React.ReactNode; iconBg: string; iconColor: string;
}) {
  return (
    <div className="stat-card neo">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: iconBg, color: iconColor,
        }}>{icon}</div>
        {trend && <span className={`stat-trend ${trendDir ?? "flat"}`}>{trend}</span>}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Svg({ d, size = 17 }: { d: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

function pad(n: number) { return n < 10 ? "0" + n : n; }
function timeStr(ts?: string) {
  const d = ts ? new Date(ts) : new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function MachinePanel() {
  const { machine } = useAtlas();
  if (!machine) return (
    <div className="neo" style={{ padding: 20, gridColumn: "1 / -1" }}>
      <div style={{ color: "var(--muted)", fontSize: 12, fontFamily: "var(--f-mono)" }}>Profiling machine…</div>
    </div>
  );

  const fw = machine.firewall.enabled;
  const ifaces = Object.entries(machine.network_interfaces);

  return (
    <div className="neo" style={{ padding: 20, gridColumn: "1 / -1" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div className="panel-title" style={{ margin: 0 }}>Monitored Machine</div>
        <span className="badge" style={{
          background: fw ? "var(--success-soft)" : "var(--danger-soft)",
          color: fw ? "var(--success)" : "var(--danger)",
        }}>Firewall {fw ? "ON" : "OFF ⚠"}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
          profiled {new Date(machine.profiled_at).toLocaleTimeString()}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {/* Identity */}
        <div className="neo-flat" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Identity</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700 }}>{machine.hostname}</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{machine.primary_ip}</div>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 4 }}>{machine.os.slice(0, 40)}</div>
        </div>
        {/* Network */}
        <div className="neo-flat" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Network</div>
          {ifaces.slice(0, 3).map(([k, v]) => (
            <div key={k} style={{ fontFamily: "var(--f-mono)", fontSize: 11, marginBottom: 2 }}>
              <span style={{ color: "var(--muted)" }}>{k}: </span>{v}
            </div>
          ))}
          {machine.network_topology.gateway && (
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
              GW: {machine.network_topology.gateway}
            </div>
          )}
        </div>
        {/* Open Ports */}
        <div className="neo-flat" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Open Ports ({machine.open_ports.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {machine.open_ports.slice(0, 12).map(p => (
              <span key={p.port} className="chip" style={{ fontSize: 10, padding: "2px 6px" }}
                title={p.process}>{p.port}</span>
            ))}
          </div>
        </div>
        {/* Security */}
        <div className="neo-flat" style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Security Tools</div>
          {machine.security_tools.length === 0
            ? <div style={{ fontSize: 11, color: "var(--danger)" }}>⚠ None detected</div>
            : machine.security_tools.map(t => (
              <div key={t} style={{ fontSize: 11, color: "var(--success)", marginBottom: 2 }}>✓ {t}</div>
            ))
          }
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
            {machine.cpu_cores} cores · {machine.ram_gb}GB RAM · {machine.disk_gb}GB disk
          </div>
        </div>
      </div>
      {/* Users row */}
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Local Users:</span>
        {machine.local_users.slice(0, 10).map(u => (
          <span key={u} className="chip" style={{ fontSize: 10, padding: "2px 8px" }}>{u}</span>
        ))}
      </div>
    </div>
  );
}

export default function Overview() {
  const { state, liveEvents } = useAtlas();

  const allEvents = [
    ...liveEvents,
    ...state.events.map(e => ({ id: e.id, ts: e.ts ?? "", type: e.type, severity: e.severity, source: e.source ?? "" })),
  ].filter((e, i, arr) => arr.findIndex(x => x.id === e.id && e.id) === i).slice(0, 80);

  const open = state.incidents.filter(i => i.status === "open" || i.status === "approved");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Eyebrow */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Live Operations</div>
        <h1 style={{ fontFamily: "var(--f-display)", fontSize: 24, margin: "0 0 4px" }}>Command Deck</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: 560 }}>
          Real-time security posture — {state.stats.agents_active} agents active, Decision Core orchestrating.
        </p>
      </div>

      {/* Machine Profile */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr" }}>
        <MachinePanel />
      </div>

      {/* Severity breakdown bar */}
      {(() => {
        const sc = state.stats.severity_counts;
        const total = Object.values(sc).reduce((a, b) => a + b, 0) || 1;
        const bars = [
          { key: "critical", color: "var(--danger)" },
          { key: "high",     color: "#e8722c" },
          { key: "medium",   color: "var(--warning)" },
          { key: "low",      color: "var(--success)" },
        ];
        return (
          <div className="neo" style={{ padding: "14px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>Incident Severity Distribution</div>
              <div style={{ display: "flex", gap: 14 }}>
                {bars.map(b => (
                  <span key={b.key} style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: b.color }}>
                    {b.key}: {sc[b.key] ?? 0}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", height: 8, borderRadius: 6, overflow: "hidden", gap: 2 }}>
              {bars.map(b => {
                const pct = Math.round(((sc[b.key] ?? 0) / total) * 100);
                return pct > 0 ? (
                  <div key={b.key} style={{ width: `${pct}%`, background: b.color, borderRadius: 4, transition: "width .4s ease" }} />
                ) : null;
              })}
              {total === 1 && <div style={{ width: "100%", background: "var(--line)", borderRadius: 4 }} />}
            </div>
          </div>
        );
      })()}

      {/* Stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 18 }}>
        <StatCard
          label="Security Score" value={state.security_score}
          trend={state.security_score >= 80 ? "GOOD" : state.security_score >= 50 ? "FAIR" : "POOR"}
          trendDir={state.security_score >= 80 ? "down" : "up"}
          iconBg="var(--success-soft)" iconColor="var(--success)"
          icon={<Svg d={<><path d="M12 2 4 5v6c0 5.5 3.5 9.5 8 11 4.5-1.5 8-5.5 8-11V5z"/></>} />}
        />
        <StatCard
          label="Open Incidents" value={state.stats.open_incidents}
          trend={state.stats.open_incidents > 0 ? `+${state.stats.open_incidents}` : "0"}
          trendDir={state.stats.open_incidents > 0 ? "up" : "flat"}
          iconBg="var(--danger-soft)" iconColor="var(--danger)"
          icon={<Svg d={<><path d="M12 3 22 20H2Z"/><path d="M12 9.4v4.6"/><circle cx="12" cy="17" r=".2" fill="currentColor"/></>} />}
        />
        <StatCard
          label="Agents Active" value={`${state.stats.agents_active}/14`}
          trend={Math.round((state.stats.agents_active / 14) * 100) + "%"}
          trendDir="down"
          iconBg="var(--info-soft)" iconColor="var(--info)"
          icon={<Svg d={<><rect x="7" y="7" width="10" height="10" rx="2"/><rect x="10.3" y="10.3" width="3.4" height="3.4"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></>} />}
        />
        <StatCard
          label="Total Events" value={state.stats.total_events}
          trend="live" trendDir="flat"
          iconBg="var(--warning-soft)" iconColor="var(--warning)"
          icon={<Svg d={<path d="M2 12.6h4.4l2-6.4 3.6 13 2.4-9.6 1.6 3h5.8"/>} />}
        />
      </div>

      {/* Main two-col */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 18, alignItems: "start" }}>

        {/* Terminal / event stream */}
        <div className="neo" style={{ overflow: "hidden" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "13px 16px", borderBottom: "1px solid var(--line)",
          }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#e5484d", display: "inline-block" }} />
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#de8b2c", display: "inline-block" }} />
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1e9e71", display: "inline-block" }} />
            <span style={{ marginLeft: 10, fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
              live-event-stream.log
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--faint)", fontFamily: "var(--f-mono)" }}>
              {allEvents.length} events
            </span>
          </div>
          <div style={{
            fontFamily: "var(--f-mono)", fontSize: 11.5, lineHeight: 1.9,
            padding: "12px 16px", height: 340, overflowY: "auto",
          }}>
            {allEvents.length === 0 && (
              <div style={{ color: "var(--faint)", padding: "8px 0" }}>Waiting for events…</div>
            )}
            {allEvents.map((e, i) => {
              const tag = e.severity === "critical" ? "t-crit" : e.severity === "high" ? "t-warn" : e.severity === "medium" ? "t-warn" : "t-info";
              return (
                <div key={e.id ?? i} className={`log-line${i === 0 ? " fade-in" : ""}`}>
                  <span className="log-time">{timeStr(e.ts)}</span>
                  <span className={`log-tag ${tag}`}>●</span>
                  <span className="log-msg">
                    [{e.type.replace(/_/g, " ").toUpperCase()}] {e.source}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent incidents */}
        <div className="neo" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div className="panel-title">Recent Incidents</div>
            {open.length > 0 && <span className="badge badge-critical">{open.length} open</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 300, overflowY: "auto" }}>
            {state.incidents.length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 12, padding: "8px 0" }}>No incidents yet.</div>
            )}
            {state.incidents.slice(0, 8).map(inc => (
              <div key={inc.id} className="incident-row neo-flat">
                <div style={{
                  width: 4, alignSelf: "stretch", borderRadius: 4, flexShrink: 0,
                  background: SEV_COLOR[inc.severity] ?? "var(--muted)",
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 3 }}>
                    {inc.title}
                    <span className={`badge badge-${inc.status === "open" ? "active" : inc.status === "resolved" ? "resolved" : "approved"}`}
                      style={{ marginLeft: 6 }}>{inc.status}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)", display: "flex", gap: 8 }}>
                    <span>{inc.id}</span>
                    <span>{timeStr(inc.created_at)}</span>
                    <span style={{ color: SEV_COLOR[inc.severity] }}>{inc.severity}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
