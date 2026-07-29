import { useState, useEffect } from "react";
import { useAtlas } from "../hooks/useAtlas";
import type { NetworkData, LoginData } from "../hooks/useAtlas";

const API = "http://localhost:8000";

const AGENT_GRADS: Record<string, [string, string]> = {
  firewall:           ["#3d63e6", "#1f3aa8"],
  login_monitor:      ["#7c5cf0", "#4b32b3"],
  network_monitor:    ["#12b3c4", "#0a7d8a"],
  malware_detection:  ["#e5636a", "#b13138"],
  phishing_detection: ["#f0973a", "#c96f1c"],
  threat_intel:       ["#0ea5b7", "#0a7d8a"],
  incident_response:  ["#dd3e46", "#a92830"],
  log_analysis:       ["#6e7890", "#3b4359"],
  forensics:          ["#8a5cf0", "#5c34c9"],
  password_security:  ["#b8862e", "#8f6620"],
  insider_threat:     ["#c94b8c", "#96336a"],
  report_generation:  ["#1e9e71", "#136e4f"],
  voice_assistant:    ["#3d63e6", "#2c4bc4"],
  decision_making:    ["#1f3aa8", "#0f2166"],
};

const AGENT_ABBR: Record<string, string> = {
  firewall: "FW", login_monitor: "LM", threat_intel: "TI", network_monitor: "NM",
  malware_detection: "MD", phishing_detection: "PD", forensics: "FS", log_analysis: "LA",
  incident_response: "IR", insider_threat: "IT", password_security: "PS",
  report_generation: "RG", decision_making: "DM", voice_assistant: "VA",
};

const AGENT_DOMAIN: Record<string, string> = {
  firewall:           "Network Security · Perimeter Defense",
  login_monitor:      "Identity & Access Management",
  network_monitor:    "Traffic Analysis · Topology",
  malware_detection:  "Endpoint Security · Malware",
  phishing_detection: "Email Security · Social Engineering",
  threat_intel:       "Risk & Intel Analysis · MITRE ATT&CK",
  incident_response:  "Security Operations (SOC)",
  log_analysis:       "Log Analytics & SIEM",
  forensics:          "Digital Forensics · Evidence Chain",
  password_security:  "Authentication & Credentials",
  insider_threat:     "User Behaviour Analytics (UEBA)",
  report_generation:  "AI Analytics & Reporting",
  voice_assistant:    "Speech AI & NLP",
  decision_making:    "Agentic AI & Autonomous Decision Systems",
};

const AGENT_DESC: Record<string, string> = {
  firewall:           "Monitors perimeter traffic and enforces block/rate-limit rules against malicious IPs. Applies DDoS mitigation, port-scan blocking, and injection prevention.",
  login_monitor:      "Detects brute-force, credential stuffing, and account takeover attempts. Locks accounts and alerts admins on threshold breaches.",
  network_monitor:    "Analyses network-level events — port scans, DDoS floods, reverse shells, and data exfiltration. Recommends isolation or blocking.",
  malware_detection:  "Identifies malware signatures, quarantines infected files, and isolates compromised endpoints before lateral movement occurs.",
  phishing_detection: "Scans inbound email for phishing indicators, spoofed senders, and credential-harvest links. Quarantines and blocks malicious senders.",
  threat_intel:       "Cross-references IPs and attack patterns against global threat feeds and MITRE ATT&CK. Profiles threat actors and escalates targeted attacks.",
  incident_response:  "Synthesises all agent findings into a coherent incident narrative. Decides autonomous resolution vs. human escalation.",
  log_analysis:       "Correlates log streams across all systems for anomaly detection, SIEM integration, and audit trail maintenance.",
  forensics:          "Reconstructs attack timelines with surgical precision. Maps MITRE ATT&CK techniques, identifies blast radius, and preserves evidence.",
  password_security:  "Audits credential strength, detects leaked credential pairs, and forces rotation on compromised accounts.",
  insider_threat:     "Scores user behaviour for anomalies — bulk downloads, after-hours access, USB activity, and email exfiltration.",
  report_generation:  "Compiles synthesised analytics across all agent activity into structured incident reports.",
  voice_assistant:    "Processes natural language voice and text commands, routing operator intent to the correct agent pipeline.",
  decision_making:    "The orchestration core. Weighs all agent findings and autonomously selects the optimal response strategy.",
};

const ACTION_COLOR: Record<string, string> = {
  block_ip:         "var(--danger)",
  lock_account:     "var(--danger)",
  isolate_machine:  "var(--danger)",
  quarantine_file:  "var(--danger)",
  quarantine_email: "var(--danger)",
  block_sender:     "var(--danger)",
  disable_session:  "var(--danger)",
  escalate:         "#e8722c",
  alert_admin:      "#e8722c",
  rate_limit:       "var(--warning)",
  flag_pattern:     "var(--warning)",
  monitor:          "var(--info)",
  resolve:          "var(--success)",
  allow:            "var(--success)",
  timeline_created: "var(--accent)",
  investigation_ongoing: "var(--accent)",
};

