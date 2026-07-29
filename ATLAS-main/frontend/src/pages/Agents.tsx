import { useState } from "react";
import { useAtlas } from "../hooks/useAtlas";
import AgentDetail from "./AgentDetail";

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
  firewall:           "Network Security",
  login_monitor:      "Identity & Access",
  network_monitor:    "Traffic Analysis",
  malware_detection:  "Endpoint Security",
  phishing_detection: "Email Security",
  threat_intel:       "Risk & Intel",
  incident_response:  "SOC Operations",
  log_analysis:       "Log Analytics",
  forensics:          "Digital Forensics",
  password_security:  "Credentials",
  insider_threat:     "UEBA",
  report_generation:  "AI Reporting",
  voice_assistant:    "Speech AI",
  decision_making:    "Agentic AI",
};

// What each agent monitors on the real machine
const AGENT_MONITORS: Record<string, string> = {
  firewall:           "Perimeter traffic · block/rate-limit rules",
  login_monitor:      "Failed logins · brute force · account lockout",
  network_monitor:    "Port scans · DDoS · reverse shells · exfiltration",
  malware_detection:  "Malicious files · suspicious processes · PS flags",
  phishing_detection: "DNS tunneling · malicious domains · credential harvest",
  threat_intel:       "External IPs · MITRE ATT&CK · threat actor profiling",
  incident_response:  "Incident synthesis · escalation decisions",
  log_analysis:       "Event patterns · timing clusters · repeat IPs",
  forensics:          "Attack timelines · MITRE mapping · blast radius",
  password_security:  "Password policy · weak credentials · account audit",
  insider_threat:     "User behaviour · bulk downloads · after-hours access",
  report_generation:  "Security reports · trend analysis · recommendations",
  voice_assistant:    "Voice commands · natural language interface",
  decision_making:    "Autonomous response · action coordination",
};

function pad(n: number) { return n < 10 ? "0" + n : n; }
function timeStr(ts?: string) {
  if (!ts) return "--:--:--";
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Deterministic spark bars based on op count — no Math.random()
function SparkBars({ count, grad }: { count: number; grad: [string, string] }) {
  const bars = 10;
  // Heights based on a fixed pattern seeded by count
  const heights = Array.from({ length: bars }, (_, i) => {
    const base = ((count * 7 + i * 13) % 12) + 3;
    return count > 0 ? base : 3;
  });
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 16 }}>
      {heights.map((h, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2,
          background: `linear-gradient(180deg,${grad[0]},${grad[1]})`,
          height: `${h}px`,
          opacity: count > 0 ? 0.75 : 0.2,
        }} />
      ))}
    </div>
  );
}

