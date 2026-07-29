import { useState } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useAtlas } from "./hooks/useAtlas";
import Overview       from "./pages/Overview";
import Incidents      from "./pages/Incidents";
import Agents         from "./pages/Agents";
import Intelligence   from "./pages/Intelligence";
import Voice          from "./pages/Voice";
import NetworkMonitor from "./pages/NetworkMonitor";

/* ── SVG icon helper ── */
function Icon({ id, size = 18 }: { id: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "-.14em", flexShrink: 0 }}>
      {ICONS[id]}
    </svg>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  grid:      <><rect x="3" y="3" width="7.6" height="7.6" rx="1.4"/><rect x="13.4" y="3" width="7.6" height="7.6" rx="1.4"/><rect x="3" y="13.4" width="7.6" height="7.6" rx="1.4"/><rect x="13.4" y="13.4" width="7.6" height="7.6" rx="1.4"/></>,
  cpu:       <><rect x="7" y="7" width="10" height="10" rx="2"/><rect x="10.3" y="10.3" width="3.4" height="3.4"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></>,
  alertTri:  <><path d="M12 3 22 20H2Z"/><path d="M12 9.4v4.6"/><circle cx="12" cy="17" r=".2" fill="currentColor"/></>,
  globe:     <><circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4"/><path d="M12 2.8a15.4 9.2 0 0 1 0 18.4 15.4 9.2 0 0 1 0-18.4Z"/></>,
  mic:       <><rect x="9" y="2.6" width="6" height="11.4" rx="3"/><path d="M5.4 11.2a6.6 6.6 0 0 0 13.2 0"/><path d="M12 17.8v3.2M9 21h6"/></>,
  gear:      <><circle cx="12" cy="12" r="3"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.3 5.3l2.2 2.2M16.5 16.5l2.2 2.2M18.7 5.3l-2.2 2.2M7.5 16.5l-2.2 2.2"/></>,
  bell:      <><path d="M6 10.4a6 6 0 0 1 12 0c0 4.2 1.6 5.6 2 6.2H4c.4-.6 2-2 2-6.2Z"/><path d="M10 19.2a2 2 0 0 0 4 0"/></>,
  search:    <><circle cx="10.6" cy="10.6" r="6.6"/><path d="M15.6 15.6 20.8 20.8"/></>,
  activity:  <path d="M2 12.6h4.4l2-6.4 3.6 13 2.4-9.6 1.6 3h5.8"/>,
  shield:    <><path d="M12 2 4 5v6c0 5.5 3.5 9.5 8 11 4.5-1.5 8-5.5 8-11V5z"/></>,
  radar:     <><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.6" strokeDasharray="2.2 2.6"/><path d="M12 3.8A8.2 8.2 0 0 1 20.2 12" strokeWidth="2"/><path d="M12 12 12 6.4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15.4" cy="8.6" r=".9" fill="currentColor" stroke="none"/></>,
  wifi:      <><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></>,
  check:     <path d="M4 12.6 9 17.6 20 5.6"/>,
  close:     <path d="M6 6 18 18M18 6 6 18"/>,
};

const NAV = [
  { to: "/",             label: "Command Deck",    icon: "grid",     sub: "SECTOR // GLOBAL-INFRA-01" },
  { to: "/incidents",    label: "Incidents",       icon: "alertTri", sub: "RESPONSE QUEUE" },
  { to: "/agents",       label: "Agent Fleet",     icon: "cpu",      sub: "14 AUTONOMOUS AGENTS" },
  { to: "/network",      label: "Network Monitor", icon: "wifi",     sub: "LIVE TRAFFIC & WIFI" },
  { to: "/intelligence", label: "Intelligence",    icon: "radar",    sub: "THREAT INTEL" },
  { to: "/voice",        label: "Voice Console",   icon: "mic",      sub: "SPEECH AI // NLP" },
  { to: "/settings",     label: "Settings",        icon: "gear",     sub: "SYSTEM CONFIG" },
];

const THREAT_MAP: Record<string, [string, string]> = {
  low:      ["var(--success)", "var(--success-soft)"],
  medium:   ["var(--warning)", "var(--warning-soft)"],
  elevated: ["#e8722c",        "rgba(232,114,44,.15)"],
  high:     ["#e8722c",        "rgba(232,114,44,.15)"],
  critical: ["var(--danger)",  "var(--danger-soft)"],
};

function Sidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { state, connected } = useAtlas();
  const openCount = state.incidents.filter(i => i.status === "open").length;
  const threatLevel = state.threat_level ?? "low";
  const [tc] = THREAT_MAP[threatLevel] ?? THREAT_MAP.low;

  return (
    <aside style={{
      width: 264, flexShrink: 0,
      padding: "22px 16px",
      display: "flex", flexDirection: "column", gap: 22,
      position: "sticky", top: 0, height: "100vh",
      zIndex: 10,
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 8px 14px" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 14, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(150deg,#3d63e6 0%,#1f3aa8 100%)",
          boxShadow: "5px 5px 12px rgba(44,75,196,.35), -3px -3px 8px rgba(255,255,255,.6)",
          color: "#fff",
        }}>
          <Icon id="globe" size={24} />
        </div>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 19, fontWeight: 700, letterSpacing: ".03em" }}>ATLAS</div>
          <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginTop: 2 }}>
            Adaptive Security
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        {NAV.map(({ to, label, icon }) => {
          const isActive = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
          return (
            <button key={to} className={`nav-item${isActive ? " active" : ""}`}
              onClick={() => nav(to)}>
              <Icon id={icon} size={18} />
              {label}
              {to === "/incidents" && openCount > 0 && (
                <span className="nav-badge">{openCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer status */}
      <div className="neo-flat" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: "var(--muted)" }}>
          <span className={`dot dot-${connected ? "success" : "danger"}`}
            style={{ boxShadow: connected ? "0 0 0 0 rgba(30,158,113,.6)" : "0 0 0 0 rgba(221,62,70,.6)" }} />
          <span>{connected ? "All systems nominal" : "Backend offline"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: "var(--muted)" }}>
          <Icon id="activity" size={13} />
          <span style={{ fontFamily: "var(--f-mono)" }}>{state.stats.total_events} events processed</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5 }}>
          <span className="dot" style={{ background: tc }} />
          <span style={{ fontFamily: "var(--f-mono)", color: tc, fontWeight: 700, fontSize: 10.5, letterSpacing: ".06em" }}>
            THREAT: {threatLevel.toUpperCase()}
          </span>
        </div>
      </div>
    </aside>
  );
}