const SEV_COLOR: Record<string, string> = {
  low: "var(--success)", medium: "var(--warning)", high: "#e8722c", critical: "var(--danger)",
};

function pad(n: number) { return n < 10 ? "0" + n : n; }
function timeStr(ts?: string) {
  if (!ts) return "--:--:--";
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function dateStr(ts?: string) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

interface AgentAction {
  agent_name: string;
  action: string;
  ts?: string;
  incident_id?: string;
  params?: Record<string, unknown>;
}

interface AgentIncident {
  id: string; title: string; severity: string; status: string; created_at: string;
}

interface AgentDetailData {
  actions: AgentAction[];
  incidents: AgentIncident[];
}

// Per-incident findings panel — shows what this agent found for a specific incident
function IncidentFindingsRow({ inc, actions }: { inc: AgentIncident; actions: AgentAction[] }) {
  const [open, setOpen] = useState(false);
  const incActions = actions.filter(a => a.incident_id === inc.id);

  return (
    <div className="neo-flat" style={{ overflow: "hidden" }}>
      <div
        style={{
          display: "grid", gridTemplateColumns: "12px 1.6fr 90px 90px 120px 100px 32px",
          padding: "14px 18px", alignItems: "center", gap: 14, cursor: "pointer",
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{
          width: 7, height: 7, borderRadius: "50%", display: "inline-block",
          background: SEV_COLOR[inc.severity] ?? "var(--muted)",
        }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{inc.title}</div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>{inc.id}</div>
        </div>
        <span className={`badge badge-${inc.severity}`}>{inc.severity}</span>
        <span className={`badge badge-${inc.status === "open" ? "active" : inc.status === "resolved" ? "resolved" : "approved"}`}>
          {inc.status}
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
          {timeStr(inc.created_at)}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--faint)", fontFamily: "var(--f-mono)" }}>
          {incActions.length} action{incActions.length !== 1 ? "s" : ""}
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)", transform: open ? "rotate(90deg)" : "none", transition: ".15s" }}>▶</span>
      </div>

      {open && incActions.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "12px 18px 14px 36px", display: "flex", flexDirection: "column", gap: 8 }}>
          {incActions.map((a, i) => {
            const p = a.params as Record<string, string> | undefined;
            const target = p?.display_target || p?.target_ip || p?.target_user || p?.ip || "";
            const reasoning = p?.reasoning?.slice(0, 120) || "";
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    fontFamily: "var(--f-mono)", fontSize: 11.5, fontWeight: 700,
                    color: ACTION_COLOR[a.action] ?? "var(--ink-2)",
                  }}>{a.action.replace(/_/g, " ").toUpperCase()}</span>
                  {target && <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>→ {target}</span>}
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)" }}>{timeStr(a.ts)}</span>
                </div>
                {reasoning && (
                  <div style={{ fontSize: 10.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{reasoning}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Live Network Tab (network_monitor agent only) ────────────────────────────

const SEV_CLR: Record<string, string> = {
  clean: "var(--success)", low: "var(--success)",
  medium: "var(--warning)", high: "#e8722c", critical: "var(--danger)",
};
const SEV_BG: Record<string, string> = {
  clean: "var(--success-soft)", low: "var(--success-soft)",
  medium: "var(--warning-soft)", high: "rgba(232,114,44,.13)", critical: "var(--danger-soft)",
};

function SignalBars({ pct }: { pct: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
      {[25, 50, 75, 100].map((t, i) => (
        <div key={i} style={{
          width: 5, height: 6 + i * 4, borderRadius: 2,
          background: pct >= t ? "var(--success)" : "var(--line)",
        }} />
      ))}
    </div>
  );
}

function LiveNetworkTab() {
  const { networkData, networkLoading, refreshNetwork } = useAtlas();
  const nd: NetworkData | null = networkData;

  const status = nd?.network_status ?? "clean";
  const ts     = nd?.timestamp ? new Date(nd.timestamp).toLocaleTimeString() : "—";
  const bw     = nd?.bandwidth;
  const wifi   = nd?.wifi;

  // Connections: only those with a real remote host (not loopback)
  const extConns = (nd?.connections ?? []).filter(
    c => c.destination_ip !== "—" && !c.destination_ip.startsWith("127.") && !c.destination_ip.startsWith("::1")
  ).sort((a, b) => b.packet_count - a.packet_count).slice(0, 40);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="neo-flat" style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 16px", borderRadius: 30,
          background: SEV_BG[status] ?? "var(--bg-2)",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV_CLR[status], display: "inline-block" }} />
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 700, color: SEV_CLR[status] }}>
            {status.toUpperCase()}
          </span>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>Updated {ts}</span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }}
          onClick={refreshNetwork} disabled={networkLoading}>
          {networkLoading ? "Refreshing…" : "⟳ Refresh"}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {[
          { label: "Connections",  value: nd?.summary.total_connections ?? 0, color: "var(--info)",    bg: "var(--info-soft)" },
          { label: "LAN Devices",  value: nd?.summary.total_devices     ?? 0, color: "var(--accent)",  bg: "rgba(52,87,216,.1)" },
          { label: "Threats",      value: nd?.summary.total_threats     ?? 0,
            color: (nd?.summary.total_threats ?? 0) > 0 ? "var(--danger)" : "var(--success)",
            bg:    (nd?.summary.total_threats ?? 0) > 0 ? "var(--danger-soft)" : "var(--success-soft)" },
          { label: "Upload KB/s",  value: bw?.kb_sent_per_sec ?? 0,           color: "#e8722c",         bg: "rgba(232,114,44,.13)" },
        ].map(s => (
          <div key={s.label} className="neo" style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--faint)",
                          textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 26, fontWeight: 700, color: s.color }}>
              {typeof s.value === "number" ? s.value.toFixed(s.label.includes("KB") ? 1 : 0) : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* WiFi + Bandwidth side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

        {/* WiFi card */}
        <div className="neo" style={{ padding: 18 }}>
          <div className="panel-title" style={{ marginBottom: 14 }}>WiFi Interface</div>
          {!wifi?.available ? (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>No wireless interface found.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: "var(--info-soft)", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 16,
                }}>📶</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {(wifi as any).netsh_blocked ? wifi.interface_name : (wifi.ssid || wifi.interface_name)}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                    {wifi.state} · {(wifi as any).ip || "—"}
                  </div>
                </div>
                {!((wifi as any).netsh_blocked) && (wifi.signal_pct ?? 0) > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <SignalBars pct={wifi.signal_pct ?? 0} />
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700,
                      color: (wifi.signal_pct ?? 0) >= 70 ? "var(--success)" : "var(--warning)" }}>
                      {wifi.signal_pct}%
                    </span>
                  </div>
                )}
              </div>
              {(wifi as any).netsh_blocked && (
                <div style={{
                  padding: "8px 12px", borderRadius: 8, marginBottom: 10,
                  background: "var(--warning-soft)", borderLeft: "3px solid var(--warning)",
                  fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5,
                }}>
                  <b style={{ color: "var(--warning)" }}>⚠ Limited — </b>
                  Enable Location Services + run as Admin to see SSID & signal.
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["Interface",  wifi.interface_name || "—"],
                  ["Link Speed", (wifi as any).link_speed_mbps ? `${(wifi as any).link_speed_mbps} Mbps` : "—"],
                  ["Band",       wifi.band    || "—"],
                  ["Channel",    wifi.channel || "—"],
                  ["Auth",       wifi.authentication || "—"],
                  ["Cipher",     wifi.cipher  || "—"],
                ].map(([l, v]) => (
                  <div key={l} className="neo-inset" style={{ padding: "7px 10px" }}>
                    <div style={{ fontSize: 9.5, color: "var(--muted)", textTransform: "uppercase",
                                  letterSpacing: ".08em", marginBottom: 3, fontFamily: "var(--f-mono)" }}>{l}</div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Bandwidth card */}
        <div className="neo" style={{ padding: 18 }}>
          <div className="panel-title" style={{ marginBottom: 14 }}>Live Bandwidth</div>
          {!bw ? (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>
          ) : (
            <>
              {[
                { label: "↑ Upload",   kb: bw.kb_sent_per_sec, color: "#e8722c" },
                { label: "↓ Download", kb: bw.kb_recv_per_sec, color: "var(--info)" },
              ].map(({ label, kb, color }) => {
                const maxKb = Math.max(bw.kb_sent_per_sec, bw.kb_recv_per_sec, 1);
                return (
                  <div key={label} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600 }}>{label}</span>
                      <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700, color }}>
                        {kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB/s` : `${kb.toFixed(0)} KB/s`}
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 6, background: "var(--line)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 6, background: color,
                        width: `${Math.min(100, (kb / maxKb) * 100)}%`,
                        transition: "width .5s ease",
                      }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                {[
                  ["Total Sent",  `${bw.mb_sent_total} MB`],
                  ["Total Recv",  `${bw.mb_recv_total} MB`],
                  ["Pkts Sent",   String(bw.packets_sent_total ?? 0)],
                  ["Pkts Recv",   String(bw.packets_recv_total ?? 0)],
                ].map(([l, v]) => (
                  <div key={l} className="neo-inset" style={{ padding: "7px 10px" }}>
                    <div style={{ fontSize: 9.5, color: "var(--muted)", textTransform: "uppercase",
                                  letterSpacing: ".08em", marginBottom: 3, fontFamily: "var(--f-mono)" }}>{l}</div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Threats */}
      <div className="neo" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="panel-title">Detected Threats</div>
          {(nd?.threats.length ?? 0) > 0 && (
            <span className="badge badge-critical">{nd!.threats.length} active</span>
          )}
        </div>
        {(nd?.threats.length ?? 0) === 0 ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 14px", borderRadius: 10, background: "var(--success-soft)",
          }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <span style={{ fontSize: 12.5, color: "var(--success)", fontWeight: 600 }}>No threats detected</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {nd!.threats.map((t, i) => (
              <div key={i} style={{
                padding: "10px 14px", borderRadius: 10,
                background: SEV_BG[t.severity] ?? "var(--bg-2)",
                borderLeft: `3px solid ${SEV_CLR[t.severity] ?? "var(--muted)"}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontFamily: "var(--f-mono)", fontWeight: 700,
                    color: SEV_CLR[t.severity], textTransform: "uppercase" }}>{t.severity}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700 }}>{t.type.replace(/_/g, " ").toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginBottom: 3 }}>{t.description}</div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                  ⚡ {t.indicator} · 🔧 {t.recommended_action.replace(/_/g, " ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connected Devices */}
      <div className="neo" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="panel-title">Connected Devices</div>
          <span style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--muted)" }}>
            {nd?.devices.length ?? 0} on LAN
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {(nd?.devices ?? []).map((d, i) => (
            <div key={i} className="neo-flat" style={{ padding: "9px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 15 }}>{d.is_self ? "💻" : d.is_gateway ? "🌐" : "📱"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  {d.hostname !== d.ip ? d.hostname : d.ip}
                  {d.is_self && <span style={{ fontSize: 9, fontFamily: "var(--f-mono)", fontWeight: 700,
                    background: "var(--info-soft)", color: "var(--info)", padding: "1px 5px", borderRadius: 8 }}>THIS MACHINE</span>}
                  {d.is_gateway && <span style={{ fontSize: 9, fontFamily: "var(--f-mono)", fontWeight: 700,
                    background: "var(--warning-soft)", color: "var(--warning)", padding: "1px 5px", borderRadius: 8 }}>GATEWAY</span>}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                  {d.ip} · {d.mac}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* External Connections Table */}
      <div className="neo" style={{ overflow: "hidden" }}>
        <div className="panel-header">
          <div className="panel-title">External Connections</div>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
            {extConns.length} active
          </span>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
              <tr>
                {["Source IP", "Destination IP", "Proto", "Port", "Status", "Process", "Pkts"].map(h => (
                  <th key={h} style={{
                    padding: "8px 12px", textAlign: "left", fontSize: 10,
                    fontFamily: "var(--f-mono)", color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    borderBottom: "1px solid var(--line)", fontWeight: 700,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {extConns.length === 0 && (
                <tr><td colSpan={7} style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 12 }}>
                  No external connections active.
                </td></tr>
              )}
              {extConns.map((c, i) => {
                const isSusp = [4444,1337,9001,31337,6666,5555].includes(c.destination_port);
                return (
                  <tr key={i} style={{ background: isSusp ? "var(--danger-soft)" : "transparent" }}>
                    {[c.source_ip, c.destination_ip].map((ip, j) => (
                      <td key={j} style={{ padding: "7px 12px", fontFamily: "var(--f-mono)", fontSize: 11.5,
                        color: "var(--ink-2)", borderBottom: "1px solid var(--line)" }}>{ip}</td>
                    ))}
                    <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--line)" }}>
                      <span style={{
                        fontSize: 10, fontFamily: "var(--f-mono)", fontWeight: 700,
                        padding: "2px 6px", borderRadius: 6,
                        background: c.protocol === "TCP" ? "var(--info-soft)" : "var(--warning-soft)",
                        color: c.protocol === "TCP" ? "var(--info)" : "var(--warning)",
                      }}>{c.protocol}</span>
                    </td>
                    <td style={{ padding: "7px 12px", fontFamily: "var(--f-mono)", fontSize: 11.5,
                      color: isSusp ? "var(--danger)" : "var(--ink-2)", fontWeight: isSusp ? 700 : 400,
                      borderBottom: "1px solid var(--line)" }}>{c.destination_port}</td>
                    <td style={{ padding: "7px 12px", fontSize: 10.5, fontFamily: "var(--f-mono)",
                      color: c.status === "ESTABLISHED" ? "var(--success)" : "var(--muted)",
                      borderBottom: "1px solid var(--line)" }}>{c.status}</td>
                    <td style={{ padding: "7px 12px", fontSize: 11.5, color: "var(--ink-2)",
                      borderBottom: "1px solid var(--line)" }}>{c.process}</td>
                    <td style={{ padding: "7px 12px", fontFamily: "var(--f-mono)", fontSize: 11.5,
                      color: "var(--muted)", borderBottom: "1px solid var(--line)" }}>{c.packet_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Live Login Tab (login_monitor agent only) ───────────────────────────────

function LiveLoginTab() {
  const { loginData, loginLoading, refreshLogin } = useAtlas();
  const ld: LoginData | null = loginData;

  const risk      = ld?.overall_risk ?? "low";
  const ts        = ld?.timestamp ? new Date(ld.timestamp).toLocaleTimeString() : "—";
  const rs        = ld?.risk_summary;
  const failedMap = ld?.failed_summary ?? {};
  const policy    = ld?.password_policy ?? {};

  const RISK_CLR: Record<string, string> = {
    low: "var(--success)", medium: "var(--warning)",
    high: "#e8722c", critical: "var(--danger)",
  };
  const RISK_BG: Record<string, string> = {
    low: "var(--success-soft)", medium: "var(--warning-soft)",
    high: "rgba(232,114,44,.13)", critical: "var(--danger-soft)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="neo-flat" style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 16px", borderRadius: 30,
          background: RISK_BG[risk] ?? "var(--bg-2)",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%",
            background: RISK_CLR[risk], display: "inline-block" }} />
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 11,
            fontWeight: 700, color: RISK_CLR[risk] }}>
            {risk.toUpperCase()}
          </span>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
          Updated {ts}
        </span>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }}
          onClick={refreshLogin} disabled={loginLoading}>
          {loginLoading ? "Refreshing…" : "⟳ Refresh"}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {[
          { label: "Active Sessions",  value: ld?.active_sessions.length ?? 0,       color: "var(--info)",    bg: "var(--info-soft)" },
          { label: "Failed Logins",    value: rs?.failed_logins_total ?? 0,           color: rs?.failed_logins_total ? "var(--danger)" : "var(--success)",
                                                                                       bg:    rs?.failed_logins_total ? "var(--danger-soft)" : "var(--success-soft)" },
          { label: "Unknown Users",    value: rs?.critical ?? 0,                      color: rs?.critical ? "var(--danger)" : "var(--success)",
                                                                                       bg:    rs?.critical ? "var(--danger-soft)" : "var(--success-soft)" },
          { label: "Local Accounts",   value: ld?.local_accounts.length ?? 0,         color: "var(--accent)",  bg: "rgba(52,87,216,.1)" },
        ].map(s => (
          <div key={s.label} className="neo" style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--faint)",
              textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 26, fontWeight: 700, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Active Sessions + Password Policy */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start" }}>

        {/* Active Sessions */}
        <div className="neo" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div className="panel-title">Active Sessions</div>
            <span style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--muted)" }}>
              {ld?.active_sessions.length ?? 0} logged in
            </span>
          </div>
          {(ld?.active_sessions.length ?? 0) === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>No active sessions detected.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ld!.active_sessions.map((s, i) => (
                <div key={i} className="neo-flat" style={{
                  padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
                  borderLeft: `3px solid ${RISK_CLR[s.risk] ?? "var(--muted)"}`,
                }}>
                  <span style={{ fontSize: 20 }}>
                    {s.risk === "critical" ? "🚨" : s.risk === "medium" ? "⚠️" : "👤"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                      {s.user}
                      {!s.known_user && (
                        <span style={{ fontSize: 9, fontFamily: "var(--f-mono)", fontWeight: 700,
                          background: "var(--danger-soft)", color: "var(--danger)",
                          padding: "1px 6px", borderRadius: 8 }}>UNKNOWN</span>
                      )}
                      {s.after_hours && (
                        <span style={{ fontSize: 9, fontFamily: "var(--f-mono)", fontWeight: 700,
                          background: "var(--warning-soft)", color: "var(--warning)",
                          padding: "1px 6px", borderRadius: 8 }}>AFTER HOURS</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                      {s.terminal} · {s.host} · since {s.started}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: "var(--f-mono)", fontWeight: 700,
                    color: RISK_CLR[s.risk], textTransform: "uppercase" }}>{s.risk}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Password Policy */}
        <div className="neo" style={{ padding: 18 }}>
          <div className="panel-title" style={{ marginBottom: 14 }}>Password Policy</div>
          {Object.keys(policy).length === 0 ? (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Policy data unavailable.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {Object.entries(policy).filter(([k]) => !k.endsWith("_ok")).map(([key, val]) => {
                const isWeak = key === "min_length" && (policy["min_length_ok"] === false);
                return (
                  <div key={key} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "7px 10px", borderRadius: 8,
                    background: isWeak ? "var(--danger-soft)" : "var(--bg-2)",
                  }}>
                    <span style={{ fontSize: 11.5, color: "var(--muted)",
                      textTransform: "capitalize" }}>
                      {key.replace(/_/g, " ")}
                    </span>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700,
                      color: isWeak ? "var(--danger)" : "var(--ink)" }}>
                      {String(val)}{isWeak ? " ⚠" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Failed login summary */}
          {Object.keys(failedMap).length > 0 && (
            <>
              <div style={{ marginTop: 16, marginBottom: 10, fontSize: 10, fontFamily: "var(--f-mono)",
                color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em" }}>
                Failed Login Counts
              </div>
              {Object.entries(failedMap).sort((a, b) => b[1] - a[1]).map(([user, count]) => (
                <div key={user} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px", borderRadius: 8, marginBottom: 4,
                  background: count >= 5 ? "var(--danger-soft)" : "var(--bg-2)",
                }}>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 11.5 }}>{user}</span>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700,
                    color: count >= 5 ? "var(--danger)" : count >= 3 ? "var(--warning)" : "var(--muted)" }}>
                    {count} fails
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Recent Login Events */}
      <div className="neo" style={{ overflow: "hidden" }}>
        <div className="panel-header">
          <div className="panel-title">Recent Login Events</div>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
            {ld?.recent_logins.length ?? 0} events
          </span>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
              <tr>
                {["Type", "User", "Source IP", "Logon Type", "Time", "Risk"].map(h => (
                  <th key={h} style={{
                    padding: "8px 12px", textAlign: "left", fontSize: 10,
                    fontFamily: "var(--f-mono)", color: "var(--muted)",
                    textTransform: "uppercase", letterSpacing: "0.08em",
                    borderBottom: "1px solid var(--line)", fontWeight: 700,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(ld?.recent_logins.length ?? 0) === 0 && (
                <tr><td colSpan={6} style={{ padding: "16px 12px", color: "var(--muted)", fontSize: 12 }}>
                  No recent login events. (wevtutil requires Security log read access)
                </td></tr>
              )}
              {(ld?.recent_logins ?? []).map((ev, i) => (
                <tr key={i} style={{
                  background: ev.risk === "critical" ? "var(--danger-soft)"
                    : ev.type === "failed" ? "rgba(222,139,44,.08)" : "transparent",
                }}>
                  <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{
                      fontSize: 10, fontFamily: "var(--f-mono)", fontWeight: 700,
                      padding: "2px 7px", borderRadius: 6,
                      background: ev.type === "success" ? "var(--success-soft)" : "var(--danger-soft)",
                      color: ev.type === "success" ? "var(--success)" : "var(--danger)",
                    }}>{ev.type === "success" ? "✓ SUCCESS" : "✗ FAILED"}</span>
                  </td>
                  <td style={{ padding: "7px 12px", fontFamily: "var(--f-mono)", fontSize: 11.5,
                    fontWeight: !ev.known_user ? 700 : 400,
                    color: !ev.known_user ? "var(--danger)" : "var(--ink-2)",
                    borderBottom: "1px solid var(--line)" }}>
                    {ev.user || "—"}
                    {!ev.known_user && <span style={{ fontSize: 9, marginLeft: 4,
                      color: "var(--danger)" }}>⚠</span>}
                  </td>
                  <td style={{ padding: "7px 12px", fontFamily: "var(--f-mono)", fontSize: 11.5,
                    color: "var(--muted)", borderBottom: "1px solid var(--line)" }}>
                    {ev.source_ip || "—"}
                  </td>
                  <td style={{ padding: "7px 12px", fontSize: 11.5, color: "var(--muted)",
                    borderBottom: "1px solid var(--line)" }}>
                    {ev.logon_type || "—"}
                  </td>
                  <td style={{ padding: "7px 12px", fontFamily: "var(--f-mono)", fontSize: 11,
                    color: "var(--faint)", borderBottom: "1px solid var(--line)" }}>
                    {ev.time ? new Date(ev.time).toLocaleTimeString() : "—"}
                  </td>
                  <td style={{ padding: "7px 12px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ fontSize: 10, fontFamily: "var(--f-mono)", fontWeight: 700,
                      color: RISK_CLR[ev.risk] ?? "var(--muted)",
                      textTransform: "uppercase" }}>{ev.risk}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Local Accounts */}
      <div className="neo" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="panel-title">Local Accounts on This Machine</div>
          <span style={{ fontSize: 11, fontFamily: "var(--f-mono)", color: "var(--muted)" }}>
            {ld?.local_accounts.length ?? 0} accounts
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(ld?.local_accounts ?? []).map((acc, i) => {
            const isKnown = (ld?.machine.known_users ?? []).map(u => u.toLowerCase())
              .includes(acc.username.toLowerCase());
            return (
              <div key={i} className="neo-flat" style={{
                padding: "7px 14px", display: "flex", alignItems: "center", gap: 7,
                borderLeft: `3px solid ${isKnown ? "var(--success)" : "var(--warning)"}`,
              }}>
                <span style={{ fontSize: 14 }}>{isKnown ? "👤" : "❓"}</span>
                <div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700 }}>
                    {acc.username}
                  </div>
                  <div style={{ fontSize: 9.5, color: isKnown ? "var(--success)" : "var(--warning)",
                    fontFamily: "var(--f-mono)" }}>
                    {isKnown ? "known" : "not in profile"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface Props {
  agentId: string;
  onBack: () => void;
}

export default function AgentDetail({ agentId, onBack }: Props) {
  const { approveIncident, resolveIncident } = useAtlas();
  const isNetworkAgent = agentId === "network_monitor";
  const isLoginAgent   = agentId === "login_monitor";
  const [tab, setTab] = useState<"actions" | "incidents" | "log" | "live">(isNetworkAgent || isLoginAgent ? "live" : "actions");
  const [data, setData] = useState<AgentDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/agents/${agentId}/detail`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))
      .finally(() => setLoading(false));
  }, [agentId]);

  const myActions   = data?.actions   ?? [];
  const myIncidents = data?.incidents ?? [];

  const grad   = AGENT_GRADS[agentId]  ?? ["#3d63e6", "#1f3aa8"];
  const abbr   = AGENT_ABBR[agentId]   ?? agentId.slice(0, 2).toUpperCase();
  const label  = agentId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const domain = AGENT_DOMAIN[agentId] ?? agentId;
  const desc   = AGENT_DESC[agentId]   ?? "";

  const totalOps   = myActions.length;
  const blockOps   = myActions.filter(a => ["block_ip","lock_account","isolate_machine","quarantine_file","quarantine_email","block_sender","disable_session"].includes(a.action)).length;
  const escalOps   = myActions.filter(a => ["escalate","alert_admin"].includes(a.action)).length;
  const resolveOps = myActions.filter(a => ["resolve","allow"].includes(a.action)).length;

  const lastAction = myActions[0];
  const isActive   = !!lastAction?.ts && (Date.now() - new Date(lastAction.ts).getTime()) < 8000;

  const actionCounts: Record<string, number> = {};
  myActions.forEach(a => { actionCounts[a.action] = (actionCounts[a.action] ?? 0) + 1; });
  const maxCount = Math.max(1, ...Object.values(actionCounts));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Back + header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <button className="btn neo-flat" onClick={onBack}
          style={{ padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Agent Fleet
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: `linear-gradient(150deg,${grad[0]},${grad[1]})`,
            color: "#fff", fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 16,
            boxShadow: `6px 6px 14px ${grad[1]}55, -4px -4px 10px rgba(255,255,255,.6)`,
          }}>{abbr}</div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>{domain}</div>
            <h1 style={{ fontFamily: "var(--f-display)", fontSize: 24, margin: "0 0 4px" }}>{label}</h1>
            <p style={{ color: "var(--muted)", fontSize: 12.5, margin: 0, maxWidth: 560 }}>{desc}</p>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span className={`badge badge-${isActive ? "active" : "monitoring"}`} style={{ fontSize: 11 }}>
              {isActive ? "● ACTIVE" : "● MONITORING"}
            </span>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>Loading agent data…</div>
      )}

      {/* Stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {[
          { label: "Total Operations", value: totalOps,   color: "var(--accent)",  bg: "var(--info-soft)" },
          { label: "Block / Contain",  value: blockOps,   color: "var(--danger)",  bg: "var(--danger-soft)" },
          { label: "Escalations",      value: escalOps,   color: "#e8722c",         bg: "rgba(232,114,44,.13)" },
          { label: "Resolved / Allow", value: resolveOps, color: "var(--success)", bg: "var(--success-soft)" },
        ].map(s => (
          <div key={s.label} className="neo" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--faint)",
                          textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 32, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ marginTop: 8, height: 4, borderRadius: 4, background: s.bg }}>
              <div style={{ height: "100%", width: totalOps ? `${Math.round((s.value / totalOps) * 100)}%` : "0%",
                            background: s.color, borderRadius: 4, transition: "width .4s ease" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10 }}>
        {(isNetworkAgent || isLoginAgent) && (
          <button className={`chip${tab === "live" ? " active" : ""}`} onClick={() => setTab("live")}>
            {isLoginAgent ? "🔐 Live Logins" : "📡 Live Network"}
          </button>
        )}
        {(["actions", "incidents", "log"] as const).map(t => (
          <button key={t} className={`chip${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "actions" ? `Actions (${myActions.length})` : t === "incidents" ? `Incidents (${myIncidents.length})` : "Activity Log"}
          </button>
        ))}
      </div>

      {/* Tab: Actions */}
      {tab === "actions" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 18, alignItems: "start" }}>

          <div className="neo" style={{ overflow: "hidden" }}>
            <div className="panel-header">
              <div className="panel-title">Action History</div>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                {myActions.length} ops
              </span>
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 100px 90px",
              padding: "6px 18px", borderBottom: "1px solid var(--line)",
              fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)",
              textTransform: "uppercase", letterSpacing: ".08em",
            }}>
              <span>Action / Target</span><span>Time</span><span>Severity</span>
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {myActions.length === 0 && !loading && (
                <div style={{ padding: "32px 18px", color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
                  No actions recorded yet. Agent is monitoring…
                </div>
              )}
              {myActions.map((a, i) => {
                const params = a.params as Record<string, string> | undefined;
                const displayTarget = params?.display_target || params?.ip || params?.target_ip || params?.target_user || "";
                return (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "1fr 100px 90px",
                    padding: "10px 18px", borderBottom: "1px solid var(--line)",
                    alignItems: "center", gap: 10,
                    background: i === 0 ? "rgba(52,87,216,.04)" : "transparent",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(163,177,204,.1)")}
                    onMouseLeave={e => (e.currentTarget.style.background = i === 0 ? "rgba(52,87,216,.04)" : "transparent")}
                  >
                    <div>
                      <div style={{
                        fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700,
                        color: ACTION_COLOR[a.action] ?? "var(--ink-2)",
                      }}>
                        {a.action.replace(/_/g, " ").toUpperCase()}
                      </div>
                      {displayTarget && (
                        <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)", marginTop: 2 }}>
                          {displayTarget}
                        </div>
                      )}
                      {a.incident_id && (
                        <div style={{ fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)", marginTop: 1 }}>
                          {a.incident_id}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                      {timeStr(a.ts)}
                    </span>
                    <span className={`badge badge-${(a.params as any)?.severity ?? "info"}`} style={{ fontSize: 9.5 }}>
                      {(a.params as any)?.severity ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="neo" style={{ padding: 20 }}>
              <div className="panel-title" style={{ marginBottom: 16 }}>Action Breakdown</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(actionCounts).length === 0 && (
                  <div style={{ color: "var(--muted)", fontSize: 12 }}>No data yet.</div>
                )}
                {Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).map(([action, count]) => (
                  <div key={action}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11.5 }}>
                      <span style={{ color: ACTION_COLOR[action] ?? "var(--ink-2)", fontWeight: 700, fontFamily: "var(--f-mono)" }}>
                        {action.replace(/_/g, " ")}
                      </span>
                      <span style={{ color: "var(--faint)", fontFamily: "var(--f-mono)", fontSize: 11 }}>{count}×</span>
                    </div>
                    <div className="neo-inset" style={{ height: 7, borderRadius: 6, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${Math.round((count / maxCount) * 100)}%`,
                        background: ACTION_COLOR[action] ?? "var(--accent)",
                        borderRadius: 6, transition: "width .4s ease",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {lastAction && (
              <div className="neo" style={{ padding: 20 }}>
                <div className="panel-title" style={{ marginBottom: 12 }}>Last Action</div>
                <div style={{
                  fontFamily: "var(--f-mono)", fontSize: 13, fontWeight: 700,
                  color: ACTION_COLOR[lastAction.action] ?? "var(--ink)",
                  marginBottom: 8,
                }}>
                  {lastAction.action.replace(/_/g, " ").toUpperCase()}
                </div>
                {lastAction.incident_id && (
                  <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--f-mono)", marginBottom: 6 }}>
                    Incident: {lastAction.incident_id}
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: "var(--faint)", fontFamily: "var(--f-mono)" }}>
                  {dateStr(lastAction.ts)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Incidents — with per-incident findings drill-down */}
      {tab === "incidents" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {myIncidents.length === 0 && !loading && (
            <div className="neo" style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>
              No incidents linked to this agent yet.
            </div>
          )}

          {myIncidents.length > 0 && (
            <div style={{
              display: "grid", gridTemplateColumns: "12px 1.6fr 90px 90px 120px 100px 32px",
              padding: "0 18px", gap: 14,
              fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em",
              color: "var(--faint)", fontWeight: 700, fontFamily: "var(--f-mono)",
            }}>
              <span/><span>Incident</span><span>Severity</span><span>Status</span><span>Time</span><span>Actions</span><span/>
            </div>
          )}

          {myIncidents.map(inc => (
            <IncidentFindingsRow key={inc.id} inc={inc} actions={myActions} />
          ))}

          {/* Quick approve/resolve still available */}
          {myIncidents.some(i => i.status === "open" || i.status !== "resolved") && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {myIncidents.filter(i => i.status === "open").map(inc => (
                <button key={inc.id} className="btn btn-success btn-sm" onClick={() => approveIncident(inc.id)}>
                  ✓ Approve {inc.id.slice(0, 8)}…
                </button>
              ))}
              {myIncidents.filter(i => i.status !== "resolved").map(inc => (
                <button key={inc.id} className="btn btn-danger btn-sm" onClick={() => resolveIncident(inc.id)}>
                  ✕ Resolve {inc.id.slice(0, 8)}…
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Live Network — only for network_monitor agent */}
      {tab === "live" && isNetworkAgent && <LiveNetworkTab />}

      {/* Tab: Live Logins — only for login_monitor agent */}
      {tab === "live" && isLoginAgent && <LiveLoginTab />}

      {/* Tab: Activity Log */}
      {tab === "log" && (
        <div className="neo" style={{ overflow: "hidden" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "13px 16px", borderBottom: "1px solid var(--line)",
          }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#e5484d", display: "inline-block" }} />
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#de8b2c", display: "inline-block" }} />
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1e9e71", display: "inline-block" }} />
            <span style={{ marginLeft: 10, fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
              {agentId}.agent.log
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--faint)", fontFamily: "var(--f-mono)" }}>
              {myActions.length} entries
            </span>
          </div>
          <div style={{
            fontFamily: "var(--f-mono)", fontSize: 11.5, lineHeight: 1.9,
            padding: "12px 16px", height: 460, overflowY: "auto",
          }}>
            {myActions.length === 0 && !loading && (
              <div style={{ color: "var(--faint)" }}>No log entries yet. Agent is standing by…</div>
            )}
            {myActions.map((a, i) => {
              const tag = ["block_ip","lock_account","isolate_machine","quarantine_file","quarantine_email","block_sender","disable_session"].includes(a.action)
                ? "t-crit"
                : ["escalate","alert_admin"].includes(a.action) ? "t-warn"
                : ["resolve","allow","monitor"].includes(a.action) ? "t-ok"
                : "t-info";
              const params = a.params as Record<string, string> | undefined;
              const detail = params?.display_target || params?.reasoning?.slice(0, 80) || "";
              return (
                <div key={i} className="log-line">
                  <span className="log-time">{timeStr(a.ts)}</span>
                  <span className={`log-tag ${tag}`}>●</span>
                  <span className="log-msg">
                    [{a.action.toUpperCase()}]
                    {detail ? ` ${detail}` : ""}
                    {a.incident_id ? ` — ${a.incident_id}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