export default function Agents() {
  const { state, machine } = useAtlas();
  const [selected, setSelected] = useState<string | null>(null);
  const myHostname = machine?.hostname ?? "this machine";

  if (selected) {
    return <AgentDetail agentId={selected} onBack={() => setSelected(null)} />;
  }

  // Only real_capture actions
  const realActions = state.agent_actions.filter(
    a => (a.params as any)?.data_source === "real_capture"
  );

  const agentLastAction: Record<string, typeof realActions[0]> = {};
  [...realActions].reverse().forEach(a => {
    if (!agentLastAction[a.agent_name]) agentLastAction[a.agent_name] = a;
  });

  const agentOpCount: Record<string, number> = {};
  realActions.forEach(a => {
    agentOpCount[a.agent_name] = (agentOpCount[a.agent_name] ?? 0) + 1;
  });

  const agentNames = Object.keys(AGENT_ABBR);
  const activeCount = agentNames.filter(id => agentOpCount[id] > 0).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Agent Fleet</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontFamily: "var(--f-display)", fontSize: 24, margin: 0 }}>
            {activeCount} / 14 Agents Active
          </h1>
          {/* Real data badge */}
          <span style={{
            fontSize: 10, fontFamily: "var(--f-mono)", fontWeight: 700,
            padding: "3px 10px", borderRadius: 20,
            background: "var(--success-soft)", color: "var(--success)",
            letterSpacing: ".06em",
          }}>● REAL DATA ONLY</span>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          All agents monitor <strong>{myHostname}</strong> in real time. No simulated data.
          Click any agent to inspect its operations.
        </p>
      </div>

      {/* Agent grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(228px,1fr))", gap: 16 }}>
        {agentNames.map(id => {
          const last     = agentLastAction[id];
          const grad     = AGENT_GRADS[id] ?? ["#3d63e6", "#1f3aa8"];
          const abbr     = AGENT_ABBR[id]  ?? id.slice(0, 2).toUpperCase();
          const label    = id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          const domain   = AGENT_DOMAIN[id] ?? "";
          const monitors = AGENT_MONITORS[id] ?? "";
          const opCount  = agentOpCount[id] ?? 0;
          const isActive = !!last?.ts && (Date.now() - new Date(last.ts).getTime()) < 8000;
          const hasOps   = opCount > 0;

          // Get display target from real params
          const params = last?.params as Record<string, string> | undefined;
          const displayTarget = params?.display_target || params?.reasoning?.slice(0, 60) || "";

          return (
            <div key={id}
              className={`agent-card neo${isActive ? " is-active" : ""}`}
              onClick={() => setSelected(id)}
              style={{ cursor: "pointer" }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: `linear-gradient(150deg,${grad[0]},${grad[1]})`,
                  color: "#fff", fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 13,
                }}>{abbr}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.25 }}>{label}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>{domain}</div>
                </div>
              </div>

              {/* What it monitors */}
              <div style={{ fontSize: 10.5, color: "var(--ink-2)", lineHeight: 1.5, minHeight: 32 }}>
                {hasOps && last
                  ? <><span style={{ color: "var(--muted)" }}>Last: </span>{last.action.replace(/_/g, " ")}{displayTarget ? ` — ${displayTarget}` : ""}</>
                  : <span style={{ color: "var(--faint)" }}>{monitors}</span>
                }
              </div>

              {/* Deterministic spark bars */}
              <SparkBars count={opCount} grad={grad} />

              {/* Footer */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className={`badge badge-${isActive ? "active" : hasOps ? "approved" : "monitoring"}`}>
                  {isActive ? "ACTIVE" : hasOps ? "HAS DATA" : "MONITORING"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {hasOps && (
                    <span style={{
                      fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--faint)",
                      background: "var(--bg-2)", padding: "2px 7px", borderRadius: 20,
                    }}>{opCount} ops</span>
                  )}
                  <span style={{ fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)" }}>
                    {timeStr(last?.ts)}
                  </span>
                </div>
              </div>

              <div style={{
                position: "absolute", top: 12, right: 14,
                fontSize: 9, color: "var(--faint)", fontFamily: "var(--f-mono)",
                letterSpacing: ".06em",
              }}>VIEW →</div>
            </div>
          );
        })}
      </div>

      {/* Decision log */}
      <div className="neo" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div className="panel-title">Decision Core Log</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 10, fontFamily: "var(--f-mono)", padding: "2px 8px",
              borderRadius: 20, background: "var(--success-soft)", color: "var(--success)",
            }}>REAL</span>
            <span className="eyebrow">{state.decision_log.length} entries</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 280, overflowY: "auto" }}>
          {state.decision_log.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              No decisions yet. Agents are monitoring <strong>{myHostname}</strong> for real threats…
            </div>
          )}
          {state.decision_log.map((d, i) => (
            <div key={i} className="neo-inset" style={{ padding: "12px 14px" }}>
              {d.ts && (
                <div style={{ fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)", marginBottom: 6 }}>
                  {timeStr(d.ts)}
                </div>
              )}
              <p style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.55, margin: 0 }}>
                {d.reasoning_text.replace(/\s+/g, " ").trim()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
