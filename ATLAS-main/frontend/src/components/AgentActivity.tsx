export type AgentAction = {
  agent_name: string;
  action: string;
  ts?: string;
};

const ACTION_STYLE: Record<string, string> = {
  block_ip:        "text-critical",
  lock_account:    "text-critical",
  isolate_machine: "text-critical",
  quarantine_file: "text-critical",
  escalate:        "text-high",
  alert_admin:     "text-high",
  monitor:         "text-medium",
  flag_pattern:    "text-medium",
  rate_limit:      "text-medium",
  resolve:         "text-low",
  allow:           "text-low",
  error:           "text-muted line-through",
};

const AGENT_ABBR: Record<string, string> = {
  firewall:           "FW",
  login_monitor:      "LM",
  threat_intel:       "TI",
  network_monitor:    "NM",
  malware_detection:  "MD",
  phishing_detection: "PD",
  forensics:          "FS",
  log_analysis:       "LA",
  incident_response:  "IR",
  insider_threat:     "IT",
  password_security:  "PS",
  report_generation:  "RG",
  decision_making:    "DM",
  voice_assistant:    "VA",
};

// Color-code badges by agent domain
const AGENT_COLOR: Record<string, string> = {
  firewall:           "text-critical  border-critical/40",
  login_monitor:      "text-high      border-high/40",
  threat_intel:       "text-high      border-high/40",
  network_monitor:    "text-medium    border-medium/40",
  malware_detection:  "text-critical  border-critical/40",
  phishing_detection: "text-high      border-high/40",
  forensics:          "text-blue      border-blue/40",
  log_analysis:       "text-blue      border-blue/40",
  incident_response:  "text-critical  border-critical/40",
  insider_threat:     "text-high      border-high/40",
  password_security:  "text-medium    border-medium/40",
  report_generation:  "text-muted     border-border",
  decision_making:    "text-accent    border-accent/40",
  voice_assistant:    "text-purple    border-purple/40",
};

export default function AgentActivity({ actions }: { actions: AgentAction[] }) {
  const visible = actions.filter(a => a.action !== "error").slice(0, 40);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="section-label">AGENT ACTIVITY</span>
        <span className="ml-auto text-accent text-[9px] tabular-nums">{visible.length} ops</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1">
        {visible.length === 0 && (
          <div className="text-muted text-[10px] py-2 px-1">No agent activity yet.</div>
        )}
        {visible.map((a, i) => {
          const badgeColor = AGENT_COLOR[a.agent_name] ?? "text-accent border-accent/30";
          return (
            <div key={i} className="flex items-center gap-2 py-1 border-b border-border/20">
              {/* Agent badge */}
              <span className={`shrink-0 w-[22px] h-[22px] flex items-center justify-center border text-[8px] font-bold neo-inset ${badgeColor}`}>
                {AGENT_ABBR[a.agent_name] ?? a.agent_name.slice(0, 2).toUpperCase()}
              </span>

              {/* Agent name */}
              <span className="text-text/50 text-[9px] truncate flex-1 min-w-0">
                {a.agent_name.replace(/_/g, " ")}
              </span>

              {/* Action */}
              <span className={`shrink-0 text-[9px] font-mono font-medium ${ACTION_STYLE[a.action] ?? "text-text/70"}`}>
                {a.action.replace(/_/g, "_")}
              </span>

              {/* Timestamp */}
              {a.ts && (
                <span className="shrink-0 text-muted text-[8px] tabular-nums w-14 text-right">
                  {new Date(a.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
