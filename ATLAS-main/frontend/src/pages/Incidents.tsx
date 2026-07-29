import { useState, useEffect } from "react";
import { useAtlas, type Incident } from "../hooks/useAtlas";

const API = "http://localhost:8000";

const SEV_COLOR: Record<string, string> = {
  low: "var(--success)", medium: "var(--warning)", high: "#e8722c", critical: "var(--danger)",
};

function pad(n: number) { return n < 10 ? "0" + n : n; }
function timeStr(ts: string) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface ExecutionOutcome {
  action: string;
  target?: string;
  success: boolean;
  output?: string;
  reason?: string;
  timestamp?: string;
}

interface AgentAction {
  agent_name: string;
  action: string;
  ts?: string;
}

interface IncidentDetail {
  actions: AgentAction[];
  decisions: { reasoning_text: string; ts?: string }[];
  execution_outcomes: ExecutionOutcome[];
  pending_actions: string[];
}

function OutcomeBlock({ outcomes, pending }: { outcomes: ExecutionOutcome[]; pending: string[] }) {
  if (outcomes.length === 0 && pending.length === 0) return null;
  return (
    <div className="neo-inset" style={{ padding: "14px 16px" }}>
      <div style={{
        fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)",
        letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10,
      }}>
        Execution Outcomes
      </div>

      {pending.length > 0 && outcomes.length === 0 && (
        <div style={{ fontSize: 11.5, color: "var(--warning)", marginBottom: 6 }}>
          ⏳ Awaiting approval: {pending.join(", ")}
        </div>
      )}

      {outcomes.map((o, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "8px 0",
          borderBottom: i < outcomes.length - 1 ? "1px solid var(--line)" : "none",
        }}>
          <span style={{ fontSize: 14, flexShrink: 0, color: o.success ? "var(--success)" : "var(--danger)" }}>
            {o.success ? "✓" : "✕"}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--f-mono)" }}>
              {o.action.replace(/_/g, " ")}
              {o.target && (
                <span style={{ color: "var(--muted)", fontWeight: 400 }}> → {o.target}</span>
              )}
            </div>
            {(o.output || o.reason) && (
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3, wordBreak: "break-all" }}>
                {o.output || o.reason}
              </div>
            )}
            {o.timestamp && (
              <div style={{ fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)", marginTop: 2 }}>
                {new Date(o.timestamp).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function IncidentDrawer({ inc, onClose, onApprove, onResolve }: {
  inc: Incident;
  onClose: () => void;
  onApprove: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = (id: string) => {
    setLoading(true);
    fetch(`${API}/incidents/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setDetail(d))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDetail(inc.id); }, [inc.id]);

  const handleApprove = async (id: string) => {
    await onApprove(id);
    fetchDetail(id); // re-fetch to show fresh outcomes
  };

  const reasoning    = detail?.decisions?.[0]?.reasoning_text ?? "";
  const agentActions = detail?.actions ?? [];
  const outcomes     = detail?.execution_outcomes ?? [];
  const pending      = detail?.pending_actions ?? [];

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">

        {/* Header */}
        <div style={{
          padding: "22px 24px 16px", borderBottom: "1px solid var(--line)",
          position: "sticky", top: 0, background: "var(--bg)", zIndex: 2,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
        }}>
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <span className={`badge badge-${inc.severity}`}>{inc.severity}</span>
              <span className={`badge badge-${inc.status === "open" ? "active" : inc.status === "resolved" ? "resolved" : "approved"}`}>
                {inc.status}
              </span>
            </div>
            <h2 style={{ fontFamily: "var(--f-display)", fontSize: 19, margin: "0 0 4px" }}>{inc.title}</h2>
            <div style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
              {inc.id} · {new Date(inc.created_at).toLocaleString()}
            </div>
          </div>
          <button className="btn btn-icon neo-flat" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M6 6 18 18M18 6 6 18"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {inc.status === "open" && (
              <button className="btn btn-success" onClick={() => handleApprove(inc.id)}>
                ✓ Approve & Execute
              </button>
            )}
            {inc.status !== "resolved" && (
              <button className="btn btn-danger" onClick={() => { onResolve(inc.id); onClose(); }}>
                ✕ Resolve
              </button>
            )}
          </div>

          {/* Basic details */}
          <div className="neo-inset" style={{ padding: "14px 16px" }}>
            <div style={{
              fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)",
              letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10,
            }}>
              Incident Details
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 12 }}>
              <div><span style={{ color: "var(--muted)" }}>ID: </span>
                <span style={{ fontFamily: "var(--f-mono)" }}>{inc.id}</span></div>
              <div><span style={{ color: "var(--muted)" }}>Severity: </span>
                <span style={{ color: SEV_COLOR[inc.severity], fontWeight: 700 }}>{inc.severity}</span></div>
              <div><span style={{ color: "var(--muted)" }}>Status: </span>{inc.status}</div>
              <div><span style={{ color: "var(--muted)" }}>Time: </span>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>{timeStr(inc.created_at)}</span></div>
            </div>
          </div>

          {loading && (
            <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>Loading detail…</div>
          )}

          {/* Execution outcomes — most important */}
          {!loading && <OutcomeBlock outcomes={outcomes} pending={pending} />}

          {/* Decision reasoning */}
          {!loading && reasoning && (
            <div className="neo-inset" style={{ padding: "14px 16px" }}>
              <div style={{
                fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)",
                letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8,
              }}>
                Decision Reasoning
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>{reasoning}</p>
            </div>
          )}

          {/* Agent actions */}
          {!loading && agentActions.length > 0 && (
            <div className="neo-inset" style={{ padding: "14px 16px" }}>
              <div style={{
                fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)",
                letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10,
              }}>
                Agent Actions ({agentActions.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {agentActions.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5 }}>
                    <span style={{
                      fontFamily: "var(--f-mono)", fontSize: 10, padding: "2px 7px",
                      borderRadius: 20, background: "var(--bg-2)", color: "var(--accent-ink)",
                      flexShrink: 0,
                    }}>{a.agent_name.replace(/_/g, " ")}</span>
                    <span style={{ color: "var(--ink-2)" }}>{a.action.replace(/_/g, " ")}</span>
                    {a.ts && (
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--faint)", fontFamily: "var(--f-mono)" }}>
                        {timeStr(a.ts)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const FILTERS = ["all", "open", "critical", "high", "medium", "low", "resolved"] as const;
type Filter = typeof FILTERS[number];

export default function Incidents() {
  const { state, approveIncident, resolveIncident } = useAtlas();
  const { searchQuery } = useAtlas();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Incident | null>(null);

  const realIncidents = state.incidents.filter(
    i => !(i as any).data_source || (i as any).data_source === "real_capture"
  );

  const filtered = realIncidents.filter(i => {
    const matchesSearch = !searchQuery ||
      i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.severity.includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === "all") return true;
    if (filter === "open") return i.status === "open" || i.status === "approved";
    if (filter === "resolved") return i.status === "resolved";
    return i.severity === filter;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Response Queue</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontFamily: "var(--f-display)", fontSize: 24, margin: 0 }}>Incidents</h1>
          <span style={{
            fontSize: 10, fontFamily: "var(--f-mono)", fontWeight: 700,
            padding: "3px 10px", borderRadius: 20,
            background: "var(--success-soft)", color: "var(--success)",
            letterSpacing: ".06em",
          }}>● REAL DATA ONLY</span>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Every detection routed, correlated and actioned by the agent pipeline.
        </p>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {FILTERS.map(f => (
          <button key={f} className={`chip${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div style={{
        display: "grid", gridTemplateColumns: "20px 1.6fr 1fr 1fr 120px",
        padding: "0 18px", gap: 14,
        fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em",
        color: "var(--faint)", fontWeight: 700, fontFamily: "var(--f-mono)",
      }}>
        <span></span><span>Incident</span><span>Status</span><span>Time</span><span>Actions</span>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 && (
          <div className="neo" style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 12.5 }}>
            No incidents match this filter.
          </div>
        )}
        {filtered.map(inc => (
          <div key={inc.id} className="neo-flat"
            style={{
              display: "grid", gridTemplateColumns: "20px 1.6fr 1fr 1fr 120px",
              padding: "15px 18px", alignItems: "center", gap: 14,
              cursor: "pointer", transition: "transform .15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateX(2px)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "none")}
            onClick={() => setSelected(inc)}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", display: "inline-block",
              background: SEV_COLOR[inc.severity] ?? "var(--muted)",
            }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{inc.title}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--f-mono)" }}>
                {inc.id}
              </div>
            </div>
            <span className={`badge badge-${inc.status === "open" ? "active" : inc.status === "resolved" ? "resolved" : "approved"}`}>
              {inc.status}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--ink-2)", fontFamily: "var(--f-mono)" }}>
              {timeStr(inc.created_at)}
            </span>
            <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
              {inc.status === "open" && (
                <button className="btn btn-success btn-sm" onClick={() => approveIncident(inc.id)}>✓</button>
              )}
              {inc.status !== "resolved" && (
                <button className="btn btn-danger btn-sm" onClick={() => resolveIncident(inc.id)}>✕</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <IncidentDrawer
          inc={selected}
          onClose={() => setSelected(null)}
          onApprove={approveIncident}
          onResolve={resolveIncident}
        />
      )}
    </div>
  );
}