function Topbar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { state, connected, machine, searchQuery, setSearchQuery } = useAtlas();
  const threatLevel = state.threat_level ?? "low";
  const [tc, tbg] = THREAT_MAP[threatLevel] ?? THREAT_MAP.low;
  const openCount = state.incidents.filter(i => i.status === "open").length;
  const current = NAV.find(n => n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to)) ?? NAV[0];
  const operatorName = machine?.local_users?.[0] ?? "Operator";
  const hostname     = machine?.hostname ?? "";

  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "18px 30px", position: "sticky", top: 0, zIndex: 20,
      backdropFilter: "blur(10px)",
      background: "rgba(231,236,243,.88)",
      borderBottom: "1px solid var(--line)",
      flexShrink: 0,
    }}>
      <div>
        <div style={{ fontFamily: "var(--f-display)", fontSize: 21, fontWeight: 700, letterSpacing: ".01em" }}>
          {current.label}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--f-mono)", marginTop: 2 }}>
          {current.sub}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Search */}
      <div className="neo-inset" style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "9px 14px", width: 230, color: "var(--muted)", fontSize: 12.5,
      }}>
        <Icon id="search" size={15} />
        <input
          placeholder="Search IP, agent, incident…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            border: "none", background: "transparent", outline: "none",
            color: "var(--ink)", fontFamily: "var(--f-body)", fontSize: 12.5, width: "100%",
          }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")}
            style={{ background: "none", border: "none", cursor: "pointer",
                     color: "var(--muted)", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
        )}
      </div>

      {/* Threat pill */}
      <div className="threat-pill neo-flat" style={{ background: tbg }}>
        <span className="dot" style={{ background: tc }} />
        <span style={{ color: tc, fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 700, letterSpacing: ".06em" }}>
          THREAT: {threatLevel.toUpperCase()}
        </span>
      </div>

      {/* Bell */}
      <button className="btn btn-icon neo-flat" onClick={() => nav("/incidents")} title="Incidents">
        <Icon id="bell" size={18} />
        {openCount > 0 && <span className="badge-count">{openCount}</span>}
      </button>

      {/* Mic */}
      <button className="btn btn-icon neo-flat" onClick={() => nav("/voice")} title="Voice Console">
        <Icon id="mic" size={18} />
      </button>

      {/* Operator chip — real machine user */}
      <div className="neo-flat" style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "6px 12px 6px 6px", borderRadius: 30,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: "linear-gradient(150deg,#3d63e6,#0ea5b7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 12,
        }}>{operatorName.slice(0, 2).toUpperCase()}</div>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{operatorName}</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>{hostname} · SOC</div>
        </div>
      </div>

      {/* Connection indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className={`dot dot-${connected ? "success" : "danger"}`} />
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--f-mono)",
                       color: connected ? "var(--success)" : "var(--danger)" }}>
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>
    </header>
  );
}

function ToastRenderer() {
  const { toasts, dismissToast } = useAtlas();
  const colors: Record<string, string> = {
    success: "var(--success)", error: "var(--danger)",
    warning: "var(--warning)", info: "var(--accent)",
  };
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className="toast neo" style={{ borderLeft: `3px solid ${colors[t.type]}` }}>
          <div style={{ flex: 1 }}>
            <div className="toast-title" style={{ color: colors[t.type] }}>{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
          </div>
          <button onClick={() => dismissToast(t.id)}
            style={{ background: "none", border: "none", color: "var(--muted)",
                     cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      ))}
    </div>
  );
}

function AlertBanners() {
  const { alerts, dismissAlert } = useAtlas();
  if (alerts.length === 0) return null;
  return (
    <div style={{
      position: "fixed", top: 72, right: 24, zIndex: 100,
      display: "flex", flexDirection: "column", gap: 8, maxWidth: 380,
    }}>
      {alerts.map(a => (
        <div key={a.id} className="neo" style={{
          display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px",
          borderLeft: `4px solid ${a.severity === "critical" ? "var(--danger)" : "#e8722c"}`,
          animation: "fadeIn .25s ease",
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{a.severity === "critical" ? "🚨" : "⚠️"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 700,
              color: a.severity === "critical" ? "var(--danger)" : "#e8722c",
              letterSpacing: ".06em", marginBottom: 3,
            }}>{a.severity.toUpperCase()} ALERT</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{a.title}</div>
            {a.incident_id && (
              <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)", marginTop: 3 }}>
                Incident: {a.incident_id}
              </div>
            )}
          </div>
          <button onClick={() => dismissAlert(a.id)}
            style={{ background: "none", border: "none", cursor: "pointer",
                     color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "264px 1fr", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Topbar />
        <main style={{ flex: 1, padding: "26px 30px 60px", overflow: "auto" }}>
          <Routes>
            <Route path="/"             element={<Overview />} />
            <Route path="/incidents"    element={<Incidents />} />
            <Route path="/agents"       element={<Agents />} />
            <Route path="/network"      element={<NetworkMonitor />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/voice"        element={<Voice />} />
            <Route path="/settings"     element={<Settings />} />
          </Routes>
        </main>
      </div>
      <ToastRenderer />
    </div>
  );
}

function Settings() {
  const { state, machine, memoryStats, addToast, refreshState } = useAtlas();
  const [postureInterval, setPostureInterval] = useState(300);
  const [threshold, setThreshold] = useState(3);
  const [clearing, setClearing] = useState(false);
  const [purging, setPurging]   = useState(false);

  const applyPostureInterval = async () => {
    const res = await fetch("http://localhost:8000/settings/posture-interval", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval_seconds: postureInterval }),
    });
    addToast(res.ok
      ? { type: "success", title: "Posture interval updated", message: `${postureInterval}s` }
      : { type: "error", title: "Failed to update interval" });
  };

  const applyThreshold = async () => {
    const res = await fetch("http://localhost:8000/settings/repeat-offender-threshold", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threshold }),
    });
    addToast(res.ok
      ? { type: "success", title: "Threshold updated", message: `Auto-execute after ${threshold} hits` }
      : { type: "error", title: "Failed to update threshold" });
  };

  const clearAll = async () => {
    setClearing(true);
    const res = await fetch("http://localhost:8000/incidents/clear-all", { method: "DELETE" });
    setClearing(false);
    if (res.ok) {
      addToast({ type: "success", title: "All data cleared", message: "Fresh start" });
      refreshState();
    } else {
      addToast({ type: "error", title: "Clear failed" });
    }
  };

  const purgeForeign = async () => {
    setPurging(true);
    const res = await fetch("http://localhost:8000/incidents/purge-foreign", { method: "POST" });
    setPurging(false);
    if (res.ok) {
      const d = await res.json();
      addToast({ type: "success", title: `Purged ${d.removed} foreign incidents`, message: `Kept data for ${d.kept_for}` });
      refreshState();
    } else {
      addToast({ type: "error", title: "Purge failed" });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Configuration</div>
        <h1 style={{ fontFamily: "var(--f-display)", fontSize: 24, margin: "0 0 4px" }}>Settings</h1>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Tune the agent fleet and system behaviour.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

        {/* System status */}
        <div className="neo" style={{ padding: 20 }}>
          <div className="panel-title" style={{ marginBottom: 16 }}>System Status</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["Backend",        state.threat_level ? "Connected" : "Disconnected"],
              ["Threat Level",   (state.threat_level ?? "low").toUpperCase()],
              ["Security Score", String(state.security_score)],
              ["Total Events",   String(state.stats.total_events)],
              ["Active Agents",  String(state.stats.agents_active)],
              ["Memory Records", String(memoryStats?.total_memories ?? 0)],
              ["Machine",        machine?.hostname ?? "—"],
              ["OS",             machine?.os?.slice(0, 35) ?? "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between",
                                     borderBottom: "1px dashed var(--line)", paddingBottom: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{k}</span>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--accent-ink)", fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tuning controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          <div className="neo" style={{ padding: 20 }}>
            <div className="panel-title" style={{ marginBottom: 14 }}>Posture Check Interval</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
              How often ATLAS checks firewall, AV, and password policy (seconds).
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="number" min={60} max={3600} value={postureInterval}
                onChange={e => setPostureInterval(Number(e.target.value))}
                style={{
                  flex: 1, border: "none", borderRadius: 10, padding: "9px 12px",
                  fontFamily: "var(--f-mono)", fontSize: 13, outline: "none",
                  background: "var(--bg-2)",
                  boxShadow: "inset 3px 3px 7px var(--sh-dark-soft), inset -3px -3px 7px var(--sh-light-soft)",
                  color: "var(--ink)",
                }} />
              <button className="btn btn-primary" onClick={applyPostureInterval}>Apply</button>
            </div>
          </div>

          <div className="neo" style={{ padding: 20 }}>
            <div className="panel-title" style={{ marginBottom: 14 }}>Auto-Execute Threshold</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
              Times an IP must appear in memory before ATLAS auto-executes without approval.
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="number" min={2} max={10} value={threshold}
                onChange={e => setThreshold(Number(e.target.value))}
                style={{
                  flex: 1, border: "none", borderRadius: 10, padding: "9px 12px",
                  fontFamily: "var(--f-mono)", fontSize: 13, outline: "none",
                  background: "var(--bg-2)",
                  boxShadow: "inset 3px 3px 7px var(--sh-dark-soft), inset -3px -3px 7px var(--sh-light-soft)",
                  color: "var(--ink)",
                }} />
              <button className="btn btn-primary" onClick={applyThreshold}>Apply</button>
            </div>
          </div>

          <div className="neo" style={{ padding: 20 }}>
            <div className="panel-title" style={{ marginBottom: 10 }}>Danger Zone</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
              Remove incidents from other machines (Abishek-J29, Gopika, etc.) — keeps only <strong>{machine?.hostname ?? "this machine"}</strong>.
            </p>
            <button className="btn btn-primary" onClick={purgeForeign} disabled={purging}
              style={{ marginBottom: 12, width: "100%" }}>
              {purging ? "Purging…" : "🧹 Purge Foreign Machine Data"}
            </button>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
              Wipe ALL incidents, events, agent actions, memory and decision logs.
            </p>
            <button className="btn btn-danger" onClick={clearAll} disabled={clearing}
              style={{ width: "100%" }}>
              {clearing ? "Clearing…" : "⚠ Clear All Data"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
